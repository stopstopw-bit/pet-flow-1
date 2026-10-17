import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSession } from "@/lib/customer-session";
import { signPrivateFile } from "@/lib/supabase/storage";
import { findCustomerByLine } from "@/lib/customers-store";
import { withTenant } from "@/lib/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ลูกค้าเปิดได้เฉพาะรูปน้องแมว + บัตรประชาชนของตัวเอง — สลิป/ลายเซ็น/บิลให้หลังบ้านเปิดอย่างเดียว */
const CUSTOMER_PREFIXES = ["cats/"];

/**
 * GET /api/files/<tenantId>/<path> — เปิดไฟล์ใน bucket ส่วนตัว
 * ตรวจว่าคนเปิดเป็นคนของร้าน <tenantId> (หลังบ้าน หรือ ลูกค้าที่ล็อกอิน LINE ของร้านนั้น)
 * แล้ว redirect ไปลิงก์ชั่วคราวที่หมดอายุใน 5 นาที — ลิงก์หลุดไปก็ใช้ต่อไม่ได้
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  if (!path?.length || path.length < 2 || path.some((p) => !p || p === "." || p === "..")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const [tenantId, ...rest] = path;
  const objectPath = rest.join("/");

  const admin = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  let allowed = !!admin && admin.tenantId === tenantId;
  if (!allowed) {
    const customer = await verifyCustomerSession(
      req.cookies.get(CUSTOMER_SESSION_COOKIE)?.value
    );
    if (customer && customer.tenantId === tenantId) {
      allowed = CUSTOMER_PREFIXES.some((p) => objectPath.startsWith(p));
      if (!allowed && objectPath.startsWith("id-cards/")) {
        // ชื่อไฟล์ขึ้นต้นด้วย id ลูกค้า (id-cards/<customerId>-<เวลา>) — เปิดได้แค่ของตัวเอง
        const me = await withTenant(tenantId, () => findCustomerByLine(customer.lineUserId));
        allowed = !!me && objectPath.startsWith(`id-cards/${me.id}-`);
      }
    }
  }
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  const signed = await signPrivateFile(`${tenantId}/${objectPath}`);
  if (!signed) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(signed, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=240" },
  });
}
