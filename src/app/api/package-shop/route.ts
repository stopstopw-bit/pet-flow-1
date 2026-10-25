import { NextRequest, NextResponse } from "next/server";
import { featureOff } from "@/lib/features-server";
import {
  listPackageOffers,
  createPackageOffer,
  updatePackageOffer,
  deletePackageOrder,
  setPackageOfferActive,
  setPackageOfferImage,
  deletePackageOffer,
  listPackageOrders,
  createPackageOrder,
  attachOrderSlip,
  confirmPackageOrder,
  cancelPackageOrder,
} from "@/lib/package-shop-store";
import { findCustomerByLine, getCustomer } from "@/lib/customers-store";
import { getPaymentConfig } from "@/lib/payment-config";
import { getSiteConfig } from "@/lib/config-store";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
import { pushLineMessage, buildPackageFlex, buildMemberBalanceFlex } from "@/lib/line";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { withResolvedTenant, withTenant } from "@/lib/tenant-context";
import { requireCustomerSession } from "@/lib/customer-session";

export const dynamic = "force-dynamic";

/**
 * GET — แอปลูกค้า: ?lineUserId=... ได้รายการที่เปิดขาย + บัญชีโอน + ออร์เดอร์ของตัวเอง
 *       หลังบ้าน: ไม่ต้องส่ง lineUserId ได้ทุกออร์เดอร์ + รายการขายทั้งหมด (รวมที่ปิดอยู่)
 */
export async function GET(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const lineUserId = req.nextUrl.searchParams.get("lineUserId")?.trim();

  if (!lineUserId && !session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (session) {
    return withTenant(session.tenantId, () => handleGet(req, true));
  }
  return withResolvedTenant(req, () => handleGet(req, false));
}

async function handleGet(req: NextRequest, isAdminSession: boolean) {
  // ลูกค้า: LINE จากคุกกี้ที่ตรวจแล้วเท่านั้น — ใส่ lineUserId คนอื่นใน query แล้วเห็นออร์เดอร์เขาไม่ได้
  const lineUserId = req.nextUrl.searchParams.get("lineUserId")?.trim();

  if (lineUserId || !isAdminSession) {
    // ลูกค้า — เห็นเฉพาะที่เปิดขาย และเห็นเฉพาะออร์เดอร์ของตัวเอง
    const me = isAdminSession ? lineUserId : (await requireCustomerSession(req))?.lineUserId;
    const customer = me ? await findCustomerByLine(me) : undefined;
    const [allOffers, payment, off, creditOff] = await Promise.all([
      listPackageOffers(true),
      getPaymentConfig(),
      featureOff("packages"),
      featureOff("memberCredit"),
    ]);
    // ร้านปิด "ขายคอร์สในแอป" — ไม่โชว์อะไรให้ซื้อ (ออร์เดอร์เดิมของลูกค้ายังเห็น)
    // ปิดเครดิต Member — ไม่โชว์ชุดเติมเครดิต
    const offers = off ? [] : allOffers.filter((o) => !(creditOff && o.kind === "credit"));
    const orders = customer
      ? await listPackageOrders({ customerId: customer.id })
      : [];
    return NextResponse.json({ offers, orders, payment });
  }

  const [offers, orders] = await Promise.all([
    listPackageOffers(),
    listPackageOrders(),
  ]);
  return NextResponse.json({ offers, orders });
}

export async function POST(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    return withTenant(session.tenantId, () => handlePost(req, true));
  }
  return withResolvedTenant(req, () => handlePost(req, false));
}

async function handlePost(req: NextRequest, isAdminSession: boolean) {
  if (!isAdminSession) {
    const blocked = await featureOff("packages");
    if (blocked) return blocked;
  }
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  /* ── ลูกค้ากดซื้อ ── */
  // ลูกค้าสั่งซื้อ/แนบสลิปในนามตัวเองเท่านั้น — ใช้ LINE จากคุกกี้ที่ตรวจแล้ว ไม่ใช่ body.lineUserId
  const sessionLine = isAdminSession ? "" : (await requireCustomerSession(req))?.lineUserId || "";
  if (action === "order") {
    const lineUserId = isAdminSession ? String(body.lineUserId || "").trim() : sessionLine;
    if (!lineUserId) {
      return NextResponse.json({ error: "lineUserId required" }, { status: 400 });
    }
    const customer = await findCustomerByLine(lineUserId);
    if (!customer) {
      return NextResponse.json({ error: "not_registered" }, { status: 400 });
    }
    const offers = await listPackageOffers(true);
    const offer = offers.find((o) => o.id === String(body.offerId || ""));
    if (!offer) {
      return NextResponse.json({ error: "offer_not_found" }, { status: 404 });
    }
    if (offer.kind === "credit") {
      const blocked = await featureOff("memberCredit");
      if (blocked) return blocked;
    }

    const order = await createPackageOrder({
      customerId: customer.id,
      customerName: customer.name,
      lineUserId,
      offer,
    });

    await sendTelegram(
      formatBookingTelegram(
        offer.kind === "credit" ? "🛒 ลูกค้าสั่งเติมเครดิต Member (รอโอน)" : "🛒 ลูกค้าสั่งซื้อคอร์ส (รอโอน)",
        {
          ลูกค้า: customer.name,
          ...(offer.kind === "credit"
            ? { เครดิตที่จะได้รับ: `${(offer.creditAmount ?? offer.price).toLocaleString()} บาท` }
            : { คอร์ส: `${offer.name} (${offer.totalUses} ครั้ง)` }),
          ยอดที่ต้องโอน: `${offer.price.toLocaleString()} บาท`,
          หมายเหตุ: "รอลูกค้าโอน + ร้านกดยืนยันรับเงิน",
        }
      )
    );

    return NextResponse.json({ ok: true, order, payment: await getPaymentConfig() });
  }

  /* ── ลูกค้าแนบสลิป ── */
  if (action === "slip") {
    const lineUserId = isAdminSession ? String(body.lineUserId || "").trim() : sessionLine;
    const orderId = String(body.orderId || "").trim();
    const slip = String(body.slip || "");
    if (!lineUserId || !orderId || !slip) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    }
    // ต้องเป็นออร์เดอร์ของตัวเองเท่านั้น กันแนบสลิปทับออร์เดอร์คนอื่น
    const customer = await findCustomerByLine(lineUserId);
    const orders = customer ? await listPackageOrders({ customerId: customer.id }) : [];
    if (!orders.some((o) => o.id === orderId)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const res = await attachOrderSlip(orderId, slip);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }
    const order = orders.find((o) => o.id === orderId)!;
    await sendTelegram(
      formatBookingTelegram(
        order.kind === "credit" ? "🧾 ลูกค้าแจ้งสลิปเติมเครดิตแล้ว" : "🧾 ลูกค้าแจ้งสลิปคอร์สแล้ว",
        {
          ลูกค้า: order.customerName,
          ...(order.kind === "credit"
            ? { เครดิตที่จะได้รับ: `${(order.creditAmount ?? order.price).toLocaleString()} บาท` }
            : { คอร์ส: `${order.name} (${order.totalUses} ครั้ง)` }),
          ยอด: `${order.price.toLocaleString()} บาท`,
          ต่อไป: "เช็คสลิปแล้วกดยืนยันรับเงินในหลังบ้าน",
        }
      )
    );
    return NextResponse.json({ ok: true });
  }

  /* ── หลังบ้าน: เพิ่มแพ็กเกจที่จะขาย ── */
  if (action === "create_offer") {
    if (!isAdminSession) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const offer = await createPackageOffer({
      kind: body.kind === "credit" ? "credit" : "package",
      name: String(body.name || ""),
      totalUses: Number(body.totalUses) || 0,
      price: Number(body.price) || 0,
      creditAmount: body.creditAmount !== undefined ? Number(body.creditAmount) : undefined,
      description: body.description ? String(body.description) : undefined,
      groomProgram: body.groomProgram ? String(body.groomProgram) : undefined,
      image: body.image ? String(body.image) : undefined,
    });
    if (!offer) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, offer });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

/** หลังบ้านทั้งหมด — ยืนยันรับเงิน / ยกเลิกออร์เดอร์ / เปิด-ปิด-ลบรายการขาย */
export async function PATCH(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePatch(req));
}

async function handlePatch(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  if (action === "confirm_order") {
    const res = await confirmPackageOrder(String(body.orderId || ""), {
      isLegacy: Boolean(body.isLegacy),
    });
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    const customer = await getCustomer(res.order.customerId);
    const isCredit = res.order.kind === "credit";
    await sendTelegram(
      formatBookingTelegram(
        isCredit ? "✅ ยืนยันรับเงินเติมเครดิต Member แล้ว" : "✅ ยืนยันรับเงินค่าคอร์สแล้ว",
        {
          ลูกค้า: res.order.customerName,
          ...(isCredit
            ? { เครดิตที่ได้รับ: `${(res.credit?.added ?? res.order.creditAmount ?? 0).toLocaleString()} บาท` }
            : { คอร์ส: `${res.order.name} (${res.order.totalUses} ครั้ง)` }),
          ยอด: `${res.order.price.toLocaleString()} บาท`,
          ...(body.isLegacy ? { หมายเหตุ: "ยอดยกมา — ไม่นับรายรับเดือนนี้" } : {}),
        }
      )
    );

    // แจ้งลูกค้าว่าคอร์ส/เครดิตพร้อมใช้แล้ว — ส่งเสมอ เพราะลูกค้าเป็นคนจ่ายเงินและกำลังรออยู่
    let notifyError: string | undefined;
    if (customer?.lineUserId) {
      const cfg = await getSiteConfig();
      try {
        if (isCredit) {
          await pushLineMessage(customer.lineUserId, [
            buildMemberBalanceFlex({
              customerName: res.order.customerName,
              memberCredit: res.credit?.balance ?? customer.memberCredit,
            }, cfg.cards?.memberBalance),
          ]);
        } else if (res.pkg) {
          await pushLineMessage(customer.lineUserId, [
            buildPackageFlex({
              customerName: res.order.customerName,
              packageName: res.pkg.name,
              totalUses: res.pkg.totalUses,
              usedUses: res.pkg.usedUses,
              price: res.pkg.price,
              shopName: cfg.business?.name,
            }, cfg.cards?.packageCard),
          ]);
        }
      } catch (e) {
        notifyError = e instanceof Error ? e.message : String(e);
      }
    }
    return NextResponse.json({ ok: true, package: res.pkg, credit: res.credit, notifyError });
  }

  if (action === "cancel_order") {
    const res = await cancelPackageOrder(String(body.orderId || ""));
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "set_offer_active") {
    await setPackageOfferActive(String(body.offerId || ""), body.active !== false);
    return NextResponse.json({ ok: true });
  }

  if (action === "delete_order") {
    const res = await deletePackageOrder(String(body.orderId || ""));
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "update_offer") {
    const res = await updatePackageOffer(String(body.offerId || ""), {
      name: body.name !== undefined ? String(body.name) : undefined,
      totalUses: body.totalUses !== undefined ? Number(body.totalUses) : undefined,
      price: body.price !== undefined ? Number(body.price) : undefined,
      creditAmount: body.creditAmount !== undefined ? Number(body.creditAmount) : undefined,
      description: body.description !== undefined ? String(body.description) : undefined,
      groomProgram: body.groomProgram !== undefined ? String(body.groomProgram) : undefined,
    });
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "set_offer_image") {
    const res = await setPackageOfferImage(
      String(body.offerId || ""),
      body.image ? String(body.image) : ""
    );
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "delete_offer") {
    await deletePackageOffer(String(body.offerId || ""));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
