"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Calendar,
  Clock,
  FileText,
  MessageSquare,
  TrendingUp,
  Users,
  Building,
  CheckCircle,
} from "lucide-react";

type TimeRange = "week" | "month" | "year";

type AdminAnalyticsSummary = {
  questionsAsked: number;
  documentsUploaded: number;
  documentsProcessed: number;
  activeUsers: number;
  avgResponseTime: string;
};

type AdminAnalyticsByOrgRow = {
  organizationId: string;
  organizationName: string;
  questionsAsked: number;
  documentsUploaded: number;
  documentsProcessed: number;
  activeUsers: number;
  avgResponseTime: string;
};

type AdminTopQuestion = { question: string; count: number };

type AdminAnalyticsResponse =
  | {
      success: true;
      timeRange: TimeRange;
      startDate: string;
      endDate: string;
      organizationId: string | null;
      summary: AdminAnalyticsSummary;
      byOrg: AdminAnalyticsByOrgRow[];
      topQuestions: AdminTopQuestion[];
    }
  | {
      success: false;
      error: string;
    };

async function fetchAdminAnalytics(params: { timeRange: TimeRange; organizationId: string | null }) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch("/api/admin/analytics", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      timeRange: params.timeRange,
      organizationId: params.organizationId,
    }),
  });

  const json = (await res.json()) as AdminAnalyticsResponse;
  if (!res.ok || !json.success) {
    throw new Error(!json.success ? json.error : "Failed to load admin analytics");
  }

  return json;
}

export default function AdminAnalyticsView() {
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState<TimeRange>("week");
  const [tab, setTab] = useState<"all" | "org">("all");

  const [loadingAll, setLoadingAll] = useState(false);
  const [errorAll, setErrorAll] = useState<string | null>(null);
  const [allData, setAllData] = useState<Extract<AdminAnalyticsResponse, { success: true }> | null>(null);

  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [loadingOrg, setLoadingOrg] = useState(false);
  const [errorOrg, setErrorOrg] = useState<string | null>(null);
  const [orgData, setOrgData] = useState<Extract<AdminAnalyticsResponse, { success: true }> | null>(null);

  const organizations = useMemo(() => {
    return (allData?.byOrg || []).map((o) => ({ id: o.organizationId, name: o.organizationName }));
  }, [allData]);

  // Always load the all-orgs view (also used as source for org dropdown list)
  useEffect(() => {
    if (!user) return;
    if (user.role !== "admin") return;

    let cancelled = false;
    setLoadingAll(true);
    setErrorAll(null);
    fetchAdminAnalytics({ timeRange, organizationId: null })
      .then((data) => {
        if (cancelled) return;
        setAllData(data);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setErrorAll(e?.message || "Kon admin analytics niet laden.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingAll(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, timeRange]);

  // Load per-org view when needed
  useEffect(() => {
    if (!user) return;
    if (user.role !== "admin") return;
    if (tab !== "org") return;
    if (!selectedOrgId) return;

    let cancelled = false;
    setLoadingOrg(true);
    setErrorOrg(null);
    fetchAdminAnalytics({ timeRange, organizationId: selectedOrgId })
      .then((data) => {
        if (cancelled) return;
        setOrgData(data);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setErrorOrg(e?.message || "Kon organisatie analytics niet laden.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingOrg(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, tab, selectedOrgId, timeRange]);

  // Default org selection when opening org tab
  useEffect(() => {
    if (tab !== "org") return;
    if (selectedOrgId) return;
    if (organizations.length === 0) return;
    setSelectedOrgId(organizations[0].id);
  }, [tab, selectedOrgId, organizations]);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Laden...</div>
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <div className="glass rounded-xl p-6">
        <p className="text-muted-foreground">Geen toegang.</p>
      </div>
    );
  }

  const renderStats = (summary: AdminAnalyticsSummary) => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <TrendingUp className="w-4 h-4 text-green-500" />
        </div>
        <p className="text-2xl font-display font-bold text-foreground">{summary.questionsAsked}</p>
        <p className="text-sm text-muted-foreground">Vragen (periode)</p>
      </div>

      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-accent" />
          </div>
        </div>
        <p className="text-2xl font-display font-bold text-foreground">{summary.documentsUploaded}</p>
        <p className="text-sm text-muted-foreground">Documenten (totaal)</p>
      </div>

      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-blue-500" />
          </div>
        </div>
        <p className="text-2xl font-display font-bold text-foreground">{summary.documentsProcessed}</p>
        <p className="text-sm text-muted-foreground">Verwerkt (totaal)</p>
      </div>

      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
            <Users className="w-5 h-5 text-muted-foreground" />
          </div>
        </div>
        <p className="text-2xl font-display font-bold text-foreground">{summary.activeUsers}</p>
        <p className="text-sm text-muted-foreground">Actieve users (totaal)</p>
      </div>

      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
            <Clock className="w-5 h-5 text-green-500" />
          </div>
        </div>
        <p className="text-2xl font-display font-bold text-foreground">{summary.avgResponseTime}</p>
        <p className="text-sm text-muted-foreground">Gem. responstijd</p>
      </div>
    </div>
  );

  const renderTopQuestions = (items: AdminTopQuestion[]) => (
    <Card className="glass rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          Populaire Vragen
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen vragen gesteld in deze periode.</p>
        ) : (
          <div className="space-y-3">
            {items.map((q, idx) => (
              <div key={`${idx}-${q.question}`} className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{q.question}</p>
                </div>
                <span className="text-sm font-medium text-muted-foreground">{q.count}x</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderByOrgTable = (rows: AdminAnalyticsByOrgRow[]) => (
    <Card className="glass rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building className="w-5 h-5 text-primary" />
          Per organisatie
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 text-sm font-medium">Organisatie</th>
                <th className="text-right p-2 text-sm font-medium">Vragen</th>
                <th className="text-right p-2 text-sm font-medium">Docs</th>
                <th className="text-right p-2 text-sm font-medium">Verwerkt</th>
                <th className="text-right p-2 text-sm font-medium">Users</th>
                <th className="text-right p-2 text-sm font-medium">Responstijd</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.organizationId} className="border-b">
                  <td className="p-2 text-sm">{r.organizationName}</td>
                  <td className="p-2 text-sm text-right">{r.questionsAsked}</td>
                  <td className="p-2 text-sm text-right">{r.documentsUploaded}</td>
                  <td className="p-2 text-sm text-right">{r.documentsProcessed}</td>
                  <td className="p-2 text-sm text-right">{r.activeUsers}</td>
                  <td className="p-2 text-sm text-right">{r.avgResponseTime}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-muted-foreground">
                    Geen organisaties gevonden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Admin Analytics</h1>
          <p className="text-muted-foreground">Inzicht in gebruik over alle organisaties (admin-only)</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[160px]">
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "org")}>
        <TabsList>
          <TabsTrigger value="all" className="flex items-center gap-2">
            <BarChart className="w-4 h-4" />
            All orgs
          </TabsTrigger>
          <TabsTrigger value="org" className="flex items-center gap-2">
            <Building className="w-4 h-4" />
            Per org
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-6">
          {loadingAll ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-muted-foreground">Laden...</div>
            </div>
          ) : errorAll ? (
            <div className="glass rounded-xl p-6">
              <p className="text-destructive">{errorAll}</p>
            </div>
          ) : allData ? (
            <>
              {renderStats(allData.summary)}
              <div className="grid gap-6 lg:grid-cols-2">
                {renderTopQuestions(allData.topQuestions)}
                {renderByOrgTable(allData.byOrg)}
              </div>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="org" className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="text-sm text-muted-foreground">Organisatie:</span>
            <Select value={selectedOrgId || ""} onValueChange={(v) => setSelectedOrgId(v || null)}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Selecteer organisatie" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!selectedOrgId ? (
            <div className="glass rounded-xl p-6">
              <p className="text-muted-foreground">Selecteer een organisatie om details te bekijken.</p>
            </div>
          ) : loadingOrg ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-muted-foreground">Laden...</div>
            </div>
          ) : errorOrg ? (
            <div className="glass rounded-xl p-6">
              <p className="text-destructive">{errorOrg}</p>
            </div>
          ) : orgData ? (
            <>
              {renderStats(orgData.summary)}
              <div className="grid gap-6 lg:grid-cols-2">
                {renderTopQuestions(orgData.topQuestions)}
                <Card className="glass rounded-2xl">
                  <CardHeader>
                    <CardTitle>Over deze view</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Deze tab toont dezelfde metrics, maar gefilterd op de gekozen organisatie.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}


