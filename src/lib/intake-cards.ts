/**
 * การ์ดถามข้อมูลก่อนรับน้อง — ชื่อ ลำดับ และไอคอนชุดเดียวกันทุกที่
 * (หน้าข้อมูลลูกค้า · การ์ดนัด ทั้งปุ่มลัด / ทีละใบ / ชุดการ์ด)
 * feature = สวิตช์ในตั้งค่า › เปิด/ปิดฟีเจอร์ (ดู CARD_FEATURE ใน features.ts)
 */
export const INTAKE_CARDS = [
  { part: "stayInfo", label: "ข้อมูลน้องก่อนเข้าพัก", icon: "edit", feature: "stayInfo" },
  { part: "groomInfo", label: "ประวัติน้องก่อนอาบน้ำ", icon: "bath", feature: "groomInfo" },
  { part: "vaccine", label: "ขอสมุดวัคซีน", icon: "image", feature: "vaccine" },
  { part: "idcard", label: "ขอบัตรประชาชน", icon: "user", feature: "idCard" },
  { part: "consent", label: "กฎ + กดยินยอม", icon: "doc", feature: "consent" },
  { part: "prestay", label: "แจ้งเตรียมตัวเข้าพัก", icon: "bed", feature: "prestay" },
] as const;

export type IntakePart = (typeof INTAKE_CARDS)[number]["part"];

export const INTAKE_LABEL = Object.fromEntries(INTAKE_CARDS.map((c) => [c.part, c.label])) as Record<
  IntakePart,
  string
>;
