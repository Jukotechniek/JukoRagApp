// supabase/functions/chat/index.ts
// Agentic RAG Chatbot - gebaseerd op Python LangChain implementatie
// Hybrid search: semantic similarity + keyword matching

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://deno.land/x/openai@v4.20.0/mod.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ==================== TYPES ====================
interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface DocumentSection {
  id: string;
  document_id: string;
  content: string;
  metadata: Record<string, unknown> | null;
  similarity?: number;
  source?: string;
}

interface RetrievedDocument {
  content: string;
  metadata: Record<string, unknown>;
}

// ==================== UTILS ====================
function safeString(v: unknown, max = 4000): string {
  const s = String(v ?? "");
  return s.length > max ? s.slice(0, max) : s;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ==================== RETRIEVER TOOL ====================
// Hybrid search: semantic similarity + keyword matching (zoals Python agent)
async function retrieve(
  query: string,
  organizationId: string,
  supabase: SupabaseClient,
  openai: OpenAI
): Promise<{ serialized: string; documents: RetrievedDocument[] }> {
  console.log(`[Retrieve] Query: "${query.slice(0, 100)}..."`);

  // 1. Generate embedding voor semantic search
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;

  // 2. Semantic search met meer resultaten
  const { data: semanticDocs, error: semanticError } = await supabase.rpc(
    "match_document_sections",
    {
      p_organization_id: organizationId,
      query_embedding: queryEmbedding,
      match_count: 10,
      match_threshold: 0.30,
    }
  );

  if (semanticError) {
    console.error("[Retrieve] Semantic search error:", semanticError);
  }

  const semanticResults: DocumentSection[] = (semanticDocs || []).map((doc: Record<string, unknown>) => ({
    id: String(doc.id),
    document_id: String(doc.document_id),
    content: String(doc.content || ""),
    metadata: (doc.metadata as Record<string, unknown>) || {},
    similarity: Number(doc.similarity) || 0,
    source: String(doc.document_name || "Onbekend document"),
  }));

  console.log(`[Retrieve] Semantic search found ${semanticResults.length} results`);

  // 3. Keyword search voor specifieke patronen (factuur nummers, etc.)
  const keywordDocs: DocumentSection[] = [];

  // Check voor factuur/invoice nummer patroon (bijv. F2025-60)
  const invoicePattern = query.match(/[Ff]\d{4}-\d+/);
  if (invoicePattern) {
    const invoiceNum = invoicePattern[0];
    console.log(`[Retrieve] Keyword search for invoice: ${invoiceNum}`);

    try {
      const { data: keywordResults, error: keywordError } = await supabase
        .from("document_sections")
        .select("id, document_id, content, metadata")
        .ilike("content", `%${invoiceNum}%`)
        .limit(10);

      if (!keywordError && keywordResults) {
        for (const row of keywordResults) {
          // Check of dit document bij de organisatie hoort
          const { data: docData } = await supabase
            .from("documents")
            .select("id, name, organization_id")
            .eq("id", row.document_id)
            .eq("organization_id", organizationId)
            .maybeSingle();

          if (docData) {
            keywordDocs.push({
              id: String(row.id),
              document_id: String(row.document_id),
              content: String(row.content || ""),
              metadata: (row.metadata as Record<string, unknown>) || {},
              source: String(docData.name || "Onbekend document"),
            });
          }
        }
      }
    } catch (e) {
      console.error("[Retrieve] Keyword search error:", e);
    }
  }

  console.log(`[Retrieve] Keyword search found ${keywordDocs.length} results`);

  // 4. Combine and deduplicate - prioritize keyword matches
  const allDocs: DocumentSection[] = [];
  const seenContent = new Set<string>();

  // First add keyword matches (more relevant for exact patterns)
  for (const doc of keywordDocs) {
    const contentKey = doc.content.slice(0, 200);
    if (!seenContent.has(contentKey)) {
      allDocs.push(doc);
      seenContent.add(contentKey);
    }
  }

  // Then add semantic results that aren't duplicates
  for (const doc of semanticResults) {
    const contentKey = doc.content.slice(0, 200);
    if (!seenContent.has(contentKey)) {
      allDocs.push(doc);
      seenContent.add(contentKey);
    }
  }

  // Limit to top 5 results
  const retrievedDocs = allDocs.slice(0, 5);

  console.log(`[Retrieve] Final results: ${retrievedDocs.length} documents`);

  // Serialize for context
  const serialized = retrievedDocs
    .map((doc) => `Source: ${doc.source}\nContent: ${doc.content}`)
    .join("\n\n");

  const documents: RetrievedDocument[] = retrievedDocs.map((doc) => ({
    content: doc.content,
    metadata: { ...doc.metadata, source: doc.source },
  }));

  return { serialized, documents };
}

// ==================== AGENT ====================
async function runAgent(
  question: string,
  chatHistory: Message[],
  organizationId: string,
  supabase: SupabaseClient,
  openai: OpenAI
): Promise<{ response: string; usage: OpenAI.CompletionUsage | null }> {
  console.log(`[Agent] Processing question: "${question.slice(0, 100)}..."`);

  // Define the retrieve tool
  const tools: OpenAI.ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "retrieve",
        description:
          "Retrieve information related to a query. Uses hybrid search combining semantic similarity and keyword matching for better results. Use this to find information in technical documents.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query to find relevant information",
            },
          },
          required: ["query"],
        },
      },
    },
  ];

  // System prompt (vergelijkbaar met Python agent)
  const systemPrompt = `Je bent een behulpzame technische assistent. Je helpt gebruikers met vragen over technische documentatie.

Je hebt toegang tot een retrieve tool om informatie op te zoeken in de documentatie.

BELANGRIJK:
- Gebruik ALTIJD de retrieve tool om informatie op te zoeken voordat je antwoord geeft
- Baseer je antwoord ALLEEN op de gevonden informatie
- Als je geen relevante informatie vindt, zeg dat eerlijk
- Antwoord in het Nederlands
- Houd antwoorden duidelijk en beknopt`;

  // Build messages
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...chatHistory.slice(-8).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: question },
  ];

  // First call - let the model decide if it needs to use tools
  const firstResponse = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    tools,
    tool_choice: "auto",
    temperature: 0,
  });

  const firstMessage = firstResponse.choices[0].message;
  let totalUsage = firstResponse.usage;

  // Check if the model wants to call tools
  if (firstMessage.tool_calls && firstMessage.tool_calls.length > 0) {
    console.log(`[Agent] Tool calls requested: ${firstMessage.tool_calls.length}`);

    // Add assistant message with tool calls
    messages.push(firstMessage);

    // Process each tool call
    for (const toolCall of firstMessage.tool_calls) {
      if (toolCall.function.name === "retrieve") {
        const args = JSON.parse(toolCall.function.arguments);
        const query = args.query || question;

        console.log(`[Agent] Calling retrieve with query: "${query.slice(0, 100)}..."`);

        // Execute the retrieve function
        const { serialized } = await retrieve(query, organizationId, supabase, openai);

        // Add tool result
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: serialized || "Geen relevante documenten gevonden.",
        });
      }
    }

    // Second call - generate final response with tool results
    const secondResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 0,
    });

    // Combine usage
    if (secondResponse.usage && totalUsage) {
      totalUsage = {
        prompt_tokens: totalUsage.prompt_tokens + secondResponse.usage.prompt_tokens,
        completion_tokens: (totalUsage.completion_tokens || 0) + (secondResponse.usage.completion_tokens || 0),
        total_tokens: totalUsage.total_tokens + secondResponse.usage.total_tokens,
      };
    }

    return {
      response: secondResponse.choices[0].message.content || "Sorry, ik kon geen antwoord genereren.",
      usage: totalUsage || null,
    };
  }

  // No tool calls - return direct response
  return {
    response: firstMessage.content || "Sorry, ik kon geen antwoord genereren.",
    usage: totalUsage || null,
  };
}

// ==================== CONVERSATION HISTORY ====================
async function loadHistory(
  supabase: SupabaseClient,
  organizationId: string,
  conversationId: string | null,
  limit = 8
): Promise<Message[]> {
  try {
    let query = supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (conversationId) {
      query = query.eq("conversation_id", conversationId);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return (data as Array<{ role: string; content: string }>)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: safeString(m.content ?? "", 1000),
      }))
      .reverse();
  } catch {
    return [];
  }
}

// ==================== AUTH ====================
async function checkOrgAccess(
  supabase: SupabaseClient,
  authUserId: string,
  organizationId: string
): Promise<void> {
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

  if (userData && (userData as { role: string }).role === "admin") return;

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

    console.log(`[${requestId}] Question: "${question.slice(0, 60)}..."`);

    // Setup clients
    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") ||
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
    const {
      data: { user: authUser },
      error: authError,
    } = await supabaseUser.auth.getUser();
    if (authError || !authUser) return jsonResponse({ error: "Unauthorized" }, 401);

    await checkOrgAccess(supabase, authUser.id, organizationId);

    // Load conversation history
    const history = await loadHistory(supabase, organizationId, conversationId, 8);

    // Run the agent
    const { response, usage } = await runAgent(question, history, organizationId, supabase, openai);

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Completed in ${duration}ms`);

    return jsonResponse({
      success: true,
      response,
      metadata: {
        request_id: requestId,
        duration_ms: duration,
        model: "gpt-4o",
        usage,
      },
    });
  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});
