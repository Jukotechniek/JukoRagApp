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
    const { email, name, role, organizationId } = body;

    if (!email || !name || !organizationId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: email, name, organizationId' },
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
      // Managers can add managers and technicians to their own organization
      if (role !== 'technician' && role !== 'manager') {
        return NextResponse.json(
          { success: false, error: 'Managers can only add managers and technicians' },
          { status: 403 }
        );
      }
      // Verify manager belongs to the organization they're trying to add users to
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey) {
        return NextResponse.json(
          { success: false, error: 'Server configuration error' },
          { status: 500 }
        );
      }
      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
      const { data: userOrgs } = await supabaseClient
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', currentUserId)
        .eq('organization_id', organizationId)
        .single();
      
      if (!userOrgs) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: You can only add users to your own organization' },
          { status: 403 }
        );
      }
    } else if (currentUserRole !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Only admins and managers can add users' },
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

    // Try to find existing user by email first
    let userId: string | null = null;
    let inviteWasSent = false;
    
    // List users to find by email (unfortunately Admin API doesn't have getUserByEmail)
    // We'll use pagination to limit the load
    const { data: usersList, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000, // Adjust if you have more users
    });
    
    if (!listError && usersList?.users) {
      const existingAuthUser = usersList.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (existingAuthUser) {
        userId = existingAuthUser.id;
        console.log(`User ${email} already exists in auth, using existing user ID: ${userId}`);
      }
    }

    if (!userId) {
      // Invite user by email - they will receive an email to set their password
      // Get the site URL for redirect - must be absolute URL
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 
                     (process.env.NEXT_PUBLIC_SUPABASE_URL 
                       ? `https://${process.env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').split('.')[0]}.vercel.app`
                       : 'http://localhost:3000');
      
      // For localhost, use localhost directly
      const redirectUrl = siteUrl.includes('localhost') 
        ? 'http://localhost:3000/auth'
        : `${siteUrl}/auth`;
      
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: {
          name,
          role: role || 'technician',
        },
        redirectTo: redirectUrl,
      });

      if (inviteError) {
        // If user already exists (duplicate email), try to find them
        if (inviteError.message?.includes('already registered') || inviteError.message?.includes('already exists') || inviteError.message?.includes('User already registered')) {
          // Retry listing users to find the existing user
          const { data: retryList } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 1000,
          });
          if (retryList?.users) {
            const existingUser = retryList.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
            if (existingUser) {
              userId = existingUser.id;
              console.log(`User ${email} already exists, using existing user ID: ${userId}`);
            } else {
              console.error('Error inviting user - user exists but not found:', inviteError);
              return NextResponse.json(
                { success: false, error: 'User with this email already exists but could not be retrieved' },
                { status: 500 }
              );
            }
          }
        } else {
          console.error('Error inviting user:', inviteError);
          return NextResponse.json(
            { success: false, error: inviteError.message || 'Failed to invite user' },
            { status: 500 }
          );
        }
      } else if (inviteData?.user) {
        userId = inviteData.user.id;
        inviteWasSent = true;
        console.log(`Invite email sent successfully to ${email}, user ID: ${userId}`);
        // Note: Supabase doesn't return a confirmation that the email was sent,
        // but if there's no error and we have a user, the invite was processed
      } else {
        console.error('Failed to invite user - no user returned in response');
        return NextResponse.json(
          { success: false, error: 'Failed to invite user - no user returned' },
          { status: 500 }
        );
      }
    }

    // Check if user already exists in users table
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (!existingUser) {
      // Create user record in users table
      const { error: userError } = await supabaseAdmin.from('users').insert({
        id: userId,
        email,
        name,
        role: role || 'technician',
      });

      if (userError) {
        console.error('Error creating user record:', userError);
        return NextResponse.json(
          { success: false, error: userError.message || 'Failed to create user record' },
          { status: 500 }
        );
      }
    } else {
      // Update existing user if needed
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          name,
          role: role || 'technician',
        })
        .eq('id', userId);

      if (updateError) {
        console.error('Error updating user:', updateError);
        return NextResponse.json(
          { success: false, error: updateError.message || 'Failed to update user' },
          { status: 500 }
        );
      }
    }

    // Link user to organization
    const { data: existingLink } = await supabaseAdmin
      .from('user_organizations')
      .select('*')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .single();

    if (!existingLink) {
      const { error: linkError } = await supabaseAdmin.from('user_organizations').insert({
        user_id: userId,
        organization_id: organizationId,
      });

      if (linkError) {
        console.error('Error linking user to organization:', linkError);
        return NextResponse.json(
          { success: false, error: linkError.message || 'Failed to link user to organization' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      userId,
      message: inviteWasSent 
        ? 'User created and invite email sent successfully' 
        : 'User linked to organization successfully',
      inviteSent: inviteWasSent,
    });
  } catch (error: any) {
    console.error('Error in create-user API:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}

