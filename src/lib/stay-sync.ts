/**
 * เลื่อนวัน / ต่อคืน ของนัด "ทั้งบ้าน" ในครั้งเดียว + ปรับบิลให้ตรงกับจำนวนคืนจริง
 *
 * หลักคิด: 1 การเข้าพัก = บิลหลักใบเดียว
 * - บิลยังไม่ปิด → แก้จำนวนคืนในบิลเดิม (ยอดรวมคำนวณใหม่ ส่วนลดเดิมยังอยู่)
 * - บิลปิดจ่ายไปแล้ว แล้วลูกค้าอยู่ต่อ → ออก "บิลส่วนต่อคืน" เฉพาะคืนที่เพิ่ม ผูกกับนัดเดิม
 *   (บิลที่ปิดแล้วแก้ยอดไม่ได้ เพราะรายรับ/แต้ม/ประวัติบริการลงไปแล้ว)
 * - ไม่คิดเงินซ้ำ: นับคืนที่อยู่ในบิลที่ปิดแล้วก่อน บิลค้างหรือบิลใหม่จะคิดเฉพาะคืนที่ยังไม่ได้เก็บ
 */
import {
  getBooking,
  listBookingsByCustomerName,
  updateBooking,
  type StoredBooking,
} from "./bookings-store";
import { bookingGroupKey } from "./booking-group";
import {
  createInvoice,
  listInvoicesForBookings,
  updateInvoice,
  type InvoiceItem,
  type InvoiceRecord,
} from "./invoices-store";

export type DatePatch = {
  date?: string;
  time?: string;
  checkin?: string;
  checkout?: string;
};

export type InvoiceSyncResult =
  | { kind: "none" }
  | { kind: "updated"; invoiceId: string; nights: number; total: number }
  | { kind: "created_extra"; invoiceId: string; nights: number; total: number }
  | { kind: "warn"; message: string };

const DAY = 86_400_000;

export function nightsBetween(checkin?: string, checkout?: string): number {
  if (!checkin || !checkout) return 0;
  const a = Date.parse(`${checkin.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${checkout.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / DAY));
}

/** น้องตัวอื่นในบ้านที่มา "นัดเดียวกัน" (ลูกค้าเดียวกัน บริการเดียวกัน วันเวลาเดียวกันทุกช่อง) */
export async function findGroupSiblings(b: StoredBooking): Promise<StoredBooking[]> {
  const key = bookingGroupKey(b);
  const all = await listBookingsByCustomerName(b.customerName);
  return all.filter(
    (x) => x.id !== b.id && x.status !== "cancelled" && bookingGroupKey(x) === key
  );
}

/** จำนวนคืนที่บิลนี้คิดไว้ — บิลบ้านหลายตัวมีบรรทัดห้องต่อตัว ใช้บรรทัดที่คืนมากสุด */
function billedNights(inv: InvoiceRecord): number {
  return (inv.items || [])
    .filter((it) => it.kind === "room")
    .reduce((m, it) => Math.max(m, Math.round(Number(it.qty) || 1)), 0);
}

/** เปลี่ยนจำนวนคืนของบรรทัดห้องพัก — ราคาต่อคืนเดิม แก้ "× N คืน" ในชื่อรายการให้ตรง */
function withNights(items: InvoiceItem[], nights: number, note?: string): InvoiceItem[] {
  return items.map((it) => {
    if (it.kind !== "room") return it;
    const qty = Math.max(1, Math.round(Number(it.qty) || 1));
    const unit = Math.round(Number(it.unitAmount ?? it.amount / qty) || 0);
    const base = it.label.replace(/\s*×\s*\d+\s*คืน.*$/, "");
    return {
      ...it,
      qty: nights,
      unitAmount: unit,
      amount: unit * nights,
      label: `${base} × ${nights} คืน${note ? ` ${note}` : ""}`,
    };
  });
}

/** ปรับบิลของนัดนี้ให้ตรงกับจำนวนคืนจริงหลังเลื่อนวัน/ต่อคืน */
export async function syncStayInvoice(
  bookingIds: string[],
  checkin: string,
  checkout: string
): Promise<InvoiceSyncResult> {
  const nights = nightsBetween(checkin, checkout);
  if (nights <= 0) return { kind: "none" };

  const invoices = (await listInvoicesForBookings(bookingIds)).filter(
    (inv) => billedNights(inv) > 0
  );
  if (invoices.length === 0) return { kind: "none" }; // ยังไม่ออกบิล — ออกทีหลังจะดึงคืนใหม่เอง

  const paid = invoices.filter((i) => i.status === "paid");
  const pending = invoices.filter((i) => i.status !== "paid");
  const paidNights = paid.reduce((s, i) => s + billedNights(i), 0);
  const stillDue = nights - paidNights;

  if (pending.length > 1) {
    return {
      kind: "warn",
      message: `นัดนี้มีบิลค้าง ${pending.length} ใบ ระบบไม่แก้ให้อัตโนมัติ — เช็กแล้วรวมให้เหลือใบเดียวก่อน`,
    };
  }

  const open = pending[0];
  if (open) {
    if (open.packageId) {
      return {
        kind: "warn",
        message: "บิลนี้ใช้คอร์สหักคืน — แก้จำนวนคืนในบิลเองนะ (ระบบไม่เปลี่ยนการหักคอร์สให้)",
      };
    }
    if (stillDue <= 0) {
      return {
        kind: "warn",
        message: `บิลที่ปิดแล้วคิดไปครบ ${paidNights} คืนแล้ว แต่ยังมีบิลค้างอีกใบ — เช็กว่าควรลบบิลค้างไหม`,
      };
    }
    if (billedNights(open) === stillDue) return { kind: "none" };
    const res = await updateInvoice(open.id, {
      items: withNights(open.items, stillDue, paid.length ? "(ต่อคืน)" : undefined),
    });
    if (!res.ok) return { kind: "warn", message: "แก้บิลไม่สำเร็จ" };
    return { kind: "updated", invoiceId: open.id, nights: stillDue, total: res.invoice.total };
  }

  // บิลปิดหมดแล้ว
  if (stillDue < 0) {
    return {
      kind: "warn",
      message: `บิลที่ปิดแล้วคิดไป ${paidNights} คืน แต่พักจริง ${nights} คืน — เก็บเกิน ${-stillDue} คืน ต้องคืนเงิน/ทำเครดิตให้ลูกค้าเอง`,
    };
  }
  if (stillDue === 0) return { kind: "none" };

  // ลูกค้าอยู่ต่อหลังปิดบิลแล้ว → ออกบิลเฉพาะคืนที่เพิ่ม ราคาต่อคืนตามบิลล่าสุด
  const last = paid[paid.length - 1];
  const roomItems = last.items.filter((it) => it.kind === "room");
  const created = await createInvoice({
    customerId: last.customerId,
    lineUserId: last.lineUserId,
    customerName: last.customerName,
    catName: last.catName,
    items: withNights(roomItems, stillDue, "(ต่อคืน)"),
    bookingId: last.bookingId,
  });
  return { kind: "created_extra", invoiceId: created.id, nights: stillDue, total: created.total };
}

/**
 * เลื่อนวัน/ต่อคืนให้ทุกตัวในบ้านที่มานัดเดียวกัน แล้วปรับบิลครั้งเดียว
 * (เมื่อก่อนหน้าเว็บยิงแก้ทีละตัว — ถ้าตัวไหนพลาดวันจะไม่ตรงกัน และหน้าลูกค้าไม่มีให้เลือกทั้งบ้านเลย)
 */
export async function rescheduleGroup(
  bookingId: string,
  patch: DatePatch,
  applyToGroup: boolean
) {
  const host = await getBooking(bookingId);
  if (!host) return { ok: false as const, error: "not_found" };

  // หาน้องในบ้านจากข้อมูล "ก่อนแก้" — แก้แล้วกุญแจกลุ่มจะเปลี่ยน หาไม่เจอ
  const siblings = applyToGroup ? await findGroupSiblings(host) : [];
  const ids = [host.id, ...siblings.map((s) => s.id)];

  const updated: StoredBooking[] = [];
  for (const id of ids) {
    const u = await updateBooking(id, patch);
    if (u) updated.push(u);
  }

  let invoice: InvoiceSyncResult = { kind: "none" };
  const h = updated[0];
  if (h && h.service === "room" && h.checkin && h.checkout) {
    invoice = await syncStayInvoice(ids, h.checkin, h.checkout);
  }
  return { ok: true as const, updated, invoice, movedCount: updated.length };
}
