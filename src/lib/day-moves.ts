/**
 * งานของนัดหนึ่งในวันหนึ่ง สำหรับวางบนปฏิทินร้าน — ลูกค้า "มาส่ง" น้องกี่โมง "มารับ" กี่โมง
 * เวลามาจากที่ลูกค้าเลือกผ่านการ์ด LINE (arrivalTime / pickupTime)
 * วันกลางของการเข้าพัก = "เข้าพัก" เฉยๆ ไม่มีเวลา (น้องอยู่ที่ร้านทั้งวัน)
 */
export type DayMoveKind = "groom" | "in" | "out" | "stay";
export type DayMove = { kind: DayMoveKind; time: string };

type MoveSource = {
  service?: string;
  date?: string;
  time?: string;
  checkin?: string;
  checkout?: string;
  arrivalTime?: string;
  pickupTime?: string;
};

export const DAY_MOVE_LABELS: Record<DayMoveKind, string> = {
  groom: "อาบน้ำ",
  in: "มาส่ง",
  out: "มารับ",
  stay: "เข้าพัก",
};

export function dayMoves(b: MoveSource, dateKey: string): DayMove[] {
  if (b.service !== "room") {
    const moves: DayMove[] = [{ kind: "groom", time: b.time || "" }];
    // ลูกค้าบอกเวลามารับหลังอาบเสร็จไว้ — ขึ้นแยกอีกช่องให้รู้ว่าต้องพร้อมกี่โมง
    if (b.pickupTime && b.pickupTime !== b.time) moves.push({ kind: "out", time: b.pickupTime });
    return moves;
  }
  const ci = (b.checkin || b.date || "").slice(0, 10);
  const co = (b.checkout || "").slice(0, 10);
  const moves: DayMove[] = [];
  // Day Care (เข้า-ออกวันเดียวกัน) ได้ทั้งมาส่งและมารับในวันเดียว
  if (dateKey === ci) moves.push({ kind: "in", time: b.arrivalTime || "" });
  if (dateKey === co) moves.push({ kind: "out", time: b.pickupTime || "" });
  if (moves.length === 0) moves.push({ kind: "stay", time: "" });
  return moves;
}

const KIND_ORDER: Record<DayMoveKind, number> = { in: 0, groom: 1, out: 2, stay: 3 };

/**
 * แตกการ์ดของวัน (บ้านละใบ) เป็นรายการบนปฏิทิน เรียงตามเวลา
 * มีเวลาก่อน → มาส่ง/มารับที่ยังไม่แจ้งเวลา → น้องที่พักต่อ
 */
export function dayEntries<T extends MoveSource>(groups: T[][], dateKey: string) {
  return groups
    .flatMap((group) => dayMoves(group[0], dateKey).map((move) => ({ group, move })))
    .sort((a, b) => {
      const ta = a.move.time || "99";
      const tb = b.move.time || "99";
      if (ta !== tb) return ta.localeCompare(tb);
      return KIND_ORDER[a.move.kind] - KIND_ORDER[b.move.kind];
    });
}

/** เวลาแรกของการ์ดในวันนั้น — ใช้เรียงลิสต์ของวัน ("" = ไม่มีเวลา) */
export function firstMoveTime(b: MoveSource, dateKey: string) {
  return (
    dayMoves(b, dateKey)
      .map((m) => m.time)
      .filter(Boolean)
      .sort()[0] || ""
  );
}
