import { after } from "next/server";
import { requireTenantId, withTenantEvenIfClosed } from "./tenant-context";

/**
 * งานที่ลูกค้าไม่ต้องรอ (แจ้งเตือน Telegram/LINE, คำนวณระดับลูกค้า …) — ทำหลังส่งคำตอบกลับไปแล้ว
 * เดิมทุก route รอส่ง Telegram เสร็จก่อนตอบ (3 รอบไป-กลับเซิร์ฟเวอร์ Telegram ที่ยุโรป) ลูกค้าเลยรอนาน
 * Vercel ยังรันงานนี้ต่อจนจบหลังตอบ (waitUntil) — ไม่หาย แค่ไม่ขวางหน้าจอลูกค้า
 * จำร้านไว้ตอนสั่ง แล้วรันในร้านเดิม (งานหลังตอบอาจหลุดจาก context ของ request)
 */
export function runAfterResponse(label: string, task: () => Promise<unknown>) {
  const tenantId = requireTenantId();
  after(() =>
    withTenantEvenIfClosed(tenantId, task).catch((e) =>
      console.error(`${label} failed:`, e instanceof Error ? e.message : e)
    )
  );
}
