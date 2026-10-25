import { NextRequest, NextResponse } from "next/server";
import { withResolvedTenant } from "@/lib/tenant-context";
import { featureOff } from "@/lib/features-server";
import { requireCustomerSession, noCustomerSessionResponse } from "@/lib/customer-session";
import { findCustomerByLine, setCustomerConsent } from "@/lib/customers-store";
import { sendTelegramLater, formatBookingTelegram } from "@/lib/telegram";

/**
 * ลูกค้ากดยอมรับข้อตกลงของร้านจากลิงก์ที่ส่งจากหน้าข้อมูลลูกค้า (ยังไม่มีนัด)
 * เก็บครั้งล่าสุดไว้ที่ลูกค้า — ตัวตนยึดจากคุกกี้เซสชันลูกค้าเท่านั้น
 */
async function postHandler(req: NextRequest) {
  // ร้านปิดเรื่องนี้ในตั้งค่า › เปิด/ปิดฟีเจอร์
  const blocked = await featureOff("consent");
  if (blocked) return blocked;
  const session = await requireCustomerSession(req);
  if (!session) return noCustomerSessionResponse();
  const body = await req.json().catch(() => ({}));
  const signature = String(body.signature || "").trim();
  const careNote = String(body.careNote || "").trim().slice(0, 2000);
  const fleaTick = Boolean(body.fleaTickTreated);
  if (!signature) return NextResponse.json({ error: "signature required" }, { status: 400 });
  const me = await findCustomerByLine(session.lineUserId);
  if (!me) return NextResponse.json({ error: "not found" }, { status: 404 });
  const res = await setCustomerConsent(me.id, { signature, careNote, fleaTick });
  if (res.ok) {
    sendTelegramLater(
      formatBookingTelegram("✅ ลูกค้ายอมรับข้อตกลงของร้านแล้ว (ก่อนลงนัด)", {
        ลูกค้า: me.name,
        น้อง: me.cats.map((c) => c.name).join(", ") || "-",
        หยดยาเห็บหมัด: fleaTick ? "✅ ลูกค้ายืนยันว่าหยดมาแล้ว" : "❌ ยังไม่ได้หยด/ไม่ระบุ",
        ...(careNote ? { "การดูแลเพิ่มเติม": careNote } : {}),
      })
    );
  }
  return NextResponse.json({ ok: res.ok, needSql: !res.ok });
}

export function POST(req: NextRequest) {
  return withResolvedTenant(req, () => postHandler(req));
}
