/**
 * เช็คลิสต์ดูแลรายวันของน้องที่เข้าพัก — ร้านแก้รายการเองได้ (config.careTasks)
 * ไม่ตั้ง = ใช้ชุดนี้
 */
export type CareTask = { id: string; label: string };

export const DEFAULT_CARE_TASKS: CareTask[] = [
  { id: "feed-am", label: "อาหารเช้า" },
  { id: "feed-pm", label: "อาหารเย็น" },
  { id: "water", label: "เปลี่ยนน้ำ" },
  { id: "litter", label: "เก็บกระบะทราย" },
  { id: "play", label: "เล่น / ออกกำลัง" },
  { id: "meds", label: "ให้ยา (ถ้ามี)" },
];

export function resolveCareTasks(config?: CareTask[]): CareTask[] {
  const list = (config || []).filter((t) => t && t.id && t.label?.trim());
  return list.length > 0 ? list : DEFAULT_CARE_TASKS;
}
