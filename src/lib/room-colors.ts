/**
 * สีประจำประเภทห้อง — ใช้แยกสีในปฏิทินเดือน (Standard เขียว, Deluxe ส้ม, Family ม่วง, VIP อิฐ …)
 * ห้องที่ตั้งสีเองในตั้งค่าใช้สีนั้น ไม่ตั้ง = ไล่ตามลำดับห้อง
 */
export const ROOM_COLOR_PALETTE = [
  "#7fcfae",
  "#efb07a",
  "#b9a0e6",
  "#d4876a",
  "#7fb2e0",
  "#e690ab",
  "#c9c25a",
  "#6fc3c9",
];

export function roomColorMap(rooms: { id: string; color?: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  rooms.forEach((r, i) => {
    out[r.id] = r.color || ROOM_COLOR_PALETTE[i % ROOM_COLOR_PALETTE.length];
  });
  return out;
}
