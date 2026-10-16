import type { CustomerRecord, CatRecord } from "./customers-store";
import { listAllServiceRecords } from "./customers-store";
import { listBookings } from "./bookings-store";
import { bookingMatchesCustomer } from "./booking-customer-match";

/**
 * แบ่งกลุ่มลูกค้าสำหรับส่งโปรเฉพาะกลุ่ม — ติ๊กได้หลายกลุ่ม (ต้องตรงทุกข้อที่ติ๊ก)
 * - regular: ขาประจำ = มาใช้บริการจริงตั้งแต่ N วัน (นับวันที่มา ไม่ใช่จำนวนแมว)
 * - longhair: มีน้องขนยาวอย่างน้อย 1 ตัว
 * - bath / stay: เคยใช้บริการอาบน้ำ / ฝากพัก
 * - new: สมัครแล้วยังไม่เคยมาใช้บริการ
 */
export type SegmentId = "regular" | "longhair" | "bath" | "stay" | "new";

export const SEGMENT_IDS: SegmentId[] = ["regular", "longhair", "bath", "stay", "new"];

export const DEFAULT_REGULAR_MIN_VISITS = 3;

export type CustomerActivity = {
  visits: number;
  lastVisit: string | null;
  bath: boolean;
  stay: boolean;
};

const LONG_HAIR_BREED =
  /เปอร์เซีย|persian|แร็กดอลล์|ragdoll|เมนคูน|maine\s*coon|ลองแฮร์|longhair|long\s*hair|ขนยาว|นอร์วีเจียน|norwegian|ไซบีเรียน|siberian|เบอร์แมน|birman|หิมาลายัน|himalayan/i;

/** น้องขนยาว — ใช้ที่ลูกค้าเลือกตอนสมัครก่อน ถ้าไม่ได้เลือกค่อยเดาจากสายพันธุ์ */
export function isLongHairCat(cat: Pick<CatRecord, "breed" | "furLength">): boolean {
  if (cat.furLength) return cat.furLength === "long";
  return LONG_HAIR_BREED.test(cat.breed || "");
}

const BATH_LABEL = /อาบ|groom|ตัดขน|สางขน|spa/i;
const STAY_LABEL = /ห้อง|พัก|room|stay|ฝาก/i;

/** สถิติการมาใช้บริการของลูกค้าทุกคน — โหลดนัดและประวัติบริการครั้งเดียวแล้วจับคู่ */
export async function customerActivityMap(
  customers: CustomerRecord[]
): Promise<Map<string, CustomerActivity>> {
  const [bookings, services] = await Promise.all([listBookings(), listAllServiceRecords()]);
  const days = new Map<string, Set<string>>();
  const out = new Map<string, CustomerActivity>();
  for (const c of customers) {
    days.set(c.id, new Set());
    out.set(c.id, { visits: 0, lastVisit: null, bath: false, stay: false });
  }

  for (const s of services) {
    const a = out.get(s.customerId);
    if (!a) continue;
    if (s.date) days.get(s.customerId)!.add(s.date.slice(0, 10));
    if (BATH_LABEL.test(s.service)) a.bath = true;
    if (STAY_LABEL.test(s.service)) a.stay = true;
  }

  const byLine = new Map<string, CustomerRecord>();
  for (const c of customers) {
    for (const id of [c.lineUserId, ...(c.lineUserIds || [])]) if (id) byLine.set(id, c);
  }
  for (const b of bookings) {
    if (b.status !== "ready" && b.status !== "done") continue;
    const c =
      (b.lineUserId && byLine.get(b.lineUserId)) ||
      customers.find((x) => bookingMatchesCustomer(b, x));
    if (!c) continue;
    const a = out.get(c.id)!;
    const d = (b.date || b.checkin || "").slice(0, 10);
    if (d) days.get(c.id)!.add(d);
    if (b.service === "room") a.stay = true;
    else a.bath = true;
  }

  for (const [id, set] of days) {
    const a = out.get(id)!;
    a.visits = set.size;
    a.lastVisit = set.size ? [...set].sort().at(-1)! : null;
  }
  return out;
}

export function matchesSegments(
  c: CustomerRecord,
  a: CustomerActivity | undefined,
  segments: SegmentId[],
  regularMinVisits = DEFAULT_REGULAR_MIN_VISITS
): boolean {
  const act = a || { visits: 0, lastVisit: null, bath: false, stay: false };
  return segments.every((s) => {
    switch (s) {
      case "regular":
        return act.visits >= Math.max(1, regularMinVisits);
      case "longhair":
        return c.cats.some(isLongHairCat);
      case "bath":
        return act.bath;
      case "stay":
        return act.stay;
      case "new":
        return act.visits === 0;
      default:
        return true;
    }
  });
}

export function parseSegments(v: unknown): SegmentId[] {
  const raw = Array.isArray(v) ? v : String(v || "").split(",");
  return raw
    .map((x) => String(x).trim())
    .filter((x): x is SegmentId => (SEGMENT_IDS as string[]).includes(x));
}
