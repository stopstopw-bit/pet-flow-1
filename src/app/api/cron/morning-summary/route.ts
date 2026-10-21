import { NextRequest, NextResponse } from "next/server";
import { sendTelegram } from "@/lib/telegram";
import { buildMorningSummaryMessage } from "@/lib/telegram-commands";
import { withTenant } from "@/lib/tenant-context";
import { listActiveTenantIds } from "@/lib/tenant-directory";
import { verifyCronSecret } from "@/lib/cron-auth";
import { buildTransportSummaryMessage } from "@/lib/transport-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cron 08:00 น. ไทย (01:00 UTC) — สรุปเช้า: งานของวันนี้ทั้งหมด ส่งเข้า Telegram เจ้าของ — รันแทนทุกร้าน */
export async function GET(req: NextRequest) {
  const denied = verifyCronSecret(req);
  if (denied) return denied;

  const tenantIds = await listActiveTenantIds();
  const results = await Promise.all(
    tenantIds.map(async (tenantId) => {
      try {
        return { tenantId, ...(await withTenant(tenantId, runForTenant)) };
      } catch (e) {
        return { tenantId, ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    })
  );
  return NextResponse.json({ ok: true, tenants: results.length, results });
}

async function runForTenant() {
  const today = new Date().toISOString().slice(0, 10);
  const msg = await buildMorningSummaryMessage(today);
  const res = await sendTelegram(msg);
  // แยกข้อความรับ-ส่งไว้อีกข้อความ ส่งต่อให้คนขับได้ทั้งก้อน — ไม่มีเที่ยว = ไม่ส่ง
  const transport = await buildTransportSummaryMessage(today, {
    heading: `🚗 รับ-ส่งวันนี้ (${today})`,
  });
  if (transport) await sendTelegram(transport);
  return { ok: res.ok, today };
}
