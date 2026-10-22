import { getInvoice } from "./invoices-store";
import { getCustomer } from "./customers-store";
import { getSiteConfig } from "./config-store";
import { getInvoiceDoc, lastBuyerForCustomer, type DocBuyer, type InvoiceDoc } from "./invoice-docs-store";
import type { CustomerTaxInvoice } from "./tax-invoice";

/** ข้อมูลออกบิลที่ลูกค้ากรอกไว้ → ผู้ซื้อบนเอกสาร */
export function taxInvoiceBuyer(t: CustomerTaxInvoice | undefined): DocBuyer | undefined {
  if (!t?.name) return undefined;
  return {
    name: t.name,
    ...(t.taxId ? { taxId: t.taxId } : {}),
    ...(t.kind !== "person" && t.branch ? { branch: t.branch } : {}),
    ...(t.address ? { address: t.address } : {}),
    ...(t.phone ? { phone: t.phone } : {}),
  };
}

/**
 * ผู้ซื้อที่ควรเติมให้อัตโนมัติจากข้อมูลออกบิลของลูกค้า — เฉพาะบิลที่ยังไม่ได้ตั้งผู้ซื้อ
 * ยังไม่ออกเลขที่ใด ๆ (เอกสารที่ออกไปแล้วต้องคงเดิม) และร้านไม่ได้กด "ใช้ชื่อลูกค้า" ไว้
 */
export function autoBuyerFor(
  doc: InvoiceDoc | undefined,
  taxInvoice: CustomerTaxInvoice | undefined
): DocBuyer | undefined {
  if (doc?.buyer || doc?.buyerPersonal) return undefined;
  if (doc?.quoteNo || doc?.invoiceNo || doc?.receiptNo) return undefined;
  return taxInvoiceBuyer(taxInvoice);
}

/** ข้อมูลครบสำหรับแสดงเอกสาร: บิล + ผู้ขาย + ผู้ซื้อ + เลขที่ (ใช้ทั้งหลังบ้านและลิงก์ลูกค้า) */
export async function buildDocPayload(invoiceId: string, opts: { forCustomer?: boolean } = {}) {
  const invoice = invoiceId ? await getInvoice(invoiceId) : undefined;
  if (!invoice || invoice.deletedAt) return undefined;
  const [doc, customer, config] = await Promise.all([
    getInvoiceDoc(invoiceId),
    invoice.customerId ? getCustomer(invoice.customerId) : Promise.resolve(undefined),
    getSiteConfig(),
  ]);
  const autoBuyer = autoBuyerFor(doc, customer?.taxInvoice);
  const suggestedBuyer =
    doc?.buyer || autoBuyer || opts.forCustomer
      ? undefined
      : taxInvoiceBuyer(customer?.taxInvoice) || (await lastBuyerForCustomer(invoice.customerId));
  // ยังไม่ได้ตั้งผู้ซื้อ แต่ลูกค้ากรอกข้อมูลออกบิลไว้ → ใช้เลย (บันทึกติดเอกสารตอนออกเลขที่)
  const effectiveDoc: InvoiceDoc = autoBuyer ? { ...(doc || { invoiceId }), buyer: autoBuyer } : doc || { invoiceId };
  const b = config.business;
  return {
    // ลิงก์ลูกค้า: ส่งเฉพาะช่องที่โชว์บนเอกสาร ไม่ส่ง LINE id / ข้อมูลภายในอื่น ๆ
    invoice: opts.forCustomer
      ? {
          id: invoice.id,
          customerId: "",
          customerName: invoice.customerName,
          catName: invoice.catName,
          items: invoice.items,
          subtotal: invoice.subtotal,
          discount: invoice.discount,
          deposit: invoice.deposit,
          promoLabel: invoice.promoLabel,
          total: invoice.total,
          status: invoice.status,
          paymentMethod: invoice.paymentMethod,
          paidAt: invoice.paidAt,
          createdAt: invoice.createdAt,
        }
      : invoice,
    doc: opts.forCustomer ? { ...effectiveDoc, customerId: undefined, buyerPersonal: undefined } : effectiveDoc,
    /** ผู้ซื้อมาจากข้อมูลออกบิลที่ลูกค้ากรอกไว้ (ยังไม่ได้บันทึกติดบิล) */
    buyerFromCustomer: !!autoBuyer,
    suggestedBuyer,
    customer: customer
      ? { name: customer.name, phone: customer.phone || "", address: customer.address || "" }
      : { name: invoice.customerName, phone: "", address: "" },
    seller: {
      name: b.legalName || b.name,
      shopName: b.name,
      address: b.location?.th || "",
      phone: b.phones?.filter(Boolean)[0] || "",
      taxId: b.taxId || "",
      branch: b.taxBranch || "",
      vatRegistered: !!b.vatRegistered,
      vatRate: b.vatRate ?? 7,
    },
    payment: config.payment,
    /** ลูกค้าผูก LINE แล้วหรือยัง — ไว้เปิด/ปิดปุ่มส่งทาง LINE */
    hasLine: !opts.forCustomer && !!(invoice.lineUserId || customer?.lineUserId),
  };
}
