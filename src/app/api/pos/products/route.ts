import { NextRequest, NextResponse } from "next/server";
import { adjustStock, listProducts, listStockMoves, saveProduct } from "@/lib/pos-store";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { withTenant } from "@/lib/tenant-context";

/** รายการสินค้า POS · ?all=1 รวมที่ปิดขาย · ?moves=<id> ประวัติสต็อกของสินค้านั้น */
async function handleGet(req: NextRequest) {
  const moves = req.nextUrl.searchParams.get("moves");
  if (moves) return NextResponse.json({ moves: await listStockMoves(moves) });
  const all = req.nextUrl.searchParams.get("all") === "1";
  return NextResponse.json({ products: await listProducts(all) });
}

/** เพิ่ม/แก้สินค้า */
async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    const product = await saveProduct(body);
    return NextResponse.json({ ok: true, product });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg === "name_required" ? "กรอกชื่อสินค้า" : msg },
      { status: msg === "name_required" ? 400 : 500 }
    );
  }
}

/** เติม/ปรับสต็อก {id, qty, reason: "restock" | "adjust", note} */
async function handlePatch(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const reason = body.reason === "adjust" ? "adjust" : "restock";
  try {
    const product = await adjustStock(String(body.id || ""), Number(body.qty) || 0, reason, body.note);
    return NextResponse.json({ ok: true, product });
  } catch {
    return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  }
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
