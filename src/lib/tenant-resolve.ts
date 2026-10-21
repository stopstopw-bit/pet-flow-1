import type { NextRequest } from "next/server";
import { isTenantOpen, tenantGateBySlug } from "./tenant-billing";
import { getBootstrapTenantId } from "./auth";

/**
 * แปลง "request ของลูกค้า" → tenant_id (ร้านไหน) สำหรับ path-based routing
 *
 * ลูกค้าเข้าผ่าน /s/<slug>/... → middleware ใส่ header x-tenant-slug + cookie pf_tenant
 * ให้ แล้ว rewrite ตัด /s/<slug> ออก (ดู middleware.ts) การเรียก API ต่อ ๆ มาที่ไม่มี
 * prefix /s จะพก cookie pf_tenant ไปเอง — resolver จึงอ่านได้ทั้งจาก header และ cookie
 *
 * ถ้าไม่มี slug เลย (เช่นร้าน bootstrap เดิม/CatCha ที่เข้าตรง /app) → ใช้ TENANT_ID env
 * เพื่อไม่ให้ร้านเดิมพัง (single-tenant fallback)
 */

export const TENANT_SLUG_HEADER = "x-tenant-slug";
export const TENANT_COOKIE = "pf_tenant";
/** ร้าน PetFlow ของเจ้าของระบบเอง — ลิงก์ /app เปล่า ๆ และค่า LINE/Telegram/Google ใน env เป็นของร้านนี้ */
export const MAIN_SHOP_SLUG = "petflow";

/** อ่าน slug ร้านจาก request — header (middleware ใส่) ก่อน แล้วค่อย cookie */
export function getTenantSlugFromRequest(req: NextRequest): string | null {
  const fromHeader = req.headers.get(TENANT_SLUG_HEADER);
  if (fromHeader && fromHeader.trim()) return fromHeader.trim().toLowerCase();
  const fromCookie = req.cookies.get(TENANT_COOKIE)?.value;
  if (fromCookie && fromCookie.trim()) return fromCookie.trim().toLowerCase();
  return null;
}

/** slug → tenant_id (เฉพาะร้าน trial/active ที่ยังไม่เลยวันครบกำหนดจ่าย) — null ถ้าไม่พบ */
export async function tenantIdForSlug(slug: string): Promise<string | null> {
  const key = slug.trim().toLowerCase();
  if (!key) return null;
  const gate = await tenantGateBySlug(key).catch(() => null);
  return gate && isTenantOpen(gate) ? gate.id : null;
}

/**
 * ร้าน PetFlow (slug "petflow") — เจ้าของลิงก์ /app เปล่า ๆ และค่าใน env (LINE/Telegram/Google/บัญชี)
 * ไม่ใช้ TENANT_ID ตรง ๆ: TENANT_ID คือร้านแรกที่ระบบสร้าง ซึ่งหลังสลับลิงก์ (fix-swapped-shops)
 * กลายเป็นร้าน Back Home — ถ้าใช้ TENANT_ID ลูกค้า LINE PetFlow จะไปโผล่หน้า Back Home
 * ยังไม่มีร้าน petflow (ระบบร้านเดียว) → ใช้ TENANT_ID
 */
export async function mainShopTenantId(): Promise<string | null> {
  const gate = await tenantGateBySlug(MAIN_SHOP_SLUG).catch(() => null);
  return gate?.id || getBootstrapTenantId();
}

/**
 * request → tenant_id ที่ต้องใช้กรอง query
 * ลำดับ: slug (header/cookie) → ร้าน bootstrap (env TENANT_ID) → throw
 *
 * ถ้ามี slug แต่หาร้านไม่เจอ (พิมพ์ผิด/ร้านถูกระงับ) ต้อง throw — ห้ามตกไปร้าน bootstrap
 * ไม่งั้นลูกค้าของร้านที่ถูกระงับจะไปสมัคร/จองลงในร้าน bootstrap แทน
 */
export async function resolveTenantId(req: NextRequest): Promise<string> {
  const slug = getTenantSlugFromRequest(req);
  if (slug) {
    const id = await tenantIdForSlug(slug);
    if (id) return id;
    throw new Error(`ไม่พบร้าน "${slug}" หรือร้านนี้ปิดใช้งานอยู่`);
  }
  const main = await mainShopTenantId();
  if (main) return main;
  throw new Error(
    "ไม่รู้ว่าเป็นร้านไหน — ไม่มี slug (x-tenant-slug/cookie pf_tenant) และไม่ได้ตั้ง TENANT_ID"
  );
}
