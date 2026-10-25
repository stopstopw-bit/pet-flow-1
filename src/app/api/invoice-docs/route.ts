import { NextRequest, NextResponse } from "next/server";
import { getInvoice, listInvoices } from "@/lib/invoices-store";
import { getCustomer } from "@/lib/customers-store";
import { getSiteConfig } from "@/lib/config-store";
import { pushLineMessage } from "@/lib/line";
import { docShareUrl } from "@/lib/doc-share";
import { getAppUrlFromEnv as getAppUrl } from "@/lib/line-config";
import { autoBuyerFor, buildDocPayload } from "@/lib/invoice-docs-payload";
import {
  getInvoiceDoc,
  issueDocNumber,
  listIssuedDocs,
  saveBuyer,
  type DocKind,
  type InvoiceDoc,
} from "@/lib/invoice-docs-store";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { withTenant } from "@/lib/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: DocKind[] = ["quote", "invoice", "receipt"];

/**
 * GET ?invoiceId= — ข้อมูลครบสำหรับพิมพ์เอกสาร: บิล + ผู้ขาย + ผู้ซื้อ + เลขที่
 * GET ?list=1 — เอกสารทุกใบที่เคยออกเลขที่ไปแล้ว (ใหม่สุดก่อน) ไว้เรียกดูย้อนหลัง
 */
async function handleGet(req: NextRequest) {
  if (req.nextUrl.searchParams.get("list")) {
    const [docs, invoices] = await Promise.all([listIssuedDocs(), listInvoices()]);
    const byId = new Map(invoices.map((i) => [i.id, i]));
    const rows = docs.flatMap((d) => {
      const inv = byId.get(d.invoiceId);
      if (!inv || inv.deletedAt) return [];
      return KINDS.flatMap((kind) => {
        const no = kind === "quote" ? d.quoteNo : kind === "invoice" ? d.invoiceNo : d.receiptNo;
        const at = kind === "quote" ? d.quoteAt : kind === "invoice" ? d.invoiceAt : d.receiptAt;
        if (!no) return [];
        return [
          {
            invoiceId: d.invoiceId,
            kind,
            no,
            at: at || "",
            buyerName: d.buyer?.name || inv.customerName,
            company: !!d.buyer,
            customerName: inv.customerName,
            catName: inv.catName,
            total: inv.total,
            status: inv.status,
          },
        ];
      });
    });
    rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return NextResponse.json({ docs: rows });
  }

  const data = await buildDocPayload(req.nextUrl.searchParams.get("invoiceId") || "");
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(data);
}

const TITLE: Record<DocKind, string> = { quote: "ใบเสนอราคา", invoice: "ใบแจ้งหนี้", receipt: "ใบเสร็จรับเงิน" };

function docMessage(opts: {
  title: string;
  no: string;
  shop: string;
  customer: string;
  total: number;
  url: string;
}) {
  const row = (label: string, value: string, bold = false) => ({
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: label, size: "sm", color: "#8a7563", flex: 2 },
      { type: "text", text: value, size: "sm", color: "#4a3426", flex: 3, align: "end", weight: bold ? "bold" : "regular", wrap: true },
    ],
  });
  return {
    type: "flex",
    altText: `${opts.title} ${opts.no} จาก ${opts.shop}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "DOCUMENT", size: "xs", color: "#b08a64", weight: "bold" },
          { type: "text", text: opts.title, size: "lg", weight: "bold", color: "#4a3426", wrap: true },
          { type: "separator", margin: "md" },
          row("เลขที่", opts.no),
          row("ลูกค้า", opts.customer),
          row("ยอดรวม", `${opts.total.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท`, true),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#5b3a29",
            action: { type: "uri", label: "เปิดดู / ดาวน์โหลด PDF", uri: opts.url },
          },
        ],
      },
    },
  };
}

/**
 * POST { invoiceId, buyer?, note? } — บันทึกผู้ซื้อ (ในนามบริษัท)
 * POST { invoiceId, issue: kind } — ออกเลขที่เอกสาร (ครั้งแรกเท่านั้น)
 * POST { invoiceId, send: kind } — ออกเลขที่ (ถ้ายังไม่มี) แล้วส่งลิงก์เอกสารให้ลูกค้าทาง LINE
 * POST { invoiceId, link: kind } — ออกเลขที่แล้วคืนลิงก์ให้ร้านก๊อปไปส่งเอง (ลูกค้ายังไม่ผูก LINE)
 */
async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const invoiceId = String(body.invoiceId || "");
  const invoice = invoiceId ? await getInvoice(invoiceId) : undefined;
  if (!invoice || invoice.deletedAt) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const kindArg = body.issue || body.send || body.link;
  if (kindArg) {
    const kind = String(kindArg) as DocKind;
    if (!KINDS.includes(kind)) {
      return NextResponse.json({ error: "bad_kind" }, { status: 400 });
    }
    // ใบเสร็จออกได้เฉพาะบิลที่รับเงินแล้ว — กันออกใบเสร็จ/ใบกำกับภาษีก่อนได้เงินจริง
    if (kind === "receipt" && invoice.status !== "paid") {
      return NextResponse.json({ error: "not_paid" }, { status: 400 });
    }

    const customer = invoice.customerId ? await getCustomer(invoice.customerId) : undefined;
    let to = "";
    if (body.send) {
      to = invoice.lineUserId || customer?.lineUserId || "";
      if (!to) return NextResponse.json({ error: "no_line" }, { status: 400 });
    }

    // ออกเลขที่ครั้งแรก: ถ้าลูกค้ากรอกข้อมูลออกบิล (นิติบุคคล/บุคคลธรรมดา) ไว้ ให้บันทึกติดเอกสารเลย
    // เอกสารที่ออกแล้วจะคงชื่อนี้ แม้ลูกค้าแก้ข้อมูลทีหลัง
    const autoBuyer = autoBuyerFor(await getInvoiceDoc(invoiceId), customer?.taxInvoice);
    if (autoBuyer) {
      const saved = await saveBuyer(invoiceId, invoice.customerId, autoBuyer);
      if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 });
    }

    const res = await issueDocNumber(invoiceId, invoice.customerId, kind);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
    if (body.link) {
      return NextResponse.json({ ok: true, doc: res.doc, url: docShareUrl(getAppUrl(), invoiceId, kind) });
    }
    if (!body.send) return NextResponse.json({ ok: true, doc: res.doc });

    const doc: InvoiceDoc = res.doc;
    const config = await getSiteConfig();
    const vat = !!config.business.vatRegistered;
    const title = kind === "receipt" && vat ? "ใบเสร็จรับเงิน / ใบกำกับภาษี" : TITLE[kind];
    const no = (kind === "quote" ? doc.quoteNo : kind === "invoice" ? doc.invoiceNo : doc.receiptNo) || "";
    const url = docShareUrl(getAppUrl(), invoiceId, kind);
    try {
      await pushLineMessage(to, [
        docMessage({
          title,
          no,
          shop: config.business.name,
          customer: doc.buyer?.name || invoice.customerName,
          total: invoice.total,
          url,
        }),
      ]);
    } catch (e) {
      return NextResponse.json(
        { error: "line_failed", detail: e instanceof Error ? e.message : String(e), doc, url },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, doc, url });
  }

  const res = await saveBuyer(
    invoiceId,
    invoice.customerId,
    body.buyer ?? null,
    body.note !== undefined ? String(body.note) : undefined
  );
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true, doc: await getInvoiceDoc(invoiceId) });
}

/** หลังบ้านเท่านั้น — ทำงานในนามร้านของคนที่ล็อกอินอยู่ */
async function getAdminSession(req: NextRequest) {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handleGet(req));
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePost(req));
}
