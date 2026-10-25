/**
 * บรรทัด "ค่าห้องพัก" ในบิล — ใช้ร่วมกันทั้งฝั่งต่อคืน (stay-sync) และหน้าแก้บิล
 *
 * รูปแบบชื่อรายการ: "<ห้อง> × N คืน" ตามด้วยหมายเหตุ (ถ้ามี) เช่น
 *   "ห้อง Mid Cozy Room × 7 คืน (พักต่อ 18 ต.ค. → 25 ต.ค. 2026)"
 * บิลเก่าที่ถูกเปิดแก้แล้วบันทึกซ้ำ จะกลายเป็น "… × 12 คืน (ต่อคืน) × 7" (kind = custom)
 * จำนวนคืนจริงคือ qty (7) ไม่ใช่เลขในชื่อ — ฟังก์ชันด้านล่างอ่านแบบนี้ได้ทั้งหมด
 */
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

type LineLike = { label: string; kind?: string; qty?: number };

const NIGHTS_RE = /\s*×\s*\d+\s*คืน/;

/** บรรทัดนี้เป็นค่าห้องพักไหม (รวมบรรทัดห้องที่ถูกแก้บิลจนกลายเป็น "พิมพ์เอง") */
export function isRoomLine(it: LineLike): boolean {
  if (it.kind === "room") return true;
  if (it.kind === "grooming" || it.kind === "package" || it.kind === "freebie") return false;
  return NIGHTS_RE.test(it.label || "");
}

/** แยกชื่อห้อง กับหมายเหตุท้าย "× N คืน" ออกจากกัน (ตัด "× qty" ที่ต่อท้ายซ้ำออกด้วย) */
export function splitRoomLabel(label: string): { base: string; note: string } {
  const clean = (label || "").replace(/\s*×\s*\d+\s*$/, "");
  const m = clean.match(/^(.*?)\s*×\s*\d+\s*คืน\s*(.*)$/);
  if (!m) return { base: clean.trim(), note: "" };
  // "(ต่อคืน)" อ่านแล้วเหมือน "ราคาต่อคืน" — เปลี่ยนเป็น "(พักต่อ)" ให้ชัด
  const note = m[2].trim() === "(ต่อคืน)" ? "(พักต่อ)" : m[2].trim();
  return { base: m[1].trim(), note };
}

export function roomLineLabel(base: string, nights: number, note?: string): string {
  return `${base} × ${nights} คืน${note ? ` ${note}` : ""}`;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function short(iso: string, withYear: boolean): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const s = `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]}`;
  return withYear ? `${s} ${d.getUTCFullYear()}` : s;
}

/** หมายเหตุบิลพักต่อ: "(พักต่อ 18 ต.ค. → 25 ต.ค. 2026)" = จากวันออกรอบก่อน ถึงวันออกใหม่ */
export function extensionNote(fromIso: string, toIso: string): string {
  const sameYear = fromIso.slice(0, 4) === toIso.slice(0, 4);
  return `(พักต่อ ${short(fromIso, !sameYear)} → ${short(toIso, true)})`;
}

/** จำนวนคืนระหว่างสองวัน (ISO) — ไม่ถูกต้อง/ย้อนหลัง = 0 */
export function nightsBetweenIso(fromIso: string, toIso: string): number {
  const a = Date.parse(`${(fromIso || "").slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${(toIso || "").slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * ทำชื่อรายการในประวัติใช้บริการให้อ่านง่าย — ประวัติเก่าบันทึกชื่อบรรทัดบิลดิบๆ ไว้
 * (จากบิลที่เคยเปิดแก้ก่อนแก้บั๊ก) เช่น "ห้อง X × 5 คืน (ต่อคืน) × 5" หรือ "ห้อง X × 7"
 * → "ห้อง X × 5 คืน (พักต่อ)" / "ห้อง X × 7 คืน" ยอดเงินไม่เปลี่ยน แค่ชื่อที่แสดง
 */
export function tidyServiceText(text: string): string {
  return (text || "")
    .replace(/(×\s*\d+\s*คืน[^,×]*?)\s*×\s*\d+(?!\d)/g, "$1")
    .replace(/\(ต่อคืน\)/g, "(พักต่อ)")
    .replace(/(ห้อง[^×,]*×\s*\d+)(?!\d)(?!\s*คืน)/g, "$1 คืน");
}
