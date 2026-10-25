"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { CheckBox } from "@/components/ui";
import { bangkokToday } from "@/lib/bangkok-date";
import {
  analyzeSales,
  type ActionSegment,
  type InsightBooking,
  type InsightCustomer,
  type InsightInvoice,
  type InsightPackage,
} from "@/lib/sales-insights";

/** กลุ่มที่ส่งต่อไปหน้าส่งโปร — หน้าโปรอ่านค่านี้แล้วเลือกผู้รับ + ใส่ข้อความร่างให้ */
export const BROADCAST_DRAFT_KEY = "petflow-broadcast-draft";

const baht = (n: number) => `${Math.round(n).toLocaleString()} ฿`;
const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function Tile({ label, value, sub, tone = "" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-petflow-sm bg-card p-3.5 shadow-petflow-sm">
      <p className="text-[11px] font-bold text-brown-soft">{label}</p>
      <p className={`mt-0.5 text-lg font-extrabold text-petflow-chocolate ${tone}`}>{value}</p>
      {sub && <p className="text-[10px] text-brown-faint">{sub}</p>}
    </div>
  );
}

function SegmentCard({ s, onSend }: { s: ActionSegment; onSend: (s: ActionSegment, ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  // ติ๊กออกได้รายคน — ค่าเริ่มต้นเลือกทุกคนในกลุ่ม
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const reachablePeople = s.people.filter((p) => p.hasLine);
  const reachable = reachablePeople.length;
  const chosen = reachablePeople.filter((p) => !excluded.has(p.id));
  const toggle = (id: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className="rounded-petflow bg-card p-4 shadow-petflow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-petflow-chocolate">{s.title}</p>
          <p className="mt-0.5 text-[11px] text-brown-soft">{s.why}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-extrabold text-latte-deep">{s.people.length}</p>
          <p className="text-[10px] font-bold text-brown-faint">คน</p>
        </div>
      </div>
      {s.people.length > 0 && (
        <>
          {open && (
            <div className="mt-3 overflow-hidden rounded-petflow-sm bg-paper/60">
              {reachable > 0 && (
                <div className="flex items-center justify-between px-3 py-2 text-[11px]">
                  <span className="font-bold text-brown-soft">
                    เลือกแล้ว {chosen.length}/{reachable} คน
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setExcluded(excluded.size ? new Set() : new Set(reachablePeople.map((p) => p.id)))
                    }
                    className="font-bold text-latte-deep underline"
                  >
                    {excluded.size ? "เลือกทั้งหมด" : "ไม่เลือกเลย"}
                  </button>
                </div>
              )}
              <ul className="max-h-72 divide-y divide-petflow-line overflow-y-auto border-t border-petflow-line">
                {s.people.map((p) => {
                  const on = p.hasLine && !excluded.has(p.id);
                  return (
                    <li key={p.id} className="flex items-center gap-1 pr-1">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        disabled={!p.hasLine}
                        onClick={() => toggle(p.id)}
                        className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 py-1.5 pl-3 text-left text-xs disabled:opacity-60"
                      >
                        <CheckBox on={on} />
                        <span
                          className={`min-w-0 flex-1 truncate font-bold ${on ? "text-brown" : "text-brown-faint"}`}
                        >
                          {p.name}
                        </span>
                        <span className="shrink-0 text-[10px] text-brown-faint">
                          {p.detail}
                          {!p.hasLine && " · ไม่มี LINE"}
                        </span>
                      </button>
                      <Link
                        href={`/admin/customers?id=${p.id}`}
                        aria-label={`เปิดข้อมูล ${p.name}`}
                        className="flex h-9 w-8 shrink-0 items-center justify-center text-brown-faint"
                      >
                        <Icon name="chevron" size={14} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-ok">โอกาสได้ยอด ~{baht(s.potential)}</p>
              <p className="text-[10px] text-brown-faint">
                {excluded.size ? `เลือกส่ง ${chosen.length} จาก ${reachable} คน` : `ส่ง LINE ได้ ${reachable} คน`}
              </p>
            </div>
            <button
              type="button"
              disabled={chosen.length === 0}
              onClick={() => onSend(s, chosen.map((p) => p.id))}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-petflow-chocolate px-4 text-xs font-extrabold text-card disabled:opacity-40"
            >
              <Icon name="send" size={14} />
              {s.action}
            </button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex h-10 items-center gap-1 rounded-full bg-paper px-3.5 text-xs font-bold text-brown"
            >
              {open ? "ซ่อนรายชื่อ" : "ดูรายชื่อ"}
            </button>
          </div>
          {open && (
            <ul className="mt-3 max-h-64 divide-y divide-petflow-line overflow-y-auto rounded-petflow-sm bg-paper/60 px-3">
              {s.people.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                  <span className="min-w-0 truncate font-bold text-brown">{p.name}</span>
                  <span className="shrink-0 text-[10px] text-brown-faint">
                    {p.detail}
                    {!p.hasLine && " · ไม่มี LINE"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/**
 * ส่วน "ทำอะไรต่อดี" ของหน้าสรุปข้อมูล — ตัวชี้วัดยอดขาย + กลุ่มลูกค้าที่ควรทัก
 * กดปุ่มในแต่ละกลุ่ม = ไปหน้าส่งโปรทาง LINE พร้อมเลือกผู้รับและร่างข้อความไว้ให้
 */
export function SalesActions(props: {
  customers: InsightCustomer[];
  invoices: InsightInvoice[];
  bookings: InsightBooking[];
  packages: InsightPackage[];
}) {
  const router = useRouter();
  const today = bangkokToday();
  // ข้อความตามลูกค้าที่ร้านแก้เองในหน้าปรับการ์ด (ไม่ตั้ง = ใช้ข้อความตั้งต้น)
  const [followUpTexts, setFollowUpTexts] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setFollowUpTexts(d.config?.cards?.followUp?.texts || {}))
      .catch(() => {});
  }, []);
  const a = useMemo(
    () => analyzeSales({ ...props, today, followUpTexts }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.customers, props.invoices, props.bookings, props.packages, today, followUpTexts]
  );

  const send = (s: ActionSegment, ids: string[]) => {
    try {
      sessionStorage.setItem(
        BROADCAST_DRAFT_KEY,
        JSON.stringify({
          label: s.title,
          customerIds: ids,
          title: s.message.title,
          body: s.message.body,
          actions: s.message.actions,
        })
      );
    } catch {
      /* เปิดหน้าโปรเฉย ๆ */
    }
    router.push("/admin/promos?from=insights");
  };

  const maxMonth = Math.max(1, ...a.monthly.map((m) => m.revenue));
  const maxDay = Math.max(1, ...a.weekday.map((d) => d.count));
  const quietest = Math.min(...a.weekday.map((d) => d.count));

  return (
    <div className="space-y-4">
      {/* ── สิ่งที่ควรทำ ── */}
      <section className="rounded-petflow bg-petflow-chocolate p-4 text-card shadow-petflow-sm">
        <p className="flex items-center gap-2 text-sm font-extrabold">
          <Icon name="sparkle" size={16} />
          สิ่งที่ควรทำเพื่อเพิ่มยอดขาย
        </p>
        {a.tips.length ? (
          <ol className="mt-2.5 space-y-2">
            {a.tips.map((t, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-card/20 text-[10px] font-extrabold">
                  {i + 1}
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-xs opacity-80">ยังมีข้อมูลบิลไม่พอ — พอมีบิลที่จ่ายแล้วสักระยะ ระบบจะแนะนำให้เอง</p>
        )}
      </section>

      {/* ── ตัวเลขสำคัญ ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="ยอดขายเดือนนี้"
          value={baht(a.thisMonth.revenue)}
          sub={
            a.growthPct === null
              ? `${a.thisMonth.bills} บิล`
              : `${a.growthPct >= 0 ? "▲" : "▼"} ${Math.abs(a.growthPct)}% เทียบช่วงเดียวกันเดือนก่อน`
          }
          tone={a.growthPct !== null && a.growthPct < 0 ? "!text-wait" : ""}
        />
        <Tile label="ยอดเฉลี่ยต่อบิล" value={baht(a.avgBill)} sub="เพิ่มได้ด้วยบริการเสริม/สินค้า" />
        <Tile label="ลูกค้ากลับมาซ้ำ" value={`${a.repeatRate}%`} sub={`จากลูกค้าที่เคยจ่าย ${a.buyers} คน`} />
        <Tile label="ลูกค้า 20% บน ทำยอด" value={`${a.topShare}%`} sub={`เฉลี่ยคนละ ${baht(a.avgSpendPerCustomer)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-petflow bg-card p-4 shadow-petflow-sm">
          <p className="mb-3 text-sm font-extrabold text-petflow-chocolate">ยอดขาย 6 เดือน</p>
          <div className="flex h-36 items-end gap-2">
            {a.monthly.map((m) => {
              const [, mm] = m.month.split("-").map(Number);
              return (
                <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[9px] font-bold text-brown-faint">
                    {m.revenue >= 1000 ? `${Math.round(m.revenue / 1000)}k` : m.revenue || ""}
                  </span>
                  <div
                    className="w-full rounded-t-md bg-latte-deep/70"
                    style={{ height: `${Math.max(2, (m.revenue / maxMonth) * 100)}%` }}
                    title={`${baht(m.revenue)} · ${m.bills} บิล`}
                  />
                  <span className="text-[10px] font-bold text-brown-soft">{THAI_MONTHS[mm - 1]}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-petflow bg-card p-4 shadow-petflow-sm">
          <p className="mb-3 text-sm font-extrabold text-petflow-chocolate">รายได้มาจากไหน (90 วัน)</p>
          {a.mix.length ? (
            <div className="space-y-2">
              {a.mix.map((k) => (
                <div key={k.id} className="text-xs">
                  <div className="mb-0.5 flex justify-between">
                    <span className="font-bold text-brown">{k.label}</span>
                    <span className="font-extrabold text-latte-deep">
                      {k.pct}% · {baht(k.amount)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-paper">
                    <div className="h-full rounded-full bg-latte-deep/70" style={{ width: `${k.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-brown-faint">ยังไม่มีบิลใน 90 วัน</p>
          )}
        </section>

        <section className="rounded-petflow bg-card p-4 shadow-petflow-sm">
          <p className="mb-1 text-sm font-extrabold text-petflow-chocolate">คิวอาบน้ำแต่ละวัน (90 วัน)</p>
          <p className="mb-3 text-[10px] text-brown-faint">วันสีส้ม = ว่างสุด ควรทำโปรดึงลูกค้า</p>
          <div className="flex h-28 items-end gap-1.5">
            {a.weekday.map((d, i) => (
              <div key={d.name} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[9px] font-bold text-brown-faint">{d.count}</span>
                <div
                  className={`w-full rounded-t-md ${d.count === quietest ? "bg-honey-deep" : "bg-sage"}`}
                  style={{ height: `${Math.max(3, (d.count / maxDay) * 100)}%` }}
                />
                <span className="text-[10px] font-bold text-brown-soft">{["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"][i]}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── กลุ่มลูกค้าที่ควรทัก ── */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Target customers</p>
        <h2 className="mb-2 text-base font-extrabold text-petflow-chocolate">กลุ่มลูกค้าที่ควรทักตอนนี้</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {[...a.segments]
            .sort((x, y) => y.potential - x.potential || y.people.length - x.people.length)
            .map((s) => (
              <SegmentCard key={s.id} s={s} onSend={send} />
            ))}
        </div>
        <p className="mt-2 text-[10px] text-brown-faint">
          &quot;โอกาสได้ยอด&quot; ประมาณจากยอดเฉลี่ยต่อบิล × อัตราตอบรับที่พบบ่อยของแต่ละกลุ่ม เป็นตัวเลขคร่าว ๆ ไว้จัดลำดับว่าทำกลุ่มไหนก่อน
        </p>
      </div>
    </div>
  );
}
