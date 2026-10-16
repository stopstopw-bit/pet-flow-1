"use client";

import { useEffect, useRef, useState } from "react";
import { bahtText } from "@/lib/baht-text";
import { exportDocPdf } from "@/lib/doc-pdf";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Toast";

/**
 * ตัวเอกสาร A4 (ใบเสนอราคา / ใบแจ้งหนี้ / ใบเสร็จ-ใบกำกับภาษี)
 * ใช้ร่วมกันระหว่างหน้าหลังบ้าน (/admin/billing/doc/[id]) กับลิงก์ที่ส่งให้ลูกค้าทาง LINE (/doc/[id])
 */

export type Kind = "quote" | "invoice" | "receipt";

export type Item = { label: string; amount: number; qty?: number; unitAmount?: number; catName?: string };
export type Invoice = {
  id: string;
  customerId: string;
  customerName: string;
  catName: string;
  items: Item[];
  subtotal: number;
  discount: number;
  deposit: number;
  promoLabel?: string;
  total: number;
  status: "pending" | "paid";
  paymentMethod?: "transfer" | "member_credit" | "cash";
  paidAt?: string;
  createdAt: string;
};
export type Buyer = { name: string; taxId?: string; branch?: string; address?: string; phone?: string };
export type Doc = {
  invoiceId: string;
  buyer?: Buyer;
  quoteNo?: string;
  quoteAt?: string;
  invoiceNo?: string;
  invoiceAt?: string;
  receiptNo?: string;
  receiptAt?: string;
  note?: string;
};
export type Data = {
  invoice: Invoice;
  doc: Doc;
  suggestedBuyer?: Buyer;
  customer: { name: string; phone: string; address: string };
  seller: {
    name: string;
    shopName: string;
    address: string;
    phone: string;
    taxId: string;
    branch: string;
    vatRegistered: boolean;
    vatRate: number;
  };
  payment: { bankName: string; accountNumber: string; accountName: string };
  /** ลูกค้าผูก LINE แล้ว (เฉพาะหลังบ้าน) */
  hasLine?: boolean;
};

export const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dmy = (iso?: string) => {
  if (!iso) return "-";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00+07:00` : iso);
  return d.toLocaleDateString("en-GB", { timeZone: "Asia/Bangkok" });
};
export const addDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * 86400000).toISOString();

export function docTitle(kind: Kind, vat: boolean) {
  if (kind === "quote") return { th: "ใบเสนอราคา", en: "Quotation" };
  if (kind === "invoice") return { th: "ใบแจ้งหนี้", en: "Invoice" };
  return vat
    ? { th: "ใบเสร็จรับเงิน / ใบกำกับภาษี", en: "Receipt / Tax Invoice" }
    : { th: "ใบเสร็จรับเงิน", en: "Receipt" };
}

export function docNumberOf(doc: Doc | undefined, kind: Kind) {
  if (!doc) return undefined;
  return kind === "quote" ? doc.quoteNo : kind === "invoice" ? doc.invoiceNo : doc.receiptNo;
}

/** ผู้ซื้อบนเอกสาร: ในนามบริษัทถ้าตั้งไว้ ไม่งั้นใช้ชื่อลูกค้า */
export function buyerOf(data: Data): Buyer {
  return (
    data.doc.buyer || {
      name: data.customer.name || data.invoice.customerName,
      address: data.customer.address,
      phone: data.customer.phone,
    }
  );
}

export function InvoiceDocument({
  data,
  kind,
  copies,
  a4,
}: {
  data: Data;
  kind: Kind;
  copies: readonly string[];
  /** จัดหน้าแบบกระดาษ A4 เสมอ (ไม่ย่อตามจอมือถือ) — ใช้ตอนสร้างไฟล์ PDF */
  a4?: boolean;
}) {
  const inv = data.invoice;
  const seller = data.seller;
  const doc = data.doc;
  const vat = !!seller.vatRegistered;
  const docNo = docNumberOf(doc, kind);
  const docDate = kind === "receipt" ? inv.paidAt || doc.receiptAt : kind === "quote" ? doc.quoteAt : doc.invoiceAt;
  const title = docTitle(kind, vat);
  // ราคาในร้านรวม VAT แล้ว — แยกฐานภาษีกับภาษีออกจากยอดสุทธิ
  const vatAmount = vat ? Math.round(((inv.total * seller.vatRate) / (100 + seller.vatRate)) * 100) / 100 : 0;
  const buyer = buyerOf(data);

  return (
    <>
      <style>{`@media print { @page { size: A4; margin: 10mm; } html, body, main, .bg-petflow-gradient { background: #fff !important; } .doc-page { break-after: page; } .doc-page:last-child { break-after: auto; } } .doc-a4 .doc-page { width: 794px; min-height: 1123px; max-width: none; padding: 48px; border-radius: 0; box-shadow: none; } .doc-a4 .doc-head, .doc-a4 .doc-totals { grid-template-columns: 1fr 280px; } .doc-a4 .doc-title { font-size: 20px; }`}</style>
      <div className={a4 ? "doc-a4" : "space-y-4 print:space-y-0"}>
        {copies.map((copy, i) => (
          <article
            key={copy}
            data-doc-page className="doc-page relative mx-auto max-w-[800px] overflow-hidden rounded-petflow bg-white p-5 text-[12px] leading-relaxed text-[#333] shadow-petflow-sm sm:p-8 print:max-w-none print:rounded-none print:p-0 print:shadow-none"
          >
            {/* มุมเลขหน้า */}
            <div className="absolute right-0 top-0 h-12 w-12 bg-latte-deep [clip-path:polygon(0_0,100%_0,100%_100%)] print:[print-color-adjust:exact]">
              <span className="absolute right-2 top-1.5 text-sm font-bold text-white">{i + 1}</span>
            </div>

            <header className="doc-head grid grid-cols-1 gap-4 sm:grid-cols-[1fr_minmax(0,280px)] print:grid-cols-[1fr_280px]">
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.jpg" alt="" className="mb-2 h-12 w-12 rounded-lg object-cover" />
                <p className="font-bold">
                  {seller.name}
                  {seller.branch && ` (${seller.branch})`}
                </p>
                {seller.address && <p>{seller.address}</p>}
                {seller.taxId && <p>เลขประจำตัวผู้เสียภาษี {seller.taxId}</p>}
                {seller.phone && <p>โทร. {seller.phone}</p>}

                <p className="mt-3 font-bold text-latte-deep">ลูกค้า</p>
                <p className="font-bold">
                  {buyer.name}
                  {buyer.branch && ` (${buyer.branch})`}
                </p>
                {buyer.address && <p className="whitespace-pre-line">{buyer.address}</p>}
                {buyer.taxId && <p>เลขประจำตัวผู้เสียภาษี {buyer.taxId}</p>}
              </div>
              <div>
                <p className="doc-title whitespace-nowrap pr-12 text-right text-lg font-bold text-latte-deep sm:text-xl">{title.th}</p>
                <p className="mb-2 pr-12 text-right text-[11px] text-[#999]">
                  {title.en} · {copy}
                </p>
                <dl className="grid grid-cols-[90px_1fr] gap-y-1 border-y border-[#e5e5e5] py-2">
                  <dt className="text-latte-deep">เลขที่</dt>
                  <dd>{docNo || "—"}</dd>
                  <dt className="text-latte-deep">วันที่</dt>
                  <dd>{dmy(docDate || new Date().toISOString())}</dd>
                  {kind === "quote" && (
                    <>
                      <dt className="text-latte-deep">ยืนราคาถึง</dt>
                      <dd>{dmy(addDays(docDate || new Date().toISOString(), 30))}</dd>
                    </>
                  )}
                  {kind === "invoice" && (
                    <>
                      <dt className="text-latte-deep">ครบกำหนด</dt>
                      <dd>{dmy(addDays(docDate || new Date().toISOString(), 7))}</dd>
                    </>
                  )}
                  <dt className="text-latte-deep">อ้างอิงบิล</dt>
                  <dd className="break-all">{inv.id.slice(-8).toUpperCase()}</dd>
                </dl>
                {buyer.phone && (
                  <dl className="grid grid-cols-[90px_1fr] border-b border-[#e5e5e5] py-2">
                    <dt className="text-latte-deep">เบอร์โทร</dt>
                    <dd>{buyer.phone}</dd>
                  </dl>
                )}
              </div>
            </header>

            {/* รายการ */}
            {/* จอมือถือ: เลื่อนตารางข้างได้ ไม่บีบชื่อรายการจนอ่านไม่ออก */}
            <div className="mt-5 overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[520px] border-collapse print:min-w-0">
              <thead>
                <tr className="border-y border-[#ccc] text-[11px]">
                  <th className="w-8 py-1.5 text-left font-bold">#</th>
                  <th className="py-1.5 text-left font-bold">รายละเอียด</th>
                  <th className="w-14 py-1.5 text-right font-bold">จำนวน</th>
                  <th className="w-24 py-1.5 text-right font-bold">ราคาต่อหน่วย</th>
                  <th className="w-24 py-1.5 text-right font-bold">มูลค่า</th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((it, idx) => {
                  const qty = it.qty || 1;
                  const unit = it.unitAmount ?? it.amount / qty;
                  return (
                    <tr key={idx} className="border-b border-[#eee] align-top">
                      <td className="py-1.5">{idx + 1}</td>
                      <td className="py-1.5">
                        {it.label}
                      </td>
                      <td className="py-1.5 text-right">{qty}</td>
                      <td className="py-1.5 text-right">{money(unit)}</td>
                      <td className="py-1.5 text-right">{money(it.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>

            {/* ยอดรวม */}
            <div className="doc-totals mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_280px] print:grid-cols-[1fr_280px]">
              <p className="self-end text-[11px] text-[#666]">({bahtText(inv.total)})</p>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-right">
                <dt className="text-latte-deep">รวมเงิน</dt>
                <dd>{money(inv.subtotal)} บาท</dd>
                {inv.discount > 0 && (
                  <>
                    <dt className="text-latte-deep">ส่วนลด{inv.promoLabel ? ` (${inv.promoLabel})` : ""}</dt>
                    <dd>-{money(inv.discount)} บาท</dd>
                  </>
                )}
                {vat && (
                  <>
                    <dt className="text-latte-deep">มูลค่าก่อนภาษี</dt>
                    <dd>{money(inv.total - vatAmount)} บาท</dd>
                    <dt className="text-latte-deep">ภาษีมูลค่าเพิ่ม {seller.vatRate}%</dt>
                    <dd>{money(vatAmount)} บาท</dd>
                  </>
                )}
                <dt className="font-bold text-latte-deep">จำนวนเงินรวมทั้งสิ้น</dt>
                <dd className="font-bold">{money(inv.total)} บาท</dd>
                {kind === "invoice" && inv.deposit > 0 && (
                  <>
                    <dt className="text-latte-deep">ชำระมัดจำแล้ว</dt>
                    <dd>-{money(inv.deposit)} บาท</dd>
                    <dt className="font-bold text-latte-deep">ยอดคงค้าง</dt>
                    <dd className="font-bold">{money(Math.max(0, inv.total - inv.deposit))} บาท</dd>
                  </>
                )}
              </dl>
            </div>

            {doc.note && (
              <div className="mt-4">
                <p className="text-latte-deep">หมายเหตุ</p>
                <p className="whitespace-pre-line">{doc.note}</p>
              </div>
            )}

            {kind !== "receipt" && data.payment.accountNumber && (
              <div className="mt-4 text-[11px]">
                <p className="text-latte-deep">ช่องทางชำระเงิน</p>
                <p>
                  โอนเข้าบัญชี {data.payment.bankName} เลขที่ {data.payment.accountNumber}
                  {data.payment.accountName && ` ชื่อบัญชี ${data.payment.accountName}`}
                </p>
              </div>
            )}

            {kind === "receipt" && (
              <div className="mt-8 border-t border-[#ccc] pt-2 text-[11px]">
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>การชำระเงินจะสมบูรณ์เมื่อบริษัทได้รับเงินเรียบร้อยแล้ว</span>
                  {(
                    [
                      ["cash", "เงินสด"],
                      ["transfer", "โอนเงิน"],
                      ["member_credit", "เครดิตสมาชิก"],
                    ] as const
                  ).map(([m, l]) => (
                    <span key={m} className="inline-flex items-center gap-1">
                      <span className="inline-flex h-3.5 w-3.5 items-center justify-center border border-[#555] text-[10px] leading-none">
                        {(inv.paymentMethod || "transfer") === m ? "✓" : ""}
                      </span>
                      {l}
                    </span>
                  ))}
                </p>
                <p className="mt-1 grid grid-cols-3 gap-2">
                  <span>ธนาคาร {inv.paymentMethod === "transfer" || !inv.paymentMethod ? data.payment.bankName : "-"}</span>
                  <span>วันที่ {dmy(inv.paidAt)}</span>
                  <span className="text-right">จำนวนเงิน {money(inv.total)}</span>
                </p>
              </div>
            )}

            {/* ลายเซ็น */}
            <div className="mt-10 grid grid-cols-2 gap-6 text-center text-[11px]">
              <div>
                <p className="mb-8 text-left">ในนาม {buyer.name}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="border-t border-[#999] pt-1">{kind === "receipt" ? "ผู้จ่ายเงิน" : kind === "quote" ? "ผู้อนุมัติ" : "ผู้รับเอกสาร"}</div>
                  <div className="border-t border-[#999] pt-1">วันที่</div>
                </div>
              </div>
              <div>
                <p className="mb-8 text-right">ในนาม {seller.name}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="border-t border-[#999] pt-1">{kind === "receipt" ? "ผู้รับเงิน" : kind === "quote" ? "ผู้เสนอราคา" : "ผู้ออกเอกสาร"}</div>
                  <div className="border-t border-[#999] pt-1">วันที่</div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

/** ชื่อไฟล์ เช่น RE2026100001-tax-invoice.pdf — ใช้ภาษาอังกฤษ บางเบราว์เซอร์ตัดชื่อไฟล์ภาษาไทยทิ้ง */
export function docFileName(data: Data, kind: Kind) {
  const no = docNumberOf(data.doc, kind) || data.invoice.id.slice(-8).toUpperCase();
  const name =
    kind === "quote" ? "quotation" : kind === "invoice" ? "invoice" : data.seller.vatRegistered ? "tax-invoice" : "receipt";
  return `${no}-${name}.pdf`;
}

/**
 * ปุ่มบันทึกเป็นไฟล์ PDF — วาดเอกสารแบบ A4 เต็มหน้าไว้นอกจอ แล้วแปลงเป็น PDF
 * prepare: งานก่อนสร้างไฟล์ (เช่น ออกเลขที่เอกสาร) คืนข้อมูลล่าสุด หรือ null = ยกเลิก
 */
export function DocPdfButton({
  data,
  kind,
  copies,
  prepare,
  className,
  label = "บันทึก PDF",
}: {
  data: Data;
  kind: Kind;
  copies: readonly string[];
  prepare?: () => Promise<Data | null>;
  className?: string;
  label?: string;
}) {
  const [job, setJob] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!job || !ref.current) return;
    let cancelled = false;
    // รอรูปโลโก้โหลดก่อนแปลง ไม่งั้นหัวกระดาษจะว่าง
    const imgs = [...ref.current.querySelectorAll("img")];
    Promise.all(imgs.map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; }))))
      .then(() => exportDocPdf(ref.current!, docFileName(job, kind)))
      .then((how) => !cancelled && how === "saved" && toast("บันทึกไฟล์ PDF แล้ว", "success"))
      .catch(() => !cancelled && toast("สร้างไฟล์ PDF ไม่สำเร็จ ลองใหม่อีกครั้ง", "error"))
      .finally(() => {
        if (cancelled) return;
        setJob(null);
        setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [job, kind]);

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const d = prepare ? await prepare() : data;
          if (!d) {
            setBusy(false);
            return;
          }
          setJob(d);
        }}
        className={className}
      >
        <Icon name="download" size={16} />
        {busy ? "กำลังสร้างไฟล์…" : label}
      </button>
      {job && (
        <div aria-hidden className="pointer-events-none fixed left-[-10000px] top-0 print:hidden">
          <div ref={ref}>
            <InvoiceDocument data={job} kind={kind} copies={copies} a4 />
          </div>
        </div>
      )}
    </>
  );
}
