import { Upload, Settings, MessageSquare, Sparkles } from "lucide-react";

const steps = [
  {
    icon: Upload,
    step: "01",
    title: "Upload Documenten",
    description: "Upload uw technische handleidingen, schema's en documentatie naar het platform.",
  },
  {
    icon: Settings,
    step: "02",
    title: "AI Verwerking",
    description: "Onze AI analyseert en indexeert uw documenten voor snelle, accurate antwoorden.",
  },
  {
    icon: MessageSquare,
    step: "03",
    title: "Stel Vragen",
    description: "Uw monteurs kunnen direct vragen stellen en krijgen antwoorden met bronverwijzing.",
  },
  {
    icon: Sparkles,
    step: "04",
    title: "Continu Leren",
    description: "Het systeem leert van feedback en wordt steeds beter in het beantwoorden van vragen.",
  },
];

export const HowItWorks = () => {
  return (
    <section id="how-it-works" className="py-24 relative">
      {/* Background Effect */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute bottom-0 left-1/4 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[128px]" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            Zo werkt{" "}
            <span className="text-gradient">TechRAG</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            In vier eenvoudige stappen naar slimme technische ondersteuning.
          </p>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <div
              key={step.step}
              className="relative animate-slide-up"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-12 left-[60%] w-full h-px bg-gradient-to-r from-primary/50 to-transparent" />
              )}

              <div className="text-center">
                {/* Step Number & Icon */}
                <div className="relative inline-flex mb-6">
                  <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <step.icon className="w-10 h-10 text-primary" />
                  </div>
                  <span className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                    {step.step}
                  </span>
                </div>

                <h3 className="font-display text-xl font-semibold mb-2 text-foreground">
                  {step.title}
                </h3>
                <p className="text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
