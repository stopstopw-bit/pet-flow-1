/** สร้าง URL เปิดใน LINE LIFF */
export function buildLiffUrl(
  liffId: string,
  params: Record<string, string>
) {
  const q = new URLSearchParams(params);
  return `https://liff.line.me/${liffId}?${q.toString()}`;
}

export function buildCustomerLinkUrl(liffId: string, customerId: string) {
  return buildLiffUrl(liffId, { path: "link", customerId });
}

export function buildRegisterUrl(liffId: string) {
  return buildLiffUrl(liffId, { path: "register" });
}

/** ลิงก์หน้ายอมรับข้อตกลง — ใส่ bookingId เพื่อชี้เฉพาะรอบเข้าพักนั้น (ลูกค้ามีหลายรอบพร้อมกันได้ ต้องยอมรับแยกทุกรอบ) */
export function buildConsentUrl(liffId: string, bookingId?: string) {
  return buildLiffUrl(liffId, bookingId ? { path: "consent", id: bookingId } : { path: "consent" });
}

/** ลิงก์หน้าเลือกเวลาส่ง/รับน้อง (เช็คอิน/เช็คเอาท์) */
export function buildBookingTimeUrl(
  liffId: string,
  bookingId: string,
  type: "checkin" | "checkout"
) {
  return buildLiffUrl(liffId, { path: "booking-time", id: bookingId, type });
}

/** ลิงก์หน้ากรอกจุดรับ-ส่งน้อง (ลิงก์ Google Maps) ก่อนวันนัด */
export function buildBookingTransportUrl(liffId: string, bookingId: string) {
  return buildLiffUrl(liffId, { path: "booking-transport", id: bookingId });
}

/** ลิงก์หน้ากรอกประวัติน้องก่อนอาบน้ำ — จองทั้งบ้านหลายตัวใส่เป็น array ได้ ฟอร์มจะรวมทุกตัวในหน้าเดียว */
export function buildGroomInfoUrl(liffId: string, bookingIds: string | string[], kind?: "stay" | "groom") {
  const id = Array.isArray(bookingIds) ? bookingIds.join(",") : bookingIds;
  // kind ไม่ส่ง = ตามบริการของนัด (เข้าพัก → ฟอร์มก่อนเข้าพัก)
  return buildLiffUrl(liffId, kind ? { path: "groom-info", id, kind } : { path: "groom-info", id });
}

/** ลิงก์หน้ากดรับคูปองจากแคมเปญ */
export function buildClaimCouponUrl(liffId: string, offerId: string) {
  return buildLiffUrl(liffId, { path: "claim-coupon", offer: offerId });
}

/** ลิงก์หน้าแนบเอกสารก่อนเข้าพัก (สมุดวัคซีน / บัตรประชาชน) — จองทั้งบ้านใส่ได้หลายนัด แนบแยกทีละตัวในหน้าเดียว */
export function buildPetDocsUrl(liffId: string, bookingIds: string | string[], need: "vaccine" | "idcard") {
  const id = Array.isArray(bookingIds) ? bookingIds.join(",") : bookingIds;
  return buildLiffUrl(liffId, { path: "pet-docs", id, need });
}

/**
 * ลิงก์ที่ร้านส่งจากหน้าข้อมูลลูกค้า (ยังไม่ต้องมีนัด) — ชี้ที่ตัวน้อง (catIds) แทนนัด
 * kind: ฟอร์มข้อมูลน้องฉบับ "ก่อนอาบน้ำ" หรือ "ก่อนเข้าพัก" (คำถามชุดเดียวกัน ต่างแค่หัวข้อ)
 */
export function buildCatInfoUrl(liffId: string, catIds: string[], kind: "groom" | "stay") {
  return buildLiffUrl(liffId, { path: "groom-info", cats: catIds.join(","), kind });
}

export function buildCatVaccineUrl(liffId: string, catIds: string[]) {
  return buildLiffUrl(liffId, { path: "pet-docs", cats: catIds.join(","), need: "vaccine" });
}

export function buildIdCardUrl(liffId: string) {
  return buildLiffUrl(liffId, { path: "pet-docs", need: "idcard" });
}

/** หน้าข้อตกลงแบบไม่ผูกนัด — ยอมรับแล้วเก็บไว้ที่ลูกค้า */
export function buildCustomerConsentUrl(liffId: string) {
  return buildLiffUrl(liffId, { path: "consent", mode: "customer" });
}
