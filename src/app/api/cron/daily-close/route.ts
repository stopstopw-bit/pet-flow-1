import { NextRequest, NextResponse } from "next/server";
import { sendTelegram } from "@/lib/telegram";
import { buildEndOfDaySummaryMessage } from "@/lib/telegram-commands";
import { withTenant } from "@/lib/tenant-context";
import { listActiveTenantIds } from "@/lib/tenant-directory";
import { verifyCronSecret } from "@/lib/cron-auth";
import { buildTransportSummaryMessage } from "@/lib/transport-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function addDays(dateStr: string, n: number) {
  const dt = new Date(`${dateStr}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Cron 20:00 น. ไทย (13:00 UTC) — สรุปปิดวัน: ยอดรายได้วันนี้ + ตารางพรุ่งนี้ ส่งเข้า Telegram เจ้าของ — รันแทนทุกร้าน */
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
  const tomorrow = addDays(today, 1);
  const msg = await buildEndOfDaySummaryMessage(today, tomorrow);
  const res = await sendTelegram(msg);
  // รับ-ส่งพรุ่งนี้ ส่งตั้งแต่คืนก่อน จะได้วางเส้นทาง/ทักลูกค้าที่ยังไม่ส่งพิกัดทัน
  const transport = await buildTransportSummaryMessage(tomorrow, {
    heading: `🚗 รับ-ส่งพรุ่งนี้ (${tomorrow})`,
  });
  if (transport) await sendTelegram(transport);
  return { ok: res.ok, today };
}
