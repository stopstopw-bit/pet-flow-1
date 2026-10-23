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
  status?: string;
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
  // ตัวเดียวกันมีทั้งนัดเข้าพักและอาบน้ำก่อนกลับได้ (กลุ่มบิล) — ชื่อไม่ซ้ำ
  return Array.from(new Set(group.map((b) => b.catName))).join(", ");
}

/**
 * จัดกลุ่มตอน "ออกบิล" — เหมือน groupBookings แบบอาบน้ำรวมทั้งวัน
 * แต่อาบน้ำก่อนกลับ (อาบระหว่างพัก) ไปอยู่กลุ่มเดียวกับการเข้าพักครั้งนั้น → บิลใบเดียวกับค่าห้อง
 */
export function groupForBilling<T extends GroupableBooking>(list: T[]): T[][] {
  const inStay = new Map<string, T>();
  for (const b of list) {
    const stay = stayForGroom(b, list);
    if (stay) inStay.set(b.id, stay);
  }
  const out = groupBookings(
    list.filter((b) => !inStay.has(b.id)),
    { groomByDay: true }
  );
  for (const [id, stay] of inStay) {
    const g = out.find((x) => x.some((y) => y.id === stay.id));
    const b = list.find((x) => x.id === id)!;
    if (g) g.push(b);
    else out.push([b]);
  }
  return out;
}

const isLive = (b: GroupableBooking) => b.status !== "cancelled" && b.status !== "no_show";

/**
 * นัดอาบน้ำที่อยู่ระหว่างการเข้าพักของน้องตัวเดียวกัน (ปกติคืออาบวันออกก่อนกลับบ้าน)
 * → คืนนัดเข้าพักที่มันเป็นส่วนหนึ่ง ใช้รวมบิล/การ์ดเป็นนัดเดียว และไม่ส่งยืนยันนัดอาบน้ำแยก
 * (ลูกค้าไม่ต้องพาน้องมา น้องอยู่ที่ร้านอยู่แล้ว) · คิวอาบน้ำยังเป็นนัดของตัวเองเพื่อกันเวลาช่าง
 */
export function stayForGroom<T extends GroupableBooking>(b: T, list: T[]): T | undefined {
  if (b.service !== "groom" || !b.date || !isLive(b)) return undefined;
  const d = b.date.slice(0, 10);
  const who = b.customerId || b.customerName;
  return list.find(
    (s) =>
      s.service === "room" &&
      isLive(s) &&
      (s.customerId || s.customerName) === who &&
      s.catName === b.catName &&
      !!s.checkin &&
      s.checkin.slice(0, 10) <= d &&
      d <= (s.checkout || s.checkin).slice(0, 10)
  );
}
