import { listInvoices, type InvoiceItem, type InvoiceRecord } from "./invoices-store";
import { listSalesByCustomer, type PosMethod } from "./pos-store";
import { listBookingOps } from "./booking-ops-store";

/**
 * ข้อมูลเสริมของ "ประวัติใช้บริการ" ในหน้าลูกค้า (หลังบ้าน)
 *
 * ประวัติเดิมมีแค่ service record (ข้อความรวมรายการบิล) กับนัดที่ผ่านมา
 * ตรงนี้เติมสิ่งที่ยังขาด โดยดึงจากข้อมูลที่มีอยู่แล้ว ไม่ต้องสร้างตารางใหม่:
 *  - รายการในบิลแยกบรรทัด (ประเภท/ราคา/วิธีจ่าย) ไว้กดดูรายละเอียด + นับสรุป
 *  - บิลขายหน้าร้าน (POS) ที่ผูกลูกค้าไว้
 *  - ช่างที่อาบน้ำให้ในแต่ละนัด (booking_ops.groomer)
 */
export type ServiceLogBill = {
  id: string;
  date: string;
  items: Pick<InvoiceItem, "label" | "amount" | "kind" | "qty" | "unitAmount" | "catName">[];
  total: number;
  paymentMethod?: InvoiceRecord["paymentMethod"];
  bookingId?: string;
};

export type ServiceLogPosSale = {
  id: string;
  no: string;
  date: string;
  items: { name: string; price: number; qty: number }[];
  total: number;
  method: PosMethod;
};

export type CustomerServiceLog = {
  bills: ServiceLogBill[];
  posSales: ServiceLogPosSale[];
  /** bookingId → ชื่อช่าง */
  groomers: Record<string, string>;
};

export async function customerServiceLog(
  customerId: string,
  bookingIds: string[]
): Promise<CustomerServiceLog> {
  const [invoices, sales, ops] = await Promise.all([
    listInvoices(customerId).catch(() => [] as InvoiceRecord[]),
    listSalesByCustomer(customerId).catch(() => []),
    listBookingOps(bookingIds).catch(() => []),
  ]);

  const bills = invoices
    .filter((i) => i.status === "paid" && !i.deletedAt)
    .map((i) => ({
      id: i.id,
      date: (i.paidAt || i.createdAt).slice(0, 10),
      items: i.items.map((it) => ({
        label: it.label,
        amount: it.amount,
        kind: it.kind,
        qty: it.qty,
        unitAmount: it.unitAmount,
        catName: it.catName,
      })),
      total: i.total,
      paymentMethod: i.paymentMethod,
      bookingId: i.bookingId,
    }));

  const posSales = sales.map((s) => ({
    id: s.id,
    no: s.no,
    date: s.date,
    items: s.items.map((it) => ({ name: it.name, price: it.price, qty: it.qty })),
    total: s.total,
    method: s.method,
  }));

  const groomers: Record<string, string> = {};
  for (const o of ops) if (o.groomer) groomers[o.bookingId] = o.groomer;

  return { bills, posSales, groomers };
}
