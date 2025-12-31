import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    const { userId, organizationId, deleteFromAuth } = body;

    if (!userId || !organizationId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: userId, organizationId' },
        { status: 400 }
      );
    }

    // Get Supabase URL and anon key for user verification
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
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
        { success: false, error: "Unauthorized: Invalid or expired token" },
        { status: 401 }
      );
    }

    // Get user data from database to verify role
    const { data: userData, error: userError } = await supabaseClient
      .from("users")
      .select("id, role")
      .eq("id", authUser.id)
      .single();

    if (userError || !userData) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const currentUserId = userData.id;
    const currentUserRole = userData.role;

    // Authorization check
    if (currentUserRole === 'manager') {
      // Managers can only remove users from their own organization
      const { data: userOrgs } = await supabaseClient
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', currentUserId)
        .eq('organization_id', organizationId)
        .single();
      
      if (!userOrgs) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: You can only remove users from your own organization' },
          { status: 403 }
        );
      }

      // Managers can delete users from their own organization
      // No need to check deleteFromAuth for managers - they can always delete
    } else if (currentUserRole !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Only admins and managers can remove users' },
        { status: 403 }
      );
    }

    // Get Service Role Key from environment (URL and anon key already retrieved above)
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseServiceKey) {
      console.error('Missing Supabase service role key');
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Create admin client with service role key (only after verifying user is authorized)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // First check if user is only in this organization, if so, delete completely
    const { data: userOrgs } = await supabaseAdmin
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', userId);

    // If user is only in this organization, delete completely
    const shouldDeleteCompletely = !userOrgs || userOrgs.length === 0 || 
      (userOrgs.length === 1 && userOrgs[0].organization_id === organizationId);

    // Remove user from organization (remove link)
    const { error: unlinkError } = await supabaseAdmin
      .from('user_organizations')
      .delete()
      .eq('user_id', userId)
      .eq('organization_id', organizationId);

    if (unlinkError) {
      console.error('Error removing user from organization:', unlinkError);
      return NextResponse.json(
        { success: false, error: unlinkError.message || 'Failed to remove user from organization' },
        { status: 500 }
      );
    }

    if (shouldDeleteCompletely) {
      // Delete from users table
      const { error: userDeleteError } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('id', userId);

      if (userDeleteError) {
        console.error('Error deleting user record:', userDeleteError);
        // Continue even if this fails, as the user is already unlinked from organization
      }

      // Delete from auth.users
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

      if (authDeleteError) {
        console.error('Error deleting auth user:', authDeleteError);
        // Continue even if this fails, as the user is already unlinked from organization
      }
    }

    return NextResponse.json({
      success: true,
      message: shouldDeleteCompletely ? 'User permanently deleted' : 'User removed from organization',
      completelyDeleted: shouldDeleteCompletely,
    });
  } catch (error: any) {
    console.error('Error in delete-user API:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}

