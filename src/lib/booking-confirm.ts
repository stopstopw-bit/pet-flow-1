import { getBooking, listBookings, updateBooking } from "./bookings-store";
import { bookingGroupKey, stayForGroom } from "./booking-group";

/**
 * ลูกค้ากรอกข้อมูลมาแล้ว = ยืนยันนัดแล้ว (ไม่มีปุ่ม "ยืนยันนัด" แยกอีก · เจ้าของร้าน 2026-10-27)
 * ยืนยันทั้งบ้านในนัดเดียวกัน + อาบน้ำก่อนกลับของรอบเข้าพักนั้น ไม่แยกทีละตัว
 * ไม่ส่งข้อความอะไรทั้งนั้น คืนจำนวนนัดที่เพิ่งเปลี่ยนเป็นยืนยัน
 */
export async function confirmHouseholdFrom(bookingId: string): Promise<number> {
  const b = await getBooking(bookingId);
  if (!b) return 0;
  const all = await listBookings();
  // กดมาจากอาบน้ำก่อนกลับ → ยืนยันรอบเข้าพักของมันด้วย
  const anchor = stayForGroom(b, all) || b;
  const key = bookingGroupKey(anchor);
  const house = all.filter((x) => x.status !== "cancelled" && bookingGroupKey(x) === key);
  const stayIds = new Set(house.map((x) => x.id));
  const baths = all.filter((g) => {
    const stay = stayForGroom(g, all);
    return !!stay && stayIds.has(stay.id);
  });
  const ids = new Set(
    [b, ...house, ...baths]
      // ลูกค้าจองเอง = ต้องรอร้านยืนยัน (กัน "จองเอง ยืนยันเอง") กรอกข้อมูลไม่นับเป็นยืนยัน
      .filter((x) => x.status === "pending" && !x.selfBooked)
      .map((x) => x.id)
  );
  for (const id of ids) await updateBooking(id, { status: "confirmed" });
  return ids.size;
}
