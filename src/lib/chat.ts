// Chat utilities for N8N webhook integration
// Requires VITE_N8N_CHAT_WEBHOOK_URL to be configured

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
 * Send chat message via N8N webhook
 * @param request - Chat request parameters
 * @returns Chat response
 * @throws Error if N8N webhook URL is not configured
 */
export async function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  const n8nChatWebhookUrl = import.meta.env.VITE_N8N_CHAT_WEBHOOK_URL;

  if (!n8nChatWebhookUrl) {
    throw new Error(
      'N8N chat webhook is not configured. Please set VITE_N8N_CHAT_WEBHOOK_URL in your environment variables.'
    );
  }

  console.log('Calling N8N webhook for chat:', request.question.slice(0, 50) + '...');
  
  const response = await fetch(n8nChatWebhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      question: request.question,
      organizationId: request.organizationId,
      userId: request.userId,
      conversationId: request.conversationId,
      timestamp: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { error: errorText };
    }
    
    throw new Error(
      errorData.error || 
      errorData.message || 
      `N8N webhook returned status ${response.status}`
    );
  }

  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || data.message || 'N8N chat processing failed');
  }

  // N8N should return: { success: true, response: string, metadata?: any }
  return {
    success: true,
    response: data.response || data.text || 'Geen antwoord ontvangen van N8N.',
    metadata: data.metadata || {},
  };
}

