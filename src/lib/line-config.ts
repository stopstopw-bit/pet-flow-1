import { getSecrets } from "./secrets-store";
import { isBootstrapTenant } from "./tenant-context";

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

export async function getLineCredentials(): Promise<LineCredentials | null> {
  const secrets = await getSecrets();
  const line = secrets.line;
  const envToken = process.env.LINE_CHANNEL_TOKEN?.trim();
  // LIFF ใน env เป็นของร้าน bootstrap เท่านั้น — ร้านอื่นที่ยังไม่ตั้งต้องว่าง
  const envLiff = isBootstrapTenant() ? process.env.NEXT_PUBLIC_LIFF_ID?.trim() : undefined;

  if (line?.channelToken) {
    return {
      channelToken: line.channelToken,
      channelSecret: line.channelSecret,
      liffId: line.liffId || envLiff,
      source: "database",
    };
  }
  // LINE OA ใน env เป็นของร้าน bootstrap — ร้านอื่นที่ยังไม่ตั้ง LINE ต้องไม่ส่งข้อความผ่าน OA ร้านนี้
  if (envToken && isBootstrapTenant()) {
    return {
      channelToken: envToken,
      channelSecret: process.env.LINE_CHANNEL_SECRET?.trim(),
      liffId: envLiff,
      source: "env",
    };
  }
  if (line?.liffId) {
    return { channelToken: "", liffId: line.liffId, source: "database" };
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

export function bookingConfirmUrl(bookingId: string, liffId?: string) {
  const lid = liffId;
  const base =
    getAppUrlFromEnv() || "https://petflow.example.com";
  if (lid) {
    return `https://liff.line.me/${lid}?path=bookings&id=${bookingId}`;
  }
  return `${base}/app/bookings?id=${bookingId}`;
}

/** ลิงก์หน้ากรอกจุดรับ-ส่งน้อง — เปิดผ่าน LIFF ถ้ามี ไม่งั้นเปิดหน้าเว็บตรงๆ */
export function bookingTransportUrl(bookingId: string, liffId?: string) {
  const lid = liffId;
  const id = encodeURIComponent(bookingId);
  if (lid) return `https://liff.line.me/${lid}?path=booking-transport&id=${id}`;
  return `${getAppUrlFromEnv()}/app/booking-transport?id=${id}`;
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
