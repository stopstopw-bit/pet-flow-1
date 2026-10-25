import { NextRequest, NextResponse } from "next/server";
import { sendInactiveFollowUps } from "@/lib/customer-crm";
import { sendTelegram } from "@/lib/telegram";
import { getSiteConfig } from "@/lib/config-store";
import { withTenant } from "@/lib/tenant-context";
import { listActiveTenantIds } from "@/lib/tenant-directory";
import { verifyCronSecret } from "@/lib/cron-auth";
import { isFeatureOn } from "@/lib/features";

/** Cron — ส่งข้อความตามลูกค้าที่หายไปนาน (แนะนำ 09:00 น. ไทย) — รันแทนทุกร้าน */
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
  const config = await getSiteConfig();
  // ร้านปิดฟีเจอร์ "ทักลูกค้าที่หายไป" ในตั้งค่า
  if (!isFeatureOn(config, "followUp")) return { ok: true, skipped: "feature_disabled" };
  const result = await sendInactiveFollowUps({ limit: 30 });

  if (result.sent > 0 || result.eligible > 0) {
    await sendTelegram(
      `😴 <b>ตามลูกค้าที่หายไป</b>\n` +
        `เกณฑ์: ${config.crm.inactiveDays} วัน\n` +
        `ส่งสำเร็จ: ${result.sent}/${result.total}\n` +
        `พร้อมส่ง: ${result.eligible} คน`
    );
  }

  return { ok: true, ...result };
}
