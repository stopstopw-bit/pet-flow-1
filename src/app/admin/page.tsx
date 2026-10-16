"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminJson } from "@/lib/admin-fetch";
import { DateRangePicker } from "@/components/DateRangePicker";
import { resolveRange, type RangeId } from "@/lib/date-range";
import { IconChip, ListRowContent } from "@/components/HeaderBand";
import { Icon } from "@/components/Icon";

type Stats = {
  today: string;
  queue: number;
  todayAppointments: number;
  todayConfirmed: number;
  salesToday: {
    total: number;
    count: number;
    creditTotal: number;
    creditCount: number;
    grossTotal: number;
    pending: number;
  };
  salesMonth: { total: number; count: number; pending: number };
  financeToday: { income: number; expense: number; net: number };
  financeMonth: { income: number; expense: number; net: number };
};

type Tasks = { unpaidCount: number; unpaidDue: number; pendingConsent: number };

/** นัดของวันนี้ที่โชว์ในแดชบอร์ด (อ่านอย่างเดียว จาก /api/bookings ที่โหลดอยู่แล้ว) */
type TodayItem = {
  id: string;
  kind: "groom" | "checkin" | "checkout";
  time: string;
  catName: string;
  customerName: string;
  status: string;
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [tasks, setTasks] = useState<Tasks | null>(null);
  const [todayItems, setTodayItems] = useState<TodayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  /** ช่วงเวลาของตัวเลขยอดขาย/บัญชี — คิว "รอยืนยัน" กับ "นัดวันนี้" ยึดวันนี้เสมอ */
  const [rangeId, setRangeId] = useState<RangeId>("today");
  const [customRange, setCustomRange] = useState(() => {
    const t = new Date().toISOString().slice(0, 10);
    return { from: t, to: t };
  });
  const range = resolveRange(rangeId, new Date().toISOString().slice(0, 10), customRange);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await adminJson<{ stats: Stats }>(
      `/api/admin/stats?from=${range.from}&to=${range.to}`
    );
    if (res.ok && res.data.stats) {
      setStats(res.data.stats);
    } else {
      setStats(null);
      setError(res.ok ? "โหลดสถิติไม่สำเร็จ" : res.error);
    }
    // งานที่ต้องทำ — บิลค้าง + ลูกค้ายังไม่กดยอมรับเงื่อนไข
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [invR, bkR] = await Promise.all([
        fetch("/api/invoices").then((r) => r.json()),
        fetch("/api/bookings").then((r) => r.json()),
      ]);
      const invs = (invR.invoices || []) as { status: string; total: number; deposit?: number }[];
      const bks = (bkR.bookings || []) as {
        id?: string;
        service?: string;
        date?: string;
        time?: string;
        checkin?: string;
        checkout?: string;
        arrivalTime?: string;
        pickupTime?: string;
        catName?: string;
        customerName?: string;
        consentAcceptedAt?: string;
        status?: string;
      }[];
      // นัดวันนี้ — นับแบบเดียวกับตัวเลข "นัดวันนี้" (date/checkin = วันนี้) + น้องที่ออกวันนี้
      const items: TodayItem[] = [];
      for (const b of bks) {
        if (b.status === "cancelled") continue;
        const base = {
          id: b.id || "",
          catName: b.catName || "-",
          customerName: b.customerName || "",
          status: b.status || "",
        };
        if (b.service === "room") {
          if ((b.checkin || b.date) === today)
            items.push({ ...base, kind: "checkin", time: b.arrivalTime || b.time || "" });
          if (b.checkout === today)
            items.push({ ...base, id: `${base.id}-out`, kind: "checkout", time: b.pickupTime || "" });
        } else if (b.date === today) {
          items.push({ ...base, kind: "groom", time: b.time || "" });
        }
      }
      items.sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
      setTodayItems(items);
      const pending = invs.filter((i) => i.status === "pending");
      setTasks({
        unpaidCount: pending.length,
        unpaidDue: pending.reduce((s, i) => s + (i.total - (i.deposit || 0)), 0),
        pendingConsent: bks.filter(
          (b) =>
            b.service === "room" &&
            b.status !== "cancelled" &&
            (b.checkin || "") >= today &&
            !b.consentAcceptedAt
        ).length,
      });
    } catch {
      setTasks(null);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="py-10 text-center text-sm text-brown-soft">กำลังโหลด…</p>;
  }

  if (!stats) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm font-bold text-wait">{error || "โหลดไม่สำเร็จ"}</p>
        <button
          type="button"
          onClick={load}
          className="mt-4 rounded-petflow-sm bg-honey/40 px-4 py-2 text-xs font-bold"
        >
          🔄 ลองใหม่
        </button>
      </div>
    );
  }

  const hasTasks =
    stats.queue > 0 || (tasks && (tasks.unpaidCount > 0 || tasks.pendingConsent > 0));

  return (
    <div className="space-y-6">
      {/* การ์ดสรุป — เกยขึ้นไปบนแถบหัว */}
      <section className="relative rounded-petflow bg-card p-5 shadow-petflow">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">
              Revenue · {range.label}
            </p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight text-petflow-chocolate">
              {stats.financeToday.income.toLocaleString()}
              <span className="ml-1 text-base font-bold text-latte-deep">฿</span>
            </p>
            <p className="mt-0.5 text-[11px] text-brown-soft">
              {
                // ใช้ยอดจากบัญชีรายรับ ไม่ใช่เฉพาะบิล — ขายคอร์ส/เติมเครดิตก็คือเงินเข้าเหมือนกัน
                // (เมื่อก่อนการ์ดนี้นับเฉพาะบิล เลยไม่ตรงกับ "สุทธิ" ที่นับทุกอย่าง)
                [
                  `${stats.salesToday.count} บิล`,
                  stats.salesToday.creditTotal > 0
                    ? `ตัดเครดิต ${stats.salesToday.creditTotal.toLocaleString()} ฿`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ")
              }
            </p>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-honey/35 text-petflow-chocolate">
            <Icon name="wallet" size={22} />
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 divide-x divide-petflow-line rounded-petflow-sm bg-paper/70 py-3 text-center">
          <MiniStat label="Net" value={`${stats.financeToday.net.toLocaleString()} ฿`} sub={
            stats.financeToday.expense > 0
              ? `หักจ่าย ${stats.financeToday.expense.toLocaleString()}`
              : "ยังไม่มีรายจ่าย"
          } />
          <MiniStat label="Today" value={String(stats.todayAppointments)} sub={`ยืนยัน ${stats.todayConfirmed}`} />
          <MiniStat label="Pending" value={String(stats.queue)} sub="รอยืนยัน" highlight={stats.queue > 0} />
        </div>
        <div className="mt-3">
          <DateRangePicker
            value={rangeId}
            onChange={setRangeId}
            custom={customRange}
            onCustomChange={setCustomRange}
          />
        </div>
      </section>

      {/* เมนูลัด — 4 อย่างที่ใช้บ่อยสุด (ที่เหลืออยู่ในปุ่ม Menu ด้านล่าง) */}
      <nav aria-label="เมนูลัด" className="grid grid-cols-4 gap-2">
        <Link href="/admin/billing"><IconChip icon="card" label="คิดเงิน" tone="honey" /></Link>
        <Link href="/admin/pending"><IconChip icon="inbox" label="รอยืนยัน" tone="latte" badge={stats.queue || undefined} /></Link>
        <Link href="/admin/finance"><IconChip icon="wallet" label="รายรับ-จ่าย" tone="sage" /></Link>
        <Link href="/admin/insights"><IconChip icon="chart" label="สรุปข้อมูล" tone="paper" /></Link>
      </nav>

      {/* งานที่ต้องทำ */}
      {hasTasks && (
        <section>
          <SectionTitle title="To-do" sub="งานที่ต้องทำ" />
          <div className="divide-y divide-petflow-line rounded-petflow bg-card px-4 shadow-petflow-sm">
            {stats.queue > 0 && (
              <Link href="/admin/pending" className="block py-3">
                <ListRowContent icon="inbox" title="นัดรอยืนยัน" sub="ลูกค้ายังไม่กดยืนยัน" value={`${stats.queue} นัด`} valueClass="text-wait" />
              </Link>
            )}
            {tasks && tasks.unpaidCount > 0 && (
              <Link href="/admin/billing" className="block py-3">
                <ListRowContent icon="card" title="บิลค้างชำระ" sub={`${tasks.unpaidCount} บิล`} value={`${tasks.unpaidDue.toLocaleString()} ฿`} valueClass="text-wait" />
              </Link>
            )}
            {tasks && tasks.pendingConsent > 0 && (
              <Link href="/admin/schedule" className="block py-3">
                <ListRowContent icon="doc" title="ยังไม่กดยอมรับเงื่อนไข" sub="ห้องพักที่กำลังจะมาถึง" value={`${tasks.pendingConsent} คน`} valueClass="text-latte-deep" />
              </Link>
            )}
          </div>
        </section>
      )}

      {/* นัดวันนี้ */}
      <section>
        <SectionTitle
          title="Today"
          sub={`นัดวันนี้ ${todayItems.length} รายการ`}
          action={<Link href="/admin/schedule" className="text-xs font-bold text-latte-deep">ดูตารางนัด</Link>}
        />
        {todayItems.length === 0 ? (
          <div className="flex flex-col items-center rounded-petflow bg-card px-4 py-8 text-center shadow-petflow-sm">
            <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-paper text-brown-soft">
              <Icon name="paw" size={24} />
            </span>
            <p className="text-sm font-bold text-brown">วันนี้ยังไม่มีนัด</p>
            <p className="text-xs text-brown-soft">กดปุ่ม + ด้านล่างเพื่อจองให้ลูกค้า</p>
          </div>
        ) : (
          <ul className="divide-y divide-petflow-line rounded-petflow bg-card px-4 shadow-petflow-sm">
            {todayItems.slice(0, 8).map((it) => (
              <li key={it.id} className="flex items-center gap-3 py-3">
                <span className="w-11 shrink-0 text-center text-xs font-extrabold text-petflow-chocolate">
                  {it.time || "–"}
                </span>
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    it.kind === "groom" ? "bg-sage/30" : it.kind === "checkin" ? "bg-honey/35" : "bg-latte/30"
                  } text-petflow-chocolate`}
                >
                  <Icon name={it.kind === "groom" ? "bath" : "bed"} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-petflow-chocolate">{it.catName}</span>
                  <span className="block truncate text-[11px] text-brown-soft">
                    {it.kind === "groom" ? "อาบน้ำ" : it.kind === "checkin" ? "เช็คอิน" : "เช็คเอาท์"} · {it.customerName}
                  </span>
                </span>
                {it.status === "pending" ? (
                  <span className="shrink-0 rounded-full bg-wait/15 px-2 py-0.5 text-[10px] font-bold text-wait">รอยืนยัน</span>
                ) : it.status === "confirmed" ? (
                  <span className="shrink-0 rounded-full bg-ok/15 px-2 py-0.5 text-[10px] font-bold text-ok">ยืนยันแล้ว</span>
                ) : null}
              </li>
            ))}
            {todayItems.length > 8 && (
              <li className="py-3 text-center">
                <Link href="/admin/schedule" className="text-xs font-bold text-latte-deep">
                  ดูอีก {todayItems.length - 8} รายการ
                </Link>
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

function SectionTitle({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-end justify-between gap-3 px-1">
      <div>
        <h2 className="text-base font-extrabold text-petflow-chocolate">{title}</h2>
        {sub ? <p className="text-[11px] text-brown-soft">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div className="min-w-0 px-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-brown-soft">{label}</p>
      <p className={`truncate text-base font-extrabold ${highlight ? "text-wait" : "text-petflow-chocolate"}`}>
        {value}
      </p>
      <p className="truncate text-[10px] text-brown-faint">{sub}</p>
    </div>
  );
}
