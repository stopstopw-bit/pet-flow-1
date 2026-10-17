import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "@/lib/auth";
import { withTenant } from "@/lib/tenant-context";
import { bangkokToday } from "@/lib/bangkok-date";
import {
  computePayroll,
  deleteEmployee,
  listEmployees,
  payPayroll,
  saveEmployee,
} from "@/lib/payroll-store";
import { logAudit } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

const MONTH_RE = /^\d{4}-\d{2}$/;

/** เงินเดือนเป็นข้อมูลลับ — เจ้าของร้าน หรือพนักงานที่เจ้าของเปิดเมนูนี้ให้เท่านั้น */
function canSeePayroll(s: SessionPayload) {
  return s.role === "owner" || !!s.menus?.includes("/admin/payroll");
}

/** ?month=YYYY-MM → สรุปเงินเดือน+ค่าคอม · ?employees=1 → รายชื่อช่าง (ชื่ออย่างเดียว ใช้ในบอร์ดคิว) */
async function handleGet(req: NextRequest, session: SessionPayload) {
  const q = req.nextUrl.searchParams;
  if (q.get("employees") !== null) {
    const list = await listEmployees();
    return NextResponse.json({
      employees: list.filter((e) => e.active).map((e) => ({ id: e.id, name: e.name })),
    });
  }
  if (!canSeePayroll(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const month = q.get("month") || bangkokToday().slice(0, 7);
  if (!MONTH_RE.test(month)) return NextResponse.json({ error: "bad month" }, { status: 400 });
  const lines = await computePayroll(month);
  return NextResponse.json({ month, lines });
}

async function handlePost(req: NextRequest, session: SessionPayload) {
  if (!canSeePayroll(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  if (action === "save") {
    const emp = await saveEmployee({ ...(body.employee || {}), name: String(body.employee?.name || "") });
    if (!emp) {
      return NextResponse.json(
        { error: "บันทึกไม่สำเร็จ — ใส่ชื่อพนักงาน หรือกด อัปเดตฐานข้อมูล ในหน้าติดตั้งก่อน" },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, employee: emp });
  }

  if (action === "delete") {
    const ok = await deleteEmployee(String(body.id || ""));
    return NextResponse.json({ ok });
  }

  if (action === "pay") {
    const month = String(body.month || "");
    if (!MONTH_RE.test(month)) return NextResponse.json({ error: "bad month" }, { status: 400 });
    const res = await payPayroll(String(body.employeeId || ""), month, {
      bonus: Number(body.bonus) || 0,
      deduction: Number(body.deduction) || 0,
      date: bangkokToday(),
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    await logAudit({
      tenantId: session.tenantId,
      actorType: "tenant",
      actorId: session.name || session.role,
      action: "payroll.pay",
      resourceType: "payroll",
      resourceId: String(body.employeeId || ""),
      afterState: { เดือน: month, ยอด: res.amount },
    });
    return NextResponse.json(res);
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

async function getSession(req: NextRequest) {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handleGet(req, session));
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePost(req, session));
}
