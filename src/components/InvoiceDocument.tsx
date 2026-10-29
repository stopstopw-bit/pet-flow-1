"use client";

import { useEffect, useRef, useState } from "react";
import { bahtText } from "@/lib/baht-text";
import { formalItemLabel, stripEmoji } from "@/lib/invoice-item-label";
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
  paymentMethod?: "transfer" | "member_credit" | "cash" | "package";
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
  /** ผู้ซื้อเติมจากข้อมูลออกบิลที่ลูกค้ากรอกไว้ (ยังไม่ได้บันทึกติดบิล) */
  buyerFromCustomer?: boolean;
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
      <style>{`@media print { @page { size: A4; margin: 0; } html, body, main, .bg-petflow-gradient { background: #fff !important; } .a4-fit { height: auto !important; } .a4-fit > div { transform: none !important; } .doc-page { break-after: page; box-shadow: none !important; } .doc-page:last-child { break-after: auto; } }`}</style>
      <div className="space-y-4 print:space-y-0">
        {copies.map((copy, i) => {
          const page = (
            <article
              data-doc-page
              className="doc-page relative flex min-h-[1123px] w-[794px] flex-col overflow-hidden bg-white px-[48px] pb-[40px] pt-[36px] text-[11px] leading-[1.6] text-[#333] shadow-petflow-sm print:[print-color-adjust:exact]"
            >
              {/* มุมเลขหน้า */}
              <div className="absolute right-0 top-0 h-[52px] w-[52px] bg-latte-deep [clip-path:polygon(0_0,100%_0,100%_100%)]">
                <span className="absolute right-[9px] top-[4px] text-[13px] font-bold text-white">{i + 1}</span>
              </div>

              {/* หัวเอกสาร: โลโก้ซ้าย · ชื่อเอกสารขวา */}
              <header className="flex items-start justify-between">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.jpg" alt="" className="h-[56px] w-[56px] object-cover" />
                <div className="pr-[44px] pt-[2px] text-right">
                  <p className="text-[19px] font-bold leading-tight text-latte-deep">{title.th}</p>
                  <p className="mt-[2px] text-[10px] text-latte-deep">{copy}</p>
                </div>
              </header>

              {/* ผู้ขาย + ลูกค้า (ซ้าย) · กล่องเลขที่ (ขวา) */}
              <section className="mt-[18px] grid grid-cols-[1fr_234px] gap-x-[40px]">
                <div>
                  <p>
                    {seller.name}
                    {seller.branch && ` (${seller.branch})`}
                  </p>
                  {seller.address && <p className="whitespace-pre-line">{seller.address}</p>}
                  {seller.taxId && <p>เลขประจำตัวผู้เสียภาษี {seller.taxId}</p>}
                  {seller.phone && <p>โทร. {seller.phone}</p>}

                  <p className="mt-[14px] text-latte-deep">ลูกค้า</p>
                  <p>
                    {buyer.name}
                    {buyer.branch && ` (${buyer.branch})`}
                  </p>
                  {buyer.address && <p className="whitespace-pre-line">{buyer.address}</p>}
                  {buyer.taxId && <p>เลขประจำตัวผู้เสียภาษี {buyer.taxId}</p>}
                </div>
                <div>
                  <dl className="grid grid-cols-[64px_1fr] border-y border-[#ddd] py-[6px]">
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
                    <dt className="text-latte-deep">อ้างอิง</dt>
                    <dd>{inv.id.slice(-8).toUpperCase()}</dd>
                  </dl>
                  {buyer.phone && (
                    <dl className="mt-[10px] grid grid-cols-[64px_1fr] border-y border-[#ddd] py-[6px]">
                      <dt className="text-latte-deep">เบอร์โทร</dt>
                      <dd>{buyer.phone}</dd>
                    </dl>
                  )}
                </div>
              </section>

              {/* รายการ */}
              <table className="mt-[16px] w-full table-fixed border-collapse">
                <thead>
                  <tr className="border-y border-[#ccc] text-[10px]">
                    <th className="w-[24px] py-[4px] text-left font-normal">#</th>
                    <th className="py-[4px] text-left font-normal">รายละเอียด</th>
                    <th className="w-[60px] py-[4px] text-right font-normal">จำนวน</th>
                    <th className="w-[84px] py-[4px] text-right font-normal">ราคาต่อหน่วย</th>
                    <th className="w-[72px] py-[4px] text-right font-normal">ส่วนลด</th>
                    <th className="w-[84px] py-[4px] text-right font-normal">มูลค่า</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.items.map((it, idx) => {
                    const qty = it.qty || 1;
                    const unit = it.unitAmount ?? it.amount / qty;
                    // ส่วนต่างระหว่างราคาเต็ม (ราคาต่อหน่วย × จำนวน) กับมูลค่าจริง = ส่วนลดรายการ
                    const lineDiscount = Math.round((unit * qty - it.amount) * 100) / 100;
                    return (
                      <tr key={idx} className="border-b border-[#eee] align-top">
                        <td className="py-[6px]">{idx + 1}</td>
                        <td className="break-words py-[6px] pr-[8px]">{formalItemLabel(it.label)}</td>
                        <td className="py-[6px] text-right">{qty}</td>
                        <td className="py-[6px] text-right">{money(unit)}</td>
                        <td className="py-[6px] text-right">{lineDiscount > 0 ? money(lineDiscount) : ""}</td>
                        <td className="py-[6px] text-right">{money(it.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* ยอดรวม: ตัวอักษรจำนวนเงินซ้าย · ตัวเลขขวา */}
              <div className="mt-[10px] grid grid-cols-[1fr_auto] items-end gap-x-[24px]">
                <p>({bahtText(inv.total)})</p>
                <dl className="grid grid-cols-[auto_110px] gap-x-[16px] text-right">
                  <dt className="text-latte-deep">รวมเงิน</dt>
                  <dd>{money(inv.subtotal)} บาท</dd>
                  {inv.discount > 0 && (
                    <>
                      <dt className="text-latte-deep">ส่วนลด{inv.promoLabel ? ` (${stripEmoji(inv.promoLabel)})` : ""}</dt>
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
                  <dt className="text-latte-deep">จำนวนเงินรวมทั้งสิ้น</dt>
                  <dd className="font-bold">{money(inv.total)} บาท</dd>
                  {kind === "invoice" && inv.deposit > 0 && (
                    <>
                      <dt className="text-latte-deep">ชำระมัดจำแล้ว</dt>
                      <dd>-{money(inv.deposit)} บาท</dd>
                      <dt className="text-latte-deep">ยอดคงค้าง</dt>
                      <dd className="font-bold">{money(Math.max(0, inv.total - inv.deposit))} บาท</dd>
                    </>
                  )}
                </dl>
              </div>

              {doc.note && (
                <div className="mt-[18px]">
                  <p className="text-latte-deep">หมายเหตุ</p>
                  <p className="whitespace-pre-line">{stripEmoji(doc.note)}</p>
                </div>
              )}

              {kind !== "receipt" && data.payment.accountNumber && (
                <div className="mt-[18px]">
                  <p className="text-latte-deep">ช่องทางชำระเงิน</p>
                  <p>
                    โอนเข้าบัญชี {data.payment.bankName} เลขที่ {data.payment.accountNumber}
                    {data.payment.accountName && ` ชื่อบัญชี ${data.payment.accountName}`}
                  </p>
                </div>
              )}

              {/* ท้ายกระดาษ: การชำระเงิน + ลายเซ็น ชิดล่างเสมอ */}
              <div className="mt-auto">
                {kind === "receipt" && (
                  <div className="border-t border-[#ccc] pt-[10px]">
                    <p className="flex items-center gap-x-[14px]">
                      <span>การชำระเงินจะสมบูรณ์เมื่อบริษัทได้รับเงินเรียบร้อยแล้ว</span>
                      {(
                        [
                          ["cash", "เงินสด"],
                          ["cheque", "เช็ค"],
                          ["transfer", "โอนเงิน"],
                          ["card", "บัตรเครดิต"],
                          ...(inv.paymentMethod === "member_credit" ? [["member_credit", "เครดิตสมาชิก"] as const] : []),
                          ...(inv.paymentMethod === "package" ? [["package", "หักจากคอร์ส"] as const] : []),
                        ] as const
                      ).map(([m, l]) => (
                        <span key={m} className="inline-flex items-center gap-[5px]">
                          <span className="inline-flex h-[13px] w-[13px] items-center justify-center border border-[#555] text-[10px] leading-none">
                            {(inv.paymentMethod || "transfer") === m ? "✓" : ""}
                          </span>
                          {l}
                        </span>
                      ))}
                    </p>
                    <div className="mt-[8px] grid grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto_1fr] items-end gap-x-[8px]">
                      <span>ธนาคาร</span>
                      <span className="border-b border-[#999] text-center">
                        {inv.paymentMethod === "transfer" || !inv.paymentMethod ? data.payment.bankName : ""}
                      </span>
                      <span>เลขที่</span>
                      <span className="border-b border-[#999] text-center">
                        {inv.paymentMethod === "transfer" || !inv.paymentMethod ? data.payment.accountNumber : ""}
                      </span>
                      <span>วันที่</span>
                      <span className="border-b border-[#999] text-center">{dmy(inv.paidAt)}</span>
                      <span>จำนวนเงิน</span>
                      <span className="border-b border-[#999] text-center">{money(inv.total)}</span>
                    </div>
                  </div>
                )}

                {/* ลายเซ็น */}
                <div className="mt-[34px] grid grid-cols-2 gap-x-[30px]">
                  <div>
                    <p>ในนาม {buyer.name}</p>
                    {buyer.branch && <p>({buyer.branch})</p>}
                  </div>
                  <div className="text-right">
                    <p>ในนาม {seller.name}</p>
                    {seller.branch && <p>({seller.branch})</p>}
                  </div>
                </div>
                <div className="mt-[44px] grid grid-cols-4 gap-x-[16px] text-center [&>div:nth-child(2)]:mr-[14px] [&>div:nth-child(3)]:ml-[14px]">
                  <div className="border-t border-[#999] pt-[4px]">
                    {kind === "receipt" ? "ผู้จ่ายเงิน" : kind === "quote" ? "ผู้อนุมัติ" : "ผู้รับเอกสาร"}
                  </div>
                  <div className="border-t border-[#999] pt-[4px]">วันที่</div>
                  <div className="border-t border-[#999] pt-[4px]">
                    {kind === "receipt" ? "ผู้รับเงิน" : kind === "quote" ? "ผู้เสนอราคา" : "ผู้ออกเอกสาร"}
                  </div>
                  <div className="border-t border-[#999] pt-[4px]">วันที่</div>
                </div>
              </div>
            </article>
          );
          // สร้าง PDF: วาดขนาด A4 จริง · บนจอ: ย่อทั้งหน้าลงให้พอดีจอ หน้าตาเหมือนกระดาษเป๊ะ
          return a4 ? <div key={copy}>{page}</div> : <A4Fit key={copy}>{page}</A4Fit>;
        })}
      </div>
    </>
  );
}

/** ย่อหน้ากระดาษ A4 (794px) ลงให้พอดีความกว้างจอ โดยไม่เปลี่ยน layout ข้างใน */
function A4Fit({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(1123);
  useEffect(() => {
    const el = ref.current;
    const page = inner.current;
    if (!el || !page) return;
    const fit = () => {
      setScale(Math.min(1, el.clientWidth / 794));
      setHeight(page.offsetHeight);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    ro.observe(page);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="a4-fit mx-auto w-full max-w-[794px]" style={{ height: height * scale }}>
      <div ref={inner} style={{ width: 794, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
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
