import { NextRequest, NextResponse } from "next/server";
import { withResolvedTenant } from "@/lib/tenant-context";
import { featureOff } from "@/lib/features-server";
import {
  acceptBookingConsent,
  getBooking,
  listBookingsByCustomerName,
} from "@/lib/bookings-store";
import { bookingGroupKey } from "@/lib/booking-group";
import { splitVaccinePhotos } from "@/lib/vaccine-photos";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
import { requireCustomerSession, noCustomerSessionResponse } from "@/lib/customer-session";

/**
 * ลูกค้ากด "ยอมรับข้อตกลง" ก่อนเข้าพัก
 *
 * เดิมถ้าไม่ส่ง lineUserId มาเลย เงื่อนไข forbidden ใน acceptBookingConsent จะข้ามไปเฉยๆ
 * (เช็คเฉพาะตอนมีค่าส่งมาเทียบ) ใครก็เซ็นยอมรับแทนลูกค้าคนอื่นได้แค่รู้ bookingId
 * ต้องบังคับใช้ lineUserId จากคุกกี้เซสชันที่ตรวจแล้วจริงเท่านั้น
 */
async function postHandler(req: NextRequest) {
  // ร้านปิดเรื่องนี้ในตั้งค่า › เปิด/ปิดฟีเจอร์
  const blocked = await featureOff("consent");
  if (blocked) return blocked;
  const session = await requireCustomerSession(req);
  if (!session) {
    return noCustomerSessionResponse();
  }
  const body = await req.json().catch(() => ({}));
  const bookingId = String(body.bookingId || "").trim();
  const lineUserId = session.lineUserId;
  const careNote = String(body.careNote || "").trim();
  const signature = String(body.signature || "").trim();
  // แนบสมุดวัคซีนได้หลายรูป (vaccinePhotos) — ยังรับ vaccinePhoto รูปเดียวจากหน้าเก่าที่เปิดค้างไว้
  const vaccinePhotos: string[] = (
    Array.isArray(body.vaccinePhotos) ? body.vaccinePhotos : [body.vaccinePhoto]
  )
    .map((v: unknown) => String(v || "").trim())
    .filter(Boolean);
  const fleaTickTreated = Boolean(body.fleaTickTreated);
  if (!bookingId) {
    return NextResponse.json({ error: "bookingId required" }, { status: 400 });
  }

  const res = await acceptBookingConsent(
    bookingId,
    lineUserId,
    careNote,
    signature,
    vaccinePhotos,
    fleaTickTreated
  );
  if (!res.ok && res.error === "not_found") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!res.ok && res.error === "forbidden") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (res.ok) {
    const b = await getBooking(bookingId);
    // ลิงก์ข้อตกลงชี้นัดตัวแรกของบ้าน แต่ลูกค้ากดยอมรับครั้งเดียวสำหรับทั้งรอบเข้าพักนี้
    // → ประทับให้น้องทุกตัวในนัดเดียวกัน ไม่งั้นระบบเห็นว่าตัวอื่น "ยังไม่กด" แล้วขอซ้ำทุกรอบ
    // (สมุดวัคซีนเป็นของแต่ละตัว จึงไม่คัดลอกไปให้ตัวอื่น)
    if (b) {
      const key = bookingGroupKey(b);
      const siblings = (await listBookingsByCustomerName(b.customerName)).filter(
        (x) =>
          x.id !== b.id &&
          !x.consentAcceptedAt &&
          x.status !== "cancelled" &&
          bookingGroupKey(x) === key
      );
      for (const x of siblings) {
        await acceptBookingConsent(x.id, lineUserId, careNote, b.consentSignature, [], fleaTickTreated);
      }
    }
    if (b) {
      const groom = b.service === "groom";
      await sendTelegram(
        formatBookingTelegram(groom ? "✅ ลูกค้ายอมรับข้อตกลงก่อนอาบน้ำแล้ว" : "✅ ลูกค้ายอมรับข้อตกลงก่อนเข้าพักแล้ว", {
          น้องแมว: b.catName,
          ลูกค้า: b.customerName,
          ...(groom
            ? { นัดอาบน้ำ: `${b.date || "-"}${b.time ? ` ${b.time}` : ""}` }
            : { เข้าพัก: `${b.checkin || b.date || "-"}${b.checkout ? ` → ${b.checkout}` : ""}` }),
          ลายเซ็น: signature ? "มี ✍️" : "ไม่ได้เซ็น",
          ...(groom
            ? {}
            : { หยดยาเห็บหมัด: fleaTickTreated ? "✅ ลูกค้ายืนยันว่าหยดมาแล้ว" : "❌ ยังไม่ได้หยด/ไม่ระบุ" }),
          ...(b.vaccinePhotoUrl ? { สมุดวัคซีน: `แนบรูปมาแล้ว ${splitVaccinePhotos(b.vaccinePhotoUrl).length} รูป 📸` } : {}),
          ...(careNote ? { "การดูแลเพิ่มเติม": careNote } : {}),
        })
      );
    }
  }

  return NextResponse.json({
    ok: res.ok,
    acceptedAt: res.ok ? res.acceptedAt : undefined,
    needSql: !res.ok && res.error === "need_sql",
  });
}

// R1/R3: resolve ร้านจาก request (header/cookie) ก่อนเข้า handler
export function POST(req: NextRequest) { return withResolvedTenant(req, () => postHandler(req)); }
