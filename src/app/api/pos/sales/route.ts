import { NextRequest, NextResponse } from "next/server";
import { bangkokToday } from "@/lib/bangkok-date";
import { createSale, listSales, voidSale } from "@/lib/pos-store";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { withTenant } from "@/lib/tenant-context";

/** บิลขายของวัน ?date=YYYY-MM-DD (ไม่ใส่ = วันนี้) */
async function handleGet(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || bangkokToday();
  return NextResponse.json({ date, sales: await listSales(date) });
}

/** ปิดบิลขาย */
async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const res = await createSale({
    items: Array.isArray(body.items) ? body.items : [],
    discount: Number(body.discount) || 0,
    method: body.method,
    cashReceived: body.cashReceived != null ? Number(body.cashReceived) : undefined,
    customerId: body.customerId ? String(body.customerId) : undefined,
    customerName: body.customerName ? String(body.customerName) : undefined,
    note: body.note ? String(body.note) : undefined,
  });
  if ("sale" in res) return NextResponse.json({ ok: true, sale: res.sale });
  const msg =
    res.error === "empty"
      ? "ยังไม่มีสินค้าในบิล"
      : res.error === "not_enough_cash"
        ? `รับเงินไม่พอ ยอด ${res.total.toLocaleString()} บาท`
        : res.error === "out_of_stock"
          ? `${res.name} เหลือในสต็อก ${res.stock} ชิ้น`
          : "เลือกวิธีจ่ายเงิน";
  return NextResponse.json({ error: msg, code: res.error }, { status: 400 });
}

/** ยกเลิกบิล {id} — คืนสต็อกและลบรายรับ */
async function handlePatch(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sale = await voidSale(String(body.id || ""));
  if (!sale) return NextResponse.json({ error: "ไม่พบบิล" }, { status: 404 });
  return NextResponse.json({ ok: true, sale });
}

/** หลังบ้านเท่านั้น — ทำงานในนามร้านของคนที่ล็อกอินอยู่ */
async function getAdminSession(req: NextRequest) {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handleGet(req));
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePost(req));
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePatch(req));
}
