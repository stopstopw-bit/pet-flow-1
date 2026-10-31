/**
 * ข้อความตั้งต้นของการ์ด LINE ที่หน้าแต่งการ์ด (/admin/cards ฝั่งเบราว์เซอร์) ต้องใช้ด้วย
 * แยกจาก line.ts เพราะ line.ts ลากโค้ดฝั่งเซิร์ฟเวอร์ (ตั้งค่า LINE) ติดไปด้วย
 */

/** การ์ดขอสมุดวัคซีน / บัตรประชาชน (cards.docRequest) — {pet} = ชื่อน้อง */
export const DOC_REQUEST_DEFAULTS = {
  vaccineHeader: "💉 ขอรูปสมุดวัคซีนน้อง",
  vaccineBody: "รบกวนถ่ายรูปสมุดวัคซีนของ{pet}ส่งให้ทางร้านหน่อยนะคะ 📸\nแนบได้หลายหน้า กดปุ่มด้านล่างแล้วเลือกรูปได้เลยค่ะ",
  vaccineButton: "📸 แนบสมุดวัคซีน",
  idcardHeader: "🪪 ขอรูปบัตรประชาชนผู้ปกครอง",
  idcardBody:
    "รบกวนแนบรูปบัตรประชาชนของผู้ปกครองน้อง เพื่อลงทะเบียนเข้าพักนะคะ 🙏\nระบบจะพิมพ์ข้อความขีดทับลงในรูปให้อัตโนมัติก่อนส่ง แนบครั้งเดียวพอ รอบหน้าไม่ต้องแนบอีกค่ะ",
  idcardButton: "🪪 แนบบัตรประชาชน",
};

/** การ์ดรวมขอข้อมูล ใบเดียวหลายปุ่ม (cards.intake) — {pet} = ชื่อน้อง, {shop} = ชื่อร้าน */
export const INTAKE_CARD_DEFAULTS = {
  headerStay: "📋 เตรียมตัวก่อนเข้าพัก",
  headerGroom: "📋 เตรียมตัวก่อนอาบน้ำ",
  body: "รบกวนกรอกข้อมูลให้ครบในรอบเดียวนะคะ กดปุ่มด้านล่าง ระบบจะพาไปทีละขั้น เรื่องไหนเคยส่งแล้วจะข้ามให้ค่ะ 🙏",
  startButton: "📋 เริ่มกรอกข้อมูล",
  stayInfoButton: "🐾 แจ้งข้อมูลก่อนเข้าพัก",
  infoButton: "🩺 แจ้งประวัติก่อนอาบน้ำ",
  vaccineButton: "📸 แนบสมุดวัคซีน",
  idcardButton: "🪪 แนบบัตรประชาชน",
  timeButton: "🕒 เลือกเวลาส่งน้อง",
  consentButton: "📋 อ่านกฎ + กดยินยอม",
  depositLabel: "💰 มัดจำที่ต้องโอน",
  copyButton: "📋 คัดลอกเลขบัญชี",
};

/**
 * การ์ดแจ้งยอดคงเหลือก่อนเข้าพัก (cards.depositReminder) — แทนข้อความตัวหนังสือแบบเดิม
 * body ใช้ได้: {shop} {pet} {days} {checkin} {deposit} {remaining}
 */
export const DEPOSIT_REMINDER_DEFAULTS = {
  header: "💳 แจ้งยอดก่อนเข้าพัก",
  body: "อีก {days} วันถึงวันเข้าพักของ{pet}แล้วนะคะ 🐾\nรบกวนโอนยอดคงเหลือก่อนวันเข้าพัก โอนแล้วแจ้งสลิปในแชทได้เลยค่ะ 🧡",
  amountLabel: "ยอดคงเหลือที่ต้องโอน",
  depositPaidLabel: "มัดจำที่ชำระแล้ว",
  accountNameLabel: "ชื่อบัญชี:",
  copyButton: "📋 คัดลอกเลขบัญชี",
};

/** การ์ดแจ้งได้คูปองชวนเพื่อน (cards.referralReward) — {amount} = มูลค่าคูปอง, {days} = ใช้ได้กี่วัน */
export const REFERRAL_REWARD_DEFAULTS = {
  header: "🎉 ได้คูปองชวนเพื่อน",
  signupBody: "เพื่อนสมัครด้วยโค้ดของคุณแล้ว! คุณได้รับคูปองส่วนลด {amount}฿ เก็บไว้ในกระเป๋าคูปองแล้วนะคะ 🧡",
  visitBody: "เพื่อนที่คุณชวนมาใช้บริการแล้ว! คุณได้รับคูปองส่วนลด {amount}฿ เก็บไว้ในกระเป๋าคูปองแล้วนะคะ 🧡",
  expiry: "ใช้ได้ {days} วัน",
  button: "🎟️ ดูคูปองของฉัน",
};

/** การ์ดอวยพรวันเกิด (cards.birthday) — เนื้อความมาจากแม่แบบวันเกิดในตั้งค่าข้อความ */
export const BIRTHDAY_CARD_DEFAULTS = {
  header: "🎂 สุขสันต์วันเกิด",
  button: "🎟️ ดูคูปองของฉัน",
};

/** แทน {key} ในข้อความการ์ด */
export function fillCardText(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k) => {
    // {pet} = ชื่อน้อง (เดิมชื่อ {pet} — ข้อความเก่ายังใช้ได้)
    const key = k in vars ? k : k === "pet" && "cat" in vars ? "cat" : k === "cat" && "pet" in vars ? "pet" : k;
    return key in vars ? String(vars[key]) : m;
  });
}
