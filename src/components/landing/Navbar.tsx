"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Menu, X, Bot } from "lucide-react";
import { getAuthUrl } from "@/lib/url-utils";

export const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [authUrl, setAuthUrl] = useState("/auth");

  useEffect(() => {
    // Set auth URL on client side
    setAuthUrl(getAuthUrl());
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/30">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-[hsl(15_80%_55%)] flex items-center justify-center shadow-lg shadow-primary/30 group-hover:shadow-xl group-hover:shadow-primary/40 transition-all duration-300">
              <Bot className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="font-display text-xl font-bold text-foreground">
              Juko<span className="text-gradient">bot</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">
              Prijzen
            </a>
            <a href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">
              Hoe het werkt
            </a>
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-4">
            {authUrl.startsWith('http') ? (
              <Button 
                variant="ghost" 
                onClick={(e) => {
                  e.preventDefault();
                  window.location.href = authUrl;
                }}
              >
                Inloggen
              </Button>
            ) : (
              <Button variant="ghost" asChild>
                <Link href={authUrl}>
                  Inloggen
                </Link>
              </Button>
            )}
            <a href="mailto:info@jukotechniek.nl?subject=Contact Aanvraag&body=Ik ben geïnteresseerd in JukoBot.">
              <Button variant="hero">Contact</Button>
            </a>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 text-foreground"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="md:hidden py-4 border-t border-border/30 animate-fade-in">
            <div className="flex flex-col gap-4">
              <a
                href="#features"
                className="text-muted-foreground hover:text-foreground transition-colors py-2"
                onClick={() => setIsOpen(false)}
              >
                Features
              </a>
              <a
                href="#pricing"
                className="text-muted-foreground hover:text-foreground transition-colors py-2"
                onClick={() => setIsOpen(false)}
              >
                Prijzen
              </a>
              <a
                href="#how-it-works"
                className="text-muted-foreground hover:text-foreground transition-colors py-2"
                onClick={() => setIsOpen(false)}
              >
                Hoe het werkt
              </a>
              <div className="flex flex-col gap-2 pt-4 border-t border-border/30">
                {authUrl.startsWith('http') ? (
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start"
                    onClick={(e) => {
                      e.preventDefault();
                      setIsOpen(false);
                      window.location.href = authUrl;
                    }}
                  >
                    Inloggen
                  </Button>
                ) : (
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start"
                    asChild
                  >
                    <Link href={authUrl} onClick={() => setIsOpen(false)}>
                      Inloggen
                    </Link>
                  </Button>
                )}
                <a 
                  href="mailto:info@jukotechniek.nl?subject=Contact Aanvraag&body=Ik ben geïnteresseerd in JukoBot."
                  onClick={() => setIsOpen(false)}
                >
                  <Button variant="hero" className="w-full">
                    Contact
                  </Button>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};
