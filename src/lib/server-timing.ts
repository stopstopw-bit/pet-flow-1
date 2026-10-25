import type { NextResponse } from "next/server";

/**
 * ใส่เวลาที่เซิร์ฟเวอร์ใช้ลงหัว Server-Timing + log บน Vercel — ไว้วัดว่าสมัคร/จองช้าตรงไหน
 * ดูได้จาก DevTools › Network หรือ Runtime Logs ค้นคำว่า [timing]
 */
export function withServerTiming<T extends Response | NextResponse>(res: T, startedAt: number, label: string): T {
  const ms = Math.round(performance.now() - startedAt);
  try {
    res.headers.set("Server-Timing", `app;desc="${label}";dur=${ms}`);
  } catch {
    /* หัวของ response บางแบบแก้ไม่ได้ — ข้าม */
  }
  console.log(`[timing] ${label} ${res.status} ${ms}ms`);
  return res;
}
