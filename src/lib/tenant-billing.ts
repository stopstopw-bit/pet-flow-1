import { getDirectoryDb } from "./supabase/server";

/**
 * ค่าบริการรายเดือนของร้าน — tenants.due_date = วันครบกำหนดจ่ายครั้งถัดไป
 * ถึงวันนั้นแล้ว (เวลาไทย) ยังไม่ได้กด "รับเงินแล้ว" = ร้านปิดเองอัตโนมัติ
 * (ลูกค้าเข้าไม่ได้ หลังบ้านเหลือแค่หน้า "ค่าบริการ" ไว้อัปสลิป cron ข้ามร้านนี้)
 * ไม่ได้เปลี่ยน status ในฐานข้อมูล — กดรับเงินแล้ววันจ่ายเลื่อนไป ร้านกลับมาใช้ได้ทันที
 * due_date ว่าง = ยังไม่คิดรายเดือน ใช้ได้ตามสถานะ
 */

export type TenantGate = { id: string; status: string; dueDate: string | null };

/** วันนี้ตามเวลาไทย YYYY-MM-DD */
export function todayBangkok(): string {
  return new Date(Date.now() + 7 * 60 * 60_000).toISOString().slice(0, 10);
}

export function isOverdue(dueDate: string | null | undefined): boolean {
  return !!dueDate && todayBangkok() >= dueDate.slice(0, 10);
}

/** ร้านเปิดใช้ได้ไหม — สถานะ trial/active และยังไม่เลยวันครบกำหนดจ่าย */
export function isTenantOpen(g: TenantGate): boolean {
  return (g.status === "trial" || g.status === "active") && !isOverdue(g.dueDate);
}

/** บวก n เดือนโดยคงวันที่เดิม (5 → 5) ถ้าเดือนนั้นไม่มีวันนั้น (31) ใช้วันสุดท้ายของเดือน */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/**
 * วันครบกำหนดใหม่หลังรับเงิน n เดือน — ต่อจากวันครบกำหนดเดิม (คงรอบวันที่เดิม)
 * ถ้าเลยกำหนดมาแล้ว (ร้านถูกระงับไปช่วงหนึ่ง) นับจากวันนี้ ไม่คิดช่วงที่ปิดอยู่
 */
export function extendDueDate(current: string | null, months: number): string {
  const today = todayBangkok();
  const base = current && current.slice(0, 10) >= today ? current.slice(0, 10) : today;
  return addMonths(base, months);
}

/** คอลัมน์ due_date ยังไม่มี (ยังไม่เคยรัน migration tenants.due_date) */
export function isMissingDueDate(msg: string) {
  return /due_date/i.test(msg) && /(does not exist|could not find|schema cache|PGRST204|42703)/i.test(msg);
}

/** สร้างคอลัมน์ due_date ให้เอง — เรียกตอนผู้ดูแลระบบจะตั้งวันจ่าย */
export async function ensureDueDateColumn() {
  // import ตอนใช้ — ไฟล์นี้ถูกดึงเข้า middleware (ผ่าน tenant-resolve) ไม่อยากลาก SQL ทั้งก้อนไปด้วย
  const { ensureMigration } = await import("./migrations");
  return ensureMigration("tenants.due_date");
}

/**
 * cache สั้นๆ ใน process — กัน query ตาราง tenants ทุก request แต่ยังสั้นพอให้
 * การระงับ/เลื่อนวันจ่ายจากหน้า /platform มีผลกับทุกเครื่องภายในไม่กี่นาที
 */
const TTL_MS = 60_000;
const cache = new Map<string, { gate: TenantGate | null; at: number }>();

async function fetchGate(col: "slug" | "id", value: string): Promise<TenantGate | null> {
  const sb = getDirectoryDb();
  if (!sb) return null;
  const q = (cols: string) => sb.from("tenants").select(cols).eq(col, value).limit(1).maybeSingle();
  let { data, error } = await q("id, status, due_date");
  // ฐานข้อมูลที่ยังไม่มีคอลัมน์ due_date — อ่านแบบเดิมไปก่อน ร้านต้องไม่พังเพราะเรื่องนี้
  if (error && isMissingDueDate(error.message)) ({ data, error } = await q("id, status"));
  if (error) throw new Error(error.message);
  const row = data as { id: string; status: string; due_date?: string | null } | null;
  return row ? { id: row.id, status: row.status, dueDate: row.due_date || null } : null;
}

async function cachedGate(col: "slug" | "id", value: string): Promise<TenantGate | null> {
  const key = `${col}:${value}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.gate;
  const gate = await fetchGate(col, value);
  cache.set(key, { gate, at: Date.now() });
  return gate;
}

export function tenantGateBySlug(slug: string) {
  return cachedGate("slug", slug);
}

export function tenantGateById(id: string) {
  return cachedGate("id", id);
}

/** ล้าง cache หลังผู้ดูแลระบบเปลี่ยนสถานะ/วันจ่าย (มีผลทันทีในเครื่องนี้ เครื่องอื่นตาม TTL) */
export function clearTenantGateCache() {
  cache.clear();
}
