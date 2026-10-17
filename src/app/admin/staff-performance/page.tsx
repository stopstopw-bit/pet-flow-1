"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/ui";
import { bangkokToday } from "@/lib/bangkok-date";
import type { StaffPerformance, StaffStat } from "@/lib/staff-performance";

const baht = (n: number) => `฿${Math.round(n).toLocaleString()}`;

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Change({ now, before }: { now: number; before: number }) {
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <span className="text-[10px] text-brown-faint">เท่าเดือนก่อน</span>;
  return (
    <span className={`text-[10px] font-bold ${pct > 0 ? "text-ok" : "text-wait"}`}>
      {pct > 0 ? "▲" : "▼"} {Math.abs(pct)}% จากเดือนก่อน
    </span>
  );
}

function Stat({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-petflow-sm bg-paper/70 p-2">
      <p className="text-[10px] font-bold text-brown-faint">{label}</p>
      <p className="font-extrabold text-brown">{value}</p>
      {children}
    </div>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];

function StaffCard({ s, rank, maxRevenue }: { s: StaffStat; rank: number; maxRevenue: number }) {
  return (
    <div className="rounded-petflow bg-card p-4 shadow-petflow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-extrabold text-petflow-chocolate">
          {s.cats > 0 && MEDALS[rank] ? `${MEDALS[rank]} ` : ""}
          {s.name}
        </p>
        <span className="text-[11px] font-bold text-brown-soft">งาน {s.share}% ของร้าน</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper">
        <div
          className="h-full rounded-full bg-latte-deep/70"
          style={{ width: `${maxRevenue ? Math.round((s.revenue / maxRevenue) * 100) : 0}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Stat label="ยอดอาบน้ำ (จ่ายแล้ว)" value={baht(s.revenue)}>
          <Change now={s.revenue} before={s.prevRevenue} />
        </Stat>
        <Stat label="อาบเสร็จ" value={`${s.cats} ตัว`}>
          <Change now={s.cats} before={s.prevCats} />
        </Stat>
        <Stat label="เฉลี่ยต่อตัว" value={baht(s.avgPerCat)} />
        <Stat label="ขายของ/บริการเสริม" value={baht(s.upsell)} />
      </div>
      <p className="mt-2 text-[11px] text-brown-soft">
        ลูกค้าจองรอบหน้าต่อ:{" "}
        <b className="text-brown">{s.rebookPct === null ? "ยังไม่มีข้อมูล" : `${s.rebookPct}%`}</b>
      </p>
    </div>
  );
}

/**
 * ผลงานพนักงาน — ช่างแต่ละคนทำยอดเท่าไร ลูกค้ากลับมาซ้ำไหม ขายเสริมได้ไหม พร้อมคำแนะนำ
 * (ช่างของแต่ละตัวเลือกในบอร์ดคิวอาบน้ำ)
 */
export default function StaffPerformancePage() {
  const [month, setMonth] = useState(() => bangkokToday().slice(0, 7));
  const [data, setData] = useState<StaffPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/staff-performance?month=${month}`, { cache: "no-store" })
      .then(async (res) => {
        if (!alive) return;
        if (res.status === 403) return setForbidden(true);
        setData(res.ok ? await res.json() : null);
      })
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [month]);

  if (forbidden) {
    return (
      <div className="rounded-petflow bg-card p-6 shadow-petflow-sm">
        <EmptyState icon="team" title="เฉพาะเจ้าของร้าน" sub="ขอให้เจ้าของร้านเปิดเมนูนี้ให้ในหน้าพนักงาน" />
      </div>
    );
  }

  const [y, m] = month.split("-").map(Number);
  const stats = data?.stats || [];
  const maxRevenue = Math.max(0, ...stats.map((s) => s.revenue));
  const totalRevenue = stats.reduce((s, x) => s + x.revenue, 0);
  const totalUpsell = stats.reduce((s, x) => s + x.upsell, 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Staff performance</p>
          <h1 className="text-xl font-extrabold text-petflow-chocolate">ผลงานพนักงาน</h1>
          <p className="mt-0.5 text-xs text-brown-soft">นับจากช่างที่เลือกในบอร์ดคิวอาบน้ำ และบิลที่จ่ายแล้ว</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="เดือนก่อน"
            onClick={() => setMonth((cur) => shiftMonth(cur, -1))}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-brown shadow-petflow-sm"
          >
            <Icon name="back" size={16} />
          </button>
          <span className="min-w-[90px] text-center text-sm font-extrabold text-petflow-chocolate">
            {m}/{y}
          </span>
          <button
            type="button"
            aria-label="เดือนถัดไป"
            onClick={() => setMonth((cur) => shiftMonth(cur, 1))}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-brown shadow-petflow-sm"
          >
            <Icon name="chevron" size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-brown-faint">กำลังโหลด…</p>
      ) : !data ? (
        <p className="py-10 text-center text-sm text-brown-faint">โหลดไม่สำเร็จ ลองใหม่อีกครั้ง</p>
      ) : (
        <div className="space-y-4">
          {data.tips.length > 0 && (
            <section className="rounded-petflow bg-petflow-chocolate p-4 text-card shadow-petflow-sm">
              <p className="flex items-center gap-2 text-sm font-extrabold">
                <Icon name="sparkle" size={16} />
                สิ่งที่ควรทำ
              </p>
              <ol className="mt-2.5 space-y-2">
                {data.tips.map((t, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-card/20 text-[10px] font-extrabold">
                      {i + 1}
                    </span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "อาบเสร็จทั้งร้าน", value: `${data.totalCats} ตัว` },
              { label: "ยอดอาบน้ำที่นับให้ช่าง", value: baht(totalRevenue) },
              { label: "ยอดขายเสริม", value: baht(totalUpsell) },
              { label: "ยังไม่ได้เลือกช่าง", value: `${data.unassigned} ตัว` },
            ].map((c) => (
              <div key={c.label} className="rounded-petflow bg-card p-3 shadow-petflow-sm">
                <p className="text-[11px] font-bold text-brown-soft">{c.label}</p>
                <p className="text-lg font-extrabold text-petflow-chocolate">{c.value}</p>
              </div>
            ))}
          </div>

          {stats.length === 0 ? (
            <div className="rounded-petflow bg-card p-6 shadow-petflow-sm">
              <EmptyState
                icon="team"
                title="ยังไม่มีรายชื่อช่าง"
                sub="เพิ่มพนักงานในหน้า เงินเดือน & ค่าคอม แล้วเลือกช่างทุกครั้งที่กดเริ่มทำในบอร์ดคิว"
              />
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {stats.map((s, i) => (
                <StaffCard key={s.id} s={s} rank={i} maxRevenue={maxRevenue} />
              ))}
            </div>
          )}

          {data.careChecks.length > 0 && (
            <section className="rounded-petflow bg-card p-4 shadow-petflow-sm">
              <p className="mb-2 text-sm font-extrabold text-petflow-chocolate">งานดูแลน้องที่ติ๊กเดือนนี้</p>
              <ul className="divide-y divide-petflow-line text-xs">
                {data.careChecks.map((c) => (
                  <li key={c.name} className="flex justify-between py-2">
                    <span className="font-bold text-brown">{c.name}</span>
                    <span className="font-extrabold text-latte-deep">{c.count} งาน</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
