import type { RoomType } from "../business";
import type { SiteConfig } from "../config-types";
import type { GroomProgram } from "../grooming-prices";
import { withDefaultBreeds, type PetKind } from "../pet-kind";

/**
 * "แบบร้าน" 3 แบบ — ร้านแมว / ร้านหมา / ร้านหมาและแมว
 * เลือกตอนสร้างร้าน (หน้าแพลตฟอร์ม) แล้วร้านใหม่จะได้ค่าเริ่มต้นที่ตรงกับแบบนั้นทั้งระบบ:
 * คำในหน้าจอ · สายพันธุ์ · ไซส์/ราคาอาบน้ำ · ห้องพัก · ของแถม · บริการเสริม · ของรางวัลแต้ม · ข้อความการ์ด LINE
 *
 * ร้านแมว = ค่าเริ่มต้นเดิมของระบบ (ไม่เปลี่ยนอะไร) · ทุกอย่างแก้ต่อเองได้ในหน้าตั้งค่า
 * ใช้กับร้านใหม่เท่านั้น — ร้านเดิมที่เปลี่ยนแบบในหน้าตั้งค่าจะเปลี่ยนแค่คำและสายพันธุ์ ไม่ทับห้อง/ราคาที่ร้านตั้งไว้
 */

const SIZE_LABELS_DOG = { kitten: "S (≤5 กก.)", m: "M (5–15 กก.)", l: "L (15 กก.↑)" };

const DOG_GROOM_ROWS = [
  { breed: "หมาขนสั้น", prices: { kitten: 300, m: 450, l: 650 } },
  { breed: "หมาขนยาว", prices: { kitten: 400, m: 550, l: 800 } },
  { breed: "หมาขนหนาฟู (ปอม/ชิสุ/พุดเดิ้ล/โกลเด้น)", prices: { kitten: 450, m: 650, l: 950 } },
];

const DOG_GROOM_PROGRAMS: GroomProgram[] = [
  {
    id: "bath-dry",
    name: "อาบน้ำ – เป่าขน",
    breeds: DOG_GROOM_ROWS,
    includes: ["ตัดเล็บ", "เช็ดหู", "บีบต่อมก้น"],
  },
  {
    id: "groom-cut",
    name: "อาบน้ำ + ตัดขน",
    breeds: [
      { breed: "ตัดขนสั้นทั้งตัว", prices: { kitten: 600, m: 850, l: 1200 } },
      { breed: "ตัดแต่งทรง (พุดเดิ้ล/ปอม/ชิสุ)", prices: { kitten: 700, m: 950, l: 1400 } },
    ],
    includes: ["ตัดเล็บ", "เช็ดหู", "บีบต่อมก้น", "ไถอุ้งเท้า"],
  },
  {
    id: "flea-tick",
    name: "อาบน้ำกำจัดเห็บหมัด",
    breeds: DOG_GROOM_ROWS.map((r) => ({
      breed: r.breed,
      prices: { kitten: r.prices.kitten + 150, m: r.prices.m + 200, l: r.prices.l + 250 },
    })),
  },
];

/** ร้านรับทั้งสองแบบ — แมวกับหมาอยู่ในโปรแกรมเดียวกัน แยกแถวราคา ใช้ไซส์ตามน้ำหนักชุดเดียวกัน */
const BOTH_GROOM_PROGRAMS: GroomProgram[] = [
  {
    id: "bath-dry",
    name: "อาบน้ำ – เป่าขน",
    breeds: [
      { breed: "แมวขนสั้น", prices: { kitten: 450, m: 550, l: 700 } },
      { breed: "แมวขนยาว", prices: { kitten: 550, m: 700, l: 850 } },
      ...DOG_GROOM_ROWS,
    ],
    includes: ["ตัดเล็บ", "เช็ดหู"],
  },
  DOG_GROOM_PROGRAMS[1],
  DOG_GROOM_PROGRAMS[2],
];

const DOG_AMENITIES = {
  th: ["พี่เลี้ยงทำความสะอาดห้องทุกวัน", "บริการน้ำ อาหาร ตามเวลาเดิมของน้อง", "พาเดินเล่น/ขับถ่าย วันละ 3 รอบ", "ที่นอนนุ่ม + ผ้าห่ม"],
  en: ["Daily room cleaning", "Water & meals on your dog's usual schedule", "Walks / potty breaks 3 times a day", "Soft bed & blanket"],
};
const CAT_AMENITIES = {
  th: ["พี่เลี้ยงทำความสะอาดห้องทุกวัน", "บริการถาดน้ำ อาหาร กระบะทราย", "พี่เลี้ยงพาเล่น วันละ 2 รอบ"],
  en: ["Daily room cleaning", "Water, food & litter service", "Playtime twice daily"],
};

/**
 * id ห้องใช้ชุดเดิม (mini-meow / mid-cozy / catflix) เพราะระบบเช็คห้องว่างตอนลูกค้าจองเองผูกกับ id ชุดนี้
 * (ดู self-bookable-rooms.ts) — ชื่อที่ลูกค้าเห็นเปลี่ยนตามแบบร้าน · ไม่มีรูป = โชว์การ์ดแทนรูป ร้านอัปรูปห้องจริงเองทีหลัง
 */
function room(
  id: "mini-meow" | "mid-cozy" | "catflix",
  name: string,
  price: number,
  count: number,
  who: { th: string; en: string },
  amenities: { th: string[]; en: string[] },
  extraPrice = 100
): RoomType {
  return {
    id,
    name,
    size: id === "mini-meow" ? "S" : "M",
    count,
    maxCats: 2,
    includedCats: 1,
    extraCatPrice: extraPrice,
    price,
    cats: who,
    extra: { th: `ตัวที่ 2 +${extraPrice}`, en: `2nd pet +${extraPrice}` },
    image: "",
    amenities: { th: [...amenities.th], en: [...amenities.en] },
  };
}

const DOG_ROOMS: RoomType[] = [
  room("mini-meow", "ห้องหมาเล็ก (Small)", 350, 4, { th: "หมาเล็ก ไม่เกิน 10 กก.", en: "Small dog up to 10 kg" }, DOG_AMENITIES),
  room("mid-cozy", "ห้องหมากลาง (Medium)", 500, 4, { th: "หมา 10–20 กก.", en: "Dog 10–20 kg" }, DOG_AMENITIES),
  room("catflix", "ห้องหมาใหญ่ (Large)", 700, 2, { th: "หมา 20 กก. ขึ้นไป", en: "Dog 20 kg+" }, DOG_AMENITIES, 150),
];

const BOTH_ROOMS: RoomType[] = [
  room("mini-meow", "ห้องแมว (Cat Room)", 350, 4, { th: "แมว 1–2 ตัว (บ้านเดียวกัน)", en: "1–2 cats (same home)" }, CAT_AMENITIES, 50),
  room("mid-cozy", "ห้องหมาเล็ก–กลาง", 450, 4, { th: "หมาไม่เกิน 15 กก.", en: "Dog up to 15 kg" }, DOG_AMENITIES),
  room("catflix", "ห้องหมาใหญ่", 650, 2, { th: "หมา 15 กก. ขึ้นไป", en: "Dog 15 kg+" }, DOG_AMENITIES, 150),
];

const FORMAT: Record<Exclude<PetKind, "cat">, {
  tagline: { th: string; en: string };
  rooms: RoomType[];
  groomPrograms: GroomProgram[];
  freebies: string[];
  presetSwap: { label: string; amount: number };
  treat: { th: string; en: string };
  groomPrepNote: string;
  reviewGroom: string;
}> = {
  dog: {
    tagline: { th: "โรงแรมหมา · อาบน้ำ & ตัดขน", en: "Dog Hotel · Bath & Grooming" },
    rooms: DOG_ROOMS,
    groomPrograms: DOG_GROOM_PROGRAMS,
    freebies: ["กล้องวงจรปิด (CCTV)", "ที่นอน/ผ้าห่ม", "รับ-ส่ง", "ขนม/ทรีท"],
    presetSwap: { label: "พาเดินเล่นเพิ่ม", amount: 50 },
    treat: { th: "ขนมหมาพรีเมียม 1 ซอง หรือของเล่นหมา", en: "Premium dog treat or toy" },
    groomPrepNote:
      "🍬 พกขนมที่น้องชอบมาด้วยได้นะคะ\n🦮 และใส่สายจูงหรือกระเป๋าทุกครั้งที่มาใช้บริการด้วยค่ะ",
    reviewGroom:
      "หวังว่าน้องจะกลับบ้านไปตัวหอม ขนสวย และมีความสุขนะคะ 🐶✨\nถ้าประทับใจบริการของเรา ฝากรีวิวสั้น ๆ ให้ทีมงานหน่อยนะคะ\nรีวิวของคุณคือกำลังใจเล็ก ๆ\nที่ทำให้พวกเราตั้งใจดูแลน้องหมาทุกตัวให้ดีที่สุดเลยค่ะ 💕",
  },
  both: {
    tagline: { th: "รับฝากหมาแมว · อาบน้ำ & ตัดขน", en: "Dog & Cat Hotel · Bath & Grooming" },
    rooms: BOTH_ROOMS,
    groomPrograms: BOTH_GROOM_PROGRAMS,
    freebies: ["กล้องวงจรปิด (CCTV)", "ที่นอน/ผ้าห่ม", "น้ำพุแมว", "ทรายแมว", "รับ-ส่ง", "ขนม/ทรีท"],
    presetSwap: { label: "พาเดินเล่นเพิ่ม (หมา)", amount: 50 },
    treat: { th: "ขนมพรีเมียม 1 ซอง หรือของเล่นน้อง", en: "Premium treat or toy" },
    groomPrepNote:
      "🍬 พกขนมที่น้องชอบมาด้วยได้นะคะ\n🧺 น้องแมวใส่ตะกร้า/กระเป๋า · น้องหมาใส่สายจูงทุกครั้งที่มาใช้บริการด้วยค่ะ",
    reviewGroom:
      "หวังว่าน้องจะกลับบ้านไปตัวหอม ขนสวย และมีความสุขนะคะ 🐾✨\nถ้าประทับใจบริการของเรา ฝากรีวิวสั้น ๆ ให้ทีมงานหน่อยนะคะ\nรีวิวของคุณคือกำลังใจเล็ก ๆ\nที่ทำให้พวกเราตั้งใจดูแลน้อง ๆ ทุกตัวให้ดีที่สุดเลยค่ะ 💕",
  },
};

/** จำนวนห้องจริงต่อแบบ (ใช้เช็คห้องว่าง) — ให้ตรงกับ count ของห้องด้านบน */
function inventoryOf(rooms: RoomType[]): SiteConfig["roomInventory"] {
  const n = (id: string) => rooms.find((r) => r.id === id)?.count ?? 0;
  const miniMeow = n("mini-meow");
  const midCozy = n("mid-cozy");
  const catflix = n("catflix");
  return { total: miniMeow + midCozy + catflix, miniMeow, midCozy, catflix };
}

/** ใส่ค่าเริ่มต้นตามแบบร้านลงใน config ของร้านใหม่ (แก้ตัวที่ส่งมาแล้วคืนตัวเดิม) */
export function applyPetFormat(config: SiteConfig, kind: PetKind): SiteConfig {
  config.business.petKind = kind;
  config.options = { ...config.options, catBreeds: withDefaultBreeds([], kind) };
  if (kind === "cat") return config;

  const f = FORMAT[kind];
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  config.business.tagline = { ...f.tagline };
  config.rooms = clone(f.rooms);
  config.roomInventory = inventoryOf(f.rooms);
  config.groomPricePrograms = clone(f.groomPrograms);
  config.groomSizeLabels = { ...SIZE_LABELS_DOG };
  config.options.freebies = [...f.freebies];
  config.options.servicePresets = (config.options.servicePresets || []).map((p) =>
    p.label === "น้ำพุแมว" && kind === "dog" ? { ...f.presetSwap } : p
  );
  if (kind === "both") config.options.servicePresets.push({ ...f.presetSwap });
  config.pointsRewards = (config.pointsRewards || []).map((r) =>
    r.id === "treat" ? { ...r, reward: { ...f.treat } } : r
  );
  config.cards = {
    ...config.cards,
    bookingConfirm: {
      ...config.cards?.bookingConfirm,
      texts: { ...config.cards?.bookingConfirm?.texts, groomPrepNote: f.groomPrepNote },
    },
    review: {
      ...config.cards?.review,
      texts: { ...config.cards?.review?.texts, bodyGroom: f.reviewGroom },
    },
  };
  return config;
}

// ── ร้านหมาที่ยังมีค่าของร้านแมวค้างอยู่ ────────────────────────────────────────────
// ร้านที่สร้างก่อนมี "แบบร้าน" (เช่น Back Home) และข้อความตั้งต้นของระบบ (ข้อตกลง, ข้อความ LINE ฯลฯ)
// เขียนไว้สำหรับร้านแมว — ร้านหมาต้องไม่เห็นคำว่าแมวเลย จึงแปลงตอนอ่านค่าร้าน
// (ร้านกดบันทึกหน้าตั้งค่าเมื่อไร ค่าที่แปลงแล้วก็ถูกบันทึกเป็นของร้านไปด้วย)

/** ห้องตัวอย่างของร้านแมว (ค่าตั้งต้นเดิม) — ร้านหมาที่ยังไม่ได้แก้ห้องเองจะได้ห้องแบบร้านหมาแทน */
const CAT_SAMPLE_ROOM_IDS = new Set(["mini-meow", "mid-cozy", "catflix", "mini-duo", "cozy-duo", "cat-tower"]);
const CAT_GROOM_BREED = /แมว|แรคดอล|เมนคูน/;

/** คำของร้านแมว → คำของร้านหมา (เรียงคำยาวก่อน ไม่งั้น "น้ำพุแมว" จะกลายเป็น "น้ำพุหมา") */
const DOG_WORDS: [RegExp, string][] = [
  [/เกรดแมวประกวด/g, "เกรดประกวด"],
  [/ขนม\/แมวเลีย/g, "ขนม"],
  [/แมวเลีย/g, "ขนม"],
  [/น้ำพุแมว/g, "น้ำพุ"],
  [/ทรายแมว/g, "แผ่นรองซับ"],
  [/กระบะทราย/g, "ที่ขับถ่าย"],
  [/ลูกแมว/g, "ลูกหมา"],
  [/แมว/g, "หมา"],
  [/🐱|😺|😸|😻/g, "🐶"],
  [/🐈/g, "🐕"],
  [/\bKittens?\b/g, "Puppy"],
  [/\bkittens?\b/g, "puppy"],
  [/\bCats\b/g, "Dogs"],
  [/\bcats\b/g, "dogs"],
  [/\bCat\b/g, "Dog"],
  [/\bcat\b/g, "dog"],
];

/** ไม่แตะ: id ห้อง/ลิงก์/รูป และรายชื่อสายพันธุ์ (มีตัวแปลงของตัวเองใน pet-kind.ts) */
const KEEP_KEYS = new Set(["id", "typeId", "image", "poster", "logoUrl", "catBreeds", "petKind", "url", "href"]);

export function dogWords(text: string): string {
  if (!text || /^(https?:|data:|\/|#)/.test(text.trim())) return text;
  // ห้ามแตะตัวแปรในข้อความ เช่น {pet} {cats} — ระบบใช้แทนชื่อน้อง
  return text
    .split(/(\{[^}]*\})/)
    .map((part) => (part.startsWith("{") ? part : DOG_WORDS.reduce((s, [re, to]) => s.replace(re, to), part)))
    .join("");
}

function dogWordsDeep(v: unknown): unknown {
  if (typeof v === "string") return dogWords(v);
  if (Array.isArray(v)) return v.map(dogWordsDeep);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, KEEP_KEYS.has(k) ? x : dogWordsDeep(x)])
    );
  }
  return v;
}

/** ร้านหมา: เปลี่ยนค่าร้านแมวที่ค้างอยู่เป็นของร้านหมา (ร้านแมว / หมาและแมว คืนค่าเดิม) */
export function withDogShopDefaults(config: SiteConfig): SiteConfig {
  if (config.business?.petKind !== "dog") return config;
  const f = FORMAT.dog;
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  const out = { ...config };

  const rooms = config.rooms || [];
  if (
    rooms.length > 0 &&
    rooms.every((r) => CAT_SAMPLE_ROOM_IDS.has(r.id) && (!r.image || r.image.startsWith("/catalog/rooms/")))
  ) {
    out.rooms = clone(f.rooms);
    out.roomInventory = inventoryOf(f.rooms);
  }
  const programs = config.groomPricePrograms || [];
  if (!programs.length || programs.every((p) => p.breeds.every((b) => CAT_GROOM_BREED.test(b.breed)))) {
    out.groomPricePrograms = clone(f.groomPrograms);
  }
  const sizes = config.groomSizeLabels;
  if (!sizes || Object.values(sizes).some((s) => s && /แมว/.test(s))) out.groomSizeLabels = { ...SIZE_LABELS_DOG };
  if (config.options) {
    out.options = {
      ...config.options,
      freebies: (config.options.freebies || []).filter((x) => !/แมว|ทราย/.test(x)),
      servicePresets: (config.options.servicePresets || []).map((p) =>
        p.label === "น้ำพุแมว" ? { ...f.presetSwap } : p
      ),
    };
  }
  out.pointsRewards = (config.pointsRewards || []).map((r) =>
    r.id === "treat" && /แมว/.test(r.reward?.th || "") ? { ...r, reward: { ...f.treat } } : r
  );
  const cards = config.cards || {};
  out.cards = {
    ...cards,
    bookingConfirm: {
      ...cards.bookingConfirm,
      texts: { ...cards.bookingConfirm?.texts, groomPrepNote: cards.bookingConfirm?.texts?.groomPrepNote || f.groomPrepNote },
    },
    review: {
      ...cards.review,
      texts: { ...cards.review?.texts, bodyGroom: cards.review?.texts?.bodyGroom || f.reviewGroom },
    },
  };
  return dogWordsDeep(out) as SiteConfig;
}
