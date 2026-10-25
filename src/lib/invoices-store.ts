import { getSiteConfig } from "./config-store";
import {
  deductMemberCredit,
  restoreMemberCredit,
  findCancelCreditTopup,
  addServiceRecord,
  deleteServiceRecordByInvoice,
  getCustomer,
  adjustDepositCredit,
  recalculateCustomerTier,
} from "./customers-store";
import {
  addFinanceEntry,
  incomeForInvoice,
  deleteFinanceByInvoice,
  deleteInvoicePaymentIncome,
  listFinance,
  attachAdvanceIncomeToInvoice,
} from "./finance-store";
import { calcPromoDiscount, recordAdminPromoClaim } from "./promos-store";
import { getCoupon, redeemCoupon, unredeemCoupon, findCouponByInvoice } from "./coupons-store";
import { addPoints } from "./points-store";
import { getSupabase, selectAllRows } from "./supabase/server";
import { requireTenantId } from "./tenant-context";
import { summarizeInvoiceItems } from "./invoice-item-label";
import { bangkokToday } from "./bangkok-date";
import { normalizeLineDiscount } from "./line-discount";

export type InvoiceItem = {
  label: string;
  /** ยอดรวมของรายการนี้แล้ว (คูณจำนวนแล้ว) */
  amount: number;
  /**
   * ประเภทรายการ — ใช้เช็คว่าบิลนี้มีอาบน้ำ/กรูมรวมอยู่ไหม (แม่นกว่าเดารูปแบบข้อความ)
   * "package" = ขายคอร์ส/เติมเครดิต Member — ไม่ให้แต้ม เพราะยังไม่ใช่การใช้บริการ
   * (ถ้าให้ตรงนี้ ลูกค้าจะได้แต้มสองรอบ: รอบซื้อ กับรอบเอาคอร์สมาใช้)
   */
  kind?: "grooming" | "room" | "service" | "custom" | "freebie" | "package" | "product";
  /** สินค้าหน้าร้าน (kind==="product") — ใช้ตัด/คืนสต็อกตอนออก/แก้/ลบบิล */
  productId?: string;
  /** id โปรแกรมอาบน้ำ (kind==="grooming") — ใช้เช็คคอร์สที่ผูกโปรแกรม */
  program?: string;
  /** ขน/พันธุ์ และไซส์ที่เลือก (kind==="grooming") — ไว้เลือกให้เองครั้งหน้าของน้องตัวเดิม */
  breed?: string;
  size?: string;
  /** น้องแมวตัวไหน — บิลบ้านที่มีหลายตัวจะได้รู้ว่าตัวไหนอาบโปรแกรมอะไร */
  catName?: string;
  /** จำนวนชิ้น (ไม่ใส่ = 1) — ซื้อหลายชิ้นไม่ต้องเพิ่มทีละบรรทัด */
  qty?: number;
  /** ราคาต่อหน่วย (ไม่ใส่ = เท่ากับ amount) — เก็บไว้ให้บิลย้อนหลังอ่านออก */
  unitAmount?: number;
  /** ส่วนลดเฉพาะรายการนี้ (บาท) — amount หักแล้ว, unitAmount ยังเป็นราคาก่อนลด */
  discount?: number;
  /** ส่วนลดเฉพาะรายการนี้แบบ % — ใช้แทน discount */
  discountPercent?: number;
  /** ชื่อโปรลดเฉพาะรายการที่ให้ส่วนลดบรรทัดนี้ */
  discountName?: string;
};

/**
 * ชื่อน้องทุกตัวในบิล — ฟิลด์ catName ของบิลเก็บได้ตัวเดียว (ตัวแรกของบ้าน)
 * แต่บ้านที่มาหลายตัวออกบิลใบเดียว ชื่อจริงอยู่รายบรรทัดในรายการ
 * ใช้กับใบเสร็จ/การ์ด เพื่อไม่ให้ขึ้นชื่อน้องแค่ตัวเดียวทั้งที่มากันหลายตัว
 */
export function invoiceCatNames(inv: {
  catName?: string;
  items?: { catName?: string }[];
}): string {
  // ชื่อในรายการคือตัวที่มาจริง — ถือเป็นข้อมูลหลักเสมอเมื่อมี
  //
  // ห้ามรวมกับ inv.catName เพราะฟิลด์นั้นเก็บ "แมวตัวแรกของบ้าน" ไม่ใช่ตัวที่มา
  // (บ้านมี 3 ตัว มาแค่ 2 ตัว — ถ้ารวมเข้าไปจะมีชื่อตัวที่ไม่ได้มาโผล่ในใบเสร็จ)
  // ใช้ inv.catName เฉพาะบิลที่ไม่ได้ระบุตัวไว้ในรายการเลย
  const itemNames = (inv.items || []).flatMap((it) => (it.catName || "").split(","));
  const source = itemNames.some((n) => n.trim())
    ? itemNames
    : (inv.catName || "").split(",");

  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of source) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.normalize("NFC").replace(/[​-‍﻿\s]/g, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names.join(", ") || inv.catName || "";
}

export type InvoiceRecord = {
  id: string;
  customerId: string;
  lineUserId?: string;
  customerName: string;
  catName: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  /** มัดจำที่รับแล้ว (ยอดคงเหลือ = total - deposit) */
  deposit: number;
  promoId?: string;
  promoLabel?: string;
  total: number;
  status: "pending" | "paid";
  paymentMethod?: "transfer" | "member_credit" | "cash";
  paidAt?: string;
  pointsEarned?: number;
  bookingId?: string;
  /** คอร์สที่บิลนี้หักไป — ไว้โชว์ประวัติการใช้ + คืนให้ตอนยกเลิกบิล */
  packageId?: string;
  /** หักไปกี่หน่วย (คอร์สแบบคืน = จำนวนคืนที่พัก) ไม่ระบุ = 1 */
  packageUnits?: number;
  sentAt?: string;
  createdAt: string;
  /** เวลาที่กด "รับมัดจำแล้ว" (ต้องรัน migration ก่อน) */
  depositReceivedAt?: string;
  /** ลบแบบกู้คืนได้ (soft delete) — ต้องรัน migration ก่อน */
  deletedAt?: string;
};

type InvoiceRow = {
  id: string;
  customer_id: string;
  line_user_id: string | null;
  customer_name: string;
  cat_name: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  deposit: number | null;
  promo_id: string | null;
  promo_label: string | null;
  total: number;
  status: string;
  payment_method: string | null;
  paid_at: string | null;
  points_earned: number | null;
  booking_id: string | null;
  package_id?: string | null;
  package_units?: number | null;
  sent_at: string | null;
  created_at: string;
  deposit_received_at?: string | null;
  deleted_at?: string | null;
};

const mem: InvoiceRecord[] = [];

function rowToInvoice(r: InvoiceRow): InvoiceRecord {
  return {
    id: r.id,
    customerId: r.customer_id,
    lineUserId: r.line_user_id || undefined,
    customerName: r.customer_name,
    catName: r.cat_name,
    items: r.items,
    subtotal: Number(r.subtotal),
    discount: Number(r.discount),
    deposit: Number(r.deposit) || 0,
    promoId: r.promo_id || undefined,
    promoLabel: r.promo_label || undefined,
    total: Number(r.total),
    status: r.status as "pending" | "paid",
    paymentMethod: (r.payment_method as InvoiceRecord["paymentMethod"]) || undefined,
    paidAt: r.paid_at || undefined,
    pointsEarned: r.points_earned ?? undefined,
    bookingId: r.booking_id || undefined,
    packageId: r.package_id || undefined,
    packageUnits: r.package_units ?? undefined,
    sentAt: r.sent_at || undefined,
    createdAt: r.created_at,
    depositReceivedAt: r.deposit_received_at ?? undefined,
    deletedAt: r.deleted_at ?? undefined,
  };
}

function invoiceToRow(inv: InvoiceRecord) {
  return {
    id: inv.id,
    tenant_id: requireTenantId(),
    customer_id: inv.customerId,
    line_user_id: inv.lineUserId || null,
    customer_name: inv.customerName,
    cat_name: inv.catName,
    items: inv.items,
    subtotal: inv.subtotal,
    discount: inv.discount,
    deposit: inv.deposit || 0,
    promo_id: inv.promoId || null,
    promo_label: inv.promoLabel || null,
    total: inv.total,
    status: inv.status,
    payment_method: inv.paymentMethod || null,
    paid_at: inv.paidAt || null,
    points_earned: inv.pointsEarned ?? null,
    booking_id: inv.bookingId || null,
    sent_at: inv.sentAt || null,
    created_at: inv.createdAt,
  };
}

export async function listInvoices(customerId?: string) {
  const sb = getSupabase();
  let list: InvoiceRecord[];
  if (sb) {
    const tenantId = requireTenantId();
    const data = await selectAllRows<InvoiceRow>((from, to) => {
      let q = sb.from("invoices").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false })
        .order("id");
      if (customerId) q = q.eq("customer_id", customerId);
      return q.range(from, to);
    });
    list = data.map(rowToInvoice);
  } else {
    list = customerId ? mem.filter((i) => i.customerId === customerId) : [...mem];
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return list.filter((i) => !i.deletedAt);
}

/** บิลที่ถูกลบ (อยู่ในถังขยะ) — กู้คืนได้ */
export async function listTrashedInvoices() {
  const sb = getSupabase();
  let list: InvoiceRecord[];
  if (sb) {
    const { data } = await sb
      .from("invoices")
      .select("*")
      .eq("tenant_id", requireTenantId())
      .order("created_at", { ascending: false });
    list = ((data as InvoiceRow[] | null) || []).map(rowToInvoice);
  } else {
    list = [...mem];
  }
  return list.filter((i) => i.deletedAt);
}

export async function getInvoice(id: string) {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from("invoices")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", requireTenantId())
      .maybeSingle();
    return data ? rowToInvoice(data as InvoiceRow) : undefined;
  }
  return mem.find((i) => i.id === id);
}

/**
 * รับ "มัดจำล่วงหน้า" ของลูกค้า (ยังไม่ต้องมีบิล เช่น มัดจำคิวอาบน้ำ).
 * บันทึกเป็นรายรับทันที (cash basis) + เพิ่มเครดิตมัดจำให้ลูกค้า เพื่อหักบิลถัดไป.
 */
export async function receiveDepositCredit(
  customerId: string,
  amount: number,
  note?: string,
  method: "transfer" | "cash" = "transfer"
) {
  const amt = Math.max(0, Math.round(amount || 0));
  if (amt <= 0) return { ok: false as const, error: "bad_amount", balance: 0 };
  const c = await getCustomer(customerId);
  if (!c) return { ok: false as const, error: "not_found", balance: 0 };

  await addFinanceEntry({
    type: "income",
    amount: amt,
    category: "มัดจำ",
    description: `${c.name} — รับมัดจำล่วงหน้า${note ? ` (${note})` : ""}`,
    date: bangkokToday(),
    customerId,
  });

  const res = await adjustDepositCredit(customerId, amt);
  return {
    ok: true as const,
    balance: res.balance,
    needSql: !res.ok && res.error === "need_sql",
    method,
    amount: amt,
  };
}

export async function createInvoice(data: {
  customerId: string;
  lineUserId?: string;
  customerName: string;
  catName: string;
  items: InvoiceItem[];
  promoId?: string;
  extraDiscount?: number;
  deposit?: number;
  bookingId?: string;
  /** คอร์สที่บิลนี้หัก 1 ครั้ง — เก็บไว้เพื่อโชว์ประวัติการใช้ + คืนครั้งตอนยกเลิกบิล */
  packageId?: string;
  /** หักคอร์สกี่หน่วย (คอร์สแบบคืน = จำนวนคืนที่พัก) ไม่ระบุ = 1 */
  packageUnits?: number;
  /** คูปองที่เลือกใช้ — ยอดส่วนลดคิดจากคูปองจริงในระบบเสมอ ไม่เชื่อยอดที่ฝั่งหน้าเว็บส่งมา */
  couponId?: string;
}) {
  // ตรวจ + จองสิทธิ์คูปองก่อนเริ่มคิดเงินเลย — ถ้าใช้ไม่ได้ (หมด/ใช้ไปแล้ว/ของคนอื่น)
  // ให้ล้มทั้งการออกบิล ดีกว่าปล่อยให้ออกบิลไปแล้วค่อยพบว่าไม่ได้ลดจริง
  // (เมื่อก่อนคิดส่วนลดจากยอดที่ฝั่งหน้าเว็บส่งมาเฉยๆ แล้วค่อยลองมาร์คคูปองว่าใช้แล้วทีหลัง
  //  ถ้ามาร์คไม่ผ่านก็แค่กลืน error ทิ้ง บิลยังได้ส่วนลดอยู่ดี — คูปองใบเดียวเลยใช้ซ้ำได้ไม่จำกัด)
  // สินค้าหน้าร้านในบิล — เช็คสต็อกก่อนเริ่มอะไรเลย (ยังไม่ได้จองคูปอง/เขียนบิล)
  const { checkBillStock, syncBillStock } = await import("./pos-store");
  const stockCheck = await checkBillStock([], data.items);
  if (!stockCheck.ok) throw new Error(`out_of_stock:${stockCheck.name}:${stockCheck.stock}`);

  let couponAmount = 0;
  if (data.couponId) {
    const coupon = await getCoupon(data.couponId);
    if (
      !coupon ||
      coupon.status !== "active" ||
      (coupon.customerId && coupon.customerId !== data.customerId)
    ) {
      throw new Error("coupon_invalid");
    }
    couponAmount = Math.max(0, Math.round(coupon.amount || 0));
  }
  // บังคับให้ทุกยอดเป็นตัวเลขจำนวนเต็มก่อนคิด — กันค่าที่ไม่ใช่ตัวเลขทำบิลพัง
  // (เมื่อก่อน amount ที่เป็น string จะถูกต่อสตริง เช่น 0 + "abc" = "0abc" แล้ว total กลายเป็น null
  //  ส่วนทศนิยมก็โผล่เป็น 0.30000000000000004 บนบิลลูกค้า)
  // ราคาต่อหน่วย: ถ้าไม่ได้ส่งมา ให้ถอดจากยอดรวม เพื่อให้บิลเก่า (ที่ไม่มี qty) ยังถูกต้อง
  // ส่วนลดเฉพาะรายการคิดจากฟิลด์ discount/discountPercent — เมื่อก่อนคิดแค่ unitAmount × จำนวน
  // ส่วนลดรายการเลยหายตอนออกบิลครั้งแรก ต้องไปแก้บิลอีกรอบ
  const items = (data.items || []).map((i) => normalizeLineDiscount(i));
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const { discount: promoDiscount, label } = await calcPromoDiscount(
    data.promoId,
    subtotal
  );
  const extra = Math.max(0, Math.round(data.extraDiscount || 0)) + couponAmount;
  const discount = Math.min(subtotal, promoDiscount + extra);
  const total = subtotal - discount;

  const invoiceId = `INV${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

  // จองสิทธิ์คูปองตอนนี้เลย (mark used) ก่อนเขียนบิลลงจริง — WHERE status='active' ของ
  // redeemCoupon กันสองคำขอพร้อมกันแย่งใช้คูปองใบเดียวกันสำเร็จทั้งคู่ ถ้าแพ้ race ก็ยังไม่มี
  // บิลถูกสร้างขึ้นมาเลยสักใบ ไม่ต้องมาไล่ลบทีหลัง
  if (data.couponId) {
    const redeemed = await redeemCoupon(data.couponId, invoiceId);
    if (!redeemed.ok) {
      throw new Error("coupon_race");
    }
  }
  let deposit = Math.min(total, Math.max(0, Math.round(data.deposit || 0)));

  // มัดจำที่เคยเรียกเก็บไว้ล่วงหน้า (ยังไม่ผูกบิลไหน — เช่น เรียกเก็บจากหน้าปฏิทินก่อนออกบิล)
  // หักเข้าบิลนี้ให้อัตโนมัติ กันลืมว่าเคยรับมัดจำไปแล้ว
  let autoAppliedCredit = 0;
  if (data.customerId && deposit < total) {
    const customer = await getCustomer(data.customerId);
    const available = customer?.depositCredit || 0;
    if (available > 0) {
      autoAppliedCredit = Math.min(available, total - deposit);
      if (autoAppliedCredit > 0) {
        deposit += autoAppliedCredit;
        await adjustDepositCredit(data.customerId, -autoAppliedCredit);
        // ผูกรายรับมัดจำเดิมที่เคยลงบัญชีไว้แล้วเข้ากับบิลนี้ — กันตอนปิดบิลคิดว่ายังไม่เคย
        // ได้รับส่วนนี้เลย แล้วบันทึกรายรับซ้ำเต็มจำนวนอีกรอบ (เงินไม่ได้เข้าซ้ำ แค่ป้ายเดิมไม่ได้ผูก)
        await attachAdvanceIncomeToInvoice(data.customerId, invoiceId, autoAppliedCredit);
      }
    }
  }

  const invoice: InvoiceRecord = {
    id: invoiceId,
    customerId: data.customerId,
    lineUserId: data.lineUserId,
    customerName: data.customerName,
    catName: data.catName,
    items,
    subtotal,
    discount,
    deposit,
    promoId: data.promoId,
    promoLabel: label,
    total,
    status: "pending",
    bookingId: data.bookingId,
    packageId: data.packageId,
    packageUnits: data.packageUnits && data.packageUnits > 1 ? Math.round(data.packageUnits) : undefined,
    createdAt: new Date().toISOString(),
  };

  try {
    const sb = getSupabase();
    if (sb) {
      const { error } = await sb.from("invoices").insert(invoiceToRow(invoice));
      if (error) throw new Error(error.message);
      // package_id เพิ่งเพิ่มมาทีหลัง — เขียนแยกและกลืน error ไว้
      // เครื่องที่ยังไม่ได้อัปเดตฐานข้อมูลจะได้ไม่พังทั้งการออกบิล
      if (invoice.packageId) {
        try {
          // package_units ก็เพิ่งเพิ่มเหมือนกัน — ลองเขียนคู่กันก่อน
          // ถ้าคอลัมน์ยังไม่มีให้ตกไปเขียนแค่ package_id (บิลยังหักคอร์สได้ปกติ
          // แค่ตอนยกเลิกจะคืนให้ 1 หน่วยตามค่าเริ่มต้น)
          const both = await sb
            .from("invoices")
            .update({ package_id: invoice.packageId, package_units: invoice.packageUnits ?? null })
            .eq("id", invoice.id)
            .eq("tenant_id", requireTenantId());
          if (both.error) {
            await sb
              .from("invoices")
              .update({ package_id: invoice.packageId })
              .eq("id", invoice.id)
              .eq("tenant_id", requireTenantId());
          }
        } catch {
          /* ยังไม่มีคอลัมน์ — ประวัติการใช้คอร์สจะยังไม่ขึ้นจนกว่าจะอัปเดตฐานข้อมูล */
        }
      }
    } else {
      mem.unshift(invoice);
    }
  } catch (e) {
    // เขียนบิลไม่สำเร็จ — คืนสิทธิ์คูปองที่เพิ่งจองไว้ ไม่งั้นคูปองจะถูกเผาทิ้งฟรีๆ
    if (data.couponId) await unredeemCoupon(data.couponId);
    throw e;
  }

  await syncBillStock(invoice.id, [], invoice.items);

  // เลือกโปรจาก dropdown ตอนออกบิล → บันทึกว่าลูกค้าใช้สิทธิ์แล้ว กันเห็นเป็นใช้ได้อีกในแอป
  if (data.promoId && data.customerId) {
    await recordAdminPromoClaim(
      data.promoId,
      data.customerId,
      data.customerName,
      data.lineUserId
    );
  }

  return { ...invoice, autoAppliedCredit };
}

/**
 * รับ "มัดจำ" ของบิลนี้ → บันทึกเป็นรายรับก้อนแรก (ไม่ปิดบิล).
 * ใช้ยอดรายรับที่ลงบัญชีแล้วของบิลเป็นตัวกันบันทึกซ้ำ (ledger-based).
 */
/** บิลที่ยกเลิกนัดแล้วโยกยอดที่รับมาเป็นเครดิตไปแล้ว — ห้ามรับเงินเพิ่มจากนัดที่ยกเลิกไปแล้ว */
const CONVERTED_MSG = "บิลนี้ยกเลิกนัดแล้วเก็บยอดเป็นเครดิตไปแล้ว — รับเงินเพิ่มไม่ได้";

export async function receiveInvoiceDeposit(id: string) {
  const inv = await getInvoice(id);
  if (!inv || inv.status === "paid") return { ok: false as const, error: "invalid" };
  if (await findCancelCreditTopup(id)) return { ok: false as const, error: CONVERTED_MSG };
  const deposit = inv.deposit || 0;
  if (deposit <= 0) return { ok: false as const, error: "no_deposit" };

  const already = await incomeForInvoice(id);
  const toRecord = Math.max(0, deposit - already);
  if (toRecord <= 0) return { ok: false as const, error: "already_received" };

  await addFinanceEntry({
    type: "income",
    amount: toRecord,
    category: "มัดจำ",
    description: `${inv.catName} · ${inv.customerName} — มัดจำ (บิล ${inv.id})`,
    date: bangkokToday(),
    customerId: inv.customerId,
    invoiceId: inv.id,
  });

  // บันทึกสถานะ "รับมัดจำแล้ว" ไว้ที่บิล (ถ้ายังไม่มีคอลัมน์ ก็ไม่พัง)
  const receivedAt = new Date().toISOString();
  const sb = getSupabase();
  if (sb) {
    try {
      await sb
        .from("invoices")
        .update({ deposit_received_at: receivedAt })
        .eq("id", id)
        .eq("tenant_id", requireTenantId());
    } catch {
      /* ยังไม่ได้รัน migration — ข้าม */
    }
  } else {
    const m = mem.find((x) => x.id === id);
    if (m) m.depositReceivedAt = receivedAt;
  }

  return {
    ok: true as const,
    deposit,
    remaining: Math.max(0, inv.total - deposit),
    receivedAt,
  };
}

/** แก้ไขบิล (รายการ/มัดจำ/ส่วนลด) — ได้เฉพาะบิลที่ยังไม่ปิด */
export async function updateInvoice(
  id: string,
  patch: {
    items?: InvoiceItem[];
    deposit?: number;
    extraDiscount?: number;
    promoId?: string;
  }
) {
  const inv = await getInvoice(id);
  if (!inv) return { ok: false as const, error: "not_found" };
  if (inv.status === "paid") return { ok: false as const, error: "already_paid" };

  const items = patch.items ? patch.items.map((i) => normalizeLineDiscount(i)) : inv.items;
  const before = inv.items || [];
  const { checkBillStock, syncBillStock } = await import("./pos-store");
  const stockCheck = await checkBillStock(before, items);
  if (!stockCheck.ok) {
    return {
      ok: false as const,
      error: "out_of_stock",
      message: `${stockCheck.name} เหลือ ${stockCheck.stock} ชิ้น`,
    };
  }
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const promoId = patch.promoId !== undefined ? patch.promoId : inv.promoId;
  const { discount: promoDiscount, label } = await calcPromoDiscount(promoId, subtotal);
  // ไม่ได้ส่งส่วนลดเพิ่มมา = คงส่วนลดเดิมไว้ (ส่วนลดพิเศษ/คูปอง) — เมื่อก่อนตกเป็น 0
  // ทำให้แก้แค่จำนวนคืน (ต่อคืน) แล้วส่วนลดที่ให้ลูกค้าไว้หายไปเงียบๆ
  let keptExtra = 0;
  if (patch.extraDiscount === undefined) {
    const { discount: oldPromo } = await calcPromoDiscount(inv.promoId, inv.subtotal);
    keptExtra = Math.max(0, (inv.discount || 0) - oldPromo);
  }
  const extra = Math.max(0, Math.round(patch.extraDiscount ?? keptExtra));
  const discount = Math.min(subtotal, promoDiscount + extra);
  const total = subtotal - discount;
  const deposit = Math.min(
    total,
    Math.max(0, Math.round(patch.deposit ?? inv.deposit ?? 0))
  );

  inv.items = items;
  inv.subtotal = subtotal;
  inv.discount = discount;
  inv.total = total;
  inv.deposit = deposit;
  inv.promoId = promoId || undefined; // "" = เอาโปรออก
  inv.promoLabel = label;

  const sb = getSupabase();
  if (sb) {
    // บันทึกไม่ลง ต้องบอกหน้าเว็บ — เมื่อก่อนเงียบแล้วขึ้น "แก้ไขบิลแล้ว" ทั้งที่บิลไม่เปลี่ยน
    const { error } = await sb
      .from("invoices")
      .update(invoiceToRow(inv))
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
    if (error) return { ok: false as const, error: "save_failed", message: error.message };
  }
  await syncBillStock(id, before, items);
  return { ok: true as const, invoice: inv };
}

/**
 * ผูกบิลเข้ากับนัดด้วยมือ — ใช้ตอนบิลไม่มีนัดผูกอยู่ (เช่นบิลเก่าก่อนมีระบบผูกอัตโนมัติ
 * หรือพิมพ์บิลเองไม่ได้ดึงจากนัด) ทำให้ปุ่มส่งการ์ดที่ต้องอิงนัด (แจ้งเตือนนัด/ส่งชุดการ์ด)
 * กลับมาใช้ได้ ไม่แตะยอดเงิน จึงทำได้แม้บิลจะปิดจ่ายแล้วก็ตาม
 */
export async function linkInvoiceToBooking(id: string, bookingId: string) {
  const inv = await getInvoice(id);
  if (!inv) return { ok: false as const, error: "not_found" };
  inv.bookingId = bookingId;
  const sb = getSupabase();
  if (sb) {
    await sb
      .from("invoices")
      .update({ booking_id: bookingId })
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
  }
  return { ok: true as const, invoice: inv };
}

/** ลบบิล + รายการบัญชีที่ผูกกับบิลนั้น (ไม่ให้ยอดค้าง) */
/** ลบบิล (ย้ายลงถังขยะ กู้คืนได้) + ลบรายการบัญชีที่ผูก (กู้คืนตอน restore) */
export async function deleteInvoice(id: string) {
  const inv = await getInvoice(id);
  if (!inv) return { ok: false as const, error: "not_found" };
  // บิลที่ยกเลิกนัดแล้วโอนยอดเป็นเครดิตไปแล้ว — ลบบิลจะถอนรายรับ/แต้ม แต่เครดิตยังอยู่ (ได้ฟรี)
  if (await findCancelCreditTopup(id)) {
    return { ok: false as const, error: "converted_to_credit" };
  }

  // ต้องอ่านยอดที่หักเครดิต Member ไปก่อน "ลบรายรับ" ข้างล่าง ไม่งั้นรายการที่ใช้คำนวณ
  // ยอดคืนจะหายไปก่อนอ่านทัน แล้วจะคำนวณได้ 0 เสมอ (คืนเครดิตให้ลูกค้าไม่ได้เลย)
  let memberDeducted = 0;
  if (inv.customerId && inv.status === "paid" && inv.paymentMethod === "member_credit") {
    const all = await listFinance();
    memberDeducted = all
      .filter((r) => r.invoiceId === id && r.category === "member" && r.type === "income")
      .reduce((s, r) => s + r.amount, 0);
  }

  await deleteFinanceByInvoice(id);
  // ลบบิลแล้วต้องหายจากประวัติใช้บริการด้วย — เดิมเหลือแถวค้าง (บิลซ้ำที่ลบไปยังโผล่ในประวัติ)
  await deleteServiceRecordByInvoice(id);

  // สินค้าหน้าร้านในบิล → คืนเข้าสต็อก
  const { syncBillStock } = await import("./pos-store");
  await syncBillStock(id, inv.items, []);

  // ลบบิลที่หักคอร์สไป → คืนสิทธิ์ให้ลูกค้าด้วย ไม่งั้นสิทธิ์หายไปเฉยๆ
  // ไม่เช็คว่าจ่ายแล้วหรือยัง เพราะคอร์สถูกหักตอน "ออกบิล" ไม่ใช่ตอนจ่าย
  // (เดิมเช็ค status==="paid" ทำให้ลบบิลที่ยังไม่จ่าย สิทธิ์ที่หักไปหายเลย)
  if (inv.packageId) {
    const { refundPackageUse } = await import("./packages-store");
    await refundPackageUse(inv.packageId, inv.packageUnits || 1);
  }

  // ลบบิลที่เคยใช้คูปอง → คืนคูปองให้ลูกค้าใช้ใหม่ได้ ไม่งั้นคูปองค้างสถานะ "ใช้แล้ว" ตลอดไป
  // ทั้งที่ส่วนลดของบิลนั้นหายไปพร้อมบิลแล้ว (ต่างจากยกเลิกการชำระ ซึ่งบิล+ส่วนลดยังอยู่
  // จึงห้ามคืนคูปองตรงนั้น ไม่งั้นคูปองเดียวจะเอาไปลดบิลอื่นซ้ำได้อีก)
  const usedCoupon = await findCouponByInvoice(id);
  if (usedCoupon) await unredeemCoupon(usedCoupon.id);

  if (inv.customerId) {
    // ลบบิลที่จ่ายด้วยเครดิต Member ไปแล้ว → คืนเครดิตด้วย (revertInvoicePaid ทำแบบนี้
    // อยู่แล้ว แต่ "ลบ" ตรงๆ ไม่เคยคืนเครดิตเลย ทำให้เครดิตหายฟรีถ้าลบแทนยกเลิกการชำระ)
    if (memberDeducted > 0) await restoreMemberCredit(inv.customerId, memberDeducted);
    // ถอนแต้มที่เคยให้จากบิลนี้ (แบบเดียวกับ revertInvoicePaid) — ลบบิลแทนยกเลิกก็ไม่ควรมีแต้มค้าง
    if (inv.status === "paid" && inv.lineUserId && (inv.pointsEarned || 0) > 0) {
      const { addPoints } = await import("./points-store");
      await addPoints(
        inv.lineUserId,
        -(inv.pointsEarned || 0),
        `ลบบิล ${inv.id}`,
        `Deleted invoice ${inv.id}`,
        inv.customerName
      );
    }
  }
  const now = new Date().toISOString();
  const sb = getSupabase();
  if (sb) {
    try {
      const { error } = await sb
        .from("invoices")
        .update({ deleted_at: now })
        .eq("id", id)
        .eq("tenant_id", requireTenantId());
      if (error) throw new Error(error.message);
    } catch {
      // ยังไม่ได้รัน migration deleted_at → ลบจริงไปเลย (กู้ไม่ได้)
      await sb
        .from("invoices")
        .delete()
        .eq("id", id)
        .eq("tenant_id", requireTenantId());
    }
  } else {
    const i = mem.findIndex((x) => x.id === id);
    if (i >= 0) mem[i].deletedAt = now;
  }
  return { ok: true as const };
}

/** กู้บิลจากถังขยะ */
export async function restoreInvoice(id: string) {
  // กู้บิล → ตัดสต็อกสินค้าหน้าร้านกลับคืน (ตอนลบเคยคืนเข้าสต็อกไว้)
  const trashed = (await listTrashedInvoices()).find((x) => x.id === id);
  if (trashed) {
    const { syncBillStock } = await import("./pos-store");
    await syncBillStock(id, [], trashed.items);
  }
  const sb = getSupabase();
  if (sb) {
    await sb
      .from("invoices")
      .update({ deleted_at: null })
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
  } else {
    const i = mem.findIndex((x) => x.id === id);
    if (i >= 0) mem[i].deletedAt = undefined;
  }
  return { ok: true as const };
}

export async function markInvoiceSent(id: string) {
  const inv = await getInvoice(id);
  if (!inv) return null;
  inv.sentAt = new Date().toISOString();

  const sb = getSupabase();
  if (sb) {
    await sb
      .from("invoices")
      .update({ sent_at: inv.sentAt })
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
  }
  return inv;
}

/**
 * บิลที่กำลังปิดอยู่ในคำขอนี้ — กันกดรับเงินซ้อนกันหลายครั้งพร้อมกัน
 *
 * ระหว่างเช็ค "จ่ายหรือยัง" กับตอนเขียนจริง มี await คั่นอยู่หลายจุด สองคำขอที่เข้ามา
 * พร้อมกันจึงผ่านด่านเช็คไปได้ทั้งคู่ ฝั่ง Supabase มี conditional update กันไว้อีกชั้น
 * แต่โหมดหน่วยความจำ (dev / ต่อฐานข้อมูลไม่ได้) ไม่มีอะไรกัน — กดรัวสามที
 * ก็ลงรายรับสามรอบและแจกแต้มสามรอบ
 */
const payingNow = new Set<string>();

/** บิลทั้งหมดที่ผูกกับนัดเหล่านี้ (ไม่รวมบิลในถังขยะ) */
/**
 * บิลที่ยังเปิดอยู่ของนัดนี้ — นับรวมบิลของ "บ้านเดียวกัน นัดเดียวกัน" ด้วย
 *
 * บิลรวมทั้งบ้านผูก bookingId ไว้แค่ตัวเดียว ถ้าเรียกเก็บมัดจำจากการ์ดของน้องอีกตัว
 * เดิมหาบิลไม่เจอ → มัดจำไปตกเป็นเครดิตล่วงหน้าแทน บิลจริงเลยไม่มีมัดจำ
 * ตอนรับเงินต้องมานั่งกรอกยอดมัดจำซ้ำ
 */
export async function findOpenInvoiceForBooking(bookingId: string) {
  const list = await listInvoices();
  const direct = list.filter((i) => i.bookingId === bookingId);
  const open = direct.find((i) => i.status !== "paid");
  if (open) return open;
  try {
    const { getBooking, listBookingsByCustomerName } = await import("./bookings-store");
    const { bookingGroupKey } = await import("./booking-group");
    const bk = await getBooking(bookingId);
    if (bk) {
      const key = bookingGroupKey(bk);
      const ids = new Set(
        (await listBookingsByCustomerName(bk.customerName))
          .filter((b) => bookingGroupKey(b) === key)
          .map((b) => b.id)
      );
      const groupOpen = list.find(
        (i) => i.status !== "paid" && !!i.bookingId && ids.has(i.bookingId)
      );
      if (groupOpen) return groupOpen;
    }
  } catch {
    /* หานัดไม่เจอ — ใช้เฉพาะบิลที่ผูกตรง */
  }
  return direct[0];
}

/**
 * ย้ายมัดจำที่เรียกเก็บไว้ก่อนมีบิล (เครดิตมัดจำล่วงหน้าของลูกค้า) เข้าบิลนี้ แล้วนับว่า "รับมัดจำแล้ว"
 * ใช้กับบิลที่ออกไปก่อนแล้วแต่มัดจำไปค้างเป็นเครดิต — ไม่ต้องกรอกยอดเอง
 * รายรับ: ถ้าเคยกดรับมัดจำล่วงหน้า (มีรายรับอยู่แล้ว) แค่ผูกเข้าบิล ไม่ลงซ้ำ ไม่งั้นลงรายรับก้อนมัดจำให้
 */
export async function applyDepositCreditToInvoice(id: string) {
  const inv = await getInvoice(id);
  if (!inv || inv.status === "paid") return { ok: false as const, error: "invalid" };
  if ((inv.deposit || 0) > 0) return { ok: false as const, error: "has_deposit" };
  const customer = await getCustomer(inv.customerId);
  const amount = Math.min(inv.total, Math.round(customer?.depositCredit || 0));
  if (amount <= 0) return { ok: false as const, error: "no_credit" };

  await adjustDepositCredit(inv.customerId, -amount);
  await attachAdvanceIncomeToInvoice(inv.customerId, id, amount);
  await updateInvoice(id, { deposit: amount });

  const already = await incomeForInvoice(id);
  if (already < amount) {
    const res = await receiveInvoiceDeposit(id);
    if (!res.ok) return res;
  } else {
    const receivedAt = new Date().toISOString();
    const sb = getSupabase();
    if (sb) {
      try {
        await sb.from("invoices").update({ deposit_received_at: receivedAt }).eq("id", id).eq("tenant_id", requireTenantId());
      } catch {
        /* ยังไม่ได้รัน migration — ข้าม */
      }
    } else {
      const m = mem.find((x) => x.id === id);
      if (m) m.depositReceivedAt = receivedAt;
    }
  }
  return {
    ok: true as const,
    deposit: amount,
    remaining: Math.max(0, inv.total - amount),
  };
}

export async function listInvoicesForBookings(bookingIds: string[]) {
  if (bookingIds.length === 0) return [];
  const sb = getSupabase();
  let list: InvoiceRecord[];
  if (sb) {
    const { data } = await sb.from("invoices").select("*").eq("tenant_id", requireTenantId()).in("booking_id", bookingIds);
    list = ((data as InvoiceRow[] | null) || []).map(rowToInvoice);
  } else {
    list = mem.filter((i) => i.bookingId && bookingIds.includes(i.bookingId));
  }
  return list
    .filter((i) => !i.deletedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** หมวดของรายรับ "รับเงินบางส่วน" — ไม่ถูกลบตอนกด "ยกเลิกการชำระ" เพราะเป็นเงินที่รับมาจริงแล้ว */
export const PARTIAL_PAYMENT_CATEGORY = "รับเงินบางส่วน";

/**
 * รับเงินบางส่วนของบิล (เช่น ลูกค้าพักยาว จ่ายเป็นงวด) — ลงรายรับตามวันที่รับเงินจริง แต่ยังไม่ปิดบิล
 *
 * ไม่คิดเงินซ้ำ: ทุกงวดผูก invoiceId ไว้ ตอนปิดบิล markInvoicePaid จะคิดเฉพาะ
 * "ยอดบิล − เงินที่รับไปแล้วของบิลนี้" และงวดนี้รับได้ไม่เกินยอดที่ยังค้างอยู่
 * ถ้างวดนี้ทำให้จ่ายครบพอดี จะปิดบิลให้เลย (ปิดแล้วไม่ลงรายรับเพิ่ม เพราะไม่มียอดค้าง)
 */
export async function receiveInvoicePayment(
  id: string,
  amount: number,
  paymentMethod: "transfer" | "cash" = "transfer"
) {
  const inv = await getInvoice(id);
  if (!inv || inv.status === "paid") return { ok: false as const, error: "invalid" };
  if (await findCancelCreditTopup(id)) return { ok: false as const, error: CONVERTED_MSG };
  if (payingNow.has(id)) return { ok: false as const, error: "busy" };
  payingNow.add(id);
  try {
    const already = await incomeForInvoice(id);
    const due = Math.max(0, inv.total - already);
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) return { ok: false as const, error: "bad_amount" };
    if (due <= 0) return { ok: false as const, error: "nothing_due" };
    if (amt > due) return { ok: false as const, error: "over_due", due };

    await addFinanceEntry({
      type: "income",
      amount: amt,
      category: PARTIAL_PAYMENT_CATEGORY,
      description: `${inv.catName} · ${inv.customerName} — รับเงินบางส่วน${
        paymentMethod === "cash" ? " (เงินสด)" : ""
      } (บิล ${inv.id})`,
      date: bangkokToday(),
      customerId: inv.customerId,
      invoiceId: inv.id,
    });

    // เก็บยอด "รับแล้ว" ไว้ในช่องมัดจำของบิล — หน้าบิลจะได้โชว์ยอดคงเหลือถูก
    const received = already + amt;
    inv.deposit = Math.min(inv.total, received);
    inv.depositReceivedAt = new Date().toISOString();
    const sb = getSupabase();
    if (sb) {
      await sb.from("invoices").update({ deposit: inv.deposit }).eq("tenant_id", requireTenantId()).eq("id", id);
      try {
        await sb
          .from("invoices")
          .update({ deposit_received_at: inv.depositReceivedAt }).eq("tenant_id", requireTenantId())
          .eq("id", id);
      } catch {
        /* ยังไม่ได้รัน migration — ข้าม */
      }
    } else {
      const m = mem.find((x) => x.id === id);
      if (m) {
        m.deposit = inv.deposit;
        m.depositReceivedAt = inv.depositReceivedAt;
      }
    }
    return {
      ok: true as const,
      received,
      remaining: Math.max(0, inv.total - received),
      fullyPaid: received >= inv.total,
    };
  } finally {
    payingNow.delete(id);
  }
}



export async function markInvoicePaid(
  id: string,
  paymentMethod: "transfer" | "member_credit" | "cash" = "transfer"
) {
  if (payingNow.has(id)) return { ok: false as const, error: "already_paid" };
  if (await findCancelCreditTopup(id)) return { ok: false as const, error: CONVERTED_MSG };
  payingNow.add(id);
  try {
    return await markInvoicePaidInner(id, paymentMethod);
  } finally {
    payingNow.delete(id);
  }
}

async function markInvoicePaidInner(
  id: string,
  paymentMethod: "transfer" | "member_credit" | "cash" = "transfer"
) {
  const inv = await getInvoice(id);
  if (!inv || inv.status === "paid") return { ok: false as const, error: "invalid" };

  // ยอดที่ลงบัญชีไปแล้วของบิลนี้ (เช่น มัดจำที่กดรับไปก่อน) → รอบนี้เก็บแค่ "ที่เหลือจริง"
  const alreadyReceived = await incomeForInvoice(id);
  const settleAmount = Math.max(0, inv.total - alreadyReceived);

  const customer = await getCustomer(inv.customerId);
  if (paymentMethod === "member_credit") {
    if (!customer || customer.memberCredit < settleAmount) {
      return { ok: false as const, error: "insufficient_credit" };
    }
    if (settleAmount > 0) await deductMemberCredit(inv.customerId, settleAmount);
  }

  inv.status = "paid";
  inv.paymentMethod = paymentMethod;
  // บิลที่ดึงมาจากนัด → ลงวันที่ตามวันที่มีคิวจอง ไม่ใช่วันที่กดรับเงิน (ลูกค้าจ่าย/หักเครดิต
  // Member ย้อนหลังได้ แต่รายรับ/ประวัติบริการต้องอยู่ในเดือนที่ใช้บริการจริง)
  // เก็บเวลาจริงของการกดไว้ท้ายวันที่ จะได้เรียงลำดับในวันเดียวกันได้ถูก
  const nowIso = new Date().toISOString();
  inv.paidAt = nowIso;
  if (inv.bookingId) {
    try {
      const { getBooking } = await import("./bookings-store");
      const bk = await getBooking(inv.bookingId);
      const queueDate = (bk?.date || bk?.checkin || "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(queueDate)) {
        inv.paidAt = `${queueDate}T${nowIso.slice(11)}`;
      }
    } catch {
      /* หานัดไม่เจอ — ใช้เวลาที่กดตามเดิม */
    }
  }
  // จ่ายด้วยเครดิต Member ไม่ให้แต้ม — ลูกค้าได้ของแถม/ส่วนลดตอนซื้อเครดิตไปแล้ว
  // ให้แต้มอีกจะเป็นการได้ประโยชน์ซ้ำสองรอบจากเงินก้อนเดียว (ปิดได้ในตั้งค่า)
  const bizCfg = (await getSiteConfig()).business;
  const skipPoints = paymentMethod === "member_credit" && bizCfg.noPointsOnMemberCredit !== false;
  // ยอดที่ขายคอร์ส/เครดิตไม่นับเป็นฐานแต้ม — ลูกค้าจะได้แต้มตอนเอาคอร์สมาใช้บริการแล้ว
  // (และคอร์สแบบเครดิตให้แต้มตอนเติมอยู่แล้ว) ไม่งั้นเงินก้อนเดียวได้แต้มสองรอบ
  const packageSales = (inv.items || [])
    .filter((it) => it.kind === "package")
    .reduce((sum, it) => sum + Math.max(0, it.amount || 0), 0);
  const pointsBase = Math.max(0, inv.total - packageSales);
  inv.pointsEarned = skipPoints ? 0 : Math.floor(pointsBase / bizCfg.pointsRate);

  const sb = getSupabase();
  if (sb) {
    // ปิดบิลแบบมีเงื่อนไข: อัปเดตได้เฉพาะตอนที่ยัง "ไม่ paid" เท่านั้น
    // ถ้าอีกคลิกหนึ่ง (หรืออีกเครื่อง) ปิดไปก่อนแล้ว จะไม่มีแถวถูกแก้ → หยุดตรงนี้
    // ไม่งั้นจะลงรายรับซ้ำ / ให้แต้มซ้ำ / หักเครดิต Member ซ้ำ
    const { data: claimed } = await sb
      .from("invoices")
      .update({
        status: inv.status,
        payment_method: inv.paymentMethod,
        paid_at: inv.paidAt,
        points_earned: inv.pointsEarned,
      })
      .eq("id", id)
      .eq("tenant_id", requireTenantId())
      .neq("status", "paid")
      .select("id");
    if (!claimed || claimed.length === 0) {
      // แพ้การแข่ง — คืนเครดิต Member ที่เพิ่งหักไป แล้วรายงานว่าปิดไปแล้ว
      // (ปรับยอดเฉยๆ ไม่ใช่เติมเงินใหม่ — ไม่งั้นจะขึ้นรายรับปลอมทั้งที่ไม่มีเงินเข้าจริง)
      if (paymentMethod === "member_credit" && settleAmount > 0) {
        await restoreMemberCredit(inv.customerId, settleAmount);
      }
      return { ok: false as const, error: "already_paid" };
    }
  }

  if (inv.lineUserId && inv.pointsEarned > 0) {
    await addPoints(
      inv.lineUserId,
      inv.pointsEarned,
      `ใช้บริการ ${inv.total} บาท`,
      `Service payment ${inv.total} THB`,
      inv.customerName
    );
  }

  // สรุปรายการแบบสั้นๆ ไม่ซ้ำ — ของเดิมต่อ label ดิบทุกรายการเข้าด้วยกัน (มีชื่อน้อง/พันธุ์/ไซส์/ตัวคูณ
  // ห้อยท้ายทุกอัน) พอบิลมีหลายตัว/หลายรายการ ยอดในหน้ารายรับ-รายจ่ายเลยยาวจนอ่านไม่ไหว
  const serviceSummary = summarizeInvoiceItems(inv.items);

  // บันทึกรายรับเฉพาะ "ยอดคงเหลือจริง" ที่เก็บรอบนี้ (มัดจำถูกบันทึกไปก่อนแล้ว)
  //
  // ตัดเครดิต Member ไม่ใช่รายรับ — เงินเข้าร้านไปแล้วตอนลูกค้าซื้อเครดิต
  // (topupMemberCredit ลงรายรับหมวด "member" ให้ตอนนั้น) ถ้าลงอีกรอบตอนใช้
  // ยอดขายจะบวมเป็นสองเท่าของเงินที่รับมาจริง ตอนใช้จึงแค่ตัดหนี้ที่รับล่วงหน้าไว้
  if (settleAmount > 0 && paymentMethod !== "member_credit") {
    const isRemainder = alreadyReceived > 0;
    await addFinanceEntry({
      type: "income",
      amount: settleAmount,
      category: serviceSummary,
      description: `${inv.catName} · ${inv.customerName} — ${serviceSummary}${
        isRemainder ? " (ยอดคงเหลือ)" : ""
      }`,
      date: inv.paidAt.slice(0, 10),
      customerId: inv.customerId,
      invoiceId: inv.id,
    });
  }

  await addServiceRecord({
    customerId: inv.customerId,
    catName: inv.catName,
    service: inv.items.map((i) => i.label).join(", "),
    date: inv.paidAt.slice(0, 10),
    amount: inv.total,
    invoiceId: inv.id,
    bookingId: inv.bookingId,
  });

  const updatedCustomer = await getCustomer(inv.customerId);
  return {
    ok: true as const,
    invoice: inv,
    customer: updatedCustomer,
    settleAmount,
    alreadyReceived,
  };
}

/**
 * ยกเลิกการชำระ (กดผิด) — คืนบิลกลับเป็น "รอชำระ" + ย้อนผลทั้งหมด:
 * ลบรายรับยอดชำระ (คงมัดจำ), คืนแต้ม, คืนเครดิต Member, ลบประวัติบริการ
 */
export async function revertInvoicePaid(id: string) {
  const inv = await getInvoice(id);
  if (!inv || inv.status !== "paid") {
    return { ok: false as const, error: "not_paid" };
  }
  // ยอดบิลนี้ถูกโอนเป็นเครดิต (🔁 ยกเลิกนัด) ไปแล้ว — ต้องยกเลิกรายการเครดิตนั้นก่อน
  // ไม่งั้นรายรับ/แต้มถูกถอน แต่ลูกค้ายังถือเครดิตเท่ายอดบิลอยู่
  if (await findCancelCreditTopup(id)) {
    return { ok: false as const, error: "converted_to_credit" };
  }

  // คืนเครดิต Member ที่หักไป
  if (inv.paymentMethod === "member_credit") {
    // บิลเก่า (ก่อนเลิกลงรายรับซ้ำตอนตัดเครดิต) ยังมีรายรับหมวด "member" ผูก invoiceId อยู่
    // — ใช้ยอดนั้นตรงๆ, บิลใหม่ไม่มีแถวนั้นแล้ว จึงคิดย้อนจาก "ยอดบิล − มัดจำที่รับไปแล้ว"
    // ซึ่งเป็นสูตรเดียวกับตอนหักไป (settleAmount)
    const all = await listFinance();
    const legacyMemberIncome = all
      .filter((r) => r.invoiceId === id && r.category === "member" && r.type === "income")
      .reduce((s, r) => s + r.amount, 0);
    const memberDeducted =
      legacyMemberIncome > 0
        ? legacyMemberIncome
        : Math.max(0, inv.total - (await incomeForInvoice(id)));
    // ปรับยอดเฉยๆ ไม่ใช่เติมเงินใหม่ — addMemberCredit เดิมสร้างรายการเติมเงิน + รายรับปลอม
    // ที่ไม่มี invoiceId ผูกไว้ ทำให้ deleteInvoicePaymentIncome ข้างล่างลบไม่เจอ ค้างอยู่ตลอด
    if (memberDeducted > 0) await restoreMemberCredit(inv.customerId, memberDeducted);
  }

  // ลบรายรับ "ยอดชำระ" (คงรายการมัดจำไว้)
  await deleteInvoicePaymentIncome(id);

  // คืนแต้มที่ได้จากบิลนี้
  if (inv.lineUserId && (inv.pointsEarned || 0) > 0) {
    await addPoints(
      inv.lineUserId,
      -(inv.pointsEarned || 0),
      "ยกเลิกการชำระ (แก้ไข)",
      "Reverse payment",
      inv.customerName
    );
  }

  // ลบประวัติบริการ (กันจำนวนครั้งเกินจริง)
  await deleteServiceRecordByInvoice(id);

  // ไม่คืนสิทธิ์คอร์สที่นี่ — "ยกเลิกการชำระ" แค่ปลดสถานะจ่ายแล้ว บิลยังอยู่และยัง
  // ใช้คอร์สคลุมยอดอยู่ ถ้าคืนตรงนี้แล้วกดรับเงินใหม่ (ซึ่งไม่หักซ้ำ) สิทธิ์จะงอกขึ้นมาฟรี
  // ทุกครั้งที่กดยกเลิก-รับเงินใหม่ · สิทธิ์จะถูกคืนตอน "ลบบิล" ซึ่งเป็นคู่ของการหักตอนออกบิล

  inv.status = "pending";
  inv.paymentMethod = undefined;
  inv.paidAt = undefined;
  inv.pointsEarned = undefined;
  const sb = getSupabase();
  if (sb) {
    await sb
      .from("invoices")
      .update({ status: "pending", payment_method: null, paid_at: null, points_earned: null })
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
  }

  await recalculateCustomerTier(inv.customerId);
  return { ok: true as const, invoice: inv };
}

export async function salesSummary(from?: string, to?: string) {
  const all = await listInvoices();
  const paid = all.filter((i) => {
    if (i.status !== "paid" || !i.paidAt) return false;
    const d = i.paidAt.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
  // ตัดเครดิต Member ไม่ใช่เงินที่เข้าร้านรอบนี้ — รับไปแล้วตอนลูกค้าซื้อเครดิต
  // แยกออกจากยอดขาย แต่ยังรายงานไว้ให้เห็นว่าให้บริการไปเท่าไหร่
  const byCredit = paid.filter((i) => i.paymentMethod === "member_credit");
  const creditTotal = byCredit.reduce((s, i) => s + i.total, 0);
  const grossTotal = paid.reduce((s, i) => s + i.total, 0);
  return {
    /** เงินที่รับเข้ามารอบนี้จริง (ไม่รวมที่ตัดจากเครดิตที่ซื้อไว้ก่อน) */
    total: grossTotal - creditTotal,
    count: paid.length - byCredit.length,
    /** มูลค่าบริการที่ตัดจากเครดิต Member */
    creditTotal,
    creditCount: byCredit.length,
    /** มูลค่าบริการทั้งหมดที่ให้ไป (เงินสด/โอน + ตัดเครดิต) */
    grossTotal,
    pending: all.filter((i) => i.status === "pending").length,
  };
}
