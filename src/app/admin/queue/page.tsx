"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/ui";
import { toast } from "@/components/Toast";
import { bookingOnDate } from "@/lib/booking-customer-match";
import { bangkokToday } from "@/lib/bangkok-date";
import { formatThaiDateShort } from "@/lib/format-thai-date";
import { resolveGroomPrograms, type GroomProgram } from "@/lib/grooming-prices";
import type { BookingStatus } from "@/lib/business";

type QueueBooking = {
  id: string;
  customerName: string;
  catName: string;
  service: "groom" | "room";
  date: string;
  time?: string;
  checkin?: string;
  checkout?: string;
  status: BookingStatus;
  lineUserId?: string;
  groomProgram?: string;
  catMedical?: string;
  catPrivateNote?: string;
  notes?: string;
};

type Ops = { bookingId: string; groomStartedAt?: string; groomer?: string };

type Column = "waiting" | "doing" | "ready";

const COLUMNS: { id: Column; label: string; en: string; tone: string; dot: string }[] = [
  { id: "waiting", label: "รอคิว", en: "Waiting", tone: "bg-honey/25 text-petflow-chocolate", dot: "bg-honey-deep" },
  { id: "doing", label: "กำลังทำ", en: "In progress", tone: "bg-sky-100 text-sky-800", dot: "bg-sky-500" },
  { id: "ready", label: "เสร็จแล้ว · พร้อมรับกลับ", en: "Ready", tone: "bg-sage/30 text-ok", dot: "bg-ok" },
];

/** รีเฟรชเองทุก 20 วินาที — หน้าร้านกับช่างเปิดคนละเครื่องก็เห็นตรงกัน */
const REFRESH_MS = 20000;

function columnOf(b: QueueBooking, ops?: Ops): Column {
  if (b.status === "ready" || b.status === "done") return "ready";
  return ops?.groomStartedAt ? "doing" : "waiting";
}

function sinceLabel(iso?: string) {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return mins < 60 ? `${mins} นาที` : `${Math.floor(mins / 60)} ชม. ${mins % 60} นาที`;
}

/**
 * บอร์ดคิวอาบน้ำ-ตัดขน — เห็นทุกตัวของวันนั้นพร้อมกัน รอคิว → กำลังทำ → เสร็จแล้วพร้อมรับกลับ
 * 1 แมว = 1 คิว · เลือกช่างที่รับเคสได้ (ใช้คิดค่าคอมในหน้าเงินเดือน)
 */
export default function GroomQueuePage() {
  const [date, setDate] = useState(() => bangkokToday());
  const [bookings, setBookings] = useState<QueueBooking[]>([]);
  const [ops, setOps] = useState<Record<string, Ops>>({});
  const [groomers, setGroomers] = useState<{ id: string; name: string }[]>([]);
  const [programs, setPrograms] = useState<GroomProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [mobileCol, setMobileCol] = useState<Column>("waiting");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/bookings", { cache: "no-store" });
      const d = await res.json();
      const all: QueueBooking[] = d.bookings || [];
      const today = all.filter(
        (b) =>
          b.service === "groom" &&
          b.status !== "cancelled" &&
          b.status !== "no_show" &&
          bookingOnDate(b, date)
      );
      setBookings(today);
      if (today.length) {
        const r = await fetch(`/api/ops?ids=${today.map((b) => encodeURIComponent(b.id)).join(",")}`, {
          cache: "no-store",
        });
        const od = await r.json().catch(() => ({}));
        setOps(Object.fromEntries(((od.ops || []) as Ops[]).map((o) => [o.bookingId, o])));
      } else {
        setOps({});
      }
    } catch {
      /* เน็ตหลุดชั่วคราว — รอบหน้าโหลดใหม่ */
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, REFRESH_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    fetch("/api/payroll?employees=1")
      .then((r) => r.json())
      .then((d) => setGroomers(d.employees || []))
      .catch(() => {});
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setPrograms(resolveGroomPrograms(d.config?.groomPricePrograms)))
      .catch(() => {});
  }, []);

  const sorted = useMemo(
    () => [...bookings].sort((a, b) => (a.time || "99").localeCompare(b.time || "99")),
    [bookings]
  );
  const byCol = (c: Column) => sorted.filter((b) => columnOf(b, ops[b.id]) === c);

  const patchOps = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/ops", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(d.error || "บันทึกไม่สำเร็จ", "error");
      return false;
    }
    setOps((cur) => ({ ...cur, ...Object.fromEntries(((d.ops || []) as Ops[]).map((o) => [o.bookingId, o])) }));
    return true;
  };

  const start = async (b: QueueBooking) => {
    setBusy(b.id);
    if (await patchOps({ action: "groom_start", ids: [b.id] })) toast(`เริ่มทำ ${b.catName} แล้ว`, "success");
    setBusy(null);
  };

  const backToWaiting = async (b: QueueBooking) => {
    setBusy(b.id);
    await patchOps({ action: "groom_unstart", ids: [b.id] });
    setBusy(null);
  };

  const setStatus = async (b: QueueBooking, action: "set_ready" | "set_done") => {
    let notify = false;
    if (action === "set_ready") {
      notify = b.lineUserId
        ? confirm(`${b.catName} เสร็จแล้ว — แจ้งคุณ${b.customerName} ทาง LINE ว่าพร้อมรับกลับเลยไหม?`)
        : false;
    }
    setBusy(b.id);
    const res = await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: b.id, ids: [b.id], action, lineUserId: b.lineUserId, notify }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return toast(d.error || "บันทึกไม่สำเร็จ", "error");
    if (action === "set_ready") {
      toast(notify ? (d.sent ? "แจ้งลูกค้าแล้ว 🎉" : "บันทึกแล้ว (ส่ง LINE ไม่ได้)") : "ย้ายไปเสร็จแล้ว", "success");
    } else {
      toast("รับกลับแล้ว ✅", "success");
    }
    load();
  };

  const card = (b: QueueBooking) => {
    const o = ops[b.id];
    const col = columnOf(b, o);
    const prog = programs.find((p) => p.id === b.groomProgram);
    const warn = [b.catPrivateNote, b.catMedical && b.catMedical !== "ไม่มี" ? b.catMedical : ""].filter(Boolean);
    return (
      <div key={b.id} className="rounded-petflow-sm bg-card p-3 shadow-petflow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-latte to-latte-deep text-white">
            <Icon name="paw" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-petflow-chocolate">
              {b.catName}
              <span className="font-bold text-brown-faint"> · {b.customerName}</span>
            </p>
            <p className="truncate text-xs text-brown-soft">
              {b.time ? `${b.time} · ` : ""}
              {prog?.name || "ยังไม่เลือกโปรแกรม"}
            </p>
            {prog?.includes?.length ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {prog.includes.map((t) => (
                  <span key={t} className="rounded-full bg-sage/20 px-1.5 py-0.5 text-[10px] font-bold text-brown">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            {warn.length > 0 && (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-red-700">
                <Icon name="alert" size={12} />
                <span className="truncate">{warn.join(" · ")}</span>
              </p>
            )}
            {col === "doing" && o?.groomStartedAt && (
              <p className="mt-1 text-[11px] font-bold text-sky-700">ทำมาแล้ว {sinceLabel(o.groomStartedAt)}</p>
            )}
            {b.status === "done" && (
              <p className="mt-1 text-[11px] font-bold text-brown-faint">รับกลับแล้ว</p>
            )}
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {groomers.length > 0 && (
            <select
              aria-label="ช่างที่รับเคส"
              value={o?.groomer || ""}
              onChange={(e) => patchOps({ action: "set_groomer", ids: [b.id], groomer: e.target.value })}
              className="h-9 min-w-0 flex-1 rounded-full border border-petflow-line bg-paper px-3 text-xs font-bold text-brown"
            >
              <option value="">— ช่าง —</option>
              {groomers.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          {col === "waiting" && (
            <button
              type="button"
              disabled={busy === b.id}
              onClick={() => start(b)}
              className="h-9 rounded-full bg-sky-600 px-4 text-xs font-extrabold text-white disabled:opacity-50"
            >
              เริ่มทำ
            </button>
          )}
          {col === "doing" && (
            <>
              <button
                type="button"
                disabled={busy === b.id}
                onClick={() => backToWaiting(b)}
                className="h-9 rounded-full bg-paper px-3 text-xs font-bold text-brown disabled:opacity-50"
              >
                ย้อนกลับ
              </button>
              <button
                type="button"
                disabled={busy === b.id}
                onClick={() => setStatus(b, "set_ready")}
                className="h-9 rounded-full bg-ok px-4 text-xs font-extrabold text-white disabled:opacity-50"
              >
                เสร็จแล้ว
              </button>
            </>
          )}
          {col === "ready" && b.status === "ready" && (
            <button
              type="button"
              disabled={busy === b.id}
              onClick={() => setStatus(b, "set_done")}
              className="h-9 rounded-full bg-petflow-chocolate px-4 text-xs font-extrabold text-card disabled:opacity-50"
            >
              รับกลับแล้ว
            </button>
          )}
        </div>
      </div>
    );
  };

  const isToday = date === bangkokToday();

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Grooming queue</p>
          <h1 className="text-xl font-extrabold text-petflow-chocolate">
            คิวอาบน้ำ-ตัดขน {isToday ? "วันนี้" : formatThaiDateShort(date)}
          </h1>
          <p className="mt-0.5 text-xs text-brown-soft">
            {bookings.length} คิว · อัปเดตเองทุก 20 วินาที ทุกเครื่องเห็นตรงกัน
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="h-10 rounded-full border border-petflow-line bg-card px-3 text-sm font-bold text-brown"
          />
          {!isToday && (
            <button
              type="button"
              onClick={() => setDate(bangkokToday())}
              className="h-10 rounded-full bg-honey/30 px-3.5 text-xs font-bold text-petflow-chocolate"
            >
              วันนี้
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-brown-faint">กำลังโหลด…</p>
      ) : bookings.length === 0 ? (
        <div className="rounded-petflow bg-card p-6 shadow-petflow-sm">
          <EmptyState icon="bath" title="ไม่มีคิวอาบน้ำวันนี้" sub="นัดอาบน้ำที่จองไว้จะขึ้นที่นี่อัตโนมัติ" />
        </div>
      ) : (
        <>
          {/* มือถือ: สลับดูทีละช่อง */}
          <div className="mb-3 flex gap-1.5 overflow-x-auto lg:hidden">
            {COLUMNS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={mobileCol === c.id}
                onClick={() => setMobileCol(c.id)}
                className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold ${
                  mobileCol === c.id ? "bg-petflow-chocolate text-card" : "bg-card text-brown"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                {c.label} {byCol(c.id).length}
              </button>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {COLUMNS.map((c) => (
              <section
                key={c.id}
                className={`rounded-petflow bg-paper/70 p-3 ${mobileCol === c.id ? "" : "hidden lg:block"}`}
              >
                <div className="mb-2.5 flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold ${c.tone}`}>
                    <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                    {c.label}
                  </span>
                  <span className="text-xs font-bold text-brown-faint">{byCol(c.id).length} ตัว</span>
                </div>
                <div className="space-y-2">
                  {byCol(c.id).length === 0 ? (
                    <p className="py-6 text-center text-xs text-brown-faint">—</p>
                  ) : (
                    byCol(c.id).map(card)
                  )}
                </div>
              </section>
            ))}
          </div>
          {groomers.length === 0 && (
            <p className="mt-3 text-[11px] text-brown-faint">
              เพิ่มรายชื่อช่างในเมนู &quot;เงินเดือน &amp; ค่าคอม&quot; เพื่อเลือกช่างที่รับเคสและคิดค่าคอมให้อัตโนมัติ
            </p>
          )}
        </>
      )}
    </div>
  );
}
