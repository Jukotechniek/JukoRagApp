import { Upload, MessageSquare, Users, Shield, Zap, BarChart } from "lucide-react";

const features = [
  {
    icon: Upload,
    title: "Document Upload",
    description: "Upload handleidingen, schema's en technische documenten. Wij verwerken PDF's, Word-bestanden en meer.",
  },
  {
    icon: MessageSquare,
    title: "Natuurlijke Vragen",
    description: "Stel vragen in gewone taal. Onze AI begrijpt context en geeft precieze antwoorden met bronverwijzing.",
  },
  {
    icon: Users,
    title: "Team Management",
    description: "Beheer uw organisatie met verschillende rollen: admins, managers en monteurs met eigen rechten.",
  },
  {
    icon: Shield,
    title: "Veilige Data",
    description: "Uw documenten blijven privé. Enterprise-grade beveiliging met encryptie en toegangscontrole.",
  },
  {
    icon: Zap,
    title: "Snelle Antwoorden",
    description: "Krijg binnen seconden antwoord op complexe technische vragen. Geen eindeloos zoeken meer.",
  },
  {
    icon: BarChart,
    title: "Inzichten",
    description: "Bekijk welke vragen het meest gesteld worden en optimaliseer uw documentatie.",
  },
];

export const Features = () => {
  return (
    <section id="features" className="py-24 relative">
      {/* Background Effect */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[128px]" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            Alles wat u nodig heeft voor{" "}
            <span className="text-gradient">technische ondersteuning</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Een complete oplossing voor het beheren en doorzoeken van uw technische documentatie.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group glass glass-hover rounded-2xl p-6 animate-slide-up"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-display text-xl font-semibold mb-2 text-foreground">
                {feature.title}
              </h3>
              <p className="text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
