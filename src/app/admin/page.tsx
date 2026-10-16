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

/** นัดวันนี้ 1 รายการ = 1 บ้าน (ระบบเก็บแถวละตัว แต่ร้านดูเป็นบ้าน) */
type TodayItem = {
  id: string;
  kind: "groom" | "checkin" | "checkout";
  time: string;
  catNames: string[];
  customerName: string;
  status: string;
};

type DayInfo = {
  /** จำนวนบ้านที่มีนัดวันนี้ (อาบน้ำ + เช็คอิน) และจำนวนน้อง */
  houses: number;
  cats: number;
  staying: number;
  checkoutToday: number;
  newCustomers: number;
  /** สถานะคิววันนี้ นับเป็นบ้าน */
  byStatus: Record<string, number>;
};

const STATUS_STRIP: { id: string; label: string; cls: string }[] = [
  { id: "pending", label: "รอยืนยัน", cls: "bg-wait/15 text-wait" },
  { id: "confirmed", label: "ยืนยันแล้ว", cls: "bg-ok/15 text-ok" },
  { id: "ready", label: "พร้อมรับกลับ", cls: "bg-honey/35 text-petflow-chocolate" },
  { id: "done", label: "เสร็จสิ้น", cls: "bg-sage/30 text-petflow-chocolate" },
  { id: "no_show", label: "ไม่มา", cls: "bg-red-50 text-red-600" },
  { id: "cancelled", label: "ยกเลิก", cls: "bg-paper text-brown-soft" },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [tasks, setTasks] = useState<Tasks | null>(null);
  const [todayItems, setTodayItems] = useState<TodayItem[]>([]);
  const [day, setDay] = useState<DayInfo | null>(null);
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
    // งานที่ต้องทำ + ภาพรวมวันนี้ — บิลค้าง, นัด, ห้องพัก, ลูกค้าใหม่
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [invR, bkR, cuR] = await Promise.all([
        fetch("/api/invoices").then((r) => r.json()),
        fetch("/api/bookings").then((r) => r.json()),
        fetch("/api/customers").then((r) => r.json()).catch(() => ({})),
      ]);
      const invs = (invR.invoices || []) as { status: string; total: number; deposit?: number }[];
      const bks = (bkR.bookings || []) as {
        id?: string;
        customerId?: string;
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
      // นัดวันนี้ — รวมน้องบ้านเดียวกัน (ลูกค้า + ประเภท + เวลาเดียวกัน) เป็นรายการเดียว
      const groups = new Map<string, TodayItem>();
      const add = (b: (typeof bks)[number], kind: TodayItem["kind"], time: string) => {
        const k = [kind, b.customerId || b.customerName, time, b.checkin, b.checkout].join("|");
        const g = groups.get(k);
        if (g) g.catNames.push(b.catName || "-");
        else
          groups.set(k, {
            id: `${b.id}-${kind}`,
            kind,
            time,
            catNames: [b.catName || "-"],
            customerName: b.customerName || "",
            status: b.status || "",
          });
      };
      let staying = 0;
      for (const b of bks) {
        if (b.service === "room") {
          if ((b.checkin || b.date) === today) add(b, "checkin", b.arrivalTime || b.time || "");
          if (b.checkout === today) add(b, "checkout", b.pickupTime || "");
          const live = b.status !== "cancelled" && b.status !== "no_show";
          if (live && (b.checkin || "") <= today && today < (b.checkout || "")) staying += 1;
        } else if (b.date === today) {
          add(b, "groom", b.time || "");
        }
      }
      const all = Array.from(groups.values());
      const byStatus: Record<string, number> = {};
      for (const g of all) if (g.kind !== "checkout") byStatus[g.status] = (byStatus[g.status] || 0) + 1;
      const active = all.filter((g) => g.status !== "cancelled");
      active.sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
      setTodayItems(active);
      const arriving = active.filter((g) => g.kind !== "checkout");
      setDay({
        houses: arriving.length,
        cats: arriving.reduce((s, g) => s + g.catNames.length, 0),
        staying,
        checkoutToday: active.filter((g) => g.kind === "checkout").length,
        newCustomers: ((cuR.customers || []) as { createdAt?: string }[]).filter(
          (c) => (c.createdAt || "").slice(0, 10) === today
        ).length,
        byStatus,
      });
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
      {/* ตัวเลขหลัก 4 ช่อง — เปิดมาเห็นเลยว่าวันนี้เป็นยังไง */}
      <section>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile
            href="/admin/finance"
            icon="wallet"
            tone="bg-honey/35"
            label={`รายได้${range.label === "วันนี้" ? "วันนี้" : ` · ${range.label}`}`}
            value={stats.financeToday.income.toLocaleString()}
            unit="฿"
            sub={`สุทธิ ${stats.financeToday.net.toLocaleString()} ฿ · ${stats.salesToday.count} บิล`}
          />
          <KpiTile
            href="/admin/schedule"
            icon="calendar"
            tone="bg-sage/30"
            label="นัดวันนี้"
            value={String(day?.houses ?? stats.todayAppointments)}
            unit="นัด"
            sub={day ? `น้อง ${day.cats} ตัว` : `ยืนยัน ${stats.todayConfirmed}`}
          />
          <KpiTile
            href="/admin/schedule"
            icon="bed"
            tone="bg-latte/30"
            label="พักอยู่ตอนนี้"
            value={String(day?.staying ?? 0)}
            unit="ตัว"
            sub={day?.checkoutToday ? `ออกวันนี้ ${day.checkoutToday} บ้าน` : "ไม่มีเช็คเอาท์วันนี้"}
          />
          <KpiTile
            href="/admin/customers"
            icon="users"
            tone="bg-paper"
            label="ลูกค้าใหม่วันนี้"
            value={String(day?.newCustomers ?? 0)}
            unit="คน"
            sub={stats.queue > 0 ? `รอยืนยัน ${stats.queue} นัด` : "ไม่มีนัดค้างยืนยัน"}
            highlight={stats.queue > 0}
          />
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

      {/* สถานะคิววันนี้ */}
      {day && (
        <section>
          <SectionTitle title="สถานะคิววันนี้" sub="นับเป็นบ้าน" />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {STATUS_STRIP.map((st) => (
              <div key={st.id} className={`rounded-petflow-sm px-2 py-2.5 text-center ${st.cls}`}>
                <p className="text-lg font-extrabold leading-none">{day.byStatus[st.id] || 0}</p>
                <p className="mt-1 text-[10px] font-bold">{st.label}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* เมนูลัด — 4 อย่างที่ใช้บ่อยสุด (ที่เหลืออยู่ในปุ่ม Menu ด้านล่าง) */}
      <nav aria-label="เมนูลัด" className="grid grid-cols-4 gap-2">
        <Link href="/admin/billing"><IconChip icon="receipt" label="ออกบิล" tone="honey" /></Link>
        <Link href="/admin/pending"><IconChip icon="inbox" label="รอยืนยัน" tone="latte" badge={stats.queue || undefined} /></Link>
        <Link href="/admin/finance"><IconChip icon="wallet" label="รายรับ-จ่าย" tone="sage" /></Link>
        {/* คิดเงิน = เปิดหน้าบิลที่ลิสต์ "รอชำระ" กดรับชำระได้เลย (สรุปข้อมูลย้ายไปอยู่ในปุ่ม Menu) */}
        <Link href="/admin/billing?view=pending"><IconChip icon="money" label="คิดเงิน" tone="paper" /></Link>
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
              <Link href="/admin/billing?view=pending" className="block py-3">
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

      {/* ไทม์ไลน์วันนี้ */}
      <section>
        <SectionTitle
          title="Timeline วันนี้"
          sub={`${todayItems.length} รายการ`}
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
          <ul className="rounded-petflow bg-card px-4 py-2 shadow-petflow-sm">
            {todayItems.slice(0, 10).map((it, i, arr) => (
              <li key={it.id} className="flex gap-3">
                <span className="w-11 shrink-0 pt-3 text-right text-xs font-extrabold text-petflow-chocolate">
                  {it.time || "–"}
                </span>
                {/* เส้นไทม์ไลน์ + จุด */}
                <span className="relative flex w-3 shrink-0 justify-center">
                  <span className={`absolute w-px bg-petflow-line ${i === 0 ? "top-4" : "top-0"} ${i === arr.length - 1 ? "h-4" : "bottom-0"}`} />
                  <span
                    className={`relative mt-3.5 h-2.5 w-2.5 rounded-full ring-2 ring-card ${
                      it.kind === "groom" ? "bg-sage" : it.kind === "checkin" ? "bg-honey-deep" : "bg-latte-deep"
                    }`}
                  />
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2 border-b border-petflow-line py-2.5 last:border-0">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-petflow-chocolate">
                      {it.catNames.join(", ")}
                    </span>
                    <span className="flex items-center gap-1 truncate text-[11px] text-brown-soft">
                      <Icon name={it.kind === "groom" ? "bath" : "bed"} size={12} />
                      {it.kind === "groom" ? "อาบน้ำ" : it.kind === "checkin" ? "เช็คอิน" : "เช็คเอาท์"} · {it.customerName}
                      {it.catNames.length > 1 ? ` · ${it.catNames.length} ตัว` : ""}
                    </span>
                  </span>
                  {it.kind !== "checkout" && it.status === "pending" ? (
                    <span className="shrink-0 rounded-full bg-wait/15 px-2 py-0.5 text-[10px] font-bold text-wait">รอยืนยัน</span>
                  ) : it.kind !== "checkout" && it.status === "confirmed" ? (
                    <span className="shrink-0 rounded-full bg-ok/15 px-2 py-0.5 text-[10px] font-bold text-ok">ยืนยันแล้ว</span>
                  ) : it.status === "no_show" ? (
                    <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">ไม่มา</span>
                  ) : null}
                </span>
              </li>
            ))}
            {todayItems.length > 10 && (
              <li className="py-3 text-center">
                <Link href="/admin/schedule" className="text-xs font-bold text-latte-deep">
                  ดูอีก {todayItems.length - 10} รายการ
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

function KpiTile({
  href,
  icon,
  tone,
  label,
  value,
  unit,
  sub,
  highlight,
}: {
  href: string;
  icon: string;
  tone: string;
  label: string;
  value: string;
  unit: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <Link href={href} className="block rounded-petflow bg-card p-4 shadow-petflow-sm transition active:scale-[0.98]">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone} text-petflow-chocolate`}>
        <Icon name={icon} size={20} />
      </span>
      <p className="mt-3 truncate text-[11px] font-bold text-brown-soft">{label}</p>
      <p className="mt-0.5 truncate text-2xl font-extrabold leading-tight tracking-tight text-petflow-chocolate">
        {value}
        <span className="ml-1 text-xs font-bold text-latte-deep">{unit}</span>
      </p>
      <p className={`mt-1 truncate text-[10px] font-bold ${highlight ? "text-wait" : "text-brown-faint"}`}>{sub}</p>
    </Link>
  );
}
