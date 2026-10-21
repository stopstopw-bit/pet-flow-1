import { NextRequest, NextResponse } from "next/server";
import { featureOff } from "@/lib/features-server";
import { withResolvedTenant } from "@/lib/tenant-context";
import { findCustomerByLine } from "@/lib/customers-store";
import { getOffer, claimOffer } from "@/lib/coupons-store";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
import { requireCustomerSession } from "@/lib/customer-session";

/** ข้อมูลแคมเปญคูปอง (สำหรับหน้ากดรับ) */
async function getHandler(req: NextRequest) {
  const offerId = req.nextUrl.searchParams.get("offer")?.trim();
  if (!offerId) return NextResponse.json({ error: "offer required" }, { status: 400 });
  const offer = await getOffer(offerId);
  if (!offer) return NextResponse.json({ found: false });
  return NextResponse.json({
    found: true,
    offer: {
      id: offer.id,
      title: offer.title,
      amount: offer.amount,
      reason: offer.reason,
      validDays: offer.validDays,
      active: offer.active,
    },
  });
}

/** ลูกค้ากดรับคูปอง */
async function postHandler(req: NextRequest) {
  const session = await requireCustomerSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const blocked = await featureOff("coupons");
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({}));
  const offerId = String(body.offerId || "").trim();
  if (!offerId) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  const cust = await findCustomerByLine(session.lineUserId);
  if (!cust) return NextResponse.json({ error: "no_customer" }, { status: 404 });

  const res = await claimOffer(offerId, cust.id);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.error, alreadyClaimed: res.error === "already_claimed" },
      { status: res.error === "already_claimed" ? 200 : 400 }
    );
  }
  const offer = await getOffer(offerId);
  await sendTelegram(
    formatBookingTelegram("🎟️ ลูกค้ากดรับคูปองแล้ว", {
      ลูกค้า: cust.name,
      แคมเปญ: offer?.title || offerId,
      มูลค่า: `${(res.coupon?.amount ?? offer?.amount ?? 0).toLocaleString()} บาท`,
      รหัสคูปอง: res.coupon?.id || "-",
    })
  );
  return NextResponse.json({ ok: true, coupon: res.coupon });
}

// R1/R3: resolve ร้านจาก request (header/cookie) ก่อนเข้า handler
export function GET(req: NextRequest) { return withResolvedTenant(req, () => getHandler(req)); }
export function POST(req: NextRequest) { return withResolvedTenant(req, () => postHandler(req)); }
