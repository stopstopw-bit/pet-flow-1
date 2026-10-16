import { NextRequest, NextResponse } from "next/server";
import { getSessionFrom } from "@/lib/auth";
import { requireTenantId, withTenant } from "@/lib/tenant-context";
import { getSupabase } from "@/lib/supabase/server";
import { getSecrets, saveLineSecrets } from "@/lib/secrets-store";
import {
  getAppUrlFromEnv,
  getLineCredentials,
  isLineConfigured,
  isLiffConfigured,
  parseLineChannelToken,
  testLineChannelToken,
  setLineWebhookEndpoint,
  getLineWebhookEndpoint,
} from "@/lib/line-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ลิงก์ endpoint เฉพาะร้าน — ก่อนหน้านี้ handler นี้ไม่เคยห่อด้วย withTenant() เลย
 * requireTenantId() จึงตกไปใช้ร้าน bootstrap เดียวเสมอ ไม่ว่าใครล็อกอินอยู่
 * (ทุกร้านเห็น LIFF ID/endpoint ก้อนเดียวกันหมด — บั๊กคนละเรื่องกับแค่ไม่มี slug ในลิงก์)
 */
async function currentTenantBase(appUrl: string): Promise<string> {
  const sb = getSupabase();
  if (!sb) return appUrl;
  const { data } = await sb
    .from("tenants")
    .select("slug")
    .eq("id", requireTenantId())
    .maybeSingle();
  const slug = (data as { slug?: string } | null)?.slug;
  return slug ? `${appUrl}/s/${slug}` : appUrl;
}

async function endpointUrlForCurrentTenant(appUrl: string): Promise<string> {
  return `${await currentTenantBase(appUrl)}/app`;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFrom(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, handleGet);
}

async function handleGet() {
  const configured = await isLineConfigured();
  const liffConfigured = await isLiffConfigured();
  const creds = await getLineCredentials();
  const appUrl = getAppUrlFromEnv() || "https://petflow.example.com";

  let displayName: string | undefined;
  let basicId: string | undefined;

  if (creds?.channelToken) {
    const test = await testLineChannelToken(creds.channelToken);
    if (test.ok) {
      displayName = test.displayName;
      basicId = test.basicId;
    }
  }

  return NextResponse.json({
    configured,
    liffConfigured,
    channelSecretConfigured: Boolean(creds?.channelSecret),
    source: creds?.source || "none",
    liffId: creds?.liffId || "",
    endpointUrl: await endpointUrlForCurrentTenant(appUrl),
    testLiffUrl: creds?.liffId ? `https://liff.line.me/${creds.liffId}` : "",
    displayName,
    basicId,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFrom(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "save_token");

  try {
    if (action === "save_liff") {
      const liffId = String(body.liffId || "").trim();
      if (!liffId || liffId.length < 6) {
        return NextResponse.json(
          { ok: false, message: "กรอก LIFF ID ให้ครบ (จาก LINE Developers → LIFF)" },
          { status: 400 }
        );
      }

      const current = await getSecrets();
      await saveLineSecrets({
        channelToken: current.line?.channelToken,
        liffId,
      });

      return NextResponse.json({
        ok: true,
        message: `✅ บันทึก LIFF ID แล้ว\nทดสอบ: https://liff.line.me/${liffId}`,
        liffId,
      });
    }

    if (action === "set_webhook") {
      const creds = await getLineCredentials();
      if (!creds?.channelToken) {
        return NextResponse.json({
          ok: false,
          message: "ยังไม่ได้ตั้ง Channel Access Token — ใส่ Token ก่อน",
        });
      }
      const appUrl = getAppUrlFromEnv() || "https://petflow.example.com";
      // ต้องมี /s/<slug> — ไม่งั้น webhook จะไปตกร้าน bootstrap ตรวจลายเซ็นด้วย secret ร้านอื่น
      const webhookUrl = `${await currentTenantBase(appUrl)}/api/line/webhook`;
      const result = await setLineWebhookEndpoint(creds.channelToken, webhookUrl);
      if (!result.ok) {
        return NextResponse.json({
          ok: false,
          message: `ตั้ง Webhook ไม่สำเร็จ: ${result.message}`,
        });
      }
      const status = await getLineWebhookEndpoint(creds.channelToken);
      return NextResponse.json({
        ok: true,
        message: `✅ ตั้ง Webhook อัตโนมัติแล้ว!\n${webhookUrl}\nแจ้งคนแอด + ลูกค้าตอบแชท จะเข้า Telegram แล้ว`,
        webhookUrl,
        active: status?.active,
      });
    }

    const channelToken = parseLineChannelToken(String(body.channelToken || ""));
    const channelSecret = String(body.channelSecret || "").trim();
    const liffId = String(body.liffId || "").trim();
    const current = await getSecrets();

    const test = await testLineChannelToken(channelToken);
    if (!test.ok) {
      return NextResponse.json({ ok: false, message: test.message });
    }

    await saveLineSecrets({
      channelToken,
      channelSecret: channelSecret || current.line?.channelSecret,
      liffId: liffId || current.line?.liffId,
    });

    return NextResponse.json({
      ok: true,
      message: `✅ LINE Token พร้อมส่งการ์ด (${test.displayName || "OA"})`,
      displayName: test.displayName,
      basicId: test.basicId,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 400 }
    );
  }
}
