import { getSupabase } from "./supabase/server";
import { requireTenantId } from "./tenant-context";
import { ensureMigration } from "./migrations";
import { bangkokToday } from "./bangkok-date";

/**
 * เอกสารทางการของบิล — ใบเสนอราคา / ใบแจ้งหนี้ / ใบเสร็จรับเงิน (หรือใบกำกับภาษีถ้าร้านจด VAT)
 * เก็บแยกจากตาราง invoices: ข้อมูลผู้ซื้อในนามบริษัท + เลขที่เอกสารแต่ละแบบ
 * เลขที่ออกครั้งแรกตอนเปิดเอกสาร แล้วคงที่ตลอด (พิมพ์ซ้ำได้เลขเดิม) — เอกสารภาษีห้ามเลขซ้ำ/เปลี่ยน
 */

export type DocKind = "quote" | "invoice" | "receipt";

export type DocBuyer = {
  /** ชื่อบริษัท/ชื่อผู้ซื้อตามที่จะโชว์บนเอกสาร */
  name: string;
  taxId?: string;
  /** เช่น "สำนักงานใหญ่" หรือ "สาขา 00001" */
  branch?: string;
  address?: string;
  phone?: string;
};

export type InvoiceDoc = {
  invoiceId: string;
  customerId?: string;
  buyer?: DocBuyer;
  /** ร้านกด "ใช้ชื่อลูกค้า" ไว้ — ไม่ต้องเติมข้อมูลออกบิลของลูกค้าให้อัตโนมัติ */
  buyerPersonal?: boolean;
  quoteNo?: string;
  quoteAt?: string;
  invoiceNo?: string;
  invoiceAt?: string;
  receiptNo?: string;
  receiptAt?: string;
  note?: string;
};

type Row = {
  invoice_id: string;
  customer_id: string | null;
  /** { personal: true } = ร้านเลือกออกในชื่อลูกค้า (กันระบบเติมข้อมูลออกบิลทับ) */
  buyer: (DocBuyer & { personal?: boolean }) | null;
  quote_no: string | null;
  quote_at: string | null;
  invoice_no: string | null;
  invoice_at: string | null;
  receipt_no: string | null;
  receipt_at: string | null;
  note: string | null;
};

const PREFIX: Record<DocKind, string> = { quote: "QT", invoice: "IV", receipt: "RE" };
const NO_COL = { quote: "quote_no", invoice: "invoice_no", receipt: "receipt_no" } as const;
const AT_COL = { quote: "quote_at", invoice: "invoice_at", receipt: "receipt_at" } as const;

const mem = new Map<string, InvoiceDoc>();

function fromRow(r: Row): InvoiceDoc {
  return {
    invoiceId: r.invoice_id,
    customerId: r.customer_id || undefined,
    buyer: r.buyer && !r.buyer.personal ? r.buyer : undefined,
    buyerPersonal: !!r.buyer?.personal || undefined,
    quoteNo: r.quote_no || undefined,
    quoteAt: r.quote_at || undefined,
    invoiceNo: r.invoice_no || undefined,
    invoiceAt: r.invoice_at || undefined,
    receiptNo: r.receipt_no || undefined,
    receiptAt: r.receipt_at || undefined,
    note: r.note || undefined,
  };
}

function cleanBuyer(b: Partial<DocBuyer> | null | undefined): DocBuyer | undefined {
  if (!b) return undefined;
  const name = String(b.name || "").trim();
  if (!name) return undefined;
  const out: DocBuyer = { name };
  for (const k of ["taxId", "branch", "address", "phone"] as const) {
    const v = String(b[k] || "").trim();
    if (v) out[k] = v;
  }
  return out;
}

/** ตารางยังไม่มี → ลองสร้างให้เองครั้งเดียวแล้วทำซ้ำ (เหมือนฟีเจอร์อื่นในระบบ) */
async function withTable<T>(fn: () => Promise<{ data: T; error: { message?: string } | null }>) {
  let res = await fn();
  if (res.error && /invoice_docs|relation|schema cache/i.test(res.error.message || "")) {
    if (await ensureMigration("invoice_docs.setup")) res = await fn();
  }
  return res;
}

export async function getInvoiceDoc(invoiceId: string): Promise<InvoiceDoc | undefined> {
  const sb = getSupabase();
  if (!sb) return mem.get(invoiceId);
  const { data } = await withTable(async () => {
    const r = await sb.from("invoice_docs").select("*").eq("tenant_id", requireTenantId()).eq("invoice_id", invoiceId).maybeSingle();
    return { data: r.data as Row | null, error: r.error };
  });
  return data ? fromRow(data) : undefined;
}

/** ข้อมูลผู้ซื้อล่าสุดของลูกค้าคนนี้ — เติมให้อัตโนมัติตอนออกบิลใบถัดไปในนามบริษัทเดิม */
export async function lastBuyerForCustomer(customerId: string): Promise<DocBuyer | undefined> {
  if (!customerId) return undefined;
  const sb = getSupabase();
  if (!sb) {
    return [...mem.values()].reverse().find((d) => d.customerId === customerId && d.buyer)?.buyer;
  }
  const { data } = await withTable(async () => {
    const r = await sb
      .from("invoice_docs")
      .select("buyer").eq("tenant_id", requireTenantId())
      .eq("customer_id", customerId)
      .not("buyer", "is", null)
      .order("updated_at", { ascending: false })
      .limit(10);
    return { data: (r.data as Pick<Row, "buyer">[] | null) || [], error: r.error };
  });
  return data?.find((d) => d.buyer && !d.buyer.personal)?.buyer || undefined;
}

export async function saveBuyer(
  invoiceId: string,
  customerId: string | undefined,
  buyer: Partial<DocBuyer> | null,
  note?: string
) {
  const clean = cleanBuyer(buyer) || null;
  const sb = getSupabase();
  if (!sb) {
    const cur = mem.get(invoiceId) || { invoiceId };
    mem.set(invoiceId, {
      ...cur,
      customerId,
      buyer: clean || undefined,
      buyerPersonal: clean ? undefined : true,
      note: note ?? cur.note,
    });
    return { ok: true as const };
  }
  const { error } = await withTable(async () => {
    const r = await sb.from("invoice_docs").upsert(
      {
        tenant_id: requireTenantId(),
        invoice_id: invoiceId,
        customer_id: customerId || null,
        // ไม่มีผู้ซื้อ = ร้านเลือกออกในชื่อลูกค้าเอง — จำไว้ ไม่ให้ระบบเติมข้อมูลออกบิลของลูกค้าทับ
        buyer: clean || { name: "", personal: true },
        ...(note !== undefined ? { note: note.trim() || null } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "invoice_id" }
    );
    return { data: null, error: r.error };
  });
  return error ? { ok: false as const, error: error.message || "save_failed" } : { ok: true as const };
}

/** เลขที่ถัดไปของเดือนนั้น เช่น RE2026100001 — นับจากเลขสูงสุดที่ออกไปแล้ว ไม่ใช้จำนวนแถว (กันเลขซ้ำถ้ามีการลบ) */
async function nextNumber(kind: DocKind): Promise<string> {
  const ym = bangkokToday().slice(0, 7).replace("-", "");
  const head = `${PREFIX[kind]}${ym}`;
  const sb = getSupabase();
  let used: string[] = [];
  if (!sb) {
    used = [...mem.values()].map((d) => (kind === "quote" ? d.quoteNo : kind === "invoice" ? d.invoiceNo : d.receiptNo) || "");
  } else {
    const col = NO_COL[kind];
    const { data } = await sb.from("invoice_docs").select(col).eq("tenant_id", requireTenantId()).like(col, `${head}%`);
    used = ((data as Record<string, string | null>[] | null) || []).map((r) => r[col] || "");
  }
  const max = used
    .filter((n) => n.startsWith(head))
    .reduce((m, n) => Math.max(m, Number(n.slice(head.length)) || 0), 0);
  return `${head}${String(max + 1).padStart(4, "0")}`;
}

/**
 * ออกเลขที่เอกสาร (ครั้งแรกเท่านั้น) — เรียกซ้ำได้เลขเดิม
 * คืนเอกสารล่าสุดพร้อมเลขที่
 */
export async function issueDocNumber(
  invoiceId: string,
  customerId: string | undefined,
  kind: DocKind
): Promise<{ ok: true; doc: InvoiceDoc } | { ok: false; error: string }> {
  const cur = await getInvoiceDoc(invoiceId);
  const existing = kind === "quote" ? cur?.quoteNo : kind === "invoice" ? cur?.invoiceNo : cur?.receiptNo;
  if (existing && cur) return { ok: true, doc: cur };

  const sb = getSupabase();
  const now = new Date().toISOString();
  // ลองสองรอบ — ถ้าชนเลขกับอีกเครื่องที่ออกพร้อมกัน รอบสองจะได้เลขถัดไป
  for (let attempt = 0; attempt < 2; attempt++) {
    const no = await nextNumber(kind);
    if (!sb) {
      const base = cur || { invoiceId };
      const next: InvoiceDoc = {
        ...base,
        customerId: base.customerId || customerId,
        ...(kind === "quote" ? { quoteNo: no, quoteAt: now } : kind === "invoice" ? { invoiceNo: no, invoiceAt: now } : { receiptNo: no, receiptAt: now }),
      };
      mem.set(invoiceId, next);
      return { ok: true, doc: next };
    }
    const { error } = await withTable(async () => {
      const r = await sb.from("invoice_docs").upsert(
        {
          tenant_id: requireTenantId(),
          invoice_id: invoiceId,
          customer_id: cur?.customerId || customerId || null,
          [NO_COL[kind]]: no,
          [AT_COL[kind]]: now,
          updated_at: now,
        },
        { onConflict: "invoice_id" }
      );
      return { data: null, error: r.error };
    });
    if (error) return { ok: false, error: error.message || "issue_failed" };
    // ตรวจว่าไม่มีบิลอื่นได้เลขเดียวกันไปพร้อมกัน
    const { data: dup } = await sb.from("invoice_docs").select("invoice_id").eq("tenant_id", requireTenantId()).eq(NO_COL[kind], no);
    if (((dup as { invoice_id: string }[] | null) || []).length <= 1) {
      const doc = await getInvoiceDoc(invoiceId);
      return doc ? { ok: true, doc } : { ok: false, error: "not_saved" };
    }
    await sb.from("invoice_docs").update({ [NO_COL[kind]]: null, [AT_COL[kind]]: null }).eq("tenant_id", requireTenantId()).eq("invoice_id", invoiceId);
  }
  return { ok: false, error: "number_conflict" };
}

/** เอกสารที่ออกเลขที่ไปแล้ว (อย่างน้อยหนึ่งแบบ) ใหม่สุดก่อน — ไว้เรียกดู/พิมพ์ซ้ำย้อนหลัง */
export async function listIssuedDocs(limit = 1000): Promise<InvoiceDoc[]> {
  const sb = getSupabase();
  if (!sb) {
    return [...mem.values()].filter((d) => d.quoteNo || d.invoiceNo || d.receiptNo).reverse();
  }
  const { data } = await withTable(async () => {
    const r = await sb
      .from("invoice_docs")
      .select("*").eq("tenant_id", requireTenantId())
      .or("quote_no.not.is.null,invoice_no.not.is.null,receipt_no.not.is.null")
      .order("updated_at", { ascending: false })
      .limit(limit);
    return { data: (r.data as Row[] | null) || [], error: r.error };
  });
  return (data || []).map(fromRow);
}
