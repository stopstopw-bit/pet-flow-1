import type { BookingStatus } from "./business";
import { bangkokNowTime, bangkokToday } from "./bangkok-date";

type StatusBooking = {
  id: string;
  status: BookingStatus | string;
  date?: string;
  time?: string;
  checkin?: string;
  checkout?: string;
};

/** วันสุดท้ายที่นัดนี้เกี่ยวข้อง — เข้าพักใช้วันเช็คเอาท์, อาบน้ำใช้วันนัด */
export function bookingLastDate(b: StatusBooking): string {
  return b.checkout || b.date || b.checkin || "";
}

/**
 * ถึงเวลานัดแล้วหรือยัง (เวลาไทย) — อาบน้ำดูวัน+เวลานัด, ห้องพักดูวันเช็คอิน (+เวลา ถ้ามี)
 * นัดที่ไม่มีเวลา นับว่าผ่านเมื่อพ้นวันนั้นไปแล้ว
 */
export function bookingStarted(b: StatusBooking, today: string): boolean {
  const start = b.checkin || b.date || "";
  if (!start) return false;
  const bkToday = bangkokToday();
  const now = today > bkToday ? today : bkToday;
  if (start < now) return true;
  if (start > now) return false;
  return !!b.time && b.time <= bangkokNowTime();
}

/**
 * นัดนี้ยัง "รอลูกค้ายืนยัน" อยู่จริงไหม
 *
 * สถานะที่เก็บไว้เป็น pending แค่บอกว่าไม่มีใครกดยืนยันในระบบ ซึ่งไม่ได้แปลว่า
 * งานยังค้าง — ลูกค้าที่มาแล้วและออกบิลไปแล้วก็ยังเป็น pending อยู่ ทำให้คิว
 * "รอยืนยัน" บวมด้วยนัดที่จบไปนานแล้ว จนตัวเลขนั้นเชื่อถือไม่ได้
 *
 * ถือว่ายืนยันแล้วเมื่อ: เลยเวลานัดไปแล้ว (มาแล้ว) หรือมีบิลผูกอยู่ (คิดเงินแล้ว)
 */
export function isAwaitingConfirmation(
  b: StatusBooking,
  today: string,
  billedBookingIds?: Set<string>
): boolean {
  if (b.status !== "pending") return false;
  if (billedBookingIds?.has(b.id)) return false;
  return !bookingStarted(b, today);
}

/**
 * สถานะที่ควรโชว์ให้พนักงานเห็น — pending ที่เลยเวลานัดแล้ว/ออกบิลแล้ว ให้นับเป็น confirmed
 * ไม่ได้แก้ข้อมูลในฐานข้อมูล แค่ตีความตอนแสดงผล
 */
export function effectiveBookingStatus(
  b: StatusBooking,
  today: string,
  billedBookingIds?: Set<string>
): BookingStatus {
  if (b.status === "pending" && !isAwaitingConfirmation(b, today, billedBookingIds)) {
    return "confirmed";
  }
  return b.status as BookingStatus;
}
