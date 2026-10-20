import { getDirectoryDb } from "./supabase/server";
import { getSiteConfig, replaceSiteConfig } from "./config-store";
import { getDefaultSiteConfig } from "./defaults/site-config";
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
  // select * — ร้านเก่าบางฐานไม่มีคอลัมน์ login ครบ ถ้าระบุชื่อคอลัมน์แล้วขาดตัวเดียว query จะพังเงียบ
  const { data: rows, error } = await sb.from("tenants").select("*").in("slug", [FROM_SLUG, TO_SLUG]);
  if (error) throw new Error(`อ่านรายชื่อร้านไม่ได้: ${error.message}`);
  const a = rows?.find((r) => r.slug === FROM_SLUG);
  const b = rows?.find((r) => r.slug === TO_SLUG);
  if (!a || !b) return false;

  const aConfig = await withTenant(a.id, () => getSiteConfig());
  // ร้านที่ลิงก์ petflow ยังถือการตั้งค่าของ Back Home อยู่ = ยังไม่ได้ย้าย
  if (!BACK_HOME.test(aConfig.business?.name || "")) return false;

  // ทำก่อนสลับ: ร้านที่จะกลายเป็น petflow ต้องเป็นหน้าตา PetFlow — ชื่อ PetFlow + โลโก้/สีเริ่มต้น
  // (เผื่อเจ้าของเพิ่งใส่โลโก้ Back Home ซ้ำไว้ในร้านนี้ระหว่างรอ)
  const petflowName = BACK_HOME.test(a.name || "") ? "PetFlow" : a.name;
  const bConfig = await withTenant(b.id, () => getSiteConfig());
  await withTenant(b.id, () =>
    replaceSiteConfig({
      ...bConfig,
      business: { ...bConfig.business, name: petflowName },
      branding: getDefaultSiteConfig().branding,
    })
  );
  const LOGIN_COLS = [
    "slug",
    "name",
    "owner_username",
    "owner_password_hash",
    "owner_password_salt",
    "owner_code_hash",
  ];
  const identity = (t: Record<string, unknown>) =>
    Object.fromEntries(LOGIN_COLS.filter((c) => c in t).map((c) => [c, t[c]]));
  // slug/username เป็น unique — พักร้าน a ไว้ที่ค่าชั่วคราวก่อนสลับ
  // ขั้นแรกล็อกด้วยเงื่อนไข slug เดิม — ถ้าอีกเครื่องสลับไปก่อนแล้ว จะไม่มีแถวถูกแก้ แล้วหยุดตรงนี้
  const { data: locked, error: lockErr } = await sb
    .from("tenants")
    .update({ slug: `swap-${Date.now()}`, ...("owner_username" in a ? { owner_username: null } : {}) })
    .eq("id", a.id)
    .eq("slug", FROM_SLUG)
    .select("id");
  if (lockErr) throw new Error(`สลับร้านไม่สำเร็จ: ${lockErr.message}`);
  if (!locked?.length) return false;
  const steps = [
    () => sb.from("tenants").update(identity(a)).eq("id", b.id),
    () => sb.from("tenants").update(identity(b)).eq("id", a.id),
  ];
  for (const step of steps) {
    const { error } = await step();
    if (error) throw new Error(`สลับร้านไม่สำเร็จ: ${error.message}`);
  }
  clearTenantGateCache();

  // ชื่อร้านในหน้า /platform ให้ตรงกับลิงก์ใหม่
  await sb.from("tenants").update({ name: petflowName }).eq("id", b.id);

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
