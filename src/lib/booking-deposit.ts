import type { BookingDepositConfig } from "./config-types";

/**
 * มัดจำตอนลูกค้าจองเอง (โอน + แนบสลิปในหน้าจอง)
 *
 * เก็บไว้ที่ "ทุกแถว" ของกลุ่มนัดที่จองพร้อมกัน (บ้านเดียว หลายตัว) ด้วยค่าเดียวกัน —
 * ยอดคือยอดของ "ทั้งการจอง" ไม่ใช่ต่อตัว (ห้ามเอามารวมกันข้ามแถวของกลุ่มเดียวกัน)
 * เปิดนัดตัวไหนของกลุ่มก็เห็นสถานะเดียวกัน และกด "มัดจำแล้ว" ครั้งเดียวอัปเดตทั้งกลุ่ม
 *
 * สถานะ:
 * - none            = ยังไม่โอน (มียอดมัดจำแต่ยังไม่แนบสลิป)
 * - pending_review  = แนบสลิปแล้ว รอร้านตรวจ
 * - paid            = ร้านตรวจแล้ว ได้รับมัดจำ
 */
export type DepositStatus = "none" | "pending_review" | "paid";

export const DEPOSIT_STATUS_LABEL: Record<DepositStatus, string> = {
  none: "ยังไม่โอน",
  pending_review: "รอตรวจสลิป",
  paid: "มัดจำแล้ว",
};

export function cleanDepositStatus(v: unknown): DepositStatus {
  return v === "pending_review" || v === "paid" ? v : "none";
}

/** ยอดมัดจำที่ต้องเก็บของบริการนี้ — 0 = ไม่เก็บ (ปิดอยู่/ไม่ได้ตั้งยอด) */
export function depositAmountFor(
  cfg: BookingDepositConfig | undefined,
  service: "groom" | "room"
): number {
  if (!cfg?.enabled) return 0;
  const raw = service === "room" ? cfg.roomAmount : cfg.groomAmount;
  const n = Math.round(Number(raw) || 0);
  return n > 0 ? n : 0;
}
