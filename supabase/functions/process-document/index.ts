// Supabase Edge Function: Process Document for RAG
// This function processes uploaded documents: chunks text and generates embeddings

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://deno.land/x/openai@v4.20.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Chunk {
  text: string;
  index: number;
  metadata?: {
    startChar?: number;
    endChar?: number;
  };
}

/**
 * Split text into chunks with overlap
 */
function splitIntoChunks(
  text: string,
  options: { maxLength?: number; overlap?: number } = {}
): Chunk[] {
  const { maxLength = 1000, overlap = 200 } = options;
  const chunks: Chunk[] = [];
  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < text.length) {
    let endIndex = Math.min(startIndex + maxLength, text.length);

    // Try to break at sentence boundary if possible
    if (endIndex < text.length) {
      const lastPeriod = text.lastIndexOf(".", endIndex);
      const lastNewline = text.lastIndexOf("\n", endIndex);
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > startIndex + maxLength * 0.5) {
        endIndex = breakPoint + 1;
      }
    }

    const chunkText = text.slice(startIndex, endIndex).trim();

    if (chunkText.length > 0) {
      chunks.push({
        text: chunkText,
        index: chunkIndex,
        metadata: {
          startChar: startIndex,
          endChar: endIndex,
        },
      });
      chunkIndex++;
    }

    // Move start index with overlap
    startIndex = endIndex - overlap;
    if (startIndex <= 0) startIndex = endIndex;
  }

  return chunks;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase client
    let supabaseUrl = Deno.env.get("SUPABASE_URL");

    if (!supabaseUrl) {
      supabaseUrl =
        Deno.env.get("SUPABASE_PROJECT_URL") || Deno.env.get("SUPABASE_PROJECT_REF");

      if (!supabaseUrl) {
        const requestUrl = new URL(req.url);
        const hostnameParts = requestUrl.hostname.split(".");
        if (hostnameParts.length >= 2) {
          const projectRef = hostnameParts[0];
          supabaseUrl = `https://${projectRef}.supabase.co`;
        }
      }
    }

    if (!supabaseUrl) {
      console.error("SUPABASE_URL could not be determined");
      return new Response(
        JSON.stringify({
          error: "SUPABASE_URL not configured",
          hint: "Add SUPABASE_URL to Edge Functions > Secrets.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseServiceKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY not configured");
      return new Response(
        JSON.stringify({
          error: "SUPABASE_SERVICE_ROLE_KEY not configured in Edge Function secrets",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Initialize OpenAI client
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      console.error("OPENAI_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured in Edge Function secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // Parse request body
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError: unknown) {
      console.error("Error parsing request body:", parseError);
      const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body", details: errorMessage }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { documentId, content, organizationId } = requestBody;

    if (!documentId || !content || !organizationId) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields",
          received: {
            hasDocumentId: !!documentId,
            hasContent: !!content,
            hasOrganizationId: !!organizationId,
          },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Split document into chunks
    const chunks = splitIntoChunks(content, {
      maxLength: 1000,
      overlap: 200,
    });

    if (chunks.length === 0) {
      return new Response(JSON.stringify({ error: "No chunks created from document" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Generate embeddings for all chunks (batch processing)
    const texts = chunks.map((chunk) => chunk.text);

    // Smaller batch size to avoid memory limits in Edge Functions
    const embeddingBatchSize = 10;
    const allEmbeddings: number[][] = [];
    let totalEmbeddingTokens = 0;

    try {
      for (let i = 0; i < texts.length; i += embeddingBatchSize) {
        const batch = texts.slice(i, i + embeddingBatchSize);

        const response = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: batch,
        });
        allEmbeddings.push(...response.data.map((item) => item.embedding));

        // Track token usage
        if (response.usage) {
          totalEmbeddingTokens += response.usage.total_tokens;
        }
      }

      // Track token usage for document processing
      if (totalEmbeddingTokens > 0) {
        const costUsd = (totalEmbeddingTokens / 1000000.0) * 0.02;
        const costEur = costUsd * 0.92;

        await supabase.from("token_usage").insert({
          organization_id: organizationId,
          user_id: null,
          model: "text-embedding-3-small",
          operation_type: "document_processing",
          prompt_tokens: totalEmbeddingTokens,
          completion_tokens: 0,
          total_tokens: totalEmbeddingTokens,
          cost_usd: costEur,
          metadata: {
            document_id: documentId,
            chunks_processed: chunks.length,
            content_length: content.length,
          },
        });
      }
    } catch (embeddingError: unknown) {
      console.error("Error generating embeddings:", embeddingError);
      const errorMessage =
        embeddingError instanceof Error ? embeddingError.message : String(embeddingError);
      return new Response(
        JSON.stringify({
          error: "Failed to generate embeddings",
          details: errorMessage,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Prepare sections for database insertion
    const sectionsToInsert = chunks.map((chunk, index) => ({
      document_id: documentId,
      content: chunk.text,
      embedding: allEmbeddings[index],
      metadata: {
        chunk_index: chunk.index,
        ...chunk.metadata,
      },
    }));

    // 4. Insert sections in smaller batches for memory efficiency
    const dbBatchSize = 5;
    for (let i = 0; i < sectionsToInsert.length; i += dbBatchSize) {
      const batch = sectionsToInsert.slice(i, i + dbBatchSize);

      const { error } = await supabase.from("document_sections").insert(batch);

      if (error) {
        console.error(`Error inserting batch ${Math.floor(i / dbBatchSize) + 1}:`, error);
        return new Response(
          JSON.stringify({
            error: "Failed to insert document sections",
            details: error.message,
            batchNumber: Math.floor(i / dbBatchSize) + 1,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        chunksProcessed: chunks.length,
        message: `Successfully processed document: ${chunks.length} chunks created`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error processing document:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to process document";
    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
