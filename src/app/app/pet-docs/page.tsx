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
import { IntakeFlowBar } from "@/components/IntakeFlowBar";
import { flowProgress } from "@/lib/intake-flow";

type StayBooking = Booking & { checkin?: string; room?: string; vaccinePhotoUrl?: string };

type SelfCat = { id: string; name: string; vaccineCount: number; hasPetInfo: boolean; hasStayInfo: boolean };

/** สิ่งที่แนบสมุดวัคซีนให้ — นัด (ลิงก์จากการ์ดนัด) หรือ ตัวน้อง (ลิงก์จากหน้าข้อมูลลูกค้า ยังไม่มีนัด) */
type VaccineTarget = {
  key: string;
  catName: string;
  booking?: StayBooking;
  catId?: string;
  initialCount: number;
};

/**
 * หน้าแนบเอกสารก่อนเข้าพัก — เปิดจากการ์ด "ขอสมุดวัคซีน" / "ขอบัตรประชาชน" ที่ร้านส่งทาง LINE
 * แนบอย่างเดียว ไม่ต้องเซ็นข้อตกลงซ้ำ · need=vaccine แนบแยกทีละตัว · need=idcard บัตรผู้ปกครอง
 * id = นัด (ส่งจากการ์ดนัด) · cats = ตัวน้อง (ส่งจากหน้าข้อมูลลูกค้า ยังไม่ต้องมีนัด)
 */
function PetDocsContent() {
  const params = useSearchParams();
  const need = params.get("need") === "idcard" ? "idcard" : "vaccine";
  const split = (v: string | null) =>
    (v || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .join(",");
  const idsKey = split(params.get("id"));
  const catsKey = split(params.get("cats"));
  const { profile, ready } = useLiff();
  const { config } = useConfig();
  const [bookings, setBookings] = useState<StayBooking[]>([]);
  const [cats, setCats] = useState<SelfCat[]>([]);
  const [loading, setLoading] = useState(true);
  // กลับมาจากหน้ากรอกประวัติ (ปุ่มย้อนกลับ) → โหลดใหม่ ลิงก์ชวนกรอกจะได้หายไปเมื่อกรอกครบแล้ว
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === "visible") setReloadKey((k) => k + 1);
    };
    window.addEventListener("pageshow", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("pageshow", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, []);

  useEffect(() => {
    if (!profile?.lineUserId) return;
    const q = new URLSearchParams({ lineUserId: profile.lineUserId });
    Promise.all([
      idsKey
        ? fetch(`/api/bookings?${q}`)
            .then((r) => r.json())
            .then((data) => {
              const list: StayBooking[] = data.bookings || [];
              const wanted = idsKey.split(",");
              setBookings(list.filter((b) => wanted.includes(b.id)));
            })
        : Promise.resolve(),
      fetch(`/api/customers/self?${q}`)
        .then((r) => r.json())
        .then((d) => setCats(d?.customer?.cats || [])),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profile?.lineUserId, idsKey, reloadKey]);

  const stay = bookings[0];
  const targets: VaccineTarget[] = idsKey
    ? bookings.map((b) => ({
        key: b.id,
        catName: b.catName,
        booking: b,
        initialCount: splitVaccinePhotos(b.vaccinePhotoUrl).length,
      }))
    : cats
        .filter((c) => !catsKey || catsKey.split(",").includes(c.id))
        .map((c) => ({ key: c.id, catName: c.name, catId: c.id, initialCount: c.vaccineCount }));

  // ยังไม่ได้แจ้งประวัติน้อง → ชวนกรอกต่อในหน้าเดียวกันเลย ไม่ต้องรอร้านส่งลิงก์ใหม่
  // นัดอาบน้ำ = ประวัติก่อนอาบน้ำ · นัดเข้าพัก/ลิงก์จากหน้าลูกค้า = ข้อมูลก่อนเข้าพัก
  // กรอกแล้วไม่ชวนซ้ำ — จับคู่ชื่อแบบไม่สนช่องว่าง/ตัวพิมพ์ (ชื่อในนัดกับในบัญชีอาจพิมพ์ต่างกันนิดหน่อย)
  // หาน้องในบัญชีไม่เจอ = ไม่รู้ว่ากรอกหรือยัง ไม่ชวน (ฟอร์มก่อนเข้าพักก็บันทึกให้น้องที่ไม่มีในบัญชีไม่ได้อยู่แล้ว)
  const isStayTarget = (t: VaccineTarget) => !t.booking || t.booking.service === "room";
  const nameKey = (n: string) => n.replace(/\s+/g, "").toLowerCase();
  const noInfo = targets.filter((t) => {
    const cat = t.catId
      ? cats.find((c) => c.id === t.catId)
      : cats.find((c) => nameKey(c.name) === nameKey(t.catName));
    if (!cat) return false;
    return isStayTarget(t) ? !cat.hasStayInfo : !cat.hasPetInfo;
  });
  const shop =
    typeof window !== "undefined" ? window.location.pathname.match(/^\/s\/[a-z0-9-]+/i)?.[0] || "" : "";
  // มาจากการ์ดรวมขอข้อมูล (ไล่ทีละหน้า) = ขั้นประวัติผ่านมาแล้ว/ไม่ต้องทำ — ไม่ชวนกรอกซ้ำ
  const inFlow = !!flowProgress(params);
  const infoHref = idsKey
    ? `${shop}/app/groom-info?id=${noInfo.map((t) => t.key).join(",")}`
    : `${shop}/app/groom-info?cats=${noInfo.map((t) => t.key).join(",")}&kind=stay`;

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
      <IntakeFlowBar mode="progress" />

      {!ready || (loading && !!profile?.lineUserId) ? (
        <LoadingScreen />
      ) : need === "idcard" ? (
        <>
          <IdCardSection stay={stay} />
          <IntakeFlowBar mode="next" />
        </>
      ) : targets.length === 0 ? (
        <EmptyState icon="paw" title="ไม่พบข้อมูลน้อง" />
      ) : (
        <div className="space-y-4">
          {targets.map((t) => (
            <VaccineSection key={t.key} target={t} />
          ))}
          {!inFlow && noInfo.length > 0 && (
            <a
              href={infoHref}
              className="flex min-h-[56px] items-center gap-3 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
                <Icon name="edit" size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-petflow-chocolate">แจ้งประวัติน้องต่อเลย</span>
                <span className="block text-[11px] text-brown-soft">
                  นิสัย สุขภาพ การดูแล — ให้ร้านเตรียมดูแลน้องได้ถูกวิธี
                </span>
              </span>
              <Icon name="chevron" size={16} className="text-brown-faint" />
            </a>
          )}
          <IntakeFlowBar mode="next" />
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

function VaccineSection({ target }: { target: VaccineTarget }) {
  const booking = target.booking;
  const [sentCount, setSentCount] = useState(target.initialCount);
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
      const res = await fetch(booking ? "/api/bookings/vaccine" : "/api/customers/cat-vaccine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(booking ? { bookingId: booking.id, photos } : { catId: target.catId, photos }),
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
          <p className="truncate text-sm font-extrabold text-petflow-chocolate">{target.catName}</p>
          {booking && <StayLine b={booking} />}
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
