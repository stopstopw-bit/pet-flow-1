import { NextRequest, NextResponse } from "next/server";
import { getPlatformSessionFrom } from "@/lib/platform-auth";
import { deleteShopIntake, listShopIntakes, setShopIntakeTenant } from "@/lib/shop-intake-store";
import { tenantGateById } from "@/lib/tenant-billing";

export const dynamic = "force-dynamic";

/** คำตอบแบบสอบถามเจ้าของร้านใหม่ทั้งหมด — เฉพาะผู้ดูแลแพลตฟอร์ม */
export async function GET(req: NextRequest) {
  if (!(await getPlatformSessionFrom(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const items = await listShopIntakes();
    return NextResponse.json({
      items: items.map(({ id, tenantId, shopName, text, createdAt, updatedAt }) => ({ id, tenantId, shopName, text, createdAt, updatedAt })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await getPlatformSessionFrom(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "ไม่มี id" }, { status: 400 });
  try {
    await deleteShopIntake(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ลบไม่สำเร็จ" }, { status: 500 });
  }
}

/** ย้ายคำตอบไปผูกกับร้านอื่น { id, tenantId } */
export async function PATCH(req: NextRequest) {
  if (!(await getPlatformSessionFrom(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const tenantId = String(body.tenantId || "");
  if (!id || !tenantId) return NextResponse.json({ error: "ไม่มี id หรือร้าน" }, { status: 400 });
  try {
    if (!(await tenantGateById(tenantId))) return NextResponse.json({ error: "ไม่พบร้านนี้" }, { status: 404 });
    await setShopIntakeTenant(id, tenantId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ย้ายไม่สำเร็จ" }, { status: 500 });
  }
}
