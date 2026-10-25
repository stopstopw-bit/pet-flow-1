/**
 * เช็คลิสต์ดูแลรายวันของน้องที่เข้าพัก — ร้านแก้รายการเองได้ (config.careTasks)
 * ไม่ตั้ง = ใช้ชุดนี้
 */
import type { PetKind } from "./pet-kind";

export type CareTask = { id: string; label: string };

export const DEFAULT_CARE_TASKS: CareTask[] = [
  { id: "feed-am", label: "อาหารเช้า" },
  { id: "feed-pm", label: "อาหารเย็น" },
  { id: "water", label: "เปลี่ยนน้ำ" },
  { id: "litter", label: "เก็บกระบะทราย" },
  { id: "play", label: "เล่น / ออกกำลัง" },
  { id: "meds", label: "ให้ยา (ถ้ามี)" },
];

/** ชื่องานขับถ่ายตามชนิดน้องของร้าน — หมาไม่มีกระบะทราย */
const TOILET_LABEL: Record<PetKind, string> = {
  cat: "เก็บกระบะทราย",
  dog: "พาขับถ่าย / ทำความสะอาดที่ขับถ่าย",
  both: "เก็บกระบะทราย / พาขับถ่าย",
};

export function resolveCareTasks(config?: CareTask[], petKind: PetKind = "cat"): CareTask[] {
  const list = (config || []).filter((t) => t && t.id && t.label?.trim());
  if (list.length > 0) return list;
  return DEFAULT_CARE_TASKS.map((t) => (t.id === "litter" ? { ...t, label: TOILET_LABEL[petKind] } : t));
}
