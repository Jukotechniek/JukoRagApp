// OpenAI utility functions for embeddings and chat
// Make sure to add VITE_OPENAI_API_KEY to your .env file

import OpenAI from 'openai';
import { supabase } from './supabase';

// Initialize OpenAI client
const getOpenAIClient = () => {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('VITE_OPENAI_API_KEY is not set in environment variables');
  }
  return new OpenAI({ apiKey });
};

/**
 * Track token usage in database
 */
async function trackTokenUsage(
  organizationId: string,
  userId: string | null,
  model: string,
  operationType: 'chat' | 'embedding' | 'document_processing',
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
  metadata?: Record<string, any>
) {
  try {
    // Calculate cost using database function
    const { data: costData, error: costError } = await supabase.rpc('calculate_token_cost', {
      p_model: model,
      p_prompt_tokens: promptTokens,
      p_completion_tokens: completionTokens,
    });

    const cost = costError ? 0 : (costData || 0);

    await supabase.from('token_usage').insert({
      organization_id: organizationId,
      user_id: userId,
      model,
      operation_type: operationType,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      cost_usd: cost,
      metadata: metadata || null,
    });
  } catch (error) {
    // Don't throw - token tracking shouldn't break the main flow
    console.error('Error tracking token usage:', error);
  }
}

/**
 * Generate embedding for a text using OpenAI
 * @param text - Text to generate embedding for
 * @param organizationId - Organization ID for tracking
 * @param userId - User ID for tracking (optional)
 * @returns Array of 1536 numbers (embedding vector)
 */
export async function generateEmbedding(
  text: string,
  organizationId?: string,
  userId?: string | null
): Promise<number[]> {
  try {
    const openai = getOpenAIClient();
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small', // or 'text-embedding-ada-002'
      input: text,
      dimensions: 1536,
    });

    const usage = response.usage;
    if (usage && organizationId) {
      await trackTokenUsage(
        organizationId,
        userId || null,
        'text-embedding-3-small',
        'embedding',
        usage.prompt_tokens,
        0, // Embeddings don't have completion tokens
        usage.total_tokens,
        { text_length: text.length }
      );
    }

    return response.data[0].embedding;
  } catch (error: any) {
    console.error('Error generating embedding:', error);
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

/**
 * Generate embeddings for multiple texts (batch processing)
 * @param texts - Array of texts to generate embeddings for
 * @returns Array of embedding vectors
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  try {
    const openai = getOpenAIClient();
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
      dimensions: 1536,
    });
    return response.data.map(item => item.embedding);
  } catch (error: any) {
    console.error('Error generating embeddings batch:', error);
    throw new Error(`Failed to generate embeddings: ${error.message}`);
  }
}

/**
 * Generate AI response using OpenAI Chat API with RAG context
 * @param question - User's question
 * @param context - Context from document sections (RAG)
 * @param organizationId - Organization ID for tracking
 * @param userId - User ID for tracking (optional)
 * @returns AI response text
 */
export async function generateAIResponse(
  question: string,
  context?: string,
  organizationId?: string,
  userId?: string | null
): Promise<string> {
  try {
    const openai = getOpenAIClient();
    
    const systemPrompt = context
      ? `Je bent een behulpzame AI assistent die vragen beantwoordt op basis van de volgende documentatie context. 
Als het antwoord niet in de context staat, zeg dan dat je het niet weet op basis van de beschikbare documentatie.

Context:
${context}`
      : `Je bent een behulpzame AI assistent. Beantwoord vragen zo duidelijk en accuraat mogelijk.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // or 'gpt-3.5-turbo' for cheaper option
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const usage = response.usage;
    if (usage && organizationId) {
      await trackTokenUsage(
        organizationId,
        userId || null,
        'gpt-4o-mini',
        'chat',
        usage.prompt_tokens,
        usage.completion_tokens,
        usage.total_tokens,
        { 
          question_length: question.length,
          has_context: !!context,
          context_length: context?.length || 0
        }
      );
    }

    return response.choices[0]?.message?.content || 'Sorry, ik kon geen antwoord genereren.';
  } catch (error: any) {
    console.error('Error generating AI response:', error);
    throw new Error(`Failed to generate AI response: ${error.message}`);
  }
}

