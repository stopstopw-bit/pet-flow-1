"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { DateRangePicker } from "@/components/DateRangePicker";
import { bangkokToday } from "@/lib/bangkok-date";
import { resolveRange, type RangeId } from "@/lib/date-range";
import { formatThaiDateShort } from "@/lib/format-thai-date";
import { GROOM_PROGRAMS, groomProgramName, resolveGroomPrograms, type GroomProgram } from "@/lib/grooming-prices";
import { ROOMS, type RoomType } from "@/lib/business";
import {
  petCounts,
  monthBounds,
  monthPetCounts,
  shiftMonth,
  type Breakdown,
  type CountBooking,
  type CountRow,
} from "@/lib/monthly-pet-counts";

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${THAI_MONTHS[m - 1]} ${y}`;
};
const shortDate = (d: string) => formatThaiDateShort(d).replace(/\s\d{4}$/, "");

function BigTile({ icon, tint, label, value, sub }: { icon: string; tint: string; label: string; value: number; sub: string }) {
  return (
    <div className="rounded-petflow-sm bg-paper p-3.5">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tint} text-petflow-chocolate`}>
        <Icon name={icon} size={18} />
      </span>
      <p className="mt-2 text-[11px] font-bold text-brown-soft">{label}</p>
      <p className="text-3xl font-extrabold leading-tight text-petflow-chocolate">
        {value.toLocaleString()}
        <span className="ml-1 text-sm font-bold text-brown-soft">ตัว</span>
      </p>
      <p className="mt-0.5 text-[10px] text-brown-faint">{sub}</p>
    </div>
  );
}

function Bars({ items, suffix }: { items: Breakdown[]; suffix: (b: Breakdown) => string }) {
  const max = items[0]?.count || 1;
  return (
    <div className="space-y-2">
      {items.map((b) => (
        <div key={b.label} className="text-xs">
          <div className="mb-0.5 flex justify-between gap-2">
            <span className="min-w-0 truncate font-bold text-brown">{b.label}</span>
            <span className="shrink-0 font-extrabold text-latte-deep">{suffix(b)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-paper">
            <div className="h-full rounded-full bg-latte-deep/70" style={{ width: `${Math.round((b.count / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** หมวดเดียว (อาบน้ำ / เข้าพัก / Day Care): แยกตามโปรแกรม/ห้อง + รายชื่อน้องทีละตัว (แตะเปิด) */
function DetailSection({
  title,
  by,
  rows,
  suffix,
  rowWhen,
}: {
  title: string;
  by: Breakdown[];
  rows: CountRow[];
  suffix: (b: Breakdown) => string;
  rowWhen: (r: CountRow) => string;
}) {
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  return (
    <div className="mt-4 border-t border-petflow-line pt-3">
      <p className="mb-2 text-xs font-extrabold text-petflow-chocolate">{title}</p>
      <Bars items={by} suffix={suffix} />
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="mt-2 flex min-h-[36px] w-full items-center justify-center gap-1 rounded-petflow-sm bg-paper text-[11px] font-extrabold text-latte-deep"
      >
        {open ? "ซ่อนรายชื่อ" : `ดูรายชื่อ ${rows.length} ตัว`}
        <span className={`flex ${open ? "-rotate-90" : "rotate-90"}`}>
          <Icon name="chevron" size={12} />
        </span>
      </button>
      {open && (
        <ul className="mt-2 divide-y divide-petflow-line rounded-petflow-sm border border-petflow-line text-xs">
          {rows.map((r) => {
            const body = (
              <>
                <span className="w-14 shrink-0 text-[11px] font-bold text-brown-soft">{rowWhen(r)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-brown">
                    {r.catName}
                    <span className="font-normal text-brown-faint"> · {r.customerName}</span>
                  </span>
                  <span className="block truncate text-[11px] text-brown-soft">
                    {r.kind}
                    {r.nights ? ` · ${r.nights} คืน` : ""}
                  </span>
                </span>
                {r.upcoming && (
                  <span className="shrink-0 rounded-full bg-honey/30 px-2 py-0.5 text-[10px] font-bold text-latte-deep">นัดไว้</span>
                )}
              </>
            );
            return (
              <li key={r.id}>
                {r.customerId ? (
                  <Link href={`/admin/customers?id=${r.customerId}`} className="flex min-h-[44px] items-center gap-2 px-3 py-1.5">
                    {body}
                  </Link>
                ) : (
                  <div className="flex min-h-[44px] items-center gap-2 px-3 py-1.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** สรุปจำนวนน้อง: อาบน้ำกี่ตัว (โปรแกรมไหน) เข้าพักกี่ตัว (ห้องไหน) ตามช่วงที่เลือก + ย้อนหลัง 6 เดือน */
export function MonthlyPetCounts({ bookings }: { bookings: CountBooking[] }) {
  const today = bangkokToday();
  const thisMonth = today.slice(0, 7);
  const [rangeId, setRangeId] = useState<RangeId>("month");
  const [custom, setCustom] = useState({ from: today, to: today });
  const [programs, setPrograms] = useState<GroomProgram[]>(GROOM_PROGRAMS);
  const [rooms, setRooms] = useState<RoomType[]>(ROOMS);

  useEffect(() => {
    let alive = true;
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setPrograms(resolveGroomPrograms(d.config?.groomPricePrograms));
        if (d.config?.rooms?.length) setRooms(d.config.rooms);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const labels = useMemo(
    () => ({
      program: (id?: string) => (id ? groomProgramName(id, programs) || id : ""),
      room: (id?: string) => (id ? rooms.find((r) => r.id === id)?.name || id : ""),
    }),
    [programs, rooms]
  );
  const range = resolveRange(rangeId, today, custom);
  const c = useMemo(
    () => petCounts(bookings, range, today, labels),
    [bookings, range.from, range.to, today, labels]
  );
  // ตารางย้อนหลังยึดเดือนสุดท้ายของช่วงที่เลือก (ช่วง "ทั้งหมด" ยึดเดือนนี้)
  const endMonth = rangeId === "all" || range.to > today ? thisMonth : range.to.slice(0, 7);
  const trend = useMemo(
    () => Array.from({ length: 6 }, (_, i) => shiftMonth(endMonth, i - 5)).map((m) => ({ m, ...monthPetCounts(bookings, m, today) })),
    [bookings, endMonth, today]
  );
  // Day Care = ห้องพักที่เข้า-ออกวันเดียว — ร้านที่ไม่มีบริการนี้จะไม่เห็นคอลัมน์
  const showDayCare = c.dayCare.total > 0 || trend.some((t) => t.dayCare.total > 0);
  const pickMonth = (m: string) => {
    const { first, last } = monthBounds(m);
    setCustom({ from: first, to: last });
    setRangeId("custom");
  };
  const split = (done: number, upcoming: number) => (upcoming ? ` · มาแล้ว ${done} · นัดอีก ${upcoming}` : "");
  const rangeText =
    rangeId === "all" ? "ทั้งหมด" : range.from === range.to ? formatThaiDateShort(range.from) : `${formatThaiDateShort(range.from)} – ${formatThaiDateShort(range.to)}`;

  return (
    <section className="rounded-petflow bg-card p-4 shadow-petflow-sm">
      <h2 className="text-sm font-extrabold text-petflow-chocolate">สรุปจำนวนน้อง</h2>
      <p className="mb-3 text-[11px] text-brown-faint">{rangeText}</p>
      <DateRangePicker value={rangeId} onChange={setRangeId} custom={custom} onCustomChange={setCustom} className="mb-3" />

      <div className="grid grid-cols-2 gap-2.5">
        <BigTile icon="bath" tint="bg-honey/30" label="อาบน้ำ" value={c.bath.total} sub={`${c.bath.houses} บ้าน${split(c.bath.done, c.bath.upcoming)}`} />
        <BigTile
          icon="bed"
          tint="bg-sage/30"
          label="เข้าพัก"
          value={c.stay.total}
          sub={`${c.stay.houses} บ้าน · ${c.stay.nights} คืน${split(c.stay.done, c.stay.upcoming)}`}
        />
      </div>
      {c.dayCare.total > 0 && (
        <p className="mt-2 rounded-petflow-sm bg-paper px-3 py-2 text-xs font-bold text-brown">
          Day Care {c.dayCare.total} ตัว
          <span className="font-normal text-brown-faint">{split(c.dayCare.done, c.dayCare.upcoming)}</span>
        </p>
      )}

      <DetailSection
        title="อาบน้ำ แยกตามโปรแกรม"
        by={c.bath.by}
        rows={c.bath.rows}
        suffix={(b) => `${b.count} ตัว`}
        rowWhen={(r) => shortDate(r.date)}
      />
      <DetailSection
        title="เข้าพัก แยกตามห้อง"
        by={c.stay.by}
        rows={c.stay.rows}
        suffix={(b) => `${b.count} ตัว · ${b.nights} คืน`}
        rowWhen={(r) => shortDate(r.date)}
      />
      <DetailSection
        title="Day Care แยกตามห้อง"
        by={c.dayCare.by}
        rows={c.dayCare.rows}
        suffix={(b) => `${b.count} ตัว`}
        rowWhen={(r) => shortDate(r.date)}
      />
      {!c.bath.total && !c.stay.total && !c.dayCare.total && (
        <p className="mt-3 text-center text-xs text-brown-faint">ช่วงนี้ยังไม่มีนัดอาบน้ำหรือเข้าพัก</p>
      )}

      <table className="mt-4 w-full border-t border-petflow-line text-xs">
        <thead>
          <tr className="text-[10px] text-brown-faint">
            <th className="pb-1 pt-3 text-left font-bold">ย้อนหลัง 6 เดือน</th>
            <th className="pb-1 pt-3 text-right font-bold">อาบน้ำ</th>
            <th className="pb-1 pt-3 text-right font-bold">เข้าพัก</th>
            {showDayCare && <th className="pb-1 pt-3 text-right font-bold">Day Care</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-petflow-line">
          {trend.map((t) => {
            const { first, last } = monthBounds(t.m);
            const active = range.from === first && range.to === last;
            return (
              <tr
                key={t.m}
                onClick={() => pickMonth(t.m)}
                className={`cursor-pointer ${active ? "font-extrabold text-petflow-chocolate" : "text-brown"}`}
              >
                <td className="py-1.5">{monthLabel(t.m)}</td>
                <td className="py-1.5 text-right">{t.bath.total}</td>
                <td className="py-1.5 text-right">{t.stay.total}</td>
                {showDayCare && <td className="py-1.5 text-right">{t.dayCare.total}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-brown-faint">
        นับเป็นตัว (1 นัด = 1 ตัว) ไม่รวมนัดที่ยกเลิก/ไม่มา · โปรแกรมอาบน้ำดูจากที่เลือกไว้ตอนจอง · เข้าพักนับตัวที่มีคืนพักอยู่ในช่วงนั้น
        (พักคาบช่วงนับทั้งสองช่วง) · คืน = คืนต่อตัวรวมกันเฉพาะในช่วงนั้น · แตะเดือนในตารางเพื่อดูเดือนนั้น
      </p>
    </section>
  );
}
