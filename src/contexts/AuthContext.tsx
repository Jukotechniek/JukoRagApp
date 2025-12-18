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
    let mounted = true;
    let timeoutId: NodeJS.Timeout;
    let sessionLoaded = false; // Track if we've already loaded from getSession

    // Set a shorter timeout to ensure loading doesn't hang forever
    timeoutId = setTimeout(() => {
      if (mounted) {
        setLoading(false);
      }
    }, 3000); // 3 second timeout - much shorter for better UX

    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) return;
      
      clearTimeout(timeoutId);
      
      if (error) {
        setLoading(false);
        return;
      }

      if (session?.user) {
        sessionLoaded = true; // Mark that we're loading from getSession
        setSupabaseUser(session.user);
        
        // Set loading to false immediately if we have a session
        // User data will load in background, but we don't block the UI
        setLoading(false);
        
        // Load user data in background, but don't block
        if (!(loadUserData as any).inProgress) {
          // Don't await - let it load in background
          loadUserData(session.user.id).catch((err) => {
            console.error("Error loading user data on mount:", err);
            // Loading already false, so no need to set it again
          });
        }
      } else {
        setLoading(false);
      }
    }).catch((error) => {
      if (mounted) {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      
      clearTimeout(timeoutId);
      
      if (session?.user) {
        setSupabaseUser(session.user);
        
        // Don't set loading to true - load in background
        // Only load if not already loading and not from initial getSession
        if (!(loadUserData as any).inProgress && !sessionLoaded) {
          // Load user data in background without blocking UI
          loadUserData(session.user.id).catch((err) => {
            console.error("Error in onAuthStateChange loadUserData:", err);
          });
        } else if (sessionLoaded) {
          // Reset the flag after first load
          sessionLoaded = false;
          // Ensure loading is false
          setLoading(false);
        } else {
          // If already loading, ensure loading is false (data loads in background)
          setLoading(false);
        }
      } else {
        setSupabaseUser(null);
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const loadUserData = async (userId: string) => {
    // Prevent multiple simultaneous calls - check and set immediately
    if ((loadUserData as any).inProgress) {
      return;
    }
    
    // Set flag immediately to prevent concurrent calls
    (loadUserData as any).inProgress = true;
    
    // Don't set loading to true here - we want to load in background
    // Only set loading if we're actively waiting for this data
    const shouldSetLoading = false; // Changed to false to prevent blocking UI
    
    try {
      if (shouldSetLoading) {
        setLoading(true);
      }
      
      // Get auth user info for fallback
      const { data: authUser, error: authError } = await supabase.auth.getUser();
      
      if (authError || !authUser?.user) {
        if (shouldSetLoading) {
          setLoading(false);
        }
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
        const { error: createError } = await supabase.from("users").insert({
          id: authUser.user.id,
          email: authUser.user.email || "",
          name: authUser.user.user_metadata?.name || authUser.user.email?.split("@")[0] || "User",
          role: authUser.user.user_metadata?.role || "technician",
        });

        if (createError) {
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
          if (shouldSetLoading) {
            setLoading(false);
          }
          return;
        }

        // Retry loading user data after creation
        const { data: newUserData } = await supabase
          .from("users")
          .select("*")
          .eq("id", authUser.user.id)
          .maybeSingle();

        if (newUserData) {
          // Load organization data with timeout
          const orgDataPromise = supabase
            .from("user_organizations")
            .select("organization_id, organizations(*)")
            .eq("user_id", newUserData.id)
            .limit(1)
            .maybeSingle();

          const timeoutPromise = new Promise((resolve) => 
            setTimeout(() => resolve({ data: null, error: null }), 3000)
          );

          const { data: orgData } = await Promise.race([
            orgDataPromise,
            timeoutPromise,
          ]) as { data: any; error: any };

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
        if (shouldSetLoading) {
          setLoading(false);
        }
        return;
      }

      // Handle errors
      if (userError) {
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
        if (shouldSetLoading) {
          setLoading(false);
        }
        return;
      }

      if (userData) {
        // Get first organization (users typically belong to one org)
        // Add timeout to prevent hanging
        const orgDataPromise = supabase
          .from("user_organizations")
          .select("organization_id, organizations(*)")
          .eq("user_id", userData.id)
          .limit(1)
          .maybeSingle();

        const timeoutPromise = new Promise((resolve) => 
          setTimeout(() => resolve({ data: null, error: null }), 3000)
        );

        const { data: orgData } = await Promise.race([
          orgDataPromise,
          timeoutPromise,
        ]) as { data: any; error: any };

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
        
        // Don't set loading here - we're loading in background
        if (shouldSetLoading) {
          setLoading(false);
        }
        return;
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
        // Don't set loading here - we're loading in background
        if (shouldSetLoading) {
          setLoading(false);
        }
        return;
      }
    } catch (error) {
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
      (loadUserData as any).inProgress = false;
      // Don't set loading to false here if we're loading in background
      if (shouldSetLoading) {
        setLoading(false);
      }
    }
  };
  
  // Add flag to prevent concurrent calls
  (loadUserData as any).inProgress = false;

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
        // Don't wait for loadUserData - let onAuthStateChange handle it
        // This prevents the login from hanging if loadUserData is slow
        // The onAuthStateChange listener will automatically trigger and load user data
        setSupabaseUser(data.user);
        
        // Try to load user data in the background, but don't wait for it
        loadUserData(data.user.id).catch((err) => {
          console.error("Error loading user data in background:", err);
        });
        
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

      // Set supabaseUser immediately so redirect can happen
      setSupabaseUser(authData.user);
      
      // Load user data in background, but don't wait for it
      // This prevents registration from hanging if loadUserData is slow
      loadUserData(authData.user.id).catch((err) => {
        console.error("Error loading user data after registration:", err);
      });
      
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

