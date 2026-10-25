import { getDirectoryDb } from "./supabase/server";
import { hashOwnerCode, hashPassword } from "./auth";
import { getBootstrapTenantId } from "./auth";
import { isTenantOpen, tenantGateById } from "./tenant-billing";

/**
 * ค้นหาร้านข้ามทุกร้าน — ใช้เฉพาะตอนล็อกอิน (หน้าที่ไม่ได้มาจากลิงก์ร้าน)
 * และหน้า /platform (มุมมองผู้ดูแลระบบ ข้ามร้านโดยตั้งใจ) เท่านั้น
 * store function อื่นทุกตัวต้องกรองด้วย tenant_id เสมอ ห้ามใช้ pattern นี้ที่อื่น
 */

type TenantRow = {
  id: string;
  name: string;
  status: string;
  owner_password_hash?: string | null;
  owner_password_salt?: string | null;
};

/**
 * เจ้าของร้าน login ด้วย username + password (มาตรฐานใหม่ — ตั้งผ่าน /platform)
 * ส่ง tenantId มา (ล็อกอินจากลิงก์ร้าน) = เช็คเฉพาะเจ้าของร้านนั้น
 * ไม่ส่ง = ค้นทุกร้าน แต่ต้องตรงแค่ร้านเดียว (username คนละร้านซ้ำกันได้ ถ้าตรงหลายร้านให้ใช้ลิงก์ร้าน)
 */
export async function findTenantByOwnerLogin(
  username: string,
  password: string,
  tenantId?: string
): Promise<{ id: string; name: string; status: string } | null> {
  const sb = getDirectoryDb();
  if (!sb) return null;
  const norm = username.trim().toLowerCase();
  let q = sb
    .from("tenants")
    .select("id, name, status, owner_password_hash, owner_password_salt")
    .eq("owner_username", norm)
    .in("status", ["trial", "active"]);
  if (tenantId) q = q.eq("id", tenantId);
  const { data } = await q.limit(20);
  const matches: { id: string; name: string; status: string }[] = [];
  for (const row of (data as TenantRow[] | null) || []) {
    if (!row.owner_password_hash || !row.owner_password_salt) continue;
    const hash = await hashPassword(password, row.owner_password_salt);
    if (hash === row.owner_password_hash) matches.push({ id: row.id, name: row.name, status: row.status });
  }
  return matches.length === 1 ? matches[0] : null;
}

/**
 * ทางเข้าเดิมก่อน T5 — รหัสร้านช่องเดียวไม่มี username (ร้านที่สร้างก่อนอัปเดตนี้)
 * เก็บไว้เป็น fallback ระหว่างที่ยังไม่ได้ตั้ง username/password ใหม่ให้ครบทุกร้าน
 */
export async function findTenantByLegacyOwnerCode(
  code: string
): Promise<{ id: string; name: string; status: string } | null> {
  const sb = getDirectoryDb();
  if (!sb) return null;
  const hash = await hashOwnerCode(code);
  const { data } = await sb
    .from("tenants")
    .select("id, name, status")
    .eq("owner_code_hash", hash)
    .in("status", ["trial", "active"])
    .limit(1)
    .maybeSingle();
  return data || null;
}

/**
 * ทุกร้านที่ยังใช้งานอยู่ (trial/active) — ใช้เฉพาะ cron ที่ต้องรันแทนทุกร้าน
 * (เตือนนัด, สรุปเช้า/เย็น ฯลฯ) ไม่มี Supabase (dev) = เหลือแค่ร้าน bootstrap เดียว
 */
export async function listActiveTenantIds(): Promise<string[]> {
  const sb = getDirectoryDb();
  const bootstrap = getBootstrapTenantId();
  if (!sb) return bootstrap ? [bootstrap] : [];
  const { data } = await sb.from("tenants").select("id").in("status", ["trial", "active"]);
  const all = (data || []).map((t: { id: string }) => t.id);
  // ร้านที่เลยวันครบกำหนดจ่าย — ไม่ต้องส่งเตือน/สรุปให้
  const gates = await Promise.all(all.map((id) => tenantGateById(id).catch(() => null)));
  const ids = all.filter((_, i) => !gates[i] || isTenantOpen(gates[i]!));
  // ร้าน bootstrap อาจไม่มีแถวใน tenants (ร้านเดิมก่อน multi-tenant) — เติมเข้าไปกันตกหล่น
  if (bootstrap && !ids.includes(bootstrap)) ids.push(bootstrap);
  return ids;
}
