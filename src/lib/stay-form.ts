import { type GroomField, type GroomFormConfig } from "./groom-form";
import type { PetKind } from "./pet-kind";

/**
 * โครงคำถามฟอร์ม "ข้อมูลน้องก่อนเข้าพัก" — คนละชุดกับฟอร์มก่อนอาบน้ำ (เน้นการกิน การดูแล นิสัยตอนอยู่ห้อง)
 * ใช้ชนิดคำถามเดียวกับ groom-form (หน้าฟอร์มลูกค้าตัวเดียวกันแสดงได้ทั้งสองชุด)
 * key ห้ามเปลี่ยน (ข้อมูลเก่าอ้างอิงอยู่) · "medical" ข้ามให้ถ้าลูกค้าตอบไว้แล้วตอนสมัครสมาชิก
 */
export const STAY_FORM_DEFAULTS: GroomField[] = [
  {
    key: "food",
    type: "text",
    label: "ปกติน้องกินอาหารอะไรคะ (ยี่ห้อ / เม็ด / เปียก) — รบกวนเตรียมอาหารมาเองนะคะ",
    placeholder: "เช่น Royal Canin เม็ด + อาหารเปียกมื้อเย็น",
    required: true,
    enabled: true,
    options: [],
  },
  {
    key: "meals",
    type: "text",
    label: "กินวันละกี่มื้อ มื้อละประมาณเท่าไหร่คะ",
    placeholder: "เช่น 2 มื้อ เช้า-เย็น มื้อละ 1/4 ถ้วย",
    required: true,
    enabled: true,
    options: [],
  },
  {
    key: "snacks",
    type: "text",
    label: "ขนมที่ให้ได้ / ห้ามให้ (ถ้ามี)",
    placeholder: "เช่น ให้ขนมได้วันละ 1 ชิ้น",
    required: false,
    enabled: true,
    options: [],
  },
  {
    key: "likes",
    type: "text",
    label: "น้องชอบอะไรคะ (ของเล่น / ให้อุ้ม / ที่นอนแบบไหน)",
    placeholder: "เช่น ชอบเล่นลูกบอล ชอบนอนในที่มืดๆ",
    required: false,
    enabled: true,
    options: [],
  },
  {
    key: "dislikes",
    type: "text",
    label: "น้องไม่ชอบหรือกลัวอะไรคะ",
    placeholder: "เช่น ไม่ชอบให้จับท้อง กลัวเสียงดัง",
    required: false,
    enabled: true,
    options: [],
  },
  {
    key: "withOthers",
    type: "single",
    label: "อยู่กับน้องตัวอื่นได้ไหมคะ",
    required: true,
    enabled: true,
    options: [
      { key: "ok", label: "😊 เข้ากับตัวอื่นได้" },
      { key: "alone", label: "🙈 ชอบอยู่ตัวเดียว" },
      { key: "unknown", label: "❓ ไม่แน่ใจ" },
    ],
  },
  {
    key: "litter",
    type: "text",
    label: "ทรายที่ใช้ / การขับถ่ายที่ควรรู้",
    placeholder: "เช่น ทรายเต้าหู้ ขับถ่ายปกติ",
    required: false,
    enabled: true,
    options: [],
  },
  {
    key: "medical",
    type: "textarea",
    label: "โรคประจำตัว / ยาที่ต้องกิน (ถ้าไม่มีเว้นว่างได้)",
    placeholder: "เช่น กินยาโรคไต เช้า-เย็น หลังอาหาร",
    required: false,
    enabled: true,
    options: [],
  },
  {
    key: "note",
    type: "textarea",
    label: "อยากให้ดูแลอะไรเป็นพิเศษไหมคะ",
    placeholder: "เช่น ขอรูปอัปเดตทุกเย็น ช่วยแปรงขนให้หน่อย",
    required: false,
    enabled: true,
    options: [],
  },
];

/** คำถามเรื่องทรายเป็นของแมว — ร้านหมาถามเรื่องพาเดิน/ขับถ่ายแทน · ร้านรับทั้งสองแบบถามรวม */
const LITTER_BY_KIND: Partial<Record<PetKind, Pick<GroomField, "label" | "placeholder">>> = {
  dog: { label: "การขับถ่าย / พาเดินวันละกี่รอบ", placeholder: "เช่น พาเดินเช้า-เย็น ขับถ่ายปกติ" },
  both: { label: "ทรายที่ใช้ (แมว) / การขับถ่าย-พาเดิน (หมา)", placeholder: "เช่น ทรายเต้าหู้ · หรือ พาเดินเช้า-เย็น" },
};

/** รวมค่าเริ่มต้นกับที่ร้านแก้เอง (ถ้ามีในอนาคต) — คืนรายการคำถามที่ใช้แสดงจริง */
export function resolveStayForm(config?: GroomFormConfig, kind?: PetKind): GroomField[] {
  const byKind = kind ? LITTER_BY_KIND[kind] : undefined;
  return STAY_FORM_DEFAULTS.map((d) => (d.key === "litter" && byKind ? { ...d, ...byKind } : d)).map((def) => {
    const c = config?.[def.key];
    if (!c) return def;
    return {
      ...def,
      enabled: c.enabled ?? def.enabled,
      required: c.required ?? def.required,
      label: c.label?.trim() || def.label,
      placeholder: c.placeholder ?? def.placeholder,
      options: c.options && c.options.length > 0 ? c.options.filter((o) => o.key && o.label) : def.options,
    };
  }).filter((f) => f.enabled);
}
