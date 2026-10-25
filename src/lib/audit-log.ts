import { getDirectoryDb } from "./supabase/server";

/** บันทึกทุก action ที่ผู้ดูแลระบบ (platform) ทำ — โดยเฉพาะ impersonate ต้องมีร่องรอยเสมอ */
export async function logAudit(entry: {
  tenantId?: string | null;
  actorType: "platform" | "tenant";
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  beforeState?: unknown;
  afterState?: unknown;
  impersonationId?: string | null;
}) {
  const sb = getDirectoryDb();
  if (!sb) return;
  await sb.from("audit_logs").insert({
    tenant_id: entry.tenantId || null,
    actor_type: entry.actorType,
    actor_id: entry.actorId,
    action: entry.action,
    resource_type: entry.resourceType,
    resource_id: entry.resourceId || null,
    before_state: entry.beforeState ?? null,
    after_state: entry.afterState ?? null,
    impersonation_id: entry.impersonationId || null,
  });
}

export type AuditRow = {
  id: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  detail?: Record<string, unknown>;
  createdAt: string;
};

/** อ่าน log ล่าสุดของร้านปัจจุบัน — ใช้ในหน้าหลังบ้าน */
export async function listAudit(limit = 200): Promise<AuditRow[]> {
  const sb = getDirectoryDb();
  if (!sb) return [];
  try {
    const { requireTenantId } = await import("./tenant-context");
    const { data } = await sb
      .from("audit_logs")
      .select("*")
      .eq("tenant_id", requireTenantId())
      .order("created_at", { ascending: false })
      .limit(Math.min(500, Math.max(1, limit)));
    return ((data as Record<string, unknown>[] | null) || []).map((r) => ({
      id: String(r.id),
      actor: String(r.actor_id || ""),
      action: String(r.action || ""),
      resourceType: String(r.resource_type || ""),
      resourceId: (r.resource_id as string) || undefined,
      detail: (r.after_state as Record<string, unknown>) || undefined,
      createdAt: String(r.created_at || ""),
    }));
  } catch {
    return [];
  }
}
