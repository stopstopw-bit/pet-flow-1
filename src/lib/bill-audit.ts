/**
 * ตรวจบิลเทียบกับนัดทั้งร้าน — หาบิลซ้ำ / คิดคืนเกินช่วงที่พักจริง / รายรับเกินยอดบิล
 *
 * ที่มา: บั๊กเก่าทำให้นัดเดิมโผล่ใน "ดึงจากนัด" ให้ออกบิลซ้ำได้ (บิลน้องตัวเดียวลงชื่อน้องตัวแรก
 * ของบ้าน) และบิลต่อคืนรุ่นก่อนเคยนับคืนซ้ำ — ร้านต้องการให้ "บิลตรงกับนัด"
 * ฟังก์ชันนี้แค่ชี้จุดที่น่าสงสัย ไม่แก้อะไรเอง ร้านเป็นคนกดลบบิลที่ซ้ำ (ลงถังขยะ กู้คืนได้)
 */
import { groupForBilling } from "./booking-group";
import { isRoomLine, nightsBetweenIso, tidyServiceText } from "./stay-line";

type AuditInvoice = {
  id: string;
  customerName: string;
  catName: string;
  items: { label: string; amount: number; qty?: number; kind?: string }[];
  total: number;
  status: "pending" | "paid";
  paidAt?: string;
  createdAt: string;
  bookingId?: string;
};

type AuditBooking = {
  id: string;
  customerName: string;
  catName: string;
  service: string;
  status: string;
  date?: string;
  time?: string;
  checkin?: string;
  checkout?: string;
};

type AuditIncome = { invoiceId?: string; type: string; amount: number };

export type BillSummary = {
  id: string;
  catName: string;
  label: string;
  total: number;
  status: "pending" | "paid";
  date: string;
  /** รายรับที่ลงบัญชีผูกกับบิลนี้ (มัดจำ + ยอดชำระ) */
  income: number;
};

export type AuditIssue = {
  key: string;
  kind: "duplicate" | "over_nights" | "over_income";
  customerName: string;
  /** อธิบายสั้นๆ ว่าผิดตรงไหน */
  message: string;
  /** ช่วงพักจริงตามนัด (ถ้าเกี่ยว) */
  stay?: { checkin: string; checkout: string; nights: number; billedNights: number };
  bookings: { id: string; catName: string; status: string; when: string }[];
  bills: BillSummary[];
  /** บิลที่น่าจะเป็นตัวซ้ำ — ร้านกดลบได้ */
  suspectIds: string[];
};

const day = (s?: string) => (s || "").slice(0, 10);
const nameKey = (s: string) => (s || "").trim().toLowerCase();

/** คืนที่บิลคิด — บิลบ้านหลายห้องมีบรรทัดห้องหลายบรรทัด ใช้บรรทัดที่คืนมากสุด (แบบเดียวกับ stay-sync) */
export function billNights(inv: AuditInvoice): number {
  return (inv.items || [])
    // บรรทัดห้องเก่าที่ถูกแก้บิลจนเหลือ "ห้อง X × 7" (ไม่มีคำว่าคืน) ก็นับเป็นค่าห้องด้วย
    .filter((it) => isRoomLine({ ...it, label: tidyServiceText(it.label) }))
    .reduce((m, it) => Math.max(m, Math.round(Number(it.qty) || 1)), 0);
}

/** ลายเซ็นของบิล: รายการ + ยอด — บิลสองใบที่ลายเซ็นตรงกันทุกอย่างคือบิลเดียวกันที่ออกซ้ำ */
function signature(inv: AuditInvoice): string {
  const lines = (inv.items || [])
    .map((it) => `${(it.label || "").trim()}=${Math.round(it.amount || 0)}`)
    .sort()
    .join("|");
  return `${nameKey(inv.catName)}#${inv.total}#${lines}`;
}

export function auditBills(
  invoices: AuditInvoice[],
  bookings: AuditBooking[],
  finance: AuditIncome[]
): AuditIssue[] {
  const incomeOf = new Map<string, number>();
  for (const f of finance) {
    if (f.type !== "income" || !f.invoiceId) continue;
    incomeOf.set(f.invoiceId, (incomeOf.get(f.invoiceId) || 0) + (f.amount || 0));
  }
  const summary = (inv: AuditInvoice): BillSummary => ({
    id: inv.id,
    catName: inv.catName,
    label: inv.items.map((i) => i.label).join(", "),
    total: inv.total,
    status: inv.status,
    date: day(inv.paidAt || inv.createdAt),
    income: incomeOf.get(inv.id) || 0,
  });
  const byOldest = (a: AuditInvoice, b: AuditInvoice) =>
    (a.paidAt || a.createdAt).localeCompare(b.paidAt || b.createdAt);

  const live = bookings.filter((b) => b.status !== "cancelled");
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  // กลุ่มนัด = การมาครั้งเดียวกันของบ้านนั้น (พักช่วงเหลื่อมกัน / อาบน้ำวันเดียวกัน)
  const clusters = groupForBilling(live);
  const clusterOf = new Map<string, number>();
  clusters.forEach((g, i) => g.forEach((b) => clusterOf.set(b.id, i)));
  // บิลที่ผูกกับนัดที่ยกเลิกไปแล้ว → ยึดกลุ่มตามวันของนัดนั้นแทน (กันหลุดการตรวจ)
  const clusterOfBill = (inv: AuditInvoice): string | undefined => {
    if (!inv.bookingId) return undefined;
    const c = clusterOf.get(inv.bookingId);
    if (c !== undefined) return `c${c}`;
    const bk = bookingById.get(inv.bookingId);
    return bk ? `x${nameKey(bk.customerName)}|${day(bk.checkin || bk.date)}` : `b${inv.bookingId}`;
  };

  const issues: AuditIssue[] = [];
  const flagged = new Set<string>();
  const bookingRows = (list: AuditBooking[]) =>
    list.map((b) => ({
      id: b.id,
      catName: b.catName,
      status: b.status,
      when: b.checkin && b.checkout ? `${day(b.checkin)} → ${day(b.checkout)}` : `${day(b.date)} ${b.time || ""}`.trim(),
    }));

  // ── 1) บิลซ้ำ: ลูกค้าเดียวกัน รายการ+ยอดตรงกันทุกอย่าง และผูกกับการมาครั้งเดียวกัน ──
  const dupGroups = new Map<string, AuditInvoice[]>();
  for (const inv of invoices) {
    const c = clusterOfBill(inv);
    if (!c) continue;
    const k = `${nameKey(inv.customerName)}|${c}|${signature(inv)}`;
    dupGroups.set(k, [...(dupGroups.get(k) || []), inv]);
  }
  for (const [k, list] of dupGroups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort(byOldest);
    const c = clusterOf.get(sorted[0].bookingId!);
    const related = c !== undefined ? clusters[c] : [];
    issues.push({
      key: `dup:${k}`,
      kind: "duplicate",
      customerName: sorted[0].customerName,
      message: `บิลรายการและยอดเหมือนกัน ${list.length} ใบ ในการมาครั้งเดียวกัน`,
      bookings: bookingRows(related),
      bills: sorted.map(summary),
      suspectIds: sorted.slice(1).map((i) => i.id),
    });
    sorted.forEach((i) => flagged.add(i.id));
  }

  // ── 2) คิดคืนเกินช่วงที่พักจริง: รวมคืนทุกบิลของการพักครั้งนั้น > จำนวนคืนตามนัด ──
  const billsByCluster = new Map<number, AuditInvoice[]>();
  for (const inv of invoices) {
    const c = inv.bookingId ? clusterOf.get(inv.bookingId) : undefined;
    if (c === undefined) continue;
    billsByCluster.set(c, [...(billsByCluster.get(c) || []), inv]);
  }
  for (const [c, bills] of billsByCluster) {
    const group = clusters[c];
    if (!group[0].checkin || !group[0].checkout) continue;
    const checkin = group.map((b) => day(b.checkin)).sort()[0];
    const checkout = group.map((b) => day(b.checkout)).sort().slice(-1)[0];
    const nights = nightsBetweenIso(checkin, checkout);
    // บ้านหลายตัว บิลเก่าออกแยกรายตัวได้ (ตัวละใบ คืนเท่ากัน) — เพดานจึงคูณจำนวนตัว
    // บ้านตัวเดียว = ต้องตรงจำนวนคืนเป๊ะ
    const cats = new Set(group.map((b) => nameKey(b.catName))).size || 1;
    const cap = nights * cats;
    const billed = bills.reduce((s, i) => s + billNights(i), 0);
    if (nights <= 0 || billed <= cap) continue;
    // บิลที่ดูซ้ำอยู่แล้วในข้อ 1 ไม่ต้องขึ้นซ้ำ ถ้าตัดตัวซ้ำออกแล้วคืนพอดี
    const dupExtra = issues
      .filter((x) => x.kind === "duplicate" && bills.some((b) => x.suspectIds.includes(b.id)))
      .flatMap((x) => x.suspectIds)
      .reduce((s, id) => s + billNights(bills.find((b) => b.id === id) || ({ items: [] } as never)), 0);
    if (billed - dupExtra <= cap) continue;
    issues.push({
      key: `nights:${c}`,
      kind: "over_nights",
      customerName: group[0].customerName,
      message:
        cats > 1
          ? `พักจริง ${nights} คืน ${cats} ตัว แต่บิลรวมกันคิด ${billed} คืน (เกิน ${billed - cap} คืน)`
          : `พักจริง ${nights} คืน แต่บิลรวมกันคิด ${billed} คืน (เกิน ${billed - nights} คืน)`,
      stay: { checkin, checkout, nights, billedNights: billed },
      bookings: bookingRows(group),
      bills: [...bills].sort(byOldest).map(summary),
      suspectIds: [],
    });
  }

  // ── 3) รายรับเกินยอดบิล: กดรับเงิน/มัดจำซ้ำ ──
  for (const inv of invoices) {
    const income = incomeOf.get(inv.id) || 0;
    if (income <= inv.total || flagged.has(inv.id)) continue;
    const c = inv.bookingId ? clusterOf.get(inv.bookingId) : undefined;
    issues.push({
      key: `income:${inv.id}`,
      kind: "over_income",
      customerName: inv.customerName,
      message: `บิล ${inv.total.toLocaleString()} บาท แต่ลงรายรับไว้ ${income.toLocaleString()} บาท (เกิน ${(income - inv.total).toLocaleString()})`,
      bookings: bookingRows(c !== undefined ? clusters[c] : []),
      bills: [summary(inv)],
      suspectIds: [],
    });
  }

  return issues;
}
