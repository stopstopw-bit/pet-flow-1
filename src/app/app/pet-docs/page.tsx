"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiff } from "@/components/LiffProvider";
import { useConfig } from "@/components/ConfigProvider";
import type { Booking } from "@/lib/business";
import { LoadingScreen } from "@/components/LoadingScreen";
import { toJpegDataUrl } from "@/lib/image-convert";
import { BTN_PRIMARY, PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { MAX_VACCINE_PHOTOS, splitVaccinePhotos } from "@/lib/vaccine-photos";
import { idCardPurpose, watermarkIdCard } from "@/lib/id-card-watermark";

type StayBooking = Booking & { checkin?: string; room?: string; vaccinePhotoUrl?: string };

/**
 * หน้าแนบเอกสารก่อนเข้าพัก — เปิดจากการ์ด "ขอสมุดวัคซีน" / "ขอบัตรประชาชน" ที่ร้านส่งทาง LINE
 * แนบอย่างเดียว ไม่ต้องเซ็นข้อตกลงซ้ำ · need=vaccine แนบแยกทีละตัว (จองทั้งบ้านได้หลายตัว) · need=idcard บัตรผู้ปกครอง
 */
function PetDocsContent() {
  const params = useSearchParams();
  const need = params.get("need") === "idcard" ? "idcard" : "vaccine";
  const ids = (params.get("id") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const idsKey = ids.join(",");
  const { profile, ready } = useLiff();
  const { config } = useConfig();
  const [bookings, setBookings] = useState<StayBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.lineUserId) return;
    const q = new URLSearchParams({ lineUserId: profile.lineUserId });
    fetch(`/api/bookings?${q}`)
      .then((r) => r.json())
      .then((data) => {
        const list: StayBooking[] = data.bookings || [];
        const wanted = idsKey.split(",").filter(Boolean);
        setBookings(wanted.length ? list.filter((b) => wanted.includes(b.id)) : []);
      })
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
  }, [profile?.lineUserId, idsKey]);

  const stay = bookings[0];

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader
        eyebrow={need === "vaccine" ? "Vaccine book" : "ID card"}
        title={need === "vaccine" ? "แนบสมุดวัคซีนน้อง" : "แนบบัตรประชาชนผู้ปกครอง"}
        subtitle={`${config.business.name} — ใช้ประกอบการรับน้องเข้าใช้บริการ`}
        back="/app"
        backLabel="กลับหน้าแรก"
        showLang={false}
      />

      {!ready || (loading && !!profile?.lineUserId) ? (
        <LoadingScreen />
      ) : need === "idcard" ? (
        <IdCardSection stay={stay} />
      ) : bookings.length === 0 ? (
        <EmptyState icon="calendar" title="ไม่พบข้อมูลการนัด" />
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => (
            <VaccineSection key={b.id} booking={b} />
          ))}
        </div>
      )}
    </div>
  );
}

function StayLine({ b }: { b: StayBooking }) {
  return (
    <p className="text-xs text-brown-soft">
      {b.service === "room" ? "เข้าพัก" : "นัด"}: {b.checkin || b.date}
      {b.checkout ? ` → ${b.checkout}` : ""}
      {b.room ? ` · ห้อง ${b.room}` : ""}
    </p>
  );
}

function VaccineSection({ booking }: { booking: StayBooking }) {
  const [sentCount, setSentCount] = useState(splitVaccinePhotos(booking.vaccinePhotoUrl).length);
  const [photos, setPhotos] = useState<string[]>([]);
  const [converting, setConverting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // สมุดวัคซีนมักมีหลายหน้า → เลือกได้ทีละหลายรูป
  const addPhotos = async (files: FileList) => {
    setConverting(true);
    try {
      const room = MAX_VACCINE_PHOTOS - photos.length;
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, Math.max(0, room))) {
        try {
          urls.push(await toJpegDataUrl(f));
        } catch {
          /* แปลงรูปไหนไม่สำเร็จก็ข้ามรูปนั้นไป */
        }
      }
      setPhotos((prev) => [...prev, ...urls].slice(0, MAX_VACCINE_PHOTOS));
      setDone(false);
    } finally {
      setConverting(false);
    }
  };

  const send = async () => {
    if (!photos.length) return;
    setSaving(true);
    try {
      const res = await fetch("/api/bookings/vaccine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id, photos }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(res.status));
      setSentCount(data.count ?? sentCount + photos.length);
      setPhotos([]);
      setDone(true);
    } catch {
      alert("ส่งรูปไม่สำเร็จ ลองใหม่อีกครั้งนะคะ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
          <Icon name="paw" size={20} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-petflow-chocolate">{booking.catName}</p>
          <StayLine b={booking} />
        </div>
      </div>

      {sentCount > 0 && (
        <p className="mb-2 flex items-center gap-1.5 rounded-petflow-sm bg-sage/20 px-3 py-2 text-[11px] font-bold text-ok">
          <Icon name="check" size={14} strokeWidth={2.4} />
          ร้านได้รับสมุดวัคซีนแล้ว {sentCount} รูป{done ? " — ขอบคุณค่ะ 🧡" : " · แนบเพิ่มได้"}
        </p>
      )}

      {photos.length > 0 && (
        <div className="mb-2 grid grid-cols-3 gap-2">
          {photos.map((src, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`สมุดวัคซีน ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
              <button
                type="button"
                aria-label="ลบรูปนี้"
                onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {photos.length < MAX_VACCINE_PHOTOS && (
        <label className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-petflow-sm border border-dashed border-petflow-line bg-paper px-3 py-3">
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addPhotos(e.target.files);
              e.target.value = "";
            }}
          />
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card text-brown-soft">
            <Icon name={photos.length ? "plus" : "image"} size={20} />
          </span>
          <span className="text-xs font-bold text-brown-soft">
            {converting
              ? "กำลังแนบรูป…"
              : photos.length
                ? `เพิ่มรูปอีก (สูงสุด ${MAX_VACCINE_PHOTOS} รูป)`
                : "แตะเพื่อถ่าย/เลือกรูปสมุดวัคซีน (เลือกได้หลายรูป)"}
          </span>
        </label>
      )}

      <button
        type="button"
        disabled={!photos.length || saving || converting}
        onClick={send}
        className={`mt-3 ${BTN_PRIMARY}`}
      >
        {saving ? "กำลังส่ง…" : photos.length ? `ส่ง ${photos.length} รูปให้ร้าน` : "เลือกรูปก่อนนะคะ"}
      </button>
    </section>
  );
}

function IdCardSection({ stay }: { stay?: StayBooking }) {
  const { profile } = useLiff();
  const { config } = useConfig();
  const [idCardUrl, setIdCardUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [justSent, setJustSent] = useState(false);

  useEffect(() => {
    if (!profile?.lineUserId) return;
    const q = new URLSearchParams({ lineUserId: profile.lineUserId });
    fetch(`/api/customers/self?${q}`)
      .then((r) => r.json())
      .then((d) => setIdCardUrl(d?.customer?.idCardUrl || ""))
      .catch(() => {});
  }, [profile?.lineUserId]);

  // ขีดทับบนเครื่องลูกค้าก่อน แล้วค่อยส่งขึ้นระบบ — รูปบัตรแบบไม่มีข้อความไม่เคยออกจากมือถือ
  const upload = async (file: File) => {
    if (!profile?.lineUserId) {
      alert("ยังเชื่อมบัญชี LINE ไม่เสร็จ — ปิดหน้านี้แล้วเปิดลิงก์จากแชท LINE ใหม่อีกครั้งนะคะ");
      return;
    }
    setBusy(true);
    try {
      const image = await watermarkIdCard(file, undefined, config.business.name);
      const res = await fetch("/api/customers/id-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineUserId: profile.lineUserId, image }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(`upload ${res.status}`);
      setIdCardUrl(data.url);
      setJustSent(true);
    } catch (e) {
      const msg = e instanceof Error && !e.message.startsWith("upload") ? e.message : "";
      alert(msg || "แนบรูปบัตรไม่สำเร็จ ลองใหม่อีกครั้งนะคะ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
      {stay && (
        <div className="mb-3">
          <p className="truncate text-sm font-extrabold text-petflow-chocolate">{stay.catName}</p>
          <StayLine b={stay} />
        </div>
      )}
      <p className="mb-2 text-[11px] text-brown-faint">
        ระบบจะพิมพ์ข้อความขีดทับลงในรูปให้อัตโนมัติก่อนส่ง: &quot;{idCardPurpose(config.business.name)}&quot;
        แนบครั้งเดียวพอ รอบต่อไปไม่ต้องแนบอีก
      </p>
      {idCardUrl && (
        <>
          <p className="mb-2 flex items-center gap-1.5 rounded-petflow-sm bg-sage/20 px-3 py-2 text-[11px] font-bold text-ok">
            <Icon name="check" size={14} strokeWidth={2.4} />
            {justSent ? "ส่งบัตรให้ร้านแล้ว ขอบคุณค่ะ 🧡" : "ร้านมีบัตรของคุณแล้ว · แตะด้านล่างถ้าต้องการเปลี่ยนรูป"}
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={idCardUrl}
            alt="บัตรประชาชน (ขีดทับแล้ว)"
            className="mb-2 w-full rounded-lg border border-petflow-line object-contain"
          />
        </>
      )}
      <label className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-petflow-sm border border-dashed border-petflow-line bg-paper px-3 py-3">
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card text-brown-soft">
          <Icon name="image" size={20} />
        </span>
        <span className="text-xs font-bold text-brown-soft">
          {busy
            ? "กำลังขีดทับและแนบรูป…"
            : idCardUrl
              ? "แตะเพื่อเปลี่ยนรูปบัตร"
              : "แตะเพื่อถ่าย/เลือกรูปบัตรประชาชน"}
        </span>
      </label>
    </section>
  );
}

export default function PetDocsPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <PetDocsContent />
    </Suspense>
  );
}
