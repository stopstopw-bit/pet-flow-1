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
      { key: "ok", label: "🤝 เข้ากับตัวอื่นได้" },
      { key: "alone", label: "🏠 ชอบอยู่ตัวเดียว" },
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

/**
 * หมากับแมวดูแลคนละแบบ — แมวถามเรื่องทราย หมาถามที่ขับถ่าย สายจูง เห่า
 * ไม่ถามรอบพาเดิน/นอนกรง — แต่ละร้านมีวิธีดูแลของตัวเอง
 * ไม่รู้ชนิด (ร้านรับทั้งสองแบบแต่น้องยังไม่ได้ระบุ) ถามข้อขับถ่ายรวมข้อเดียว
 */
const DOG_FIELDS: GroomField[] = [
  {
    key: "potty",
    type: "single",
    label: "น้องขับถ่ายที่ไหนคะ",
    required: true,
    enabled: true,
    options: [
      { key: "outside", label: "🌳 ข้างนอกตอนพาเดิน" },
      { key: "pad", label: "🧻 แผ่นรองฉี่" },
      { key: "both", label: "👍 ได้ทั้งสองแบบ" },
    ],
  },
  {
    key: "leash",
    type: "single",
    label: "เดินสายจูงเป็นยังไงบ้างคะ",
    required: false,
    enabled: true,
    options: [
      { key: "good", label: "🦮 เดินดี ไม่ดึง" },
      { key: "pull", label: "💪 ดึงสายแรง" },
      { key: "never", label: "🚫 ไม่เคยใส่สายจูง" },
    ],
  },
  {
    key: "barking",
    type: "text",
    label: "เห่า / หอน หรือติดเจ้าของตอนอยู่ที่ใหม่ไหมคะ",
    placeholder: "เช่น เห่าตอนได้ยินเสียงประตู คืนแรกอาจหอน",
    required: false,
    enabled: true,
    options: [],
  },
];

const LITTER_BOTH: Pick<GroomField, "label" | "placeholder"> = {
  label: "ทรายที่ใช้ (แมว) / การขับถ่าย (หมา)",
  placeholder: "เช่น ทรายเต้าหู้ · หรือ ขับถ่ายแผ่นรองฉี่",
};

/** คำถามตามชนิดของน้อง — แทนข้อ "ทราย" ของแมว */
function fieldsFor(kind?: PetKind): GroomField[] {
  if (kind === "dog") return STAY_FORM_DEFAULTS.flatMap((d) => (d.key === "litter" ? DOG_FIELDS : [d]));
  if (kind === "both") return STAY_FORM_DEFAULTS.map((d) => (d.key === "litter" ? { ...d, ...LITTER_BOTH } : d));
  return STAY_FORM_DEFAULTS;
}

/**
 * รวมค่าเริ่มต้นกับที่ร้านแก้เอง (ถ้ามีในอนาคต) — คืนรายการคำถามที่ใช้แสดงจริง
 * kind: ชนิดของน้องตัวนั้น (speciesOf) · ไม่รู้ชนิด = ชนิดที่ร้านรับ (petKindOf) · ไม่ส่ง = แมว
 */
export function resolveStayForm(config?: GroomFormConfig, kind?: PetKind): GroomField[] {
  return fieldsFor(kind).map((def) => {
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
