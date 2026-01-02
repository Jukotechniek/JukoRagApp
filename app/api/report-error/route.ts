import { NextRequest, NextResponse } from 'next/server';

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messageId, messageContent, userId, organizationId } = body;

    // Validate required fields
    if (!userId || !organizationId || !messageId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: userId, organizationId, and messageId are required',
        },
        { status: 400 }
      );
    }

    // Check if webhook URL is configured
    if (!N8N_WEBHOOK_URL) {
      console.error('N8N_WEBHOOK_URL is not configured');
      return NextResponse.json(
        {
          success: false,
          error: 'Webhook URL is not configured',
        },
        { status: 500 }
      );
    }

    // Prepare the payload for n8n webhook
    const payload = {
      user_id: userId,
      organization_id: organizationId,
      message_id: messageId,
      message_content: messageContent || '',
      timestamp: new Date().toISOString(),
      report_type: 'incorrect_answer',
    };

    // Send to n8n webhook
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('N8N webhook error:', errorText);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to send report to webhook',
          details: errorText,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Fout antwoord succesvol gerapporteerd',
    });
  } catch (error: any) {
    console.error('Error reporting incorrect answer:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process report',
        details: error.message,
      },
      { status: 500 }
    );
  }
}









