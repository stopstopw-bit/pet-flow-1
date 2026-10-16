import { NextRequest, NextResponse } from "next/server";
import { BUSINESS } from "@/lib/business";
import {
  createInvoice,
  getInvoice,
  listInvoices,
  markInvoicePaid,
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
} from "@/lib/invoices-store";
import {
  getCustomer,
  adjustDepositCredit,
  findCustomerForBooking,
} from "@/lib/customers-store";
import { issueCoupon, listCustomerCoupons } from "@/lib/coupons-store";
import { getPaymentConfig } from "@/lib/payment-config";
import { getSiteConfig } from "@/lib/config-store";
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
import { consumePackage, refundPackageUse, getPackage } from "@/lib/packages-store";
import { roomPlanOutstanding } from "@/lib/room-plans-store";
import { getBooking } from "@/lib/bookings-store";
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
import { logAudit } from "@/lib/audit-log";
import { requireTenantId } from "@/lib/tenant-context";

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
      mapsUrl: BUSINESS.maps,
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

  return NextResponse.json({ invoices: await listInvoices(customerId) });
}

/** ใครกดปุ่มนี้ — เอาไว้ลงบันทึกว่าใครทำอะไรกับเงิน */
async function actorName(req: NextRequest): Promise<string> {
  const s = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  return s?.name || s?.role || "ไม่ทราบ";
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
      // คอร์สคืนผูกประเภทห้อง (แพ็กห้องรายเดือน) — หักได้ไม่เกินคืนของห้องประเภทนั้นในบิลนี้
      // กันเอาคืนห้องเล็ก (ราคาถูก) ไปคลุมห้องใหญ่ (ราคาแพง)
      const pk = await getPackage(String(body.packageId));
      // แพ็กห้องรายเดือนต้องจ่ายครบทุกงวดก่อนถึงจะเริ่มใช้คืนได้
      const owed = await roomPlanOutstanding(pk?.planId);
      if (owed > 0) {
        return NextResponse.json(
          { error: `แพ็กนี้ยังค้างจ่าย ${owed.toLocaleString()} บาท — ต้องจ่ายครบก่อนถึงจะใช้คืนได้` },
          { status: 400 }
        );
      }
      if (pk?.unit === "night" && pk.roomType && pk.roomLabel) {
        const items: { label?: string; kind?: string; qty?: number }[] = Array.isArray(body.items)
          ? body.items
          : [];
        const nightsOfRoom = items
          .filter((it) => it.kind === "room" && String(it.label || "").includes(pk.roomLabel!))
          .reduce((n, it) => n + Math.max(1, Math.round(Number(it.qty) || 1)), 0);
        if (nightsOfRoom < packageUnits) {
          return NextResponse.json(
            { error: `คอร์สนี้ใช้ได้กับ${pk.roomLabel}เท่านั้น (บิลนี้มี ${nightsOfRoom} คืน)` },
            { status: 400 }
          );
        }
      }
      // คอร์สอาบน้ำผูกโปรแกรม — หักได้ไม่เกินจำนวนตัวที่อาบโปรแกรมนั้นในบิลนี้
      if (pk && pk.unit !== "night" && pk.groomProgram) {
        const items: { kind?: string; program?: string; qty?: number }[] = Array.isArray(body.items)
          ? body.items
          : [];
        const usesOfProgram = items
          .filter((it) => it.kind === "grooming" && it.program === pk.groomProgram)
          .reduce((n, it) => n + Math.max(1, Math.round(Number(it.qty) || 1)), 0);
        if (usesOfProgram < packageUnits) {
          return NextResponse.json(
            { error: `คอร์สนี้ใช้ได้กับโปรแกรมที่ผูกไว้เท่านั้น (บิลนี้มี ${usesOfProgram} ครั้ง)` },
            { status: 400 }
          );
        }
      }
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
    if (invoice.autoAppliedCredit > 0) {
      await sendTelegram(
        formatBookingTelegram("💰 หักมัดจำล่วงหน้าเข้าบิลอัตโนมัติ", {
          ลูกค้า: invoice.customerName,
          น้องแมว: invoice.catName,
          มัดจำที่หักให้: `${invoice.autoAppliedCredit} บาท`,
          บิล: invoice.id,
          หมายเหตุ: "เคยเรียกเก็บมัดจำไว้ก่อนออกบิล — ระบบหักให้แล้ว",
        })
      );
    }
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
    const catName = customer.cats[0]?.name || "น้องแมว";
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
    if (customer?.lineUserId) {
      const cfgDt = await getSiteConfig();
      const msgs = cfgDt.messages;
      const catName = customer.cats[0]?.name || "น้องแมว";
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

  const base = process.env.NEXT_PUBLIC_APP_URL || "";
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
      paymentMethod:
        inv.paymentMethod === "member_credit"
          ? "Member Credit"
          : inv.paymentMethod === "cash"
            ? "เงินสด"
            : "โอนเงิน",
    }, cfgR.cards?.receipt);
    if (preview) return NextResponse.json({ ok: true, preview: [receiptFlex] });
    await pushLineMessage(inv.lineUserId, [receiptFlex]);
    return NextResponse.json({ ok: true });
  }

  // บิลที่โยกยอดเป็นเครดิตไปแล้ว — ห้ามรับเงินเพิ่ม/ยกเลิกการชำระ/ลบ ไม่งั้นลูกค้าจ่ายซ้ำ หรือได้เครดิตฟรี
  const creditMarker = `บิล ${inv.id}`;
  const isCredited = async () => {
    const { listAllMemberTopups } = await import("@/lib/customers-store");
    return (await listAllMemberTopups()).some(
      (t) => t.customerId === inv.customerId && (t.note || "").includes(creditMarker)
    );
  };
  if (
    ["unmark_paid", "mark_paid", "receive_payment", "receive_deposit", "apply_deposit_credit", "delete"].includes(
      action
    ) &&
    (await isCredited())
  ) {
    return NextResponse.json({ error: "converted_to_credit" }, { status: 400 });
  }

  if (action === "unmark_paid") {
    const res = await revertInvoicePaid(id);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }
    await sendTelegram(
      formatBookingTelegram("↩️ ยกเลิกการชำระ (แก้ไข)", {
        ลูกค้า: inv.customerName,
        น้องแมว: inv.catName,
        บิล: inv.id,
        ยอด: `${inv.total} บาท`,
      })
    );
    return NextResponse.json({ ok: true, invoice: res.invoice });
  }

  // ลูกค้าจ่ายแล้ว (ครบ/มัดจำ/บางส่วน) แต่ไม่มาใช้บริการ (ร้านไม่คืนเงิน) → เก็บยอดที่จ่ายไว้เป็นเครดิต Member
  // เงินก้อนนี้ลงรายรับไปแล้วตอนรับเงิน จึงเติมแบบไม่นับรายรับซ้ำ (isLegacy) · บิลคงสถานะเดิมไว้เป็นหลักฐาน
  if (action === "to_credit") {
    // จ่ายครบ → ทั้งบิล · ยังไม่ปิดแต่รับมัดจำ/จ่ายบางส่วนมาแล้ว → เท่ายอดที่รับมาจริง
    const amount =
      inv.status === "paid"
        ? Math.max(0, Math.round(inv.total))
        : inv.depositReceivedAt
          ? Math.max(0, Math.round(inv.deposit || 0))
          : 0;
    if (!amount) return NextResponse.json({ error: "nothing_received" }, { status: 400 });
    const { topupMemberCredit } = await import("@/lib/customers-store");
    const marker = creditMarker;
    if (await isCredited()) return NextResponse.json({ error: "already_credited" }, { status: 400 });
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

  if (action === "mark_paid") {
    const result = await markInvoicePaid(id, body.paymentMethod || "transfer");
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
        วิธีจ่าย: body.paymentMethod || "transfer",
      },
    });
    // "รับเงินแล้ว" = แค่ปิดบิล + ลงบัญชี + แต้ม (ภายในร้านเท่านั้น) — ไม่ยิงการ์ดหาลูกค้า
    // เคสโรงแรมจ่ายก่อนเข้าพัก ใบเสร็จ/รีวิวต้องแยกกดส่งเอง (ปุ่ม "ส่งใบเสร็จ" / "ขอรีวิว")
    // จะได้ไม่ส่งรีวิวตั้งแต่ยังไม่เข้าพัก
    const paidNotifyErr: string | undefined = undefined;

    const gotDeposit = (result.alreadyReceived || 0) > 0;
    await sendTelegram(
      formatBookingTelegram(
        gotDeposit ? "💰 รับยอดคงเหลือแล้ว (ปิดบิล)" : "💰 รับชำระเงินแล้ว",
        {
          ลูกค้า: paid.customerName,
          น้องแมว: paid.catName,
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

    // ── ชวนเพื่อน: จ่ายคูปอง 100฿ x2 เมื่อเพื่อน "มาใช้บริการครั้งแรก" ──
    // (ตอนสมัครแค่บันทึก referredBy ไว้ ยังไม่จ่าย เพื่อกันปั๊มบัญชีปลอมรับคูปอง)
    if (customer?.referredBy) {
      try {
        const REWARD_TAG = "มาใช้บริการครั้งแรก";
        const mine = await listCustomerCoupons(customer.id);
        const alreadyRewarded = mine.some((c) => c.reason.includes(REWARD_TAG));
        if (!alreadyRewarded) {
          const referrer = await getCustomer(customer.referredBy);
          if (referrer && referrer.id !== customer.id) {
            await issueCoupon({
              customerId: customer.id,
              amount: 100,
              reason: `🎁 ${REWARD_TAG} (เพื่อนแนะนำ)`,
              expiresInDays: 60,
            });
            await issueCoupon({
              customerId: referrer.id,
              amount: 100,
              reason: `🎉 เพื่อนที่คุณชวน (${customer.name}) ${REWARD_TAG}แล้ว`,
              expiresInDays: 60,
            });
            if (referrer.lineUserId) {
              await pushLineMessage(referrer.lineUserId, [
                {
                  type: "text",
                  text: `🎉 เพื่อนที่คุณชวนมาใช้บริการแล้ว!\nคุณได้รับคูปองส่วนลด 100฿ เก็บไว้ในกระเป๋าคูปองแล้วนะคะ 🧡 (ใช้ได้ 60 วัน)`,
                },
              ]);
            }
            await sendTelegram(
              formatBookingTelegram("🎁 ชวนเพื่อนสำเร็จ (จ่ายคูปอง 100฿ x2)", {
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

    return NextResponse.json({ ok: true, invoice: paid, notifyError: paidNotifyErr });
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
        น้องแมว: inv.catName,
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
    await sendTelegram(
      formatBookingTelegram("💰 รับมัดจำแล้ว", {
        ลูกค้า: inv.customerName,
        น้องแมว: inv.catName,
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
        น้องแมว: inv.catName,
        มัดจำ: `${res.deposit} บาท`,
        คงเหลือ: `${res.remaining} บาท`,
        บิล: inv.id,
      })
    );
    // ส่งการ์ดขอบคุณ + เงื่อนไข ให้ลูกค้า
    let rdNotifyErr: string | undefined;
    if (inv.lineUserId) {
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

  if (action === "update") {
    const res = await updateInvoice(id, {
      items: body.items,
      deposit: body.deposit,
      extraDiscount: body.extraDiscount,
      promoId: body.promoId,
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: res.error, message: "message" in res ? res.message : undefined },
        { status: 400 }
      );
    }
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
      return NextResponse.json({ error: res.error }, { status: 400 });
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
