import { NextRequest, NextResponse } from "next/server";
import { getPlatformSessionFrom } from "@/lib/platform-auth";
import { getDirectoryDb } from "@/lib/supabase/server";
import { withTenantEvenIfClosed } from "@/lib/tenant-context";
import { clearLineSecrets, getSecrets, saveLineSecrets } from "@/lib/secrets-store";
import { parseLiffId } from "@/lib/line-config";
import { logAudit } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

/**
 * ค่า LINE ของแต่ละร้าน (มุมมองผู้ดูแลระบบ) — โชว์แค่ LIFF ID กับ "มี Token ไหม" ไม่ส่ง Token/Secret ออกไป
 * ใช้ย้าย LINE ที่ตั้งผิดร้าน: ร้านแรกเคยถูกตั้ง LINE PetFlow ไว้ก่อนสลับลิงก์เป็น Back Home
 */
export async function GET(req: NextRequest) {
  if (!(await getPlatformSessionFrom(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = getDirectoryDb();
  if (!sb) return NextResponse.json({ shops: [] });
  const { data } = await sb.from("tenants").select("id");
  const shops = await Promise.all(
    ((data || []) as { id: string }[]).map(async ({ id }) => {
      const line = (await withTenantEvenIfClosed(id, () => getSecrets()).catch(() => ({}) as Awaited<ReturnType<typeof getSecrets>>)).line;
      return { id, liffId: parseLiffId(line?.liffId), hasToken: !!line?.channelToken };
    })
  );
  return NextResponse.json({ shops });
}

/**
 * { fromId, toId } — ย้ายค่า LINE ทั้งชุดจากร้านหนึ่งไปอีกร้าน แล้วลบออกจากร้านต้นทาง
 * { clearId } — ลบค่า LINE ของร้านนั้น (กลับเป็นยังไม่ได้ตั้ง)
 * ผู้ดูแลระบบกดเองเท่านั้น
 */
export async function POST(req: NextRequest) {
  if (!(await getPlatformSessionFrom(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { fromId?: string; toId?: string; clearId?: string };

  if (body.clearId) {
    const id = String(body.clearId);
    const before = (await withTenantEvenIfClosed(id, () => getSecrets())).line;
    await withTenantEvenIfClosed(id, () => clearLineSecrets());
    await logAudit({
      tenantId: id,
      actorType: "platform",
      actorId: "platform_owner",
      action: "clear_line",
      resourceType: "line",
      resourceId: id,
      beforeState: { liffId: before?.liffId || null, hasToken: !!before?.channelToken },
    });
    return NextResponse.json({ ok: true, message: "ลบค่า LINE ของร้านนี้แล้ว" });
  }

  const fromId = String(body.fromId || "");
  const toId = String(body.toId || "");
  if (!fromId || !toId || fromId === toId) {
    return NextResponse.json({ ok: false, message: "เลือกร้านต้นทาง/ปลายทางให้ถูก" }, { status: 400 });
  }
  const from = (await withTenantEvenIfClosed(fromId, () => getSecrets())).line;
  if (!from?.channelToken && !from?.liffId) {
    return NextResponse.json({ ok: false, message: "ร้านต้นทางไม่มีค่า LINE ให้ย้าย" }, { status: 400 });
  }
  await withTenantEvenIfClosed(toId, () =>
    saveLineSecrets({
      channelToken: from.channelToken,
      channelSecret: from.channelSecret,
      liffId: parseLiffId(from.liffId) || undefined,
    })
  );
  await withTenantEvenIfClosed(fromId, () => clearLineSecrets());
  await logAudit({
    tenantId: toId,
    actorType: "platform",
    actorId: "platform_owner",
    action: "move_line",
    resourceType: "line",
    resourceId: toId,
    beforeState: { fromId },
    afterState: { liffId: parseLiffId(from.liffId) || null, hasToken: !!from.channelToken },
  });
  return NextResponse.json({ ok: true, message: "ย้ายค่า LINE แล้ว" });
}
