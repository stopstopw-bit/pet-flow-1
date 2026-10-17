import { NextRequest, NextResponse } from "next/server";
import { exportToGoogleSheets } from "@/lib/google-sheets-export";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
import { withTenant } from "@/lib/tenant-context";
import { listActiveTenantIds } from "@/lib/tenant-directory";
import { verifyCronSecret } from "@/lib/cron-auth";
import { privatizeTenantFiles } from "@/lib/privatize-files";

/**
 * Backup อัตโนมัติทุกคืน — ยกข้อมูลทั้งร้านลง Google Sheets
 * ลูกค้า+น้องแมว · รายรับรายจ่าย · การจอง · บิล · แต้มสะสม
 * รันแทนทุกร้านที่ยังใช้งานอยู่ (แต่ละร้านมี Google Sheets ของตัวเอง)
 */
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
  // ย้ายไฟล์ส่วนตัวลูกค้าที่ยังค้างใน bucket สาธารณะ (ของเก่าก่อนมี bucket ส่วนตัว) ไป bucket ส่วนตัว
  // เรียกซ้ำทุกคืนได้ — ไม่มีอะไรให้ย้ายก็จบเร็ว · พังก็ไม่ให้ backup ล้มตาม
  const privatized = await privatizeTenantFiles().catch((e) => ({
    ok: false,
    moved: 0,
    errors: [e instanceof Error ? e.message : String(e)],
  }));
  const result = { ...(await exportToGoogleSheets()), privatized };

  if (result.ok) {
    await sendTelegram(
      formatBookingTelegram("💾 Backup อัตโนมัติสำเร็จ", {
        ลูกค้า: String(result.customers),
        การจอง: String(result.bookings),
        บิล: String(result.invoices),
        รายการบัญชี: String(result.finance),
        แต้มสะสม: String(result.points),
        ลิงก์: result.spreadsheetUrl || "-",
      })
    );
  } else if (result.reason !== "google_not_configured") {
    // มีการตั้งค่าแล้วแต่ backup พลาด → เตือน
    await sendTelegram(
      formatBookingTelegram("⚠️ Backup อัตโนมัติล้มเหลว", {
        เหตุผล: result.reason || "unknown",
      })
    );
  }

  return result;
}
