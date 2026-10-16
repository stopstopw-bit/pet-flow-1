import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSiteConfig } from "@/lib/config-store";
import { cleanPromptpayId, promptpayPayload } from "@/lib/promptpay";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { withTenant } from "@/lib/tenant-context";

/** QR พร้อมเพย์ตามยอด ?amount=… — ใช้เลขพร้อมเพย์จากตั้งค่า › การชำระเงิน */
async function handleGet(req: NextRequest) {
  const amount = Math.max(0, Number(req.nextUrl.searchParams.get("amount")) || 0);
  const cfg = await getSiteConfig();
  const id = cleanPromptpayId(cfg.payment?.promptpayId);
  if (!id) return NextResponse.json({ error: "no_promptpay" }, { status: 404 });
  const dataUrl = await QRCode.toDataURL(promptpayPayload(id, amount), { margin: 1, width: 480 });
  const masked = id.length === 10 ? `${id.slice(0, 3)}-xxx-${id.slice(6)}` : `x-xxxx-xxxxx-${id.slice(10)}`;
  return NextResponse.json({ dataUrl, amount, account: masked, name: cfg.payment?.accountName || "" });
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
