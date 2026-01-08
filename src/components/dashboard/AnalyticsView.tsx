import { useState, useEffect, useMemo } from "react";
import { BarChart, TrendingUp, MessageSquare, FileText, Users, Clock, Calendar, CheckCircle } from "lucide-react";
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
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { startOfWeek, startOfMonth } from "date-fns";

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
      const now = new Date();
      let startDate: Date;

      switch (timeRange) {
        case "week":
          // Start from beginning of current week (Monday at 00:00:00 local time)
          startDate = startOfWeek(now, { weekStartsOn: 1 });
          // Ensure we start at the beginning of Monday (00:00:00)
          startDate.setHours(0, 0, 0, 0);
          break;
        case "month":
          // Start from beginning of current month
          startDate = startOfMonth(now);
          startDate.setHours(0, 0, 0, 0);
          break;
        case "year":
          // Start from beginning of current year
          const yearStart = new Date(now.getFullYear(), 0, 1);
          yearStart.setHours(0, 0, 0, 0);
          startDate = yearStart;
          break;
        default:
          startDate = startOfWeek(now, { weekStartsOn: 1 });
          startDate.setHours(0, 0, 0, 0);
      }

      // Build query based on role and selected organization
      // Use gte to include all data from startDate onwards (including today)
      let analyticsQuery = supabase
        .from("analytics")
        .select("*")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", now.toISOString()); // Also ensure we don't get future data

      // For admins, if a specific organization is selected, filter by it
      // Otherwise, admins see all analytics
      if (effectiveOrgId) {
        analyticsQuery = analyticsQuery.eq("organization_id", effectiveOrgId);
      }

      const { data: analyticsData, error: analyticsError } = await analyticsQuery;

      if (analyticsError) {
        console.error("Error loading analytics data:", analyticsError);
        throw analyticsError;
      }

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
      generateTimeSeriesData(analyticsData || []);
    } catch (error) {
      console.error("Error loading analytics:", error);
    }
  };

  const generateTimeSeriesData = (data: any[]) => {
    const questionsByDate: Record<string, number> = {};

    if (timeRange === "week") {
      // Initialize all days of the week with 0
      const dayAbbreviations = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
      
      // Initialize with abbreviations
      dayAbbreviations.forEach((day) => {
        questionsByDate[day] = 0;
      });

      // Count questions by day of week
      // Note: data is already filtered by date in the query, so we don't need to filter again
      const questionEvents = data.filter((a) => a.event_type === "question_asked");
      
      questionEvents.forEach((item) => {
        const itemDate = new Date(item.created_at);
        
        // Get day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
        const dayOfWeek = itemDate.getDay();
        // Convert to Monday = 0, Tuesday = 1, ..., Sunday = 6
        const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        
        if (dayIndex >= 0 && dayIndex < dayAbbreviations.length) {
          const dayKey = dayAbbreviations[dayIndex];
          questionsByDate[dayKey] = (questionsByDate[dayKey] || 0) + 1;
        }
      });

      // Always set data, even if empty - ensures chart always renders
      const chartData = dayAbbreviations.map((day) => ({
        day,
        questions: questionsByDate[day] || 0,
      }));
      
      setWeeklyData(chartData);
    } else if (timeRange === "month") {
      // Initialize weeks (typically 4-5 weeks in a month)
      for (let i = 1; i <= 5; i++) {
        questionsByDate[`Week ${i}`] = 0;
      }

      // Count questions by week of month
      // Note: data is already filtered by date in the query, so we don't need to filter again
      const questionEvents = data.filter((a) => a.event_type === "question_asked");
      
      questionEvents.forEach((item) => {
        const itemDate = new Date(item.created_at);
        const monthStart = startOfMonth(itemDate);
        const weekStart = startOfWeek(itemDate, { weekStartsOn: 1 });
        const daysDiff = Math.floor((weekStart.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24));
        const weekIndex = Math.floor(daysDiff / 7) + 1;
        const weekKey = `Week ${Math.min(weekIndex, 5)}`;
        questionsByDate[weekKey] = (questionsByDate[weekKey] || 0) + 1;
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
      const monthMapping: Record<number, string> = {
        0: "Jan",  // January
        1: "Feb",  // February
        2: "Mrt",  // March
        3: "Apr",  // April
        4: "Mei",  // May
        5: "Jun",  // June
        6: "Jul",  // July
        7: "Aug",  // August
        8: "Sep",  // September
        9: "Okt",  // October
        10: "Nov", // November
        11: "Dec", // December
      };
      
      months.forEach((month) => {
        questionsByDate[month] = 0;
      });

      // Count questions by month
      // Note: data is already filtered by date in the query, so we don't need to filter again
      const questionEvents = data.filter((a) => a.event_type === "question_asked");
      
      questionEvents.forEach((item) => {
        const itemDate = new Date(item.created_at);
        // Get month index (0 = January, 11 = December)
        const monthIndex = itemDate.getMonth();
        const monthKey = monthMapping[monthIndex];
        
        if (monthKey && questionsByDate.hasOwnProperty(monthKey)) {
          questionsByDate[monthKey] = (questionsByDate[monthKey] || 0) + 1;
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
    if (weeklyData.length === 0) return 1;
    const max = Math.max(...weeklyData.map((d) => d.questions));
    // Ensure minimum of 1 to prevent division by zero
    // If max is 0, use 1 so bars are still visible (at minimum height)
    return max > 0 ? max : 1;
  }, [weeklyData]);

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
            {weeklyData.length === 0 ? (
              <div className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Geen data beschikbaar</p>
              </div>
            ) : (
              <div className="flex items-end justify-between gap-2 h-48">
                {weeklyData.map((data) => {
                  // Calculate bar height as percentage of max
                  // Container height is h-40 = 160px (from Tailwind)
                  const percentage = maxQuestions > 0 ? (data.questions / maxQuestions) : 0;
                  // Convert to pixels, ensure minimum height for visibility
                  const barHeightPx = data.questions > 0 
                    ? Math.max(percentage * 160, 12) // At least 12px for bars with data
                    : 4; // 4px for empty bars
                  
                  return (
                    <div key={data.day} className="flex-1 flex flex-col items-center gap-2">
                      <div className="w-full flex flex-col justify-end" style={{ height: '160px' }}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className="w-full relative cursor-pointer"
                              style={{
                                height: `${barHeightPx}px`,
                                minHeight: data.questions > 0 ? "12px" : "4px",
                              }}
                            >
                              {data.questions > 0 && (
                                <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground tabular-nums">
                                  {data.questions}
                                </div>
                              )}
                              <div
                                className="w-full h-full bg-gradient-to-t from-primary to-primary/60 rounded-t-lg transition-all hover:from-primary hover:to-primary/80"
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-medium">{data.day}</p>
                            <p className="text-sm">{data.questions} {data.questions === 1 ? 'vraag' : 'vragen'}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <span className="text-xs text-muted-foreground">{data.day}</span>
                    </div>
                  );
                })}
              </div>
            )}
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
