import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const plans = [
  {
    name: "Starter",
    price: "€49",
    period: "/maand",
    description: "Perfect voor kleine teams",
    features: [
      "Tot 5 gebruikers",
      "100 documenten",
      "500 vragen/maand",
      "Email support",
      "Basis analytics",
    ],
    popular: false,
  },
  {
    name: "Professional",
    price: "€149",
    period: "/maand",
    description: "Voor groeiende bedrijven",
    features: [
      "Tot 25 gebruikers",
      "Onbeperkt documenten",
      "Onbeperkt vragen",
      "Prioriteit support",
      "Geavanceerde analytics",
      "API toegang",
      "Custom branding",
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
      "SLA garantie",
      "Lokaal draaiend AI-model mogelijk (on-premise of private cloud)",
      "Volledig maatwerk ingericht op uw processen",
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
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={plan.name}
              className={`relative glass rounded-2xl p-8 animate-slide-up ${
                plan.popular ? "border-primary/50 shadow-lg shadow-primary/10" : ""
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

              <div className="mb-6">
                <h3 className="font-display text-xl font-semibold text-foreground mb-2">
                  {plan.name}
                </h3>
                <p className="text-muted-foreground text-sm">{plan.description}</p>
              </div>

              <div className="mb-6">
                <span className="font-display text-4xl font-bold text-foreground">
                  {plan.price}
                </span>
                <span className="text-muted-foreground">{plan.period}</span>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link href="/auth?mode=register" className="block">
                <Button
                  variant={plan.popular ? "hero" : "outline"}
                  className="w-full"
                >
                  {plan.name === "Enterprise" ? "Contact Opnemen" : "Start Nu"}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
