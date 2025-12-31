import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, name, role, organizationId, currentUserId, currentUserRole } = body;

    if (!email || !name || !organizationId || !currentUserId || !currentUserRole) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: email, name, organizationId, currentUserId, currentUserRole' },
        { status: 400 }
      );
    }

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

    // Get Supabase URL and Service Role Key from environment
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration');
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Try to find existing user by email first
    let userId: string | null = null;
    
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
      }
    }

    if (!userId) {
      // Invite user by email - they will receive an email to set their password
      // Get the site URL for redirect
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 
                     (process.env.NEXT_PUBLIC_SUPABASE_URL 
                       ? process.env.NEXT_PUBLIC_SUPABASE_URL.replace('.supabase.co', '')
                       : 'http://localhost:3000');
      
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: {
          name,
          role: role || 'technician',
        },
        redirectTo: `${siteUrl}/auth`,
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
      } else {
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
      message: 'User created successfully',
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

