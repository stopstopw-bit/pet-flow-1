import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { bookingsForDate } from "@/lib/bookings-store";
import { groomClashes } from "@/lib/groom-clash";
import { withTenant } from "@/lib/tenant-context";

/** คิวอาบน้ำที่ชนกับวัน/เวลาที่กำลังจะจอง — หลังบ้านเท่านั้น */
export async function GET(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handleGet(req));
}

async function handleGet(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const date = sp.get("date")?.trim() || "";
  const time = sp.get("time")?.trim() || "";
  const exclude = (sp.get("exclude") || "").split(",").filter(Boolean);
  if (!date || !time) return NextResponse.json({ clashes: [] });
  const clashes = groomClashes(await bookingsForDate(date), date, time, exclude).map((b) => ({
    id: b.id,
    time: b.time,
    catName: b.catName,
    customerName: b.customerName,
  }));
  return NextResponse.json({ clashes });
}
