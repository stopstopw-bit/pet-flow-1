import { AsyncLocalStorage } from "node:async_hooks";

/**
 * จำผลอ่านที่ใช้ซ้ำภายใน "request เดียว" (เช่น ตั้งค่าร้าน) — route หนึ่งเรียก getSiteConfig()
 * 5-8 รอบ (featureOff, มัดจำ, ความว่างคิว, ชื่อร้านใน Telegram …) แต่ละรอบวิ่งไป DB ใหม่
 * จำไว้แค่ตลอด request นั้น จบ request ก็ทิ้ง — ไม่มีค่าเก่าค้างข้าม request / ข้ามเครื่อง
 * เปิดขอบเขตใน withTenant()/withResolvedTenant() (tenant-context.ts)
 */
const memoStorage = new AsyncLocalStorage<Map<string, Promise<unknown>>>();

export function runWithRequestMemo<T>(fn: () => Promise<T>): Promise<T> {
  return memoStorage.run(new Map(), fn);
}

/** อ่านครั้งแรกจริง ครั้งต่อไปใน request เดียวกันใช้ผลเดิม · อ่านพัง = ไม่จำ ให้ครั้งหน้าลองใหม่ */
export function memoInRequest<T>(memoKey: () => string, load: () => Promise<T>): Promise<T> {
  const memo = memoStorage.getStore();
  if (!memo) return load();
  // คำนวณ key เฉพาะตอนอยู่ในขอบเขต (มีร้านแน่นอน) — นอกขอบเขตเรียก load ตรง ๆ แบบเดิม
  const key = memoKey();
  const hit = memo.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  const p = load();
  memo.set(key, p);
  p.catch(() => memo.delete(key));
  return p;
}

/** เขียนค่าใหม่แล้ว — ลืมค่าที่จำไว้ ให้อ่านรอบหน้าใน request เดียวกันได้ค่าใหม่ */
export function forgetInRequest(memoKey: () => string) {
  const memo = memoStorage.getStore();
  if (memo) memo.delete(memoKey());
}
