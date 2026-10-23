import { NextRequest, NextResponse } from "next/server";
import {
  findCustomerByLine,
  getCustomer,
  referralCodeFor,
} from "@/lib/customers-store";
import {
  listCustomerCoupons,
  activeCustomerCoupons,
  issueCoupon,
} from "@/lib/coupons-store";
import { getLineCredentials } from "@/lib/line-config";
import { buildLiffUrl } from "@/lib/liff-urls";
import { getSiteConfig } from "@/lib/config-store";
import { isFeatureOn } from "@/lib/features";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { withResolvedTenant, withTenant } from "@/lib/tenant-context";
import { requireCustomerSession } from "@/lib/customer-session";

async function getAdminSession(req: NextRequest) {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}

/** กระเป๋าคูปองของลูกค้า + รหัสชวนเพื่อน (เรียกจากแอปด้วย lineUserId, หรือหลังบ้านด้วย customerId) */
export async function GET(req: NextRequest) {
  const session = await getAdminSession(req);
  if (session) return withTenant(session.tenantId, () => handleGet(req, true));
  return withResolvedTenant(req, () => handleGet(req, false));
}

async function handleGet(req: NextRequest, isAdmin: boolean) {
  // ลูกค้า: ดูได้เฉพาะของตัวเองจากคุกกี้ที่ตรวจกับ LINE แล้ว — ห้ามเชื่อ lineUserId/customerId ใน query
  const lineUserId = isAdmin
    ? req.nextUrl.searchParams.get("lineUserId")?.trim()
    : (await requireCustomerSession(req))?.lineUserId;
  const customerId = isAdmin ? req.nextUrl.searchParams.get("customerId")?.trim() : undefined;
  const activeOnly = req.nextUrl.searchParams.get("active") === "1";

  const cust = customerId
    ? await getCustomer(customerId)
    : lineUserId
      ? await findCustomerByLine(lineUserId)
      : undefined;
  if (!cust) return NextResponse.json({ found: false, coupons: [] });

  const coupons = activeOnly
    ? await activeCustomerCoupons(cust.id)
    : await listCustomerCoupons(cust.id);
  // ร้านปิด "ชวนเพื่อนรับคูปอง" — ไม่ส่งลิงก์ชวนเพื่อนให้แอป
  const referralOn = isFeatureOn(await getSiteConfig(), "referral");
  const referralCode = referralOn ? referralCodeFor(cust.id) : "";
  const liffId = referralOn ? (await getLineCredentials())?.liffId : undefined;
  const referralUrl = liffId
    ? buildLiffUrl(liffId, { path: "register", ref: referralCode })
    : "";
  return NextResponse.json({
    found: true,
    customerId: cust.id,
    referralCode,
    referralUrl,
    coupons,
  });
}

/** ออกคูปองด้วยมือจากหลังบ้าน (แจกลูกค้าพิเศษ / โปร) */
export async function POST(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const customerId = String(body.customerId || "").trim();
  const amount = Math.round(Number(body.amount) || 0);
  const reason = String(body.reason || "").trim() || "คูปองส่วนลดจากร้าน";
  const expiresInDays = Number(body.expiresInDays) || 60;
  if (!customerId || amount <= 0) {
    return NextResponse.json({ error: "customerId + amount required" }, { status: 400 });
  }
  const cust = await getCustomer(customerId);
  if (!cust) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const coupon = await issueCoupon({ customerId, amount, reason, expiresInDays });
  await sendTelegram(
    formatBookingTelegram("🎁 ออกคูปองให้ลูกค้า (มือ)", {
      ลูกค้า: cust.name,
      มูลค่า: `${amount} บาท`,
      เหตุผล: reason,
    })
  );
  return NextResponse.json({ ok: true, coupon });
}
