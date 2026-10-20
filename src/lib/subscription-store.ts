import { getDirectoryDb } from "./supabase/server";
import { ensureMigration } from "./migrations";
import { clearTenantGateCache, extendDueDate, isMissingDueDate } from "./tenant-billing";

/**
 * ค่าบริการ PetFlow ที่ร้านจ่ายให้แพลตฟอร์ม (ไม่ใช่บิลลูกค้าของร้าน)
 *
 * ร้านเลือกแพ็กเกจ (รายเดือน/รายปี) โอนเงิน แล้วอัปสลิปในหลังบ้าน → tenant_payments สถานะ pending
 * ผู้ดูแลระบบกดอนุมัติที่ /platform → เลื่อน tenants.due_date ไปตามแพ็กเกจ ร้านเปิดใช้ต่อทันที
 * ราคา + บัญชีรับเงินเก็บใน platform_settings (key "billing") ตั้งจากหน้า /platform
 * ข้อมูลระดับแพลตฟอร์มทั้งหมด (getDirectoryDb) — ร้านเห็นได้เฉพาะของตัวเองผ่าน /api/subscription
 */

export type Plan = "month" | "year";
export const PLAN_MONTHS: Record<Plan, number> = { month: 1, year: 12 };
export const PLAN_LABEL: Record<Plan, string> = { month: "รายเดือน", year: "รายปี" };

export type BillingSettings = {
  monthly: number;
  yearly: number;
  bankName: string;
  accountName: string;
  accountNo: string;
  promptpay: string;
  note: string;
};

export const DEFAULT_BILLING: BillingSettings = {
  monthly: 0,
  yearly: 0,
  bankName: "",
  accountName: "",
  accountNo: "",
  promptpay: "",
  note: "",
};

export type TenantPayment = {
  id: string;
  tenantId: string;
  plan: Plan;
  amount: number;
  slipUrl: string;
  note: string;
  status: "pending" | "approved" | "rejected";
  dueBefore: string | null;
  dueAfter: string | null;
  decidedNote: string;
  createdAt: string;
  decidedAt: string | null;
};

type PaymentRow = {
  id: string;
  tenant_id: string;
  plan: string;
  amount: number | string;
  slip_url: string | null;
  note: string | null;
  status: string;
  due_before: string | null;
  due_after: string | null;
  decided_note: string | null;
  created_at: string;
  decided_at: string | null;
};

function rowToPayment(r: PaymentRow): TenantPayment {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    plan: r.plan === "year" ? "year" : "month",
    amount: Number(r.amount) || 0,
    slipUrl: r.slip_url || "",
    note: r.note || "",
    status: r.status === "approved" || r.status === "rejected" ? r.status : "pending",
    dueBefore: r.due_before,
    dueAfter: r.due_after,
    decidedNote: r.decided_note || "",
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  };
}

/** ตาราง/คอลัมน์ยังไม่มี — ยังไม่เคยรัน migration subscriptions.setup */
function isMissingSchema(msg: string) {
  return (
    /(platform_settings|tenant_payments|due_date)/i.test(msg) &&
    /(does not exist|could not find|schema cache|PGRST204|PGRST205|42P01|42703)/i.test(msg)
  );
}

/** รัน query ถ้าตารางยังไม่มี สร้างให้แล้วลองใหม่ครั้งเดียว */
async function withSchema<T extends { error: { message: string } | null }>(run: () => PromiseLike<T>): Promise<T> {
  let res = await run();
  if (res.error && isMissingSchema(res.error.message) && (await ensureMigration("subscriptions.setup"))) {
    res = await run();
  }
  return res;
}

function db() {
  const sb = getDirectoryDb();
  if (!sb) throw new Error("ยังไม่ได้เชื่อมฐานข้อมูล");
  return sb;
}

export async function getBillingSettings(): Promise<BillingSettings> {
  const sb = getDirectoryDb();
  if (!sb) return DEFAULT_BILLING;
  const { data, error } = await withSchema(() =>
    sb.from("platform_settings").select("value").eq("key", "billing").maybeSingle()
  );
  if (error) return DEFAULT_BILLING;
  return { ...DEFAULT_BILLING, ...((data?.value as Partial<BillingSettings>) || {}) };
}

export async function saveBillingSettings(input: Partial<BillingSettings>): Promise<BillingSettings> {
  const value: BillingSettings = {
    monthly: Math.max(0, Number(input.monthly) || 0),
    yearly: Math.max(0, Number(input.yearly) || 0),
    bankName: String(input.bankName || "").slice(0, 100),
    accountName: String(input.accountName || "").slice(0, 100),
    accountNo: String(input.accountNo || "").slice(0, 50),
    promptpay: String(input.promptpay || "").slice(0, 50),
    note: String(input.note || "").slice(0, 500),
  };
  const sb = db();
  const { error } = await withSchema(() =>
    sb.from("platform_settings").upsert({ key: "billing", value, updated_at: new Date().toISOString() })
  );
  if (error) throw new Error(error.message);
  return value;
}

/** วันครบกำหนด + สถานะของร้าน (อ่านตรง ไม่ผ่าน cache) */
export async function getTenantBilling(
  tenantId: string
): Promise<{ name: string; status: string; dueDate: string | null } | null> {
  const sb = getDirectoryDb();
  if (!sb) return null;
  const q = (cols: string) => sb.from("tenants").select(cols).eq("id", tenantId).maybeSingle();
  let { data, error } = await q("name, status, due_date");
  if (error && isMissingDueDate(error.message)) ({ data, error } = await q("name, status"));
  if (error || !data) return null;
  const row = data as unknown as { name: string; status: string; due_date?: string | null };
  return { name: row.name, status: row.status, dueDate: row.due_date || null };
}

export async function listPayments(filter: { tenantId?: string; limit?: number } = {}): Promise<TenantPayment[]> {
  const sb = getDirectoryDb();
  if (!sb) return [];
  const { data, error } = await withSchema(() => {
    let q = sb.from("tenant_payments").select("*").order("created_at", { ascending: false }).limit(filter.limit || 100);
    if (filter.tenantId) q = q.eq("tenant_id", filter.tenantId);
    return q;
  });
  if (error) {
    if (isMissingSchema(error.message)) return [];
    throw new Error(error.message);
  }
  return ((data || []) as PaymentRow[]).map(rowToPayment);
}

export async function getPayment(id: string): Promise<TenantPayment | null> {
  const sb = db();
  const { data, error } = await withSchema(() => sb.from("tenant_payments").select("*").eq("id", id).maybeSingle());
  if (error) throw new Error(error.message);
  return data ? rowToPayment(data as PaymentRow) : null;
}

export async function createPayment(input: {
  id: string;
  tenantId: string;
  plan: Plan;
  amount: number;
  slipUrl: string;
  note: string;
}): Promise<void> {
  const sb = db();
  const { error } = await withSchema(() =>
    sb.from("tenant_payments").insert({
      id: input.id,
      tenant_id: input.tenantId,
      plan: input.plan,
      amount: input.amount,
      slip_url: input.slipUrl,
      note: input.note,
      status: "pending",
    })
  );
  if (error) throw new Error(error.message);
}

/**
 * อนุมัติ/ไม่อนุมัติสลิป — อนุมัติแล้วต่ออายุร้านตามแพ็กเกจ (ต่อจากวันครบกำหนดเดิม ดู extendDueDate)
 * ทดลองใช้อยู่ = เปลี่ยนเป็นใช้งานจริงด้วย · ร้านที่ผู้ดูแลระบบระงับเองไม่ถูกเปิดให้อัตโนมัติ
 */
export async function decidePayment(
  id: string,
  approve: boolean,
  decidedNote: string
): Promise<TenantPayment> {
  const sb = db();
  const p = await getPayment(id);
  if (!p) throw new Error("ไม่พบรายการนี้");
  if (p.status !== "pending") throw new Error("รายการนี้ตัดสินไปแล้ว");
  const now = new Date().toISOString();

  if (!approve) {
    const { error } = await sb
      .from("tenant_payments")
      .update({ status: "rejected", decided_note: decidedNote, decided_at: now })
      .eq("id", id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ...p, status: "rejected", decidedNote, decidedAt: now };
  }

  const t = await getTenantBilling(p.tenantId);
  if (!t) throw new Error("ไม่พบร้านนี้");
  // กันกดอนุมัติซ้ำสองแท็บ — เปลี่ยนสถานะก่อน ถ้าไม่มีแถวไหนเปลี่ยน = มีคนอนุมัติไปแล้ว
  const dueAfter = extendDueDate(t.dueDate, PLAN_MONTHS[p.plan]);
  const { data: claimed, error: claimErr } = await sb
    .from("tenant_payments")
    .update({ status: "approved", decided_note: decidedNote, decided_at: now, due_before: t.dueDate, due_after: dueAfter })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed?.length) throw new Error("รายการนี้ตัดสินไปแล้ว");

  const update: Record<string, unknown> = { due_date: dueAfter };
  if (t.status === "trial") update.status = "active";
  const { error } = await sb.from("tenants").update(update).eq("id", p.tenantId);
  if (error) throw new Error(error.message);
  clearTenantGateCache();
  return { ...p, status: "approved", decidedNote, decidedAt: now, dueBefore: t.dueDate, dueAfter };
}
