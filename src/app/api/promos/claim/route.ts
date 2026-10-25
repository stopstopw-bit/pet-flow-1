import { NextRequest, NextResponse } from "next/server";
import { featureOff } from "@/lib/features-server";
import { withResolvedTenant } from "@/lib/tenant-context";
import { claimCustomerPromo } from "@/lib/promos-store";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
import { requireCustomerSession, noCustomerSessionResponse } from "@/lib/customer-session";

/** ลูกค้ากดใช้โปรจากหน้าแอป */
async function postHandler(req: NextRequest) {
  const session = await requireCustomerSession(req);
  if (!session) {
    return noCustomerSessionResponse();
  }
  const blocked = await featureOff("promos");
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({}));
  const promoId = String(body.promoId || "").trim();

  if (!promoId) {
    return NextResponse.json({ error: "promoId required" }, { status: 400 });
  }

  const result = await claimCustomerPromo(promoId, session.lineUserId, "app");
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await sendTelegram(
    formatBookingTelegram("🎁 ลูกค้ากดใช้โปรโมชั่นแล้ว", {
      ลูกค้า: result.claim.customerName,
      โปรโมชั่น: result.claim.promoTitle,
      ...(result.pointsAwarded > 0 ? { แต้มที่ได้: `${result.pointsAwarded} แต้ม` } : {}),
      ...(result.promo.couponCode ? { คูปอง: result.promo.couponCode } : {}),
    })
  );

  return NextResponse.json({
    ok: true,
    claim: result.claim,
    promo: result.promo,
    couponCode: result.promo.couponCode,
    pointsAwarded: result.pointsAwarded,
    newPoints: result.newPoints,
  });
}

// R1/R3: resolve ร้านจาก request (header/cookie) ก่อนเข้า handler
export function POST(req: NextRequest) { return withResolvedTenant(req, () => postHandler(req)); }
