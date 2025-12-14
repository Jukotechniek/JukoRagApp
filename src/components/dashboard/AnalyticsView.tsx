import { BarChart, TrendingUp, MessageSquare, FileText, Users, Clock } from "lucide-react";

interface AnalyticsViewProps {
  currentRole: "admin" | "manager" | "technician";
}

const AnalyticsView = ({ currentRole }: AnalyticsViewProps) => {
  // Mock analytics data
  const stats = {
    questionsAsked: currentRole === "admin" ? 1248 : 156,
    documentsUploaded: currentRole === "admin" ? 342 : 34,
    activeUsers: currentRole === "admin" ? 89 : 12,
    avgResponseTime: "1.2s",
  };

  const weeklyData = [
    { day: "Ma", questions: 45 },
    { day: "Di", questions: 62 },
    { day: "Wo", questions: 38 },
    { day: "Do", questions: 71 },
    { day: "Vr", questions: 55 },
    { day: "Za", questions: 12 },
    { day: "Zo", questions: 8 },
  ];

  const maxQuestions = Math.max(...weeklyData.map((d) => d.questions));

  const topQuestions = [
    { question: "Hoe installeer ik de pompaansluiting?", count: 23 },
    { question: "Waar vind ik de specificaties voor model X?", count: 18 },
    { question: "Wat is het onderhoudschema voor...", count: 15 },
    { question: "Hoe reset ik de foutmelding?", count: 12 },
    { question: "Welke kabels zijn compatibel met...", count: 9 },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground">
          {currentRole === "admin"
            ? "Inzicht in gebruik over alle organisaties"
            : "Inzicht in gebruik binnen jouw organisatie"}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </div>
          <p className="text-2xl font-display font-bold text-foreground">
            {stats.questionsAsked}
          </p>
          <p className="text-sm text-muted-foreground">Vragen gesteld</p>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-accent" />
            </div>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </div>
          <p className="text-2xl font-display font-bold text-foreground">
            {stats.documentsUploaded}
          </p>
          <p className="text-sm text-muted-foreground">Documenten</p>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
              <Users className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>
          <p className="text-2xl font-display font-bold text-foreground">
            {stats.activeUsers}
          </p>
          <p className="text-sm text-muted-foreground">Actieve gebruikers</p>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-green-500" />
            </div>
          </div>
          <p className="text-2xl font-display font-bold text-foreground">
            {stats.avgResponseTime}
          </p>
          <p className="text-sm text-muted-foreground">Gem. responstijd</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Weekly Activity Chart */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-6">
            <BarChart className="w-5 h-5 text-primary" />
            <h2 className="font-display font-semibold text-foreground">
              Wekelijkse Activiteit
            </h2>
          </div>

          <div className="flex items-end justify-between gap-2 h-48">
            {weeklyData.map((data) => (
              <div key={data.day} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex flex-col justify-end h-40">
                  <div
                    className="w-full bg-gradient-to-t from-primary to-primary/60 rounded-t-lg transition-all hover:from-primary hover:to-primary/80"
                    style={{
                      height: `${(data.questions / maxQuestions) * 100}%`,
                      minHeight: "8px",
                    }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{data.day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Questions */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-6">
            <MessageSquare className="w-5 h-5 text-primary" />
            <h2 className="font-display font-semibold text-foreground">
              Populaire Vragen
            </h2>
          </div>

          <div className="space-y-4">
            {topQuestions.map((item, index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{item.question}</p>
                </div>
                <span className="text-sm font-medium text-muted-foreground">
                  {item.count}x
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsView;
