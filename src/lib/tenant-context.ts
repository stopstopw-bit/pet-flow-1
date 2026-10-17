import { AsyncLocalStorage } from "node:async_hooks";
import type { NextRequest } from "next/server";
import { getBootstrapTenantId } from "./auth";
import { resolveTenantId } from "./tenant-resolve";

/**
 * ตัวร้านที่กำลังประมวลผลอยู่ตอนนี้ — เซ็ตครั้งเดียวตอนเข้า API route
 * แล้ว store function ทุกตัวดึงได้โดยไม่ต้องส่ง tenantId เป็นพารามิเตอร์ทุกฟังก์ชัน
 *
 * สำคัญ: ต้องเรียกผ่าน withTenant()/withBootstrapTenant() เท่านั้น ห้าม query DB
 * ที่ต้องกรองด้วย tenant_id โดยไม่ผ่านทั้งสองนี้ก่อน ไม่งั้นข้อมูลข้ามร้านได้
 */
const storage = new AsyncLocalStorage<string>();

/**
 * เรียกจาก store function เพื่อเอา tenant_id ปัจจุบันไปกรอง query
 *
 * ต้องอยู่ใน withTenant()/withResolvedTenant()/withBootstrapTenant() เสมอ — ถ้าไม่อยู่ให้ throw
 * เดิม fallback ไปร้าน bootstrap (env TENANT_ID) แบบเงียบ ๆ ซึ่งพอมีร้านที่ 2 จะกลายเป็น
 * "เจ้าของร้าน B เห็นข้อมูลร้าน A" โดยไม่มีใครรู้ — พังดัง ๆ ปลอดภัยกว่าข้อมูลปนกันเงียบ ๆ
 */
export function requireTenantId(): string {
  const id = storage.getStore();
  if (!id) {
    throw new Error(
      "ไม่มี tenant context — wrap route ด้วย withTenant()/withResolvedTenant() ก่อนเรียก store"
    );
  }
  return id;
}

/**
 * ร้านที่กำลังประมวลผลคือร้าน bootstrap (env TENANT_ID) ไหม
 * ค่าที่ตั้งใน env (LINE/Telegram/Google/บัญชีธนาคาร) เป็นของร้านนี้ร้านเดียว —
 * ร้านอื่นต้องใช้ค่าที่ตั้งเองในหลังบ้าน ห้ามยืมของร้าน bootstrap
 */
export function isBootstrapTenant(): boolean {
  const id = storage.getStore();
  const bootstrap = getBootstrapTenantId();
  return !!id && !!bootstrap && id === bootstrap;
}

/** ใช้ใน API route หลังบ้านที่ล็อกอินแล้ว (มี session.tenantId) */
export function withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return storage.run(tenantId, fn);
}

/**
 * ใช้ใน API route ฝั่งลูกค้า (LIFF) ที่ยังไม่มี session หลังบ้าน — bootstrap เดียว
 * ตอนนี้มีร้านเดียว (CatCha) จึงอ่านจาก env TENANT_ID ได้เลย
 * พอมีหลายร้านจริง ต้องเปลี่ยนไป resolve จาก LIFF ID/domain แทน (ดู T5)
 */
export function withBootstrapTenant<T>(fn: () => Promise<T>): Promise<T> {
  const tenantId = getBootstrapTenantId();
  if (!tenantId) {
    throw new Error("ยังไม่ได้ตั้งค่า TENANT_ID — ดูขั้นตอนใน SETUP_NEW_SHOP.md");
  }
  return storage.run(tenantId, fn);
}

/**
 * ใช้ใน API route ฝั่งลูกค้า (LIFF) แบบ multi-tenant — resolve ร้านจาก request
 * (header x-tenant-slug ที่ middleware ใส่ / cookie pf_tenant) แล้ว fallback ไป
 * ร้าน bootstrap ถ้าไม่มี slug (ร้านเดิม/CatCha) ดู tenant-resolve.ts
 *
 * แทนที่ withBootstrapTenant() ในทุก route ลูกค้า เพื่อให้ร้านที่ 2 แยกข้อมูลได้จริง
 */
export async function withResolvedTenant<T>(
  req: NextRequest,
  fn: () => Promise<T>
): Promise<T> {
  const tenantId = await resolveTenantId(req);
  return storage.run(tenantId, fn);
}
