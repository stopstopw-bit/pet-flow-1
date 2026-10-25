import { NextRequest, NextResponse } from "next/server";
import { getSessionFrom } from "@/lib/auth";
import { requireCustomerSession } from "@/lib/customer-session";
import { withResolvedTenant, withTenant } from "@/lib/tenant-context";
import {
  listPromos,
  getActivePromos,
  getCustomerPromos,
  addPromo,
  updatePromo,
  deletePromo,
  listPromoClaims,
  getBestPromoForCustomer,
  promoBlockReasons,
  type PromoKind,
  claimCustomerPromo,
  getPromo,
  type CustomerTier,
} from "@/lib/promos-store";
import { findCustomerByLine } from "@/lib/customers-store";
import { getSiteConfig } from "@/lib/config-store";
import { pushLineMessage, buildPointsAwardFlex } from "@/lib/line";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";

export async function GET(req: NextRequest) {
  const withClaims = req.nextUrl.searchParams.get("claims") === "1";
  if (withClaims) {
    // รายชื่อ+lineUserId ของลูกค้าทุกคนที่เคยกดรับโปร — ข้อมูลส่วนตัว หลังบ้านดูได้เท่านั้น
    const session = await getSessionFrom(req);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const promoId = req.nextUrl.searchParams.get("promoId") || undefined;
    return withTenant(session.tenantId, async () =>
      NextResponse.json({ claims: await listPromoClaims(promoId) })
    );
  }

  // หลังบ้าน (เช่นหน้าคิดเงินหาโปรอัตโนมัติ) ต้องเป็นร้านที่ล็อกอินอยู่ — ไม่ใช่ร้านที่เดาจากลิงก์/คุกกี้
  // (หน้าแอปลูกค้าไม่มีคุกกี้หลังบ้านติดมา middleware ตัดทิ้งให้แล้ว)
  const session = await getSessionFrom(req);
  if (session) return withTenant(session.tenantId, () => handlePublicGet(req, true));
  // ที่เหลือ — แอปลูกค้าเปิดสาธารณะได้ (ดู PUBLIC_GET ใน middleware) จับร้านจาก slug/cookie
  return withResolvedTenant(req, () => handlePublicGet(req, false));
}

async function handlePublicGet(req: NextRequest, admin: boolean) {
  const forCustomer = req.nextUrl.searchParams.get("forCustomer") === "1";
  const active = req.nextUrl.searchParams.get("active") === "1";

  if (forCustomer) {
    // หลังบ้านดูแทนลูกค้าได้ · ลูกค้าดูได้เฉพาะของตัวเองจากคุกกี้ LINE (ห้ามเชื่อ lineUserId ใน query)
    const lineUserId = admin
      ? req.nextUrl.searchParams.get("lineUserId") || ""
      : (await requireCustomerSession(req))?.lineUserId || "";
    if (lineUserId) return NextResponse.json({ promos: await getCustomerPromos(lineUserId) });
  }

  const blockedFor = req.nextUrl.searchParams.get("blockedFor");
  // ข้อมูลลูกค้า (ลูกค้าใหม่/ใช้โปรแล้ว) — เฉพาะหลังบ้าน
  if (blockedFor && admin) {
    return NextResponse.json({ blocked: await promoBlockReasons(blockedFor) });
  }

  const autoFor = req.nextUrl.searchParams.get("autoFor");
  if (autoFor && admin) {
    const subtotal = Number(req.nextUrl.searchParams.get("subtotal")) || 0;
    return NextResponse.json({
      promo: await getBestPromoForCustomer(autoFor, subtotal),
    });
  }

  if (active) {
    const kind = req.nextUrl.searchParams.get("kind") as PromoKind | null;
    return NextResponse.json({ promos: await getActivePromos(new Date(), kind || undefined) });
  }

  // ทั้งหมด (รวมโปรที่ปิดแล้ว/รหัสคูปองลับ) — หลังบ้านเท่านั้น คนนอกเห็นแค่ที่เปิดใช้อยู่
  if (!admin) return NextResponse.json({ promos: await getActivePromos(new Date()) });
  return NextResponse.json({ promos: await listPromos() });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFrom(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // ── ร้านกดใช้โปรแทนลูกค้า (เช่น ลูกค้ารีวิวให้แล้ว ร้านกดให้แต้ม) ──
  // ตัดโปรออกจากรายการของลูกค้า + ให้แต้ม + บันทึกว่าแต้มมาจากโปรไหน
  // แล้วส่งการ์ดบอกลูกค้า — ดูตัวอย่างการ์ดก่อนส่งได้ด้วย preview:true
  if (body.action === "staff_claim") {
    const promoId = String(body.promoId || "").trim();
    const lineUserId = String(body.lineUserId || "").trim();
    if (!promoId || !lineUserId) {
      return NextResponse.json({ error: "promoId and lineUserId required" }, { status: 400 });
    }
    const cfg = await getSiteConfig();

    if (body.preview === true) {
      // ตัวอย่างเท่านั้น — ยังไม่ตัดโปร ไม่ให้แต้ม ไม่ส่งอะไรทั้งนั้น
      const promo = await getPromo(promoId);
      if (!promo) return NextResponse.json({ error: "ไม่พบโปรนี้" }, { status: 404 });
      const customer = await findCustomerByLine(lineUserId);
      const pts =
        promo.rewardType === "points" || promo.rewardType === "both"
          ? Math.max(0, promo.pointsBonus || 0)
          : 0;
      return NextResponse.json({
        ok: true,
        preview: [
          buildPointsAwardFlex(
            {
              customerName: customer?.name || "ลูกค้า",
              pointsAwarded: pts,
              reason: body.note ? String(body.note) : promo.title.th,
              shopName: cfg.business.name,
            },
            cfg.cards?.pointsAward
          ),
        ],
        pointsAwarded: pts,
      });
    }

    const result = await claimCustomerPromo(promoId, lineUserId, "admin");
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    let sent = false;
    try {
      await pushLineMessage(lineUserId, [
        buildPointsAwardFlex(
          {
            customerName: result.claim.customerName,
            pointsAwarded: result.pointsAwarded,
            reason: body.note ? String(body.note) : result.claim.promoTitle,
            totalPoints: result.newPoints,
            shopName: cfg.business.name,
          },
          cfg.cards?.pointsAward
        ),
      ]);
      sent = true;
    } catch {
      /* ส่ง LINE ไม่ผ่าน — แต้มให้ไปแล้ว ไม่ย้อนกลับ แค่บอกหน้าจอว่าส่งไม่สำเร็จ */
    }

    await sendTelegram(
      formatBookingTelegram("🎁 ร้านกดใช้โปรแทนลูกค้า", {
        ลูกค้า: result.claim.customerName,
        โปรโมชั่น: result.claim.promoTitle,
        ...(result.pointsAwarded > 0 ? { แต้มที่ให้: `${result.pointsAwarded} แต้ม` } : {}),
        ...(result.newPoints != null ? { แต้มรวมตอนนี้: String(result.newPoints) } : {}),
        แจ้งลูกค้า: sent ? "ส่งการ์ดแล้ว" : "ส่งการ์ดไม่สำเร็จ",
      })
    );

    return NextResponse.json({
      ok: true,
      sent,
      claim: result.claim,
      pointsAwarded: result.pointsAwarded,
      newPoints: result.newPoints,
    });
  }

  const promo = await addPromo({
    title: body.title,
    body: body.body,
    discountPercent: body.discountPercent,
    discountAmount: body.discountAmount,
    imageUrl: body.imageUrl,
    startDate: body.startDate || new Date().toISOString().slice(0, 10),
    until: body.until,
    active: body.active !== false,
    kind: body.kind || "display",
    restriction: body.restriction || "none",
    validMonth: body.validMonth || undefined,
    tiers: (body.tiers as CustomerTier[]) || ["all"],
    couponCode: body.couponCode || undefined,
    rewardType: body.rewardType || "discount",
    pointsBonus: body.pointsBonus ? Number(body.pointsBonus) : undefined,
    pointsMultiplier: body.pointsMultiplier ? Number(body.pointsMultiplier) : undefined,
  });
  return NextResponse.json({ ok: true, promo });
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFrom(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePatch(req));
}

async function handlePatch(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const promo = await updatePromo(body.id, body.patch || body);
  if (!promo) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, promo });
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionFrom(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handleDelete(req));
}

async function handleDelete(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deletePromo(id);
  return NextResponse.json({ ok: true });
}
