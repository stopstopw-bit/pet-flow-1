import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "@/lib/auth";
import { withTenant } from "@/lib/tenant-context";
import { bangkokToday } from "@/lib/bangkok-date";
import { computeStaffPerformance } from "@/lib/staff-performance";

export const dynamic = "force-dynamic";

const MONTH_RE = /^\d{4}-\d{2}$/;

/** ผลงานพนักงานเปรียบเทียบกันได้ — เจ้าของร้าน หรือคนที่เจ้าของเปิดเมนูนี้ให้เท่านั้น */
function canSee(s: SessionPayload) {
  return s.role === "owner" || !!s.menus?.includes("/admin/staff-performance");
}

/** GET ?month=YYYY-MM → ผลงานช่างแต่ละคนของเดือนนั้น เทียบเดือนก่อน */
export async function GET(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canSee(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const today = bangkokToday();
  const month = req.nextUrl.searchParams.get("month") || today.slice(0, 7);
  if (!MONTH_RE.test(month)) return NextResponse.json({ error: "bad month" }, { status: 400 });
  return withTenant(session.tenantId, async () =>
    NextResponse.json(await computeStaffPerformance(month, today))
  );
}
