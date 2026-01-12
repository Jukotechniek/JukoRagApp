import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const plans = [
  {
    name: "Starter",
    price: "€19",
    period: "/gebruiker/maand",
    description: "Perfect voor kleine teams en individuele gebruikers",
    features: [
      "Per gebruiker",
      "10 documenten per gebruiker",
      "100 vragen/maand per gebruiker",
      "Email support",
      "Basis analytics",
    ],
    popular: false,
  },
  {
    name: "Professional",
    price: "€49",
    period: "/gebruiker/maand",
    description: "Voor groeiende bedrijven die meer nodig hebben",
    features: [
      "Per gebruiker",
      "50 documenten per gebruiker",
      "Onbeperkt vragen",
      "Prioriteit support",
      "Geavanceerde analytics",
    ],
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Prijs op aanvraag",
    period: "",
    description: "Voor grote organisaties met maatwerk",
    features: [
      "Onbeperkt gebruikers",
      "Onbeperkt documenten",
      "Onbeperkt vragen",
      "Dedicated support",
      "Lokaal draaiend AI-model mogelijk (on-premise of private cloud)",
      "Custom integraties",
      "Training & onboarding",
    ],
    popular: false,
  },
];

export const Pricing = () => {
  return (
    <section id="pricing" className="py-24 relative">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            Transparante{" "}
            <span className="text-gradient">prijzen</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Kies het plan dat past bij uw organisatie. Altijd zonder verborgen kosten.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto items-start">
          {plans.map((plan, index) => (
            <div
              key={plan.name}
              className={`relative bg-white dark:bg-card/60 backdrop-blur-xl rounded-2xl p-8 animate-slide-up border shadow-md flex flex-col ${
                plan.popular 
                  ? "border-primary/60 dark:border-primary/50 shadow-xl shadow-primary/30 dark:shadow-primary/10" 
                  : "border-border/60 dark:border-border/50"
              }`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-primary to-[hsl(15_80%_55%)] text-primary-foreground text-sm font-medium px-4 py-1 rounded-full">
                    Meest Gekozen
                  </span>
                </div>
              )}

              <div className="flex-grow flex flex-col">
                <div className="mb-6">
                  <h3 className="font-display text-xl font-semibold text-foreground mb-2">
                    {plan.name}
                  </h3>
                  <p className="text-muted-foreground text-sm">{plan.description}</p>
                </div>

                <div className="mb-6">
                  <span className={`font-display font-bold text-foreground ${plan.name === "Enterprise" ? "text-2xl" : "text-4xl"}`}>
                    {plan.price}
                  </span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>

                <ul className="space-y-3 flex-grow">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <a 
                href="mailto:info@jukotechniek.nl?subject=Abonnement Aanvraag&body=Ik ben geïnteresseerd in het ${plan.name} plan."
                className="block mt-8"
              >
                <Button
                  variant={plan.popular ? "hero" : "outline"}
                  className="w-full"
                >
                  Contact Opnemen
                </Button>
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
