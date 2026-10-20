import { NextRequest, NextResponse } from "next/server";
import { getPlatformSessionFrom } from "@/lib/platform-auth";
import { getShopIntake } from "@/lib/shop-intake-store";
import { getSiteConfig, updateSiteConfig } from "@/lib/config-store";
import { withTenantEvenIfClosed } from "@/lib/tenant-context";
import { intakePatch, manualItems, previewIntakeChanges, type IntakeAnswers } from "@/lib/shop-intake-apply";
import { logAudit } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

/**
 * เอาคำตอบแบบสอบถามไปตั้งค่าร้านที่คำตอบผูกอยู่ — เฉพาะผู้ดูแลแพลตฟอร์ม
 * GET ?id= → รายการที่จะเปลี่ยน (ค่าเดิม → ค่าใหม่) + ข้อที่ต้องตั้งเอง
 * POST { id, keys } → ตั้งเฉพาะข้อที่เลือก
 * ใช้ withTenantEvenIfClosed เพราะร้านใหม่มักยังไม่เปิดใช้/ยังไม่จ่าย ตอนตั้งค่าครั้งแรก
 */
async function load(id: string) {
  const intake = await getShopIntake(id);
  if (!intake) throw new Error("ไม่พบคำตอบนี้");
  if (!intake.tenantId) throw new Error("คำตอบนี้ยังไม่ผูกกับร้าน — ให้ตอบผ่านลิงก์ของร้าน");
  return { intake, answers: intake.answers as IntakeAnswers };
}

export async function GET(req: NextRequest) {
  if (!(await getPlatformSessionFrom(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const { intake, answers } = await load(req.nextUrl.searchParams.get("id") || "");
    const changes = await withTenantEvenIfClosed(intake.tenantId, async () =>
      previewIntakeChanges(answers, await getSiteConfig())
    );
    return NextResponse.json({ changes, manual: manualItems(answers) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await getPlatformSessionFrom(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const keys = Array.isArray(body.keys) ? body.keys.map(String) : [];
  if (!keys.length) return NextResponse.json({ error: "ยังไม่ได้เลือกข้อที่จะตั้ง" }, { status: 400 });
  try {
    const { intake, answers } = await load(String(body.id || ""));
    const applied = await withTenantEvenIfClosed(intake.tenantId, async () => {
      const { patch, applied } = intakePatch(answers, await getSiteConfig(), keys);
      if (applied.length) await updateSiteConfig(patch);
      return applied;
    });
    await logAudit({
      tenantId: intake.tenantId,
      actorType: "platform",
      actorId: "platform_owner",
      action: "apply_shop_intake",
      resourceType: "site_config",
      resourceId: intake.id,
      beforeState: Object.fromEntries(applied.map((c) => [c.key, c.before])),
      afterState: Object.fromEntries(applied.map((c) => [c.key, c.after])),
    });
    return NextResponse.json({ ok: true, applied: applied.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ตั้งค่าไม่สำเร็จ" }, { status: 400 });
  }
}
