import { buildReferralRewardCard } from "@/lib/notice-cards";
import { NextRequest, NextResponse } from "next/server";
import { adminBranchScope, branchFilter, invoiceBranchOf, otherBranchDenied, setRecordBranch } from "@/lib/branch-scope";
import {
  createInvoice,
  getInvoice,
  listInvoices,
  markInvoicePaid,
  setInvoiceIssueDate,
  grantSoldCoursesEarly,
  revertInvoicePaid,
  markInvoiceSent,
  receiveDepositCredit,
  receiveInvoiceDeposit,
  receiveInvoicePayment,
  updateInvoice,
  deleteInvoice,
  restoreInvoice,
  listTrashedInvoices,
  linkInvoiceToBooking,
  invoiceCatNames,
  findOpenInvoiceForBooking,
  applyDepositCreditToInvoice,
  applyCouponToInvoice,
} from "@/lib/invoices-store";
import { redeemReward } from "@/lib/points-store";
import { rewardDiscountBaht } from "@/lib/points-reward";
import {
  getCustomer,
  adjustDepositCredit,
  findCustomerForBooking,
} from "@/lib/customers-store";
import { issueCoupon, listCustomerCoupons } from "@/lib/coupons-store";
import { getPaymentConfig } from "@/lib/payment-config";
import { shopAppBase } from "@/lib/line-config";
import { getSiteConfig } from "@/lib/config-store";
import { isFeatureOn } from "@/lib/features";
import { referralReward } from "@/lib/referral";
import {
  pushLineMessage,
  buildPaymentFlex,
  buildBillSummaryFlex,
  buildDepositRequestFlex,
  buildDepositThanksFlex,
  buildReceiptFlex,
  buildMemberBalanceFlex,
  buildReviewRequestFlex,
  reviewMessageFor,
  politeCat,
} from "@/lib/line";
import { renderTemplate } from "@/lib/messages";
import { consumePackage, refundPackageUse, getPackage, receiptCourseSummary } from "@/lib/packages-store";
import { roomPlanOutstanding } from "@/lib/room-plans-store";
import { getBooking } from "@/lib/bookings-store";
import { bookingBranchId, branchScopeLabel, isMultiBranch, usableAtBranch } from "@/lib/branches";
import { bookingScheduleText } from "@/lib/booking-reminders";
import type { InvoiceRecord } from "@/lib/invoices-store";
import type { SiteConfig, CardStyleConfig } from "@/lib/config-types";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { withResolvedTenant, withTenant } from "@/lib/tenant-context";

async function getAdminSession(req: NextRequest) {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}

type SummaryMode = "booking" | "deposit" | "full" | "remaining";

/**
 * ส่งการ์ดให้ลูกค้าแบบ "ส่งไม่ได้ก็ไม่ล้มรายการเงิน"
 *
 * เมื่อก่อนถ้ายังไม่ได้ตั้ง LINE (หรือ LINE ล่ม) การ push จะ throw ออกไปเป็น 500
 * ทั้งที่เงินถูกบันทึกไปแล้ว → ร้านเห็น error เลยกดซ้ำ กลายเป็นรับเงิน/หักเครดิตซ้ำ
 * ตอนนี้คืน error กลับไปเป็นข้อความเตือนแทน รายการเงินยังสำเร็จเสมอ
 */
async function notifyCustomer(
  lineUserId: string | undefined | null,
  messages: object[]
): Promise<string | undefined> {
  if (!lineUserId) return undefined;
  try {
    await pushLineMessage(lineUserId, messages);
    return undefined;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

function summaryFlexFromInvoice(
  inv: InvoiceRecord,
  mode: SummaryMode,
  billing: SiteConfig["billing"],
  payment: { bankName: string; accountNumber: string; accountName: string },
  scheduleText?: string,
  cardStyle?: CardStyleConfig
) {
  const deposit = inv.deposit || 0;
  const remaining = Math.max(0, inv.total - deposit);
  const title =
    mode === "deposit"
      ? billing.summaryDepositTitle
      : mode === "full"
        ? billing.summaryFullTitle
        : mode === "remaining"
          ? cardStyle?.texts?.remainingTitle || "แจ้งยอดคงเหลือที่ต้องโอน"
          : billing.summaryBookingTitle;
  return buildBillSummaryFlex({
    mode,
    title,
    closing: "",
    customerName: inv.customerName,
    catName: inv.catName,
    scheduleText,
    items: inv.items,
    subtotal: inv.subtotal,
    discount: inv.discount,
    promoLabel: inv.promoLabel,
    total: inv.total,
    deposit,
    remaining,
    bankName: payment.bankName,
    accountNumber: payment.accountNumber,
    accountName: payment.accountName,
  }, cardStyle);
}
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
import { runAfterResponse } from "@/lib/after-response";
import { isExtraLine } from "@/lib/booking-extras";
import { isRoomLine } from "@/lib/stay-line";
import { shortItemLabel } from "@/lib/invoice-item-label";
import { hasAudit, logAudit } from "@/lib/audit-log";
import { requireTenantId } from "@/lib/tenant-context";
import { cancelAppointmentToCredit, creditableAmount } from "@/lib/cancel-to-credit";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const session = await getAdminSession(req);
  // ไม่ได้ล็อกอิน = แอปลูกค้า (หน้าจ่ายเงิน) → ดูได้เฉพาะบิลที่ระบุ id เท่านั้น
  if (!session && !id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session) return withTenant(session.tenantId, () => handleGet(req, id));
  return withResolvedTenant(req, () => handleGet(req, id));
}

async function handleGet(req: NextRequest, id: string | null) {
  const customerId = req.nextUrl.searchParams.get("customerId") || undefined;
  const bookingId = req.nextUrl.searchParams.get("bookingId") || undefined;

  if (id) {
    const inv = await getInvoice(id);
    if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({
      invoice: inv,
      payment: await getPaymentConfig(),
      mapsUrl: (await getSiteConfig()).business.maps,
    });
  }

  if (req.nextUrl.searchParams.get("trash") === "1") {
    return NextResponse.json({ invoices: await listTrashedInvoices() });
  }

  // หาบิลที่ผูกกับนัดนี้ (ใช้จากปุ่มส่งการ์ดในการ์ดนัด)
  // ถ้านัดนี้มีหลายบิล (เช่นออกบิลใหม่ทับของเดิม) ให้เอาบิลที่ยังไม่จ่ายก่อนเสมอ
  // ไม่งั้นมัดจำที่เรียกเก็บจะไปผูกกับบิลเก่าที่จ่ายจบไปแล้ว แล้วบิลใหม่จะไม่เห็นมัดจำนั้นเลย
  if (bookingId) {
    // นับบิลรวมทั้งบ้านด้วย — บิลบ้านเดียวกันผูก bookingId ไว้แค่ตัวเดียว
    const inv = await findOpenInvoiceForBooking(bookingId);
    return NextResponse.json({ invoice: inv || null });
  }

  // บิลของลูกค้ารายเดียว = ทุกสาขา · รายการบิลรวมหลังบ้าน = ตามสาขาที่เลือกดู
  const list = await listInvoices(customerId);
  const branchId = customerId ? null : await adminBranchScope(req);
  const shown = branchId ? await (await branchFilter(branchId)).invoices(list) : list;
  // เงินที่เข้าร้านจริงของแต่ละบิล (รายรับที่ผูกบิลในหน้าการเงิน) — การ์ดบิลจะได้บอกได้ว่า
  // ส่วนไหนเป็นเงินเข้า ส่วนไหนตัดเครดิต/หักคอร์ส (ซึ่งไม่ขึ้นเป็นรายรับ)
  const moneyIn = new Map<string, number>();
  try {
    const { listFinance } = await import("@/lib/finance-store");
    for (const r of await listFinance()) {
      if (r.type !== "income" || !r.invoiceId || r.excluded) continue;
      moneyIn.set(r.invoiceId, (moneyIn.get(r.invoiceId) || 0) + r.amount);
    }
  } catch {
    /* โหลดรายรับไม่ได้ — การ์ดบิลแค่ไม่โชว์บรรทัดเงินเข้า */
  }
  return NextResponse.json({
    invoices: shown.map((inv) => ({ ...inv, moneyIn: moneyIn.get(inv.id) || 0 })),
  });
}

const CONVERTED_MSG =
  "ยอดบิลนี้ถูกเก็บเป็นเครดิตแล้ว (🔁 ยกเลิกนัด) — ไปยกเลิกรายการนั้นในประวัติเครดิตของลูกค้าก่อน";

/** ใครกดปุ่มนี้ — เอาไว้ลงบันทึกว่าใครทำอะไรกับเงิน */
async function actorName(req: NextRequest): Promise<string> {
  const s = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  return s?.name || s?.role || "ไม่ทราบ";
}

/**
 * เช็กว่าเอาคอร์สนี้มาหักบิลนี้ได้ไหม (ใช้ทั้งตอนออกบิลและตอนแก้บิล) — คืนข้อความเหตุผลถ้าไม่ได้
 * แพ็กห้องรายเดือนต้องจ่ายครบก่อน · คอร์สคืนผูกห้องหักได้ไม่เกินคืนของห้องนั้น · คอร์สอาบน้ำผูกโปรแกรมเหมือนกัน
 */
async function packageProblem(
  packageId: string,
  rawItems: unknown,
  packageUnits: number,
  /** สาขาของบิลนี้ (ร้านหลายสาขา) — คอร์สที่จำกัดสาขาหักได้เฉพาะบิลของสาขานั้น */
  branchId?: string | null
) {
  const pk = await getPackage(packageId);
  if (pk?.branchIds?.length) {
    const cfg = await getSiteConfig();
    if (!usableAtBranch(cfg, pk.branchIds, branchId)) {
      return `คอร์สนี้ใช้ได้${branchScopeLabel(cfg, pk.branchIds)} บิลนี้เป็นของสาขาอื่น`;
    }
  }
  const owed = await roomPlanOutstanding(pk?.planId);
  if (owed > 0) return `แพ็กนี้ยังค้างจ่าย ${owed.toLocaleString()} บาท — ต้องจ่ายครบก่อนถึงจะใช้คืนได้`;
  const items: { label?: string; kind?: string; qty?: number; program?: string }[] = Array.isArray(rawItems)
    ? rawItems
    : [];
  if (pk?.unit === "night" && pk.roomType && pk.roomLabel) {
    const nightsOfRoom = items
      .filter((it) => it.kind === "room" && String(it.label || "").includes(pk.roomLabel!))
      .reduce((n, it) => n + Math.max(1, Math.round(Number(it.qty) || 1)), 0);
    if (nightsOfRoom < packageUnits) return `คอร์สนี้ใช้ได้กับ${pk.roomLabel}เท่านั้น (บิลนี้มี ${nightsOfRoom} คืน)`;
  }
  if (pk && pk.unit !== "night" && pk.groomProgram) {
    const usesOfProgram = items
      .filter((it) => it.kind === "grooming" && it.program === pk.groomProgram)
      .reduce((n, it) => n + Math.max(1, Math.round(Number(it.qty) || 1)), 0);
    if (usesOfProgram < packageUnits) return `คอร์สนี้ใช้ได้กับโปรแกรมที่ผูกไว้เท่านั้น (บิลนี้มี ${usesOfProgram} ครั้ง)`;
  }
  return null;
}


export async function POST(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  // ดูตัวอย่างการ์ดก่อนส่งจริง — ข้ามการ push เข้า LINE + การเขียนข้อมูลที่มีผลจริง (ผูกมัดจำ)
  const preview = body.preview === true;

  if (body.action === "create") {
    // หักคอร์สก่อนออกบิล — ต้องรู้ให้แน่ว่าหักได้จริงถึงจะผูกคอร์สกับบิลใบนี้
    // consumePackage คืนผลลัพธ์ ไม่ได้ throw ถ้าคอร์สหมด ถ้าเช็คแค่ try/catch
    // คอร์สที่ใช้ครบแล้วจะยังออกบิลฟรีให้ได้อยู่
    let consumedPackageId: string | undefined;
    // คอร์สแบบคืนหักหลายหน่วยในบิลเดียว (พัก 5 คืน = หัก 5) ไม่ระบุ = 1 เหมือนเดิม
    const packageUnits = Math.max(1, Math.round(Number(body.packageUnits) || 1));
    if (body.packageId) {
      const cfgB = await getSiteConfig();
      const linked = body.bookingId ? await getBooking(String(body.bookingId)).catch(() => null) : null;
      const billBranch = !isMultiBranch(cfgB) ? null : linked ? bookingBranchId(cfgB, linked) : await adminBranchScope(req);
      const bad = await packageProblem(String(body.packageId), body.items, packageUnits, billBranch);
      if (bad) return NextResponse.json({ error: bad }, { status: 400 });
      try {
        const used = await consumePackage(String(body.packageId), packageUnits);
        if (used.ok) consumedPackageId = String(body.packageId);
      } catch {
        /* คอร์สไม่เจอ — ออกบิลต่อได้ แต่ไม่ผูกคอร์ส */
      }
      if (!consumedPackageId) {
        return NextResponse.json({ error: "package_unavailable" }, { status: 400 });
      }
    }

    let invoice;
    try {
      invoice = await createInvoice({
        customerId: body.customerId,
        lineUserId: body.lineUserId,
        customerName: body.customerName,
        catName: body.catName,
        items: body.items,
        promoId: body.promoId,
        extraDiscount: body.extraDiscount,
        deposit: body.deposit,
        bookingId: body.bookingId,
        packageId: consumedPackageId,
        packageUnits: consumedPackageId ? packageUnits : undefined,
        couponId: body.couponId ? String(body.couponId) : undefined,
        couponIds: Array.isArray(body.couponIds) ? body.couponIds.map(String) : undefined,
        issueDate: typeof body.issueDate === "string" ? body.issueDate : undefined,
      });
    } catch (e) {
      // ออกบิลไม่สำเร็จ (ส่วนใหญ่เพราะคูปองใช้ไม่ได้แล้ว) — คืนครั้งคอร์สที่หักไปด้านบนก่อน
      // ไม่งั้นคอร์สจะถูกหักฟรีๆ ทั้งที่ไม่มีบิลเกิดขึ้นจริง
      if (consumedPackageId) await refundPackageUse(consumedPackageId, packageUnits);
      const message = e instanceof Error ? e.message : String(e);
      const known: Record<string, string> = {
        coupon_invalid: "คูปองนี้ใช้ไม่ได้แล้ว (หมดอายุ/ใช้ไปแล้ว/ไม่ใช่ของลูกค้าคนนี้)",
        coupon_race: "คูปองนี้เพิ่งถูกใช้ไปหมาดๆ — เลือกใหม่อีกครั้ง",
      };
      const stock = message.match(/^out_of_stock:(.*):(-?\d+)$/);
      if (stock) {
        return NextResponse.json(
          { error: `สต็อก ${stock[1]} ไม่พอ (เหลือ ${stock[2]} ชิ้น)` },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: known[message] || "ออกบิลไม่สำเร็จ" },
        { status: 400 }
      );
    }
    // บิลที่ไม่ผูกนัด (ขายคอร์ส/บิลเปล่า) = สาขาที่หลังบ้านเลือกดูอยู่ · บิลผูกนัดตามสาขาของนัดเอง
    if (!body.bookingId) await setRecordBranch("invoices", invoice.id, await adminBranchScope(req));
    if (invoice.autoAppliedCredit > 0) {
      await logAudit({
        tenantId: requireTenantId(),
        actorType: "tenant",
        actorId: await actorName(req),
        action: "apply_deposit_credit",
        resourceType: "invoice",
        resourceId: invoice.id,
        afterState: {
          ลูกค้า: invoice.customerName,
          มัดจำที่หักจากเครดิต: invoice.autoAppliedCredit,
          ยอดบิล: invoice.total,
          หมายเหตุ: "หักเครดิตมัดจำล่วงหน้าเข้าบิลอัตโนมัติตอนออกบิล",
        },
      });
      await sendTelegram(
        formatBookingTelegram("💰 หักมัดจำล่วงหน้าเข้าบิลอัตโนมัติ", {
          ลูกค้า: invoice.customerName,
          น้อง: invoice.catName,
          มัดจำที่หักให้: `${invoice.autoAppliedCredit} บาท`,
          บิล: invoice.id,
          หมายเหตุ: "เคยเรียกเก็บมัดจำไว้ก่อนออกบิล — ระบบหักให้แล้ว",
        })
      );
    }
    notifyBillExtras(invoice);
    return NextResponse.json({ ok: true, invoice });
  }

  if (body.action === "send_deposit_request") {
    const amount = Math.round(Number(body.amount) || 0);
    if (amount <= 0) {
      return NextResponse.json({ error: "bad_amount" }, { status: 400 });
    }
    const customer = await getCustomer(body.customerId);
    if (!customer?.lineUserId) {
      return NextResponse.json({ error: "no_line" }, { status: 400 });
    }
    const cfgDep = await getSiteConfig();
    const msgs = cfgDep.messages;
    const payment = await getPaymentConfig();
    const catName = customer.cats[0]?.name || "น้อง";
    const pctNum = Number(body.pct) || 0;
    const depositFlex = buildDepositRequestFlex({
      title: msgs.depositRequestTitle,
      body: renderTemplate(msgs.depositRequestBody, {
        name: customer.name,
        cat: politeCat(catName),
        amount: amount.toLocaleString(),
        pct: pctNum > 0 ? ` ${pctNum}% ของค่าบริการ` : "",
      }),
      amount,
      bankName: payment.bankName,
      accountNumber: payment.accountNumber,
      accountName: payment.accountName,
      note: body.note ? String(body.note) : undefined,
      percentNote: body.percentNote ? String(body.percentNote) : undefined,
    }, cfgDep.cards?.depositRequest);
    if (preview) return NextResponse.json({ ok: true, preview: [depositFlex] });

    // ผูกมัดจำให้ทันทีที่เรียกเก็บ ไม่ว่าจะกดจากที่ไหน:
    // - มีบิลอยู่แล้ว → ผูกเข้าบิลนั้นเลย (โผล่ปุ่ม "รับมัดจำแล้ว" + หักยอดคงเหลือถูกต้อง)
    // - ยังไม่มีบิล → พักไว้เป็นเครดิตมัดจำล่วงหน้าของลูกค้า จะหักอัตโนมัติตอนออกบิลถัดไป
    const linkInvoiceId = body.invoiceId ? String(body.invoiceId) : undefined;
    if (linkInvoiceId) {
      await updateInvoice(linkInvoiceId, { deposit: amount });
    } else {
      await adjustDepositCredit(body.customerId, amount);
    }
    await logAudit({
      tenantId: requireTenantId(),
      actorType: "tenant",
      actorId: await actorName(req),
      action: "request_deposit",
      resourceType: linkInvoiceId ? "invoice" : "customer",
      resourceId: linkInvoiceId || String(body.customerId),
      afterState: {
        ลูกค้า: customer.name,
        มัดจำที่เรียกเก็บ: amount,
        ลงที่: linkInvoiceId ? `บิล ${linkInvoiceId}` : "เครดิตมัดจำล่วงหน้าของลูกค้า (ยังไม่มีบิล)",
      },
    });
    const notifyErr = await notifyCustomer(customer.lineUserId, [depositFlex]);
    return NextResponse.json({ ok: true, notifyError: notifyErr });
  }

  if (body.action === "receive_deposit_credit") {
    const res = await receiveDepositCredit(
      body.customerId,
      Number(body.amount) || 0,
      body.note ? String(body.note) : undefined,
      body.paymentMethod === "cash" ? "cash" : "transfer"
    );
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }
    const customer = await getCustomer(body.customerId);
    // แจ้ง Telegram เพื่อกระทบยอด + ส่งการ์ดยืนยันรับมัดจำให้ลูกค้า
    await sendTelegram(
      formatBookingTelegram("💰 รับมัดจำล่วงหน้า", {
        ลูกค้า: customer?.name || body.customerId,
        มัดจำ: `${res.amount} บาท`,
        เครดิตมัดจำคงเหลือ: `${res.balance} บาท`,
        ...(body.note ? { หมายเหตุ: String(body.note) } : {}),
      })
    );
    let dtNotifyErr: string | undefined;
    // ส่งการ์ดขอบคุณเฉพาะเมื่อขอมาชัดๆ (notify: true)
    if (body.notify === true && customer?.lineUserId) {
      const cfgDt = await getSiteConfig();
      const msgs = cfgDt.messages;
      const catName = customer.cats[0]?.name || "น้อง";
      dtNotifyErr = await notifyCustomer(customer.lineUserId, [
        buildDepositThanksFlex({
          title: msgs.depositThanksTitle,
          body: renderTemplate(msgs.depositThanksBody, {
            name: customer.name,
            cat: politeCat(catName),
            amount: res.amount.toLocaleString(),
          }),
          terms: msgs.depositTerms || [],
          amount: res.amount,
          note: body.note ? String(body.note) : undefined,
          percentNote: body.percentNote ? String(body.percentNote) : undefined,
        }, cfgDt.cards?.depositThanks),
      ]);
    }
    return NextResponse.json({
      ok: true,
      balance: res.balance,
      needSql: res.needSql,
      notifyError: dtNotifyErr,
    });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePatch(req));
}

async function handlePatch(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id, action } = body;
  const preview = body.preview === true;
  const inv = await getInvoice(id);
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  // พนักงานที่ถูกจำกัดสาขา แก้/เก็บเงิน/ลบบิลของสาขาอื่นไม่ได้
  const denied = await otherBranchDenied(req, (cfg) => invoiceBranchOf(cfg, inv));
  if (denied) return NextResponse.json({ error: denied }, { status: 403 });

  // ลิงก์ในการ์ดต้องมีชื่อร้าน (/s/<slug>) — /app เปล่า ๆ คือร้าน PetFlow
  const base = await shopAppBase();
    const payment = await getPaymentConfig();

  // วัน/เวลานัด (จากนัดที่ผูกกับบิล) — แสดงในการ์ดสรุป
  const linkedBooking = inv.bookingId ? await getBooking(inv.bookingId) : null;
  const scheduleText = linkedBooking ? bookingScheduleText(linkedBooking) : undefined;

  if (action === "send_payment") {
    if (!inv.lineUserId) {
      return NextResponse.json({ error: "no_line" }, { status: 400 });
    }
    const deposit = inv.deposit || 0;
    // ถ้ามีมัดจำแล้ว → ส่งการ์ด "ยอดคงเหลือ" (ยอดค้างจริง) ไม่ใช่ยอดเต็มซ้ำ
    if (deposit > 0) {
      const cfgRem = await getSiteConfig();
      const remFlex = summaryFlexFromInvoice(inv, "remaining", cfgRem.billing, payment, scheduleText, cfgRem.cards?.billSummary);
      if (preview) return NextResponse.json({ ok: true, preview: [remFlex] });
      await pushLineMessage(inv.lineUserId, [remFlex]);
      await markInvoiceSent(id);
      return NextResponse.json({ ok: true, kind: "remaining" });
    }
    const payUrl = `${base}/app/pay/${inv.id}`;
    const payFlex = buildPaymentFlex({
      invoiceId: inv.id,
      customerName: inv.customerName,
      catName: inv.catName,
      total: inv.total,
      items: inv.items,
      payUrl,
      bankName: payment.bankName,
      accountNumber: payment.accountNumber,
      accountName: payment.accountName,
    }, (await getSiteConfig()).cards?.payment);
    if (preview) return NextResponse.json({ ok: true, preview: [payFlex] });
    await pushLineMessage(inv.lineUserId, [payFlex]);
    await markInvoiceSent(id);
    return NextResponse.json({ ok: true, payUrl });
  }

  if (action === "send_summary") {
    if (!inv.lineUserId) {
      return NextResponse.json({ error: "no_line" }, { status: 400 });
    }
    const mode = (body.mode as SummaryMode) || "booking";
    const cfgSum = await getSiteConfig();
    const summaryFlex = summaryFlexFromInvoice(inv, mode, cfgSum.billing, payment, scheduleText, cfgSum.cards?.billSummary);
    if (preview) return NextResponse.json({ ok: true, preview: [summaryFlex] });
    await pushLineMessage(inv.lineUserId, [summaryFlex]);
    await markInvoiceSent(id);
    return NextResponse.json({ ok: true, kind: mode });
  }

  if (action === "send_review") {
    if (!inv.lineUserId) {
      return NextResponse.json({ error: "no_line" }, { status: 400 });
    }
    const cfg = await getSiteConfig();
    const biz = cfg.business;
    const reviewUrl = biz.reviewUrl || biz.maps;
    if (!reviewUrl) {
      return NextResponse.json({ error: "no_review_url" }, { status: 400 });
    }
    const hasGroom = (inv.items || []).some(
      (it) =>
        it.kind === "grooming" || /อาบน้ำ|กรูม|premium|malaseb/i.test(it.label)
    );
    const hasRoom = (inv.items || []).some((it) => /คืน|ห้อง/.test(it.label));
    const msg = reviewMessageFor(hasGroom, hasRoom, biz.name, cfg.cards?.review);
    const reviewFlex = buildReviewRequestFlex({
      title: msg.title,
      body: msg.body,
      reviewUrl,
      reviewLabel: biz.reviewButtonText,
    }, cfg.cards?.review);
    if (preview) return NextResponse.json({ ok: true, preview: [reviewFlex] });
    await pushLineMessage(inv.lineUserId, [reviewFlex]);
    return NextResponse.json({ ok: true });
  }

  // ส่งใบเสร็จจากบิลตรงๆ — ไม่ต้องมีนัดผูก (บิลที่ออกเองไม่มีนัดก็ส่งได้)
  if (action === "send_receipt") {
    if (inv.status !== "paid") {
      return NextResponse.json({ error: "บิลนี้ยังไม่ได้รับเงิน" }, { status: 400 });
    }
    if (!inv.lineUserId) {
      return NextResponse.json({ error: "no_line" }, { status: 400 });
    }
    const cfgR = await getSiteConfig();
    const paidByCredit = inv.paymentMethod === "member_credit";
    // ยอดเครดิตปัจจุบันของลูกค้า = ยอดหลังหักบิลนี้ไปแล้ว (บิลถูก mark paid ไปก่อนหน้า)
    const creditCustomer = paidByCredit && inv.customerId ? await getCustomer(inv.customerId) : null;
    // คอร์สที่บิลนี้หักไป — โชว์สิทธิ์คงเหลือในใบเสร็จ ลูกค้าจะได้ไม่ต้องถาม
    const usedPkg = inv.packageId ? await getPackage(inv.packageId) : undefined;
    // ลูกค้ามีคอร์สอยู่ → สรุปคอร์สที่เหลือทุกใบไปท้ายใบเสร็จด้วย
    const courses = await receiptCourseSummary(inv.customerId, inv.packageId, inv.packageUnits);
    const receiptFlex = buildReceiptFlex({
      invoiceId: inv.id,
      customerName: inv.customerName,
      catName: invoiceCatNames(inv),
      total: inv.total,
      discount: inv.discount,
      promoLabel: inv.promoLabel,
      pointsEarned: inv.pointsEarned || 0,
      shopName: cfgR.business.name,
      items: (inv.items || []).map((it) => ({ label: it.label, amount: it.amount })),
      memberCreditUsed: paidByCredit ? inv.total : undefined,
      memberCreditLeft: creditCustomer?.memberCredit,
      packageName: usedPkg?.name,
      packageUsed: usedPkg ? inv.packageUnits || 1 : undefined,
      packageLeft: usedPkg ? usedPkg.totalUses - usedPkg.usedUses : undefined,
      packageUnitLabel: usedPkg?.unit === "night" ? "คืน" : "ครั้ง",
      courses,
      paymentMethod:
        inv.paymentMethod === "member_credit"
          ? "Member Credit"
          : inv.paymentMethod === "cash"
            ? "เงินสด"
            : inv.paymentMethod === "package"
              ? "หักจากคอร์ส"
              : "โอนเงิน",
    }, cfgR.cards?.receipt);
    if (preview) return NextResponse.json({ ok: true, preview: [receiptFlex] });
    await pushLineMessage(inv.lineUserId, [receiptFlex]);
    await logAudit({
      tenantId: requireTenantId(),
      actorType: "tenant",
      actorId: await actorName(req),
      action: "send_receipt",
      resourceType: "invoice",
      resourceId: inv.id,
      afterState: { ลูกค้า: inv.customerName, ยอด: inv.total },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  }

  // 🔁 ยกเลิกนัด เก็บยอดเป็นเครดิต — ยกเลิกนัด + คงบิลไว้ตามเดิม + เติมเครดิตเท่ายอดที่รับมาแล้ว
  // (ไม่ลงรายรับ/ไม่ให้แต้มซ้ำ) + ผูกเลขบิลในประวัติเครดิต + แจ้ง LINE ถ้าติ๊ก
  if (action === "cancel_to_credit") {
    // ร้านปิดเครดิต Member ในตั้งค่า › เปิด/ปิดฟีเจอร์ — เก็บเป็นเครดิตไม่ได้
    if (!isFeatureOn(await getSiteConfig(), "memberCredit")) {
      return NextResponse.json({ error: "feature_disabled", feature: "memberCredit" }, { status: 403 });
    }
    const notify = body.notify === true;
    if (preview) {
      const cust = inv.customerId ? await getCustomer(inv.customerId) : null;
      if (!notify || !cust?.lineUserId) return NextResponse.json({ ok: true, preview: [] });
      return NextResponse.json({
        ok: true,
        preview: [
          buildMemberBalanceFlex(
            { customerName: cust.name, memberCredit: cust.memberCredit + creditableAmount(inv) },
            (await getSiteConfig()).cards?.memberBalance
          ),
        ],
      });
    }

    const res = await cancelAppointmentToCredit(id);
    if (!res.ok) {
      return NextResponse.json(
        { error: res.error === "busy" ? "กำลังทำรายการนี้อยู่ — รอสักครู่" : res.error },
        { status: 400 }
      );
    }

    let notifyError: string | undefined;
    if (notify && res.lineUserId) {
      try {
        await pushLineMessage(res.lineUserId, [
          buildMemberBalanceFlex(
            { customerName: res.customerName, memberCredit: res.balance },
            (await getSiteConfig()).cards?.memberBalance
          ),
        ]);
      } catch (e) {
        notifyError = e instanceof Error ? e.message : String(e);
      }
    } else if (notify) {
      notifyError = "ลูกค้ายังไม่มี LINE User ID";
    }

    await logAudit({
      tenantId: requireTenantId(),
      actorType: "tenant",
      actorId: await actorName(req),
      action: "cancel_to_credit",
      resourceType: "invoice",
      resourceId: id,
      afterState: {
        ลูกค้า: inv.customerName,
        ยอดเข้าเครดิต: res.amount,
        เครดิตคงเหลือ: res.balance,
        ยกเลิกนัด: res.cancelledCats.join(", ") || "-",
      },
    });
    await sendTelegram(
      formatBookingTelegram("🔁 ยกเลิกนัด เก็บยอดเป็นเครดิต", {
        ลูกค้า: inv.customerName,
        น้อง: res.cancelledCats.join(", ") || inv.catName,
        บิล: inv.id,
        เข้าเครดิต: `${res.amount.toLocaleString()} บาท`,
        คงเหลือ: `${res.balance.toLocaleString()} บาท`,
      })
    );

    return NextResponse.json({ ...res, notifyError });
  }

  if (action === "unmark_paid") {
    const res = await revertInvoicePaid(id);
    if (!res.ok) {
      return NextResponse.json(
        { error: res.error === "converted_to_credit" ? CONVERTED_MSG : res.error },
        { status: 400 }
      );
    }
    await sendTelegram(
      formatBookingTelegram("↩️ ยกเลิกการชำระ (แก้ไข)", {
        ลูกค้า: inv.customerName,
        น้อง: inv.catName,
        บิล: inv.id,
        ยอด: `${inv.total} บาท`,
      })
    );
    return NextResponse.json({ ok: true, invoice: res.invoice });
  }

  // ลูกค้าจ่ายแล้วแต่ไม่มาใช้บริการ (ร้านไม่คืนเงิน) → เก็บยอดที่จ่ายไว้เป็นเครดิต Member ใช้ครั้งหน้า
  // เงินก้อนนี้ลงรายรับไปแล้วตอนรับเงิน จึงเติมแบบไม่นับรายรับซ้ำ (isLegacy) · บิลยังคงสถานะจ่ายแล้วไว้เป็นหลักฐาน
  if (action === "to_credit") {
    if (!isFeatureOn(await getSiteConfig(), "memberCredit")) {
      return NextResponse.json({ error: "feature_disabled", feature: "memberCredit" }, { status: 403 });
    }
    if (inv.status !== "paid") {
      return NextResponse.json({ error: "not_paid" }, { status: 400 });
    }
    const amount = Math.max(0, Math.round(inv.total));
    if (!amount) return NextResponse.json({ error: "zero_amount" }, { status: 400 });
    const { topupMemberCredit, listAllMemberTopups } = await import("@/lib/customers-store");
    const marker = `บิล ${inv.id}`;
    const already = (await listAllMemberTopups()).some(
      (t) => t.customerId === inv.customerId && (t.note || "").includes(marker)
    );
    if (already) return NextResponse.json({ error: "already_credited" }, { status: 400 });
    const topup = await topupMemberCredit(inv.customerId, {
      paidAmount: amount,
      isLegacy: true,
      note: `โยกเป็นเครดิตจาก${marker} (ไม่มาใช้บริการ)`,
    });
    if (!topup) return NextResponse.json({ error: "topup_failed" }, { status: 500 });
    await sendTelegram(
      formatBookingTelegram("💰 โยกบิลเป็นเครดิต (ลูกค้าไม่มา)", {
        ลูกค้า: inv.customerName,
        บิล: inv.id,
        เครดิต: `+${amount.toLocaleString()} บาท`,
      })
    );
    return NextResponse.json({ ok: true, amount });
  }

  // 🎁 แลกแต้มแทนลูกค้า → ได้คูปองส่วนลด แล้วหักเข้าบิลนี้ทันที (ไม่ส่งอะไรหาลูกค้า)
  if (action === "redeem_points") {
    if (inv.status === "paid") return NextResponse.json({ error: "บิลปิดแล้ว แลกแต้มเข้าบิลไม่ได้" }, { status: 400 });
    if (!inv.customerId) return NextResponse.json({ error: "บิลนี้ไม่ได้ผูกลูกค้า แลกแต้มไม่ได้" }, { status: 400 });
    const cfg = await getSiteConfig();
    if (!isFeatureOn(cfg, "points")) return NextResponse.json({ error: "ร้านปิดระบบแต้มอยู่" }, { status: 400 });
    const tier = cfg.pointsRewards.find((r) => r.id === String(body.rewardId || ""));
    const value = tier ? rewardDiscountBaht(tier) : 0;
    if (!tier || value <= 0) return NextResponse.json({ error: "รางวัลนี้ไม่ใช่ส่วนลดเงิน" }, { status: 400 });
    const due = Math.max(0, inv.total - (inv.depositReceivedAt ? inv.deposit || 0 : 0));
    if (value > due) {
      return NextResponse.json({ error: `ส่วนลด ${value} ฿ มากกว่ายอดค้าง ${due} ฿` }, { status: 400 });
    }
    const cust = await getCustomer(inv.customerId);
    const red = await redeemReward(
      cust?.lineUserId || "",
      tier.id,
      inv.customerName || cust?.name || "",
      inv.customerId,
      { requireCoupon: true }
    );
    if (!red.ok || !red.couponId) {
      const msg =
        !red.ok && red.error === "insufficient_points"
          ? "แต้มลูกค้าไม่พอ"
          : "แลกแต้มไม่สำเร็จ (ออกคูปองไม่ได้) — ยังไม่ได้หักแต้ม";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const applied = await applyCouponToInvoice(id, red.couponId);
    await logAudit({
      tenantId: requireTenantId(),
      actorType: "tenant",
      actorId: await actorName(req),
      action: "redeem_points_for_bill",
      resourceType: "invoice",
      resourceId: id,
      afterState: {
        ลูกค้า: inv.customerName,
        รางวัล: tier.reward.th,
        แต้มที่ใช้: tier.points,
        ส่วนลด: value,
        แต้มคงเหลือ: red.account.points,
        ใส่บิลแล้ว: applied.ok ? "ใช่" : "ไม่ (คูปองอยู่ในกระเป๋าลูกค้า)",
      },
    });
    await sendTelegram(
      formatBookingTelegram("🎁 แลกแต้มแทนลูกค้า → ส่วนลดบิล", {
        ลูกค้า: inv.customerName,
        รางวัล: tier.reward.th,
        แต้ม: `-${tier.points} (เหลือ ${red.account.points})`,
        บิล: inv.id,
        ยอดใหม่: applied.ok ? `${applied.invoice.total} บาท` : "ใส่บิลไม่ได้",
      })
    );
    if (!applied.ok) {
      // แต้มถูกหักและได้คูปองแล้ว แค่ใส่บิลไม่ผ่าน — คูปองยังอยู่ เลือกใช้ตอนแก้บิลได้
      return NextResponse.json(
        { error: "แลกแต้มแล้ว แต่ใส่ส่วนลดเข้าบิลไม่ได้ — คูปองอยู่ในกระเป๋าลูกค้า เลือกใช้ตอนแก้บิลได้" },
        { status: 400 }
      );
    }
    return NextResponse.json({
      ok: true,
      invoice: applied.invoice,
      amount: applied.amount,
      points: red.account.points,
    });
  }

  // 🎫 เปิดคอร์สให้ใช้ก่อน (ลูกค้ามาใช้ก่อนจ่ายครบ) — ร้านกดเองทีละบิล กติกาปกติยังเหมือนเดิม
  if (action === "grant_courses_early") {
    const res = await grantSoldCoursesEarly(id);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    await logAudit({
      tenantId: requireTenantId(),
      actorType: "tenant",
      actorId: await actorName(req),
      action: "grant_courses_early",
      resourceType: "invoice",
      resourceId: id,
      afterState: { ลูกค้า: inv.customerName, คอร์ส: res.names.join(", ") },
    });
    await sendTelegram(
      formatBookingTelegram("🎫 เปิดคอร์สให้ใช้ก่อน (ยังจ่ายไม่ครบ)", {
        ลูกค้า: inv.customerName,
        คอร์ส: res.names.join(", "),
        บิล: inv.id,
        ยอดบิล: `${inv.total} บาท`,
      })
    );
    return NextResponse.json({ ok: true });
  }

  if (action === "mark_paid") {
    const channel = typeof body.paymentChannel === "string" ? body.paymentChannel.trim().slice(0, 40) : "";
    const result = await markInvoicePaid(id, body.paymentMethod || "transfer", channel || undefined);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const paid = result.invoice!;
    const customer = result.customer;
    await logAudit({
      tenantId: requireTenantId(),
      actorType: "tenant",
      actorId: await actorName(req),
      action: "mark_paid",
      resourceType: "invoice",
      resourceId: id,
      afterState: {
        ลูกค้า: paid.customerName,
        ยอด: paid.total,
        เก็บรอบนี้: result.settleAmount,
        วิธีจ่าย: channel || body.paymentMethod || "transfer",
      },
    });
    // "รับเงินแล้ว" = ปิดบิล + ลงบัญชี + แต้ม — เซิร์ฟเวอร์ไม่ยิงการ์ดเอง
    // ร้านที่เปิด "ถามว่าจะส่งใบเสร็จไหม" (ต้องเปิดเองรายร้าน ไม่เปิด = เหมือนเดิม) → หน้าเว็บถามต่อ กดตกลงค่อยเรียก send_receipt
    // ไม่ขอรีวิวพร้อมกัน (ลูกค้าจ่ายก่อนเข้าพักจะไม่ถูกขอรีวิวตอนจ่ายเงิน)
    const paidNotifyErr: string | undefined = undefined;
    const receiptAsk =
      (await getSiteConfig()).automation?.receiptAskOnPaid === true && !!paid.lineUserId;
    const receiptSentBefore = receiptAsk ? await hasAudit("send_receipt", paid.id) : false;

    const gotDeposit = (result.alreadyReceived || 0) > 0;
    await sendTelegram(
      formatBookingTelegram(
        gotDeposit ? "💰 รับยอดคงเหลือแล้ว (ปิดบิล)" : "💰 รับชำระเงินแล้ว",
        {
          ลูกค้า: paid.customerName,
          น้อง: paid.catName,
          ...(gotDeposit
            ? {
                มัดจำที่รับไปแล้ว: `${result.alreadyReceived} บาท`,
                ยอดคงเหลือรอบนี้: `${result.settleAmount} บาท`,
                รวมทั้งบิล: `${paid.total} บาท`,
              }
            : { ยอด: `${paid.total} บาท` }),
          แต้ม: String(paid.pointsEarned || 0),
        }
      )
    );

    // ── ชวนเพื่อน: จ่ายคูปอง x2 (คนละใบ ตามที่ร้านตั้ง) เมื่อเพื่อน "มาใช้บริการครั้งแรก" ──
    // (ตอนสมัครแค่บันทึก referredBy ไว้ ยังไม่จ่าย เพื่อกันปั๊มบัญชีปลอมรับคูปอง)
    // ร้านปิด "ชวนเพื่อนรับคูปอง" (หรือปิดคูปองทั้งหมด) ในตั้งค่า = ไม่แจกคูปอง
    const refCfg = customer?.referredBy ? await getSiteConfig() : null;
    if (customer?.referredBy && isFeatureOn(refCfg, "referral")) {
      try {
        const reward = referralReward(refCfg);
        const REWARD_TAG = "มาใช้บริการครั้งแรก";
        const mine = await listCustomerCoupons(customer.id);
        // ตั้งแต่ 2026-10-23 คูปองออกทันทีตอนสมัครด้วยโค้ด (reason มีคำว่า "เพื่อนแนะนำ") —
        // ส่วนนี้เหลือไว้จ่ายให้คนที่สมัครผ่านลิงก์ก่อนหน้านั้นและยังไม่เคยได้
        const alreadyRewarded = mine.some(
          (c) => c.reason.includes(REWARD_TAG) || c.reason.includes("เพื่อนแนะนำ")
        );
        if (!alreadyRewarded) {
          const referrer = await getCustomer(customer.referredBy);
          if (referrer && referrer.id !== customer.id) {
            await issueCoupon({
              customerId: customer.id,
              amount: reward.amount,
              reason: `🎁 ${REWARD_TAG} (เพื่อนแนะนำ)`,
              expiresInDays: reward.expiresInDays,
            });
            await issueCoupon({
              customerId: referrer.id,
              amount: reward.amount,
              reason: `🎉 เพื่อนที่คุณชวน (${customer.name}) ${REWARD_TAG}แล้ว`,
              expiresInDays: reward.expiresInDays,
            });
            if (referrer.lineUserId) {
              await pushLineMessage(referrer.lineUserId, [
                await buildReferralRewardCard("visit", reward, await getSiteConfig()),
              ]);
            }
            await sendTelegram(
              formatBookingTelegram(`🎁 ชวนเพื่อนสำเร็จ (จ่ายคูปอง ${reward.amount}฿ x2)`, {
                คนชวน: referrer.name,
                เพื่อนที่ชวนมา: customer.name,
                เหตุ: "เพื่อนมาใช้บริการครั้งแรก",
              })
            );
          }
        }
      } catch (e) {
        console.error("referral reward on first visit failed:", e);
      }
    }

    return NextResponse.json({
      ok: true,
      invoice: paid,
      receiptAsk,
      receiptSentBefore,
      notifyError: paidNotifyErr,
    });
  }

  if (action === "send_member_balance") {
    const customer = await getCustomer(inv.customerId);
    if (!customer?.lineUserId) {
      return NextResponse.json({ error: "no_line" }, { status: 400 });
    }
    await pushLineMessage(customer.lineUserId, [
      buildMemberBalanceFlex({
        customerName: customer.name,
        memberCredit: customer.memberCredit,
      }, (await getSiteConfig()).cards?.memberBalance),
    ]);
    return NextResponse.json({ ok: true });
  }

  // ── รับเงินบางส่วน (จ่ายเป็นงวด) — ลงรายรับตามวันที่รับจริง ยังไม่ปิดบิล ──
  // จ่ายครบเมื่อไหร่ หน้าเว็บจะเรียก mark_paid ต่อ ซึ่งเก็บเฉพาะยอดที่ยังค้าง (เท่ากับ 0) — ไม่ลงซ้ำ
  if (action === "receive_payment") {
    const method = body.paymentMethod === "cash" ? "cash" : "transfer";
    const res = await receiveInvoicePayment(id, Number(body.amount), method);
    if (!res.ok) {
      return NextResponse.json(
        { error: res.error, due: "due" in res ? res.due : undefined },
        { status: 400 }
      );
    }
    await logAudit({
      tenantId: requireTenantId(),
      actorType: "tenant",
      actorId: await actorName(req),
      action: "receive_payment",
      resourceType: "invoice",
      resourceId: id,
      afterState: {
        ลูกค้า: inv.customerName,
        รับรอบนี้: Number(body.amount),
        รับแล้วรวม: res.received,
        คงเหลือ: res.remaining,
        วิธีจ่าย: method,
      },
    });
    await sendTelegram(
      formatBookingTelegram("💵 รับเงินบางส่วน", {
        ลูกค้า: inv.customerName,
        น้อง: inv.catName,
        รับรอบนี้: `${Number(body.amount)} บาท`,
        รับแล้วรวม: `${res.received} บาท`,
        คงเหลือ: `${res.remaining} บาท`,
        บิล: inv.id,
      })
    );
    return NextResponse.json(res);
  }

  // มัดจำที่เรียกเก็บไว้ไปค้างเป็นเครดิตล่วงหน้า → ย้ายเข้าบิลนี้ + นับว่ารับแล้ว (ไม่ต้องกรอกยอด)
  if (action === "apply_deposit_credit") {
    const res = await applyDepositCreditToInvoice(id);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }
    await logAudit({
      tenantId: requireTenantId(),
      actorType: "tenant",
      actorId: await actorName(req),
      action: "apply_deposit_credit",
      resourceType: "invoice",
      resourceId: id,
      afterState: { ลูกค้า: inv.customerName, มัดจำที่หักจากเครดิต: res.deposit, คงเหลือ: res.remaining },
    });
    await sendTelegram(
      formatBookingTelegram("💰 รับมัดจำแล้ว", {
        ลูกค้า: inv.customerName,
        น้อง: inv.catName,
        มัดจำ: `${res.deposit} บาท`,
        คงเหลือ: `${res.remaining} บาท`,
        บิล: inv.id,
      })
    );
    return NextResponse.json(res);
  }

  if (action === "receive_deposit") {
    const res = await receiveInvoiceDeposit(id);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }
    await sendTelegram(
      formatBookingTelegram("💰 รับมัดจำแล้ว", {
        ลูกค้า: inv.customerName,
        น้อง: inv.catName,
        มัดจำ: `${res.deposit} บาท`,
        คงเหลือ: `${res.remaining} บาท`,
        บิล: inv.id,
      })
    );
    // การ์ดขอบคุณ + เงื่อนไข ส่งเฉพาะเมื่อแอดมินกดยืนยันว่า "ส่ง" (notify: true) เท่านั้น
    const rdNotify = body.notify === true;
    await logAudit({
      tenantId: requireTenantId(),
      actorType: "tenant",
      actorId: await actorName(req),
      action: "receive_deposit",
      resourceType: "invoice",
      resourceId: id,
      afterState: {
        ลูกค้า: inv.customerName,
        มัดจำ: res.deposit,
        คงเหลือ: res.remaining,
        ส่งการ์ดขอบคุณ: rdNotify ? (inv.lineUserId ? "ส่ง" : "ไม่มี LINE") : "ไม่ส่ง",
      },
    });
    let rdNotifyErr: string | undefined;
    if (rdNotify && inv.lineUserId) {
      const cfgRd = await getSiteConfig();
      const msgs = cfgRd.messages;
      rdNotifyErr = await notifyCustomer(inv.lineUserId, [
        buildDepositThanksFlex({
          title: msgs.depositThanksTitle,
          body: renderTemplate(msgs.depositThanksBody, {
            name: inv.customerName,
            cat: inv.catName,
            amount: res.deposit.toLocaleString(),
          }),
          terms: msgs.depositTerms || [],
          amount: res.deposit,
        }, cfgRd.cards?.depositThanks),
      ]);
    }
    return NextResponse.json({
      ok: true,
      deposit: res.deposit,
      remaining: res.remaining,
      notifyError: rdNotifyErr,
    });
  }

  // เปลี่ยนวันที่ออกบิล — บิลปิดแล้วก็แก้ได้ (วันที่บนใบเสร็จ/รายรับขยับตาม)
  if (action === "set_issue_date") {
    const res = await setInvoiceIssueDate(id, String(body.issueDate || ""));
    if (!res.ok) {
      return NextResponse.json(
        { error: res.error, message: "message" in res ? res.message : undefined },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, invoice: res.invoice });
  }

  if (action === "update") {
    // แก้บิลแล้วเลือกคอร์สมาหัก (เช่น บิลต่อคืน) — ได้เฉพาะบิลที่ยังไม่ได้หักคอร์สใบไหนมาก่อน
    let addPackageId: string | undefined;
    const addUnits = Math.max(1, Math.round(Number(body.packageUnits) || 1));
    if (body.packageId && !inv.packageId) {
      const bad = await packageProblem(
        String(body.packageId),
        body.items ?? inv.items,
        addUnits,
        await invoiceBranchOf(await getSiteConfig(), inv)
      );
      if (bad) return NextResponse.json({ error: bad }, { status: 400 });
      const used = await consumePackage(String(body.packageId), addUnits).catch(() => null);
      if (!used?.ok) return NextResponse.json({ error: "package_unavailable" }, { status: 400 });
      addPackageId = String(body.packageId);
    }
    const res = await updateInvoice(id, {
      items: body.items,
      catName: typeof body.catName === "string" && body.catName.trim() ? body.catName.trim().slice(0, 200) : undefined,
      deposit: body.deposit,
      extraDiscount: body.extraDiscount,
      promoId: body.promoId,
      couponId: body.couponId ? String(body.couponId) : undefined,
        couponIds: Array.isArray(body.couponIds) ? body.couponIds.map(String) : undefined,
      ...(addPackageId ? { packageId: addPackageId, packageUnits: addUnits } : {}),
      issueDate: typeof body.issueDate === "string" ? body.issueDate : undefined,
    });
    if (!res.ok && addPackageId) await refundPackageUse(addPackageId, addUnits);
    if (!res.ok) {
      return NextResponse.json(
        { error: res.error, message: "message" in res ? res.message : undefined },
        { status: 400 }
      );
    }
    if (res.invoice) notifyBillExtras(res.invoice, inv.items);
    return NextResponse.json({ ok: true, invoice: res.invoice });
  }

  // ผูกบิลเข้ากับนัดด้วยมือ — ใช้ตอนปุ่มส่งการ์ดหาย เพราะบิลไม่มีนัดผูกอยู่
  if (action === "link_booking") {
    const bookingId = String(body.bookingId || "").trim();
    if (!bookingId) {
      return NextResponse.json({ error: "bookingId required" }, { status: 400 });
    }
    // กันกดผิดคน — ผูกได้เฉพาะนัดของลูกค้าเจ้าของบิลเท่านั้น
    // ถ้าผูกข้ามคน การ์ด/ข้อความจะถูกส่งไปหาลูกค้าผิดคนทันที
    const targetBooking = await getBooking(bookingId);
    if (!targetBooking) {
      return NextResponse.json({ error: "booking_not_found" }, { status: 404 });
    }
    const bookingCustomer = await findCustomerForBooking(targetBooking);
    if (
      inv.customerId &&
      bookingCustomer?.id &&
      bookingCustomer.id !== inv.customerId
    ) {
      return NextResponse.json({ error: "customer_mismatch" }, { status: 400 });
    }
    const res = await linkInvoiceToBooking(id, bookingId);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, invoice: res.invoice });
  }

  if (action === "delete") {
    const target = await getInvoice(id);
    const res = await deleteInvoice(id);
    if (!res.ok) {
      return NextResponse.json(
        { error: res.error === "converted_to_credit" ? CONVERTED_MSG : res.error },
        { status: 400 }
      );
    }
    await logAudit({
      tenantId: requireTenantId(),
      actorType: "tenant",
      actorId: await actorName(req),
      action: "delete_invoice",
      resourceType: "invoice",
      resourceId: id,
      afterState: {
        ลูกค้า: target?.customerName,
        ยอด: target?.total,
        สถานะก่อนลบ: target?.status,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "restore") {
    await restoreInvoice(id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

/**
 * บิลมีงานเพิ่มนอกจากค่าห้อง/อาบน้ำตามนัด (เช่น ไถขนก้น+เท้า) → แจ้ง Telegram ให้พนักงานรู้ว่าน้องตัวไหนต้องทำอะไร
 * แก้บิล = แจ้งเฉพาะรายการที่เพิ่งเพิ่มเข้ามา (ไม่แจ้งซ้ำของเดิม) · แจ้งไม่ได้ก็ไม่ขวางการออกบิล
 */
function notifyBillExtras(
  inv: Pick<InvoiceRecord, "customerName" | "catName" | "items" | "bookingId">,
  before?: InvoiceRecord["items"]
) {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const line = (it: InvoiceRecord["items"][number]) => {
    const name = shortItemLabel(it.label);
    const cat = (it.catName || "").trim();
    return `• ${cat ? `${cat}: ` : ""}${name}${(it.qty || 1) > 1 ? ` ×${Math.round(it.qty || 1)}` : ""}`;
  };
  // บิลอาบน้ำล้วน: โปรแกรมอาบน้ำคืองานหลักของนัดอยู่แล้ว ไม่ต้องแจ้ง · บิลเข้าพัก: อาบน้ำ = งานเพิ่ม
  const extras = (items?: InvoiceRecord["items"]) => {
    const list = items || [];
    const stay = list.some((it) => isRoomLine(it));
    return list.filter((it) => isExtraLine(it) && (stay || it.kind !== "grooming")).map(line);
  };
  const had = new Set(extras(before));
  const fresh = Array.from(new Set(extras(inv.items))).filter((l) => !had.has(l));
  if (!fresh.length) return;
  runAfterResponse("bill extras notify", async () => {
    if ((await getSiteConfig()).automation?.billExtras !== true) return;
    const bk = inv.bookingId ? await getBooking(inv.bookingId).catch(() => null) : null;
    const detail: Record<string, string> = {
      ลูกค้า: esc(inv.customerName || "-"),
      น้อง: esc(invoiceCatNames(inv) || "-"),
    };
    if (bk) detail["นัด"] = esc(bookingScheduleText(bk));
    detail["งานเพิ่ม"] = `\n${esc(fresh.join("\n"))}`;
    await sendTelegram(
      formatBookingTelegram(before ? "🧾 แก้บิล — มีงานเพิ่มให้น้อง" : "🧾 ออกบิล — มีงานเพิ่มให้น้อง", detail),
      bk ? { booking: bk } : undefined
    );
  });
}

