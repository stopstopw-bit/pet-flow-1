import { NextRequest, NextResponse } from "next/server";
import {
  getCustomerLinkPreview,
  linkCustomerToLine,
} from "@/lib/customers-store";
import { sendTelegramLater, formatBookingTelegram } from "@/lib/telegram";
import { withResolvedTenant } from "@/lib/tenant-context";
import { requireCustomerSession } from "@/lib/customer-session";

/** ดูข้อมูลลูกค้าก่อนผูก LINE (จากลิงก์เชิญ) */
export async function GET(req: NextRequest) {
  return withResolvedTenant(req, () => handleGet(req));
}

async function handleGet(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get("customerId")?.trim();
  if (!customerId) {
    return NextResponse.json({ error: "customerId required" }, { status: 400 });
  }

  const preview = await getCustomerLinkPreview(customerId);
  if (!preview) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, customer: preview });
}

/** ลูกค้าเปิดลิงก์เชิญ → ผูก LINE กับบัญชีที่ร้านสร้างไว้ */
export async function POST(req: NextRequest) {
  return withResolvedTenant(req, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const customerId = String(body.customerId || "").trim();
  // ผูกได้เฉพาะ LINE ของตัวเอง (คุกกี้ที่ตรวจกับ LINE แล้ว) ห้ามเชื่อ body.lineUserId
  const lineUserId = (await requireCustomerSession(req))?.lineUserId || "";
  const displayName = String(body.displayName || "").trim();

  if (!customerId || !lineUserId) {
    return NextResponse.json(
      { error: "customerId and lineUserId required" },
      { status: 400 }
    );
  }

  const result = await linkCustomerToLine({ customerId, lineUserId, displayName });
  if (!result) {
    return NextResponse.json({ error: "link_failed" }, { status: 500 });
  }
  if (!result.ok) {
    const messages: Record<string, string> = {
      not_found: "ไม่พบลูกค้าในระบบ",
      already_linked: "ลูกค้ารายนี้ผูก LINE คนอื่นแล้ว",
      line_in_use: "บัญชี LINE นี้ผูกกับลูกค้าคนอื่นแล้ว",
    };
    return NextResponse.json(
      { error: messages[result.error] || result.error },
      { status: 409 }
    );
  }

  sendTelegramLater(
    formatBookingTelegram("🔗 ลูกค้าผูก LINE กับบัญชีสำเร็จ", {
      ลูกค้า: result.customer.name,
      ชื่อไลน์: displayName || "-",
    })
  );

  return NextResponse.json({
    ok: true,
    customer: {
      id: result.customer.id,
      name: result.customer.name,
      phone: result.customer.phone,
      // ตัด staffPrivateNote/staffNote (โน้ตลับร้าน) ออกก่อนส่งให้ฝั่งลูกค้าเสมอ
      cats: result.customer.cats.map((cat) => ({ id: cat.id, name: cat.name })),
      tier: result.customer.tier,
    },
  });
}
