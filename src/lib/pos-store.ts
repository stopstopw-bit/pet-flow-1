import { getSupabase } from "./supabase/server";
import { requireTenantId } from "./tenant-context";
import { ensureMigration } from "./migrations";
import { bangkokToday } from "./bangkok-date";
import { uploadDataUrlToStorage } from "./supabase/storage";

/**
 * POS หน้าร้าน — สินค้า + สต็อก, บิลขายเร็ว (ไม่ต้องเลือกลูกค้า), ปิดยอดรายวัน
 * ตารางใหม่ทั้งหมด (migration pos.setup) ไม่แตะตารางบิลบริการเดิม
 * ยอดขายลงหน้าการเงินอัตโนมัติ (finance_records.invoice_id = เลข id บิลขาย)
 */

export type PosProduct = {
  id: string;
  name: string;
  /** บาร์โค้ด / รหัสสินค้า — สแกนหรือพิมพ์ค้นหาได้ */
  sku?: string;
  category?: string;
  /** รูปสินค้า (URL ใน storage) */
  imageUrl?: string;
  price: number;
  /** ต้นทุนต่อชิ้น — ไว้ดูกำไร (ไม่บังคับ) */
  cost?: number;
  /** นับสต็อกไหม — บริการ/ของที่ไม่ต้องนับ (เช่น ค่าตัดเล็บ) ปิดได้ */
  trackStock: boolean;
  stock: number;
  /** เหลือเท่านี้แล้วเตือนว่าใกล้หมด */
  lowStock?: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StockReason = "sale" | "restock" | "adjust" | "void";

export type StockMove = {
  id: string;
  productId: string;
  /** + เข้า / - ออก */
  qty: number;
  reason: StockReason;
  refId?: string;
  note?: string;
  createdAt: string;
};

export type PosMethod = "cash" | "promptpay" | "transfer";

export const POS_METHOD_LABELS: Record<PosMethod, string> = {
  cash: "เงินสด",
  promptpay: "QR พร้อมเพย์",
  transfer: "โอน",
};

export type PosSaleItem = {
  productId?: string;
  name: string;
  price: number;
  qty: number;
};

export type PosSale = {
  id: string;
  /** เลขที่บิลที่โชว์ เช่น POS261016-003 */
  no: string;
  date: string;
  items: PosSaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  method: PosMethod;
  cashReceived?: number;
  change?: number;
  customerId?: string;
  customerName?: string;
  note?: string;
  status: "paid" | "void";
  createdAt: string;
  voidedAt?: string;
};

export type PosClosing = {
  id: string;
  date: string;
  /** เงินสดที่ควรมีในลิ้นชัก = เงินทอนตั้งต้น + รับเงินสดทั้งวัน */
  expectedCash: number;
  countedCash: number;
  diff: number;
  openingCash: number;
  totals: DayTotals;
  note?: string;
  createdAt: string;
};

export type DayTotals = {
  /** ขายหน้าร้าน แยกตามช่องทาง */
  pos: Record<PosMethod, number>;
  posCount: number;
  /** บิลบริการ (อาบน้ำ/ห้องพัก) ที่ปิดบิลวันนี้ แยกตามช่องทาง */
  services: { cash: number; transfer: number; member_credit: number };
  servicesCount: number;
};

const now = () => new Date().toISOString();
const rid = (p: string) => `${p}${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const money = (n: unknown) => Math.max(0, Math.round((Number(n) || 0) * 100) / 100);

const memProducts = new Map<string, PosProduct>();
const memMoves: StockMove[] = [];
const memSales = new Map<string, PosSale>();
const memClosings = new Map<string, PosClosing>();

/** insert/update ครั้งแรกในร้านที่ยังไม่มีตาราง → สร้างตารางให้แล้วลองใหม่รอบเดียว */
async function withPosTables<T extends { error: unknown }>(run: () => PromiseLike<T>): Promise<T> {
  const first = await run();
  if (!first.error) return first;
  if (await ensureMigration("pos.setup")) {
    await ensureMigration("pos.import_products");
    return run();
  }
  return first;
}

// ── สินค้า ─────────────────────────────────────────────

type ProductRow = {
  id: string;
  tenant_id?: string;
  name: string;
  sku: string | null;
  category: string | null;
  image_url?: string | null;
  price: number | string;
  cost: number | string | null;
  track_stock: boolean;
  stock: number;
  low_stock: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

function productFromRow(r: ProductRow): PosProduct {
  return {
    id: r.id,
    name: r.name,
    sku: r.sku || undefined,
    category: r.category || undefined,
    imageUrl: r.image_url || undefined,
    price: Number(r.price) || 0,
    cost: r.cost != null ? Number(r.cost) : undefined,
    trackStock: r.track_stock !== false,
    stock: Number(r.stock) || 0,
    lowStock: r.low_stock != null ? Number(r.low_stock) : undefined,
    active: r.active !== false,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function productToRow(p: PosProduct): ProductRow {
  return {
    id: p.id,
    tenant_id: requireTenantId(),
    name: p.name,
    sku: p.sku || null,
    category: p.category || null,
    image_url: p.imageUrl || null,
    price: p.price,
    cost: p.cost ?? null,
    track_stock: p.trackStock,
    stock: p.stock,
    low_stock: p.lowStock ?? null,
    active: p.active,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

export async function listProducts(includeInactive = false): Promise<PosProduct[]> {
  const sb = getSupabase();
  let list: PosProduct[];
  if (sb) {
    const load = () => sb.from("pos_products").select("*").eq("tenant_id", requireTenantId()).order("name");
    let { data, error } = await load();
    // ร้านที่เพิ่งเปิด POS ครั้งแรก: สร้างตาราง + ย้ายสินค้าจากหน้าสินค้าเดิมเข้ามาให้เลย
    if (error && (await ensureMigration("pos.setup"))) {
      await ensureMigration("pos.import_products");
      ({ data, error } = await load());
    }
    list = error ? [] : ((data as ProductRow[] | null) || []).map(productFromRow);
  } else {
    list = [...memProducts.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
  }
  return includeInactive ? list : list.filter((p) => p.active);
}

export async function getProduct(id: string): Promise<PosProduct | null> {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb.from("pos_products").select("*").eq("tenant_id", requireTenantId()).eq("id", id).maybeSingle();
    return data ? productFromRow(data as ProductRow) : null;
  }
  return memProducts.get(id) || null;
}

export type ProductInput = {
  id?: string;
  name?: string;
  sku?: string;
  category?: string;
  /** data URL (รูปใหม่) / URL เดิม / "" = ลบรูป */
  imageUrl?: string | null;
  price?: number;
  cost?: number | null;
  trackStock?: boolean;
  lowStock?: number | null;
  active?: boolean;
  /** ใช้ตอนสร้างใหม่เท่านั้น — แก้สต็อกทีหลังให้ใช้ adjustStock (มีประวัติ) */
  stock?: number;
};

export async function saveProduct(input: ProductInput): Promise<PosProduct> {
  const existing = input.id ? await getProduct(input.id) : null;
  const name = String(input.name ?? existing?.name ?? "").trim().slice(0, 120);
  if (!name) throw new Error("name_required");
  const t = now();
  const id = existing?.id || rid("P");
  let imageUrl = existing?.imageUrl;
  if (input.imageUrl !== undefined) {
    const v = String(input.imageUrl || "").trim();
    imageUrl = v ? await uploadDataUrlToStorage(`pos/${id}-${Date.now()}`, v) : undefined;
  }
  const p: PosProduct = {
    id,
    name,
    sku: (input.sku !== undefined ? String(input.sku).trim() : existing?.sku) || undefined,
    category: (input.category !== undefined ? String(input.category).trim() : existing?.category) || undefined,
    imageUrl,
    price: input.price !== undefined ? money(input.price) : existing?.price ?? 0,
    cost:
      input.cost === null ? undefined : input.cost !== undefined ? money(input.cost) : existing?.cost,
    trackStock: input.trackStock ?? existing?.trackStock ?? true,
    stock: existing ? existing.stock : Math.round(Number(input.stock) || 0),
    lowStock:
      input.lowStock === null
        ? undefined
        : input.lowStock !== undefined
          ? Math.max(0, Math.round(Number(input.lowStock) || 0))
          : existing?.lowStock,
    active: input.active ?? existing?.active ?? true,
    createdAt: existing?.createdAt || t,
    updatedAt: t,
  };
  const sb = getSupabase();
  if (sb) {
    const { error } = await withPosTables(() => sb.from("pos_products").upsert(productToRow(p)));
    if (error) throw new Error((error as { message?: string }).message || "save_failed");
  } else {
    memProducts.set(p.id, p);
  }
  if (!existing && p.trackStock && p.stock !== 0) {
    await recordMove({ productId: p.id, qty: p.stock, reason: "restock", note: "สต็อกตั้งต้น" });
  }
  return p;
}

async function setStock(productId: string, stock: number) {
  const sb = getSupabase();
  if (sb) {
    await sb.from("pos_products").update({ stock, updated_at: now() }).eq("tenant_id", requireTenantId()).eq("id", productId);
  } else {
    const p = memProducts.get(productId);
    if (p) memProducts.set(productId, { ...p, stock, updatedAt: now() });
  }
}

async function recordMove(m: Omit<StockMove, "id" | "createdAt">) {
  const move: StockMove = { ...m, id: rid("M"), createdAt: now() };
  const sb = getSupabase();
  if (sb) {
    await withPosTables(() =>
      sb.from("pos_stock_moves").insert({
        tenant_id: requireTenantId(),
        id: move.id,
        product_id: move.productId,
        qty: move.qty,
        reason: move.reason,
        ref_id: move.refId || null,
        note: move.note || null,
        created_at: move.createdAt,
      })
    );
  } else {
    memMoves.push(move);
  }
  return move;
}

/** เติม/ปรับสต็อก — qty บวก = รับของเข้า, ลบ = ตัดออก (ของเสีย/นับแล้วขาด) */
/**
 * ตัด/คืนสต็อกจากบิลบริการ (ใส่สินค้าในบิลแล้วกดรับเงิน / ยกเลิกรับเงิน)
 * ไม่มีสินค้านี้แล้วก็ข้ามไปเงียบ ๆ — บิลต้องรับเงินได้เสมอ
 */
export async function adjustStockForBill(productId: string, qty: number, invoiceId: string) {
  const p = await getProduct(productId);
  if (!p || !p.trackStock) return;
  const delta = Math.round(Number(qty) || 0);
  if (!delta) return;
  await setStock(productId, Math.max(0, p.stock + delta));
  await recordMove({ productId, qty: delta, reason: delta < 0 ? "sale" : "void", refId: invoiceId, note: "บิลบริการ" });
}

export async function adjustStock(productId: string, qty: number, reason: "restock" | "adjust", note?: string) {
  const p = await getProduct(productId);
  if (!p) throw new Error("not_found");
  const delta = Math.round(Number(qty) || 0);
  if (!delta) return p;
  await setStock(productId, p.stock + delta);
  await recordMove({ productId, qty: delta, reason, note: note?.trim().slice(0, 200) || undefined });
  return { ...p, stock: p.stock + delta };
}

export async function listStockMoves(productId: string, limit = 30): Promise<StockMove[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("pos_stock_moves")
      .select("*").eq("tenant_id", requireTenantId())
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return ((data as Record<string, unknown>[] | null) || []).map((r) => ({
      id: String(r.id),
      productId: String(r.product_id),
      qty: Number(r.qty) || 0,
      reason: r.reason as StockReason,
      refId: (r.ref_id as string) || undefined,
      note: (r.note as string) || undefined,
      createdAt: String(r.created_at),
    }));
  }
  return memMoves
    .filter((m) => m.productId === productId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

// ── บิลขาย ─────────────────────────────────────────────

type SaleRow = {
  id: string;
  no: string;
  date: string;
  items: PosSaleItem[];
  subtotal: number | string;
  discount: number | string;
  total: number | string;
  method: PosMethod;
  cash_received: number | string | null;
  change: number | string | null;
  customer_id: string | null;
  customer_name: string | null;
  note: string | null;
  status: "paid" | "void";
  created_at: string;
  voided_at: string | null;
};

function saleFromRow(r: SaleRow): PosSale {
  return {
    id: r.id,
    no: r.no,
    date: r.date,
    items: Array.isArray(r.items) ? r.items : [],
    subtotal: Number(r.subtotal) || 0,
    discount: Number(r.discount) || 0,
    total: Number(r.total) || 0,
    method: r.method,
    cashReceived: r.cash_received != null ? Number(r.cash_received) : undefined,
    change: r.change != null ? Number(r.change) : undefined,
    customerId: r.customer_id || undefined,
    customerName: r.customer_name || undefined,
    note: r.note || undefined,
    status: r.status,
    createdAt: r.created_at,
    voidedAt: r.voided_at || undefined,
  };
}

export async function listSales(date: string): Promise<PosSale[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("pos_sales")
      .select("*").eq("tenant_id", requireTenantId())
      .eq("date", date)
      .order("created_at", { ascending: false });
    return error ? [] : ((data as SaleRow[] | null) || []).map(saleFromRow);
  }
  return [...memSales.values()]
    .filter((s) => s.date === date)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** บิลขายหน้าร้านที่ผูกกับลูกค้าคนนี้ (เฉพาะที่ไม่ได้ยกเลิก) — ใช้ในประวัติใช้บริการ */
export async function listSalesByCustomer(customerId: string): Promise<PosSale[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("pos_sales")
      .select("*").eq("tenant_id", requireTenantId())
      .eq("customer_id", customerId)
      .eq("status", "paid")
      .order("created_at", { ascending: false });
    return error ? [] : ((data as SaleRow[] | null) || []).map(saleFromRow);
  }
  return [...memSales.values()]
    .filter((s) => s.customerId === customerId && s.status === "paid")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSale(id: string): Promise<PosSale | null> {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb.from("pos_sales").select("*").eq("tenant_id", requireTenantId()).eq("id", id).maybeSingle();
    return data ? saleFromRow(data as SaleRow) : null;
  }
  return memSales.get(id) || null;
}

export type SaleInput = {
  items: { productId?: string; name?: string; price?: number; qty?: number }[];
  discount?: number;
  method: PosMethod;
  cashReceived?: number;
  customerId?: string;
  customerName?: string;
  note?: string;
};

export type SaleError =
  | { error: "empty" }
  | { error: "bad_method" }
  | { error: "not_enough_cash"; total: number }
  | { error: "out_of_stock"; name: string; stock: number };

/** ปิดบิลขาย: ตรวจราคา/สต็อกจากฝั่งเซิร์ฟเวอร์ ตัดสต็อก แล้วลงรายรับ */
export async function createSale(input: SaleInput): Promise<{ sale: PosSale } | SaleError> {
  if (!(["cash", "promptpay", "transfer"] as string[]).includes(input.method)) return { error: "bad_method" };

  const products = new Map((await listProducts(true)).map((p) => [p.id, p]));
  const items: PosSaleItem[] = [];
  const need = new Map<string, number>();
  for (const raw of input.items || []) {
    const qty = Math.max(1, Math.round(Number(raw.qty) || 1));
    const p = raw.productId ? products.get(raw.productId) : undefined;
    if (raw.productId && !p) continue;
    // สินค้าในระบบใช้ชื่อ/ราคาจากระบบ (กันแก้ราคาจากหน้าจอ) · รายการพิมพ์เองใช้ตามที่กรอก
    const name = p ? p.name : String(raw.name || "").trim().slice(0, 120);
    const price = p ? p.price : money(raw.price);
    if (!name) continue;
    items.push({ productId: p?.id, name, price, qty });
    if (p?.trackStock) need.set(p.id, (need.get(p.id) || 0) + qty);
  }
  if (!items.length) return { error: "empty" };

  for (const [id, qty] of need) {
    const p = products.get(id)!;
    if (p.stock < qty) return { error: "out_of_stock", name: p.name, stock: p.stock };
  }

  const subtotal = money(items.reduce((s, i) => s + i.price * i.qty, 0));
  const discount = Math.min(subtotal, money(input.discount));
  const total = money(subtotal - discount);
  let cashReceived: number | undefined;
  let change: number | undefined;
  if (input.method === "cash") {
    cashReceived = input.cashReceived != null && input.cashReceived !== 0 ? money(input.cashReceived) : total;
    if (cashReceived < total) return { error: "not_enough_cash", total };
    change = money(cashReceived - total);
  }

  const date = bangkokToday();
  const seq = (await listSales(date)).length + 1;
  const sale: PosSale = {
    id: rid("PS"),
    no: `POS${date.slice(2).replace(/-/g, "")}-${String(seq).padStart(3, "0")}`,
    date,
    items,
    subtotal,
    discount,
    total,
    method: input.method,
    cashReceived,
    change,
    customerId: input.customerId || undefined,
    customerName: input.customerName?.trim() || undefined,
    note: input.note?.trim().slice(0, 300) || undefined,
    status: "paid",
    createdAt: now(),
  };

  const sb = getSupabase();
  if (sb) {
    const { error } = await withPosTables(() =>
      sb.from("pos_sales").insert({
        tenant_id: requireTenantId(),
        id: sale.id,
        no: sale.no,
        date: sale.date,
        items: sale.items,
        subtotal: sale.subtotal,
        discount: sale.discount,
        total: sale.total,
        method: sale.method,
        cash_received: sale.cashReceived ?? null,
        change: sale.change ?? null,
        customer_id: sale.customerId || null,
        customer_name: sale.customerName || null,
        note: sale.note || null,
        status: sale.status,
        created_at: sale.createdAt,
      })
    );
    if (error) throw new Error((error as { message?: string }).message || "save_failed");
  } else {
    memSales.set(sale.id, sale);
  }

  for (const [id, qty] of need) {
    const p = products.get(id)!;
    await setStock(id, p.stock - qty);
    await recordMove({ productId: id, qty: -qty, reason: "sale", refId: sale.id });
  }

  if (total > 0) {
    const { addFinanceEntry } = await import("./finance-store");
    await addFinanceEntry({
      type: "income",
      amount: total,
      category: "ขายหน้าร้าน",
      description: `${sale.no} · ${items.map((i) => (i.qty > 1 ? `${i.name} x${i.qty}` : i.name)).join(", ")} (${POS_METHOD_LABELS[sale.method]})`,
      date,
      customerId: sale.customerId,
      invoiceId: sale.id,
    });
  }
  return { sale };
}

/** รายการในบิลคิดเงินที่เป็นสินค้าหน้าร้าน (kind "product" + productId) */
type BillLine = { kind?: string; productId?: string; qty?: number };

/** นับจำนวนสินค้าหน้าร้านในบิล — รวมตาม productId */
function billProductQty(items: BillLine[] = []): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    if (it.kind !== "product" || !it.productId) continue;
    const qty = Math.max(1, Math.round(Number(it.qty) || 1));
    m.set(it.productId, (m.get(it.productId) || 0) + qty);
  }
  return m;
}

/**
 * ตรวจว่าสต็อกพอไหม ถ้าบิลเปลี่ยนรายการจาก before เป็น after
 * (ไม่แตะสต็อก — ใช้เช็คก่อนบันทึกบิล)
 */
export async function checkBillStock(
  before: BillLine[] = [],
  after: BillLine[] = []
): Promise<{ ok: true } | { ok: false; name: string; stock: number }> {
  const prev = billProductQty(before);
  const next = billProductQty(after);
  for (const [id, qty] of next) {
    const extra = qty - (prev.get(id) || 0);
    if (extra <= 0) continue;
    const p = await getProduct(id);
    if (p?.trackStock && p.stock < extra) return { ok: false, name: p.name, stock: p.stock };
  }
  return { ok: true };
}

/**
 * ตัด/คืนสต็อกตามส่วนต่างของรายการบิลคิดเงิน (ออกบิล = before ว่าง, ลบบิล = after ว่าง)
 * รายรับไม่ลงที่นี่ — บิลคิดเงินลงรายรับเองตอนรับเงินอยู่แล้ว
 */
export async function syncBillStock(refId: string, before: BillLine[] = [], after: BillLine[] = []) {
  const prev = billProductQty(before);
  const next = billProductQty(after);
  for (const id of new Set([...prev.keys(), ...next.keys()])) {
    const delta = (next.get(id) || 0) - (prev.get(id) || 0);
    if (!delta) continue;
    const p = await getProduct(id);
    if (!p?.trackStock) continue;
    await setStock(id, p.stock - delta);
    await recordMove({
      productId: id,
      qty: -delta,
      reason: delta > 0 ? "sale" : "void",
      refId,
      note: "บิลคิดเงิน",
    });
  }
}

/** ยกเลิกบิลขาย: คืนสต็อก + ลบรายรับของบิลนี้ */
export async function voidSale(id: string): Promise<PosSale | null> {
  const sale = await getSale(id);
  if (!sale || sale.status === "void") return sale;
  const voidedAt = now();
  const sb = getSupabase();
  if (sb) {
    await sb.from("pos_sales").update({ status: "void", voided_at: voidedAt }).eq("tenant_id", requireTenantId()).eq("id", id);
  } else {
    memSales.set(id, { ...sale, status: "void", voidedAt });
  }
  const back = new Map<string, number>();
  for (const i of sale.items) if (i.productId) back.set(i.productId, (back.get(i.productId) || 0) + i.qty);
  for (const [pid, qty] of back) {
    const p = await getProduct(pid);
    if (!p || !p.trackStock) continue;
    await setStock(pid, p.stock + qty);
    await recordMove({ productId: pid, qty, reason: "void", refId: id });
  }
  const { deleteFinanceByInvoice } = await import("./finance-store");
  await deleteFinanceByInvoice(id);
  return { ...sale, status: "void", voidedAt };
}

// ── ปิดยอดรายวัน ───────────────────────────────────────

export async function dayTotals(date: string): Promise<DayTotals> {
  const sales = (await listSales(date)).filter((s) => s.status === "paid");
  const pos: Record<PosMethod, number> = { cash: 0, promptpay: 0, transfer: 0 };
  for (const s of sales) pos[s.method] = money(pos[s.method] + s.total);

  const services = { cash: 0, transfer: 0, member_credit: 0 };
  let servicesCount = 0;
  const { listInvoices } = await import("./invoices-store");
  for (const inv of await listInvoices()) {
    if (inv.status !== "paid" || inv.deletedAt || !inv.paidAt) continue;
    if (inv.paidAt.slice(0, 10) !== date) continue;
    // มัดจำที่รับไว้ก่อนวันนี้ไม่ได้เข้าลิ้นชักวันนี้ — นับเฉพาะยอดที่เก็บตอนปิดบิล
    const depositEarlier =
      inv.deposit > 0 && (!inv.depositReceivedAt || inv.depositReceivedAt.slice(0, 10) !== date);
    const amount = money(inv.total - (depositEarlier ? inv.deposit : 0));
    const m = inv.paymentMethod || "transfer";
    services[m] = money(services[m] + amount);
    servicesCount++;
  }
  return { pos, posCount: sales.length, services, servicesCount };
}

type ClosingRow = {
  id: string;
  date: string;
  expected_cash: number | string;
  counted_cash: number | string;
  diff: number | string;
  opening_cash: number | string;
  totals: DayTotals;
  note: string | null;
  created_at: string;
};

function closingFromRow(r: ClosingRow): PosClosing {
  return {
    id: r.id,
    date: r.date,
    expectedCash: Number(r.expected_cash) || 0,
    countedCash: Number(r.counted_cash) || 0,
    diff: Number(r.diff) || 0,
    openingCash: Number(r.opening_cash) || 0,
    totals: r.totals,
    note: r.note || undefined,
    createdAt: r.created_at,
  };
}

export async function getClosing(date: string): Promise<PosClosing | null> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from("pos_closings").select("*").eq("tenant_id", requireTenantId()).eq("date", date).maybeSingle();
    return !error && data ? closingFromRow(data as ClosingRow) : null;
  }
  return memClosings.get(date) || null;
}

export async function listClosings(limit = 14): Promise<PosClosing[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("pos_closings")
      .select("*").eq("tenant_id", requireTenantId())
      .order("date", { ascending: false })
      .limit(limit);
    return error ? [] : ((data as ClosingRow[] | null) || []).map(closingFromRow);
  }
  return [...memClosings.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

/** บันทึกปิดยอด — วันละ 1 รายการ ปิดซ้ำ = แก้ทับ (นับเงินใหม่ได้) */
export async function closeDay(input: {
  date?: string;
  openingCash?: number;
  countedCash: number;
  note?: string;
}): Promise<PosClosing> {
  const date = input.date || bangkokToday();
  const totals = await dayTotals(date);
  const openingCash = money(input.openingCash);
  const expectedCash = money(openingCash + totals.pos.cash + totals.services.cash);
  const countedCash = money(input.countedCash);
  const prev = await getClosing(date);
  const c: PosClosing = {
    id: prev?.id || rid("PC"),
    date,
    expectedCash,
    countedCash,
    diff: Math.round((countedCash - expectedCash) * 100) / 100,
    openingCash,
    totals,
    note: input.note?.trim().slice(0, 300) || undefined,
    createdAt: now(),
  };
  const sb = getSupabase();
  if (sb) {
    const { error } = await withPosTables(() =>
      sb.from("pos_closings").upsert(
        {
          tenant_id: requireTenantId(),
          id: c.id,
          date: c.date,
          expected_cash: c.expectedCash,
          counted_cash: c.countedCash,
          diff: c.diff,
          opening_cash: c.openingCash,
          totals: c.totals,
          note: c.note || null,
          created_at: c.createdAt,
        },
        { onConflict: "tenant_id,date" }
      )
    );
    if (error) throw new Error((error as { message?: string }).message || "save_failed");
  } else {
    memClosings.set(date, c);
  }
  return c;
}
