import { getSupabase } from "./supabase/server";
import { requireTenantId } from "./tenant-context";
import type { BirthdayKind } from "./birthday-greeting";

/**
 * คิววันเกิดรอตรวจ — cron คัดกรองแล้วจอดที่นี่ ไม่ส่ง LINE เอง
 * ต้องมีคนกดอนุมัติที่ /admin/birthdays ก่อนถึงจะส่งจริง (คูปองก็แจกตอนกดส่งเท่านั้น)
 */
export type BirthdayGreetingRow = {
  id: string;
  customerId: string;
  customerName: string;
  kind: BirthdayKind;
  catName?: string;
  /** วันที่ตรงวันเกิด "YYYY-MM-DD" — กันคัดซ้ำถ้า cron รันมากกว่าหนึ่งรอบต่อวัน */
  forDate: string;
  status: "pending" | "sent" | "dismissed";
  createdAt: string;
  sentAt?: string;
};

type Row = {
  id: string;
  customer_id: string;
  customer_name: string;
  kind: string;
  cat_name: string | null;
  for_date: string;
  status: string;
  created_at: string;
  sent_at: string | null;
};

const mem: BirthdayGreetingRow[] = [];

function fromRow(r: Row): BirthdayGreetingRow {
  return {
    id: r.id,
    customerId: r.customer_id,
    customerName: r.customer_name,
    kind: r.kind === "owner" ? "owner" : "cat",
    catName: r.cat_name || undefined,
    forDate: r.for_date,
    status: (r.status as BirthdayGreetingRow["status"]) || "pending",
    createdAt: r.created_at,
    sentAt: r.sent_at || undefined,
  };
}

function newId() {
  return `BDG${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/** คัดเข้าคิว — ข้ามถ้าคนนี้/วันนี้เคยคัดไปแล้ว (กันซ้ำเมื่อ cron รันเกินหนึ่งรอบ) */
export async function queueBirthdayGreeting(input: {
  customerId: string;
  customerName: string;
  kind: BirthdayKind;
  catName?: string;
  forDate: string;
}): Promise<{ queued: boolean; row?: BirthdayGreetingRow }> {
  const sb = getSupabase();
  if (sb) {
    const tenantId = requireTenantId();
    const { data: existing } = await sb
      .from("birthday_greetings")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("customer_id", input.customerId)
      .eq("for_date", input.forDate)
      .limit(1);
    if (existing && existing.length > 0) return { queued: false };

    const row: Row = {
      id: newId(),
      customer_id: input.customerId,
      customer_name: input.customerName,
      kind: input.kind,
      cat_name: input.catName || null,
      for_date: input.forDate,
      status: "pending",
      created_at: new Date().toISOString(),
      sent_at: null,
    };
    const { error } = await sb
      .from("birthday_greetings")
      .insert({ ...row, tenant_id: tenantId });
    if (error) return { queued: false };
    return { queued: true, row: fromRow(row) };
  }

  if (mem.some((r) => r.customerId === input.customerId && r.forDate === input.forDate)) {
    return { queued: false };
  }
  const row: BirthdayGreetingRow = {
    id: newId(),
    ...input,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  mem.unshift(row);
  return { queued: true, row };
}

export async function listPendingBirthdays(): Promise<BirthdayGreetingRow[]> {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from("birthday_greetings")
      .select("*")
      .eq("tenant_id", requireTenantId())
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    return ((data as Row[] | null) || []).map(fromRow);
  }
  return mem
    .filter((r) => r.status === "pending")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getBirthdayGreeting(
  id: string
): Promise<BirthdayGreetingRow | undefined> {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from("birthday_greetings")
      .select("*")
      .eq("tenant_id", requireTenantId())
      .eq("id", id)
      .maybeSingle<Row>();
    return data ? fromRow(data) : undefined;
  }
  return mem.find((r) => r.id === id);
}

export async function markBirthdayStatus(
  id: string,
  status: "sent" | "dismissed"
): Promise<void> {
  const now = new Date().toISOString();
  const sb = getSupabase();
  if (sb) {
    await sb
      .from("birthday_greetings")
      .update({ status, sent_at: status === "sent" ? now : null })
      .eq("tenant_id", requireTenantId())
      .eq("id", id);
    return;
  }
  const row = mem.find((r) => r.id === id);
  if (!row) return;
  row.status = status;
  row.sentAt = status === "sent" ? now : undefined;
}

/** เปลี่ยนชื่อน้องในคิวอวยพรวันเกิดของลูกค้า (ดู cat-rename.ts) */
export async function renameCatInBirthdayQueue(
  customerId: string,
  oldName: string,
  newName: string
): Promise<void> {
  const { replaceCatInList } = await import("./cat-rename");
  const sb = getSupabase();
  const tenantId = sb ? requireTenantId() : "";
  const rows: BirthdayGreetingRow[] = sb
    ? (
        ((
          await sb
            .from("birthday_greetings")
            .select("*")
            .eq("customer_id", customerId)
            .eq("tenant_id", tenantId)
        ).data as Row[] | null) || []
      ).map(fromRow)
    : mem.filter((r) => r.customerId === customerId);
  for (const r of rows) {
    if (!r.catName) continue;
    const catName = replaceCatInList(r.catName, oldName, newName);
    if (catName === r.catName) continue;
    if (sb)
      await sb
        .from("birthday_greetings")
        .update({ cat_name: catName })
        .eq("id", r.id)
        .eq("tenant_id", tenantId);
    else r.catName = catName;
  }
}
