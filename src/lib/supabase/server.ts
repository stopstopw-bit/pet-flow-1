import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** รองรับค่าที่ใส่แค่ project ref หรือลืม https:// */
export function normalizeSupabaseUrl(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  if (!trimmed) return null;

  let url = trimmed;
  if (!/^https?:\/\//i.test(url)) {
    if (/^[a-z0-9-]+\.supabase\.co$/i.test(url)) {
      url = `https://${url}`;
    } else if (/^[a-z0-9-]{10,}$/i.test(url)) {
      url = `https://${url}.supabase.co`;
    } else {
      return null;
    }
  }

  try {
    const parsed = new URL(url);
    // ref ของโปรเจกต์ Supabase จริงเป็นตัวพิมพ์เล็ก/ตัวเลข 20 ตัวเสมอ — ค่าอย่าง "aBcDe" คือตัวอย่าง
    // ที่ติดมาจากเทมเพลต ถ้าปล่อยผ่าน ทุก query จะล้มเงียบๆ จนดูเหมือน "ข้อมูลหายหมด"
    const ref = parsed.hostname.split(".")[0];
    if (parsed.hostname.endsWith(".supabase.co") && !/^[a-z0-9]{20}$/.test(ref)) return null;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** URL ที่ตั้งไว้ดูเป็นค่าตัวอย่าง/ไม่ใช่โปรเจกต์จริงไหม */
export function isPlaceholderSupabaseUrl(raw?: string): boolean {
  const trimmed = (raw || "").trim().replace(/^["']|["']$/g, "");
  if (!trimmed) return false;
  const m = trimmed.match(/^(?:https?:\/\/)?([^./]+)\.supabase\.co/i);
  return !!m && !/^[a-z0-9]{20}$/.test(m[1]);
}

/**
 * อ่าน env ตอนรันจริง — `process.env.NEXT_PUBLIC_*` แบบตรงๆ ถูก Next ฝังค่าไว้ตั้งแต่ตอน build
 * ถ้าค่าใน Vercel เปลี่ยนทีหลัง เว็บจะยังชี้ที่เก่า (เคยเจอชี้ไปโปรเจกต์ที่ลบไปแล้ว)
 */
export function runtimeEnv(key: string): string | undefined {
  return process.env[key];
}

export function getSupabaseUrlSource(): { source: string; host: string | null }[] {
  const host = (v?: string) => {
    const u = normalizeSupabaseUrl(v);
    return u ? new URL(u).host : null;
  };
  return [
    { source: "NEXT_PUBLIC_SUPABASE_URL", host: host(runtimeEnv("NEXT_PUBLIC_SUPABASE_URL")) },
    { source: "SUPABASE_URL", host: host(runtimeEnv("SUPABASE_URL")) },
    { source: "build", host: host(process.env.NEXT_PUBLIC_SUPABASE_URL) },
  ];
}

export function getSupabaseUrl() {
  return normalizeSupabaseUrl(
    runtimeEnv("NEXT_PUBLIC_SUPABASE_URL") || runtimeEnv("SUPABASE_URL") || process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/**
 * key ที่ใช้เชื่อม Supabase เป็นสิทธิ์ระดับไหน — ต้องเป็น service_role/secret ถึงจะ bypass RLS ได้
 * ถ้าเผลอใส่ anon/publishable แล้วเปิด RLS → แอปอ่าน/เขียนข้อมูลไม่ได้ทั้งระบบ
 */
export function getSupabaseKeyRole(): "service_role" | "anon" | "unknown" | "missing" {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) return "missing";
  if (key.startsWith("sb_secret_")) return "service_role";
  if (key.startsWith("sb_publishable_")) return "anon";
  const payload = key.split(".")[1];
  if (!payload) return "unknown";
  try {
    const role = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))?.role;
    if (role === "service_role") return "service_role";
    if (role === "anon" || role === "authenticated") return "anon";
  } catch {
    /* ไม่ใช่ JWT */
  }
  return "unknown";
}

export function getSupabase() {
  const url = getSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
