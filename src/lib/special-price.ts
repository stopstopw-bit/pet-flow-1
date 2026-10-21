/**
 * ราคาพิเศษรายลูกค้า
 * ---------------------
 * ลูกค้าบางคนได้ราคาที่ตกลงกันไว้ ไม่ตรงกับราคากลางของร้าน แต่คนจำได้คือพนักงาน
 * ที่ตกลงด้วยเท่านั้น พอคนละกะมาออกบิลก็คิดราคาปกติ ลูกค้าต้องมาทวงเอง
 *
 * ที่นี่ไม่เก็บตารางราคาพิเศษแยกอีกชุด — อ่านย้อนจากบิลเก่าของลูกค้าคนนั้นแทน
 * บิลทุกใบเก็บ unitAmount (ราคาต่อหน่วยที่คิดจริง) ไว้อยู่แล้ว ราคาที่เคยให้ไป
 * จึงเป็นข้อมูลที่มีอยู่แล้ว ไม่ต้องเพิ่มคอลัมน์ ไม่ต้องให้ใครมานั่งกรอกซ้ำ และ
 * ไม่มีทางขัดกับบิลจริง เพราะมันคือบิลจริง
 */

export type PastInvoice = {
  customerId?: string;
  createdAt?: string;
  items?: {
    label: string;
    kind?: string;
    qty?: number;
    unitAmount?: number;
    amount: number;
  }[];
};

/**
 * ตัดส่วนที่เปลี่ยนไปทุกใบออกจากชื่อรายการ ให้เหลือ "สิ่งที่ซื้อ" ล้วนๆ
 * — ตัดชื่อน้องข้างหน้า (🐱 มะลิ · ) เพราะราคาพิเศษให้ทั้งบ้าน ไม่ได้ให้เป็นตัวๆ
 * — ตัดจำนวนท้ายชื่อ (× 3 / × 2 คืน) เพราะเทียบกันที่ราคาต่อหน่วย
 */
export function priceSignature(label: string): string {
  return priceLabel(label).toLowerCase();
}

/** ชื่อรายการแบบที่โชว์ให้พนักงานอ่าน — ตัดเหมือน priceSignature แต่ไม่ลดตัวพิมพ์ */
export function priceLabel(label: string): string {
  return label
    .replace(/^🐱[^·]*·\s*/u, "")
    .replace(/\s*×\s*\d+(\s*คืน)?\s*$/u, "")
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** ราคาต่อหน่วยที่คิดจริงของรายการในบิล — บิลเก่าบางใบยังไม่มี unitAmount */
function unitOf(it: NonNullable<PastInvoice["items"]>[number]): number {
  return typeof it.unitAmount === "number"
    ? it.unitAmount
    : it.qty && it.qty > 0
      ? Math.round(it.amount / it.qty)
      : it.amount;
}

export type SpecialPriceHit = {
  unitAmount: number;
  /** วันที่ของบิลใบที่ใช้ราคานี้ — ไว้บอกพนักงานว่า "เคยได้เมื่อไหร่" */
  when?: string;
};

/**
 * ราคาต่อหน่วยที่ลูกค้าคนนี้เคยจ่ายจริงสำหรับรายการเดียวกัน (เอาใบล่าสุด)
 * คืน null เมื่อไม่เคยซื้อรายการนี้ — ของแถมไม่นับ ราคา 0 ไม่ใช่ "ราคาพิเศษ"
 */
export function findLastPrice(
  invoices: PastInvoice[],
  customerId: string,
  signature: string
): SpecialPriceHit | null {
  if (!customerId || !signature) return null;

  const mine = invoices
    .filter((i) => i.customerId === customerId)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  for (const inv of mine) {
    for (const it of inv.items || []) {
      if (it.kind === "freebie") continue;
      if (priceSignature(it.label) !== signature) continue;
      const unit = unitOf(it);
      if (!unit || unit <= 0) continue;
      return { unitAmount: unit, when: inv.createdAt };
    }
  }
  return null;
}

export type PastPrice = {
  signature: string;
  label: string;
  /** ราคาต่อหน่วยครั้งล่าสุด */
  unitAmount: number;
  when?: string;
  /** เคยซื้อรายการนี้กี่ครั้ง */
  times: number;
  /** ราคาครั้งก่อนหน้าที่ไม่เท่ากับครั้งล่าสุด (ถ้าเคยเปลี่ยน) — ไว้บอกว่าราคาเคยขยับ */
  previousAmount?: number;
};

/**
 * สรุป "ราคาที่ลูกค้าคนนี้เคยจ่าย" แยกตามบริการ — ใช้โชว์ในหน้าลูกค้าและตอนจองคิว
 * ไม่นับของแถม/ราคา 0 และไม่นับสินค้าหน้าร้าน (ราคาสินค้าตายตัว ไม่ใช่ราคาที่ตกลงกัน)
 * เรียงบริการที่ใช้ล่าสุดขึ้นก่อน
 */
export function pastPriceList(invoices: PastInvoice[], customerId?: string): PastPrice[] {
  const mine = invoices
    .filter((i) => !customerId || i.customerId === customerId)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const bySig = new Map<string, PastPrice>();
  for (const inv of mine) {
    // บ้านหลายตัวอาบรายการเดียวกันในบิลเดียว = มาครั้งเดียว
    const counted = new Set<string>();
    for (const it of inv.items || []) {
      if (it.kind === "freebie" || it.kind === "product") continue;
      const unit = unitOf(it);
      if (!unit || unit <= 0) continue;
      const signature = priceSignature(it.label);
      if (!signature) continue;
      const hit = bySig.get(signature);
      if (!hit) {
        bySig.set(signature, {
          signature,
          label: priceLabel(it.label),
          unitAmount: unit,
          when: inv.createdAt,
          times: 1,
        });
        counted.add(signature);
        continue;
      }
      if (!counted.has(signature)) hit.times += 1;
      counted.add(signature);
      if (hit.previousAmount === undefined && unit !== hit.unitAmount) hit.previousAmount = unit;
    }
  }
  return Array.from(bySig.values());
}
