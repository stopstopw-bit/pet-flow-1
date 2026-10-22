/**
 * การ์ดถามข้อมูลก่อนรับน้อง — ชื่อ ลำดับ และไอคอนชุดเดียวกันทุกที่
 * (หน้าข้อมูลลูกค้า · การ์ดนัด ทั้งปุ่มลัด / ทีละใบ / ชุดการ์ด)
 */
export const INTAKE_CARDS = [
  { part: "stayInfo", label: "ข้อมูลน้องก่อนเข้าพัก", icon: "edit", feature: "hotel" },
  { part: "groomInfo", label: "ประวัติน้องก่อนอาบน้ำ", icon: "bath", feature: "grooming" },
  { part: "vaccine", label: "ขอสมุดวัคซีน", icon: "image", feature: null },
  { part: "idcard", label: "ขอบัตรประชาชน", icon: "user", feature: "hotel" },
  { part: "consent", label: "กฎ + กดยินยอม", icon: "doc", feature: null },
  { part: "prestay", label: "แจ้งเตรียมตัวเข้าพัก", icon: "bed", feature: "hotel" },
] as const;

export type IntakePart = (typeof INTAKE_CARDS)[number]["part"];

export const INTAKE_LABEL = Object.fromEntries(INTAKE_CARDS.map((c) => [c.part, c.label])) as Record<
  IntakePart,
  string
>;
