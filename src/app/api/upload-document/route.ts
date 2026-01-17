import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    const { organization_id, name, file_type, file_size, file_url, uploaded_by, use_for_rag } = body;

    if (!organization_id || !name || !file_type || !file_size) {
      return NextResponse.json(
        { error: "Missing required fields: organization_id, name, file_type, file_size" },
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

    // Insert document using service role (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from("documents")
      .insert({
        organization_id,
        name,
        file_type,
        file_size,
        file_url: file_url || null,
        uploaded_by: uploaded_by || authUser.id,
        use_for_rag: use_for_rag || false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error inserting document:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Track analytics
    await supabaseAdmin.from("analytics").insert({
      organization_id,
      event_type: "document_uploaded",
      event_data: { file_name: name, file_size },
    });

    return NextResponse.json({ document: data });
  } catch (error: any) {
    console.error("Error in upload-document API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
