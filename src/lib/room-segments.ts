/**
 * ย้ายห้องกลางทางในนัดเดียว เช่น 25→28 Catflix แล้ว 28→31 Mid Cozy
 *
 * นัดเก็บห้องแรกไว้ที่ room/roomUnit เหมือนเดิม (ตั้งแต่วันเข้า) ส่วนห้องถัดๆ ไปเก็บใน
 * roomSegments (คอลัมน์ room_segments) เป็นรายการ "ตั้งแต่วันนี้ย้ายไปห้องนี้"
 * แต่ละช่วงยาวถึงวันย้ายครั้งถัดไป ช่วงสุดท้ายยาวถึงวันออก
 *
 * นัดที่ไม่ได้ย้ายห้อง roomSegments ว่าง → ทุกอย่างทำงานแบบเดิม
 */

export type RoomSegment = {
  /** วันที่ย้ายเข้าห้องนี้ (YYYY-MM-DD) — ต้องอยู่หลังวันเข้าและก่อนวันออก */
  from: string;
  /** id ประเภทห้อง (เหมือน booking.room) */
  room: string;
  /** ห้องจริงที่ปักหมุดไว้ — ไม่ระบุ = ให้ผังห้องจัดให้ */
  roomUnit?: number;
};

type StayLike = {
  room?: string;
  roomUnit?: number;
  checkin?: string;
  checkout?: string;
  roomSegments?: RoomSegment[];
};

/** ช่วงห้องเต็มของการเข้าพัก (รวมห้องแรก) — [checkin, checkout) ต่อช่วง */
export type StayPiece = { room?: string; roomUnit?: number; checkin: string; checkout: string };

const day = (s?: string) => (s || "").slice(0, 10);

/** เก็บเฉพาะช่วงที่ใช้ได้จริง: อยู่ในช่วงพัก เรียงวัน ไม่ซ้ำวัน ไม่ใช่ห้องเดิมต่อกัน */
export function cleanRoomSegments(
  raw: unknown,
  stay: { room?: string; roomUnit?: number; checkin?: string; checkout?: string }
): RoomSegment[] {
  if (!Array.isArray(raw)) return [];
  const ci = day(stay.checkin);
  const co = day(stay.checkout);
  const list = raw
    .map((x) => {
      const o = (x || {}) as Record<string, unknown>;
      const unit = Number(o.roomUnit);
      return {
        from: day(String(o.from || "")),
        room: String(o.room || "").trim(),
        roomUnit: Number.isFinite(unit) && unit >= 1 ? Math.floor(unit) : undefined,
      };
    })
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.from) && s.room && (!ci || s.from > ci) && (!co || s.from < co))
    .sort((a, b) => a.from.localeCompare(b.from));
  const out: RoomSegment[] = [];
  let prevRoom = stay.room || "";
  let prevUnit = stay.roomUnit || undefined;
  for (const s of list) {
    if (out.some((o) => o.from === s.from)) continue;
    if (s.room === prevRoom && (s.roomUnit || undefined) === prevUnit) continue;
    out.push(s.roomUnit ? s : { from: s.from, room: s.room });
    prevRoom = s.room;
    prevUnit = s.roomUnit;
  }
  return out;
}

export function hasRoomMoves(b: StayLike): boolean {
  return (b.roomSegments || []).length > 0;
}

/** แตกการเข้าพักเป็นช่วงตามห้อง — ไม่ได้ย้ายห้อง = ช่วงเดียวเท่ากับทั้งการเข้าพัก */
export function staySegments(b: StayLike): StayPiece[] {
  const ci = day(b.checkin);
  const co = day(b.checkout);
  const moves = (b.roomSegments || []).filter((s) => s.from > ci && (!co || s.from < co));
  if (!ci || moves.length === 0) return [{ room: b.room, roomUnit: b.roomUnit, checkin: ci, checkout: co }];
  const out: StayPiece[] = [];
  let cur: StayPiece = { room: b.room, roomUnit: b.roomUnit, checkin: ci, checkout: "" };
  for (const m of moves) {
    out.push({ ...cur, checkout: m.from });
    cur = { room: m.room, roomUnit: m.roomUnit, checkin: m.from, checkout: "" };
  }
  out.push({ ...cur, checkout: co });
  return out;
}

/** ห้องที่น้องอยู่ในคืนของวันนี้ */
export function roomOn(b: StayLike, date: string): { room?: string; roomUnit?: number } {
  const d = day(date);
  let room = b.room;
  let roomUnit = b.roomUnit;
  for (const s of b.roomSegments || []) {
    if (s.from <= d) {
      room = s.room;
      roomUnit = s.roomUnit;
    }
  }
  return { room, roomUnit };
}

/** วันที่ย้ายห้อง (ไม่รวมวันเข้า) */
export function moveDates(b: StayLike): string[] {
  return staySegments(b).slice(1).map((s) => s.checkin);
}

/**
 * แตกนัดที่ย้ายห้องเป็นนัดย่อยต่อช่วง — ไว้ให้ผังห้อง/บิลคิดทีละช่วงได้เหมือนนัดธรรมดา
 * นัดย่อยใช้ id เดิม (ให้กดเปิดนัดได้เหมือนเดิม) + segKey ไว้แยกช่วง
 */
export function expandBySegments<T extends StayLike & { id: string }>(
  list: T[]
): (T & { segKey: string; segIndex: number; segCount: number })[] {
  const out: (T & { segKey: string; segIndex: number; segCount: number })[] = [];
  for (const b of list) {
    const segs = staySegments(b);
    if (segs.length <= 1) {
      out.push({ ...b, segKey: b.id, segIndex: 0, segCount: 1 });
      continue;
    }
    segs.forEach((s, i) =>
      out.push({
        ...b,
        room: s.room,
        roomUnit: s.roomUnit,
        checkin: s.checkin,
        checkout: s.checkout,
        segKey: `${b.id}@${s.checkin}`,
        segIndex: i,
        segCount: segs.length,
      })
    );
  }
  return out;
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "25–28 ต.ค." / "30 ต.ค.–2 พ.ย." */
export function shortRange(from: string, to: string): string {
  const a = new Date(`${day(from)}T12:00:00Z`);
  const b = new Date(`${day(to)}T12:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return `${from}–${to}`;
  if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()}–${b.getUTCDate()} ${TH_MONTHS[b.getUTCMonth()]}`;
  return `${a.getUTCDate()} ${TH_MONTHS[a.getUTCMonth()]}–${b.getUTCDate()} ${TH_MONTHS[b.getUTCMonth()]}`;
}

/**
 * ชื่อห้องแบบรวมทุกช่วง เช่น "Catflix 25–28 ต.ค. → Mid Cozy 28–31 ต.ค."
 * ไม่ได้ย้ายห้อง = ชื่อห้องเดียว (เหมือนเดิม)
 * @param nameOf แปลง id ห้อง → ชื่อที่โชว์
 */
export function roomSummary(b: StayLike, nameOf: (room?: string) => string, withUnit = false): string {
  const segs = staySegments(b);
  const label = (s: StayPiece) => `${nameOf(s.room)}${withUnit && s.roomUnit ? ` #${s.roomUnit}` : ""}`;
  if (segs.length <= 1) return label(segs[0]);
  return segs.map((s) => `${label(s)} ${shortRange(s.checkin, s.checkout)}`).join(" → ");
}

/**
 * เลื่อนวันนัด/ต่อคืน — ปรับวันย้ายห้องให้ตาม
 * เลื่อนทั้งช่วง (เข้า-ออกขยับเท่ากัน) = วันย้ายขยับตาม · อย่างอื่น = เก็บเฉพาะวันย้ายที่ยังอยู่ในช่วงใหม่
 */
export function shiftRoomSegments(
  segs: RoomSegment[] | undefined,
  before: { checkin?: string; checkout?: string },
  after: { checkin?: string; checkout?: string; room?: string; roomUnit?: number }
): RoomSegment[] {
  if (!segs || segs.length === 0) return [];
  const diff = (a?: string, b?: string) =>
    Math.round((Date.parse(`${day(b)}T12:00:00Z`) - Date.parse(`${day(a)}T12:00:00Z`)) / 86_400_000);
  const dIn = diff(before.checkin, after.checkin);
  const dOut = diff(before.checkout, after.checkout);
  const shift = (iso: string, n: number) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const moved = Number.isFinite(dIn) && dIn !== 0 && dIn === dOut ? segs.map((s) => ({ ...s, from: shift(s.from, dIn) })) : segs;
  return cleanRoomSegments(moved, after);
}
