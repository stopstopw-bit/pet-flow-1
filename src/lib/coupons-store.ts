import { getSupabase } from "./supabase/server";
import { requireTenantId } from "./tenant-context";

export type Coupon = {
  id: string;
  code: string;
  customerId?: string;
  amount: number;
  reason: string;
  status: "active" | "used" | "expired" | "cancelled";
  expiresAt?: string;
  usedAt?: string;
  usedInvoiceId?: string;
  offerId?: string;
  createdAt: string;
};

export type CouponOffer = {
  id: string;
  title: string;
  amount: number;
  reason: string;
  validDays: number;
  active: boolean;
  createdAt: string;
};

type CouponRow = {
  id: string;
  code: string | null;
  customer_id: string | null;
  amount: number;
  reason: string | null;
  status: string;
  expires_at: string | null;
  used_at: string | null;
  used_invoice_id: string | null;
  offer_id?: string | null;
  created_at: string;
};

type OfferRow = {
  id: string;
  title: string | null;
  amount: number;
  reason: string | null;
  valid_days: number;
  active: boolean;
  created_at: string;
};

const mem: Coupon[] = [];
const memOffers: CouponOffer[] = [];

function rowToCoupon(r: CouponRow): Coupon {
  return {
    id: r.id,
    code: r.code || "",
    customerId: r.customer_id || undefined,
    amount: Number(r.amount) || 0,
    reason: r.reason || "",
    status: r.status as Coupon["status"],
    expiresAt: r.expires_at || undefined,
    usedAt: r.used_at || undefined,
    usedInvoiceId: r.used_invoice_id || undefined,
    offerId: r.offer_id || undefined,
    createdAt: r.created_at,
  };
}

function rowToOffer(r: OfferRow): CouponOffer {
  return {
    id: r.id,
    title: r.title || "",
    amount: Number(r.amount) || 0,
    reason: r.reason || "",
    validDays: Number(r.valid_days) || 60,
    active: r.active !== false,
    createdAt: r.created_at,
  };
}

function randCode(prefix: string) {
  // เลี่ยง Math.random ไม่ได้ในบางที่ แต่ที่นี่ฝั่งเซิร์ฟเวอร์ปกติ ใช้ได้
  const r = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `${prefix}${r.slice(0, 6)}`;
}

/** ออกคูปองให้ลูกค้า (referral / โปร / แต้ม ฯลฯ) */
export async function issueCoupon(data: {
  customerId: string;
  amount: number;
  reason: string;
  expiresInDays?: number;
  offerId?: string;
}): Promise<Coupon> {
  const now = new Date();
  const expiresAt = data.expiresInDays
    ? new Date(now.getTime() + data.expiresInDays * 86400000).toISOString()
    : undefined;
  const coupon: Coupon = {
    id: `CPN${now.getTime()}${Math.floor(Math.random() * 1000)}`,
    code: randCode("CAT"),
    customerId: data.customerId,
    amount: Math.round(data.amount) || 0,
    reason: data.reason,
    status: "active",
    expiresAt,
    offerId: data.offerId,
    createdAt: now.toISOString(),
  };

  const sb = getSupabase();
  if (sb) {
    const base: Record<string, unknown> = {
      id: coupon.id,
      tenant_id: requireTenantId(),
      code: coupon.code,
      customer_id: coupon.customerId || null,
      amount: coupon.amount,
      reason: coupon.reason || null,
      status: coupon.status,
      expires_at: coupon.expiresAt || null,
      created_at: coupon.createdAt,
    };
    // ใส่ offer_id ถ้ามีคอลัมน์ — ถ้ายังไม่ migrate ก็ลองใหม่แบบไม่มี offer_id
    const { error } = await sb
      .from("coupons")
      .insert((data.offerId ? { ...base, offer_id: data.offerId } : base) as never);
    if (error && data.offerId) {
      await sb.from("coupons").insert(base as never);
    }
  } else {
    mem.unshift(coupon);
  }
  return coupon;
}

function withComputedStatus(c: Coupon): Coupon {
  if (c.status === "active" && c.expiresAt && c.expiresAt < new Date().toISOString()) {
    return { ...c, status: "expired" };
  }
  return c;
}

/** คูปองทั้งหมดของลูกค้า (คำนวณสถานะหมดอายุให้อัตโนมัติ) */
export async function listCustomerCoupons(customerId: string): Promise<Coupon[]> {
  const sb = getSupabase();
  let list: Coupon[];
  if (sb) {
    const { data } = await sb
      .from("coupons")
      .select("*")
      .eq("customer_id", customerId)
      .eq("tenant_id", requireTenantId())
      .order("created_at", { ascending: false });
    list = ((data as CouponRow[] | null) || []).map(rowToCoupon);
  } else {
    list = mem.filter((c) => c.customerId === customerId);
  }
  return list.map(withComputedStatus);
}

/** เฉพาะคูปองที่ใช้ได้ (active + ยังไม่หมดอายุ) */
export async function activeCustomerCoupons(customerId: string): Promise<Coupon[]> {
  return (await listCustomerCoupons(customerId)).filter((c) => c.status === "active");
}

export async function getCoupon(id: string): Promise<Coupon | undefined> {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from("coupons")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", requireTenantId())
      .maybeSingle();
    return data ? withComputedStatus(rowToCoupon(data as CouponRow)) : undefined;
  }
  const c = mem.find((x) => x.id === id);
  return c ? withComputedStatus(c) : undefined;
}

/**
 * ใช้คูปอง (mark used) — ผูกกับบิลที่ใช้
 *
 * เขียนแบบมีเงื่อนไข status='active' อยู่ใน WHERE ของฝั่ง DB เอง (ไม่ใช่แค่เช็คแล้วค่อยเขียนแยกกัน)
 * กันสองคำขอพร้อมกันแย่งใช้คูปองใบเดียวกันสำเร็จทั้งคู่ (race) — เคยเป็นช่องให้คูปองใช้ซ้ำได้
 */
export async function redeemCoupon(id: string, invoiceId?: string) {
  const existing = await getCoupon(id); // คำนวณ expired ให้แล้ว
  if (!existing) return { ok: false as const, error: "not_found" };
  if (existing.status !== "active")
    return { ok: false as const, error: "not_usable", coupon: existing };

  const now = new Date().toISOString();
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from("coupons")
      .update({ status: "used", used_at: now, used_invoice_id: invoiceId || null })
      .eq("id", id)
      .eq("tenant_id", requireTenantId())
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (!data) {
      // มีคำขออื่นแย่งใช้ไปก่อนในเสี้ยววินาทีนี้
      return { ok: false as const, error: "not_usable", coupon: existing };
    }
  } else {
    const m = mem.find((x) => x.id === id);
    if (!m || m.status !== "active")
      return { ok: false as const, error: "not_usable", coupon: existing };
    m.status = "used";
    m.usedAt = now;
    m.usedInvoiceId = invoiceId;
  }
  return {
    ok: true as const,
    coupon: { ...existing, status: "used" as const, usedAt: now, usedInvoiceId: invoiceId },
  };
}

/** หาคูปองที่ใช้กับบิลใบนี้ — ใช้ตอนยกเลิก/ลบบิล จะได้คืนคูปองให้ลูกค้าใช้ใหม่ได้ */
export async function findCouponByInvoice(invoiceId: string): Promise<Coupon | undefined> {
  if (!invoiceId) return undefined;
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from("coupons")
      .select("*")
      .eq("used_invoice_id", invoiceId)
      .eq("tenant_id", requireTenantId())
      .maybeSingle();
    return data ? rowToCoupon(data as CouponRow) : undefined;
  }
  return mem.find((x) => x.usedInvoiceId === invoiceId);
}

/** คืนคูปองกลับมาใช้ได้ (เช่นลบบิลที่ใช้คูปองไป) */
export async function unredeemCoupon(id: string) {
  const sb = getSupabase();
  if (sb) {
    await sb
      .from("coupons")
      .update({ status: "active", used_at: null, used_invoice_id: null })
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
  } else {
    const m = mem.find((x) => x.id === id);
    if (m) {
      m.status = "active";
      m.usedAt = undefined;
      m.usedInvoiceId = undefined;
    }
  }
}

/** ยกเลิกคูปอง (หลังบ้าน) — set สถานะ cancelled */
export async function cancelCoupon(id: string) {
  const sb = getSupabase();
  if (sb) {
    await sb
      .from("coupons")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
  } else {
    const m = mem.find((x) => x.id === id);
    if (m) m.status = "cancelled";
  }
  return { ok: true as const };
}

/** คูปองทั้งหมด (หลังบ้าน) */
export async function listAllCoupons(): Promise<Coupon[]> {
  const sb = getSupabase();
  let list: Coupon[];
  if (sb) {
    const { data } = await sb
      .from("coupons")
      .select("*")
      .eq("tenant_id", requireTenantId())
      .order("created_at", { ascending: false });
    list = ((data as CouponRow[] | null) || []).map(rowToCoupon);
  } else {
    list = [...mem];
  }
  return list.map(withComputedStatus);
}

// ───────── แคมเปญคูปอง (Offer) — การ์ดกดรับ ─────────

export async function createOffer(data: {
  title: string;
  amount: number;
  reason?: string;
  validDays?: number;
}): Promise<CouponOffer> {
  const offer: CouponOffer = {
    id: `OFR${Date.now()}${Math.floor(Math.random() * 1000)}`,
    title: data.title,
    amount: Math.round(data.amount) || 0,
    reason: data.reason || data.title,
    validDays: Math.max(1, Number(data.validDays) || 60),
    active: true,
    createdAt: new Date().toISOString(),
  };
  const sb = getSupabase();
  if (sb) {
    await sb.from("coupon_offers").insert({
      id: offer.id,
      tenant_id: requireTenantId(),
      title: offer.title,
      amount: offer.amount,
      reason: offer.reason,
      valid_days: offer.validDays,
      active: true,
      created_at: offer.createdAt,
    });
  } else {
    memOffers.unshift(offer);
  }
  return offer;
}

export async function listOffers(): Promise<CouponOffer[]> {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from("coupon_offers")
      .select("*")
      .eq("tenant_id", requireTenantId())
      .order("created_at", { ascending: false });
    return ((data as OfferRow[] | null) || []).map(rowToOffer);
  }
  return [...memOffers];
}

export async function getOffer(id: string): Promise<CouponOffer | undefined> {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from("coupon_offers")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", requireTenantId())
      .maybeSingle();
    return data ? rowToOffer(data as OfferRow) : undefined;
  }
  return memOffers.find((o) => o.id === id);
}

export async function setOfferActive(id: string, active: boolean) {
  const sb = getSupabase();
  if (sb) {
    await sb
      .from("coupon_offers")
      .update({ active })
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
  } else {
    const o = memOffers.find((x) => x.id === id);
    if (o) o.active = active;
  }
  return { ok: true as const };
}

/** ลูกค้ากดรับคูปองจากแคมเปญ — ออกให้ครั้งเดียวต่อคน */
export async function claimOffer(offerId: string, customerId: string) {
  const offer = await getOffer(offerId);
  if (!offer) return { ok: false as const, error: "offer_not_found" };
  if (!offer.active) return { ok: false as const, error: "offer_closed" };

  // เคยรับไปแล้วหรือยัง
  const mine = await listCustomerCoupons(customerId);
  const already = mine.find((c) => c.offerId === offerId);
  if (already) return { ok: false as const, error: "already_claimed", coupon: already };

  const coupon = await issueCoupon({
    customerId,
    amount: offer.amount,
    reason: offer.title || offer.reason || "คูปองส่วนลด",
    expiresInDays: offer.validDays,
    offerId,
  });
  return { ok: true as const, coupon };
}
