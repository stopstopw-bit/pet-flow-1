"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiff } from "@/components/LiffProvider";
import { useConfig } from "@/components/ConfigProvider";
import { isFeatureOn } from "@/lib/features";
import { PageHeader } from "@/components/PageHeader";
import { SELF_BOOKABLE_ROOM_IDS } from "@/lib/self-bookable-rooms";
import { bathPrograms, resolveGroomPrograms, resolveMassagePrograms } from "@/lib/grooming-prices";
import { extraCatChargePerNight } from "@/lib/business";
import { roomPricing } from "@/lib/room-board";
import { toJpegDataUrl } from "@/lib/image-convert";
import { PetPickList, type PetPickItem } from "@/components/PetPickList";
import { PetProgramSelect } from "@/components/GroomProgramPicker";
import { petWords } from "@/lib/pet-kind";
import { customerFetch } from "@/lib/customer-fetch";

type Service = "groom" | "room";

type GroomSlot = { time: string; capacity: number; booked: number; remaining: number; endTime?: string };
type RoomAvail = { capacity: number; booked: number; remaining: number; closed: boolean } | null;
type DepositInfo = {
  amount: number;
  qr?: string;
  promptpay?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * พรีวิวฝั่งลูกค้า (ก๊อปจาก src/lib/availability.ts — คัดลอกมาเพื่อไม่ต้อง import โมดูลฝั่งเซิร์ฟเวอร์
 * เข้ามาในไคลเอนต์) แมวตัวแรกลงเวลาที่เลือก เต็มแล้วตัวถัดไปไหลไปสล็อตถัดไปอัตโนมัติ
 */
function assignGroomSlots(
  slots: { time: string; remaining: number }[],
  startTime: string,
  count: number
): string[] | null {
  const startIdx = slots.findIndex((s) => s.time === startTime);
  if (startIdx === -1 || count <= 0) return null;
  const assigned: string[] = [];
  for (let i = startIdx; i < slots.length && assigned.length < count; i++) {
    let avail = slots[i].remaining;
    while (avail > 0 && assigned.length < count) {
      assigned.push(slots[i].time);
      avail--;
    }
  }
  return assigned.length === count ? assigned : null;
}

export default function BookPage() {
  return (
    <Suspense fallback={<p className="py-10 text-center text-sm text-brown-soft">กำลังโหลด…</p>}>
      <BookPageInner />
    </Suspense>
  );
}

function BookPageInner() {
  const params = useSearchParams();
  const { customer, profile, ready } = useLiff();
  const { config } = useConfig();
  const pw = petWords(config);
  // ชื่อ/รายการห้องดึงจากตั้งค่าของร้านนี้ ไม่ใช่ค่าเริ่มต้นของ CatCha —
  // ร้านที่เปลี่ยนชื่อห้องหรือลบห้องประเภทใดออกจะเห็นรายการที่ตรงกับร้านตัวเอง
  const roomTypes = useMemo(
    () =>
      config.rooms
        .filter((r) => SELF_BOOKABLE_ROOM_IDS.includes(r.id))
        .map((r) => ({
          id: r.id,
          name: r.name,
          price: r.price,
          maxCats: r.maxCats,
          includedCats: r.includedCats,
          extraCatPrice: r.extraCatPrice,
          cats: r.cats,
          extra: r.extra,
        })),
    [config.rooms]
  );
  // แท็บ นวด = จองคิวแบบ groom ที่เลือกโปรแกรมนวด (คิวแยกจากอาบน้ำ)
  const [tab, setTab] = useState<Service | "massage">(() => {
    const p = params.get("service");
    return p === "room" ? "room" : p === "massage" ? "massage" : "groom";
  });
  const service: Service = tab === "room" ? "room" : "groom";
  const massage = tab === "massage";
  // ร้านปิดบริการไหนไว้ในตั้งค่า ก็ไม่ให้เลือกบริการนั้น
  const groomOn = isFeatureOn(config, "grooming");
  const hotelOn = isFeatureOn(config, "hotel");
  const massageOn = isFeatureOn(config, "massage");
  useEffect(() => {
    const on = { groom: groomOn, room: hotelOn, massage: massageOn };
    if (on[tab]) return;
    const next = (["groom", "room", "massage"] as const).find((t) => on[t]);
    if (next) setTab(next);
  }, [tab, groomOn, hotelOn, massageOn]);
  const tabPrograms = massage
    ? resolveMassagePrograms(config.groomPricePrograms)
    : bathPrograms(resolveGroomPrograms(config.groomPricePrograms));
  // เลือกน้องได้หลายตัวทั้งอาบน้ำและเข้าพัก — เข้าพักบ้านเดียวกันอยู่ห้องเดียวกัน (เกินจุห้อง = เพิ่มห้อง)
  const [catNames, setCatNames] = useState<string[]>([]);
  const toggleCat = (name: string) => {
    setCatNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };
  // รูป + สายพันธุ์ของน้อง (customer.cats มีแค่ id/ชื่อ) — โหลดไม่ได้ก็ยังเลือกได้ แค่ไม่มีรูป
  const [catDetails, setCatDetails] = useState<PetPickItem[]>([]);
  const customerId = customer?.id;
  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    customerFetch("/api/customers/cat-photo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { cats: [] }))
      .then((d) => {
        if (!cancelled) setCatDetails(d.cats || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [customerId]);
  const petItems: PetPickItem[] = useMemo(
    () =>
      (customer?.cats || []).map((c) => {
        const d = catDetails.find((x) => x.id === c.id);
        return { id: c.id, name: c.name, breed: d?.breed, species: d?.species, photoDataUrl: d?.photoDataUrl };
      }),
    [customer?.cats, catDetails]
  );

  // groom state
  const [date, setDate] = useState(todayISO());
  const [slots, setSlots] = useState<GroomSlot[] | null>(null);
  const [groomClosed, setGroomClosed] = useState(false);
  // "together" = ร้านตั้งคิดเวลาตามจำนวนแมว: ทั้งบ้านเริ่มพร้อมกัน แล้วกันช่วงเวลาตามจำนวนตัว
  const [groomMode, setGroomMode] = useState<"together" | "per_cat">("per_cat");
  const [time, setTime] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [groomProgram, setGroomProgram] = useState("");
  // จองหลายตัว: แต่ละตัวเลือกโปรแกรมของตัวเองได้ (ทับโปรแกรมที่เลือกให้ทุกตัว)
  const [petPrograms, setPetPrograms] = useState<Record<string, string>>({});

  // room state
  const [roomType, setRoomType] = useState("");
  const [checkin, setCheckin] = useState(todayISO());
  const [checkout, setCheckout] = useState(addDaysISO(todayISO(), 1));
  const [roomAvail, setRoomAvail] = useState<RoomAvail>(null);
  const [roomAvailErr, setRoomAvailErr] = useState("");
  const [loadingRoom, setLoadingRoom] = useState(false);

  // บ้านเดียวกันอยู่ห้องเดียวกัน — เกินจุห้องค่อยเพิ่มห้อง · ค่าตัวที่เกินโควตาห้องคิดตามตั้งค่าห้อง
  const selectedRoom = roomTypes.find((r) => r.id === roomType);
  const roomsNeeded = selectedRoom
    ? Math.max(1, Math.ceil(catNames.length / Math.max(1, selectedRoom.maxCats || 1)))
    : 1;
  const roomPrice = useMemo(() => {
    if (!selectedRoom || !catNames.length || checkout <= checkin) return null;
    const nights = Math.round(
      (Date.parse(checkout + "T00:00:00Z") - Date.parse(checkin + "T00:00:00Z")) / 86400000
    );
    const extra = extraCatChargePerNight(selectedRoom, catNames.length);
    return {
      nights,
      rooms: extra.rooms,
      roomPerNight: selectedRoom.price,
      extraCats: extra.extraCats,
      extraCatPrice: roomPricing(selectedRoom).extraPrice,
      included: roomPricing(selectedRoom).base,
      total: (selectedRoom.price * extra.rooms + extra.perNight) * nights,
    };
  }, [selectedRoom, catNames.length, checkin, checkout]);

  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState("");
  const [done, setDone] = useState<
    null | {
      service: Service;
      massage?: boolean;
      schedule?: { catName: string; time: string }[];
      ids: string[];
      depositAmount: number;
      slipSent: boolean;
    }
  >(null);

  // มัดจำ — ร้านเปิดไว้ในตั้งค่า › การชำระเงิน · ยอดคิดฝั่งเซิร์ฟเวอร์ (หน้านี้แค่แสดง)
  const [deposit, setDeposit] = useState<DepositInfo | null>(null);
  const [slip, setSlip] = useState("");
  const [slipBusy, setSlipBusy] = useState(false);
  const [slipErr, setSlipErr] = useState("");
  const [lateSending, setLateSending] = useState(false);
  const pickSlip = async (file: File) => {
    setSlipBusy(true);
    setSlipErr("");
    try {
      setSlip(await toJpegDataUrl(file, 1400));
    } catch (e) {
      setSlipErr(e instanceof Error ? e.message : "แนบรูปไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setSlipBusy(false);
    }
  };

  useEffect(() => {
    let alive = true;
    setDeposit(null);
    fetch(`/api/bookings/deposit?service=${service}`)
      .then((r) => (r.ok ? r.json() : { amount: 0 }))
      .then((d: DepositInfo) => alive && setDeposit(d.amount > 0 ? d : null))
      .catch(() => alive && setDeposit(null));
    return () => {
      alive = false;
    };
  }, [service]);

  useEffect(() => {
    if (customer?.cats?.length && !catNames.length) setCatNames([customer.cats[0].name]);
  }, [customer, catNames]);

  useEffect(() => {
    // roomType เริ่มว่างเพราะรอโหลด config ก่อน — เลือกห้องแรกที่ร้านนี้เปิดให้จองเองได้
    // และสลับให้อัตโนมัติถ้าห้องที่เลือกไว้ถูกลบ/เปลี่ยนชื่อจนไม่อยู่ในลิสต์แล้ว
    if (roomTypes.length && !roomTypes.some((r) => r.id === roomType)) {
      setRoomType(roomTypes[0].id);
    }
  }, [roomTypes, roomType]);

  useEffect(() => {
    if (service !== "groom") return;
    let alive = true;
    setLoadingSlots(true);
    // ส่งจำนวนน้องไปด้วย — โหมดคิดเวลา รอบที่ว่างขึ้นกับว่ามากี่ตัว (ใช้เวลานานแค่ไหน)
    fetch(
      `/api/bookings/availability?service=${massage ? "massage" : "groom"}&date=${date}&cats=${Math.max(1, catNames.length)}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setSlots(d.slots || []);
        setGroomClosed(Boolean(d.closed));
        setGroomMode(d.mode === "together" ? "together" : "per_cat");
      })
      .catch(() => alive && setSlots([]))
      .finally(() => alive && setLoadingSlots(false));
    return () => {
      alive = false;
    };
  }, [service, massage, date, catNames.length]);

  // เปลี่ยนวัน = รอบเดิมอาจไม่มี/เต็มแล้ว ให้เลือกใหม่
  useEffect(() => {
    setTime("");
  }, [service, massage, date]);

  useEffect(() => {
    if (service !== "room") return;
    if (!roomType) return;
    if (checkout <= checkin) return;
    let alive = true;
    setLoadingRoom(true);
    setRoomAvailErr("");
    fetch(
      `/api/bookings/availability?service=room&roomType=${roomType}&checkin=${checkin}&checkout=${checkout}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.error) {
          setRoomAvail(null);
          setRoomAvailErr(
            d.error === "not_self_bookable"
              ? "ห้องประเภทนี้ยังจองเองไม่ได้ — ทักแชทร้านแทนนะคะ"
              : "เช็คความว่างไม่สำเร็จ"
          );
        } else {
          setRoomAvail(d);
        }
      })
      .catch(() => alive && setRoomAvailErr("เช็คความว่างไม่สำเร็จ"))
      .finally(() => alive && setLoadingRoom(false));
    return () => {
      alive = false;
    };
  }, [service, roomType, checkin, checkout]);

  // แมวตัวแรกลงเวลาที่เลือก ตัวที่เหลือไหลไปสล็อตถัดไปอัตโนมัติถ้าสล็อตนั้นเต็ม
  const assignedPreview = useMemo(() => {
    if (!slots || !time || !catNames.length) return null;
    if (groomMode === "together") {
      const s = slots.find((x) => x.time === time);
      return s && s.remaining > 0 ? catNames.map(() => time) : null;
    }
    return assignGroomSlots(slots, time, catNames.length);
  }, [slots, time, catNames, groomMode]);
  const pickedSlot = slots?.find((x) => x.time === time);

  const canSubmit = useMemo(() => {
    if (!catNames.length) return false;
    if (service === "groom") {
      if (!time) return false;
      return Boolean(assignedPreview);
    }
    return Boolean(
      roomType && roomAvail && roomAvail.remaining >= roomsNeeded && checkout > checkin
    );
  }, [catNames, service, time, assignedPreview, roomType, roomAvail, checkin, checkout, roomsNeeded]);

  const submit = async (withSlip = true) => {
    if (!profile?.lineUserId || !canSubmit) return;
    setSubmitting(true);
    setSubmitErr("");
    try {
      const body =
        service === "groom"
          ? {
              lineUserId: profile.lineUserId,
              catNames,
              service: massage ? "massage" : service,
              date,
              time,
              groomProgram: groomProgram || undefined,
              petPrograms: Object.fromEntries(
                catNames.map((n) => [n, (petPrograms[n] ?? groomProgram) || ""])
              ),
              depositSlip: (withSlip && slip) || undefined,
            }
          : {
              lineUserId: profile.lineUserId,
              catNames,
              service,
              checkin,
              checkout,
              room: roomType,
              depositSlip: (withSlip && slip) || undefined,
            };
      const res = await fetch("/api/bookings/self", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        const schedule =
          service === "groom" && Array.isArray(d.bookings)
            ? d.bookings.map((b: { catName: string; time: string }) => ({
                catName: b.catName,
                time: b.time,
              }))
            : undefined;
        const created: { id: string; depositStatus?: string; depositAmount?: number }[] =
          Array.isArray(d.bookings) ? d.bookings : d.booking ? [d.booking] : [];
        setDone({
          service,
          massage,
          schedule,
          ids: created.map((b) => b.id),
          depositAmount: Number(created[0]?.depositAmount) || 0,
          slipSent: created[0]?.depositStatus === "pending_review",
        });
        setSlip("");
      } else if (d.error === "slot_full" || d.error === "room_full") {
        setSubmitErr(
          service === "groom"
            ? "คิววันนี้ไม่พอสำหรับน้องที่เลือกไว้ทั้งหมด ลองเลือกวัน/เวลาอื่นนะคะ"
            : "ช่วงนี้เต็มไปแล้วพอดี ลองเลือกวัน/เวลาอื่นนะคะ"
        );
      } else if (d.error === "shop_closed") {
        setSubmitErr("ร้านปิดวันที่เลือกไว้พอดี ลองเลือกวันอื่นนะคะ");
      } else if (d.error === "duplicate_booking") {
        setSubmitErr("น้องตัวนี้มีคิว/การจองช่วงนี้อยู่แล้วค่ะ — ดูได้ที่เมนู “คิวของฉัน” นะคะ");
      } else if (d.error === "past_date") {
        setSubmitErr("วันที่เลือกผ่านมาแล้วค่ะ ลองเลือกวันใหม่นะคะ");
      } else {
        setSubmitErr("จองไม่สำเร็จ — ลองใหม่อีกครั้ง");
      }
    } catch {
      setSubmitErr("เชื่อมต่อไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready) {
    return <p className="py-10 text-center text-sm text-brown-soft">กำลังโหลด…</p>;
  }

  if (done) {
    return (
      <div className="px-4 pb-6 pt-5">
        <PageHeader title="✅ ส่งคำขอจองแล้ว" />
        <div className="rounded-petflow border border-petflow-line bg-card p-5 text-center shadow-petflow-sm">
          <p className="text-4xl">🐾</p>
          <p className="mt-2 text-sm font-bold text-brown">
            ส่งคำขอ{done.service === "room" ? "จองห้องพัก" : done.massage ? "จองคิวนวด" : "จองคิวอาบน้ำ"}เรียบร้อยแล้วค่ะ
          </p>
          {done.schedule && done.schedule.length > 1 && (
            <div className="mt-3 space-y-1 rounded-petflow-sm bg-paper px-3 py-2.5 text-left text-xs">
              <p className="mb-1 text-center font-bold text-brown-soft">
                🕒 คิวที่ได้ (แยกตามความว่างของแต่ละช่วง)
              </p>
              {done.schedule.map((s, i) => (
                <p key={i} className="flex items-center justify-between text-brown">
                  <span>{pw.emoji} {s.catName}</span>
                  <span className="font-extrabold text-latte-deep">{s.time}</span>
                </p>
              ))}
            </div>
          )}
          <p className="mt-1 text-xs text-brown-soft">
            รอร้านกดยืนยันอีกนิดนะคะ — เช็คสถานะได้ที่เมนู “การจอง” ด้านล่าง
          </p>
          {done.depositAmount > 0 &&
            (done.slipSent ? (
              <p className="mt-3 rounded-petflow-sm bg-sage/15 px-3 py-2 text-xs font-bold text-ok">
                📎 ส่งสลิปมัดจำ {done.depositAmount.toLocaleString()} บาทแล้ว — รอร้านตรวจสลิปนะคะ
              </p>
            ) : (
              <div className="mt-3 text-left">
                <DepositCard
                  deposit={deposit || { amount: done.depositAmount }}
                  amountOverride={done.depositAmount}
                  slip={slip}
                  busy={slipBusy}
                  error={slipErr}
                  onPick={pickSlip}
                  onClear={() => setSlip("")}
                />
                <button
                  type="button"
                  disabled={!slip || lateSending || !done.ids.length}
                  onClick={async () => {
                    setLateSending(true);
                    setSlipErr("");
                    try {
                      const res = await fetch("/api/bookings/deposit", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ids: done.ids, slip }),
                      });
                      if (res.ok) {
                        setDone({ ...done, slipSent: true });
                        setSlip("");
                      } else {
                        setSlipErr("ส่งสลิปไม่สำเร็จ — ลองใหม่อีกครั้ง หรือส่งสลิปในแชทร้านแทนนะคะ");
                      }
                    } catch {
                      setSlipErr("เชื่อมต่อไม่สำเร็จ — ลองใหม่อีกครั้ง");
                    } finally {
                      setLateSending(false);
                    }
                  }}
                  className="mt-2 w-full rounded-petflow-sm bg-gradient-to-r from-honey to-honey-deep py-3 text-sm font-extrabold text-petflow-chocolate shadow-petflow-sm disabled:opacity-50"
                >
                  {lateSending ? "กำลังส่งสลิป…" : "📎 ส่งสลิปมัดจำ"}
                </button>
                <p className="mt-1.5 text-center text-[11px] text-brown-faint">
                  ยังไม่สะดวกโอนตอนนี้ก็ได้ค่ะ — ร้านจะติดต่อเรื่องมัดจำอีกครั้ง
                </p>
              </div>
            ))}
          <button
            type="button"
            onClick={() => {
              setDone(null);
              setSlip("");
              setSlipErr("");
              setTime("");
              setGroomProgram("");
              setPetPrograms({});
            }}
            className="mt-4 rounded-full bg-honey/30 px-4 py-2 text-xs font-bold text-latte-deep"
          >
            จองอีกรายการ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader title="📅 จองคิวเอง" subtitle="เลือกวัน-เวลาที่ว่างได้เลย ไม่ต้องคุยกับพนักงาน" />

      {[groomOn, massageOn, hotelOn].filter(Boolean).length > 1 && (
      <div className="mb-4 flex overflow-hidden rounded-full border border-petflow-line text-xs font-bold">
        {(
          [
            groomOn && { id: "groom", label: "🛁 อาบน้ำ" },
            massageOn && { id: "massage", label: "💆 นวด" },
            hotelOn && { id: "room", label: "🏠 เข้าพักโรงแรม" },
          ].filter(Boolean) as { id: Service | "massage"; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setGroomProgram("");
              setPetPrograms({});
            }}
            className={`flex-1 py-2.5 transition ${
              tab === t.id ? "bg-latte-deep text-white" : "bg-card text-brown-soft"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      )}

      {!customer?.cats?.length ? (
        <p className="rounded-petflow-sm bg-wait/10 px-3 py-2.5 text-xs font-bold text-wait">
          ยังไม่มีข้อมูลน้อง{pw.th}ในระบบ — กรุณาลงทะเบียนก่อนจองนะคะ
        </p>
      ) : (
        <>
          <div className="rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
            <div className="mb-4">
              <PetPickList pets={petItems} selected={catNames} onToggle={toggleCat} />
            </div>

            {service === "groom" ? (
              <>
                <label className="mb-3 block text-xs font-bold text-brown-soft">
                  {massage
                    ? `💆 ${catNames.length > 1 ? "โปรแกรมนวด — ทุกตัว" : "โปรแกรมนวด"}`
                    : `🧴 ${catNames.length > 1 ? "โปรแกรมอาบน้ำ — ทุกตัว (ไม่บังคับ)" : "โปรแกรมอาบน้ำ (ไม่บังคับ)"}`}
                  <select
                    value={groomProgram}
                    onChange={(e) => {
                      setGroomProgram(e.target.value);
                      setPetPrograms({});
                    }}
                    className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm"
                  >
                    {!massage && <option value="">ยังไม่เลือก — ให้ทางร้านแนะนำหน้างาน</option>}
                    {tabPrograms.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {(() => {
                    const tags = tabPrograms.find((p) => p.id === groomProgram)?.includes;
                    return tags?.length ? (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {tags.map((t) => (
                          <span key={t} className="rounded-full bg-sage/25 px-2 py-0.5 text-[10px] font-bold text-brown">
                            ✓ {t}
                          </span>
                        ))}
                      </span>
                    ) : null;
                  })()}
                </label>
                {catNames.length > 1 && (
                  <div className="mb-3 space-y-1.5">
                    <p className="text-[11px] text-brown-faint">
                      {massage ? "แต่ละตัวนวดไม่เหมือนกัน" : "แต่ละตัวอาบไม่เหมือนกัน"} เปลี่ยนรายตัวได้เลย
                    </p>
                    {catNames.map((n) => (
                      <div
                        key={n}
                        className="flex flex-wrap items-center gap-2 rounded-petflow-sm bg-paper px-3 py-1.5"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-brown">{n}</span>
                        <PetProgramSelect
                          cat={n}
                          value={petPrograms[n] ?? groomProgram}
                          onChange={(v) => setPetPrograms((p) => ({ ...p, [n]: v }))}
                          programs={tabPrograms}
                          emptyLabel="ยังไม่เลือก — ให้ทางร้านแนะนำ"
                        />
                      </div>
                    ))}
                  </div>
                )}
                <label className="mb-3 block text-xs font-bold text-brown-soft">
                  📅 วันที่
                  <input
                    type="date"
                    value={date}
                    min={todayISO()}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm"
                  />
                </label>
                <p className="mb-2 text-xs font-bold text-brown-soft">🕒 เลือกเวลา</p>
                {loadingSlots ? (
                  <p className="text-xs text-brown-faint">กำลังเช็คความว่าง…</p>
                ) : groomClosed ? (
                  <p className="rounded-petflow-sm bg-wait/10 px-3 py-2.5 text-xs font-bold text-wait">
                    ร้านปิดวันนี้ค่ะ — ลองเลือกวันอื่นนะคะ
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {(slots || []).map((s) => {
                      // สล็อตเลือกเป็นจุดเริ่มได้ตราบใดที่ยังไม่เต็มสนิท — ถ้าน้องที่เลือกไว้มีมากกว่า
                      // ที่สล็อตนี้รับไหว ตัวที่เหลือจะไหลไปสล็อตถัดไปที่ว่างให้อัตโนมัติ (ดูตัวอย่างด้านล่าง)
                      const full = s.remaining <= 0;
                      const active = time === s.time;
                      return (
                        <button
                          key={s.time}
                          type="button"
                          disabled={full}
                          onClick={() => setTime(s.time)}
                          className={`rounded-petflow-sm border py-2 text-center text-xs font-bold transition ${
                            full
                              ? "cursor-not-allowed border-petflow-line bg-paper text-brown-faint line-through"
                              : active
                                ? "border-latte-deep bg-latte-deep text-white"
                                : "border-petflow-line bg-card text-brown"
                          }`}
                        >
                          {s.time}
                          <span className="block text-[9px] font-normal opacity-80">
                            {full
                              ? "เต็มแล้ว"
                              : groomMode === "together" && s.endTime
                                ? `ถึง ${s.endTime}`
                                : `ว่าง ${s.remaining}`}
                          </span>
                        </button>
                      );
                    })}
                    {slots && slots.length === 0 && (
                      <p className="col-span-3 text-xs text-brown-faint">
                        ร้านยังไม่ได้ตั้งรอบเวลาไว้ — ทักแชทร้านแทนนะคะ
                      </p>
                    )}
                  </div>
                )}

                {/* พรีวิวคิวที่จะได้ — ถ้าน้องเกินที่สล็อตนี้รับไหว จะไหลไปสล็อตถัดไปให้เห็นก่อนกดจอง */}
                {time && groomMode === "together" && pickedSlot?.endTime && (
                  <p className="mt-2 rounded-petflow-sm bg-paper px-3 py-2 text-[11px] font-bold text-brown">
                    🕒 {catNames.length > 1 ? `น้องทั้ง ${catNames.length} ตัว` : catNames[0]} เริ่ม{" "}
                    <span className="text-latte-deep">{time}</span> เสร็จประมาณ{" "}
                    <span className="text-latte-deep">{pickedSlot.endTime}</span>
                  </p>
                )}
                {time && groomMode !== "together" && catNames.length > 1 && (
                  <div className="mt-2 rounded-petflow-sm bg-paper px-3 py-2 text-[11px]">
                    {assignedPreview ? (
                      <>
                        <p className="mb-1 font-bold text-brown-soft">🕒 คิวที่จะได้:</p>
                        {catNames.map((name, i) => (
                          <p key={i} className="flex items-center justify-between text-brown">
                            <span>{pw.emoji} {name}</span>
                            <span className="font-extrabold text-latte-deep">
                              {assignedPreview[i]}
                            </span>
                          </p>
                        ))}
                      </>
                    ) : (
                      <p className="font-bold text-wait">
                        คิวที่เหลือในวันนี้ไม่พอสำหรับน้องทั้ง {catNames.length} ตัว —
                        ลองเลือกวันอื่นนะคะ
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : roomTypes.length === 0 ? (
              <p className="rounded-petflow-sm bg-wait/10 px-3 py-2.5 text-xs font-bold text-wait">
                ยังจองห้องพักเองไม่ได้ตอนนี้ — ทักแชทร้านแทนนะคะ
              </p>
            ) : (
              <>
                <label className="mb-3 block text-xs font-bold text-brown-soft">
                  🏠 ประเภทห้อง
                  <select
                    value={roomType}
                    onChange={(e) => setRoomType(e.target.value)}
                    className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm"
                  >
                    {roomTypes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <label className="block text-xs font-bold text-brown-soft">
                    วันเข้าพัก
                    <input
                      type="date"
                      value={checkin}
                      min={todayISO()}
                      onChange={(e) => {
                        setCheckin(e.target.value);
                        if (checkout <= e.target.value) setCheckout(addDaysISO(e.target.value, 1));
                      }}
                      className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs font-bold text-brown-soft">
                    วันออก
                    <input
                      type="date"
                      value={checkout}
                      min={addDaysISO(checkin, 1)}
                      onChange={(e) => setCheckout(e.target.value)}
                      className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                {loadingRoom ? (
                  <p className="text-xs text-brown-faint">กำลังเช็คความว่าง…</p>
                ) : roomAvailErr ? (
                  <p className="rounded-petflow-sm bg-wait/10 px-3 py-2 text-xs font-bold text-wait">
                    {roomAvailErr}
                  </p>
                ) : roomAvail ? (
                  <p
                    className={`rounded-petflow-sm px-3 py-2 text-xs font-bold ${
                      roomAvail.remaining > 0 ? "bg-sage/15 text-ok" : "bg-wait/10 text-wait"
                    }`}
                  >
                    {roomAvail.remaining >= roomsNeeded
                      ? `✅ ว่าง ${roomAvail.remaining} ห้อง`
                      : roomAvail.remaining > 0
                        ? `ว่างแค่ ${roomAvail.remaining} ห้อง แต่น้อง ${catNames.length} ตัวต้องใช้ ${roomsNeeded} ห้อง`
                      : roomAvail.closed
                        ? "ร้านปิดวันเช็คอิน/เช็คเอาท์ที่เลือกไว้ — ลองเปลี่ยนวันดูนะคะ"
                        : "เต็มแล้วช่วงนี้ — ลองเปลี่ยนวันดูนะคะ"}
                  </p>
                ) : null}
                {roomPrice && (
                  <div className="mt-2 rounded-petflow-sm bg-paper px-3 py-2 text-xs text-brown">
                    <p className="font-bold">
                      💰 ประมาณ ฿{roomPrice.total.toLocaleString()} ({roomPrice.nights} คืน)
                    </p>
                    <p className="text-brown-soft">
                      ห้อง ฿{roomPrice.roomPerNight.toLocaleString()} × {roomPrice.rooms} ห้อง
                      {roomPrice.extraCats > 0 &&
                        ` + น้องตัวที่ ${roomPrice.included + 1} ขึ้นไป ${roomPrice.extraCats} ตัว × ฿${roomPrice.extraCatPrice}`}{" "}
                      ต่อคืน
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {deposit && canSubmit && (
            <DepositCard
              deposit={deposit}
              slip={slip}
              busy={slipBusy}
              error={slipErr}
              onPick={pickSlip}
              onClear={() => setSlip("")}
            />
          )}

          {submitErr && (
            <p className="mt-3 text-center text-xs font-bold text-wait">{submitErr}</p>
          )}
          <button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={() => submit(true)}
            className="mt-4 w-full rounded-petflow-sm bg-gradient-to-r from-honey to-honey-deep py-3.5 text-sm font-extrabold text-petflow-chocolate shadow-petflow-sm disabled:opacity-50"
          >
            {submitting
              ? "กำลังส่งคำขอ…"
              : deposit && slip
                ? "🐾 ยืนยันจอง + ส่งสลิปมัดจำ"
                : "🐾 ยืนยันจองคิว"}
          </button>
          {deposit && canSubmit && slip && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => submit(false)}
              className="mt-2 w-full rounded-petflow-sm bg-card py-2.5 text-xs font-bold text-brown-soft ring-1 ring-petflow-line disabled:opacity-50"
            >
              จองก่อน โอนทีหลัง
            </button>
          )}
          {deposit && canSubmit && !slip && (
            <p className="mt-2 text-center text-[11px] text-brown-faint">
              ยังไม่ได้แนบสลิป — กดจองได้เลย (โอนทีหลัง) แล้วค่อยแนบสลิปหลังจองได้ค่ะ
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** ขั้นมัดจำ: ยอด + QR พร้อมเพย์ตามยอด + แนบสลิป (ไม่บังคับ — โอนทีหลังได้) */
function DepositCard({
  deposit,
  amountOverride,
  slip,
  busy,
  error,
  onPick,
  onClear,
}: {
  deposit: DepositInfo;
  amountOverride?: number;
  slip: string;
  busy: boolean;
  error: string;
  onPick: (f: File) => void;
  onClear: () => void;
}) {
  const amount = amountOverride || deposit.amount;
  // QR ผูกยอดไว้ — ถ้ายอดของนัดไม่ตรงกับยอดปัจจุบันในตั้งค่า (ร้านเพิ่งแก้) อย่าโชว์ QR ยอดผิด
  const showQr = !!deposit.qr && (!amountOverride || amountOverride === deposit.amount);
  return (
    <div className="mt-4 rounded-petflow border border-honey-deep/40 bg-honey/10 p-4 shadow-petflow-sm">
      <p className="text-xs font-bold text-brown-soft">💰 มัดจำเพื่อยืนยันคิว</p>
      <p className="mt-0.5 text-2xl font-extrabold text-petflow-chocolate">
        {amount.toLocaleString()} <span className="text-sm">บาท</span>
      </p>
      {showQr ? (
        <div className="mt-3 flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={deposit.qr}
            alt={`QR พร้อมเพย์ ${amount} บาท`}
            className="h-52 w-52 rounded-petflow-sm bg-white p-2"
          />
          <p className="mt-1.5 text-center text-[11px] text-brown-soft">
            สแกนด้วยแอปธนาคาร — ยอดขึ้นให้อัตโนมัติ
            {deposit.promptpay ? ` · พร้อมเพย์ ${deposit.promptpay}` : ""}
            {deposit.accountName ? ` · ${deposit.accountName}` : ""}
          </p>
          <a
            href={deposit.qr}
            download="deposit-qr.png"
            className="mt-1.5 rounded-full bg-card px-3 py-1 text-[11px] font-bold text-latte-deep ring-1 ring-petflow-line"
          >
            บันทึกรูป QR
          </a>
        </div>
      ) : deposit.accountNumber ? (
        <p className="mt-2 rounded-petflow-sm bg-card px-3 py-2 text-xs text-brown">
          โอนเข้า {deposit.bankName} <b>{deposit.accountNumber}</b>
          {deposit.accountName ? ` (${deposit.accountName})` : ""}
        </p>
      ) : null}

      <label className="mt-3 flex min-h-[56px] cursor-pointer items-center gap-3 rounded-petflow-sm border border-dashed border-petflow-line bg-paper px-3 py-3">
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
            e.target.value = "";
          }}
        />
        {slip ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slip} alt="สลิปโอนมัดจำ" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card text-lg">
            🧾
          </span>
        )}
        <span className="text-xs font-bold text-brown-soft">
          {busy ? "กำลังแนบสลิป…" : slip ? "แนบสลิปแล้ว — แตะเพื่อเปลี่ยนรูป" : "โอนแล้ว แตะเพื่อแนบสลิป"}
        </span>
      </label>
      {slip && (
        <button
          type="button"
          onClick={onClear}
          className="mt-1.5 text-[11px] font-bold text-brown-faint underline"
        >
          เอาสลิปออก
        </button>
      )}
      {error && <p className="mt-1.5 text-[11px] font-bold text-wait">{error}</p>}
    </div>
  );
}
