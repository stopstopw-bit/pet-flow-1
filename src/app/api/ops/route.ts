import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { withTenant } from "@/lib/tenant-context";
import { getBooking } from "@/lib/bookings-store";
import {
  listBookingOps,
  setCareCheck,
  setGroomStarted,
  setGroomer,
} from "@/lib/booking-ops-store";

export const dynamic = "force-dynamic";

/**
 * งานหน้าร้านของนัด (บอร์ดคิวอาบน้ำ + เช็คลิสต์ดูแลรายวัน) — หลังบ้านเท่านั้น
 * GET ?ids=a,b,c → สถานะของนัดเหล่านั้น
 */
async function handleGet(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const ops = await listBookingOps(ids);
  return NextResponse.json({ ops });
}

async function handlePatch(req: NextRequest, staffName: string) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const ids: string[] = Array.isArray(body.ids)
    ? body.ids.map(String)
    : body.bookingId
      ? [String(body.bookingId)]
      : [];
  if (ids.length === 0) return NextResponse.json({ error: "missing ids" }, { status: 400 });

  // นัดต้องเป็นของร้านนี้ — booking_id เป็น primary key ห้ามเขียนทับของร้านอื่น
  for (const id of ids) {
    if (!(await getBooking(id))) return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let ok = true;
  if (action === "groom_start" || action === "groom_unstart") {
    const groomer = typeof body.groomer === "string" ? body.groomer : undefined;
    for (const id of ids) ok = (await setGroomStarted(id, action === "groom_start", groomer)) && ok;
  } else if (action === "set_groomer") {
    for (const id of ids) ok = (await setGroomer(id, String(body.groomer || ""))) && ok;
  } else if (action === "care") {
    const date = String(body.date || "");
    const taskId = String(body.taskId || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !taskId) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }
    for (const id of ids) ok = (await setCareCheck(id, date, taskId, body.done !== false, staffName)) && ok;
  } else {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  if (!ok) {
    return NextResponse.json(
      { error: "บันทึกไม่สำเร็จ — ลองกด อัปเดตฐานข้อมูล ในหน้าติดตั้งก่อน" },
      { status: 500 }
    );
  }
  const ops = await listBookingOps(ids);
  return NextResponse.json({ ok: true, ops });
}

async function getSession(req: NextRequest) {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handleGet(req));
}

export async function PATCH(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePatch(req, session.name || session.role));
}
