"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Avatar, EmptyState } from "@/components/ui";
import { bangkokToday } from "@/lib/bangkok-date";
import { formatThaiDateShort } from "@/lib/format-thai-date";
import { GROOM_PROGRAMS, groomProgramName, resolveGroomPrograms, type GroomProgram } from "@/lib/grooming-prices";
import { ROOMS, type RoomType } from "@/lib/business";
import type { CountBooking } from "@/lib/monthly-pet-counts";
import { petKey, petServiceHistory, type PetHistory, type HistoryBill, type HistoryEntry } from "@/lib/pet-service-history";

const KIND_ICON: Record<HistoryEntry["kind"], string> = { bath: "bath", stay: "bed", dayCare: "clock" };
const PAGE = 6;

function Tile({ icon, label, value, unit, sub }: { icon: string; label: string; value: number; unit: string; sub?: string }) {
  return (
    <div className="rounded-petflow-sm bg-paper p-3">
      <p className="flex items-center gap-1 text-[11px] font-bold text-brown-soft">
        <Icon name={icon} size={13} />
        {label}
      </p>
      <p className="mt-0.5 text-2xl font-extrabold leading-tight text-petflow-chocolate">
        {value.toLocaleString()}
        <span className="ml-1 text-xs font-bold text-brown-soft">{unit}</span>
      </p>
      {sub && <p className="text-[10px] text-brown-faint">{sub}</p>}
    </div>
  );
}

function entryWhen(e: HistoryEntry) {
  if (e.kind === "stay" && e.until) {
    const a = formatThaiDateShort(e.date);
    const b = formatThaiDateShort(e.until);
    // ปีเดียวกัน ไม่ต้องพิมพ์ปีซ้ำ
    return `${a.slice(-4) === b.slice(-4) ? a.replace(/\s\d{4}$/, "") : a} – ${b}`;
  }
  return `${formatThaiDateShort(e.date)}${e.time ? ` · ${e.time}` : ""}`;
}

function PetDetail({ h }: { h: PetHistory }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? h.entries : h.entries.slice(0, PAGE);
  const used = h.baths + h.stays + h.dayCare;

  if (!h.entries.length) {
    return <EmptyState icon="paw" title={`${h.name} ยังไม่เคยใช้บริการ`} sub="นัดอาบน้ำ/เข้าพักที่มาแล้วจะขึ้นที่นี่" />;
  }

  return (
    <>
      <div className={`grid gap-2 ${h.dayCare ? "grid-cols-3" : "grid-cols-2"}`}>
        <Tile icon="bath" label="อาบน้ำ" value={h.baths} unit="ครั้ง" />
        <Tile icon="bed" label="เข้าพัก" value={h.stays} unit="ครั้ง" sub={h.nights ? `รวม ${h.nights} คืน` : undefined} />
        {h.dayCare > 0 && <Tile icon="clock" label="Day Care" value={h.dayCare} unit="วัน" />}
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        {h.lastVisit && (
          <div>
            <dt className="text-brown-faint">มาล่าสุด</dt>
            <dd className="font-bold text-brown">{formatThaiDateShort(h.lastVisit)}</dd>
          </div>
        )}
        {h.firstVisit && used > 1 && (
          <div>
            <dt className="text-brown-faint">มาครั้งแรก</dt>
            <dd className="font-bold text-brown">{formatThaiDateShort(h.firstVisit)}</dd>
          </div>
        )}
        {h.next && (
          <div className="col-span-2">
            <dt className="text-brown-faint">นัดถัดไป</dt>
            <dd className="font-bold text-latte-deep">
              {entryWhen(h.next)} · {h.next.kind === "bath" ? h.next.label : `${h.next.kind === "dayCare" ? "Day Care " : ""}${h.next.label}`}
            </dd>
          </div>
        )}
      </dl>

      {(h.programs.length > 0 || h.rooms.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {h.programs.map((p) => (
            <span key={`p${p.label}`} className="rounded-full bg-sage/15 px-2.5 py-1 text-[11px] font-bold text-ok">
              {p.label} ×{p.count}
            </span>
          ))}
          {h.rooms.map((r) => (
            <span key={`r${r.label}`} className="rounded-full bg-honey/25 px-2.5 py-1 text-[11px] font-bold text-latte-deep">
              {r.label} ×{r.count}
              {r.nights ? ` · ${r.nights} คืน` : ""}
            </span>
          ))}
        </div>
      )}

      <p className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Timeline · ไทม์ไลน์</p>
      <ol className="relative ml-1 border-l-2 border-petflow-line">
        {visible.map((e) => {
          const inner = (
            <>
            <span
              className={`absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-card ${
                e.upcoming ? "bg-paper text-brown-faint" : e.kind === "bath" ? "bg-sage/25 text-ok" : "bg-honey/40 text-petflow-chocolate"
              }`}
            >
              <Icon name={KIND_ICON[e.kind]} size={13} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-brown">
                {e.kind === "dayCare" ? `Day Care · ${e.label}` : e.label}
                {e.nights ? <span className="font-normal text-brown-soft"> · {e.nights} คืน</span> : null}
              </span>
              <span className="block text-[11px] text-brown-faint">{entryWhen(e)}</span>
            </span>
            {e.upcoming && (
              <span className="shrink-0 rounded-full bg-honey/30 px-2 py-0.5 text-[10px] font-bold text-latte-deep">นัดไว้</span>
            )}
            {e.inHouse && (
              <span className="shrink-0 rounded-full bg-sage/20 px-2 py-0.5 text-[10px] font-bold text-ok">กำลังพัก</span>
            )}
            {e.billed && (
              <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-paper px-2 py-0.5 text-[10px] font-bold text-brown-soft">
                <Icon name="receipt" size={11} />
                บิล
              </span>
            )}
            </>
          );
          const cls = "relative flex min-h-[48px] items-center gap-2.5 py-1.5 pl-5";
          return (
            <li key={e.id}>
              {e.billBookingId ? (
                <Link href={`/admin/billing?bookingId=${encodeURIComponent(e.billBookingId)}`} className={cls}>
                  {inner}
                </Link>
              ) : (
                <div className={cls}>{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
      {h.entries.length > visible.length && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 min-h-[40px] w-full rounded-petflow-sm bg-paper py-2 text-xs font-extrabold text-latte-deep"
        >
          ดูทั้งหมดอีก {h.entries.length - visible.length} รายการ
        </button>
      )}
    </>
  );
}

/**
 * ประวัติรายตัว (ในหน้าข้อมูลลูกค้า) — เลือกน้องทีละตัว ดูว่าอาบโปรแกรมไหน วันไหน พักห้องไหนกี่คืน
 * ดูจากนัด แล้วใช้โปรแกรม/ห้องตามบิลที่ออกจริง (แตะรายการที่มีบิลเพื่อเปิดบิล) · ไม่โชว์ยอดเงิน
 */
export function PetServiceHistory({
  bookings,
  cats,
  bills = [],
}: {
  bookings: CountBooking[];
  cats: { id: string; name: string; photoDataUrl?: string }[];
  /** บิลของลูกค้า — ใช้ชื่อโปรแกรม/ห้องตามที่ออกบิลจริง */
  bills?: HistoryBill[];
}) {
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

  const list = useMemo(
    () =>
      petServiceHistory(
        bookings,
        cats,
        bangkokToday(),
        {
          program: (id?: string) => (id ? groomProgramName(id, programs) || id : ""),
          room: (id?: string) => (id ? rooms.find((r) => r.id === id)?.name || id : ""),
        },
        bills
      ),
    [bookings, cats, programs, rooms, bills]
  );
  const [picked, setPicked] = useState("");
  const current = list.find((h) => h.key === picked) || list[0];

  if (!list.length) return null;
  // ชื่อซ้ำรวมเป็นรายการเดียวแล้ว — ตัวที่เลือกไม่มีรูป ก็ใช้รูปของตัวชื่อเดียวกัน
  const photoOf = (h: PetHistory) =>
    cats.find((c) => c.id === h.catId)?.photoDataUrl ||
    cats.find((c) => c.photoDataUrl && petKey(c.name) === h.key)?.photoDataUrl;

  return (
    <section className="mb-4 rounded-petflow bg-card p-4 shadow-petflow-sm">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
          <Icon name="paw" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-extrabold text-petflow-chocolate">ประวัติรายตัว</h2>
          <p className="truncate text-[11px] text-brown-soft">อาบอะไร วันไหน พักห้องไหน — ตามบิลที่ออก</p>
        </div>
      </div>

      {list.length > 1 && (
        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist">
          {list.map((h) => {
            const on = h.key === current.key;
            const photo = photoOf(h);
            return (
              <button
                key={h.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setPicked(h.key)}
                className={`flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-extrabold transition ${
                  on ? "bg-petflow-chocolate text-white" : "bg-paper text-brown"
                }`}
              >
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <Avatar name={h.name} size={28} />
                )}
                {h.name}
                <span className={`text-[10px] font-bold ${on ? "text-white/70" : "text-brown-faint"}`}>
                  {h.baths + h.stays + h.dayCare}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <PetDetail key={current.key} h={current} />
    </section>
  );
}
