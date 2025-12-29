import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://deno.land/x/openai@v4.20.0/mod.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

interface SimilarSection {
  id: string;
  document_id: string;
  content: string;
  metadata: any;
  similarity: number;
  doc_name?: string;
  page?: number | string;
}

interface DocumentLink {
  name: string;
  file_url: string;
}

function safeString(v: unknown, max = 4000): string {
  const s = String(v ?? "");
  return s.length > max ? s.slice(0, max) : s;
}

function extractMachineNumbers(text: string): string[] {
  const upper = text.toUpperCase();
  const regex = /\b([A-Z]{2,6})[\s-]?(\d{1,4})\b/g;
  const matches: string[] = [];
  let m;
  while ((m = regex.exec(upper)) !== null) {
    matches.push(`${m[1]}${m[2]}`);
  }
  return [...new Set(matches)];
}

function extractSearchTerms(text: string): string[] {
  const terms: string[] = [];
  
  const factuurMatch = text.match(/(?:factuur|f)[-\s]*(\d{4})[-\s]*(\d+)/i);
  if (factuurMatch) {
    terms.push(`F-${factuurMatch[1]}-${factuurMatch[2]}`);
    terms.push(`F${factuurMatch[1]}-${factuurMatch[2]}`);
    terms.push(`${factuurMatch[1]}-${factuurMatch[2]}`);
  }
  
  terms.push(...extractMachineNumbers(text));
  
  const words = text.toLowerCase().split(/\s+/);
  const docKeywords = ['schema', 'handleiding', 'manual', 'factuur', 'rapport', 'document'];
  docKeywords.forEach(kw => {
    if (words.includes(kw)) terms.push(kw);
  });
  
  return [...new Set(terms)];
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function loadHistory(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  userId: string,
  conversationId: string | null,
  limit = 8
): Promise<Message[]> {
  try {
    let q = supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (conversationId) q = q.eq("conversation_id", conversationId);
    else q = q.eq("user_id", userId);

    const { data, error } = await q;
    if (error || !data) return [];

    return data
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: safeString(m.content ?? "", 1000),
        timestamp: m.created_at,
      }))
      .reverse();
  } catch {
    return [];
  }
}

// ==================== RETRIEVE TOOL (Hybrid Search) ====================
async function retrieveTool(
  query: string,
  organizationId: string,
  supabase: ReturnType<typeof createClient>,
  openai: OpenAI
): Promise<string> {
  // Semantic search
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });

  const queryEmbedding = embeddingResponse.data[0].embedding as number[];

  if (embeddingResponse.usage) {
    void trackTokens(
      supabase,
      organizationId,
      "",
      "text-embedding-3-small",
      "embedding",
      embeddingResponse.usage,
      { query_length: query.length }
    );
  }

  const { data: semanticMatches, error } = await supabase.rpc("match_document_sections", {
    p_organization_id: organizationId,
    p_query_embedding: queryEmbedding,
    p_match_count: 10,
    p_threshold: 0.30,
  });

  const semanticDocs: SimilarSection[] = [];
  if (!error && semanticMatches && Array.isArray(semanticMatches)) {
    const docIds = [...new Set(semanticMatches.map((m: any) => m.document_id))].slice(0, 10);
    const docMetadata: Map<string, any> = new Map();

    if (docIds.length > 0) {
      const { data: docs } = await supabase
        .from("documents")
        .select("id, name, metadata")
        .in("id", docIds);

      if (docs) {
        docs.forEach((d: any) => docMetadata.set(d.id, { name: d.name, ...d.metadata }));
      }
    }

    semanticDocs.push(...semanticMatches
      .map((m: any) => {
        const docMeta = docMetadata.get(m.document_id) || {};
        return {
          id: String(m.id),
          document_id: String(m.document_id),
          content: safeString(m.content ?? "", 1200),
          metadata: m.metadata ?? {},
          similarity: Number(m.similarity ?? 0),
          doc_name: docMeta.name || "Onbekend document",
          page: m.metadata?.page_number || m.metadata?.page || null,
        };
      })
      .filter((s) => Number.isFinite(s.similarity))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 10));
  }

  // Keyword search for invoice numbers (like F2025-60)
  const keywordDocs: SimilarSection[] = [];
  const invoicePattern = query.match(/[Ff]\d{4}-\d+/);
  
  if (invoicePattern) {
    const invoiceNum = invoicePattern[0];
    try {
      const { data: keywordMatches } = await supabase
        .from("documents_sections")
        .select("id, document_id, content, metadata")
        .eq("organization_id", organizationId)
        .ilike("content", `%${invoiceNum}%`)
        .limit(10);

      if (keywordMatches) {
        const docIds = [...new Set(keywordMatches.map((m: any) => m.document_id))];
        const { data: docs } = await supabase
          .from("documents")
          .select("id, name, metadata")
          .in("id", docIds);

        const docMetadata: Map<string, any> = new Map();
        if (docs) {
          docs.forEach((d: any) => docMetadata.set(d.id, { name: d.name, ...d.metadata }));
        }

        keywordDocs.push(...keywordMatches.map((m: any) => {
          const docMeta = docMetadata.get(m.document_id) || {};
          return {
            id: String(m.id),
            document_id: String(m.document_id),
            content: safeString(m.content ?? "", 1200),
            metadata: m.metadata ?? {},
            similarity: 0.9, // High score for exact keyword match
            doc_name: docMeta.name || "Onbekend document",
            page: m.metadata?.page_number || m.metadata?.page || null,
          };
        }));
      }
    } catch (e) {
      console.error("[Keyword search error]:", e);
    }
  }

  // Combine and deduplicate - prioritize keyword matches
  const allDocs: SimilarSection[] = [];
  const seenContent = new Set<string>();

  // Add keyword matches first (higher priority)
  for (const doc of keywordDocs) {
    const contentKey = doc.content.slice(0, 200);
    if (!seenContent.has(contentKey)) {
      allDocs.push(doc);
      seenContent.add(contentKey);
    }
  }

  // Add semantic matches that aren't duplicates
  for (const doc of semanticDocs) {
    const contentKey = doc.content.slice(0, 200);
    if (!seenContent.has(contentKey)) {
      allDocs.push(doc);
      seenContent.add(contentKey);
    }
  }

  // Limit to top 5 results
  const retrievedDocs = allDocs.slice(0, 5);

  // Serialize results
  return retrievedDocs.map((doc, i) => {
    const citation = `[${i + 1}]`;
    const source = `${doc.doc_name}${doc.page ? ` (p.${doc.page})` : ""}`;
    return `${citation} Source: ${source}\nContent: ${doc.content}`;
  }).join("\n\n---\n\n");
}

async function getMachineInfo(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  machineNumber: string
) {
  try {
    const { data } = await supabase
      .from("machine_info")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("machine_nummer", machineNumber)
      .maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}

async function findDocuments(
  question: string,
  sections: SimilarSection[],
  searchTerms: string[],
  organizationId: string,
  supabase: ReturnType<typeof createClient>
): Promise<DocumentLink[]> {
  const foundDocs: Map<string, DocumentLink> = new Map();
  
  for (const section of sections.slice(0, 3)) {
    const { data: doc } = await supabase
      .from("documents")
      .select("id, name, file_url")
      .eq("id", section.document_id)
      .maybeSingle();
    
    if (doc && doc.file_url) {
      const signedUrl = await getSignedUrl(supabase, doc.file_url);
      if (signedUrl) {
        foundDocs.set(doc.id, { name: doc.name, file_url: signedUrl });
      }
    }
  }

  if (searchTerms.length > 0) {
    for (const term of searchTerms) {
      const { data: exactDocs } = await supabase
        .from("documents")
        .select("id, name, file_url")
        .eq("organization_id", organizationId)
        .eq("use_for_rag", true)
        .ilike("name", `%${term}%`)
        .limit(2);

      if (exactDocs) {
        for (const doc of exactDocs) {
          if (doc.file_url && !foundDocs.has(doc.id)) {
            const signedUrl = await getSignedUrl(supabase, doc.file_url);
            if (signedUrl) {
              foundDocs.set(doc.id, { name: doc.name, file_url: signedUrl });
            }
          }
        }
      }
    }
  }

  return Array.from(foundDocs.values()).slice(0, 5);
}

function selectRequestedDocuments(
  question: string,
  availableDocuments: DocumentLink[],
  wantsAllDocs: boolean,
  machineIds: string[] = []
): DocumentLink[] {
  if (availableDocuments.length === 0) return [];
  if (wantsAllDocs) return [...availableDocuments];

  const q = question.toLowerCase();
  const fileNameMatches = q.match(/[a-z0-9_\-][a-z0-9_\-\s]*\.(pdf|xlsx|docx|txt)/gi) || [];
  const normalizedQuestion = q.replace(/\s+/g, " ");
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

  let selected: DocumentLink[] = [];

  if (fileNameMatches.length > 0) {
    const targets = fileNameMatches.map((m) => normalize(m));
    selected = availableDocuments.filter((doc) => {
      const nameNorm = normalize(doc.name);
      return (
        targets.some((t) => nameNorm.includes(t) || t.includes(nameNorm)) ||
        targets.some((t) =>
          normalizedQuestion.includes(nameNorm) ||
          normalizedQuestion.includes(nameNorm.split(".")[0])
        )
      );
    });
  }

  if (selected.length === 0) {
    selected = availableDocuments.filter((doc) => {
      const base = normalize(doc.name.split(".")[0]);
      return (
        base.length > 3 &&
        (normalizedQuestion.includes(base) || q.includes(base.replace(/\s+/g, "")))
      );
    });
  }

  if (selected.length > 0) {
    return selected;
  }

  const wantsSchema = /\b(e[-\s]?schema|schema)\b/i.test(q);
  if (wantsSchema && machineIds.length > 0) {
    const machineSet = new Set(machineIds.map((m) => m.toLowerCase()));
    const scored = availableDocuments.map((doc) => {
      const nameNorm = normalize(doc.name);
      let score = 0;

      machineSet.forEach((m) => {
        if (nameNorm.includes(m.toLowerCase())) score += 3;
      });

      if (/\b(e[-\s]?schema|schema)\b/i.test(nameNorm)) score += 2;
      if (/factuur|invoice|offord|offerte/i.test(nameNorm)) score -= 2;

      return { doc, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const bestScore = scored[0]?.score ?? 0;
    if (bestScore > 0) {
      return scored.filter((s) => s.score === bestScore).map((s) => s.doc);
    }
  }

  return [availableDocuments[0]];
}

async function getSignedUrl(
  supabase: ReturnType<typeof createClient>,
  fileUrl: string
): Promise<string | null> {
  try {
    let storagePath: string | null = null;
    
    const urlMatch = fileUrl.match(/\/documents\/(.+)$/);
    if (urlMatch && urlMatch[1]) {
      storagePath = decodeURIComponent(urlMatch[1]);
    } else {
      const storageMatch = fileUrl.match(/storage\/v1\/object\/documents\/(.+)$/);
      if (storageMatch && storageMatch[1]) {
        storagePath = decodeURIComponent(storageMatch[1]);
      }
    }

    if (storagePath) {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(storagePath, 3600);

      if (!error && data?.signedUrl) {
        return data.signedUrl;
      }
    }
    
    return fileUrl;
  } catch {
    return fileUrl;
  }
}

function buildConversationContext(history: Message[], currentQuestion: string): {
  mentionedDocuments: string[];
  mentionedMachines: string[];
  hasVagueReference: boolean;
  resolvedQuestion: string;
} {
  const mentionedDocs: string[] = [];
  const recentHistory = history.slice(-4);
  const docStopwords = ["over", "gaat", "hierover", "daarover", "er", "het", "die"];
  
  recentHistory.forEach(msg => {
    const fileMatches = msg.content.match(/[A-Za-z0-9_\s-]+\.(pdf|xlsx|docx|txt|png|jpg|jpeg)/gi);
    if (fileMatches) {
      mentionedDocs.push(...fileMatches.map(f => f.trim()));
    }
    
    const docRefs = msg.content.match(/(?:factuur|schema|document|handleiding)\s+([A-Za-z0-9][\w-]+)/gi);
    if (docRefs) {
      docRefs.forEach((ref) => {
        const cleaned = ref.trim();
        const parts = cleaned.split(/\s+/);
        const lastToken = parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9_-]/gi, "");
        if (!docStopwords.includes(lastToken) && lastToken.length > 2) {
          mentionedDocs.push(cleaned);
        }
      });
    }
  });

  const allText = recentHistory.map(m => m.content).join(" ") + " " + currentQuestion;
  const mentionedMachines = extractMachineNumbers(allText);

  const hasVagueReference = /\b(die|het|deze|dat|hem)\s+(?:\w+\s+)?(factuur|document|schema|bestand|file)\b/i.test(currentQuestion) ||
    /\b(die|het|deze|dat)\b/i.test(currentQuestion);

  let resolvedQuestion = currentQuestion;
  if (hasVagueReference && mentionedDocs.length > 0) {
    const mostRecent = mentionedDocs[mentionedDocs.length - 1];
    const vaguePattern = /\b(die|het|deze|dat|hem)\s+(?:\w+\s+)?(factuur|document|schema|bestand|file)?/gi;
    
    let replaced = false;
    resolvedQuestion = currentQuestion.replace(vaguePattern, (match, pronoun, docType) => {
      if (!replaced) {
        replaced = true;
        return docType ? `${mostRecent} ${docType}` : mostRecent;
      }
      return match;
    });
    
    if (!replaced) {
      resolvedQuestion = currentQuestion.replace(/\b(die|het|deze|dat|hem)\b/i, mostRecent);
    }
  }

  return {
    mentionedDocuments: [...new Set(mentionedDocs)],
    mentionedMachines,
    hasVagueReference,
    resolvedQuestion,
  };
}

function detectIntent(question: string, history: Message[]): {
  wantsDocument: boolean;
  wantsAllDocs: boolean;
  isGreeting: boolean;
  wantsDocumentSummary: boolean;
} {
  const q = question.toLowerCase().trim();
  const isGreeting = /^(hoi|hey|hallo|hi|goedemorgen|goedemiddag|goedenavond)[\s!?]*$/i.test(q);
  const wantsAllDocs = /(stuur|geef|toon|laat.*zien).*(alle|alles).*(document|bestand|schema)/i.test(q);
  const explicitRequest = /(stuur|geef|heb je|kan ik|zoek|download|toon|laat.*zien).*(document|schema|handleiding|manual|tekening|pdf|e-?schema|factuur|rapport)/i.test(question);
  const wantsDocumentSummary = /(waar gaat.*document.*over|wat staat er in.*document|wat staat er in.*pdf|samenvatting.*document)/i.test(q);
  const recentMentionsDoc = history.slice(-2).some(m => 
    /(document|schema|handleiding|pdf|factuur)/i.test(m.content)
  );
  const isFollowUp = /^(ja|graag|stuur.*door|kan dat|doe maar|oke|ok)/i.test(q);
  
  return {
    wantsDocument: explicitRequest || (recentMentionsDoc && isFollowUp),
    wantsAllDocs,
    isGreeting,
    wantsDocumentSummary,
  };
}


// ==================== AGENT EXECUTOR ====================
async function executeAgent(
  question: string,
  history: Message[],
  organizationId: string,
  machineInfo: any | null,
  availableDocuments: DocumentLink[],
  intent: { wantsDocument: boolean; wantsAllDocs: boolean; isGreeting: boolean; wantsDocumentSummary: boolean },
  conversationContext: { mentionedDocuments: string[]; mentionedMachines: string[]; hasVagueReference: boolean; resolvedQuestion: string },
  supabase: ReturnType<typeof createClient>,
  openai: OpenAI
): Promise<{ text: string; usage: any; attachedDocs: DocumentLink[] }> {
  // Define retrieve tool
  const tools = [{
    type: "function" as const,
    function: {
      name: "retrieve",
      description: "Retrieve information related to a query. Uses hybrid search combining semantic similarity and keyword matching for better results. Use this when you need to search for information in documents.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to find relevant information in documents"
          }
        },
        required: ["query"]
      }
    }
  }];

  // Build system prompt
  const contextParts: string[] = [];

  if (conversationContext.mentionedDocuments.length > 0) {
    contextParts.push(
      `GESPREK CONTEXT:
Recent genoemde documenten: ${conversationContext.mentionedDocuments.join(", ")}
${conversationContext.hasVagueReference ? `⚠️ User gebruikt vage verwijzing ("die", "het", "deze") - dit verwijst waarschijnlijk naar: ${conversationContext.mentionedDocuments[conversationContext.mentionedDocuments.length - 1]}` : ""}
Machines in gesprek: ${conversationContext.mentionedMachines.join(", ") || "geen"}`
    );
  }

  if (machineInfo) {
    contextParts.push(
      `MACHINE DATABASE:
- Naam: ${machineInfo.machinenaam ?? machineInfo.machine_naam ?? "onbekend"}
- Nummer: ${machineInfo.machinenummer ?? machineInfo.machine_nummer ?? "onbekend"}
- Locatie: ${machineInfo.locatie ?? "onbekend"}
- Beschrijving: ${machineInfo.omschrijvinglocatie ?? machineInfo.omschrijving_locatie ?? "onbekend"}
- Opmerkingen: ${machineInfo.extraopmerkingen ?? machineInfo.extra_opmerkingen ?? "—"}
- E-Schema: ${machineInfo["e-schema"] ?? machineInfo.e_schema ?? "—"}`
    );
  }

  const systemPrompt = `Je bent een intelligente technische assistent voor industriële machines.

JOUW CAPABILITIES:
✅ Beantwoord technische vragen (storingen, parameters, werking)
✅ Geef locatie-informatie (waar machines/kasten staan)
✅ Stuur documenten door op verzoek (E-schema's, handleidingen, facturen)
✅ Gebruik de retrieve tool om informatie uit documenten te halen wanneer nodig

BELANGRIJK:
- Gebruik de retrieve tool wanneer je informatie uit documenten nodig hebt
- Verwijs naar bronnen met [1], [2], etc. als je ze gebruikt
- Antwoord in het Nederlands
- Wees kort en specifiek (max 5-6 zinnen voor technische vragen, 2-3 voor locatie/begroetingen)

${contextParts.length > 0 ? `\nBESCHIKBARE CONTEXT:\n${contextParts.join("\n\n")}` : ""}`;

  // Build messages with history
  const messages: any[] = [
    { role: "system", content: systemPrompt },
  ];

  // Add recent history (last 6 messages)
  history.slice(-6).forEach((msg) => {
    messages.push({ role: msg.role, content: msg.content });
  });

  // Add current question
  messages.push({ role: "user", content: question });

  let totalUsage: any = null;
  let finalResponse = "";
  let attachedDocs: DocumentLink[] = [];

  // Agent loop (max 3 iterations to prevent infinite loops)
  for (let iteration = 0; iteration < 3; iteration++) {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
      tools: tools,
      tool_choice: "auto",
      temperature: 0,
      max_tokens: 1000,
    });

    const message = response.choices[0]?.message;
    if (!message) break;

    // Track usage
    if (response.usage) {
      if (!totalUsage) {
        totalUsage = { ...response.usage };
      } else {
        totalUsage.prompt_tokens += response.usage.prompt_tokens;
        totalUsage.completion_tokens += response.usage.completion_tokens;
        totalUsage.total_tokens += response.usage.total_tokens;
      }
    }

    // Add assistant message
    messages.push(message);

    // Check if tool calls are needed
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.function.name === "retrieve") {
          const query = JSON.parse(toolCall.function.arguments || "{}").query || question;
          const retrievedInfo = await retrieveTool(query, organizationId, supabase, openai);
          
          // Add tool result to messages
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: "retrieve",
            content: retrievedInfo,
          });
        }
      }
      // Continue loop to get final response
      continue;
    }

    // No tool calls - we have the final answer
    finalResponse = message.content || "Sorry, ik kon geen antwoord genereren.";
    break;
  }

  // Handle document attachments if requested
  if ((intent.wantsDocument || intent.wantsAllDocs) && availableDocuments.length > 0) {
    const selectedDocs = selectRequestedDocuments(
      question,
      availableDocuments,
      intent.wantsAllDocs,
      conversationContext.mentionedMachines
    );
    attachedDocs.push(...selectedDocs);
    
    const docLinks = selectedDocs
      .map(d => `📄 [${d.name}](${d.file_url})`)
      .join("\n");
    finalResponse += `\n\n${docLinks}`;
  }

  // Remove markdown links from response
  finalResponse = finalResponse.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");

  return { text: finalResponse, usage: totalUsage, attachedDocs };
}

// ==================== TOKEN TRACKING ====================
async function trackTokens(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  userId: string,
  model: string,
  operation: "chat" | "embedding",
  usage: any,
  metadata: Record<string, unknown>
) {
  if (!usage) return;
  try {
    const { data: costData } = await supabase.rpc("calculate_token_cost", {
      p_model: model,
      p_prompt_tokens: usage.prompt_tokens,
      p_completion_tokens: usage.completion_tokens || 0,
    });

    await supabase.from("token_usage").insert({
      organization_id: organizationId,
      user_id: userId,
      model,
      operation_type: operation,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens,
      cost_usd: costData || 0,
      metadata,
    });
  } catch (e) {
    console.error("[Token tracking failed]:", (e as any).message);
  }
}

// ==================== AUTH ====================
async function checkOrgAccess(
  supabase: ReturnType<typeof createClient>,
  authUserId: string,
  organizationId: string
) {
  const { data: userOrg } = await supabase
    .from("user_organizations")
    .select("organization_id")
    .eq("user_id", authUserId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (userOrg) return;

  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUserId)
    .maybeSingle();

  if (userData?.role === "admin") return;

  throw new Error("Access denied");
}

// ==================== MAIN ====================
serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing authorization" }, 401);

    const payload = await req.json().catch(() => ({}));
    const question = safeString(payload?.question ?? "").trim();
    const organizationId = String(payload?.organizationId ?? "").trim();
    const userId = String(payload?.userId ?? "").trim();
    const conversationId = payload?.conversationId ? String(payload.conversationId) : null;

    if (!question || !organizationId) {
      return jsonResponse({ error: "Missing question or organizationId" }, 400);
    }

    // Setup clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || 
      `https://${new URL(req.url).hostname.split(".")[0]}.supabase.co`;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!supabaseKey || !openaiKey) {
      return jsonResponse({ error: "Missing API keys" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const supabaseUser = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const openai = new OpenAI({ apiKey: openaiKey });

    // Auth
    const { data: { user: authUser }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !authUser) return jsonResponse({ error: "Unauthorized" }, 401);

    const effectiveUserId = userId || authUser.id;
    await checkOrgAccess(supabase, authUser.id, organizationId);

    // Load conversation history
    const history = await loadHistory(supabase, organizationId, effectiveUserId, conversationId, 8);

    // Build conversation context (extract mentioned docs/machines, resolve vague refs)
    const conversationContext = buildConversationContext(history, question);
    const questionToUse = conversationContext.resolvedQuestion;

    console.log(`[${requestId}] Original: "${question.slice(0, 50)}..."${
      conversationContext.hasVagueReference ? `, Resolved: "${questionToUse.slice(0, 50)}..."` : ""
    }`);
    console.log(`[${requestId}] Context: Docs=${conversationContext.mentionedDocuments.join(", ")}, Machines=${conversationContext.mentionedMachines.join(", ")}`);

    // Extract search terms (use resolved question + context)
    const allText = history.map((m) => m.content).join(" ") + " " + questionToUse;
    const searchTerms = [
      ...extractSearchTerms(allText),
      ...conversationContext.mentionedDocuments,
    ];
    const uniqueSearchTerms = [...new Set(searchTerms)];

    console.log(`[${requestId}] Question: "${question.slice(0, 60)}...", Terms: ${uniqueSearchTerms.join(", ")}`);

    // Detect intent
    const intent = detectIntent(question, history);

    // Get machine info if available
    const machineNumbers = conversationContext.mentionedMachines.length > 0
      ? conversationContext.mentionedMachines
      : extractMachineNumbers(allText);
    const machineInfo = machineNumbers[0] 
      ? await getMachineInfo(supabase, organizationId, machineNumbers[0])
      : null;

    // Find available documents (for attachment if requested)
    const availableDocuments = await findDocuments(
      questionToUse,
      [],
      uniqueSearchTerms,
      organizationId,
      supabase
    );

    // Execute agent (will use retrieve tool when needed)
    console.log(`[${requestId}] Using agent with tool calling`);
    const { text: responseText, usage: chatUsage, attachedDocs } = await executeAgent(
      question,
      history,
      organizationId,
      machineInfo,
      availableDocuments,
      intent,
      conversationContext,
      supabase,
      openai
    );

    const duration = Date.now() - startTime;

    // Track tokens (fire-and-forget)
    void trackTokens(supabase, organizationId, effectiveUserId, "gpt-4o", "chat", chatUsage, {
      request_id: requestId,
      has_machine_info: !!machineInfo,
      documents_found: availableDocuments.length,
      documents_attached: attachedDocs.length,
      search_terms: uniqueSearchTerms,
      conversation_id: conversationId,
      intent,
      context_resolved: conversationContext.hasVagueReference,
      mentioned_docs: conversationContext.mentionedDocuments.length,
    });

    console.log(`[${requestId}] ✅ Success (${duration}ms): ${availableDocuments.length} docs found, ${attachedDocs.length} attached`);

    return jsonResponse({
      success: true,
      requestId,
      response: responseText,
      metadata: {
        has_machine_info: !!machineInfo,
        documents_found: availableDocuments.length,
        documents_attached: attachedDocs.length,
        search_terms: uniqueSearchTerms,
        intent,
        conversation_context: {
          mentioned_documents: conversationContext.mentionedDocuments,
          vague_reference_resolved: conversationContext.hasVagueReference,
          resolved_question: conversationContext.hasVagueReference ? conversationContext.resolvedQuestion : null,
        },
        duration_ms: duration,
      },
    });
  } catch (e: any) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] ❌ Error (${duration}ms):`, e?.message ?? e);
    return jsonResponse(
      {
        error: "Internal server error",
        requestId,
        details: String(e?.message ?? e),
      },
      500
    );
  }
});