import { NextRequest, NextResponse } from "next/server";
import { withResolvedTenant } from "@/lib/tenant-context";
import { featureOff } from "@/lib/features-server";
import { getBooking, listBookings, setBookingTime, updateBooking } from "@/lib/bookings-store";
import { bookingGroupKey, groupCatNames, stayForGroom } from "@/lib/booking-group";
import { sendTelegramLater, formatBookingTelegram } from "@/lib/telegram";
import { requireCustomerSession, noCustomerSessionResponse } from "@/lib/customer-session";

/** นัดของบ้านเดียวกันที่เข้าพักรอบเดียวกัน (รวมตัวที่กดลิงก์มาด้วย) */
async function householdSiblings(b: Awaited<ReturnType<typeof getBooking>>) {
  if (!b) return [];
  const key = bookingGroupKey(b);
  const all = await listBookings();
  const same = all.filter((x) => x.status !== "cancelled" && bookingGroupKey(x) === key);
  return same.length > 0 ? same : [b];
}

/** ดึงข้อมูลนัดสำหรับหน้าเลือกเวลา */
async function getHandler(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const b = await getBooking(id);
  if (!b) return NextResponse.json({ found: false });
  // เข้าพักพร้อมกันทั้งบ้าน = เลือกเวลาครั้งเดียวใช้ทุกตัว จึงโชว์ชื่อครบ
  const siblings = await householdSiblings(b);
  return NextResponse.json({
    found: true,
    booking: {
      id: b.id,
      catName: groupCatNames(siblings),
      service: b.service,
      checkin: b.checkin || b.date,
      checkout: b.checkout,
      arrivalTime: b.arrivalTime,
      pickupTime: b.pickupTime,
      // ร้านไปรับ/ไปส่งเอง → หน้าเลือกเวลาเปลี่ยนคำให้ตรง (ส่งแค่ว่ามีไหม ไม่ส่งที่อยู่)
      shopPickup: !!b.transport?.pickup,
      shopDropoff: !!b.transport?.dropoff,
    },
  });
}

/** ลูกค้าเลือกเวลามาส่ง/รับน้อง */
async function postHandler(req: NextRequest) {
  // ร้านปิดเรื่องนี้ในตั้งค่า › เปิด/ปิดฟีเจอร์
  const blocked = await featureOff("checkinTime");
  if (blocked) return blocked;
  const session = await requireCustomerSession(req);
  if (!session) {
    return noCustomerSessionResponse();
  }
  const body = await req.json().catch(() => ({}));
  const bookingId = String(body.bookingId || "").trim();
  const type = body.type === "checkout" ? "checkout" : "checkin";
  const time = String(body.time || "").trim();
  if (!bookingId || !time) {
    return NextResponse.json({ error: "bookingId + time required" }, { status: 400 });
  }

  const res = await setBookingTime(bookingId, type, time, session.lineUserId);
  // ลูกค้าเลือกเวลาให้ "รอบเข้าพัก" ไม่ใช่ให้แมวตัวเดียว — ตัวอื่นในบ้านต้องได้เวลาเดียวกัน
  // ไม่งั้นพรุ่งนี้ระบบจะถามซ้ำสำหรับตัวที่เหลือ
  let confirmedNow = false;
  if (res.ok && res.booking) {
    const siblings = await householdSiblings(res.booking);
    for (const sib of siblings) {
      if (sib.id === bookingId) continue;
      await setBookingTime(sib.id, type, time, session.lineUserId);
    }
    // เลือกเวลามาส่งน้อง = ยืนยันกับร้านแล้ว (cron ก็ถือแบบนี้ ไม่ส่งการ์ดกำหนดการนัดให้อีก)
    // เมื่อก่อนสถานะค้าง "รอยืนยัน" ทั้งที่ลูกค้าทำครบ เพราะนัดเข้าพักส่วนใหญ่ไม่ได้การ์ดที่มีปุ่มยืนยัน
    // อาบน้ำก่อนกลับของรอบเข้าพักนี้ยืนยันไปด้วย (เป็นนัดเดียวกัน)
    if (type === "checkin") {
      const all = await listBookings();
      const stayIds = new Set(siblings.map((x) => x.id));
      const baths = all.filter((g) => {
        const stay = stayForGroom(g, all);
        return !!stay && stayIds.has(stay.id);
      });
      for (const x of [...siblings, ...baths]) {
        if (x.status !== "pending") continue;
        await updateBooking(x.id, { status: "confirmed" });
        confirmedNow = true;
      }
    }
  }
  if (!res.ok && res.error === "not_found") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!res.ok && res.error === "forbidden") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const b = res.booking;
  if (b) {
    sendTelegramLater(
      formatBookingTelegram(
        type === "checkin"
          ? `🕒 ลูกค้าเลือกเวลาส่งน้อง${confirmedNow ? " (ยืนยันนัดแล้ว)" : ""}`
          : "🕒 ลูกค้าเลือกเวลารับน้อง",
        {
          น้อง: b.catName,
          ลูกค้า: b.customerName,
          เวลา: time,
          วันที่: type === "checkin" ? b.checkin || b.date || "-" : b.checkout || "-",
        }
      )
    );
  }

  return NextResponse.json({ ok: res.ok, needSql: !res.ok && res.error === "need_sql" });
}

// R1/R3: resolve ร้านจาก request (header/cookie) ก่อนเข้า handler
export function GET(req: NextRequest) { return withResolvedTenant(req, () => getHandler(req)); }
export function POST(req: NextRequest) { return withResolvedTenant(req, () => postHandler(req)); }
