/**
 * แผนผังห้องพัก — แปลง "นัดเข้าพัก" เป็นภาพว่าห้องไหนมีใครอยู่ ห้องไหนว่างจริง
 *
 * ห้องในระบบเก็บเป็น "ประเภท" (MiNi Meow, Mid Cozy, Catflix) พร้อมจำนวนยูนิต
 * ส่วนการจองเก็บเป็นรายตัวแมว — แมวหลายตัวนอนห้องเดียวกันได้ ระบบจึงจับแมวของ
 * "บ้านเดียวกัน ช่วงวันเดียวกัน" ลงห้องเดียวกันให้ก่อนจนเต็มความจุ แล้วค่อยขึ้นห้องใหม่
 * (เช่น มา 3 ตัว ห้องจุ 2 → ห้องแรก 2 ตัว ห้องถัดไป 1 ตัว)
 *
 * ถ้าอยากจัดเอง ใส่เลขห้องที่ roomUnit ของนัดนั้น ระบบจะยึดตามที่ระบุ
 *
 * นัดที่ย้ายห้องกลางทาง (roomSegments) ถูกแตกเป็นช่วงย่อยแล้วจัดห้องทีละช่วง
 * วันย้าย = ออกจากห้องเก่า + เข้าห้องใหม่ในวันเดียวกัน (ดู room-segments.ts)
 */
import { expandBySegments, type RoomSegment } from "./room-segments";

export type BoardRoomType = {
  id: string;
  name: string;
  /** จำนวนห้องจริง — ห้องเชื่อมเป็น 0 เพราะไม่ใช่ห้องของตัวเอง */
  count: number;
  /** จุแมวได้กี่ตัวต่อห้อง (ไม่ระบุ = 1) — รวมตัวที่จ่ายเพิ่มแล้ว เช่น "1–4 แมว · แมวที่ 5 +50" = 5 */
  maxCats?: number;
  /** ราคาห้องรวมแมวกี่ตัว ตัวที่เกินนี้คือ "ตัวเพิ่ม" ที่คิดเงินเพิ่ม (ไม่ระบุ = เท่ากับ maxCats) */
  baseCats?: number;
  /** ห้องเชื่อมประกอบจากห้องจริงอะไรบ้าง — ตั้งได้ต่อร้านในหน้าตั้งค่า */
  composedOf?: { typeId: string; units: number }[];
  /** ช่วงที่ปิดห้อง (ซ่อม/ใช้งานไม่ได้) — ไม่รับแมวเข้าห้องนั้นในช่วงนี้ */
  closures?: RoomClosure[];
};

/**
 * ปิดห้องรายห้อง เช่น Mid Cozy #3 ซ่อมแอร์ — เก็บใน config.roomClosures
 * from/to เป็นวันที่ (YYYY-MM-DD) ปิดทั้งวัน to ว่าง = ปิดจนกว่าจะกดเปิด
 */
export type RoomClosure = {
  id: string;
  typeId: string;
  unit: number;
  from: string;
  to?: string;
  reason: string;
};

/** แนบช่วงปิดห้องเข้ากับประเภทห้องแต่ละแบบ (config.rooms + config.roomClosures) */
export function attachClosures<T extends { id: string }>(rooms: T[], closures?: RoomClosure[]): (T & { closures: RoomClosure[] })[] {
  return rooms.map((r) => ({ ...r, closures: (closures || []).filter((c) => c.typeId === r.id) }));
}

/** ห้องนี้ปิดอยู่ในวันนี้ไหม */
export function closureOn(closures: RoomClosure[] | undefined, unit: number, date: string) {
  return (closures || []).find((c) => c.unit === unit && c.from <= date && (!c.to || date <= c.to));
}

/** ช่วงปิดเป็น [เริ่ม, วันถัดจากวันสุดท้าย) ให้เทียบกับช่วงเข้าพักได้ */
function closureRange(c: RoomClosure): [string, string] {
  return [c.from, c.to ? nextDay(c.to) : "9999-12-31"];
}

/**
 * ห้องเชื่อม = เอาห้องจริงที่อยู่ติดกันมาเปิดทะลุถึงกัน ไม่ใช่ห้องเพิ่ม
 * จองห้องเชื่อม 1 ห้อง = กินห้องจริงไปหลายห้อง ต้องคิดที่ว่างจากห้องจริงเสมอ
 * ไม่งั้นจะขายเกินจำนวนห้องที่มี หรือซ่อนห้องที่ยังรับลูกค้าได้
 *
 * แต่ละร้านตั้งเองว่าห้องเชื่อมของตัวเองประกอบจากห้องไหนบ้าง (ตั้งค่า > ห้องพัก)
 */
export function compositionOf(
  typeId: string,
  rooms: BoardRoomType[]
): { typeId: string; units: number }[] | undefined {
  const parts = rooms.find((r) => r.id === typeId)?.composedOf;
  return parts && parts.length > 0 ? parts : undefined;
}

export type BoardBooking = {
  id: string;
  catName: string;
  customerName: string;
  customerId?: string;
  service: string;
  room?: string;
  roomUnit?: number;
  checkin?: string;
  checkout?: string;
  status?: string;
  arrivalTime?: string;
  pickupTime?: string;
  roomSegments?: RoomSegment[];
};

/** ช่วงย่อยของนัด (นัดที่ไม่ย้ายห้อง = ช่วงเดียว) — segKey ไม่ซ้ำกันแม้ id เดียวกัน */
type Piece = BoardBooking & { segKey: string };

export type UnitState = {
  typeId: string;
  typeName: string;
  unit: number;
  capacity: number;
  /** แมวที่นอนอยู่ในคืนของวันนี้ (ห้องเดียวอาจมีหลายตัวถ้าเป็นบ้านเดียวกัน) */
  staying: BoardBooking[];
  /** แมวที่เช็คเอาท์ออกวันนี้ — ห้องจะว่างหลังเขาออก */
  leaving: BoardBooking[];
  /** มีตัวที่เพิ่งเข้าวันนี้ */
  arriving: boolean;
  /** วันนี้มีทั้งคนออกและคนเข้าในห้องเดียวกัน — ต้องเคลียร์ห้องให้ทัน */
  turnover: boolean;
  /** ใส่แมวเกินความจุห้อง (ปักหมุดเอง) — เตือนไว้ ไม่บล็อก */
  overCapacity: boolean;
  /** ราคาห้องรวมแมวกี่ตัว (ห้องเชื่อม = ของห้องเชื่อม ไม่ใช่ห้องย่อย) */
  baseCats: number;
  /** แมวที่เกินราคาห้องแต่ยังอยู่ในความจุ — ตัวเพิ่มที่คิดเงินเพิ่ม ไม่ใช่เกินความจุ */
  extraCats: number;
  /** ห้องนี้ถูกใช้เป็นส่วนหนึ่งของห้องเชื่อม (เช่น Mini Duo) — ชื่อห้องเชื่อมที่ยึดอยู่ */
  partOf?: string;
  /** ห้องปิดอยู่วันนี้ (ซ่อม/ใช้งานไม่ได้) — ไม่นับเป็นห้องว่าง */
  closed?: RoomClosure;
};

export type RoomBoard = {
  units: UnitState[];
  byType: {
    typeId: string;
    typeName: string;
    total: number;
    /** ห้องที่มีแมวอยู่ (นับเป็นห้อง ไม่ใช่จำนวนตัว) */
    occupied: number;
    /** ห้องที่ปิดอยู่ (ซ่อม/ใช้งานไม่ได้) */
    closed: number;
    free: number;
    cats: number;
    units: UnitState[];
  }[];
  totalUnits: number;
  occupied: number;
  closed: number;
  free: number;
  /** จำนวนแมวที่พักอยู่ทั้งหมดในวันนั้น */
  cats: number;
  isFull: boolean;
  turnovers: UnitState[];
  /** จองเกินจำนวนห้องที่มี — ต้องเห็นทันที ไม่ใช่ปล่อยให้ห้องหาย */
  overflow: BoardBooking[];
};

const isLive = (b: BoardBooking) => b.status !== "cancelled" && b.status !== "no_show";

/**
 * ห้องนี้จุแมวได้กี่ตัว — ใช้ค่าที่ร้านตั้งไว้เท่านั้น ไม่ระบุ = 1
 * ไม่เดาจากข้อความโฆษณา เพราะแต่ละร้านเขียนคนละแบบ เดาต่ำไปจะรับลูกค้าได้น้อยกว่าที่ทำได้จริง
 */
export function roomCapacity(type: { maxCats?: number }): number {
  return type.maxCats && type.maxCats > 0 ? Math.floor(type.maxCats) : 1;
}

/**
 * ราคาห้องคิดเป็นรายห้อง: ราคาห้องรวมแมวได้ `base` ตัว ตัวที่เกินคิดเพิ่มตัวละ `extraPrice`
 * อ่านจากข้อความเดียวกับที่โชว์ลูกค้า เช่น cats "1–2 แมว" + extra "แมวที่ 3 +50"
 */
export function roomPricing(type: {
  maxCats?: number;
  cats?: { th?: string };
  extra?: { th?: string };
  /** ตั้งเป็นตัวเลขในหน้าตั้งค่าห้อง — มีแล้วใช้แทนการอ่านจากข้อความ extra */
  includedCats?: number;
  extraCatPrice?: number;
}) {
  const cap = roomCapacity(type);
  const extraTxt = type.extra?.th || "";
  const nth = /(\d+)/.exec(extraTxt.replace(/\+\s*\d+/g, ""));
  const plus = /\+\s*(\d+)/.exec(extraTxt);
  const nums = (type.cats?.th || "").match(/\d+/g);
  const base = nth ? Math.max(1, Number(nth[1]) - 1) : nums ? Math.max(...nums.map(Number)) : cap;
  const fromText = { base: Math.min(base, cap), extraPrice: plus ? Number(plus[1]) : 0 };
  if (type.includedCats == null && type.extraCatPrice == null) return { cap, ...fromText };
  return {
    cap,
    base: Math.max(1, type.includedCats ?? fromText.base),
    extraPrice: Math.max(0, type.extraCatPrice ?? fromText.extraPrice),
  };
}

/** ค่าห้องต่อคืนเมื่อมีแมว n ตัวอยู่ห้องเดียวกัน */
export function roomNightPrice(price: number, pricing: { base: number; extraPrice: number }, n: number) {
  return price + Math.max(0, n - pricing.base) * pricing.extraPrice;
}

/** นอนอยู่ในคืนของวันนี้ไหม (วันเช็คเอาท์ไม่นับ — เขาออกเช้าวันนั้น) */
export function isStayingOn(b: BoardBooking, date: string): boolean {
  const ci = b.checkin || "";
  const co = b.checkout || "";
  if (!ci) return false;
  return ci <= date && (co ? date < co : date === ci);
}

export function isLeavingOn(b: BoardBooking, date: string): boolean {
  return !!b.checkout && b.checkout === date;
}

/** บ้านเดียวกัน ช่วงวันเดียวกัน = นอนห้องเดียวกันได้ */
const householdKey = (b: BoardBooking) =>
  [b.customerId || b.customerName, b.checkin || "", b.checkout || ""].join("|");

/** วันถัดไป (YYYY-MM-DD) */
function nextDay(d: string) {
  const x = new Date(`${d}T12:00:00`);
  x.setDate(x.getDate() + 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(
    x.getDate()
  ).padStart(2, "0")}`;
}

/** ช่วงคืนที่ใช้ห้อง [เข้า, ออก) — ไม่มีวันออก = คืนเดียว */
function stayRange(b: BoardBooking): [string, string] {
  const ci = b.checkin || "";
  const co = b.checkout && b.checkout > ci ? b.checkout : nextDay(ci);
  return [ci, co];
}

const overlaps = (a: [string, string], b: [string, string]) => a[0] < b[1] && b[0] < a[1];

const typeMatches = (b: BoardBooking, type: { id: string; name: string }) => {
  const r = (b.room || "").trim();
  return r === type.id || r === type.name;
};

type Occupant = { range: [string, string]; hh: string; composite: boolean };

export type StayAssignment = {
  /** ห้องจริงที่นัดนี้ใช้ทั้งการเข้าพัก (ห้องเชื่อม = หลายห้อง ห้องแรกคือห้องหลัก) */
  units: { typeId: string; unit: number }[];
  /** ชื่อห้องเชื่อม ถ้าเป็นห้องเชื่อม */
  partOf?: string;
  /** id ห้องเชื่อม — ใช้ความจุของห้องเชื่อม (เช่น Cat Tower จุ 5) แทนห้องย่อยที่เป็นห้องหลัก */
  compositeId?: string;
};

const assignCache = new WeakMap<
  BoardBooking[],
  { key: string; result: { assign: Map<string, StayAssignment>; overflow: Set<string> } }
>();

/**
 * จัดห้องให้ "ทั้งการเข้าพัก" ไม่ใช่รายวัน — เข้าห้องไหนอยู่ห้องนั้นจนออก ไม่ย้ายแมวกลางคัน
 *
 * เมื่อก่อนจัดห้องใหม่ทุกวัน วันที่มีแมวออกจากห้อง #1 ระบบก็ขยับแมวที่ยังพักอยู่ไปห้องอื่น
 * ทั้งที่ความจริงน้องต้องอยู่ห้องเดิม ตอนนี้จัดครั้งเดียวต่อการเข้าพัก:
 * 1) ห้องที่ปักหมุดเลขไว้ได้ก่อนเสมอ
 * 2) ที่เหลือเรียงตามวันเข้า (มาก่อนได้ก่อน) แล้วหาห้องที่ว่าง "ตลอดทั้งช่วง"
 *    แมวบ้านเดียวกันช่วงเดียวกันนอนรวมห้องจนเต็มความจุ
 * 3) ไม่รู้ว่าลูกค้าจะมารับกี่โมง — เลี่ยงห้องที่มีบ้านอื่นออกวันเดียวกับที่เราเข้า (หรือเข้าวันที่เราออก)
 *    ให้ห้องที่ว่างจริงทั้งวันก่อน ห้องรับต่อวันเดียวกันใช้เป็นทางเลือกสุดท้ายเมื่อไม่มีห้องอื่นแล้ว
 */
export function assignStays(rooms: BoardRoomType[], bookings: BoardBooking[]) {
  const key = rooms
    .map((r) => `${r.id}:${r.count}:${r.maxCats || 1}:${(r.composedOf || []).map((c) => `${c.typeId}*${c.units}`).join("+")}:${(r.closures || []).map((c) => `${c.unit}@${c.from}-${c.to || ""}`).join("|")}`)
    .join(",");
  const cached = assignCache.get(bookings);
  if (cached && cached.key === key) return cached.result;

  const physical = rooms.filter((r) => (r.count || 0) > 0);
  const capOf = new Map(physical.map((r) => [r.id, Math.max(1, r.maxCats || 1)]));
  const occ = new Map<string, Occupant[]>(); // "typeId#unit" → ผู้ใช้ห้องตามช่วง
  const slot = (t: string, u: number) => `${t}#${u}`;
  const add = (t: string, u: number, o: Occupant) => {
    const k = slot(t, u);
    const list = occ.get(k);
    if (list) list.push(o);
    else occ.set(k, [o]);
  };
  // ห้องนี้รับบ้านนี้ได้ตลอดช่วงไหม (ว่าง หรือมีแต่บ้านเดียวกันและยังไม่เต็ม)
  const fits = (t: string, u: number, range: [string, string], hh: string, exclusive: boolean) => {
    const cap = capOf.get(t) || 1;
    let same = 0;
    for (const o of occ.get(slot(t, u)) || []) {
      if (!overlaps(o.range, range)) continue;
      if (exclusive || o.composite || o.hh !== hh) return false;
      same++;
    }
    return same < cap;
  };
  // ห้องนี้มีบ้านอื่นออกวันที่เราเข้า หรือเข้าวันที่เราออก — ต้องเคลียร์ห้องรับต่อวันเดียวกัน
  const tight = (t: string, u: number, range: [string, string], hh: string) =>
    (occ.get(slot(t, u)) || []).some(
      (o) => o.hh !== hh && o.hh !== "__closed__" && (o.range[1] === range[0] || o.range[0] === range[1])
    );

  const assign = new Map<string, StayAssignment>();
  const overflow = new Set<string>();
  const live: Piece[] = expandBySegments(
    bookings.filter((b) => b.service === "room" && isLive(b) && b.checkin)
  );

  // 0) ห้องที่ปิดอยู่ — กันไว้ก่อน ไม่ให้ระบบจัดแมวลงห้องนี้ในช่วงที่ปิด
  for (const t of physical) {
    for (const c of t.closures || []) {
      if (c.unit >= 1 && c.unit <= t.count) add(t.id, c.unit, { range: closureRange(c), hh: "__closed__", composite: true });
    }
  }

  // 1) ปักหมุด — ห้องเดี่ยวที่ระบุเลขห้องไว้
  const rest: Piece[] = [];
  for (const b of live) {
    const type = physical.find((t) => typeMatches(b, t));
    const u = b.roomUnit;
    if (type && u && u >= 1 && u <= type.count) {
      add(type.id, u, { range: stayRange(b), hh: householdKey(b), composite: false });
      assign.set(b.segKey, { units: [{ typeId: type.id, unit: u }] });
    } else rest.push(b);
  }

  // 2) ที่เหลือ — มาก่อนได้ก่อน (เรียงวันเข้า แล้ว id เพื่อให้ผลเหมือนเดิมทุกครั้ง)
  rest.sort((a, b) => (a.checkin || "").localeCompare(b.checkin || "") || a.segKey.localeCompare(b.segKey));
  for (const b of rest) {
    const range = stayRange(b);
    const hh = householdKey(b);
    const type = physical.find((t) => typeMatches(b, t));
    if (type) {
      // แมวบ้านเดียวกันที่จัดไปแล้ว อยู่ห้องไหน → ลองห้องนั้นก่อน
      let picked = 0;
      for (let u = 1; u <= type.count && !picked; u++) {
        const hasHousemate = (occ.get(slot(type.id, u)) || []).some(
          (o) => o.hh === hh && overlaps(o.range, range)
        );
        if (hasHousemate && fits(type.id, u, range, hh, false)) picked = u;
      }
      // ห้องว่างจริงทั้งวันก่อน แล้วค่อยห้องที่ต้องรับต่อวันเดียวกัน
      for (let u = 1; u <= type.count && !picked; u++) {
        if (fits(type.id, u, range, hh, false) && !tight(type.id, u, range, hh)) picked = u;
      }
      for (let u = 1; u <= type.count && !picked; u++) {
        if (fits(type.id, u, range, hh, false)) picked = u;
      }
      if (picked) {
        add(type.id, picked, { range, hh, composite: false });
        assign.set(b.segKey, { units: [{ typeId: type.id, unit: picked }] });
      } else overflow.add(b.segKey);
      continue;
    }

    const compType = rooms.find((t) => compositionOf(t.id, rooms) && typeMatches(b, t));
    const parts = compType ? compositionOf(compType.id, rooms) : undefined;
    if (!compType || !parts) continue;

    // ห้องเชื่อม — บ้านเดียวกันช่วงเดียวกันที่จองห้องเชื่อมนี้ไปแล้ว ใช้ชุดเดิม
    const mate = rest.find(
      (x) => x.segKey !== b.segKey && assign.has(x.segKey) && householdKey(x) === hh && typeMatches(x, compType)
    );
    if (mate) {
      assign.set(b.segKey, assign.get(mate.segKey)!);
      continue;
    }

    const claimed: { typeId: string; unit: number }[] = [];
    let ok = true;
    for (const part of parts) {
      const t = physical.find((x) => x.id === part.typeId);
      const free: number[] = [];
      for (let u = 1; u <= (t?.count || 0); u++) {
        if (
          !claimed.some((c) => c.typeId === part.typeId && c.unit === u) &&
          fits(part.typeId, u, range, hh, true)
        )
          free.push(u);
      }
      // ห้องเชื่อมต้องเป็นห้องติดกัน (เปิดทะลุถึงกันได้จริง) — ไม่มีชุดติดกันค่อยเอาที่ว่าง
      // ในแต่ละแบบ ห้องที่ไม่ต้องรับต่อวันเดียวกันได้ก่อน
      const isTight = (u: number) => tight(part.typeId, u, range, hh);
      const relaxed = free.filter((u) => !isTight(u)).concat(free.filter(isTight));
      let pick = relaxed.slice(0, part.units);
      if (part.units > 1) {
        let best: number[] | null = null;
        for (let i = 0; i + part.units - 1 < free.length; i++) {
          const w = free.slice(i, i + part.units);
          if (!w.every((u, j) => j === 0 || u === w[j - 1] + 1)) continue;
          if (!w.some(isTight)) {
            best = w;
            break;
          }
          best = best || w;
        }
        if (best) pick = best;
      }
      if (pick.length < part.units) {
        ok = false;
        break;
      }
      claimed.push(...pick.map((unit) => ({ typeId: part.typeId, unit })));
    }
    if (!ok) {
      overflow.add(b.segKey);
      continue;
    }
    for (const c of claimed) add(c.typeId, c.unit, { range, hh, composite: true });
    assign.set(b.segKey, { units: claimed, partOf: compType.name, compositeId: compType.id });
  }

  const result = { assign, overflow };
  assignCache.set(bookings, { key, result });
  return result;
}

/**
 * สร้างผังห้องของวันหนึ่ง — อ่านจากการจัดห้องทั้งการเข้าพัก (assignStays)
 * แมวจึงอยู่ห้องเดิมทุกวันตั้งแต่เข้าจนออก
 * @param rooms ประเภทห้อง + จำนวนยูนิต + ความจุ (จาก config)
 * @param bookings นัดทั้งหมด (กรอง service/ยกเลิก ให้เองข้างใน)
 */
export function buildRoomBoard(
  rooms: BoardRoomType[],
  bookings: BoardBooking[],
  date: string
): RoomBoard {
  const { assign, overflow: overflowIds } = assignStays(rooms, bookings);
  // ช่วงย่อยของนัดที่ย้ายห้อง — จัดห้องตามช่วง แต่ใส่ "นัดจริง" ลงผัง (กดเปิดแก้ไขได้ตามเดิม)
  const origOf = new Map(bookings.map((b) => [b.id, b]));
  const relevant = expandBySegments(
    bookings.filter((b) => b.service === "room" && isLive(b))
  ).filter((p) => isStayingOn(p, date) || isLeavingOn(p, date));

  const units: UnitState[] = [];
  const byType: RoomBoard["byType"] = [];
  const overflow: BoardBooking[] = [];

  const physical = rooms.filter((r) => (r.count || 0) > 0);
  const unitsByType = new Map<string, UnitState[]>();
  for (const type of physical) {
    const count = Math.max(0, type.count || 0);
    const capacity = Math.max(1, type.maxCats || 1);
    const baseCats = Math.min(capacity, Math.max(1, type.baseCats || capacity));
    const typeUnits: UnitState[] = Array.from({ length: count }, (_, i) => ({
      typeId: type.id,
      typeName: type.name,
      unit: i + 1,
      capacity,
      staying: [],
      leaving: [],
      arriving: false,
      turnover: false,
      overCapacity: false,
      baseCats,
      extraCats: 0,
      closed: closureOn(type.closures, i + 1, date),
    }));
    unitsByType.set(type.id, typeUnits);
    units.push(...typeUnits);
  }

  const sorted = [...relevant].sort((a, b) => a.segKey.localeCompare(b.segKey));
  for (const p of sorted) {
    const b = origOf.get(p.id) || p;
    const a = assign.get(p.segKey);
    if (!a || overflowIds.has(p.segKey)) {
      if (overflowIds.has(p.segKey) && !overflow.includes(b)) overflow.push(b);
      continue;
    }
    const leaving = isLeavingOn(p, date);
    const [first, ...others] = a.units;
    const host = unitsByType.get(first.typeId)?.[first.unit - 1];
    if (!host) continue;
    if (leaving) host.leaving.push(b);
    else {
      host.staying.push(b);
      if (p.checkin === date) host.arriving = true;
      // ห้องเชื่อม: ห้องที่เปิดทะลุถูกยึดไว้ด้วยตลอดการเข้าพัก
      if (a.partOf) {
        host.partOf = a.partOf;
        // แมวทั้งบ้านนอนห้องเชื่อม (เช่น Cat Tower = S+M) — เทียบกับความจุห้องเชื่อม ไม่ใช่ห้อง S ห้องเดียว
        const comp = rooms.find((r) => r.id === a.compositeId);
        if (comp) {
          host.capacity = Math.max(1, comp.maxCats || 1);
          host.baseCats = Math.min(host.capacity, Math.max(1, comp.baseCats || host.capacity));
        }
        for (const o of others) {
          const u = unitsByType.get(o.typeId)?.[o.unit - 1];
          if (u) u.partOf = a.partOf;
        }
      }
    }
  }

  for (const type of physical) {
    const typeUnits = unitsByType.get(type.id) || [];
    for (const s of typeUnits) {
      // ห้องย่อยของห้องเชื่อมที่มีคนออกวันนี้ก็ต้องรับต่อเหมือนกัน
      s.turnover = s.leaving.length > 0 && (s.staying.length > 0 || !!s.partOf);
      s.overCapacity = s.staying.length > s.capacity || s.leaving.length > s.capacity;
      s.extraCats = s.overCapacity ? 0 : Math.max(0, s.staying.length - s.baseCats);
    }
    // ห้องที่ถูกห้องเชื่อมยึดไว้ ถือว่าไม่ว่าง แม้แถวนั้นจะไม่มีชื่อแมว
    const occupied = typeUnits.filter((s) => s.staying.length > 0 || s.partOf).length;
    // ห้องปิดที่ยังมีแมวค้างอยู่ (ปักหมุดไว้ก่อนปิด) นับเป็นห้องที่ใช้อยู่ ไม่นับซ้ำ
    const closed = typeUnits.filter((s) => s.closed && !(s.staying.length > 0 || s.partOf)).length;
    byType.push({
      typeId: type.id,
      typeName: type.name,
      total: type.count || 0,
      occupied,
      closed,
      free: (type.count || 0) - occupied - closed,
      cats: typeUnits.reduce((n, s) => n + s.staying.length, 0),
      units: typeUnits,
    });
  }

  const totalUnits = units.length;
  const occupied = units.filter((s) => s.staying.length > 0 || s.partOf).length;
  const closed = units.filter((s) => s.closed && !(s.staying.length > 0 || s.partOf)).length;
  return {
    units,
    byType,
    totalUnits,
    occupied,
    closed,
    free: totalUnits - occupied - closed,
    cats: units.reduce((n, s) => n + s.staying.length, 0),
    isFull: totalUnits > 0 && occupied + closed >= totalUnits,
    turnovers: units.filter((s) => s.turnover),
    overflow,
  };
}

/**
 * ห้องประเภทนี้ว่างพอสำหรับช่วงวันที่ขอไหม — เช็คทุกคืนตั้งแต่เข้าถึงก่อนออก
 * คืนคืนที่แน่นที่สุดกลับไปด้วย จะได้บอกได้ว่าติดวันไหน
 */
export function typeAvailability(
  rooms: BoardRoomType[],
  bookings: BoardBooking[],
  typeId: string,
  checkin: string,
  checkout: string,
  ignoreBookingId?: string
): { free: number; total: number; tightestDate: string } {
  const type = rooms.find((r) => r.id === typeId);
  const parts = compositionOf(typeId, rooms);
  const pool = ignoreBookingId ? bookings.filter((b) => b.id !== ignoreBookingId) : bookings;

  // ห้องเชื่อมขายได้กี่ชุด = ห้องจริงที่ว่างหารด้วยจำนวนห้องที่ต้องใช้ (ส่วนประกอบที่ตึงที่สุด)
  const totalFor = (board: RoomBoard | null) => {
    if (!parts) return type?.count || 0;
    return Math.min(
      ...parts.map((p) => {
        const t = board
          ? board.byType.find((x) => x.typeId === p.typeId)
          : undefined;
        const avail = board
          ? t?.free ?? 0
          : rooms.find((r) => r.id === p.typeId)?.count || 0;
        return Math.floor(avail / p.units);
      })
    );
  };

  const total = totalFor(null);
  let free = total;
  let tightestDate = checkin;
  for (const d of nightsBetween(checkin, checkout)) {
    const board = buildRoomBoard(rooms, pool, d);
    const f = parts
      ? totalFor(board)
      : board.byType.find((x) => x.typeId === typeId)?.free ?? 0;
    if (f < free) {
      free = f;
      tightestDate = d;
    }
  }
  return { free, total, tightestDate };
}

/**
 * เลขห้องจริง (unit) ของประเภทนี้ที่ว่างตลอดทั้งช่วงที่ขอ — ไว้ให้พนักงานเลือกห้องตรงๆ
 * ตอนจอง (เฉพาะห้องเดี่ยว ไม่ใช่ห้องเชื่อม เพราะห้องเชื่อมไม่มีเลขห้องของตัวเอง)
 * เรียงห้องที่ว่างจริงทั้งวันก่อน ห้องที่ต้องรับต่อวันเดียวกัน (turnoverUnitsForRange) ไว้ท้าย
 */
export function freeUnitsForRange(
  rooms: BoardRoomType[],
  bookings: BoardBooking[],
  typeId: string,
  checkin: string,
  checkout: string,
  ignoreBookingId?: string
): number[] {
  const type = rooms.find((r) => r.id === typeId);
  if (!type || compositionOf(typeId, rooms)) return [];
  const pool = ignoreBookingId ? bookings.filter((b) => b.id !== ignoreBookingId) : bookings;
  const nights = nightsBetween(checkin, checkout);
  if (nights.length === 0)
    return Array.from({ length: type.count || 0 }, (_, i) => i + 1).filter((u) => !closureOn(type.closures, u, checkin));

  let free: number[] | null = null;
  for (const d of nights) {
    const board = buildRoomBoard(rooms, pool, d);
    const freeToday = new Set(
      board.units
        .filter((u) => u.typeId === typeId && u.staying.length === 0 && !u.partOf && !u.closed)
        .map((u) => u.unit)
    );
    free = free ? free.filter((u) => freeToday.has(u)) : [...freeToday];
  }
  const turn = new Set(turnoverUnitsForRange(rooms, pool, typeId, checkin, checkout));
  return (free || []).sort((a, b) => Number(turn.has(a)) - Number(turn.has(b)) || a - b);
}

/**
 * เลขห้องของประเภทนี้ที่มีบ้านอื่นออกวันที่เราเข้า หรือเข้าวันที่เราออก (ต้องรับต่อวันเดียวกัน)
 * ไม่รู้ว่าลูกค้าจะมารับกี่โมง — ห้องพวกนี้ใช้ได้ แต่ควรเป็นทางเลือกสุดท้าย
 */
export function turnoverUnitsForRange(
  rooms: BoardRoomType[],
  bookings: BoardBooking[],
  typeId: string,
  checkin: string,
  checkout: string,
  ignoreBookingId?: string
): number[] {
  if (!checkin) return [];
  const pool = ignoreBookingId ? bookings.filter((b) => b.id !== ignoreBookingId) : bookings;
  const { assign } = assignStays(rooms, pool);
  const out = checkout && checkout > checkin ? checkout : nextDay(checkin);
  const units = new Set<number>();
  for (const p of expandBySegments(pool.filter((b) => b.service === "room" && isLive(b) && b.checkin))) {
    const [ci, co] = stayRange(p);
    if (co !== checkin && ci !== out) continue;
    for (const u of assign.get(p.segKey)?.units || []) if (u.typeId === typeId) units.add(u.unit);
  }
  return [...units].sort((a, b) => a - b);
}

/** คืนที่ต้องใช้ห้องจริง — วันเช็คเอาท์ไม่นับ (พัก 27→29 = ใช้ห้องคืน 27 กับ 28) */
export function nightsBetween(checkin: string, checkout: string): string[] {
  if (!checkin) return [];
  if (!checkout || checkout <= checkin) return [checkin];
  const out: string[] = [];
  const d = new Date(`${checkin}T12:00:00`);
  const end = new Date(`${checkout}T12:00:00`);
  while (d < end) {
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`
    );
    d.setDate(d.getDate() + 1);
  }
  return out;
}
