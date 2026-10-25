import { NextRequest, NextResponse } from "next/server";
import { findCustomerByLine, updateCat } from "@/lib/customers-store";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
import { withResolvedTenant } from "@/lib/tenant-context";
import { requireCustomerSession } from "@/lib/customer-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — แมวของลูกค้าที่ล็อกอินอยู่ (พร้อมรูป) สำหรับหน้าโปรไฟล์ในแอป */
export async function GET(req: NextRequest) {
  return withResolvedTenant(req, () => handleGet(req));
}

async function handleGet(req: NextRequest) {
  const session = await requireCustomerSession(req);
  if (!session) return NextResponse.json({ cats: [] });
  const customer = await findCustomerByLine(session.lineUserId);
  if (!customer) return NextResponse.json({ cats: [] });
  return NextResponse.json({
    cats: customer.cats.map((c) => ({
      id: c.id,
      name: c.name,
      photoDataUrl: c.photoDataUrl || null,
      breed: c.breed || null,
      species: c.species || null,
    })),
  });
}

/** POST { catId, photoDataUrl } — ลูกค้าอัป/แก้รูปแมวตัวเอง (ระบุตัวจากคุกกี้เซสชัน) */
export async function POST(req: NextRequest) {
  return withResolvedTenant(req, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const session = await requireCustomerSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const catId = String(body.catId || "").trim();
  const photoDataUrl = String(body.photoDataUrl || "");

  if (!catId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }
  if (!photoDataUrl.startsWith("data:image")) {
    return NextResponse.json({ error: "bad_image" }, { status: 400 });
  }

  const customer = await findCustomerByLine(session.lineUserId);
  if (!customer) {
    return NextResponse.json({ error: "customer_not_found" }, { status: 404 });
  }
  // ยืนยันว่าเป็นแมวของลูกค้าคนนี้จริง
  if (!customer.cats.some((c) => c.id === catId)) {
    return NextResponse.json({ error: "not_your_cat" }, { status: 403 });
  }

  try {
    const cat = customer.cats.find((c) => c.id === catId);
    await updateCat(customer.id, catId, { photoDataUrl });
    await sendTelegram(
      formatBookingTelegram("📷 ลูกค้าอัปโหลดรูปน้องแล้ว", {
        ลูกค้า: customer.name,
        น้อง: cat?.name || catId,
      })
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
