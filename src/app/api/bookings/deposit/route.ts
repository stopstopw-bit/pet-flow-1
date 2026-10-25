import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { withResolvedTenant, withTenant } from "@/lib/tenant-context";
import { getSiteConfig } from "@/lib/config-store";
import { cleanPromptpayId, promptpayPayload } from "@/lib/promptpay";
import { depositAmountFor, cleanDepositStatus } from "@/lib/booking-deposit";
import { saveDepositSlip, depositTelegramLine } from "@/lib/booking-deposit-server";
import { getBooking, listBookingsByCustomerName, setBookingsDeposit } from "@/lib/bookings-store";
import { bookingGroupKey } from "@/lib/booking-group";
import { requireCustomerSession, noCustomerSessionResponse } from "@/lib/customer-session";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * มัดจำตอนลูกค้าจองเอง
 * - GET  ?service=groom|room  → ยอดมัดจำ + QR พร้อมเพย์ตามยอด (หน้าจองของลูกค้า)
 * - POST { ids, slip }        → ลูกค้าแนบสลิปทีหลัง (เฉพาะนัดของตัวเอง) → รอตรวจสลิป
 * - PATCH { ids, status }     → หลังบ้านกด "มัดจำแล้ว" / ย้อนสถานะ (ทั้งกลุ่มทีเดียว)
 */
export async function GET(req: NextRequest) {
  return withResolvedTenant(req, () => handleGet(req));
}

async function handleGet(req: NextRequest) {
  const service = req.nextUrl.searchParams.get("service") === "room" ? "room" : "groom";
  const cfg = await getSiteConfig();
  const amount = depositAmountFor(cfg.bookingDeposit, service);
  if (!amount) return NextResponse.json({ amount: 0 });
  const bank = {
    bankName: cfg.payment?.bankName || "",
    accountNumber: cfg.payment?.accountNumber || "",
    accountName: cfg.payment?.accountName || "",
  };
  const id = cleanPromptpayId(cfg.payment?.promptpayId);
  if (!id) return NextResponse.json({ amount, ...bank });
  const dataUrl = await QRCode.toDataURL(promptpayPayload(id, amount), { margin: 1, width: 480 });
  const masked = id.length === 10 ? `${id.slice(0, 3)}-xxx-${id.slice(6)}` : `x-xxxx-xxxxx-${id.slice(10)}`;
  return NextResponse.json({ amount, qr: dataUrl, promptpay: masked, ...bank });
}

function cleanIds(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 20) : [];
}

export async function POST(req: NextRequest) {
  return withResolvedTenant(req, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const session = await requireCustomerSession(req);
  if (!session) return noCustomerSessionResponse();
  const body = await req.json().catch(() => ({}));
  const ids = cleanIds(body.ids);
  if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });

  // แนบได้เฉพาะนัดของตัวเองที่มียอดมัดจำ และร้านยังไม่ได้กดรับมัดจำ
  const own = [];
  for (const id of ids) {
    const b = await getBooking(id);
    if (b && b.lineUserId === session.lineUserId && b.depositAmount && b.depositStatus !== "paid") own.push(b);
  }
  if (!own.length) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const url = await saveDepositSlip(String(body.slip || ""));
  if (!url) return NextResponse.json({ error: "bad_slip" }, { status: 400 });

  const res = await setBookingsDeposit(
    own.map((b) => b.id),
    { depositSlipUrl: url, depositStatus: "pending_review" },
    session.lineUserId
  );
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 503 });

  const first = own[0];
  await sendTelegram(
    formatBookingTelegram("📎 ลูกค้าแนบสลิปมัดจำ (รอตรวจ)", {
      ลูกค้า: first.customerName,
      น้อง: own.map((b) => b.catName).join(", "),
      วันที่: `${first.checkin || first.date}${first.checkout ? ` → ${first.checkout}` : ""}`,
      ...depositTelegramLine({ depositAmount: first.depositAmount, depositSlipUrl: url, depositStatus: "pending_review" }),
    })
  );
  return NextResponse.json({ ok: true, count: res.updated.length });
}

export async function PATCH(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePatch(req));
}

async function handlePatch(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ids = cleanIds(body.ids);
  if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
  const status = cleanDepositStatus(body.status);
  // ขยายให้ครบทั้งกลุ่มที่จองด้วยกัน (บ้านเดียว วันเดียว บริการเดียว และมียอดมัดจำ) —
  // เปิดจากหน้าไหนก็ตาม (ปฏิทิน/หน้าลูกค้า) กดครั้งเดียวต้องอัปเดตครบทุกตัว
  const all = new Set(ids);
  for (const id of ids) {
    const b = await getBooking(id);
    if (!b) continue;
    const key = bookingGroupKey(b, { groomByDay: true });
    for (const x of await listBookingsByCustomerName(b.customerName)) {
      if (x.depositAmount && x.status !== "cancelled" && bookingGroupKey(x, { groomByDay: true }) === key) {
        all.add(x.id);
      }
    }
  }
  const res = await setBookingsDeposit([...all], { depositStatus: status });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 503 });
  if (!res.updated.length) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, count: res.updated.length, status });
}
