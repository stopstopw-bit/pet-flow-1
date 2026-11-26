import { NextRequest, NextResponse } from "next/server";
import { requireCustomerSession, noCustomerSessionResponse } from "@/lib/customer-session";
import { withResolvedTenant } from "@/lib/tenant-context";
import { featureOff } from "@/lib/features-server";
import { findCustomerByLine, setCustomerIdCard } from "@/lib/customers-store";
import { uploadPrivateDataUrl } from "@/lib/supabase/storage";
import { formatBookingTelegram, sendTelegramLater } from "@/lib/telegram";
import { getSiteConfig } from "@/lib/config-store";

/**
 * ลูกค้าแนบรูปบัตรประชาชน (ผู้ปกครองน้องแมว) สำหรับลงทะเบียนเข้าพัก
 * รูปที่ส่งมามีข้อความขีดทับฝังไว้แล้วจากฝั่งเครื่องลูกค้า (lib/id-card-watermark)
 */
export async function POST(req: NextRequest) {
  return withResolvedTenant(req, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  // ร้านปิดเรื่องนี้ในตั้งค่า › เปิด/ปิดฟีเจอร์
  const blocked = await featureOff("idCard");
  if (blocked) return blocked;
  const session = await requireCustomerSession(req);
  if (!session) return noCustomerSessionResponse();
  const lineUserId = session.lineUserId;
  const body = await req.json().catch(() => ({}));
  const image = String(body.image || "");
  if (!image.startsWith("data:image/")) {
    return NextResponse.json({ error: "image required" }, { status: 400 });
  }
  const c = await findCustomerByLine(lineUserId);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const url = await uploadPrivateDataUrl(`id-cards/${c.id}-${Date.now()}`, image);
  const res = await setCustomerIdCard(c.id, url);
  if (!res.ok) return NextResponse.json({ error: res.error, needSql: true }, { status: 500 });
  // หน้าข้อตกลงส่ง notify:false — รูปบัตรจะไปพร้อมข้อความสรุปตอนกดยอมรับแทน (ไม่ส่งซ้ำ)
  // แจ้งเฉพาะร้านที่เปิด ตั้งค่า › อัตโนมัติ › ส่งรูปเข้า Telegram (ร้านเดิมไม่มีข้อความใหม่โผล่)
  const cfg = await getSiteConfig().catch(() => null);
  if (body.notify !== false && cfg?.automation?.telegramDocPhotos === true) {
    sendTelegramLater(formatBookingTelegram("🪪 ลูกค้าแนบบัตรประชาชนแล้ว", { ลูกค้า: c.name }), undefined, [
      { urls: [url], caption: `🪪 บัตรประชาชน ${c.name}` },
    ]);
  }
  return NextResponse.json({ ok: true, url });
}
