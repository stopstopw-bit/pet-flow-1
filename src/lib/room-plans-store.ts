/**
 * แพ็กห้องรายเดือน — ลูกค้าเลือกเองว่าจะเอาห้องแต่ละประเภทกี่คืน (เช่น ห้องเล็ก 13 + ห้องกลาง 17)
 *
 * - ราคา = ราคาเต็มทุกคืน (ตามราคาห้องในตั้งค่า) ลดตาม % (ค่าเริ่มต้น 30% เมื่อรวมครบคืนขั้นต่ำ)
 * - ได้เป็น "คอร์สคืน" แยกตามประเภทห้อง — หักได้เฉพาะตอนพักห้องประเภทนั้นจริง
 * - ไม่มีวันหมดอายุ
 * - แบ่งจ่ายเป็นงวดได้: รายรับลงตามงวดที่รับเงินจริง (ไม่ลงตอนสร้างแพ็ก กันนับซ้ำ)
 *
 * ใช้ตารางเดียวกันกับ "คอร์สทั่วไปแบบแบ่งจ่าย" ด้วย (อาบน้ำ 10 ครั้ง ฯลฯ) — แผนแบบนั้น items ว่าง
 * แล้วผูกคอร์สผ่าน customer_packages.plan_id · ทุกแบบต้องจ่ายครบก่อนถึงจะใช้ได้
 */
import { getSupabase } from "./supabase/server";
import { requireTenantId } from "./tenant-context";
import { getSiteConfig } from "./config-store";
import { addFinanceEntry } from "./finance-store";
import { sellPackage, listCustomerPackages, cancelPackage, type CustomerPackage } from "./packages-store";
import { bangkokToday } from "./bangkok-date";

export type RoomPlanItem = {
  roomType: string;
  roomLabel: string;
  nights: number;
  /** ราคาเต็มต่อคืนตอนขาย */
  unitPrice: number;
  packageId?: string;
};

export type RoomPlanPayment = {
  amount: number;
  /** วันที่รับเงิน (เวลาไทย) */
  date: string;
  method: "transfer" | "cash";
  at: string;
};

export type RoomPlan = {
  id: string;
  customerId: string;
  customerName: string;
  lineUserId?: string;
  name: string;
  items: RoomPlanItem[];
  fullPrice: number;
  discountPct: number;
  price: number;
  /** แบ่งจ่ายกี่งวด (1 = จ่ายครั้งเดียว) */
  installments: number;
  payments: RoomPlanPayment[];
  status: "active" | "cancelled";
  createdAt: string;
};

export type RoomPlanView = RoomPlan & {
  paid: number;
  remaining: number;
  /** งวดที่ยังเหลือ */
  installmentsLeft: number;
  /** ยอดแนะนำต่องวดของงวดที่เหลือ */
  nextInstallment: number;
  /** "room" = แพ็กห้องรายเดือน · "package" = คอร์สทั่วไปแบบแบ่งจ่าย */
  kind: "room" | "package";
  /** คงเหลือแยกตามคอร์ส (อ่านจากคอร์สจริง) — unit บอกว่าเป็นคืนหรือครั้ง */
  nights: { roomType: string; roomLabel: string; total: number; used: number; left: number; unit: "night" | "use" }[];
};

type RoomPlanRow = {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  line_user_id: string | null;
  name: string | null;
  items: RoomPlanItem[] | null;
  full_price: number;
  discount_pct: number;
  price: number;
  installments: number;
  payments: RoomPlanPayment[] | null;
  status: string;
  created_at: string;
};

const mem: RoomPlan[] = [];

function rowToPlan(r: RoomPlanRow): RoomPlan {
  return {
    id: r.id,
    customerId: r.customer_id || "",
    customerName: r.customer_name || "",
    lineUserId: r.line_user_id || undefined,
    name: r.name || "แพ็กห้องรายเดือน",
    items: Array.isArray(r.items) ? r.items : [],
    fullPrice: Number(r.full_price) || 0,
    discountPct: Number(r.discount_pct) || 0,
    price: Number(r.price) || 0,
    installments: Math.max(1, Number(r.installments) || 1),
    payments: Array.isArray(r.payments) ? r.payments : [],
    status: r.status === "cancelled" ? "cancelled" : "active",
    createdAt: r.created_at,
  };
}

function planToRow(p: RoomPlan): RoomPlanRow & { tenant_id: string } {
  return {
    id: p.id,
    tenant_id: requireTenantId(),
    customer_id: p.customerId,
    customer_name: p.customerName,
    line_user_id: p.lineUserId || null,
    name: p.name,
    items: p.items,
    full_price: p.fullPrice,
    discount_pct: p.discountPct,
    price: p.price,
    installments: p.installments,
    payments: p.payments,
    status: p.status,
    created_at: p.createdAt,
  };
}

/** ตั้งค่าส่วนลดของร้าน */
export async function roomPlanSettings() {
  const biz = (await getSiteConfig()).business;
  const pct = Number(biz.roomPlanDiscountPct);
  const min = Number(biz.roomPlanMinNights);
  return {
    discountPct: Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : 30,
    minNights: Number.isFinite(min) && min > 0 ? Math.round(min) : 30,
  };
}

/**
 * คิดราคาจากราคาห้องจริงในตั้งค่า (ไม่เชื่อราคาที่หน้าเว็บส่งมา)
 * discountPct ไม่ส่ง = ใช้ค่าร้าน (เฉพาะเมื่อรวมคืนครบขั้นต่ำ ไม่ครบ = ไม่ลด)
 */
export async function quoteRoomPlan(
  picks: { roomType: string; nights: number }[],
  discountPct?: number
) {
  const cfg = await getSiteConfig();
  const settings = await roomPlanSettings();
  const items: RoomPlanItem[] = [];
  for (const p of picks) {
    const nights = Math.round(Number(p.nights) || 0);
    if (nights <= 0) continue;
    const room = (cfg.rooms || []).find((r) => r.id === p.roomType);
    if (!room) return { ok: false as const, error: "unknown_room", roomType: p.roomType };
    const existing = items.find((i) => i.roomType === room.id);
    if (existing) existing.nights += nights;
    else
      items.push({
        roomType: room.id,
        roomLabel: `ห้อง ${room.name}`,
        nights,
        unitPrice: Math.round(room.price) || 0,
      });
  }
  if (items.length === 0) return { ok: false as const, error: "no_nights" };

  const totalNights = items.reduce((n, i) => n + i.nights, 0);
  const fullPrice = items.reduce((s, i) => s + i.nights * i.unitPrice, 0);
  const pct =
    discountPct !== undefined && Number.isFinite(Number(discountPct))
      ? Math.min(100, Math.max(0, Number(discountPct)))
      : totalNights >= settings.minNights
        ? settings.discountPct
        : 0;
  const price = Math.round((fullPrice * (100 - pct)) / 100);
  return { ok: true as const, items, totalNights, fullPrice, discountPct: pct, price, settings };
}

async function savePlan(p: RoomPlan) {
  const sb = getSupabase();
  if (sb) {
    let { error } = await sb.from("room_plans").upsert(planToRow(p));
    if (error) {
      const { ensureMigration } = await import("./migrations");
      if (await ensureMigration("room_plans.setup")) {
        ({ error } = await sb.from("room_plans").upsert(planToRow(p)));
      }
    }
    if (error) throw new Error("need_sql");
    return;
  }
  const i = mem.findIndex((x) => x.id === p.id);
  if (i >= 0) mem[i] = p;
  else mem.unshift(p);
}

export async function getRoomPlan(id: string): Promise<RoomPlan | undefined> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from("room_plans").select("*").eq("tenant_id", requireTenantId()).eq("id", id).maybeSingle();
    if (error) return undefined;
    return data ? rowToPlan(data as RoomPlanRow) : undefined;
  }
  return mem.find((p) => p.id === id);
}

export async function listCustomerRoomPlans(customerId: string): Promise<RoomPlan[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("room_plans")
      .select("*").eq("tenant_id", requireTenantId())
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error) return [];
    return ((data as RoomPlanRow[] | null) || []).map(rowToPlan);
  }
  return mem.filter((p) => p.customerId === customerId);
}

/** ยอดจ่าย/งวด/คืนคงเหลือ — คำนวณสดทุกครั้ง ไม่เก็บซ้ำ (กันตัวเลขไม่ตรงกัน) */
export function viewRoomPlan(p: RoomPlan, packages: CustomerPackage[]): RoomPlanView {
  const paid = p.payments.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const remaining = Math.max(0, p.price - paid);
  const installmentsLeft = remaining <= 0 ? 0 : Math.max(1, p.installments - p.payments.length);
  const nextInstallment = installmentsLeft > 0 ? Math.ceil(remaining / installmentsLeft) : 0;
  const kind = p.items.length ? "room" : "package";
  const nights =
    kind === "room"
      ? p.items.map((it) => {
          const pkg = packages.find((x) => x.id === it.packageId);
          const total = pkg?.totalUses ?? it.nights;
          const used = pkg?.usedUses ?? 0;
          return {
            roomType: it.roomType,
            roomLabel: it.roomLabel,
            total,
            used,
            left: pkg && pkg.status === "cancelled" ? 0 : Math.max(0, total - used),
            unit: "night" as const,
          };
        })
      : packages
          .filter((x) => x.planId === p.id)
          .map((pkg) => ({
            roomType: pkg.id,
            roomLabel: pkg.name,
            total: pkg.totalUses,
            used: pkg.usedUses,
            left: pkg.status === "cancelled" ? 0 : Math.max(0, pkg.totalUses - pkg.usedUses),
            unit: pkg.unit === "night" ? ("night" as const) : ("use" as const),
          }));
  return { ...p, paid, remaining, installmentsLeft, nextInstallment, kind, nights };
}

export async function viewCustomerRoomPlans(customerId: string): Promise<RoomPlanView[]> {
  const [plans, packages] = await Promise.all([
    listCustomerRoomPlans(customerId),
    listCustomerPackages(customerId),
  ]);
  return plans.map((p) => viewRoomPlan(p, packages));
}

/** ขายแพ็กห้องรายเดือน — สร้างคอร์สคืนแยกตามห้อง + รับเงินงวดแรก (ถ้ามี) */
export async function createRoomPlan(data: {
  customerId: string;
  customerName: string;
  lineUserId?: string;
  picks: { roomType: string; nights: number }[];
  discountPct?: number;
  installments?: number;
  firstPayment?: number;
  paymentMethod?: "transfer" | "cash";
}) {
  const q = await quoteRoomPlan(data.picks, data.discountPct);
  if (!q.ok) return q;

  const plan: RoomPlan = {
    id: `RP${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    customerId: data.customerId,
    customerName: data.customerName,
    lineUserId: data.lineUserId,
    name: `แพ็กห้องรายเดือน ${q.totalNights} คืน`,
    items: q.items,
    fullPrice: q.fullPrice,
    discountPct: q.discountPct,
    price: q.price,
    installments: Math.min(12, Math.max(1, Math.round(Number(data.installments) || 1))),
    payments: [],
    status: "active",
    createdAt: new Date().toISOString(),
  };
  // บันทึกแพ็กก่อน — ถ้าฐานข้อมูลยังไม่พร้อมจะได้ล้มก่อนสร้างคอร์สให้ลูกค้า
  await savePlan(plan);

  // แบ่งราคาให้แต่ละคอร์สตามสัดส่วนราคาเต็ม (ไว้โชว์มูลค่า ไม่ใช่รายรับ — รายรับลงตามงวด)
  let allocated = 0;
  for (let i = 0; i < plan.items.length; i++) {
    const it = plan.items[i];
    const share =
      i === plan.items.length - 1
        ? plan.price - allocated
        : Math.round((plan.price * it.nights * it.unitPrice) / Math.max(1, plan.fullPrice));
    allocated += share;
    const pkg = await sellPackage({
      customerId: plan.customerId,
      customerName: plan.customerName,
      name: `${it.roomLabel} · แพ็กรายเดือน`,
      totalUses: it.nights,
      price: share,
      unit: "night",
      roomType: it.roomType,
      roomLabel: it.roomLabel,
      planId: plan.id,
      noIncome: true,
    });
    it.packageId = pkg.id;
  }
  await savePlan(plan);

  let payment: Awaited<ReturnType<typeof receiveRoomPlanPayment>> | undefined;
  const first = Math.round(Number(data.firstPayment) || 0);
  if (first > 0) payment = await receiveRoomPlanPayment(plan.id, first, data.paymentMethod);

  return { ok: true as const, plan: (await getRoomPlan(plan.id)) || plan, payment };
}

/**
 * ขายคอร์สทั่วไปแบบแบ่งจ่าย (เช่น อาบน้ำ 10 ครั้ง ผ่อน 3 งวด)
 * สร้างแผนจ่าย + คอร์สที่ผูกแผน (ยังใช้ไม่ได้จนกว่าจะจ่ายครบ) แล้วรับงวดแรกถ้ามี
 */
export async function createPackagePlan(data: {
  customerId: string;
  customerName: string;
  lineUserId?: string;
  name: string;
  totalUses: number;
  price: number;
  groomProgram?: string;
  installments: number;
  firstPayment?: number;
  paymentMethod?: "transfer" | "cash";
}) {
  const price = Math.max(0, Math.round(Number(data.price) || 0));
  if (price <= 0) return { ok: false as const, error: "price_required" };
  const plan: RoomPlan = {
    id: `RP${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    customerId: data.customerId,
    customerName: data.customerName,
    lineUserId: data.lineUserId,
    name: data.name,
    items: [],
    fullPrice: price,
    discountPct: 0,
    price,
    installments: Math.min(12, Math.max(1, Math.round(Number(data.installments) || 1))),
    payments: [],
    status: "active",
    createdAt: new Date().toISOString(),
  };
  // บันทึกแผนก่อน — ถ้าฐานข้อมูลยังไม่พร้อมจะได้ล้มก่อนสร้างคอร์สที่ไม่ล็อก
  await savePlan(plan);
  const pkg = await sellPackage({
    customerId: plan.customerId,
    customerName: plan.customerName,
    name: data.name,
    totalUses: data.totalUses,
    price,
    groomProgram: data.groomProgram,
    planId: plan.id,
    noIncome: true,
  });

  let payment: Awaited<ReturnType<typeof receiveRoomPlanPayment>> | undefined;
  const first = Math.round(Number(data.firstPayment) || 0);
  if (first > 0) payment = await receiveRoomPlanPayment(plan.id, first, data.paymentMethod);
  return { ok: true as const, plan: (await getRoomPlan(plan.id)) || plan, pkg, payment };
}

const busy = new Set<string>();

/** รับเงินงวด — ลงรายรับตามวันที่รับจริง ไม่เกินยอดค้าง */
export async function receiveRoomPlanPayment(
  planId: string,
  amount: number,
  method: "transfer" | "cash" = "transfer"
) {
  if (busy.has(planId)) return { ok: false as const, error: "busy" };
  busy.add(planId);
  try {
    const plan = await getRoomPlan(planId);
    if (!plan || plan.status !== "active") return { ok: false as const, error: "not_found" };
    const paidBefore = plan.payments.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const due = Math.max(0, plan.price - paidBefore);
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) return { ok: false as const, error: "bad_amount" };
    if (due <= 0) return { ok: false as const, error: "nothing_due" };
    if (amt > due) return { ok: false as const, error: "over_due", due };

    const date = bangkokToday();
    plan.payments = [
      ...plan.payments,
      { amount: amt, date, method, at: new Date().toISOString() },
    ];
    await savePlan(plan);

    const n = plan.payments.length;
    await addFinanceEntry({
      type: "income",
      amount: amt,
      category: "คอร์ส/แพ็กเกจ",
      description: `${plan.customerName} — ${plan.name} ${
        plan.installments > 1 ? `งวดที่ ${n}/${Math.max(plan.installments, n)}` : "ชำระ"
      }${method === "cash" ? " (เงินสด)" : ""}`,
      date,
      customerId: plan.customerId,
    });

    const packages = await listCustomerPackages(plan.customerId);
    return { ok: true as const, amount: amt, view: viewRoomPlan(plan, packages) };
  } finally {
    busy.delete(planId);
  }
}

/**
 * แพ็กนี้ยังค้างจ่ายอยู่ไหม — นโยบายร้าน: ต้องจ่ายครบทุกงวดก่อนถึงจะเริ่มใช้คืนได้
 * คืนยอดค้าง (0 = จ่ายครบ ใช้ได้) · หาแพ็กไม่เจอถือว่าไม่ล็อก (คอร์สเก่าที่ไม่ได้มาจากแพ็ก)
 */
export async function roomPlanOutstanding(planId?: string): Promise<number> {
  if (!planId) return 0;
  const plan = await getRoomPlan(planId);
  if (!plan) return 0;
  const paid = plan.payments.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  return Math.max(0, plan.price - paid);
}

/** ยกเลิกแพ็ก — ปิดคอร์สคืนที่ยังเหลือ (เงินที่รับมาแล้วไม่ถูกลบ ร้านคืนเงินเองถ้าต้องการ) */
export async function cancelRoomPlan(planId: string) {
  const plan = await getRoomPlan(planId);
  if (!plan) return { ok: false as const, error: "not_found" };
  for (const it of plan.items) if (it.packageId) await cancelPackage(it.packageId);
  if (!plan.items.length) {
    for (const pkg of await listCustomerPackages(plan.customerId)) {
      if (pkg.planId === plan.id) await cancelPackage(pkg.id);
    }
  }
  plan.status = "cancelled";
  await savePlan(plan);
  return { ok: true as const };
}
