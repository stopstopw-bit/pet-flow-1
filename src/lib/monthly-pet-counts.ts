/**
 * สรุปจำนวนน้องตามช่วงเวลา — อาบน้ำกี่ตัว (โปรแกรมไหน) เข้าพักกี่ตัว (ห้องไหน)
 * นัด 1 แถว = น้อง 1 ตัว จึงนับจากนัดได้ตรง ๆ (ไม่นับนัดที่ยกเลิก/ไม่มา)
 * ฟังก์ชันล้วน ใช้ได้ทั้งหน้าเว็บและทดสอบ
 */

export type CountBooking = {
  id?: string;
  customerId?: string;
  customerName?: string;
  catName?: string;
  service: "groom" | "room" | string;
  status: string;
  date?: string;
  checkin?: string;
  checkout?: string;
  /** id ห้อง (roomType ใน Booking / room ใน StoredBooking) */
  roomType?: string;
  room?: string;
  groomProgram?: string;
};

/** แถวรายละเอียด 1 ตัว */
export type CountRow = {
  id: string;
  date: string;
  /** วันออก (เข้าพัก) */
  until?: string;
  catName: string;
  customerName: string;
  customerId?: string;
  /** โปรแกรม/ห้อง */
  kind: string;
  /** คืนที่อยู่ในช่วง (เข้าพัก) */
  nights?: number;
  upcoming: boolean;
};

export type Breakdown = { label: string; count: number; nights?: number };

type Part = { total: number; done: number; upcoming: number; houses: number; by: Breakdown[]; rows: CountRow[] };

export type PetCounts = {
  from: string;
  to: string;
  bath: Part;
  /** เข้าพักค้างคืนที่มีคืนอยู่ในช่วงนี้ */
  stay: Part & { nights: number };
  /** Day Care (เข้า-ออกวันเดียว) แยกไว้ ไม่ปนกับเข้าพัก */
  dayCare: Part;
};

export type CountLabels = {
  program?: (id?: string) => string;
  room?: (id?: string) => string;
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

export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { first: `${y}-${mm}-01`, last: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

/** เลื่อนเดือน เช่น shiftMonth("2026-01", -1) = "2025-12" */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const houseKey = (b: CountBooking) => b.customerId || (b.customerName || "").trim();
const emptyPart = (): Part => ({ total: 0, done: 0, upcoming: 0, houses: 0, by: [], rows: [] });

function finish(part: Part, houses: Set<string>, by: Map<string, Breakdown>) {
  part.houses = houses.size;
  part.by = [...by.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  part.rows.sort((a, b) => a.date.localeCompare(b.date) || a.customerName.localeCompare(b.customerName));
}

/**
 * @param range ช่วงวันที่ (รวมปลายทั้งสองข้าง) YYYY-MM-DD
 * @param today YYYY-MM-DD (เวลาไทย) — ใช้แยก "มาแล้ว" กับ "นัดล่วงหน้า"
 */
export function petCounts(
  bookings: CountBooking[],
  range: { from: string; to: string },
  today: string,
  labels: CountLabels = {}
): PetCounts {
  const { from: first, to: last } = range;
  const programOf = labels.program || ((id?: string) => id || "");
  const roomOf = labels.room || ((id?: string) => id || "");
  const out: PetCounts = { from: first, to: last, bath: emptyPart(), stay: { ...emptyPart(), nights: 0 }, dayCare: emptyPart() };
  const houses = { bath: new Set<string>(), stay: new Set<string>(), dayCare: new Set<string>() };
  const by = { bath: new Map<string, Breakdown>(), stay: new Map<string, Breakdown>(), dayCare: new Map<string, Breakdown>() };

  const add = (key: "bath" | "stay" | "dayCare", b: CountBooking, row: Omit<CountRow, "id" | "catName" | "customerName" | "customerId">) => {
    const part = out[key];
    part.total++;
    if (row.upcoming) part.upcoming++;
    else part.done++;
    houses[key].add(houseKey(b));
    const cur = by[key].get(row.kind) || { label: row.kind, count: 0, ...(key === "stay" ? { nights: 0 } : {}) };
    cur.count++;
    if (row.nights && cur.nights !== undefined) cur.nights += row.nights;
    by[key].set(row.kind, cur);
    part.rows.push({
      id: b.id || `${b.customerName}-${b.catName}-${row.date}`,
      catName: (b.catName || "").trim() || "ไม่ระบุชื่อ",
      customerName: (b.customerName || "").trim(),
      customerId: b.customerId,
      ...row,
    });
  };

  for (const b of bookings) {
    if (SKIP.has(b.status)) continue;
    if (b.service === "groom") {
      const d = day(b.date);
      if (!d || d < first || d > last) continue;
      add("bath", b, { date: d, kind: programOf(b.groomProgram) || "ยังไม่ระบุโปรแกรม", upcoming: d > today });
      continue;
    }
    if (b.service !== "room") continue;
    const ci = day(b.checkin || b.date);
    if (!ci) continue;
    const kind = roomOf(b.roomType || b.room) || "ไม่ระบุห้อง";
    if (isDayCareStay({ checkin: ci, checkout: b.checkout })) {
      if (ci < first || ci > last) continue;
      add("dayCare", b, { date: ci, kind, upcoming: ci > today });
      continue;
    }
    // คืนที่พัก = วันเข้า … วันก่อนวันออก — นับตัวที่มีคืนตกอยู่ในช่วงนี้
    const co = day(b.checkout) || ci;
    const lastNight = co > ci ? new Date(toMs(co) - DAY).toISOString().slice(0, 10) : ci;
    if (lastNight < first || ci > last) continue;
    const s = ci > first ? ci : first;
    const e = lastNight < last ? lastNight : last;
    const nights = Math.round((toMs(e) - toMs(s)) / DAY) + 1;
    out.stay.nights += nights;
    add("stay", b, { date: ci, until: co, kind, nights, upcoming: ci > today });
  }
  finish(out.bath, houses.bath, by.bath);
  finish(out.stay, houses.stay, by.stay);
  finish(out.dayCare, houses.dayCare, by.dayCare);
  return out;
}

/** สรุปทั้งเดือน (YYYY-MM) */
export function monthPetCounts(bookings: CountBooking[], month: string, today: string, labels?: CountLabels) {
  const { first, last } = monthBounds(month);
  return petCounts(bookings, { from: first, to: last }, today, labels);
}
