import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { createTrace, createSpan, createGeneration } from '@/lib/langfuse';

interface Message {
  role: 'user' | 'assistant' | 'system';
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
  const s = String(v ?? '');
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

async function loadHistory(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  userId: string,
  conversationId: string | null,
  limit = 8
): Promise<Message[]> {
  try {
    let q = supabase
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (conversationId) q = q.eq('conversation_id', conversationId);
    else q = q.eq('user_id', userId);

    const { data, error } = await q;
    if (error || !data) return [];

    return data
      .filter((m: any) => m.role === 'user' || m.role === 'assistant')
      .map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: safeString(m.content ?? '', 1000),
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
  openai: OpenAI,
  trace: any
): Promise<string> {
  const retrieveSpan = createSpan(trace, 'retrieve_documents', {
    input: {
      query: query,
      organization_id: organizationId,
    },
  });

  try {
    // Semantic search with embedding
    const embeddingSpan = createSpan(retrieveSpan, 'create_embedding', {
      input: query,
      model: 'text-embedding-3-small',
    });
    
    const embeddingStartTime = Date.now();
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });
    const embeddingDuration = Date.now() - embeddingStartTime;

    const queryEmbedding = embeddingResponse.data[0].embedding as number[];

    if (embeddingResponse.usage) {
      const embeddingGen = createGeneration(embeddingSpan, 'text-embedding-3-small', {
        model: 'text-embedding-3-small',
        modelParameters: {
          model: 'text-embedding-3-small',
        },
        input: query,
        usage: embeddingResponse.usage,
      });
      embeddingGen?.end({
        output: {
          embedding_length: queryEmbedding.length,
          embedding_dimensions: queryEmbedding.length,
        },
        usage: embeddingResponse.usage,
        duration_ms: embeddingDuration,
      });
    }
    embeddingSpan?.end({
      output: {
        embedding_length: queryEmbedding.length,
        embedding_dimensions: queryEmbedding.length,
      },
      duration_ms: embeddingDuration,
    });

    // Vector search
    const vectorSearchSpan = createSpan(retrieveSpan, 'vector_search', {
      input: {
        organization_id: organizationId,
        query_embedding_length: queryEmbedding.length,
        match_count: 10,
        threshold: 0.30,
      },
    });
    
    const vectorSearchStartTime = Date.now();
    // Use the correct parameter names based on database types
    // Database types show: p_organization_id, query_embedding (mixed!)
    // Call RPC - try different parameter combinations to find what works
    let semanticMatches: any = null;
    let error: any = null;
    
    // Try with lower threshold first (0.30 might be too high)
    const result1 = await supabase.rpc('match_document_sections', {
      p_organization_id: organizationId,
      query_embedding: queryEmbedding,
      match_count: 10,
      match_threshold: 0.20, // Lower threshold for more results
    } as any);
    
    if (result1.error) {
      // Try with p_ prefix for embedding
      const result2 = await supabase.rpc('match_document_sections', {
        p_organization_id: organizationId,
        p_query_embedding: queryEmbedding,
        p_match_count: 10,
        p_threshold: 0.20,
      } as any);
      
      if (result2.error) {
        // Try without threshold (use default)
        const result3 = await supabase.rpc('match_document_sections', {
          p_organization_id: organizationId,
          query_embedding: queryEmbedding,
          match_count: 10,
        } as any);
        semanticMatches = result3.data;
        error = result3.error;
      } else {
        semanticMatches = result2.data;
        error = result2.error;
      }
    } else {
      semanticMatches = result1.data;
      error = result1.error;
    }
    
    const vectorSearchDuration = Date.now() - vectorSearchStartTime;

    const semanticDocs: SimilarSection[] = [];
    if (!error && semanticMatches && Array.isArray(semanticMatches)) {
      const docIds = [...new Set(semanticMatches.map((m: any) => m.document_id))].slice(0, 10);
      const docMetadata: Map<string, any> = new Map();

      if (docIds.length > 0) {
        const { data: docs } = await supabase
          .from('documents')
          .select('id, name, metadata')
          .in('id', docIds);

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
            content: safeString(m.content ?? '', 1200),
            metadata: m.metadata ?? {},
            similarity: Number(m.similarity ?? 0),
            doc_name: docMeta.name || 'Onbekend document',
            page: m.metadata?.page_number || m.metadata?.page || null,
          };
        })
        .filter((s) => Number.isFinite(s.similarity) && s.similarity >= 0) // Include 0 similarity too
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 10));
    }
    
    // Log if no semantic matches found (for debugging)
    if (error) {
      console.error('[Vector search error]:', error);
    } else if (semanticDocs.length === 0) {
      console.warn(`[Vector search]: No matches found. Query: "${query.slice(0, 50)}", Org: ${organizationId}, Matches from RPC: ${semanticMatches?.length || 0}`);
    } else {
      console.log(`[Vector search]: Found ${semanticDocs.length} valid semantic matches (top similarity: ${semanticDocs[0]?.similarity})`);
    }
    
    vectorSearchSpan?.end({
      output: {
        semantic_matches: semanticDocs.length,
        matches: semanticDocs.map(doc => ({
          id: doc.id,
          document_id: doc.document_id,
          doc_name: doc.doc_name,
          page: doc.page,
          similarity: doc.similarity,
          content_preview: doc.content.slice(0, 200),
        })),
        top_similarity: semanticDocs[0]?.similarity || 0,
        error: error ? String(error) : null,
      },
      duration_ms: vectorSearchDuration,
    });

    // Keyword search for invoice numbers (like Python version)
    const invoicePattern = query.match(/[Ff]\d{4}-\d+/);
    const keywordSearchSpan = createSpan(retrieveSpan, 'keyword_search', {
      input: {
        query: query,
        invoice_pattern: invoicePattern ? invoicePattern[0] : null,
        organization_id: organizationId,
      },
    });
    
    const keywordDocs: SimilarSection[] = [];
    const keywordSearchStartTime = Date.now();
    
    // Always do keyword search if invoice pattern found (like Python)
    if (invoicePattern) {
      const invoiceNum = invoicePattern[0];
      try {
        // Use same table name as Python: documents_sections
        const { data: keywordMatches, error: keywordError } = await supabase
          .from('documents_sections')
          .select('id, document_id, content, metadata')
          .eq('organization_id', organizationId)
          .ilike('content', `%${invoiceNum}%`)
          .limit(10);

        if (keywordError) {
          console.error('[Keyword search error]:', keywordError);
          keywordSearchSpan?.update({
            error: String(keywordError),
          });
        } else if (keywordMatches && keywordMatches.length > 0) {
          const docIds = [...new Set(keywordMatches.map((m: any) => m.document_id))];
          const { data: docs } = await supabase
            .from('documents')
            .select('id, name, metadata')
            .in('id', docIds);

          const docMetadata: Map<string, any> = new Map();
          if (docs) {
            docs.forEach((d: any) => docMetadata.set(d.id, { name: d.name, ...d.metadata }));
          }

          keywordDocs.push(...keywordMatches.map((m: any) => {
            const docMeta = docMetadata.get(m.document_id) || {};
            return {
              id: String(m.id),
              document_id: String(m.document_id),
              content: safeString(m.content ?? '', 1200),
              metadata: m.metadata ?? {},
              similarity: 0.9, // High score for exact keyword match (like Python)
              doc_name: docMeta.name || 'Onbekend document',
              page: m.metadata?.page_number || m.metadata?.page || null,
            };
          }));
        }
      } catch (e) {
        console.error('[Keyword search error]:', e);
        keywordSearchSpan?.update({
          error: String(e),
        });
      }
    }
    const keywordSearchDuration = Date.now() - keywordSearchStartTime;
    
    keywordSearchSpan?.end({
      output: {
        keyword_matches: keywordDocs.length,
        matches: keywordDocs.map(doc => ({
          id: doc.id,
          document_id: doc.document_id,
          doc_name: doc.doc_name,
          page: doc.page,
          similarity: doc.similarity,
          content_preview: doc.content.slice(0, 200),
        })),
      },
      duration_ms: keywordSearchDuration,
    });

    // Combine and deduplicate
    const allDocs: SimilarSection[] = [];
    const seenContent = new Set<string>();

    for (const doc of keywordDocs) {
      const contentKey = doc.content.slice(0, 200);
      if (!seenContent.has(contentKey)) {
        allDocs.push(doc);
        seenContent.add(contentKey);
      }
    }

    for (const doc of semanticDocs) {
      const contentKey = doc.content.slice(0, 200);
      if (!seenContent.has(contentKey)) {
        allDocs.push(doc);
        seenContent.add(contentKey);
      }
    }

    const retrievedDocs = allDocs.slice(0, 5);

    // Serialize results exactly like Python version: "Source: {metadata}\nContent: {content}"
    const retrievedText = retrievedDocs.map((doc) => {
      // Format metadata like Python (just the source name/page)
      const source = doc.doc_name + (doc.page ? ` (p.${doc.page})` : '');
      return `Source: ${source}\nContent: ${doc.content}`;
    }).join('\n\n');

    retrieveSpan?.end({
      output: {
        total_results: retrievedDocs.length,
        semantic_results: semanticDocs.length,
        keyword_results: keywordDocs.length,
        retrieved_documents: retrievedDocs.map(doc => ({
          id: doc.id,
          document_id: doc.document_id,
          doc_name: doc.doc_name,
          page: doc.page,
          similarity: doc.similarity,
          content_length: doc.content.length,
        })),
        retrieved_text_length: retrievedText.length,
      },
    });

    return retrievedText;
  } catch (error: any) {
    retrieveSpan?.end({
      output: {
        error: error.message,
        error_type: error.constructor?.name || 'Error',
      },
    });
    throw error;
  }
}

async function getMachineInfo(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  machineNumber: string
) {
  try {
    const { data } = await supabase
      .from('machine_info')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('machine_nummer', machineNumber)
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
      .from('documents')
      .select('id, name, file_url')
      .eq('id', section.document_id)
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
        .from('documents')
        .select('id, name, file_url')
        .eq('organization_id', organizationId)
        .eq('use_for_rag', true)
        .ilike('name', `%${term}%`)
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
  const normalizedQuestion = q.replace(/\s+/g, ' ');
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ');

  let selected: DocumentLink[] = [];

  if (fileNameMatches.length > 0) {
    const targets = fileNameMatches.map((m) => normalize(m));
    selected = availableDocuments.filter((doc) => {
      const nameNorm = normalize(doc.name);
      return (
        targets.some((t) => nameNorm.includes(t) || t.includes(nameNorm)) ||
        targets.some((t) =>
          normalizedQuestion.includes(nameNorm) ||
          normalizedQuestion.includes(nameNorm.split('.')[0])
        )
      );
    });
  }

  if (selected.length === 0) {
    selected = availableDocuments.filter((doc) => {
      const base = normalize(doc.name.split('.')[0]);
      return (
        base.length > 3 &&
        (normalizedQuestion.includes(base) || q.includes(base.replace(/\s+/g, '')))
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
        .from('documents')
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
  const docStopwords = ['over', 'gaat', 'hierover', 'daarover', 'er', 'het', 'die'];
  
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
        const lastToken = parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9_-]/gi, '');
        if (!docStopwords.includes(lastToken) && lastToken.length > 2) {
          mentionedDocs.push(cleaned);
        }
      });
    }
  });

  const allText = recentHistory.map(m => m.content).join(' ') + ' ' + currentQuestion;
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
  openai: OpenAI,
  trace: any
): Promise<{ text: string; usage: any; attachedDocs: DocumentLink[] }> {
  const agentSpan = createSpan(trace, 'agent_execution', {
    input: {
      question: question,
      has_machine_info: !!machineInfo,
      available_documents: availableDocuments.length,
      history_length: history.length,
      intent: intent,
      conversation_context: conversationContext,
    },
  });

  // Build system prompt
  const contextParts: string[] = [];

  if (conversationContext.mentionedDocuments.length > 0) {
    contextParts.push(
      `GESPREK CONTEXT:
Recent genoemde documenten: ${conversationContext.mentionedDocuments.join(', ')}
${conversationContext.hasVagueReference ? `⚠️ User gebruikt vage verwijzing ("die", "het", "deze") - dit verwijst waarschijnlijk naar: ${conversationContext.mentionedDocuments[conversationContext.mentionedDocuments.length - 1]}` : ''}
Machines in gesprek: ${conversationContext.mentionedMachines.join(', ') || 'geen'}`
    );
  }

  if (machineInfo) {
    contextParts.push(
      `MACHINE DATABASE:
- Naam: ${machineInfo.machinenaam ?? machineInfo.machine_naam ?? 'onbekend'}
- Nummer: ${machineInfo.machinenummer ?? machineInfo.machine_nummer ?? 'onbekend'}
- Locatie: ${machineInfo.locatie ?? 'onbekend'}
- Beschrijving: ${machineInfo.omschrijvinglocatie ?? machineInfo.omschrijving_locatie ?? 'onbekend'}
- Opmerkingen: ${machineInfo.extraopmerkingen ?? machineInfo.extra_opmerkingen ?? '—'}
- E-Schema: ${machineInfo['e-schema'] ?? machineInfo.e_schema ?? '—'}`
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

${contextParts.length > 0 ? `\nBESCHIKBARE CONTEXT:\n${contextParts.join('\n\n')}` : ''}`;

  // Build messages with history
  const messages: any[] = [
    { role: 'system', content: systemPrompt },
  ];

  history.slice(-6).forEach((msg) => {
    messages.push({ role: msg.role, content: msg.content });
  });

  messages.push({ role: 'user', content: question });

  // Update agent span with full context
  agentSpan?.update({
    input: {
      question: question,
      has_machine_info: !!machineInfo,
      machine_info: machineInfo ? {
        naam: machineInfo.machinenaam ?? machineInfo.machine_naam,
        nummer: machineInfo.machinenummer ?? machineInfo.machine_nummer,
        locatie: machineInfo.locatie,
      } : null,
      available_documents: availableDocuments.length,
      available_documents_list: availableDocuments.map(doc => doc.name),
      history_length: history.length,
      history_messages: history.map(msg => ({
        role: msg.role,
        content_preview: msg.content.slice(0, 100),
      })),
      intent: intent,
      conversation_context: conversationContext,
      system_prompt: systemPrompt,
      messages_count: messages.length,
    },
  });

  // Define retrieve tool (exactly like Python version)
  const tools = [{
    type: 'function' as const,
    function: {
      name: 'retrieve',
      description: 'Retrieve information related to a query. Uses hybrid search combining semantic similarity and keyword matching for better results. Use this when you need to search for information in documents.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find relevant information in documents. Can be a question, invoice number (like F2025-60), or any search term.'
          }
        },
        required: ['query']
      }
    }
  }];

  let totalUsage: any = null;
  let finalResponse = '';
  let attachedDocs: DocumentLink[] = [];

  // Agent loop (max 3 iterations)
  for (let iteration = 0; iteration < 3; iteration++) {
    const chatSpan = createSpan(agentSpan, `chat_iteration_${iteration + 1}`, {
      input: {
        iteration: iteration + 1,
        messages_count: messages.length,
        has_tools: tools.length > 0,
      },
    });
    
    const chatStartTime = Date.now();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      tools: tools,
      tool_choice: 'auto',
      temperature: 0,
      max_tokens: 1000,
    });
    const chatDuration = Date.now() - chatStartTime;

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

      const chatGen = createGeneration(chatSpan, 'gpt-4o', {
        model: 'gpt-4o',
        modelParameters: {
          model: 'gpt-4o',
          temperature: 0,
          max_tokens: 1000,
          tool_choice: 'auto',
          tools_count: tools.length,
        },
        input: messages,
        usage: response.usage,
        iteration: iteration + 1,
      });
      
      chatGen?.end({
        output: message.content || (message.tool_calls ? { tool_calls: message.tool_calls.length } : null),
        usage: response.usage,
        finishReason: response.choices[0]?.finish_reason,
        duration_ms: chatDuration,
      });
    }

    messages.push(message);
    
    const hasToolCalls = !!(message.tool_calls && message.tool_calls.length > 0);
    chatSpan?.end({
      output: {
        has_tool_calls: hasToolCalls,
        tool_calls_count: hasToolCalls ? message.tool_calls?.length : 0,
        response_content: message.content || null,
        finish_reason: response.choices[0]?.finish_reason,
      },
      duration_ms: chatDuration,
    });

    // Check if tool calls are needed
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        const toolName = 'function' in toolCall ? toolCall.function.name : (toolCall as any).name;
        const toolArgs = 'function' in toolCall ? toolCall.function.arguments : (toolCall as any).arguments;
        
        if (toolName === 'retrieve') {
          const toolCallSpan = createSpan(chatSpan, 'tool_call_retrieve', {
            input: {
              tool_call_id: 'id' in toolCall ? toolCall.id : (toolCall as any).id,
              tool_name: toolName,
              tool_arguments: toolArgs,
            },
          });
          
          const parsedArgs = JSON.parse(toolArgs || '{}');
          const query = parsedArgs.query || question;
          const toolCallStartTime = Date.now();
          
          // Call retrieve tool (this will do semantic + keyword search)
          const retrievedInfo = await retrieveTool(query, organizationId, supabase, openai, trace);
          const toolCallDuration = Date.now() - toolCallStartTime;
          
          toolCallSpan?.end({
            output: {
              retrieved_info_length: retrievedInfo.length,
              retrieved_info_preview: retrievedInfo.slice(0, 500),
              query_used: query,
            },
            duration_ms: toolCallDuration,
          });
          
          // Add tool result to messages (like Python agent_executor)
          messages.push({
            role: 'tool',
            tool_call_id: 'id' in toolCall ? toolCall.id : (toolCall as any).id,
            name: 'retrieve',
            content: retrievedInfo,
          });
        }
      }
      // Continue loop to get final response (like Python agent_executor)
      continue;
    }

    // No tool calls - we have the final answer
    finalResponse = message.content || 'Sorry, ik kon geen antwoord genereren.';
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
      .join('\n');
    finalResponse += `\n\n${docLinks}`;
  }

  // Remove markdown links from response
  finalResponse = finalResponse.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');

  agentSpan?.end({
    output: {
      final_response: finalResponse,
      final_response_length: finalResponse.length,
      documents_attached: attachedDocs.length,
      attached_documents: attachedDocs.map(doc => ({
        name: doc.name,
        file_url: doc.file_url,
      })),
      total_iterations: 3,
      total_tokens: totalUsage?.total_tokens,
    },
  });

  return { text: finalResponse, usage: totalUsage, attachedDocs };
}

// ==================== TOKEN TRACKING ====================
async function trackTokens(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  userId: string,
  model: string,
  operation: 'chat' | 'embedding',
  usage: any,
  metadata: Record<string, unknown>
) {
  if (!usage) return;
  try {
    const { data: costData } = await supabase.rpc('calculate_token_cost', {
      p_model: model,
      p_prompt_tokens: usage.prompt_tokens,
      p_completion_tokens: usage.completion_tokens || 0,
    });

    await supabase.from('token_usage').insert({
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
    console.error('[Token tracking failed]:', (e as any).message);
  }
}

// ==================== AUTH ====================
async function checkOrgAccess(
  supabase: ReturnType<typeof createClient>,
  authUserId: string,
  organizationId: string
) {
  const { data: userOrg } = await supabase
    .from('user_organizations')
    .select('organization_id')
    .eq('user_id', authUserId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (userOrg) return;

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', authUserId)
    .maybeSingle();

  if (userData?.role === 'admin') return;

  throw new Error('Access denied');
}

// ==================== MAIN ====================
export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();
  let trace: any = null;

  try {
    // Parse request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing authorization' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const question = safeString(payload?.question ?? '').trim();
    const organizationId = String(payload?.organizationId ?? '').trim();
    const userId = String(payload?.userId ?? '').trim();
    const conversationId = payload?.conversationId ? String(payload.conversationId) : null;

    if (!question || !organizationId) {
      return NextResponse.json({ error: 'Missing question or organizationId' }, { status: 400 });
    }

    // Setup clients
    // Use NEXT_PUBLIC_SUPABASE_URL (same URL for client and server)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Server-only, never expose to client!
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!supabaseUrl || !supabaseKey || !openaiKey) {
      return NextResponse.json({ error: 'Missing API keys' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const supabaseUser = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const openai = new OpenAI({ apiKey: openaiKey });

    // Auth
    const { data: { user: authUser }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const effectiveUserId = userId || authUser.id;
    await checkOrgAccess(supabase, authUser.id, organizationId);

    // Create Langfuse trace (after we have user info)
    try {
      trace = createTrace('chat_request', effectiveUserId, {
        request_id: requestId,
        timestamp: new Date().toISOString(),
        organization_id: organizationId,
        conversation_id: conversationId,
        question: question,
        question_length: question.length,
      });
    } catch (error) {
      console.warn('Langfuse trace creation failed, continuing without tracking:', error);
    }

    // Load conversation history
    const historySpan = createSpan(trace, 'load_history', {
      input: {
        organization_id: organizationId,
        user_id: effectiveUserId,
        conversation_id: conversationId,
        limit: 8,
      },
    });
    
    const historyStartTime = Date.now();
    const history = await loadHistory(supabase, organizationId, effectiveUserId, conversationId, 8);
    const historyDuration = Date.now() - historyStartTime;
    
    historySpan?.end({
      output: {
        history: history.map(msg => ({
          role: msg.role,
          content_length: msg.content.length,
          content_preview: msg.content.slice(0, 100),
          timestamp: msg.timestamp,
        })),
        history_length: history.length,
      },
      duration_ms: historyDuration,
    });

    // Build conversation context
    const contextSpan = createSpan(trace, 'build_context', {
      input: {
        question: question,
        history_length: history.length,
      },
    });
    
    const contextStartTime = Date.now();
    const conversationContext = buildConversationContext(history, question);
    const questionToUse = conversationContext.resolvedQuestion;
    const contextDuration = Date.now() - contextStartTime;
    
    contextSpan?.end({
      output: {
        mentioned_documents: conversationContext.mentionedDocuments,
        mentioned_documents_count: conversationContext.mentionedDocuments.length,
        mentioned_machines: conversationContext.mentionedMachines,
        mentioned_machines_count: conversationContext.mentionedMachines.length,
        has_vague_reference: conversationContext.hasVagueReference,
        resolved_question: conversationContext.hasVagueReference ? conversationContext.resolvedQuestion : question,
        original_question: question,
      },
      duration_ms: contextDuration,
    });

    // Extract search terms
    const allText = history.map((m) => m.content).join(' ') + ' ' + questionToUse;
    const searchTerms = [
      ...extractSearchTerms(allText),
      ...conversationContext.mentionedDocuments,
    ];
    const uniqueSearchTerms = [...new Set(searchTerms)];

    // Detect intent
    const intent = detectIntent(question, history);

    // Get machine info if available
    const machineNumbers = conversationContext.mentionedMachines.length > 0
      ? conversationContext.mentionedMachines
      : extractMachineNumbers(allText);
    const machineInfo = machineNumbers[0] 
      ? await getMachineInfo(supabase, organizationId, machineNumbers[0])
      : null;

    // Find available documents
    const documentsSpan = createSpan(trace, 'find_documents', {
      input: {
        question: questionToUse,
        search_terms: uniqueSearchTerms,
        organization_id: organizationId,
      },
    });
    
    const documentsStartTime = Date.now();
    const availableDocuments = await findDocuments(
      questionToUse,
      [],
      uniqueSearchTerms,
      organizationId,
      supabase
    );
    const documentsDuration = Date.now() - documentsStartTime;
    
    documentsSpan?.end({
      output: {
        documents_found: availableDocuments.length,
        documents: availableDocuments.map(doc => ({
          name: doc.name,
          file_url: doc.file_url,
        })),
        search_terms: uniqueSearchTerms,
      },
      duration_ms: documentsDuration,
    });

    // Execute agent
    const { text: responseText, usage: chatUsage, attachedDocs } = await executeAgent(
      question,
      history,
      organizationId,
      machineInfo,
      availableDocuments,
      intent,
      conversationContext,
      supabase,
      openai,
      trace
    );

    const duration = Date.now() - startTime;

    // Track tokens (fire-and-forget)
    void trackTokens(supabase, organizationId, effectiveUserId, 'gpt-4o', 'chat', chatUsage, {
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

    trace?.end({
      output: {
        success: true,
        response: responseText,
        response_length: responseText.length,
        documents_attached: attachedDocs.length,
        attached_documents: attachedDocs.map(doc => ({
          name: doc.name,
          file_url: doc.file_url,
        })),
        total_tokens: chatUsage?.total_tokens,
        prompt_tokens: chatUsage?.prompt_tokens,
        completion_tokens: chatUsage?.completion_tokens,
        metadata: {
          has_machine_info: !!machineInfo,
          documents_found: availableDocuments.length,
          search_terms: uniqueSearchTerms,
          intent: intent,
          conversation_context: {
            mentioned_documents: conversationContext.mentionedDocuments,
            vague_reference_resolved: conversationContext.hasVagueReference,
            resolved_question: conversationContext.hasVagueReference ? conversationContext.resolvedQuestion : null,
          },
        },
      },
      duration_ms: duration,
    });

    return NextResponse.json({
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
    
    trace?.end({
      output: {
        error: e?.message ?? String(e),
        error_type: e?.constructor?.name || 'Error',
        error_stack: e?.stack || null,
      },
      status: 500,
      duration_ms: duration,
    });

    return NextResponse.json(
      {
        error: 'Internal server error',
        requestId,
        details: String(e?.message ?? e),
      },
      { status: 500 }
    );
  }
}

