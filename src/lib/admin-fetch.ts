type JsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function adminJson<T>(
  url: string,
  init?: RequestInit
): Promise<JsonResult<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      ...init,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data: T & { error?: string; message?: string };
    try {
      data = JSON.parse(text);
    } catch {
      // หน้าข้อผิดพลาดของ Vercel (เช่น 500/504) ไม่ใช่ JSON — บอกรหัสไว้ให้ไล่ปัญหาต่อได้
      return {
        ok: false,
        error: res.status === 504
          ? "เซิร์ฟเวอร์ตอบช้าเกินไป (HTTP 504) — ฐานข้อมูลอาจเชื่อมไม่ได้"
          : `เซิร์ฟเวอร์ตอบผิดพลาด (HTTP ${res.status}) ${url}`,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: data.message || data.error || `HTTP ${res.status}`,
      };
    }
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("abort")) {
      return { ok: false, error: "โหลดช้าเกินไป — ลองใหม่อีกครั้ง" };
    }
    return { ok: false, error: "เชื่อมต่อไม่ได้ — ตรวจสอบเน็ตแล้วลองใหม่" };
  } finally {
    clearTimeout(timer);
  }
}
