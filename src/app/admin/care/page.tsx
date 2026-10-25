"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/ui";
import { toast } from "@/components/Toast";
import { bookingOnDate } from "@/lib/booking-customer-match";
import { bangkokToday } from "@/lib/bangkok-date";
import { formatThaiDateShort } from "@/lib/format-thai-date";
import { resolveCareTasks, type CareTask } from "@/lib/care-tasks";
import { petKindOf } from "@/lib/pet-kind";
import { roomColorMap } from "@/lib/room-colors";
import type { BookingStatus } from "@/lib/business";

type StayBooking = {
  id: string;
  customerName: string;
  catName: string;
  service: "groom" | "room";
  date: string;
  checkin?: string;
  checkout?: string;
  status: BookingStatus;
  room?: string;
  roomUnit?: number;
  careNote?: string;
  catMedical?: string;
  catPrivateNote?: string;
  catStaffNote?: string;
};

type CareCheck = { at: string; by?: string };
type Ops = { bookingId: string; careChecks: Record<string, Record<string, CareCheck>> };

function timeOf(iso: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * เช็คลิสต์ดูแลรายวัน — น้องที่เข้าพักทุกตัว ติ๊กให้อาหาร ให้ยา เล่น ฯลฯ ครบทุกมื้อ
 * เห็นว่าใครติ๊กตอนกี่โมง ไม่ลืมแม้มีแขกพักหลายตัวพร้อมกัน
 */
export default function CareChecklistPage() {
  const [date, setDate] = useState(() => bangkokToday());
  const [stays, setStays] = useState<StayBooking[]>([]);
  const [ops, setOps] = useState<Record<string, Ops>>({});
  const [tasks, setTasks] = useState<CareTask[]>(resolveCareTasks());
  const [rooms, setRooms] = useState<{ id: string; name: string; color?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CareTask[]>([]);
  const [savingTasks, setSavingTasks] = useState(false);
  // บันทึกของน้องตัวเดียวกันทีละคำขอ — ติ๊กรัวๆ จะได้ไม่เขียนทับกันจนติ๊กหาย
  const saveChain = useRef(new Map<string, Promise<void>>());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/bookings", { cache: "no-store" });
      const d = await res.json();
      const list: StayBooking[] = (d.bookings || []).filter(
        (b: StayBooking) =>
          b.service === "room" &&
          b.status !== "cancelled" &&
          b.status !== "no_show" &&
          bookingOnDate(b, date)
      );
      setStays(list);
      if (list.length) {
        const r = await fetch(`/api/ops?ids=${list.map((b) => encodeURIComponent(b.id)).join(",")}`, {
          cache: "no-store",
        });
        const od = await r.json().catch(() => ({}));
        setOps(Object.fromEntries(((od.ops || []) as Ops[]).map((o) => [o.bookingId, o])));
      } else {
        setOps({});
      }
    } catch {
      /* โหลดรอบหน้า */
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        setTasks(resolveCareTasks(d.config?.careTasks, petKindOf(d.config)));
        setRooms(d.config?.rooms || []);
      })
      .catch(() => {});
  }, []);

  const colors = useMemo(() => roomColorMap(rooms), [rooms]);
  const roomName = (id?: string) => rooms.find((r) => r.id === id)?.name || "";

  const sorted = useMemo(
    () =>
      [...stays].sort(
        (a, b) =>
          (a.room || "").localeCompare(b.room || "") ||
          (a.roomUnit || 0) - (b.roomUnit || 0) ||
          a.catName.localeCompare(b.catName)
      ),
    [stays]
  );

  const checksOf = (id: string) => ops[id]?.careChecks?.[date] || {};
  const totalTicks = stays.length * tasks.length;
  const doneTicks = stays.reduce(
    (s, b) => s + tasks.filter((t) => checksOf(b.id)[t.id]).length,
    0
  );

  const toggle = async (b: StayBooking, task: CareTask) => {
    const done = !checksOf(b.id)[task.id];
    // ติ๊กให้เห็นทันที แล้วค่อยบันทึก
    setOps((cur) => {
      const o = cur[b.id] || { bookingId: b.id, careChecks: {} };
      const day = { ...(o.careChecks[date] || {}) };
      if (done) day[task.id] = { at: new Date().toISOString() };
      else delete day[task.id];
      return { ...cur, [b.id]: { ...o, careChecks: { ...o.careChecks, [date]: day } } };
    });
    const run = async () => {
      const res = await fetch("/api/ops", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "care", bookingId: b.id, date, taskId: task.id, done }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(d.error || "บันทึกไม่สำเร็จ", "error");
        load();
      }
    };
    const next = (saveChain.current.get(b.id) || Promise.resolve()).then(run, run);
    saveChain.current.set(b.id, next);
  };

  const saveTasks = async () => {
    const clean = draft
      .map((t) => ({ ...t, label: t.label.trim() }))
      .filter((t) => t.label);
    if (clean.length === 0) return toast("ต้องมีอย่างน้อย 1 รายการ", "error");
    setSavingTasks(true);
    const res = await fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch: { careTasks: clean } }),
    });
    setSavingTasks(false);
    if (!res.ok) return toast("บันทึกไม่สำเร็จ", "error");
    setTasks(clean);
    setEditing(false);
    toast("บันทึกรายการงานแล้ว", "success");
  };

  const isToday = date === bangkokToday();

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Daily care</p>
          <h1 className="text-xl font-extrabold text-petflow-chocolate">
            เช็คลิสต์ดูแลรายวัน {isToday ? "วันนี้" : formatThaiDateShort(date)}
          </h1>
          <p className="mt-0.5 text-xs text-brown-soft">
            น้องพักอยู่ {stays.length} ตัว · ติ๊กแล้ว {doneTicks}/{totalTicks}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="h-10 rounded-full border border-petflow-line bg-card px-3 text-sm font-bold text-brown"
          />
          <button
            type="button"
            onClick={() => {
              setDraft(tasks);
              setEditing((v) => !v);
            }}
            className="flex h-10 items-center gap-1.5 rounded-full bg-card px-3.5 text-xs font-bold text-brown shadow-petflow-sm"
          >
            <Icon name="edit" size={14} />
            แก้รายการงาน
          </button>
        </div>
      </div>

      {totalTicks > 0 && (
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-paper">
          <div
            className="h-full rounded-full bg-ok transition-all"
            style={{ width: `${Math.round((doneTicks / totalTicks) * 100)}%` }}
          />
        </div>
      )}

      {editing && (
        <div className="mb-4 rounded-petflow bg-card p-4 shadow-petflow-sm">
          <p className="mb-2 text-sm font-extrabold text-petflow-chocolate">งานที่ต้องทำทุกวันต่อตัว</p>
          <div className="space-y-2">
            {draft.map((t, i) => (
              <div key={t.id} className="flex items-center gap-2">
                <input
                  value={t.label}
                  onChange={(e) =>
                    setDraft((cur) => cur.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))
                  }
                  className="min-w-0 flex-1 rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  aria-label="ลบ"
                  onClick={() => setDraft((cur) => cur.filter((_, k) => k !== i))}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-wait/10 text-wait"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setDraft((cur) => [...cur, { id: `task-${Date.now()}`, label: "" }])}
              className="h-10 flex-1 rounded-full border border-dashed border-latte-deep/50 text-xs font-bold text-latte-deep"
            >
              + เพิ่มงาน
            </button>
            <button
              type="button"
              disabled={savingTasks}
              onClick={saveTasks}
              className="h-10 flex-1 rounded-full bg-petflow-chocolate text-xs font-extrabold text-card disabled:opacity-50"
            >
              {savingTasks ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-brown-faint">กำลังโหลด…</p>
      ) : stays.length === 0 ? (
        <div className="rounded-petflow bg-card p-6 shadow-petflow-sm">
          <EmptyState icon="bed" title="ไม่มีน้องเข้าพักวันนี้" sub="น้องที่เข้าพักจะขึ้นเช็คลิสต์ที่นี่อัตโนมัติ" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((b) => {
            const checks = checksOf(b.id);
            const done = tasks.filter((t) => checks[t.id]).length;
            const color = colors[b.room || ""] || "#9ca3af";
            const notes = [
              b.catPrivateNote,
              b.catMedical && b.catMedical !== "ไม่มี" ? `ยา/โรค: ${b.catMedical}` : "",
              b.careNote ? `เจ้าของฝาก: ${b.careNote}` : "",
              b.catStaffNote,
            ].filter(Boolean);
            return (
              <div
                key={b.id}
                className="rounded-petflow bg-card p-3.5 shadow-petflow-sm"
                style={{ borderTop: `4px solid ${color}` }}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-petflow-chocolate">{b.catName}</p>
                    <p className="truncate text-[11px] text-brown-soft">
                      {b.customerName} · {roomName(b.room) || "ห้องพัก"}
                      {b.roomUnit ? ` #${b.roomUnit}` : ""}
                    </p>
                    <p className="text-[10px] text-brown-faint">
                      {b.checkout === date ? "ออกวันนี้" : b.checkout ? `ถึง ${formatThaiDateShort(b.checkout)}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                      done === tasks.length ? "bg-sage/30 text-ok" : "bg-honey/25 text-petflow-chocolate"
                    }`}
                  >
                    {done}/{tasks.length}
                  </span>
                </div>
                {notes.length > 0 && (
                  <div className="mb-2 space-y-0.5 rounded-petflow-sm bg-wait/10 px-2.5 py-1.5">
                    {notes.map((n, i) => (
                      <p key={i} className="text-[11px] font-bold text-wait">
                        {n}
                      </p>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  {tasks.map((t) => {
                    const c = checks[t.id];
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={!!c}
                        onClick={() => toggle(b, t)}
                        className={`flex min-h-[44px] items-center gap-2 rounded-petflow-sm px-2.5 py-1.5 text-left transition ${
                          c ? "bg-sage/25 text-ok" : "bg-paper text-brown hover:bg-paper/70"
                        }`}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                            c ? "border-ok bg-ok text-white" : "border-petflow-line bg-card"
                          }`}
                        >
                          {c && <Icon name="check" size={12} strokeWidth={3} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold">{t.label}</span>
                          {c && (
                            <span className="block truncate text-[10px] font-normal text-brown-faint">
                              {timeOf(c.at)}
                              {c.by ? ` · ${c.by}` : ""}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
