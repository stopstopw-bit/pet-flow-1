import { getSecrets, type LineSecrets } from "./secrets-store";
import { isEnvOwnerTenant, requireTenantId, withTenantEvenIfClosed } from "./tenant-context";
import { mainShopTenantId } from "./tenant-resolve";
import { getDirectoryDb } from "./supabase/server";

export type LineCredentials = {
  channelToken: string;
  channelSecret?: string;
  liffId?: string;
  source: "env" | "database";
};

export function parseLineChannelToken(raw: string) {
  const token = raw.trim();
  if (token.length < 20) {
    throw new Error(
      "Channel Access Token สั้นเกินไป — copy จาก LINE Developers → Messaging API"
    );
  }
  return token;
}

/** LIFF ID จากที่ร้านวางมา — รับได้ทั้ง ID เปล่า ๆ และลิงก์เต็ม https://liff.line.me/<id>
 * (เคยมีร้านวางลิงก์เต็ม แล้ว liff.init ขึ้น "resource is not found") */
export function parseLiffId(raw: string | undefined | null): string {
  const value = String(raw || "").trim();
  const m = value.match(/liff\.line\.me\/([^/?#\s]+)/i);
  return (m ? m[1] : value).trim();
}

/**
 * ค่า LINE ชุดนี้เป็นของร้าน PetFlow ไหม (LIFF ID หรือ Token ซ้ำกับของ PetFlow / ใน env)
 * ร้านแรก (TENANT_ID) เคยถูกตั้ง LINE PetFlow ไว้ก่อนสลับลิงก์เป็น Back Home — ค่านั้นยังค้างในร้าน
 * ร้านอื่นต้องมองไม่เห็นค่าชุดนี้เลย (หน้าตั้งค่าว่าง ส่งการ์ดไม่ได้ จนกว่าร้านจะตั้ง LINE ของตัวเอง)
 */
async function isMainShopLine(line: LineSecrets): Promise<boolean> {
  const liff = parseLiffId(line.liffId);
  const token = line.channelToken?.trim();
  const envToken = process.env.LINE_CHANNEL_TOKEN?.trim();
  const envLiff = parseLiffId(process.env.NEXT_PUBLIC_LIFF_ID);
  if ((token && token === envToken) || (liff && liff === envLiff)) return true;
  const mainId = await mainShopTenantId();
  if (!mainId || mainId === requireTenantId()) return false;
  const main = (await withTenantEvenIfClosed(mainId, () => getSecrets()).catch(() => ({}) as { line?: LineSecrets })).line;
  if (!main) return false;
  return (!!liff && liff === parseLiffId(main.liffId)) || (!!token && token === main.channelToken?.trim());
}

export async function getLineCredentials(): Promise<LineCredentials | null> {
  const secrets = await getSecrets();
  const envToken = process.env.LINE_CHANNEL_TOKEN?.trim();
  // LINE ใน env เป็นของร้าน PetFlow เท่านั้น (ดู isEnvOwnerTenant) — ร้านอื่นที่ยังไม่ตั้งต้องว่าง
  // ห้ามยืม LINE ของร้านอื่นมาใช้ ไม่ว่ากรณีไหน: การ์ด/ลิงก์จะออกจาก LINE ผิดร้าน
  const envOwner = await isEnvOwnerTenant();
  const line = secrets.line && !envOwner && (await isMainShopLine(secrets.line)) ? undefined : secrets.line;
  const envLiff = envOwner ? parseLiffId(process.env.NEXT_PUBLIC_LIFF_ID) || undefined : undefined;

  if (line?.channelToken) {
    return {
      channelToken: line.channelToken,
      channelSecret: line.channelSecret,
      liffId: parseLiffId(line.liffId) || envLiff,
      source: "database",
    };
  }
  // LINE OA ใน env เป็นของร้าน PetFlow — ร้านอื่นที่ยังไม่ตั้ง LINE ต้องไม่ส่งข้อความผ่าน OA ร้านนี้
  if (envToken && envOwner) {
    return {
      channelToken: envToken,
      channelSecret: process.env.LINE_CHANNEL_SECRET?.trim(),
      liffId: parseLiffId(line?.liffId) || envLiff,
      source: "env",
    };
  }
  if (line?.liffId) {
    return { channelToken: "", liffId: parseLiffId(line.liffId), source: "database" };
  }
  if (envLiff) {
    return { channelToken: "", liffId: envLiff, source: "env" };
  }

  return null;
}

export async function isLineConfigured() {
  const creds = await getLineCredentials();
  return Boolean(creds?.channelToken);
}

export async function isLiffConfigured() {
  const creds = await getLineCredentials();
  return Boolean(creds?.liffId);
}

export async function testLineChannelToken(token: string) {
  const res = await fetch("https://api.line.me/v2/bot/info", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as {
    message?: string;
    displayName?: string;
    basicId?: string;
  };

  if (!res.ok) {
    const hint =
      data.message === "Authentication failed" || res.status === 401
        ? "Token ผิดหรือหมดอายุ — ออก Token ใหม่ใน LINE Developers"
        : data.message || `LINE API HTTP ${res.status}`;
    return { ok: false as const, message: hint };
  }

  return {
    ok: true as const,
    displayName: data.displayName,
    basicId: data.basicId,
  };
}

/**
 * ลิงก์หน้าลูกค้าของร้านที่กำลังทำงานอยู่ — https://…/s/<slug> (ไม่มี /app ต่อท้าย)
 * ทุกลิงก์ที่ส่งให้ลูกค้าต้องมีชื่อร้าน ไม่งั้นลิงก์ /app เปล่า ๆ จะเปิดเป็นร้าน PetFlow
 */
export async function shopAppBase(): Promise<string> {
  const appUrl = getAppUrlFromEnv();
  const sb = getDirectoryDb();
  if (!sb) return appUrl;
  const { data } = await sb.from("tenants").select("slug").eq("id", requireTenantId()).maybeSingle();
  const slug = (data as { slug?: string } | null)?.slug;
  return slug ? `${appUrl}/s/${slug}` : appUrl;
}

/** URL หลักของเว็บ — ใช้ตั้ง LINE webhook/LIFF/ลิงก์การ์ด ต้องเป็นโดเมนถาวรเท่านั้น
 * (ห้าม fallback ไป VERCEL_URL เพราะเปลี่ยนทุกครั้งที่ deploy ใหม่ จะทำให้ webhook หลุด) */
export function getAppUrlFromEnv() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    // โดเมน production ของ Vercel (เช่น xxx.vercel.app) — ถาวร ไม่เปลี่ยนตาม deploy เหมือน VERCEL_URL
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    "https://petflow.example.com"
  );
}

export function bookingConfirmUrl(bookingId: string, liffId?: string, shopBase?: string) {
  const lid = liffId;
  const base = shopBase || getAppUrlFromEnv() || "https://petflow.example.com";
  if (lid) {
    return `https://liff.line.me/${lid}?path=bookings&id=${bookingId}`;
  }
  return `${base}/app/bookings?id=${bookingId}`;
}

/** ลิงก์หน้ากรอกจุดรับ-ส่งน้อง — เปิดผ่าน LIFF ถ้ามี ไม่งั้นเปิดหน้าเว็บตรงๆ */
export function bookingTransportUrl(bookingId: string, liffId?: string, shopBase?: string) {
  const lid = liffId;
  const id = encodeURIComponent(bookingId);
  if (lid) return `https://liff.line.me/${lid}?path=booking-transport&id=${id}`;
  return `${shopBase || getAppUrlFromEnv()}/app/booking-transport?id=${id}`;
}

/** ดู Webhook URL ปัจจุบันของ LINE (Messaging API) */
export async function getLineWebhookEndpoint(token: string) {
  try {
    const res = await fetch(
      "https://api.line.me/v2/bot/channel/webhook/endpoint",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    return (await res.json()) as { endpoint?: string; active?: boolean };
  } catch {
    return null;
  }
}

/** ตั้ง Webhook URL ของ LINE อัตโนมัติ (แทนการเข้า Developers Console) */
export async function setLineWebhookEndpoint(token: string, url: string) {
  const res = await fetch(
    "https://api.line.me/v2/bot/channel/webhook/endpoint",
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ endpoint: url }),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false as const, message: text || `HTTP ${res.status}` };
  }
  return { ok: true as const };
}
