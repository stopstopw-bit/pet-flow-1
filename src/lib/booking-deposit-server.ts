import { uploadPrivateDataUrl } from "./supabase/storage";
import type { DepositStatus } from "./booking-deposit";

/** สลิปใหญ่สุดที่รับ (ความยาว data URL) — ฝั่งแอปย่อรูปเป็น JPEG ~1400px ก่อนส่งอยู่แล้ว */
const MAX_SLIP_DATA_URL = 6_000_000;

/**
 * อัปสลิปโอนมัดจำขึ้น Supabase Storage (bucket media) แยกโฟลเดอร์ตามร้าน
 * รับเฉพาะรูป (data:image/...) — ไม่ใช่รูป/ใหญ่เกิน คืน undefined (ถือว่ายังไม่แนบสลิป)
 */
export async function saveDepositSlip(dataUrl: string): Promise<string | undefined> {
  const v = dataUrl.trim();
  if (!/^data:image\/(png|jpe?g|webp|heic|heif|gif);base64,/i.test(v)) return undefined;
  if (v.length > MAX_SLIP_DATA_URL) return undefined;
  const rand = Math.random().toString(36).slice(2, 8);
  return uploadPrivateDataUrl(`deposit-slips/${Date.now()}-${rand}`, v);
}

/** บรรทัด "มัดจำ" ในข้อความ Telegram แจ้งร้าน — ไม่มียอดมัดจำ = ไม่ใส่บรรทัดนี้ */
export function depositTelegramLine(d: {
  depositAmount?: number;
  depositSlipUrl?: string;
  depositStatus?: DepositStatus;
}): Record<string, string> {
  if (!d.depositAmount) return {};
  const amount = `${d.depositAmount.toLocaleString("th-TH")} บาท`;
  if (d.depositStatus === "paid") return { มัดจำ: `${amount} · มัดจำแล้ว ✅` };
  if (d.depositSlipUrl) {
    const link = /^https:\/\//.test(d.depositSlipUrl)
      ? ` <a href="${d.depositSlipUrl.replace(/"/g, "&quot;")}">ดูสลิป</a>`
      : "";
    return { มัดจำ: `${amount} · แนบสลิปแล้ว รอตรวจ 📎${link}` };
  }
  return { มัดจำ: `${amount} · ยังไม่โอน (ลูกค้าเลือกโอนทีหลัง)` };
}
