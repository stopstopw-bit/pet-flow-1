import { getDefaultSiteConfig } from "./defaults/site-config";
import type { SiteConfig } from "./config-types";
import { getSupabase } from "./supabase/server";
import { isBootstrapTenant, requireTenantId } from "./tenant-context";
import { uploadDataUrlToStorage } from "./supabase/storage";
import { createHash } from "crypto";

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

export async function getSiteConfig(): Promise<SiteConfig> {
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
      return mergeConfig(defaults, {
        ...stored,
        updatedAt: data.updated_at || defaults.updatedAt,
      });
    }
  }

  if (memConfig) return memConfig;
  return defaults;
}

export async function replaceSiteConfig(config: SiteConfig) {
  const next = {
    ...(await offloadDataUrls(config, `config/${requireTenantId()}`)),
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
  return next;
}

export async function updateSiteConfig(patch: Partial<SiteConfig>) {
  const current = await getSiteConfig();
  const next = mergeConfig(current, await offloadDataUrls(patch, `config/${requireTenantId()}`));
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

  return next;
}

export function getRoomFromConfig(config: SiteConfig, id: string) {
  return config.rooms.find((r) => r.id === id);
}
