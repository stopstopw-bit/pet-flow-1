/**
 * Telegram Bot — แจ้งเตือนเจ้าของเมื่อมีจอง / ลูกค้ายืนยัน
 * ตั้งค่า: หน้า Admin → ติดตั้ง หรือ env TELEGRAM_BOT_TOKEN
 */

import {
  ensureTelegramWebhook,
  getAppUrlFromEnv,
  getTelegramCredentials,
  syncTelegramBotCommands,
} from "./telegram-config";
import { requireTenantId } from "./tenant-context";
import { runAfterResponse } from "./after-response";
import { getSiteConfig } from "./config-store";

const TELEGRAM_API = "https://api.telegram.org";

export type TelegramCommand = {
  command: string;
  payload?: string;
};

/** ปุ่มเมนูด้านล่างแชท — กดได้เลย ไม่ต้องพิมพ์คำสั่ง */
export const TELEGRAM_MENU_BUTTONS = {
  today: "📅 นัดวันนี้",
  tomorrow: "🌅 เตรียมตัวพรุ่งนี้",
  queue: "⏳ คิวรอยืนยัน",
  month: "🗓️ ตารางเดือน",
  sales: "💰 ยอดขายวันนี้",
  finance: "📒 การเงินวันนี้",
  book: "➕ เพิ่มนัด",
  summary: "📋 สรุปลูกค้า",
  confirm: "✅ ส่งยืนยันนัด",
  transport: "🚗 รับ-ส่งน้อง",
  help: "❓ วิธีใช้",
} as const;

const MENU_TO_COMMAND: Record<string, string> = {
  [TELEGRAM_MENU_BUTTONS.today]: "/today",
  [TELEGRAM_MENU_BUTTONS.tomorrow]: "/tomorrow",
  [TELEGRAM_MENU_BUTTONS.queue]: "/queue",
  [TELEGRAM_MENU_BUTTONS.month]: "/month",
  [TELEGRAM_MENU_BUTTONS.sales]: "/sales",
  [TELEGRAM_MENU_BUTTONS.finance]: "/finance",
  [TELEGRAM_MENU_BUTTONS.book]: "/book",
  [TELEGRAM_MENU_BUTTONS.summary]: "/summary",
  [TELEGRAM_MENU_BUTTONS.confirm]: "/confirm",
  [TELEGRAM_MENU_BUTTONS.transport]: "/transport",
  [TELEGRAM_MENU_BUTTONS.help]: "/help",
};

export function getTelegramMenuKeyboard() {
  return {
    keyboard: [
      [
        { text: TELEGRAM_MENU_BUTTONS.today },
        { text: TELEGRAM_MENU_BUTTONS.tomorrow },
      ],
      [
        { text: TELEGRAM_MENU_BUTTONS.queue },
        { text: TELEGRAM_MENU_BUTTONS.month },
      ],
      [
        { text: TELEGRAM_MENU_BUTTONS.sales },
        { text: TELEGRAM_MENU_BUTTONS.finance },
      ],
      [
        { text: TELEGRAM_MENU_BUTTONS.book },
        { text: TELEGRAM_MENU_BUTTONS.summary },
      ],
      [
        { text: TELEGRAM_MENU_BUTTONS.transport },
        { text: TELEGRAM_MENU_BUTTONS.confirm },
        { text: TELEGRAM_MENU_BUTTONS.help },
      ],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

/** แปลงข้อความจากปุ่มเมนู → คำสั่ง */
export function normalizeTelegramInput(text: string) {
  const trimmed = text.trim();
  if (MENU_TO_COMMAND[trimmed]) return MENU_TO_COMMAND[trimmed];
  if (/รับ-?ส่ง/.test(trimmed)) return "/transport";
  if (/คิว.*ยืนยัน/.test(trimmed)) return "/queue";
  if (/นัดวันนี้/.test(trimmed)) return "/today";
  if (/เตรียมตัวพรุ่งนี้|พรุ่งนี้/.test(trimmed)) return "/tomorrow";
  if (/ตารางเดือน/.test(trimmed)) return "/month";
  if (/ยอดขาย/.test(trimmed)) return "/sales";
  if (/การเงิน/.test(trimmed)) return "/finance";
  if (/เพิ่มนัด/.test(trimmed)) return "/book";
  if (/สรุปลูกค้า/.test(trimmed)) return "/summary";
  if (/ส่งยืนยัน|ยืนยันนัด/.test(trimmed)) return "/confirm";
  if (/วิธีใช้|help/i.test(trimmed)) return "/help";
  return trimmed;
}

/** รองรับ /start, /start@BotName, /start payload */
export function parseTelegramCommand(text: string): TelegramCommand {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return { command: "" };

  const [head, ...rest] = trimmed.split(/\s+/);
  const command = head.split("@")[0].toLowerCase();
  const payload = rest.join(" ").trim();
  return payload ? { command, payload } : { command };
}

/**
 * เว็บฮุคต่อร้าน — ทุกร้านแชร์โดเมนเดียวกัน แต่แต่ละร้านต้องมี URL ไม่ซ้ำกัน
 * (Telegram ส่ง update มาที่ URL ที่ลงทะเบียนไว้เท่านั้น ไม่มีข้อมูลร้านมากับ payload)
 * ไม่ใส่ tenantId = URL รวม (ของเก่า ก่อนแยกร้าน — ใช้กับร้าน bootstrap เท่านั้น)
 */
export function getTelegramWebhookUrl(appUrl?: string, tenantId?: string) {
  const base = (appUrl || getAppUrlFromEnv()).replace(/\/$/, "");
  if (!base) return "";
  return tenantId ? `${base}/api/telegram/webhook/${tenantId}` : `${base}/api/telegram/webhook`;
}

async function telegramApi<T = unknown>(
  token: string,
  method: string,
  body?: Record<string, unknown>
) {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as T & {
    ok?: boolean;
    description?: string;
    error_code?: number;
  };

  return {
    ok: res.ok && data.ok !== false,
    status: res.status,
    data,
  };
}

export async function sendTelegramToChat(
  token: string,
  chatId: number | string,
  text: string,
  options?: { html?: boolean; showMenu?: boolean }
) {
  const html = options?.html !== false;
  const showMenu = options?.showMenu !== false;

  return telegramApi(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: html ? "HTML" : undefined,
    reply_markup: showMenu ? getTelegramMenuKeyboard() : undefined,
  });
}

/** ลบปุ่มเก่าแล้วส่งเมนูใหม่ — Telegram ไม่อัปเดต reply keyboard เอง */
export async function refreshTelegramMenuForChat(
  token: string,
  chatId: number | string,
  text: string,
  options?: { html?: boolean }
) {
  await telegramApi(token, "sendMessage", {
    chat_id: chatId,
    text: "…",
    reply_markup: { remove_keyboard: true },
  });

  const html = options?.html === true;
  return telegramApi(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: html ? "HTML" : undefined,
    reply_markup: getTelegramMenuKeyboard(),
  });
}

export async function pushTelegramMenuToOwners(text?: string) {
  const creds = await getTelegramCredentials();
  if (!creds?.botToken || !creds.ownerChatIds.length) {
    return { ok: false as const, reason: "not_configured" };
  }

  await setTelegramBotCommands(creds.botToken).catch(() => {});

  const results = await Promise.all(
    creds.ownerChatIds.map((chatId) =>
      refreshTelegramMenuForChat(
        creds.botToken,
        chatId,
        text || "🔄 อัปเดตเมนูแล้ว — กดปุ่มด้านล่างได้เลย"
      )
    )
  );

  return {
    ok: results.every((r) => r.ok),
    pushed: creds.ownerChatIds.length,
    results,
  };
}

export async function sendTelegram(text: string) {
  const creds = await getTelegramCredentials();
  if (!creds?.botToken || !creds.ownerChatIds.length) {
    return { ok: false, reason: "not_configured" };
  }
  if (text.includes(SHOP_NAME_TOKEN)) {
    const name = (await getSiteConfig().catch(() => null))?.business?.name?.trim() || "แจ้งเตือนร้าน";
    text = text.split(SHOP_NAME_TOKEN).join(escapeHtml(name));
  }

  if (creds.appUrl) {
    // เช็ค/ซ่อม webhook = 2 รอบไป-กลับ Telegram — ทำครั้งเดียวต่อ 10 นาทีต่อเครื่อง ไม่ใช่ทุกข้อความ
    const key = `${requireTenantId()}|${creds.botToken}|${creds.appUrl}`;
    const last = webhookCheckedAt.get(key) || 0;
    if (Date.now() - last > WEBHOOK_RECHECK_MS) {
      webhookCheckedAt.set(key, Date.now());
      await ensureTelegramWebhook(creds.botToken, creds.appUrl, requireTenantId()).catch(() => {
        webhookCheckedAt.delete(key);
      });
    }
  }

  const results = await Promise.all(
    creds.ownerChatIds.map((chatId) =>
      sendTelegramToChat(creds.botToken, chatId, text, { showMenu: false })
    )
  );

  return { ok: results.every((r) => r.ok) };
}

const WEBHOOK_RECHECK_MS = 10 * 60 * 1000;
const webhookCheckedAt = new Map<string, number>();

/**
 * แจ้งเจ้าของร้านหลังตอบลูกค้าแล้ว — ใช้ใน route ฝั่งลูกค้าแทน await sendTelegram()
 * ลูกค้าไม่ต้องรอ Telegram (ช้า/ล่มก็ไม่ขวางการสมัคร/จอง) ข้อความยังส่งครบเหมือนเดิม
 */
export function sendTelegramLater(text: string) {
  runAfterResponse("telegram notify", () => sendTelegram(text));
}

/** ส่งรูป + คำบรรยายให้เจ้าของทุกคน (เช่น รูปโปรไฟล์คนที่แอด LINE) */
export async function sendTelegramPhoto(photoUrl: string, caption: string) {
  const creds = await getTelegramCredentials();
  if (!creds?.botToken || !creds.ownerChatIds.length) {
    return { ok: false, reason: "not_configured" };
  }
  const results = await Promise.all(
    creds.ownerChatIds.map((chatId) =>
      telegramApi(creds.botToken, "sendPhoto", {
        chat_id: chatId,
        photo: photoUrl,
        caption,
      })
    )
  );
  return { ok: results.every((r) => r.ok) };
}

export async function getTelegramWebhookInfo(token: string) {
  return telegramApi(token, "getWebhookInfo");
}

export async function setTelegramWebhook(token: string, url: string) {
  return telegramApi(token, "setWebhook", {
    url,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
}

export async function setTelegramBotCommands(token: string) {
  return syncTelegramBotCommands(token);
}

export function buildStartReply(chatId: number | string) {
  return (
    `🐾 <b>สวัสดีจากบอทของร้าน</b>\n\n` +
    `Chat ID ของคุณ: <code>${chatId}</code>\n` +
    `👇 กดปุ่มเมนูด้านล่างได้เลย\n` +
    `➕ เพิ่มนัด · 📋 สรุปลูกค้า · ✅ ส่งยืนยันนัด\n` +
    `พิมพ์ <code>/help</code> ดูตัวอย่างคำสั่ง`
  );
}

/** แทนด้วยชื่อร้านตอน sendTelegram (ฟังก์ชันจัดข้อความเป็น sync อ่านตั้งค่าร้านไม่ได้) */
const SHOP_NAME_TOKEN = "\u0000shop\u0000";

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatBookingTelegram(
  title: string,
  detail: Record<string, string>
) {
  const lines = Object.entries(detail)
    .map(([k, v]) => `<b>${k}</b>: ${v}`)
    .join("\n");
  return `🐾 <b>${SHOP_NAME_TOKEN}</b>\n${title}\n\n${lines}`;
}
