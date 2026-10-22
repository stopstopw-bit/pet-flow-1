import { NextRequest, NextResponse } from "next/server";
import { listBookings } from "@/lib/bookings-store";
import { autoMuted } from "@/lib/auto-messages";
import { getSiteConfig } from "@/lib/config-store";
import { pushLineMessage, buildTimePickerFlex } from "@/lib/line";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
import {
  buildCheckinBodyText,
  buildCheckoutBodyText,
  getBookingTimeUrl,
  checkinPickerSender,
} from "@/lib/booking-reminders";
import { withTenant } from "@/lib/tenant-context";
import { listActiveTenantIds } from "@/lib/tenant-directory";
import { verifyCronSecret } from "@/lib/cron-auth";
import { groupBookings, groupCatNames } from "@/lib/booking-group";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function addDays(dateStr: string, n: number) {
  const dt = new Date(`${dateStr}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/**
 * Cron ถามเวลาส่ง/รับน้อง — รันหลายรอบต่อวัน (08:00 / 12:00 / 18:00 / 19:30 ไทย ตาม vercel.json)
 * แต่ละครั้งเช็คแค่ตัวเองว่าใช่รอบที่ร้านตั้งไว้ไหม (checkinReminderTime / checkoutReminderTime
 * ในตั้งค่า > อัตโนมัติ) เพราะร้านตั้งได้ว่าจะให้ถามตอนเช้า เที่ยง หรือหัวค่ำ ไม่ใช่ตายตัวเหมือนเดิม
 * ที่ผูกกับรอบเที่ยงของ cron/reminders ตัวเดียว — รันแทนทุกร้านที่ยังใช้งานอยู่ (multi-tenant)
 */
export async function GET(req: NextRequest) {
  const denied = verifyCronSecret(req);
  if (denied) return denied;

  const slot = req.nextUrl.searchParams.get("slot") || "";
  const tenantIds = await listActiveTenantIds();
  const results = await Promise.all(
    tenantIds.map(async (tenantId) => {
      try {
        return { tenantId, ...(await withTenant(tenantId, () => runForTenant(slot))) };
      } catch (e) {
        return { tenantId, ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    })
  );
  return NextResponse.json({ ok: true, slot, tenants: results.length, results });
}

async function runForTenant(slot: string) {
  const cfg = await getSiteConfig();
  const auto = cfg.automation;
  const errors: string[] = [];
  let checkinReminders = 0;
  let checkoutReminders = 0;

  const doCheckin = auto?.checkinReminderEnabled !== false && (auto?.checkinReminderTime || "12:00") === slot;
  const doCheckout = auto?.checkoutReminderEnabled !== false && (auto?.checkoutReminderTime || "19:30") === slot;
  if (!doCheckin && !doCheckout) {
    return { ok: true, skipped: true, checkinReminders, checkoutReminders };
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const inCheckin = addDays(todayStr, auto?.checkinReminderDays ?? 1);
  const inCheckout = addDays(todayStr, auto?.checkoutReminderDays ?? 1);

  const roomStays = (await listBookings()).filter(
    (b) =>
      b.service === "room" &&
      b.lineUserId &&
      b.status !== "cancelled" &&
      b.status !== "no_show"
  );

  for (const group of groupBookings(roomStays)) {
    const primary = group[0];
    const b = { ...primary, catName: groupCatNames(group) };
    const to = String(primary.lineUserId);
    const groupMuted = (topic: string) => group.every((x) => autoMuted(x, topic));

    // เตือนเช็คอิน N วันก่อนเข้าพัก → การ์ดให้ลูกค้าเลือกเวลามาส่งน้อง
    // ข้ามถ้าลูกค้าเลือกเวลาแล้ว หรือชุดก่อนเข้าพักแนบการ์ดนี้ไปแล้ว/จะแนบในวันเดียวกัน
    // — เมื่อก่อนตั้งจำนวนวันตรงกัน ลูกค้าได้การ์ดเดียวกัน 2 ใบห่างกันไม่กี่นาที
    if (
      doCheckin &&
      b.checkin === inCheckin &&
      checkinPickerSender(group, cfg) === "checkin"
    ) {
      const url = await getBookingTimeUrl(b.id, "checkin");
      const flex = buildTimePickerFlex(
        {
          title: "🕒 เลือกเวลาเข้าพัก",
          body: buildCheckinBodyText(b, cfg),
          url: url || undefined,
          label: "🕒 เลือกเวลาส่งน้อง",
        },
        cfg.cards?.timePicker
      );
      try {
        await pushLineMessage(to, [flex]);
        checkinReminders++;
      } catch (e) {
        errors.push(`checkin ${b.id}: ${String(e)}`);
      }
    }

    // เตือนเช็คเอาท์ N วันก่อนออก → การ์ดให้ลูกค้าเลือกเวลามารับน้อง
    if (
      doCheckout &&
      !groupMuted("checkout") &&
      b.checkout &&
      b.checkout === inCheckout &&
      group.some((x) => !x.pickupTime)
    ) {
      const url = await getBookingTimeUrl(b.id, "checkout");
      const flex = buildTimePickerFlex(
        {
          title: "🕒 เลือกเวลารับน้อง",
          body: buildCheckoutBodyText(b, cfg),
          url: url || undefined,
          label: "🕒 เลือกเวลารับน้อง",
        },
        cfg.cards?.timePicker
      );
      try {
        await pushLineMessage(to, [flex]);
        checkoutReminders++;
      } catch (e) {
        errors.push(`checkout ${b.id}: ${String(e)}`);
      }
    }
  }

  if (checkinReminders > 0 || checkoutReminders > 0 || errors.length > 0) {
    await sendTelegram(
      formatBookingTelegram(`🕒 เตือนเวลาส่ง/รับน้อง (${slot})`, {
        เตือนเช็คอิน: String(checkinReminders),
        เตือนเช็คเอาท์: String(checkoutReminders),
        พลาด: String(errors.length),
      })
    );
  }

  return {
    ok: errors.length === 0,
    checkinReminders,
    checkoutReminders,
    errors,
  };
}
