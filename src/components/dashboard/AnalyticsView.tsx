import { useState, useEffect, useMemo } from "react";
import { BarChart, TrendingUp, MessageSquare, FileText, Users, Clock, Calendar, Download, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { subWeeks, subMonths, format, startOfWeek, startOfMonth } from "date-fns";
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
    documentsProcessed: 0,
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

      // Count total documents uploaded from documents table
      let documentsQuery = supabase
        .from("documents")
        .select("id", { count: "exact", head: true });
      
      if (effectiveOrgId) {
        documentsQuery = documentsQuery.eq("organization_id", effectiveOrgId);
      }
      
      const { count: totalDocumentsCount } = await documentsQuery;

      // Count processed documents (documents that have document_sections)
      let processedDocumentsCount = 0;
      
      if (effectiveOrgId) {
        // Get all document IDs for this organization first
        const { data: orgDocuments } = await supabase
          .from("documents")
          .select("id")
          .eq("organization_id", effectiveOrgId);
        
        if (orgDocuments && orgDocuments.length > 0) {
          const documentIds = orgDocuments.map((d) => d.id);
          // Get unique document IDs that have sections
          const { data: sectionsData } = await supabase
            .from("document_sections")
            .select("document_id")
            .in("document_id", documentIds);
          
          if (sectionsData && sectionsData.length > 0) {
            // Count unique document_ids
            const uniqueDocIds = new Set(sectionsData.map((s: any) => s.document_id));
            processedDocumentsCount = uniqueDocIds.size;
          }
        }
      } else {
        // For admin viewing all organizations, get all document sections
        const { data: allSections } = await supabase
          .from("document_sections")
          .select("document_id");
        
        if (allSections && allSections.length > 0) {
          const uniqueDocIds = new Set(allSections.map((s: any) => s.document_id));
          processedDocumentsCount = uniqueDocIds.size;
        }
      }

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
        documentsUploaded: totalDocumentsCount || 0,
        documentsProcessed: processedDocumentsCount,
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
    const now = new Date();
    const questionsByDate: Record<string, number> = {};

    if (timeRange === "week") {
      // Initialize all days of the week with 0
      const days = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
      days.forEach((day) => {
        questionsByDate[day] = 0;
      });

      // Count questions by day of week
      data
        .filter((a) => a.event_type === "question_asked")
        .forEach((item) => {
          const itemDate = new Date(item.created_at);
          // Only count if within the time range
          if (itemDate >= startDate && itemDate <= now) {
            const dayKey = format(itemDate, "EEE", { locale: nl });
            if (questionsByDate.hasOwnProperty(dayKey)) {
              questionsByDate[dayKey] = (questionsByDate[dayKey] || 0) + 1;
            }
          }
        });

      setWeeklyData(
        days.map((day) => ({
          day,
          questions: questionsByDate[day] || 0,
        }))
      );
    } else if (timeRange === "month") {
      // Initialize weeks (typically 4-5 weeks in a month)
      for (let i = 1; i <= 5; i++) {
        questionsByDate[`Week ${i}`] = 0;
      }

      // Count questions by week of month
      data
        .filter((a) => a.event_type === "question_asked")
        .forEach((item) => {
          const itemDate = new Date(item.created_at);
          if (itemDate >= startDate && itemDate <= now) {
            const monthStart = startOfMonth(itemDate);
            const weekStart = startOfWeek(itemDate, { weekStartsOn: 1 });
            const daysDiff = Math.floor((weekStart.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24));
            const weekIndex = Math.floor(daysDiff / 7) + 1;
            const weekKey = `Week ${Math.min(weekIndex, 5)}`;
            questionsByDate[weekKey] = (questionsByDate[weekKey] || 0) + 1;
          }
        });

      setWeeklyData(
        Array.from({ length: 5 }, (_, i) => ({
          day: `Week ${i + 1}`,
          questions: questionsByDate[`Week ${i + 1}`] || 0,
        }))
      );
    } else {
      // Year view - show last 12 months
      const months = ["Jan", "Feb", "Mrt", "Apr", "Mei", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
      months.forEach((month) => {
        questionsByDate[month] = 0;
      });

      // Count questions by month
      data
        .filter((a) => a.event_type === "question_asked")
        .forEach((item) => {
          const itemDate = new Date(item.created_at);
          if (itemDate >= startDate && itemDate <= now) {
            const monthKey = format(itemDate, "MMM", { locale: nl });
            if (questionsByDate.hasOwnProperty(monthKey)) {
              questionsByDate[monthKey] = (questionsByDate[monthKey] || 0) + 1;
            }
          }
        });

      setWeeklyData(
        months.map((month) => ({
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-8">
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
          <p className="text-sm text-muted-foreground">Geüploade documenten</p>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-blue-500" />
            </div>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </div>
          <p className="text-2xl font-display font-bold text-foreground">
            {stats.documentsProcessed}
          </p>
          <p className="text-sm text-muted-foreground">Verwerkte documenten</p>
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

          <TooltipProvider>
            <div className="flex items-end justify-between gap-2 h-48">
              {weeklyData.map((data) => (
                <div key={data.day} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full flex flex-col justify-end h-40">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className="w-full bg-gradient-to-t from-primary to-primary/60 rounded-t-lg transition-all hover:from-primary hover:to-primary/80 cursor-pointer"
                          style={{
                            height: `${(data.questions / maxQuestions) * 100}%`,
                            minHeight: "8px",
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">{data.day}</p>
                        <p className="text-sm">{data.questions} {data.questions === 1 ? 'vraag' : 'vragen'}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <span className="text-xs text-muted-foreground">{data.day}</span>
                </div>
              ))}
            </div>
          </TooltipProvider>
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
