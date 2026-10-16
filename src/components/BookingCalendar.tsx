"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Avatar, EmptyState, MoreMenu, Segmented } from "@/components/ui";
import { BookingEditModal, type EditableBooking } from "@/components/BookingEditModal";
import { CustomerSendButtons } from "@/components/CustomerSendButtons";
import { InvoiceActionButtons } from "@/components/InvoiceActionButtons";
import { bookingOnDate } from "@/lib/booking-customer-match";
import { toast } from "@/components/Toast";
import { PreviewSendModal } from "@/components/PreviewSendModal";
import { groupBookings } from "@/lib/booking-group";
import {
  attachClosures,
  buildRoomBoard,
  roomCapacity,
  freeUnitsForRange,
  compositionOf,
  type RoomClosure,
} from "@/lib/room-board";
import { RoomClosureSheet } from "@/components/RoomClosureSheet";
import { BOOKING_STATUS_LABELS, type BookingStatus } from "@/lib/business";
import { effectiveBookingStatus } from "@/lib/booking-status";
import { GROOM_PROGRAMS, resolveGroomPrograms, type GroomProgram } from "@/lib/grooming-prices";
import { hasTransport, transportLabel } from "@/lib/transport";
import { DEPOSIT_STATUS_LABEL } from "@/lib/booking-deposit";

type CalendarDay = EditableBooking & {
  customerId?: string;
  /** ป้ายเตือนของแมวตัวนี้ — หลังบ้านเท่านั้น (API ไม่ส่งให้ฝั่งลูกค้า) */
  catMedical?: string;
  catStaffNote?: string;
  catPrivateNote?: string;
  careNote?: string;
  consentAcceptedAt?: string;
  consentSignature?: string;
  arrivalTime?: string;
  pickupTime?: string;
  /** ลูกค้าจองเองผ่านแอป — รอร้านกดรับคิว (ไม่ใช่รอลูกค้าตอบรับ) */
  selfBooked?: boolean;
};

function formatThaiDateTime(iso: string) {
  const d = new Date(iso);
  const day = formatThaiDate(iso.slice(0, 10));
  const time = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time} น.`;
}

function bookingWhen(b: CalendarDay) {
  if (b.service === "room" || b.checkin) {
    return `${b.checkin || b.date}${b.checkout ? ` → ${b.checkout}` : ""}`;
  }
  return `${b.date} ${b.time || ""}`.trim();
}

/** ปุ่ม "ออกบิล" ที่รู้สถานะบิลของนัดนี้ — กันออกบิลซ้ำ (1 นัด = 1 บิลเท่านั้น) */
function BillButton({
  bookingId,
  onPaidState,
}: {
  bookingId: string;
  /** แจ้งการ์ดแม่ว่าบิลของนัดนี้จ่ายจบแล้วหรือยัง — เอาไว้ติดป้าย "จบเคส" ทั้งใบ */
  onPaidState?: (paid: boolean) => void;
}) {
  const [inv, setInv] = useState<{ id: string; status: string; total: number } | null | undefined>(
    undefined
  );

  useEffect(() => {
    let alive = true;
    fetch(`/api/invoices?bookingId=${bookingId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setInv(d.invoice || null);
        onPaidState?.(d.invoice?.status === "paid");
      })
      .catch(() => {
        if (alive) setInv(null);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const chip =
    "flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-extrabold";
  if (inv === undefined) {
    return (
      <span className={`${chip} bg-paper text-brown-faint`} aria-label="กำลังโหลดบิล">
        <Icon name="receipt" size={16} />…
      </span>
    );
  }
  if (inv?.status === "paid") {
    return (
      <span className={`${chip} bg-ok/15 text-ok`} title={`บิลปิดแล้ว (${inv.total.toLocaleString()}฿)`}>
        <Icon name="check" size={16} strokeWidth={2.2} />
        ปิดบิล {inv.total.toLocaleString()}฿
      </span>
    );
  }
  if (inv) {
    return (
      <Link
        href={`/admin/billing?bookingId=${bookingId}`}
        title={`แก้ไขบิล (${inv.total.toLocaleString()}฿ · ค้างอยู่)`}
        className={`${chip} border border-honey-deep/50 bg-honey/20 text-petflow-chocolate`}
      >
        <Icon name="receipt" size={16} />
        บิลค้าง {inv.total.toLocaleString()}฿
      </Link>
    );
  }
  return (
    <Link
      href={`/admin/billing?bookingId=${bookingId}`}
      className={`${chip} border border-petflow-line bg-card text-petflow-chocolate`}
    >
      <Icon name="receipt" size={16} />
      ออกบิล
    </Link>
  );
}

function formatThaiDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const months = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

/** ตารางนัด + รายการนัดรายวัน — ใช้ในหน้า /admin/schedule */
/**
 * รายการย่อในตารางสัปดาห์/รายวัน — แถบสีซ้ายบอกสถานะทันทีโดยไม่ต้องอ่าน
 * เขียว = เข้าพัก · น้ำตาลเข้ม = ยืนยันแล้ว · เหลือง = ยังไม่ยืนยัน
 */
/**
 * ป้ายเตือนต่อแมว — สิ่งที่ช่าง/พนักงานต้องรู้ก่อนจับน้อง โดยไม่ต้องเปิดหน้าลูกค้า
 * โน้ตลับร้านเป็นสีแดงเพราะเป็นเรื่องความปลอดภัย (กัด/ข่วน) ไม่ใช่ข้อมูลทั่วไป
 * การ์ดของบ้านที่มีหลายตัวจะติดชื่อน้องกำกับ จะได้ไม่สับสนว่าป้ายของตัวไหน
 */
function CatTags({ group }: { group: CalendarDay[] }) {
  const rows = group
    .map((b) => ({
      name: b.catName,
      tags: [
        b.catPrivateNote ? { text: b.catPrivateNote, kind: "danger" as const } : null,
        b.catMedical && b.catMedical !== "ไม่มี"
          ? { text: b.catMedical, kind: "warn" as const }
          : null,
        b.catStaffNote ? { text: b.catStaffNote, kind: "info" as const } : null,
      ].filter(Boolean) as { text: string; kind: "danger" | "warn" | "info" }[],
    }))
    .filter((r) => r.tags.length > 0);
  if (rows.length === 0) return null;

  const many = group.length > 1;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {rows.flatMap((r) =>
        r.tags.map((tag, i) => (
          <span
            key={`${r.name}-${i}`}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
              tag.kind === "danger"
                ? "bg-red-50 text-red-700 ring-1 ring-red-200"
                : tag.kind === "warn"
                  ? "bg-wait/15 text-wait"
                  : "bg-latte/20 text-brown"
            }`}
          >
            {tag.kind === "danger" && <Icon name="alert" size={12} strokeWidth={2.2} />}
            {many ? `${r.name}: ` : ""}
            {tag.text}
          </span>
        ))
      )}
    </div>
  );
}

function MiniEntry({ group, onClick }: { group: CalendarDay[]; onClick: () => void }) {
  const b = group[0];
  const isRoom = b.service === "room";
  const confirmed = group.every((x) => x.status === "confirmed");
  const names = group.map((x) => x.catName).join(", ");
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${names} · ${b.customerName}`}
      className={`block w-full truncate rounded-lg border-l-[3px] px-1.5 py-1 text-left text-[10px] font-bold leading-tight ${
        isRoom
          ? "border-ok bg-sage/20 text-brown"
          : confirmed
            ? "border-latte-deep bg-latte/20 text-petflow-chocolate"
            : "border-honey-deep bg-honey/25 text-petflow-chocolate"
      }`}
    >
      {isRoom ? (
        <Icon name="bed" size={11} className="mr-0.5 inline align-[-2px]" />
      ) : b.time ? (
        `${b.time} `
      ) : (
        <Icon name="bath" size={11} className="mr-0.5 inline align-[-2px]" />
      )}
      {names}
      <span className="font-normal text-brown-faint"> · {b.customerName}</span>
    </button>
  );
}

export function BookingCalendar() {
  const router = useRouter();
  const [bookings, setBookings] = useState<CalendarDay[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ b: CalendarDay; group: CalendarDay[] } | null>(null);
  // เปิดแก้ไขนัด — ถ้าส่ง group มาด้วย (บ้านเดียวกัน นัดเดียวกัน หลายตัว) จะเสนอ
  // "เลื่อนวันให้ทุกตัว" ในโมดัลด้วย ไม่ต้องไล่แก้ทีละตัว
  const openEdit = (b: CalendarDay, group?: CalendarDay[]) =>
    setEditing({ b, group: group && group.length > 1 ? group : [b] });
  const [zoomSignature, setZoomSignature] = useState<string | null>(null);
  // นัดที่บิลจ่ายจบแล้ว (รายงานขึ้นมาจาก BillButton) — ติดป้าย "จบเคส" ให้เห็นชัดทั้งการ์ด
  const [paidCases, setPaidCases] = useState<Record<string, boolean>>({});
  const [rooms, setRooms] = useState<
    {
      id: string;
      name: string;
      size: string;
      price: number;
      count: number;
      maxCats?: number;
      composedOf?: { typeId: string; units: number }[];
      closures?: RoomClosure[];
    }[]
  >([]);
  const [roomClosures, setRoomClosures] = useState<RoomClosure[]>([]);
  /** ห้องที่กำลังตั้งปิด/เปิด (แตะห้องว่างหรือห้องที่ปิดในผังห้อง) */
  const [closingUnit, setClosingUnit] = useState<{ typeId: string; typeName: string; unit: number; current?: RoomClosure } | null>(null);
  const [groomSlots, setGroomSlots] = useState<string[]>(["09:30", "12:30", "15:30"]);
  const [groomPrograms, setGroomPrograms] = useState<GroomProgram[]>(GROOM_PROGRAMS);
  const [closedDates, setClosedDates] = useState<{ date: string; note?: string }[]>([]);
  const [closedWeekdays, setClosedWeekdays] = useState<number[]>([]);
  const [togglingClosed, setTogglingClosed] = useState(false);
  /** การ์ดที่รอยืนยันก่อนส่งจริง พร้อมงานที่จะทำต่อเมื่อกดยืนยัน */
  const [stagePreview, setStagePreview] = useState<{
    messages: Record<string, unknown>[];
    run: () => Promise<void>;
  } | null>(null);
  /** กรองรายการตามสถานะ — ไว้กวาดงานค้างเร็วๆ */
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "all">("all");
  const queueRef = useRef<HTMLElement>(null);

  /** นัดที่มีบิลผูกอยู่ — นัดที่ออกบิลแล้วถือว่าลูกค้ามาแล้ว ไม่ต้องรอยืนยัน */
  const [billedIds, setBilledIds] = useState<Set<string>>(new Set());

  /** 📅 เลื่อนนัดทั้งบ้าน — เปิดหน้าต่างเลือกวัน/เวลาใหม่ แล้วเลื่อนทุกตัวในบ้านพร้อมกัน */
  const [moving, setMoving] = useState<{
    group: CalendarDay[];
    date: string;
    time: string;
    checkin: string;
    checkout: string;
  } | null>(null);
  const [movingBusy, setMovingBusy] = useState(false);

  const openMove = (group: CalendarDay[]) => {
    const h = group[0];
    setMoving({
      group,
      date: h.date || h.checkin || "",
      time: h.time || "",
      checkin: h.checkin || h.date || "",
      checkout: h.checkout || "",
    });
  };

  const saveMove = async () => {
    if (!moving) return;
    const h = moving.group[0];
    const isRoom = h.service === "room";
    if (isRoom && moving.checkout && moving.checkout <= moving.checkin) {
      toast("วันออกต้องหลังวันเข้าพักนะ", "error");
      return;
    }
    setMovingBusy(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: h.id,
          action: "reschedule",
          applyToGroup: true,
          ...(isRoom
            ? { checkin: moving.checkin, checkout: moving.checkout, date: moving.checkin }
            : { date: moving.date, time: moving.time }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast("เลื่อนนัดไม่สำเร็จ", "error");
        return;
      }
      const inv = data.invoice;
      toast(
        `เลื่อนแล้ว ${Number(data.movedCount) || 1} ตัว` +
          (inv?.kind === "updated"
            ? ` · แก้บิลเป็น ${inv.nights} คืน ${Number(inv.total).toLocaleString()}฿`
            : inv?.kind === "created_extra"
              ? ` · ออกบิลต่อคืน ${inv.nights} คืน ${Number(inv.total).toLocaleString()}฿`
              : ""),
        "success"
      );
      if (inv?.kind === "warn") alert(`⚠️ ${inv.message}`);
      setMoving(null);
      load();
    } finally {
      setMovingBusy(false);
    }
  };

  /**
   * 🌙 ต่อคืน — กดทีเดียว เลื่อนวันออกให้ทุกตัวในบ้าน + ปรับบิลให้ตรงจำนวนคืน
   * (บิลยังไม่ปิด = แก้บิลเดิม · ปิดแล้ว = ออกบิลต่อคืนเฉพาะคืนที่เพิ่ม)
   */
  const extendStay = async (group: CalendarDay[]) => {
    const host = group[0];
    const oldOut = host.checkout || "";
    if (!host.checkin || !oldOut) {
      toast("นัดนี้ยังไม่มีวันเข้า-ออก — กดเมนู ⋯ > แก้ไข ใส่วันก่อนนะ", "error");
      return;
    }
    const raw = prompt(
      `🌙 ต่อคืน — ${group.map((g) => g.catName).join(", ")}\nวันออกเดิม ${oldOut}\n\nต่ออีกกี่คืน?`,
      "1"
    );
    if (raw == null) return;
    const extra = Math.round(Number(raw) || 0);
    if (extra <= 0) return;
    const d = new Date(`${oldOut}T12:00:00`);
    d.setDate(d.getDate() + extra);
    const newOut = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

    // เช็คว่าห้องประเภทนี้ยังว่างช่วงคืนที่เพิ่ม (ไม่นับตัวเองทั้งบ้าน)
    const roomId = host.room || host.roomType || "";
    const boardRooms = rooms.map((r) => ({
      id: r.id,
      name: r.name,
      count: r.count || 0,
      maxCats: roomCapacity(r),
      composedOf: r.composedOf,
      closures: r.closures,
    }));
    if (roomId && !compositionOf(roomId, boardRooms)) {
      const ids = new Set(group.map((g) => g.id));
      const free = freeUnitsForRange(
        boardRooms,
        liveBookings.filter((b) => !ids.has(b.id)),
        roomId,
        oldOut,
        newOut
      );
      if (
        boardRooms.some((r) => r.id === roomId && r.count > 0) &&
        free.length === 0 &&
        !confirm(`ห้องประเภทนี้เต็มบางคืนในช่วง ${oldOut} → ${newOut}\nยังจะต่อคืนอยู่ไหม?`)
      )
        return;
    }

    const res = await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: host.id,
        action: "reschedule",
        applyToGroup: true,
        checkin: host.checkin,
        checkout: newOut,
        date: host.checkin,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast("ต่อคืนไม่สำเร็จ", "error");
      return;
    }
    const inv = data.invoice;
    toast(
      `ต่อคืนแล้ว → ออก ${newOut}` +
        (inv?.kind === "updated"
          ? ` · แก้บิลเป็น ${inv.nights} คืน ${Number(inv.total).toLocaleString()}฿`
          : inv?.kind === "created_extra"
            ? ` · ออกบิลต่อคืน ${inv.nights} คืน ${Number(inv.total).toLocaleString()}฿`
            : ""),
      "success"
    );
    if (inv?.kind === "warn") alert(`⚠️ ${inv.message}`);
    load();
  };

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/bookings");
    const data = await res.json().catch(() => ({ bookings: [] }));
    setBookings(data.bookings || []);
    setLoading(false);
    try {
      const inv = await fetch("/api/invoices").then((r) => r.json());
      setBilledIds(
        new Set(
          ((inv.invoices || []) as { bookingId?: string }[])
            .map((i) => i.bookingId)
            .filter(Boolean) as string[]
        )
      );
    } catch {
      /* อ่านบิลไม่ได้ก็ยังใช้ตารางได้ แค่สถานะอิงวันที่เท่านั้น */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadConfig = useCallback(async () => {
    const d = await fetch("/api/config").then((r) => r.json());
    if (d.config?.rooms) setRooms(attachClosures(d.config.rooms, d.config.roomClosures));
    setRoomClosures(d.config?.roomClosures || []);
    if (d.config?.groomSlots) setGroomSlots(d.config.groomSlots);
    setGroomPrograms(resolveGroomPrograms(d.config?.groomPricePrograms));
    setClosedDates(d.config?.closedDates || []);
    setClosedWeekdays(d.config?.closedWeekdays || []);
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const today = new Date().toISOString().slice(0, 10);
  const activeDate = selectedDate || today;
  const activeWeekday = new Date(`${activeDate}T00:00:00`).getDay();
  const closedByWeekday = closedWeekdays.includes(activeWeekday);
  const closedByDate = closedDates.some((c) => c.date === activeDate);
  const dayIsClosed = closedByWeekday || closedByDate;

  /** ปิด/เปิดรับคิววันที่กำลังดูอยู่แบบเร็วๆ จากตารางนัด — เพิ่ม/ลบวันนี้ออกจาก closedDates
   * (ถ้าปิดเพราะเป็นวันหยุดประจำสัปดาห์อยู่แล้ว ต้องไปแก้ที่ตั้งค่า > อาบน้ำ ปุ่มนี้จัดการได้แค่วันเฉพาะกิจ) */
  const toggleDayClosed = async () => {
    if (closedByWeekday) return;
    setTogglingClosed(true);
    const nextClosedDates = closedByDate
      ? closedDates.filter((c) => c.date !== activeDate)
      : [...closedDates, { date: activeDate, note: "ปิดจากตารางนัด" }];
    const res = await fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch: { closedDates: nextClosedDates } }),
    });
    if (res.ok) {
      setClosedDates(nextClosedDates);
      toast(closedByDate ? "เปิดรับคิววันนี้แล้ว ✔️" : "ปิดรับคิววันนี้แล้ว 🚫", "success");
    } else {
      toast("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง", "error");
    }
    setTogglingClosed(false);
  };
  /**
   * บันทึกการปิดห้อง — อ่าน config ล่าสุดก่อนแก้ กันทับการปิดห้องที่เครื่องอื่นเพิ่งตั้ง
   * change: รับรายการล่าสุด คืนรายการใหม่
   */
  const saveClosures = async (change: (list: RoomClosure[]) => RoomClosure[], done: string) => {
    try {
      const latest = await fetch("/api/config").then((r) => r.json());
      const next = change((latest.config?.roomClosures as RoomClosure[] | undefined) || []);
      const res = await fetch("/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch: { roomClosures: next } }),
      });
      if (!res.ok) throw new Error("save_failed");
      setRoomClosures(next);
      setRooms((cur) => attachClosures(cur, next));
      setClosingUnit(null);
      toast(done, "success");
    } catch {
      toast("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง", "error");
    }
  };

  const [viewMonth, setViewMonth] = useState(() => today.slice(0, 7));
  /** มุมมองตาราง — เดือนดูภาพรวม, สัปดาห์วางแผน, วันทำงานหน้าร้าน, ห้องดูที่ว่าง */
  const [view, setView] = useState<"month" | "week" | "day" | "rooms">("month");

  const liveBookings = bookings.filter((b) => b.status !== "cancelled");
  const dayBookings = liveBookings.filter((b) => bookingOnDate(b, activeDate));

  const pickDate = (key: string) => {
    setSelectedDate(key);
    queueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const confirmBooking = async (b: CalendarDay) => {
    const res = await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: b.id, action: "confirm", lineUserId: b.lineUserId }),
    });
    const d = await res.json().catch(() => ({}));
    // notifyError = ยืนยันนัดสำเร็จ แต่แจ้งลูกค้าทาง LINE ไม่สำเร็จ (คนละเรื่องกับ res.ok)
    return { ok: res.ok, notifyError: d.notifyError as string | undefined };
  };

  const cancelBooking = async (b: CalendarDay) => {
    const res = await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: b.id, action: "cancel" }),
    });
    return res.ok;
  };

  // การ์ดที่รวมหลายตัวในบ้านเดียวกัน (นัดเดียวกัน) — ยืนยัน/ยกเลิกให้ครบทุกตัวในทีเดียว
  const confirmGroup = async (group: CalendarDay[]) => {
    const results = await Promise.all(group.map(confirmBooking));
    if (results.every((r) => r.ok)) toast("ยืนยันนัดแล้ว ✔️", "success");
    else toast("ยืนยันไม่สำเร็จบางรายการ", "error");
    const notifyErr = results.find((r) => r.notifyError)?.notifyError;
    if (notifyErr) toast(`⚠️ ยืนยันนัดแล้ว แต่แจ้งลูกค้าทาง LINE ไม่สำเร็จ: ${notifyErr}`, "error");
    load();
  };

  /**
   * เดินสถานะทั้งบ้านพร้อมกัน — "พร้อมรับกลับ" จะแจ้งลูกค้าทาง LINE ให้ด้วย
   * (ดูตัวอย่างการ์ดก่อนส่งเสมอ เพราะเป็นข้อความที่ลูกค้าได้รับจริง)
   */
  const setStageFor = async (group: CalendarDay[], action: string) => {
    const b = group[0];
    const ids = group.map((x) => x.id);
    const names = group.map((x) => x.catName).join(", ");

    if (action === "set_no_show") {
      if (!confirm(`บันทึกว่า ${names} · ${b.customerName} ไม่มาตามนัด?`)) return;
    }

    const run = async () => {
      const res = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: b.id, action, ids, lineUserId: b.lineUserId }),
      });
      const data = await res.json().catch(() => ({}));
      setStagePreview(null);
      if (!res.ok) return toast(data.error || "บันทึกไม่สำเร็จ", "error");
      if (action === "set_ready") {
        toast(data.sent ? "แจ้งลูกค้าแล้ว — น้องพร้อมกลับบ้าน 🎉" : "บันทึกแล้ว (ส่ง LINE ไม่ได้)", data.sent ? "success" : "info");
      } else {
        toast(action === "set_done" ? "ปิดงานแล้ว ✅" : "บันทึกว่าไม่มาแล้ว", "info");
      }
      load();
    };

    // ขั้นที่ส่งข้อความหาลูกค้า → ขอดูการ์ดก่อน
    if (action === "set_ready") {
      const res = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: b.id, action, ids, lineUserId: b.lineUserId, preview: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.preview?.length) {
        setStagePreview({ messages: data.preview, run });
        return;
      }
    }
    await run();
  };

  /** เพิ่มแมวอีกตัวเข้านัดเดียวกัน (บ้านเดียวกัน วัน/เวลา/ห้องเดียวกัน) โดยไม่ต้องไปกรอกจองใหม่ทั้งฟอร์ม */
  const addCatToGroup = async (group: CalendarDay[]) => {
    const b = group[0];
    const input = prompt(
      `เพิ่มน้องแมวเข้านัดของ ${b.customerName}
(ใส่ชื่อ — หลายตัวคั่นด้วย , )`
    );
    const names = (input || "")
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n && !group.some((g) => g.catName === n));
    if (names.length === 0) return;
    const results = await Promise.all(
      names.map((catName) =>
        fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: b.customerId,
            customerName: b.customerName,
            lineUserId: b.lineUserId,
            catName,
            service: b.service,
            date: b.service === "groom" ? b.date : undefined,
            time: b.time,
            groomProgram: b.groomProgram,
            // ตัวที่เพิ่มเข้านัดเดิมไปรถคันเดียวกัน
            transport: b.transport,
            room: b.room,
            roomUnit: b.roomUnit,
            checkin: b.checkin,
            checkout: b.checkout,
          }),
        }).then((r) => r.ok)
      )
    );
    if (results.every(Boolean)) toast(`เพิ่ม ${names.join(", ")} เข้านัดแล้ว ✔️`, "success");
    else toast("เพิ่มบางตัวไม่สำเร็จ", "error");
    load();
  };

  const cancelGroup = async (group: CalendarDay[]) => {
    const names = group.map((b) => b.catName).join(", ");
    const label = group[0].service === "room" ? "การเข้าพัก" : "นัด";
    if (!confirm(`ยกเลิก${label} ${names} · ${group[0].customerName}?`)) return;
    const results = await Promise.all(group.map(cancelBooking));
    if (results.every(Boolean)) toast("ยกเลิกแล้ว", "info");
    else toast("ยกเลิกไม่สำเร็จบางรายการ", "error");
    load();
  };

  // เดือนที่กำลังดู — เลื่อนไปเดือนอื่นได้ (ดูนัดล่วงหน้า/ย้อนหลัง)
  const [y, m] = viewMonth.split("-").map(Number);
  const ym = viewMonth;
  const shiftMonth = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    setViewMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const firstDay = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startPad = firstDay.getDay();

  // เลื่อนวัน/สัปดาห์ — เที่ยงวันกัน timezone ดึงวันเพี้ยนตอนแปลงกลับเป็น ISO
  const shiftDays = (delta: number) => {
    const d = new Date(`${activeDate}T12:00:00`);
    d.setDate(d.getDate() + delta);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    setSelectedDate(key);
    setViewMonth(key.slice(0, 7));
  };
  const shiftView = (delta: number) =>
    view === "month" ? shiftMonth(delta) : shiftDays(view === "week" ? delta * 7 : delta);

  // 7 วันของสัปดาห์ที่กำลังดู (เริ่มวันอาทิตย์ ให้ตรงกับหัวตารางเดือน)
  const weekDates = (() => {
    const d = new Date(`${activeDate}T12:00:00`);
    d.setDate(d.getDate() - d.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(d);
      x.setDate(d.getDate() + i);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(
        x.getDate()
      ).padStart(2, "0")}`;
    });
  })();

  // มุมมองรายวัน — แถวละชั่วโมง ครอบคลุมช่วงที่มีนัดจริง (อย่างน้อย 9:00–18:00)
  const dayGroups = groupBookings(dayBookings);

  // นับตามสถานะจาก "การ์ด" (บ้านละใบ) ไม่ใช่รายตัว — ให้ตรงกับที่ตาเห็นในลิสต์
  const statusChips = (
    [
      { id: "all" as const, label: "ทั้งหมด" },
      { id: "pending" as const, label: "รอยืนยัน" },
      { id: "confirmed" as const, label: "ยืนยันแล้ว" },
      { id: "ready" as const, label: "พร้อมรับกลับ" },
      { id: "done" as const, label: "เสร็จสิ้น" },
      { id: "no_show" as const, label: "ไม่มา" },
    ] as const
  )
    .map((c) => ({
      ...c,
      count:
        c.id === "all"
          ? dayGroups.length
          : dayGroups.filter((g) => g[0].status === c.id).length,
    }))
    .filter((c) => c.id === "all" || c.count > 0);

  const shownGroups =
    statusFilter === "all"
      ? dayGroups
      : dayGroups.filter((g) => g[0].status === statusFilter);
  const timedGroups = dayGroups.filter((g) => g[0].time);
  const allDayGroups = dayGroups.filter((g) => !g[0].time);
  const hourNums = timedGroups.map((g) => Number(g[0].time!.slice(0, 2)));
  const startHour = Math.min(9, ...hourNums);
  const endHour = Math.max(18, ...hourNums);
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  // ผังห้องของวันที่เลือก — ห้องไหนมีใคร ว่างกี่ห้องจริง วันไหนต้องรับต่อกัน
  const board = buildRoomBoard(
    rooms.map((r) => ({
      id: r.id,
      name: r.name,
      count: r.count,
      maxCats: roomCapacity(r),
      composedOf: r.composedOf,
      closures: r.closures,
    })),
    liveBookings,
    activeDate
  );

  const viewTitle =
    view === "month"
      ? `เดือน ${m}/${y}`
      : view === "week"
        ? `${formatThaiDate(weekDates[0])} – ${formatThaiDate(weekDates[6])}`
        : formatThaiDate(activeDate);

  if (loading) {
    return <p className="py-10 text-center text-sm text-brown-soft">กำลังโหลด…</p>;
  }

  return (
    <div className="space-y-5">
      {stagePreview && (
        <PreviewSendModal
          messages={stagePreview.messages}
          sending={false}
          onConfirm={() => stagePreview.run()}
          onCancel={() => setStagePreview(null)}
        />
      )}
      {moving && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-petflow-chocolate/40 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={() => !movingBusy && setMoving(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-t-[28px] bg-card px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-petflow sm:rounded-petflow sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-petflow-line sm:hidden" />
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Reschedule</p>
            <h2 className="flex items-center gap-1.5 text-lg font-extrabold text-petflow-chocolate">
              <Icon name="calendar" size={18} />
              เลื่อนนัดทั้งบ้าน
            </h2>
            <p className="mb-4 mt-1 text-xs text-brown-soft">
              {moving.group.map((g) => g.catName).join(", ")} ({moving.group.length} ตัว) —
              เปลี่ยนแค่วัน/เวลา ข้อมูลอื่นของแต่ละตัวไม่ถูกแตะ
            </p>
            {moving.group[0].service === "room" ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="min-w-0 text-xs font-bold text-brown-soft">
                  วันเข้าพัก
                  <input
                    type="date"
                    value={moving.checkin}
                    onChange={(e) => setMoving({ ...moving, checkin: e.target.value })}
                    className="mt-1 min-h-[44px] w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm text-brown"
                  />
                </label>
                <label className="min-w-0 text-xs font-bold text-brown-soft">
                  วันออก
                  <input
                    type="date"
                    value={moving.checkout}
                    onChange={(e) => setMoving({ ...moving, checkout: e.target.value })}
                    className="mt-1 min-h-[44px] w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm text-brown"
                  />
                </label>
                <p className="col-span-2 text-[10px] text-brown-faint">บิลห้องพักจะปรับจำนวนคืนให้เอง</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <label className="min-w-0 text-xs font-bold text-brown-soft">
                  วันที่
                  <input
                    type="date"
                    value={moving.date}
                    onChange={(e) => setMoving({ ...moving, date: e.target.value })}
                    className="mt-1 min-h-[44px] w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm text-brown"
                  />
                </label>
                <label className="min-w-0 text-xs font-bold text-brown-soft">
                  เวลา
                  <select
                    value={moving.time}
                    onChange={(e) => setMoving({ ...moving, time: e.target.value })}
                    className="mt-1 min-h-[44px] w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm text-brown"
                  >
                    {Array.from(new Set([moving.time, ...groomSlots].filter(Boolean))).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={movingBusy}
                onClick={() => setMoving(null)}
                className="min-h-[48px] flex-1 rounded-full bg-paper text-sm font-bold text-brown"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={movingBusy}
                onClick={saveMove}
                className="min-h-[48px] flex-[1.4] rounded-full bg-petflow-chocolate text-sm font-extrabold text-card shadow-petflow-sm disabled:opacity-50"
              >
                {movingBusy ? "กำลังเลื่อน..." : "เลื่อนทั้งบ้าน"}
              </button>
            </div>
          </div>
        </div>
      )}
      {closingUnit && (
        <RoomClosureSheet
          typeName={closingUnit.typeName}
          unit={closingUnit.unit}
          date={activeDate}
          current={closingUnit.current}
          onClose={() => setClosingUnit(null)}
          onSave={(c) =>
            saveClosures(
              (list) => [
                ...list.filter((x) => x.id !== closingUnit.current?.id),
                {
                  id: closingUnit.current?.id || `rc_${Date.now().toString(36)}`,
                  typeId: closingUnit.typeId,
                  unit: closingUnit.unit,
                  ...c,
                },
              ],
              `ปิดห้อง ${closingUnit.typeName} #${closingUnit.unit} แล้ว`
            )
          }
          onReopen={() =>
            saveClosures(
              (list) => list.filter((x) => x.id !== closingUnit.current?.id),
              `เปิดห้อง ${closingUnit.typeName} #${closingUnit.unit} แล้ว`
            )
          }
        />
      )}
      {editing && (
        <BookingEditModal
          booking={editing.b}
          siblings={editing.group
            .filter((x) => x.id !== editing.b.id)
            .map((x) => ({
              id: x.id,
              catName: x.catName,
              notes: x.notes,
              groomProgram: x.groomProgram,
            }))}
          rooms={rooms}
          groomSlots={groomSlots}
          groomPrograms={groomPrograms}
          roomBookings={liveBookings}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}

      <section className="rounded-petflow bg-card p-4 shadow-petflow-sm">
        {/* สลับมุมมอง — เดือนดูภาพรวม / สัปดาห์วางแผน / วันใช้ทำงานหน้าร้าน / ห้องดูที่ว่าง */}
        <Segmented
          value={view}
          onChange={setView}
          className="mb-4 [&>button]:min-h-[40px] [&>button]:gap-1 [&>button]:px-1.5 [&>button]:text-xs"
          options={[
            { id: "month", label: "เดือน", icon: "calendar" },
            { id: "week", label: "สัปดาห์", icon: "grid" },
            { id: "day", label: "วัน", icon: "clock" },
            { id: "rooms", label: "ห้อง", icon: "bed" },
          ]}
        />

        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => shiftView(-1)}
              aria-label="ก่อนหน้า"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper text-brown"
            >
              <Icon name="back" size={18} />
            </button>
            {/* แตะหัวข้อวันที่ = เปิดปฏิทินเลือกวันกระโดดไปได้เลย ไม่ต้องกดลูกศรทีละวัน */}
            <label className="relative cursor-pointer truncate rounded-full px-1 hover:bg-paper">
              <h2 className="truncate text-base font-extrabold text-petflow-chocolate underline decoration-dotted decoration-latte underline-offset-4">
                {viewTitle}
              </h2>
              <input
                type="date"
                aria-label="เลือกวันที่"
                value={activeDate}
                onClick={(e) => {
                  try {
                    (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
                  } catch {
                    /* เบราว์เซอร์เก่า — แตะช่องแล้วเปิดเองตามปกติ */
                  }
                }}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setViewMonth(v.slice(0, 7));
                  pickDate(v);
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <button
              type="button"
              onClick={() => shiftView(1)}
              aria-label="ถัดไป"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper text-brown"
            >
              <Icon name="chevron" size={18} />
            </button>
          </div>
          {(activeDate !== today || ym !== today.slice(0, 7)) && (
            <button
              type="button"
              onClick={() => {
                setViewMonth(today.slice(0, 7));
                pickDate(today);
              }}
              className="flex min-h-[40px] shrink-0 items-center rounded-full bg-honey/30 px-3.5 text-xs font-bold text-petflow-chocolate"
            >
              วันนี้
            </button>
          )}
        </div>

        {view === "week" && (
          <div className="grid gap-1.5 sm:grid-cols-7">
            {weekDates.map((key) => {
              const items = groupBookings(liveBookings.filter((b) => bookingOnDate(b, key)));
              const d = new Date(`${key}T12:00:00`);
              const isToday = key === today;
              const isSelected = key === activeDate;
              return (
                <div
                  key={key}
                  className={`rounded-xl p-1.5 ${
                    isSelected
                      ? "bg-latte/25 ring-2 ring-latte-deep"
                      : isToday
                        ? "bg-honey/25 ring-1 ring-honey-deep"
                        : "bg-paper/50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => pickDate(key)}
                    className="mb-1 flex min-h-[36px] w-full items-center gap-1.5 px-1 text-left sm:justify-center"
                  >
                    <span className="text-[10px] font-bold text-brown-faint">
                      {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"][d.getDay()]}
                    </span>
                    <span className="text-sm font-extrabold text-petflow-chocolate">
                      {d.getDate()}
                    </span>
                    {items.length > 0 && (
                      <span className="text-[9px] font-bold text-brown-faint">
                        · {items.length}
                      </span>
                    )}
                  </button>
                  <div className="space-y-1">
                    {items.length === 0 ? (
                      <p className="px-1 pb-1 text-[9px] text-brown-faint sm:text-center">—</p>
                    ) : (
                      items.map((g) => (
                        <MiniEntry key={g[0].id} group={g} onClick={() => pickDate(key)} />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {view === "day" && (
          <div>
            {allDayGroups.length > 0 && (
              <div className="mb-2 rounded-xl bg-sage/15 p-2">
                <p className="mb-1 flex items-center gap-1 text-[10px] font-bold text-brown-faint">
                  <Icon name="bed" size={12} />
                  ทั้งวัน / เข้าพัก
                </p>
                <div className="space-y-1">
                  {allDayGroups.map((g) => (
                    <MiniEntry key={g[0].id} group={g} onClick={() => openEdit(g[0], g)} />
                  ))}
                </div>
              </div>
            )}
            <div className="divide-y divide-petflow-line">
              {hours.map((h) => {
                const slot = timedGroups.filter((g) => Number(g[0].time!.slice(0, 2)) === h);
                return (
                  <div key={h} className="flex gap-2 py-1.5">
                    <span className="w-11 shrink-0 pt-0.5 text-[10px] font-bold text-brown-faint">
                      {String(h).padStart(2, "0")}:00
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      {slot.length === 0 ? (
                        <div className="h-4 rounded bg-paper/40" />
                      ) : (
                        slot.map((g) => (
                          <MiniEntry key={g[0].id} group={g} onClick={() => openEdit(g[0], g)} />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === "rooms" && (
          <div>
            {/* สรุปหัวตาราง — ว่างกี่ห้องจริง เห็นตัวเดียวจบ */}
            <div
              className={`mb-3 flex items-center justify-between gap-3 rounded-petflow-sm px-3 py-2.5 ${
                board.isFull ? "bg-red-50 ring-1 ring-red-300" : "bg-sage/15"
              }`}
            >
              <div>
                <p className="flex items-center gap-1.5 text-sm font-extrabold text-petflow-chocolate">
                  <span
                    aria-hidden
                    className={`h-2.5 w-2.5 rounded-full ${board.isFull ? "bg-red-500" : "bg-ok"}`}
                  />
                  {board.isFull ? "ห้องเต็มแล้ว" : `ว่าง ${board.free} ห้อง`}
                </p>
                <p className="text-[10px] text-brown-soft">
                  ใช้อยู่ {board.occupied} / {board.totalUnits} ห้อง
                  {board.closed > 0 && ` · ปิด ${board.closed}`} ·{" "}
                  {formatThaiDate(activeDate)}
                </p>
              </div>
            </div>

            <p className="-mt-1 mb-3 px-1 text-[10px] text-brown-faint">แตะห้องว่างเพื่อปิดห้อง (ซ่อม/ใช้งานไม่ได้) · แตะห้องที่ปิดเพื่อเปิด</p>

            {/* จองเกินจำนวนห้อง — ต้องเห็นก่อนเพื่อน */}
            {board.overflow.length > 0 && (
              <div className="mb-3 rounded-petflow-sm bg-red-50 px-3 py-2 ring-1 ring-red-300">
                <p className="flex items-center gap-1.5 text-[11px] font-extrabold text-red-600">
                  <Icon name="alert" size={14} />
                  จองเกินจำนวนห้องที่มี {board.overflow.length} รายการ
                </p>
                <p className="mt-0.5 text-[10px] text-brown-soft">
                  {board.overflow.map((b) => `${b.catName} · ${b.customerName}`).join(" / ")}
                  {" — ต้องย้ายประเภทห้องหรือเลื่อนวัน"}
                </p>
              </div>
            )}

            {/* รับต่อกันในวันเดียว — ห้องเดิมมีคนออกและคนเข้าวันนี้ */}
            {board.turnovers.length > 0 && (
              <div className="mb-3 rounded-petflow-sm bg-wait/10 px-3 py-2.5 ring-1 ring-wait/40">
                <p className="flex items-center gap-1.5 text-[11px] font-extrabold text-wait">
                  <Icon name="clock" size={14} />
                  ต้องเคลียร์ห้องรับต่อวันนี้ {board.turnovers.length} ห้อง
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {board.turnovers.map((u) => {
                    const out = u.leaving[0];
                    const inn = u.staying[0];
                    const outNames = u.leaving.map((x) => x.catName).join(", ");
                    const innNames = u.staying.map((x) => x.catName).join(", ");
                    const gapOk = out.pickupTime && inn.arrivalTime
                      ? out.pickupTime <= inn.arrivalTime
                      : true;
                    return (
                      <li
                        key={`${u.typeId}-${u.unit}`}
                        className="rounded-lg bg-card px-2 py-1.5 text-[10px]"
                      >
                        <p className="font-extrabold text-petflow-chocolate">
                          {u.typeName} #{u.unit}
                        </p>
                        <p className="mt-0.5 text-brown-soft">
                          ออก: {outNames} · {out.customerName} —{" "}
                          <span className={out.pickupTime ? "font-bold text-ok" : "text-brown-faint"}>
                            {out.pickupTime ? `รับ ${out.pickupTime} น.` : "ยังไม่แจ้งเวลารับ"}
                          </span>
                        </p>
                        <p className="text-brown-soft">
                          เข้า: {innNames} · {inn.customerName} —{" "}
                          <span className={inn.arrivalTime ? "font-bold text-ok" : "text-brown-faint"}>
                            {inn.arrivalTime ? `ส่ง ${inn.arrivalTime} น.` : "ยังไม่แจ้งเวลาส่ง"}
                          </span>
                        </p>
                        {!gapOk && (
                          <p className="mt-1 rounded bg-red-50 px-1.5 py-1 font-bold text-red-700">
                            เวลาชนกัน — คนใหม่มาส่ง {inn.arrivalTime} น. ก่อนคนเก่ามารับ{" "}
                            {out.pickupTime} น.
                          </p>
                        )}
                        {gapOk && (!out.pickupTime || !inn.arrivalTime) && (
                          <p className="mt-1 text-brown-faint">
                            ใส่เวลารับ-ส่งในหน้าแก้ไขนัด จะเช็คให้ว่าคิวชนกันไหม
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* ผังห้องจริง — แยกตามประเภท ห้องละกล่อง */}
            <div className="space-y-3">
              {board.byType.map((t) => (
                <div key={t.typeId}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <p className="text-[11px] font-extrabold text-petflow-chocolate">
                      {t.typeName}
                    </p>
                    <p
                      className={`text-[10px] font-bold ${
                        t.free === 0 ? "text-red-600" : "text-ok"
                      }`}
                    >
                      {t.free === 0 ? "เต็ม" : `ว่าง ${t.free}`} / {t.total} ห้อง
                      {t.closed > 0 && ` · ปิด ${t.closed}`}
                      {t.cats > 0 && ` · ${t.cats} ตัว`}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
                    {t.units.map((u) => {
                      const host = u.staying[0];
                      const busy = u.staying.length > 0 || !!u.partOf;
                      return (
                        <button
                          key={u.unit}
                          type="button"
                          onClick={() =>
                            host
                              ? openEdit(host as CalendarDay, u.staying as CalendarDay[])
                              : !u.partOf &&
                                setClosingUnit({ typeId: t.typeId, typeName: t.typeName, unit: u.unit, current: u.closed })
                          }
                          aria-label={host ? undefined : u.closed ? `ห้อง #${u.unit} ปิดอยู่ แตะเพื่อเปิดหรือแก้` : `ห้อง #${u.unit} ว่าง แตะเพื่อปิดห้อง`}
                          className={`min-h-[62px] rounded-xl px-2 py-1.5 text-left transition ${
                            u.turnover
                              ? "bg-wait/20 ring-1 ring-wait"
                              : busy
                                ? "bg-latte/25 ring-1 ring-latte-deep/40 hover:bg-latte/35"
                                : u.closed
                                  ? "bg-[repeating-linear-gradient(135deg,rgba(0,0,0,0.04)_0_6px,transparent_6px_12px)] ring-1 ring-brown-faint/50"
                                  : "bg-paper/50 ring-1 ring-dashed ring-petflow-line hover:bg-paper"
                          }`}
                        >
                          <p className="text-[9px] font-bold text-brown-faint">
                            #{u.unit}
                            {u.turnover && " · รับต่อ"}
                            {!u.turnover && u.arriving && " · เข้าวันนี้"}
                            {u.staying.length > 1 && ` · ${u.staying.length} ตัว`}
                          </p>
                          {u.partOf && (
                            <p className="flex items-center gap-0.5 truncate text-[9px] font-bold text-latte-deep">
                              <Icon name="link" size={10} />
                              {u.partOf}
                            </p>
                          )}
                          {host ? (
                            <>
                              <p className="truncate text-[11px] font-extrabold text-petflow-chocolate">
                                {u.staying.map((x) => x.catName).join(", ")}
                              </p>
                              <p className="truncate text-[9px] text-brown-soft">
                                {host.customerName}
                              </p>
                              <p className="truncate text-[9px] text-brown-faint">
                                ถึง {host.checkout || "-"}
                              </p>
                            </>
                          ) : u.partOf ? (
                            <p className="pt-1 text-center text-[9px] text-brown-faint">
                              (ห้องที่เชื่อมอยู่)
                            </p>
                          ) : u.closed ? (
                            <>
                              <p className="flex items-center gap-1 truncate text-[11px] font-extrabold text-brown">
                                <Icon name="x" size={11} strokeWidth={2.6} />
                                ปิด · {u.closed.reason}
                              </p>
                              <p className="truncate text-[9px] text-brown-faint">
                                {u.closed.to ? `ถึง ${u.closed.to}` : "จนกว่าจะเปิด"}
                              </p>
                            </>
                          ) : (
                            <p className="pt-2 text-center text-[10px] font-bold text-brown-faint">
                              ว่าง
                            </p>
                          )}
                          {host && u.closed && (
                            <p className="mt-0.5 truncate text-[9px] font-bold text-red-600">
                              ห้องปิด ({u.closed.reason}) แต่มีแมวอยู่
                            </p>
                          )}
                          {u.leaving.length > 0 && (
                            <p className="mt-0.5 truncate text-[9px] text-wait">
                              {u.leaving.map((x) => x.catName).join(", ")} ออกวันนี้
                            </p>
                          )}
                          {u.overCapacity && (
                            <p className="mt-0.5 truncate text-[9px] font-bold text-red-600">
                              เกินความจุ ({u.capacity})
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "month" && (
        <>
        <p className="mb-2.5 text-xs text-brown-soft">แตะวันที่เพื่อดูรายการของวันนั้น</p>
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d) => (
            <div key={d} className="pb-1 text-xs font-bold text-brown-faint">
              {d}
            </div>
          ))}
          {Array.from({ length: startPad }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const key = `${ym}-${String(day).padStart(2, "0")}`;
            const dayItems = liveBookings.filter((b) => bookingOnDate(b, key));
            const stays = dayItems.filter((b) => b.service === "room").length;
            const appts = dayItems.length - stays;
            const isToday = key === today;
            const isSelected = key === activeDate;
            const keyClosed =
              closedWeekdays.includes(new Date(`${key}T00:00:00`).getDay()) ||
              closedDates.some((c) => c.date === key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => pickDate(key)}
                className={`flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-xl py-2 transition ${
                  isSelected
                    ? "bg-latte/40 text-petflow-chocolate ring-2 ring-latte-deep"
                    : isToday
                      ? "bg-honey/40 text-petflow-chocolate ring-1 ring-honey-deep"
                      : keyClosed
                        ? "bg-wait/10 text-brown-faint hover:bg-wait/15"
                        : stays > 0
                          ? "bg-sage/25 text-brown hover:bg-sage/35"
                          : "bg-paper/60 text-brown hover:bg-paper"
                }`}
              >
                <span className="text-base font-extrabold leading-none">{day}</span>
                {keyClosed && (
                  <span className="rounded-full bg-wait px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                    ปิด
                  </span>
                )}
                {!keyClosed && stays > 0 && (
                  <span className="rounded-full bg-ok px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                    พัก{stays > 1 ? ` ${stays}` : ""}
                  </span>
                )}
                {!keyClosed && appts > 0 && (
                  <span className="rounded-full bg-latte-deep px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                    {appts} นัด
                  </span>
                )}
                {!keyClosed && stays === 0 && appts === 0 && <span className="h-[15px]" />}
              </button>
            );
          })}
        </div>
        </>
        )}
      </section>

      <section ref={queueRef} className="scroll-mt-4 rounded-petflow bg-card p-4 shadow-petflow-sm">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">
              {activeDate === today ? "Today" : "Day"}
            </p>
            <h2 className="text-base font-extrabold text-petflow-chocolate">
              {formatThaiDate(activeDate)}
            </h2>
            <p className="text-xs text-brown-soft">
              {(() => {
                const stays = dayBookings.filter((b) => b.service === "room").length;
                const appts = dayBookings.length - stays;
                const parts = [
                  stays > 0 ? `เข้าพัก ${stays}` : "",
                  appts > 0 ? `อาบน้ำ ${appts}` : "",
                ].filter(Boolean);
                return parts.length ? parts.join(" · ") : "ไม่มีรายการ";
              })()}
            </p>
            {dayIsClosed && (
              <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-wait/10 px-2.5 py-1 text-[11px] font-bold text-wait">
                <Icon name="alert" size={12} />
                ร้านปิดวันนี้
                {closedByWeekday
                  ? " (วันหยุดประจำสัปดาห์ — แก้ได้ที่ ตั้งค่า > อาบน้ำ)"
                  : closedDates.find((c) => c.date === activeDate)?.note
                    ? ` — ${closedDates.find((c) => c.date === activeDate)?.note}`
                    : ""}
              </p>
            )}
          </div>
          {/* ปุ่มรองของทั้งวัน — จองใหม่หลักอยู่ที่ปุ่ม + ในแถบล่าง */}
          <MoreMenu
            label="ตัวเลือกของวันนี้"
            items={[
              {
                label: `จองคิววันที่ ${formatThaiDate(activeDate)}`,
                icon: "plus",
                onClick: () => router.push(`/admin/bookings/new?date=${activeDate}`),
              },
              {
                label: togglingClosed
                  ? "กำลังบันทึก…"
                  : closedByWeekday
                    ? "วันหยุดประจำ (แก้ที่ ตั้งค่า > อาบน้ำ)"
                    : dayIsClosed
                      ? "เปิดรับคิววันนี้"
                      : "ปิดรับคิววันนี้",
                icon: dayIsClosed ? "check" : "x",
                disabled: togglingClosed || closedByWeekday,
                onClick: toggleDayClosed,
              },
            ]}
          />
        </div>
        {/* กรองตามสถานะ พร้อมตัวเลข — กวาดงานค้างได้เร็วโดยไม่ต้องไล่อ่านทีละใบ */}
        {dayBookings.length > 0 && statusChips.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {statusChips.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={statusFilter === c.id}
                onClick={() => setStatusFilter(c.id)}
                className={`flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-xs font-bold transition ${
                  statusFilter === c.id
                    ? "bg-petflow-chocolate text-card"
                    : "bg-paper text-brown-soft hover:bg-honey/20"
                }`}
              >
                {c.label}
                <span
                  className={`rounded-full px-1.5 text-[10px] leading-4 ${
                    statusFilter === c.id ? "bg-card/20" : "bg-card text-brown"
                  }`}
                >
                  {c.count}
                </span>
              </button>
            ))}
          </div>
        )}
        <ul className="space-y-2.5">
          {shownGroups.length === 0 ? (
            <li className="rounded-petflow-sm border border-dashed border-petflow-line">
              <EmptyState
                icon="calendar"
                title={
                  dayBookings.length === 0 ? "ไม่มีนัด/การเข้าพักในวันนี้" : "ไม่มีรายการในสถานะนี้"
                }
              />
              {dayBookings.length === 0 && (
                <div className="-mt-3 pb-5 text-center">
                  <Link
                    href={`/admin/bookings/new?date=${activeDate}`}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-honey/40 px-4 text-xs font-extrabold text-petflow-chocolate"
                  >
                    <Icon name="plus" size={16} />
                    จองคิววันนี้
                  </Link>
                </div>
              )}
            </li>
          ) : (
            shownGroups.map((group) => {
              const b = group[0];
              const allConfirmed = group.every((x) => x.status === "confirmed");
              const stage = effectiveBookingStatus(group[0], today, billedIds);
              const catNames = group.map((x) => x.catName).join(", ");
              const caseDone = paidCases[b.id] === true;
              const many = group.length > 1;

              // ปุ่มหลักของการ์ด — ขั้นถัดไปของงาน (ยืนยัน → พร้อมรับกลับ → ปิดงาน) มีได้ทีละปุ่มเดียว
              const primary =
                !allConfirmed && stage !== "ready" && stage !== "done"
                  ? { label: "ยืนยันนัด", icon: "check", run: () => confirmGroup(group) }
                  : allConfirmed && stage !== "ready" && stage !== "done"
                    ? { label: "พร้อมกลับบ้าน", icon: "send", run: () => setStageFor(group, "set_ready") }
                    : stage === "ready"
                      ? { label: "ปิดงาน", icon: "check", run: () => setStageFor(group, "set_done") }
                      : null;

              // ปุ่มรองทั้งหมดรวมไว้ในเมนู ⋯ (ชื่อซ้ำกันไม่ได้ เพราะเมนูใช้ชื่อเป็น key)
              const used = new Set<string>();
              const uniq = (label: string) => {
                let l = label;
                for (let n = 2; used.has(l); n += 1) l = `${label} (${n})`;
                used.add(l);
                return l;
              };
              const menu: { label: string; icon?: string; onClick: () => void; danger?: boolean }[] = [
                {
                  label: uniq(many ? "แก้ไขนัดทั้งบ้าน" : "แก้ไขนัด"),
                  icon: "edit",
                  onClick: () => openEdit(b, group),
                },
                ...(many
                  ? [{ label: uniq("เลื่อนนัดทั้งบ้าน"), icon: "calendar", onClick: () => openMove(group) }]
                  : []),
                ...((b.service === "room" || !!b.checkout) && b.checkout
                  ? [{ label: uniq("ต่อคืน"), icon: "bed", onClick: () => extendStay(group) }]
                  : []),
                { label: uniq("เพิ่มแมวในนัดนี้"), icon: "plus", onClick: () => addCatToGroup(group) },
                ...(b.customerId
                  ? [
                      {
                        label: uniq("ดูข้อมูลลูกค้า"),
                        icon: "user",
                        onClick: () => router.push(`/admin/customers?id=${b.customerId}`),
                      },
                    ]
                  : []),
                {
                  label: uniq("เพิ่มลงปฏิทิน (iCal)"),
                  icon: "download",
                  onClick: () => {
                    window.location.href = `/api/calendar/${b.id}`;
                  },
                },
                ...(stage !== "done" && stage !== "no_show"
                  ? [{ label: uniq("ไม่มาตามนัด"), icon: "x", onClick: () => setStageFor(group, "set_no_show") }]
                  : []),
                // บ้านที่มาหลายตัว — ยกเลิกทีละตัวได้ เผื่อน้องตัวใดตัวหนึ่งมาไม่ได้
                ...(many
                  ? group.map((x) => ({
                      label: uniq(`ยกเลิก ${x.catName}`),
                      icon: "trash",
                      danger: true,
                      onClick: () => cancelGroup([x]),
                    }))
                  : []),
                {
                  label: uniq(many ? "ยกเลิกทั้งบ้าน" : "ยกเลิกนัด"),
                  icon: "trash",
                  danger: true,
                  onClick: () => cancelGroup(group),
                },
              ];

              return (
              <li
                key={group.map((x) => x.id).join(",")}
                className={`rounded-petflow-sm border p-3 ${
                  caseDone
                    ? "border-ok/50 bg-ok/5"
                    : "border-petflow-line bg-paper/50"
                }`}
              >
                {caseDone && (
                  <p className="mb-2.5 flex items-center gap-1.5 rounded-petflow-sm bg-ok/15 px-2.5 py-1.5 text-[11px] font-extrabold text-ok">
                    <Icon name="check" size={14} strokeWidth={2.4} />
                    เคสนี้จบแล้ว — ชำระครบ ปิดงานเรียบร้อย
                  </p>
                )}
                {/* นัดที่ลูกค้าจองเอง ต่างจากนัดที่ร้านสร้าง: "รอยืนยัน" = รอ "ร้าน" กดรับ ไม่ใช่รอลูกค้า */}
                {!allConfirmed && group.some((x) => x.selfBooked) && (
                  <p className="mb-2.5 flex items-start gap-1.5 rounded-petflow-sm bg-honey/25 px-2.5 py-1.5 text-[11px] font-extrabold text-wait">
                    <Icon name="user" size={14} className="mt-px shrink-0" />
                    <span>
                      ลูกค้าจองเองผ่านแอป — กด “ยืนยันนัด” เพื่อรับคิว
                      (ระบบจะแจ้งลูกค้าทาง LINE ให้อัตโนมัติ)
                    </span>
                  </p>
                )}
                <div className="flex items-start gap-3">
                  <Avatar name={b.customerName} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-words text-sm font-extrabold text-petflow-chocolate">
                        {b.customerName}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          caseDone || stage === "done"
                            ? "bg-ok text-white"
                            : stage === "ready"
                              ? "bg-latte-deep text-white"
                              : stage === "no_show"
                                ? "bg-red-50 text-red-600"
                                : allConfirmed
                                  ? "bg-sage/20 text-ok"
                                  : "bg-honey/25 text-wait"
                        }`}
                      >
                        {caseDone
                          ? "จบเคส"
                          : stage === "ready"
                            ? "พร้อมรับกลับ"
                            : BOOKING_STATUS_LABELS[stage] || "รอยืนยัน"}
                      </span>
                    </div>
                    <p className="flex items-center gap-1 break-words text-xs font-bold text-brown">
                      <Icon name="paw" size={13} className="text-brown-soft" />
                      <span className="min-w-0">
                        {catNames}
                        {many ? ` (${group.length} ตัว)` : ""}
                      </span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 break-words text-xs text-brown-soft">
                      <Icon name={b.service === "room" ? "bed" : "bath"} size={13} />
                      {hasTransport(b.transport) && (
                        <Icon name="car" size={13} className="text-petflow-chocolate" />
                      )}
                      <span className="min-w-0">
                        {b.service === "room"
                          ? rooms.find((r) => r.id === b.room)?.name || b.room || "ห้องพัก"
                          : "อาบน้ำ"}{" "}
                        · {bookingWhen(b)}
                      </span>
                    </p>
                  </div>
                </div>
                <CatTags group={group} />
                {/* มัดจำตอนลูกค้าจองเอง — เห็นทันทีว่าใครโอนแล้ว/ยังไม่โอน (แตะเพื่อเปิดดูสลิป/กดรับมัดจำ) */}
                {(() => {
                  const dep = group.find((x) => x.depositAmount);
                  if (!dep?.depositAmount) return null;
                  const st = dep.depositStatus || "none";
                  return (
                    <button
                      type="button"
                      onClick={() => openEdit(dep, group)}
                      className={`mt-2 flex min-h-[32px] items-center gap-1.5 rounded-full px-3 text-[11px] font-extrabold ${
                        st === "paid"
                          ? "bg-sage/20 text-ok"
                          : st === "pending_review"
                            ? "bg-honey/25 text-wait"
                            : "bg-red-50 text-red-600"
                      }`}
                    >
                      💰 มัดจำ {dep.depositAmount.toLocaleString()} ฿ · {DEPOSIT_STATUS_LABEL[st]}
                    </button>
                  );
                })()}
                {b.service === "room" &&
                  (b.consentAcceptedAt ? (
                    <div className="mt-2 flex items-center gap-2">
                      <p className="flex min-w-0 items-center gap-1 text-[11px] font-bold text-ok">
                        <Icon name="check" size={13} strokeWidth={2.4} />
                        <span className="min-w-0">
                          ยอมรับข้อตกลงแล้ว เมื่อ {formatThaiDateTime(b.consentAcceptedAt)}
                        </span>
                      </p>
                      {b.consentSignature && (
                        <button
                          type="button"
                          onClick={() => setZoomSignature(b.consentSignature!)}
                          className="flex min-h-[40px] shrink-0 items-center"
                          title="กดดูลายเซ็นแบบเต็ม"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={b.consentSignature}
                            alt="ลายเซ็นลูกค้า — กดเพื่อดูขยาย"
                            className="h-7 w-16 rounded border border-petflow-line bg-white object-contain"
                          />
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 flex items-center gap-1 text-[11px] font-bold text-wait">
                      <Icon name="clock" size={13} />
                      ยังไม่กดยอมรับข้อตกลง
                    </p>
                  ))}
                {b.service === "room" && b.consentAcceptedAt && (
                  <div className="mt-1 space-y-1">
                    {group.map((x) => (
                      <div key={x.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                        <span className="flex items-center gap-1 font-bold text-brown-soft">
                          <Icon name="paw" size={12} />
                          {x.catName}
                        </span>
                        {x.vaccinePhotoUrl ? (
                          <a
                            href={x.vaccinePhotoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex min-h-[40px] items-center gap-1.5 font-bold text-ok underline"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={x.vaccinePhotoUrl}
                              alt="สมุดวัคซีน"
                              className="h-8 w-8 rounded border border-petflow-line object-cover"
                            />
                            ดูสมุดวัคซีน
                          </a>
                        ) : (
                          <span className="text-brown-faint">ยังไม่ได้แนบสมุดวัคซีน</span>
                        )}
                        {x.fleaTickTreated && (
                          <span className="flex items-center gap-1 font-bold text-ok">
                            <Icon name="check" size={12} strokeWidth={2.4} />
                            หยดยาเห็บหมัดแล้ว
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {hasTransport(b.transport) && (
                  <div className="mt-1.5 flex items-start gap-2 rounded-petflow-sm bg-honey/15 px-2.5 py-1.5 text-[11px]">
                    <Icon name="car" size={14} className="mt-px shrink-0 text-petflow-chocolate" />
                    <span className="min-w-0 flex-1 break-words">
                      <b className="text-petflow-chocolate">
                        {b.service === "room"
                          ? [
                              b.transport.pickup && `รับน้อง ${b.checkin || b.date}`,
                              b.transport.dropoff && `ส่งกลับ ${b.checkout || ""}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : transportLabel(b.transport)}
                      </b>
                      {b.transport.address && (
                        <span className="block text-brown-soft">{b.transport.address}</span>
                      )}
                      {!b.transport.mapUrl && !b.transport.address && (
                        <span className="block font-bold text-wait">รอลูกค้าส่งจุดรับ-ส่ง</span>
                      )}
                    </span>
                    {b.transport.mapUrl && (
                      <a
                        href={b.transport.mapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-[32px] shrink-0 items-center gap-1 rounded-full bg-card px-2.5 font-bold text-latte-deep shadow-petflow-sm"
                      >
                        <Icon name="pin" size={13} />
                        แผนที่
                      </a>
                    )}
                  </div>
                )}
                {(b.arrivalTime || b.pickupTime) && (
                  <p className="mt-1.5 flex items-start gap-1 text-[11px] font-bold text-latte-deep">
                    <Icon name="clock" size={13} className="mt-px" />
                    <span className="min-w-0">
                      {b.arrivalTime && `ลูกค้าแจ้งเวลาส่งน้อง: ${b.arrivalTime}`}
                      {b.arrivalTime && b.pickupTime && " · "}
                      {b.pickupTime && `ลูกค้าแจ้งเวลารับน้อง: ${b.pickupTime}`}
                    </span>
                  </p>
                )}
                {group
                  .filter((x) => x.careNote)
                  .map((x) => (
                    <p
                      key={x.id}
                      className="mt-1.5 flex items-start gap-1.5 rounded-petflow-sm bg-sage/15 px-2.5 py-1.5 text-[11px] text-brown break-words"
                    >
                      <Icon name="doc" size={13} className="mt-px text-brown-soft" />
                      <span className="min-w-0">
                        {x.catName}: {x.careNote}
                      </span>
                    </p>
                  ))}

                {/* แถวปุ่ม: ปุ่มหลัก 1 ปุ่ม · สถานะบิล · เมนู ⋯ รวมปุ่มรองทั้งหมด */}
                <div className="mt-3 flex items-center gap-2">
                  {primary ? (
                    <button
                      type="button"
                      onClick={primary.run}
                      className={`flex min-h-[40px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-extrabold shadow-petflow-sm ${
                        primary.label === "พร้อมกลับบ้าน"
                          ? "bg-latte-deep text-white"
                          : "bg-petflow-chocolate text-card"
                      }`}
                    >
                      <Icon name={primary.icon} size={16} strokeWidth={2.2} />
                      <span className="truncate">{primary.label}</span>
                    </button>
                  ) : (
                    <span className="flex-1" />
                  )}
                  <BillButton
                    bookingId={b.id}
                    onPaidState={(paid) =>
                      setPaidCases((prev) =>
                        prev[b.id] === paid ? prev : { ...prev, [b.id]: paid }
                      )
                    }
                  />
                  <MoreMenu label="จัดการนัดนี้" items={menu} />
                </div>

                {/* ส่งข้อความ LINE / เอกสาร — พับไว้ กดเปิดเมื่อจะใช้ */}
                <details className="group mt-3 border-t border-petflow-line pt-1 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-2 text-xs font-bold text-brown-soft">
                    <Icon name="message" size={16} />
                    <span className="flex-1">ส่งข้อความ LINE · เอกสาร</span>
                    <Icon name="chevron" size={16} className="transition group-open:rotate-90" />
                  </summary>
                  <div className="pb-1 pt-1">
                    <CustomerSendButtons
                      bookingId={b.id}
                      lineUserId={b.lineUserId}
                      customerId={b.customerId}
                      service={b.service}
                      groomBookingIds={many ? group.map((x) => x.id) : undefined}
                      initialAutoOff={b.autoOff}
                      onDone={load}
                    />
                    <InvoiceActionButtons bookingId={b.id} onDone={load} />
                  </div>
                </details>
              </li>
              );
            })
          )}
        </ul>
      </section>

      {zoomSignature && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-petflow-chocolate/60 p-6"
          onClick={() => setZoomSignature(null)}
        >
          <div
            className="max-w-md rounded-petflow bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-brown-soft">
              <Icon name="edit" size={14} />
              ลายเซ็นยืนยันตัวตนของลูกค้า
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoomSignature} alt="ลายเซ็นลูกค้าแบบเต็ม" className="w-full" />
            <button
              type="button"
              onClick={() => setZoomSignature(null)}
              className="mt-3 min-h-[44px] w-full rounded-full bg-paper text-sm font-bold text-brown"
            >
              ปิด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
