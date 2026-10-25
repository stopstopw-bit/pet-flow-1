"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiff } from "@/components/LiffProvider";
import { formatThaiDateShort } from "@/lib/format-thai-date";
import { LoadingScreen } from "@/components/LoadingScreen";
import { BTN_PRIMARY, PageHeader } from "@/components/PageHeader";
import { EmptyState, SectionLabel } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { TimeSlotPicker } from "@/components/TimeSlotPicker";

type Bk = {
  id: string;
  catName: string;
  service: string;
  checkin?: string;
  checkout?: string;
  arrivalTime?: string;
  pickupTime?: string;
  shopPickup?: boolean;
  shopDropoff?: boolean;
};

function BookingTimeContent() {
  const params = useSearchParams();
  const id = params.get("id") || "";
  const type = params.get("type") === "checkout" ? "checkout" : "checkin";
  const { profile } = useLiff();

  const [bk, setBk] = useState<Bk | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const isCheckin = type === "checkin";

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    fetch(`/api/bookings/time?id=${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.found) {
          setBk(d.booking);
          setSaved(type === "checkin" ? d.booking.arrivalTime : d.booking.pickupTime);
        }
      })
      .finally(() => setLoading(false));
  }, [id, type]);

  const pick = async (time: string) => {
    if (!time || !id) return;
    setSaving(true);
    try {
      const res = await fetch("/api/bookings/time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: id,
          type,
          time,
          lineUserId: profile?.lineUserId,
        }),
      });
      if (res.ok) setSaved(time);
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    try {
      const liff = (await import("@line/liff")).default;
      if (liff.isInClient()) liff.closeWindow();
    } catch {
      /* ไม่ได้เปิดใน LINE — โชว์หน้าจอเสร็จสิ้นแทน */
    }
    setDone(true);
  };

  const dateLabel = isCheckin ? bk?.checkin : bk?.checkout;
  // นัดที่ใช้บริการรับ-ส่ง: ร้านเป็นฝ่ายเดินทาง ไม่ใช่ลูกค้า "มาส่ง/มารับ"
  const shopGoes = isCheckin ? !!bk?.shopPickup : !!bk?.shopDropoff;
  const title = shopGoes
    ? isCheckin
      ? "เลือกเวลาให้ร้านไปรับน้อง"
      : "เลือกเวลาให้ร้านไปส่งน้องที่บ้าน"
    : isCheckin
      ? "เลือกเวลาที่จะมาส่งน้อง"
      : "เลือกเวลาที่จะมารับน้อง";

  if (done) {
    return (
      <div className="px-4 pb-6 pt-10">
        <div className="rounded-petflow border border-petflow-line bg-card p-6 text-center shadow-petflow">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage/25 text-ok">
          <Icon name="check" size={28} strokeWidth={2.4} />
        </span>
        <h1 className="mt-4 text-lg font-extrabold text-petflow-chocolate">
          บันทึกเวลาเรียบร้อยแล้ว!
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-brown-soft">
          {shopGoes
            ? isCheckin
              ? `ร้านจะไปรับ${bk?.catName || "น้อง"}ตามจุดรับ-ส่งตอน ${saved} นะคะ 🚗`
              : `ร้านจะพา${bk?.catName || "น้อง"}ไปส่งที่บ้านตอน ${saved} นะคะ 🚗`
            : isCheckin
              ? `เราจะเตรียมห้องรอต้อนรับ${bk?.catName || "น้อง"}ตอน ${saved} นะคะ 🐾`
              : `เราจะเตรียม${bk?.catName || "น้อง"}ให้พร้อมก่อนกลับบ้านตอน ${saved} นะคะ 🐾`}
          <br />
          กลับไปที่แชท LINE ได้เลยค่ะ
        </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader
        eyebrow={shopGoes ? (isCheckin ? "Pick-up by shop" : "Delivery time") : isCheckin ? "Drop-off time" : "Pick-up time"}
        title={title}
        back="/app"
        backLabel="กลับหน้าแรก"
        showLang={false}
      />

      {loading ? (
        <LoadingScreen />
      ) : !bk ? (
        <div className="rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
          <EmptyState icon="calendar" title="ไม่พบข้อมูลการจอง" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
              <Icon name="paw" size={20} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-petflow-chocolate">{bk.catName}</p>
              <p className="text-xs text-brown-soft">
                {isCheckin ? "วันเข้าพัก" : "วันรับน้อง"}:{" "}
                {dateLabel ? formatThaiDateShort(dateLabel) : "—"}
              </p>
            </div>
          </div>

          <section className="mt-5">
            <SectionLabel>{saved ? "Change time · เปลี่ยนเวลา (ถ้าต้องการ)" : "Time · เลือกเวลา"}</SectionLabel>
            <div className="rounded-petflow border border-petflow-line bg-paper p-3 shadow-petflow-sm">
              <TimeSlotPicker value={saved} onPick={pick} disabled={saving} />
            </div>
          </section>

          {saved && (
            <div className="mt-5 rounded-petflow bg-sage/15 p-4">
              <p className="flex items-center justify-center gap-1.5 text-base font-extrabold text-petflow-chocolate">
                <Icon name="check" size={18} strokeWidth={2.4} className="text-ok" />
                เลือกเวลา {saved} แล้ว
              </p>
              <p className="mt-1 text-center text-xs text-brown-soft">
                ถ้าถูกต้องแล้ว กดปุ่มด้านล่างเพื่อยืนยันและกลับไปที่แชทได้เลยค่ะ 🧡
              </p>
              <button type="button" onClick={finish} className={`mt-3 ${BTN_PRIMARY}`}>
                เสร็จแล้ว — กลับไปที่แชท
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function BookingTimePage() {
  return (
    <Suspense
      fallback={<LoadingScreen />}
    >
      <BookingTimeContent />
    </Suspense>
  );
}
