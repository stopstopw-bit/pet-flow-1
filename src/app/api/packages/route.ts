import { NextRequest, NextResponse } from "next/server";
import { getCustomer, findCustomerByLine } from "@/lib/customers-store";
import {
  sellPackage,
  listCustomerPackages,
  listAllPackages,
  activeCustomerPackages,
  cancelPackage,
} from "@/lib/packages-store";
import { sendTelegramLater, formatBookingTelegram } from "@/lib/telegram";
import { pushLineMessage, buildPackageFlex, buildRoomPlanFlex } from "@/lib/line";
import { getSiteConfig } from "@/lib/config-store";
import { cleanBranchIds } from "@/lib/branches";
import { normalizeOfferItems, sellOfferItems, listPackageOffers } from "@/lib/package-shop-store";
import { listInvoices } from "@/lib/invoices-store";
import { getBooking } from "@/lib/bookings-store";
import { courseUseRanges } from "@/lib/service-history-rows";
import { isRoomLine } from "@/lib/stay-line";
import { roomPlanOutstanding, createPackagePlan, viewRoomPlan } from "@/lib/room-plans-store";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { withResolvedTenant, withTenant } from "@/lib/tenant-context";
import { requireCustomerSession } from "@/lib/customer-session";

/** คอร์สของลูกค้า (หลังบ้าน: customerId · แอป: lineUserId) */
export async function GET(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const lineUserId = req.nextUrl.searchParams.get("lineUserId")?.trim();

  // ไม่ได้ล็อกอิน = แอปลูกค้า → ดูได้เฉพาะคอร์สของตัวเอง (ต้องระบุ lineUserId ของตัวเอง)
  // ห้ามถามด้วย customerId ตรงๆ ไม่งั้นเดา id คนอื่นแล้วดูคอร์สเขาได้
  if (!lineUserId && !session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ขอดูคอร์สทั้งร้าน (หน้าสรุปข้อมูล) — เฉพาะคนที่ล็อกอินหลังบ้านเท่านั้น
  if (req.nextUrl.searchParams.get("all") === "1" && !session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (session) {
    return withTenant(session.tenantId, () => handleGet(req, true));
  }
  return withResolvedTenant(req, () => handleGet(req, false));
}

async function handleGet(req: NextRequest, isStaff: boolean) {
  const customerId = req.nextUrl.searchParams.get("customerId")?.trim();
  const lineUserId = req.nextUrl.searchParams.get("lineUserId")?.trim();
  const activeOnly = req.nextUrl.searchParams.get("active") === "1";

  // ไม่ได้ล็อกอิน = แอปลูกค้า → ดูได้เฉพาะคอร์สของตัวเอง (ต้องระบุ lineUserId ของตัวเอง)
  // ห้ามถามด้วย customerId ตรงๆ ไม่งั้นเดา id คนอื่นแล้วดูคอร์สเขาได้
  if (!lineUserId && !isStaff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // ลูกค้า: ใช้ LINE จากคุกกี้ที่ตรวจแล้วเท่านั้น (LINE ID เดียวกันอยู่ได้หลายร้าน ห้ามเชื่อค่าใน query)
  const me = isStaff ? null : await requireCustomerSession(req);
  if (!isStaff && !me) return NextResponse.json({ found: false, packages: [] });
  // หลังบ้านขอดูคอร์สทั้งร้าน (ใช้ในหน้าสรุปข้อมูล) — ลูกค้าขอแบบนี้ไม่ได้
  if (isStaff && req.nextUrl.searchParams.get("all") === "1") {
    return NextResponse.json({ found: true, packages: await listAllPackages() });
  }

  const cust = me
    ? await findCustomerByLine(me.lineUserId)
    : lineUserId
    ? await findCustomerByLine(lineUserId)
    : customerId
      ? await getCustomer(customerId)
      : undefined;
  if (!cust) return NextResponse.json({ found: false, packages: [] });

  // หน้าแรกแอปลูกค้า — คอร์สพร้อมรายละเอียด (ใช้ไปตอนไหน · คอร์สที่ใช้ครบแล้ว · คอร์สในบิลที่ยังจ่ายไม่ครบ)
  if (req.nextUrl.searchParams.get("view") === "mine") {
    return NextResponse.json({ found: true, customerId: cust.id, ...(await customerCourseView(cust.id)) });
  }

  const list = activeOnly
    ? await activeCustomerPackages(cust.id)
    : await listCustomerPackages(cust.id);
  // คอร์สจากแพ็กห้องรายเดือนที่ยังจ่ายไม่ครบ — ยังใช้ไม่ได้ (ต้องจ่ายครบก่อนใช้)
  const owed = new Map<string, number>();
  for (const pid of new Set(list.map((p) => p.planId).filter(Boolean) as string[])) {
    owed.set(pid, await roomPlanOutstanding(pid));
  }
  const packages = list.map((p) => {
    const due = p.planId ? owed.get(p.planId) || 0 : 0;
    return due > 0 ? { ...p, locked: true, outstanding: due } : p;
  });
  return NextResponse.json({ found: true, customerId: cust.id, packages });
}

/** คอร์สที่ใช้ครบแล้วยังโชว์ให้ลูกค้าเห็นอีกกี่วัน (นับจากวันซื้อ) — ซื้อ 30 คืนแล้วพักรวดเดียวจะได้ไม่หายไปเฉยๆ */
const USED_UP_SHOW_DAYS = 120;

/**
 * คอร์สของลูกค้าแบบมีรายละเอียด สำหรับหน้าแรกแอป
 * - คอร์สที่ยังใช้ได้ + คอร์สที่ใช้ครบแล้ว (ซื้อภายใน 120 วัน) พร้อมประวัติหักแต่ละครั้ง (วันเข้าพัก/จำนวนคืน)
 * - คอร์สที่ขายในบิลที่ยังจ่ายไม่ครบ — ยังไม่ได้คอร์ส แต่ลูกค้าต้องรู้ว่าซื้อไว้แล้ว รอจ่ายส่วนที่เหลือ
 */
async function customerCourseView(customerId: string) {
  const [all, invoices] = await Promise.all([
    listCustomerPackages(customerId),
    listInvoices(customerId).catch(() => []),
  ]);
  const since = Date.now() - USED_UP_SHOW_DAYS * 86400000;
  const shown = all.filter((p) => {
    if (p.status === "cancelled") return false;
    if (p.status === "active" && p.usedUses < p.totalUses) return true;
    return new Date(p.createdAt).getTime() >= since;
  });

  const owed = new Map<string, number>();
  for (const pid of new Set(shown.map((p) => p.planId).filter(Boolean) as string[])) {
    owed.set(pid, await roomPlanOutstanding(pid));
  }

  // ครั้งที่หัก — อ่านจากบิลที่จ่ายแล้วและผูกคอร์สไว้ (เหมือนประวัติคอร์สหลังบ้าน)
  const usedBills = invoices.filter(
    (i) => i.packageId && i.status === "paid" && shown.some((p) => p.id === i.packageId)
  );
  const bookingIds = [...new Set(usedBills.map((i) => i.bookingId).filter(Boolean) as string[])];
  const bookings = new Map(
    (await Promise.all(bookingIds.map((id) => getBooking(id).catch(() => undefined))))
      .filter((b): b is NonNullable<typeof b> => !!b)
      .map((b) => [b.id, b])
  );

  // บิลแรก + บิลต่อคืนของการพักเดียวกัน → แบ่งช่วงวันให้แต่ละใบ (ไม่ใช่ทุกใบโชว์ช่วงพักทั้งหมด)
  const ranges = courseUseRanges(
    usedBills.map((i) => ({
      id: i.id,
      bookingId: i.bookingId,
      at: i.createdAt || i.paidAt || "",
      nights:
        (i.items || []).filter(isRoomLine).reduce((s, it) => s + (Number(it.qty) || 0), 0) ||
        i.packageUnits ||
        1,
    })),
    (id) => bookings.get(id)
  );

  const packages = shown.map((p) => {
    const due = p.planId ? owed.get(p.planId) || 0 : 0;
    const uses = usedBills
      .filter((i) => i.packageId === p.id)
      .map((i) => {
        const r = ranges.get(i.id);
        return {
          date: (i.paidAt || i.createdAt || "").slice(0, 10),
          units: i.packageUnits || 1,
          checkin: r?.checkin,
          checkout: r?.checkout,
          catName: i.catName || undefined,
        };
      })
      .sort((a, b) => (b.checkin || b.date).localeCompare(a.checkin || a.date));
    return {
      id: p.id,
      name: p.name,
      totalUses: p.totalUses,
      usedUses: p.usedUses,
      status: p.status,
      unit: p.unit,
      roomLabel: p.roomLabel,
      createdAt: p.createdAt,
      ...(due > 0 ? { locked: true, outstanding: due } : {}),
      uses,
    };
  });

  // บรรทัด "ขายคอร์ส" ในบิลที่ยังไม่จ่ายครบ และยังไม่ได้เปิดคอร์สให้
  let pending: {
    invoiceId: string;
    name: string;
    amount: number;
    remaining: number;
    detail: string;
  }[] = [];
  const unpaid = invoices.filter(
    (i) =>
      i.status !== "paid" &&
      (i.items || []).some((it) => it.kind === "package" && it.offerId && !it.packageIds?.length)
  );
  if (unpaid.length) {
    const offers = await listPackageOffers().catch(() => []);
    pending = unpaid.flatMap((i) =>
      (i.items || [])
        .filter((it) => it.kind === "package" && it.offerId && !it.packageIds?.length)
        .flatMap((it) => {
          const o = offers.find((x) => x.id === it.offerId);
          if (!o || o.kind === "credit") return [];
          const items = o.items?.length
            ? o.items
            : [{ unit: o.kind === "nights" ? "night" : "use", paid: o.totalUses, free: 0 }];
          const detail = items
            .map((x) => `${(x.paid || 0) + (x.free || 0)} ${x.unit === "night" ? "คืน" : "ครั้ง"}`)
            .join(" + ");
          return [
            {
              invoiceId: i.id,
              name: o.name || it.label,
              amount: it.amount || 0,
              remaining: Math.max(0, (i.total || 0) - (i.deposit || 0)),
              detail,
            },
          ];
        })
    );
  }

  return { packages, pending };
}

/** ขายคอร์สให้ลูกค้า — หลังบ้านเท่านั้น */
export async function POST(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const customerId = String(body.customerId || "").trim();
  const name = String(body.name || "").trim();
  const totalUses = Math.round(Number(body.totalUses) || 0);
  const price = Math.round(Number(body.price) || 0);
  const isLegacy = Boolean(body.isLegacy);
  const groomProgram = String(body.groomProgram || "").trim() || undefined;
  const notify = body.notify === true;
  const preview = body.preview === true;
  // คอร์สห้องพัก / ชุดรวม / แถมฟรี — รายการละ 1 คอร์ส (ไม่ส่ง = คอร์สนับครั้งแบบเดิม)
  const items = normalizeOfferItems(body.items);
  // ร้านหลายสาขา: คอร์สนี้ใช้ได้เฉพาะสาขาที่เลือก (ไม่ส่งมา/ครบทุกสาขา = ทุกสาขา)
  const branchIds = cleanBranchIds(await getSiteConfig(), body.branchIds);
  const amountText = items.length
    ? items.map((it) => `${it.paid}${it.free ? ` + แถม ${it.free}` : ""} ${it.unit === "night" ? "คืน" : "ครั้ง"}`).join(" · ")
    : `${totalUses} ครั้ง`;
  if (!customerId || !name || (totalUses <= 0 && !items.length)) {
    return NextResponse.json({ error: "customerId + name + totalUses required" }, { status: 400 });
  }
  const cust = await getCustomer(customerId);
  if (!cust) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // ดูตัวอย่างการ์ดก่อนขายจริง — ยังไม่สร้างคอร์ส ไม่ส่งอะไรทั้งนั้น
  if (preview) {
    if (!notify || !cust.lineUserId) return NextResponse.json({ ok: true, preview: [] });
    const n = Math.min(12, Math.max(1, Math.round(Number(body.installments) || 1)));
    if (n > 1 && !isLegacy) {
      const planStyle = (await getSiteConfig()).cards?.roomPlan;
      const first = Math.min(price, Math.max(0, Math.round(Number(body.firstPayment) || 0)));
      const remaining = price - first;
      const left = remaining > 0 ? Math.max(1, n - (first > 0 ? 1 : 0)) : 0;
      return NextResponse.json({
        ok: true,
        preview: [
          buildRoomPlanFlex({
            customerName: cust.name,
            planName: name,
            nights: [{ roomLabel: name, total: totalUses, left: totalUses, unit: "use" }],
            kind: "package",
            price,
            paid: first,
            remaining,
            installmentsLeft: left,
            nextInstallment: left ? Math.ceil(remaining / left) : 0,
            thisPayment: first || undefined,
            installmentNo: first ? 1 : undefined,
          }, planStyle),
        ],
      });
    }
    const cfg = await getSiteConfig();
    return NextResponse.json({
      ok: true,
      preview: [
        buildPackageFlex({
          customerName: cust.name,
          packageName: name,
          totalUses,
          usedUses: 0,
          price,
          shopName: cfg.business?.name,
        }, cfg.cards?.packageCard),
      ],
    });
  }

  // แบ่งจ่ายเป็นงวด — คอร์สล็อกไว้จนกว่าจะจ่ายครบ รายรับลงตามงวดที่รับจริง
  const installments = Math.min(12, Math.max(1, Math.round(Number(body.installments) || 1)));
  if (installments > 1 && !isLegacy) {
    const res = await createPackagePlan({
      customerId,
      customerName: cust.name,
      lineUserId: cust.lineUserId,
      name,
      totalUses,
      price,
      groomProgram,
      items: items.length ? items : undefined,
      installments,
      firstPayment: Number(body.firstPayment) || 0,
      paymentMethod: body.paymentMethod === "cash" ? "cash" : "transfer",
    });
    if (!res.ok) return NextResponse.json({ error: "ใส่ราคาคอร์สก่อนแบ่งจ่าย" }, { status: 400 });
    if (res.payment && !res.payment.ok) {
      return NextResponse.json(
        { error: "สร้างคอร์สแล้ว แต่รับงวดแรกไม่สำเร็จ (ยอดเกินราคาคอร์ส?) — รับเงินงวดใหม่ที่หน้าลูกค้า", package: res.pkg },
        { status: 400 }
      );
    }
    const view =
      res.payment?.ok ? res.payment.view : viewRoomPlan(res.plan, await listCustomerPackages(customerId));
    sendTelegramLater(
      formatBookingTelegram("🎫 ขายคอร์สแบบแบ่งจ่าย", {
        ลูกค้า: cust.name,
        คอร์ส: name,
        จำนวน: amountText,
        ราคา: `${price} บาท`,
        แบ่งจ่าย: `${installments} งวด`,
        ...(res.payment?.ok ? { รับงวดแรก: `${res.payment.amount} บาท` } : {}),
        คงเหลือ: `${view.remaining} บาท`,
      })
    );
    let notifyError: string | undefined;
    if (notify && cust.lineUserId) {
      try {
        await pushLineMessage(cust.lineUserId, [
          buildRoomPlanFlex({
            customerName: cust.name,
            planName: view.name,
            nights: view.nights,
            kind: view.kind,
            price: view.price,
            paid: view.paid,
            remaining: view.remaining,
            installmentsLeft: view.installmentsLeft,
            nextInstallment: view.nextInstallment,
            thisPayment: res.payment?.ok ? res.payment.amount : undefined,
            installmentNo: res.payment?.ok ? 1 : undefined,
          }, (await getSiteConfig()).cards?.roomPlan),
        ]);
      } catch (e) {
        notifyError = e instanceof Error ? e.message : String(e);
      }
    } else if (notify) {
      notifyError = "ลูกค้ายังไม่ได้ผูก LINE";
    }
    return NextResponse.json({ ok: true, package: res.pkg, plan: view, notifyError });
  }

  const pkg = items.length
    ? (await sellOfferItems({ customerId, customerName: cust.name, name, price, items, isLegacy, branchIds }))[0]
    : await sellPackage({
        customerId,
        customerName: cust.name,
        name,
        totalUses,
        price,
        isLegacy,
        groomProgram,
        branchIds,
      });
  if (!pkg) return NextResponse.json({ error: "ใส่จำนวนในคอร์สก่อน" }, { status: 400 });
  sendTelegramLater(
    formatBookingTelegram(isLegacy ? "🕰️ ยกคอร์สมาจากระบบเก่า" : "🎫 ขายคอร์สให้ลูกค้า", {
      ลูกค้า: cust.name,
      คอร์ส: name,
      จำนวน: amountText,
      ราคา: `${price} บาท`,
      ...(isLegacy ? { หมายเหตุ: "ยอดยกมา — ไม่นับเป็นรายรับเดือนนี้" } : {}),
    })
  );

  // แจ้งลูกค้าเฉพาะตอนติ๊กเท่านั้น — ยกคอร์สเก่าเข้าระบบทีละหลายคนไม่ควรไปกวนลูกค้า
  let notifyError: string | undefined;
  if (notify && cust.lineUserId) {
    const cfg = await getSiteConfig();
    try {
      await pushLineMessage(cust.lineUserId, [
        buildPackageFlex({
          customerName: cust.name,
          packageName: pkg.name,
          totalUses: pkg.totalUses,
          usedUses: pkg.usedUses,
          price: pkg.price,
          shopName: cfg.business?.name,
        }, cfg.cards?.packageCard),
      ]);
    } catch (e) {
      notifyError = e instanceof Error ? e.message : String(e);
    }
  }
  return NextResponse.json({ ok: true, package: pkg, notifyError });
}

export async function PATCH(req: NextRequest) {
  // ยกเลิก/หักคอร์ส เป็นงานหลังบ้านเท่านั้น ลูกค้าแก้เองไม่ได้
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePatch(req));
}

async function handlePatch(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.action === "cancel") {
    await cancelPackage(String(body.packageId || ""));
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
