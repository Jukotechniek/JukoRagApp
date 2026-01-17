import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

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
    const { organizationId } = body;

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: organizationId' },
        { status: 400 }
      );
    }

    // Get Supabase URL and keys
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Verify authentication and admin role
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

    // Check if user is admin
    const { data: userData, error: userError } = await supabaseClient
      .from("users")
      .select("id, role")
      .eq("id", authUser.id)
      .single();

    if (userError || !userData || userData.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Forbidden: Only admins can delete organizations" },
        { status: 403 }
      );
    }

    // Use service role key for deletion (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Delete organization (CASCADE will handle related data)
    const { error: deleteError, data: deleteData } = await supabaseAdmin
      .from("organizations")
      .delete()
      .eq("id", organizationId)
      .select();

    if (deleteError) {
      console.error('Error deleting organization:', deleteError);
      
      Sentry.captureException(new Error(`Failed to delete organization: ${deleteError.message}`), {
        tags: {
          endpoint: '/api/delete-organization',
          operation: 'delete_organization',
        },
        contexts: {
          error: {
            message: deleteError.message,
            code: deleteError.code,
            details: deleteError.details,
          },
          organization: {
            organization_id: organizationId,
          },
        },
        level: 'error',
      });
      
      return NextResponse.json(
        { success: false, error: deleteError.message || 'Failed to delete organization' },
        { status: 500 }
      );
    }

    if (!deleteData || deleteData.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Organization not found or already deleted' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Organization deleted successfully',
      organizationId: organizationId,
    });
  } catch (error: any) {
    console.error('Error in delete-organization API:', error);
    
    Sentry.captureException(error, {
      tags: {
        endpoint: '/api/delete-organization',
        operation: 'delete_organization',
      },
      contexts: {
        error: {
          message: error.message,
          stack: error.stack,
        },
      },
      level: 'error',
    });
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}
