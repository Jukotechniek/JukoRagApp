import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export type UserRole = "admin" | "manager" | "technician";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organization_id: string | null;
  organization_name: string | null;
  organization_plan: "starter" | "professional" | null;
}

interface AuthContextType {
  user: User | null;
  supabaseUser: SupabaseUser | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, name: string, organizationName: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Load user session on mount
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setSupabaseUser(session.user);
        loadUserData(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setSupabaseUser(session.user);
        await loadUserData(session.user.id);
      } else {
        setSupabaseUser(null);
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserData = async (userId: string) => {
    try {
      setLoading(true);
      
      // Get auth user info for fallback
      const { data: authUser, error: authError } = await supabase.auth.getUser();
      
      if (authError || !authUser?.user) {
        console.error("Error getting auth user:", authError);
        setLoading(false);
        return;
      }

      // Get user info from database
      // Query by auth.uid() to ensure RLS policies work correctly
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.user.id) // Use auth.uid() instead of userId parameter
        .maybeSingle(); // Use maybeSingle to avoid errors if user doesn't exist

      // If user doesn't exist in database, create it
      if (!userData && !userError) {
        // No error but no data = user doesn't exist
        console.log("User not found in database, creating basic entry...");
        
        const { error: createError } = await supabase.from("users").insert({
          id: authUser.user.id,
          email: authUser.user.email || "",
          name: authUser.user.user_metadata?.name || authUser.user.email?.split("@")[0] || "User",
          role: authUser.user.user_metadata?.role || "technician",
        });

        if (createError) {
          console.error("Error creating user entry:", createError);
          // If creation fails, use auth data as fallback
          setUser({
            id: authUser.user.id,
            name: authUser.user.user_metadata?.name || authUser.user.email?.split("@")[0] || "User",
            email: authUser.user.email || "",
            role: authUser.user.user_metadata?.role || "technician",
            organization_id: null,
            organization_name: null,
            organization_plan: null,
          });
          setLoading(false);
          return;
        }

        // Retry loading user data after creation
        const { data: newUserData } = await supabase
          .from("users")
          .select("*")
          .eq("id", authUser.user.id)
          .maybeSingle();

        if (newUserData) {
          // Load organization data
          const { data: orgData } = await supabase
            .from("user_organizations")
            .select("organization_id, organizations(*)")
            .eq("user_id", newUserData.id)
            .limit(1)
            .maybeSingle();

          const org = orgData?.organizations as any;

          setUser({
            id: newUserData.id,
            name: newUserData.name,
            email: newUserData.email,
            role: newUserData.role,
            organization_id: org?.id || null,
            organization_name: org?.name || null,
            organization_plan: org?.plan || null,
          });
        }
        setLoading(false);
        return;
      }

      // Handle errors
      if (userError) {
        console.error("Error loading user from database:", userError);
        // Use auth data as fallback
        if (authUser.user) {
          setUser({
            id: authUser.user.id,
            name: authUser.user.user_metadata?.name || authUser.user.email?.split("@")[0] || "User",
            email: authUser.user.email || "",
            role: authUser.user.user_metadata?.role || "technician",
            organization_id: null,
            organization_name: null,
            organization_plan: null,
          });
        }
        setLoading(false);
        return;
      }

      if (userData) {
        // Get first organization (users typically belong to one org)
        const { data: orgData } = await supabase
          .from("user_organizations")
          .select("organization_id, organizations(*)")
          .eq("user_id", userData.id)
          .limit(1)
          .maybeSingle();

        // orgError is OK - user might not have an organization yet
        const org = orgData?.organizations as any;

        setUser({
          id: userData.id,
          name: userData.name,
          email: userData.email,
          role: userData.role,
          organization_id: org?.id || null,
          organization_name: org?.name || null,
          organization_plan: org?.plan || null,
        });
      } else {
        // No user data and no error - use auth data as fallback
        if (authUser.user) {
          setUser({
            id: authUser.user.id,
            name: authUser.user.user_metadata?.name || authUser.user.email?.split("@")[0] || "User",
            email: authUser.user.email || "",
            role: authUser.user.user_metadata?.role || "technician",
            organization_id: null,
            organization_name: null,
            organization_plan: null,
          });
        }
      }
    } catch (error) {
      console.error("Error loading user data:", error);
      // Always set loading to false, even on error
      // Use auth data as fallback
      const { data: authUser } = await supabase.auth.getUser();
      if (authUser?.user) {
        setUser({
          id: authUser.user.id,
          name: authUser.user.user_metadata?.name || authUser.user.email?.split("@")[0] || "User",
          email: authUser.user.email || "",
          role: authUser.user.user_metadata?.role || "technician",
          organization_id: null,
          organization_name: null,
          organization_plan: null,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("Supabase auth error:", error);
        return false;
      }

      if (data.user) {
        // Load user data - this might fail if user doesn't exist in users table
        await loadUserData(data.user.id);
        
        // Check if user was loaded successfully
        // Give it a moment for the state to update
        await new Promise(resolve => setTimeout(resolve, 300));
        
        return true;
      }

      return false;
    } catch (error: any) {
      console.error("Login error:", error);
      return false;
    }
  };

  const register = async (
    email: string,
    password: string,
    name: string,
    organizationName: string
  ): Promise<boolean> => {
    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            role: "manager", // Default role for new registrations
          },
        },
      });

      if (authError) throw authError;
      if (!authData.user) return false;

      // Create organization
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .insert({
          name: organizationName,
          plan: "starter", // Default to starter plan
        })
        .select()
        .single();

      if (orgError) throw orgError;
      if (!orgData) return false;

      // Create user record
      const { error: userError } = await supabase.from("users").insert({
        id: authData.user.id,
        email,
        name,
        role: "manager",
      });

      if (userError) throw userError;

      // Link user to organization
      const { error: linkError } = await supabase
        .from("user_organizations")
        .insert({
          user_id: authData.user.id,
          organization_id: orgData.id,
        });

      if (linkError) throw linkError;

      // Reload user data
      await loadUserData(authData.user.id);
      return true;
    } catch (error: any) {
      console.error("Registration error:", error);
      return false;
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSupabaseUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        supabaseUser,
        login,
        register,
        logout,
        isAuthenticated: !!user,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

