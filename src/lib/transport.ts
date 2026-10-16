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
};

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
  };
  if (!t.pickup && !t.dropoff) return undefined;
  return t;
}

export function hasTransport(t?: BookingTransport | null): t is BookingTransport {
  return !!t && (!!t.pickup || !!t.dropoff);
}

/** ข้อความสั้นสำหรับโชว์ เช่น "รับ + ส่ง" */
export function transportLabel(t?: BookingTransport | null): string {
  if (!hasTransport(t)) return "";
  if (t.pickup && t.dropoff) return "รับ + ส่ง";
  return t.pickup ? "รับน้อง" : "ส่งน้องกลับบ้าน";
}
