/**
 * ส่วนลดเฉพาะรายการ (ลดแยกทีละบรรทัดในบิล)
 *
 * เก็บเป็นฟิลด์บนรายการเลย ไม่ใช่แค่ข้อความในชื่อ:
 *   unitAmount = ราคาต่อหน่วย "ก่อนลด", amount = ยอดหลังลดแล้ว
 *   discount = ลดกี่บาท (โหมดบาท) / discountPercent = ลดกี่ % (โหมด %)
 * ชื่อรายการต่อท้ายด้วย "(ส่วนลด …)" ให้ทุกที่ที่โชว์บิล (LINE/หน้าจ่ายเงิน/Telegram)
 * เห็นว่ามีส่วนลดโดยไม่ต้องแก้ทีละที่
 *
 * ปัญหาเดิม: หน้าออกบิลส่ง amount ที่ลดแล้ว แต่ unitAmount เป็นราคาก่อนลด
 * เซิร์ฟเวอร์คิดใหม่จาก unitAmount × จำนวน → ส่วนลดหายตอนออกบิลครั้งแรก
 * (ตอนแก้บิลไม่ได้คิดใหม่ เลยต้องแก้บิลอีกรอบถึงจะลดได้)
 */

export type LineDiscountFields = {
  label: string;
  amount: number;
  qty?: number;
  unitAmount?: number;
  kind?: string;
  discount?: number;
  discountPercent?: number;
};

/** ป้ายส่วนลดท้ายชื่อรายการ — รองรับแบบเก่า "(ลด 50฿)" / "(ลด 10%)" ด้วย */
const DISCOUNT_TAG_RE = /\s*\((?:ส่วนลด|ลด) [^()]*\)\s*$/;

export function stripDiscountTag(label: string): string {
  return (label || "").replace(DISCOUNT_TAG_RE, "");
}

/** ยอดที่ลดจริง (บาท) จากราคาเต็มของบรรทัด */
export function lineDiscountOff(
  gross: number,
  d: { discount?: number; discountPercent?: number }
): number {
  if (gross <= 0) return 0;
  const pct = Math.max(0, Number(d.discountPercent) || 0);
  if (pct > 0) return Math.min(gross, Math.round((gross * Math.min(100, pct)) / 100));
  return Math.min(gross, Math.max(0, Math.round(Number(d.discount) || 0)));
}

export function discountTag(off: number, percent?: number): string {
  return percent
    ? `ส่วนลด ${Math.min(100, percent)}% -${off.toLocaleString()}฿`
    : `ส่วนลด -${off.toLocaleString()}฿`;
}

/**
 * จัดรายการให้ยอดตรงกันเสมอ: amount = unitAmount × qty − ส่วนลด และชื่อมีป้ายส่วนลด
 * รายการเก่าที่ไม่มีฟิลด์ส่วนลด แต่ amount น้อยกว่าราคาเต็ม (แก้บิลแบบเดิม) → ถือว่าเป็นส่วนลดบาท
 */
export function normalizeLineDiscount<T extends LineDiscountFields>(it: T): T {
  const qty = Math.max(1, Math.round(Number(it.qty) || 1));
  const amount = Math.round(Number(it.amount) || 0);
  const unit = Math.round(Number(it.unitAmount ?? amount / qty) || 0);
  const gross = unit * qty;
  const label = stripDiscountTag(it.label);
  const hasFields = (Number(it.discount) || 0) > 0 || (Number(it.discountPercent) || 0) > 0;
  const off =
    it.kind === "freebie"
      ? 0
      : hasFields
        ? lineDiscountOff(gross, it)
        : it.unitAmount !== undefined && amount < gross
          ? gross - Math.max(0, amount)
          : 0;
  const pct = off > 0 && (Number(it.discountPercent) || 0) > 0 ? Number(it.discountPercent) : undefined;
  const out = {
    ...it,
    qty,
    unitAmount: unit,
    amount: gross - off,
    label: off > 0 ? `${label} (${discountTag(off, pct)})` : label,
  };
  delete out.discount;
  delete out.discountPercent;
  if (off > 0) {
    if (pct) out.discountPercent = Math.min(100, pct);
    else out.discount = off;
  }
  return out;
}

/** แยกป้ายส่วนลดออกจากชื่อ — ไว้โชว์ส่วนลดเป็นบรรทัดสีเขียวแยก (การ์ด LINE) */
export function splitDiscountTag(label: string): { label: string; tag: string } {
  const m = (label || "").match(DISCOUNT_TAG_RE);
  if (!m) return { label: label || "", tag: "" };
  return { label: stripDiscountTag(label), tag: m[0].trim().replace(/^\(|\)$/g, "") };
}
