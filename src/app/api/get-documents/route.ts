import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as Sentry from '@sentry/nextjs';

export async function POST(request: NextRequest) {
  try {
    // Get authorization header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "Missing authorization header" },
        { status: 401 }
      );
    }

    // Extract token from "Bearer <token>"
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json(
        { error: "Invalid authorization header format" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { organizationId } = body;

    if (!organizationId) {
      return NextResponse.json(
        { error: "Missing organizationId" },
        { status: 400 }
      );
    }

    // Get Supabase URL and keys from environment
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Supabase configuration missing" },
        { status: 500 }
      );
    }

    // Create client with user's token to verify authentication
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    // Verify user is authenticated
    const { data: { user: authUser }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !authUser) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or expired token" },
        { status: 401 }
      );
    }

    // Verify user is actually an admin in the database
    const { data: userData, error: userError } = await supabaseClient
      .from("users")
      .select("id, role")
      .eq("id", authUser.id)
      .single();

    if (userError || !userData) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Only admins can use this endpoint
    if (userData.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Only admins can access this endpoint" },
        { status: 403 }
      );
    }

    // Now we can safely use service role key since we've verified the user is an admin
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Build query
    let query = supabaseAdmin
      .from("documents")
      .select(
        `
        *,
        users:uploaded_by (
          name
        )
      `
      );

    // If organizationId is provided, filter by it
    // Admins can see all documents, but if they select an org, filter by it
    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }
    // If admin and no org selected, they can see all (but we'll limit this for safety)
    // Actually, let's require organizationId for now

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching documents:", error);
      
      // Capture error in Sentry
      Sentry.captureException(new Error(`Failed to fetch documents: ${error.message}`), {
        tags: {
          endpoint: '/api/get-documents',
          operation: 'fetch_documents',
        },
        contexts: {
          error: {
            message: error.message,
            code: error.code,
            details: error.details,
          },
          query: {
            organizationId,
          },
        },
        level: 'error',
      });
      
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ documents: data || [] });
  } catch (error: any) {
    console.error("Error in get-documents API:", error);
    
    // Capture error in Sentry
    Sentry.captureException(error, {
      tags: {
        endpoint: '/api/get-documents',
        operation: 'get_documents',
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
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

