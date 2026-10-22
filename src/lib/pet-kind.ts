import { BREED_OPTIONS } from "./cat-breeds";

/**
 * ร้านนี้ดูแลน้องอะไร — ตั้งจากแบบสอบถามตอนเปิดร้าน (ข้อ "ร้านรับดูแลน้องอะไรบ้าง") หรือหน้าตั้งค่า › ร้าน
 * ใช้เปลี่ยนคำในหน้าลูกค้า/หลังบ้าน (น้องแมว ↔ น้องหมา) และรายชื่อสายพันธุ์เริ่มต้น
 * ไม่ได้ตั้ง = แมว (ร้านเดิมทุกร้านเริ่มจากระบบร้านแมว)
 */
export type PetKind = "cat" | "dog" | "both";

/** ชนิดของน้องแต่ละตัว (cats.species) — ร้านรับชนิดเดียวไม่ต้องเก็บ ถือว่าเป็นชนิดของร้าน */
export type PetSpecies = "cat" | "dog";

export function normalizeSpecies(v: unknown): PetSpecies | undefined {
  return v === "cat" || v === "dog" ? v : undefined;
}

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
  /**
   * แมว · หมา · (ว่าง) — ใช้ต่อท้าย "น้อง" เช่น `น้อง${w.th}`
   * ร้านที่รับทั้งสองแบบเป็นค่าว่าง ได้คำกลางๆ ว่า "น้อง" ไม่ต้องเขียน "น้องหมา/แมว"
   */
  th: string;
  /** แมว · หมา · สัตว์เลี้ยง — ใช้ตอนคำนี้อยู่เดี่ยวๆ ไม่มี "น้อง" นำหน้า เช่น `${w.noun}ของฉัน` */
  noun: string;
  /** cat · dog · pet */
  en: string;
  /** cats · dogs · pets */
  enPlural: string;
  emoji: string;
};

const WORDS: Record<PetKind, PetWords> = {
  cat: { th: "แมว", noun: "แมว", en: "cat", enPlural: "cats", emoji: "🐱" },
  dog: { th: "หมา", noun: "หมา", en: "dog", enPlural: "dogs", emoji: "🐶" },
  both: { th: "", noun: "สัตว์เลี้ยง", en: "pet", enPlural: "pets", emoji: "🐾" },
};

export function petWords(cfg?: { business?: { petKind?: string } } | null): PetWords {
  return WORDS[petKindOf(cfg)];
}

/** คำของน้องตัวนั้น — รู้ชนิดแล้วใช้คำของชนิดนั้น (ร้านรับทั้งสองแบบก็ขึ้น "น้องหมา" / "น้องแมว" ได้) */
export function speciesWords(species: PetSpecies | undefined, cfg?: { business?: { petKind?: string } } | null): PetWords {
  return species ? WORDS[species] : petWords(cfg);
}

/** ร้านนี้ต้องให้เลือกว่าน้องแต่ละตัวเป็นหมาหรือแมวไหม (เฉพาะร้านที่รับทั้งสองแบบ) */
export function asksSpecies(cfg?: { business?: { petKind?: string } } | null): boolean {
  return petKindOf(cfg) === "both";
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

const breedKey = (s: string) => s.toLowerCase().replace(/\s+/g, "");
/** ชื่อซ้อนกันนับเป็นตัวเดียว เช่น "ปอม" กับ "ปอมเมอเรเนียน (Pomeranian)" */
const sameBreed = (a: string, b: string) => {
  const x = breedKey(a);
  const y = breedKey(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
};
const UNKNOWN_BREED = "ไม่ทราบสายพันธุ์ (Unknown)";

/** สายพันธุ์นี้เป็นของหมาหรือแมว — ดูจากรายชื่อเริ่มต้น / คำว่าหมา-แมวในชื่อ · บอกไม่ได้ = undefined */
export function speciesOfBreed(breed?: string | null): PetSpecies | undefined {
  const b = (breed || "").trim();
  if (!b || sameBreed(b, UNKNOWN_BREED)) return undefined;
  const saysDog = /หมา|สุนัข|\bdog\b/i.test(b);
  const saysCat = /แมว|\bcat\b/i.test(b);
  if (saysDog !== saysCat) return saysDog ? "dog" : "cat";
  // คำกลางๆ เช่น "พันธุ์ผสม" / "ไม่ทราบ" ใช้ได้ทั้งหมาและแมว
  if (/ผสม|mix|ไม่ทราบ|unknown|อื่น|other/i.test(b)) return undefined;
  const isDog = DOG_BREED_OPTIONS.some((d) => d !== UNKNOWN_BREED && sameBreed(b, d));
  const isCat = BREED_OPTIONS.some((d) => d !== UNKNOWN_BREED && sameBreed(b, d));
  if (isDog && !isCat) return "dog";
  if (isCat && !isDog) return "cat";
  return undefined;
}

/**
 * ชนิดของน้องตัวนี้ — ที่บันทึกไว้ก่อน · ร้านรับชนิดเดียว = ชนิดของร้าน
 * ร้านที่รับทั้งสองแบบแต่น้องตัวเก่ายังไม่ได้ระบุ → เดาจากสายพันธุ์ (เดาไม่ได้ = undefined)
 */
export function speciesOf(
  pet: { species?: string | null; breed?: string | null } | null | undefined,
  cfg?: { business?: { petKind?: string } } | null
): PetSpecies | undefined {
  const saved = normalizeSpecies(pet?.species);
  if (saved) return saved;
  const kind = petKindOf(cfg);
  if (kind !== "both") return kind;
  return speciesOfBreed(pet?.breed);
}

function defaultBreeds(kind: PetKind): string[] {
  if (kind === "dog") return DOG_BREED_OPTIONS;
  if (kind === "both") return [...DOG_BREED_OPTIONS.slice(0, -1), ...BREED_OPTIONS];
  return BREED_OPTIONS;
}

/**
 * รายชื่อของร้าน (ไว้บนสุด) + เติมสายพันธุ์เริ่มต้นตามชนิดสัตว์ที่ยังไม่มี
 * แบบสอบถามถาม "สายพันธุ์ที่มาบ่อย" ร้านตอบมาไม่กี่ตัว (เช่น "ปอม") — ไม่ใช่ให้เหลือแค่นั้น
 * ตัวที่ชื่อซ้อนกัน (เช่น "ปอม" กับ "ปอมเมอเรเนียน (Pomeranian)") นับเป็นตัวเดียว ไม่เติมซ้ำ
 */
export function withDefaultBreeds(shopBreeds: string[], kind: PetKind): string[] {
  const mine = shopBreeds.map((s) => s.trim()).filter(Boolean);
  const extra = defaultBreeds(kind).filter((d) => !mine.some((m) => sameBreed(m, d)));
  return [...mine, ...extra];
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

/**
 * สายพันธุ์ให้เลือกสำหรับน้องตัวที่รู้ชนิดแล้ว — ร้านที่รับทั้งสองแบบใช้รายชื่อเดียวกันของร้าน
 * แต่ซ่อนพันธุ์ของอีกชนิด (เลือก "หมา" จะไม่เห็นเปอร์เซีย) · ชื่อที่บอกไม่ได้ว่าเป็นของชนิดไหนโชว์ทั้งสองแบบ
 * ยังไม่เลือกชนิด / ร้านรับชนิดเดียว = รายชื่อเต็มของร้าน
 */
export function breedOptionsForSpecies(
  cfg: { business?: { petKind?: string }; options?: { catBreeds?: string[] } } | null | undefined,
  species: PetSpecies | undefined
): string[] {
  const all = breedOptionsFor(cfg);
  if (!species || petKindOf(cfg) !== "both") return all;
  return all.filter((b) => {
    const s = speciesOfBreed(b);
    return !s || s === species;
  });
}
