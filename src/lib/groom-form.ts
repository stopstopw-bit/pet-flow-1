/**
 * โครงคำถามฟอร์ม "ประวัติน้องก่อนอาบน้ำ" — ค่าเริ่มต้น + ตัวรวมกับที่ร้านแก้เองในหลังบ้าน
 * ใช้ร่วมกันทั้งหน้าฟอร์มของลูกค้า และหน้าแก้ไขฟอร์มในหลังบ้าน
 */

export type GroomFieldType = "single" | "multi" | "text" | "textarea";

export type GroomFormOption = { key: string; label: string };

/** ค่าที่ร้านแก้เองได้ต่อคำถาม — ไม่ตั้ง = ใช้ค่าเริ่มต้น */
export type GroomFieldConfig = {
  enabled?: boolean;
  required?: boolean;
  label?: string;
  /** ข้อความช่วยใต้ช่องพิมพ์ (เฉพาะ text/textarea) */
  placeholder?: string;
  options?: GroomFormOption[];
};

export type GroomFormConfig = Record<string, GroomFieldConfig>;

export type GroomField = {
  key: string;
  type: GroomFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  enabled: boolean;
  options: GroomFormOption[];
  /** คำถามนี้มีปุ่ม "ไม่ทราบ" ให้ติ๊ก (เฉพาะน้ำหนัก) */
  hasUnknownToggle?: boolean;
  /** หมวดในฟอร์มทำประวัติ (เจ้าของ / น้อง / การดูแล) — นัดอาบน้ำถามแค่เจ้าของ + น้องได้ ดู intake-rules.ts */
  section?: "owner" | "pet" | "care";
};

/** ค่าเริ่มต้นของระบบ — key ห้ามเปลี่ยน (ข้อมูลเก่าอ้างอิงอยู่) */
export const GROOM_FORM_DEFAULTS: GroomField[] = [
  {
    key: "bathedBefore",
    type: "single",
    label: "เคยอาบน้ำที่อื่นมาก่อนไหมคะ หรือว่าครั้งแรก",
    required: true,
    enabled: true,
    options: [
      { key: "yes", label: "✅ เคยอาบที่อื่นแล้ว" },
      { key: "no", label: "🆕 ครั้งแรก" },
    ],
  },
  {
    key: "temperament",
    type: "multi",
    label: "นิสัยตอนถูกจับ/อาบน้ำ (เลือกได้หลายข้อ)",
    required: true,
    enabled: true,
    options: [
      { key: "normal", label: "🙂 ปกติ" },
      { key: "playful", label: "😸 ขี้เล่น" },
      { key: "clingy", label: "🥰 ขี้อ้อน" },
      { key: "stressed", label: "😿 เครียดง่าย" },
      { key: "gentle", label: "😌 ใจดี ให้จับง่าย" },
      { key: "fearful", label: "🙀 ขี้กลัว/ตกใจง่าย" },
      { key: "struggle", label: "🌀 ดิ้น" },
      { key: "aggressive", label: "😾 ดุ/กัด/ข่วน" },
      { key: "strangerShy", label: "🙈 ไม่ชอบคนแปลกหน้า" },
      { key: "other", label: "➕ อื่นๆ" },
    ],
  },
  {
    key: "health",
    type: "multi",
    label: "สุขภาพ (เลือกได้หลายข้อ)",
    required: true,
    enabled: true,
    options: [
      { key: "healthy", label: "💪 แข็งแรงดี" },
      { key: "skin", label: "🩹 โรคผิวหนัง" },
      { key: "seizure", label: "⚡ ลมชัก/ชัก" },
      { key: "senior", label: "👵 สูงอายุ" },
      { key: "other", label: "➕ อื่นๆ" },
    ],
  },
  {
    // แยกออกมาเป็นข้อของตัวเอง — โรคหัวใจมีผลกับการอาบน้ำ/เป่าขนมากที่สุด ต้องไม่พลาด
    key: "heartDisease",
    type: "single",
    label: "น้องเป็นโรคหัวใจไหมคะ",
    required: true,
    enabled: true,
    options: [
      { key: "no", label: "✅ ไม่เป็น" },
      { key: "yes", label: "❤️ เป็นโรคหัวใจ" },
      { key: "unknown", label: "❓ ไม่เคยตรวจ" },
    ],
  },
  {
    key: "vaccinated",
    type: "single",
    label: "ได้รับวัคซีนครบหรือยังคะ",
    required: true,
    enabled: true,
    options: [
      { key: "yes", label: "✅ ครบแล้ว" },
      { key: "no", label: "❌ ยังไม่ครบ" },
    ],
  },
  {
    key: "weight",
    type: "text",
    label: "น้ำหนักตัวน้อง (กก.) — บอกคร่าวๆ ได้",
    placeholder: "เช่น 4.5",
    required: false,
    enabled: true,
    options: [],
    hasUnknownToggle: true,
  },
  {
    key: "dryMethod",
    type: "multi",
    label: "เคยใช้วิธีเป่าขนแบบไหนคะ (เลือกได้หลายข้อ)",
    required: true,
    enabled: true,
    options: [
      { key: "dryer", label: "💨 ไดร์เป่าขน" },
      { key: "cabinet", label: "📦 ตู้เป่าขน" },
    ],
  },
  {
    key: "shaveButt",
    type: "single",
    label: "ให้ไถขนก้นไหมคะ",
    required: true,
    enabled: true,
    options: [
      { key: "yes", label: "✅ ไถให้" },
      { key: "no", label: "❌ ไม่ไถ" },
    ],
  },
  {
    key: "shavePaws",
    type: "single",
    label: "ให้ไถขนอุ้งเท้าไหมคะ",
    required: true,
    enabled: true,
    options: [
      { key: "yes", label: "✅ ไถให้" },
      { key: "no", label: "❌ ไม่ไถ" },
    ],
  },
  {
    key: "allergy",
    type: "text",
    label: "แพ้อะไรไหมคะ (แชมพู/ยา) — ถ้าไม่มีเว้นว่างได้",
    placeholder: "เช่น แพ้แชมพูบางชนิด",
    required: false,
    enabled: true,
    options: [],
  },
  {
    key: "note",
    type: "textarea",
    label: "อยากให้เราดูแล/ระวังเป็นพิเศษเรื่องอะไรไหมคะ",
    placeholder: "เช่น ไม่ชอบเป่าขนแรง, กลัวเสียงดัง",
    required: false,
    enabled: true,
    options: [],
  },
];

/** หน้าแมวในตัวเลือกเริ่มต้น → หน้าคนธรรมดา สำหรับหมา / น้องที่ไม่รู้ชนิด (ตัวเลือกที่ร้านตั้งเองไม่แตะ) */
const CAT_FACES: Record<string, string> = { "😸": "😆", "😿": "😣", "🙀": "😨", "😾": "😠" };
const CAT_FACE_RE = new RegExp(Object.keys(CAT_FACES).join("|"), "gu");

function forKind(def: GroomField, kind?: string): GroomField {
  if (!kind || kind === "cat") return def;
  return { ...def, options: def.options.map((o) => ({ ...o, label: o.label.replace(CAT_FACE_RE, (m) => CAT_FACES[m]) })) };
}

/**
 * รวมค่าเริ่มต้นกับที่ร้านแก้เอง — คืนรายการคำถามที่ใช้แสดงจริง
 * kind: ชนิดของน้อง/ร้าน ("cat" · "dog" · "both") — ไม่ใช่แมวจะไม่ใช้อีโมจิหน้าแมวในตัวเลือก
 */
export function resolveGroomForm(config?: GroomFormConfig, kind?: string): GroomField[] {
  return GROOM_FORM_DEFAULTS.map((d) => forKind(d, kind)).map((def) => {
    const c = config?.[def.key];
    if (!c) return def;
    return {
      ...def,
      enabled: c.enabled ?? def.enabled,
      required: c.required ?? def.required,
      label: c.label?.trim() || def.label,
      placeholder: c.placeholder ?? def.placeholder,
      options:
        c.options && c.options.length > 0
          ? c.options.filter((o) => o.key && o.label)
          : def.options,
    };
  }).filter((f) => f.enabled);
}
