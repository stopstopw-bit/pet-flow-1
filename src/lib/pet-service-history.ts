/**
 * ประวัติใช้บริการรายตัว — น้องแต่ละตัวเคยอาบโปรแกรมไหน วันไหน เข้าพักห้องไหนกี่คืน
 * ดูจากนัด (1 นัด = น้อง 1 ตัว) ไม่ใช่จากบิล จึงไม่ปนกับประวัติการจ่ายเงิน
 * ไม่นับนัดที่ยกเลิก/ไม่มา · ฟังก์ชันล้วน ใช้ได้ทั้งหน้าเว็บและทดสอบ
 */
import type { Breakdown, CountBooking, CountLabels } from "./monthly-pet-counts";

export type HistoryKind = "bath" | "stay" | "dayCare";

export type HistoryEntry = {
  id: string;
  kind: HistoryKind;
  /** วันอาบ / วันเข้าพัก */
  date: string;
  /** วันออก (เข้าพัก) */
  until?: string;
  time?: string;
  /** ชื่อโปรแกรม / ห้อง */
  label: string;
  nights?: number;
  /** ยังไม่ถึงวัน */
  upcoming: boolean;
  /** กำลังพักอยู่ตอนนี้ */
  inHouse?: boolean;
};

export type PetHistory = {
  /** ชื่อที่ทำให้เป็นมาตรฐานแล้ว ใช้เป็น key */
  key: string;
  name: string;
  catId?: string;
  /** นับเฉพาะที่มาแล้ว (รวมที่กำลังพักอยู่) */
  baths: number;
  stays: number;
  nights: number;
  dayCare: number;
  firstVisit?: string;
  lastVisit?: string;
  /** นัดถัดไปที่ยังไม่ถึง */
  next?: HistoryEntry;
  upcoming: number;
  programs: Breakdown[];
  rooms: Breakdown[];
  /** ใหม่ก่อน (นัดล่วงหน้าอยู่บนสุด) */
  entries: HistoryEntry[];
};

/** นัดห้องพักที่เข้า-ออกวันเดียวกัน = Day Care (ฝากรายวัน ไม่ค้างคืน) */
function isDayCareStay(b: { checkin?: string; checkout?: string }): boolean {
  const ci = (b.checkin || "").slice(0, 10);
  return !!ci && (b.checkout || "").slice(0, 10) === ci;
}

const SKIP = new Set(["cancelled", "no_show"]);
const DAY = 86400000;
const day = (s?: string) => (s || "").slice(0, 10);
const toMs = (s: string) => new Date(`${s}T00:00:00Z`).getTime();

/** "น้องส้ม " / "ส้ม" → "ส้ม" — พนักงานพิมพ์ชื่อในนัดไม่ตรงกับโปรไฟล์บ่อย */
export function petKey(name?: string) {
  return (name || "").trim().toLowerCase().replace(/^น้อง\s*/, "").replace(/\s+/g, " ");
}

type HistoryBooking = CountBooking & { time?: string };

function addTo(map: Map<string, Breakdown>, label: string, nights?: number) {
  const cur = map.get(label) || { label, count: 0, ...(nights !== undefined ? { nights: 0 } : {}) };
  cur.count++;
  if (nights !== undefined) cur.nights = (cur.nights || 0) + nights;
  map.set(label, cur);
}

const sortBy = (m: Map<string, Breakdown>) =>
  [...m.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

/**
 * @param cats น้องในโปรไฟล์ (ลำดับตามโปรไฟล์) — ชื่อในนัดที่ไม่ตรงตัวไหนจะต่อท้ายเป็นอีกรายการ
 * @param today YYYY-MM-DD (เวลาไทย)
 */
export function petServiceHistory(
  bookings: HistoryBooking[],
  cats: { id?: string; name: string }[],
  today: string,
  labels: CountLabels = {}
): PetHistory[] {
  const programOf = labels.program || ((id?: string) => id || "");
  const roomOf = labels.room || ((id?: string) => id || "");

  type Acc = { h: PetHistory; programs: Map<string, Breakdown>; rooms: Map<string, Breakdown> };
  const byKey = new Map<string, Acc>();
  const make = (name: string, catId?: string): Acc => ({
    h: {
      key: petKey(name),
      name: name.trim() || "ไม่ระบุชื่อ",
      catId,
      baths: 0,
      stays: 0,
      nights: 0,
      dayCare: 0,
      upcoming: 0,
      programs: [],
      rooms: [],
      entries: [],
    },
    programs: new Map(),
    rooms: new Map(),
  });
  for (const c of cats) {
    const k = petKey(c.name);
    if (!byKey.has(k)) byKey.set(k, make(c.name, c.id));
  }

  for (const b of bookings) {
    if (SKIP.has(b.status)) continue;
    const k = petKey(b.catName);
    let acc = byKey.get(k);
    if (!acc) {
      acc = make(b.catName || "");
      byKey.set(k, acc);
    }
    const h = acc.h;
    const id = b.id || `${k}-${b.date || b.checkin}`;
    let entry: HistoryEntry;

    if (b.service === "groom") {
      const d = day(b.date);
      if (!d) continue;
      const label = programOf(b.groomProgram) || "อาบน้ำ (ยังไม่ระบุโปรแกรม)";
      entry = { id, kind: "bath", date: d, time: b.time, label, upcoming: d > today };
      if (!entry.upcoming) {
        h.baths++;
        addTo(acc.programs, label);
      }
    } else if (b.service === "room") {
      const ci = day(b.checkin || b.date);
      if (!ci) continue;
      const label = roomOf(b.roomType || b.room) || "ไม่ระบุห้อง";
      if (isDayCareStay({ checkin: ci, checkout: b.checkout })) {
        entry = { id, kind: "dayCare", date: ci, label, upcoming: ci > today };
        if (!entry.upcoming) {
          h.dayCare++;
          addTo(acc.rooms, `Day Care · ${label}`);
        }
      } else {
        const co = day(b.checkout) || ci;
        const nights = Math.max(1, Math.round((toMs(co) - toMs(ci)) / DAY));
        const upcoming = ci > today;
        entry = { id, kind: "stay", date: ci, until: co, label, nights, upcoming, inHouse: !upcoming && co > today };
        if (!upcoming) {
          h.stays++;
          h.nights += nights;
          addTo(acc.rooms, label, nights);
        }
      }
    } else {
      continue;
    }

    h.entries.push(entry);
    if (entry.upcoming) {
      h.upcoming++;
      if (!h.next || entry.date < h.next.date) h.next = entry;
    } else {
      if (!h.firstVisit || entry.date < h.firstVisit) h.firstVisit = entry.date;
      if (!h.lastVisit || entry.date > h.lastVisit) h.lastVisit = entry.date;
    }
  }

  return [...byKey.values()].map(({ h, programs, rooms }) => {
    h.programs = sortBy(programs);
    h.rooms = sortBy(rooms);
    h.entries.sort((a, b) => b.date.localeCompare(a.date) || (b.time || "").localeCompare(a.time || ""));
    return h;
  })
    // ชื่อแปลกที่ไม่มีในโปรไฟล์ แต่ไม่มีนัดที่นับได้เลย ไม่ต้องโชว์
    .filter((h) => h.catId !== undefined || cats.some((c) => petKey(c.name) === h.key) || h.entries.length > 0);
}
