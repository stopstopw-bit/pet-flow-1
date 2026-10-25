import {
  customerSummary,
  findCustomerByLine,
  getCustomer,
  type CustomerRecord,
} from "./customers-store";
import { addPoints } from "./points-store";
import { getSupabase } from "./supabase/server";
import { seedEnabled } from "./demo-seed";
import { requireTenantId } from "./tenant-context";

export type PromoKind = "display" | "customer";
export type PromoRestriction = "none" | "first_visit" | "calendar_month";
export type CustomerTier = "all" | "member" | "new" | "returning" | (string & {});
export type PromoRewardType = "discount" | "points" | "both";

export type PromoRecord = {
  id: string;
  title: { th: string; en: string };
  body: { th: string; en: string };
  discountPercent?: number;
  discountAmount?: number;
  imageUrl?: string;
  startDate: string;
  /** วันสิ้นสุด — เว้นว่าง = ไม่มีวันหมดอายุ */
  until: string;
  active: boolean;
  kind: PromoKind;
  restriction: PromoRestriction;
  validMonth?: string;
  tiers: CustomerTier[];
  couponCode?: string;
  rewardType: PromoRewardType;
  pointsBonus?: number;
  pointsMultiplier?: number;
};

export type PromoClaimRecord = {
  id: string;
  promoId: string;
  customerId: string;
  lineUserId?: string;
  customerName: string;
  promoTitle: string;
  source: "app" | "admin";
  pointsAwarded?: number;
  createdAt: string;
};

export type CustomerPromoView = PromoRecord & {
  claimed: boolean;
  eligible: boolean;
  reason?: string;
  claimedAt?: string;
};

type PromoRow = {
  id: string;
  title_th: string;
  title_en: string;
  body_th: string;
  body_en: string;
  discount_percent: number | null;
  discount_amount: number | null;
  image_url: string | null;
  start_date: string;
  until: string;
  active: boolean;
  kind?: string | null;
  restriction?: string | null;
  valid_month?: string | null;
  tiers?: string[] | null;
  coupon_code?: string | null;
  reward_type?: string | null;
  points_bonus?: number | null;
  points_multiplier?: number | null;
};

type PromoClaimRow = {
  id: string;
  promo_id: string;
  customer_id: string;
  line_user_id: string | null;
  customer_name: string;
  promo_title: string;
  source: string;
  points_awarded?: number | null;
  created_at: string;
};

const DEMO_PROMOS: PromoRecord[] = [
  {
    id: "P1",
    title: { th: "สมาชิกใหม่ รับแต้ม x2", en: "New member double points" },
    body: {
      th: "จองครั้งแรกรับแต้มสะสม 2 เท่า 🧡",
      en: "First booking earns 2x loyalty points 🧡",
    },
    startDate: "2026-01-01",
    until: "2026-08-31",
    active: true,
    kind: "display",
    restriction: "none",
    tiers: ["all"],
    rewardType: "points",
    pointsMultiplier: 2,
  },
  {
    id: "P2",
    title: { th: "พัก 7 คืนขึ้นไป ฟรีกล้อง CCTV", en: "7+ nights free CCTV" },
    body: {
      th: "ห้อง MiNi Meow / Mid Cozy / Cat Tower รับฟรีกล้องวงจรปิด",
      en: "MiNi Meow, Mid Cozy & Cat Tower — free CCTV for 7+ nights",
    },
    startDate: "2026-01-01",
    until: "2026-12-31",
    active: true,
    kind: "display",
    restriction: "none",
    tiers: ["all"],
    rewardType: "discount",
  },
  {
    id: "PC1",
    title: { th: "โปรต้อนรับลูกค้าใหม่", en: "Welcome offer" },
    body: {
      th: "ลูกค้าใหม่กดรับโปร ได้แต้มโบนัส 20 แต้มทันที",
      en: "New customers claim 20 bonus points instantly",
    },
    startDate: "2026-01-01",
    until: "2026-12-31",
    active: true,
    kind: "customer",
    restriction: "first_visit",
    tiers: ["new"],
    couponCode: "WELCOME20",
    rewardType: "points",
    pointsBonus: 20,
  },
];

// โปรตัวอย่างขึ้นเฉพาะตอนพัฒนา — เครื่องที่ยังไม่ต่อฐานข้อมูลจะได้เริ่มจากศูนย์จริง ๆ
const mem: PromoRecord[] = seedEnabled() ? [...DEMO_PROMOS] : [];

const memClaims: PromoClaimRecord[] = [];

function normalizeTiers(tiers?: string[] | null): CustomerTier[] {
  const list = (tiers || []).filter(Boolean) as CustomerTier[];
  return list.length ? list : ["all"];
}

function rowToPromo(r: PromoRow): PromoRecord {
  return {
    id: r.id,
    title: { th: r.title_th, en: r.title_en },
    body: { th: r.body_th, en: r.body_en },
    discountPercent: r.discount_percent ?? undefined,
    discountAmount: r.discount_amount ?? undefined,
    imageUrl: r.image_url ?? undefined,
    startDate: r.start_date,
    until: r.until,
    active: r.active,
    kind: (r.kind as PromoKind) || "display",
    restriction: (r.restriction as PromoRestriction) || "none",
    validMonth: r.valid_month ?? undefined,
    tiers: normalizeTiers(r.tiers),
    couponCode: r.coupon_code ?? undefined,
    rewardType: (r.reward_type as PromoRewardType) || "discount",
    pointsBonus: r.points_bonus ?? undefined,
    pointsMultiplier: r.points_multiplier != null ? Number(r.points_multiplier) : undefined,
  };
}

function promoToRow(p: PromoRecord) {
  return {
    id: p.id,
    tenant_id: requireTenantId(),
    title_th: p.title.th,
    title_en: p.title.en,
    body_th: p.body.th,
    body_en: p.body.en,
    discount_percent: p.discountPercent ?? null,
    discount_amount: p.discountAmount ?? null,
    image_url: p.imageUrl ?? null,
    start_date: p.startDate,
    until: p.until,
    active: p.active,
    kind: p.kind,
    restriction: p.restriction,
    valid_month: p.validMonth ?? null,
    tiers: p.tiers,
    coupon_code: p.couponCode ?? null,
    reward_type: p.rewardType,
    points_bonus: p.pointsBonus ?? null,
    points_multiplier: p.pointsMultiplier ?? null,
  };
}

function rowToClaim(r: PromoClaimRow): PromoClaimRecord {
  return {
    id: r.id,
    promoId: r.promo_id,
    customerId: r.customer_id,
    lineUserId: r.line_user_id ?? undefined,
    customerName: r.customer_name,
    promoTitle: r.promo_title,
    source: r.source as PromoClaimRecord["source"],
    pointsAwarded: r.points_awarded ?? undefined,
    createdAt: r.created_at,
  };
}

function claimToRow(c: PromoClaimRecord) {
  return {
    id: c.id,
    tenant_id: requireTenantId(),
    promo_id: c.promoId,
    customer_id: c.customerId,
    line_user_id: c.lineUserId ?? null,
    customer_name: c.customerName,
    promo_title: c.promoTitle,
    source: c.source,
    points_awarded: c.pointsAwarded ?? null,
    created_at: c.createdAt,
  };
}

export { promoRewardLabel } from "./promo-format";

function currentMonth(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

export function customerTierLabels(
  customer: Pick<CustomerRecord, "tier" | "isMember">,
  visits: number
): { id: string; label: string }[] {
  const tiers: { id: string; label: string }[] = [];
  if (customer.tier) tiers.push({ id: customer.tier, label: customer.tier });
  if (customer.isMember && customer.tier !== "member") {
    tiers.push({ id: "member", label: "💎 Member" });
  }
  if (visits === 0) tiers.push({ id: "new", label: "ลูกค้าใหม่" });
  else tiers.push({ id: "returning", label: "ลูกค้าเก่า" });
  return tiers;
}

export function customerMatchesTiers(
  customer: CustomerRecord,
  visits: number,
  tiers: CustomerTier[]
): boolean {
  if (!tiers.length || tiers.includes("all")) return true;
  for (const tier of tiers) {
    if (tier === "member" && (customer.isMember || customer.tier === "member")) return true;
    if (tier === "new" && (visits === 0 || customer.tier === "new")) return true;
    if (tier === "returning" && visits > 0) return true;
    if (tier === "regular" && customer.tier === "regular") return true;
    if (tier === "vip" && customer.tier === "vip") return true;
    if (String(tier).toLowerCase() === String(customer.tier).toLowerCase()) return true;
  }
  return false;
}

export function checkPromoEligibility(
  promo: PromoRecord,
  customer: CustomerRecord,
  visits: number,
  claimed: boolean,
  now = new Date()
): { eligible: boolean; reason?: string } {
  const today = now.toISOString().slice(0, 10);

  if (!promo.active) return { eligible: false, reason: "โปรนี้ปิดใช้งานแล้ว" };
  if (promo.startDate > today) return { eligible: false, reason: "โปรยังไม่เริ่ม" };
  // ไม่ระบุวันสิ้นสุด = ใช้ได้เรื่อยๆ จนกว่าจะปิดโปรเอง
  if (promo.until && promo.until < today)
    return { eligible: false, reason: "โปรหมดอายุแล้ว" };

  if (promo.restriction === "calendar_month" && promo.validMonth) {
    if (currentMonth(now) !== promo.validMonth) {
      return { eligible: false, reason: `โปรนี้ใช้ได้เฉพาะเดือน ${promo.validMonth}` };
    }
  }

  if (promo.restriction === "first_visit" && visits > 0) {
    return { eligible: false, reason: "โปรนี้สำหรับลูกค้าใหม่เท่านั้น" };
  }

  if (!customerMatchesTiers(customer, visits, promo.tiers)) {
    return { eligible: false, reason: "โปรนี้ไม่ตรงกับกลุ่มลูกค้าของคุณ" };
  }

  if (claimed) {
    return { eligible: false, reason: "คุณใช้โปรนี้แล้ว" };
  }

  return { eligible: true };
}

/**
 * หาโปรส่วนลดที่ดีที่สุดที่ลูกค้าคนนี้ใช้ได้ (สำหรับหน้าคิดเงิน — ตัดอัตโนมัติ)
 * คืน null ถ้าไม่มีโปรที่ใช้ได้
 */
export async function getBestPromoForCustomer(
  customerId: string,
  subtotal: number,
  now = new Date()
): Promise<{
  id: string;
  label: string;
  discount: number;
  discountPercent?: number;
  discountAmount?: number;
} | null> {
  const customer = await getCustomer(customerId);
  if (!customer) return null;

  const summary = await customerSummary(customerId);
  const visits = summary?.visits ?? 0;
  const promos = await getActivePromos(now);

  let best: {
    id: string;
    label: string;
    discount: number;
    discountPercent?: number;
    discountAmount?: number;
  } | null = null;

  for (const promo of promos) {
    if (!promo.discountPercent && !promo.discountAmount) continue;
    const claim = await getClaimForCustomer(promo.id, customerId);
    const { eligible } = checkPromoEligibility(
      promo,
      customer,
      visits,
      Boolean(claim),
      now
    );
    if (!eligible) continue;

    let discount = 0;
    if (promo.discountPercent)
      discount = Math.round((subtotal * promo.discountPercent) / 100);
    if (promo.discountAmount) discount = Math.max(discount, promo.discountAmount);
    discount = Math.min(discount, subtotal);

    if (!best || discount > best.discount) {
      best = {
        id: promo.id,
        label: promo.title.th,
        discount,
        discountPercent: promo.discountPercent,
        discountAmount: promo.discountAmount,
      };
    }
  }

  return best;
}

/**
 * ลูกค้าคนนี้ใช้โปรไหนไม่ได้บ้าง (เหตุผล) — หน้าออกบิลเตือนตอนพนักงานเลือกโปรเอง
 * คืนเฉพาะโปรที่ใช้ไม่ได้: { [promoId]: เหตุผล }
 */
export async function promoBlockReasons(
  customerId: string,
  now = new Date()
): Promise<Record<string, string>> {
  const customer = await getCustomer(customerId);
  if (!customer) return {};
  const visits = (await customerSummary(customerId))?.visits ?? 0;
  const out: Record<string, string> = {};
  for (const promo of await listPromos()) {
    const claim = await getClaimForCustomer(promo.id, customerId);
    const { eligible, reason } = checkPromoEligibility(promo, customer, visits, Boolean(claim), now);
    if (!eligible) out[promo.id] = (reason || "ลูกค้าคนนี้ใช้โปรนี้ไม่ได้").replace("ของคุณ", "ของลูกค้าคนนี้").replace("คุณใช้", "ลูกค้าคนนี้ใช้");
  }
  return out;
}

export async function listPromoClaims(promoId?: string) {
  const sb = getSupabase();
  if (sb) {
    let q = sb
      .from("promo_claims")
      .select("*")
      .eq("tenant_id", requireTenantId())
      .order("created_at", { ascending: false });
    if (promoId) q = q.eq("promo_id", promoId);
    const { data } = await q;
    return ((data as PromoClaimRow[] | null) || []).map(rowToClaim);
  }
  const list = [...memClaims].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return promoId ? list.filter((c) => c.promoId === promoId) : list;
}

async function getClaimForCustomer(promoId: string, customerId: string) {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from("promo_claims")
      .select("*")
      .eq("promo_id", promoId)
      .eq("customer_id", customerId)
      .eq("tenant_id", requireTenantId())
      .maybeSingle();
    return data ? rowToClaim(data as PromoClaimRow) : undefined;
  }
  return memClaims.find((c) => c.promoId === promoId && c.customerId === customerId);
}

export async function listPromos() {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from("promos")
      .select("*")
      .eq("tenant_id", requireTenantId())
      .order("until", { ascending: false });
    return ((data as PromoRow[] | null) || []).map(rowToPromo);
  }
  return [...mem].sort((a, b) => (b.until || "9999-12-31").localeCompare(a.until || "9999-12-31"));
}

export async function getActivePromos(now = new Date(), kind?: PromoKind) {
  const today = now.toISOString().slice(0, 10);
  const all = await listPromos();
  return all.filter(
    (p) =>
      p.active &&
      p.startDate <= today &&
      (!p.until || p.until >= today) &&
      (kind ? p.kind === kind : true)
  );
}

export async function getCustomerPromos(lineUserId: string, now = new Date()): Promise<CustomerPromoView[]> {
  const customer = await findCustomerByLine(lineUserId);
  if (!customer) return [];

  const summary = await customerSummary(customer.id);
  const visits = summary?.visits ?? 0;
  const promos = await getActivePromos(now, "customer");

  const views: CustomerPromoView[] = [];
  for (const promo of promos) {
    const claim = await getClaimForCustomer(promo.id, customer.id);
    const { eligible, reason } = checkPromoEligibility(
      promo,
      customer,
      visits,
      Boolean(claim),
      now
    );
    // ลูกค้าเห็นเฉพาะโปรที่ใช้ได้จริง (หรือเคยกดใช้แล้ว) — ไม่โชว์โปรที่ใช้ไม่ได้ให้เกะกะ
    if (!eligible && !claim) continue;

    views.push({
      ...promo,
      claimed: Boolean(claim),
      eligible,
      reason,
      claimedAt: claim?.createdAt,
    });
  }

  return views;
}

/**
 * บันทึกว่าลูกค้าใช้สิทธิ์โปรนี้ไปแล้ว — เรียกจากตอนออกบิลที่พนักงานเลือกโปรจาก dropdown เอง
 * (ต่างจาก claimCustomerPromo ที่ลูกค้ากดใช้เองในแอป) ไม่เช็คเงื่อนไขซ้ำและไม่แจกแต้มโบนัส
 * เพราะส่วนลด/แต้มจากยอดบิลคำนวณให้ในบิลอยู่แล้ว — แค่กันไม่ให้เห็นว่ายังใช้ได้อีกในแอป
 */
export async function recordAdminPromoClaim(
  promoId: string,
  customerId: string,
  customerName: string,
  lineUserId?: string
) {
  const existing = await getClaimForCustomer(promoId, customerId);
  if (existing) return existing;

  const promo = await getPromo(promoId);
  const claim: PromoClaimRecord = {
    id: `CL${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    promoId,
    customerId,
    lineUserId,
    customerName,
    promoTitle: promo?.title.th || promoId,
    source: "admin",
    createdAt: new Date().toISOString(),
  };

  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("promo_claims").insert(claimToRow(claim));
    if (error) return undefined;
  } else {
    memClaims.unshift(claim);
  }
  return claim;
}

export async function claimCustomerPromo(
  promoId: string,
  lineUserId: string,
  source: PromoClaimRecord["source"] = "app"
): Promise<
  | { ok: true; claim: PromoClaimRecord; promo: PromoRecord; pointsAwarded: number; newPoints?: number }
  | { ok: false; error: string }
> {
  const customer = await findCustomerByLine(lineUserId);
  if (!customer) return { ok: false, error: "ไม่พบข้อมูลลูกค้า — เปิดแอปจาก LINE อีกครั้ง" };

  const promo = await getPromo(promoId);
  if (!promo || promo.kind !== "customer") {
    return { ok: false, error: "ไม่พบโปรนี้" };
  }

  const summary = await customerSummary(customer.id);
  const visits = summary?.visits ?? 0;
  const existing = await getClaimForCustomer(promoId, customer.id);
  const { eligible, reason } = checkPromoEligibility(
    promo,
    customer,
    visits,
    Boolean(existing)
  );

  if (!eligible) return { ok: false, error: reason || "ใช้โปรนี้ไม่ได้" };

  const pointsAwarded =
    promo.rewardType === "points" || promo.rewardType === "both"
      ? Math.max(0, promo.pointsBonus || 0)
      : 0;

  const claim: PromoClaimRecord = {
    id: `CL${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    promoId,
    customerId: customer.id,
    lineUserId,
    customerName: customer.name,
    promoTitle: promo.title.th,
    source,
    pointsAwarded: pointsAwarded || undefined,
    createdAt: new Date().toISOString(),
  };

  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("promo_claims").insert(claimToRow(claim));
    if (error) return { ok: false, error: "บันทึกไม่สำเร็จ — อาจใช้โปรนี้แล้ว" };
  } else {
    memClaims.unshift(claim);
  }

  let newPoints: number | undefined;
  if (pointsAwarded > 0) {
    const acc = await addPoints(
      lineUserId,
      pointsAwarded,
      `โปร: ${promo.title.th}`,
      `Promo: ${promo.title.en}`,
      customer.name
    );
    newPoints = acc.points;
  }

  return { ok: true, claim, promo, pointsAwarded, newPoints };
}

export async function getPromo(id: string) {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from("promos")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", requireTenantId())
      .maybeSingle();
    return data ? rowToPromo(data as PromoRow) : undefined;
  }
  return mem.find((p) => p.id === id);
}

export async function addPromo(data: Omit<PromoRecord, "id">) {
  const promo: PromoRecord = {
    ...data,
    id: `P${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    kind: data.kind || "display",
    restriction: data.restriction || "none",
    tiers: data.tiers?.length ? data.tiers : ["all"],
    rewardType: data.rewardType || "discount",
  };
  const sb = getSupabase();
  if (sb) {
    await sb.from("promos").insert(promoToRow(promo));
    return promo;
  }
  mem.unshift(promo);
  return promo;
}

export async function updatePromo(id: string, patch: Partial<Omit<PromoRecord, "id">>) {
  const existing = await getPromo(id);
  if (!existing) return null;
  const updated = { ...existing, ...patch };
  if (patch.title) updated.title = { ...existing.title, ...patch.title };
  if (patch.body) updated.body = { ...existing.body, ...patch.body };

  const sb = getSupabase();
  if (sb) {
    await sb
      .from("promos")
      .update(promoToRow(updated))
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
    return updated;
  }

  const i = mem.findIndex((x) => x.id === id);
  if (i < 0) return null;
  mem[i] = updated;
  return updated;
}

export async function deletePromo(id: string) {
  const sb = getSupabase();
  if (sb) {
    await sb
      .from("promos")
      .delete()
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
    return true;
  }
  const i = mem.findIndex((x) => x.id === id);
  if (i < 0) return false;
  mem.splice(i, 1);
  return true;
}

export async function calcPromoDiscount(
  promoId: string | undefined,
  subtotal: number
): Promise<{ discount: number; label?: string }> {
  if (!promoId) return { discount: 0 };
  const p = await getPromo(promoId);
  if (!p || !p.active) return { discount: 0 };
  const today = new Date().toISOString().slice(0, 10);
  if (p.startDate > today || (p.until && p.until < today)) return { discount: 0 };

  let discount = 0;
  if (p.discountPercent) discount = Math.round((subtotal * p.discountPercent) / 100);
  if (p.discountAmount) discount = Math.max(discount, p.discountAmount);
  return { discount: Math.min(discount, subtotal), label: p.title.th };
}
