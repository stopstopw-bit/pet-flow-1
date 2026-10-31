/**
 * ถามก่อนกด "รับมัดจำแล้ว" — 2 ขั้น กันกดพลาด และไม่ส่งการ์ดให้ลูกค้าโดยไม่ตั้งใจ
 * 1) ยืนยันว่าจะลงบัญชีรับมัดจำจริง (ยกเลิก = ไม่ทำอะไรเลย)
 * 2) ถามแยกว่าจะส่งการ์ด "ขอบคุณสำหรับการวางมัดจำ" ทาง LINE ไหม (ยกเลิก = ลงบัญชีอย่างเดียว ไม่ส่ง)
 * คืน null = ไม่ทำต่อ
 */
export function askDepositReceive(
  customerName: string | undefined,
  amount: number,
  hasLine: boolean
): { notify: boolean } | null {
  const who = customerName ? ` ของ ${customerName}` : "";
  if (!window.confirm(`บันทึกว่ารับมัดจำ ${amount.toLocaleString()} บาท${who} แล้ว?`)) return null;
  if (!hasLine) return { notify: false };
  const notify = window.confirm(
    `ส่งการ์ด "ขอบคุณสำหรับการวางมัดจำ" ให้ลูกค้าทาง LINE ด้วยไหม?\n\nตกลง = ส่งการ์ด\nยกเลิก = ลงบัญชีอย่างเดียว ไม่ส่ง`
  );
  return { notify };
}
