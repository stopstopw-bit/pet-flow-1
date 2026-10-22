import { NextRequest, NextResponse } from "next/server";
import { handleTelegramCommand } from "@/lib/telegram-commands";
import {
  deriveWebhookSecretToken,
  getTelegramCredentials,
  isTelegramConfigured,
  registerTelegramBot,
} from "@/lib/telegram-config";
import {
  buildStartReply,
  getTelegramWebhookInfo,
  getTelegramWebhookUrl,
  normalizeTelegramInput,
  parseTelegramCommand,
  pushTelegramMenuToOwners,
  refreshTelegramMenuForChat,
  sendTelegramToChat,
  setTelegramBotCommands,
} from "@/lib/telegram";
import { getBootstrapTenantId, getSessionFrom } from "@/lib/auth";
import { withTenant } from "@/lib/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * URL เก่า (ก่อนแยกเว็บฮุคต่อร้าน) — คงไว้เฉพาะร้าน bootstrap ที่เคยลงทะเบียนไว้แล้ว
 * ร้านอื่นทุกร้านต้องใช้ /api/telegram/webhook/<tenantId> (ตั้งค่าใหม่จะได้ URL นี้อัตโนมัติ)
 */
function requireBootstrapTenant() {
  const id = getBootstrapTenantId();
  if (!id) throw new Error("no bootstrap tenant configured");
  return id;
}

/**
 * GET /api/telegram/webhook — ตรวจสอบ webhook (ร้าน bootstrap)
 * GET /api/telegram/webhook?register=1 — ลงทะเบียน webhook อัตโนมัติ
 */
export async function GET(req: NextRequest) {
  // เจ้าของร้าน bootstrap เท่านั้น — ดูหมายเหตุใน /api/telegram/webhook/[tenantId]
  const session = await getSessionFrom(req);
  if (!session || session.role !== "owner" || session.tenantId !== requireBootstrapTenant()) {
    return NextResponse.json({ ok: true, endpoint: "telegram-webhook" });
  }
  return withTenant(requireBootstrapTenant(), () => handleGet(req));
}

async function handleGet(req: NextRequest) {
  const creds = await getTelegramCredentials();
  if (!creds?.botToken) {
    return NextResponse.json(
      {
        ok: false,
        error: "ยังไม่ได้ตั้งบอท — ไป Admin → ติดตั้ง → Telegram",
        hint: "TELEGRAM_BOT_TOKEN missing",
      },
      { status: 503 }
    );
  }

  const register = req.nextUrl.searchParams.get("register") === "1";
  const refreshMenu = req.nextUrl.searchParams.get("refresh_menu") === "1";
  const webhookUrl = getTelegramWebhookUrl(creds.appUrl);

  if (refreshMenu) {
    const pushed = await pushTelegramMenuToOwners();
    return NextResponse.json({
      ...pushed,
      source: creds.source,
      message: pushed.ok
        ? "✅ ส่งเมนูใหม่ไปใน Telegram แล้ว — ดูแชทบอท"
        : "❌ ส่งเมนูไม่สำเร็จ",
    });
  }

  if (register) {
    if (!webhookUrl) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบ URL เว็บ — ตั้งในหน้า Admin → ติดตั้ง" },
        { status: 400 }
      );
    }

    const result = await registerTelegramBot(creds.botToken, creds.appUrl, requireBootstrapTenant());
    await pushTelegramMenuToOwners().catch(() => {});
    return NextResponse.json({
      ...result,
      source: creds.source,
    });
  }

  const info = await getTelegramWebhookInfo(creds.botToken);
  const configured = await isTelegramConfigured();

  return NextResponse.json({
    ok: info.ok,
    configured,
    source: creds.source,
    expectedWebhookUrl: webhookUrl || null,
    webhookInfo: info.data,
    ownerChatIds: creds.ownerChatIds,
  });
}

export async function POST(req: NextRequest) {
  return withTenant(requireBootstrapTenant(), () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const creds = await getTelegramCredentials();
  if (!creds?.botToken) {
    return NextResponse.json(
      { ok: false, error: "TELEGRAM_BOT_TOKEN missing" },
      { status: 503 }
    );
  }

  // ต้องตรวจ secret_token เสมอ — ไม่งั้นใครก็ POST เข้ามาแอบอ้างเป็น Telegram ได้
  const expectedSecret = deriveWebhookSecretToken(creds.botToken, requireBootstrapTenant());
  const gotSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (gotSecret !== expectedSecret) {
    return NextResponse.json({ ok: false, error: "bad secret token" }, { status: 401 });
  }

  let body: { message?: { text?: string; chat?: { id?: number } } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const message = body.message;
  if (!message?.text || message.chat?.id == null) {
    return NextResponse.json({ ok: true, skipped: "non_text_message" });
  }

  const chatId = message.chat.id;
  const text = normalizeTelegramInput(String(message.text));
  const { command } = parseTelegramCommand(text);

  let reply: { message: string; html?: boolean };
  if (command === "/start") {
    await setTelegramBotCommands(creds.botToken).catch(() => {});
    reply = { html: true, message: buildStartReply(chatId) };
    const sent = await refreshTelegramMenuForChat(
      creds.botToken,
      chatId,
      reply.message,
      { html: true }
    );
    if (!sent.ok) {
      console.error("telegram refresh menu failed", sent.status, sent.data);
      return NextResponse.json(
        { ok: false, error: "send_failed", detail: sent.data },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true });
  } else {
    // สั่งงานบอทได้เฉพาะแชทเจ้าของที่ลงทะเบียนไว้ — webhook นี้เปิดสาธารณะ ใครก็ POST ได้
    // ถ้าไม่เช็ค คนนอกยิงคำสั่ง /finance /sales ดูดยอดขาย หรือ /book /confirm สั่งจองปลอมได้เลย
    // (/start เปิดไว้ทุกแชท — ใช้ดู chat id ตัวเองตอนตั้งค่าครั้งแรก ไม่มีข้อมูลร้าน)
    const owners = (creds.ownerChatIds || []).map(String);
    if (!owners.includes(String(chatId))) {
      return NextResponse.json({ ok: true, skipped: "unauthorized_chat" });
    }
    reply = await handleTelegramCommand(text, chatId);
  }

  const sent = await sendTelegramToChat(creds.botToken, chatId, reply.message, {
    html: reply.html !== false,
    showMenu: true,
  });
  if (!sent.ok) {
    console.error("telegram sendMessage failed", sent.status, sent.data);
    return NextResponse.json(
      { ok: false, error: "send_failed", detail: sent.data },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
