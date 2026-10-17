import { NextRequest, NextResponse } from "next/server";
import { adminDashboardStats, bookingsByDateMap } from "@/lib/admin-stats";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { withTenant } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handleGet(req));
}

async function handleGet(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from") || undefined;
  const to = req.nextUrl.searchParams.get("to") || undefined;
  const stats = await adminDashboardStats(from && to ? { from, to } : undefined);
  const ym = stats.today.slice(0, 7);
  const calendar = Object.fromEntries(await bookingsByDateMap(ym));
  return NextResponse.json({ stats, calendarMonth: ym, calendar });
}
