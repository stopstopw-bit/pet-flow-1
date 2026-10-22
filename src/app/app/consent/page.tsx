"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiff } from "@/components/LiffProvider";
import { useConfig } from "@/components/ConfigProvider";
import type { Booking } from "@/lib/business";

import { DEFAULT_MESSAGES, DEEMED_CONSENT_NOTICE } from "@/lib/messages";
import { LoadingScreen } from "@/components/LoadingScreen";
import { toJpegDataUrl } from "@/lib/image-convert";
import { BTN_PRIMARY, PageHeader } from "@/components/PageHeader";
import { SectionLabel } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { MAX_VACCINE_PHOTOS } from "@/lib/vaccine-photos";
import { idCardPurpose, watermarkIdCard } from "@/lib/id-card-watermark";

type StayBooking = Booking & {
  checkin?: string;
  room?: string;
  consentAcceptedAt?: string;
  careNote?: string;
};

function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);

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
        ล้างลายเซ็น
      </button>
    </div>
  );
}

function ConsentContent() {
  const params = useSearchParams();
  const bookingIdParam = params.get("id") || "";
  // ลิงก์จากหน้าข้อมูลลูกค้า (ยังไม่มีนัด) — ยอมรับแล้วเก็บไว้ที่ลูกค้า ไม่ผูกนัด
  const customerMode = params.get("mode") === "customer";
  const { profile, ready } = useLiff();
  const { config } = useConfig();
  const [booking, setBooking] = useState<StayBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [careNote, setCareNote] = useState("");
  const [signature, setSignature] = useState("");
  const [signError, setSignError] = useState(false);
  const [vaccinePhotos, setVaccinePhotos] = useState<string[]>([]);
  const [vaccineUploading, setVaccineUploading] = useState(false);
  const [fleaTickTreated, setFleaTickTreated] = useState(false);
  const [idCardUrl, setIdCardUrl] = useState("");
  // เคยแนบบัตรไว้แล้วจากรอบก่อน → ไม่ถามซ้ำ (ขอครั้งเดียวพอ)
  const [idCardOnFile, setIdCardOnFile] = useState(false);
  const [idCardBusy, setIdCardBusy] = useState(false);
  const [fleaError, setFleaError] = useState(false);

  const terms =
    config.messages?.consentTerms?.length
      ? config.messages.consentTerms
      : DEFAULT_MESSAGES.consentTerms;
  const consentTitle = config.messages?.consentTitle || DEFAULT_MESSAGES.consentTitle;

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
    fetch(`/api/customers/self?${q}`)
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
      alert("ยังเชื่อมบัญชี LINE ไม่เสร็จ — ปิดหน้านี้แล้วเปิดลิงก์จากแชท LINE ใหม่อีกครั้งนะคะ");
      return;
    }
    setIdCardBusy(true);
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
    } catch (e) {
      // ข้อความจาก watermarkIdCard (เช่น เปิดไฟล์ไม่ได้) บอกลูกค้าได้ตรงกว่า — ที่เหลือใช้ข้อความกลาง
      const msg = e instanceof Error && !e.message.startsWith("upload") ? e.message : "";
      alert(msg || "แนบรูปบัตรไม่สำเร็จ ลองใหม่อีกครั้งนะคะ");
    } finally {
      setIdCardBusy(false);
    }
  };

  const submit = async () => {
    if ((!booking && !customerMode) || !profile?.lineUserId) return;
    let hasError = false;
    if (!signature) {
      setSignError(true);
      hasError = true;
    }
    if (!fleaTickTreated) {
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
          vaccinePhotos,
          fleaTickTreated,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.needSql) {
        alert(
          "ระบบยังตั้งค่าไม่เสร็จ (แอดมินต้องรัน SQL ก่อน) — แต่รับทราบข้อตกลงของคุณแล้วค่ะ"
        );
      }
      setAccepted(true);
    } finally {
      setSaving(false);
    }
  };

  // สมุดวัคซีนมักมีหลายหน้า → เลือกได้ทีละหลายรูป และกดเพิ่มต่อได้จนครบ MAX_VACCINE_PHOTOS
  const addVaccinePhotos = async (files: FileList) => {
    setVaccineUploading(true);
    try {
      const room = MAX_VACCINE_PHOTOS - vaccinePhotos.length;
      const picked = Array.from(files).slice(0, Math.max(0, room));
      const urls: string[] = [];
      for (const f of picked) {
        try {
          urls.push(await toJpegDataUrl(f));
        } catch {
          /* แปลงรูปไหนไม่สำเร็จก็ข้ามรูปนั้นไป */
        }
      }
      setVaccinePhotos((prev) => [...prev, ...urls].slice(0, MAX_VACCINE_PHOTOS));
    } finally {
      setVaccineUploading(false);
    }
  };

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader
        eyebrow="Boarding agreement"
        title={consentTitle}
        subtitle={`${config.business.name} — กรุณาอ่านและกดยอมรับก่อนวันเข้าพักของน้อง`}
        back="/app"
        backLabel="กลับหน้าแรก"
        showLang={false}
      />

      {!ready || loading ? (
        <LoadingScreen />
      ) : (
        <>
          {booking && (
            <div className="flex items-center gap-3 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
                <Icon name="bed" size={20} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-petflow-chocolate">{booking.catName}</p>
                <p className="text-xs text-brown-soft">
                  เข้าพัก: {booking.checkin || booking.date}
                  {booking.checkout ? ` → ${booking.checkout}` : ""}
                  {booking.room ? ` · ห้อง ${booking.room}` : ""}
                </p>
              </div>
            </div>
          )}

          <section className="mt-5">
            <SectionLabel>Terms · ข้อตกลง</SectionLabel>
            <ol className="divide-y divide-petflow-line overflow-hidden rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
              {terms.map((term, i) => (
                <li key={i} className="flex gap-3 px-4 py-3 text-xs leading-relaxed text-brown">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-honey/30 text-[11px] font-extrabold text-petflow-chocolate">
                    {i + 1}
                  </span>
                  <span className="min-w-0">{term}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2 rounded-petflow border border-petflow-line bg-cream px-3 py-2.5 text-[11px] leading-relaxed text-brown">
              {DEEMED_CONSENT_NOTICE}
            </p>
          </section>

          <section className="mt-5 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
            <label className="flex items-center gap-1.5 text-xs font-bold text-petflow-chocolate">
              <Icon name="edit" size={14} />
              แจ้งการดูแลเพิ่มเติม (ไม่บังคับ)
            </label>
            <p className="mb-1.5 text-[11px] text-brown-faint">
              เช่น อาหารที่กินประจำ/ปริมาณ · ยาที่ต้องให้ · นิสัย/สิ่งที่กลัว · โรคประจำตัว
            </p>
            <textarea
              value={careNote}
              onChange={(e) => setCareNote(e.target.value)}
              disabled={accepted}
              rows={4}
              placeholder="พิมพ์รายละเอียดการดูแลน้องที่อยากให้ทางร้านทราบ…"
              className="w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm text-brown disabled:opacity-70"
            />
          </section>

          {accepted ? (
            <div className="mt-5 rounded-petflow bg-sage/20 p-4 text-center">
              <p className="flex items-center justify-center gap-1.5 text-sm font-extrabold text-petflow-chocolate">
                <Icon name="check" size={18} strokeWidth={2.4} className="text-ok" />
                รับทราบและยอมรับข้อตกลงแล้ว
              </p>
              <p className="mt-1 text-xs text-brown-soft">
                ขอบคุณค่ะ ทางเราพร้อมดูแลน้องอย่างดีที่สุด 🧡
              </p>
            </div>
          ) : (
            <>
              <section className="mt-5 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
                <label className="flex items-center gap-1.5 text-xs font-bold text-petflow-chocolate">
                  <Icon name="edit" size={14} />
                  ลายเซ็นยืนยันตัวตน
                </label>
                <p className="mb-1.5 text-[11px] text-brown-faint">
                  เซ็นด้วยนิ้วในกรอบด้านล่าง — ไว้เป็นหลักฐานว่าเจ้าของน้องเป็นผู้ยอมรับข้อตกลงเอง
                </p>
                <SignaturePad
                  onChange={(v) => {
                    setSignature(v);
                    if (v) setSignError(false);
                  }}
                />
                {signError && (
                  <p className="mt-1 text-[11px] font-bold text-wait">
                    กรุณาเซ็นชื่อในกรอบก่อนกดยอมรับข้อตกลง
                  </p>
                )}
              </section>

              {!idCardOnFile && (
              <section className="mt-4 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
                <label className="flex items-center gap-1.5 text-xs font-bold text-petflow-chocolate">
                  <Icon name="user" size={14} />
                  บัตรประชาชนผู้ปกครอง
                </label>
                <p className="mb-1.5 text-[11px] text-brown-faint">
                  ระบบจะพิมพ์ข้อความขีดทับลงในรูปให้อัตโนมัติก่อนส่ง: &quot;{idCardPurpose(config.business.name)}&quot;
                  แนบครั้งเดียวพอ รอบต่อไปไม่ต้องแนบอีก
                </p>
                {idCardUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={idCardUrl}
                    alt="บัตรประชาชน (ขีดทับแล้ว)"
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
                      ? "กำลังขีดทับและแนบรูป…"
                      : idCardUrl
                        ? "แนบไว้แล้ว · แตะเพื่อเปลี่ยนรูป"
                        : "แตะเพื่อแนบรูปบัตรประชาชน"}
                  </span>
                </label>
              </section>
              )}

              {/* ลิงก์จากหน้าข้อมูลลูกค้า: สมุดวัคซีนมีการ์ดขอแยกต่างหาก (เก็บที่ตัวน้อง) ไม่ถามซ้ำตรงนี้ */}
              {!customerMode && (
              <section className="mt-4 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
                <label className="flex items-center gap-1.5 text-xs font-bold text-petflow-chocolate">
                  <Icon name="image" size={14} />
                  ภาพสมุดวัคซีน <span className="font-normal text-brown-faint">(ถ้ามี)</span>
                </label>
                <p className="mb-1.5 text-[11px] text-brown-faint">
                  แนบไว้เป็นหลักฐานประวัติวัคซีนของน้อง — ไม่บังคับ แต่แนะนำให้แนบถ้ามีสมุดอยู่ใกล้ตัว
                </p>
                <p className="mb-2 flex gap-2 rounded-petflow-sm bg-honey/20 px-3 py-2 text-[11px] font-bold text-petflow-chocolate">
                  <Icon name="alert" size={15} className="mt-px" />
                  <span>
                    หากไม่ได้แนบสมุดวัคซีน ถือว่าเจ้าของรับทราบและยอมรับข้อตกลงทั้งหมด
                    รวมถึงความเสี่ยงจากการที่ทางร้านไม่ได้ตรวจสอบประวัติวัคซีนของน้อง
                  </span>
                </p>
                {vaccinePhotos.length > 0 && (
                  <div className="mb-2 grid grid-cols-3 gap-2">
                    {vaccinePhotos.map((src, i) => (
                      <div key={i} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt={`สมุดวัคซีน ${i + 1}`}
                          className="aspect-square w-full rounded-lg object-cover"
                        />
                        <button
                          type="button"
                          aria-label="ลบรูปนี้"
                          onClick={() => setVaccinePhotos((prev) => prev.filter((_, j) => j !== i))}
                          className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white"
                        >
                          <Icon name="x" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {vaccinePhotos.length < MAX_VACCINE_PHOTOS && (
                  <label className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-petflow-sm border border-dashed border-petflow-line bg-paper px-3 py-3">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.length) addVaccinePhotos(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card text-brown-soft">
                      <Icon name={vaccinePhotos.length ? "plus" : "image"} size={20} />
                    </span>
                    <span className="text-xs font-bold text-brown-soft">
                      {vaccineUploading
                        ? "กำลังแนบรูป…"
                        : vaccinePhotos.length
                          ? `เพิ่มรูปอีก (แนบได้สูงสุด ${MAX_VACCINE_PHOTOS} รูป)`
                          : "แตะเพื่อแนบภาพสมุดวัคซีน (เลือกได้หลายรูป)"}
                    </span>
                  </label>
                )}
              </section>
              )}

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
                  ข้าพเจ้ายืนยันว่าได้หยดยากันเห็บหมัดให้น้องแล้ว ภายในระยะเวลาที่กำหนด
                  ก่อนเข้าพักครั้งนี้
                </span>
              </label>
              {fleaError && (
                <p className="mt-1 text-[11px] font-bold text-wait">
                  กรุณาติ๊กยืนยันเรื่องหยดยาเห็บหมัดก่อนกดยอมรับข้อตกลง
                </p>
              )}

              <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-petflow border border-petflow-line bg-card p-4 text-xs leading-relaxed text-brown shadow-petflow-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                  className="mt-0.5 h-5 w-5 flex-none accent-latte-deep"
                />
                <span>
                  ข้าพเจ้าขอรับรองว่าข้อมูลทั้งหมดที่กรอกและแนบมาข้างต้น
                  (รวมถึงประวัติวัคซีนและการหยดยาเห็บหมัด) เป็นความจริงทุกประการ
                  และร้านสามารถใช้ข้อมูลนี้เป็นหลักฐานได้หากเกิดปัญหาที่เกี่ยวข้อง
                </span>
              </label>
              <button
                type="button"
                disabled={!checked || saving || (!booking && !customerMode)}
                onClick={submit}
                className={`mt-5 ${BTN_PRIMARY}`}
              >
                {saving ? "กำลังบันทึก…" : "ยอมรับข้อตกลง"}
              </button>
              {!booking && !customerMode && (
                <p className="mt-2 text-center text-[11px] text-brown-faint">
                  ยังไม่พบการจองห้องพักของคุณ
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
