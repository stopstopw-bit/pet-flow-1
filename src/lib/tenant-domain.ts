import { getDirectoryDb } from "./supabase/server";

/**
 * โดเมนของร้านเอง (เช่น catcha.com) → ร้านไหน
 *
 * ปกติร้านเข้าผ่าน pet-flow-1.vercel.app/s/<slug>/... — ร้านที่ซื้อโดเมนเองให้ผู้ดูแลระบบ
 * ใส่โดเมนในหน้า /platform (เก็บใน tenants.custom_domain) แล้วเพิ่มโดเมนเดียวกันใน Vercel
 * middleware จะดูชื่อโดเมนที่เปิดเข้ามา แล้วทำเหมือนเปิดลิงก์ /s/<slug>/... ของร้านนั้น
 * ลิงก์ /s/<slug> เดิมยังใช้ได้ตามปกติ ดูขั้นตอนใน CUSTOM_DOMAIN.md
 *
 * ไฟล์นี้ถูกดึงเข้า middleware — ห้าม import อะไรที่ใช้ Node อย่างเดียว
 */

/** โดเมนของแพลตฟอร์มเอง (ไม่ใช่โดเมนร้าน) — เพิ่มได้ด้วย env PLATFORM_HOSTS คั่นด้วย , */
function platformHosts(): string[] {
  const extra = (process.env.PLATFORM_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (app) {
    try {
      extra.push(new URL(app).hostname.toLowerCase());
    } catch {
      /* ค่าไม่ใช่ URL — ข้าม */
    }
  }
  return extra;
}

/** host ของคำขอ (ตัด port ออก) เป็นของแพลตฟอร์มไหม — ถ้าใช่ ใช้ลิงก์ /s/<slug> แบบเดิม */
export function isPlatformHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  if (!h || h === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.startsWith("[")) return true;
  // pet-flow-1.vercel.app และลิงก์ preview ของ Vercel ทุกอัน
  if (h === "vercel.app" || h.endsWith(".vercel.app")) return true;
  return platformHosts().includes(h);
}

/**
 * ทำโดเมนที่ผู้ดูแลพิมพ์มาให้เป็นรูปเดียวกัน — ตัด https://, path, port, www. ออก ตัวเล็กหมด
 * คืน null ถ้าไม่ใช่โดเมนที่ใช้ได้ (หรือเป็นโดเมนของแพลตฟอร์มเอง)
 */
export function normalizeDomain(input: string): string | null {
  let d = String(input || "").trim().toLowerCase();
  if (!d) return null;
  d = d.replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  d = d.replace(/^www\./, "");
  if (d.length > 253) return null;
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(d)) {
    return null;
  }
  if (isPlatformHost(d)) return null;
  return d;
}

/** คอลัมน์ custom_domain ยังไม่มี (ยังไม่เคยรัน migration tenants.custom_domain) */
export function isMissingCustomDomain(msg: string) {
  return /custom_domain/i.test(msg) && /(does not exist|could not find|schema cache|PGRST204|42703)/i.test(msg);
}

/**
 * cache สั้นๆ ใน process เหมือน tenant-billing — ไม่ query ทุก request
 * จำทั้งตอนเจอและไม่เจอ (โดเมนแปลกๆ ที่ชี้มาจะได้ไม่ยิงฐานรัวๆ)
 */
const TTL_MS = 60_000;
const cache = new Map<string, { slug: string | null; at: number }>();

/**
 * host ของคำขอ → slug ของร้านเจ้าของโดเมน (null = ไม่มีร้านไหนใช้โดเมนนี้)
 * www.catcha.com กับ catcha.com เป็นร้านเดียวกัน
 * ต่อฐานไม่ได้ = throw (ห้ามเดาร้าน ไม่งั้นโดเมนร้านหนึ่งอาจไปโชว์อีกร้าน)
 */
export async function slugForHost(host: string): Promise<string | null> {
  const domain = normalizeDomain(host);
  if (!domain) return null;
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.slug;

  const sb = getDirectoryDb();
  if (!sb) return null;
  const { data, error } = await sb
    .from("tenants")
    .select("slug")
    .eq("custom_domain", domain)
    .limit(1)
    .maybeSingle();
  if (error && !isMissingCustomDomain(error.message)) throw new Error(error.message);
  const slug = ((data as { slug?: string } | null)?.slug || "").trim().toLowerCase() || null;
  cache.set(domain, { slug, at: Date.now() });
  return slug;
}

/** ล้าง cache หลังผู้ดูแลระบบเปลี่ยนโดเมนร้าน (มีผลทันทีในเครื่องนี้ เครื่องอื่นตาม TTL) */
export function clearTenantDomainCache() {
  cache.clear();
}

/** สร้างคอลัมน์ custom_domain ให้เอง — เรียกตอนผู้ดูแลระบบจะตั้งโดเมน */
export async function ensureCustomDomainColumn() {
  // import ตอนใช้ — ไฟล์นี้ถูกดึงเข้า middleware ไม่อยากลาก SQL ทั้งก้อนไปด้วย
  const { ensureMigration } = await import("./migrations");
  return ensureMigration("tenants.custom_domain");
}
