import { NextRequest, NextResponse } from "next/server";
import { getPlatformSessionFrom } from "@/lib/platform-auth";
import { logAudit } from "@/lib/audit-log";
import {
  decidePayment,
  getBillingSettings,
  listPayments,
  saveBillingSettings,
} from "@/lib/subscription-store";

export const dynamic = "force-dynamic";

/** ราคาแพ็กเกจ + บัญชีรับเงิน + สลิปที่ร้านส่งมา (ทุกร้าน) */
export async function GET(req: NextRequest) {
  if (!(await getPlatformSessionFrom(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const [settings, payments] = await Promise.all([getBillingSettings(), listPayments({ limit: 100 })]);
    return NextResponse.json({ settings, payments });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" }, { status: 500 });
  }
}

/** บันทึกราคา/บัญชีรับเงิน */
export async function PUT(req: NextRequest) {
  if (!(await getPlatformSessionFrom(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json({ ok: true, settings: await saveBillingSettings(body) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}

/** อนุมัติ/ไม่อนุมัติสลิป {id, approve, note} — อนุมัติแล้วต่ออายุร้านให้เลย */
export async function PATCH(req: NextRequest) {
  if (!(await getPlatformSessionFrom(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  try {
    const p = await decidePayment(id, body.approve === true, String(body.note || "").slice(0, 300));
    await logAudit({
      tenantId: p.tenantId,
      actorType: "platform",
      actorId: "platform_owner",
      action: p.status === "approved" ? "approve_subscription_payment" : "reject_subscription_payment",
      resourceType: "tenant_payment",
      resourceId: p.id,
      beforeState: { dueDate: p.dueBefore },
      afterState: { dueDate: p.dueAfter, plan: p.plan, amount: p.amount },
    });
    return NextResponse.json({ ok: true, payment: p });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ไม่สำเร็จ" }, { status: 400 });
  }
}
