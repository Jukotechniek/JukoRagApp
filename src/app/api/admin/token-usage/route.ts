import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type TimeRange = "day" | "week" | "month" | "all";

function computeStartDate(timeRange: TimeRange) {
  const now = new Date();
  if (timeRange === "all") return new Date(0);
  const d = new Date(now);
  if (timeRange === "day") d.setDate(d.getDate() - 1);
  if (timeRange === "week") d.setDate(d.getDate() - 7);
  if (timeRange === "month") d.setMonth(d.getMonth() - 1);
  return d;
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
    const timeRange: TimeRange =
      body?.timeRange === "day" || body?.timeRange === "week" || body?.timeRange === "month" || body?.timeRange === "all"
        ? body.timeRange
        : "week";
    const organizationId: string | null = typeof body?.organizationId === "string" && body.organizationId.length > 0 ? body.organizationId : null;

    // Verify user token
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
    const authUser = authData?.user;
    if (authError || !authUser) {
      return NextResponse.json({ success: false, error: "Unauthorized: Invalid or expired token" }, { status: 401 });
    }

    // Verify admin role in DB
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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const startDate = computeStartDate(timeRange);

    let query = supabaseAdmin
      .from("token_usage")
      .select("*")
      .order("created_at", { ascending: false });

    if (organizationId) query = query.eq("organization_id", organizationId);
    if (timeRange !== "all") query = query.gte("created_at", startDate.toISOString());

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, tokenUsage: data || [] });
  } catch (error: any) {
    console.error("Error in admin token-usage API:", error);
    return NextResponse.json({ success: false, error: error?.message || "Internal server error" }, { status: 500 });
  }
}


