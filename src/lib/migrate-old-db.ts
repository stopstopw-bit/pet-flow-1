/**
 * ย้ายข้อมูลจาก Supabase ตัวเก่ามาตัวที่เว็บใช้อยู่ตอนนี้ (ใช้ครั้งเดียวตอนเปลี่ยนฐานข้อมูล)
 *
 * ตั้งใน Vercel: OLD_SUPABASE_URL + OLD_SUPABASE_SERVICE_ROLE_KEY = ค่าของตัวเก่า
 * แล้ว NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY = ตัวใหม่
 *
 * - คัดลอกทุกตาราง (ทุกร้าน) แบบ upsert ตาม primary key → กดซ้ำได้ ไม่เกิดแถวซ้ำ
 * - คัดลอกรูปใน bucket media แล้วเปลี่ยนลิงก์รูปในข้อมูลให้ชี้ไปตัวใหม่
 * - ข้าม audit_logs (id เป็น bigserial — ใส่ id เดิมแล้ว sequence จะชนตอนเขียน log ใหม่)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabase, getSupabaseUrl, normalizeSupabaseUrl } from "@/lib/supabase/server";
import { bootstrapDatabase } from "@/lib/supabase/bootstrap";

/** เรียงให้ตารางแม่มาก่อนตารางลูก (foreign key) — ตามลำดับใน supabase/full-setup.sql */
const TABLES = [
  "tenants",
  "customers",
  "cats",
  "bookings",
  "points_accounts",
  "points_history",
  "promos",
  "promo_claims",
  "finance_records",
  "invoices",
  "service_records",
  "member_topups",
  "site_config",
  "broadcast_images",
  "coupons",
  "coupon_offers",
  "customer_packages",
  "package_offers",
  "package_orders",
  "chat_watch",
  "articles",
  "staff_users",
  "products",
  "birthday_greetings",
  "room_plans",
  "invoice_docs",
  "pos_products",
  "pos_stock_moves",
  "pos_sales",
  "pos_closings",
  "booking_ops",
  "payroll_employees",
];

const BUCKET = "media";
const PAGE = 500;

export type MigrateReport = {
  ok: boolean;
  /** สร้าง/อัปเดตตารางในตัวใหม่ก่อนย้าย — ไม่งั้นคอลัมน์ที่เพิ่มทีหลังจะย้ายไม่ได้ */
  schema: string;
  tables: { table: string; rows: number; error?: string }[];
  files: { copied: number; failed: number; error?: string };
};

function oldConfig() {
  const url = normalizeSupabaseUrl(process.env.OLD_SUPABASE_URL);
  const key = process.env.OLD_SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

/** พร้อมย้ายไหม — ไว้ให้หน้าเว็บบอกว่ายังขาดค่าอะไร */
export function migrateStatus() {
  const old = oldConfig();
  const current = getSupabaseUrl();
  if (!old) {
    return { configured: false, ready: false, message: "ยังไม่ได้ตั้ง OLD_SUPABASE_URL / OLD_SUPABASE_SERVICE_ROLE_KEY ใน Vercel" };
  }
  if (!current || !getSupabase()) {
    return { configured: true, ready: false, message: "ยังไม่ได้ตั้งฐานข้อมูลตัวใหม่ใน Vercel" };
  }
  if (old.url === current) {
    return {
      configured: true,
      ready: false,
      message: "ฐานข้อมูลเก่ากับใหม่เป็นตัวเดียวกัน — เปลี่ยน NEXT_PUBLIC_SUPABASE_URL เป็นตัวใหม่ก่อน",
    };
  }
  return { configured: true, ready: true, message: `${new URL(old.url).hostname} → ${new URL(current).hostname}` };
}

/** เปลี่ยนลิงก์ที่ชี้ไปโปรเจกต์เก่า (เช่นรูปใน Storage) ให้ชี้ตัวใหม่ — ทำกับทั้งแถวผ่าน JSON */
function rewriteUrls<T>(rows: T[], from: string, to: string): T[] {
  const s = JSON.stringify(rows);
  return s.includes(from) ? (JSON.parse(s.split(from).join(to)) as T[]) : rows;
}

async function copyTable(src: SupabaseClient, dst: SupabaseClient, table: string, fromUrl: string, toUrl: string) {
  let rows = 0;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await src.from(table).select("*").range(offset, offset + PAGE - 1);
    if (error) {
      // ตารางนี้ไม่มีในฐานข้อมูลเก่า = ไม่มีอะไรให้ย้าย
      if (error.code === "42P01" || error.code === "PGRST205") return { rows };
      return { rows, error: error.message };
    }
    if (!data || data.length === 0) break;
    const { error: upErr } = await dst.from(table).upsert(rewriteUrls(data, fromUrl, toUrl));
    if (upErr) return { rows, error: upErr.message };
    rows += data.length;
    if (data.length < PAGE) break;
  }
  return { rows };
}

async function listAllFiles(src: SupabaseClient, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await src.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      // โฟลเดอร์ไม่มี id
      if (item.id) out.push(path);
      else out.push(...(await listAllFiles(src, path)));
    }
    if (data.length < 1000) break;
  }
  return out;
}

async function copyFiles(src: SupabaseClient, dst: SupabaseClient) {
  let copied = 0;
  let failed = 0;
  let paths: string[];
  try {
    paths = await listAllFiles(src);
  } catch (e) {
    return { copied, failed, error: e instanceof Error ? e.message : String(e) };
  }
  await dst.storage.createBucket(BUCKET, { public: true }).catch(() => null);
  for (const path of paths) {
    const { data, error } = await src.storage.from(BUCKET).download(path);
    if (error || !data) {
      failed++;
      continue;
    }
    const { error: upErr } = await dst.storage
      .from(BUCKET)
      .upload(path, data, { upsert: true, contentType: data.type || undefined });
    if (upErr) failed++;
    else copied++;
  }
  return { copied, failed };
}

export async function migrateFromOldDb(): Promise<MigrateReport> {
  const old = oldConfig();
  const dst = getSupabase();
  const toUrl = getSupabaseUrl();
  if (!old || !dst || !toUrl) throw new Error(migrateStatus().message);

  const src = createClient(old.url, old.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const boot = await bootstrapDatabase();

  const tables: MigrateReport["tables"] = [];
  for (const table of TABLES) {
    tables.push({ table, ...(await copyTable(src, dst, table, old.url, toUrl)) });
  }
  const files = await copyFiles(src, dst);

  return {
    ok: tables.every((t) => !t.error) && !files.error && files.failed === 0,
    schema: boot.message,
    tables,
    files,
  };
}
