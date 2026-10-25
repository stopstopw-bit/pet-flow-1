/**
 * 🔁 ยกเลิกนัด เก็บยอดเป็นเครดิต — กดครั้งเดียวจบ
 *
 * ลูกค้าจ่ายบิลไปแล้วแต่มาไม่ได้ → ไม่คืนเงินสด แต่เก็บยอดไว้เป็นเครดิต Member ใช้ครั้งหน้า
 * เมื่อก่อนพนักงานต้องทำ 3 ขั้น (ยกเลิกนัด → ไปหน้าลูกค้า → เติมเครดิตเองแล้วเลือกประเภท)
 * ลืมเลือกประเภทหรือกรอกยอดผิดได้ และถ้าเติมแบบปกติ รายรับ + แต้มจะเบิ้ลจากเงินก้อนเดียว
 *
 * เงินก้อนเดียวไหลแบบนี้:
 *   จ่ายบิล 5,000        → รายได้ +5,000 · แต้ม +50 · เครดิต 0
 *   ยกเลิกนัด → 🔁        → รายได้ไม่เพิ่ม · แต้มไม่เพิ่ม · เครดิต +5,000
 *   ใช้เครดิตจ่ายบิลใหม่   → รายได้ไม่เพิ่ม · แต้มไม่เพิ่ม · เครดิต −5,000
 *
 * บิลเดิมคงสถานะ "จ่ายแล้ว" ไว้ (รายรับเดือนนั้นยังถูกต้อง) — "ยกเลิกการชำระ" ใช้เฉพาะคืนเงินสดจริง
 *
 * บิลที่ยังไม่ปิดแต่รับมัดจำ/จ่ายบางส่วนมาแล้ว ก็โยกได้ — เก็บเป็นเครดิตเท่ายอดที่รับมาจริง
 * แล้วบิลนั้นห้ามรับเงินเพิ่มอีก (กันเก็บเงินซ้ำจากนัดที่ยกเลิกไปแล้ว)
 */
import {
  cancelBooking,
  getBooking,
  type StoredBooking,
} from "./bookings-store";
import { bookingCalendarPayload, deleteCalendarEvent, updateCalendarEvent } from "./calendar";
import { findCancelCreditTopup, getCustomer, topupMemberCredit } from "./customers-store";
import { getInvoice, listInvoicesForBookings, type InvoiceRecord } from "./invoices-store";
import { findGroupSiblings } from "./stay-sync";

export type CancelToCreditResult =
  | {
      ok: true;
      amount: number;
      balance: number;
      cancelledCats: string[];
      customerName: string;
      lineUserId?: string;
    }
  | { ok: false; error: string };

/** ยอดที่ลูกค้าจ่ายมาแล้วจริงของบิลนี้ = ยอดที่โยกเป็นเครดิตได้ */
export function creditableAmount(
  inv: Pick<InvoiceRecord, "status" | "total" | "deposit" | "depositReceivedAt">
): number {
  if (inv.status === "paid") return Math.round(inv.total || 0);
  return inv.depositReceivedAt ? Math.round(inv.deposit || 0) : 0;
}

/** กันกดซ้ำพร้อมกัน (ดับเบิลคลิก / สองเครื่อง) ระหว่างที่กำลังเติมเครดิต */
const convertingNow = new Set<string>();

async function cancelOne(b: StoredBooking) {
  if (b.status === "cancelled") return false;
  const updated = await cancelBooking(b.id);
  if (!updated) return false;
  if (b.calendarEventId) {
    const del = await deleteCalendarEvent(b.calendarEventId);
    if (!del.ok) {
      await updateCalendarEvent(b.calendarEventId, bookingCalendarPayload(b), {
        cancelled: true,
      });
    }
  }
  return true;
}

export async function cancelAppointmentToCredit(
  invoiceId: string
): Promise<CancelToCreditResult> {
  if (convertingNow.has(invoiceId)) return { ok: false, error: "busy" };
  convertingNow.add(invoiceId);
  try {
    const inv = await getInvoice(invoiceId);
    if (!inv) return { ok: false, error: "ไม่พบบิล" };
    if (!inv.customerId) return { ok: false, error: "บิลนี้ไม่ได้ผูกลูกค้า — เติมเครดิตให้ไม่ได้" };
    if (await findCancelCreditTopup(inv.id)) {
      return { ok: false, error: "บิลนี้เก็บเป็นเครดิตไปแล้ว" };
    }
    const amount = creditableAmount(inv);
    if (amount <= 0) {
      return { ok: false, error: "บิลนี้ยังไม่ได้รับเงินเลย — ยกเลิกนัดตามปกติได้เลย ไม่ต้องเก็บเป็นเครดิต" };
    }

    // เติมเครดิตก่อน (เรื่องเงินสำคัญสุด) แล้วค่อยยกเลิกนัด
    const result = await topupMemberCredit(inv.customerId, {
      paidAmount: amount,
      isCancelCredit: true,
      sourceInvoiceId: inv.id,
      note: `ยกเลิกนัด · บิล ${inv.id}`,
    });
    if (!result) return { ok: false, error: "เติมเครดิตไม่สำเร็จ" };

    // ยกเลิกนัดของบิลนี้ + น้องตัวอื่นในบ้านที่มานัดเดียวกัน (บ้านหลายตัวออกบิลใบเดียว)
    // ยกเว้นตัวที่มีบิลแยกของตัวเอง — ยอดตัวนั้นไม่ได้อยู่ในเครดิตที่เพิ่งเติม
    const cancelledCats: string[] = [];
    const booking = inv.bookingId ? await getBooking(inv.bookingId) : undefined;
    if (booking) {
      const siblings = await findGroupSiblings(booking);
      const ownBilled = new Set(
        (await listInvoicesForBookings(siblings.map((x) => x.id)))
          .filter((i) => i.id !== inv.id)
          .map((i) => i.bookingId)
      );
      for (const b of [booking, ...siblings.filter((x) => !ownBilled.has(x.id))]) {
        if (await cancelOne(b)) cancelledCats.push(b.catName);
      }
    }

    const customer = (await getCustomer(inv.customerId)) || result.customer;
    return {
      ok: true,
      amount,
      balance: customer.memberCredit,
      cancelledCats,
      customerName: customer.name,
      lineUserId: customer.lineUserId,
    };
  } finally {
    convertingNow.delete(invoiceId);
  }
}
