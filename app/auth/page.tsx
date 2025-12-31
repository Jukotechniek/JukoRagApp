'use client';

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bot, ArrowLeft, Mail, Lock, User, Building } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const [isLogin, setIsLogin] = useState(searchParams.get("mode") !== "register");
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    organization: "",
  });

  useEffect(() => {
    setIsLogin(searchParams.get("mode") !== "register");
  }, [searchParams]);

  const { login, register, user, isAuthenticated, loading, supabaseUser } = useAuth();

  // Redirect when authenticated - redirect as soon as we have supabaseUser (auth successful)
  // Don't wait for full user data load to prevent hanging
  useEffect(() => {
    if (supabaseUser && !isLoading) {
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
  }, [supabaseUser, isLoading, router, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Safety timeout - always reset loading after max 10 seconds
    const safetyTimeout = setTimeout(() => {
      setIsLoading(false);
    }, 10000);

    try {
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
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Back Link */}
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Terug naar home
          </Link>

          {/* Logo */}
          <div className="flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-[hsl(15_80%_55%)] flex items-center justify-center shadow-lg shadow-primary/30">
              <Bot className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="font-display text-xl font-bold text-foreground">
              Tech<span className="text-gradient">RAG</span>
            </span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground mb-2">
              {isLogin ? "Welkom terug" : "Start uw trial"}
            </h1>
            <p className="text-muted-foreground">
              {isLogin
                ? "Log in om verder te gaan naar uw dashboard"
                : "Maak een gratis account aan en probeer TechRAG 14 dagen"}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
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

            <div className="space-y-2">
              <Label htmlFor="password">Wachtwoord</Label>
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

            <Button
              type="submit"
              variant="hero"
              size="lg"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? "Even geduld..." : isLogin ? "Inloggen" : "Account Aanmaken"}
            </Button>
          </form>

          {/* Toggle */}
          <p className="text-center text-muted-foreground mt-6">
            {isLogin ? "Nog geen account? " : "Al een account? "}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline font-medium"
            >
              {isLogin ? "Registreer hier" : "Log hier in"}
            </button>
          </p>

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
            "TechRAG heeft onze responstijd gehalveerd. Onze monteurs vinden nu direct het antwoord dat ze nodig hebben."
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








