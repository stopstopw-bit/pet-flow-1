import { listBookings, type StoredBooking } from "./bookings-store";
import { listCustomers } from "./customers-store";
import { bookingMatchesCustomer } from "./booking-customer-match";
import { groupBookings, groupCatNames } from "./booking-group";
import { hasTransport } from "./transport";

/**
 * สรุปรายการรับ-ส่งน้องของวันหนึ่ง ส่งเข้า Telegram ให้คนขับ/พนักงาน
 * - อาบน้ำ: รับ = ไปรับก่อนเวลานัด · ส่ง = พากลับหลังอาบเสร็จ
 * - ฝากพัก: รับ = วันเข้าพัก (เวลาที่ลูกค้าแจ้งมาส่ง) · ส่ง = วันออก (เวลาที่ลูกค้าแจ้งมารับ)
 * ถ้าร้านใส่เวลารับ/ส่งไว้ในนัด (transport.pickupTime / dropoffTime) ใช้เวลานั้นก่อน
 * บ้านเดียวกันนัดเดียวกันรวมเป็นเที่ยวเดียว ลิงก์ Google Maps ใช้ที่ลูกค้ากรอกไว้ในนัด
 */

type Trip = {
  kind: "pickup" | "dropoff";
  service: "groom" | "room";
  /** เวลาที่ใช้เรียงลำดับ (HH:MM) — ไม่มี = ไปท้ายรายการ */
  time?: string;
  timeText: string;
  group: StoredBooking[];
};

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(s: string) {
  return esc(s).replace(/"/g, "&quot;");
}

function tripsForDate(all: StoredBooking[], date: string): Trip[] {
  const live = all.filter(
    (b) => b.status !== "cancelled" && b.status !== "no_show" && hasTransport(b.transport)
  );
  const trips: Trip[] = [];

  for (const g of groupBookings(live.filter((b) => b.service === "groom" && b.date === date))) {
    const t = g.find((b) => b.transport)?.transport;
    const time = g[0].time;
    // เวลาที่ร้านใส่ไว้อาจอยู่แค่บางตัวในบ้าน — หยิบจากตัวไหนก็ได้ที่มี
    const pickupTime = g.find((b) => b.transport?.pickupTime)?.transport?.pickupTime;
    const dropoffTime = g.find((b) => b.transport?.dropoffTime)?.transport?.dropoffTime;
    if (t?.pickup) {
      trips.push({
        kind: "pickup",
        service: "groom",
        time: pickupTime || time,
        timeText: pickupTime
          ? `${pickupTime}${time ? ` (นัดอาบ ${time})` : ""}`
          : time
            ? `ก่อนนัดอาบ ${time}`
            : "ยังไม่ระบุเวลานัด",
        group: g,
      });
    }
    if (t?.dropoff) {
      trips.push({
        kind: "dropoff",
        service: "groom",
        // ส่งกลับหลังอาบเสร็จ — ไม่มีเวลาส่งที่ร้านใส่ไว้ก็เรียงไว้หลังเวลานัด
        time: dropoffTime || (time ? `${time}~` : undefined),
        timeText: dropoffTime
          ? dropoffTime
          : time
            ? `หลังอาบเสร็จ (นัด ${time})`
            : "หลังอาบเสร็จ",
        group: g,
      });
    }
  }

  const stays = live.filter((b) => b.service === "room");
  for (const g of groupBookings(stays.filter((b) => b.checkin === date))) {
    if (!g.some((b) => b.transport?.pickup)) continue;
    const time =
      g.find((b) => b.transport?.pickupTime)?.transport?.pickupTime ||
      g.find((b) => b.arrivalTime)?.arrivalTime;
    trips.push({
      kind: "pickup",
      service: "room",
      time,
      timeText: time ? `${time} (วันเข้าพัก)` : "ยังไม่แจ้งเวลา (วันเข้าพัก)",
      group: g.filter((b) => b.transport?.pickup),
    });
  }
  for (const g of groupBookings(stays.filter((b) => b.checkout === date))) {
    if (!g.some((b) => b.transport?.dropoff)) continue;
    const time =
      g.find((b) => b.transport?.dropoffTime)?.transport?.dropoffTime ||
      g.find((b) => b.pickupTime)?.pickupTime;
    trips.push({
      kind: "dropoff",
      service: "room",
      time,
      timeText: time ? `${time} (วันออก)` : "ยังไม่แจ้งเวลา (วันออก)",
      group: g.filter((b) => b.transport?.dropoff),
    });
  }

  return trips.sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
}

/**
 * ข้อความ HTML สรุปรับ-ส่งของวันหนึ่ง — ไม่มีรายการ = คืน null (cron จะได้ไม่ส่งข้อความว่าง)
 * ถ้าอยากได้ข้อความตอนว่างด้วย (เช่น กดปุ่มดูเอง) ส่ง emptyText มา
 */
export async function buildTransportSummaryMessage(
  date: string,
  opts?: { heading?: string; emptyText?: string }
): Promise<string | null> {
  const heading = opts?.heading ?? `🚗 รายการรับ-ส่งน้อง (${date})`;
  const trips = tripsForDate(await listBookings(), date);
  if (!trips.length) {
    return opts?.emptyText ? `<b>${esc(heading)}</b>\n\n${esc(opts.emptyText)}` : null;
  }

  // เบอร์โทรอยู่ที่ข้อมูลลูกค้า ไม่ได้อยู่ในนัด — ดึงครั้งเดียวแล้วจับคู่
  const customers = await listCustomers().catch(() => []);
  const phoneOf = (b: StoredBooking) =>
    customers.find((c) => bookingMatchesCustomer(b, c))?.phone;

  const pickups = trips.filter((t) => t.kind === "pickup").length;
  const lines = [
    `<b>${esc(heading)}</b>`,
    `รับ ${pickups} เที่ยว · ส่ง ${trips.length - pickups} เที่ยว`,
  ];

  trips.forEach((trip, i) => {
    const first = trip.group[0];
    const t = trip.group.find((b) => b.transport?.mapUrl)?.transport ?? first.transport;
    const label = trip.kind === "pickup" ? "⬆️ รับน้อง" : "⬇️ ส่งน้องกลับบ้าน";
    const service = trip.service === "groom" ? "อาบน้ำ" : "ฝากพัก";
    const phone = phoneOf(first);
    const out = [
      `\n<b>${i + 1}. ${label}</b> · ${esc(trip.timeText)}`,
      `   🐱 ${esc(groupCatNames(trip.group))} · ${esc(first.customerName)} (${service})`,
    ];
    if (phone) out.push(`   📞 ${esc(phone)}`);
    if (t?.mapUrl) out.push(`   📍 <a href="${escAttr(t.mapUrl)}">เปิด Google Maps</a>`);
    else out.push("   ⚠️ ลูกค้ายังไม่ส่งพิกัด");
    if (t?.address) out.push(`   🏠 ${esc(t.address)}`);
    lines.push(out.join("\n"));
  });

  return lines.join("\n");
}
