/**
 * ประวัติใช้บริการรายตัว — น้องแต่ละตัวเคยอาบโปรแกรมไหน วันไหน เข้าพักห้องไหนกี่คืน
 * ดูจากนัด (1 นัด = น้อง 1 ตัว) แล้วผูกกับบิลของนัดนั้น — ร้านเลือกโปรแกรมอาบ/ห้องจริงตอนออกบิล
 * จึงใช้ชื่อโปรแกรม/ห้องในบิลแทนของที่จองไว้ และบรรทัดในบิลที่ไม่มีนัดรองรับ (เช่น อาบน้ำระหว่างพัก
 * หรือออกบิล walk-in) ก็ขึ้นเป็นรายการในประวัติด้วย · ไม่โชว์ยอดเงิน (ประวัติการจ่ายเงินอยู่ส่วนอื่น)
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
  /** ชื่อโปรแกรม/ห้องมาจากบิล */
  billed?: boolean;
  /** นัดที่ใช้เปิดบิล (/admin/billing?bookingId=) */
  billBookingId?: string;
};

/** บิลแบบย่อ — เฉพาะบรรทัดอาบน้ำ/ห้องพัก (ดู listServiceBills) */
export type HistoryBill = {
  id: string;
  bookingId?: string;
  /** ชื่อน้องของบิล (ใช้เมื่อบรรทัดไม่ได้ระบุตัว) */
  catName: string;
  /** วันที่จ่าย/ออกบิล YYYY-MM-DD */
  date: string;
  items: { kind?: string; program?: string; label: string; catName?: string; qty?: number }[];
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

type HistoryBooking = CountBooking & {
  time?: string;
  /** ป้ายจากบิล (ใช้แทนโปรแกรม/ห้องที่จองไว้) */
  billLabel?: string;
  billBookingId?: string;
};

const stripCat = (label: string) => label.replace(/^🐱 .+? · /, "").trim();
/** "🐱 ส้ม · Catcha Premium · เปอร์เซีย · M × 2" → "Catcha Premium" */
const groomLineName = (label: string) => stripCat(label).split(" · ")[0].replace(/\s*×\s*\d+$/, "").trim();
/** "🐱 ส้ม · ห้อง MiNi Meow × 3 คืน (พักต่อ …)" → "MiNi Meow" · Day Care ตัดคำนำหน้าออกด้วย */
const roomLineName = (label: string) =>
  stripCat(label)
    .replace(/\s*×\s*\d+\s*(คืน|วัน)[\s\S]*$/, "")
    .replace(/\s*×\s*\d+$/, "")
    .replace(/^Day Care\s*/i, "")
    .replace(/^ห้อง\s*/, "")
    .trim();
const isDayCareLine = (label: string) => /^Day Care\b/i.test(stripCat(label)) || /×\s*\d+\s*วัน/.test(label);
const plusDays = (iso: string, n: number) => new Date(toMs(iso) + n * DAY).toISOString().slice(0, 10);

/**
 * ผูกบิลเข้ากับนัด: บรรทัดที่ตรงกับนัดของตัวนั้น (บริการเดียวกัน วันเดียวกับนัดที่บิลผูกไว้) → ใช้ชื่อในบิล
 * บรรทัดที่ไม่มีนัดรองรับ → สร้างเป็นรายการใหม่ (วันที่ตามนัดที่บิลผูก หรือวันที่ออกบิล)
 */
function applyBills(
  bookings: HistoryBooking[],
  bills: HistoryBill[],
  programOf: (id?: string) => string
): HistoryBooking[] {
  const out = bookings.map((b) => ({ ...b }));
  const byId = new Map(out.filter((b) => b.id).map((b) => [b.id!, b]));
  const startOf = (b: HistoryBooking) => day(b.service === "room" ? b.checkin || b.date : b.date);
  const extra = new Map<string, HistoryBooking>();

  for (const bill of bills) {
    const anchor = bill.bookingId ? byId.get(bill.bookingId) : undefined;
    const when = anchor ? startOf(anchor) : day(bill.date);
    for (const it of bill.items) {
      const room = it.kind !== "grooming";
      const service = room ? "room" : "groom";
      const label = room ? roomLineName(it.label) : programOf(it.program) || groomLineName(it.label);
      if (!label) continue;
      const names = (it.catName || bill.catName || "").split(",").map((n) => n.trim()).filter(Boolean);
      for (const name of names) {
        const k = petKey(name);
        const match = out.find(
          (b) =>
            b.service === service &&
            petKey(b.catName) === k &&
            (b.id === bill.bookingId ||
              (anchor
                ? startOf(b) === when
                : room
                  ? startOf(b) <= when && when <= (day(b.checkout) || startOf(b))
                  : startOf(b) === when))
        );
        if (match) {
          match.billLabel = label;
          match.billBookingId = bill.bookingId || match.id;
          continue;
        }
        // บิลพักต่อหลายใบของนัดเดียวกันจะได้ไม่ขึ้นซ้ำ
        const key = `${bill.bookingId || bill.id}|${k}|${service}|${label}`;
        if (extra.has(key)) continue;
        const nights = Math.max(0, Math.round(Number(it.qty) || 1));
        const ci = room ? day(anchor?.checkin || anchor?.date) || when : undefined;
        extra.set(key, {
          id: `bill-${bill.id}-${k}-${service}`,
          catName: name,
          service,
          status: "confirmed",
          date: when,
          checkin: ci,
          checkout: room ? (anchor?.checkout ? day(anchor.checkout) : isDayCareLine(it.label) ? ci : plusDays(ci!, nights)) : undefined,
          billLabel: label,
          billBookingId: bill.bookingId,
        });
      }
    }
  }
  return [...out, ...extra.values()];
}

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
  labels: CountLabels = {},
  bills: HistoryBill[] = []
): PetHistory[] {
  const programOf = labels.program || ((id?: string) => id || "");
  const roomOf = labels.room || ((id?: string) => id || "");
  bookings = bills.length ? applyBills(bookings, bills, programOf) : bookings;

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
      const label = b.billLabel || programOf(b.groomProgram) || "อาบน้ำ (ยังไม่ระบุโปรแกรม)";
      entry = { id, kind: "bath", date: d, time: b.time, label, upcoming: d > today };
      if (!entry.upcoming) {
        h.baths++;
        addTo(acc.programs, label);
      }
    } else if (b.service === "room") {
      const ci = day(b.checkin || b.date);
      if (!ci) continue;
      const label = b.billLabel || roomOf(b.roomType || b.room) || "ไม่ระบุห้อง";
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

    if (b.billLabel) {
      entry.billed = true;
      entry.billBookingId = b.billBookingId;
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
