import { getSupabase } from "./supabase/server";
import { requireTenantId } from "./tenant-context";
import { ensureMigration } from "./migrations";
import { listBookings } from "./bookings-store";
import { listInvoices } from "./invoices-store";
import { listBookingOps } from "./booking-ops-store";
import { addFinanceEntry, listFinance } from "./finance-store";

/**
 * เงินเดือนพนักงาน + ค่าคอม — คิดให้เองทุกเดือนจากงานที่ทำจริง
 *
 * - เงินเดือนฐาน (ต่อเดือน)
 * - ค่าคอมอาบน้ำ: % ของยอดอาบน้ำในบิลที่จ่ายแล้ว + บาทต่อตัวที่อาบเสร็จ
 *   ช่างของแต่ละตัวมาจากบอร์ดคิว (booking_ops.groomer)
 * - กด "จ่ายเงินเดือน" = ลงรายจ่ายในรายรับ-รายจ่ายให้เอง (หมวด เงินเดือนพนักงาน)
 *
 * ตารางแยก ไม่เก็บใน site_config เพราะ config เปิดให้แอปลูกค้าอ่านได้ — เงินเดือนต้องไม่หลุด
 */
export type PayrollEmployee = {
  id: string;
  name: string;
  /** เงินเดือนฐานต่อเดือน (บาท) */
  baseSalary: number;
  /** % ของยอดอาบน้ำที่ทำ (บิลที่จ่ายแล้ว) */
  groomCommissionPct: number;
  /** บาทต่อตัวที่อาบเสร็จ */
  groomCommissionPerCat: number;
  active: boolean;
  createdAt: string;
};

type EmployeeRow = {
  id: string;
  name: string;
  base_salary: number | string | null;
  groom_commission_pct: number | string | null;
  groom_commission_per_cat: number | string | null;
  active: boolean | null;
  created_at: string;
};

export const PAYROLL_CATEGORY = "เงินเดือนพนักงาน";

const mem: PayrollEmployee[] = [];

function rowToEmployee(r: EmployeeRow): PayrollEmployee {
  return {
    id: r.id,
    name: r.name,
    baseSalary: Number(r.base_salary) || 0,
    groomCommissionPct: Number(r.groom_commission_pct) || 0,
    groomCommissionPerCat: Number(r.groom_commission_per_cat) || 0,
    active: r.active !== false,
    createdAt: r.created_at,
  };
}

export async function listEmployees(): Promise<PayrollEmployee[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("payroll_employees")
      .select("*")
      .eq("tenant_id", requireTenantId())
      .order("created_at", { ascending: true });
    if (error) return [];
    return ((data as EmployeeRow[] | null) || []).map(rowToEmployee);
  }
  return [...mem];
}

function cleanNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function saveEmployee(
  data: Partial<PayrollEmployee> & { name: string }
): Promise<PayrollEmployee | null> {
  const emp: PayrollEmployee = {
    id: data.id || `EMP${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    name: data.name.trim(),
    baseSalary: cleanNum(data.baseSalary),
    groomCommissionPct: Math.min(100, cleanNum(data.groomCommissionPct)),
    groomCommissionPerCat: cleanNum(data.groomCommissionPerCat),
    active: data.active !== false,
    createdAt: data.createdAt || new Date().toISOString(),
  };
  if (!emp.name) return null;

  const sb = getSupabase();
  if (!sb) {
    const i = mem.findIndex((x) => x.id === emp.id);
    if (i >= 0) mem[i] = emp;
    else mem.push(emp);
    return emp;
  }
  const row = {
    id: emp.id,
    tenant_id: requireTenantId(),
    name: emp.name,
    base_salary: emp.baseSalary,
    groom_commission_pct: emp.groomCommissionPct,
    groom_commission_per_cat: emp.groomCommissionPerCat,
    active: emp.active,
    created_at: emp.createdAt,
  };
  // แก้ของร้านอื่นไม่ได้ — id ที่มีอยู่แล้วต้องเป็นของร้านนี้
  if (data.id) {
    const { data: existing } = await sb
      .from("payroll_employees")
      .select("id")
      .eq("id", data.id)
      .eq("tenant_id", requireTenantId())
      .maybeSingle();
    if (!existing) return null;
  }
  let { error } = await sb.from("payroll_employees").upsert(row);
  if (error && (await ensureMigration("payroll_employees.setup"))) {
    ({ error } = await sb.from("payroll_employees").upsert(row));
  }
  return error ? null : emp;
}

export async function deleteEmployee(id: string) {
  const sb = getSupabase();
  if (!sb) {
    const i = mem.findIndex((x) => x.id === id);
    if (i >= 0) mem.splice(i, 1);
    return true;
  }
  const { error } = await sb
    .from("payroll_employees")
    .delete()
    .eq("id", id)
    .eq("tenant_id", requireTenantId());
  return !error;
}

export type PayrollLine = {
  employee: PayrollEmployee;
  /** จำนวนตัวที่อาบเสร็จในเดือน */
  groomCats: number;
  /** ยอดอาบน้ำ (บิลจ่ายแล้ว) ของตัวที่ช่างคนนี้ทำ */
  groomRevenue: number;
  commission: number;
  total: number;
  /** ลงรายจ่ายเดือนนี้ไปแล้ว */
  paidAmount?: number;
  paidOn?: string;
};

/** แท็กที่ซ่อนในคำอธิบายรายจ่าย — ไว้รู้ว่าจ่ายเงินเดือนคนนี้ของเดือนนี้ไปแล้ว */
function payrollTag(employeeId: string, month: string) {
  return `[payroll:${employeeId}:${month}]`;
}

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

type GroomBooking = Awaited<ReturnType<typeof listBookings>>[number];
type AnyInvoice = Awaited<ReturnType<typeof listInvoices>>[number];

/**
 * ยอดอาบน้ำต่อนัด (บิลที่จ่ายแล้ว) — บิลหนึ่งใบอาจรวมทั้งบ้าน: จับคู่บรรทัดอาบน้ำกับแมวตามชื่อ
 * (บรรทัดที่ไม่ระบุชื่อแมว นับให้นัดที่ผูกกับบิล) · ใช้ทั้งค่าคอมและหน้าผลงานพนักงาน
 */
export function groomRevenueByBooking(bookings: GroomBooking[], invoices: AnyInvoice[]) {
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const revenueOf = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.status !== "paid" || inv.deletedAt || !inv.bookingId) continue;
    const anchor = byId.get(inv.bookingId);
    if (!anchor) continue;
    const household = bookings.filter(
      (b) =>
        b.service === "groom" &&
        b.customerName === anchor.customerName &&
        (b.date || "") === (anchor.date || "")
    );
    for (const it of inv.items || []) {
      if (it.kind !== "grooming") continue;
      const target =
        (it.catName && household.find((b) => b.catName === it.catName)) || anchor;
      revenueOf.set(target.id, (revenueOf.get(target.id) || 0) + (Number(it.amount) || 0));
    }
  }
  return revenueOf;
}

/** สรุปเงินเดือน + ค่าคอมของเดือน (YYYY-MM) */
export async function computePayroll(month: string): Promise<PayrollLine[]> {
  const { from, to } = monthRange(month);
  const [employees, bookings, invoices, finance] = await Promise.all([
    listEmployees(),
    listBookings(),
    listInvoices(),
    listFinance(from, to),
  ]);

  // ตัวที่อาบเสร็จจริงในเดือนนี้ (พร้อมรับกลับ/เสร็จสิ้น)
  const groomed = bookings.filter(
    (b) =>
      b.service === "groom" &&
      (b.status === "ready" || b.status === "done") &&
      (b.date || "") >= from &&
      (b.date || "") <= to
  );
  const ops = await listBookingOps(groomed.map((b) => b.id));
  const groomerOf = new Map(ops.filter((o) => o.groomer).map((o) => [o.bookingId, o.groomer!]));
  const revenueOf = groomRevenueByBooking(bookings, invoices);

  return employees.map((employee) => {
    const mine = groomed.filter((b) => groomerOf.get(b.id) === employee.id);
    const groomRevenue = mine.reduce((s, b) => s + (revenueOf.get(b.id) || 0), 0);
    const commission = Math.round(
      (groomRevenue * employee.groomCommissionPct) / 100 + mine.length * employee.groomCommissionPerCat
    );
    const paid = finance.filter(
      (r) => r.type === "expense" && r.description.includes(payrollTag(employee.id, month))
    );
    return {
      employee,
      groomCats: mine.length,
      groomRevenue,
      commission,
      total: Math.round(employee.baseSalary) + commission,
      paidAmount: paid.length ? paid.reduce((s, r) => s + r.amount, 0) : undefined,
      paidOn: paid[0]?.date,
    };
  });
}

/** ลงรายจ่ายเงินเดือนของคนนี้ เดือนนี้ — กันลงซ้ำด้วยแท็กในคำอธิบาย */
export async function payPayroll(
  employeeId: string,
  month: string,
  opts: { bonus?: number; deduction?: number; date: string }
) {
  const lines = await computePayroll(month);
  const line = lines.find((l) => l.employee.id === employeeId);
  if (!line) return { ok: false as const, error: "ไม่พบพนักงาน" };
  if (line.paidAmount !== undefined) return { ok: false as const, error: "จ่ายเดือนนี้ไปแล้ว" };
  const bonus = cleanNum(opts.bonus);
  const deduction = cleanNum(opts.deduction);
  const amount = line.total + bonus - deduction;
  if (amount <= 0) return { ok: false as const, error: "ยอดสุทธิต้องมากกว่า 0" };
  const [y, m] = month.split("-");
  const parts = [
    `ฐาน ${line.employee.baseSalary.toLocaleString()}`,
    line.commission ? `คอม ${line.commission.toLocaleString()}` : "",
    bonus ? `โบนัส ${bonus.toLocaleString()}` : "",
    deduction ? `หัก ${deduction.toLocaleString()}` : "",
  ].filter(Boolean);
  await addFinanceEntry({
    type: "expense",
    amount,
    category: PAYROLL_CATEGORY,
    description: `เงินเดือน ${line.employee.name} ${m}/${y} (${parts.join(" + ")}) ${payrollTag(employeeId, month)}`,
    date: opts.date,
  });
  return { ok: true as const, amount };
}
