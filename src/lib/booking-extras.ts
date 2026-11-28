import { bookingGroupKey, stayForGroom, type GroupableBooking } from "./booking-group";
import { shortItemLabel } from "./invoice-item-label";
import { isRoomLine } from "./stay-line";
import { isTransportLabel } from "./transport";

/**
 * "งานเพิ่ม" ของน้องแต่ละตัว ที่อ่านจากรายการในบิล — เช่น ฝากพักแล้วมีบรรทัด
 * "บริการไถขนก้น+เท้า" หรือ "อาบน้ำ Catcha Premium" ในบิลเดียวกัน
 *
 * ร้านออกบิลแล้วใส่บริการเพิ่ม แต่ Telegram / หน้าวันนี้ / ปฏิทิน / ผังห้อง ไม่เคยบอก
 * พนักงานเลยไม่รู้ว่าน้องตัวนี้ต้องทำอะไรเพิ่ม ไฟล์นี้ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และหน้าเว็บ (ไม่มี import ฝั่งเซิร์ฟเวอร์)
 *
 * ไม่นับ: ค่าห้อง (รวมค่าแมวเพิ่ม), ค่ารับ-ส่ง (มีบอกแยกอยู่แล้ว), ขายคอร์ส/เติมเครดิต, สินค้าหน้าร้าน
 */

export type ExtraItemLike = {
  label: string;
  kind?: string;
  qty?: number;
  catName?: string;
};

export type ExtraInvoiceLike = {
  bookingId?: string;
  items?: ExtraItemLike[];
  deletedAt?: string;
};

export type BookingExtra = {
  /** ชื่อรายการแบบสั้น เช่น "บริการไถขนก้น+เท้า" / "อาบน้ำ Catcha Premium" */
  text: string;
  /** น้องที่รายการนี้ระบุไว้ในบิล (ว่าง = ทั้งบิล/ไม่ระบุตัว) */
  cats: string[];
  /** เป็นรายการอาบน้ำ (โปรแกรมอาบน้ำ) — การ์ดอาบน้ำโชว์โปรแกรมอยู่แล้ว ข้ามได้ */
  grooming: boolean;
};

type Bk = GroupableBooking & { id: string };

/** บิลอาบน้ำของบ้านเดียวกันวันเดียวกันออกใบเดียวแม้คนละรอบเวลา (petflow groomByDay) */
const GK = { groomByDay: true };

const live = (b: { status?: string }) => b.status !== "cancelled" && b.status !== "no_show";

/** รายการในบิลที่นับเป็น "งานเพิ่ม" ไหม */
export function isExtraLine(it: ExtraItemLike): boolean {
  if (!it || !it.label) return false;
  if (it.kind === "package" || it.kind === "product") return false;
  if (isRoomLine(it)) return false;
  if (isTransportLabel(it.label)) return false;
  return true;
}

function extraText(it: ExtraItemLike): string {
  let t = shortItemLabel(it.label);
  if (!t) return "";
  if (it.kind === "grooming" && !/อาบ/.test(t)) t = `อาบน้ำ ${t}`;
  if (it.kind === "freebie") t = `${t} (แถม)`;
  const qty = Math.round(it.qty || 1);
  if (qty > 1) t = `${t} ×${qty}`;
  return t;
}

const nameKey = (n: string) => n.normalize("NFC").replace(/[​-‍﻿\s]/g, "").toLowerCase();

/**
 * นัดทั้งหมดที่อาจถือบิลของแถวเหล่านี้ — บิลบ้านผูก bookingId ไว้ตัวเดียว
 * และอาบน้ำก่อนกลับออกบิลรวมกับค่าห้อง จึงต้องรวมทั้งบ้าน + นัดเข้าพัก/อาบที่ผูกกันด้วย
 */
export function relatedBookingIds<T extends Bk>(rows: T[], all: T[]): Set<string> {
  const pool = all.filter(live);
  const ids = new Set(rows.map((r) => r.id));
  const keys = new Set(rows.map((r) => bookingGroupKey(r, GK)));
  for (const r of rows) {
    const host = stayForGroom(r, pool);
    if (host) keys.add(bookingGroupKey(host, GK));
  }
  for (const b of pool) if (keys.has(bookingGroupKey(b, GK))) ids.add(b.id);
  // อาบน้ำก่อนกลับของนัดเข้าพักเหล่านี้
  for (const b of pool) {
    const host = stayForGroom(b, pool);
    if (host && ids.has(host.id)) ids.add(b.id);
  }
  return ids;
}

/**
 * งานเพิ่มของกลุ่มนัด (1 บ้าน 1 นัด) จากบิลทั้งหมดที่ผูกกับนัดในบ้านนั้น
 * ชื่อซ้ำกันรวมเป็นรายการเดียว (บิลพักต่อ/บิลแก้ซ้ำ)
 */
export function bookingExtras<T extends Bk>(
  rows: T[],
  all: T[],
  invoices: ExtraInvoiceLike[]
): BookingExtra[] {
  if (!rows.length || !invoices.length) return [];
  const ids = relatedBookingIds(rows, all);
  const out: BookingExtra[] = [];
  for (const inv of invoices) {
    if (inv.deletedAt || !inv.bookingId || !ids.has(inv.bookingId)) continue;
    for (const it of inv.items || []) {
      if (!isExtraLine(it)) continue;
      const text = extraText(it);
      if (!text) continue;
      const cats = (it.catName || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const same = out.find((x) => x.text === text && x.cats.join(",") === cats.join(","));
      if (!same) out.push({ text, cats, grooming: it.kind === "grooming" });
    }
  }
  return out;
}

/** งานเพิ่มเฉพาะน้องตัวนี้ (รวมรายการที่ไม่ได้ระบุตัวไว้ในบิล) */
export function extrasForCat(extras: BookingExtra[], catName: string): BookingExtra[] {
  const k = nameKey(catName || "");
  return extras.filter((x) => !x.cats.length || x.cats.some((c) => nameKey(c) === k));
}

/** ข้อความสั้นสำหรับ Telegram / ป้าย เช่น "บริการไถขนก้น+เท้า, อาบน้ำ Catcha Premium" */
export function extrasText(
  extras: BookingExtra[],
  opts?: { withCats?: boolean; skipGrooming?: boolean }
): string {
  return extras
    .filter((x) => !(opts?.skipGrooming && x.grooming))
    .map((x) => (opts?.withCats && x.cats.length ? `${x.cats.join(", ")}: ${x.text}` : x.text))
    .join(", ");
}
