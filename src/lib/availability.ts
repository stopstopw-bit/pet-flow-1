import { getSiteConfig } from "./config-store";
import type { SiteConfig } from "./config-types";
import { listBookings } from "./bookings-store";
import { SELF_BOOKABLE_ROOM_INVENTORY_KEY } from "./self-bookable-rooms";

/**
 * ร้านปิดในวันที่ระบุไหม (วันหยุดประจำสัปดาห์ หรือวันหยุดเฉพาะวันที่ตั้งไว้ในหลังบ้าน)
 * ใช้เช็คก่อนให้ลูกค้าจองคิว/ห้องพักเอง — ห้องพักที่เข้าพักอยู่แล้วไม่กระทบ (แค่ปิดรับจอง/เช็คอินใหม่วันนั้น)
 */
export function isShopClosedOn(config: SiteConfig, dateISO: string): boolean {
  const weekday = new Date(`${dateISO}T00:00:00`).getDay();
  if (config.closedWeekdays?.includes(weekday)) return true;
  return Boolean(config.closedDates?.some((d) => d.date === dateISO));
}

export type GroomSlotAvailability = {
  time: string;
  capacity: number;
  booked: number;
  remaining: number;
  /** โหมดคิดเวลาตามจำนวนแมว: เวลาเสร็จโดยประมาณของบ้านนี้ถ้าเริ่มรอบนี้ */
  endTime?: string;
};

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const toClock = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** นาทีที่บ้านหนึ่งใช้ถ้ามา n ตัว — 0 = ร้านไม่ได้เปิดโหมดคิดเวลา (ใช้ 1 แมว = 1 คิวแบบเดิม) */
export function groomMinutesFor(config: Pick<SiteConfig, "groomDuration">, n: number): number {
  const d = config.groomDuration;
  if (!d?.firstCatMinutes || d.firstCatMinutes <= 0 || n <= 0) return 0;
  const extra = d.extraCatMinutes ?? d.firstCatMinutes;
  return d.firstCatMinutes + Math.max(0, n - 1) * Math.max(0, extra);
}

/**
 * ความว่างของแต่ละสล็อตอาบน้ำในวันที่กำหนด
 * ใช้ listBookings() แทนการยิง query เอง — ให้เดินทางเดียวกับที่อื่นในระบบ (ทำงานได้ทั้งโหมด
 * Supabase จริงและโหมด in-memory ตอน dev โดยไม่ต้องเขียน fallback ซ้ำสองที่)
 */
export async function getGroomAvailability(
  date: string,
  catCount = 1
): Promise<{
  closed: boolean;
  slots: GroomSlotAvailability[];
  /** "together" = บ้านเดียวกันเริ่มพร้อมกันเวลาเดียว คิดเวลาตามจำนวนตัว; "per_cat" = 1 แมว = 1 คิว */
  mode: "together" | "per_cat";
  minutes?: number;
}> {
  const config = await getSiteConfig();
  const minutes = groomMinutesFor(config, Math.max(1, catCount));
  if (minutes > 0) return groomAvailabilityByDuration(config, date, Math.max(1, catCount));
  const slots = config.groomSlots || [];
  const defaultCap = config.groomSlotDefaultCapacity ?? 1;
  const closed = isShopClosedOn(config, date);

  const all = await listBookings();
  const bookedByTime = new Map<string, number>();
  for (const b of all) {
    if (b.service !== "groom" || b.date !== date || b.status === "cancelled" || !b.time) continue;
    bookedByTime.set(b.time, (bookedByTime.get(b.time) || 0) + 1);
  }

  // รอบที่เลยเวลามาแล้วของ "วันนี้" ต้องจองไม่ได้ (เทียบเวลาไทย — server รันเป็น UTC)
  const nowBkk = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString();
  const todayBkk = nowBkk.slice(0, 10);
  const timeNowBkk = nowBkk.slice(11, 16);

  return {
    closed,
    mode: "per_cat",
    slots: slots.map((time) => {
      const capacity = config.groomSlotCapacity?.[time] ?? defaultCap;
      const booked = bookedByTime.get(time) || 0;
      const past = date === todayBkk && time <= timeNowBkk;
      // วันปิด/รอบที่ผ่านไปแล้ว = จองไม่ได้เลย ไม่ว่าจะเหลือคิวตามตัวเลขจริงเท่าไหร่
      return {
        time,
        capacity,
        booked,
        remaining: closed || past ? 0 : Math.max(0, capacity - booked),
      };
    }),
  };
}

/**
 * โหมดคิดเวลา: นัดเดิมของแต่ละบ้าน (ลูกค้า + เวลาเริ่ม) กินช่วงเวลา first + (N-1)×extra นาที
 * รอบที่จะเริ่มได้ = ทุกจุดในช่วง [เริ่ม, เริ่ม + เวลาที่บ้านใหม่ต้องใช้) ยังมีช่างว่างอย่างน้อย 1
 * (จำนวนที่รับพร้อมกัน = ตัวเลขคิว/รอบเดิมในตั้งค่า แปลว่ารับพร้อมกันได้กี่บ้าน)
 */
async function groomAvailabilityByDuration(config: SiteConfig, date: string, catCount: number) {
  const slots = config.groomSlots || [];
  const defaultCap = config.groomSlotDefaultCapacity ?? 1;
  const closed = isShopClosedOn(config, date);
  const need = groomMinutesFor(config, catCount);

  const households = new Map<string, { start: number; cats: number }>();
  for (const b of await listBookings()) {
    if (b.service !== "groom" || b.date !== date || b.status === "cancelled" || !b.time) continue;
    const key = `${b.customerName}|${b.time}`;
    const h = households.get(key) || { start: toMin(b.time), cats: 0 };
    h.cats += 1;
    households.set(key, h);
  }
  const blocks = [...households.values()].map((h) => ({
    start: h.start,
    end: h.start + groomMinutesFor(config, h.cats),
  }));

  const nowBkk = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString();
  const past = (t: string) => date === nowBkk.slice(0, 10) && t <= nowBkk.slice(11, 16);

  return {
    closed,
    mode: "together" as const,
    minutes: need,
    slots: slots.map((time): GroomSlotAvailability => {
      const capacity = config.groomSlotCapacity?.[time] ?? defaultCap;
      const start = toMin(time);
      const end = start + need;
      // จุดที่ต้องเช็ค = ต้นช่วง + ทุกจุดที่มีบ้านอื่นเริ่มอาบกลางช่วง
      const points = [start, ...blocks.map((b) => b.start).filter((p) => p > start && p < end)];
      const busiest = Math.max(
        0,
        ...points.map((p) => blocks.filter((b) => b.start <= p && b.end > p).length)
      );
      return {
        time,
        capacity,
        booked: busiest,
        endTime: toClock(end),
        remaining: closed || past(time) ? 0 : Math.max(0, capacity - busiest),
      };
    }),
  };
}

/**
 * เรียงแมวหลายตัวลงสล็อตอาบน้ำ — ตัวแรกๆ ลงสล็อตที่เลือกไว้ก่อนจนเต็ม (ตามความสามารถรับที่ตั้งไว้
 * ในหลังบ้าน) แล้วตัวที่เหลือไหลไปสล็อตถัดไปที่ว่างโดยอัตโนมัติ
 *
 * ร้านที่ตั้งความสามารถรับพร้อมกัน (groomSlotCapacity) ไว้มากกว่า 1 ต่อสล็อต จะได้แมวหลายตัว
 * "เวลาเดียวกัน" ไปเอง ส่วนร้านที่รับได้ทีละ 1 (ค่าเริ่มต้น) แมวตัวถัดไปจะขยับไปสล็อตถัดไปที่ติดกัน
 * (ไม่ใช่เวลาเดียวกันหมด) — คืน null ถ้าสล็อตที่เหลือในวันนั้นนับจากเวลาที่เลือกไม่พอสำหรับแมวทุกตัว
 */
export function assignGroomSlots(
  slots: { time: string; remaining: number }[],
  startTime: string,
  count: number
): string[] | null {
  const startIdx = slots.findIndex((s) => s.time === startTime);
  if (startIdx === -1 || count <= 0) return null;
  const assigned: string[] = [];
  for (let i = startIdx; i < slots.length && assigned.length < count; i++) {
    let avail = slots[i].remaining;
    while (avail > 0 && assigned.length < count) {
      assigned.push(slots[i].time);
      avail--;
    }
  }
  return assigned.length === count ? assigned : null;
}

export type RoomAvailability = {
  capacity: number;
  booked: number;
  remaining: number;
  closed: boolean;
};

/**
 * ความว่างของห้องประเภทหนึ่งในช่วงวันที่ที่ขอ (checkout ไม่นับเป็นคืนที่พัก)
 * คืน null ถ้าเป็นห้องเชื่อม/ประเภทที่ยังคำนวณอัตโนมัติไม่ได้
 */
export async function getRoomAvailability(
  roomTypeId: string,
  checkin: string,
  checkout: string
): Promise<RoomAvailability | null> {
  const invKey = SELF_BOOKABLE_ROOM_INVENTORY_KEY[roomTypeId];
  if (!invKey) return null;
  const config = await getSiteConfig();
  // ใช้จำนวนห้องจริงของร้านนี้ (ตั้งได้ในหลังบ้าน) ไม่ใช่ค่าเริ่มต้นของ CatCha —
  // ไม่งั้นร้านที่มีจำนวนห้องต่างจากค่าเริ่มต้นจะเช็คความว่างผิด เสี่ยง overbook หรือปิดขายทั้งที่ห้องว่าง
  const capacity = config.roomInventory?.[invKey] ?? 0;
  // แมวที่เข้าพักอยู่แล้วไม่กระทบวันปิด — แค่ปิดรับเช็คอิน/เช็คเอาท์ใหม่ในวันนั้น
  // (พนักงานยังดูแลน้องตามปกติ แค่ไม่มีใครอยู่หน้าร้านรับ-ส่งของใหม่)
  const closed = isShopClosedOn(config, checkin) || isShopClosedOn(config, checkout);

  const all = await listBookings();
  // นับเป็น "ห้อง" ไม่ใช่ "แมว" — บ้านเดียวกันช่วงเดียวกันอยู่ห้องเดียวกันได้ถึง maxCats ตัว
  const maxCats = Math.max(1, config.rooms.find((r) => r.id === roomTypeId)?.maxCats || 1);
  const households = new Map<string, number>();
  for (const b of all) {
    if (
      b.service === "room" &&
      b.room === roomTypeId &&
      b.status !== "cancelled" &&
      b.checkin &&
      b.checkout &&
      b.checkin < checkout &&
      b.checkout > checkin
    ) {
      const key = `${b.customerName}|${b.checkin}|${b.checkout}`;
      households.set(key, (households.get(key) || 0) + 1);
    }
  }
  let booked = 0;
  for (const cats of households.values()) booked += Math.ceil(cats / maxCats);
  return {
    capacity,
    booked,
    remaining: closed ? 0 : Math.max(0, capacity - booked),
    closed,
  };
}
