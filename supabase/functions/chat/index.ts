// Supabase Edge Function: Chat Completion with RAG
// This function handles chat messages with RAG (Retrieval-Augmented Generation)
// Ensures organization-specific document access

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import OpenAI from 'https://deno.land/x/openai@v4.20.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AgentCategory = 'Machine informatie' | "Locatie's" | 'Bestand doorsturen' | 'other';

interface SimilarSection {
  id: string;
  document_id: string;
  content: string;
  metadata: any;
  similarity: number;
}

interface RAGResult {
  context: string;
  sections: SimilarSection[];
  hasDocuments: boolean;
  hasDocumentSections: boolean;
  embeddingUsage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
}

interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

async function loadChatHistory(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  conversationId: string,
  limit = 6
): Promise<ChatHistoryItem[]> {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('organization_id', organizationId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error || !data) return [];

    return data
      .filter((m: any) => m.role === 'user' || m.role === 'assistant')
      .map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: String(m.content || ''),
      }));
  } catch (_e) {
    return [];
  }
}

async function generateEmbeddingAndSearch(
  question: string,
  organizationId: string,
  supabase: ReturnType<typeof createClient>,
  openai: OpenAI,
  userId: string
): Promise<RAGResult> {
  let hasDocuments = false;
  let hasDocumentSections = false;
  let context = '';
  let sectionsWithSimilarity: SimilarSection[] = [];
  let embeddingUsage: RAGResult['embeddingUsage'] = null;

  const { data: documents, error: docError } = await supabase
    .from('documents')
    .select('id')
    .eq('organization_id', organizationId);

  if (!docError && documents && documents.length > 0) {
    hasDocuments = true;
    const documentIds = documents.map((doc) => doc.id);

    const { data: sections, error: sectionsError } = await supabase
      .from('document_sections')
      .select('id, document_id, content, embedding, metadata')
      .in('document_id', documentIds);

    if (!sectionsError && sections && sections.length > 0) {
      hasDocumentSections = true;

      try {
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: question,
          dimensions: 1536,
        });

        const queryEmbedding = embeddingResponse.data[0].embedding as number[];
        embeddingUsage = embeddingResponse.usage
          ? {
              prompt_tokens: embeddingResponse.usage.prompt_tokens,
              completion_tokens: embeddingResponse.usage.completion_tokens,
              total_tokens: embeddingResponse.usage.total_tokens,
            }
          : null;

        sectionsWithSimilarity = (sections as any[])
          .map((section) => {
            if (
              !section.embedding ||
              !Array.isArray(section.embedding) ||
              section.embedding.length !== queryEmbedding.length
            ) {
              return null;
            }

            let dotProduct = 0;
            let magnitude1 = 0;
            let magnitude2 = 0;

            for (let i = 0; i < queryEmbedding.length; i++) {
              dotProduct += queryEmbedding[i] * section.embedding[i];
              magnitude1 += queryEmbedding[i] * queryEmbedding[i];
              magnitude2 += section.embedding[i] * section.embedding[i];
            }

            const magnitude = Math.sqrt(magnitude1) * Math.sqrt(magnitude2);
            const similarity = magnitude > 0 ? dotProduct / magnitude : 0;

            return {
              id: section.id,
              document_id: section.document_id,
              content: section.content,
              metadata: section.metadata,
              similarity,
            } as SimilarSection;
          })
          .filter((s): s is SimilarSection => !!s && s.similarity >= 0.7)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 5);

        if (sectionsWithSimilarity.length > 0) {
          context = sectionsWithSimilarity.map((s) => s.content).join('\n\n');
        }
      } catch (e: any) {
        console.error('[Chat] Embedding/vector search error:', e.message);
      }
    }
  }

  // Track embedding tokens if available
  if (embeddingUsage) {
    try {
      const { data: costData } = await supabase.rpc('calculate_token_cost', {
        p_model: 'text-embedding-3-small',
        p_prompt_tokens: embeddingUsage.prompt_tokens,
        p_completion_tokens: 0,
      });

      await supabase.from('token_usage').insert({
        organization_id: organizationId,
        user_id: userId,
        model: 'text-embedding-3-small',
        operation_type: 'embedding',
        prompt_tokens: embeddingUsage.prompt_tokens,
        completion_tokens: 0,
        total_tokens: embeddingUsage.total_tokens,
        cost_usd: costData || 0,
        metadata: { question_length: question.length },
      });
    } catch (err) {
      console.error('[Chat] Failed to track embedding usage:', err);
    }
  }

  return { context, sections: sectionsWithSimilarity, hasDocuments, hasDocumentSections, embeddingUsage };
}

async function classifyQuestion(
  question: string,
  openai: OpenAI
): Promise<AgentCategory> {
  const systemPrompt = `🔧 Verbeterde System Prompt – Text Classifier (met geheugen & wachtwoordregel)

Je taak: classificeer de gebruikersvraag in precies één categorie.

Geldige outputs (exact zo gespeld):

Machine informatie

Locatie's

Bestand doorsturen

other

Machine informatie → inhoudelijke/technische vragen over een machine (onderhoud, instellingen, probleemoplossing, onderdelen vervangen, frequentieregelaar-parameters, “hoe vaak olie verversen”, “hoe vervang ik het wiel op VM04”, “wat doet sensor X”, etc.).
➡️ Alle vragen naar een wachtwoord vallen hier ook onder.

Locatie's → “waar is/waar vind ik …” vragen (machine, kast, sensor, onderdeel, ruimte).

Bestand doorsturen → expliciet verzoek om document/bestand/handleiding/schema te sturen of te krijgen (bijv. “stuur schema vm04”, “handleiding Multivac pdf?”, “mag ik het e-schema?”).

other → alles wat niet duidelijk in bovenstaande valt (groeten, smalltalk, planning, prijs, account, niet-technisch).

Output alleen de categorie-string, geen extra tekst/quotes/JSON.

Synoniemen herkennen

“manual/handleiding/pdf/schema/tekening/bestand/file/doc” ⇒ Bestand doorsturen

“waar/locatie/gevonden/ligt/staat/zit/plek” ⇒ Locatie's

“hoe/instellen/repareren/onderhouden/oorzaak/verklaren/werkt” ⇒ Machine informatie

“wachtwoord/password/code” ⇒ Machine informatie`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ],
    max_tokens: 10,
    temperature: 0,
  });

  const raw = (resp.choices[0]?.message?.content || '').trim() as AgentCategory;
  if (raw === 'Machine informatie' || raw === "Locatie's" || raw === 'Bestand doorsturen' || raw === 'other') {
    return raw;
  }
  return 'other';
}

async function handleOtherAgent(question: string, openai: OpenAI): Promise<string> {
  const systemPrompt = `🛠️ OtherAgent – Vriendelijke prompt

Rol
Je bent de OtherAgent.
Je vangt alle vragen op die niet onder Machine informatie, Locatie's of Bestand doorsturen vallen.
Je bent altijd vriendelijk, behulpzaam en mag gerust een klein beetje persoonlijk en luchtig klinken.

Wat je moet doen

Begroet altijd kort en vriendelijk.

Geef een korte uitleg over de drie andere agents en wat ze doen.

Leg uit dat hoe specifieker de vraag, hoe beter (vooral met machinenummer).

Als het smalltalk is (hoi/goedemorgen/etc.), reageer wat spontaner, maar verwijs alsnog kort naar de mogelijkheden.

Houd de toon vriendelijk en toegankelijk, niet te robotachtig.

Antwoord in natuurlijk Nederlands, maar zonder JSON; gewone tekst is prima.`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ],
    temperature: 0.3,
    max_tokens: 400,
  });

  return resp.choices[0]?.message?.content || '';
}

function extractMachineNumber(question: string): string | null {
  const regex = /\b[A-Z]{2,4}\d{1,3}\b/;
  const match = question.toUpperCase().match(regex);
  return match ? match[0] : null;
}

async function queryMachineInfo(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  machineNumber: string
): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from('machine_info')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('machine_nummer', machineNumber)
      .maybeSingle();

    if (error) {
      console.warn('[Chat] machine_info query error (safe to ignore if table not present):', error.message);
      return null;
    }
    return data || null;
  } catch (e) {
    console.warn('[Chat] machine_info query failed:', (e as any).message);
    return null;
  }
}

async function handleInformatieAgent(
  question: string,
  organizationId: string,
  userId: string,
  supabase: ReturnType<typeof createClient>,
  openai: OpenAI,
  rag: RAGResult,
  history: ChatHistoryItem[]
): Promise<string> {
  const machineNumber = extractMachineNumber(question);
  let sheetRow: any | null = null;

  if (machineNumber) {
    sheetRow = await queryMachineInfo(supabase, organizationId, machineNumber);
  }

  const extraFromSheet = sheetRow?.extraopmerkingen || sheetRow?.extra_opmerkingen || '';

  const contextParts: string[] = [];
  if (sheetRow) {
    contextParts.push(
      `Machine info uit tabel:
MachineNaam: ${sheetRow.machinenaam ?? sheetRow.machine_naam ?? 'onbekend'}
MachineNummer: ${sheetRow.machinenummer ?? sheetRow.machine_nummer ?? machineNumber}
Locatie: ${sheetRow.locatie ?? 'onbekend'}
OmschrijvingLocatie: ${sheetRow.omschrijvinglocatie ?? sheetRow.omschrijving_locatie ?? 'onbekend'}
ExtraOpmerkingen: ${extraFromSheet || '—'}
E-Schema: ${sheetRow['e-schema'] ?? sheetRow.e_schema ?? '—'}`
    );
  }
  if (rag.context) {
    contextParts.push(`Documenten-context:\n${rag.context}`);
  }

  if (history.length > 0) {
    const historyText = history
      .map((m) => `${m.role === 'user' ? 'Gebruiker' : 'Assistent'}: ${m.content}`)
      .join('\n');
    contextParts.push(`Gespreksgeschiedenis (laatste berichten):\n${historyText}`);
  }

  const systemPrompt = `Rol
Je bent de InformatieAgent. Je geeft korte, praktische antwoorden op inhoudelijke vragen (onderhoud, resetten, instellingen, wachtwoorden, procedures).

Je hebt twee bronnen:
- Een machine_info-tabel (sheet) met o.a. ExtraOpmerkingen en E-Schema.
- Een vector database met document-secties (handleidingen, servicemodi, wachtwoorden, etc.).

Regels
- Gebruik eerst de machine_info gegevens als ze duidelijk het antwoord geven.
- Voor wachtwoorden/codes: als ze niet expliciet in de sheet staan, gebruik altijd ook de document-context.
- Antwoorden zijn kort, direct en in gewoon Nederlands.
- Voeg alleen bron-info toe als dat echt helpt (bijv. naam van het document tussen haakjes).
- Antwoord in gewone tekst (geen JSON) omdat de frontend dit als Markdown toont.

Context:
${contextParts.join('\n\n') || 'Geen extra context.'}
`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ],
    max_tokens: 800,
    temperature: 0.4,
  });

  return resp.choices[0]?.message?.content || 'Geen relevante informatie gevonden.';
}

async function handleLocatieAgent(
  question: string,
  organizationId: string,
  userId: string,
  supabase: ReturnType<typeof createClient>,
  openai: OpenAI,
  rag: RAGResult,
  history: ChatHistoryItem[]
): Promise<string> {
  const systemPrompt = `📍 LocatieAgent – kasten & locaties

Rol
Je bent de locatie-zoeker.
Je taak: geef exact de locatie van een kast (HK, LV, HVK codes) of machine op basis van de beschikbare context.

Regels
- Gebruik uitsluitend letterlijke locatie-informatie uit de context (tabellen/teksten), niets erbij verzinnen.
- Schrijf in 1–3 korte zinnen in natuurlijk Nederlands.
- Als meerdere resultaten: noem ze onder elkaar in opsomming.
- Geen resultaat: zeg "Geen locatie gevonden voor deze kast of machine op basis van de huidige documenten.".

Gespreksgeschiedenis (laatste berichten):
${history
  .map((m) => `${m.role === 'user' ? 'Gebruiker' : 'Assistent'}: ${m.content}`)
  .join('\n') || 'Geen eerdere berichten in deze sessie.'}

Context:
${rag.context || 'Geen locatiegegevens gevonden.'}
`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ],
    max_tokens: 500,
    temperature: 0.3,
  });

  return resp.choices[0]?.message?.content || 'Geen locatie gevonden voor deze kast of machine op basis van de huidige documenten.';
}

async function handleDocumentAgent(
  question: string,
  organizationId: string,
  userId: string,
  supabase: ReturnType<typeof createClient>,
  openai: OpenAI,
  rag: RAGResult,
  history: ChatHistoryItem[]
): Promise<string> {
  const machineNumber = extractMachineNumber(question);

  const topDocId = rag.sections[0]?.document_id || null;
  let linkedDoc: { name: string; file_url: string | null } | null = null;

  if (topDocId) {
    const { data: doc } = await supabase
      .from('documents')
      .select('name, file_url')
      .eq('id', topDocId)
      .maybeSingle();
    if (doc) {
      linkedDoc = { name: doc.name, file_url: doc.file_url };
    }
  }

  const systemPrompt = `📄 DocumentAgent – bestanden/schema's opsturen

Rol
Je helpt de gebruiker aan het juiste document (schema, handleiding, pdf, etc.).

Context:
${rag.context || 'Geen documenten-context beschikbaar.'}

Gespreksgeschiedenis (laatste berichten):
${history
  .map((m) => `${m.role === 'user' ? 'Gebruiker' : 'Assistent'}: ${m.content}`)
  .join('\n') || 'Geen eerdere berichten in deze sessie.'}

Regels
- Als je een passend document herkent in de context (of via metadata), beschrijf in 1 korte zin welk document je gaat sturen.
- Benoem bij voorkeur machinenaam/machinenummer in die zin.
- Het daadwerkelijke sturen van de link gebeurt door het systeem; jij mag in Markdown verwijzen naar de bestandsnaam indien bekend.
- Antwoord in gewone tekst/Markdown, geen JSON.
`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ],
    max_tokens: 400,
    temperature: 0.4,
  });

  let baseText =
    resp.choices[0]?.message?.content ||
    'Ik heb een relevant document gevonden op basis van de beschikbare documentatie.';

  if (linkedDoc && linkedDoc.file_url) {
    const linkLine = `\n\n[${linkedDoc.name}](${linkedDoc.file_url})`;
    baseText += linkLine;
  }

  return baseText;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseUrl) {
      const requestUrl = new URL(req.url);
      const projectRef = requestUrl.hostname.split('.')[0];
      supabaseUrl = `https://${projectRef}.supabase.co`;
    }

    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY environment variable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseUser = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const {
      data: { user: authUser },
      error: authError,
    } = await supabaseUser.auth.getUser();
    if (authError || !authUser) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { question, organizationId, userId, conversationId } = await req.json();

    if (!question || !organizationId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: question, organizationId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const effectiveUserId = userId || authUser.id;

    const { data: userOrg, error: orgError } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', authUser.id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (orgError || !userOrg) {
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', authUser.id)
        .maybeSingle();

      if (userData?.role !== 'admin') {
        return new Response(
          JSON.stringify({ error: 'Access denied: User does not belong to this organization' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing OPENAI_API_KEY environment variable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });

    console.log('[Chat] Request received (multi-agent):', {
      question: String(question).substring(0, 150),
      organizationId,
      userId: effectiveUserId,
      conversationId,
    });
    
    const history =
      typeof conversationId === 'string' && conversationId.length > 0
        ? await loadChatHistory(supabase, organizationId, conversationId)
        : [];

    const category = await classifyQuestion(question, openai);
    console.log('[Chat] Classified category:', category);

    const rag = await generateEmbeddingAndSearch(question, organizationId, supabase, openai, effectiveUserId);
    console.log('[Chat] RAG status:', {
      hasDocuments: rag.hasDocuments,
      hasDocumentSections: rag.hasDocumentSections,
      contextLength: rag.context.length,
      sectionCount: rag.sections.length,
    });

    let responseText = '';

    try {
      if (category === 'Machine informatie') {
        responseText = await handleInformatieAgent(
          question,
          organizationId,
          effectiveUserId,
          supabase,
          openai,
          rag,
          history
        );
      } else if (category === "Locatie's") {
        responseText = await handleLocatieAgent(
          question,
          organizationId,
          effectiveUserId,
          supabase,
          openai,
          rag,
          history
        );
      } else if (category === 'Bestand doorsturen') {
        responseText = await handleDocumentAgent(
          question,
          organizationId,
          effectiveUserId,
          supabase,
          openai,
          rag,
          history
        );
      } else {
        responseText = await handleOtherAgent(question, openai);
      }
    } catch (agentError: any) {
      console.error('[Chat] Agent handler error, falling back to simple answer:', agentError.message);

      const fallbackPrompt = `Je bent een behulpzame AI assistent. De multi-agent logica is tijdelijk niet beschikbaar.
Beantwoord de vraag zo goed mogelijk op basis van je algemene kennis. Antwoord in Markdown.`;

      const fallbackResp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: fallbackPrompt },
          { role: 'user', content: question },
        ],
        max_tokens: 800,
        temperature: 0.6,
      });

      responseText =
        fallbackResp.choices[0]?.message?.content || 'Sorry, ik kon geen antwoord genereren.';
    }

    if (!responseText) {
      responseText =
        'Sorry, ik kon geen relevant antwoord vinden op basis van de huidige informatie.';
    }

    const responseData = {
      success: true,
      response: responseText,
      hasContext: !!rag.context,
      contextLength: rag.context.length,
      usedRAG: rag.sections.length > 0,
      hasDocuments: rag.hasDocuments,
      hasDocumentSections: rag.hasDocumentSections,
      debug: {
        questionLength: question.length,
        category,
        sectionsFound: rag.sections.length,
      },
    };

    console.log('[Chat] Response ready (multi-agent):', {
      category,
      hasContext: responseData.hasContext,
      usedRAG: responseData.usedRAG,
    });

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[Chat] Fatal error:', error.message);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

