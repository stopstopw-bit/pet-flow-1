import { NextRequest, NextResponse } from "next/server";
import { getSessionFrom } from "@/lib/auth";
import { withTenant } from "@/lib/tenant-context";
import { featureOff } from "@/lib/features-server";
import { exportToGoogleSheets } from "@/lib/google-sheets-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // middleware ตรวจคุกกี้มาแล้ว — ตรวจซ้ำกันพลาด
  const session = await getSessionFrom(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return withTenant(session.tenantId, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const blocked = await featureOff("exportSheets");
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({}));
  const columns = Array.isArray(body.columns)
    ? body.columns.map(String)
    : undefined;
  const result = await exportToGoogleSheets(columns);

  if (!result.ok) {
    const messages: Record<string, string> = {
      google_not_configured:
        "ยังไม่ได้ตั้ง Google — ไป Admin → ติดตั้ง → วาง JSON + ลิงก์ Sheet/Calendar",
      spreadsheet_not_configured:
        "ยังไม่ได้ตั้ง Google Spreadsheet — ไป Admin → ติดตั้ง",
    };
    return NextResponse.json(
      {
        ...result,
        message: messages[result.reason || ""] || result.reason,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ...result,
    message: `ส่งออกแล้ว — ลูกค้า ${result.customers} ราย, การเงิน ${result.finance} รายการ`,
  });
}
