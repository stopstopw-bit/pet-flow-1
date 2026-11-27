import { NextRequest, NextResponse } from "next/server";
import { confirmHouseholdFrom } from "@/lib/booking-confirm";
import { withResolvedTenant } from "@/lib/tenant-context";
import { featureOff } from "@/lib/features-server";
import {
  acceptBookingConsent,
  getBooking,
  listBookingsByCustomerName,
} from "@/lib/bookings-store";
import { bookingGroupKey, stayForGroom } from "@/lib/booking-group";
import { MAX_VACCINE_PHOTOS, splitVaccinePhotos } from "@/lib/vaccine-photos";
import { sendTelegramLater, formatBookingTelegram, type TelegramPhotoGroup } from "@/lib/telegram";
import { copyBookingDocsToCustomer, findCustomerByLine } from "@/lib/customers-store";
import { saveFleaProof } from "@/lib/flea-proof-server";
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
  // บ้านหลายตัว: สมุดวัคซีนแนบแยกทีละตัว { [bookingId]: รูป[] }
  const byBooking: Record<string, string[]> = {};
  if (body.vaccinePhotosByBooking && typeof body.vaccinePhotosByBooking === "object") {
    for (const [id, list] of Object.entries(body.vaccinePhotosByBooking as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      const urls = list.map((v) => String(v || "").trim()).filter(Boolean).slice(0, MAX_VACCINE_PHOTOS);
      if (urls.length) byBooking[String(id)] = urls;
    }
  }
  const fleaTickTreated = Boolean(body.fleaTickTreated);
  // ลูกค้าเพิ่งแนบบัตรประชาชนในหน้านี้ → ส่งรูปบัตรตามข้อความสรุปใน Telegram
  const idCardNew = Boolean(body.idCardNew);
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
    // (สมุดวัคซีนเป็นของแต่ละตัว — ไม่คัดลอกข้ามตัว ใช้รูปที่แนบให้ตัวนั้นเอง)
    let bathCount = 0;
    // รูปที่ลูกค้าแนบมารอบนี้ — ส่งตามข้อความสรุปใน Telegram
    const photos: TelegramPhotoGroup[] = [];
    /** น้องในรอบเข้าพักนี้ — รูปหลักฐานหยดยาเก็บไว้ที่ตัวน้องเหล่านี้ */
    const stayCats: string[] = [];
    if (b) {
      if (res.vaccineAdded.length) {
        photos.push({ urls: res.vaccineAdded, caption: `💉 สมุดวัคซีน ${b.catName}` });
      }
      // อาบน้ำ: ทั้งบ้านในวันเดียวกันนับเป็นนัดเดียว แม้น้องแต่ละตัวได้คนละรอบเวลา (ช่องเต็มเลยแยกรอบ)
      // ไม่งั้นลูกค้ากดยอมรับแล้ว ตัวที่อยู่อีกรอบยังขึ้น "ยังไม่กด" ให้เซ็นซ้ำ
      const key = bookingGroupKey(b, { groomByDay: true });
      const mine = await listBookingsByCustomerName(b.customerName);
      const siblings = mine.filter(
        (x) =>
          x.id !== b.id &&
          !x.consentAcceptedAt &&
          x.status !== "cancelled" &&
          bookingGroupKey(x, { groomByDay: true }) === key
      );
      stayCats.push(b.catName, ...siblings.map((x) => x.catName));
      // ข้อตกลง + สมุดวัคซีนที่แนบมา ยกขึ้นตัวน้อง/ลูกค้าด้วย — หน้าข้อมูลลูกค้าจะได้ขึ้น "ได้รับแล้ว"
      await copyBookingDocsToCustomer(b, { newPhotos: res.vaccineAdded });
      for (const x of siblings) {
        const r = await acceptBookingConsent(
          x.id,
          lineUserId,
          careNote,
          b.consentSignature,
          byBooking[x.id] || [],
          fleaTickTreated
        );
        const fresh = r.ok ? await getBooking(x.id) : undefined;
        if (fresh && r.ok) await copyBookingDocsToCustomer(fresh, { newPhotos: r.vaccineAdded });
        if (r.ok && r.vaccineAdded.length) {
          photos.push({ urls: r.vaccineAdded, caption: `💉 สมุดวัคซีน ${x.catName}` });
        }
      }
      // อาบน้ำก่อนกลับของรอบนี้: หน้าข้อตกลงเข้าพักแสดงข้อตกลงอาบน้ำด้วยแล้ว → ประทับนัดอาบน้ำไปพร้อมกัน
      if (b.service === "room") {
        const stays = [b, ...siblings];
        const baths = mine.filter(
          (x) => !x.consentAcceptedAt && stays.some((s) => stayForGroom(x, [s]) === s)
        );
        for (const x of baths) {
          const r = await acceptBookingConsent(x.id, lineUserId, careNote, b.consentSignature, [], false);
          if (r.ok) bathCount++;
        }
      }
    }
    // ยอมรับข้อตกลงแล้ว = ยืนยันนัดแล้ว ทั้งบ้าน
    await confirmHouseholdFrom(bookingId);
    if (b) {
      const groom = b.service === "groom";
      // รูปหลักฐานหยดยาเห็บหมัด (ไม่บังคับ) — ต่อท้ายรูปอื่นใน Telegram + เก็บที่ตัวน้อง
      let fleaCount = 0;
      if (!groom && Array.isArray(body.fleaPhotos) && body.fleaPhotos.length) {
        const me = await findCustomerByLine(lineUserId).catch(() => undefined);
        const urls = await saveFleaProof(me, body.fleaPhotos, stayCats.length ? stayCats : [b.catName]);
        fleaCount = urls.length;
        if (urls.length) photos.push({ urls, caption: `🐛 หลักฐานหยดยาเห็บหมัด ${b.catName}` });
      }
      if (idCardNew && lineUserId) {
        const me = await findCustomerByLine(lineUserId).catch(() => undefined);
        if (me?.idCardUrl) photos.push({ urls: [me.idCardUrl], caption: `🪪 บัตรประชาชน ${me.name}` });
      }
      sendTelegramLater(
        formatBookingTelegram(groom ? "✅ ลูกค้ายอมรับข้อตกลงก่อนอาบน้ำแล้ว" : "✅ ลูกค้ายอมรับข้อตกลงก่อนเข้าพักแล้ว", {
          น้อง: b.catName,
          ลูกค้า: b.customerName,
          ...(groom
            ? { นัดอาบน้ำ: `${b.date || "-"}${b.time ? ` ${b.time}` : ""}` }
            : { เข้าพัก: `${b.checkin || b.date || "-"}${b.checkout ? ` → ${b.checkout}` : ""}` }),
          ลายเซ็น: signature ? "มี ✍️" : "ไม่ได้เซ็น",
          ...(bathCount ? { อาบน้ำก่อนกลับ: "✅ ยอมรับข้อตกลงอาบน้ำด้วยแล้ว" } : {}),
          ...(groom
            ? {}
            : {
                ป้องกันเห็บหมัด: fleaTickTreated ? "✅ ลูกค้ายืนยันว่าทำมาแล้ว (หยด/ทาน/ฉีด)" : "❌ ยังไม่ได้ทำ/ไม่ระบุ",
                ...(fleaCount ? { หลักฐานหยดยา: `แนบรูป ${fleaCount} รูป 📸` } : {}),
              }),
          ...(b.vaccinePhotoUrl ? { สมุดวัคซีน: `แนบรูปมาแล้ว ${splitVaccinePhotos(b.vaccinePhotoUrl).length} รูป 📸` } : {}),
          ...(careNote ? { "การดูแลเพิ่มเติม": careNote } : {}),
        }),
        undefined,
        photos
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
