import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getCustomer } from "@/lib/customers-store";
import { listCustomerPackages } from "@/lib/packages-store";
import {
  createRoomPlan,
  quoteRoomPlan,
  receiveRoomPlanPayment,
  cancelRoomPlan,
  getRoomPlan,
  viewCustomerRoomPlans,
  viewRoomPlan,
  roomPlanSettings,
  type RoomPlanView,
} from "@/lib/room-plans-store";
import { pushLineMessage, buildRoomPlanFlex } from "@/lib/line";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
import { logAudit } from "@/lib/audit-log";
import { withTenant, requireTenantId } from "@/lib/tenant-context";
import { getSiteConfig } from "@/lib/config-store";
import type { CardStyleConfig } from "@/lib/config-types";

async function staffName(req: NextRequest) {
  const s = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  return s ? s.name || s.role || "ไม่ทราบ" : null;
}

function cardFor(v: RoomPlanView, thisPayment?: number, style?: CardStyleConfig) {
  return buildRoomPlanFlex({
    customerName: v.customerName,
    planName: v.name,
    nights: v.nights,
    kind: v.kind,
    price: v.price,
    paid: v.paid,
    remaining: v.remaining,
    installmentsLeft: v.installmentsLeft,
    nextInstallment: v.nextInstallment,
    thisPayment,
    installmentNo: thisPayment ? v.payments.length : undefined,
  }, style);
}

async function notify(lineUserId: string | undefined, v: RoomPlanView, thisPayment?: number) {
  if (!lineUserId) return "ลูกค้ายังไม่ได้ผูก LINE";
  try {
    const style = (await getSiteConfig()).cards?.roomPlan;
    await pushLineMessage(lineUserId, [cardFor(v, thisPayment, style)]);
    return undefined;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** แพ็กของลูกค้า (customerId) หรือคิดราคา (?quote=roomId:nights,roomId:nights&pct=) — หลังบ้านเท่านั้น */
async function handleGet(req: NextRequest) {
  if (!(await staffName(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  if (q.get("quote") !== null) {
    const picks = (q.get("quote") || "")
      .split(",")
      .map((x) => x.split(":"))
      .filter((x) => x.length === 2)
      .map(([roomType, nights]) => ({ roomType, nights: Number(nights) }));
    const pct = q.get("pct");
    const res = await quoteRoomPlan(picks, pct === null || pct === "" ? undefined : Number(pct));
    return NextResponse.json({ ...res, settings: await roomPlanSettings() });
  }
  const customerId = q.get("customerId")?.trim();
  if (!customerId) return NextResponse.json({ settings: await roomPlanSettings() });
  return NextResponse.json({
    plans: await viewCustomerRoomPlans(customerId),
    settings: await roomPlanSettings(),
  });
}

/** ขายแพ็กห้องรายเดือน */
async function handlePost(req: NextRequest) {
  const actor = await staffName(req);
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const cust = await getCustomer(String(body.customerId || ""));
  if (!cust) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let res;
  try {
    res = await createRoomPlan({
      customerId: cust.id,
      customerName: cust.name,
      lineUserId: cust.lineUserId,
      picks: Array.isArray(body.picks) ? body.picks : [],
      discountPct:
        body.discountPct === undefined || body.discountPct === "" ? undefined : Number(body.discountPct),
      installments: Number(body.installments) || 1,
      firstPayment: Number(body.firstPayment) || 0,
      paymentMethod: body.paymentMethod === "cash" ? "cash" : "transfer",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg === "need_sql" ? "need_sql" : "failed" },
      { status: msg === "need_sql" ? 200 : 500 }
    );
  }
  if (!res.ok) return NextResponse.json(res, { status: 400 });

  const packages = await listCustomerPackages(cust.id);
  const view = res.payment?.ok ? res.payment.view : viewRoomPlan(res.plan, packages);
  await logAudit({
    tenantId: requireTenantId(),
    actorType: "tenant",
    actorId: actor,
    action: "sell_room_plan",
    resourceType: "room_plan",
    resourceId: res.plan.id,
    afterState: { ลูกค้า: cust.name, ราคา: res.plan.price, งวด: res.plan.installments },
  });
  await sendTelegram(
    formatBookingTelegram("🏠 ขายแพ็กห้องรายเดือน", {
      ลูกค้า: cust.name,
      ห้อง: res.plan.items.map((i) => `${i.roomLabel} ${i.nights} คืน`).join(" + "),
      ราคาเต็ม: `${res.plan.fullPrice} บาท`,
      ส่วนลด: `${res.plan.discountPct}%`,
      ราคาแพ็ก: `${res.plan.price} บาท`,
      แบ่งจ่าย: `${res.plan.installments} งวด`,
      ...(res.payment?.ok ? { รับงวดแรก: `${res.payment.amount} บาท` } : {}),
    })
  );
  const notifyError =
    body.notify === true
      ? await notify(cust.lineUserId, view, res.payment?.ok ? res.payment.amount : undefined)
      : undefined;
  return NextResponse.json({ ok: true, plan: view, notifyError });
}

/** รับเงินงวด / ส่งการ์ดคืนคงเหลือ / ยกเลิกแพ็ก */
async function handlePatch(req: NextRequest) {
  const actor = await staffName(req);
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const plan = await getRoomPlan(String(body.planId || ""));
  if (!plan) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const cust = await getCustomer(plan.customerId);
  const lineUserId = cust?.lineUserId || plan.lineUserId;

  if (body.action === "pay") {
    const method = body.paymentMethod === "cash" ? "cash" : "transfer";
    const res = await receiveRoomPlanPayment(plan.id, Number(body.amount), method);
    if (!res.ok) return NextResponse.json(res, { status: 400 });
    await logAudit({
      tenantId: requireTenantId(),
      actorType: "tenant",
      actorId: actor,
      action: "room_plan_payment",
      resourceType: "room_plan",
      resourceId: plan.id,
      afterState: { ลูกค้า: plan.customerName, รับ: res.amount, คงเหลือ: res.view.remaining },
    });
    await sendTelegram(
      formatBookingTelegram(res.view.kind === "package" ? "💵 รับเงินงวดคอร์ส" : "💵 รับเงินงวดแพ็กห้อง", {
        ลูกค้า: plan.customerName,
        งวดที่: String(res.view.payments.length),
        รับรอบนี้: `${res.amount} บาท`,
        จ่ายแล้ว: `${res.view.paid} บาท`,
        คงเหลือ: `${res.view.remaining} บาท`,
        เหลืออีก: `${res.view.installmentsLeft} งวด`,
      })
    );
    // แจ้งลูกค้าด้วยการ์ดสรุปทุกครั้งที่รับเงิน (ปิดได้ด้วย notify:false)
    const notifyError =
      body.notify === false ? undefined : await notify(lineUserId, res.view, res.amount);
    return NextResponse.json({ ok: true, plan: res.view, notifyError });
  }

  if (body.action === "send_card") {
    const view = viewRoomPlan(plan, await listCustomerPackages(plan.customerId));
    const notifyError = await notify(lineUserId, view);
    return NextResponse.json({ ok: !notifyError, notifyError });
  }

  if (body.action === "cancel") {
    const res = await cancelRoomPlan(plan.id);
    await logAudit({
      tenantId: requireTenantId(),
      actorType: "tenant",
      actorId: actor,
      action: "cancel_room_plan",
      resourceType: "room_plan",
      resourceId: plan.id,
      afterState: { ลูกค้า: plan.customerName },
    });
    return NextResponse.json(res);
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

/** หลังบ้านเท่านั้น — ทำงานในนามร้านของคนที่ล็อกอินอยู่ */
async function getAdminSession(req: NextRequest) {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handleGet(req));
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePost(req));
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePatch(req));
}
