'use client';

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bot, ArrowLeft, Mail, Lock, User, Building } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { getHomeUrl } from "@/lib/url-utils";

function AuthPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  // Always in login mode - registration disabled
  const [isLogin, setIsLogin] = useState(true);
  const [homeUrl, setHomeUrl] = useState('/');
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
    organization: "",
  });

  useEffect(() => {
    // Set home URL for back link
    setHomeUrl(getHomeUrl());
    
    // Redirect to login if someone tries to register
    if (!searchParams) return;
    if (searchParams.get("mode") === "register") {
      router.replace("/auth");
    }
    setIsLogin(true);
    
    // Check for invite/password reset hash fragments
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        const type = params.get('type');
        const accessToken = params.get('access_token');
        const error = params.get('error');
        
        if (error) {
          // Handle errors from hash
          if (error === 'access_denied' || error === 'otp_expired') {
            toast({
              title: "Link verlopen",
              description: "De invite link is verlopen of ongeldig. Vraag een nieuwe invite aan.",
              variant: "destructive",
            });
          }
          return;
        }
        
        if (type === 'invite' || type === 'recovery') {
          // User is setting password via invite or password reset
          setIsSettingPassword(true);
          
          // Get email from session if available
          if (accessToken) {
            supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: params.get('refresh_token') || '',
            }).then(async ({ data, error }) => {
              if (error) {
                console.error("Error setting session:", error);
                toast({
                  title: "Fout",
                  description: "Kon sessie niet instellen. Probeer de link opnieuw.",
                  variant: "destructive",
                });
                return;
              }
              
              // Try multiple sources for email
              let userEmail = data?.user?.email;
              
              // If email not in user object, try to get it from user metadata or user_metadata
              if (!userEmail) {
                userEmail = data?.user?.user_metadata?.email || 
                           data?.user?.app_metadata?.email;
              }
              
              // If still no email, try to get current session
              if (!userEmail) {
                const { data: sessionData } = await supabase.auth.getSession();
                userEmail = sessionData?.session?.user?.email;
              }
              
              // If still no email, try getUser() as a last resort
              if (!userEmail) {
                const { data: userData } = await supabase.auth.getUser();
                userEmail = userData?.user?.email;
              }
              
              if (userEmail) {
                console.log("Email loaded successfully:", userEmail);
                setFormData(prev => ({ ...prev, email: userEmail }));
              } else {
                console.error("No email found in user data. Available data:", data);
                // Don't show error toast, just let user fill it manually
                // The field will be editable
              }
            }).catch((error) => {
              console.error("Error in setSession:", error);
              toast({
                title: "Fout",
                description: "Er is een fout opgetreden bij het laden van de invite.",
                variant: "destructive",
              });
            });
          }
        }
      }
    };
    
    // Check hash on mount - use setTimeout to ensure hash is available
    const checkHash = () => {
      handleHashChange();
    };
    
    // Check immediately
    checkHash();
    
    // Also check after a short delay in case hash loads after component
    const timeoutId = setTimeout(checkHash, 100);
    
    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [searchParams, toast]);

  const { login, register, supabaseUser } = useAuth();
  
  // Additional useEffect to load email after session is established
  useEffect(() => {
    if (!isSettingPassword || formData.email) {
      return; // Don't run if not setting password or email already loaded
    }
    
    // Try to get email from session after a short delay
    const loadEmail = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const emailFromSession = sessionData?.session?.user?.email;
        if (emailFromSession && typeof emailFromSession === 'string') {
          setFormData(prev => {
            // Only update if email is still empty
            if (!prev.email) {
              return { ...prev, email: emailFromSession };
            }
            return prev;
          });
          return;
        }
        
        // Try getUser() as well
        const { data: userData } = await supabase.auth.getUser();
        const emailFromUser = userData?.user?.email;
        if (emailFromUser && typeof emailFromUser === 'string') {
          setFormData(prev => {
            // Only update if email is still empty
            if (!prev.email) {
              return { ...prev, email: emailFromUser };
            }
            return prev;
          });
        }
      } catch (error) {
        console.error("Error loading email in useEffect:", error);
      }
    };
    
    // Try immediately and also after delays to catch late-loading sessions
    loadEmail();
    const timeoutId = setTimeout(loadEmail, 500);
    const timeoutId2 = setTimeout(loadEmail, 1500);
    
    return () => {
      clearTimeout(timeoutId);
      clearTimeout(timeoutId2);
    };
  }, [isSettingPassword]); // Only depend on isSettingPassword, not formData.email

  // Redirect when authenticated - but NOT if user is setting password
  // After password is set, we manually handle redirect in handleSetPassword
  useEffect(() => {
    // Only auto-redirect for regular login, not for password setting flow
    if (supabaseUser && !isLoading && !isSettingPassword && !isSubmitting) {
      // Small delay to ensure state is settled, then redirect
      const redirectTimer = setTimeout(() => {
        toast({
          title: "Welkom terug!",
          description: "U bent succesvol ingelogd.",
        });
        router.push("/dashboard");
      }, 100);
      
      return () => clearTimeout(redirectTimer);
    }
  }, [supabaseUser, isLoading, isSettingPassword, isSubmitting, router, toast]);

  const handleSetPassword = async () => {
    // Safety timeout to prevent infinite loading
    const safetyTimeout = setTimeout(() => {
      console.warn("handleSetPassword timeout - resetting states");
      setIsLoading(false);
      setIsSubmitting(false);
    }, 15000); // 15 seconds max

    try {
      // Validate email is present
      if (!formData.email || !formData.email.trim()) {
        clearTimeout(safetyTimeout);
        toast({
          title: "Email ontbreekt",
          description: "Vul uw emailadres in om door te gaan.",
          variant: "destructive",
        });
        setIsLoading(false);
        setIsSubmitting(false);
        return;
      }
      
      // Validate passwords match
      if (formData.password !== formData.confirmPassword) {
        clearTimeout(safetyTimeout);
        toast({
          title: "Wachtwoorden komen niet overeen",
          description: "Beide wachtwoordvelden moeten hetzelfde zijn.",
          variant: "destructive",
        });
        setIsLoading(false);
        setIsSubmitting(false);
        return;
      }
      
      // Validate password length
      if (formData.password.length < 8) {
        clearTimeout(safetyTimeout);
        toast({
          title: "Wachtwoord te kort",
          description: "Wachtwoord moet minimaal 8 tekens lang zijn.",
          variant: "destructive",
        });
        setIsLoading(false);
        setIsSubmitting(false);
        return;
      }
      // Verify we have a session before updating password
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !sessionData?.session) {
        console.error("No active session:", sessionError);
        toast({
          title: "Sessie verlopen",
          description: "Uw sessie is verlopen. Gebruik de invite link opnieuw.",
          variant: "destructive",
        });
        setIsLoading(false);
        setIsSubmitting(false);
        return;
      }

      // Update password for invited user
      const { data, error } = await supabase.auth.updateUser({
        password: formData.password,
      });

      if (error) {
        console.error("Error updating password:", error);
        toast({
          title: "Fout",
          description: error.message || "Kon wachtwoord niet instellen. Probeer het opnieuw.",
          variant: "destructive",
        });
        setIsLoading(false);
        setIsSubmitting(false);
        return;
      }

      // Verify the password was updated by checking the session
      if (!data?.user) {
        console.error("No user data after password update");
        toast({
          title: "Fout",
          description: "Wachtwoord update voltooid maar kon gebruikersgegevens niet verifiëren.",
          variant: "destructive",
        });
        setIsLoading(false);
        setIsSubmitting(false);
        return;
      }

      console.log("Password updated successfully for user:", data.user.id);

      // Get fresh session after password update
      const { data: freshSession, error: sessionCheckError } = await supabase.auth.getSession();
      
      if (sessionCheckError || !freshSession?.session) {
        console.error("Session check failed after password update:", sessionCheckError);
        toast({
          title: "Fout",
          description: "Kon sessie niet verifiëren na wachtwoord update.",
          variant: "destructive",
        });
        setIsLoading(false);
        setIsSubmitting(false);
        return;
      }

      // Clear hash from URL first
      window.history.replaceState(null, '', '/auth');
      
      toast({
        title: "Wachtwoord ingesteld",
        description: "Uw wachtwoord is succesvol ingesteld. Account wordt geactiveerd...",
        duration: 3000,
      });

      // Reset form data
      setFormData({ email: "", password: "", confirmPassword: "", name: "", organization: "" });
      
      // Reset setting password state
      setIsSettingPassword(false);

      // Wait for auth state to propagate and user data to load
      // The auth context's onAuthStateChange should trigger and load user data
      console.log("Password set successfully, waiting for auth state to update...");
      clearTimeout(safetyTimeout);
      
      // Reset states immediately so button is not disabled
      setIsLoading(false);
      setIsSubmitting(false);
      
      // Give auth context time to load user data, then redirect
      setTimeout(() => {
        console.log("Redirecting to dashboard...");
        router.push("/dashboard");
      }, 2000);
    } catch (error: any) {
      clearTimeout(safetyTimeout);
      console.error("Error setting password:", error);
      toast({
        title: "Er is een fout opgetreden",
        description: error.message || "Probeer het opnieuw of ververs de pagina.",
        variant: "destructive",
      });
      setIsLoading(false);
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double submission
    if (isSubmitting || isLoading) {
      return;
    }
    
    setIsSubmitting(true);
    setIsLoading(true);

    // Safety timeout - always reset loading after max 10 seconds
    const safetyTimeout = setTimeout(() => {
      setIsLoading(false);
    }, 10000);

    try {
      if (isSettingPassword) {
        // handleSetPassword manages its own timeout, but clear this one too
        await handleSetPassword().finally(() => {
          clearTimeout(safetyTimeout);
        });
        return;
      }

      if (isLogin) {
        // Login logica
        const success = await login(formData.email, formData.password);
        clearTimeout(safetyTimeout);
        
        if (!success) {
          toast({
            title: "Inloggen mislukt",
            description: "Ongeldige email of wachtwoord. Probeer het opnieuw.",
            variant: "destructive",
          });
          setIsLoading(false);
        } else {
          // Login successful - reset loading after short delay
          // Redirect will happen via useEffect when supabaseUser is set
          setTimeout(() => {
            setIsLoading(false);
          }, 500);
        }
      } else {
        // Registratie logica
        if (!formData.name || !formData.organization) {
          clearTimeout(safetyTimeout);
          toast({
            title: "Velden verplicht",
            description: "Vul alle velden in.",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }

        const success = await register(
          formData.email,
          formData.password,
          formData.name,
          formData.organization
        );
        
        clearTimeout(safetyTimeout);

        if (!success) {
          toast({
            title: "Registratie mislukt",
            description: "Er is iets misgegaan. Probeer het opnieuw.",
            variant: "destructive",
          });
          setIsLoading(false);
        } else {
          // Registration successful - reset loading after short delay
          // Redirect will happen via useEffect when supabaseUser is set
          setTimeout(() => {
            setIsLoading(false);
          }, 500);
        }
      }
    } catch (error) {
      clearTimeout(safetyTimeout);
      console.error("Auth error:", error);
      toast({
        title: "Er is een fout opgetreden",
        description: "Probeer het opnieuw of ververs de pagina.",
        variant: "destructive",
      });
      setIsLoading(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Back Link */}
          <a
            href={homeUrl}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Terug naar home
          </a>

          {/* Logo */}
          <div className="flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-[hsl(15_80%_55%)] flex items-center justify-center shadow-lg shadow-primary/30">
              <Bot className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="font-display text-xl font-bold text-foreground">
              Juko<span className="text-gradient">Bot</span>
            </span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground mb-2">
              {isSettingPassword 
                ? "Wachtwoord instellen" 
                : isLogin 
                ? "Welkom terug" 
                : "Account aanmaken"}
            </h1>
            <p className="text-muted-foreground">
              {isSettingPassword
                ? "Stel uw wachtwoord in om uw account te activeren"
                : isLogin
                ? "Log in om verder te gaan naar uw dashboard"
                : "Maak een account aan om te beginnen"}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSettingPassword && (
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="invite-email"
                    type="email"
                    value={formData.email || ""}
                    className="pl-10 bg-muted text-foreground"
                    placeholder="voorbeeld@email.nl"
                    onChange={(e) => {
                      // Always allow manual entry - email field is always editable
                      setFormData(prev => ({ ...prev, email: e.target.value }));
                    }}
                    autoComplete="email"
                  />
                </div>
                {!formData.email && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Email wordt geladen... Als deze niet verschijnt, vul deze dan handmatig in.
                  </p>
                )}
              </div>
            )}
            
            {!isLogin && !isSettingPassword && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">Volledige naam</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="Jan de Vries"
                      className="pl-10"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="organization">Organisatie</Label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="organization"
                      type="text"
                      placeholder="Uw bedrijfsnaam"
                      className="pl-10"
                      value={formData.organization}
                      onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                      required
                    />
                  </div>
                </div>
              </>
            )}

            {!isSettingPassword && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="u@voorbeeld.nl"
                    className="pl-10"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">
                {isSettingPassword ? "Nieuw wachtwoord" : "Wachtwoord"}
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-10"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={8}
                />
              </div>
            </div>

            {isSettingPassword && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Bevestig wachtwoord</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    className="pl-10"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    required
                    minLength={8}
                  />
                </div>
                {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
                  <p className="text-sm text-destructive">Wachtwoorden komen niet overeen</p>
                )}
              </div>
            )}

            <Button
              type="submit"
              variant="hero"
              size="lg"
              className="w-full touch-manipulation"
              disabled={isLoading || isSubmitting || (isSettingPassword && (!formData.password || !formData.confirmPassword || formData.password !== formData.confirmPassword))}
            >
              {isLoading 
                ? "Even geduld..." 
                : isSettingPassword 
                ? "Wachtwoord instellen" 
                : isLogin 
                ? "Inloggen" 
                : "Account Aanmaken"}
            </Button>
          </form>

          {/* Registration disabled - only show contact link */}
          {!isSettingPassword && (
            <p className="text-center text-muted-foreground mt-6">
              Geen account?{" "}
              <a
                href="mailto:info@jukotechniek.nl?subject=Account Aanvraag&body=Ik ben geïnteresseerd in een account."
                className="text-primary hover:underline font-medium"
              >
                Neem contact op
              </a>
            </p>
          )}

        </div>
      </div>

      {/* Right Panel - Visual */}
      <div className="hidden lg:flex flex-1 items-center justify-center relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-background" />
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-primary/30 rounded-full blur-[128px]" />
        
        {/* Content */}
        <div className="relative z-10 max-w-lg p-12">
          <blockquote className="text-2xl font-display font-medium text-foreground mb-6">
            "Juko bot heeft onze responstijd gehalveerd. Onze monteurs vinden nu direct het antwoord dat ze nodig hebben."
          </blockquote>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="font-display font-bold text-primary">PV</span>
            </div>
            <div>
              <p className="font-semibold text-foreground">Peter Vermeer</p>
              <p className="text-sm text-muted-foreground">Technisch Manager, VDL Technics</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Laden...</p>
        </div>
      </div>
    }>
      <AuthPageContent />
    </Suspense>
  );
}




