"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { RoomType } from "@/lib/business";
import type { CustomerRecord } from "@/lib/customers-store";
import {
  GROOM_PROGRAMS,
  bathPrograms,
  resolveGroomPrograms,
  resolveMassagePrograms,
  type GroomProgram,
} from "@/lib/grooming-prices";
import { CustomerSendButtons } from "@/components/CustomerSendButtons";
import { CustomerIntakeCards } from "@/components/CustomerIntakeCards";
import { savedPopup, toast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { TransportPicker } from "@/components/TransportPicker";
import { RoomMovesEditor } from "@/components/RoomMovesEditor";
import type { RoomSegment } from "@/lib/room-segments";
import { PastPricesHint } from "@/components/PastPrices";
import { pastPriceList, type PastInvoice, type PastPrice } from "@/lib/special-price";
import type { BookingTransport } from "@/lib/transport";
import { Avatar, SearchField, Segmented } from "@/components/ui";
import { useConfig, usePetWords } from "@/components/ConfigProvider";
import { petWords } from "@/lib/pet-kind";
import { isFeatureOn } from "@/lib/features";
import { GroomClashNote, confirmClashes, useGroomClashes } from "@/components/GroomClashNote";
import { PetProgramSelect } from "@/components/GroomProgramPicker";
import { UNKNOWN_CAT, isUnknownCat } from "@/lib/unknown-cat";
import { dayCarePrice } from "@/lib/day-care";
import {
  typeAvailability,
  attachClosures,
  type RoomClosure,
  compositionOf,
  roomCapacity,
  freeUnitsForRange,
  turnoverUnitsForRange,
  turnoverLabel,
  type BoardBooking,
} from "@/lib/room-board";

type CustomerListItem = CustomerRecord & { upcomingAppointments?: number };

const FREEBIE_OPTIONS = ["กล้องวงจรปิด (CCTV)", "รับ-ส่ง", "ขนม/ทรีท"];


type GroomSlot = { time: string; capacity: number; booked: number; remaining: number; endTime?: string };

/**
 * 1 แมว = 1 คิว — เรียงแมวลงสล็อตตั้งแต่เวลาที่เลือก เต็มแล้วไหลไปสล็อตถัดไป
 * (หลักเดียวกับ assignGroomSlots ใน src/lib/availability.ts ที่ลูกค้าจองเอง)
 * หลังบ้านต้องจองได้เสมอ: ตัวที่หาที่ว่างไม่ได้จะลงเวลาที่เลือกไว้ แล้วขึ้นเตือนว่าเกินคิว
 */
function spreadCatsOverSlots(slots: GroomSlot[], startTime: string, count: number): string[] {
  const out: string[] = [];
  const startIdx = slots.findIndex((sl) => sl.time === startTime);
  if (startIdx !== -1) {
    for (let i = startIdx; i < slots.length && out.length < count; i++) {
      for (let n = slots[i].remaining; n > 0 && out.length < count; n--) out.push(slots[i].time);
    }
  }
  while (out.length < count) out.push(startTime);
  return out;
}

/**
 * เลือกลูกค้า + น้องแมว แบบแอปจองคิวทั่วไป (Fresha / Booksy / แอปโรงแรมสัตว์เลี้ยง)
 * 1) ค้นหา → แตะแถวลูกค้า → กลายเป็นการ์ดลูกค้าที่เลือกแล้ว (กด "เปลี่ยน" ได้)
 * 2) น้องแมวของลูกค้าขึ้นเป็นชิปให้แตะเลือก/ยกเลิกได้ทันที ไม่ต้องกดยืนยันซ้ำ
 * ไม่เจอในระบบ → แตะ "ลูกค้าใหม่" ใช้ชื่อที่พิมพ์ แล้วพิมพ์ชื่อน้องเองได้
 */
function ClientPetPicker({
  picked,
  customerName,
  catNames,
  catInput,
  setCatInput,
  onPickCustomer,
  onNewCustomer,
  onClearCustomer,
  onToggleCat,
  onAddTyped,
  onSetUnknownCount,
  onRemoveCat,
  onSelectAll,
}: {
  picked: CustomerListItem | null;
  customerName: string;
  catNames: string[];
  catInput: string;
  setCatInput: (v: string) => void;
  onPickCustomer: (c: CustomerListItem) => void;
  onNewCustomer: (name: string) => void;
  onClearCustomer: () => void;
  onToggleCat: (name: string) => void;
  onAddTyped: () => void;
  onSetUnknownCount: (n: number) => void;
  onRemoveCat: (name: string) => void;
  onSelectAll: (names: string[]) => void;
}) {
  const pw = usePetWords();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CustomerListItem[]>([]);
  const [recent, setRecent] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [recentLoaded, setRecentLoaded] = useState(false);

  // ลูกค้าล่าสุดโหลดไว้ก่อน — เปิดหน้ามาก็แตะเลือกได้เลยโดยไม่ต้องพิมพ์
  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d) => {
        const sorted = [...((d.customers || []) as CustomerListItem[])].sort(
          (a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")
        );
        setRecent(sorted.slice(0, 8));
      })
      .catch(() => {})
      .finally(() => setRecentLoaded(true));
  }, []);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let alive = true;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(query)}`).catch(() => null);
      const data = res ? await res.json().catch(() => ({})) : {};
      if (!alive) return;
      setResults((data.customers || []).slice(0, 20));
      setLoading(false);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const hasCustomer = !!picked || !!customerName.trim();
  const list = q.trim() ? results : recent;
  const knownCats = picked?.cats.map((c) => c.name) ?? [];
  const unknownCount = catNames.filter(isUnknownCat).length;
  const extraCats = catNames.filter((n) => !knownCats.includes(n) && !isUnknownCat(n));

  const pick = (c: CustomerListItem) => {
    onPickCustomer(c);
    setQ("");
  };

  return (
    <div className="space-y-5">
      {/* ── 1. ลูกค้า ── */}
      <section>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">
          Customer · ลูกค้า
        </p>
        {hasCustomer ? (
          <div className="flex items-center gap-3 rounded-petflow-sm border border-honey/60 bg-honey/10 px-3 py-3">
            <Avatar name={picked?.name || customerName} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-petflow-chocolate">
                {picked?.name || customerName}
              </p>
              <p className="truncate text-[11px] text-brown-soft">
                {picked
                  ? [picked.phone, picked.lineUserId ? "LINE ✓" : "ยังไม่ผูก LINE"]
                      .filter(Boolean)
                      .join(" · ")
                  : "ลูกค้าใหม่ (ยังไม่มีในระบบ)"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClearCustomer}
              className="shrink-0 rounded-full bg-card px-3 py-1.5 text-xs font-bold text-latte-deep shadow-petflow-sm"
            >
              เปลี่ยน
            </button>
          </div>
        ) : (
          <>
            <SearchField value={q} onChange={setQ} placeholder={`ค้นหาชื่อ เบอร์ หรือชื่อน้อง${pw.th}`} />

            <p className="mb-1 mt-3 px-1 text-[11px] font-bold text-brown-soft">
              {q.trim() ? (loading ? "กำลังค้นหา…" : `ผลการค้นหา ${results.length} ราย`) : "ลูกค้าล่าสุด"}
            </p>
            <ul className="max-h-80 divide-y divide-petflow-line overflow-y-auto rounded-petflow-sm border border-petflow-line bg-card">
              {list.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => pick(c)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-paper"
                  >
                    <Avatar name={c.name} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-petflow-chocolate">{c.name}</span>
                        {c.lineUserId && (
                          <span className="shrink-0 rounded-full bg-ok/15 px-1.5 py-px text-[9px] font-bold text-ok">
                            LINE
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-brown-soft">
                        {[c.phone, c.cats.length ? c.cats.map((cat) => cat.name).join(", ") : "ยังไม่มีน้องในระบบ"]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <Icon name="chevron" size={16} className="text-brown-faint" />
                  </button>
                </li>
              ))}
              {q.trim() && !loading && (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      onNewCustomer(q.trim());
                      setQ("");
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-latte-deep text-latte-deep">
                      <Icon name="plus" size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-latte-deep">
                        ลูกค้าใหม่ “{q.trim()}”
                      </span>
                      <span className="block text-[11px] text-brown-soft">
                        ยังไม่มีในระบบ ใส่ข้อมูลเพิ่มทีหลังได้
                      </span>
                    </span>
                  </button>
                </li>
              )}
              {!q.trim() && list.length === 0 && (
                <li className="px-3 py-4 text-center text-xs text-brown-faint">
                  {recentLoaded ? "พิมพ์ค้นหาด้านบน หรือพิมพ์ชื่อลูกค้าใหม่ได้เลย" : "กำลังโหลด…"}
                </li>
              )}
            </ul>
          </>
        )}
      </section>

      {/* ── 2. น้องแมว ── */}
      <section>
        <div className="mb-2 flex items-end justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">
            {`${pw.enPlural[0].toUpperCase()}${pw.enPlural.slice(1)} · น้อง${pw.th}ที่มา *`}
          </p>
          {knownCats.length > 1 && knownCats.some((n) => !catNames.includes(n)) && (
            <button
              type="button"
              onClick={() => onSelectAll(knownCats)}
              className="text-xs font-bold text-latte-deep"
            >
              เลือกทั้งบ้าน ({knownCats.length})
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {knownCats.map((name) => {
            const on = catNames.includes(name);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                onClick={() => onToggleCat(name)}
                className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-bold transition ${
                  on
                    ? "border-petflow-chocolate bg-petflow-chocolate text-card"
                    : "border-petflow-line bg-card text-brown"
                }`}
              >
                {on ? <Icon name="check" size={15} strokeWidth={2.4} /> : <Icon name="paw" size={15} />}
                {name}
              </button>
            );
          })}
          {extraCats.map((name) => (
            <span
              key={name}
              className="flex items-center gap-1.5 rounded-full border border-petflow-chocolate bg-petflow-chocolate py-2 pl-3.5 pr-2 text-sm font-bold text-card"
            >
              <Icon name="check" size={15} strokeWidth={2.4} />
              {name}
              <button
                type="button"
                onClick={() => onRemoveCat(name)}
                aria-label={`เอา ${name} ออก`}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-card/20 text-[10px]"
              >
                ✕
              </button>
            </span>
          ))}
          {typing ? (
            <span className="flex items-center gap-1 rounded-full border border-honey-deep bg-card py-1 pl-3 pr-1">
              <input
                autoFocus
                value={catInput}
                onChange={(e) => setCatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onAddTyped();
                  }
                  if (e.key === "Escape") setTyping(false);
                }}
                placeholder="ชื่อน้อง"
                className="w-24 !border-0 !bg-transparent p-0 text-sm !shadow-none !outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  onAddTyped();
                  setTyping(false);
                }}
                disabled={!catInput.trim()}
                className="rounded-full bg-petflow-chocolate px-3 py-1 text-xs font-bold text-card disabled:opacity-40"
              >
                เพิ่ม
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setTyping(true)}
              className="flex items-center gap-1 rounded-full border border-dashed border-latte-deep px-3.5 py-2 text-sm font-bold text-latte-deep"
            >
              <Icon name="plus" size={15} />
              {knownCats.length ? "น้องตัวใหม่" : "พิมพ์ชื่อน้อง"}
            </button>
          )}
          {unknownCount === 0 && (
            <button
              type="button"
              onClick={() => onSetUnknownCount(1)}
              className="rounded-full border border-dashed border-petflow-line px-3.5 py-2 text-sm font-bold text-brown-soft"
            >
              ยังไม่ทราบชื่อ
            </button>
          )}
        </div>
        {/* ยังไม่รู้ว่าตัวไหนมา แต่ต้องรู้จำนวน — ระบบล็อกคิวทีละตัว จำนวนจึงต้องตรงกับที่จะมาจริง */}
        {unknownCount > 0 && (
          <div className="mt-3 flex items-center gap-3 rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-brown-soft">
              <Icon name="paw" size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-petflow-chocolate">ยังไม่ทราบชื่อ</p>
              <p className="text-[11px] text-brown-soft">มากี่ตัว — ล็อกคิวตามจำนวนนี้ ใส่ชื่อทีหลังได้</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={unknownCount === 1 ? "เอาออก" : "ลดจำนวน"}
                onClick={() => onSetUnknownCount(unknownCount - 1)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-petflow-chocolate shadow-petflow-sm"
              >
                {unknownCount === 1 ? <Icon name="x" size={16} /> : <span className="text-lg font-bold leading-none">−</span>}
              </button>
              <span className="w-8 text-center text-lg font-extrabold text-petflow-chocolate">{unknownCount}</span>
              <button
                type="button"
                aria-label="เพิ่มจำนวน"
                onClick={() => onSetUnknownCount(unknownCount + 1)}
                disabled={unknownCount >= 10}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-petflow-chocolate text-card disabled:opacity-40"
              >
                <Icon name="plus" size={16} strokeWidth={2.4} />
              </button>
            </div>
          </div>
        )}
        <p className="mt-2 text-[11px] text-brown-faint">
          {catNames.length > 0
            ? `รวม ${catNames.length} ตัว · ล็อกคิว ${catNames.length} ที่ · ระบบสร้างนัดให้ทีละตัวและผูกเป็นบ้านเดียวกัน`
            : "แตะชื่อน้องเพื่อเลือก เลือกได้หลายตัว · ไม่รู้ว่าตัวไหนมา กด “ยังไม่ทราบชื่อ”"}
        </p>
      </section>
    </div>
  );
}

/** แผง "จองแล้ว" + ปุ่มออกบิลเลย อยู่บนสุดของหน้า → เลื่อนขึ้นบนสุดแบบนุ่ม ๆ */
function scrollToSavedPanel() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export default function NewBookingPage() {
  const searchParams = useSearchParams();
  const presetDate = searchParams.get("date") || "";
  // แท็บที่เลือก — นวดบันทึกเป็นนัดแบบ groom (คิวแยก) ที่เลือกโปรแกรมนวด
  const [tab, setTab] = useState<"groom" | "room" | "massage">("groom");
  const service: "groom" | "room" = tab === "room" ? "room" : "groom";
  const massage = tab === "massage";
  // ร้านที่ปิดอาบน้ำหรือรับฝากไว้ในตั้งค่า — เหลือแค่บริการที่เปิด
  const { config: siteConfig } = useConfig();
  const pw = petWords(siteConfig);
  const groomOn = isFeatureOn(siteConfig, "grooming");
  const hotelOn = isFeatureOn(siteConfig, "hotel");
  const massageOn = isFeatureOn(siteConfig, "massage");
  const tabOn = { groom: groomOn, room: hotelOn, massage: massageOn };
  useEffect(() => {
    if (tabOn[tab]) return;
    const next = (["groom", "room", "massage"] as const).find((t) => tabOn[t]);
    if (next) setTab(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, groomOn, hotelOn, massageOn]);
  const [saved, setSaved] = useState(false);
  const [lastBookings, setLastBookings] = useState<
    {
      id: string;
      customerId?: string;
      lineUserId?: string;
      service: "groom" | "room";
      catName: string;
    }[]
  >([]);
  const [rooms, setRooms] = useState<RoomType[]>([]);
  const [groomSlots, setGroomSlots] = useState<string[]>(["09:30", "12:30", "15:30"]);
  const [groomPrograms, setGroomPrograms] = useState<GroomProgram[]>(bathPrograms(GROOM_PROGRAMS));
  const [massagePrograms, setMassagePrograms] = useState<GroomProgram[]>(resolveMassagePrograms());
  /** โปรแกรมของแท็บที่เลือก (อาบน้ำ หรือ นวด) */
  const tabPrograms = massage ? massagePrograms : groomPrograms;
  const [freebies_, setFreebies_] = useState<string[]>(FREEBIE_OPTIONS);
  const [customerId, setCustomerId] = useState("");
  const [pickedCustomer, setPickedCustomer] = useState<CustomerListItem | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [catNames, setCatNames] = useState<string[]>([]);
  const [catInput, setCatInput] = useState("");
  const [lineUserId, setLineUserId] = useState("");
  const [freebies, setFreebies] = useState<string[]>([]);
  const [groomProgram, setGroomProgram] = useState("");
  // แต่ละตัวอาบคนละโปรแกรมได้ — ค่าที่แก้รายตัว (ตามชื่อน้อง) ทับโปรแกรมรวมด้านบน
  const [petPrograms, setPetPrograms] = useState<Record<string, string>>({});
  const [appointmentDate, setAppointmentDate] = useState(presetDate);
  /** Day Care = ฝากรายวัน ไม่ค้างคืน — วันออก = วันเข้า คิดครึ่งราคาห้อง */
  const [dayCare, setDayCare] = useState(false);
  const [checkoutDate, setCheckoutDate] = useState(() => {
    if (!presetDate) return "";
    const d = new Date(`${presetDate}T12:00:00`);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });

  // ราคาที่ลูกค้าคนนี้เคยจ่าย — บอกราคาเดิมตอนรับจองได้เลย ไม่ต้องไปเปิดบิลเก่า
  const [pastPrices, setPastPrices] = useState<PastPrice[]>([]);
  useEffect(() => {
    setPastPrices([]);
    if (!customerId) return;
    let cancelled = false;
    fetch(`/api/invoices?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => (r.ok ? r.json() : { invoices: [] }))
      .then((d: { invoices?: PastInvoice[] }) => {
        if (!cancelled) setPastPrices(pastPriceList(d.invoices || [], customerId));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  useEffect(() => {
    const d = searchParams.get("date");
    if (!d) return;
    setAppointmentDate(d);
    const out = new Date(`${d}T12:00:00`);
    out.setDate(out.getDate() + 1);
    setCheckoutDate(out.toISOString().slice(0, 10));
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        if (d.config?.rooms) setRooms(attachClosures(d.config.rooms as RoomType[], d.config.roomClosures));
        if (d.config?.groomSlots) setGroomSlots(d.config.groomSlots);
        if (d.config?.options?.freebies?.length) setFreebies_(d.config.options.freebies);
        setGroomPrograms(bathPrograms(resolveGroomPrograms(d.config?.groomPricePrograms)));
        setMassagePrograms(resolveMassagePrograms(d.config?.groomPricePrograms));
      });
  }, []);

  // นัดที่มีอยู่ — ใช้คำนวณว่าห้องแต่ละแบบเหลือจริงกี่ห้องในช่วงวันที่เลือก
  const [existing, setExisting] = useState<BoardBooking[]>([]);
  useEffect(() => {
    fetch("/api/bookings")
      .then((r) => r.json())
      .then((d) => setExisting(d.bookings || []))
      .catch(() => {
        /* ดูที่ว่างไม่ได้ก็ยังจองได้ตามปกติ แค่ไม่มีตัวช่วย */
      });
  }, []);

  /** เข้าพัก + อาบน้ำด้วย — บันทึกแล้วสร้างนัดอาบน้ำให้อีกนัด (ตั้งต้น = วันออก) */
  const [alsoGroom, setAlsoGroom] = useState(false);
  const [addGroomDate, setAddGroomDate] = useState("");
  const [addGroomTime, setAddGroomTime] = useState("12:30");
  const [addGroomProgram, setAddGroomProgram] = useState("");
  const [addPetPrograms, setAddPetPrograms] = useState<Record<string, string>>({});
  const withGroom = service === "room" && alsoGroom && groomOn;
  const clashes = useGroomClashes(withGroom ? addGroomDate : "", addGroomTime);
  /** นัดอาบน้ำก่อนกลับที่เพิ่งบันทึกไปพร้อมการเข้าพัก — โชว์ในแผงจองสำเร็จ */
  const [lastBath, setLastBath] = useState<{ date: string; time: string } | null>(null);
  // วันอาบน้ำตั้งต้นเป็นวันออก (อาบก่อนกลับบ้าน) — เลื่อนวันเข้า/ออกแล้วตามไปด้วยจนกว่าจะแก้เอง
  const [groomDateTouched, setGroomDateTouched] = useState(false);
  /** วันออกที่ใช้คิดห้องว่าง — Day Care ใช้ห้องแค่วันเดียว */
  const stayOut = dayCare ? appointmentDate : checkoutDate || appointmentDate;
  useEffect(() => {
    if (!groomDateTouched) setAddGroomDate(stayOut);
  }, [stayOut, groomDateTouched]);

  const [roomId, setRoomId] = useState("");
  // ห้องจริงที่ปักหมุด (เลขห้อง) — เฉพาะห้องเดี่ยว ไม่ใช่ห้องเชื่อม (ห้องเชื่อมจัดให้อัตโนมัติเหมือนเดิม)
  const [roomUnit, setRoomUnit] = useState<number | null>(null);
  // ย้ายห้องกลางทาง — ห้องแรก (roomId) ใช้ถึงวันย้ายครั้งแรก
  const [roomMoves, setRoomMoves] = useState<RoomSegment[]>([]);
  const liveMoves = useMemo(
    () =>
      service === "room" && !dayCare
        ? roomMoves.filter((m) => m.room && m.from > appointmentDate && m.from < stayOut)
        : [],
    [roomMoves, service, dayCare, appointmentDate, stayOut]
  );
  /** วันที่ออกจากห้องแรก (ย้ายห้อง = วันย้ายครั้งแรก) */
  const room1Out = liveMoves[0]?.from || stayOut;
  const [transport, setTransport] = useState<BookingTransport>({});

  // คิวอาบน้ำ: นับ 1 แมว = 1 คิว เหมือนฝั่งลูกค้าจองเอง หลายตัวจะไม่ไปกองอยู่เวลาเดียวกัน
  const [groomAvail, setGroomAvail] = useState<GroomSlot[]>([]);
  const [groomStart, setGroomStart] = useState("12:30");
  const [catTimes, setCatTimes] = useState<string[]>([]);
  const [availTick, setAvailTick] = useState(0);
  // ร้านเปิดโหมดคิดเวลาตามจำนวนแมว = ทั้งบ้านเริ่มพร้อมกัน แล้วกันคิวทั้งช่วงที่ใช้
  const [groomMode, setGroomMode] = useState<"together" | "per_cat">("per_cat");
  const bookingCats = catNames.length > 0 ? catNames : catInput.trim() ? [catInput.trim()] : [];
  const catKey = bookingCats.join("\u0000");
  useEffect(() => {
    if (service !== "groom" || !appointmentDate) {
      setGroomAvail([]);
      return;
    }
    let alive = true;
    fetch(
      `/api/bookings/availability?service=${massage ? "massage" : "groom"}&date=${appointmentDate}&cats=${Math.max(1, bookingCats.length)}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setGroomAvail(d.slots || []);
        setGroomMode(d.mode === "together" ? "together" : "per_cat");
      })
      .catch(() => alive && setGroomAvail([]));
    return () => {
      alive = false;
    };
  }, [service, massage, appointmentDate, availTick, bookingCats.length]);
  useEffect(() => {
    setCatTimes(
      groomMode === "together"
        ? bookingCats.map(() => groomStart)
        : spreadCatsOverSlots(groomAvail, groomStart, bookingCats.length)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groomAvail, groomStart, catKey, groomMode]);
  /** รอบที่จะเกินคิวถ้าบันทึกตามนี้ — เตือนแต่ยังให้บันทึกได้ (หน้างานบางทีรับเพิ่มไหว) */
  const overSlots = useMemo(() => {
    if (groomMode === "together") {
      // โหมดคิดเวลา: เช็คทั้งช่วงที่บ้านนี้ใช้ (เซิร์ฟเวอร์คำนวณ remaining ตามจำนวนตัวให้แล้ว)
      const sl = groomAvail.find((x) => x.time === groomStart);
      return sl && sl.remaining <= 0
        ? [{ time: `${sl.time}–${sl.endTime || ""}`, total: sl.booked + 1, capacity: sl.capacity }]
        : [];
    }
    const add = new Map<string, number>();
    for (const t of catTimes) if (t) add.set(t, (add.get(t) || 0) + 1);
    const out: { time: string; total: number; capacity: number }[] = [];
    for (const [time, n] of add) {
      const sl = groomAvail.find((x) => x.time === time);
      if (!sl) continue;
      const room = sl.remaining > 0 ? sl.remaining : 0;
      if (n > room) out.push({ time, total: sl.booked + n, capacity: sl.capacity });
    }
    return out;
  }, [catTimes, groomAvail, groomMode, groomStart]);
  const boardRooms = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    count: r.count || 0,
    maxCats: roomCapacity(r),
    composedOf: r.composedOf,
    closures: (r as RoomType & { closures?: RoomClosure[] }).closures,
  }));
  /** ห้องแต่ละแบบว่างกี่ห้องตลอดช่วงที่ขอ (ติดคืนไหนบอกคืนนั้น) */
  const availability = useMemo(() => {
    if (service !== "room" || !appointmentDate || rooms.length === 0) return {};
    const out: Record<string, { free: number; total: number; tightestDate: string }> = {};
    for (const r of rooms) {
      // ห้องเชื่อมไม่มียูนิตของตัวเอง แต่คิดที่ว่างได้จากห้องจริงที่ใช้ประกอบ
      // (Mini Duo = MiNi Meow 2 ห้อง) — ประเภทที่ไม่มีทั้งห้องจริงและสูตรประกอบ ข้ามไป
      if (!r.count && !compositionOf(r.id, boardRooms)) continue;
      out[r.id] = typeAvailability(
        boardRooms,
        existing,
        r.id,
        appointmentDate,
        room1Out
      );
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, appointmentDate, room1Out, rooms, existing]);

  // ห้องที่เลือกไว้เต็มไปแล้ว (เช่นเพิ่งเปลี่ยนวัน) → เด้งไปห้องที่ยังว่าง
  useEffect(() => {
    if (service !== "room" || rooms.length === 0) return;
    const cur = availability[roomId];
    // ห้องเชื่อมไม่มีข้อมูลที่ว่าง (ไม่อยู่ใน availability) — เลือกไว้แล้วก็ปล่อยไว้
    if (roomId && (!cur || cur.free > 0)) return;
    const firstFree = rooms.find((r) => (availability[r.id]?.free ?? 0) > 0);
    if (firstFree && firstFree.id !== roomId) setRoomId(firstFree.id);
    else if (!roomId && rooms[0]) setRoomId(rooms[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability, service, rooms]);

  /** เลขห้องจริงของประเภทที่เลือกที่ว่างตลอดช่วง — เฉพาะห้องเดี่ยว (ห้องเชื่อมไม่มีเลขห้อง) */
  const freeUnits = useMemo(() => {
    if (service !== "room" || !roomId || !appointmentDate || rooms.length === 0) return [];
    if (compositionOf(roomId, boardRooms)) return [];
    return freeUnitsForRange(
      boardRooms,
      existing,
      roomId,
      appointmentDate,
      room1Out
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, roomId, appointmentDate, room1Out, rooms, existing]);

  // เปลี่ยนห้อง/วัน แล้วเลขที่เคยเลือกไว้ไม่ว่างแล้ว → เคลียร์ทิ้ง (ให้ระบบเดาเองแทน)
  useEffect(() => {
    if (roomUnit != null && !freeUnits.includes(roomUnit)) setRoomUnit(null);
  }, [freeUnits, roomUnit]);

  // ห้องที่ 2 ของการจองเดียวกัน — แยกน้องบางตัวไปอีกห้อง (บิลยังรวมใบเดียวเพราะเป็นบ้าน/ช่วงวันเดียวกัน)
  const [room2Id, setRoom2Id] = useState("");
  const [room2Unit, setRoom2Unit] = useState<number | null>(null);
  const [room2Cats, setRoom2Cats] = useState<string[]>([]);
  const free2 = (id: string) => (availability[id]?.free ?? 0) - (id === roomId ? 1 : 0);
  const freeUnits2 = useMemo(() => {
    if (service !== "room" || !room2Id || !appointmentDate || compositionOf(room2Id, boardRooms)) return [];
    return freeUnitsForRange(boardRooms, existing, room2Id, appointmentDate, stayOut).filter(
      (u) => !(room2Id === roomId && u === roomUnit)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, room2Id, roomId, roomUnit, appointmentDate, stayOut, rooms, existing]);
  useEffect(() => {
    if (room2Unit != null && !freeUnits2.includes(room2Unit)) setRoom2Unit(null);
  }, [freeUnits2, room2Unit]);
  // ห้องที่มีบ้านอื่นออกวันที่เข้า / เข้าวันที่ออก — เลือกได้ แต่บอกไว้ว่าต้องรับต่อวันเดียวกัน
  const turnUnits = useMemo(() => {
    if (service !== "room" || !appointmentDate) return { r1: new Map<number, string>(), r2: new Map<number, string>() };
    return {
      r1: roomId ? turnoverUnitsForRange(boardRooms, existing, roomId, appointmentDate, room1Out) : new Map<number, string>(),
      r2: room2Id ? turnoverUnitsForRange(boardRooms, existing, room2Id, appointmentDate, stayOut) : new Map<number, string>(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, roomId, room2Id, appointmentDate, room1Out, stayOut, rooms, existing]);

  const closeRoom2 = () => {
    setRoom2Id("");
    setRoom2Unit(null);
    setRoom2Cats([]);
  };

  const addCatFromInput = () => {
    const name = catInput.trim();
    if (!name || catNames.includes(name)) return;
    setCatNames((prev) => [...prev, name]);
    setCatInput("");
  };

  // ตั้งจำนวนน้องที่ยังไม่รู้ตัว — แต่ละตัวเป็นนัดหนึ่งที่ (ชื่อชั่วคราว แก้ทีหลังในนัดได้)
  const setUnknownCount = (count: number) => {
    setCatNames((prev) => {
      const known = prev.filter((c) => !isUnknownCat(c));
      const n = Math.max(0, Math.min(10, count));
      const placeholders = Array.from({ length: n }, (_, i) =>
        i === 0 ? UNKNOWN_CAT : `${UNKNOWN_CAT} (${i + 1})`
      );
      return [...known, ...placeholders];
    });
  };

  const removeCat = (name: string) => {
    setRoom2Cats((prev) => prev.filter((c) => c !== name));
    setCatNames((prev) => prev.filter((c) => c !== name));
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // เก็บ element ไว้ก่อน — React เคลียร์ currentTarget ทิ้งหลัง await
    // (เมื่อก่อนบรรทัด form.reset() ท้ายฟังก์ชันพังทุกครั้งที่บันทึกสำเร็จ)
    const form = e.currentTarget;
    const fd = new FormData(form);
    const cats = catNames.length > 0 ? catNames : catInput.trim() ? [catInput.trim()] : [];
    if (cats.length === 0) {
      toast(`กรอกชื่อน้อง${pw.th}อย่างน้อย 1 ชื่อ (หรือกด “ยังไม่ทราบชื่อ”)`, "error");
      return;
    }
    if (withGroom && !confirmClashes(clashes)) return;
    if (withGroom && (!addGroomDate || !addGroomTime)) {
      toast("ใส่วันและเวลาอาบน้ำด้วยนะ (หรือปิด “อาบน้ำด้วย”)", "error");
      return;
    }

    const noteBase = String(fd.get("notes") || "").trim();
    const freebieLine = service === "room" && freebies.length
      ? `🎁 ของแถมฟรี: ${freebies.join(", ")}`
      : "";
    const notes = [noteBase, freebieLine].filter(Boolean).join("\n") || undefined;
    const customerNameValue = String(fd.get("customer") || customerName).trim() || undefined;

    const basePayload = {
      customerId: customerId || undefined,
      customerName: customerNameValue,
      lineUserId: lineUserId || undefined,
      service,
      date: service === "groom" ? String(fd.get("date") || "") : undefined,
      time: undefined as string | undefined,
      room: service === "room" ? String(fd.get("room") || "") : undefined,
      roomUnit:
        service === "room" && fd.get("roomUnit")
          ? Number(fd.get("roomUnit")) || undefined
          : undefined,
      checkin: service === "room" ? String(fd.get("checkin") || "") : undefined,
      checkout:
        service !== "room"
          ? undefined
          : dayCare
            ? String(fd.get("checkin") || "")
            : String(fd.get("checkout") || ""),
      notes,
      transport: transport.pickup || transport.dropoff ? transport : undefined,
    };

    const created: {
      id: string;
      customerId?: string;
      lineUserId?: string;
      service: "groom" | "room";
      catName: string;
    }[] = [];
    let failed = 0;

    const twoRooms = service === "room" && !!room2Id;
    if (twoRooms && !cats.some((c) => room2Cats.includes(c))) {
      toast("เลือกน้องที่จะอยู่ห้องที่ 2 ก่อนนะ (แตะชื่อน้องในกล่องห้องที่ 2)", "error");
      return;
    }
    if (twoRooms && cats.every((c) => room2Cats.includes(c))) {
      toast("ห้องที่ 1 ต้องมีน้องอย่างน้อย 1 ตัว", "error");
      return;
    }

    // ประเภทเดียวกันทั้ง 2 ห้อง ถ้าไม่ล็อกเลขห้อง ระบบจัดห้องจะเอาน้องบ้านเดียวกันไว้ห้องเดียวกัน
    // → ล็อกเลขห้องให้ทั้งคู่ (ใช้ที่เลือกไว้ ไม่งั้นหยิบห้องว่างห้องแรก)
    let unit1 = roomUnit;
    let unit2 = room2Unit;
    if (twoRooms && room2Id === roomId && !compositionOf(roomId, boardRooms)) {
      unit1 = unit1 ?? freeUnits.find((u) => u !== unit2) ?? null;
      unit2 = unit2 ?? freeUnits.find((u) => u !== unit1) ?? null;
      if (unit1 == null || unit2 == null || unit1 === unit2) {
        toast("ห้องประเภทนี้ว่างไม่ถึง 2 ห้องในช่วงนี้", "error");
        return;
      }
    }

    for (const [i, cat] of cats.entries()) {
      const time = service === "groom" ? catTimes[i] || groomStart || undefined : undefined;
      const inRoom2 = twoRooms && room2Cats.includes(cat);
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...basePayload,
          ...(inRoom2
            ? { room: room2Id, roomUnit: unit2 ?? undefined }
            : twoRooms
              ? { roomUnit: unit1 ?? undefined }
              : {}),
          time,
          // ย้ายห้องกลางทาง — เฉพาะน้องห้องที่ 1 (ห้องที่ 2 อยู่ห้องเดิมตลอด)
          ...(!inRoom2 && liveMoves.length ? { roomSegments: liveMoves } : {}),
          ...(service === "groom"
            ? {
                // นัดนวดต้องมีโปรแกรมนวดเสมอ (ใช้แยกคิวนวดออกจากอาบน้ำ) — ไม่เลือก = โปรแกรมแรก
                groomProgram:
                  (petPrograms[cat] ?? groomProgram) || (massage ? massagePrograms[0]?.id : undefined) || undefined,
              }
            : {}),
          catName: cat,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.booking?.id) {
          created.push({
            id: data.booking.id,
            customerId: data.customerId,
            lineUserId: lineUserId || undefined,
            service,
            catName: cat,
          });
        }
      } else {
        failed += 1;
      }
    }

    // อาบน้ำด้วย: นัดอาบน้ำของน้องทุกตัวที่จองห้องได้ — ใช้ลูกค้าที่เพิ่งสร้าง/ผูกจากนัดแรก
    // (ไม่ใส่รถรับ-ส่ง/ของแถม/โน้ตซ้ำ — อยู่กับนัดเข้าพักแล้ว)
    if (withGroom && created.length > 0) {
      for (const stay of [...created]) {
        const res = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: created[0].customerId || customerId || undefined,
            customerName: customerNameValue,
            lineUserId: lineUserId || undefined,
            service: "groom",
            date: addGroomDate,
            time: addGroomTime,
            groomProgram: (addPetPrograms[stay.catName] ?? addGroomProgram) || undefined,
            catName: stay.catName,
          }),
        });
        const data = res.ok ? await res.json().catch(() => ({})) : null;
        if (data?.booking?.id) {
          created.push({
            id: data.booking.id,
            customerId: data.customerId,
            lineUserId: lineUserId || undefined,
            service: "groom",
            catName: stay.catName,
          });
        } else {
          failed += 1;
        }
      }
    }

    if (created.length > 0) {
      // ปุ่มบันทึกอยู่ล่างสุด แผง "จองแล้ว" อยู่บนสุด → เด้งป๊อปอัปกลางจอ แล้วเลื่อนขึ้นไปหาแผงทำต่อ
      const savedCats = Array.from(new Set(created.map((x) => x.catName)));
      savedPopup(
        failed > 0 ? `บันทึกแล้ว ${savedCats.length} ตัว` : "บันทึกการจองแล้ว",
        [savedCats.join(", "), "ออกบิล / ส่ง LINE ต่อได้ที่ด้านบน"],
        // กดตกลงแล้วเลื่อนขึ้นไปที่แผง "จองแล้ว" (ปุ่มออกบิลเลย) — เลื่อนตอนป๊อปอัปปิด
        // เพราะ iPhone ตัดการเลื่อนแบบนุ่มทิ้งถ้าเลื่อนตอนหน้ากำลังเปลี่ยน
        { onClose: scrollToSavedPanel }
      );
      // เลื่อนรอบแรกหลังหน้าวาดแผงเสร็จ (เผื่อป๊อปอัปปิดเองตอนไม่ได้มองจอ)
      requestAnimationFrame(() => requestAnimationFrame(scrollToSavedPanel));
      setSaved(true);
      setLastBookings(created);
      setLastBath(
        created.some((x) => x.service === "groom") && created.some((x) => x.service === "room")
          ? { date: addGroomDate, time: addGroomTime }
          : null
      );
      setCustomerId("");
      setPickedCustomer(null);
      setCustomerName("");
      setCatNames([]);
      setCatInput("");
      setLineUserId("");
      setFreebies([]);
      setTransport({});
      setAlsoGroom(false);
      setGroomDateTouched(false);
      setAddGroomProgram("");
      setAddPetPrograms({});
      // ลูกค้า Day Care มีน้อย — จองเสร็จกลับไปที่ "ค้างคืน" เสมอ
      setDayCare(false);
      setRoomUnit(null);
      setGroomProgram("");
      setPetPrograms({});
      setAvailTick((n) => n + 1);
      setRoomUnit(null);
      setRoomMoves([]);
      closeRoom2();
      form.reset();
      setTimeout(() => setSaved(false), 2500);
    }
    if (failed > 0) {
      toast(
        created.length > 0
          ? `บันทึกสำเร็จ ${created.length} ตัว แต่พลาด ${failed} ตัว — ลองใหม่ตัวที่เหลือ`
          : "บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง",
        "error"
      );
    }
  };

  return (
    <div>
      <div className="mb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">New booking</p>
        <h1 className="text-xl font-extrabold text-petflow-chocolate">บันทึกจองให้ลูกค้า</h1>
      </div>

      {/* จองเสร็จแล้ว → ทำต่อได้เลยจากตรงนี้ */}
      {lastBookings.length > 0 && (
        <div className="mb-4 space-y-3 rounded-petflow border border-sage/50 bg-sage/10 p-4 shadow-petflow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ok text-card">
              <Icon name="check" size={22} strokeWidth={2.4} />
            </span>
            <div className="min-w-0 flex-1">
              {/* เข้าพัก + อาบน้ำด้วย = น้องตัวเดียวมีสองนัด → นับตัว ไม่ใช่นับนัด */}
              <p className="text-sm font-extrabold text-ok">
                จองแล้ว {new Set(lastBookings.map((b) => b.catName)).size} ตัว
                {lastBath ? " · เข้าพัก + อาบน้ำ" : ""}
              </p>
              <p className="truncate text-xs text-brown-soft">
                {Array.from(new Set(lastBookings.map((b) => b.catName))).join(", ")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setLastBookings([]);
                setLastBath(null);
              }}
              className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full bg-card px-3.5 text-xs font-bold text-brown shadow-petflow-sm"
            >
              <Icon name="plus" size={16} />
              จองอีกคน
            </button>
          </div>
          {/* จองหลายตัวในครั้งเดียว = บ้านเดียวกัน → บิลเดียว ส่ง LINE ชุดเดียว (การ์ดรวมชื่อทุกตัว)
              เข้าพัก + อาบน้ำก่อนกลับ = นัดเดียวกัน: การ์ดเดียว บิลเดียว (คิวอาบน้ำกันเวลาช่างไว้ข้างหลัง) */}
          {(() => {
            const stays = lastBookings.filter((x) => x.service === "room");
            const list = stays.length > 0 ? stays : lastBookings;
            const b = list[0];
            const many = list.length > 1;
            return (
              <div className="rounded-petflow-sm border border-sage/30 bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-1.5 text-sm font-extrabold text-petflow-chocolate">
                    <Icon name="paw" size={16} className="shrink-0 text-brown-soft" />
                    <span className="truncate">{many ? "ทั้งบ้าน" : b.catName}</span>
                  </p>
                  <Link
                    href={`/admin/billing?bookingId=${b.id}`}
                    className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full bg-petflow-chocolate px-3.5 text-xs font-extrabold text-card"
                  >
                    <Icon name="receipt" size={16} />
                    {many || lastBath ? "ออกบิลรวม" : "ออกบิลเลย"}
                  </Link>
                </div>
                {lastBath && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-brown-soft">
                    <Icon name="bath" size={14} />
                    อาบน้ำก่อนกลับ {lastBath.date} · {lastBath.time} น. (รวมในบิลเดียวกัน)
                  </p>
                )}
                <div className="mt-2 border-t border-petflow-line pt-2">
                  <CustomerSendButtons
                    bookingId={b.id}
                    customerId={b.customerId}
                    lineUserId={b.lineUserId}
                    service={b.service}
                    groomBookingIds={many ? list.map((x) => x.id) : undefined}
                  />
                </div>
              </div>
            );
          })()}
        </div>
      )}
      {appointmentDate && (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-latte/20 px-3 py-1.5 text-xs font-bold text-latte-deep">
          <Icon name="calendar" size={14} />
          จองวันที่ {appointmentDate}
        </p>
      )}

      {[groomOn, hotelOn, massageOn].filter(Boolean).length > 1 && (
        <Segmented
          value={tab}
          onChange={(v) => {
            setTab(v);
            setDayCare(false);
            // โปรแกรมอาบน้ำกับนวดเป็นคนละชุด — เปลี่ยนแท็บแล้วล้างที่เลือกไว้
            setGroomProgram(v === "massage" ? massagePrograms[0]?.id || "" : "");
            setPetPrograms({});
          }}
          className="mb-4"
          options={[
            ...(groomOn ? [{ id: "groom" as const, label: "อาบน้ำ", icon: "bath" }] : []),
            ...(massageOn ? [{ id: "massage" as const, label: "นวด", icon: "sparkle" }] : []),
            ...(hotelOn ? [{ id: "room" as const, label: "ห้องพัก", icon: "bed" }] : []),
          ]}
        />
      )}

      <form onSubmit={submit} className="space-y-4 rounded-petflow bg-card p-4 shadow-petflow-sm sm:p-5">
        <ClientPetPicker
          picked={pickedCustomer}
          customerName={customerName}
          catNames={catNames}
          catInput={catInput}
          setCatInput={setCatInput}
          onPickCustomer={(c) => {
            setPickedCustomer(c);
            setCustomerId(c.id);
            setCustomerName(c.name);
            setLineUserId(c.lineUserId || "");
            // เลือกน้องทุกตัวในบ้านให้เลย (ส่วนใหญ่มาด้วยกัน) — ตัวไหนไม่มาแตะออก
            // เมื่อก่อนไม่เลือกให้ แต่กล่องถามข้อมูลด้านล่างติ๊กครบทุกตัว ดูเหมือนเลือกแล้ว บันทึกไม่ผ่าน
            setCatNames(c.cats.map((cat) => cat.name));
          }}
          onNewCustomer={(name) => {
            setPickedCustomer(null);
            setCustomerId("");
            setCustomerName(name);
            setLineUserId("");
            setCatNames([]);
          }}
          onClearCustomer={() => {
            setPickedCustomer(null);
            setCustomerId("");
            setCustomerName("");
            setLineUserId("");
            setCatNames([]);
          }}
          onToggleCat={(name) =>
            setCatNames((prev) =>
              prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
            )
          }
          onAddTyped={addCatFromInput}
          onSetUnknownCount={setUnknownCount}
          onRemoveCat={removeCat}
          onSelectAll={(names) =>
            setCatNames((prev) => [...prev, ...names.filter((n) => !prev.includes(n))])
          }
        />

        <PastPricesHint prices={pastPrices} />

        {/* ถามข้อมูลก่อนรับน้องได้เลยตั้งแต่ตอนเลือกลูกค้า — ยังไม่ต้องกดบันทึกนัด */}
        {pickedCustomer && <CustomerIntakeCards
            key={pickedCustomer.id}
            customer={pickedCustomer}
            onDone={() => {}}
            bookingKind={service === "groom" ? "groom" : withGroom ? "room+groom" : "room"}
          />}

        {lineUserId && (
          <p className="flex items-center gap-2 rounded-petflow-sm bg-sage/15 px-3 py-2 text-[11px] font-bold text-ok">
            <Icon name="check" size={14} strokeWidth={2.4} />
            ผูก LINE แล้ว — ลูกค้าเห็นนัดในแอปอัตโนมัติ
          </p>
        )}

        {service === "groom" ? (
          <>
            <Field
              label="วันที่นัด"
              name="date"
              type="date"
              required
              value={appointmentDate}
              onChange={setAppointmentDate}
            />
            <div>
              <p className="text-xs font-bold text-brown-soft">
                {groomMode === "together" ? `เวลาเริ่ม (คิดเวลาตามจำนวนน้อง)` : `รอบเวลา (น้อง 1 ตัว = 1 คิว)`}
              </p>
              <p className="mb-1.5 text-[10px] text-brown-faint">
                {groomMode === "together"
                  ? "แตะเวลาที่ลูกค้ามา น้องทั้งบ้านเริ่มพร้อมกัน ระบบคิดเวลาตามจำนวนตัวแล้วกันคิวช่วงนั้นให้"
                  : "แตะรอบที่ลูกค้ามา ถ้ามาหลายตัว ระบบเรียงตัวถัดไปลงรอบที่ว่างถัดไปให้ แก้เวลารายตัวได้ด้านล่าง"}
              </p>
              {groomAvail.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {groomAvail.map((sl) => {
                    const picked = groomStart === sl.time;
                    const full = sl.remaining <= 0;
                    return (
                      <button
                        key={sl.time}
                        type="button"
                        onClick={() => setGroomStart(sl.time)}
                        aria-pressed={picked}
                        className={`min-h-[44px] rounded-petflow-sm px-3 py-1.5 text-left text-sm font-extrabold transition ${
                          picked
                            ? "bg-petflow-chocolate text-card"
                            : full
                              ? "border border-petflow-line bg-paper text-brown-faint"
                              : "border border-petflow-line bg-paper text-brown"
                        }`}
                      >
                        {sl.time}
                        <span className="block text-[10px] font-bold opacity-80">
                          {full
                          ? "เต็มแล้ว"
                          : groomMode === "together" && sl.endTime
                            ? `ถึง ${sl.endTime}`
                            : `ว่าง ${sl.remaining}/${sl.capacity}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <label className="block text-[11px] font-bold text-brown-soft">
                หรือพิมพ์เวลาเอง
                <input
                  type="time"
                  list="groom-slots"
                  value={groomStart}
                  onChange={(e) => setGroomStart(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm text-brown"
                />
              </label>
              <datalist id="groom-slots">
                {groomSlots.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>

              {bookingCats.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {bookingCats.map((cat, i) => (
                    <li
                      key={`${cat}-${i}`}
                      className="flex flex-wrap items-center gap-2 rounded-petflow-sm bg-paper px-3 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-brown">{cat}</span>
                      <input
                        type="time"
                        list="groom-slots"
                        aria-label={`เวลาของ ${cat}`}
                        value={catTimes[i] || ""}
                        onChange={(e) =>
                          setCatTimes((prev) => {
                            const next = [...prev];
                            next[i] = e.target.value;
                            return next;
                          })
                        }
                        className="min-h-[40px] w-[7.5rem] shrink-0 rounded-petflow-sm border border-petflow-line bg-card px-2 py-1.5 text-sm text-brown"
                      />
                      {bookingCats.length > 1 && (
                        <PetProgramSelect
                          cat={cat}
                          value={petPrograms[cat] ?? groomProgram}
                          onChange={(v) => setPetPrograms((p) => ({ ...p, [cat]: v }))}
                          programs={tabPrograms}
                          emptyLabel="ยังไม่เลือก — ถามหน้างาน"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {overSlots.length > 0 && (
                <p className="mt-2 rounded-petflow-sm bg-wait/10 px-3 py-2 text-[11px] font-bold text-wait">
                  {overSlots
                    .map((o) =>
                      groomMode === "together"
                        ? `ช่วง ${o.time} มีบ้านอื่นอาบอยู่เต็มแล้ว (รับพร้อมกันได้ ${o.capacity})`
                        : `รอบ ${o.time} จะมี ${o.total} ตัว (รับได้ ${o.capacity})`
                    )
                    .join(" · ")}
                  {" "}— บันทึกได้ แต่เช็คหน้างานอีกทีนะคะ
                </p>
              )}
            </div>
            <label className="block text-xs font-bold text-brown-soft">
              {massage
                ? bookingCats.length > 1
                  ? "โปรแกรมนวด — เลือกให้ทุกตัว"
                  : "โปรแกรมนวด"
                : bookingCats.length > 1
                  ? "โปรแกรมอาบน้ำ — เลือกให้ทุกตัว (ไม่บังคับ)"
                  : "โปรแกรมอาบน้ำ (ไม่บังคับ)"}
              <select
                value={groomProgram}
                onChange={(e) => {
                  setGroomProgram(e.target.value);
                  setPetPrograms({});
                }}
                className="mt-1 min-h-[44px] w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm text-brown"
              >
                {!massage && <option value="">ยังไม่เลือก — ถามหน้างาน</option>}
                {tabPrograms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-brown-faint">
                {bookingCats.length > 1
                  ? "ตัวไหนอาบไม่เหมือนกัน เปลี่ยนได้ที่ช่องโปรแกรมใต้ชื่อน้องแต่ละตัวด้านบน · "
                  : ""}
                เลือกไว้แล้วจะแจ้งในการ์ดยืนยันนัดให้ลูกค้าเห็นเลย และตอนออกบิลจะเลือกโปรแกรมนี้ไว้ให้อัตโนมัติ
              </p>
            </label>
          </>
        ) : (
          <>
            <Segmented
              value={dayCare ? "day" : "stay"}
              onChange={(v) => setDayCare(v === "day")}
              options={[
                { id: "stay", label: "ค้างคืน", icon: "bed" },
                { id: "day", label: "Day Care", icon: "clock" },
              ]}
            />
            <div className={dayCare ? "" : "grid grid-cols-2 gap-2"}>
              <Field
                label={dayCare ? "วันที่ฝาก" : "เช็คอิน"}
                name="checkin"
                type="date"
                required
                value={appointmentDate}
                onChange={setAppointmentDate}
              />
              {!dayCare && (
                <Field
                  label="เช็คเอาท์"
                  name="checkout"
                  type="date"
                  required
                  value={checkoutDate}
                  onChange={setCheckoutDate}
                />
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-brown-soft">ห้อง</p>
              <p className="mb-1.5 text-[10px] text-brown-faint">
                {dayCare
                  ? "ฝากรายวัน ไม่ค้างคืน · คิดครึ่งราคาห้อง · ตัวเลขคือห้องที่ว่างวันนั้น"
                  : liveMoves.length
                    ? "ห้องแรก (ก่อนย้าย) · ตัวเลขคือห้องที่ว่างจริงถึงวันย้าย"
                    : appointmentDate
                      ? "ตัวเลขคือห้องที่ว่างจริงตลอดช่วงที่เลือก · ห้องเต็มจะกดไม่ได้"
                      : "เลือกวันด้านบนก่อน ระบบจะขึ้นจำนวนห้องว่างให้"}
              </p>
              <input type="hidden" name="room" value={roomId} />
              <div className="space-y-1.5">
                {rooms.map((r) => {
                  const a = availability[r.id];
                  const combo = !r.count && !!compositionOf(r.id, boardRooms);
                  const free = a?.free ?? r.count ?? 0;
                  // ยังไม่ได้เลือกวัน = ยังไม่รู้ว่าเต็มไหม (ห้องเชื่อมไม่มีจำนวนของตัวเอง เคยขึ้น "เต็ม")
                  const noDates = !a && !appointmentDate;
                  const full = !noDates && free <= 0;
                  const picked = roomId === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      disabled={full}
                      onClick={() => setRoomId(r.id)}
                      aria-pressed={picked}
                      className={`flex min-h-[52px] w-full items-center justify-between gap-2 rounded-petflow-sm px-3 py-2.5 text-left transition ${
                        full
                          ? "cursor-not-allowed bg-paper/50 opacity-60"
                          : picked
                            ? "bg-honey/40 ring-2 ring-honey-deep"
                            : "bg-paper hover:bg-honey/15"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 truncate text-xs font-extrabold text-petflow-chocolate">
                          {picked && !full && <Icon name="check" size={14} strokeWidth={2.4} />}
                          <span className="truncate">
                            {r.name} ({r.size})
                          </span>
                        </span>
                        <span className="block text-[10px] text-brown-soft">
                          {dayCare ? `${dayCarePrice(r.price)} บาท/วัน` : `${r.price} บาท/คืน`}
                          {full && a
                            ? ` · เต็มวันที่ ${a.tightestDate}`
                            : combo
                              ? " · ห้องเชื่อม (ใช้ห้องจริง 2 ห้อง)"
                              : ` · ทั้งหมด ${r.count} ห้อง`}
                        </span>
                      </span>
                      {!noDates && (
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
                            full ? "bg-red-50 text-red-600" : "bg-ok/15 text-ok"
                          }`}
                        >
                          {full ? "เต็ม" : `ว่าง ${free}${combo ? " ชุด" : ""}`}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {Object.keys(availability).length > 0 &&
                Object.values(availability).every((a) => a.free <= 0) && (
                <p className="mt-2 flex items-start gap-1.5 rounded-petflow-sm bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">
                  <Icon name="alert" size={14} className="mt-px" />
                  ช่วงวันนี้ห้องเต็มทุกแบบ — ต้องเลื่อนวันหรือเช็คห้องที่จะเช็คเอาท์ก่อน
                </p>
              )}

              {/* เลือกเลขห้องจริงตรงๆ — เฉพาะห้องเดี่ยว ห้องเชื่อมจัด 2 ห้องติดกันให้อัตโนมัติเหมือนเดิม */}
              {roomId && !compositionOf(roomId, boardRooms) && (
                <div className="mt-3 rounded-petflow-sm border border-petflow-line bg-paper/50 p-3">
                  <input type="hidden" name="roomUnit" value={roomUnit ?? ""} />
                  <p className="flex items-center gap-1.5 text-xs font-bold text-brown-soft">
                    <Icon name="grid" size={14} />
                    เลือกห้องจริง (ไม่บังคับ)
                  </p>
                  <p className="mb-2 text-[10px] text-brown-faint">
                    ไม่เลือก = ให้ระบบจัดห้องให้อัตโนมัติตอนถึงวันจริง
                  </p>
                  {freeUnits.length === 0 ? (
                    <p className="text-[10px] text-brown-faint">
                      {appointmentDate ? "ไม่มีห้องว่างให้เลือกช่วงนี้" : "เลือกวันเช็คอิน-เช็คเอาท์ก่อน"}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {freeUnits.map((u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setRoomUnit(roomUnit === u ? null : u)}
                          aria-pressed={roomUnit === u}
                          className={`flex min-h-[40px] items-center gap-1 rounded-full px-3.5 text-xs font-bold transition ${
                            roomUnit === u
                              ? "bg-petflow-chocolate text-card"
                              : "bg-card text-brown-soft ring-1 ring-petflow-line hover:bg-honey/20"
                          }`}
                        >
                          {roomUnit === u && <Icon name="check" size={14} strokeWidth={2.4} />}
                          ห้อง {u}
                          {turnoverLabel(turnUnits.r1, u) && <span className="font-normal text-wait"> · {turnoverLabel(turnUnits.r1, u)}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ห้องที่ 2 — การจองเดียวกันแต่แยกน้องบางตัวไปอีกห้อง */}
              {!room2Id ? (
                <button
                  type="button"
                  onClick={() => {
                    const first = rooms.find((r) => free2(r.id) > 0 || (!r.count && compositionOf(r.id, boardRooms)));
                    if (first) setRoom2Id(first.id);
                    else toast("ช่วงวันนี้ไม่มีห้องว่างพอสำหรับห้องที่ 2", "error");
                  }}
                  className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-petflow-sm border border-dashed border-latte/60 text-xs font-bold text-latte-deep"
                >
                  <Icon name="plus" size={15} />
                  เพิ่มห้องที่ 2 (แยกน้องไปอีกห้อง)
                </button>
              ) : (
                <div className="mt-3 space-y-2 rounded-petflow-sm border border-honey/60 bg-honey/10 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-extrabold text-petflow-chocolate">ห้องที่ 2</p>
                    <button type="button" onClick={closeRoom2} className="min-h-[36px] px-2 text-[11px] font-bold text-brown-soft">
                      เอาออก
                    </button>
                  </div>
                  <select
                    value={room2Id}
                    onChange={(e) => {
                      setRoom2Id(e.target.value);
                      setRoom2Unit(null);
                    }}
                    aria-label="ประเภทห้องที่ 2"
                    className="min-h-[44px] w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm text-brown"
                  >
                    {rooms.map((r) => {
                      const tracked = r.id in availability;
                      const f = free2(r.id);
                      return (
                        <option key={r.id} value={r.id} disabled={tracked && f <= 0}>
                          {r.name} · {dayCare ? `${dayCarePrice(r.price)} บาท/วัน` : `${r.price} บาท/คืน`}{tracked ? (f > 0 ? ` · ว่าง ${f}` : " · เต็ม") : ""}
                        </option>
                      );
                    })}
                  </select>
                  {freeUnits2.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {freeUnits2.map((u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setRoom2Unit(room2Unit === u ? null : u)}
                          aria-pressed={room2Unit === u}
                          className={`min-h-[36px] rounded-full px-3 text-xs font-bold ${
                            room2Unit === u ? "bg-petflow-chocolate text-card" : "bg-card text-brown-soft ring-1 ring-petflow-line"
                          }`}
                        >
                          ห้อง {u}
                          {turnoverLabel(turnUnits.r2, u) && <span className="font-normal text-wait"> · {turnoverLabel(turnUnits.r2, u)}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] font-bold text-brown-soft">น้องที่อยู่ห้องนี้ (แตะเพื่อเลือก)</p>
                  {catNames.length === 0 ? (
                    <p className="text-[10px] text-brown-faint">ใส่ชื่อน้องด้านบนก่อน แล้วค่อยแบ่งห้อง</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {catNames.map((c) => {
                        const on = room2Cats.includes(c);
                        return (
                          <button
                            key={c}
                            type="button"
                            aria-pressed={on}
                            onClick={() => setRoom2Cats((prev) => (on ? prev.filter((x) => x !== c) : [...prev, c]))}
                            className={`flex min-h-[36px] items-center gap-1 rounded-full px-3 text-xs font-bold ${
                              on ? "bg-petflow-chocolate text-card" : "bg-card text-brown-soft ring-1 ring-petflow-line"
                            }`}
                          >
                            {on && <Icon name="check" size={13} strokeWidth={2.4} />}
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-[10px] text-brown-faint">
                    ตัวที่ไม่ได้เลือกอยู่ห้องที่ 1 · บิลยังรวมเป็นใบเดียว
                    {room2Id === roomId && !compositionOf(roomId, boardRooms) && " · ห้องแบบเดียวกัน ระบบจะล็อกเลขห้องให้แยกกัน"}
                  </p>
                </div>
              )}
            </div>
            {!dayCare && roomId && (
              <RoomMovesEditor
                rooms={rooms}
                boardRooms={boardRooms}
                existing={existing}
                checkin={appointmentDate}
                checkout={stayOut}
                firstRoom={roomId}
                firstUnit={roomUnit}
                moves={roomMoves}
                onChange={setRoomMoves}
              />
            )}

            {/* เข้าพัก + อาบน้ำ ลงทีเดียว — ระบบสร้างนัดอาบน้ำแยกอีกนัดให้ (ขอข้อมูล/แจ้งเตือนของอาบน้ำแยกกัน) */}
            {groomOn && (
            <div className="rounded-petflow-sm border border-petflow-line bg-paper p-3">
              <button
                type="button"
                onClick={() => setAlsoGroom((v) => !v)}
                aria-pressed={alsoGroom}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <span className="flex items-center gap-1.5 text-xs font-extrabold text-petflow-chocolate">
                  <Icon name="bath" size={15} />
                  อาบน้ำด้วย
                </span>
                <span
                  className={`flex h-6 w-11 items-center rounded-full p-0.5 transition ${
                    alsoGroom ? "justify-end bg-petflow-chocolate" : "justify-start bg-petflow-line"
                  }`}
                >
                  <span className="h-5 w-5 rounded-full bg-card shadow" />
                </span>
              </button>
              {alsoGroom && (
                <div className="mt-3 space-y-3">
                  <div>
                    <Field
                      label="วันอาบน้ำ"
                      name="addGroomDate"
                      type="date"
                      required
                      value={addGroomDate}
                      onChange={(v) => {
                        setGroomDateTouched(true);
                        setAddGroomDate(v);
                      }}
                    />
                    {appointmentDate && checkoutDate && (
                      <div className="mt-1.5 flex gap-2">
                        {[
                          { d: appointmentDate, label: "วันเข้า" },
                          { d: checkoutDate, label: "วันออก" },
                        ].map((o) => (
                          <button
                            key={o.label}
                            type="button"
                            onClick={() => {
                              setGroomDateTouched(true);
                              setAddGroomDate(o.d);
                            }}
                            className={`min-h-[32px] rounded-full px-3 text-[11px] font-bold ${
                              addGroomDate === o.d
                                ? "bg-petflow-chocolate text-card"
                                : "bg-card text-brown-soft ring-1 ring-petflow-line"
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <label className="block text-xs font-bold text-brown-soft">
                    เวลาอาบน้ำ
                    <input
                      type="time"
                      list="groom-slots-stay"
                      value={addGroomTime}
                      onChange={(e) => setAddGroomTime(e.target.value)}
                      className="mt-1 min-h-[44px] w-full rounded-petflow-sm border border-petflow-line bg-card px-3 py-2.5 text-sm text-brown"
                    />
                    <datalist id="groom-slots-stay">
                      {groomSlots.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                    <GroomClashNote clashes={clashes} />
                  </label>
                  <label className="block text-xs font-bold text-brown-soft">
                    {bookingCats.length > 1 ? "โปรแกรมอาบน้ำ — ทุกตัว (ถ้าเลือกแล้ว)" : "โปรแกรมอาบน้ำ (ถ้าเลือกแล้ว)"}
                    <select
                      value={addGroomProgram}
                      onChange={(e) => {
                        setAddGroomProgram(e.target.value);
                        setAddPetPrograms({});
                      }}
                      className="mt-1 min-h-[44px] w-full rounded-petflow-sm border border-petflow-line bg-card px-3 py-2.5 text-sm text-brown"
                    >
                      <option value="">— ยังไม่ระบุ (เลือกตอนคิดเงิน) —</option>
                      {groomPrograms.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {bookingCats.length > 1 && (
                    <ul className="space-y-1.5">
                      {bookingCats.map((cat, i) => (
                        <li
                          key={`${cat}-${i}`}
                          className="flex flex-wrap items-center gap-2 rounded-petflow-sm bg-card px-3 py-1.5"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm font-bold text-brown">{cat}</span>
                          <PetProgramSelect
                            cat={cat}
                            value={addPetPrograms[cat] ?? addGroomProgram}
                            onChange={(v) => setAddPetPrograms((p) => ({ ...p, [cat]: v }))}
                            programs={groomPrograms}
                            emptyLabel="ยังไม่ระบุ (เลือกตอนคิดเงิน)"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[10px] text-brown-faint">
                    รวมเป็นนัดเดียวกับการเข้าพัก บิลใบเดียว · ระบบจองคิวอาบน้ำวันนั้นให้น้องทุกตัวที่เลือก (กันเวลาช่าง) ไม่ส่งยืนยันนัดอาบน้ำแยก
                  </p>
                </div>
              )}
            </div>
            )}
          </>
        )}

        {service === "room" && (
        <div className="rounded-petflow-sm border border-honey/40 bg-honey/10 p-3">
          <p className="flex items-center gap-1.5 text-xs font-extrabold text-petflow-chocolate">
            <Icon name="gift" size={15} />
            ของแถมฟรี (ถ้าตกลงกับลูกค้าไว้)
          </p>
          <p className="mb-2 text-[10px] text-brown-soft">
            ติ๊กแล้วจะติดไปในใบจอง + การ์ดยืนยันให้ลูกค้าเห็นเลย
          </p>
          <div className="flex flex-wrap gap-2">
            {freebies_.map((f) => {
              const on = freebies.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() =>
                    setFreebies((prev) =>
                      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
                    )
                  }
                  aria-pressed={on}
                  className={`flex min-h-[40px] items-center gap-1 rounded-full px-3.5 text-xs font-bold ${
                    on
                      ? "bg-petflow-chocolate text-card"
                      : "bg-card text-brown-soft ring-1 ring-petflow-line"
                  }`}
                >
                  {on && <Icon name="check" size={14} strokeWidth={2.4} />}
                  {f}
                </button>
              );
            })}
          </div>
        </div>
        )}

        <TransportPicker value={transport} onChange={setTransport} />

        <Field label="โน้ตนิสัยน้อง (ลูกค้าใหม่)" name="notes" textarea />

        <button
          type="submit"
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-honey to-honey-deep text-sm font-extrabold text-petflow-chocolate shadow-petflow-sm"
        >
          <Icon name={saved ? "check" : "calendar"} size={18} strokeWidth={2.2} />
          {saved ? "บันทึกแล้ว + สร้างนัด Calendar" : "บันทึกการจอง"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  textarea,
  value,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  textarea?: boolean;
  value?: string;
  onChange?: (v: string) => void;
}) {
  const cls =
    "mt-1 min-h-[44px] w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm text-brown outline-none focus:border-latte-deep";
  return (
    <label className="block text-xs font-bold text-brown-soft">
      {label}
      {textarea ? (
        <textarea name={name} className={cls} rows={2} />
      ) : (
        <input
          name={name}
          type={type}
          required={required}
          placeholder={placeholder}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          className={cls}
        />
      )}
    </label>
  );
}
