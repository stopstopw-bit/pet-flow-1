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
    // ปิดไว้เป็นค่าเริ่มต้น (เจ้าของระบบ 2026-10-25) — ร้านเปิดกลับได้ในหลังบ้าน › การ์ด › ฟอร์มก่อนเข้าพัก
    enabled: false,
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
    enabled: false,
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
 * เข้าพัก + อาบก่อนกลับ = ฟอร์มเดียว: คำถามอาบน้ำที่ซ้ำกับฟอร์มเข้าพักไม่ถามซ้ำ
 * key ฝั่งอาบน้ำ → key ฝั่งเข้าพักที่ใช้คำตอบแทน (key ที่ชื่อตรงกันสองฟอร์มก็ถามครั้งเดียวเช่นกัน)
 */
export const BATH_SHARED_WITH_STAY: Record<string, string> = {
  note: "note",
};

const text = (key: string, label: string, placeholder: string, required = false): GroomField => ({
  key,
  type: "text",
  label,
  placeholder,
  required,
  enabled: true,
  options: [],
});

const WITH_OTHERS = STAY_FORM_DEFAULTS.find((d) => d.key === "withOthers")!;

/**
 * ฟอร์มทำประวัติน้องหมาก่อนเข้าพัก — ชุดของตัวเอง เรียงตามแบบฟอร์มที่ร้านใช้จริง (เจ้าของ → สุนัข → การดูแล)
 * ชื่อ-นามสกุล เบอร์หลัก ชื่อน้อง เพศ พันธุ์ อายุ โรคประจำตัว การชัก การแพ้ ทำหมัน ถามไปแล้วตอนสมัครสมาชิก ไม่ถามซ้ำ
 * key ที่ใช้ร่วมกับแมว (food/likes/withOthers/note) คงไว้ให้ข้อมูลเก่าอ่านได้
 */
const DOG_FORM: GroomField[] = [
  // ประวัติเจ้าของ
  text("ownerNickname", "ชื่อเล่นเจ้าของ", "เช่น พี่ส้ม", true),
  text("emergencyContact", "เบอร์ฉุกเฉินและความเกี่ยวข้อง", "เช่น 081-234-5678 (คุณแม่)", true),
  // ประวัติสุนัข
  text("temperament", "นิสัยส่วนตัว", "เช่น ขี้อ้อน ตื่นคนแปลกหน้านิดหน่อย", true),
  text("likes", "สิ่งที่ชอบและไม่ชอบ", "เช่น ชอบลูกบอล ไม่ชอบให้จับเท้า"),
  text("fleaLast", "กำจัดเห็บหมัดครั้งล่าสุดเมื่อไหร่", "เช่น ต้นเดือนนี้", true),
  {
    key: "fleaMethod",
    type: "single",
    label: "กำจัดเห็บหมัดโดยการหยด หรือ ทานยา",
    required: true,
    enabled: true,
    options: [
      { key: "drop", label: "💧 หยด" },
      { key: "oral", label: "💊 ทานยา" },
      { key: "none", label: "❓ ไม่ได้ทำ / ไม่แน่ใจ" },
    ],
  },
  // การดูแล
  text("food", "อาหาร ให้เวลาไหน อย่างไรบ้าง — รบกวนเตรียมอาหารมาเองนะคะ", "เช่น เม็ด Royal Canin เช้า 8 โมง เย็น 6 โมง มื้อละ 1 ถ้วย", true),
  text("medicine", "การทานยา (หากมี)", "เช่น ยาโรคหัวใจ 1/2 เม็ด หลังอาหารเช้า"),
  // ฟอร์มหมายังถามเรื่องเข้าสังคม (ข้อของแมวปิดไว้เป็นค่าเริ่มต้น)
  { ...WITH_OTHERS, label: "เข้าสังคมกับน้องตัวอื่นได้ไหมคะ", enabled: true },
  {
    key: "grass",
    type: "single",
    label: "วิ่งสนามหญ้าได้ไหมคะ",
    required: true,
    enabled: true,
    options: [
      { key: "yes", label: "✅ วิ่งได้" },
      { key: "no", label: "❌ ไม่ให้วิ่ง" },
      { key: "unknown", label: "❓ ไม่แน่ใจ" },
    ],
  },
  {
    key: "note",
    type: "textarea",
    label: "การดูแลเพิ่มเติม (request) — บอกได้เหมือนเลี้ยงที่บ้าน ทางร้านจะดูแลตามนี้ให้ได้มากที่สุด อาจปรับเล็กน้อยตามขอบเขตค่ะ",
    placeholder: "เช่น ก่อนนอนชอบให้เปิดเพลงเบาๆ ขอรูปอัปเดตทุกเย็น",
    required: false,
    enabled: true,
    options: [],
  },
];

const LITTER_BOTH: Pick<GroomField, "label" | "placeholder"> = {
  label: "ทรายที่ใช้ (แมว) / การขับถ่าย (หมา)",
  placeholder: "เช่น ทรายเต้าหู้ · หรือ ขับถ่ายแผ่นรองฉี่",
};

/** หมวดของคำถามในฟอร์มหมา — เจ้าของ → น้อง → การดูแล (ตามลำดับใน DOG_FORM) */
const DOG_SECTIONS: Record<string, GroomField["section"]> = {
  ownerNickname: "owner",
  emergencyContact: "owner",
  temperament: "pet",
  likes: "pet",
  fleaLast: "pet",
  fleaMethod: "pet",
};
for (const f of DOG_FORM) f.section = DOG_SECTIONS[f.key] ?? "care";

/** คำถามตามชนิดของน้อง — หมาใช้ฟอร์มของตัวเอง · ไม่รู้ชนิดถามข้อขับถ่ายรวม (หลังบ้านใช้เป็นค่าเริ่มต้นของตัวแก้ฟอร์ม) */
export function stayFormDefaults(kind?: PetKind): GroomField[] {
  return fieldsFor(kind);
}

function fieldsFor(kind?: PetKind): GroomField[] {
  if (kind === "dog") return DOG_FORM;
  if (kind === "both") return STAY_FORM_DEFAULTS.map((d) => (d.key === "litter" ? { ...d, ...LITTER_BOTH } : d));
  return STAY_FORM_DEFAULTS;
}

/** บังคับตอบข้อนี้ — ข้อความ "ถ้าไม่มีเว้นว่างได้" ไม่ใช้แล้ว ให้พิมพ์ "ไม่มี" แทน */
function requireAnswer(f: GroomField): GroomField {
  if (f.required) return f;
  const label = f.label.replace(/\s*\((ถ้าไม่มีเว้นว่างได้|หากมี|ถ้ามี)\)/, "");
  const hint = f.type === "text" || f.type === "textarea" ? " — ไม่มีพิมพ์ \"ไม่มี\"" : "";
  return { ...f, required: true, label: `${label}${hint}` };
}

/**
 * ฟอร์มประวัติ (หมวดเจ้าของ + น้อง) ของชนิดนี้ — ใช้กับนัดอาบน้ำ/นวดเมื่อร้านตั้งไว้
 * ชนิดที่ฟอร์มไม่ได้แบ่งหมวด (แมว) คืน null = ใช้ฟอร์มก่อนอาบน้ำตามเดิม
 */
export function resolveHistoryForm(
  kind?: PetKind,
  opts?: { allRequired?: boolean },
  config?: GroomFormConfig
): GroomField[] | null {
  const fs = resolveStayForm(config, kind, opts).filter((f) => f.section === "owner" || f.section === "pet");
  return fs.length ? fs : null;
}

/**
 * รวมค่าเริ่มต้นกับที่ร้านแก้เอง (หลังบ้าน › การ์ด › ฟอร์มก่อนเข้าพัก) — คืนรายการคำถามที่ใช้แสดงจริง
 * kind: ชนิดของน้องตัวนั้น (speciesOf) · ไม่รู้ชนิด = ชนิดที่ร้านรับ (petKindOf) · ไม่ส่ง = แมว
 */
export function resolveStayForm(
  config?: GroomFormConfig,
  kind?: PetKind,
  opts?: { allRequired?: boolean }
): GroomField[] {
  return fieldsFor(kind).map((d) => (opts?.allRequired ? requireAnswer(d) : d)).map((def) => {
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
