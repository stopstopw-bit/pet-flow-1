import { NextRequest, NextResponse } from "next/server";
import { getPlatformSessionFrom } from "@/lib/platform-auth";
import { signPrivateFile, PRIVATE_FILE_ROUTE } from "@/lib/supabase/storage";
import { getPayment } from "@/lib/subscription-store";

export const dynamic = "force-dynamic";

/** เปิดรูปสลิปค่าบริการ (bucket ส่วนตัว) ให้ผู้ดูแลระบบ — ลิงก์ชั่วคราว 5 นาที */
export async function GET(req: NextRequest) {
  if (!(await getPlatformSessionFrom(req))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id") || "";
  const p = id ? await getPayment(id).catch(() => null) : null;
  const prefix = `${PRIVATE_FILE_ROUTE}/`;
  if (!p || !p.slipUrl.startsWith(prefix)) return new NextResponse("Not found", { status: 404 });
  const signed = await signPrivateFile(p.slipUrl.slice(prefix.length));
  if (!signed) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(signed, { status: 302 });
}
