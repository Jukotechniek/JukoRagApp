import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Activity, 
  DollarSign,
  FileText,
  MessageSquare
} from "lucide-react";
import { format, subDays, subWeeks, subMonths } from "date-fns";
import { nl } from "date-fns/locale";

interface TokenUsageViewProps {
  selectedOrganizationId?: string | null;
}

interface TokenUsage {
  id: string;
  organization_id: string;
  user_id: string | null;
  model: string;
  operation_type: 'chat' | 'embedding' | 'document_processing';
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  metadata: Record<string, any> | null;
  created_at: string;
}

const TokenUsageView = ({ selectedOrganizationId }: TokenUsageViewProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"day" | "week" | "month" | "all">("week");
  const [tokenUsage, setTokenUsage] = useState<TokenUsage[]>([]);
  const [stats, setStats] = useState({
    totalTokens: 0,
    totalCost: 0,
    chatTokens: 0,
    documentProcessingTokens: 0,
    chatCost: 0,
    documentProcessingCost: 0,
  });

  const effectiveOrgId = selectedOrganizationId ?? user?.organization_id ?? null;

  useEffect(() => {
    if (!user) return;
    if (user.role !== "admin") {
      setLoading(false);
      setTokenUsage([]);
      return;
    }
    loadTokenUsage();
  }, [user, timeRange, effectiveOrgId]);

  const loadTokenUsage = async () => {
    if (!user) return;
    if (user.role !== "admin") return;

    try {
      setLoading(true);
      // Admin-only: fetch via server route (service role), so managers cannot access via client queries.
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const response = await fetch("/api/admin/token-usage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          timeRange,
          organizationId: effectiveOrgId, // can be null => all orgs
        }),
      });

      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Failed to load token usage");
      }

      const usage: TokenUsage[] = (json.tokenUsage || []) as TokenUsage[];

      setTokenUsage(usage);

      // Calculate stats
      const totalTokens = usage.reduce((sum, item) => sum + item.total_tokens, 0);
      const totalCost = usage.reduce((sum, item) => sum + Number(item.cost_usd || 0), 0);
      
      const chatData = usage.filter((item) => item.operation_type === 'chat');
      const docData = usage.filter((item) => item.operation_type === 'document_processing');

      setStats({
        totalTokens,
        totalCost,
        chatTokens: chatData.reduce((sum, item) => sum + item.total_tokens, 0),
        documentProcessingTokens: docData.reduce((sum, item) => sum + item.total_tokens, 0),
        chatCost: chatData.reduce((sum, item) => sum + Number(item.cost_usd || 0), 0),
        documentProcessingCost: docData.reduce((sum, item) => sum + Number(item.cost_usd || 0), 0),
      });
    } catch (error) {
      console.error("Error loading token usage:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    // Despite column name `cost_usd`, our DB function returns EUR.
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("nl-NL").format(num);
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Laden...</div>
        </div>
      );
    }

    if (!user || user.role !== "admin") {
      return (
        <div className="glass rounded-xl p-6">
          <p className="text-muted-foreground">Geen toegang.</p>
        </div>
      );
    }

    return (
      <>
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Totaal Tokens</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(stats.totalTokens)}</div>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(stats.totalTokens / 1000)}K tokens
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Totaal Kosten (EUR)</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(stats.totalCost)}</div>
                <p className="text-xs text-muted-foreground">
                  {timeRange === "day" ? "Vandaag" : timeRange === "week" ? "Deze week" : timeRange === "month" ? "Deze maand" : "Totaal"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Chat Tokens</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(stats.chatTokens)}</div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(stats.chatCost)} kosten
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Document Processing Tokens</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(stats.documentProcessingTokens)}</div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(stats.documentProcessingCost)} kosten
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Breakdown by Operation Type */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Chat
                </CardTitle>
                <CardDescription>AI gesprekken</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Tokens:</span>
                    <span className="font-medium">{formatNumber(stats.chatTokens)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Kosten:</span>
                    <span className="font-medium">{formatCurrency(stats.chatCost)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Document Processing
                </CardTitle>
                <CardDescription>Document verwerking</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Tokens:</span>
                    <span className="font-medium">{formatNumber(stats.documentProcessingTokens)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Kosten:</span>
                    <span className="font-medium">{formatCurrency(stats.documentProcessingCost)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Usage Table */}
          <Card>
            <CardHeader>
              <CardTitle>Recente Gebruik</CardTitle>
              <CardDescription>Laatste token usage events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 text-sm font-medium">Datum</th>
                      <th className="text-left p-2 text-sm font-medium">Type</th>
                      <th className="text-left p-2 text-sm font-medium">Model</th>
                      <th className="text-right p-2 text-sm font-medium">Tokens</th>
                      <th className="text-right p-2 text-sm font-medium">Kosten</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokenUsage.slice(0, 20).map((usage) => (
                      <tr key={usage.id} className="border-b">
                        <td className="p-2 text-sm">
                          {format(new Date(usage.created_at), "dd MMM yyyy HH:mm", { locale: nl })}
                        </td>
                        <td className="p-2 text-sm capitalize">{usage.operation_type}</td>
                        <td className="p-2 text-sm font-mono text-xs">{usage.model}</td>
                        <td className="p-2 text-sm text-right">{formatNumber(usage.total_tokens)}</td>
                        <td className="p-2 text-sm text-right">{formatCurrency(Number(usage.cost_usd || 0))}</td>
                      </tr>
                    ))}
                    {tokenUsage.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-muted-foreground">
                          Geen token usage gevonden voor deze periode
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
      </>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Token Gebruik</h1>
        <p className="text-muted-foreground mt-2">
          Overzicht van OpenAI API token gebruik en kosten (EUR)
        </p>
      </div>

      {/* Time Range Selector */}
      <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as typeof timeRange)}>
        <TabsList>
          <TabsTrigger value="day">Vandaag</TabsTrigger>
          <TabsTrigger value="week">Deze week</TabsTrigger>
          <TabsTrigger value="month">Deze maand</TabsTrigger>
          <TabsTrigger value="all">Alles</TabsTrigger>
        </TabsList>

        <TabsContent value="day" className="space-y-6">
          {renderContent()}
        </TabsContent>
        <TabsContent value="week" className="space-y-6">
          {renderContent()}
        </TabsContent>
        <TabsContent value="month" className="space-y-6">
          {renderContent()}
        </TabsContent>
        <TabsContent value="all" className="space-y-6">
          {renderContent()}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TokenUsageView;

