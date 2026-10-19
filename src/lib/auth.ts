/**
 * ระบบยืนยันตัวตนหลังบ้าน — คุกกี้เซ็นชื่อ (HMAC) ที่เบราว์เซอร์แก้เองไม่ได้
 *
 * ของเดิมเช็ครหัสในเบราว์เซอร์อย่างเดียว (sessionStorage) ส่วน API เปิดโล่ง
 * ใครก็ยิง /api/customers ดึงข้อมูลลูกค้าทั้งร้านได้ ไฟล์นี้คือฐานของการปิดรูนั้น
 *
 * ใช้ Web Crypto ล้วน ๆ เพื่อให้รันได้ทั้งใน middleware (edge) และใน route (node)
 */

export type SessionRole = "owner" | "staff";

export type SessionPayload = {
  role: SessionRole;
  name: string;
  /** ร้านที่ล็อกอินอยู่ — ทุก query ต้องกรองด้วยค่านี้ */
  tenantId: string;
  /** slug ของร้านนั้น — ใช้กันเปิดลิงก์ /s/<ร้านอื่น>/admin แล้วเห็นหลังบ้านร้านที่ล็อกอินค้างไว้ */
  tenantSlug?: string;
  /** เมนูที่พนักงานคนนี้เปิดดูได้ — undefined = เข้าได้ทุกเมนู (เจ้าของร้าน) */
  menus?: string[];
  /** session นี้มาจากผู้ดูแลระบบกด "เข้าดูแทน" ไม่ใช่เจ้าของร้านล็อกอินเอง — โชว์แถบเตือนใน UI */
  impersonating?: boolean;
  /** หมดอายุ (epoch ms) */
  exp: number;
};

/**
 * ร้านเดียวที่มีอยู่ตอนนี้ (bootstrap) — พอมีหลายร้านจริง ค่านี้จะถูกแทนที่ด้วยการ
 * resolve จากรหัสร้าน/รหัสพนักงานที่กรอกตอนล็อกอิน (ดู T5: Super Admin สร้างร้าน)
 */
export function getBootstrapTenantId(): string | null {
  return process.env.TENANT_ID || null;
}

export const SESSION_COOKIE = "petflow_session";
const SESSION_DAYS = 7;

/**
 * รหัสเจ้าของร้าน — อ่านฝั่งเซิร์ฟเวอร์เท่านั้น
 *
 * ยอมรับ NEXT_PUBLIC_ADMIN_CODE ต่อไปเพื่อไม่ให้ร้านที่ตั้งค่าไว้แล้วหลุดออกจากระบบ
 * แต่ควรย้ายไปใช้ ADMIN_CODE เพราะตัวที่ขึ้นต้น NEXT_PUBLIC_ จะถูกฝังไปในไฟล์ JS ฝั่งเบราว์เซอร์
 */
export function getOwnerCode(): string {
  return (
    process.env.ADMIN_CODE ||
    process.env.NEXT_PUBLIC_ADMIN_CODE ||
    "petflow2026"
  );
}

/**
 * ตั้งรหัสเจ้าของร้านเอง (ผ่าน env) แล้วหรือยัง
 * ถ้ายัง getOwnerCode() จะคืนค่า default "petflow2026" ที่ทุก clone รู้ — ห้ามให้ล็อกอินด้วยค่านี้
 * (ใช้กันช่อง bootstrap login: ยอมรับรหัส env ต่อเมื่อร้านตั้งเองจริงเท่านั้น)
 */
export function isOwnerCodeConfigured(): boolean {
  return Boolean(
    process.env.ADMIN_CODE?.trim() || process.env.NEXT_PUBLIC_ADMIN_CODE?.trim()
  );
}

/**
 * ห้าม fallback ไปใช้ค่าที่เดาได้ตอนขึ้นจริง — ถ้าไม่ตั้ง SESSION_SECRET ค่าที่ได้จะเป็น
 * "petflow-session::petflow2026" ซึ่งเหมือนกันทุก clone ที่ยังไม่ได้ตั้งค่า
 * ใครก็ปลอมคุกกี้ล็อกอินเป็นเจ้าของร้านร้านไหนก็ได้ทันที (เซ็น HMAC เองได้เพราะรู้คีย์)
 * โหมด dev ยังปล่อยผ่านได้เพื่อความสะดวกตอนพัฒนา
 */
function secretKey(): string {
  const explicit = process.env.SESSION_SECRET;
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ยังไม่ได้ตั้งค่า SESSION_SECRET ใน env — ต้องตั้งก่อนใช้งานจริง ห้ามปล่อยให้ใช้ค่า default ที่เดาได้"
    );
  }
  return `petflow-session::${getOwnerCode()}`;
}

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  return atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secretKey()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** แฮชรหัสร้าน (owner code) ก่อนเก็บลง DB — เทียบตอนล็อกอินด้วยการแฮชใหม่แล้วเทียบสตริง */
export async function hashOwnerCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(code.trim()));
  return b64url(digest);
}

/** สุ่ม salt สำหรับรหัสผ่านพนักงาน — คนละอันต่อคน กัน rainbow table */
export function generateSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return b64url(bytes);
}

/** แฮชรหัสผ่านพนักงานด้วย salt เฉพาะคน */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`${salt}::${password}`));
  return b64url(digest);
}

/** สร้างโทเคนสำหรับใส่คุกกี้ */
export async function signSession(
  payload: Omit<SessionPayload, "exp">
): Promise<string> {
  const full: SessionPayload = {
    ...payload,
    exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
  const body = b64url(enc.encode(JSON.stringify(full)));
  return `${body}.${await hmac(body)}`;
}

/** ตรวจโทเคน — คืน null ถ้าลายเซ็นไม่ตรง หรือหมดอายุ */
export async function verifySession(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  // secretKey() throws เมื่อ production ยังไม่ตั้ง SESSION_SECRET — ต้อง fail closed
  // (ถือว่าไม่ได้ล็อกอิน) ไม่ใช่ปล่อยให้ error หลุดขึ้นไปพังทั้งหน้า
  let expectedSig: string;
  try {
    expectedSig = await hmac(body);
  } catch {
    return null;
  }
  if (expectedSig !== sig) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body)) as SessionPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * ตรวจสิทธิ์ในตัว route (ป้องกันซ้อนอีกชั้นจาก middleware)
 * ส่ง requireOwner: true ถ้างานนั้นพนักงานทำไม่ได้ เช่น จัดการบัญชีพนักงาน
 */
export async function getSessionFrom(
  req: { cookies: { get(name: string): { value: string } | undefined } }
): Promise<SessionPayload | null> {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions(maxAgeDays = SESSION_DAYS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeDays * 24 * 60 * 60,
  };
}
