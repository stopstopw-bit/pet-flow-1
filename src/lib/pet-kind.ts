import { BREED_OPTIONS } from "./cat-breeds";

/**
 * ร้านนี้ดูแลน้องอะไร — ตั้งจากแบบสอบถามตอนเปิดร้าน (ข้อ "ร้านรับดูแลน้องอะไรบ้าง") หรือหน้าตั้งค่า › ร้าน
 * ใช้เปลี่ยนคำในหน้าลูกค้า/หลังบ้าน (น้องแมว ↔ น้องหมา) และรายชื่อสายพันธุ์เริ่มต้น
 * ไม่ได้ตั้ง = แมว (ร้านเดิมทุกร้านเริ่มจากระบบร้านแมว)
 */
export type PetKind = "cat" | "dog" | "both";

/** ค่าตัวเลือกในแบบสอบถาม (public/shop-questions.html) → ชนิดสัตว์ */
export function petKindFromIntake(pets: unknown): PetKind | null {
  if (pets === "หมา") return "dog";
  if (pets === "แมว") return "cat";
  if (pets === "ทั้งหมาและแมว") return "both";
  return null;
}

export function petKindOf(cfg?: { business?: { petKind?: string } } | null): PetKind {
  const k = cfg?.business?.petKind;
  return k === "dog" || k === "both" ? k : "cat";
}

export type PetWords = {
  /** แมว · หมา · หมา/แมว — ใช้ต่อท้าย "น้อง" เช่น `น้อง${w.th}` */
  th: string;
  /** cat · dog · pet */
  en: string;
  /** cats · dogs · pets */
  enPlural: string;
  emoji: string;
};

const WORDS: Record<PetKind, PetWords> = {
  cat: { th: "แมว", en: "cat", enPlural: "cats", emoji: "🐱" },
  dog: { th: "หมา", en: "dog", enPlural: "dogs", emoji: "🐶" },
  both: { th: "หมา/แมว", en: "pet", enPlural: "pets", emoji: "🐾" },
};

export function petWords(cfg?: { business?: { petKind?: string } } | null): PetWords {
  return WORDS[petKindOf(cfg)];
}

/** รายชื่อสายพันธุ์หมาเริ่มต้น — ร้านแก้เองได้ในหน้าตั้งค่า (ชื่อเก็บใน options.catBreeds เหมือนเดิม) */
export const DOG_BREED_OPTIONS = [
  "หมาไทย / พันธุ์ผสม (Mixed)",
  "ปอมเมอเรเนียน (Pomeranian)",
  "ชิวาวา (Chihuahua)",
  "พุดเดิ้ล / ทอย พุดเดิ้ล (Poodle)",
  "ชิสุ (Shih Tzu)",
  "มอลทีส (Maltese)",
  "ยอร์คเชียร์ เทอร์เรีย (Yorkshire Terrier)",
  "ปั๊ก (Pug)",
  "เฟรนช์ บูลด็อก (French Bulldog)",
  "คอร์กี้ (Corgi)",
  "ชิบะ อินุ (Shiba Inu)",
  "บีเกิ้ล (Beagle)",
  "ดัชชุน (Dachshund)",
  "มินิเจอร์ ชเนาเซอร์ (Miniature Schnauzer)",
  "บิชอง ฟริเซ่ (Bichon Frise)",
  "โกลเด้น รีทรีฟเวอร์ (Golden Retriever)",
  "ลาบราดอร์ รีทรีฟเวอร์ (Labrador Retriever)",
  "ไซบีเรียน ฮัสกี้ (Siberian Husky)",
  "บางแก้ว (Bangkaew)",
  "ไทยหลังอาน (Thai Ridgeback)",
  "ไม่ทราบสายพันธุ์ (Unknown)",
];

function defaultBreeds(kind: PetKind): string[] {
  if (kind === "dog") return DOG_BREED_OPTIONS;
  if (kind === "both") return [...DOG_BREED_OPTIONS.slice(0, -1), ...BREED_OPTIONS];
  return BREED_OPTIONS;
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * สายพันธุ์ที่ให้ลูกค้าเลือก — ร้านตั้งเองไว้ใช้ของร้าน · ยังไม่ได้ตั้ง (หรือยังเป็นรายชื่อแมวเริ่มต้น)
 * ใช้รายชื่อเริ่มต้นตามชนิดสัตว์ของร้าน ร้านหมาจะได้ไม่เห็นสายพันธุ์แมว
 */
export function breedOptionsFor(cfg?: { business?: { petKind?: string }; options?: { catBreeds?: string[] } } | null): string[] {
  const kind = petKindOf(cfg);
  const saved = cfg?.options?.catBreeds || [];
  if (!saved.length || (kind !== "cat" && sameList(saved, BREED_OPTIONS))) return defaultBreeds(kind);
  return saved;
}
