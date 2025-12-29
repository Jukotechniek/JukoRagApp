// Chat utilities for Next.js API route (LangChain + Langfuse)
import { supabase } from './supabase';

interface ChatRequest {
  question: string;
  organizationId: string;
  userId: string;
  conversationId: string | null;
}

interface ChatResponse {
  success: boolean;
  response?: string;
  error?: string;
  metadata?: any;
}

/**
 * Send chat message via Next.js API route (LangChain + Langfuse)
 * @param request - Chat request parameters
 * @returns Chat response
 */
export async function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  console.log('Calling Next.js API route for chat:', request.question.slice(0, 50) + '...');
  
  try {
    // Get auth token from Supabase
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        question: request.question,
        organizationId: request.organizationId,
        userId: request.userId,
        conversationId: request.conversationId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Chat processing failed');
    }

    if (!data || !data.success) {
      throw new Error(data?.error || 'Chat processing failed');
    }

    return {
      success: true,
      response: data.response || 'Geen antwoord ontvangen.',
      metadata: data.metadata || {},
    };
  } catch (err: any) {
    console.error('Chat API error:', err);
    throw new Error(err.message || 'Failed to process chat message');
  }
}

