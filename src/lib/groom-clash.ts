/**
 * คิวอาบน้ำชนกัน — ร้านไม่มีระยะเวลาต่อบริการในระบบ เลยถือว่า "ชน" เมื่อเวลานัด
 * ห่างกันไม่ถึง CLASH_WINDOW_MIN นาทีในวันเดียวกัน (ไม่ห้ามจอง แค่เตือนให้พนักงานเห็นก่อน)
 */
export const CLASH_WINDOW_MIN = 60;

export type ClashBooking = {
  id: string;
  service?: string;
  date?: string;
  time?: string;
  status?: string;
  catName?: string;
  customerName?: string;
};

const toMin = (t?: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function groomClashes(
  bookings: ClashBooking[],
  date: string,
  time: string,
  excludeIds: string[] = []
): ClashBooking[] {
  const at = toMin(time);
  if (!date || at == null) return [];
  return bookings
    .filter(
      (b) =>
        b.service === "groom" &&
        b.date === date &&
        b.status !== "cancelled" &&
        b.status !== "no_show" &&
        !excludeIds.includes(b.id)
    )
    .filter((b) => {
      const t = toMin(b.time);
      return t != null && Math.abs(t - at) < CLASH_WINDOW_MIN;
    })
    .sort((a, b) => (toMin(a.time) || 0) - (toMin(b.time) || 0));
}

/** ข้อความสั้นๆ ไว้โชว์/ถามยืนยัน เช่น "12:30 น้องส้ม (คุณมาย)" */
export function clashLine(b: ClashBooking) {
  return `${b.time || "?"} ${b.catName || "น้องแมว"}${b.customerName ? ` (${b.customerName})` : ""}`;
}
