import { listBookings } from "./bookings-store";
import { listInvoices } from "./invoices-store";
import { listBookingOps } from "./booking-ops-store";
import { groomRevenueByBooking, listEmployees, monthRange } from "./payroll-store";

/**
 * ผลงานพนักงาน — ดูว่าช่างแต่ละคนทำเงินให้ร้านเท่าไร ลูกค้ากลับมาซ้ำไหม ขายของเพิ่มได้ไหม
 * ไม่มีเงินเดือนในนี้ (เงินเดือนอยู่หน้าเงินเดือน) — ช่างของแต่ละนัดมาจากบอร์ดคิว (booking_ops.groomer)
 */
export type StaffStat = {
  id: string;
  name: string;
  cats: number;
  prevCats: number;
  revenue: number;
  prevRevenue: number;
  avgPerCat: number;
  /** ยอดสินค้า/บริการเสริมในบิลของนัดที่ช่างคนนี้ทำ */
  upsell: number;
  /** % ของน้องที่ทำ (ถึงวันนี้ไม่น้อยกว่า 7 วัน) ที่ลูกค้าจองอาบน้ำครั้งต่อไปแล้ว */
  rebookPct: number | null;
  /** สัดส่วนงานอาบน้ำของร้านเดือนนี้ */
  share: number;
};

export type StaffPerformance = {
  month: string;
  stats: StaffStat[];
  /** นัดอาบน้ำที่ทำเสร็จแต่ไม่ได้เลือกช่าง — ผลงานไม่ถูกนับให้ใคร */
  unassigned: number;
  totalCats: number;
  /** งานดูแลที่ติ๊กในเดือน แยกตามชื่อคนติ๊ก */
  careChecks: { name: string; count: number }[];
  tips: string[];
};

const UPSELL_KINDS = new Set(["product", "service", "custom", "package"]);

function prevMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function computeStaffPerformance(month: string, today: string): Promise<StaffPerformance> {
  const cur = monthRange(month);
  const prev = monthRange(prevMonth(month));
  const [employees, bookings, invoices] = await Promise.all([listEmployees(), listBookings(), listInvoices()]);

  const isDone = (b: (typeof bookings)[number]) =>
    b.service === "groom" && (b.status === "ready" || b.status === "done");
  const inMonth = (d: string | undefined, r: { from: string; to: string }) =>
    (d || "") >= r.from && (d || "") <= r.to;

  const groomedCur = bookings.filter((b) => isDone(b) && inMonth(b.date, cur));
  const groomedPrev = bookings.filter((b) => isDone(b) && inMonth(b.date, prev));
  const ops = await listBookingOps([...groomedCur, ...groomedPrev].map((b) => b.id));
  const groomerOf = new Map(ops.filter((o) => o.groomer).map((o) => [o.bookingId, o.groomer!]));
  const revenueOf = groomRevenueByBooking(bookings, invoices);

  // ของขายเพิ่มในบิลเดียวกับนัดอาบน้ำ — นับให้ช่างของนัดที่ผูกกับบิล
  const upsellOf = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.status !== "paid" || inv.deletedAt || !inv.bookingId) continue;
    const extra = (inv.items || [])
      .filter((it) => it.kind && UPSELL_KINDS.has(it.kind))
      .reduce((s, it) => s + (Number(it.amount) || 0), 0);
    if (extra > 0) upsellOf.set(inv.bookingId, (upsellOf.get(inv.bookingId) || 0) + extra);
  }

  // จองครั้งต่อไปแล้วหรือยัง — ตัวเดียวกัน (ลูกค้า+ชื่อน้อง) มีนัดอาบน้ำหลังจากนี้ที่ไม่ถูกยกเลิก
  const groomsByCat = new Map<string, string[]>();
  for (const b of bookings) {
    if (b.service !== "groom" || b.status === "cancelled" || b.status === "no_show") continue;
    const k = `${b.customerName}|${b.catName}`;
    groomsByCat.set(k, [...(groomsByCat.get(k) || []), b.date || ""]);
  }
  const rebooked = (b: (typeof bookings)[number]) =>
    (groomsByCat.get(`${b.customerName}|${b.catName}`) || []).some((d) => d > (b.date || ""));
  const rebookCutoff = addDays(today, -7);

  const totalCats = groomedCur.length;
  const stats: StaffStat[] = employees
    .filter((e) => e.active || groomedCur.some((b) => groomerOf.get(b.id) === e.id))
    .map((e) => {
      const mine = groomedCur.filter((b) => groomerOf.get(b.id) === e.id);
      const minePrev = groomedPrev.filter((b) => groomerOf.get(b.id) === e.id);
      const revenue = mine.reduce((s, b) => s + (revenueOf.get(b.id) || 0), 0);
      const prevRevenue = minePrev.reduce((s, b) => s + (revenueOf.get(b.id) || 0), 0);
      // นับเฉพาะตัวที่ผ่านมาแล้วสักอาทิตย์ ให้ลูกค้ามีเวลาจองรอบหน้า
      const settled = [...mine, ...minePrev].filter((b) => (b.date || "") <= rebookCutoff);
      return {
        id: e.id,
        name: e.name,
        cats: mine.length,
        prevCats: minePrev.length,
        revenue,
        prevRevenue,
        avgPerCat: mine.length ? Math.round(revenue / mine.length) : 0,
        upsell: mine.reduce((s, b) => s + (upsellOf.get(b.id) || 0), 0),
        rebookPct: settled.length
          ? Math.round((settled.filter(rebooked).length / settled.length) * 100)
          : null,
        share: totalCats ? Math.round((mine.length / totalCats) * 100) : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue || b.cats - a.cats);

  const unassigned = groomedCur.filter((b) => !groomerOf.has(b.id)).length;

  const careMap = new Map<string, number>();
  const allOps = await listBookingOps();
  for (const o of allOps) {
    for (const [date, tasks] of Object.entries(o.careChecks || {})) {
      if (!inMonth(date, cur)) continue;
      for (const c of Object.values(tasks)) {
        const name = c.by || "ไม่ระบุ";
        careMap.set(name, (careMap.get(name) || 0) + 1);
      }
    }
  }
  const careChecks = [...careMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const tips: string[] = [];
  if (unassigned > 0) {
    tips.push(
      `มี ${unassigned} ตัวที่อาบเสร็จแต่ไม่ได้เลือกช่างในบอร์ดคิว ผลงานและค่าคอมเลยไม่ถูกนับให้ใคร ให้เลือกช่างทุกครั้งที่กดเริ่มทำ`
    );
  }
  const working = stats.filter((s) => s.cats > 0);
  if (working.length >= 2) {
    const topAvg = [...working].sort((a, b) => b.avgPerCat - a.avgPerCat)[0];
    const lowAvg = [...working].sort((a, b) => a.avgPerCat - b.avgPerCat)[0];
    if (topAvg.avgPerCat - lowAvg.avgPerCat >= 100) {
      tips.push(
        `${topAvg.name} ได้ยอดเฉลี่ย ${topAvg.avgPerCat.toLocaleString()} ฿/ตัว ส่วน ${lowAvg.name} ได้ ${lowAvg.avgPerCat.toLocaleString()} ฿/ตัว ลองให้ ${lowAvg.name} เสนอโปรแกรมหรือบริการเสริมแบบที่ ${topAvg.name} ทำ`
      );
    }
    const withRebook = working.filter((s) => s.rebookPct !== null);
    if (withRebook.length >= 2) {
      const best = [...withRebook].sort((a, b) => b.rebookPct! - a.rebookPct!)[0];
      const worst = [...withRebook].sort((a, b) => a.rebookPct! - b.rebookPct!)[0];
      if (best.rebookPct! - worst.rebookPct! >= 15) {
        tips.push(
          `ลูกค้าของ ${best.name} จองรอบหน้าต่อ ${best.rebookPct}% แต่ของ ${worst.name} ${worst.rebookPct}% ให้ทุกคนชวนลูกค้านัดรอบหน้าตอนส่งน้องคืน`
        );
      }
    }
    const maxShare = Math.max(...working.map((s) => s.share));
    const busiest = working.find((s) => s.share === maxShare)!;
    if (maxShare >= 60) {
      tips.push(`${busiest.name} รับงาน ${maxShare}% ของร้าน ระวังงานล้นคนเดียว ลองกระจายคิวให้คนอื่น`);
    }
  }
  const noUpsell = working.filter((s) => s.upsell === 0 && s.cats >= 5);
  if (noUpsell.length) {
    tips.push(
      `${noUpsell.map((s) => s.name).join(", ")} ยังไม่มียอดขายสินค้า/บริการเสริมเดือนนี้ ลองตั้งเป้าเสนอของเสริมให้ลูกค้าทุกตัว`
    );
  }
  if (!employees.length) {
    tips.push("ยังไม่มีรายชื่อพนักงาน เพิ่มที่หน้า เงินเดือน & ค่าคอม แล้วเลือกช่างในบอร์ดคิว ระบบจะนับผลงานให้เอง");
  }

  return { month, stats, unassigned, totalCats, careChecks, tips };
}
