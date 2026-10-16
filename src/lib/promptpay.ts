/**
 * สร้างข้อความ QR พร้อมเพย์ (มาตรฐาน EMVCo / Thai QR) — ลูกค้าสแกนแล้วยอดขึ้นให้เลย
 * รับเบอร์มือถือ 10 หลัก หรือเลขผู้เสียภาษี/บัตรประชาชน 13 หลัก
 */

const f = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

function crc16(s: string): string {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** เลขพร้อมเพย์ที่ใช้ได้ — คืนค่าเฉพาะตัวเลข หรือ undefined ถ้ารูปแบบไม่ถูก */
export function cleanPromptpayId(v?: string): string | undefined {
  const d = String(v || "").replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("0")) return d;
  if (d.length === 13) return d;
  return undefined;
}

export function promptpayPayload(id: string, amount?: number): string {
  const clean = cleanPromptpayId(id);
  if (!clean) throw new Error("bad_promptpay_id");
  const target =
    clean.length === 10
      ? f("01", `0066${clean.slice(1)}`.padStart(13, "0"))
      : f("02", clean);
  const merchant = f("29", f("00", "A000000677010111") + target);
  const amt = amount && amount > 0 ? f("54", amount.toFixed(2)) : "";
  const body =
    f("00", "01") + f("01", amt ? "12" : "11") + merchant + f("58", "TH") + f("53", "764") + amt + "6304";
  return body + crc16(body);
}
