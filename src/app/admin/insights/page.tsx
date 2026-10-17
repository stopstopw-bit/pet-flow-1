"use client";

import { useEffect, useMemo, useState } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Icon } from "@/components/Icon";
import { resolveRange, inRange, type RangeId } from "@/lib/date-range";
import { SalesActions } from "@/components/SalesActions";
import type { InsightBooking } from "@/lib/sales-insights";

type Cat = { name?: string; breed?: string; birthday?: string };
type Customer = {
  id: string;
  name: string;
  cats: Cat[];
  lineUserId?: string;
  marketingConsent?: boolean;
  isMember?: boolean;
  tier?: string;
  createdAt?: string;
  /** ลูกค้ารู้จักร้านจากไหน (กรอกตอนสมัคร) — ใช้วัดว่าช่องทางไหนได้ผล */
  referralSource?: string;
};
type Invoice = {
  customerId?: string;
  customerName: string;
  status: string;
  total: number;
  discount?: number;
  promoId?: string;
  promoLabel?: string;
  paidAt?: string;
  createdAt?: string;
  items?: { label: string; amount: number; kind?: string }[];
};
type Pkg = {
  id: string;
  customerId?: string;
  name: string;
  price: number;
  totalUses: number;
  usedUses: number;
  status: string;
  unit?: "use" | "night";
  createdAt: string;
};
type PromoStat = { id: string; title: string; uses: number; discount: number };

function Bar({ label, value, max, suffix }: { label: string; value: number; max: number; suffix?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="text-xs">
      <div className="mb-0.5 flex justify-between">
        <span className="min-w-0 truncate font-bold text-brown">{label}</span>
        <span className="shrink-0 font-extrabold text-latte-deep">
          {value.toLocaleString()}
          {suffix || ""}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-paper">
        <div className="h-full rounded-full bg-latte-deep/70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-petflow bg-card p-4 shadow-petflow-sm">
      <h2 className="mb-3 flex items-center gap-2.5 text-sm font-extrabold text-petflow-chocolate">
        {icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-honey/30">
            <Icon name={icon} size={16} />
          </span>
        )}
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function InsightsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [promoStats, setPromoStats] = useState<PromoStat[]>([]);
  const [bookings, setBookings] = useState<InsightBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeId, setRangeId] = useState<RangeId>("all");
  const [customRange, setCustomRange] = useState(() => {
    const t = new Date().toISOString().slice(0, 10);
    return { from: t, to: t };
  });
  const range = resolveRange(rangeId, new Date().toISOString().slice(0, 10), customRange);

  useEffect(() => {
    Promise.all([
      fetch("/api/customers").then((r) => r.json()),
      fetch("/api/invoices").then((r) => r.json()),
      fetch("/api/packages?all=1").then((r) => r.json()).catch(() => ({ packages: [] })),
      fetch("/api/coupons/stats").then((r) => r.json()).catch(() => ({ perPromo: [] })),
      fetch("/api/bookings").then((r) => r.json()).catch(() => ({ bookings: [] })),
    ])
      .then(([c, i, p, cp, b]) => {
        setBookings(b.bookings || []);
        setCustomers(c.customers || []);
        setInvoices(i.invoices || []);
        setPackages(p.packages || []);
        setPromoStats(cp.perPromo || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const cats = customers.flatMap((c) => c.cats || []);
    const members = customers.filter((c) => c.isMember).length;

    // พันธุ์แมวยอดฮิต
    const breedMap = new Map<string, number>();
    for (const cat of cats) {
      const b = (cat.breed || "").trim() || "ไม่ระบุ";
      breedMap.set(b, (breedMap.get(b) || 0) + 1);
    }
    const breeds = [...breedMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    // บริการขายดี (จากบิลที่จ่ายแล้ว)
    // ชื่อรายการในบิลมีรูปแบบ "🐱 ชื่อน้อง · บริการ · พันธุ์ · ไซส์"
    // ต้องตัดคำนำหน้าชื่อน้องออกก่อน ไม่งั้นจะไปนับชื่อแมวเป็นชื่อบริการ
    // นับเฉพาะช่วงที่เลือก — บิลใช้วันที่จ่าย ลูกค้า/คอร์สใช้วันที่สร้าง
    const paid = invoices.filter(
      (i) => i.status === "paid" && inRange(i.paidAt || i.createdAt, range)
    );
    const svcMap = new Map<string, number>();
    for (const inv of paid) {
      for (const it of inv.items || []) {
        if (it.amount <= 0) continue;
        const key =
          (it.label || "")
            .replace(/^🐱\s.+?\s·\s/, "")
            .split(" · ")[0]
            .split(" ×")[0]
            .trim() || "อื่นๆ";
        svcMap.set(key, (svcMap.get(key) || 0) + 1);
      }
    }
    const services = [...svcMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    // ลูกค้าใช้จ่ายสูงสุด
    const spendMap = new Map<string, { name: string; total: number }>();
    for (const inv of paid) {
      const key = inv.customerId || inv.customerName;
      const cur = spendMap.get(key) || { name: inv.customerName, total: 0 };
      cur.total += inv.total;
      spendMap.set(key, cur);
    }
    const topSpenders = [...spendMap.values()].sort((a, b) => b.total - a.total).slice(0, 8);
    const revenuePaid = paid.reduce((s, i) => s + i.total, 0);

    // ── คอร์สที่ขายได้ ──
    const soldPkgs = packages.filter(
      (p) => p.status !== "cancelled" && inRange(p.createdAt, range)
    );
    const pkgMap = new Map<string, { name: string; sold: number; revenue: number; unit: string }>();
    for (const p of soldPkgs) {
      const cur = pkgMap.get(p.name) || {
        name: p.name,
        sold: 0,
        revenue: 0,
        unit: p.unit === "night" ? "คืน" : "ครั้ง",
      };
      cur.sold += 1;
      cur.revenue += p.price || 0;
      pkgMap.set(p.name, cur);
    }
    const coursesSold = [...pkgMap.values()].sort((a, b) => b.sold - a.sold);
    const courseRevenue = coursesSold.reduce((s, c) => s + c.revenue, 0);
    // สิทธิ์ที่ขายไปแล้วแต่ลูกค้ายังไม่ได้ใช้ = ภาระที่ร้านต้องให้บริการในอนาคต
    const courseUnitsLeft = soldPkgs.reduce(
      (n, p) => n + Math.max(0, p.totalUses - p.usedUses),
      0
    );

    // ── ลูกค้ารู้จักร้านจากไหน ──
    const srcMap = new Map<string, number>();
    for (const c of customers) {
      if (!inRange(c.createdAt, range)) continue;
      const key = (c.referralSource || "").trim() || "ไม่ได้ระบุ";
      srcMap.set(key, (srcMap.get(key) || 0) + 1);
    }
    const sources = [...srcMap.entries()].sort((a, b) => b[1] - a[1]);
    const knownSources = sources.filter(([k]) => k !== "ไม่ได้ระบุ");

    // ── ค่าโปรที่จ่ายไป ──
    const promoRows = promoStats.filter((p) => p.uses > 0 || p.discount > 0);
    const promoCost = promoRows.reduce((s, p) => s + p.discount, 0);
    const discountTotal = paid.reduce((s, i) => s + (i.discount || 0), 0);

    return {
      coursesSold,
      courseRevenue,
      courseUnitsLeft,
      sources,
      knownSources,
      promoRows,
      promoCost,
      discountTotal,
      totalCustomers: customers.length,
      totalCats: cats.length,
      members,
      breeds,
      services,
      topSpenders,
      revenuePaid,
      paidCount: paid.length,
    };
  }, [customers, invoices, packages, promoStats, range.from, range.to]);

  if (loading) {
    return <p className="py-10 text-center text-sm text-brown-soft">กำลังโหลด…</p>;
  }

  const maxBreed = stats.breeds[0]?.[1] || 1;
  const maxSvc = stats.services[0]?.[1] || 1;
  const maxSpend = stats.topSpenders[0]?.total || 1;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Insights</p>
        <h1 className="text-xl font-extrabold text-petflow-chocolate">สรุปข้อมูลร้าน</h1>
      </div>

      <SalesActions customers={customers} invoices={invoices} bookings={bookings} packages={packages} />

      <div className="pt-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Details</p>
        <h2 className="text-base font-extrabold text-petflow-chocolate">ข้อมูลตามช่วงเวลา</h2>
      </div>

      <DateRangePicker
        value={rangeId}
        onChange={setRangeId}
        custom={customRange}
        onCustomChange={setCustomRange}
      />
      <p className="text-[10px] text-brown-faint">ช่วงที่ดู: {range.label}</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-petflow-sm bg-card p-4 shadow-petflow-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-honey/30 text-petflow-chocolate">
            <Icon name="users" size={18} />
          </span>
          <p className="mt-2 text-xl font-extrabold text-petflow-chocolate">{stats.totalCustomers}</p>
          <p className="text-[11px] font-bold text-brown-soft">ลูกค้า · {stats.totalCats} แมว</p>
        </div>
        <div className="rounded-petflow-sm bg-card p-4 shadow-petflow-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sage/30 text-petflow-chocolate">
            <Icon name="money" size={18} />
          </span>
          <p className="mt-2 text-xl font-extrabold text-petflow-chocolate">
            {stats.revenuePaid.toLocaleString()} ฿
          </p>
          <p className="text-[11px] font-bold text-brown-soft">
            ยอดขายรวม · {stats.paidCount} บิล · {stats.members} member
          </p>
        </div>
      </div>

      <Card icon="paw" title="พันธุ์แมวยอดฮิต (ใช้ตัดสินใจทำสินค้า)">
        {stats.breeds.length ? (
          <div className="space-y-2">
            {stats.breeds.map(([b, n]) => (
              <Bar key={b} label={b} value={n} max={maxBreed} suffix=" ตัว" />
            ))}
          </div>
        ) : (
          <p className="text-xs text-brown-faint">ยังไม่มีข้อมูลพันธุ์</p>
        )}
      </Card>

      <Card icon="sparkle" title="บริการขายดี">
        {stats.services.length ? (
          <div className="space-y-2">
            {stats.services.map(([s, n]) => (
              <Bar key={s} label={s} value={n} max={maxSvc} suffix=" ครั้ง" />
            ))}
          </div>
        ) : (
          <p className="text-xs text-brown-faint">ยังไม่มีบิลที่จ่ายแล้ว</p>
        )}
      </Card>

      <Card icon="star" title="ลูกค้าใช้จ่ายสูงสุด">
        {stats.topSpenders.length ? (
          <div className="space-y-2">
            {stats.topSpenders.map((s, i) => (
              <Bar key={i} label={`${i + 1}. ${s.name}`} value={s.total} max={maxSpend} suffix=" ฿" />
            ))}
          </div>
        ) : (
          <p className="text-xs text-brown-faint">ยังไม่มีข้อมูล</p>
        )}
      </Card>

      <Card icon="ticket" title="คอร์ส/แพ็กเกจที่ขายได้">
        {stats.coursesSold.length ? (
          <>
            <div className="mb-2 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-petflow-sm bg-paper p-2">
                <p className="text-sm font-extrabold text-latte-deep">
                  {stats.courseRevenue.toLocaleString()} ฿
                </p>
                <p className="text-[10px] text-brown-soft">รายได้จากคอร์ส</p>
              </div>
              <div className="rounded-petflow-sm bg-paper p-2">
                <p className="text-sm font-extrabold text-wait">{stats.courseUnitsLeft}</p>
                <p className="text-[10px] text-brown-soft">สิทธิ์ค้างที่ต้องให้บริการ</p>
              </div>
            </div>
            <div className="space-y-2">
              {stats.coursesSold.map((c) => (
                <Bar
                  key={c.name}
                  label={`${c.name} · ${c.revenue.toLocaleString()} ฿`}
                  value={c.sold}
                  max={stats.coursesSold[0]?.sold || 1}
                  suffix=" ชุด"
                />
              ))}
            </div>
            <p className="mt-2 text-[10px] text-brown-faint">
              &quot;สิทธิ์ค้าง&quot; คือครั้ง/คืนที่ลูกค้าจ่ายมาแล้วแต่ยังไม่ได้ใช้ —
              เป็นบริการที่ร้านติดค้างอยู่ ไม่ใช่กำไรที่ใช้ได้เลย
            </p>
          </>
        ) : (
          <p className="text-xs text-brown-faint">ช่วงนี้ยังไม่มีคอร์สที่ขายได้</p>
        )}
      </Card>

      <Card icon="gift" title="โปรโมชั่น — ใช้ไปเท่าไหร่ เสียส่วนลดเท่าไหร่">
        {stats.promoRows.length ? (
          <>
            <div className="mb-2 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-petflow-sm bg-paper p-2">
                <p className="text-sm font-extrabold text-wait">
                  {stats.promoCost.toLocaleString()} ฿
                </p>
                <p className="text-[10px] text-brown-soft">ส่วนลดจากโปร</p>
              </div>
              <div className="rounded-petflow-sm bg-paper p-2">
                <p className="text-sm font-extrabold text-brown">
                  {stats.discountTotal.toLocaleString()} ฿
                </p>
                <p className="text-[10px] text-brown-soft">ส่วนลดรวมทุกแบบ (ช่วงนี้)</p>
              </div>
            </div>
            <div className="space-y-2">
              {stats.promoRows.map((p) => (
                <Bar
                  key={p.id}
                  label={`${p.title} · ลดไป ${p.discount.toLocaleString()} ฿`}
                  value={p.uses}
                  max={stats.promoRows[0]?.uses || 1}
                  suffix=" ครั้ง"
                />
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-brown-faint">ยังไม่มีโปรที่ถูกใช้</p>
        )}
      </Card>

      <Card icon="users" title="ลูกค้ารู้จักร้านจากไหน">
        {stats.knownSources.length ? (
          <>
            <div className="space-y-2">
              {stats.sources.map(([src, n]) => (
                <Bar
                  key={src}
                  label={src}
                  value={n}
                  max={stats.sources[0]?.[1] || 1}
                  suffix=" คน"
                />
              ))}
            </div>
            <p className="mt-2 text-[10px] text-brown-faint">
              ช่องทางที่ได้ลูกค้าเยอะสุดคือที่ควรลงแรง/ลงเงินต่อ
            </p>
          </>
        ) : (
          <p className="text-xs text-brown-faint">
            ยังไม่มีใครกรอกว่ารู้จักร้านจากไหน — เปิดช่องนี้ในหน้าสมัครสมาชิกเพื่อเก็บข้อมูล
          </p>
        )}
      </Card>

      <p className="text-center text-[10px] text-brown-faint">
        คำนวณจากบิลที่ชำระแล้ว + ข้อมูลลูกค้าในระบบ
      </p>
    </div>
  );
}
