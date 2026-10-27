import { headers } from "next/headers";
import type { SiteConfig } from "./config-types";
import { getSiteConfig } from "./config-store";
import { withTenant } from "./tenant-context";
import { mainShopTenantId, tenantIdForSlug, TENANT_SLUG_HEADER } from "./tenant-resolve";

/**
 * config ของร้านที่หน้านี้เป็นของ — อ่านฝั่งเซิร์ฟเวอร์ตอนสร้างหน้า แล้วส่งให้ ConfigProvider เป็นค่าแรก
 * โลโก้/สี/ชื่อร้านจึงถูกตั้งแต่เฟรมแรก ไม่ต้องรอ /api/config (เดิมเห็นโลโก้+สีชมพู PetFlow แวบก่อนเปลี่ยนเป็นของร้าน)
 * ลิงก์ /s/<slug>/... → middleware ใส่ x-tenant-slug มาให้ · /app เปล่า ๆ = ร้าน PetFlow
 * อ่านไม่ได้ (ร้านปิด/DB ล่ม) → null แล้วฝั่งเบราว์เซอร์โหลดเองแบบเดิม
 */
export async function getPageSiteConfig(): Promise<SiteConfig | null> {
  try {
    const slug = (await headers()).get(TENANT_SLUG_HEADER)?.trim().toLowerCase();
    const tenantId = slug ? await tenantIdForSlug(slug) : await mainShopTenantId();
    if (!tenantId) return null;
    return await withTenant(tenantId, getSiteConfig);
  } catch {
    return null;
  }
}
