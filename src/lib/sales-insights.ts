/**
 * วิเคราะห์ยอดขาย + แบ่งกลุ่มลูกค้าเพื่อ "ลงมือทำ" — ไม่ใช่แค่ดูตัวเลข
 * ทุกกลุ่มบอกว่าใคร กี่คน ควรส่งข้อความอะไร และน่าจะได้ยอดกลับมาประมาณเท่าไหร่
 * ฟังก์ชันล้วน (ไม่เรียก API) ใช้ได้ทั้งฝั่งหน้าเว็บและทดสอบ
 */

import { parseBroadcastActions, type BroadcastActionId } from "@/lib/broadcast-constants";

export type InsightCustomer = {
  id: string;
  name: string;
  createdAt?: string;
  lineUserId?: string;
  marketingConsent?: boolean;
  cats: { name?: string; birthday?: string }[];
};

export type InsightInvoice = {
  customerId?: string;
  customerName: string;
  status: string;
  total: number;
  paidAt?: string;
  createdAt?: string;
  deletedAt?: string;
  items?: { amount: number; kind?: string }[];
};

export type InsightBooking = {
  customerId?: string;
  service: "groom" | "room";
  status: string;
  date: string;
  checkin?: string;
  time?: string;
};

export type InsightPackage = {
  customerId?: string;
  status: string;
  totalUses: number;
  usedUses: number;
};

export type SegmentPerson = { id: string; name: string; detail: string; hasLine: boolean };

export type ActionSegment = {
  id: string;
  title: string;
  why: string;
  action: string;
  people: SegmentPerson[];
  /** ยอดที่น่าจะได้กลับมา ถ้ามีคนตอบรับตามอัตราที่คาด */
  potential: number;
  message: { title: string; body: string; actions: BroadcastActionId[] };
};

const DAY = 86400000;
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${a.slice(0, 10)}T00:00:00Z`).getTime()) / DAY);

const REVENUE_KINDS: { id: string; label: string }[] = [
  { id: "grooming", label: "อาบน้ำ/กรูมมิ่ง" },
  { id: "room", label: "ห้องพัก" },
  { id: "product", label: "สินค้า" },
  { id: "package", label: "คอร์ส/แพ็กเกจ" },
  { id: "other", label: "บริการอื่น" },
];

function kindOf(kind?: string) {
  if (kind === "grooming" || kind === "room" || kind === "product" || kind === "package") return kind;
  return "other";
}

type Profile = {
  c: InsightCustomer;
  spend: number;
  bills: number;
  visitDays: Set<string>;
  lastVisit: string | null;
  lastGroom: string | null;
  groom: boolean;
  stay: boolean;
  futureGroom: boolean;
  activePackage: boolean;
};

/**
 * ข้อความตั้งต้นที่ส่งตามลูกค้าแต่ละกลุ่ม (ปุ่มในการ์ด "กลุ่มลูกค้าที่ควรทัก")
 * ร้านแก้เองได้ในหน้าปรับการ์ด → config.cards.followUp.texts.<id>Title / <id>Body
 */
export const FOLLOW_UP_MESSAGES: {
  id: string;
  label: string;
  title: string;
  body: string;
  /** ปุ่มตั้งต้นในการ์ด (id จาก BROADCAST_ACTIONS) */
  actions: BroadcastActionId[];
}[] = [
  {
    id: "due-groom",
    label: "ถึงรอบอาบน้ำแล้ว ยังไม่ได้จอง",
    title: "ถึงรอบอาบน้ำน้องแล้วนะคะ 🛁",
    body: "น้องอาบน้ำครั้งล่าสุดเมื่อเดือนที่แล้ว จองคิวรอบถัดไปได้เลยค่ะ คิวสุดสัปดาห์เต็มไว จองล่วงหน้าได้ที่ปุ่มด้านล่าง",
    actions: ["grooming", "line_chat"],
  },
  {
    id: "at-risk",
    label: "ลูกค้าประจำที่เริ่มหาย",
    title: "คิดถึงน้องจังเลยค่ะ 🧡",
    body: "ไม่ได้เจอน้องนานแล้ว ร้านมีส่วนลดพิเศษสำหรับลูกค้าประจำ ใช้ได้ทั้งอาบน้ำและฝากพักภายในเดือนนี้ค่ะ",
    actions: ["grooming", "rooms", "line_chat"],
  },
  {
    id: "lost",
    label: "ลูกค้าที่หายไปนาน (เกิน 4 เดือน)",
    title: "ของขวัญสำหรับน้องที่เราคิดถึง 🎁",
    body: "กลับมาใช้บริการภายใน 30 วัน รับส่วนลดพิเศษสำหรับลูกค้าเก่าทันทีค่ะ",
    actions: ["grooming", "rooms", "line_chat"],
  },
  {
    id: "never-came",
    label: "สมัครแล้ว แต่ยังไม่เคยมาใช้บริการ",
    title: "ลองครั้งแรก ลดพิเศษ ✨",
    body: "ขอบคุณที่สมัครสมาชิกนะคะ ครั้งแรกที่มาใช้บริการรับส่วนลดพิเศษ จองคิวได้เลยที่ปุ่มด้านล่างค่ะ",
    actions: ["grooming", "rooms", "line_chat"],
  },
  {
    id: "groom-only",
    label: "อาบน้ำอย่างเดียว ยังไม่เคยฝากพัก",
    title: "ไปเที่ยววันหยุดยาว ฝากน้องกับเราได้นะคะ 🏨",
    body: "ห้องพักแอร์ มีกล้องดูน้องได้ทั้งวัน พี่เลี้ยงคนเดิมที่น้องคุ้นเคย จองล่วงหน้าได้เลยค่ะ",
    actions: ["rooms", "line_chat"],
  },
  {
    id: "stay-only",
    label: "ฝากพักอย่างเดียว ยังไม่เคยอาบน้ำ",
    title: "รับน้องกลับบ้านแบบตัวหอม 🫧",
    body: "ครั้งหน้าที่ฝากพัก เพิ่มอาบน้ำก่อนวันรับกลับได้ในราคาพิเศษค่ะ",
    actions: ["grooming", "line_chat"],
  },
  {
    id: "vip-course",
    label: "ลูกค้า VIP ที่ยังไม่มีคอร์ส",
    title: "คอร์สสุดคุ้มสำหรับลูกค้าคนพิเศษ 💎",
    body: "ซื้อคอร์สอาบน้ำล่วงหน้า คุ้มกว่าจ่ายทีละครั้ง และได้คิวก่อนใครค่ะ",
    actions: ["line_chat"],
  },
  {
    id: "birthday",
    label: "น้องเกิดเดือนนี้",
    title: "สุขสันต์วันเกิดน้องนะคะ 🎂",
    body: "เดือนเกิดน้อง รับของขวัญพิเศษจากร้านเมื่อมาใช้บริการภายในเดือนนี้ค่ะ",
    actions: ["grooming", "line_chat"],
  },
];

/** key ใน config.cards.followUp.texts ของแต่ละกลุ่ม */
export const followUpKey = (id: string, part: "Title" | "Body" | "Buttons") => `${id}${part}`;

/** ปุ่มของกลุ่มนั้น — ร้านตั้งไว้ (รวมตั้งเป็น "ไม่มีปุ่ม" ได้) หรือค่าตั้งต้น */
export function followUpActions(id: string, texts?: Record<string, string>): BroadcastActionId[] {
  const raw = texts?.[followUpKey(id, "Buttons")];
  if (raw === undefined) return FOLLOW_UP_MESSAGES.find((m) => m.id === id)?.actions || [];
  return parseBroadcastActions(raw);
}

function followUpMessage(id: string, texts?: Record<string, string>) {
  const d = FOLLOW_UP_MESSAGES.find((m) => m.id === id)!;
  return {
    title: texts?.[followUpKey(id, "Title")]?.trim() || d.title,
    body: texts?.[followUpKey(id, "Body")]?.trim() || d.body,
    actions: followUpActions(id, texts),
  };
}

export function analyzeSales(input: {
  customers: InsightCustomer[];
  invoices: InsightInvoice[];
  bookings: InsightBooking[];
  packages: InsightPackage[];
  today: string;
  /** ข้อความที่ร้านแก้เองในหน้าปรับการ์ด (config.cards.followUp.texts) */
  followUpTexts?: Record<string, string>;
}) {
  const { customers, bookings, packages, today } = input;
  const invoices = input.invoices.filter((i) => i.status === "paid" && !i.deletedAt);
  const dateOf = (i: InsightInvoice) => (i.paidAt || i.createdAt || "").slice(0, 10);

  // ── โปรไฟล์ลูกค้าแต่ละคน ──
  const profiles = new Map<string, Profile>();
  for (const c of customers) {
    profiles.set(c.id, {
      c,
      spend: 0,
      bills: 0,
      visitDays: new Set(),
      lastVisit: null,
      lastGroom: null,
      groom: false,
      stay: false,
      futureGroom: false,
      activePackage: false,
    });
  }
  const byName = new Map(customers.map((c) => [c.name.trim(), c.id]));
  const profileFor = (customerId?: string, name?: string) =>
    profiles.get(customerId || "") || profiles.get(byName.get((name || "").trim()) || "");

  for (const inv of invoices) {
    const p = profileFor(inv.customerId, inv.customerName);
    if (!p) continue;
    const d = dateOf(inv);
    p.spend += inv.total;
    p.bills += 1;
    if (d) p.visitDays.add(d);
    for (const it of inv.items || []) {
      if (it.kind === "grooming") {
        p.groom = true;
        if (d && (!p.lastGroom || d > p.lastGroom)) p.lastGroom = d;
      }
      if (it.kind === "room") p.stay = true;
    }
  }
  for (const b of bookings) {
    const p = profileFor(b.customerId);
    if (!p) continue;
    const d = (b.date || b.checkin || "").slice(0, 10);
    if (!d) continue;
    const live = b.status !== "cancelled" && b.status !== "no_show";
    if (b.service === "groom" && live && d >= today) p.futureGroom = true;
    if (b.status !== "ready" && b.status !== "done") continue;
    p.visitDays.add(d);
    if (b.service === "groom") {
      p.groom = true;
      if (!p.lastGroom || d > p.lastGroom) p.lastGroom = d;
    } else {
      p.stay = true;
    }
  }
  for (const pk of packages) {
    const p = profiles.get(pk.customerId || "");
    if (p && pk.status !== "cancelled" && pk.usedUses < pk.totalUses) p.activePackage = true;
  }
  for (const p of profiles.values()) {
    p.lastVisit = p.visitDays.size ? [...p.visitDays].sort().at(-1)! : null;
  }
  const all = [...profiles.values()];

  // ── ภาพรวมยอดขาย ──
  const ym = today.slice(0, 7);
  const monthKey = (offset: number) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + offset, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const months = Array.from({ length: 6 }, (_, i) => monthKey(i - 5));
  const monthly = months.map((m) => {
    const list = invoices.filter((i) => dateOf(i).startsWith(m));
    return { month: m, revenue: list.reduce((s, i) => s + i.total, 0), bills: list.length };
  });
  const thisMonth = monthly[5];
  const lastMonth = monthly[4];
  // เทียบแบบยุติธรรม: เดือนนี้ถึงวันนี้ กับเดือนก่อนช่วงวันเดียวกัน
  const dayOfMonth = Number(today.slice(8, 10));
  const lastMonthToDate = invoices
    .filter((i) => dateOf(i).startsWith(lastMonth.month) && Number(dateOf(i).slice(8, 10)) <= dayOfMonth)
    .reduce((s, i) => s + i.total, 0);
  const growthPct = lastMonthToDate > 0 ? Math.round(((thisMonth.revenue - lastMonthToDate) / lastMonthToDate) * 100) : null;

  const totalRevenue = invoices.reduce((s, i) => s + i.total, 0);
  const avgBill = invoices.length ? Math.round(totalRevenue / invoices.length) : 0;
  const buyers = all.filter((p) => p.bills > 0);
  const repeatRate = buyers.length ? Math.round((buyers.filter((p) => p.visitDays.size >= 2).length / buyers.length) * 100) : 0;
  const avgSpendPerCustomer = buyers.length ? Math.round(totalRevenue / buyers.length) : 0;

  // สัดส่วนรายได้ 90 วันล่าสุด แยกตามประเภท
  const since90 = new Date(new Date(`${today}T00:00:00Z`).getTime() - 90 * DAY).toISOString().slice(0, 10);
  const mixMap = new Map<string, number>();
  for (const inv of invoices) {
    if (dateOf(inv) < since90) continue;
    for (const it of inv.items || []) {
      if (it.amount <= 0) continue;
      const k = kindOf(it.kind);
      mixMap.set(k, (mixMap.get(k) || 0) + it.amount);
    }
  }
  const mixTotal = [...mixMap.values()].reduce((s, n) => s + n, 0);
  const mix = REVENUE_KINDS.map((k) => ({
    ...k,
    amount: mixMap.get(k.id) || 0,
    pct: mixTotal ? Math.round(((mixMap.get(k.id) || 0) / mixTotal) * 100) : 0,
  })).filter((k) => k.amount > 0);

  // 80/20 — ลูกค้า 20% บนทำยอดกี่ %
  const sortedSpend = buyers.map((p) => p.spend).sort((a, b) => b - a);
  const topN = Math.max(1, Math.ceil(sortedSpend.length * 0.2));
  const topShare = totalRevenue > 0 ? Math.round((sortedSpend.slice(0, topN).reduce((s, n) => s + n, 0) / totalRevenue) * 100) : 0;

  // วันไหนคิวอาบน้ำว่าง (90 วันล่าสุด)
  const weekdayNames = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];
  const weekday = weekdayNames.map((name) => ({ name, count: 0 }));
  for (const b of bookings) {
    if (b.service !== "groom" || b.status === "cancelled" || b.status === "no_show") continue;
    if (!b.date || b.date < since90 || b.date > today) continue;
    weekday[new Date(`${b.date}T12:00:00Z`).getUTCDay()].count += 1;
  }

  // ── กลุ่มลูกค้าที่ควรทำอะไรต่อ ──
  const hasLine = (c: InsightCustomer) => !!c.lineUserId && c.marketingConsent !== false;
  const person = (p: Profile, detail: string): SegmentPerson => ({
    id: p.c.id,
    name: p.c.name,
    detail,
    hasLine: hasLine(p.c),
  });
  const ago = (d: string | null) => (d ? `มาล่าสุด ${daysBetween(d, today)} วันก่อน` : "ยังไม่เคยมา");
  const potential = (n: number, rate: number, value = avgBill) => Math.round(n * rate * (value || 0));
  const segments: ActionSegment[] = [];

  const dueGroom = all.filter(
    (p) => p.lastGroom && !p.futureGroom && daysBetween(p.lastGroom, today) >= 25 && daysBetween(p.lastGroom, today) <= 60
  );
  segments.push({
    id: "due-groom",
    title: "ถึงรอบอาบน้ำแล้ว ยังไม่ได้จอง",
    why: "อาบน้ำครั้งล่าสุด 25–60 วันก่อน และยังไม่มีนัดใหม่ — ช่วงนี้ลูกค้าตอบรับง่ายที่สุด",
    action: "ส่งข้อความเตือนจองรอบถัดไป",
    people: dueGroom.map((p) => person(p, `อาบล่าสุด ${daysBetween(p.lastGroom!, today)} วันก่อน`)),
    potential: potential(dueGroom.length, 0.4),
    message: followUpMessage("due-groom", input.followUpTexts),
  });

  const atRisk = all.filter((p) => p.visitDays.size >= 2 && p.lastVisit && daysBetween(p.lastVisit, today) > 45 && daysBetween(p.lastVisit, today) <= 120);
  segments.push({
    id: "at-risk",
    title: "ลูกค้าประจำที่เริ่มหาย",
    why: "เคยมาตั้งแต่ 2 ครั้งขึ้นไป แต่หายไป 45–120 วัน — ถ้าไม่ทักตอนนี้มีโอกาสเสียไปให้ร้านอื่น",
    action: "ส่งคูปองชวนกลับมา",
    people: atRisk.map((p) => person(p, ago(p.lastVisit))),
    potential: potential(atRisk.length, 0.25),
    message: followUpMessage("at-risk", input.followUpTexts),
  });

  const lost = all.filter((p) => p.lastVisit && daysBetween(p.lastVisit, today) > 120);
  segments.push({
    id: "lost",
    title: "ลูกค้าที่หายไปนาน (เกิน 4 เดือน)",
    why: "เคยมาแล้วแต่ไม่กลับมาอีก — ต้องใช้ข้อเสนอแรงกว่าปกติ",
    action: "ส่งโปรแรง ๆ ครั้งเดียว",
    people: lost.map((p) => person(p, ago(p.lastVisit))),
    potential: potential(lost.length, 0.1),
    message: followUpMessage("lost", input.followUpTexts),
  });

  const neverCame = all.filter((p) => p.visitDays.size === 0 && p.bills === 0 && (!p.c.createdAt || daysBetween(p.c.createdAt, today) >= 3));
  segments.push({
    id: "never-came",
    title: "สมัครแล้ว แต่ยังไม่เคยมาใช้บริการ",
    why: "สนใจร้านแล้วแต่ยังไม่ตัดสินใจ — โปรครั้งแรกช่วยปิดการขายได้ดี",
    action: "ส่งโปรลูกค้าใหม่",
    people: neverCame.map((p) => person(p, p.c.createdAt ? `สมัคร ${daysBetween(p.c.createdAt, today)} วันก่อน` : "ยังไม่เคยมา")),
    potential: potential(neverCame.length, 0.2),
    message: followUpMessage("never-came", input.followUpTexts),
  });

  const groomOnly = all.filter((p) => p.groom && !p.stay);
  segments.push({
    id: "groom-only",
    title: "อาบน้ำอย่างเดียว ยังไม่เคยฝากพัก",
    why: "ไว้ใจร้านอยู่แล้ว — ชวนใช้ห้องพักช่วงเที่ยว/วันหยุดยาว ยอดต่อบิลสูงกว่ามาก",
    action: "แนะนำห้องพัก",
    people: groomOnly.map((p) => person(p, `อาบน้ำมาแล้ว ${p.visitDays.size} ครั้ง`)),
    potential: potential(groomOnly.length, 0.1, avgBill * 2),
    message: followUpMessage("groom-only", input.followUpTexts),
  });

  const stayOnly = all.filter((p) => p.stay && !p.groom);
  segments.push({
    id: "stay-only",
    title: "ฝากพักอย่างเดียว ยังไม่เคยอาบน้ำ",
    why: "ขายอาบน้ำเพิ่มตอนวันรับกลับได้ง่าย — น้องกลับบ้านตัวหอม",
    action: "แนะนำอาบน้ำก่อนรับกลับ",
    people: stayOnly.map((p) => person(p, `ฝากพักมาแล้ว ${p.visitDays.size} ครั้ง`)),
    potential: potential(stayOnly.length, 0.2),
    message: followUpMessage("stay-only", input.followUpTexts),
  });

  const spendCut = sortedSpend[topN - 1] ?? Infinity;
  const vipNoPkg = buyers.filter((p) => p.spend >= spendCut && p.visitDays.size >= 3 && !p.activePackage);
  segments.push({
    id: "vip-course",
    title: "ลูกค้า VIP ที่ยังไม่มีคอร์ส",
    why: `ลูกค้า 20% บนทำยอด ${topShare}% ของร้าน — ขายคอร์สล่วงหน้าได้เงินก้อนและผูกให้กลับมาประจำ`,
    action: "เสนอคอร์ส/สมาชิก",
    people: vipNoPkg.map((p) => person(p, `ยอดรวม ${Math.round(p.spend).toLocaleString()} ฿ · ${p.visitDays.size} ครั้ง`)),
    potential: potential(vipNoPkg.length, 0.3, avgBill * 5),
    message: followUpMessage("vip-course", input.followUpTexts),
  });

  const mm = today.slice(5, 7);
  const bday = all.filter((p) => p.c.cats.some((cat) => (cat.birthday || "").slice(5, 7) === mm));
  segments.push({
    id: "birthday",
    title: "น้องเกิดเดือนนี้",
    why: "ข้อความวันเกิดเปิดอ่านสูงมาก — แนบของขวัญเล็ก ๆ ลูกค้าประทับใจและกลับมาใช้บริการ",
    action: "ส่งคำอวยพร + ของขวัญ",
    people: bday.map((p) =>
      person(
        p,
        p.c.cats
          .filter((cat) => (cat.birthday || "").slice(5, 7) === mm)
          .map((cat) => `${cat.name || "น้อง"} (${Number(cat.birthday!.slice(8, 10))})`)
          .join(", ")
      )
    ),
    potential: potential(bday.length, 0.3),
    message: followUpMessage("birthday", input.followUpTexts),
  });

  // ── คำแนะนำอัตโนมัติ เรียงตามยอดที่น่าจะได้ ──
  const tips: string[] = [];
  const ranked = segments.filter((s) => s.people.length > 0).sort((a, b) => b.potential - a.potential);
  for (const s of ranked.slice(0, 3)) {
    tips.push(`${s.action} ให้กลุ่ม "${s.title}" ${s.people.length} คน — น่าจะได้ยอดกลับมา ~${s.potential.toLocaleString()} ฿`);
  }
  const bookedDays = weekday.filter((d) => d.count > 0);
  if (bookedDays.length >= 3) {
    const quiet = [...weekday].sort((a, b) => a.count - b.count)[0];
    const busy = [...weekday].sort((a, b) => b.count - a.count)[0];
    tips.push(`วัน${quiet.name}คิวอาบน้ำว่างที่สุด (${quiet.count} คิวใน 90 วัน เทียบวัน${busy.name} ${busy.count} คิว) — ลองทำโปร "วัน${quiet.name}ลดพิเศษ" ดึงลูกค้าจากวันที่แน่น`);
  }
  if (repeatRate > 0 && repeatRate < 40) {
    tips.push(`ลูกค้ากลับมาซ้ำแค่ ${repeatRate}% — ส่งข้อความเตือนรอบอาบน้ำหลังใช้บริการ 4 สัปดาห์ จะช่วยให้กลับมาซ้ำมากขึ้น`);
  }
  const groomMix = mix.find((k) => k.id === "grooming");
  const productMix = mix.find((k) => k.id === "product");
  if (groomMix && groomMix.pct >= 50 && (!productMix || productMix.pct < 10)) {
    tips.push(`รายได้ส่วนใหญ่มาจากอาบน้ำ (${groomMix.pct}%) แต่สินค้าขายได้น้อย — วางสินค้าขายดีไว้ตรงจุดรับน้องกลับ หรือแนะนำตอนออกบิล`);
  }
  if (growthPct !== null && growthPct < -10) {
    tips.push(`ยอดเดือนนี้ตกจากช่วงเดียวกันของเดือนก่อน ${Math.abs(growthPct)}% — เริ่มจากกลุ่ม "ถึงรอบอาบน้ำ" และ "ลูกค้าประจำที่เริ่มหาย" ก่อน`);
  }

  return {
    monthly,
    thisMonth,
    growthPct,
    avgBill,
    repeatRate,
    avgSpendPerCustomer,
    topShare,
    mix,
    weekday,
    segments,
    tips,
    buyers: buyers.length,
  };
}
