import { NextRequest, NextResponse } from "next/server";
import { withResolvedTenant } from "@/lib/tenant-context";
import { featureOff } from "@/lib/features-server";
import { requireCustomerSession } from "@/lib/customer-session";
import { addCatVaccinePhotos, findCustomerByLine } from "@/lib/customers-store";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";

/**
 * ลูกค้าแนบสมุดวัคซีนให้น้องของตัวเอง จากลิงก์ที่ร้านส่งจากหน้าข้อมูลลูกค้า (ยังไม่ต้องมีนัด)
 * ตัวตนยึดจากคุกกี้เซสชันลูกค้า — แนบได้เฉพาะน้องในบัญชีตัวเอง รูปเข้า bucket ส่วนตัว
 */
async function postHandler(req: NextRequest) {
  // ร้านปิดเรื่องนี้ในตั้งค่า › เปิด/ปิดฟีเจอร์
  const blocked = await featureOff("vaccine");
  if (blocked) return blocked;
  const session = await requireCustomerSession(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const catId = String(body.catId || "").trim();
  const photos: string[] = Array.isArray(body.photos)
    ? body.photos.map((v: unknown) => String(v || ""))
    : [];
  const me = await findCustomerByLine(session.lineUserId);
  if (!me || !me.cats.some((c) => c.id === catId)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const res = await addCatVaccinePhotos(me.id, catId, photos);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.error === "no_photo" ? "no photo" : "save failed" },
      { status: res.error === "no_photo" ? 400 : 500 }
    );
  }
  await sendTelegram(
    formatBookingTelegram("💉 ลูกค้าแนบสมุดวัคซีนแล้ว", {
      น้อง: res.cat.name,
      ลูกค้า: me.name,
      สมุดวัคซีน: `แนบเพิ่ม ${res.added} รูป (รวม ${res.urls.length} รูป) 📸`,
    })
  );
  return NextResponse.json({ ok: true, count: res.urls.length });
}

export function POST(req: NextRequest) {
  return withResolvedTenant(req, () => postHandler(req));
}
