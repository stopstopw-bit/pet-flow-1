import { parseBroadcastActions, type BroadcastActionId } from "./broadcast-constants";

/**
 * ค่าตั้งต้นของการ์ด "คิดถึงน้อง" (cards.missYou) — ใช้ร่วมกันทั้งตอนส่งจริงและหน้าปรับแต่งการ์ด
 * แยกไฟล์ไว้ให้ client component import ได้ (ไม่ลาก server-only chain)
 */
export const MISS_YOU_DEFAULT_ACTIONS: BroadcastActionId[] = ["grooming", "promos"];
export const MISS_YOU_DEFAULT_TITLE = "คิดถึงน้องแล้วค่ะ 💛";

/** ปุ่มในการ์ด — ร้านตั้งไว้ (ตั้งเป็น "ไม่มีปุ่ม" ได้) หรือค่าตั้งต้น */
export function missYouActions(texts?: Record<string, string>): BroadcastActionId[] {
  const raw = texts?.buttons;
  if (raw === undefined) return MISS_YOU_DEFAULT_ACTIONS;
  return parseBroadcastActions(raw);
}
