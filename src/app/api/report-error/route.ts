import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

export async function POST(req: NextRequest) {
  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: "Missing authorization header" },
        { status: 401 }
      );
    }

    // Extract token from "Bearer <token>"
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Invalid authorization header format" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { messageId, messageContent, userMessage, userId, organizationId } = body;

    // Validate required fields
    if (!organizationId || !messageId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: organizationId and messageId are required',
        },
        { status: 400 }
      );
    }

    // Get Supabase URL and anon key for authentication
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { success: false, error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Verify authentication
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const { data: { user: authUser }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !authUser) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid or expired token" },
        { status: 401 }
      );
    }

    // Security: Reject userId mismatch
    if (userId && userId !== authUser.id) {
      return NextResponse.json(
        { success: false, error: "Forbidden: userId mismatch" },
        { status: 403 }
      );
    }

    // Verify user has access to the organization
    const { data: userOrg } = await supabaseClient
      .from("user_organizations")
      .select("organization_id")
      .eq("user_id", authUser.id)
      .eq("organization_id", organizationId)
      .single();

    if (!userOrg) {
      return NextResponse.json(
        { success: false, error: "Forbidden: no access to organization" },
        { status: 403 }
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
      user_id: authUser.id,
      organization_id: organizationId,
      message_id: messageId,
      message_content: messageContent || '',
      user_message: userMessage || '',
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











