import { NextResponse, type NextRequest } from "next/server";
import { requireTenantId } from "./tenant-context";

/**
 * เซสชันลูกค้าฝั่ง LIFF — คุกกี้เซ็นชื่อ (HMAC) ผูกกับ lineUserId ที่ "ตรวจกับ LINE แล้วจริง"
 * (ผ่าน verifyLiffIdToken ใน liff-auth.ts) ไม่ใช่ lineUserId ที่ client ส่งมาเฉยๆ ใน body/query
 *
 * ทุก route ฝั่งลูกค้าที่เคยเชื่อ body.lineUserId ตรงๆ ต้องเปลี่ยนมาอ่านจาก requireCustomerSession() แทน
 * ผูก tenantId ไว้ในคุกกี้ด้วย เพื่อกันเอาคุกกี้ร้าน A ไปใช้กับ route ที่ resolve เป็นร้าน B
 */

export type CustomerSessionPayload = {
  lineUserId: string;
  tenantId: string;
  exp: number;
};

export const CUSTOMER_SESSION_COOKIE = "pf_customer";
const SESSION_DAYS = 30;

function secretKey(): string {
  const explicit = process.env.SESSION_SECRET;
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ยังไม่ได้ตั้งค่า SESSION_SECRET ใน env — ต้องตั้งก่อนใช้งานจริง"
    );
  }
  return "petflow-customer-session-dev-only";
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
    // prefix กันชนกับคีย์ของ src/lib/auth.ts แม้ใช้ SESSION_SECRET ตัวเดียวกัน
    enc.encode(`customer::${secretKey()}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function signCustomerSession(
  payload: Omit<CustomerSessionPayload, "exp">
): Promise<string> {
  const full: CustomerSessionPayload = {
    ...payload,
    exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
  const body = b64url(enc.encode(JSON.stringify(full)));
  return `${body}.${await hmac(body)}`;
}

export async function verifyCustomerSession(
  token: string | undefined | null
): Promise<CustomerSessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let expected: string;
  try {
    expected = await hmac(body);
  } catch {
    return null;
  }
  if (expected !== sig) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body)) as CustomerSessionPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    if (!payload.lineUserId || !payload.tenantId) return null;
    return payload;
  } catch {
    return null;
  }
}

export function customerSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

/**
 * ใช้ใน route ฝั่งลูกค้า — คืน lineUserId ที่ตรวจแล้วจริงของร้านปัจจุบัน
 * (ต้อง wrap ด้วย withResolvedTenant มาก่อนแล้ว requireTenantId() ถึงจะรู้ร้าน)
 * คืน null ถ้ายังไม่ได้ล็อกอิน/คุกกี้หมดอายุ/คุกกี้เป็นของร้านอื่น
 */
export async function requireCustomerSession(
  req: NextRequest
): Promise<CustomerSessionPayload | null> {
  const session = await verifyCustomerSession(req.cookies.get(CUSTOMER_SESSION_COOKIE)?.value);
  if (!session) return null;
  if (session.tenantId !== requireTenantId()) return null;
  return session;
}

/**
 * ยังไม่มีคุกกี้เซสชันลูกค้า (แลก LIFF token ไม่ผ่าน / คุกกี้หาย) — ตอบเป็นข้อความไทยที่ลูกค้าอ่านเข้าใจ
 * แทน "unauthorized" ที่เคยโผล่ขึ้นจอ · code ให้หน้าแอปรู้ว่าควรลองแลกเซสชันใหม่แล้วยิงซ้ำ (customer-fetch.ts)
 */
export const NO_CUSTOMER_SESSION = "no_session";
export const NO_CUSTOMER_SESSION_MESSAGE =
  "ระบบยังยืนยันบัญชี LINE ไม่สำเร็จ — ปิดหน้านี้แล้วเปิดลิงก์จากแชท LINE ใหม่อีกครั้งนะคะ";

export function noCustomerSessionResponse() {
  return NextResponse.json(
    { error: NO_CUSTOMER_SESSION_MESSAGE, code: NO_CUSTOMER_SESSION },
    { status: 401 }
  );
}
