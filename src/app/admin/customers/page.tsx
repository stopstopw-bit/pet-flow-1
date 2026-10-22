"use client";

import { splitVaccinePhotos } from "@/lib/vaccine-photos";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import type { CatRecord, CustomerRecord, MemberCreditUsageRecord, MemberTopupRecord, PackageUsageRecord } from "@/lib/customers-store";
import type { CustomerTier } from "@/lib/customer-tier";
import { toJpegDataUrl } from "@/lib/image-convert";
import { CatPhoto } from "@/components/CatPhoto";
import { CatMediaGallery } from "@/components/CatMediaGallery";
import { TIER_LABELS, tierBadgeClass } from "@/lib/customer-tier";
import { RegistrationQrSection } from "@/components/LineSetupSection";
import { AddCustomerModal } from "@/components/AddCustomerModal";
import { EditCustomerSheet } from "@/components/EditCustomerSheet";
import { PetServiceHistory } from "@/components/PetServiceHistory";
import type { HistoryBill } from "@/lib/pet-service-history";
import { toast } from "@/components/Toast";
import { PreviewSendModal } from "@/components/PreviewSendModal";
import { CustomerLinkSection } from "@/components/CustomerLinkSection";
import type { PointsHistoryEntry } from "@/lib/points-store";
import { parseGroomInfo, groomInfoSummary } from "@/lib/groom-info";
import { BOOKING_STATUS_LABELS, type Booking } from "@/lib/business";
import type { CustomerServiceLog } from "@/lib/customer-service-log";
import { pastPriceList } from "@/lib/special-price";
import { PastPricesList } from "@/components/PastPrices";
import { shortItemLabel, summarizeInvoiceItems } from "@/lib/invoice-item-label";
import { bookingGroupKey, groupBookings } from "@/lib/booking-group";
import { ExportSheetsButton } from "@/components/ExportSheetsButton";
import { BookingEditModal, type EditableBooking } from "@/components/BookingEditModal";
import { RoomPlanSection } from "@/components/RoomPlanSection";
import { OTHER_BREED } from "@/lib/cat-breeds";
import { breedOptionsFor } from "@/lib/pet-kind";
import { BirthdayPicker } from "@/components/BirthdayPicker";
import { StaffNoteTagPicker } from "@/components/StaffNoteTagPicker";
import { Icon } from "@/components/Icon";
import { useConfig, usePetWords } from "@/components/ConfigProvider";
import { isFeatureOn } from "@/lib/features";
import { GroomProgramPicker, useGroomPrograms } from "@/components/GroomProgramPicker";
import { groomProgramName } from "@/lib/grooming-prices";
import { Avatar, EmptyState, MoreMenu, SearchField, Segmented, SectionLabel } from "@/components/ui";

type Summary = {
  customer: CustomerRecord;
  points: number;
  visits: number;
  lastVisitDate?: string | null;
  daysSinceVisit?: number | null;
  inactive?: boolean;
  canFollowUp?: boolean;
  serviceLog?: CustomerServiceLog;
  history: {
    bookings: Booking[];
    upcomingBookings: EditableBooking[];
    pastBookings: EditableBooking[];
    services: {
      id: string;
      service: string;
      date: string;
      amount?: number;
      catName: string;
      invoiceId?: string;
      bookingId?: string;
    }[];
    points: PointsHistoryEntry[];
    memberTopups: MemberTopupRecord[];
    memberCreditUsage: MemberCreditUsageRecord[];
    packageUsage: PackageUsageRecord[];
    serviceBills?: HistoryBill[];
  };
};

type CustomerListItem = CustomerRecord & { upcomingAppointments?: number; points?: number };
type SortKey =
  | "name"
  | "tier"
  | "points"
  | "credit"
  | "upcoming"
  | "birthday"
  | "recent"
  | "updated"
  | "cats"
  | "catName"
  | "phone"
  | "line"
  | "birthdaySoon";

const SORT_OPTIONS: { key: SortKey; label: string; defaultDir: "asc" | "desc" }[] = [
  { key: "recent", label: "สมัครล่าสุด", defaultDir: "desc" },
  { key: "updated", label: "เคลื่อนไหวล่าสุด (แก้ไข/มาใช้บริการ)", defaultDir: "desc" },
  { key: "name", label: "ชื่อลูกค้า ก–ฮ", defaultDir: "asc" },
  { key: "catName", label: "ชื่อแมว ก–ฮ", defaultDir: "asc" },
  { key: "cats", label: "จำนวนแมว", defaultDir: "desc" },
  { key: "upcoming", label: "จำนวนนัดที่จะมาถึง", defaultDir: "desc" },
  { key: "points", label: "แต้มสะสม", defaultDir: "desc" },
  { key: "credit", label: "เครดิต Member", defaultDir: "desc" },
  { key: "tier", label: "กลุ่มลูกค้า", defaultDir: "asc" },
  { key: "birthdaySoon", label: "วันเกิดใกล้ถึง (เจ้าของ/แมว)", defaultDir: "asc" },
  { key: "birthday", label: "ปีเกิดเจ้าของ", defaultDir: "asc" },
  { key: "line", label: "ผูก LINE แล้ว/ยังไม่ผูก", defaultDir: "desc" },
  { key: "phone", label: "เบอร์โทร", defaultDir: "asc" },
];

/** กี่วันนับจากวันนี้ถึงวันเกิดครั้งถัดไป (ดูแค่เดือน-วัน) — ไม่มีวันเกิดคืน 9999 */
function daysToNextBirthday(birthday?: string): number {
  const m = (birthday || "").match(/^\d{4}-(\d{2})-(\d{2})/);
  if (!m) return 9999;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), Number(m[1]) - 1, Number(m[2]));
  if (next < today) next = new Date(now.getFullYear() + 1, Number(m[1]) - 1, Number(m[2]));
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

function bookingWhen(b: EditableBooking) {
  if (b.service === "room" || b.checkin) {
    return `${b.checkin || b.date}${b.checkout ? ` → ${b.checkout}` : ""}`;
  }
  return `${b.date}${b.time ? ` ${b.time}` : ""}`;
}

function statusLabel(status: Booking["status"]) {
  return BOOKING_STATUS_LABELS[status] || "รอยืนยัน";
}

/** หัวการ์ดส่วนต่างๆ ในหน้าลูกค้า: ไอคอนในกรอบมน · ชื่อ · ค่าด้านขวา (ถ้ามี) */
function CardHeader({
  icon,
  title,
  sub,
  right,
}: {
  icon: string;
  title: string;
  sub?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-extrabold text-petflow-chocolate">{title}</h2>
        {sub ? <div className="truncate text-[11px] text-brown-soft">{sub}</div> : null}
      </div>
      {right}
    </div>
  );
}

/** ช่องติ๊กแบบแถวใหญ่ (กดได้ทั้งแถว) — ใช้กับ "ยอดยกมา" / "แจ้งลูกค้าทาง LINE" */
function CheckRow({
  checked,
  onChange,
  icon,
  title,
  sub,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: string;
  title: string;
  sub: React.ReactNode;
}) {
  return (
    <label
      className={`flex min-h-[48px] cursor-pointer items-start gap-3 rounded-petflow-sm border px-3 py-2.5 text-[11px] font-bold transition ${
        checked ? "border-latte-deep/50 bg-latte/15 text-petflow-chocolate" : "border-petflow-line bg-paper/60 text-brown-soft"
      }`}
    >
      <Icon name={icon} size={18} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        {title}
        <span className="block font-normal text-brown-faint">{sub}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-latte-deep"
      />
    </label>
  );
}

/**
 * การ์ดฟอร์มแบบพับได้ (ปิดไว้ก่อน) — ฟอร์มที่ไม่ได้ใช้ทุกวันจะไม่รกหน้า
 * แตะหัวการ์ดเพื่อเปิด/ปิด
 */
function CollapsibleCard({
  icon,
  title,
  sub,
  children,
}: {
  icon: string;
  title: string;
  sub?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mb-3 rounded-petflow bg-card shadow-petflow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[64px] w-full items-center gap-3 p-4 text-left"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
          <Icon name={icon} size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-extrabold text-petflow-chocolate">{title}</span>
          {sub ? <span className="block truncate text-[11px] text-brown-soft">{sub}</span> : null}
        </span>
        <Icon
          name="chevron"
          size={18}
          className={`shrink-0 text-brown-soft transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && <div className="border-t border-petflow-line p-4 pt-3">{children}</div>}
    </section>
  );
}

const inputCls =
  "w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm outline-none transition focus:border-latte-deep focus:bg-card";

/**
 * หน้าลูกค้าเป็นของบ้านเดียวอยู่แล้ว — จัดกลุ่มแค่ "บริการ + วันเวลาเดียวกัน" ไม่ดูชื่อ/รหัสลูกค้าบนนัด
 * (นัดที่ลูกค้าจองเองกับนัดที่ร้านลงให้ บางทีมีรหัสลูกค้าไม่ตรงกัน แล้วจะแตกเป็นคนละนัด)
 */
function groupHousehold(list: EditableBooking[]): EditableBooking[][] {
  return groupBookings(list.map((b) => ({ ...b, customerId: "", customerName: "" }))).map((g) =>
    g.map((x) => list.find((b) => b.id === x.id)!)
  );
}

function CustomerAppointmentsSection({
  bookings,
  catNames,
  onRefresh,
}: {
  bookings: EditableBooking[];
  /** แมวที่ลูกค้าบันทึกไว้ — ให้เลือกแทนชื่อชั่วคราว "น้องไม่ระบุชื่อ" ได้เลย */
  catNames: string[];
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState<EditableBooking | null>(null);
  const [rooms, setRooms] = useState<{ id: string; name: string; size: string; price: number }[]>([]);
  const [groomSlots, setGroomSlots] = useState<string[]>(["09:30", "12:30", "15:30"]);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        if (d.config?.rooms) setRooms(d.config.rooms);
        if (d.config?.groomSlots) setGroomSlots(d.config.groomSlots);
      });
  }, []);

  // บ้านเดียวกัน นัดเดียวกัน = 1 นัด (ใส่ชื่อน้องทุกตัว) ไม่แตกเป็นรายตัว
  const groups = groupHousehold(bookings);

  const cancelGroup = async (group: EditableBooking[]) => {
    const names = group.map((b) => b.catName).join(", ");
    if (!confirm(`ยกเลิกนัด ${names} · ${group[0].date}?`)) return;
    const results = await Promise.all(
      group.map((b) =>
        fetch("/api/bookings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: b.id, action: "cancel" }),
        })
      )
    );
    if (results.every((r) => r.ok)) {
      alert("ยกเลิกนัดแล้ว");
    } else {
      alert("ยกเลิกไม่สำเร็จบางตัว — ลองใหม่อีกครั้ง");
    }
    onRefresh();
  };

  return (
    <section className="mb-4 rounded-petflow bg-card p-4 shadow-petflow-sm">
      {editing && (
        <BookingEditModal
          booking={editing}
          rooms={rooms}
          groomSlots={groomSlots}
          customerCats={catNames}
          takenCatNames={bookings
            .filter((x) => x.id !== editing.id && bookingGroupKey(x) === bookingGroupKey(editing))
            .map((x) => x.catName)}
          onClose={() => setEditing(null)}
          onSaved={onRefresh}
        />
      )}
      <CardHeader
        icon="calendar"
        title="นัดหมาย"
        sub={groups.length ? `${groups.length} นัดที่กำลังจะมาถึง · แตะเพื่อแก้ไข` : undefined}
      />
      {bookings.length === 0 ? (
        <EmptyState icon="calendar" title="ยังไม่มีนัดที่กำลังจะมาถึง" />
      ) : (
        <ul className="divide-y divide-petflow-line rounded-petflow-sm border border-petflow-line bg-card">
          {groups.map((group) => {
            const b = group[0];
            const many = group.length > 1;
            return (
            <li key={group.map((g) => g.id).join(",")} className="flex items-center gap-1 pr-2">
              <button
                type="button"
                onClick={() => setEditing(b)}
                className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left active:bg-paper"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
                  <Icon name={b.service === "room" ? "bed" : "bath"} size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-extrabold text-petflow-chocolate">
                      {b.service === "room" ? "ห้องพัก" : "อาบน้ำ"}
                    </span>
                    {many && (
                      <span className="shrink-0 rounded-full bg-latte/25 px-1.5 py-px text-[10px] font-extrabold text-latte-deep">
                        {group.length} ตัว
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[11px] font-bold text-brown">
                    {group.map((g) => g.catName).join(", ")}
                  </span>
                  <span className="block truncate text-[11px] text-brown-soft">{bookingWhen(b)}</span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    b.status === "confirmed" ? "bg-sage/20 text-ok" : "bg-honey/25 text-wait"
                  }`}
                >
                  {statusLabel(b.status)}
                </span>
              </button>
              <MoreMenu
                items={[
                  { label: many ? "แก้ไขนัดทั้งบ้าน" : "แก้ไขนัด", icon: "edit", onClick: () => setEditing(b) },
                  // แก้เฉพาะบางตัว (เช่น ตัวเดียวเปลี่ยนห้อง/โปรแกรม) ซ่อนไว้ในเมนู
                  ...(many
                    ? group.slice(1).map((g) => ({
                        label: `แก้เฉพาะ ${g.catName}`,
                        icon: "edit",
                        onClick: () => setEditing(g),
                      }))
                    : []),
                  {
                    label: many ? "ยกเลิกนัดทั้งบ้าน" : "ยกเลิกนัด",
                    icon: "x",
                    danger: true,
                    onClick: () => cancelGroup(group),
                  },
                  // น้องบางตัวไม่มา (เช่น ป่วย) — ยกเลิกเฉพาะตัวนั้น ตัวอื่นในบ้านยังนัดอยู่
                  ...(many
                    ? group.map((g) => ({
                        label: `ยกเลิกเฉพาะ ${g.catName}`,
                        icon: "x",
                        danger: true,
                        onClick: () => cancelGroup([g]),
                      }))
                    : []),
                ]}
              />
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const MEMBER_PROMOS = [
  { label: "10,000 → 12,000", paid: 10000, bonus: 2000 },
  { label: "5,000 → 5,500", paid: 5000, bonus: 500 },
  { label: "3,000 → 3,200", paid: 3000, bonus: 200 },
] as const;

function MemberTopupSection({
  customerId,
  memberCredit,
  onDone,
}: {
  customerId: string;
  memberCredit: number;
  onDone: () => void;
}) {
  const [paid, setPaid] = useState("");
  const [bonus, setBonus] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  // ยอดยกมาจากระบบเก่า — เติมเครดิตให้ลูกค้าจริง แต่ไม่ใช่เงินที่รับเข้าร้านเดือนนี้
  const [isLegacy, setIsLegacy] = useState(false);
  /** ค่าเริ่มต้น = ไม่แจ้ง — ยกยอดเก่าเข้าระบบทีละหลายคนไม่ควรไปกวนลูกค้า */
  const [notify, setNotify] = useState(false);

  const paidNum = Math.max(0, Number(paid) || 0);
  const bonusNum = Math.max(0, Number(bonus) || 0);
  const total = paidNum + bonusNum;

  const applyPromo = (p: number, b: number) => {
    setPaid(String(p));
    setBonus(String(b));
    setMsg("");
  };

  const submit = async () => {
    if (total <= 0) {
      setMsg("กรอกยอดรับเงินหรือแถมอย่างน้อย 1 บาท");
      return;
    }
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: customerId,
        action: "topup_member",
        paidAmount: paidNum,
        bonusAmount: bonusNum,
        note: note.trim() || undefined,
        isLegacy,
        notify,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setPaid("");
      setBonus("");
      setNote("");
      setIsLegacy(false);
      setNotify(false);
      setMsg(
        `✅ เติมสำเร็จ +${total.toLocaleString()} บาท (คงเหลือ ${data.customer.memberCredit.toLocaleString()} บาท)` +
          (isLegacy ? " · ยอดยกมา ไม่นับรายรับเดือนนี้" : "") +
          // เงินลงเรียบร้อยเสมอ — ถ้าส่ง LINE ไม่ได้ต้องบอกตรงๆ ไม่ใช่บอกว่าแจ้งแล้ว
          (notify
            ? data.notifyError
              ? ` · ⚠️ ส่ง LINE ไม่ได้: ${data.notifyError}`
              : " · แจ้งลูกค้าแล้ว 💬"
            : "")
      );
      onDone();
    } else {
      setMsg("❌ บันทึกไม่สำเร็จ");
    }
  };

  return (
    <CollapsibleCard
      icon="wallet"
      title="เติมเครดิต Member"
      sub={
        <>
          คงเหลือ <span className="font-bold text-latte-deep">{memberCredit.toLocaleString()} บาท</span>
        </>
      }
    >

      <SectionLabel>Quick promo · โปรด่วน</SectionLabel>
      <div className="mb-3 flex flex-wrap gap-2">
        {MEMBER_PROMOS.map((p) => {
          const on = paidNum === p.paid && bonusNum === p.bonus;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPromo(p.paid, p.bonus)}
              className={`min-h-[40px] rounded-full border px-3.5 py-2 text-xs font-bold transition ${
                on
                  ? "border-petflow-chocolate bg-petflow-chocolate text-card"
                  : "border-petflow-line bg-card text-petflow-chocolate"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <label className="block text-[11px] font-bold text-brown-soft">
          รับเงินจริง (บาท)
          <input
            type="number"
            min={0}
            value={paid}
            onChange={(e) => setPaid(e.target.value)}
            placeholder="10000"
            className={`mt-1 font-bold text-petflow-chocolate ${inputCls}`}
          />
        </label>
        <label className="block text-[11px] font-bold text-brown-soft">
          แถมเครดิต (บาท)
          <input
            type="number"
            min={0}
            value={bonus}
            onChange={(e) => setBonus(e.target.value)}
            placeholder="2000"
            className={`mt-1 font-bold text-latte-deep ${inputCls}`}
          />
        </label>
      </div>

      {total > 0 && (
        <p className="mb-3 rounded-petflow-sm bg-honey/20 px-3 py-2 text-center text-xs font-bold text-petflow-chocolate">
          ลูกค้าได้เครดิตรวม <span className="text-base">{total.toLocaleString()}</span> บาท
          {bonusNum > 0 && (
            <span className="block text-[10px] font-normal text-brown-soft">
              (จ่าย {paidNum.toLocaleString()} + แถม {bonusNum.toLocaleString()})
            </span>
          )}
        </p>
      )}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="โน้ต (ถ้ามี) เช่น โปรปีใหม่"
        className={`mb-3 ${inputCls}`}
      />

      <div className="mb-3 space-y-2">
        <CheckRow
          checked={isLegacy}
          onChange={setIsLegacy}
          icon="clock"
          title="ยอดยกมาจากระบบเก่า"
          sub={
            <>
              เติมเครดิตให้ลูกค้าตามปกติ แต่จะ<b>ไม่นับเป็นรายรับ</b>ของร้านเดือนนี้
            </>
          }
        />
        <CheckRow
          checked={notify}
          onChange={setNotify}
          icon="message"
          title="แจ้งลูกค้าทาง LINE ด้วย"
          sub="ส่งการ์ดยอดคงเหลือให้ลูกค้า (เสียโควตา 1 ข้อความ) · ไม่ติ๊ก = เติมเงียบๆ"
        />
      </div>

      <button
        type="button"
        disabled={saving || total <= 0}
        onClick={submit}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-petflow-sm bg-petflow-chocolate px-3 py-3 text-sm font-extrabold text-card shadow-petflow-sm disabled:opacity-40"
      >
        {!saving && <Icon name="plus" size={18} />}
        {saving
          ? "กำลังบันทึก…"
          : isLegacy
            ? `บันทึกยอดยกมา +${total > 0 ? total.toLocaleString() : "—"} บาท (ไม่นับรายรับ)`
            : `บันทึกเติม Member +${total > 0 ? total.toLocaleString() : "—"} บาท`}
      </button>

      {msg && (
        <p className="mt-2 rounded-petflow-sm bg-paper px-3 py-2 text-center text-[11px] font-bold text-brown">{msg}</p>
      )}
    </CollapsibleCard>
  );
}

function formatThaiDateTimeShort(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    calendar: "gregory",
  });
  const time = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time} น.`;
}

/**
 * การเข้าพัก + เงื่อนไข — หลักฐานที่ลูกค้าเซ็นยอมรับก่อนฝากแมว (วันเข้า-ออก, ลายเซ็น, โน้ตดูแลเพิ่มเติม)
 *
 * เมื่อก่อนข้อมูลนี้บันทึกไว้จริง (booking.consentAcceptedAt/careNote/consentSignature)
 * แต่ไม่เคยโผล่ที่ไหนในหลังบ้านเลย — ต้องไปหาทีละนัดในปฏิทินเอง ตอนนี้รวมมาไว้ที่นี่
 * ที่เดียว จะได้ใช้เป็นหลักฐานได้ทันทีถ้ามีปัญหา ไม่ต้องไล่หา
 */
function StaysConsentSection({ bookings }: { bookings: EditableBooking[] }) {
  // ชื่อห้องจริงแทน id (catflix → Catflix & Chill)
  const [roomNames, setRoomNames] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) =>
        setRoomNames(
          Object.fromEntries(((d.config?.rooms || []) as { id: string; name: string }[]).map((r) => [r.id, r.name]))
        )
      )
      .catch(() => {});
  }, []);

  // บ้านเดียวกัน ช่วงวันเดียวกัน = การเข้าพักครั้งเดียว (ระบบเก็บแถวละตัว) → รวมเป็นรายการเดียว
  const stays = groupBookings(
    bookings
      .filter((b) => b.service === "room" && b.status !== "cancelled")
      .map((b) => ({ ...b, customerName: b.customerName || "" }))
  )
    .map((group) => {
      const signed = group.find((x) => x.consentAcceptedAt);
      const rooms = new Map<string, number>();
      for (const x of group) if (x.room) rooms.set(x.room, (rooms.get(x.room) || 0) + 1);
      const roomUnits = new Set(group.map((x) => `${x.room}#${x.roomUnit ?? ""}`));
      return {
        ...(signed || group[0]),
        id: group[0].id,
        cats: group.map((x) => x.catName).filter(Boolean).join(", "),
        roomText: Array.from(rooms.keys())
          .map((r) => roomNames[r] || r)
          .join(" + "),
        roomCount: roomUnits.size > 1 ? roomUnits.size : 0,
        careNote: Array.from(new Set(group.map((x) => x.careNote).filter(Boolean))).join(" · "),
        consentSignature: signed?.consentSignature || group.find((x) => x.consentSignature)?.consentSignature,
        vaccinePhotoUrl: group.find((x) => x.vaccinePhotoUrl)?.vaccinePhotoUrl,
      };
    })
    .sort((a, b) => (b.checkin || b.date).localeCompare(a.checkin || a.date));

  if (stays.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="mb-4 rounded-petflow bg-card p-4 shadow-petflow-sm">
      <CardHeader icon="bed" title="การเข้าพัก + เงื่อนไข" sub={`${stays.length} ครั้ง · หลักฐานที่ลูกค้าเซ็นยอมรับ`} />
      <ul className="divide-y divide-petflow-line rounded-petflow-sm border border-petflow-line">
        {stays.map((b) => {
          const staying =
            (b.checkin || "") <= today && today < (b.checkout || b.checkin || "");
          return (
            <li key={b.id} className="px-3 py-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="font-bold text-brown">
                  {b.checkin || b.date}
                  {b.checkout ? ` → ${b.checkout}` : ""}
                  {b.roomText ? ` · ${b.roomText}` : ""}
                  {b.roomCount ? ` (${b.roomCount} ห้อง)` : ""}
                </span>
                {staying && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-ok/20 px-2 py-0.5 text-[10px] font-extrabold text-ok">
                    <Icon name="bed" size={12} />
                    กำลังเข้าพักอยู่
                  </span>
                )}
              </div>
              {b.cats && <p className="mt-0.5 text-[11px] text-brown-soft">{b.cats}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {b.consentAcceptedAt ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-ok">
                    <Icon name="check" size={12} strokeWidth={2.4} />
                    เซ็นยอมรับแล้ว · {formatThaiDateTimeShort(b.consentAcceptedAt)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-wait">
                    <Icon name="clock" size={12} />
                    ยังไม่ได้เซ็นยอมรับ
                  </span>
                )}
                {b.consentSignature && (
                  <a
                    href={b.consentSignature}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold bg-latte/30 text-petflow-chocolate"
                  >
                    <Icon name="edit" size={12} />
                    ดูลายเซ็น
                  </a>
                )}
                {splitVaccinePhotos(b.vaccinePhotoUrl).map((url, vi, all) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold bg-latte/30 text-petflow-chocolate"
                  >
                    <Icon name="doc" size={12} />
                    {all.length > 1 ? `สมุดวัคซีน ${vi + 1}` : "ดูสมุดวัคซีน"}
                  </a>
                ))}
                {b.consentAcceptedAt && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                      b.fleaTickTreated
                        ? "bg-ok/20 text-ok"
                        : "bg-wait/20 text-wait"
                    }`}
                  >
                    <Icon name={b.fleaTickTreated ? "check" : "alert"} size={12} />
                    {b.fleaTickTreated ? "ยืนยันหยดยาแล้ว" : "ไม่ได้ติ๊กว่าหยดยา"}
                  </span>
                )}
              </div>
              {b.careNote && (
                <p className="mt-2 flex gap-1.5 rounded-petflow-sm border border-honey/40 bg-honey/10 px-2.5 py-2 text-[11px] text-brown">
                  <Icon name="doc" size={14} className="mt-px text-brown-soft" />
                  <span className="min-w-0 flex-1">{b.careNote}</span>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type ServiceKind = "groom" | "room" | "product" | "other";

const SERVICE_KIND_LABELS: Record<Exclude<ServiceKind, "other">, string> = {
  groom: "อาบน้ำ",
  room: "ห้องพัก",
  product: "สินค้า",
};

const PAY_LABELS: Record<string, string> = {
  transfer: "โอน",
  cash: "เงินสด",
  member_credit: "เครดิต Member",
  promptpay: "QR พร้อมเพย์",
};

/** ประเภทบริการของรายการในบิล — ใช้ kind ที่บันทึกไว้ก่อน บิลเก่าที่ไม่มี kind เดาจากชื่อ */
function itemServiceKind(it: { label: string; kind?: string }): ServiceKind {
  if (it.kind === "grooming") return "groom";
  if (it.kind === "room") return "room";
  if (it.kind === "product") return "product";
  if (it.kind) return "other";
  if (/อาบ|กรูม|ตัดขน|groom/i.test(it.label)) return "groom";
  if (/ห้อง|ฝากเลี้ยง|คืน/.test(it.label)) return "room";
  return "other";
}

/**
 * ประวัติใช้บริการ — รวมบิลที่ปิดแล้ว, นัดที่ผ่านมา และบิลขายหน้าร้าน (POS)
 * เป็นไทม์ไลน์เดียว เรียงใหม่ก่อน พร้อมสรุปว่าลูกค้าใช้อะไรไปกี่ครั้ง
 *
 * ลูกค้าเก่าบางรายมีเป็นร้อยแถวและส่วนใหญ่เป็นนัดที่ยกเลิก เลยพับนัดที่ยกเลิก
 * ไว้ต่างหาก และโชว์แค่ 8 แถวแรกก่อน กดดูทั้งหมดได้ · กดแถวที่มีบิลเพื่อดูรายการ
 */
function ServiceHistorySection({
  customerId,
  services,
  pastBookings,
  log,
  onChanged,
}: {
  customerId: string;
  services: Summary["history"]["services"];
  pastBookings: EditableBooking[];
  log?: CustomerServiceLog;
  onChanged: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [filter, setFilter] = useState<"all" | Exclude<ServiceKind, "other">>("all");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const remove = async (label: string, req: () => Promise<unknown>) => {
    if (!confirm(label)) return;
    await req();
    onChanged();
  };

  type Row = {
    key: string;
    date: string;
    text: string;
    sub?: string;
    amount?: number;
    kinds: ServiceKind[];
    detail?: { label: string; amount: number }[];
    detailNote?: string;
    onDelete?: () => void;
  };

  const billById = new Map((log?.bills || []).map((b) => [b.id, b]));
  const groomers = log?.groomers || {};

  const serviceRows: Row[] = services.map((s) => {
    const bill = s.invoiceId ? billById.get(s.invoiceId) : undefined;
    const kinds = bill
      ? Array.from(new Set(bill.items.map(itemServiceKind)))
      : s.service.split(", ").map((label) => itemServiceKind({ label }));
    const groomer = s.bookingId ? groomers[s.bookingId] : undefined;
    return {
      key: `s${s.id}`,
      date: s.date,
      text: `${s.catName} · ${bill ? summarizeInvoiceItems(bill.items) : s.service}`,
      sub: groomer ? `ช่าง ${groomer}` : undefined,
      amount: s.amount,
      kinds,
      detail: bill?.items.map((it) => ({ label: it.label, amount: it.amount })),
      detailNote: bill
        ? `บิล ${bill.id}${bill.paymentMethod ? ` · จ่ายด้วย${PAY_LABELS[bill.paymentMethod] || bill.paymentMethod}` : ""}`
        : undefined,
      onDelete: () =>
        remove("ลบรายการนี้ออกจากประวัติ? กู้คืนไม่ได้", () =>
          fetch("/api/customers", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: customerId,
              action: "delete_service_record",
              serviceId: s.id,
            }),
          })
        ),
    };
  });

  const posRows: Row[] = (log?.posSales || []).map((p) => ({
    key: `p${p.id}`,
    date: p.date,
    text: `ซื้อหน้าร้าน · ${summarizeInvoiceItems(p.items.map((it) => ({ label: it.name })))}`,
    amount: p.total,
    kinds: ["product"],
    detail: p.items.map((it) => ({
      label: `${it.name}${it.qty > 1 ? ` × ${it.qty}` : ""}`,
      amount: it.price * it.qty,
    })),
    detailNote: `${p.no} · จ่ายด้วย${PAY_LABELS[p.method] || p.method} · ยกเลิกบิลได้ที่หน้า POS`,
  }));

  // นัดบ้านเดียวกัน นัดเดียวกัน (สถานะเดียวกัน) = 1 แถว ใส่ชื่อทุกตัว
  const bookingRow = (group: EditableBooking[]): Row => {
    const b = group[0];
    const names = Array.from(new Set(group.map((g) => groomers[g.id]).filter(Boolean)));
    return {
      key: `b${group.map((g) => g.id).join(",")}`,
      date: b.date,
      text: `${group.map((g) => g.catName).join(", ")} · ${
        b.service === "room" ? "ห้องพัก" : "อาบน้ำ"
      } · ${statusLabel(b.status)}`,
      sub: names.length ? `ช่าง ${names.join(", ")}` : undefined,
      kinds: [b.service === "room" ? "room" : "groom"],
      onDelete: () =>
        remove(
          group.length > 1
            ? `ลบนัดนี้ทั้งบ้าน (${group.length} ตัว) ทิ้งถาวร? กู้คืนไม่ได้`
            : "ลบนัดนี้ทิ้งถาวร? กู้คืนไม่ได้",
          () =>
            Promise.all(
              group.map((g) =>
                fetch("/api/bookings", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: g.id, action: "delete" }),
                })
              )
            )
        ),
    };
  };
  const groupRows = (list: EditableBooking[]) => {
    const byStatus = new Map<string, EditableBooking[]>();
    for (const b of list) byStatus.set(b.status, [...(byStatus.get(b.status) || []), b]);
    return Array.from(byStatus.values()).flatMap((l) => groupHousehold(l)).map(bookingRow);
  };

  const byDateDesc = (a: Row, b: Row) => b.date.localeCompare(a.date);
  const cancelledRows = groupRows(pastBookings.filter((b) => b.status === "cancelled")).sort(
    byDateDesc
  );
  const allRows = [
    ...serviceRows,
    ...posRows,
    ...groupRows(pastBookings.filter((b) => b.status !== "cancelled")),
  ].sort(byDateDesc);

  // สรุป: นับเป็น "วันที่มาใช้" ต่อประเภท — บิลกับนัดของวันเดียวกันจะได้ไม่นับซ้ำ
  // (นัดที่ยังไม่ปิดงาน/ไม่มา ไม่นับ)
  const daysByKind: Record<Exclude<ServiceKind, "other">, Set<string>> = {
    groom: new Set(),
    room: new Set(),
    product: new Set(),
  };
  for (const r of [...serviceRows, ...posRows]) {
    for (const k of r.kinds) if (k !== "other") daysByKind[k].add(r.date.slice(0, 10));
  }
  for (const b of pastBookings) {
    if (b.status !== "ready" && b.status !== "done") continue;
    daysByKind[b.service === "room" ? "room" : "groom"].add((b.date || b.checkin || "").slice(0, 10));
  }
  const totalSpend =
    (log?.bills || []).reduce((s, b) => s + (b.total || 0), 0) +
    (log?.posSales || []).reduce((s, p) => s + (p.total || 0), 0);

  // ใช้อะไรบ่อย — นับจากรายการในบิล + POS (ชื่อย่อ ไม่เอาชื่อน้อง/ไซส์)
  const itemCounts = new Map<string, number>();
  const bump = (name: string, n: number) => {
    if (!name) return;
    itemCounts.set(name, (itemCounts.get(name) || 0) + n);
  };
  for (const b of log?.bills || [])
    for (const it of b.items)
      if (itemServiceKind(it) !== "other" || it.kind === "service" || it.kind === "custom")
        bump(shortItemLabel(it.label), it.qty || 1);
  for (const p of log?.posSales || []) for (const it of p.items) bump(it.name, it.qty || 1);
  const topItems = Array.from(itemCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const rows = filter === "all" ? allRows : allRows.filter((r) => r.kinds.includes(filter));
  const visible = showAll ? rows : rows.slice(0, 8);

  const rowList = (list: Row[]) => (
    <ul className="divide-y divide-petflow-line rounded-petflow-sm border border-petflow-line text-xs">
      {list.map((r) => {
        const expanded = openKey === r.key;
        return (
          <li key={r.key} className="py-1.5 pl-3 pr-1.5">
            <div className="flex min-h-[44px] items-center gap-2">
              <button
                type="button"
                disabled={!r.detail?.length}
                onClick={() => setOpenKey(expanded ? null : r.key)}
                className="min-w-0 flex-1 text-left"
              >
                <span className={`block font-bold text-brown ${expanded ? "" : "truncate"}`}>
                  {r.text}
                </span>
                <span className="block text-[11px] text-brown-faint">
                  {r.date}
                  {r.sub ? ` · ${r.sub}` : ""}
                  {r.detail?.length ? (expanded ? " · ซ่อนรายการ" : " · ดูรายการ") : ""}
                </span>
              </button>
              {r.amount ? (
                <span className="shrink-0 font-extrabold text-brown">
                  ฿{r.amount.toLocaleString()}
                </span>
              ) : null}
              {r.onDelete ? (
                <MoreMenu
                  items={[{ label: "ลบรายการนี้", icon: "trash", danger: true, onClick: r.onDelete }]}
                />
              ) : (
                <span className="w-2 shrink-0" />
              )}
            </div>
            {expanded && r.detail && (
              <div className="mb-1 mr-2 mt-1 rounded-petflow-sm bg-paper px-3 py-2 text-[11px] text-brown-soft">
                <ul className="space-y-0.5">
                  {r.detail.map((d, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="min-w-0 flex-1">{d.label}</span>
                      <span className="shrink-0 font-bold">฿{d.amount.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
                {r.detailNote && <p className="mt-1 text-brown-faint">{r.detailNote}</p>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <section className="mb-4 rounded-petflow bg-card p-4 shadow-petflow-sm">
      <CardHeader
        icon="receipt"
        title="ประวัติใช้บริการ"
        right={
          allRows.length > 0 ? (
            <span className="shrink-0 text-[11px] font-bold text-brown-faint">{allRows.length} รายการ</span>
          ) : undefined
        }
      />

      {allRows.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(SERVICE_KIND_LABELS) as Exclude<ServiceKind, "other">[]).map((k) => (
            <div key={k} className="rounded-petflow-sm bg-paper px-3 py-2">
              <div className="text-[11px] font-bold text-brown-faint">{SERVICE_KIND_LABELS[k]}</div>
              <div className="text-base font-extrabold text-brown">
                {daysByKind[k].size} <span className="text-[11px] font-bold">ครั้ง</span>
              </div>
            </div>
          ))}
          <div className="rounded-petflow-sm bg-paper px-3 py-2">
            <div className="text-[11px] font-bold text-brown-faint">ยอดใช้จ่ายรวม</div>
            <div className="text-base font-extrabold text-latte-deep">฿{totalSpend.toLocaleString()}</div>
          </div>
        </div>
      )}

      {topItems.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-[11px] font-bold text-brown-faint">ใช้บ่อย</div>
          <div className="flex flex-wrap gap-1.5">
            {topItems.map(([name, n]) => (
              <span
                key={name}
                className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-bold text-brown-soft"
              >
                {name} × {n}
              </span>
            ))}
          </div>
        </div>
      )}

      {allRows.length > 0 && (
        <Segmented
          className="mb-3"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setShowAll(false);
          }}
          options={[
            { id: "all", label: "ทั้งหมด" },
            { id: "groom", label: "อาบน้ำ" },
            { id: "room", label: "ห้องพัก" },
            { id: "product", label: "สินค้า" },
          ]}
        />
      )}

      {rows.length === 0 ? (
        <EmptyState icon="receipt" title="ยังไม่มีประวัติ" />
      ) : (
        <>
          {rowList(visible)}
          {rows.length > visible.length && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-2 min-h-[40px] w-full rounded-petflow-sm bg-paper py-2 text-xs font-extrabold text-latte-deep"
            >
              ดูทั้งหมดอีก {rows.length - visible.length} รายการ
            </button>
          )}
        </>
      )}

      {cancelledRows.length > 0 && (
        <div className="mt-3 border-t border-petflow-line pt-2">
          <button
            type="button"
            onClick={() => setShowCancelled((v) => !v)}
            className="flex min-h-[40px] w-full items-center gap-1.5 text-left text-xs font-bold text-brown-faint"
          >
            <Icon
              name="chevron"
              size={14}
              className={`transition ${showCancelled ? "rotate-90" : ""}`}
            />
            นัดที่ยกเลิก ({cancelledRows.length})
          </button>
          {showCancelled && <div className="mt-2">{rowList(cancelledRows)}</div>}
        </div>
      )}

      <p className="mt-2 text-[10px] text-brown-faint">
        ลงข้อมูลผิด? กด ⋯ ที่รายการเพื่อลบ — จะหายจากประวัติที่ลูกค้าเห็นในแอปด้วย
      </p>
    </section>
  );
}

/**
 * ราคาที่ลูกค้าคนนี้เคยจ่าย — อ่านจากบิลที่จ่ายแล้ว ไม่ต้องกรอกเพิ่ม
 * ลูกค้าที่ได้ราคาพิเศษ พนักงานคนไหนเปิดดูก็รู้ราคาเดิม (หน้าคิดเงินจะถามให้ใช้ราคาเดิมเองด้วย)
 */
function PastPricesSection({ log }: { log?: CustomerServiceLog }) {
  const [showAll, setShowAll] = useState(false);
  const prices = pastPriceList(
    (log?.bills || []).map((b) => ({ createdAt: b.date, items: b.items }))
  );
  if (prices.length === 0) return null;
  return (
    <section className="mb-4 rounded-petflow bg-card p-4 shadow-petflow-sm">
      <CardHeader
        icon="money"
        title="ราคาที่ลูกค้าคนนี้เคยจ่าย"
        sub="ราคาต่อครั้งล่าสุดของแต่ละบริการ · ตอนออกบิลระบบจะถามให้ใช้ราคาเดิม"
      />
      <PastPricesList prices={prices} limit={showAll ? undefined : 6} />
      {prices.length > 6 && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 min-h-[40px] w-full rounded-petflow-sm bg-paper py-2 text-xs font-extrabold text-latte-deep"
        >
          ดูทั้งหมดอีก {prices.length - 6} รายการ
        </button>
      )}
    </section>
  );
}

/**
 * ประวัติคอร์ส — ซื้อเมื่อไหร่ ใช้ไปครั้งไหนบ้าง
 *
 * ยกเลิกการซื้อ = คอร์สหายไปทั้งใบ · ยกเลิกการใช้ = ถอนบิลใบนั้นออกจากสถานะจ่ายแล้ว
 * แล้วครั้งที่หักไปจะเด้งกลับเข้าคอร์สให้เอง (ดู revertInvoicePaid)
 */
function PackageHistorySection({
  customerId,
  usage,
  onChanged,
}: {
  customerId: string;
  usage: PackageUsageRecord[];
  onChanged: () => void;
}) {
  const [packages, setPackages] = useState<
    {
      id: string;
      name: string;
      totalUses: number;
      usedUses: number;
      price?: number;
      status: string;
      createdAt?: string;
    }[]
  >([]);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    fetch(`/api/packages?customerId=${customerId}`)
      .then((r) => r.json())
      .then((d) => setPackages(d.packages || []))
      .catch(() => {});
  }, [customerId]);
  useEffect(() => {
    load();
  }, [load]);

  // ไม่เคยมีคอร์สเลยก็ไม่ต้องโชว์ช่องเปล่าให้รก
  if (!packages.length && !usage.length) return null;

  const cancelPurchase = async (id: string, name: string) => {
    if (!confirm(`ยกเลิกคอร์ส "${name}"? ลูกค้าจะใช้ครั้งที่เหลือไม่ได้อีก`)) return;
    setBusy(id);
    try {
      await fetch("/api/packages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "cancel" }),
      });
      load();
      onChanged();
    } finally {
      setBusy("");
    }
  };

  const cancelUse = async (invoiceId: string) => {
    if (
      !confirm(
        "ยกเลิกการใช้ครั้งนี้?\nบิลใบนี้จะกลับไปเป็น 'ยังไม่จ่าย' และครั้งที่หักไปจะคืนเข้าคอร์สให้ค่ะ"
      )
    )
      return;
    setBusy(invoiceId);
    try {
      await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: invoiceId, action: "unmark_paid" }),
      });
      load();
      onChanged();
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="mb-4 rounded-petflow bg-card p-4 shadow-petflow-sm">
      <CardHeader icon="ticket" title="ประวัติคอร์ส / แพ็กเกจ" />

      <SectionLabel>Purchases · การซื้อ</SectionLabel>
      <ul className="mb-4 divide-y divide-petflow-line rounded-petflow-sm border border-petflow-line text-xs text-brown-soft">
        {packages.map((p) => {
          const cancelled = p.status === "cancelled";
          return (
            <li
              key={p.id}
              className={`flex min-h-[52px] items-center gap-2 py-2 pl-3 pr-1.5 ${
                cancelled ? "line-through opacity-60" : ""
              }`}
            >
              <span className="min-w-0 flex-1">
                <b className="text-brown">{p.name}</b>{" "}
                <span className="text-brown-faint">
                  ({p.usedUses}/{p.totalUses} ครั้ง)
                </span>
                <span className="block text-[10px] text-brown-faint">
                  {p.createdAt ? p.createdAt.slice(0, 10) : "—"}
                  {p.price ? ` · ${p.price.toLocaleString()} บาท` : ""}
                </span>
              </span>
              {!cancelled && (
                <MoreMenu
                  items={[
                    {
                      label: "ยกเลิกคอร์สนี้",
                      icon: "x",
                      danger: true,
                      disabled: busy === p.id,
                      onClick: () => cancelPurchase(p.id, p.name),
                    },
                  ]}
                />
              )}
            </li>
          );
        })}
        {!packages.length && <li className="px-3 py-3 text-brown-faint">ยังไม่เคยซื้อคอร์ส</li>}
      </ul>

      <SectionLabel>Usage · การใช้</SectionLabel>
      <ul className="divide-y divide-petflow-line rounded-petflow-sm border border-petflow-line text-xs text-brown-soft">
        {usage.map((u) => (
          <li key={u.invoiceId} className="flex min-h-[48px] items-center gap-2 py-1.5 pl-3 pr-1.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold text-brown">{u.description}</span>
              <span className="block text-[11px] text-brown-faint">{u.date}</span>
            </span>
            <MoreMenu
              items={[
                {
                  label: "คืนครั้ง (ยกเลิกการใช้)",
                  icon: "back",
                  danger: true,
                  disabled: busy === u.invoiceId,
                  onClick: () => cancelUse(u.invoiceId),
                },
              ]}
            />
          </li>
        ))}
        {!usage.length && <li className="px-3 py-3 text-brown-faint">ยังไม่เคยหักครั้งจากคอร์ส</li>}
      </ul>
    </section>
  );
}

function MemberCreditHistorySection({
  customerId,
  memberCredit,
  topups,
  usage,
  onChanged,
}: {
  customerId: string;
  memberCredit: number;
  topups: MemberTopupRecord[];
  usage: MemberCreditUsageRecord[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState("");

  /**
   * ยกเลิกรายการเติม — ถอนเครดิตออกและลบรายรับที่ลงคู่กันไว้
   * ถ้าลูกค้าใช้เครดิตไปแล้วบางส่วน เซิร์ฟเวอร์จะบล็อกและบอกให้ไปยกเลิกบิลก่อน
   */
  const cancelTopup = async (t: MemberTopupRecord) => {
    const label = t.isLegacy ? "ยอดยกมา" : "การเติมเครดิต";
    if (
      !confirm(
        `ยกเลิก${label} +${t.creditAdded.toLocaleString()} บาท?\n` +
          `เครดิตลูกค้าจะถูกหักออก ${t.creditAdded.toLocaleString()} บาท` +
          (t.isLegacy ? "" : " และลบรายรับที่ลงไว้ด้วย") +
          "\nกู้คืนไม่ได้"
      )
    )
      return;
    setBusy(t.id);
    try {
      const res = await fetch("/api/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: customerId, action: "cancel_topup", topupId: t.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast(`ยกเลิกแล้ว — เครดิตคงเหลือ ${(data.balance ?? 0).toLocaleString()} บาท`, "success");
        onChanged();
      } else if (data.error === "credit_spent") {
        toast(
          `ยกเลิกไม่ได้ — ลูกค้าใช้เครดิตไปแล้ว (เหลือ ${(data.balance ?? 0).toLocaleString()} จากที่เติม ${(data.creditAdded ?? 0).toLocaleString()}) · ยกเลิกบิลที่ใช้เครดิตก่อน แล้วค่อยมายกเลิกรายการนี้`,
          "error"
        );
      } else {
        toast("ยกเลิกไม่สำเร็จ", "error");
      }
    } finally {
      setBusy("");
    }
  };

  const totalToppedUp = topups.reduce((s, t) => s + t.creditAdded, 0);
  const totalUsed = usage.reduce((s, u) => s + u.amount, 0);

  type LedgerRow =
    | { kind: "topup"; at: string; topup: MemberTopupRecord }
    | { kind: "usage"; at: string; usage: MemberCreditUsageRecord };

  const ledger: LedgerRow[] = [
    ...topups.map((t) => ({ kind: "topup" as const, at: t.createdAt, topup: t })),
    ...usage.map((u) => ({ kind: "usage" as const, at: u.at, usage: u })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  if (!topups.length && !usage.length && memberCredit <= 0) return null;

  return (
    <section className="mb-4 rounded-petflow bg-card p-4 shadow-petflow-sm">
      <CardHeader icon="doc" title="ประวัติเครดิต Member" />
      <p className="-mt-1 mb-3 text-[11px] text-brown-soft">
        คงเหลือ{" "}
        <span className="font-bold text-latte-deep">{memberCredit.toLocaleString()} บาท</span>
        {totalToppedUp > 0 && (
          <>
            {" · "}
            เติมรวม {totalToppedUp.toLocaleString()} บาท
          </>
        )}
        {totalUsed > 0 && (
          <>
            {" · "}
            ใช้ไป {totalUsed.toLocaleString()} บาท
          </>
        )}
      </p>

      {ledger.length === 0 ? (
        <EmptyState icon="wallet" title="ยังไม่มีประวัติเติม/ใช้เครดิต" />
      ) : (
        <ul className="divide-y divide-petflow-line rounded-petflow-sm border border-petflow-line">
          {ledger.map((row) =>
            row.kind === "topup" ? (
              <li key={row.topup.id} className="py-2.5 pl-3 pr-1.5 text-xs">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok">
                    <Icon name={row.topup.isLegacy ? "clock" : "plus"} size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`font-bold ${row.topup.isLegacy ? "text-brown" : "text-ok"}`}>
                      {row.topup.isLegacy ? "ยอดยกมาจากระบบเก่า" : "เติมเครดิต"}
                    </p>
                    <p className="text-brown-soft">
                      {row.topup.createdAt.slice(0, 10)} · รับ {row.topup.paidAmount.toLocaleString()} บาท
                      {row.topup.bonusAmount > 0 && (
                        <> · แถม {row.topup.bonusAmount.toLocaleString()} บาท</>
                      )}
                      {row.topup.isLegacy && <> · ไม่นับรายรับ</>}
                    </p>
                    {row.topup.note && (
                      <p className="text-[10px] text-brown-faint">{row.topup.note}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-extrabold text-ok">
                      +{row.topup.creditAdded.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-brown-faint">
                      คงเหลือ {row.topup.balanceAfter.toLocaleString()}
                    </p>
                  </div>
                  <MoreMenu
                    items={[
                      {
                        label: busy === row.topup.id ? "กำลังยกเลิก…" : "ยกเลิกรายการนี้",
                        icon: "trash",
                        danger: true,
                        disabled: busy === row.topup.id,
                        onClick: () => cancelTopup(row.topup),
                      },
                    ]}
                  />
                </div>
              </li>
            ) : (
              <li key={row.usage.id} className="px-3 py-2.5 text-xs">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-wait/15 text-wait">
                    <Icon name="receipt" size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-wait">ใช้เครดิต</p>
                    <p className="text-brown-soft">
                      {row.usage.date} · {row.usage.description}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-extrabold text-wait">
                      −{row.usage.amount.toLocaleString()}
                    </p>
                    {/* รายการนี้สร้างจากบิลที่จ่ายด้วยเครดิต ลบเดี่ยวๆ ไม่ได้
                        ต้องไปกด "ยกเลิกการชำระ" ที่บิล ซึ่งคืนเครดิตให้อัตโนมัติอยู่แล้ว */}
                    <p className="mt-0.5 text-[9px] text-brown-faint">
                      ยกเลิกที่บิล → คืนเครดิตอัตโนมัติ
                    </p>
                  </div>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </section>
  );
}

function CustomerSummaryCard({
  customer,
  points,
  visits,
  lastVisitDate,
  daysSinceVisit,
  inactive,
  canFollowUp,
  onSaved,
  toolsSlot,
}: {
  customer: CustomerRecord;
  points: number;
  visits: number;
  lastVisitDate?: string | null;
  daysSinceVisit?: number | null;
  inactive?: boolean;
  canFollowUp?: boolean;
  onSaved: () => void;
  /** ที่วางฟอร์มเพิ่มแต้ม/ขายคอร์สท้ายหน้า (ย้ายลงล่างให้หัวโปรไฟล์ไม่รก) */
  toolsSlot?: HTMLElement | null;
}) {
  const [tier, setTier] = useState<CustomerTier>(customer.tier || "new");
  const [msg, setMsg] = useState("");
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const { config: siteConfig } = useConfig();
  const followUpOn = isFeatureOn(siteConfig, "followUp");
  const [addAmt, setAddAmt] = useState("");
  const [addReason, setAddReason] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  /** ค่าเริ่มต้น = ไม่แจ้ง — เพิ่มแต้มหลังบ้านไม่ต้องรบกวนลูกค้า */
  const [addNotify, setAddNotify] = useState(false);

  /** การ์ดที่รอยืนยันก่อนส่งจริง — null = ยังไม่ได้กดพรีวิว */
  const [pointsPreview, setPointsPreview] = useState<Record<string, unknown>[] | null>(null);

  const pointsPayload = () => ({
    action: "admin_add",
    lineUserId: customer.lineUserId,
    amount: Math.round(Number(addAmt) || 0),
    reason: addReason.trim() || "แต้มพิเศษจากร้าน",
    displayName: customer.name,
  });

  /** ติ๊กแจ้งลูกค้า → ขอตัวอย่างการ์ดมาดูก่อน ยังไม่เติมแต้มจริง */
  const previewBonusPoints = async () => {
    const n = Math.round(Number(addAmt) || 0);
    if (!n || !customer.lineUserId) return;
    setAddBusy(true);
    try {
      const res = await fetch("/api/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pointsPayload(), preview: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.preview) setPointsPreview(data.preview);
      else toast("ดูตัวอย่างไม่สำเร็จ", "error");
    } finally {
      setAddBusy(false);
    }
  };

  const addBonusPoints = async () => {
    const n = Math.round(Number(addAmt) || 0);
    if (!n || !customer.lineUserId) return;
    const reason = addReason.trim() || "แต้มพิเศษจากร้าน";
    setAddBusy(true);
    try {
      const res = await fetch("/api/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pointsPayload(), reason, notify: addNotify }),
      });
      setPointsPreview(null);
      if (res.ok) {
        toast(
          `${n > 0 ? "เพิ่ม" : "ปรับ"} ${n} แต้มแล้ว (${reason})` +
            (n > 0 && !addNotify ? " · ไม่ได้แจ้งลูกค้า" : "")
        );
        setAddAmt("");
        setAddReason("");
        onSaved();
      } else {
        toast("เพิ่มแต้มไม่สำเร็จ", "error");
      }
    } finally {
      setAddBusy(false);
    }
  };

  // ── คอร์ส/แพ็กเกจ ──
  const [packages, setPackages] = useState<
    {
      id: string;
      name: string;
      totalUses: number;
      usedUses: number;
      status: string;
      groomProgram?: string;
      planId?: string;
      locked?: boolean;
      outstanding?: number;
    }[]
  >([]);
  /** แผนแบ่งจ่ายของคอร์ส (id แผน → งวด/ยอดค้าง) */
  const [pkgPlans, setPkgPlans] = useState<
    Record<string, { installments: number; installmentsLeft: number; nextInstallment: number; paid: number; price: number; payments: unknown[] }>
  >({});
  const [pkgInstallments, setPkgInstallments] = useState(1);
  const [pkgFirstPay, setPkgFirstPay] = useState("");
  const [pkgMethod, setPkgMethod] = useState<"transfer" | "cash">("transfer");
  const [pkgName, setPkgName] = useState("");
  /** "" = ใช้ได้ทุกโปรแกรม */
  const [pkgProgram, setPkgProgram] = useState("");
  const groomPrograms = useGroomPrograms();
  const [pkgUses, setPkgUses] = useState("");
  const [pkgPrice, setPkgPrice] = useState("");
  const [pkgBusy, setPkgBusy] = useState(false);
  /** ค่าเริ่มต้น = ไม่แจ้ง / ไม่ใช่ยอดยกมา — เหมือนฝั่งเติมเครดิต Member */
  const [pkgNotify, setPkgNotify] = useState(false);
  const [pkgLegacy, setPkgLegacy] = useState(false);
  const [pkgPreview, setPkgPreview] = useState<Record<string, unknown>[] | null>(null);

  /** ครั้งที่ยังใช้ได้รวมทุกคอร์ส (ไม่นับที่ยกเลิก/ใช้หมดแล้ว) */
  const packageUsesLeft = packages
    .filter((p) => p.status === "active")
    .reduce((n, p) => n + Math.max(0, p.totalUses - p.usedUses), 0);

  const loadPackages = useCallback(() => {
    fetch(`/api/packages?customerId=${customer.id}`)
      .then((r) => r.json())
      .then((d) => setPackages(d.packages || []))
      .catch(() => {});
    fetch(`/api/room-plans?customerId=${customer.id}`)
      .then((r) => r.json())
      .then((d) => {
        const map: typeof pkgPlans = {};
        for (const p of d.plans || []) if (p.kind === "package") map[p.id] = p;
        setPkgPlans(map);
      })
      .catch(() => {});
  }, [customer.id]);
  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  const packagePayload = () => {
    const uses = Math.round(Number(pkgUses) || 0);
    const price = Math.round(Number(pkgPrice) || 0);
    return {
      customerId: customer.id,
      name: pkgName.trim(),
      totalUses: uses,
      price,
      isLegacy: pkgLegacy,
      notify: pkgNotify,
      groomProgram: pkgProgram || undefined,
      installments: pkgLegacy ? 1 : pkgInstallments,
      firstPayment: !pkgLegacy && pkgInstallments > 1 ? Math.round(Number(pkgFirstPay) || 0) : undefined,
      paymentMethod: pkgMethod,
    };
  };

  const sellPackage = async () => {
    const uses = Math.round(Number(pkgUses) || 0);
    if (!pkgName.trim() || uses <= 0) return;
    setPkgBusy(true);
    try {
      const res = await fetch("/api/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(packagePayload()),
      });
      const pkgData = await res.json().catch(() => ({}));
      setPkgPreview(null);
      if (!res.ok && pkgData.error) {
        toast(pkgData.error, "error");
        loadPackages();
      }
      if (res.ok) {
        toast(
          `${pkgLegacy ? "ยกคอร์ส" : "ขายคอร์ส"} "${pkgName.trim()}" แล้ว` +
            (pkgLegacy ? " · ไม่นับรายรับเดือนนี้" : "") +
            (pkgData.plan
              ? pkgData.plan.remaining > 0
                ? ` · ค้าง ${Math.round(pkgData.plan.remaining).toLocaleString()} บาท (ใช้ได้เมื่อจ่ายครบ)`
                : " · จ่ายครบแล้ว"
              : "") +
            (pkgNotify
              ? pkgData.notifyError
                ? ` · ⚠️ ส่ง LINE ไม่ได้: ${pkgData.notifyError}`
                : " · แจ้งลูกค้าแล้ว 💬"
              : "")
        );
        setPkgName("");
        setPkgProgram("");
        setPkgUses("");
        setPkgPrice("");
        setPkgLegacy(false);
        setPkgNotify(false);
        setPkgInstallments(1);
        setPkgFirstPay("");
        loadPackages();
      }
    } finally {
      setPkgBusy(false);
    }
  };

  const previewPackage = async () => {
    const uses = Math.round(Number(pkgUses) || 0);
    if (!pkgName.trim() || uses <= 0) return;
    setPkgBusy(true);
    try {
      const res = await fetch("/api/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...packagePayload(), preview: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.preview)) {
        setPkgPreview(data.preview);
      } else {
        toast("ดูตัวอย่างการ์ดไม่สำเร็จ", "error");
      }
    } finally {
      setPkgBusy(false);
    }
  };

  const cancelPackage = async (id: string) => {
    const pk = packages.find((p) => p.id === id);
    const plan = pk?.planId ? pkgPlans[pk.planId] : undefined;
    if (
      !confirm(
        plan
          ? "ยกเลิกคอร์สนี้? ยอดค้างจะไม่ต้องจ่ายต่อ (เงินงวดที่รับแล้วไม่ถูกลบ ต้องคืนลูกค้าเองถ้าจะคืน)"
          : "ยกเลิกคอร์สนี้?"
      )
    )
      return;
    if (pk?.planId && plan) {
      await fetch("/api/room-plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", planId: pk.planId }),
      });
    } else {
      await fetch("/api/packages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", packageId: id }),
      });
    }
    loadPackages();
  };

  /** รับเงินงวดของคอร์สแบ่งจ่าย */
  const payInstallment = async (planId: string, name: string) => {
    const plan = pkgPlans[planId];
    if (!plan) return;
    const remaining = plan.price - plan.paid;
    const raw = prompt(
      `รับเงินงวด — ${name}\nค้าง ${Math.round(remaining).toLocaleString()} บาท · เหลือ ${plan.installmentsLeft} งวด\n\nรับรอบนี้กี่บาท?`,
      String(plan.nextInstallment || "")
    );
    if (raw == null) return;
    const amount = Math.round(Number(raw.replace(/[,\s฿]/g, "")) || 0);
    if (amount <= 0) return;
    const method = confirm("รับเป็นเงินสดใช่ไหม?\n(ตกลง = เงินสด · ยกเลิก = โอน)") ? "cash" : "transfer";
    const res = await fetch("/api/room-plans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pay", planId, amount, paymentMethod: method, notify: customer.lineUserId ? undefined : false }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.ok) {
      toast(
        d.plan.remaining > 0
          ? `รับแล้ว ${amount.toLocaleString()} บาท · ค้างอีก ${Math.round(d.plan.remaining).toLocaleString()} บาท`
          : `รับครบแล้ว — คอร์สใช้ได้แล้ว`
      );
      loadPackages();
    } else if (d.error === "over_due") {
      toast(`เกินยอดค้าง — ค้างอยู่ ${Math.round(d.due).toLocaleString()} บาท`, "error");
    } else {
      toast("รับเงินไม่สำเร็จ", "error");
    }
  };

  const heroCat = customer.cats.find((cat) => cat.photoDataUrl) || customer.cats[0];

  useEffect(() => {
    setTier(customer.tier || "new");
  }, [customer.id, customer.tier]);

  const removeCustomer = async () => {
    if (
      !confirm(
        `ลบลูกค้า "${customer.name}" และประวัติทั้งหมด (แมว/นัด/แต้ม)?\nลบแล้วกู้คืนไม่ได้`
      )
    )
      return;
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: customer.id, action: "delete_customer" }),
    });
    if (res.ok) onSaved();
    else setMsg("ลบไม่สำเร็จ");
  };

  const [mergeOpen, setMergeOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const unlinkLine = async () => {
    if (
      !confirm(
        `ปลดผูก LINE ของ "${customer.name}"?\n\n` +
          `หลังปลด: ส่งลิงก์เชิญให้ลูกค้ากดผูกใหม่ได้เลย (ไม่ติด "ผูกไปแล้ว")\n` +
          `แต้ม · คูปอง · บิล · แมว ยังอยู่ครบ ไม่หายไปไหน\n\n` +
          `⚠️ ระหว่างที่ยังไม่ผูกใหม่ ลูกค้าจะไม่ได้รับข้อความจากร้าน`
      )
    )
      return;
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: customer.id, action: "unlink_line" }),
    });
    if (res.ok) {
      toast("ปลดผูก LINE แล้ว — ส่งลิงก์เชิญให้ลูกค้าผูกใหม่ได้เลย 🔓", "success");
      onSaved();
    } else {
      toast("ปลดผูกไม่สำเร็จ", "error");
    }
  };

  const setTierManual = async (t: CustomerTier) => {
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: customer.id,
        action: "set_tier",
        tier: t,
      }),
    });
    if (res.ok) {
      setTier(t);
      setMsg("✅ อัปเดตระดับแล้ว");
      onSaved();
      setTimeout(() => setMsg(""), 2000);
    }
  };

  const recalcTier = async () => {
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: customer.id,
        action: "recalculate_tier",
      }),
    });
    const data = await res.json();
    if (res.ok && data.customer?.tier) {
      setTier(data.customer.tier);
      setMsg("✅ คำนวณระดับใหม่แล้ว");
      onSaved();
      setTimeout(() => setMsg(""), 2000);
    }
  };

  const sendFollowUp = async () => {
    if (!customer.lineUserId) {
      setMsg("❌ ลูกค้ายังไม่ได้ผูก LINE");
      return;
    }
    if (!confirm(`ส่งข้อความตาม ${customer.name} ทาง LINE?`)) return;
    setFollowUpBusy(true);
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: customer.id,
        action: "send_follow_up",
        force: !canFollowUp,
      }),
    });
    const data = await res.json();
    setFollowUpBusy(false);
    if (res.ok) {
      setMsg("✅ ส่งข้อความตามแล้ว");
      onSaved();
    } else {
      setMsg(`❌ ${data.error || "ส่งไม่สำเร็จ"}`);
    }
    setTimeout(() => setMsg(""), 3000);
  };

  return (
    <section className="mb-4 rounded-petflow bg-gradient-to-br from-honey/45 via-card to-latte/15 p-4 shadow-petflow">
      {msg && (
        <p className="mb-3 rounded-petflow-sm bg-sage/25 px-3 py-2 text-center text-xs font-extrabold text-ok">
          {msg}
        </p>
      )}
      <div className="mb-3 flex items-start gap-3">
        {heroCat?.photoDataUrl ? (
          <CatPhoto src={heroCat.photoDataUrl} name={heroCat.name} size={64} />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-petflow-sm bg-card/80 text-petflow-chocolate ring-2 ring-white/70">
            <Icon name={customer.cats.length > 0 ? "paw" : "user"} size={28} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Customer · ลูกค้า</p>
          <h1 className="mt-0.5 break-words text-xl font-extrabold leading-tight text-petflow-chocolate">
            {customer.name}
          </h1>
          {customer.lineDisplayName && customer.lineDisplayName !== customer.name && (
            <p className="mt-0.5 truncate text-[11px] text-brown-soft">
              ชื่อใน LINE: <span className="font-bold text-brown">{customer.lineDisplayName}</span>
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${tierBadgeClass(customer.tier || "new")}`}>
              {TIER_LABELS[customer.tier || "new"]}
            </span>
            {customer.isMember && (
              <span className="inline-flex items-center gap-1 rounded-full bg-latte/30 px-2.5 py-0.5 text-[10px] font-extrabold text-latte-deep">
                <Icon name="star" size={11} />
                Member
              </span>
            )}
            {customer.lineUserId ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-ok/15 px-2.5 py-0.5 text-[10px] font-bold text-ok">
                <Icon name="check" size={11} strokeWidth={2.4} />
                ผูก LINE แล้ว
              </span>
            ) : (
              <span className="rounded-full bg-paper px-2.5 py-0.5 text-[10px] font-bold text-brown-faint">
                ยังไม่ผูก LINE
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          aria-label="แก้ไขข้อมูลลูกค้า"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card/80 text-petflow-chocolate ring-1 ring-petflow-line"
        >
          <Icon name="edit" size={18} />
        </button>
        <MoreMenu
          items={[
            ...(customer.lineUserId
              ? [{ label: "ปลดผูก LINE", icon: "link", danger: true, onClick: unlinkLine }]
              : []),
            { label: "รวมกับลูกค้าอื่น (บัญชีซ้ำ)", icon: "users", onClick: () => setMergeOpen(true) },
            { label: "ลบลูกค้าคนนี้", icon: "trash", danger: true, onClick: removeCustomer },
          ]}
        />
      </div>

      <ul className="mb-3 space-y-1 text-[11px] text-brown-soft">
        {customer.phone && (
          <li className="flex items-center gap-2">
            <Icon name="phone" size={14} className="text-brown-faint" />
            <a href={`tel:${customer.phone}`} className="font-bold text-brown">
              {customer.phone}
            </a>
          </li>
        )}
        {customer.email && (
          <li className="flex items-center gap-2">
            <Icon name="send" size={14} className="text-brown-faint" />
            <span className="min-w-0 truncate">{customer.email}</span>
          </li>
        )}
        {customer.birthday && (
          <li className="flex items-center gap-2">
            <Icon name="cake" size={14} className="text-brown-faint" />
            วันเกิด {customer.birthday}
          </li>
        )}
        {customer.referralSource && (
          <li className="flex items-center gap-2">
            <Icon name="sparkle" size={14} className="text-brown-faint" />
            รู้จักจาก: {customer.referralSource}
          </li>
        )}
        {customer.address && (
          <li className="flex items-start gap-2">
            <Icon name="home" size={14} className="mt-px text-brown-faint" />
            <span className="min-w-0 flex-1">
              {customer.address}
              {customer.addressMapUrl && (
                <>
                  {" "}
                  ·{" "}
                  <a
                    href={customer.addressMapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-latte-deep underline"
                  >
                    แผนที่
                  </a>
                </>
              )}
            </span>
          </li>
        )}
        {customer.taxInvoice && (
          <li className="flex items-start gap-2">
            <Icon name="receipt" size={14} className="mt-px text-brown-faint" />
            <span className="min-w-0 flex-1">
              <b>ออกบิล{customer.taxInvoice.kind === "person" ? "บุคคลธรรมดา" : "นิติบุคคล"}:</b>{" "}
              {customer.taxInvoice.name}
              {customer.taxInvoice.branch && ` (${customer.taxInvoice.branch})`} · เลขภาษี {customer.taxInvoice.taxId}
            </span>
          </li>
        )}
        <li className="flex items-center gap-2">
          <Icon name="user" size={14} className="text-brown-faint" />
          {customer.idCardUrl ? (
            <a href={customer.idCardUrl} target="_blank" rel="noreferrer" className="font-bold text-latte-deep underline">
              ดูบัตรประชาชน (ขีดทับแล้ว)
            </a>
          ) : (
            <span className="text-brown-faint">ยังไม่ได้แนบบัตรประชาชน</span>
          )}
        </li>
        <li className={`flex items-center gap-2 ${customer.marketingConsent ? "text-ok" : "font-bold text-wait"}`}>
          <Icon name={customer.marketingConsent ? "check" : "x"} size={14} />
          {customer.marketingConsent ? "ยินยอมรับข่าวสาร/โปร" : "ไม่รับข่าวสาร/โปร"}
        </li>
      </ul>

      {inactive && (
        <p className="mb-3 flex items-center gap-2 rounded-petflow-sm bg-wait/10 px-3 py-2 text-[11px] font-bold text-wait">
          <Icon name="clock" size={14} />
          หายไป {daysSinceVisit} วัน
          {lastVisitDate ? ` · มาครั้งล่าสุด ${lastVisitDate}` : ""}
        </p>
      )}

      <div className="mb-4 grid grid-cols-4 divide-x divide-petflow-line rounded-petflow-sm bg-card/85 py-2.5 shadow-petflow-sm">
        <div className="px-1 text-center">
          <p className="text-lg font-extrabold leading-tight text-latte-deep">{points}</p>
          <p className="text-[10px] font-bold text-brown-soft">แต้ม</p>
        </div>
        <div className="px-1 text-center">
          <p className="text-lg font-extrabold leading-tight text-petflow-chocolate">{visits}</p>
          <p className="text-[10px] font-bold text-brown-soft">มา (ครั้ง)</p>
        </div>
        <div className="px-1 text-center">
          <p className="truncate text-lg font-extrabold leading-tight text-petflow-chocolate">
            {customer.memberCredit.toLocaleString()}
          </p>
          <p className="text-[10px] font-bold text-brown-soft">เครดิต (฿)</p>
        </div>
        {/* คอร์สคงเหลือ — ลูกค้าจ่ายล่วงหน้าไว้แล้ว ต้องเห็นตั้งแต่แรกว่ายังใช้ได้กี่ครั้ง */}
        <div className="px-1 text-center">
          <p className="text-lg font-extrabold leading-tight text-ok">{packageUsesLeft}</p>
          <p className="text-[10px] font-bold text-brown-soft">คอร์สเหลือ</p>
        </div>
      </div>

      {followUpOn && (inactive || customer.lineUserId) && (
        <div className="mb-3 flex items-center gap-3 rounded-petflow-sm border border-petflow-line bg-card/85 p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sage/20 text-ok">
            <Icon name="send" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold text-petflow-chocolate">ตามลูกค้าทาง LINE</p>
            <p className="truncate text-[10px] text-brown-faint">
              {customer.lastFollowUpAt
                ? `ส่งล่าสุด: ${customer.lastFollowUpAt.slice(0, 10)}`
                : !customer.lineUserId
                  ? "ต้องผูก LINE ก่อนจึงส่งได้"
                  : "ยังไม่เคยส่ง"}
            </p>
          </div>
          <button
            type="button"
            disabled={followUpBusy || !customer.lineUserId}
            onClick={sendFollowUp}
            className="min-h-[40px] shrink-0 rounded-full bg-sage/25 px-3.5 py-2 text-xs font-bold text-ok disabled:opacity-50"
          >
            {followUpBusy ? "กำลังส่ง…" : canFollowUp ? "ส่งข้อความ" : "ส่งซ้ำ (ข้าม cooldown)"}
          </button>
        </div>
      )}

      <div className="mb-3 rounded-petflow-sm border border-petflow-line bg-card/85 p-3">
        <SectionLabel
          action={
            <button
              type="button"
              onClick={recalcTier}
              className="flex min-h-[32px] items-center gap-1 text-[11px] font-bold text-latte-deep"
            >
              <Icon name="sparkle" size={13} />
              คำนวณอัตโนมัติ
            </button>
          }
        >
          Tier · ระดับลูกค้า
        </SectionLabel>
        <Segmented
          value={tier}
          onChange={setTierManual}
          options={(Object.keys(TIER_LABELS) as CustomerTier[]).map((t) => ({ id: t, label: TIER_LABELS[t] }))}
        />
      </div>

      {toolsSlot &&
        createPortal(
          <>
            <CollapsibleCard
              icon="gift"
              title="เพิ่มแต้มพิเศษ (แต้มฟรี)"
              sub={<>มีอยู่ <span className="font-bold text-latte-deep">{points} แต้ม</span></>}
            >
            {customer.lineUserId ? (
              <>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={addAmt}
                    onChange={(e) => setAddAmt(e.target.value)}
                    placeholder="กี่แต้ม"
                    className={`!w-24 shrink-0 font-bold ${inputCls}`}
                  />
                  <input
                    value={addReason}
                    onChange={(e) => setAddReason(e.target.value)}
                    placeholder="เหตุผล เช่น รีวิวร้าน"
                    className={`min-w-0 flex-1 ${inputCls}`}
                  />
                </div>
                <button
                  type="button"
                  disabled={addBusy || !addAmt}
                  onClick={addNotify ? previewBonusPoints : addBonusPoints}
                  className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-petflow-sm bg-latte-deep px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-40"
                >
                  {!addBusy && <Icon name={addNotify ? "eye" : "plus"} size={16} />}
                  {addBusy ? "…" : addNotify ? "ดูการ์ด" : "เพิ่มแต้ม"}
                </button>
                {pointsPreview && (
                  <PreviewSendModal
                    messages={pointsPreview}
                    sending={addBusy}
                    onConfirm={addBonusPoints}
                    onCancel={() => setPointsPreview(null)}
                  />
                )}
                <label className="mt-1 flex min-h-[40px] items-center gap-2 text-[11px] font-bold text-brown-soft">
                  <input
                    type="checkbox"
                    checked={addNotify}
                    onChange={(e) => setAddNotify(e.target.checked)}
                    className="h-5 w-5 accent-latte-deep"
                  />
                  แจ้งลูกค้าทาง LINE ด้วย (เสียโควตา 1 ข้อความ)
                </label>
                <p className="text-[10px] text-brown-faint">
                  บันทึกในประวัติแต้มของลูกค้า (มีเหตุผลกำกับ) + แจ้งเตือนร้านเสมอ ·
                  ปกติจะ<b>ไม่</b>ส่งข้อความหาลูกค้า ถ้าอยากแจ้งค่อยติ๊กช่องด้านบน
                </p>
              </>
            ) : (
              <p className="flex gap-2 text-[11px] font-bold text-brown-soft">
                <Icon name="alert" size={16} className="text-wait" />
                <span className="min-w-0 flex-1">ลูกค้ารายนี้ยังไม่ได้ผูก LINE — ต้องให้ลูกค้าเปิดแอปจาก LINE ก่อน
                ถึงจะเพิ่มแต้มสะสมได้ค่ะ (แต้มผูกกับบัญชี LINE)</span>
              </p>
            )}
            </CollapsibleCard>
            <CollapsibleCard
              icon="ticket"
              title="คอร์ส / แพ็กเกจ"
              sub={
                <>
                  เหลือ <span className="font-bold text-ok">{packageUsesLeft} ครั้ง</span>
                  {packages.some((p) => p.locked && p.status !== "cancelled") && (
                    <span className="font-bold text-wait"> · มีงวดค้าง</span>
                  )}
                  {" "}· แตะเพื่อขายคอร์ส
                </>
              }
            >
            {packages.filter((p) => p.status !== "cancelled").length > 0 && (
              <ul className="mb-2 divide-y divide-petflow-line rounded-petflow-sm border border-petflow-line bg-card">
                {packages
                  .filter((p) => p.status !== "cancelled")
                  .map((p) => {
                    const left = p.totalUses - p.usedUses;
                    return (
                      <li key={p.id} className="flex min-h-[48px] items-center gap-2 py-1 pl-3 pr-1.5 text-xs">
                        <span className="min-w-0 flex-1 truncate font-bold text-brown">
                          {p.name}
                          {p.groomProgram && (
                            <span className="block truncate text-[10px] font-normal text-brown-faint">
                              ใช้กับ {groomProgramName(p.groomProgram, groomPrograms) || "โปรแกรมที่ลบไปแล้ว"}
                            </span>
                          )}
                          {p.planId && pkgPlans[p.planId] && (
                            <span className={`block truncate text-[10px] font-bold ${p.locked ? "text-wait" : "text-ok"}`}>
                              {p.locked
                                ? `🔒 จ่ายแล้ว ${pkgPlans[p.planId].payments.length}/${pkgPlans[p.planId].installments} งวด`
                                : `แบ่งจ่าย ${pkgPlans[p.planId].payments.length} งวด · จ่ายครบแล้ว`}
                            </span>
                          )}
                        </span>
                        {p.locked && p.planId ? (
                          <button
                            type="button"
                            onClick={() => payInstallment(p.planId!, p.name)}
                            className="flex min-h-[36px] shrink-0 items-center gap-1 rounded-full bg-petflow-chocolate px-3 text-[11px] font-extrabold text-card"
                          >
                            <Icon name="money" size={14} />
                            รับงวด · ค้าง {Math.round(p.outstanding || 0).toLocaleString()}
                          </button>
                        ) : (
                          <span className={`shrink-0 font-extrabold ${left > 0 ? "text-ok" : "text-brown-faint"}`}>
                            เหลือ {left}/{p.totalUses}
                          </span>
                        )}
                        <MoreMenu
                          items={[
                            { label: "ยกเลิกคอร์สนี้", icon: "x", danger: true, onClick: () => cancelPackage(p.id) },
                          ]}
                        />
                      </li>
                    );
                  })}
              </ul>
            )}
            <input
              value={pkgName}
              onChange={(e) => setPkgName(e.target.value)}
              placeholder="ชื่อคอร์ส เช่น อาบน้ำ 10 ครั้ง"
              className={inputCls}
            />
            <div className="mt-2">
              <GroomProgramPicker value={pkgProgram} onChange={setPkgProgram} programs={groomPrograms} />
            </div>
            <div className="mt-2 flex gap-2">
              <input
                type="number"
                value={pkgUses}
                onChange={(e) => setPkgUses(e.target.value)}
                placeholder="กี่ครั้ง"
                className={`!w-24 shrink-0 ${inputCls}`}
              />
              <input
                type="number"
                value={pkgPrice}
                onChange={(e) => setPkgPrice(e.target.value)}
                placeholder="ราคา (บาท)"
                className={`min-w-0 flex-1 ${inputCls}`}
              />
            </div>

            {!pkgLegacy && (
              <div className="mt-2 space-y-2">
                <select
                  value={pkgInstallments}
                  onChange={(e) => setPkgInstallments(Number(e.target.value))}
                  className={inputCls}
                  aria-label="การจ่ายเงิน"
                >
                  <option value={1}>จ่ายเต็มครั้งเดียว</option>
                  {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                    <option key={n} value={n}>
                      แบ่งจ่าย {n} งวด{Number(pkgPrice) > 0 ? ` (งวดละ ~${Math.ceil(Number(pkgPrice) / n).toLocaleString()})` : ""}
                    </option>
                  ))}
                </select>
                {pkgInstallments > 1 && (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={pkgFirstPay}
                        onChange={(e) => setPkgFirstPay(e.target.value)}
                        placeholder="รับงวดแรกวันนี้ (บาท) — ว่าง = ยังไม่รับ"
                        className={`min-w-0 flex-1 ${inputCls}`}
                      />
                      <select
                        value={pkgMethod}
                        onChange={(e) => setPkgMethod(e.target.value as "transfer" | "cash")}
                        className={`!w-24 shrink-0 ${inputCls}`}
                        aria-label="รับเงินทาง"
                      >
                        <option value="transfer">โอน</option>
                        <option value="cash">เงินสด</option>
                      </select>
                    </div>
                    <p className="flex items-center gap-1 text-[10px] font-bold text-wait">
                      <Icon name="alert" size={12} />
                      คอร์สจะยังใช้ไม่ได้จนกว่าจะจ่ายครบทุกงวด · รับงวดถัดไปได้ที่ปุ่ม &quot;รับงวด&quot; ในรายการคอร์ส
                    </p>
                  </>
                )}
              </div>
            )}

            {pkgPreview && (
              <PreviewSendModal
                messages={pkgPreview}
                sending={pkgBusy}
                onConfirm={sellPackage}
                onCancel={() => setPkgPreview(null)}
              />
            )}

            <div className="mt-2 space-y-2">
              <CheckRow
                checked={pkgLegacy}
                onChange={setPkgLegacy}
                icon="clock"
                title="ยกมาจากระบบเก่า"
                sub={
                  <>
                    ลูกค้าได้ครั้งครบตามปกติ แต่จะ<b>ไม่นับเป็นรายรับ</b>ของร้านเดือนนี้
                  </>
                }
              />
              <CheckRow
                checked={pkgNotify}
                onChange={setPkgNotify}
                icon="message"
                title="แจ้งลูกค้าทาง LINE ด้วย"
                sub="ส่งการ์ดบอกจำนวนครั้งคงเหลือ (เสียโควตา 1 ข้อความ) · ไม่ติ๊ก = บันทึกเงียบๆ"
              />
            </div>

            <button
              type="button"
              disabled={pkgBusy || !pkgName.trim() || !pkgUses}
              onClick={pkgNotify ? previewPackage : sellPackage}
              className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-petflow-sm bg-sage px-3 py-2.5 text-sm font-extrabold text-card disabled:opacity-40"
            >
              <Icon name="plus" size={16} />
              {pkgLegacy ? "ยกคอร์สมา" : "ขายคอร์ส"}
            </button>

            <p className="mt-1.5 text-[10px] text-brown-faint">
              เวลาลูกค้ามาใช้ กดหักที่หน้าคิดเงิน · ลูกค้าดูครั้งคงเหลือเองได้ในแอป
            </p>
            </CollapsibleCard>
          </>,
          toolsSlot
        )}

      {editOpen && (
        <EditCustomerSheet customer={customer} onClose={() => setEditOpen(false)} onSaved={onSaved} />
      )}

      {!customer.lineUserId && (
        <AdoptLineControl customer={customer} onMerged={onSaved} />
      )}

      {mergeOpen && (
        <MergeCustomerControl
          customer={customer}
          onMerged={onSaved}
          startOpen
          onClose={() => setMergeOpen(false)}
        />
      )}
    </section>
  );
}

/**
 * ลูกค้าคนนี้ยังไม่ผูก LINE ทั้งที่สมัครแล้ว — เพราะ LINE ไปติดอยู่บนอีก record
 * (ลูกค้าสมัครเอง/ระบบสร้างให้ตอนเปิดแอปครั้งแรก คนละตัวกับที่ร้านสร้างไว้)
 * ปุ่มนี้ให้ร้านดึง record ที่ถือ LINE เข้ามารวมได้เอง — ลูกค้าไม่ต้องกดอะไรเลย
 */
function AdoptLineControl({
  customer,
  onMerged,
}: {
  customer: CustomerRecord;
  onMerged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(customer.name);
  const [results, setResults] = useState<CustomerRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      try {
        const d = await fetch(`/api/customers?q=${encodeURIComponent(query)}`).then((r) =>
          r.json()
        );
        // เอาเฉพาะบัญชีที่ "มี LINE แล้ว" — บัญชีที่ยังไม่ผูกดึงมาก็ไม่ช่วยอะไร
        setResults(
          (d.customers || [])
            .filter((c: CustomerRecord) => c.id !== customer.id && c.lineUserId)
            .slice(0, 8)
        );
      } catch {
        /* ค้นไม่ได้ = ไม่โชว์ */
      } finally {
        setSearched(true);
      }
    },
    [customer.id]
  );

  useEffect(() => {
    if (open) void search(q);
    // เปิดครั้งแรกให้ค้นด้วยชื่อลูกค้าเลย — ส่วนใหญ่บัญชีซ้ำใช้ชื่อใกล้กัน
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const adopt = async (source: CustomerRecord) => {
    if (
      !confirm(
        `ดึง LINE ของ "${source.lineDisplayName || source.name}" มาผูกกับ "${customer.name}"?\n\n` +
          `แต้ม · คูปอง · เครดิต · บิล · แมว จะย้ายมาที่ "${customer.name}" ทั้งหมด\n` +
          `แล้วบัญชีซ้ำ "${source.name}" จะถูกลบ (กู้ได้จากถังขยะ)\n\n` +
          `ลูกค้าไม่ต้องทำอะไรเลย`
      )
    )
      return;
    setBusy(true);
    try {
      // รวมบัญชีที่ถือ LINE (source) เข้าบัญชีนี้ (target) — ทิศทางกลับกับปุ่มรวมด้านล่าง
      const res = await fetch("/api/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: source.id,
          action: "merge_customer",
          targetId: customer.id,
        }),
      });
      if (res.ok) {
        toast("ผูก LINE ให้แล้ว ✓ ลูกค้าไม่ต้องทำอะไร", "success");
        onMerged();
      } else {
        toast("ผูกไม่สำเร็จ", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex min-h-[48px] w-full items-center gap-3 rounded-petflow-sm border border-ok/40 bg-ok/10 px-3 py-2.5 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-ok">
          <Icon name="link" size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-extrabold text-ok">ผูก LINE ให้เอง</span>
          <span className="block text-[10px] text-brown-soft">ลูกค้าไม่ต้องกดอะไร</span>
        </span>
        <Icon name="chevron" size={16} className="text-ok" />
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-petflow-sm border border-ok/40 bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <Icon name="link" size={16} className="text-ok" />
        <p className="min-w-0 flex-1 truncate text-xs font-extrabold text-petflow-chocolate">
          ผูก LINE ให้ “{customer.name}”
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="ปิด"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper text-brown"
        >
          <Icon name="x" size={16} />
        </button>
      </div>
      {/* ทางลัด: นัดที่จองผ่าน LINE เก็บ LINE ID ไว้กับตัวนัดอยู่แล้ว — ดึงมาใช้ได้เลย
          ไม่ต้องหา record ซ้ำเอง (ต่อให้ตัวซ้ำโดนลบไปแล้วก็ยังดึงได้) */}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await fetch("/api/customers", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: customer.id, action: "adopt_line_from_bookings" }),
            });
            const d = await res.json().catch(() => ({}));
            if (res.ok) {
              toast("ผูก LINE จากนัดให้แล้ว ✓ ลูกค้าไม่ต้องทำอะไร", "success");
              onMerged();
            } else {
              toast(d.error || "ดึงจากนัดไม่ได้ — ลองเลือกจากรายชื่อด้านล่าง", "error");
            }
          } finally {
            setBusy(false);
          }
        }}
        className="mb-2 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-petflow-sm bg-ok px-3 py-2.5 text-xs font-extrabold text-white disabled:opacity-40"
      >
        {!busy && <Icon name="sparkle" size={16} />}
        {busy ? "กำลังผูก…" : "ดึง LINE จากนัดของลูกค้าอัตโนมัติ (แนะนำ)"}
      </button>
      <p className="mb-2 text-[10px] text-brown-faint">
        หรือเลือกบัญชีที่ลูกค้าใช้อยู่จริง (บัญชีที่มี LINE แล้ว) — ระบบจะย้ายแต้ม/คูปอง/บิล
        มารวมที่นี่แล้วลบตัวซ้ำให้
      </p>
      <SearchField
        value={q}
        onChange={(v) => {
          setQ(v);
          void search(v);
        }}
        placeholder="พิมพ์ชื่อลูกค้า / ชื่อ LINE"
      />
      <ul className="mt-2 divide-y divide-petflow-line rounded-petflow-sm border border-petflow-line bg-card">
        {results.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => adopt(c)}
              className="flex min-h-[52px] w-full items-center gap-3 px-3 py-2 text-left disabled:opacity-40 active:bg-paper"
            >
              <Avatar name={c.name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-bold text-petflow-chocolate">{c.name}</span>
                  <span className="shrink-0 rounded-full bg-ok/15 px-1.5 py-px text-[9px] font-bold text-ok">LINE</span>
                </span>
                {c.lineDisplayName && (
                  <span className="block truncate text-[11px] text-brown-soft">LINE: {c.lineDisplayName}</span>
                )}
              </span>
              <Icon name="chevron" size={16} className="text-brown-faint" />
            </button>
          </li>
        ))}
        {searched && results.length === 0 && (
          <li className="px-3 py-3 text-center text-[11px] text-brown-faint">
            ไม่เจอบัญชีที่ผูก LINE ไว้ — ลองพิมพ์ชื่อ LINE ของลูกค้าดู
          </li>
        )}
      </ul>
    </div>
  );
}

/** รวมลูกค้าซ้ำ 2 record → 1 (คนเดียวโดนแยกเพราะ LINE ให้ ID คนละตัวคอม/มือถือ) */
function MergeCustomerControl({
  customer,
  onMerged,
  startOpen = false,
  onClose,
}: {
  customer: CustomerRecord;
  onMerged: () => void;
  /** เปิดแผงค้นหาทันที (เรียกจากเมนู ⋯ ของการ์ดลูกค้า) */
  startOpen?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(startOpen);
  const close = () => {
    setOpen(false);
    onClose?.();
  };
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string; lineDisplayName?: string; points?: number }[]
  >([]);
  const [busy, setBusy] = useState(false);

  const search = async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    try {
      const d = await fetch(`/api/customers?q=${encodeURIComponent(query)}`).then((r) => r.json());
      setResults((d.customers || []).filter((c: { id: string }) => c.id !== customer.id).slice(0, 8));
    } catch {
      /* ค้นไม่ได้ = ไม่โชว์ */
    }
  };

  const merge = async (target: { id: string; name: string }) => {
    if (
      !confirm(
        `รวม "${customer.name}" เข้ากับ "${target.name}"?\n\n` +
          `แต้ม · คูปอง · เครดิต · บิล · แมว · LINE ID จะย้ายไปที่ "${target.name}" ` +
          `แล้วลบ "${customer.name}" ทิ้ง\n\n⚠️ ทำแล้วกู้คืนไม่ได้`
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch("/api/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: customer.id, action: "merge_customer", targetId: target.id }),
      });
      if (res.ok) {
        toast("รวมบัญชีลูกค้าแล้ว ✓", "success");
        onMerged();
      } else {
        toast("รวมไม่สำเร็จ", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-petflow-sm border border-latte/40 bg-latte/10 py-2.5 text-xs font-bold text-latte-deep"
      >
        <Icon name="users" size={16} />
        รวมกับลูกค้าอื่น (กรณีบัญชีซ้ำ)
      </button>
    );
  }
  return (
    <div className="mt-3 rounded-petflow-sm border border-latte/40 bg-card p-3">
      <div className="mb-1 flex items-center gap-2">
        <Icon name="users" size={16} className="text-latte-deep" />
        <p className="min-w-0 flex-1 text-xs font-extrabold text-petflow-chocolate">
          รวม “{customer.name}” เข้ากับลูกค้าอีกคน
        </p>
        <button
          type="button"
          onClick={close}
          aria-label="ยกเลิก"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper text-brown"
        >
          <Icon name="x" size={16} />
        </button>
      </div>
      <p className="mb-2 text-[10px] text-brown-faint">
        ค้นหา “ลูกค้าปลายทาง” (ตัวที่จะเก็บไว้) — ข้อมูลของคนนี้จะย้ายไปที่นั่นทั้งหมดแล้วลบคนนี้ทิ้ง
      </p>
      <SearchField
        value={q}
        onChange={(v) => {
          setQ(v);
          search(v);
        }}
        placeholder="พิมพ์ชื่อลูกค้าปลายทาง"
        autoFocus
      />
      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-petflow-line rounded-petflow-sm border border-petflow-line bg-card">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => merge(c)}
                className="flex min-h-[52px] w-full items-center gap-3 px-3 py-2 text-left disabled:opacity-40 active:bg-paper"
              >
                <Avatar name={c.name} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-petflow-chocolate">{c.name}</span>
                  <span className="block truncate text-[11px] text-brown-soft">
                    {[c.lineDisplayName ? `LINE: ${c.lineDisplayName}` : "", typeof c.points === "number" ? `${c.points} แต้ม` : ""]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </span>
                </span>
                <Icon name="chevron" size={16} className="text-brown-faint" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * เลือกสายพันธุ์แบบ dropdown (เหมือนหน้าสมัครสมาชิกลูกค้า) — พิมพ์เองไม่ได้แล้ว
 * ยกเว้นเลือก "อื่นๆ" ถึงพิมพ์ชื่อพันธุ์เองได้ ป้องกันพันธุ์สะกดไม่ตรงกัน ใช้จับคู่ราคา
 * อาบน้ำอัตโนมัติที่หน้าคิดเงินไม่ได้ (ดู groomBreedCategoryFor)
 */
function CatBreedField({
  breed,
  onSave,
}: {
  breed?: string;
  onSave: (breed: string) => void;
}) {
  const { config } = useConfig();
  const breedList = breedOptionsFor(config);
  const isCustom = !!breed && !breedList.includes(breed);
  const [otherMode, setOtherMode] = useState(isCustom);
  const [otherText, setOtherText] = useState(isCustom ? breed || "" : "");

  useEffect(() => {
    const nowCustom = !!breed && !breedList.includes(breed);
    setOtherMode(nowCustom);
    setOtherText(nowCustom ? breed || "" : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breed, breedList.join("\n")]);

  return (
    <div>
      <select
        value={otherMode ? OTHER_BREED : breed || ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v === OTHER_BREED) {
            setOtherMode(true);
            return;
          }
          setOtherMode(false);
          onSave(v);
        }}
        className={inputCls}
      >
        <option value="">เลือกสายพันธุ์…</option>
        {breedList.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
        <option value={OTHER_BREED}>{OTHER_BREED}</option>
      </select>
      {otherMode && (
        <input
          value={otherText}
          onChange={(e) => setOtherText(e.target.value)}
          onBlur={() => {
            if (otherText.trim()) onSave(otherText.trim());
          }}
          placeholder="ระบุสายพันธุ์"
          className={`mt-1 ${inputCls}`}
        />
      )}
    </div>
  );
}

function AddCatForm({ customerId, onAdded }: { customerId: string; onAdded: () => void }) {
  const pw = usePetWords();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const close = () => {
    setOpen(false);
    setName("");
    setNote("");
    setError("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: customerId,
        action: "add_cat",
        name: name.trim(),
        staffNote: note.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok && data.ok) {
      close();
      onAdded();
    } else {
      setError(data.error || "บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง");
    }
  };

  return (
    <>
      {/* ปุ่มเพิ่มน้องให้เห็นชัด — ต่อท้ายรายการน้องของบ้านนี้ */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex min-h-[56px] w-full items-center gap-3 rounded-petflow border-2 border-honey-deep bg-honey/45 px-4 text-left text-petflow-chocolate shadow-petflow-sm transition active:scale-[.98]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-petflow-chocolate text-card">
          <Icon name="plus" size={20} strokeWidth={2.4} />
        </span>
        <span className="flex-1 text-sm font-extrabold">เพิ่มน้อง{pw.th}อีกตัว</span>
        <Icon name="paw" size={22} className="text-petflow-chocolate/60" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-petflow bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-petflow sm:rounded-petflow">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
                <Icon name="paw" size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">New {pw.en}</p>
                <h2 className="text-base font-extrabold text-petflow-chocolate">เพิ่มน้อง{pw.th}</h2>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="ปิด"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper text-brown"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <label className="block text-xs font-bold text-brown-soft">
                ชื่อน้อง{pw.th} *
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น น้องจู๊ด"
                  required
                  autoFocus
                  className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm font-bold"
                />
              </label>
              <label className="block text-xs font-bold text-brown-soft">
                โน้ตนิสัย (ถ้ามี)
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="เช่น ดุ อาบยาก กลัวเสียง"
                  rows={3}
                  className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-xs"
                />
              </label>
              {error && <p className="text-xs font-bold text-wait">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={close}
                  className="min-h-[44px] flex-1 rounded-petflow-sm bg-paper py-3 text-sm font-bold text-brown-soft"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving || !name.trim()}
                  className="flex min-h-[44px] flex-[2] items-center justify-center gap-1.5 rounded-petflow-sm bg-petflow-chocolate py-3 text-sm font-extrabold text-card shadow-petflow-sm disabled:opacity-50"
                >
                  {!saving && <Icon name="check" size={16} strokeWidth={2.4} />}
                  {saving ? "กำลังบันทึก…" : "บันทึก"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default function CustomersPage() {
  const pw = usePetWords();
  const searchParams = useSearchParams();
  const [q, setQ] = useState("");
  const [list, setList] = useState<CustomerListItem[]>([]);
  const [selected, setSelected] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTools, setShowTools] = useState(false);
  /** ช่องท้ายหน้าที่ฟอร์มเพิ่มแต้ม/ขายคอร์สไปวาง */
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const [tierFilter, setTierFilter] = useState<CustomerTier | "all">("all");
  const [lineFilter, setLineFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const resetFilters = () => {
    setQ("");
    setTierFilter("all");
    setLineFilter("all");
    setSortKey("recent");
    setSortDir("desc");
  };

  const visibleList = list
    .filter((c) => tierFilter === "all" || (c.tier || "new") === tierFilter)
    .filter((c) => {
      if (lineFilter === "all") return true;
      const linked = Boolean(c.lineUserId);
      return lineFilter === "linked" ? linked : !linked;
    })
    .slice()
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name, "th");
      else if (sortKey === "tier")
        cmp = (a.tier || "new").localeCompare(b.tier || "new");
      else if (sortKey === "points") cmp = (a.points || 0) - (b.points || 0);
      else if (sortKey === "credit") cmp = (a.memberCredit || 0) - (b.memberCredit || 0);
      else if (sortKey === "upcoming")
        cmp = (a.upcomingAppointments || 0) - (b.upcomingAppointments || 0);
      else if (sortKey === "birthday")
        cmp = (a.birthday || "").localeCompare(b.birthday || "");
      else if (sortKey === "recent")
        cmp = (a.createdAt || "").localeCompare(b.createdAt || "");
      else if (sortKey === "updated")
        cmp = (a.updatedAt || "").localeCompare(b.updatedAt || "");
      else if (sortKey === "cats") cmp = a.cats.length - b.cats.length;
      else if (sortKey === "catName")
        cmp = (a.cats[0]?.name || "￿").localeCompare(b.cats[0]?.name || "￿", "th");
      else if (sortKey === "phone") cmp = (a.phone || "￿").localeCompare(b.phone || "￿");
      else if (sortKey === "line") cmp = Number(Boolean(a.lineUserId)) - Number(Boolean(b.lineUserId));
      else if (sortKey === "birthdaySoon") {
        const soon = (c: CustomerListItem) =>
          Math.min(
            daysToNextBirthday(c.birthday),
            ...c.cats.map((x) => daysToNextBirthday(x.birthday))
          );
        cmp = soon(a) - soon(b);
      }
      if (cmp === 0) cmp = a.name.localeCompare(b.name, "th");
      return sortDir === "asc" ? cmp : -cmp;
    });

  const search = useCallback(async (query: string) => {
    setLoading(true);
    const params = query ? `?q=${encodeURIComponent(query)}` : "";
    const res = await fetch(`/api/customers${params}`);
    const data = await res.json();
    setList(data.customers || []);
    setLoading(false);
  }, []);

  const open = useCallback(async (id: string) => {
    // ลูกค้าถูกลบไปแล้ว / ลิงก์เก่า → เมื่อก่อน setSelected({error}) แล้วจอขาวทั้งหน้า
    try {
      const res = await fetch(`/api/customers?id=${id}`);
      const data = await res.json();
      if (!res.ok || !data?.customer) {
        toast("ไม่พบข้อมูลลูกค้ารายนี้ (อาจถูกลบไปแล้ว)", "error");
        return;
      }
      setSelected(data);
    } catch {
      toast("โหลดข้อมูลลูกค้าไม่สำเร็จ ลองใหม่อีกครั้งนะคะ", "error");
    }
  }, []);

  const deleteCustomerRow = async (c: CustomerListItem) => {
    if (!confirm(`ลบลูกค้า ${c.name}?\n(ย้ายลงถังขยะ กู้คืนได้ที่เมนู 🗑️ ถังขยะ)`)) return;
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, action: "delete_customer" }),
    });
    if (res.ok) {
      toast("ย้ายลูกค้าลงถังขยะแล้ว 🗑️", "success");
      search(q);
    } else {
      toast("ลบไม่สำเร็จ", "error");
    }
  };

  // ค้นหาสด — พิมพ์แล้วกรองเลย (หน่วง 300ms) ไม่ต้องกดปุ่ม
  useEffect(() => {
    const t = setTimeout(() => search(q), 300);
    return () => clearTimeout(t);
  }, [q, search]);

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) open(id);
  }, [searchParams, open]);

  const saveCat = async (
    catId: string,
    patch: {
      name?: string;
      staffNote?: string;
      photoDataUrl?: string;
      gender?: "male" | "female";
      breed?: string;
      furLength?: "short" | "long";
      color?: string;
      ageValue?: number;
      ageUnit?: "year" | "month";
      weightKg?: number | null;
      birthday?: string;
      medical?: string;
    }
  ) => {
    if (!selected) return;
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selected.customer.id,
        action: "update_cat",
        catId,
        patch,
      }),
    });
    if (res.ok) toast(`✅ บันทึกข้อมูล${pw.th}แล้ว`, "success");
    open(selected.customer.id);
  };

  const deleteCatProfile = async (cat: CatRecord) => {
    if (!selected) return;
    if (!confirm(`ลบโปรไฟล์ ${cat.name}?`)) return;
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selected.customer.id,
        action: "delete_cat",
        catId: cat.id,
      }),
    });
    if (res.ok) open(selected.customer.id);
    else alert("ลบไม่สำเร็จ");
  };

  const saveCatNote = async (catId: string, staffNote: string, photoDataUrl?: string) => {
    await saveCat(catId, { staffNote, ...(photoDataUrl ? { photoDataUrl } : {}) });
  };

  const saveCatPrivateNote = async (catId: string, note: string) => {
    if (!selected) return;
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selected.customer.id,
        action: "update_cat_private_note",
        catId,
        note,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.needSql) {
      alert(
        "บันทึกโน้ตลับยังไม่ได้ ต้องรัน SQL เพิ่มคอลัมน์ใน Supabase ก่อน (ดู webapp/OVERNIGHT_SQL.md)"
      );
      return;
    }
    // ยืนยันให้เห็นชัด — ก่อนหน้านี้เงียบทั้งตอนสำเร็จและตอนพลาด แยกไม่ออกว่าเซฟติดไหม
    if (res.ok) toast("บันทึกโน้ตลับร้านแล้ว 🔒", "success");
    else toast("บันทึกโน้ตลับไม่สำเร็จ", "error");
  };


  const onPhoto = async (cat: CatRecord, file: File) => {
    try {
      const dataUrl = await toJpegDataUrl(file);
      await saveCatNote(cat.id, cat.staffNote || "", dataUrl);
    } catch (e) {
      alert(e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ");
    }
  };

  if (selected) {
    const c = selected.customer;
    return (
      <div>
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="mb-3 flex min-h-[40px] items-center gap-1.5 rounded-full bg-card px-3.5 py-2 text-xs font-bold text-brown shadow-petflow-sm"
        >
          <Icon name="back" size={16} />
          ลูกค้าทั้งหมด
        </button>
        <CustomerSummaryCard
          customer={c}
          points={selected.points}
          visits={selected.visits}
          lastVisitDate={selected.lastVisitDate}
          daysSinceVisit={selected.daysSinceVisit}
          inactive={selected.inactive}
          canFollowUp={selected.canFollowUp}
          onSaved={() => open(c.id)}
          toolsSlot={toolsSlot}
        />

        <CustomerLinkSection
          customerId={c.id}
          customerName={c.name}
          hasLine={Boolean(c.lineUserId)}
        />

        <section className="mb-4">
          <SectionLabel>{`${pw.enPlural[0].toUpperCase()}${pw.enPlural.slice(1)} · น้อง${pw.th} (${c.cats.length})`}</SectionLabel>

          {c.cats.length === 0 && (
            <div className="rounded-petflow bg-card shadow-petflow-sm">
              <EmptyState icon="paw" title={`ยังไม่มีน้อง${pw.th}`} sub={`กด “เพิ่มน้อง${pw.th}อีกตัว” ด้านล่างเพื่อเพิ่ม`} />
            </div>
          )}
          <div className="space-y-3">
          {c.cats.map((cat) => (
            <div key={cat.id} className="rounded-petflow bg-card shadow-petflow-sm">
              <div className="flex items-center gap-3 p-4 pb-3">
                {/* แตะรูปเพื่อดูเต็มจอ · ปุ่มกล้องเพื่อเปลี่ยนรูป (ลูกค้าเห็นในแอปด้วย) */}
                <CatPhoto src={cat.photoDataUrl} name={cat.name} size={72} onPick={(f) => onPhoto(cat, f)} />
                <label className="block min-w-0 flex-1 text-[11px] font-bold text-brown-soft">
                  <span className="mb-1 block">ชื่อน้อง{pw.th}</span>
                  <input
                    defaultValue={cat.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== cat.name) saveCat(cat.id, { name: v });
                    }}
                    className={`font-bold text-brown ${inputCls}`}
                  />
                </label>
                <MoreMenu
                  items={[
                    { label: "ลบโปรไฟล์ตัวนี้", icon: "trash", danger: true, onClick: () => deleteCatProfile(cat) },
                  ]}
                />
              </div>
              <p className="-mt-1 px-4 pb-2 text-[10px] text-brown-faint">แตะรูปเพื่อดูเต็มจอ · ปุ่มกล้องเพื่อเปลี่ยนรูป (ลูกค้าเห็นในแอปด้วย)</p>

              <div className="space-y-3 border-t border-petflow-line p-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Segmented
                    value={(cat.gender ?? "") as "" | "male" | "female"}
                    onChange={(v) => {
                      if (v) saveCat(cat.id, { gender: v });
                    }}
                    options={[
                      { id: "male", label: "ตัวผู้" },
                      { id: "female", label: "ตัวเมีย" },
                    ]}
                  />
                  <Segmented
                    value={(cat.furLength ?? "") as "" | "short" | "long"}
                    onChange={(v) => {
                      if (v) saveCat(cat.id, { furLength: v });
                    }}
                    options={[
                      { id: "short", label: "ขนสั้น" },
                      { id: "long", label: "ขนยาว" },
                    ]}
                  />
                </div>
                <label className="block text-[11px] font-bold text-brown-soft">
                  <span className="mb-1 block">พันธุ์</span>
                  <CatBreedField
                    breed={cat.breed}
                    onSave={(breed) => saveCat(cat.id, { breed })}
                  />
                </label>
                <label className="block text-[11px] font-bold text-brown-soft">
                  <span className="mb-1 block">สี/ลักษณะเด่น</span>
                  <input
                    defaultValue={cat.color}
                    placeholder="เช่น สีขาวสลับดำ มีจุดที่หู"
                    className={inputCls}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (cat.color || "")) saveCat(cat.id, { color: v });
                    }}
                  />
                </label>
                <div className="flex gap-2">
                  <label className="block min-w-0 flex-1 text-[11px] font-bold text-brown-soft">
                    <span className="mb-1 block">อายุ</span>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      defaultValue={cat.ageValue}
                      className={inputCls}
                      onBlur={(e) => {
                        const v = e.target.value ? Number(e.target.value) : undefined;
                        if (v !== undefined && v !== cat.ageValue) {
                          saveCat(cat.id, { ageValue: v, ageUnit: cat.ageUnit || "year" });
                        }
                      }}
                    />
                  </label>
                  <label className="block w-28 shrink-0 text-[11px] font-bold text-brown-soft">
                    <span className="mb-1 block">หน่วย</span>
                    <select
                      defaultValue={cat.ageUnit || "year"}
                      className={inputCls}
                      onChange={(e) =>
                        saveCat(cat.id, {
                          ageUnit: e.target.value as "year" | "month",
                          ageValue: cat.ageValue ?? 0,
                        })
                      }
                    >
                      <option value="year">ปี</option>
                      <option value="month">เดือน</option>
                    </select>
                  </label>
                </div>
                <label className="block text-[11px] font-bold text-brown-soft">
                  <span className="mb-1 block">น้ำหนัก (กก.)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    defaultValue={cat.weightKg}
                    placeholder="เช่น 4.5"
                    className={inputCls}
                    onBlur={(e) => {
                      const v = e.target.value ? Number(e.target.value) : null;
                      if (v !== (cat.weightKg ?? null)) saveCat(cat.id, { weightKg: v });
                    }}
                  />
                </label>
                <label className="block text-[11px] font-bold text-brown-soft">
                  วันเกิดน้อง <span className="font-normal text-brown-faint">(ถ้าทราบ)</span>
                  <BirthdayPicker
                    value={cat.birthday || ""}
                    onChange={(iso) => {
                      if (iso && iso !== cat.birthday) saveCat(cat.id, { birthday: iso });
                    }}
                    yearsBack={25}
                  />
                </label>
                <StaffNoteTagPicker
                  medicalValue={cat.medical || ""}
                  noteValue={cat.staffNote || ""}
                  onChange={(medical, staffNote) => saveCat(cat.id, { medical, staffNote })}
                />
                <label className="block rounded-petflow-sm border border-wait/40 bg-wait/5 px-3 py-2.5 text-[11px] font-bold text-wait">
                  <span className="mb-1 flex items-center gap-1.5">
                    <Icon name="eye" size={14} />
                    โน้ตลับร้าน (ลูกค้าไม่เห็น)
                  </span>
                  <textarea
                    defaultValue={cat.staffPrivateNote}
                    placeholder="เช่น กัด ข่วน ดุมาก ระวังตอนอาบน้ำ — เฉพาะพนักงาน"
                    className="w-full rounded-petflow-sm border border-wait/30 bg-card px-3 py-2 text-sm font-normal text-brown"
                    rows={2}
                    onBlur={(e) => saveCatPrivateNote(cat.id, e.target.value)}
                  />
                </label>
                  {(() => {
                    const gi = parseGroomInfo(cat.groomHealthInfo);
                    if (!gi) {
                      return (
                        <div className="rounded-petflow-sm border border-petflow-line bg-paper/60 px-3 py-2.5">
                          <p className="flex items-center gap-1.5 text-[11px] font-extrabold text-brown-faint">
                            <Icon name="bath" size={14} />
                            ประวัติก่อนอาบน้ำ — ลูกค้ายังไม่ได้กรอก
                          </p>
                        </div>
                      );
                    }
                    const s = groomInfoSummary(gi);
                    return (
                      <div className="rounded-petflow-sm border border-sage/40 bg-sage/10 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="flex items-center gap-1.5 text-[11px] font-extrabold text-ok">
                            <Icon name="bath" size={14} />
                            ประวัติก่อนอาบน้ำ (ลูกค้ากรอกไว้)
                          </p>
                          {gi.submittedAt && (
                            <p className="text-[9px] text-brown-faint">
                              {new Date(gi.submittedAt).toLocaleString("th-TH", {
                                dateStyle: "medium",
                                timeStyle: "short",
                                calendar: "gregory",
                              })}
                            </p>
                          )}
                        </div>
                        <dl className="mt-1.5 space-y-1 text-[11px] text-brown">
                          {Object.entries(s).map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                              <dt className="w-24 shrink-0 font-bold text-brown-soft">{k}</dt>
                              <dd className="min-w-0 flex-1 break-words">{v}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    );
                  })()}

                <CatMediaGallery customerId={c.id} cat={cat} onSaved={() => open(c.id)} />
              </div>
            </div>
          ))}
          </div>
          <AddCatForm customerId={c.id} onAdded={() => open(c.id)} />
        </section>

        <PetServiceHistory
          cats={c.cats}
          bills={selected.history.serviceBills}
          bookings={[
            ...(selected.history.upcomingBookings || []),
            ...(selected.history.pastBookings || []),
          ]}
        />

        <RoomPlanSection
          customerId={c.id}
          hasLine={!!c.lineUserId}
          onChanged={() => open(c.id)}
        />

        <PackageHistorySection
          customerId={c.id}
          usage={selected.history.packageUsage || []}
          onChanged={() => open(c.id)}
        />

        <MemberCreditHistorySection
          customerId={c.id}
          memberCredit={c.memberCredit}
          topups={selected.history.memberTopups || []}
          usage={selected.history.memberCreditUsage || []}
          onChanged={() => open(c.id)}
        />

        <CustomerAppointmentsSection
          bookings={selected.history.upcomingBookings || []}
          catNames={c.cats.map((x) => x.name)}
          onRefresh={() => open(c.id)}
        />

        <StaysConsentSection
          bookings={[
            ...(selected.history.upcomingBookings || []),
            ...(selected.history.pastBookings || []),
          ]}
        />

        <PastPricesSection log={selected.serviceLog} />

        <ServiceHistorySection
          customerId={c.id}
          services={selected.history.services}
          pastBookings={selected.history.pastBookings || []}
          log={selected.serviceLog}
          onChanged={() => open(c.id)}
        />

        <section className="rounded-petflow bg-card p-4 shadow-petflow-sm">
          <CardHeader icon="gift" title="ประวัติแลกแต้ม" />
          <ul className="divide-y divide-petflow-line rounded-petflow-sm border border-petflow-line text-xs text-brown-soft">
            {selected.history.points.map((p) => (
              <li key={p.id} className="flex min-h-[48px] items-center gap-2 py-1.5 pl-3 pr-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-brown">{p.labelTh}</span>
                  <span className="block text-[11px] text-brown-faint">{p.at.slice(0, 10)}</span>
                </span>
                <span className={`shrink-0 font-extrabold ${p.points > 0 ? "text-ok" : "text-wait"}`}>
                  {p.points > 0 ? "+" : ""}
                  {p.points}
                </span>
                <MoreMenu
                  items={[
                    {
                      label: "ลบรายการนี้",
                      icon: "trash",
                      danger: true,
                      onClick: async () => {
                        if (
                          !confirm(
                            `ลบรายการนี้? (${p.labelTh} · ${p.points > 0 ? "+" : ""}${p.points} แต้ม)\n` +
                              `ระบบจะปรับยอดแต้มคงเหลือย้อนกลับให้อัตโนมัติ` +
                              (p.points < 0
                                ? "\n\n⚠️ ถ้ารายการนี้เคยออกคูปองส่วนลดไปแล้ว การลบนี้ไม่ยกเลิกคูปองให้ — ไปเช็ค/ยกเลิกคูปองแยกต่างหากถ้าจำเป็น"
                                : "")
                          )
                        )
                          return;
                        const res = await fetch("/api/points", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "delete_history", entryId: p.id }),
                        });
                        if (res.ok) {
                          toast("ลบประวัติแต้มแล้ว", "success");
                          open(c.id);
                        } else {
                          toast("ลบไม่สำเร็จ", "error");
                        }
                    },
                    },
                  ]}
                />
              </li>
            ))}
            {!selected.history.points.length && <li className="px-3 py-3 text-brown-faint">ยังไม่มีประวัติแต้ม</li>}
          </ul>
        </section>

        {/* ฟอร์มที่ไม่ได้ใช้ทุกครั้ง — อยู่ท้ายหน้า พับไว้ก่อน แตะหัวการ์ดเพื่อเปิด */}
        <div className="mt-6">
          <SectionLabel>Add &amp; sell · เพิ่มแต้ม / ขายคอร์ส / เติมเครดิต</SectionLabel>
          <div ref={setToolsSlot} />
          <MemberTopupSection
            customerId={c.id}
            memberCredit={c.memberCredit}
            onDone={() => open(c.id)}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Customers · ลูกค้า</p>
          <h1 className="text-xl font-extrabold text-petflow-chocolate">ลูกค้า</h1>
        </div>
        <MoreMenu
          items={[
            {
              label: showTools ? "ซ่อน QR ลงทะเบียน / Export" : "QR ลงทะเบียน / Export",
              icon: "download",
              onClick: () => setShowTools((v) => !v),
            },
          ]}
        />
      </div>
      <AddCustomerModal
        onAdded={(id) => {
          search(q);
          open(id);
        }}
      />

      <SearchField
        value={q}
        onChange={setQ}
        placeholder={`ค้นหาชื่อลูกค้า / ${pw.th} / เบอร์`}
        className="mb-3"
      />

      {/* ตัวกรอง — กลุ่มลูกค้า / สถานะ LINE / เรียงลำดับ */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value as CustomerTier | "all")}
          aria-label="กลุ่มลูกค้า"
          className="h-10 min-w-0 rounded-full border border-petflow-line bg-card px-3 text-xs font-bold text-brown"
        >
          <option value="all">ทุกกลุ่ม</option>
          {(Object.keys(TIER_LABELS) as CustomerTier[]).map((t) => (
            <option key={t} value={t}>
              {TIER_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          value={lineFilter}
          onChange={(e) => setLineFilter(e.target.value as "all" | "linked" | "unlinked")}
          aria-label="สถานะ LINE"
          className="h-10 min-w-0 rounded-full border border-petflow-line bg-card px-3 text-xs font-bold text-brown"
        >
          <option value="all">ทุกสถานะ LINE</option>
          <option value="linked">ผูก LINE แล้ว</option>
          <option value="unlinked">ยังไม่ผูก LINE</option>
        </select>
        <div className="col-span-2 flex gap-2">
          <select
            value={sortKey}
            onChange={(e) => {
              const opt = SORT_OPTIONS.find((o) => o.key === e.target.value);
              setSortKey(e.target.value as SortKey);
              if (opt) setSortDir(opt.defaultDir);
            }}
            aria-label="เรียงลำดับ"
            className="h-10 min-w-0 rounded-full border border-petflow-line bg-card px-3 text-xs font-bold text-brown flex-1"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                เรียง: {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="flex h-10 shrink-0 items-center gap-1 rounded-full border border-petflow-line bg-card px-3 text-xs font-bold text-brown-soft"
            title="สลับทิศทางการเรียง"
            aria-label={sortDir === "asc" ? "น้อย→มาก / ก→ฮ" : "มาก→น้อย / ฮ→ก"}
          >
            <span className="text-sm leading-none">{sortDir === "asc" ? "↑" : "↓"}</span>
            {sortDir === "asc" ? "ก→ฮ" : "ฮ→ก"}
          </button>
        </div>
      </div>

      {showTools && (
        <div className="mb-4">
          <RegistrationQrSection compact />
          <ExportSheetsButton className="mt-3" />
        </div>
      )}

      {loading ? (
        <p className="py-6 text-center text-sm text-brown-soft">กำลังโหลด…</p>
      ) : (
        <>
          <div className="mb-2 flex min-h-[32px] items-center justify-between gap-2 px-1">
            <p className="text-[11px] font-bold text-brown-faint">
              {visibleList.length} ราย
              {visibleList.length !== list.length ? ` (จากทั้งหมด ${list.length})` : ""}
            </p>
            {(tierFilter !== "all" || lineFilter !== "all" || q) && (
              <button
                type="button"
                onClick={resetFilters}
                className="flex min-h-[32px] items-center gap-1 text-[11px] font-bold text-latte-deep"
              >
                <Icon name="x" size={12} />
                ล้างตัวกรอง
              </button>
            )}
          </div>

          {/* ── ตาราง (จอกว้าง) — คลิกหัวคอลัมน์เพื่อเรียง ── */}
          <div className="mb-4 hidden overflow-x-auto rounded-petflow border border-petflow-line bg-card shadow-petflow-sm md:block">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead>
                <tr className="border-b border-petflow-line bg-paper/60 text-[10px] font-extrabold uppercase tracking-wide text-brown-soft">
                  <SortableTh label="ลูกค้า" sortKey="name" active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortableTh label={pw.th} sortKey="catName" active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortableTh label="LINE" sortKey="line" active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortableTh label="เบอร์โทร" sortKey="phone" active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortableTh label="วันเกิด" sortKey="birthday" active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortableTh label="กลุ่ม" sortKey="tier" active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortableTh label="แต้ม" sortKey="points" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                  <SortableTh label="เครดิต" sortKey="credit" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                  <SortableTh label="นัด" sortKey="upcoming" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                  <SortableTh label="สมัคร" sortKey="recent" active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {visibleList.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => open(c.id)}
                    className="cursor-pointer border-b border-petflow-line last:border-0 transition hover:bg-paper/50"
                  >
                    <td className="px-3 py-2.5 font-bold text-brown">
                      {c.name}
                      {c.isMember && <Icon name="star" size={13} className="ml-1 inline align-[-2px] text-latte-deep" />}
                      {c.lineDisplayName && c.lineDisplayName !== c.name && (
                        <span className="block text-[10px] font-normal text-brown-faint">
                          LINE: {c.lineDisplayName}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-brown-soft">
                      {c.cats.map((x) => x.name).filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {c.lineUserId ? (
                        <span className="rounded-full bg-ok/15 px-2 py-0.5 text-[10px] font-bold text-ok">
                          ผูกแล้ว
                        </span>
                      ) : (
                        <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-bold text-brown-faint">
                          ยังไม่ผูก
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-brown-soft">{c.phone || "—"}</td>
                    <td className="px-3 py-2.5 text-brown-soft">{c.birthday || "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tierBadgeClass(c.tier || "new")}`}>
                        {TIER_LABELS[c.tier || "new"]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-latte-deep">
                      {c.points || 0}
                    </td>
                    <td className="px-3 py-2.5 text-right text-brown-soft">
                      {c.memberCredit ? `${c.memberCredit.toLocaleString()}฿` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-brown-soft">
                      {c.upcomingAppointments ? (
                        <span className="inline-flex items-center gap-1">
                          <Icon name="calendar" size={12} />
                          {c.upcomingAppointments}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-brown-soft">
                      {c.createdAt ? c.createdAt.slice(0, 10) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        aria-label="ลบลูกค้า"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteCustomerRow(c);
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-brown-faint transition hover:bg-paper hover:text-wait"
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {visibleList.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-3 py-6 text-center text-brown-soft">
                      ไม่พบลูกค้า
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── รายการ (มือถือ) — แตะเพื่อเปิดโปรไฟล์ · ลบลูกค้าได้จากเมนู ⋯ ในโปรไฟล์ ── */}
          <ul className="divide-y divide-petflow-line overflow-hidden rounded-petflow border border-petflow-line bg-card shadow-petflow-sm md:hidden">
            {visibleList.map((c) => {
              const photo = c.cats.find((x) => x.photoDataUrl)?.photoDataUrl;
              const catNames = c.cats.map((x) => x.name).filter(Boolean).join(", ");
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => open(c.id)}
                    className="flex min-h-[60px] w-full items-center gap-3 px-3 py-2.5 text-left transition active:bg-paper/60"
                  >
                    {photo ? (
                      <Image
                        src={photo}
                        alt=""
                        width={40}
                        height={40}
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <Avatar name={c.name} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-petflow-chocolate">{c.name}</span>
                        {c.lineUserId && (
                          <span className="shrink-0 rounded-full bg-ok/15 px-1.5 py-px text-[9px] font-bold text-ok">
                            LINE
                          </span>
                        )}
                        {c.isMember && <Icon name="star" size={13} className="text-latte-deep" />}
                      </span>
                      <span className="block truncate text-[11px] text-brown-soft">
                        {[c.phone, catNames || "ยังไม่มีน้องในระบบ"].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${tierBadgeClass(c.tier || "new")}`}>
                        {TIER_LABELS[c.tier || "new"]}
                      </span>
                      {((c.upcomingAppointments ?? 0) > 0 || c.memberCredit > 0) && (
                        <span className="flex items-center gap-1.5 text-[10px] font-bold">
                          {(c.upcomingAppointments ?? 0) > 0 && (
                            <span className="flex items-center gap-0.5 text-latte-deep">
                              <Icon name="calendar" size={11} />
                              {c.upcomingAppointments}
                            </span>
                          )}
                          {c.memberCredit > 0 && <span className="text-ok">{c.memberCredit}฿</span>}
                        </span>
                      )}
                    </span>
                    <Icon name="chevron" size={16} className="text-brown-faint" />
                  </button>
                </li>
              );
            })}
            {visibleList.length === 0 && (
              <li>
                <EmptyState icon="users" title="ไม่พบลูกค้า" sub="ลองเปลี่ยนคำค้นหรือล้างตัวกรอง" />
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

function SortableTh({
  label,
  sortKey,
  active,
  dir,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  align?: "right";
}) {
  const isActive = active === sortKey;
  return (
    <th className={`px-3 py-2.5 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-0.5 ${isActive ? "text-petflow-chocolate" : "text-brown-soft"}`}
      >
        {label}
        <span className="text-[9px]">{isActive ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}
