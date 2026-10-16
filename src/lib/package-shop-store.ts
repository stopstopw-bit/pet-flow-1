import { getSupabase } from "./supabase/server";
import { uploadDataUrlToStorage } from "./supabase/storage";
import { requireTenantId } from "./tenant-context";

/**
 * ร้านขายคอร์ส/แพ็กเกจในแอปลูกค้า
 *
 * แยกเป็น 2 ส่วน:
 * - PackageOffer = "อะไรที่ขายอยู่" (ร้านตั้งเอง โชว์ในหน้าแรกของลูกค้า)
 * - PackageOrder = "ลูกค้ากดซื้อแล้วรอโอน" — ร้านกดยืนยันรับเงินแล้วค่อยกลายเป็นคอร์สจริง
 *
 * จงใจไม่สร้างคอร์สให้ทันทีที่กดซื้อ เพราะเงินยังไม่เข้า —
 * คอร์สจะถูกสร้างตอนร้านกดยืนยันเท่านั้น (ดู confirmPackageOrder)
 */

/**
 * package = คอร์สนับครั้ง — 1 ครั้งคลุมทั้งบิล
 * credit  = เติมเครดิต Member
 * nights  = ซื้อวันเข้าพักล่วงหน้า — totalUses คือจำนวนคืน หักตามคืนที่พักจริง
 */
export type PackageOfferKind = "package" | "credit" | "nights";

export type PackageOffer = {
  id: string;
  /** "package" = คอร์ส N ครั้ง (ค่าเริ่มต้น) · "credit" = เติมเครดิต Member เป็นยอดเงิน */
  kind: PackageOfferKind;
  name: string;
  totalUses: number;
  price: number;
  /** เฉพาะ kind = "credit" — เครดิตที่ลูกค้าได้รับ (ตั้งสูงกว่า price ได้เพื่อแถมโบนัส) */
  creditAmount?: number;
  description?: string;
  /** รูปหน้าปกที่ลูกค้าเห็นในแอป — ไม่มีก็ไม่เป็นไร แอปจะโชว์แบบไม่มีรูปแทน */
  imageUrl?: string;
  /** เฉพาะ kind==="package" — ผูกโปรแกรมอาบน้ำ (id ในตั้งค่า) ไม่ระบุ = ใช้ได้ทุกโปรแกรม */
  groomProgram?: string;
  active: boolean;
  createdAt: string;
};

export type PackageOrderStatus = "pending" | "paid" | "cancelled";

export type PackageOrder = {
  id: string;
  customerId: string;
  customerName: string;
  lineUserId?: string;
  offerId?: string;
  /** ก๊อปชนิด/ชื่อ/จำนวนครั้ง/ราคา ณ ตอนสั่ง — ร้านแก้ offer ทีหลังไม่กระทบออร์เดอร์เก่า */
  kind: PackageOfferKind;
  name: string;
  totalUses: number;
  price: number;
  /** เฉพาะ kind = "credit" */
  creditAmount?: number;
  /** ก๊อปจากคอร์สที่ขาย ณ ตอนสั่ง */
  groomProgram?: string;
  status: PackageOrderStatus;
  slipUrl?: string;
  /** id ของคอร์สที่สร้างให้ตอนยืนยัน — กันยืนยันซ้ำแล้วได้คอร์สสองใบ (เฉพาะ kind = "package") */
  packageId?: string;
  createdAt: string;
  paidAt?: string;
};

type OfferRow = {
  id: string;
  name: string | null;
  total_uses: number;
  price: number;
  description: string | null;
  /** ยังไม่มีคอลัมน์นี้ในบางร้าน — select("*") จะได้ undefined ไม่พัง */
  image_url?: string | null;
  kind?: string | null;
  credit_amount?: number | null;
  groom_program?: string | null;
  active: boolean;
  created_at: string;
};

type OrderRow = {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  line_user_id: string | null;
  offer_id: string | null;
  name: string | null;
  total_uses: number;
  price: number;
  kind?: string | null;
  credit_amount?: number | null;
  groom_program?: string | null;
  status: string;
  slip_url: string | null;
  package_id: string | null;
  created_at: string;
  paid_at: string | null;
};

const memOffers: PackageOffer[] = [];
const memOrders: PackageOrder[] = [];

function rowToOffer(r: OfferRow): PackageOffer {
  return {
    id: r.id,
    kind: r.kind === "credit" || r.kind === "nights" ? r.kind : "package",
    name: r.name || "",
    totalUses: Number(r.total_uses) || 0,
    price: Number(r.price) || 0,
    creditAmount: r.credit_amount != null ? Number(r.credit_amount) : undefined,
    description: r.description || undefined,
    imageUrl: r.image_url || undefined,
    groomProgram: r.groom_program || undefined,
    active: r.active !== false,
    createdAt: r.created_at,
  };
}

function rowToOrder(r: OrderRow): PackageOrder {
  return {
    id: r.id,
    customerId: r.customer_id || "",
    customerName: r.customer_name || "",
    lineUserId: r.line_user_id || undefined,
    offerId: r.offer_id || undefined,
    kind: r.kind === "credit" || r.kind === "nights" ? r.kind : "package",
    name: r.name || "",
    totalUses: Number(r.total_uses) || 0,
    price: Number(r.price) || 0,
    creditAmount: r.credit_amount != null ? Number(r.credit_amount) : undefined,
    groomProgram: r.groom_program || undefined,
    status: (r.status as PackageOrderStatus) || "pending",
    slipUrl: r.slip_url || undefined,
    packageId: r.package_id || undefined,
    createdAt: r.created_at,
    paidAt: r.paid_at || undefined,
  };
}

/**
 * เขียนโปรแกรมอาบน้ำที่ผูกกับคอร์ส — คอลัมน์เพิ่มมาทีหลัง เขียนแยกจากแถวหลัก
 * ถ้ายังไม่มีคอลัมน์ ลองอัปเดตฐานข้อมูลให้เองก่อนแล้วเขียนใหม่
 */
async function writeGroomProgram(
  table: "package_offers" | "package_orders",
  id: string,
  groomProgram: string | null
) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { error } = await sb.from(table).update({ groom_program: groomProgram }).eq("tenant_id", requireTenantId()).eq("id", id);
    if (error) {
      const { ensureMigration } = await import("./migrations");
      if (await ensureMigration("packages.groom_program")) {
        await sb.from(table).update({ groom_program: groomProgram }).eq("tenant_id", requireTenantId()).eq("id", id);
      }
    }
  } catch {
    /* ยังไม่มีคอลัมน์ — คอร์สยังขายได้ แค่กลายเป็นใช้ได้ทุกโปรแกรม */
  }
}

/* ───────── แพ็กเกจที่เปิดขาย ───────── */

export async function listPackageOffers(activeOnly = false): Promise<PackageOffer[]> {
  const sb = getSupabase();
  let list: PackageOffer[];
  if (sb) {
    try {
      const { data, error } = await sb
        .from("package_offers")
        .select("*")
        .eq("tenant_id", requireTenantId())
        .order("created_at", { ascending: true });
      if (error) return [];
      list = ((data as OfferRow[] | null) || []).map(rowToOffer);
    } catch {
      return [];
    }
  } else {
    list = [...memOffers];
  }
  return activeOnly ? list.filter((o) => o.active) : list;
}

export async function createPackageOffer(data: {
  kind?: PackageOfferKind;
  name: string;
  totalUses: number;
  price: number;
  /** เฉพาะ kind = "credit" — ถ้าไม่ใส่ ใช้เท่ากับ price (ไม่มีโบนัส) */
  creditAmount?: number;
  description?: string;
  /** เฉพาะ kind==="package" */
  groomProgram?: string;
  /** data URL จากช่องอัปโหลด — จะถูกเก็บขึ้น Storage ให้ ไม่ยัด base64 ลง DB */
  image?: string;
}): Promise<PackageOffer | null> {
  const kind: PackageOfferKind =
    data.kind === "credit" || data.kind === "nights" ? data.kind : "package";
  const name = data.name.trim();
  const price = Math.max(0, Math.round(data.price) || 0);
  // เติมเครดิตไม่มีแนวคิด "จำนวนครั้ง" — เก็บ 0 ไว้เฉยๆ กันโค้ดเก่าที่อ่าน total_uses พัง
  const totalUses = kind === "credit" ? 0 : Math.max(1, Math.round(data.totalUses) || 0);
  const creditAmount =
    kind === "credit" ? Math.max(0, Math.round(data.creditAmount ?? price) || 0) : undefined;
  if (!name) return null;
  if (kind === "package" && totalUses <= 0) return null;
  if (kind === "credit" && creditAmount! <= 0) return null;

  const id = `POF${Date.now()}${Math.floor(Math.random() * 1000)}`;

  // อัปรูปก่อน แต่ถ้าอัปไม่ขึ้นก็ยังต้องสร้างคอร์สให้ได้ — รูปเป็นของแถม ไม่ใช่เงื่อนไข
  let imageUrl: string | undefined;
  if (data.image) {
    try {
      imageUrl = await uploadDataUrlToStorage(`package-offers/${id}.jpg`, data.image);
    } catch {
      /* ไม่มีรูปก็ขายได้ */
    }
  }

  const offer: PackageOffer = {
    id,
    kind,
    name,
    totalUses,
    price,
    creditAmount,
    description: data.description?.trim() || undefined,
    imageUrl,
    groomProgram: kind === "package" ? data.groomProgram || undefined : undefined,
    active: true,
    createdAt: new Date().toISOString(),
  };

  const sb = getSupabase();
  if (sb) {
    const baseRow = {
      id: offer.id,
      tenant_id: requireTenantId(),
      name: offer.name,
      total_uses: offer.totalUses,
      price: offer.price,
      description: offer.description || null,
      active: true,
      created_at: offer.createdAt,
    };
    const { error } = await sb
      .from("package_offers")
      .insert({ ...baseRow, kind: offer.kind, credit_amount: offer.creditAmount ?? null });
    if (error) {
      // ร้านที่ยังไม่อัปเดตฐานข้อมูล — ยังไม่มีคอลัมน์ kind/credit_amount, insert แบบเดิมไปก่อน
      // (จะได้เป็นคอร์สธรรมดาเสมอจนกว่าจะอัปเดต — ปลอดภัยกว่าสร้าง offer เติมเครดิตที่ระบบยังไม่รองรับ)
      await sb.from("package_offers").insert(baseRow);
    }
    // เขียนแยกเพราะร้านที่ยังไม่ได้รันคอลัมน์นี้จะ insert ไม่ผ่านทั้งแถว
    if (offer.groomProgram) await writeGroomProgram("package_offers", offer.id, offer.groomProgram);
    if (offer.imageUrl) {
      try {
        const { error } = await sb
          .from("package_offers")
          .update({ image_url: offer.imageUrl })
          .eq("id", offer.id)
          .eq("tenant_id", requireTenantId());
        if (error) {
          // ยังไม่มีคอลัมน์ — ซ่อมให้เองแล้วลองใหม่ (คอร์สสร้างสำเร็จไปแล้ว รูปเป็นของแถม)
          const { ensureMigration } = await import("./migrations");
          if (await ensureMigration("package_offers.image_url")) {
            await sb
              .from("package_offers")
              .update({ image_url: offer.imageUrl })
              .eq("id", offer.id)
              .eq("tenant_id", requireTenantId());
          }
        }
      } catch {
        /* ยังไม่มีคอลัมน์ image_url — คอร์สยังขายได้ แค่ไม่มีรูป */
      }
    }
  } else {
    memOffers.push(offer);
  }
  return offer;
}

/** เปลี่ยน/ลบรูปหน้าปกของคอร์สที่ขายอยู่ — image ว่าง = เอารูปออก */
export async function setPackageOfferImage(id: string, image: string) {
  let imageUrl: string | null = null;
  if (image) {
    try {
      imageUrl = await uploadDataUrlToStorage(`package-offers/${id}.jpg`, image);
    } catch {
      return { ok: false as const, error: "upload_failed" };
    }
  }
  const sb = getSupabase();
  if (sb) {
    try {
      // ร้านที่ยังไม่ได้รัน migration จะได้ error กลับมา (ไม่ throw) ต้องเช็คเอง
      const { error } = await sb
        .from("package_offers")
        .update({ image_url: imageUrl })
        .eq("id", id)
        .eq("tenant_id", requireTenantId());
      if (error) {
        // ยังไม่มีคอลัมน์ image_url — ซ่อมให้เองแล้วลองใหม่ 1 ครั้ง
        const { ensureMigration } = await import("./migrations");
        const healed = await ensureMigration("package_offers.image_url");
        if (!healed) return { ok: false as const, error: "no_column" };
        const retry = await sb
          .from("package_offers")
          .update({ image_url: imageUrl })
          .eq("id", id)
          .eq("tenant_id", requireTenantId());
        if (retry.error) return { ok: false as const, error: "no_column" };
      }
    } catch {
      return { ok: false as const, error: "no_column" };
    }
  } else {
    const o = memOffers.find((x) => x.id === id);
    if (o) o.imageUrl = imageUrl || undefined;
  }
  return { ok: true as const };
}

/** แก้ไขคอร์สที่เปิดขาย — ชื่อ/จำนวนครั้ง/ราคา/คำโปรย/เครดิต (รูปแยกไปที่ setPackageOfferImage) */
export async function updatePackageOffer(
  id: string,
  data: {
    name?: string;
    totalUses?: number;
    price?: number;
    creditAmount?: number;
    description?: string;
    /** "" = ใช้ได้ทุกโปรแกรม */
    groomProgram?: string;
  }
) {
  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) return { ok: false as const, error: "name_required" };
    patch.name = name;
  }
  if (data.totalUses !== undefined) patch.total_uses = Math.max(0, Math.round(data.totalUses) || 0);
  if (data.price !== undefined) patch.price = Math.max(0, Math.round(data.price) || 0);
  if (data.creditAmount !== undefined) {
    patch.credit_amount = Math.max(0, Math.round(data.creditAmount) || 0);
  }
  if (data.description !== undefined) patch.description = data.description.trim() || null;
  const groomProgram =
    data.groomProgram !== undefined ? data.groomProgram.trim() || null : undefined;
  if (Object.keys(patch).length === 0 && groomProgram === undefined) return { ok: true as const };

  const sb = getSupabase();
  if (sb) {
    if (groomProgram !== undefined) await writeGroomProgram("package_offers", id, groomProgram);
    const { error } = await sb
      .from("package_offers")
      .update(patch)
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
    if (error && "credit_amount" in patch) {
      // ร้านยังไม่อัปเดตฐานข้อมูล — ไม่มีคอลัมน์ credit_amount, บันทึกที่เหลือไปก่อน
      const { credit_amount: _drop, ...rest } = patch;
      if (Object.keys(rest).length) {
        await sb
          .from("package_offers")
          .update(rest)
          .eq("id", id)
          .eq("tenant_id", requireTenantId());
      }
    }
  } else {
    const o = memOffers.find((x) => x.id === id);
    if (o) {
      if (patch.name !== undefined) o.name = patch.name as string;
      if (patch.total_uses !== undefined) o.totalUses = patch.total_uses as number;
      if (patch.price !== undefined) o.price = patch.price as number;
      if (patch.credit_amount !== undefined) o.creditAmount = patch.credit_amount as number;
      if (patch.description !== undefined) o.description = (patch.description as string) || undefined;
      if (groomProgram !== undefined) o.groomProgram = groomProgram || undefined;
    }
  }
  return { ok: true as const };
}

export async function setPackageOfferActive(id: string, active: boolean) {
  const sb = getSupabase();
  if (sb) {
    await sb
      .from("package_offers")
      .update({ active })
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
  } else {
    const o = memOffers.find((x) => x.id === id);
    if (o) o.active = active;
  }
  return { ok: true as const };
}

export async function deletePackageOffer(id: string) {
  const sb = getSupabase();
  if (sb) {
    await sb
      .from("package_offers")
      .delete()
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
  } else {
    const i = memOffers.findIndex((x) => x.id === id);
    if (i >= 0) memOffers.splice(i, 1);
  }
  return { ok: true as const };
}

/* ───────── ออร์เดอร์ที่ลูกค้ากดซื้อ ───────── */

export async function listPackageOrders(filter?: {
  status?: PackageOrderStatus;
  customerId?: string;
}): Promise<PackageOrder[]> {
  const sb = getSupabase();
  let list: PackageOrder[];
  if (sb) {
    try {
      let q = sb.from("package_orders").select("*").eq("tenant_id", requireTenantId());
      if (filter?.status) q = q.eq("status", filter.status);
      if (filter?.customerId) q = q.eq("customer_id", filter.customerId);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) return [];
      list = ((data as OrderRow[] | null) || []).map(rowToOrder);
    } catch {
      return [];
    }
  } else {
    list = memOrders.filter(
      (o) =>
        (!filter?.status || o.status === filter.status) &&
        (!filter?.customerId || o.customerId === filter.customerId)
    );
  }
  return list;
}

export async function getPackageOrder(id: string): Promise<PackageOrder | undefined> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data } = await sb
        .from("package_orders")
        .select("*")
        .eq("id", id)
        .eq("tenant_id", requireTenantId())
        .maybeSingle();
      return data ? rowToOrder(data as OrderRow) : undefined;
    } catch {
      return undefined;
    }
  }
  return memOrders.find((o) => o.id === id);
}

/** ลูกค้ากดซื้อ — ยังไม่ได้เงิน จึงยังไม่สร้างคอร์ส แค่ตั้งออร์เดอร์รอโอน */
export async function createPackageOrder(data: {
  customerId: string;
  customerName: string;
  lineUserId?: string;
  offer: PackageOffer;
}): Promise<PackageOrder> {
  // กดซื้อรัวๆ ไม่ควรได้ออร์เดอร์ซ้ำ — ร้านจะเห็นรายการเดียวกันหลายแถวแล้วเผลอกดรับเงินซ้ำ
  // ถ้ายังมีใบที่รอโอนของคอร์สเดียวกันอยู่ ให้ใช้ใบเดิม
  const existing = (await listPackageOrders({ customerId: data.customerId })).find(
    (o) => o.status === "pending" && o.offerId === data.offer.id
  );
  if (existing) return existing;

  const order: PackageOrder = {
    id: `POR${Date.now()}${Math.floor(Math.random() * 1000)}`,
    customerId: data.customerId,
    customerName: data.customerName,
    lineUserId: data.lineUserId,
    offerId: data.offer.id,
    kind: data.offer.kind,
    name: data.offer.name,
    totalUses: data.offer.totalUses,
    price: data.offer.price,
    creditAmount: data.offer.creditAmount,
    groomProgram: data.offer.kind === "package" ? data.offer.groomProgram : undefined,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  const sb = getSupabase();
  if (sb) {
    const baseRow = {
      id: order.id,
      tenant_id: requireTenantId(),
      customer_id: order.customerId,
      customer_name: order.customerName,
      line_user_id: order.lineUserId || null,
      offer_id: order.offerId || null,
      name: order.name,
      total_uses: order.totalUses,
      price: order.price,
      status: "pending",
      created_at: order.createdAt,
    };
    const { error } = await sb
      .from("package_orders")
      .insert({ ...baseRow, kind: order.kind, credit_amount: order.creditAmount ?? null });
    if (error) {
      // ร้านยังไม่อัปเดตฐานข้อมูล — ยังไม่มีคอลัมน์ kind/credit_amount
      await sb.from("package_orders").insert(baseRow);
    }
    if (order.groomProgram) await writeGroomProgram("package_orders", order.id, order.groomProgram);
  } else {
    memOrders.unshift(order);
  }
  return order;
}

/** ลูกค้าแนบสลิป — เก็บเป็นไฟล์ใน storage ถ้าตั้งค่าไว้ (ไม่งั้นเก็บ data URL ตามเดิม) */
export async function attachOrderSlip(id: string, slipDataUrl: string) {
  const order = await getPackageOrder(id);
  if (!order) return { ok: false as const, error: "not_found" };
  if (order.status !== "pending") {
    return { ok: false as const, error: "not_pending" };
  }
  const url = await uploadDataUrlToStorage(`package-slips/${id}`, slipDataUrl);

  const sb = getSupabase();
  if (sb) {
    await sb
      .from("package_orders")
      .update({ slip_url: url })
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
  } else {
    const o = memOrders.find((x) => x.id === id);
    if (o) o.slipUrl = url;
  }
  return { ok: true as const, slipUrl: url };
}

/**
 * ร้านกดยืนยันว่าได้เงินแล้ว → สร้างคอร์สจริงให้ลูกค้า + ลงรายรับ
 *
 * อัปเดตสถานะแบบมีเงื่อนไข (เฉพาะตอนยัง pending) ก่อนจะสร้างคอร์ส
 * กันกดสองทีแล้วลูกค้าได้คอร์สซ้ำ/รายรับซ้ำ
 */
export async function confirmPackageOrder(
  id: string,
  opts?: { isLegacy?: boolean }
) {
  const order = await getPackageOrder(id);
  if (!order) return { ok: false as const, error: "not_found" };
  if (order.status !== "pending") {
    return { ok: false as const, error: "not_pending" };
  }

  const paidAt = new Date().toISOString();
  const sb = getSupabase();
  if (sb) {
    // จองสิทธิ์ก่อน — ถ้าอีกคลิกชิงไปแล้วจะไม่มีแถวถูกแก้ แปลว่าแพ้การแข่ง ให้หยุด
    const { data: claimed } = await sb
      .from("package_orders")
      .update({ status: "paid", paid_at: paidAt })
      .eq("id", id)
      .eq("tenant_id", requireTenantId())
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) {
      return { ok: false as const, error: "not_pending" };
    }
  } else {
    const o = memOrders.find((x) => x.id === id);
    if (!o || o.status !== "pending") {
      return { ok: false as const, error: "not_pending" };
    }
    o.status = "paid";
    o.paidAt = paidAt;
  }

  if (order.kind === "credit") {
    // เติมเครดิต Member — ไม่มีคอร์สให้สร้าง ใช้ฟังก์ชันเติมเครดิตเดิม (ลงรายรับให้เองในตัว)
    const { topupMemberCredit } = await import("./customers-store");
    const creditAmount = order.creditAmount ?? order.price;
    const bonus = Math.max(0, creditAmount - order.price);
    const result = await topupMemberCredit(order.customerId, {
      paidAmount: order.price,
      bonusAmount: bonus,
      note: `เติมเครดิตผ่านแอป: ${order.name}`,
      isLegacy: opts?.isLegacy,
    });
    return {
      ok: true as const,
      order: { ...order, status: "paid" as const, paidAt },
      credit: result ? { added: result.topup.creditAdded, balance: result.topup.balanceAfter } : undefined,
    };
  }

  const { sellPackage } = await import("./packages-store");
  const pkg = await sellPackage({
    customerId: order.customerId,
    customerName: order.customerName,
    name: order.name,
    totalUses: order.totalUses,
    price: order.price,
    // ซื้อวันเข้าพัก = หน่วยเป็นคืน หักตามจำนวนคืนที่พักจริงตอนคิดเงิน
    unit: order.kind === "nights" ? "night" : "use",
    groomProgram: order.kind === "package" ? order.groomProgram : undefined,
    isLegacy: opts?.isLegacy,
  });

  if (sb) {
    await sb
      .from("package_orders")
      .update({ package_id: pkg.id })
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
  } else {
    const o = memOrders.find((x) => x.id === id);
    if (o) o.packageId = pkg.id;
  }

  return { ok: true as const, order: { ...order, status: "paid" as const, paidAt }, pkg };
}

export async function cancelPackageOrder(id: string) {
  const order = await getPackageOrder(id);
  if (!order) return { ok: false as const, error: "not_found" };
  if (order.status === "paid") {
    // จ่ายแล้วยกเลิกตรงนี้ไม่ได้ — ต้องไปยกเลิกคอร์สที่หน้าลูกค้า ไม่งั้นคอร์สจะค้างอยู่
    return { ok: false as const, error: "already_paid" };
  }
  const sb = getSupabase();
  if (sb) {
    await sb
      .from("package_orders")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
  } else {
    const o = memOrders.find((x) => x.id === id);
    if (o) o.status = "cancelled";
  }
  return { ok: true as const };
}

/**
 * ลบออร์เดอร์ที่จบแล้วออกจากประวัติ — แค่ลบ record ทิ้ง ไม่แตะคอร์สที่ลูกค้าได้ไปแล้ว
 * (ออร์เดอร์ที่จ่ายแล้วสร้างคอร์สแยกไว้ต่างหาก การลบประวัติจึงไม่กระทบสิทธิ์ลูกค้า)
 * กันลบออร์เดอร์ที่ยังรอโอนอยู่ — ต้องยกเลิกก่อนถึงจะลบได้ ไม่งั้นของค้างหาย
 */
export async function deletePackageOrder(id: string) {
  const order = await getPackageOrder(id);
  if (!order) return { ok: false as const, error: "not_found" };
  if (order.status === "pending") {
    return { ok: false as const, error: "still_pending" };
  }
  const sb = getSupabase();
  if (sb) {
    await sb
      .from("package_orders")
      .delete()
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
  } else {
    const i = memOrders.findIndex((x) => x.id === id);
    if (i >= 0) memOrders.splice(i, 1);
  }
  return { ok: true as const };
}
