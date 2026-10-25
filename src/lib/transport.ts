/**
 * บริการรับ-ส่งน้องแมวของนัดหนึ่งนัด
 * - อาบน้ำ: รับ = ไปรับน้องจากบ้านมาร้าน · ส่ง = พาน้องกลับบ้านหลังอาบเสร็จ
 * - ฝากพัก: รับ = วันเข้าพัก · ส่ง = วันออก
 * จุดรับ-ส่งปกติเป็นที่เดียวกัน (ลิงก์ Google Maps + ที่อยู่/จุดสังเกต) ลูกค้ากรอกเองก่อนวันนัด
 */
export type BookingTransport = {
  pickup?: boolean;
  dropoff?: boolean;
  /** ลิงก์ Google Maps จุดรับ-ส่ง */
  mapUrl?: string;
  /** ที่อยู่หรือจุดสังเกตเพิ่มเติม เช่น "ตึก B ชั้น 5 ฝากรปภ.ได้" */
  address?: string;
  /** เวลาไปรับน้อง (HH:MM) — ร้านรู้แล้วใส่ไว้ตอนลงนัด จะได้ไม่ต้องถามลูกค้าซ้ำ */
  pickupTime?: string;
  /** เวลาไปส่งน้องกลับบ้าน (HH:MM) */
  dropoffTime?: string;
};

/** รับเฉพาะเวลา HH:MM — ค่าอื่นทิ้ง */
export function cleanClockTime(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : undefined;
}

/** ลิงก์ที่รับได้ — ต้องเป็น http(s) เท่านั้น กันลิงก์แปลกๆ ไปโผล่ในการ์ด */
export function cleanMapUrl(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString().slice(0, 500) : undefined;
  } catch {
    return undefined;
  }
}

/** ทำความสะอาดข้อมูลรับ-ส่งที่ส่งมาจากฟอร์ม — ไม่ใช้ทั้งรับและส่ง = ไม่มีบริการ (undefined) */
export function cleanTransport(v: unknown): BookingTransport | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const t: BookingTransport = {
    pickup: o.pickup === true,
    dropoff: o.dropoff === true,
    mapUrl: cleanMapUrl(o.mapUrl),
    address: String(o.address ?? "").trim().slice(0, 300) || undefined,
    pickupTime: o.pickup === true ? cleanClockTime(o.pickupTime) : undefined,
    dropoffTime: o.dropoff === true ? cleanClockTime(o.dropoffTime) : undefined,
  };
  if (!t.pickup && !t.dropoff) return undefined;
  return t;
}

export function hasTransport(t?: BookingTransport | null): t is BookingTransport {
  return !!t && (!!t.pickup || !!t.dropoff);
}

/** ข้อความสั้นสำหรับโชว์ เช่น "รับ + ส่ง" หรือ "รับ 09:00 + ส่ง 15:30" ถ้าร้านใส่เวลาไว้ */
export function transportLabel(t?: BookingTransport | null): string {
  if (!hasTransport(t)) return "";
  const at = (time?: string) => (time ? ` ${time}` : "");
  if (t.pickup && t.dropoff) {
    return t.pickupTime || t.dropoffTime
      ? `รับ${at(t.pickupTime)} + ส่ง${at(t.dropoffTime)}`
      : "รับ + ส่ง";
  }
  return t.pickup ? `รับน้อง${at(t.pickupTime)}` : `ส่งน้องกลับบ้าน${at(t.dropoffTime)}`;
}

/* ───────────── ค่ารับ-ส่ง (คิดเป็นเที่ยว) ─────────────
 * บรรทัดค่ารับ-ส่งในบิลเก็บ qty = จำนวนเที่ยว (เที่ยวเดียว = 1 · ไป-กลับ = 2)
 * และ unitAmount = ราคาต่อเที่ยว ร้านจะเห็นเสมอว่าขาละเท่าไหร่
 * ราคาต่อเที่ยวขึ้นกับระยะทางบ้านลูกค้า จึงจำจากบิลล่าสุดของลูกค้าคนนั้นแล้วเติมให้เอง
 */

/** ชื่อรายการบริการที่เป็นค่ารับ-ส่ง (ตั้งชื่อเองในตั้งค่าได้ เช่น "ค่ารับ-ส่ง") */
export function isTransportLabel(label?: string): boolean {
  return /รับ\s*-?\s*ส่ง/.test(String(label || "").replace(/^🐱 .+? · /, ""));
}

/** จำนวนเที่ยวของนัด — ติ๊กทั้งรับและส่ง = ไป-กลับ 2 เที่ยว */
export function transportTrips(t?: BookingTransport | null): number {
  if (!hasTransport(t)) return 0;
  return (t.pickup ? 1 : 0) + (t.dropoff ? 1 : 0);
}

/** คำบอกจำนวนเที่ยวต่อท้ายชื่อรายการในบิล */
export function tripLabel(trips: number): string {
  if (trips === 1) return "เที่ยวเดียว";
  if (trips === 2) return "ไป-กลับ";
  return `${trips} เที่ยว`;
}

/** ถอดคำบอกจำนวนเที่ยวออก เหลือชื่อรายการเดิม (ใช้ตอนเปิดบิลเก่ามาแก้) */
export function stripTripLabel(label: string): string {
  return label.replace(/\s+(เที่ยวเดียว|ไป-กลับ|\d+ เที่ยว)$/, "");
}

type PastTransportInvoice = {
  customerId?: string;
  createdAt?: string;
  items?: { label: string; kind?: string; qty?: number; unitAmount?: number; amount: number }[];
};

/** ราคาต่อเที่ยวที่ลูกค้าคนนี้จ่ายครั้งล่าสุด — ไม่เคยใช้รับ-ส่ง = null */
export function lastTransportPrice(
  invoices: PastTransportInvoice[],
  customerId?: string
): { unitAmount: number; when?: string } | null {
  if (!customerId) return null;
  const mine = invoices
    .filter((i) => i.customerId === customerId)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  for (const inv of mine) {
    for (const it of inv.items || []) {
      if (it.kind === "freebie" || !isTransportLabel(it.label)) continue;
      const unit =
        typeof it.unitAmount === "number"
          ? it.unitAmount
          : it.qty && it.qty > 0
            ? Math.round(it.amount / it.qty)
            : it.amount;
      if (unit > 0) return { unitAmount: unit, when: inv.createdAt };
    }
  }
  return null;
}
