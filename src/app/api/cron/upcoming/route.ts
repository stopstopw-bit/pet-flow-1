import { NextRequest, NextResponse } from "next/server";
import { sendTelegram } from "@/lib/telegram";
import { verifyCronSecret } from "@/lib/cron-auth";
import { bangkokNowTime, bangkokToday } from "@/lib/bangkok-date";
import { getSiteConfig } from "@/lib/config-store";
import { withTenant } from "@/lib/tenant-context";
import { listActiveTenantIds } from "@/lib/tenant-directory";
import { bookingBranchId, isMultiBranch, shopBranches } from "@/lib/branches";
import { buildUpcomingReminderMessage } from "@/lib/upcoming-reminder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron ทุกชั่วโมงตรง — เตือนเข้า Telegram อีกครั้งก่อนถึงเวลานัด ~3 ชั่วโมง
 * (อาบน้ำ / มาส่งน้อง / มารับน้อง + รับ-ส่ง + งานเพิ่มในบิล) — รันแทนทุกร้าน
 * เฉพาะร้านที่เปิด ตั้งค่า › อัตโนมัติ › "เตือนรับ-ส่ง + เตือนก่อนนัด 3 ชั่วโมง" · ไม่มีนัดเข้าช่วง = ไม่ส่ง
 * ทดสอบเอง: ?hour=7 = ทำเหมือนตอนนี้ 07:xx น.
 */
export async function GET(req: NextRequest) {
  const denied = verifyCronSecret(req);
  if (denied) return denied;

  const q = req.nextUrl.searchParams.get("hour");
  const hour = q != null && /^\d{1,2}$/.test(q) ? Number(q) : Number(bangkokNowTime().slice(0, 2));
  const today = bangkokToday();
  const tenantIds = await listActiveTenantIds();
  const results = await Promise.all(
    tenantIds.map(async (tenantId) => {
      try {
        return { tenantId, ...(await withTenant(tenantId, () => runForTenant(today, hour))) };
      } catch (e) {
        return { tenantId, ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    })
  );
  return NextResponse.json({ ok: true, hour, tenants: results.length, results });
}

async function runForTenant(today: string, hour: number) {
  const cfg = await getSiteConfig();
  if (cfg.automation?.transportReminders !== true) return { ok: true, skipped: true };
  const roomName = (id?: string) => cfg.rooms.find((r) => r.id === id)?.name || id || "-";
  // ร้านหลายสาขา: แยกข้อความตามสาขา ส่งเข้ากลุ่มของสาขานั้น
  if (!isMultiBranch(cfg)) {
    const msg = await buildUpcomingReminderMessage(today, hour, { roomName });
    if (!msg) return { ok: true, sent: 0 };
    const r = await sendTelegram(msg);
    return { ok: r.ok, sent: 1 };
  }
  let sent = 0;
  let ok = true;
  for (const br of shopBranches(cfg)) {
    const msg = await buildUpcomingReminderMessage(today, hour, {
      roomName,
      heading: `🏬 ${br.name}`,
      inBranch: (b) => bookingBranchId(cfg, b) === br.id,
    });
    if (!msg) continue;
    const r = await sendTelegram(msg, { branchId: br.id });
    if (!r.ok) ok = false;
    sent++;
  }
  return { ok, sent };
}
