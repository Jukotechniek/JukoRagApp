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

/**
 * Send chat message with streaming support
 * @param request - Chat request parameters
 * @param onToken - Callback for each token received
 * @returns Promise that resolves when streaming is complete
 */
export async function sendChatMessageStream(
  request: ChatRequest,
  onToken: (token: string) => void
): Promise<{ success: boolean; error?: string }> {
  console.log('Calling streaming chat API:', request.question.slice(0, 50) + '...');
  
  try {
    // Get auth token from Supabase
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch('/api/chat?stream=true', {
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

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || 'Chat processing failed');
    }

    // Read streaming response
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    if (!reader) {
      throw new Error('No response body');
    }

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === 'token' && data.token) {
              onToken(data.token);
            } else if (data.type === 'error') {
              throw new Error(data.error || 'Streaming error');
            } else if (data.type === 'done') {
              return { success: true };
            }
          } catch (e) {
            console.error('Error parsing stream data:', e);
          }
        }
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('Chat streaming error:', err);
    return {
      success: false,
      error: err.message || 'Failed to process chat message',
    };
  }
}
