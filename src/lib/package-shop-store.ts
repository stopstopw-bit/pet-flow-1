import { getSupabase } from "./supabase/server";
import { uploadDataUrlToStorage, uploadPrivateDataUrl } from "./supabase/storage";
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
 * bundle  = ชุดรวมหลายรายการ เช่น พัก 5 คืน + อาบน้ำ 6 ครั้ง — รายการอยู่ใน items
 */
export type PackageOfferKind = "package" | "credit" | "nights" | "bundle";

/**
 * รายการในคอร์ส — ตอนร้านยืนยันออร์เดอร์ แต่ละรายการกลายเป็นคอร์สของลูกค้า 1 ใบ
 * (คอร์สคืนผูกห้อง / คอร์สอาบน้ำผูกโปรแกรม) แล้วตัดตอนออกบิลตามระบบเดิม
 * คอร์สนับครั้ง/วันพักแบบเดี่ยวที่มีของแถมก็เก็บเป็น items 1 รายการ
 */
export type OfferItem = {
  unit: "night" | "use";
  /** จำนวนที่จ่าย */
  paid: number;
  /** แถมฟรี */
  free?: number;
  roomType?: string;
  groomProgram?: string;
};

const KINDS: PackageOfferKind[] = ["package", "credit", "nights", "bundle"];
export function toOfferKind(k: unknown): PackageOfferKind {
  // "uses" = ชื่อเดียวกันของ Catcha — รับไว้ด้วยกันฟอร์มที่ส่งมาแบบนั้น
  if (k === "uses") return "package";
  return KINDS.includes(k as PackageOfferKind) ? (k as PackageOfferKind) : "package";
}

/** ทำความสะอาดรายการจากฟอร์ม — ตัดแถวที่ไม่มีจำนวน */
export function normalizeOfferItems(raw: unknown): OfferItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const it = (r || {}) as Record<string, unknown>;
      const unit: OfferItem["unit"] = it.unit === "night" ? "night" : "use";
      const paid = Math.max(0, Math.round(Number(it.paid) || 0));
      const free = Math.max(0, Math.round(Number(it.free) || 0));
      return {
        unit,
        paid,
        ...(free ? { free } : {}),
        ...(unit === "night" && it.roomType ? { roomType: String(it.roomType) } : {}),
        ...(unit === "use" && it.groomProgram ? { groomProgram: String(it.groomProgram) } : {}),
      };
    })
    .filter((it) => it.paid + (it.free || 0) > 0)
    .slice(0, 10);
}

/** จำนวนรวมทุกรายการ (จ่าย + แถม) */
export function offerItemsTotal(items: OfferItem[]): number {
  return items.reduce((n, it) => n + it.paid + (it.free || 0), 0);
}

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
  /** เฉพาะ kind==="nights" — ผูกประเภทห้อง (id ในตั้งค่า) ไม่ระบุ = ใช้ได้ทุกห้อง */
  roomType?: string;
  /** ชื่อห้องตามตั้งค่าปัจจุบัน (เติมให้ตอนอ่าน ไม่ได้เก็บ) */
  roomLabel?: string;
  /** ชุดรวม / มีของแถม — ว่าง = คอร์สเดี่ยวแบบเดิม */
  items?: OfferItem[];
  /** คำอธิบายแต่ละรายการ เช่น "ห้อง Mid Cozy 5 คืน + แถม 1" (เติมให้ตอนอ่าน ไม่ได้เก็บ) */
  itemLabels?: string[];
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
  roomType?: string;
  items?: OfferItem[];
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
  room_type?: string | null;
  items?: unknown;
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
  room_type?: string | null;
  items?: unknown;
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
    kind: toOfferKind(r.kind),
    name: r.name || "",
    totalUses: Number(r.total_uses) || 0,
    price: Number(r.price) || 0,
    creditAmount: r.credit_amount != null ? Number(r.credit_amount) : undefined,
    description: r.description || undefined,
    imageUrl: r.image_url || undefined,
    groomProgram: r.groom_program || undefined,
    roomType: r.room_type || undefined,
    items: normalizeOfferItems(r.items).length ? normalizeOfferItems(r.items) : undefined,
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
    kind: toOfferKind(r.kind),
    name: r.name || "",
    totalUses: Number(r.total_uses) || 0,
    price: Number(r.price) || 0,
    creditAmount: r.credit_amount != null ? Number(r.credit_amount) : undefined,
    groomProgram: r.groom_program || undefined,
    roomType: r.room_type || undefined,
    items: normalizeOfferItems(r.items).length ? normalizeOfferItems(r.items) : undefined,
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

/** เขียนห้องที่ผูกกับคอร์สวันพัก — คอลัมน์เพิ่มมาทีหลัง เขียนแยกเหมือนโปรแกรมอาบน้ำ */
async function writeRoomType(
  table: "package_offers" | "package_orders",
  id: string,
  roomType: string | null
) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { error } = await sb.from(table).update({ room_type: roomType }).eq("tenant_id", requireTenantId()).eq("id", id);
    if (error) {
      const { ensureMigration } = await import("./migrations");
      if (await ensureMigration("packages.offer_room_type")) {
        await sb.from(table).update({ room_type: roomType }).eq("tenant_id", requireTenantId()).eq("id", id);
      }
    }
  } catch {
    /* ยังไม่มีคอลัมน์ — คอร์สยังขายได้ แค่กลายเป็นใช้ได้ทุกห้อง */
  }
}

/** เขียนรายการในคอร์ส (ชุดรวม/ของแถม) — คอลัมน์เพิ่มมาทีหลัง เขียนแยกจากแถวหลัก */
async function writeItems(
  table: "package_offers" | "package_orders",
  id: string,
  items: OfferItem[] | null
) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { error } = await sb.from(table).update({ items }).eq("tenant_id", requireTenantId()).eq("id", id);
    if (error) {
      const { ensureMigration } = await import("./migrations");
      if (await ensureMigration("packages.offer_items")) {
        await sb.from(table).update({ items }).eq("tenant_id", requireTenantId()).eq("id", id);
      }
    }
  } catch {
    /* ยังไม่มีคอลัมน์ — ขายได้แค่คอร์สเดี่ยวแบบเดิม */
  }
}

/** "อาบน้ำ Premium" — ชื่อโปรแกรมที่มีคำว่าอาบน้ำอยู่แล้วไม่เติมซ้ำ */
function bathName(program?: string | false): string {
  if (!program) return "อาบน้ำ";
  return program.includes("อาบน้ำ") ? program : `อาบน้ำ ${program}`;
}

/** ชื่อโปรแกรมอาบน้ำตามตั้งค่า */
async function groomProgramNames(): Promise<Map<string, string>> {
  const { getSiteConfig } = await import("./config-store");
  const { resolveGroomPrograms } = await import("./grooming-prices");
  const cfg = await getSiteConfig();
  return new Map(resolveGroomPrograms(cfg.groomPricePrograms).map((p) => [p.id, p.name]));
}

/** ชื่อห้องตามตั้งค่า แบบเดียวกับบรรทัดค่าห้องในบิล ("ห้อง Mid Cozy") — ตอนออกบิลจับคู่ด้วยชื่อนี้ */
async function roomLabels(): Promise<Map<string, string>> {
  const { getSiteConfig } = await import("./config-store");
  const cfg = await getSiteConfig();
  return new Map((cfg.rooms || []).map((r) => [r.id, `ห้อง ${r.name}`]));
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
  if (list.some((o) => o.roomType || o.items?.length)) {
    const [labels, programs] = await Promise.all([
      roomLabels().catch(() => new Map<string, string>()),
      groomProgramNames().catch(() => new Map<string, string>()),
    ]);
    list = list.map((o) => ({
      ...o,
      roomLabel: o.roomType ? labels.get(o.roomType) : undefined,
      itemLabels: o.items?.map((it) => {
        const what =
          it.unit === "night"
            ? `${(it.roomType && labels.get(it.roomType)) || "ห้องพัก"} ${it.paid} คืน`
            : `${bathName(it.groomProgram && programs.get(it.groomProgram))} ${it.paid} ครั้ง`;
        return it.free ? `${what} + แถม ${it.free}` : what;
      }),
    }));
  }
  return activeOnly ? list.filter((o) => o.active) : list;
}

/**
 * ก๊อปคอร์สวันพักที่ผูกห้องไว้ ไปเป็นคอร์สของห้องอื่นทุกห้อง — ลด % เท่ากับคอร์สต้นแบบ
 * (คิดจากราคาเต็มของห้องต้นแบบ) ชื่อที่มีชื่อห้องอยู่จะเปลี่ยนเป็นห้องใหม่ให้
 * ห้องที่มีคอร์สจำนวนคืนเท่ากันอยู่แล้วจะข้าม กดซ้ำได้ไม่เกิดคอร์สซ้ำ
 */
export async function copyNightsOfferToRooms(offerId: string) {
  const { getSiteConfig } = await import("./config-store");
  const rooms = ((await getSiteConfig()).rooms || []).map((r) => ({
    id: r.id,
    name: r.name,
    price: Number(r.price) || 0,
  }));
  const offers = await listPackageOffers();
  const src = offers.find((o) => o.id === offerId);
  const single = src?.items?.length === 1 ? src.items[0] : undefined;
  const srcRoomId = src?.roomType || (single?.unit === "night" ? single.roomType : undefined);
  const srcRoom = rooms.find((r) => r.id === srcRoomId);
  if (!src || src.kind !== "nights" || !srcRoom) return { ok: false as const, error: "not_room_course" };
  const paid = single ? single.paid : src.totalUses;
  const full = srcRoom.price * paid;
  if (full <= 0) return { ok: false as const, error: "no_room_price" };
  const ratio = src.price / full;
  const sameNights = (o: PackageOffer) =>
    o.kind === "nights" && (o.items?.length === 1 ? o.items[0].paid : o.totalUses) === paid;
  const taken = new Set(
    offers
      .filter(sameNights)
      .map((o) => o.roomType || (o.items?.length === 1 ? o.items[0].roomType : undefined))
      .filter(Boolean) as string[]
  );
  const esc = srcRoom.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nameRe = new RegExp(esc, "i");
  const made: PackageOffer[] = [];
  const skipped: string[] = [];
  for (const room of rooms) {
    if (room.id === srcRoom.id) continue;
    if (taken.has(room.id) || room.price <= 0) {
      skipped.push(room.name);
      continue;
    }
    const name = nameRe.test(src.name) ? src.name.replace(nameRe, room.name) : `${src.name} (${room.name})`;
    const offer = await createPackageOffer({
      name,
      kind: "nights",
      totalUses: paid,
      price: Math.round(room.price * paid * ratio),
      description: src.description?.replace(new RegExp(esc, "gi"), room.name),
      roomType: room.id,
      items: single ? [{ ...single, roomType: room.id }] : undefined,
      imageUrl: src.imageUrl,
    });
    if (offer) made.push(offer);
  }
  return { ok: true as const, made, skipped, percentOff: Math.round((1 - ratio) * 100) };
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
  /** เฉพาะ kind==="nights" */
  roomType?: string;
  /** ชุดรวม / ของแถม */
  items?: OfferItem[];
  /** data URL จากช่องอัปโหลด — จะถูกเก็บขึ้น Storage ให้ ไม่ยัด base64 ลง DB */
  image?: string;
  /** ใช้รูปที่อัปไว้แล้ว (ตอนก๊อปคอร์ส) */
  imageUrl?: string;
}): Promise<PackageOffer | null> {
  const kind = toOfferKind(data.kind);
  const items = kind === "credit" ? [] : normalizeOfferItems(data.items);
  if (kind === "bundle" && items.length === 0) return null;
  const name = data.name.trim();
  const price = Math.max(0, Math.round(data.price) || 0);
  // เติมเครดิตไม่มีแนวคิด "จำนวนครั้ง" — เก็บ 0 ไว้เฉยๆ กันโค้ดเก่าที่อ่าน total_uses พัง
  // ชุดรวม/ของแถม: totalUses = รวมทุกรายการ (ไว้โชว์) ของจริงอยู่ใน items
  const totalUses =
    kind === "credit"
      ? 0
      : items.length
        ? offerItemsTotal(items)
        : Math.max(1, Math.round(data.totalUses) || 0);
  const creditAmount =
    kind === "credit" ? Math.max(0, Math.round(data.creditAmount ?? price) || 0) : undefined;
  if (!name) return null;
  if (kind === "package" && totalUses <= 0) return null;
  if (kind === "credit" && creditAmount! <= 0) return null;

  const id = `POF${Date.now()}${Math.floor(Math.random() * 1000)}`;

  // อัปรูปก่อน แต่ถ้าอัปไม่ขึ้นก็ยังต้องสร้างคอร์สให้ได้ — รูปเป็นของแถม ไม่ใช่เงื่อนไข
  let imageUrl: string | undefined = data.imageUrl || undefined;
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
    roomType: kind === "nights" ? data.roomType || undefined : undefined,
    items: items.length ? items : undefined,
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
    if (offer.roomType) await writeRoomType("package_offers", offer.id, offer.roomType);
    if (offer.items) await writeItems("package_offers", offer.id, offer.items);
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
      // ไฟล์ชื่อเดิมถูกเขียนทับ — ต่อ ?v= ให้แอปลูกค้าไม่ค้างรูปเก่าจากแคช
      if (/^https?:/.test(imageUrl)) imageUrl = `${imageUrl.split("?")[0]}?v=${Date.now()}`;
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
    kind?: PackageOfferKind;
    totalUses?: number;
    price?: number;
    creditAmount?: number;
    description?: string;
    /** "" = ใช้ได้ทุกโปรแกรม */
    groomProgram?: string;
    /** "" = ใช้ได้ทุกห้อง */
    roomType?: string;
    /** [] = ไม่มีของแถม/รายการ (คอร์สเดี่ยวแบบเดิม) */
    items?: OfferItem[];
  }
) {
  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) return { ok: false as const, error: "name_required" };
    patch.name = name;
  }
  if (data.kind !== undefined) patch.kind = toOfferKind(data.kind);
  const items = data.items !== undefined ? normalizeOfferItems(data.items) : undefined;
  if (items?.length) patch.total_uses = offerItemsTotal(items);
  else if (data.totalUses !== undefined)
    patch.total_uses = Math.max(0, Math.round(data.totalUses) || 0);
  if (data.price !== undefined) patch.price = Math.max(0, Math.round(data.price) || 0);
  if (data.creditAmount !== undefined) {
    patch.credit_amount = Math.max(0, Math.round(data.creditAmount) || 0);
  }
  if (data.description !== undefined) patch.description = data.description.trim() || null;
  const groomProgram =
    data.groomProgram !== undefined ? data.groomProgram.trim() || null : undefined;
  const roomType = data.roomType !== undefined ? data.roomType.trim() || null : undefined;
  if (
    Object.keys(patch).length === 0 &&
    groomProgram === undefined &&
    roomType === undefined &&
    items === undefined
  )
    return { ok: true as const };

  const sb = getSupabase();
  if (sb) {
    if (groomProgram !== undefined) await writeGroomProgram("package_offers", id, groomProgram);
    if (roomType !== undefined) await writeRoomType("package_offers", id, roomType);
    if (items !== undefined) await writeItems("package_offers", id, items.length ? items : null);
    const { error } = await sb
      .from("package_offers")
      .update(patch)
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
    if (error && ("credit_amount" in patch || "kind" in patch)) {
      // ร้านยังไม่อัปเดตฐานข้อมูล — ไม่มีคอลัมน์ credit_amount/kind, บันทึกที่เหลือไปก่อน
      const { credit_amount: _drop, kind: _kind, ...rest } = patch;
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
      if (patch.kind !== undefined) o.kind = patch.kind as PackageOfferKind;
      if (patch.total_uses !== undefined) o.totalUses = patch.total_uses as number;
      if (patch.price !== undefined) o.price = patch.price as number;
      if (patch.credit_amount !== undefined) o.creditAmount = patch.credit_amount as number;
      if (patch.description !== undefined) o.description = (patch.description as string) || undefined;
      if (groomProgram !== undefined) o.groomProgram = groomProgram || undefined;
      if (roomType !== undefined) o.roomType = roomType || undefined;
      if (items !== undefined) o.items = items.length ? items : undefined;
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
    roomType: data.offer.kind === "nights" ? data.offer.roomType : undefined,
    items: data.offer.kind !== "credit" && data.offer.items?.length ? data.offer.items : undefined,
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
    if (order.roomType) await writeRoomType("package_orders", order.id, order.roomType);
    if (order.items) await writeItems("package_orders", order.id, order.items);
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
  const url = await uploadPrivateDataUrl(`package-slips/${id}`, slipDataUrl);

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

  // แต่ละรายการ = คอร์สของลูกค้า 1 ใบ — คอร์สเดี่ยวแบบเดิมก็คือรายการเดียว
  const parts: OfferItem[] = order.items?.length
    ? order.items
    : [
        {
          unit: order.kind === "nights" ? "night" : "use",
          paid: order.totalUses,
          roomType: order.kind === "nights" ? order.roomType : undefined,
          groomProgram: order.kind === "package" ? order.groomProgram : undefined,
        },
      ];
  const made = await sellOfferItems({
    customerId: order.customerId,
    customerName: order.customerName,
    name: order.name,
    price: order.price,
    items: parts,
    isLegacy: opts?.isLegacy,
  });
  const pkg = made[0];
  if (!pkg) return { ok: false as const, error: "no_items" };

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

/**
 * ขายคอร์สตามรายการ (พัก N คืน / อาบน้ำ N ครั้ง + แถม) — รายการละ 1 คอร์สของลูกค้า
 * ใช้ทั้งตอนยืนยันออร์เดอร์จากแอป ตอนร้านขายเองที่หน้าลูกค้า และตอนจ่ายบิลขายคอร์ส
 * ราคาแบ่งตามจำนวนที่จ่ายของแต่ละรายการ (ของแถมไม่มีราคา) รวมแล้วเท่าราคาคอร์สพอดี
 */
export async function sellOfferItems(data: {
  customerId: string;
  customerName?: string;
  name: string;
  price: number;
  items: OfferItem[];
  isLegacy?: boolean;
  /** ผูกแผนแบ่งจ่าย — คอร์สล็อกจนจ่ายครบ รายรับลงตามงวด */
  planId?: string;
  noIncome?: boolean;
}) {
  const { sellPackage } = await import("./packages-store");
  const labels = await roomLabels().catch(() => new Map<string, string>());
  const parts = data.items.filter((it) => it.paid + (it.free || 0) > 0);
  const multi = parts.length > 1;
  const programNames = multi ? await groomProgramNames().catch(() => new Map<string, string>()) : new Map();
  const paidTotal = parts.reduce((n, it) => n + it.paid, 0);
  let priceLeft = data.price;
  const made: Awaited<ReturnType<typeof sellPackage>>[] = [];
  for (const [i, it] of parts.entries()) {
    const share =
      i === parts.length - 1
        ? priceLeft
        : paidTotal > 0
          ? Math.round((data.price * it.paid) / paidTotal)
          : 0;
    priceLeft -= share;
    // ห้องที่ลบไปแล้ว = ใช้ได้ทุกห้อง
    const roomLabel = it.unit === "night" && it.roomType ? labels.get(it.roomType) : undefined;
    const partName = !multi
      ? data.name
      : `${data.name} · ${
          it.unit === "night"
            ? roomLabel || "ห้องพัก"
            : bathName(it.groomProgram && programNames.get(it.groomProgram))
        }`;
    made.push(
      await sellPackage({
        customerId: data.customerId,
        customerName: data.customerName,
        // ชื่อที่บอกของแถมอยู่แล้ว (เช่น "พัก 10 แถม 1") ไม่ต่อท้ายซ้ำ
        name: it.free && !partName.includes("แถม") ? `${partName} (แถม ${it.free})` : partName,
        totalUses: it.paid + (it.free || 0),
        price: share,
        // ซื้อวันเข้าพัก = หน่วยเป็นคืน หักตามจำนวนคืนที่พักจริงตอนคิดเงิน
        unit: it.unit,
        groomProgram: it.unit === "use" ? it.groomProgram : undefined,
        roomType: roomLabel ? it.roomType : undefined,
        roomLabel,
        isLegacy: data.isLegacy,
        planId: data.planId,
        noIncome: data.noIncome,
      })
    );
  }
  return made;
}
