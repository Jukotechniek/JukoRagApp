"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowRight, MessageSquare, FileText, Zap, ExternalLink, FileText as FileTextIcon } from "lucide-react";

export const Hero = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20 pb-32">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Gradient orbs */}
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary/10 dark:bg-primary/20 rounded-full blur-[128px] animate-pulse-glow" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-primary/8 dark:bg-primary/15 rounded-full blur-[128px] animate-pulse-glow" style={{ animationDelay: "1.5s" }} />
        
        {/* Grid pattern - extends just below chatbot card */}
        <div 
          className="absolute top-0 left-0 right-0 h-[95%] opacity-[0.08] dark:opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm text-muted-foreground">AI-Powered Technische Documentatie</span>
          </div>

          {/* Heading */}
          <h1 className="font-display text-4xl md:text-6xl lg:text-7xl font-bold mb-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
            Slimme{" "}
            <span className="text-gradient glow-text">AI Assistent</span>
            <br />
            voor Uw Technici
          </h1>

          {/* Subheading */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-slide-up" style={{ animationDelay: "0.2s" }}>
            Upload uw technische documenten en laat onze AI uw monteurs helpen met
            directe antwoorden op complexe vragen. Bespaar tijd, verminder fouten.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-slide-up" style={{ animationDelay: "0.3s" }}>
            <a 
              href="mailto:info@jukotechniek.nl?subject=Contact Aanvraag&body=Ik ben geïnteresseerd in JukoBot."
              className="group"
            >
              <Button variant="hero" size="xl" className="group">
                Neem Contact Op
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </a>
            <a href="#how-it-works">
              <Button variant="hero-outline" size="xl">
                Bekijk Demo
              </Button>
            </a>
          </div>

          {/* Feature Pills */}
          <div className="flex flex-wrap items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: "0.4s" }}>
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white dark:bg-card/60 backdrop-blur-xl border border-border/60 dark:border-border/50 shadow-md">
              <MessageSquare className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Natuurlijke Vragen</span>
            </div>
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white dark:bg-card/60 backdrop-blur-xl border border-border/60 dark:border-border/50 shadow-md">
              <FileText className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Document Upload</span>
            </div>
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white dark:bg-card/60 backdrop-blur-xl border border-border/60 dark:border-border/50 shadow-md">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Snelle Antwoorden</span>
            </div>
          </div>
        </div>

        {/* Hero Visual */}
        <div className="mt-16 max-w-5xl mx-auto animate-slide-up" style={{ animationDelay: "0.5s" }}>
          <div className="relative">
            {/* Glow effect */}
            <div className="absolute -inset-4 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 dark:from-primary/20 dark:via-primary/10 dark:to-primary/20 rounded-3xl blur-xl" />
            
            {/* Chat Preview Card */}
            <div className="relative glass rounded-2xl p-8 md:p-10 shadow-lg dark:shadow-2xl">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border/50">
                <div className="w-3 h-3 rounded-full bg-destructive" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="ml-4 text-sm text-muted-foreground">Juko bot Assistant</span>
              </div>

              {/* Chat Messages */}
              <div className="space-y-6">
                <div className="flex justify-end">
                  <div className="bg-primary/15 dark:bg-primary/20 rounded-2xl rounded-br-md px-5 py-4 max-w-md border border-primary/10 dark:border-transparent">
                    <p className="text-sm leading-relaxed text-foreground/90">Wat is de maximale druk voor de hydraulische cilinder type HCX-200?</p>
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-secondary/80 dark:bg-secondary rounded-2xl rounded-bl-md px-5 py-4 max-w-md border border-border/50 dark:border-transparent">
                    <p className="text-sm leading-relaxed text-secondary-foreground">
                      Volgens de{" "}
                      <a 
                        href="#" 
                        className="inline-flex items-center gap-1 text-primary font-medium hover:underline underline-offset-2 cursor-pointer transition-colors hover:text-primary/80"
                        onClick={(e) => {
                          e.preventDefault();
                          setIsDialogOpen(true);
                        }}
                      >
                        HCX-200 specificaties (pagina 23)
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      , is de maximale werkdruk 250 bar. 
                      Let op: bij temperaturen boven 60°C moet u de druk verlagen naar 200 bar.
                    </p>
                  </div>
                </div>
              </div>

              {/* Input Field */}
              <div className="mt-6 flex items-center gap-3">
                <div className="flex-1 bg-secondary/60 dark:bg-secondary/50 rounded-xl px-4 py-3 text-sm text-muted-foreground border border-border/30 dark:border-transparent">
                  Stel een vraag over uw documentatie...
                </div>
                <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/40 dark:bg-primary/60 flex items-center justify-center opacity-60 cursor-not-allowed">
                  <ArrowRight className="w-4 h-4 text-primary-foreground" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Source Reference Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              HCX-200 Specificaties
            </DialogTitle>
            <DialogDescription>
              Pagina 23 - Maximale werkdruk specificaties
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div className="bg-secondary/50 rounded-lg p-4 border border-border/50">
              <h4 className="font-semibold text-foreground mb-2">Maximale Werkdruk</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Volgens de specificaties op pagina 23 van het HCX-200 document:
              </p>
              <ul className="space-y-2 text-sm text-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span><strong>Standaard:</strong> 250 bar bij temperaturen tot 60°C</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span><strong>Bij hoge temperatuur:</strong> 200 bar bij temperaturen boven 60°C</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span><strong>Let op:</strong> Overschrijd deze waarden niet om schade te voorkomen</span>
                </li>
              </ul>
            </div>
            <div className="text-xs text-muted-foreground bg-primary/5 rounded-lg p-3 border border-primary/10">
              <p className="font-medium text-foreground mb-1">💡 Voorbeeld functionaliteit</p>
              <p>
                In de echte applicatie zou u hier direct naar pagina 23 van het document kunnen navigeren 
                of het document kunnen openen op de exacte locatie waar deze informatie staat.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
};
