import { logAudit } from "./audit-log";

/** ชื่อไทยของตัวเลขที่ cron คืนมา — แสดงในหน้า ประวัติการใช้งาน */
const LABELS: Record<string, string> = {
  due: "นัดที่ถึงรอบยืนยัน",
  sent: "ส่งการ์ดยืนยัน",
  prestayReminders: "ชุดก่อนเข้าพัก",
  depositReminders: "แจ้งยอดคงเหลือ",
  reviewRequests: "ขอรีวิว",
  bathConsentReminders: "ขอยอมรับข้อตกลงก่อนอาบน้ำ (ระหว่างพัก)",
  groomInfoCards: "ขอประวัติก่อนอาบน้ำ",
  checkinReminders: "เตือนเลือกเวลาส่ง",
  checkoutReminders: "เตือนเลือกเวลารับ",
  noLine: "นัดที่ไม่ได้ผูก LINE (ส่งไม่ได้)",
};

/**
 * จดผลรอบส่ง LINE อัตโนมัติของแต่ละร้านลงประวัติการใช้งาน
 * Vercel แพ็กฟรีเก็บ log แค่ 1 ชม. — ไม่มีบันทึกนี้ ร้านจะไม่รู้เลยว่ารอบเที่ยงรันไหม ส่งกี่ใบ ติดอะไร
 */
export async function logAutoRound(
  tenantId: string,
  job: string,
  slot: string,
  result: Record<string, unknown>
) {
  const detail: Record<string, string> = {};
  for (const [key, label] of Object.entries(LABELS)) {
    if (typeof result[key] === "number") detail[label] = String(result[key]);
  }
  const errors = [
    ...(Array.isArray(result.errors) ? result.errors.map(String) : []),
    ...(result.error ? [String(result.error)] : []),
  ];
  if (errors.length) detail["ผิดพลาด"] = errors.join(" | ").slice(0, 500);
  console.log(`[auto-round] ${job} ${slot} tenant=${tenantId}`, JSON.stringify(result).slice(0, 2000));
  try {
    await logAudit({
      tenantId,
      actorType: "tenant",
      actorId: "ระบบอัตโนมัติ",
      action: "auto_line_round",
      resourceType: "รอบ",
      resourceId: `${job} ${slot}`,
      afterState: detail,
    });
  } catch {
    // จดไม่ได้ไม่ควรทำให้รอบส่งพัง
  }
}
