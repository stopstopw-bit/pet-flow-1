/**
 * แทนชื่อน้องในข้อความที่เก็บชื่อไว้ (รายชื่อคั่นจุลภาค / label บิล / คำอธิบายการเงิน)
 * แยกจาก cat-rename.ts เพราะ store ที่ถูก import ฝั่ง client ใช้ด้วย (ห้ามดึง calendar/googleapis มา)
 */

const ZERO_WIDTH_RE = new RegExp(
  "[" + String.fromCharCode(0x200b, 0x200c, 0x200d, 0xfeff) + "\\s]",
  "g"
);

/** เทียบชื่อน้องแบบไม่แคร์ช่องว่าง/อักขระล่องหน (เหมือน catKey ใน customers-store) */
export function catNameKey(name: string): string {
  return name.normalize("NFC").replace(ZERO_WIDTH_RE, "").toLowerCase();
}

/**
 * แทนชื่อในรายชื่อคั่นด้วยจุลภาค เช่น "ส้ม, ดำ" → "ส้มจี๊ด, ดำ"
 * คืนค่าเดิมทุกตัวอักษรถ้าไม่มีชื่อเดิมอยู่ในรายชื่อ (จะได้รู้ว่าไม่ต้องเขียนกลับ)
 */
export function replaceCatInList(text: string, oldName: string, newName: string): string {
  if (!text) return text;
  const key = catNameKey(oldName);
  const parts = text.split(",");
  if (!parts.some((p) => catNameKey(p) === key)) return text;
  return parts
    .map((p) => (catNameKey(p) === key ? newName : p.trim()))
    .filter(Boolean)
    .join(", ");
}

/** ชื่อหน้ารายการบิล "🐾 ส้ม, ดำ · อาบน้ำ" → แทนเฉพาะส่วนชื่อน้อง (คงอิโมจิเดิม 🐱/🐶/🐾) */
export function replaceCatInLabel(label: string, oldName: string, newName: string): string {
  const m = label.match(/^(🐱|🐶|🐾) (.+?) · /u);
  if (!m) return label;
  const names = replaceCatInList(m[2], oldName, newName);
  if (names === m[2]) return label;
  return `${m[1]} ${names} · ${label.slice(m[0].length)}`;
}

/** คำอธิบายรายการการเงิน "ส้ม · คุณมาย — ..." → แทนเฉพาะชื่อน้องข้างหน้า */
export function replaceCatInDescription(desc: string, oldName: string, newName: string): string {
  const i = desc.indexOf(" · ");
  if (i < 0) return desc;
  const head = desc.slice(0, i);
  const names = replaceCatInList(head, oldName, newName);
  if (names === head) return desc;
  return names + desc.slice(i);
}
