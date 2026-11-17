/**
 * ประวัติใช้บริการในหน้าลูกค้า (หลังบ้าน) — 1 แถว = 1 ครั้งที่มาใช้บริการ
 *
 * เดิมโชว์ 2 แหล่งปนกัน: "บิลที่ปิดแล้ว" (service record) กับ "นัดที่ผ่านมา" ทีละแถว
 * การเข้าพักครั้งเดียวเลยกลายเป็นหลายแถว (นัด "ห้องพัก · รอยืนยัน" + บิลค่าห้อง + บิลต่อคืน)
 * ชื่อแมวซ้ำสองรอบ (ชื่อในประวัติ + ชื่อที่ติดมากับชื่อรายการในบิล) และวันที่เป็นวันจ่ายเงิน ไม่ใช่วันเข้าพัก
 *
 * ตอนนี้: นัดบ้านเดียวกันครั้งเดียวกัน = 1 แถว แล้วเอาบิลที่ผูกกับนัดนั้น (หรือจ่ายในช่วงวันที่พักนั้น)
 * มาแปะในแถวเดียวกัน — ได้ช่วงวันเข้าพัก ห้อง จำนวนคืน ยอดรวม และสถานะในที่เดียว
 */
import { groupBookings } from "./booking-group";

export type HistoryServiceRecord = {
  id: string;
  service: string;
  date: string;
  amount?: number;
  catName: string;
  invoiceId?: string;
  bookingId?: string;
};

export type HistoryBooking = {
  id: string;
  catName: string;
  service: "groom" | "room";
  date: string;
  time?: string;
  checkin?: string;
  checkout?: string;
  status: string;
  room?: string;
  roomType?: string;
  groomProgram?: string;
};

export type HistoryBillItem = { kind?: string; label: string; qty?: number };
export type HistoryBillLite = { id: string; items: HistoryBillItem[] };

export type HistoryRowStatus = "paid" | "unbilled" | "no_show" | "cancelled";

export type HistoryRow = {
  key: string;
  kind: "room" | "groom";
  /** วันเริ่ม (เข้าพัก/วันอาบ) — ใช้เรียง */
  start: string;
  end?: string;
  time?: string;
  nights?: number;
  /** "ห้อง Mini Duo" / "อาบน้ำ + ขจัดคราบมัน" */
  title: string;
  /** รายการอื่นในบิลเดียวกัน เช่น อาบน้ำก่อนกลับ */
  extras: string[];
  cats: string[];
  amount?: number;
  status: HistoryRowStatus;
  bookingIds: string[];
  serviceIds: string[];
};

const day = (s?: string) => (s || "").slice(0, 10);

function nightsBetween(a?: string, b?: string) {
  if (!a || !b) return 0;
  const x = Date.parse(`${day(a)}T12:00:00Z`);
  const y = Date.parse(`${day(b)}T12:00:00Z`);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
  return Math.max(0, Math.round((y - x) / 86400000));
}

/** ตัด "🐾 ชื่อน้อง · " ที่ติดมากับชื่อรายการในบิล (ชื่อน้องโชว์แยกอยู่แล้ว) */
export function stripCatPrefix(label: string) {
  return (label || "")
    .replace(/(?:🐾|🐱)\s*[^·]*·\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ROOM_RE = /×\s*\d+\s*คืน/;

/** "ห้อง Mini Duo × 2 คืน (พักต่อ)" → { room: "ห้อง Mini Duo", nights: 2 } */
function parseRoom(label: string): { room: string; nights: number } | null {
  const m = stripCatPrefix(label).match(/^(.*?)\s*×\s*(\d+)\s*คืน/);
  if (!m) return null;
  return { room: m[1].trim(), nights: Number(m[2]) || 0 };
}

function splitNames(s: string) {
  return (s || "")
    .split(/[,،]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

const norm = (s: string) => s.replace(/^น้อง/, "").replace(/\s+/g, "").toLowerCase();

/** เรียงชื่อแมวตามลำดับในโปรไฟล์ลูกค้า (ไม่งั้นแถวนึง "ชิมบ้า, ซูโม่" อีกแถว "ซูโม่, ชิมบ้า") */
function orderCats(names: string[], catOrder: string[]) {
  const uniq: string[] = [];
  for (const n of names) if (n && !uniq.some((u) => norm(u) === norm(n))) uniq.push(n);
  const rank = (n: string) => {
    const i = catOrder.findIndex((c) => norm(c) === norm(n));
    return i < 0 ? 999 : i;
  };
  return uniq.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "th"));
}

/** ข้อความในบิล — ใช้บรรทัดจริงในบิล (ถ้ามี) แทนข้อความรวมที่ต่อกันด้วย ", " */
function billLines(rec: HistoryServiceRecord, bills: Map<string, HistoryBillLite>): HistoryBillItem[] {
  const bill = rec.invoiceId ? bills.get(rec.invoiceId) : undefined;
  if (bill?.items.length) return bill.items;
  // บันทึกเก่า: ชื่อรายการต่อกันด้วย ", " (ชื่อน้องก็คั่นด้วย ", " เลยแยกที่ 🐾 แทน)
  const text = (rec.service || "").replace(new RegExp(`^${escapeRe(rec.catName)}\\s*·\\s*`), "");
  const parts = /🐾|🐱/.test(text) ? text.split(/,\s*(?=🐾|🐱)/) : [text];
  return parts.map((label) => ({ label, kind: ROOM_RE.test(label) ? "room" : undefined }));
}

function escapeRe(s: string) {
  return (s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const isRoomItem = (it: HistoryBillItem) => it.kind === "room" || ROOM_RE.test(it.label || "");

export function buildServiceHistory(input: {
  services: HistoryServiceRecord[];
  /** นัดที่ผ่านมา — ขึ้นเป็นแถว */
  pastBookings: HistoryBooking[];
  /** นัดที่ยังไม่ถึง/กำลังพัก — ใช้แค่จับคู่บิลที่จ่ายล่วงหน้า (ไม่ขึ้นแถวเอง) */
  upcomingBookings?: HistoryBooking[];
  bills?: HistoryBillLite[];
  roomNames?: Record<string, string>;
  groomName?: (programId: string) => string | undefined;
  catOrder?: string[];
}): { rows: HistoryRow[]; cancelled: HistoryRow[] } {
  const roomNames = input.roomNames || {};
  const groomName = input.groomName || (() => undefined);
  const catOrder = input.catOrder || [];
  const bills = new Map((input.bills || []).map((b) => [b.id, b]));

  type Group = { list: HistoryBooking[]; past: boolean; recs: HistoryServiceRecord[] };
  const toGroups = (list: HistoryBooking[], past: boolean): Group[] => {
    const cancelled = list.filter((b) => b.status === "cancelled");
    const active = list.filter((b) => b.status !== "cancelled");
    return [cancelled, active].flatMap((l) =>
      groupBookings(l.map((b) => ({ ...b, customerName: "" }))).map((g) => ({
        list: g.map((x) => l.find((b) => b.id === x.id)!),
        past,
        recs: [] as HistoryServiceRecord[],
      }))
    );
  };
  const groups = [
    ...toGroups(input.pastBookings, true),
    ...toGroups(input.upcomingBookings || [], false),
  ];
  const byBooking = new Map<string, Group>();
  for (const g of groups) for (const b of g.list) byBooking.set(b.id, g);

  const loose: HistoryServiceRecord[] = [];
  for (const r of input.services) {
    const g = r.bookingId ? byBooking.get(r.bookingId) : undefined;
    if (g) g.recs.push(r);
    else loose.push(r);
  }

  // บิลที่ไม่ได้ผูกนัด (ออกบิลเอง) — จับคู่กับนัดที่ช่วงวันตรงกันและมีแมวตัวเดียวกัน
  const unmatched: HistoryServiceRecord[] = [];
  for (const r of loose) {
    const lines = billLines(r, bills);
    const kind: "room" | "groom" = lines.some(isRoomItem) ? "room" : "groom";
    const names = splitNames(r.catName).map(norm);
    const d = day(r.date);
    const g = groups.find((x) => {
      const b = x.list[0];
      if (b.status === "cancelled" || b.service !== kind) return false;
      if (!x.list.some((y) => names.includes(norm(y.catName)))) return false;
      const s = day(b.checkin || b.date);
      const e = day(b.checkout) || s;
      return kind === "room" ? s <= d && d <= e : d === s;
    });
    if (g) g.recs.push(r);
    else unmatched.push(r);
  }

  const rowFromGroup = (g: Group): HistoryRow => {
    const b = g.list[0];
    const lines = g.recs.flatMap((r) => billLines(r, bills));
    const kind = b.service;
    const start = day(b.checkin || b.date);
    const end = kind === "room" ? day(b.checkout) || undefined : undefined;
    let title: string;
    let nights: number | undefined;
    if (kind === "room") {
      const rooms = Array.from(
        new Set(g.list.map((x) => x.room || x.roomType || "").filter(Boolean))
      ).map((r) => roomNames[r] || r);
      const fromBill = lines.map((l) => (isRoomItem(l) ? parseRoom(l.label) : null)).find(Boolean);
      title = rooms.length
        ? rooms.map((r) => (r.startsWith("ห้อง") ? r : `ห้อง ${r}`)).join(" + ")
        : fromBill?.room || "ห้องพัก";
      nights = nightsBetween(start, end) || undefined;
    } else {
      const progs = Array.from(new Set(g.list.map((x) => x.groomProgram || "").filter(Boolean)));
      const fromBill = lines.find((l) => !isRoomItem(l));
      title = progs.length
        ? progs.map((p) => groomName(p) || p).join(" + ")
        : fromBill
          ? programOf(fromBill.label)
          : "อาบน้ำ";
    }
    const extras = Array.from(
      new Set(
        lines
          .filter((l) => (kind === "room" ? !isRoomItem(l) : false))
          .map((l) => programOf(l.label))
          .filter(Boolean)
      )
    );
    const amount = g.recs.reduce((s, r) => s + (r.amount || 0), 0);
    const status: HistoryRowStatus =
      b.status === "cancelled"
        ? "cancelled"
        : g.recs.length
          ? "paid"
          : b.status === "no_show"
            ? "no_show"
            : "unbilled";
    return {
      key: `b${g.list.map((x) => x.id).join(",")}`,
      kind,
      start,
      end,
      time: kind === "groom" ? b.time : undefined,
      nights,
      title,
      extras,
      cats: orderCats(
        [...g.list.map((x) => x.catName), ...g.recs.flatMap((r) => splitNames(r.catName))],
        catOrder
      ),
      amount: amount > 0 ? amount : undefined,
      status,
      bookingIds: g.list.map((x) => x.id),
      serviceIds: g.recs.map((r) => r.id),
    };
  };

  const rowFromRecord = (r: HistoryServiceRecord): HistoryRow => {
    const lines = billLines(r, bills);
    const room = lines.map((l) => (isRoomItem(l) ? parseRoom(l.label) : null)).find(Boolean);
    const others = lines.filter((l) => !isRoomItem(l)).map((l) => programOf(l.label));
    const nights = lines
      .filter(isRoomItem)
      .reduce((s, l) => s + (Number(l.qty) || parseRoom(l.label)?.nights || 0), 0);
    return {
      key: `s${r.id}`,
      kind: room ? "room" : "groom",
      start: day(r.date),
      nights: room ? nights || undefined : undefined,
      title: room ? room.room : others[0] || stripCatPrefix(r.service) || "ใช้บริการ",
      extras: room ? others : others.slice(1),
      cats: orderCats(splitNames(r.catName), catOrder),
      amount: r.amount && r.amount > 0 ? r.amount : undefined,
      status: "paid",
      bookingIds: [],
      serviceIds: [r.id],
    };
  };

  const fromGroups = groups.filter((g) => g.past || g.recs.length).map(rowFromGroup);
  const all = [...fromGroups, ...unmatched.map(rowFromRecord)].sort(
    (a, b) => b.start.localeCompare(a.start) || a.key.localeCompare(b.key)
  );
  return {
    rows: all.filter((r) => r.status !== "cancelled"),
    cancelled: all.filter((r) => r.status === "cancelled"),
  };
}

/** "🐱 ชิมบ้า · อาบน้ำ + ขจัดคราบมัน · แมวพันธุ์ขนยาว · M" → "อาบน้ำ + ขจัดคราบมัน" */
function programOf(label: string) {
  return stripCatPrefix(label).split("·")[0].trim();
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** 2026-10-28 → "28 ต.ค. 2026" · ช่วงวัน → "28–30 ต.ค. 2026" / "30 ต.ค. – 2 พ.ย. 2026" */
export function thaiDateRange(start: string, end?: string) {
  const p = (s: string) => {
    const m = day(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? { y: m[1], mo: TH_MONTHS[Number(m[2]) - 1], d: String(Number(m[3])) } : null;
  };
  const a = p(start);
  if (!a) return start;
  const b = end ? p(end) : null;
  if (!b || day(end) === day(start)) return `${a.d} ${a.mo} ${a.y}`;
  if (a.y === b.y && a.mo === b.mo) return `${a.d}–${b.d} ${a.mo} ${a.y}`;
  if (a.y === b.y) return `${a.d} ${a.mo} – ${b.d} ${b.mo} ${b.y}`;
  return `${a.d} ${a.mo} ${a.y} – ${b.d} ${b.mo} ${b.y}`;
}

/**
 * บิลที่หักคอร์สหลายใบของการเข้าพักเดียวกัน (บิลแรก + บิลต่อคืน) ผูกนัดเดียวกัน
 * → ไล่แบ่งช่วงวันตามลำดับบิล: ใบแรกได้คืนแรกๆ ใบต่อไปได้คืนถัดไป
 * จะได้เห็นว่าหักคอร์สไปคืนไหนบ้าง ไม่ใช่ทุกใบโชว์ช่วงพักทั้งช่วงเหมือนกัน
 */
export function courseUseRanges<
  T extends { id: string; bookingId?: string; at: string; nights: number },
>(
  uses: T[],
  bookingOf: (id: string) => { checkin?: string; date?: string; checkout?: string } | undefined
): Map<string, { checkin: string; checkout: string }> {
  const out = new Map<string, { checkin: string; checkout: string }>();
  const byBooking = new Map<string, T[]>();
  for (const u of uses) {
    if (!u.bookingId) continue;
    byBooking.set(u.bookingId, [...(byBooking.get(u.bookingId) || []), u]);
  }
  for (const [bid, list] of byBooking) {
    const bk = bookingOf(bid);
    const checkin = day(bk?.checkin || bk?.date);
    const checkout = day(bk?.checkout);
    if (!checkin || !checkout || checkout <= checkin) continue;
    if (list.length === 1) {
      out.set(list[0].id, { checkin, checkout });
      continue;
    }
    let cursor = checkin;
    for (const u of [...list].sort((a, b) => a.at.localeCompare(b.at))) {
      if (cursor >= checkout) break;
      let next = addDays(cursor, Math.max(1, u.nights));
      if (next > checkout) next = checkout;
      out.set(u.id, { checkin: cursor, checkout: next });
      cursor = next;
    }
  }
  return out;
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
