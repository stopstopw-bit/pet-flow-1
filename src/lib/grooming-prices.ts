/**
 * ตารางราคาอาบน้ำ/กรูมมิ่ง — เมนูตัวอย่าง (Landin'Elite)
 * เลือก โปรแกรม → พันธุ์ → ไซส์ แล้วได้ราคาเลย
 * TODO(config-driven): ย้ายไปแก้ในหน้าตั้งค่าได้ (ดู memory: prefer-config-driven-no-code-edits)
 */
export type GroomSize = "kitten" | "m" | "l";

export const GROOM_SIZES: { id: GroomSize; label: string }[] = [
  { id: "kitten", label: "ลูกแมว (≤2 กก.)" },
  { id: "m", label: "M (2–6 กก.)" },
  { id: "l", label: "L (6 กก.+)" },
];

export type GroomBreedPrice = {
  breed: string;
  prices: Record<GroomSize, number>;
};

export type GroomProgram = {
  id: string;
  name: string;
  breeds: GroomBreedPrice[];
  /** บริการย่อยที่รวมอยู่ในโปรแกรม (แท็ก เช่น ตัดเล็บ, เช็ดหู) — โชว์ตอนเลือกโปรแกรม/บนบอร์ดคิว */
  includes?: string[];
  /** "massage" = โปรแกรมนวด (แท็บนวดแยกจากอาบน้ำ คิวแยกกัน) — ไม่ระบุ = อาบน้ำ/กรูมมิ่ง */
  kind?: "massage";
};

export const GROOM_PROGRAMS: GroomProgram[] = [
  {
    id: "bath-dry",
    name: "อาบน้ำ – เป่าขน",
    breeds: [
      { breed: "แมวไทย", prices: { kitten: 400, m: 450, l: 550 } },
      { breed: "แมวพันธุ์ขนสั้น", prices: { kitten: 450, m: 500, l: 700 } },
      { breed: "แมวพันธุ์ขนยาว", prices: { kitten: 550, m: 650, l: 850 } },
      {
        breed: "แรคดอล/เมนคูน/ขนหนาฟู",
        prices: { kitten: 650, m: 850, l: 1050 },
      },
    ],
  },
  {
    id: "bath-degrease",
    name: "อาบน้ำ + ขจัดคราบมัน",
    breeds: [
      { breed: "แมวไทย", prices: { kitten: 500, m: 600, l: 700 } },
      { breed: "แมวพันธุ์ขนสั้น", prices: { kitten: 600, m: 750, l: 900 } },
      { breed: "แมวพันธุ์ขนยาว", prices: { kitten: 700, m: 850, l: 1050 } },
      {
        breed: "แรคดอล/เมนคูน/ขนหนาฟู",
        prices: { kitten: 800, m: 1050, l: 1250 },
      },
    ],
  },
  {
    id: "premium",
    name: "Premium",
    breeds: [
      { breed: "แมวพันธุ์ขนสั้น", prices: { kitten: 700, m: 900, l: 1100 } },
      { breed: "แมวพันธุ์ขนยาว", prices: { kitten: 800, m: 1000, l: 1250 } },
      {
        breed: "แรคดอล/เมนคูน/ขนหนาฟู",
        prices: { kitten: 900, m: 1200, l: 1450 },
      },
    ],
  },
  {
    id: "malaseb",
    name: "ยับยั้งเชื้อรา (แชมพู Malaseb)",
    breeds: [
      { breed: "แมวพันธุ์ขนสั้น", prices: { kitten: 700, m: 900, l: 1100 } },
      { breed: "แมวพันธุ์ขนยาว", prices: { kitten: 800, m: 1000, l: 1250 } },
      {
        breed: "แรคดอล/เมนคูน/ขนหนาฟู",
        prices: { kitten: 900, m: 1200, l: 1450 },
      },
    ],
  },
];

/**
 * รวม "ค่าเริ่มต้นของระบบ" กับ "ตารางที่ร้านตั้งเองในหลังบ้าน" — ร้านตั้งไว้ (ไม่ว่าง) ใช้ของร้าน
 * ทั้งชุดแทนที่ค่าเริ่มต้นไปเลย (เหมือน rooms) ไม่ตั้งเลย = ใช้ค่าเริ่มต้น GROOM_PROGRAMS
 */
export function resolveGroomPrograms(config?: GroomProgram[]): GroomProgram[] {
  return config && config.length > 0 ? config : GROOM_PROGRAMS;
}

/**
 * โปรแกรมนวดตั้งต้น (ราคาตัวอย่าง — ร้านแก้ได้ในตั้งค่า › ราคานวด) ใช้เมื่อร้านเปิดบริการนวดแต่ยังไม่ได้ตั้งราคาเอง
 * ราคาตามไซส์ ไม่แยกพันธุ์ (พันธุ์เดียว "ทุกพันธุ์")
 */
export const DEFAULT_MASSAGE_PROGRAMS: GroomProgram[] = [
  {
    id: "massage-30",
    name: "นวดผ่อนคลาย 30 นาที",
    kind: "massage",
    breeds: [{ breed: "ทุกพันธุ์", prices: { kitten: 300, m: 400, l: 500 } }],
  },
  {
    id: "massage-60",
    name: "นวดผ่อนคลาย 60 นาที",
    kind: "massage",
    breeds: [{ breed: "ทุกพันธุ์", prices: { kitten: 500, m: 700, l: 900 } }],
  },
];

export function isMassageProgram(p?: Pick<GroomProgram, "kind"> | null) {
  return p?.kind === "massage";
}

/** โปรแกรมอาบน้ำ/กรูมมิ่งล้วน (ตัดโปรแกรมนวดออก) — ใช้กับตัวเลือกโปรแกรมของแท็บอาบน้ำ */
export function bathPrograms(programs: GroomProgram[]) {
  return programs.filter((p) => !isMassageProgram(p));
}

/** โปรแกรมนวดของร้าน — ร้านยังไม่ได้ตั้งเอง = ใช้ตัวอย่าง DEFAULT_MASSAGE_PROGRAMS */
export function resolveMassagePrograms(config?: GroomProgram[]): GroomProgram[] {
  const own = (config || []).filter(isMassageProgram);
  return own.length > 0 ? own : DEFAULT_MASSAGE_PROGRAMS;
}

/** โปรแกรมทั้งหมดรวมนวด (ไม่ซ้ำ id) — ใช้ในหน้าคิดเงิน/ที่ต้องหาชื่อ-ราคาได้ทุกโปรแกรม */
export function allServicePrograms(config?: GroomProgram[]): GroomProgram[] {
  const base = resolveGroomPrograms(config);
  const ids = new Set(base.map((p) => p.id));
  return [...base, ...resolveMassagePrograms(config).filter((p) => !ids.has(p.id))];
}

/** หาโปรแกรมจาก id — หาไม่เจอในรายการของร้าน ลองโปรแกรมนวดตั้งต้น (ร้านที่ยังไม่ได้ตั้งราคานวดเอง) */
export function groomProgram(id: string, programs: GroomProgram[] = GROOM_PROGRAMS) {
  return programs.find((p) => p.id === id) || DEFAULT_MASSAGE_PROGRAMS.find((p) => p.id === id);
}

/** นัด groom นี้เป็นนัดนวดไหม (ดูจากโปรแกรมที่เลือกไว้) */
export function isMassageBooking(
  b: { service?: string; groomProgram?: string },
  programs: GroomProgram[] = GROOM_PROGRAMS
) {
  return b.service === "groom" && !!b.groomProgram && isMassageProgram(groomProgram(b.groomProgram, programs));
}

/** ชื่อโปรแกรมจาก id — "" ถ้าไม่เจอ (ใช้โชว์ในนัด/การ์ด/บิล) */
export function groomProgramName(id?: string, programs: GroomProgram[] = GROOM_PROGRAMS) {
  if (!id) return "";
  return groomProgram(id, programs)?.name || "";
}

/** ไซส์อาบน้ำพร้อมป้ายช่วงน้ำหนักที่ร้านตั้งเอง (ไม่ตั้ง = ค่าเริ่มต้น) */
export function resolveGroomSizes(
  labels?: Partial<Record<GroomSize, string>>
): { id: GroomSize; label: string }[] {
  return GROOM_SIZES.map((s) => ({ ...s, label: labels?.[s.id]?.trim() || s.label }));
}

export function groomSizeLabel(size: GroomSize, labels?: Partial<Record<GroomSize, string>>) {
  return resolveGroomSizes(labels).find((s) => s.id === size)?.label || "";
}

/** ราคาอาบน้ำจาก โปรแกรม+พันธุ์+ไซส์ (0 ถ้าไม่เจอ) */
export function groomPrice(
  programId: string,
  breed: string,
  size: GroomSize,
  programs: GroomProgram[] = GROOM_PROGRAMS
): number {
  const prog = groomProgram(programId, programs);
  const b = prog?.breeds.find((x) => x.breed === breed);
  return b ? b.prices[size] : 0;
}
