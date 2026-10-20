import { getDirectoryDb } from "./supabase/server";
import { getSiteConfig, updateSiteConfig } from "./config-store";
import { withTenant } from "./tenant-context";
import { clearTenantGateCache } from "./tenant-billing";
import { logAudit } from "./audit-log";

/**
 * ซ่อมครั้งเดียว: ตอนระบบยังมีร้านเดียว เจ้าของตั้งค่า Back Home (โลโก้ สี ชื่อ ราคา LINE)
 * ไว้ในร้านแรกซึ่งได้ลิงก์ /s/petflow ส่วนร้าน Back Home ที่สร้างทีหลังยังว่าง (หน้าตา PetFlow สีชมพู)
 *
 * ข้อมูลทั้งหมดผูกกับ id ร้าน — สลับแค่ลิงก์ (slug) + ชื่อ + login เจ้าของของสองร้านนี้
 * ทุกอย่างของ Back Home เลยไปอยู่ใต้ /s/back-home-dog-service และร้าน petflow กลับเป็นร้านว่าง
 * login ของแต่ละลิงก์ยังเหมือนเดิม
 *
 * รันซ้ำได้: หลังสลับแล้ว ร้านที่ลิงก์ petflow ไม่ได้ชื่อ Back Home อีก เงื่อนไขจะไม่ตรง
 */
const FROM_SLUG = "petflow";
const TO_SLUG = "back-home-dog-service";
const BACK_HOME = /back\s*home/i;

export async function fixSwappedShops(): Promise<boolean> {
  const sb = getDirectoryDb();
  if (!sb) return false;
  const cols =
    "id, slug, name, owner_username, owner_password_hash, owner_password_salt, owner_code_hash";
  const { data: rows } = await sb.from("tenants").select(cols).in("slug", [FROM_SLUG, TO_SLUG]);
  const a = rows?.find((r) => r.slug === FROM_SLUG);
  const b = rows?.find((r) => r.slug === TO_SLUG);
  if (!a || !b) return false;

  const aConfig = await withTenant(a.id, () => getSiteConfig());
  const bConfig = await withTenant(b.id, () => getSiteConfig());
  // ร้าน petflow ต้องถือการตั้งค่าของ Back Home อยู่ (มีโลโก้ของตัวเอง) และร้าน Back Home ยังไม่มี
  if (!BACK_HOME.test(aConfig.business?.name || "") || !aConfig.branding?.logoUrl) return false;
  if (bConfig.branding?.logoUrl) return false;

  const identity = (t: typeof a) => ({
    slug: t.slug,
    name: t.name,
    owner_username: t.owner_username,
    owner_password_hash: t.owner_password_hash,
    owner_password_salt: t.owner_password_salt,
    owner_code_hash: t.owner_code_hash,
  });
  // slug/username เป็น unique — พักร้าน a ไว้ที่ค่าชั่วคราวก่อนสลับ
  const steps = [
    () => sb.from("tenants").update({ slug: `swap-${Date.now()}`, owner_username: null }).eq("id", a.id),
    () => sb.from("tenants").update(identity(a)).eq("id", b.id),
    () => sb.from("tenants").update(identity(b)).eq("id", a.id),
  ];
  for (const step of steps) {
    const { error } = await step();
    if (error) throw new Error(`สลับร้านไม่สำเร็จ: ${error.message}`);
  }
  clearTenantGateCache();

  // ชื่อบนหน้าเว็บให้ตรงกับร้านของลิงก์ใหม่ — ร้านว่างที่กลายเป็น petflow ใช้ชื่อร้าน petflow เดิม
  await withTenant(b.id, () =>
    updateSiteConfig({ business: { ...bConfig.business, name: a.name } })
  );

  for (const [t, now] of [
    [a, b],
    [b, a],
  ] as const) {
    await logAudit({
      tenantId: t.id,
      actorType: "platform",
      actorId: "system",
      action: "swap_tenant_link",
      resourceType: "tenant",
      resourceId: t.id,
      beforeState: { slug: t.slug, name: t.name },
      afterState: { slug: now.slug, name: now.name },
    });
  }
  return true;
}
