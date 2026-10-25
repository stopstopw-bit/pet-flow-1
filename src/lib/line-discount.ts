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
  /** ชื่อโปรที่ให้ส่วนลดบรรทัดนี้ (เลือกจากโปรลดเฉพาะรายการ) — ไม่มี = ลดเองทีละรายการ */
  discountName?: string;
};

/** ประเภทรายการที่โปรลดเฉพาะรายการเลือกได้ */
export type LinePromoKind = "stay" | "daycare" | "grooming" | "transport" | "service" | "product";

export const LINE_PROMO_KINDS: { id: LinePromoKind; label: string }[] = [
  { id: "stay", label: "ห้องพัก" },
  { id: "daycare", label: "Day Care" },
  { id: "grooming", label: "อาบน้ำ / กรูม" },
  { id: "transport", label: "รับ-ส่ง" },
  { id: "service", label: "บริการเสริมอื่นๆ" },
  { id: "product", label: "สินค้าหน้าร้าน" },
];

/** โปรลดเฉพาะรายการ — ตั้งไว้ในตั้งค่า แล้วกดเลือกตอนออกบิล ลดเฉพาะรายการประเภทที่ติ๊กไว้ */
export type LinePromo = {
  id: string;
  name: string;
  percent: number;
  kinds: LinePromoKind[];
  /** ใช้ได้เฉพาะบิลที่มีห้องพักตั้งแต่กี่คืนขึ้นไป (เช่น โปรรายเดือน 30 คืน) — เว้นว่าง = ทุกบิล */
  minNights?: number;
  /**
   * แบบแถมคืนฟรี (แทนการลด %) — พักครบ freeEvery + freeNights คืน ไม่คิดเงิน freeNights คืน
   * เช่น freeEvery 10 · freeNights 1 = "จอง 10 คืน แถม 1" พัก 11 คืน จ่าย 10 (พัก 22 คืน แถม 2)
   */
  freeEvery?: number;
  freeNights?: number;
};

/** โปรนี้เป็นแบบแถมคืนฟรีไหม */
export function isFreeNightsPromo(p?: LinePromo): boolean {
  return !!p && (p.freeEvery || 0) > 0 && (p.freeNights || 0) > 0;
}

/** พักกี่คืนได้แถมกี่คืน — ครบรอบ (จ่าย + แถม) ถึงได้ */
export function freeNightsFor(p: LinePromo, nights: number): number {
  if (!isFreeNightsPromo(p)) return 0;
  const round = p.freeEvery! + p.freeNights!;
  return Math.floor(Math.max(0, nights) / round) * p.freeNights!;
}

/** ข้อความสั้นของโปร เช่น "ลด 30%" / "จอง 10 คืน แถม 1" */
export function linePromoShortLabel(p: LinePromo): string {
  return isFreeNightsPromo(p) ? `จอง ${p.freeEvery} คืน แถม ${p.freeNights}` : `${p.percent}%`;
}

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

export function discountTag(off: number, percent?: number, name?: string): string {
  // ชื่อโปรห้ามมีวงเล็บ — ป้ายทั้งก้อนอยู่ในวงเล็บ ถอดออกทีหลังด้วย regex
  const promo = (name || "").replace(/[()]/g, "").trim();
  const head = percent ? `ส่วนลด ${Math.min(100, percent)}%` : "ส่วนลด";
  return `${head}${promo ? ` ${promo}` : ""} -${off.toLocaleString()}฿`;
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
    label: off > 0 ? `${label} (${discountTag(off, pct, it.discountName)})` : label,
  };
  delete out.discount;
  delete out.discountPercent;
  if (off <= 0) delete out.discountName;
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

/**
 * เงื่อนไขโปรที่ลดตอนออกบิลแบบเฉพาะรายการ — เก็บในตารางโปร (promos.bill_rule)
 * ไม่มี = โปรลดทั้งบิลแบบเดิม · kinds = ลด % เฉพาะประเภทนั้น · freeEvery/freeNights = แถมคืนฟรี
 */
export type PromoBillRule = {
  kinds?: LinePromoKind[];
  minNights?: number;
  freeEvery?: number;
  freeNights?: number;
};

/** โปรในตารางโปร → โปรลดเฉพาะรายการ (คืน undefined = โปรลดทั้งบิล) */
export function promoAsLinePromo(
  p?: { id: string; title: { th: string }; discountPercent?: number; billRule?: PromoBillRule | null } | null
): LinePromo | undefined {
  const r = p?.billRule;
  if (!p || !r) return undefined;
  const lp: LinePromo = {
    id: p.id,
    name: p.title.th.replace(/[()]/g, "").trim(),
    percent: Math.max(0, Number(p.discountPercent) || 0),
    kinds: r.kinds || [],
    minNights: r.minNights || undefined,
    freeEvery: r.freeEvery || undefined,
    freeNights: r.freeNights || undefined,
  };
  if (isFreeNightsPromo(lp)) return { ...lp, percent: 0, kinds: ["stay"] };
  return lp.percent > 0 && lp.kinds.length > 0 ? lp : undefined;
}

/** ข้อความรางวัลของโปรเฉพาะรายการ เช่น "จอง 10 คืน แถม 1" / "ลด 30% ห้องพัก · 30 คืน+" */
export function billRuleLabel(lp: LinePromo): string {
  if (isFreeNightsPromo(lp)) return `จอง ${lp.freeEvery} คืน แถม ${lp.freeNights}`;
  const kinds = LINE_PROMO_KINDS.filter((k) => lp.kinds.includes(k.id))
    .map((k) => k.label)
    .join(" + ");
  return `ลด ${lp.percent}% ${kinds}${lp.minNights ? ` · ${lp.minNights} คืน+` : ""}`;
}
