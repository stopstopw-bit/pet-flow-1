import { readFileSync } from "fs";
import { join } from "path";
import { getSupabase, getSupabaseUrl, isSupabaseConfigured, isPlaceholderSupabaseUrl } from "./server";

export type SetupStatus = {
  supabaseUrl: boolean;
  serviceKey: boolean;
  databaseUrl: boolean;
  connected: boolean;
  tablesReady: boolean;
  missingTables: string[];
  message: string;
};

const REQUIRED_TABLES = [
  "customers",
  "cats",
  "bookings",
  "points_accounts",
  "promos",
  "invoices",
  "site_config",
];

/** ต่อ Supabase ผ่านปุ่มเชื่อมใน Vercel จะได้ POSTGRES_URL_NON_POOLING แทน DATABASE_URL — รับได้ทั้งคู่ */
function getDatabaseUrl() {
  return (process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || "").trim();
}

export async function checkSetupStatus(): Promise<SetupStatus> {
  const rawUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim();
  const supabaseUrl = Boolean(rawUrl);
  const serviceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const databaseUrl = Boolean(getDatabaseUrl());
  const normalizedUrl = getSupabaseUrl();

  if (!supabaseUrl || !serviceKey) {
    return {
      supabaseUrl,
      serviceKey,
      databaseUrl,
      connected: false,
      tablesReady: false,
      missingTables: REQUIRED_TABLES,
      message: "ยังไม่ได้ใส่ NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY ใน Vercel",
    };
  }

  if (!normalizedUrl) {
    return {
      supabaseUrl,
      serviceKey,
      databaseUrl,
      connected: false,
      tablesReady: false,
      missingTables: REQUIRED_TABLES,
      message: isPlaceholderSupabaseUrl(rawUrl)
        ? `NEXT_PUBLIC_SUPABASE_URL ยังเป็นค่าตัวอย่าง (${rawUrl}) ไม่ใช่โปรเจกต์จริง — ใส่ URL จาก Supabase → Settings → API แล้ว Redeploy · ข้อมูลไม่ได้หาย แค่แอปชี้ผิดที่`
        : "NEXT_PUBLIC_SUPABASE_URL ไม่ถูกต้อง — ใส่เป็น https://<project-ref>.supabase.co (ไม่มีเครื่องหมายคำพูด)",
    };
  }

  const sb = getSupabase();
  if (!sb) {
    return {
      supabaseUrl,
      serviceKey,
      databaseUrl,
      connected: false,
      tablesReady: false,
      missingTables: REQUIRED_TABLES,
      message: "เชื่อม Supabase ไม่ได้",
    };
  }

  const missing: string[] = [];
  for (const table of REQUIRED_TABLES) {
    try {
      const { error } = await sb.from(table).select("*").limit(1);
      if (error) missing.push(table);
    } catch {
      missing.push(table);
    }
  }

  return {
    supabaseUrl,
    serviceKey,
    databaseUrl,
    connected: true,
    tablesReady: missing.length === 0,
    missingTables: missing,
    message:
      missing.length === 0
        ? "พร้อมใช้งาน — ฐานข้อมูลครบแล้ว"
        : `ยังไม่มีตาราง: ${missing.join(", ")} — กดสร้างตารางอัตโนมัติ`,
  };
}

function loadSchemaSql() {
  const path = join(process.cwd(), "supabase", "schema.sql");
  return readFileSync(path, "utf-8");
}

/** สร้างตารางทั้งหมด — ต้องมี DATABASE_URL (Connection string จาก Supabase) */
export async function bootstrapDatabase() {
  const url = getDatabaseUrl();
  if (!url) {
    return {
      ok: false as const,
      error: "no_database_url",
      message:
        "ใส่ DATABASE_URL ใน Vercel (Supabase → Settings → Database → Connection string → URI)",
    };
  }

  const client = new (await import("pg")).default.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const sql = loadSchemaSql();
    await client.query(sql);
    return { ok: true as const, message: "สร้างตารางและข้อมูลเริ่มต้นสำเร็จ" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false as const, error: "bootstrap_failed", message: msg };
  } finally {
    await client.end().catch(() => {});
  }
}

export function getSchemaSqlForCopy() {
  return loadSchemaSql();
}

export function isSetupConfigured() {
  return isSupabaseConfigured();
}
