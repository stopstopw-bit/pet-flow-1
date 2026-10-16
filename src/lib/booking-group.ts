/**
 * รวมนัดของ "บ้านเดียวกัน นัดเดียวกัน" เข้าเป็นกลุ่มเดียว
 *
 * ระบบเก็บนัดเป็น 1 แถวต่อ 1 ตัว (เพราะแต่ละตัวมีประวัติ/บริการของตัวเอง)
 * แต่เวลาแสดงผลและตอนคิดเงิน เจ้าของคนเดียวพาแมวมา 7 ตัวในวันเดียว
 * ควรเห็นเป็น "1 นัด 7 ตัว" และออกบิลใบเดียว
 *
 * คนละวัน / คนละบริการ = คนละกลุ่มเสมอ (ตรงตามที่ร้านใช้งานจริง:
 * ถ้าแยกวันกันมา ก็ลงนัดตามชื่อแมวที่มาวันนั้น)
 */

export type GroupableBooking = {
  id: string;
  customerId?: string;
  customerName: string;
  catName: string;
  service?: string;
  date?: string;
  time?: string;
  checkin?: string;
  checkout?: string;
};

export type GroupOptions = {
  /**
   * อาบน้ำ: รวมทั้งบ้านในวันเดียวกันแม้คนละรอบเวลา — สล็อตรับทีละตัว แมว 3 ตัวของบ้านเดียวกัน
   * จึงได้คนละเวลา แต่ยังควรออกบิลใบเดียว (ตารางนัดยังแยกตามเวลาเหมือนเดิม)
   */
  groomByDay?: boolean;
};

/** กุญแจจัดกลุ่ม — ลูกค้าคนเดียวกัน บริการเดียวกัน และช่วงเวลาตรงกันทุกช่อง */
export function bookingGroupKey(b: GroupableBooking, opts: GroupOptions = {}) {
  const ignoreTime = opts.groomByDay && b.service === "groom";
  return [
    b.customerId || b.customerName,
    b.service || "",
    b.date || "",
    ignoreTime ? "" : b.time || "",
    b.checkin || "",
    b.checkout || "",
  ].join("|");
}

/** จัดกลุ่มโดยคงลำดับเดิมของรายการแรกในแต่ละกลุ่มไว้ */
export function groupBookings<T extends GroupableBooking>(
  list: T[],
  opts: GroupOptions = {}
): T[][] {
  const groups = new Map<string, T[]>();
  for (const b of list) {
    const k = bookingGroupKey(b, opts);
    const arr = groups.get(k);
    if (arr) arr.push(b);
    else groups.set(k, [b]);
  }
  return Array.from(groups.values());
}

/** ชื่อแมวทุกตัวในกลุ่ม เช่น "ลาล่า, บาซ่า, ซิมบ้า" */
export function groupCatNames(group: GroupableBooking[]) {
  return group.map((b) => b.catName).join(", ");
}
