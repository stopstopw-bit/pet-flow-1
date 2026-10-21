import type { CustomerRecord } from "./customers-store";
import { customerSummary, getCustomer, listCustomers, updateCustomer } from "./customers-store";
import { getSiteConfig } from "./config-store";
import { pushLineMessage, politeName } from "./line";

export type InactiveCustomerInfo = {
  customer: CustomerRecord;
  lastVisitDate: string | null;
  daysSinceVisit: number | null;
  visits: number;
  hasLine: boolean;
  canFollowUp: boolean;
  lastFollowUpAt?: string;
};

function daysBetween(from: string, to = new Date()) {
  const a = new Date(from.slice(0, 10));
  const b = new Date(to.toISOString().slice(0, 10));
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function maxDate(dates: (string | undefined | null)[]) {
  const valid = dates.map((d) => d?.slice(0, 10)).filter(Boolean) as string[];
  if (!valid.length) return null;
  return valid.sort().at(-1)!;
}

/** วันที่มาใช้บริการล่าสุด — จาก service records + นัดที่ยืนยันแล้ว */
export async function getCustomerLastVisitDate(customerId: string): Promise<string | null> {
  const summary = await customerSummary(customerId);
  if (!summary) return null;

  const serviceDates = summary.history.services.map((s) => s.date);
  const today = new Date().toISOString().slice(0, 10);
  const bookingDates = summary.history.bookings
    .filter((b) => b.status === "confirmed")
    .map((b) => b.date || b.checkin)
    .filter((d) => d && d <= today);

  return maxDate([...serviceDates, ...bookingDates]);
}

export function formatFollowUpMessage(
  template: string,
  data: { name: string; days: number; cats: string; shop?: string }
) {
  return template
    .replace(/\{name\}/g, data.name)
    .replace(/\{days\}/g, String(data.days))
    .replace(/\{(cats|pets)\}/g, data.cats)
    .replace(/\{shop\}/g, data.shop || "");
}

export function canSendFollowUp(
  customer: Pick<CustomerRecord, "lineUserId" | "lastFollowUpAt">,
  cooldownDays: number,
  now = new Date()
) {
  if (!customer.lineUserId) return false;
  if (!customer.lastFollowUpAt) return true;
  const days = daysBetween(customer.lastFollowUpAt, now);
  return days >= cooldownDays;
}

export async function listInactiveCustomers(
  inactiveDays?: number,
  now = new Date()
): Promise<InactiveCustomerInfo[]> {
  const config = await getSiteConfig();
  const threshold = inactiveDays ?? config.crm.inactiveDays;
  const cooldown = config.crm.followUpCooldownDays;
  const customers = await listCustomers();
  const results: InactiveCustomerInfo[] = [];

  for (const customer of customers) {
    const summary = await customerSummary(customer.id);
    const visits = summary?.visits ?? 0;
    const lastVisitDate = await getCustomerLastVisitDate(customer.id);
    const daysSinceVisit = lastVisitDate ? daysBetween(lastVisitDate, now) : null;

    const isInactive =
      visits > 0 &&
      lastVisitDate != null &&
      daysSinceVisit != null &&
      daysSinceVisit >= threshold;

    if (!isInactive) continue;

    results.push({
      customer,
      lastVisitDate,
      daysSinceVisit,
      visits,
      hasLine: Boolean(customer.lineUserId),
      canFollowUp: canSendFollowUp(customer, cooldown, now),
      lastFollowUpAt: customer.lastFollowUpAt,
    });
  }

  return results.sort((a, b) => (b.daysSinceVisit ?? 0) - (a.daysSinceVisit ?? 0));
}

export async function sendCustomerFollowUp(
  customerId: string,
  options?: { message?: string; force?: boolean }
): Promise<
  | { ok: true; message: string; customer: CustomerRecord }
  | { ok: false; error: string }
> {
  const customer = await getCustomer(customerId);
  if (!customer) return { ok: false, error: "ไม่พบลูกค้า" };
  if (!customer.lineUserId) {
    return { ok: false, error: "ลูกค้ายังไม่ได้ผูก LINE — ส่งข้อความไม่ได้" };
  }

  const config = await getSiteConfig();
  if (!options?.force && !canSendFollowUp(customer, config.crm.followUpCooldownDays)) {
    return {
      ok: false,
      error: `เคยส่งตามแล้ว — รอ ${config.crm.followUpCooldownDays} วันก่อนส่งซ้ำ`,
    };
  }

  const lastVisitDate = await getCustomerLastVisitDate(customerId);
  const daysSinceVisit = lastVisitDate ? daysBetween(lastVisitDate) : config.crm.inactiveDays;
  const cats = customer.cats.map((c) => c.name).join(", ");
  const template = options?.message?.trim() || config.crm.followUpMessage;
  const text = formatFollowUpMessage(template, {
    name: politeName(customer.name),
    days: daysSinceVisit,
    cats,
    shop: config.business.name,
  });

  await pushLineMessage(customer.lineUserId, [{ type: "text", text }]);

  const now = new Date().toISOString();
  const updated = await updateCustomer(customerId, { lastFollowUpAt: now });
  if (!updated) return { ok: false, error: "บันทึกไม่สำเร็จ" };

  return { ok: true, message: text, customer: updated };
}

export async function sendInactiveFollowUps(options?: {
  inactiveDays?: number;
  limit?: number;
  force?: boolean;
}) {
  const inactive = await listInactiveCustomers(options?.inactiveDays);
  const eligible = inactive.filter((x) => x.hasLine && (options?.force || x.canFollowUp));
  const batch = options?.limit ? eligible.slice(0, options.limit) : eligible;

  const sent: string[] = [];
  const errors: { id: string; name: string; error: string }[] = [];

  for (const row of batch) {
    const result = await sendCustomerFollowUp(row.customer.id, { force: options?.force });
    if (result.ok) sent.push(row.customer.id);
    else errors.push({ id: row.customer.id, name: row.customer.name, error: result.error });
  }

  return { sent: sent.length, total: batch.length, eligible: eligible.length, errors };
}

/** สรุปกิจกรรมลูกค้า — ใช้ใน admin / telegram */
export async function customerActivityInfo(customerId: string) {
  const summary = await customerSummary(customerId);
  if (!summary) return null;
  const lastVisitDate = await getCustomerLastVisitDate(customerId);
  const config = await getSiteConfig();
  const daysSinceVisit = lastVisitDate ? daysBetween(lastVisitDate) : null;
  const inactive =
    summary.visits > 0 &&
    daysSinceVisit != null &&
    daysSinceVisit >= config.crm.inactiveDays;

  return {
    ...summary,
    lastVisitDate,
    daysSinceVisit,
    inactive,
    canFollowUp: canSendFollowUp(summary.customer, config.crm.followUpCooldownDays),
  };
}

/** นับลูกค้าที่หายไปนาน (สำหรับ dashboard / telegram) */
export async function inactiveCustomerStats() {
  const inactive = await listInactiveCustomers();
  return {
    total: inactive.length,
    withLine: inactive.filter((x) => x.hasLine).length,
    canFollowUp: inactive.filter((x) => x.canFollowUp).length,
  };
}
