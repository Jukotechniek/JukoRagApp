import { useState, useEffect, useMemo } from "react";
import { BarChart, TrendingUp, MessageSquare, FileText, Users, Clock, Calendar, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { subWeeks, subMonths, format } from "date-fns";
import { nl } from "date-fns/locale";

interface AnalyticsViewProps {
  currentRole: "admin" | "manager" | "technician";
  selectedOrganizationId?: string | null;
}

const AnalyticsView = ({ currentRole, selectedOrganizationId }: AnalyticsViewProps) => {
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState("week");
  const [stats, setStats] = useState({
    questionsAsked: 0,
    documentsUploaded: 0,
    activeUsers: 0,
    avgResponseTime: "0s",
  });
  const [weeklyData, setWeeklyData] = useState<{ day: string; questions: number }[]>([]);
  const [topQuestions, setTopQuestions] = useState<{ question: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Use selected organization ID or fall back to user's organization
  const effectiveOrgId = selectedOrganizationId || user?.organization_id || null;

  // Load analytics data
  useEffect(() => {
    if (user) {
      loadAnalytics();
    }
  }, [user, timeRange, effectiveOrgId]);

  const loadAnalytics = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const now = new Date();
      let startDate: Date;

      switch (timeRange) {
        case "week":
          startDate = subWeeks(now, 1);
          break;
        case "month":
          startDate = subMonths(now, 1);
          break;
        case "year":
          startDate = subMonths(now, 12);
          break;
        default:
          startDate = subWeeks(now, 1);
      }

      // Build query based on role and selected organization
      let analyticsQuery = supabase
        .from("analytics")
        .select("*")
        .gte("created_at", startDate.toISOString());

      if (effectiveOrgId) {
        analyticsQuery = analyticsQuery.eq("organization_id", effectiveOrgId);
      }

      const { data: analyticsData, error: analyticsError } = await analyticsQuery;

      if (analyticsError) throw analyticsError;

      // Count questions asked
      const questionsCount = analyticsData?.filter((a) => a.event_type === "question_asked").length || 0;

      // Count documents uploaded
      const documentsCount = analyticsData?.filter((a) => a.event_type === "document_uploaded").length || 0;

      // Count active users
      let usersQuery = supabase.from("users").select("id", { count: "exact", head: true });
      if (effectiveOrgId) {
        const { data: orgUsers } = await supabase
          .from("user_organizations")
          .select("user_id")
          .eq("organization_id", effectiveOrgId);
        if (orgUsers) {
          usersQuery = supabase
            .from("users")
            .select("id", { count: "exact", head: true })
            .in("id", orgUsers.map((u) => u.user_id));
        }
      }
      const { count: usersCount } = await usersQuery;

      // Calculate average response time from analytics
      const responseTimeEvents = analyticsData?.filter((a) => a.event_type === "response_time") || [];
      let avgResponseTime = "0s";
      if (responseTimeEvents.length > 0) {
        const totalTime = responseTimeEvents.reduce((sum, event) => {
          const eventData = event.event_data as Record<string, unknown> | null;
          return sum + (Number(eventData?.response_time_ms) || 0);
        }, 0);
        const avgMs = totalTime / responseTimeEvents.length;
        avgResponseTime = avgMs < 1000 ? `${avgMs.toFixed(0)}ms` : `${(avgMs / 1000).toFixed(1)}s`;
      }

      setStats({
        questionsAsked: questionsCount,
        documentsUploaded: documentsCount,
        activeUsers: usersCount || 0,
        avgResponseTime,
      });

      // Generate weekly/monthly data
      generateTimeSeriesData(analyticsData || [], startDate);
    } catch (error) {
      console.error("Error loading analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateTimeSeriesData = (data: any[], startDate: Date) => {
    const questionsByDate: Record<string, number> = {};

    data
      .filter((a) => a.event_type === "question_asked")
      .forEach((item) => {
        const date = format(new Date(item.created_at), timeRange === "year" ? "MMM" : timeRange === "month" ? "w" : "EEE", { locale: nl });
        questionsByDate[date] = (questionsByDate[date] || 0) + 1;
      });

    if (timeRange === "week") {
      const days = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
      setWeeklyData(
        days.map((day) => ({
          day,
          questions: questionsByDate[day] || 0,
        }))
      );
    } else if (timeRange === "month") {
      setWeeklyData([
        { day: "Week 1", questions: questionsByDate["1"] || 0 },
        { day: "Week 2", questions: questionsByDate["2"] || 0 },
        { day: "Week 3", questions: questionsByDate["3"] || 0 },
        { day: "Week 4", questions: questionsByDate["4"] || 0 },
      ]);
    } else {
      const months = ["Jan", "Feb", "Mrt", "Apr", "Mei", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
      setWeeklyData(
        months.slice(0, 6).map((month) => ({
          day: month,
          questions: questionsByDate[month] || 0,
        }))
      );
    }

    // Top questions - haal uit analytics data
    const questionEvents = data.filter((a) => a.event_type === "question_asked");
    const questionCounts: Record<string, number> = {};
    
    questionEvents.forEach((event) => {
      const questionText = event.event_data?.question_text || event.event_data?.content || "Onbekende vraag";
      if (questionText && questionText !== "Onbekende vraag") {
        questionCounts[questionText] = (questionCounts[questionText] || 0) + 1;
      }
    });

    const topQuestionsArray = Object.entries(questionCounts)
      .map(([question, count]) => ({ question, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    setTopQuestions(topQuestionsArray.length > 0 ? topQuestionsArray : []);
  };

  const maxQuestions = useMemo(() => {
    return Math.max(...weeklyData.map((d) => d.questions), 1);
  }, [weeklyData]);

  const handleExport = () => {
    toast({
      title: "Rapport exporteren",
      description: "Het analytics rapport wordt voorbereid...",
    });
    // In productie zou hier een echte export functionaliteit komen
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground">
            {currentRole === "admin"
              ? "Inzicht in gebruik over alle organisaties"
              : "Inzicht in gebruik binnen jouw organisatie"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[140px]">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Deze week</SelectItem>
              <SelectItem value="month">Deze maand</SelectItem>
              <SelectItem value="year">Dit jaar</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Exporteren
          </Button>
        </div>
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
        {/* Activity Chart */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-6">
            <BarChart className="w-5 h-5 text-primary" />
            <h2 className="font-display font-semibold text-foreground">
              {timeRange === "week" ? "Wekelijkse" : timeRange === "month" ? "Maandelijkse" : "Jaarlijkse"} Activiteit
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
            {topQuestions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">Nog geen vragen gesteld</p>
              </div>
            ) : (
              topQuestions.map((item, index) => (
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
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsView;
