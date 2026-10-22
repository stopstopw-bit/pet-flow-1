import { NextRequest, NextResponse } from "next/server";
import { withResolvedTenant } from "@/lib/tenant-context";
import { addBookingVaccinePhotos, getBooking } from "@/lib/bookings-store";
import { findCustomerByLine } from "@/lib/customers-store";
import { bookingMatchesCustomer } from "@/lib/booking-customer-match";
import { requireCustomerSession } from "@/lib/customer-session";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";

/**
 * ลูกค้าแนบรูปสมุดวัคซีนจากลิงก์ "ขอสมุดวัคซีน" ที่ร้านส่งให้ทาง LINE
 * ต่อท้ายรูปเดิมของนัดนั้น (ไม่ต้องเซ็นข้อตกลงซ้ำ) — รูปเข้า bucket ส่วนตัว
 * ตัวตนยึดจากคุกกี้เซสชันลูกค้าที่ตรวจกับ LINE แล้วเท่านั้น และต้องเป็นนัดของตัวเอง
 */
async function postHandler(req: NextRequest) {
  const session = await requireCustomerSession(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const bookingId = String(body.bookingId || "").trim();
  const photos: string[] = Array.isArray(body.photos)
    ? body.photos.map((v: unknown) => String(v || ""))
    : [];
  if (!bookingId) return NextResponse.json({ error: "bookingId required" }, { status: 400 });

  const b = await getBooking(bookingId);
  if (!b) return NextResponse.json({ error: "not found" }, { status: 404 });
  let owns = !!b.lineUserId && b.lineUserId === session.lineUserId;
  if (!owns && !b.lineUserId) {
    // นัดที่ร้านลงให้ยังไม่ผูก LINE — จับคู่ผ่านลูกค้าที่ผูก LINE นี้ (ชื่อลูกค้า + ชื่อน้อง)
    const me = await findCustomerByLine(session.lineUserId);
    owns = !!me && bookingMatchesCustomer(b, me);
  }
  if (!owns) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const res = await addBookingVaccinePhotos(b.id, photos);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.error === "no_photo" ? "no photo" : "save failed" },
      { status: res.error === "no_photo" ? 400 : 500 }
    );
  }
  await sendTelegram(
    formatBookingTelegram("💉 ลูกค้าแนบสมุดวัคซีนแล้ว", {
      น้อง: b.catName,
      ลูกค้า: b.customerName,
      วันที่: `${b.checkin || b.date || "-"}${b.checkout ? ` → ${b.checkout}` : ""}`,
      สมุดวัคซีน: `แนบเพิ่ม ${res.added} รูป (รวม ${res.urls.length} รูป) 📸`,
    })
  );
  return NextResponse.json({ ok: true, count: res.urls.length });
}

export function POST(req: NextRequest) {
  return withResolvedTenant(req, () => postHandler(req));
}
