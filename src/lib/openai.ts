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
    const { data: costData, error: costError } = await (supabase as any).rpc('calculate_token_cost', {
      p_model: model,
      p_prompt_tokens: promptTokens,
      p_completion_tokens: completionTokens,
    });

    if (costError) {
      console.error('Error calculating token cost:', costError);
    }

    const cost = costError ? 0 : (costData || 0);

    const { data: insertData, error: insertError } = await (supabase as any)
      .from('token_usage')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        model,
        operation_type: operationType,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        cost_usd: cost,
        metadata: metadata || null,
      })
      .select();

    if (insertError) {
      console.error('Error inserting token usage:', insertError);
      console.error('Insert error details:', {
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        code: insertError.code,
      });
    } else {
    }
  } catch (error: any) {
    // Don't throw - token tracking shouldn't break the main flow
      // Error tracking token usage - silently fail
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

