import { NextRequest, NextResponse } from "next/server";
import { getPlatformSessionFrom } from "@/lib/platform-auth";
import { deleteShopIntake, listShopIntakes } from "@/lib/shop-intake-store";

export const dynamic = "force-dynamic";

/** คำตอบแบบสอบถามเจ้าของร้านใหม่ทั้งหมด — เฉพาะผู้ดูแลแพลตฟอร์ม */
export async function GET(req: NextRequest) {
  if (!(await getPlatformSessionFrom(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const items = await listShopIntakes();
    return NextResponse.json({
      items: items.map(({ id, shopName, text, createdAt, updatedAt }) => ({ id, shopName, text, createdAt, updatedAt })),
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
