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

export function getSupabaseUrl() {
  return normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
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
