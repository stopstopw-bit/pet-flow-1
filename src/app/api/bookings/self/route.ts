import { NextRequest, NextResponse } from "next/server";
import { withResolvedTenant } from "@/lib/tenant-context";
import { addBooking, listBookings, type StoredBooking } from "@/lib/bookings-store";
import { findCustomerByLine } from "@/lib/customers-store";
import { assignGroomSlots, getGroomAvailability, getRoomAvailability } from "@/lib/availability";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
import { groomProgram } from "@/lib/grooming-prices";
import { requireCustomerSession } from "@/lib/customer-session";
import { getSiteConfig } from "@/lib/config-store";
import { depositAmountFor, type DepositStatus } from "@/lib/booking-deposit";
import { saveDepositSlip, depositTelegramLine } from "@/lib/booking-deposit-server";

export const dynamic = "force-dynamic";

/**
 * ลูกค้าจองคิว/ห้องพักเอง — ไม่ต้องคุยกับพนักงาน
 * สร้างเป็นสถานะ "pending" เสมอ (addBooking ตั้งให้อยู่แล้ว) — พนักงานกดยืนยันอีกทีในหลังบ้าน
 * เช็คความว่างซ้ำที่นี่ก่อนบันทึกจริง กันเคสสองคนจองพร้อมกันแล้วเห็นเลขว่างเก่า
 */
export async function POST(req: NextRequest) {
  return withResolvedTenant(req, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const session = await requireCustomerSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const lineUserId = session.lineUserId;
  const body = await req.json().catch(() => ({}));
  // จองได้หลายตัวพร้อมกัน (อาบน้ำ) — catNames มาก่อน ถ้าไม่มีใช้ catName เดี่ยวเดิม (เข้ากันได้กับของเก่า)
  const catNames: string[] = Array.isArray(body.catNames)
    ? [
        ...new Set(
          (body.catNames as unknown[]).map((n) => String(n || "").trim()).filter(Boolean)
        ),
      ]
    : [String(body.catName || "").trim()].filter(Boolean);
  const service = body.service === "room" ? "room" : body.service === "groom" ? "groom" : null;

  if (!catNames.length || !service) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const customer = await findCustomerByLine(lineUserId);
  if (!customer) return NextResponse.json({ error: "customer_not_found" }, { status: 404 });
  if (!catNames.every((n) => customer.cats.some((c) => c.name === n))) {
    return NextResponse.json({ error: "cat_not_found" }, { status: 404 });
  }

  // มัดจำ — ยอดคิดจากตั้งค่าร้านฝั่งเซิร์ฟเวอร์เสมอ (ไม่เชื่อยอดที่ client ส่งมา)
  // แนบสลิปมา = รอตรวจ, ไม่แนบ ("โอนทีหลัง") = ยังไม่โอน — การจองไม่ถูกบล็อกทั้งสองแบบ
  const depositAmount = depositAmountFor((await getSiteConfig()).bookingDeposit, service);
  const slipRaw = typeof body.depositSlip === "string" ? body.depositSlip : "";
  const depositInfo = async (): Promise<{
    depositAmount?: number;
    depositSlipUrl?: string;
    depositStatus?: DepositStatus;
  }> => {
    if (!depositAmount) return {};
    const url = slipRaw ? await saveDepositSlip(slipRaw) : undefined;
    return {
      depositAmount,
      depositSlipUrl: url,
      depositStatus: url ? "pending_review" : "none",
    };
  };

  // วันนี้ตามเวลาไทย — server รันเป็น UTC ใช้ตรงๆ จะคลาดวันช่วงหลังเที่ยงคืนไทย
  const todayBkk = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // นัดเดิมของลูกค้าคนนี้ — ใช้กันจองซ้ำ (กดหลายรอบ/ลืมว่าจองแล้ว = กินคิวว่างฟรี)
  const myBookings = (await listBookings(lineUserId)).filter((x) => x.status !== "cancelled");

  if (service === "groom") {
    const date = String(body.date || "").trim();
    const time = String(body.time || "").trim();
    if (!date || !time) {
      return NextResponse.json({ error: "date and time required" }, { status: 400 });
    }
    if (date < todayBkk) {
      return NextResponse.json({ error: "past_date" }, { status: 400 });
    }
    if (myBookings.some((x) => x.service === "groom" && catNames.includes(x.catName) && x.date === date)) {
      return NextResponse.json({ error: "duplicate_booking" }, { status: 409 });
    }
    const { closed, slots, mode } = await getGroomAvailability(date, catNames.length);
    if (closed) {
      return NextResponse.json({ error: "shop_closed" }, { status: 409 });
    }
    // โหมดคิดเวลา: ทั้งบ้านเริ่มพร้อมกันเวลาที่เลือก (เช็คแล้วว่าช่วงเวลาทั้งช่วงยังว่าง)
    // โหมดเดิม: ตัวแรกลงเวลาที่เลือก ถ้าเต็ม ตัวถัดไปไหลไปสล็อตถัดไปที่ว่างอัตโนมัติ
    const assignedTimes =
      mode === "together"
        ? (slots.find((s) => s.time === time)?.remaining ?? 0) > 0
          ? catNames.map(() => time)
          : null
        : assignGroomSlots(slots, time, catNames.length);
    if (!assignedTimes) {
      return NextResponse.json({ error: "slot_full" }, { status: 409 });
    }
    const programId = String(body.groomProgram || "").trim() || undefined;
    const deposit = await depositInfo();
    const bookings: StoredBooking[] = [];
    for (let i = 0; i < catNames.length; i++) {
      bookings.push(
        await addBooking({
          customerName: customer.name,
          catName: catNames[i],
          service: "groom",
          date,
          time: assignedTimes[i],
          lineUserId,
          selfBooked: true,
          groomProgram: programId,
          // ทั้งบ้านที่จองพร้อมกันได้ยอด/สลิป/สถานะเดียวกันทุกแถว (ยอดของทั้งกลุ่ม ไม่ใช่ต่อตัว)
          ...deposit,
        })
      );
    }
    const scheduleText = catNames
      .map((name, i) => `${name} ${assignedTimes[i]}`)
      .join(", ");
    await sendTelegram(
      formatBookingTelegram("🐾 ลูกค้าจองคิวอาบน้ำเอง (รอยืนยัน)", {
        ลูกค้า: customer.name,
        น้อง: scheduleText,
        วันที่: date,
        ...(programId ? { โปรแกรม: groomProgram(programId)?.name || programId } : {}),
        ...depositTelegramLine(deposit),
      })
    );
    return NextResponse.json({ ok: true, booking: bookings[0], bookings });
  }

  // service === "room"
  const checkin = String(body.checkin || "").trim();
  const checkout = String(body.checkout || "").trim();
  const room = String(body.room || "").trim();
  if (!checkin || !checkout || !room) {
    return NextResponse.json({ error: "checkin, checkout, room required" }, { status: 400 });
  }
  if (checkout <= checkin) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }
  if (checkin < todayBkk) {
    return NextResponse.json({ error: "past_date" }, { status: 400 });
  }
  // แมวตัวไหนก็ได้ในที่เลือกมีการเข้าพักช่วงทับซ้อนอยู่แล้ว = จองซ้ำ
  if (
    myBookings.some(
      (x) =>
        x.service === "room" &&
        catNames.includes(x.catName) &&
        x.checkin &&
        x.checkout &&
        x.checkin < checkout &&
        x.checkout > checkin
    )
  ) {
    return NextResponse.json({ error: "duplicate_booking" }, { status: 409 });
  }
  const avail = await getRoomAvailability(room, checkin, checkout);
  if (!avail) return NextResponse.json({ error: "not_self_bookable" }, { status: 400 });
  if (avail.closed) {
    return NextResponse.json({ error: "shop_closed" }, { status: 409 });
  }
  // บ้านเดียวกันอยู่ห้องเดียวกัน — เกินจุห้องต้องใช้ห้องเพิ่ม
  const roomCfg = (await getSiteConfig()).rooms.find((r) => r.id === room);
  const roomsNeeded = Math.ceil(catNames.length / Math.max(1, roomCfg?.maxCats || 1));
  if (avail.remaining < roomsNeeded) {
    return NextResponse.json({ error: "room_full" }, { status: 409 });
  }
  const deposit = await depositInfo();
  const bookings: StoredBooking[] = [];
  for (const name of catNames) {
    bookings.push(
      await addBooking({
        customerName: customer.name,
        catName: name,
        service: "room",
        date: checkin,
        checkin,
        checkout,
        room,
        lineUserId,
        selfBooked: true,
        ...deposit,
      })
    );
  }
  await sendTelegram(
    formatBookingTelegram("🏠 ลูกค้าจองห้องพักเอง (รอยืนยัน)", {
      ลูกค้า: customer.name,
      น้อง: catNames.join(", "),
      เข้าพัก: `${checkin} → ${checkout}`,
      ห้อง: roomsNeeded > 1 ? `${roomCfg?.name || room} × ${roomsNeeded}` : roomCfg?.name || room,
      ...depositTelegramLine(deposit),
    })
  );
  return NextResponse.json({ ok: true, booking: bookings[0], bookings });
}
