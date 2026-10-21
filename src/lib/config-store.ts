import { getDefaultSiteConfig } from "./defaults/site-config";
import type { SiteConfig } from "./config-types";
import { getSupabase } from "./supabase/server";
import { isBootstrapTenant, requireTenantId } from "./tenant-context";
import { uploadDataUrlToStorage } from "./supabase/storage";
import { createHash } from "crypto";
import { applyBrandCardDefaults, stripBrandCardDefaults } from "./card-brand";

/**
 * ย้ายรูปที่ฝังเป็น base64 (data:image/...) ในค่าตั้งค่าออกไป Storage แล้วแทนด้วย URL
 * site_config ถูกอ่านทุกคำขอ — ถ้ามีรูปยัด base64 อยู่ ทุกคำขอโหลดรูปซ้ำหลาย MB
 * จนโควตา egress ของ Supabase หมดแล้วโปรเจกต์ถูกจำกัดทั้งก้อน (ทุกหน้าว่างเหมือนข้อมูลหาย)
 * ตั้งชื่อไฟล์จาก hash ของรูป → บันทึกซ้ำโดยไม่เปลี่ยนรูปไม่อัปใหม่ · อัปไม่ได้ก็คง data URL ไว้
 */
async function offloadDataUrls<T>(value: T, path: string): Promise<T> {
  if (typeof value === "string") {
    if (!value.startsWith("data:image")) return value;
    const hash = createHash("sha1").update(value).digest("hex").slice(0, 12);
    return (await uploadDataUrlToStorage(`${path}/${hash}`, value)) as unknown as T;
  }
  if (Array.isArray(value)) {
    return (await Promise.all(value.map((v) => offloadDataUrls(v, path)))) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = await offloadDataUrls(v, path);
    }
    return out as T;
  }
  return value;
}

function hasDataUrl(value: unknown): boolean {
  if (typeof value === "string") return value.startsWith("data:image");
  if (Array.isArray(value)) return value.some(hasDataUrl);
  if (value && typeof value === "object") return Object.values(value).some(hasDataUrl);
  return false;
}

/** ซ่อมค่าเก่าที่มี base64 ค้าง — ครั้งเดียวต่อร้านต่อ instance */
const repairing = new Set<string>();

/**
 * แถวเดียวต่อร้าน — id เดิมเคยตายตัวเป็น "main" (ร้านเดียว) ตอนนี้ต้องผูกกับ
 * tenant_id แทน ไม่งั้นทุกร้านจะเขียนทับ config ของกันและกัน
 */
function configId() {
  return requireTenantId();
}

let memConfig: SiteConfig | null = null;

function mergeConfig(base: SiteConfig, patch: Partial<SiteConfig>): SiteConfig {
  const next = JSON.parse(JSON.stringify(base)) as SiteConfig;
  for (const key of Object.keys(patch) as (keyof SiteConfig)[]) {
    const val = patch[key];
    if (val === undefined) continue;
    if (
      typeof val === "object" &&
      val !== null &&
      !Array.isArray(val) &&
      key !== "rooms" &&
      key !== "groomSlots" &&
      key !== "pointsRewards"
    ) {
      (next as Record<string, unknown>)[key] = {
        ...(next as Record<string, unknown>)[key] as object,
        ...val,
      };
    } else {
      (next as Record<string, unknown>)[key] = val;
    }
  }
  return next;
}

/** ค่าตัวอย่างเดิมที่เคยถูกใส่ให้ทุกร้านตอนสร้าง — ไม่ใช่ข้อมูลจริงของร้านไหน */
const OLD_PLACEHOLDERS = new Set([
  "@petflow",
  "02-123-4567",
  "petflow",
  "https://line.me/R/ti/p/@petflow",
  "https://www.google.com/maps",
  "https://www.instagram.com/",
  "https://www.tiktok.com/",
  "https://www.facebook.com/",
  "กรุงเทพฯ",
  "Bangkok",
]);

/**
 * ร้านที่สร้างก่อนแก้ ได้ค่าของร้าน bootstrap/ค่าตัวอย่างติดมาใน config ที่บันทึกไว้
 * (LINE @petflow, เบอร์, บัญชีธนาคารจาก env) — ตัดทิ้งตอนอ่าน ให้เห็นเป็นช่องว่างแทน
 */
function dropCopiedShopValues(stored: Partial<SiteConfig>): Partial<SiteConfig> {
  const out = { ...stored };
  const clean = (v: unknown) => (typeof v === "string" && OLD_PLACEHOLDERS.has(v.trim()) ? "" : v);
  if (stored.business) {
    const b = { ...stored.business } as Record<string, unknown>;
    for (const k of ["lineOa", "maps", "facebook", "reviewUrl"]) b[k] = clean(b[k]);
    if (Array.isArray(b.phones)) b.phones = (b.phones as string[]).filter((p) => !OLD_PLACEHOLDERS.has(p));
    if (b.location && typeof b.location === "object") {
      const loc = b.location as { th?: string; en?: string };
      b.location = { th: clean(loc.th) as string, en: clean(loc.en) as string };
    }
    if (b.social && typeof b.social === "object") {
      b.social = Object.fromEntries(
        Object.entries(b.social as Record<string, unknown>).map(([k, v]) => [k, clean(v)])
      );
    }
    out.business = b as SiteConfig["business"];
  }
  const envAccount = process.env.BANK_ACCOUNT_NUMBER?.trim();
  if (
    stored.payment &&
    !isBootstrapTenant() &&
    (stored.payment.accountNumber === "XXX-X-XXXXX-X" ||
      (envAccount && stored.payment.accountNumber === envAccount))
  ) {
    out.payment = { bankName: "", accountNumber: "", accountName: "", promptpayId: undefined };
  }
  return out;
}

/**
 * ข้อความตั้งต้นของระบบเคยเขียนชื่อ "PetFlow" ตรง ๆ (ข้อความตามลูกค้า, การ์ด LINE, ชื่อโปรแกรมอาบน้ำ ฯลฯ)
 * และหลายร้านบันทึกข้อความเหล่านั้นไว้แล้ว — ตอนอ่านเปลี่ยนเป็นชื่อร้านนั้นให้หมด
 * ลูกค้าต้องเห็นชื่อร้านที่ตัวเองใช้บริการ ไม่ใช่ชื่อระบบ · ข้ามลิงก์/รูป (มี petflow อยู่ใน URL ได้)
 */
function withShopNameInTexts(config: SiteConfig): SiteConfig {
  const name = config.business?.name?.trim();
  if (!name || /petflow/i.test(name)) return config;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (!v.includes("PetFlow") || /^(https?:|data:|\/)/.test(v.trim())) return v;
      return v.replace(/PetFlow/g, name);
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(config) as SiteConfig;
}

/** การ์ด LINE ที่ยังไม่ได้ตั้งสีเอง ใช้สีร้าน — ทุกที่ที่อ่าน config (ส่งการ์ด/หน้าหลังบ้าน) เห็นเหมือนกัน */
export async function getSiteConfig(): Promise<SiteConfig> {
  return applyBrandCardDefaults(await getRawSiteConfig());
}

/** config ตามที่บันทึกจริง (ยังไม่เติมสีการ์ดจากสีร้าน) — ใช้ตอนแก้แล้วบันทึกกลับ */
async function getRawSiteConfig(): Promise<SiteConfig> {
  const defaults = getDefaultSiteConfig();
  // บัญชีธนาคาร/พร้อมเพย์ใน env (BANK_*, PROMPTPAY_ID) เป็นของร้าน bootstrap —
  // ร้านอื่นที่ยังไม่ตั้งเองต้องเห็นช่องว่าง ไม่ใช่เลขบัญชีร้านอื่นบนการ์ดโอนเงิน
  if (!isBootstrapTenant()) {
    defaults.payment = { ...defaults.payment, bankName: "", accountNumber: "", accountName: "", promptpayId: undefined };
  }
  const sb = getSupabase();

  if (sb) {
    const { data } = await sb
      .from("site_config")
      .select("data, updated_at")
      .eq("id", configId())
      .maybeSingle();

    if (data?.data) {
      const stored = data.data as Partial<SiteConfig>;
      const tenant = requireTenantId();
      if (!repairing.has(tenant) && hasDataUrl(stored)) {
        repairing.add(tenant);
        void (async () => {
          const slim = await offloadDataUrls(stored, `config/${tenant}`);
          if (!hasDataUrl(slim)) {
            await sb.from("site_config").update({ data: slim }).eq("id", configId());
          }
        })().catch(() => {});
      }
      return withShopNameInTexts(
        mergeConfig(defaults, {
          ...dropCopiedShopValues(stored),
          updatedAt: data.updated_at || defaults.updatedAt,
        })
      );
    }
  }

  if (memConfig) return withShopNameInTexts(memConfig);
  return defaults;
}

export async function replaceSiteConfig(config: SiteConfig) {
  const next = {
    ...(await offloadDataUrls(stripBrandCardDefaults(config), `config/${requireTenantId()}`)),
    updatedAt: new Date().toISOString(),
    version: (config.version || 0) + 1,
  };
  const sb = getSupabase();
  if (sb) {
    await sb.from("site_config").upsert({
      id: configId(),
      tenant_id: requireTenantId(),
      data: next,
      updated_at: next.updatedAt,
    });
  } else {
    memConfig = next;
  }
  return applyBrandCardDefaults(next);
}

export async function updateSiteConfig(patch: Partial<SiteConfig>) {
  const current = await getRawSiteConfig();
  const next = stripBrandCardDefaults(
    mergeConfig(current, await offloadDataUrls(patch, `config/${requireTenantId()}`))
  );
  next.updatedAt = new Date().toISOString();
  next.version = (current.version || 0) + 1;

  const sb = getSupabase();
  if (sb) {
    await sb.from("site_config").upsert({
      id: configId(),
      tenant_id: requireTenantId(),
      data: next,
      updated_at: next.updatedAt,
    });
  } else {
    memConfig = next;
  }

  return applyBrandCardDefaults(next);
}

export function getRoomFromConfig(config: SiteConfig, id: string) {
  return config.rooms.find((r) => r.id === id);
}
