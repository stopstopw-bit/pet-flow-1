import { NextRequest, NextResponse } from "next/server";
import { getSessionFrom } from "@/lib/auth";
import { requireTenantId, withTenant } from "@/lib/tenant-context";
import { getSupabase } from "@/lib/supabase/server";
import { checkSetupStatus } from "@/lib/supabase/bootstrap";
import {
  getAppUrlFromEnv,
  getLineCredentials,
  getLineWebhookEndpoint,
} from "@/lib/line-config";
import { isGoogleConfigured } from "@/lib/google-config";
import { isTelegramConfigured } from "@/lib/telegram-config";
import { getSiteConfig } from "@/lib/config-store";
import { BUSINESS } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ตรวจความพร้อมของร้านที่ล็อกอินอยู่ในคำขอเดียว — ไม่มี secret ในผลลัพธ์
 * ค่า LINE/Google/Telegram/ข้อมูลร้าน เป็นของร้านนี้เท่านั้น (withTenant)
 * Webhook ต้องชี้มาที่ /s/<slug>/api/line/webhook ของร้านนี้ ไม่งั้นข้อความจะไปตกร้านอื่น
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFrom(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, handleGet);
}

async function currentTenantSlug(): Promise<string> {
  const sb = getSupabase();
  if (!sb) return "";
  const { data } = await sb
    .from("tenants")
    .select("slug")
    .eq("id", requireTenantId())
    .maybeSingle();
  return (data as { slug?: string } | null)?.slug || "";
}

async function handleGet() {
  const appUrl = getAppUrlFromEnv();

  const [db, creds, googleOk, telegramOk, config, slug] = await Promise.all([
    checkSetupStatus().catch(() => null),
    getLineCredentials().catch(() => null),
    isGoogleConfigured().catch(() => false),
    isTelegramConfigured().catch(() => false),
    getSiteConfig().catch(() => null),
    currentTenantSlug().catch(() => ""),
  ]);

  const shopBase = slug ? `${appUrl}/s/${slug}` : appUrl;
  const expectedWebhook = `${shopBase}/api/line/webhook`;

  // Webhook ต้องถาม LINE ตรง ๆ — ทำเฉพาะเมื่อมี token
  let webhook: { url: string; active: boolean; matchesShop: boolean } | null = null;
  if (creds?.channelToken) {
    const ep = await getLineWebhookEndpoint(creds.channelToken).catch(() => null);
    webhook = ep?.endpoint
      ? {
          url: ep.endpoint,
          active: Boolean(ep.active),
          matchesShop: ep.endpoint === expectedWebhook,
        }
      : { url: "", active: false, matchesShop: false };
  }

  const business = config?.business;
  const payment = config?.payment;
  const name = business?.name?.trim() || "";
  const shop = {
    nameFilled: Boolean(name),
    // ร้าน PetFlow ตัวอย่างใช้ชื่อนี้ได้ ร้านอื่นยังเป็น "PetFlow" = ลืมตั้งชื่อร้าน
    nameIsDefault: name === BUSINESS.name && slug !== "petflow",
    bankFilled: Boolean(
      payment?.accountName?.trim() &&
        payment?.accountNumber?.trim() &&
        !payment.accountNumber.includes("XXX")
    ),
  };

  return NextResponse.json({
    db: db
      ? {
          connected: db.connected,
          tablesReady: db.tablesReady,
          missingTables: db.missingTables,
          message: db.message,
        }
      : null,
    line: {
      token: Boolean(creds?.channelToken),
      liff: Boolean(creds?.liffId),
      webhook,
      expectedWebhook,
    },
    google: googleOk,
    telegram: telegramOk,
    shop,
  });
}
