"use client";

import { savedPopup } from "@/components/Toast";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiff } from "@/components/LiffProvider";
import { useConfig } from "@/components/ConfigProvider";
import type { Booking } from "@/lib/business";

import {
  DEEMED_CONSENT_NOTICE,
  DEEMED_GROOM_CONSENT_NOTICE,
  GROOM_CONSENT_CONFIRM,
  DEEMED_CONSENT_NOTICE_EN,
  DEEMED_GROOM_CONSENT_NOTICE_EN,
  GROOM_CONSENT_CONFIRM_EN,
  consentTextFor,
} from "@/lib/messages";
import { LoadingScreen } from "@/components/LoadingScreen";
import { toJpegDataUrl } from "@/lib/image-convert";
import { BTN_PRIMARY, PageHeader } from "@/components/PageHeader";
import { IntakeFlowBar } from "@/components/IntakeFlowBar";
import { SectionLabel } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { MAX_VACCINE_PHOTOS } from "@/lib/vaccine-photos";
import { FLEA_PROOF_MAX, consentFleaProofOn, fleaLegalNote } from "@/lib/flea-proof";
import { flowProgress } from "@/lib/intake-flow";
import { idCardPurpose, watermarkIdCard } from "@/lib/id-card-watermark";
import { isFeatureOn } from "@/lib/features";
import { customerFetch } from "@/lib/customer-fetch";
import { bookingGroupKey, groupCatNames, stayForGroom } from "@/lib/booking-group";
import { formatDateShort, roomWithWord } from "@/lib/format-thai-date";
import { useLocale, useTr } from "@/components/LocaleProvider";
import { groomUsesCard } from "@/lib/intake-rules";
import { ContentBlocks } from "@/components/ContentBlocks";

type StayBooking = Booking & {
  checkin?: string;
  room?: string;
  consentAcceptedAt?: string;
  careNote?: string;
  vaccinePhotoUrl?: string;
};

function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);
  const tr = useTr();

  const getCtx = () => canvasRef.current?.getContext("2d") || null;

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#4E3E32";
    ctx.lineTo(x, y);
    ctx.stroke();
    hasDrawn.current = true;
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasDrawn.current && canvasRef.current) {
      onChange(canvasRef.current.toDataURL("image/png"));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
    onChange("");
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full touch-none rounded-petflow-sm border border-petflow-line bg-white"
        style={{ height: 140 }}
      />
      <button
        type="button"
        onClick={clear}
        className="-ml-1 mt-1 flex min-h-[44px] items-center gap-1.5 px-1 text-xs font-bold text-brown-soft"
      >
        <Icon name="x" size={14} />
        {tr("ล้างลายเซ็น", "Clear signature")}
      </button>
    </div>
  );
}

/** "หัวข้อ — เนื้อหา" → หัวข้อตัวหนาบรรทัดแรก (ข้อตกลงที่ไม่มีหัวข้อโชว์ตามเดิม) */
function TermText({ term }: { term: string }) {
  const m = term.match(/^(.{2,60}?) — ([\s\S]+)$/);
  if (!m) return <span className="min-w-0">{term}</span>;
  return (
    <span className="min-w-0">
      <span className="block font-extrabold text-petflow-chocolate">{m[1]}</span>
      {m[2]}
    </span>
  );
}

function ConsentContent() {
  const params = useSearchParams();
  const bookingIdParam = params.get("id") || "";
  // ลิงก์จากหน้าข้อมูลลูกค้า (ยังไม่มีนัด) — ยอมรับแล้วเก็บไว้ที่ลูกค้า ไม่ผูกนัด
  const customerMode = params.get("mode") === "customer";
  const { profile, ready } = useLiff();
  const { config } = useConfig();
  const { locale } = useLocale();
  const tr = useTr();
  const [booking, setBooking] = useState<StayBooking | null>(null);
  /** ชื่อน้องทุกตัวในนัดเดียวกัน — กดยอมรับครั้งเดียวได้ทั้งบ้าน */
  const [catLabel, setCatLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [careNote, setCareNote] = useState("");
  const [signature, setSignature] = useState("");
  const [signError, setSignError] = useState(false);
  /** น้องทุกตัวในนัดเดียวกัน — สมุดวัคซีนแนบแยกทีละตัว (เมื่อก่อนชุดเดียวไปติดตัวแรก) */
  const [groupCats, setGroupCats] = useState<{ id: string; catName: string }[]>([]);
  // อาบน้ำหลายตัวคนละรอบเวลา (วันเดียวกัน) — โชว์ทุกรอบ ลูกค้าจะรู้ว่ากดครั้งเดียวครอบคลุมทุกตัว
  const [groomTimes, setGroomTimes] = useState<string[]>([]);
  const [vaccineByCat, setVaccineByCat] = useState<Record<string, string[]>>({});
  const [vaccineUploading, setVaccineUploading] = useState("");
  // น้องทุกตัวในนัดนี้แนบสมุดวัคซีนไว้แล้ว (ขั้นแนบสมุดวัคซีน / พนักงานแนบให้) → ไม่ถามซ้ำ
  const [vaccineOnFile, setVaccineOnFile] = useState(false);
  // มาจากการ์ดรวมขอข้อมูล (ไล่ทีละหน้า) — สมุดวัคซีนมีขั้นของตัวเองแล้ว ไม่ถามซ้ำในหน้านี้
  const inFlow = !!flowProgress(params, locale);
  const [fleaTickTreated, setFleaTickTreated] = useState(false);
  const [idCardUrl, setIdCardUrl] = useState("");
  // แนบบัตรในหน้านี้รอบนี้ — บอกเซิร์ฟเวอร์ให้ส่งรูปบัตรตามข้อความสรุปใน Telegram
  const [idCardNew, setIdCardNew] = useState(false);
  // เคยแนบบัตรไว้แล้วจากรอบก่อน → ไม่ถามซ้ำ (ขอครั้งเดียวพอ)
  const [idCardOnFile, setIdCardOnFile] = useState(false);
  const [idCardBusy, setIdCardBusy] = useState(false);
  const [fleaError, setFleaError] = useState(false);
  // รูปหลักฐานการหยดยา (ไม่บังคับ) — ส่งไปพร้อมตอนกดยอมรับข้อตกลง
  const [fleaPhotos, setFleaPhotos] = useState<string[]>([]);
  const [fleaConverting, setFleaConverting] = useState(false);
  /** อาบน้ำก่อนกลับของรอบเข้าพักนี้ — มีแล้วต้องอ่านข้อตกลงอาบน้ำด้วย ยอมรับครั้งเดียวในหน้านี้ */
  const [stayBath, setStayBath] = useState<{ date: string; time?: string } | null>(null);

  // นัดอาบน้ำใช้ข้อตกลงอาบน้ำ (แยกจากกฎเข้าพัก) — ไม่มีบัตรประชาชน/ยาเห็บหมัดก่อนเข้าพัก
  // ลิงก์ "กฎอาบน้ำ/นวด" จากหน้าข้อมูลลูกค้า (ยังไม่มีนัด) — ใช้ข้อตกลงอาบน้ำ
  const groomLink = customerMode && params.get("kind") === "groom";
  const isGroom = booking?.service === "groom" || groomLink;
  const { title: consentTitle, terms } = consentTextFor(config.messages, groomLink ? "groom" : booking?.service, locale);
  const groomText = consentTextFor(config.messages, "groom", locale);
  // ร้านที่ไม่ขอข้อตกลงอาบน้ำ (ตั้งค่า › ขอข้อมูลตามบริการ) ก็ไม่ต้องโชว์ตรงนี้
  const showBathTerms = !isGroom && !!stayBath && groomUsesCard(config, "consent");

  useEffect(() => {
    if (!profile?.lineUserId) return;
    if (customerMode) {
      setLoading(false);
      return;
    }
    const q = new URLSearchParams({ lineUserId: profile.lineUserId });
    fetch(`/api/bookings?${q}`)
      .then((r) => r.json())
      .then((data) => {
        const list: StayBooking[] = data.bookings || [];
        // ถ้ามี id ระบุมาชัดเจน (จากลิงก์ที่ส่งเจาะจงนัดนั้น) ใช้ตัวนั้นเป๊ะๆ —
        // แต่ละรอบเข้าพักต้องยอมรับแยกกันเสมอ ไม่ใช้ "นัดที่ใกล้ที่สุด" เดาแทน
        const stay = bookingIdParam
          ? list.find((b) => b.id === bookingIdParam) || null
          : list
              .filter((b) => b.service === "room" && b.status !== "cancelled")
              .sort((a, b) => (a.checkin || a.date).localeCompare(b.checkin || b.date))[0] || null;
        setBooking(stay);
        if (stay) {
          const key = bookingGroupKey(stay, { groomByDay: true });
          const group = list.filter(
            (b) => bookingGroupKey(b, { groomByDay: true }) === key && b.status !== "cancelled"
          );
          setCatLabel(groupCatNames(group));
          setGroomTimes(Array.from(new Set(group.map((b) => b.time || "").filter(Boolean))).sort());
          if (stay.service === "room") {
            const bath = list.find((x) => group.some((s) => stayForGroom(x, [s]) === s));
            setStayBath(bath ? { date: bath.date, time: bath.time } : null);
          }
          setVaccineOnFile(group.length > 0 && group.every((b) => !!b.vaccinePhotoUrl?.trim()));
          // ตัวที่ลิงก์ชี้มาก่อน แล้วตามด้วยตัวอื่นในบ้าน
          setGroupCats(
            [stay, ...group.filter((b) => b.id !== stay.id)].map((b) => ({ id: b.id, catName: b.catName }))
          );
        }
        if (stay?.consentAcceptedAt) setAccepted(true);
        if (stay?.careNote) setCareNote(stay.careNote);
      })
      .catch(() => setBooking(null))
      .finally(() => setLoading(false));
  }, [profile?.lineUserId, bookingIdParam, customerMode]);

  // บัตรประชาชนผูกกับลูกค้า — เคยแนบไว้แล้วก็โชว์ ไม่ต้องแนบซ้ำทุกรอบ
  useEffect(() => {
    if (!profile?.lineUserId) return;
    const q = new URLSearchParams({ lineUserId: profile.lineUserId });
    customerFetch(`/api/customers/self?${q}`)
      .then((r) => r.json())
      .then((d) => {
        const url = d?.customer?.idCardUrl || "";
        setIdCardUrl(url);
        setIdCardOnFile(Boolean(url));
      })
      .catch(() => {});
  }, [profile?.lineUserId]);

  // ขีดทับบนเครื่องลูกค้าก่อน แล้วค่อยส่งขึ้นระบบ — รูปบัตรแบบไม่มีข้อความไม่เคยออกจากมือถือ
  const uploadIdCard = async (file: File) => {
    // เดิมเงียบไปเฉยๆ ถ้ายังไม่รู้ว่าเป็นใคร — ลูกค้าเลยคิดว่ากดแล้วไม่เกิดอะไร
    if (!profile?.lineUserId) {
      alert(tr("ยังเชื่อมบัญชี LINE ไม่เสร็จ — ปิดหน้านี้แล้วเปิดลิงก์จากแชท LINE ใหม่อีกครั้งนะคะ", "Your LINE account isn't linked yet. Please close this page and open the link from the LINE chat again."));
      return;
    }
    setIdCardBusy(true);
    try {
      const image = await watermarkIdCard(file, undefined, config.business.name);
      const res = await customerFetch("/api/customers/id-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ไม่แจ้ง Telegram ตอนนี้ — รูปบัตรไปพร้อมข้อความสรุปตอนกดยอมรับ
        body: JSON.stringify({ lineUserId: profile.lineUserId, image, notify: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(`upload ${res.status}`);
      setIdCardUrl(data.url);
      setIdCardNew(true);
    } catch (e) {
      // ข้อความจาก watermarkIdCard (เช่น เปิดไฟล์ไม่ได้) บอกลูกค้าได้ตรงกว่า — ที่เหลือใช้ข้อความกลาง
      const msg = e instanceof Error && !e.message.startsWith("upload") ? e.message : "";
      alert(msg || tr("แนบรูปบัตรไม่สำเร็จ ลองใหม่อีกครั้งนะคะ", "Couldn't attach the ID card photo. Please try again."));
    } finally {
      setIdCardBusy(false);
    }
  };

  const addFleaPhotos = async (files: FileList) => {
    setFleaConverting(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, FLEA_PROOF_MAX - fleaPhotos.length)) {
        try {
          urls.push(await toJpegDataUrl(f));
        } catch {
          /* ข้ามรูปที่เปิดไม่ได้ */
        }
      }
      setFleaPhotos((prev) => [...prev, ...urls].slice(0, FLEA_PROOF_MAX));
    } finally {
      setFleaConverting(false);
    }
  };

  const submit = async () => {
    if ((!booking && !customerMode) || !profile?.lineUserId) return;
    let hasError = false;
    if (!signature) {
      setSignError(true);
      hasError = true;
    }
    if (!fleaTickTreated && !isGroom) {
      setFleaError(true);
      hasError = true;
    }
    if (hasError) return;
    setSignError(false);
    setFleaError(false);
    setSaving(true);
    try {
      const res = await fetch(customerMode ? "/api/customers/consent" : "/api/bookings/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: booking?.id,
          lineUserId: profile.lineUserId,
          careNote: careNote.trim(),
          signature,
          vaccinePhotos: booking ? vaccineByCat[booking.id] || [] : [],
          vaccinePhotosByBooking: vaccineByCat,
          fleaTickTreated,
          fleaPhotos,
          idCardNew,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.needSql) {
        alert(
          tr("ระบบยังตั้งค่าไม่เสร็จ (แอดมินต้องรัน SQL ก่อน) — แต่รับทราบข้อตกลงของคุณแล้วค่ะ", "The system isn't fully set up yet, but your agreement has been received.")
        );
      }
      setAccepted(true);
      if (res.ok || data?.needSql) savedPopup(tr("ยอมรับข้อตกลงสำเร็จ", "Agreement accepted"), [tr("ร้านได้รับข้อตกลงที่เซ็นแล้วค่ะ", "The shop has received your signed agreement.")]);
    } finally {
      setSaving(false);
    }
  };

  // สมุดวัคซีนมักมีหลายหน้า → เลือกได้ทีละหลายรูป และกดเพิ่มต่อได้จนครบ MAX_VACCINE_PHOTOS
  const addVaccinePhotos = async (catId: string, files: FileList) => {
    setVaccineUploading(catId);
    try {
      const room = MAX_VACCINE_PHOTOS - (vaccineByCat[catId]?.length || 0);
      const picked = Array.from(files).slice(0, Math.max(0, room));
      const urls: string[] = [];
      for (const f of picked) {
        try {
          urls.push(await toJpegDataUrl(f));
        } catch {
          /* แปลงรูปไหนไม่สำเร็จก็ข้ามรูปนั้นไป */
        }
      }
      setVaccineByCat((prev) => ({
        ...prev,
        [catId]: [...(prev[catId] || []), ...urls].slice(0, MAX_VACCINE_PHOTOS),
      }));
    } finally {
      setVaccineUploading("");
    }
  };

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader
        // ลิงก์เจาะจงนัด: รู้ว่าเป็นนัดอาบน้ำหรือเข้าพักหลังโหลดนัดเสร็จ — ระหว่างนั้นไม่โชว์หัวข้อผิดชุด
        eyebrow={loading && bookingIdParam ? "Agreement" : isGroom ? "Grooming agreement" : "Boarding agreement"}
        title={loading && bookingIdParam ? tr("ข้อตกลงและเงื่อนไข", "Terms and conditions") : consentTitle}
        subtitle={
          isGroom
            ? `${config.business.name} — ${tr("เพื่อความปลอดภัยและสุขภาพที่ดีของน้อง กรุณาอ่านและยอมรับเงื่อนไขก่อนเข้ารับบริการ", "For your pet's safety and wellbeing, please read and accept these terms before the service.")}`
            : `${config.business.name} — ${tr("กรุณาอ่านและกดยอมรับก่อนวันเข้าพักของน้อง", "Please read and accept before your pet's stay.")}`
        }
        back="/app"
        backLabel={tr("กลับหน้าแรก", "Back to home")}
        showLang={false}
      />
      <IntakeFlowBar mode="progress" />

      {!ready || loading ? (
        <LoadingScreen />
      ) : (
        <>
          {booking && (
            <div className="flex items-center gap-3 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
                <Icon name={isGroom ? "bath" : "bed"} size={20} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-petflow-chocolate">{catLabel || booking.catName}</p>
                <p className="text-xs text-brown-soft">
                  {isGroom ? (
                    <>
                      {tr("นัดอาบน้ำ", "Grooming")}: {formatDateShort(booking.date, locale)}
                      {groomTimes.length
                        ? ` · ${groomTimes.join(", ")}${tr(" น.", "")}`
                        : booking.time
                          ? ` · ${booking.time}${tr(" น.", "")}`
                          : ""}
                    </>
                  ) : (
                    <>
                      {tr("เข้าพัก", "Stay")}: {formatDateShort(booking.checkin || booking.date, locale)}
                      {booking.checkout ? ` → ${formatDateShort(booking.checkout, locale)}` : ""}
                      {booking.room
                        ? ` · ${(locale === "en" ? (s: string) => s : roomWithWord)(config.rooms.find((r) => r.id === booking.room)?.name || booking.room)}`
                        : ""}
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          <section className="mt-5">
            <SectionLabel>{tr("Terms · ข้อตกลง", "Terms")}</SectionLabel>
            <ol className="divide-y divide-petflow-line overflow-hidden rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
              {terms.map((term, i) => (
                <li key={i} className="flex gap-3 px-4 py-3 text-xs leading-relaxed text-brown">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-honey/30 text-[11px] font-extrabold text-petflow-chocolate">
                    {i + 1}
                  </span>
                  <TermText term={term} />
                </li>
              ))}
            </ol>
            <p className="mt-2 rounded-petflow border border-petflow-line bg-cream px-3 py-2.5 text-[11px] leading-relaxed text-brown">
              {locale === "en"
                ? isGroom ? DEEMED_GROOM_CONSENT_NOTICE_EN : DEEMED_CONSENT_NOTICE_EN
                : isGroom ? DEEMED_GROOM_CONSENT_NOTICE : DEEMED_CONSENT_NOTICE}
            </p>
            {/* กฎเพิ่มเติมที่ร้านใส่เองใน ตั้งค่า › กฎระเบียบ — ต้องขึ้นในหน้าที่ลูกค้าเซ็นด้วย ไม่ใช่แค่หน้ากฎระเบียบ */}
            {!isGroom && <ContentBlocks blocks={config.boardingRules} />}
          </section>

          {/* เข้าพัก + อาบน้ำก่อนกลับ = นัดเดียว → กฎเข้าพักกับข้อตกลงอาบน้ำอยู่หน้าเดียว เซ็นครั้งเดียว */}
          {showBathTerms && stayBath && (
            <section className="mt-5">
              <SectionLabel>
                {`${groomText.title} · ${tr("อาบน้ำก่อนกลับ", "Bath before going home")} ${formatDateShort(stayBath.date, locale)}${stayBath.time ? ` ${stayBath.time}${tr(" น.", "")}` : ""}`}
              </SectionLabel>
              <ol className="divide-y divide-petflow-line overflow-hidden rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
                {groomText.terms.map((term, i) => (
                  <li key={i} className="flex gap-3 px-4 py-3 text-xs leading-relaxed text-brown">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-honey/30 text-[11px] font-extrabold text-petflow-chocolate">
                      {i + 1}
                    </span>
                    <TermText term={term} />
                  </li>
                ))}
              </ol>
              <p className="mt-2 rounded-petflow border border-petflow-line bg-cream px-3 py-2.5 text-[11px] leading-relaxed text-brown">
                {locale === "en" ? DEEMED_GROOM_CONSENT_NOTICE_EN : DEEMED_GROOM_CONSENT_NOTICE}
              </p>
            </section>
          )}

          <section className="mt-5 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
            <label className="flex items-center gap-1.5 text-xs font-bold text-petflow-chocolate">
              <Icon name="edit" size={14} />
              {tr("แจ้งการดูแลเพิ่มเติม (ไม่บังคับ)", "Extra care notes (optional)")}
            </label>
            <p className="mb-1.5 text-[11px] text-brown-faint">
              {isGroom
                ? tr("เช่น โรคประจำตัว · แพ้ยา/แพ้แชมพู · จุดที่ไม่ชอบให้จับ · นิสัยตอนอาบน้ำ", "e.g. health conditions · drug/shampoo allergies · spots they don't like touched · bath behaviour")
                : tr("เช่น อาหารที่กินประจำ/ปริมาณ · ยาที่ต้องให้ · นิสัย/สิ่งที่กลัว · โรคประจำตัว", "e.g. usual food/amount · medicine to give · habits/fears · health conditions")}
            </p>
            <textarea
              value={careNote}
              onChange={(e) => setCareNote(e.target.value)}
              disabled={accepted}
              rows={4}
              placeholder={tr("พิมพ์รายละเอียดการดูแลน้องที่อยากให้ทางร้านทราบ…", "Anything you'd like the shop to know about caring for your pet…")}
              className="w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm text-brown disabled:opacity-70"
            />
          </section>

          {accepted ? (
            <div className="mt-5 rounded-petflow bg-sage/20 p-4 text-center">
              <p className="flex items-center justify-center gap-1.5 text-sm font-extrabold text-petflow-chocolate">
                <Icon name="check" size={18} strokeWidth={2.4} className="text-ok" />
                {tr("รับทราบและยอมรับข้อตกลงแล้ว", "Agreement accepted")}
              </p>
              <p className="mt-1 text-xs text-brown-soft">
                {tr("ขอบคุณค่ะ ทางเราพร้อมดูแลน้องอย่างดีที่สุด 🧡", "Thank you! We'll take the very best care of your pet 🧡")}
              </p>
              <IntakeFlowBar mode="next" />
            </div>
          ) : (
            <>
              <section className="mt-5 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
                <label className="flex items-center gap-1.5 text-xs font-bold text-petflow-chocolate">
                  <Icon name="edit" size={14} />
                  {tr("ลายเซ็นยืนยันตัวตน", "Your signature")}
                </label>
                <p className="mb-1.5 text-[11px] text-brown-faint">
                  {tr("เซ็นด้วยนิ้วในกรอบด้านล่าง — ไว้เป็นหลักฐานว่าเจ้าของน้องเป็นผู้ยอมรับข้อตกลงเอง", "Sign with your finger in the box below, as proof that you, the owner, accept these terms.")}
                </p>
                <SignaturePad
                  onChange={(v) => {
                    setSignature(v);
                    if (v) setSignError(false);
                  }}
                />
                {signError && (
                  <p className="mt-1 text-[11px] font-bold text-wait">
                    {tr("กรุณาเซ็นชื่อในกรอบก่อนกดยอมรับข้อตกลง", "Please sign in the box before accepting.")}
                  </p>
                )}
              </section>

              {/* มาจากลำดับขอข้อมูล = บัตรมีขั้นของตัวเองแล้ว (หรือร้านไม่ได้ขอรอบนี้) ไม่ถามซ้ำ เหมือนสมุดวัคซีน */}
              {!idCardOnFile && !inFlow && !isGroom && isFeatureOn(config, "idCard") && (
              <section className="mt-4 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
                <label className="flex items-center gap-1.5 text-xs font-bold text-petflow-chocolate">
                  <Icon name="user" size={14} />
                  {tr("บัตรประชาชนผู้ปกครอง", "Owner's ID card / passport")}
                </label>
                <p className="mb-1.5 text-[11px] text-brown-faint">
                  {tr("ระบบจะพิมพ์ข้อความขีดทับลงในรูปให้อัตโนมัติก่อนส่ง:", "A watermark is added to the photo automatically before sending:")} &quot;{idCardPurpose(config.business.name)}&quot;{" "}
                  {tr("แนบครั้งเดียวพอ รอบต่อไปไม่ต้องแนบอีก", "You only need to attach it once.")}
                </p>
                {idCardUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={idCardUrl}
                    alt={tr("บัตรประชาชน (ขีดทับแล้ว)", "ID card (watermarked)")}
                    className="mb-2 w-full rounded-lg border border-petflow-line object-contain"
                  />
                )}
                <label className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-petflow-sm border border-dashed border-petflow-line bg-paper px-3 py-3">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadIdCard(f);
                      e.target.value = "";
                    }}
                  />
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card text-brown-soft">
                    <Icon name="image" size={20} />
                  </span>
                  <span className="text-xs font-bold text-brown-soft">
                    {idCardBusy
                      ? tr("กำลังขีดทับและแนบรูป…", "Watermarking and attaching…")
                      : idCardUrl
                        ? tr("แนบไว้แล้ว · แตะเพื่อเปลี่ยนรูป", "Attached · tap to change")
                        : tr("แตะเพื่อแนบรูปบัตรประชาชน", "Tap to attach an ID card photo")}
                  </span>
                </label>
              </section>
              )}

              {/* ลิงก์จากหน้าข้อมูลลูกค้า / การ์ดรวมขอข้อมูล: สมุดวัคซีนมีขั้นของตัวเองแล้ว · แนบไว้แล้วก็ไม่ถามซ้ำ */}
              {!customerMode && !inFlow && !vaccineOnFile && isFeatureOn(config, "vaccine") && (
              <section className="mt-4 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
                <label className="flex items-center gap-1.5 text-xs font-bold text-petflow-chocolate">
                  <Icon name="image" size={14} />
                  {tr("ภาพสมุดวัคซีน", "Vaccine book photos")} <span className="font-normal text-brown-faint">{tr("(ถ้ามี)", "(if any)")}</span>
                </label>
                <p className="mb-1.5 text-[11px] text-brown-faint">
                  {tr("แนบไว้เป็นหลักฐานประวัติวัคซีนของน้อง — ไม่บังคับ แต่แนะนำให้แนบถ้ามีสมุดอยู่ใกล้ตัว", "Proof of your pet's vaccinations. Optional, but recommended if you have the book handy.")}
                </p>
                <p className="mb-2 flex gap-2 rounded-petflow-sm bg-honey/20 px-3 py-2 text-[11px] font-bold text-petflow-chocolate">
                  <Icon name="alert" size={15} className="mt-px" />
                  <span>
                    {tr("หากไม่ได้แนบสมุดวัคซีน ถือว่าเจ้าของรับทราบและยอมรับข้อตกลงทั้งหมด รวมถึงความเสี่ยงจากการที่ทางร้านไม่ได้ตรวจสอบประวัติวัคซีนของน้อง", "If no vaccine book is attached, you accept all terms, including the risk that the shop has not checked your pet's vaccination history.")}
                  </span>
                </p>
                {(groupCats.length ? groupCats : booking ? [{ id: booking.id, catName: booking.catName }] : []).map(
                  (cat) => {
                    const photos = vaccineByCat[cat.id] || [];
                    return (
                      <div key={cat.id} className={groupCats.length > 1 ? "mt-3 first:mt-0" : ""}>
                        {groupCats.length > 1 && (
                          <p className="mb-1.5 flex items-center gap-1 text-xs font-extrabold text-petflow-chocolate">
                            <Icon name="paw" size={13} className="text-brown-soft" />
                            {cat.catName}
                          </p>
                        )}
                        {photos.length > 0 && (
                          <div className="mb-2 grid grid-cols-3 gap-2">
                            {photos.map((src, i) => (
                              <div key={i} className="relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={src}
                                  alt={`${tr("สมุดวัคซีน", "Vaccine book")} ${cat.catName} ${i + 1}`}
                                  className="aspect-square w-full rounded-lg object-cover"
                                />
                                <button
                                  type="button"
                                  aria-label={tr("ลบรูปนี้", "Remove this photo")}
                                  onClick={() =>
                                    setVaccineByCat((prev) => ({
                                      ...prev,
                                      [cat.id]: (prev[cat.id] || []).filter((_, j) => j !== i),
                                    }))
                                  }
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
                                if (e.target.files?.length) addVaccinePhotos(cat.id, e.target.files);
                                e.target.value = "";
                              }}
                            />
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card text-brown-soft">
                              <Icon name={photos.length ? "plus" : "image"} size={20} />
                            </span>
                            <span className="text-xs font-bold text-brown-soft">
                              {vaccineUploading === cat.id
                                ? tr("กำลังแนบรูป…", "Attaching…")
                                : photos.length
                                  ? tr(`เพิ่มรูปอีก (แนบได้สูงสุด ${MAX_VACCINE_PHOTOS} รูป)`, `Add more (up to ${MAX_VACCINE_PHOTOS} photos)`)
                                  : groupCats.length > 1
                                    ? tr(`แตะเพื่อแนบสมุดวัคซีนของ${cat.catName}`, `Tap to attach ${cat.catName}'s vaccine book`)
                                    : tr("แตะเพื่อแนบภาพสมุดวัคซีน (เลือกได้หลายรูป)", "Tap to attach vaccine book photos (you can pick several)")}
                            </span>
                          </label>
                        )}
                      </div>
                    );
                  }
                )}
              </section>
              )}

              {!isGroom && (
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-petflow border border-honey-deep/40 bg-honey/10 p-4 text-xs leading-relaxed text-brown">
                <input
                  type="checkbox"
                  checked={fleaTickTreated}
                  onChange={(e) => {
                    setFleaTickTreated(e.target.checked);
                    if (e.target.checked) setFleaError(false);
                  }}
                  className="mt-0.5 h-5 w-5 flex-none accent-latte-deep"
                />
                <span>
                  {tr("ข้าพเจ้ายืนยันว่าได้ป้องกันเห็บหมัดให้น้องแล้ว (หยด / ทานยา / ฉีดยา) ภายในระยะเวลาที่กำหนด ก่อนเข้าพักครั้งนี้", "I confirm my pet has had flea and tick prevention (spot-on / tablet / injection) within the required period before this stay.")}
                </span>
              </label>
              )}
              {!isGroom && consentFleaProofOn(config) && (
                <div className="mt-2 rounded-petflow border border-petflow-line bg-card p-3 text-xs text-brown shadow-petflow-sm">
                  <p className="font-bold">
                    {tr("แนบรูปหลักฐานการหยดยา", "Attach proof of treatment")}{" "}
                    <span className="font-normal text-brown-faint">{tr("(ไม่บังคับ)", "(optional)")}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-brown-faint">
                    {tr(
                      "เช่น รูปตอนหยด กล่อง/หลอดยา ใบเสร็จ หรือสมุดหมอ · ไม่แนบก็ได้ การติ๊กยืนยันด้านบนถือว่ายืนยันแล้ว",
                      "e.g. a photo while applying, the product box, a receipt or the vet's record. Optional: ticking the box above already counts as your confirmation."
                    )}
                  </p>
                  {fleaPhotos.length > 0 && (
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {fleaPhotos.map((src, i) => (
                        <div key={i} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`${tr("หลักฐาน", "Proof")} ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
                          <button
                            type="button"
                            aria-label={tr("ลบรูปนี้", "Remove this photo")}
                            onClick={() => setFleaPhotos((prev) => prev.filter((_, j) => j !== i))}
                            className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white"
                          >
                            <Icon name="x" size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {fleaPhotos.length < FLEA_PROOF_MAX && (
                    <label className="mt-2 flex min-h-[48px] cursor-pointer items-center gap-3 rounded-petflow-sm border border-dashed border-petflow-line bg-paper px-3 py-2">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.length) addFleaPhotos(e.target.files);
                          e.target.value = "";
                        }}
                      />
                      <Icon name={fleaPhotos.length ? "plus" : "image"} size={18} />
                      <span className="font-bold text-brown-soft">
                        {fleaConverting
                          ? tr("กำลังแนบรูป…", "Attaching…")
                          : tr(`แตะเพื่อถ่าย/เลือกรูป (สูงสุด ${FLEA_PROOF_MAX} รูป)`, `Tap to take/choose photos (up to ${FLEA_PROOF_MAX})`)}
                      </span>
                    </label>
                  )}
                </div>
              )}
              {!isGroom && fleaTickTreated && consentFleaProofOn(config) && (
                <p className="mt-2 whitespace-pre-line rounded-petflow border border-ok/30 bg-sage/15 p-3 text-[11px] leading-relaxed text-brown">
                  {fleaLegalNote(config, locale === "en")}
                </p>
              )}
              {fleaError && !isGroom && (
                <p className="mt-1 text-[11px] font-bold text-wait">
                  {tr("กรุณาติ๊กยืนยันเรื่องป้องกันเห็บหมัดก่อนกดยอมรับข้อตกลง", "Please confirm flea and tick prevention before accepting.")}
                </p>
              )}

              <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-petflow border border-petflow-line bg-card p-4 text-xs leading-relaxed text-brown shadow-petflow-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                  className="mt-0.5 h-5 w-5 flex-none accent-latte-deep"
                />
                {isGroom ? (
                  <span>{locale === "en" ? GROOM_CONSENT_CONFIRM_EN : GROOM_CONSENT_CONFIRM}</span>
                ) : (
                  <span>
                    {tr("ข้าพเจ้าขอรับรองว่าข้อมูลทั้งหมดที่กรอกและแนบมาข้างต้น (รวมถึงประวัติวัคซีนและการป้องกันเห็บหมัด) เป็นความจริงทุกประการ และร้านสามารถใช้ข้อมูลนี้เป็นหลักฐานได้หากเกิดปัญหาที่เกี่ยวข้อง", "I certify that all information given and attached above (including vaccination history and flea/tick prevention) is true, and the shop may use it as evidence if a related problem arises.")}
                    {showBathTerms ? tr(" รวมถึงยอมรับข้อตกลงการอาบน้ำก่อนกลับบ้านด้วย", " I also accept the terms for the bath before going home.") : ""}
                  </span>
                )}
              </label>
              <button
                type="button"
                disabled={!checked || saving || fleaConverting || (!booking && !customerMode)}
                onClick={submit}
                className={`mt-5 ${BTN_PRIMARY}`}
              >
                {saving ? tr("กำลังบันทึก…", "Saving…") : tr("ยอมรับข้อตกลง", "Accept terms")}
              </button>
              {!booking && !customerMode && (
                <p className="mt-2 text-center text-[11px] text-brown-faint">
                  {tr("ยังไม่พบการจองห้องพักของคุณ", "We couldn't find your booking yet.")}
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function ConsentPage() {
  return (
    <Suspense
      fallback={<LoadingScreen />}
    >
      <ConsentContent />
    </Suspense>
  );
}
