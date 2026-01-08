import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type TimeRange = "week" | "month" | "year";

function computeDateRange(timeRange: TimeRange) {
  const now = new Date();
  const startDate = new Date(now);

  if (timeRange === "month") {
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);
  } else if (timeRange === "year") {
    startDate.setMonth(0, 1);
    startDate.setHours(0, 0, 0, 0);
  } else {
    // Week: Monday 00:00 local time
    const day = startDate.getDay(); // 0 Sun .. 6 Sat
    const diffToMonday = day === 0 ? -6 : 1 - day;
    startDate.setDate(startDate.getDate() + diffToMonday);
    startDate.setHours(0, 0, 0, 0);
  }

  return { startDate, endDate: now };
}

function formatAvgResponseTime(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ success: false, error: "Missing authorization header" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ success: false, error: "Invalid authorization header format" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return NextResponse.json({ success: false, error: "Supabase configuration missing" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const timeRange: TimeRange = body?.timeRange === "month" || body?.timeRange === "year" ? body.timeRange : "week";
    const organizationId: string | null = typeof body?.organizationId === "string" && body.organizationId.length > 0 ? body.organizationId : null;
    const topN: number = Number.isFinite(body?.topN) ? Math.max(1, Math.min(25, Number(body.topN))) : 5;

    // Verify user with anon client + token
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
    const authUser = authData?.user;
    if (authError || !authUser) {
      return NextResponse.json({ success: false, error: "Unauthorized: Invalid or expired token" }, { status: 401 });
    }

    const { data: userData, error: userError } = await supabaseClient
      .from("users")
      .select("id, role")
      .eq("id", authUser.id)
      .single();

    if (userError || !userData) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    if (userData.role !== "admin") {
      return NextResponse.json({ success: false, error: "Forbidden: Only admins can access this endpoint" }, { status: 403 });
    }

    // Service role for cross-org reads/aggregation
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { startDate, endDate } = computeDateRange(timeRange);

    // Load organizations (for by-org view)
    const { data: organizations, error: orgsError } = await supabaseAdmin
      .from("organizations")
      .select("id, name")
      .order("name", { ascending: true });

    if (orgsError) throw orgsError;

    const orgList = (organizations || []) as { id: string; name: string }[];
    const allowedOrgIds = new Set(orgList.map((o) => o.id));
    if (organizationId && !allowedOrgIds.has(organizationId)) {
      return NextResponse.json({ success: false, error: "Unknown organizationId" }, { status: 400 });
    }

    // Load analytics for the selected time range
    let analyticsQuery = supabaseAdmin
      .from("analytics")
      .select("organization_id, event_type, event_data, created_at")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString());

    if (organizationId) analyticsQuery = analyticsQuery.eq("organization_id", organizationId);

    const { data: analyticsRows, error: analyticsError } = await analyticsQuery;
    if (analyticsError) throw analyticsError;

    // Load documents (all-time, like existing AnalyticsView) and map docId -> orgId
    let docsQuery = supabaseAdmin.from("documents").select("id, organization_id");
    if (organizationId) docsQuery = docsQuery.eq("organization_id", organizationId);
    const { data: documents, error: docsError } = await docsQuery;
    if (docsError) throw docsError;

    const docIdToOrgId = new Map<string, string>();
    const documentsUploadedByOrg: Record<string, number> = {};
    for (const doc of (documents || []) as any[]) {
      if (!doc?.id || !doc?.organization_id) continue;
      docIdToOrgId.set(String(doc.id), String(doc.organization_id));
      const oid = String(doc.organization_id);
      documentsUploadedByOrg[oid] = (documentsUploadedByOrg[oid] || 0) + 1;
    }

    // Load document sections to compute processed documents (unique doc_ids that have sections)
    const { data: sections, error: sectionsError } = await supabaseAdmin
      .from("document_sections")
      .select("document_id");
    if (sectionsError) throw sectionsError;

    const processedDocIdsOverall = new Set<string>();
    const processedDocIdsByOrg: Record<string, Set<string>> = {};

    for (const row of (sections || []) as any[]) {
      const docId = row?.document_id ? String(row.document_id) : null;
      if (!docId) continue;
      const oid = docIdToOrgId.get(docId);
      if (!oid) continue; // section exists for doc not in current docsQuery scope
      processedDocIdsOverall.add(docId);
      if (!processedDocIdsByOrg[oid]) processedDocIdsByOrg[oid] = new Set<string>();
      processedDocIdsByOrg[oid].add(docId);
    }

    // Load user_organizations to compute active users
    let userOrgsQuery = supabaseAdmin.from("user_organizations").select("user_id, organization_id");
    if (organizationId) userOrgsQuery = userOrgsQuery.eq("organization_id", organizationId);
    const { data: userOrgs, error: userOrgsError } = await userOrgsQuery;
    if (userOrgsError) throw userOrgsError;

    const activeUsersOverall = new Set<string>();
    const activeUsersByOrg: Record<string, Set<string>> = {};
    for (const row of (userOrgs || []) as any[]) {
      const uid = row?.user_id ? String(row.user_id) : null;
      const oid = row?.organization_id ? String(row.organization_id) : null;
      if (!uid || !oid) continue;
      activeUsersOverall.add(uid);
      if (!activeUsersByOrg[oid]) activeUsersByOrg[oid] = new Set<string>();
      activeUsersByOrg[oid].add(uid);
    }

    // Aggregate analytics
    const perOrgAgg: Record<
      string,
      {
        questionsAsked: number;
        responseTimeTotalMs: number;
        responseTimeCount: number;
        topQuestions: Record<string, number>;
      }
    > = {};

    let questionsAsked = 0;
    let responseTimeTotalMs = 0;
    let responseTimeCount = 0;
    const topQuestionsMap: Record<string, number> = {};

    for (const row of (analyticsRows || []) as any[]) {
      const oid = row?.organization_id ? String(row.organization_id) : null;
      const eventType = row?.event_type ? String(row.event_type) : null;
      const eventData = (row?.event_data || null) as Record<string, unknown> | null;
      if (!oid || !eventType) continue;

      if (!perOrgAgg[oid]) {
        perOrgAgg[oid] = {
          questionsAsked: 0,
          responseTimeTotalMs: 0,
          responseTimeCount: 0,
          topQuestions: {},
        };
      }

      if (eventType === "question_asked") {
        questionsAsked += 1;
        perOrgAgg[oid].questionsAsked += 1;

        const qtRaw = (eventData?.question_text || eventData?.content) as string | undefined;
        const qt = typeof qtRaw === "string" ? qtRaw.trim() : "";
        if (qt) {
          topQuestionsMap[qt] = (topQuestionsMap[qt] || 0) + 1;
          perOrgAgg[oid].topQuestions[qt] = (perOrgAgg[oid].topQuestions[qt] || 0) + 1;
        }
      }

      if (eventType === "response_time") {
        const rt = Number((eventData as any)?.response_time_ms) || 0;
        if (rt > 0) {
          responseTimeTotalMs += rt;
          responseTimeCount += 1;
          perOrgAgg[oid].responseTimeTotalMs += rt;
          perOrgAgg[oid].responseTimeCount += 1;
        }
      }
    }

    const avgResponseTime =
      responseTimeCount > 0 ? formatAvgResponseTime(responseTimeTotalMs / responseTimeCount) : "0s";

    const summary = {
      questionsAsked,
      documentsUploaded: (documents || []).length,
      documentsProcessed: processedDocIdsOverall.size,
      activeUsers: activeUsersOverall.size,
      avgResponseTime,
    };

    // Build per-org rows
    const byOrg = orgList
      .filter((o) => (organizationId ? o.id === organizationId : true))
      .map((o) => {
        const agg = perOrgAgg[o.id];
        const orgAvg =
          agg && agg.responseTimeCount > 0 ? formatAvgResponseTime(agg.responseTimeTotalMs / agg.responseTimeCount) : "0s";
        return {
          organizationId: o.id,
          organizationName: o.name,
          questionsAsked: agg?.questionsAsked || 0,
          documentsUploaded: documentsUploadedByOrg[o.id] || 0,
          documentsProcessed: processedDocIdsByOrg[o.id]?.size || 0,
          activeUsers: activeUsersByOrg[o.id]?.size || 0,
          avgResponseTime: orgAvg,
        };
      });

    // Top questions overall (already filtered by orgId if provided)
    const topQuestions = Object.entries(topQuestionsMap)
      .map(([question, count]) => ({ question, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);

    return NextResponse.json({
      success: true,
      timeRange,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      organizationId,
      summary,
      byOrg,
      topQuestions,
    });
  } catch (error: any) {
    console.error("Error in admin analytics API:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}


