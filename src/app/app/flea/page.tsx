"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { savedPopup } from "@/components/Toast";
import { useLiff } from "@/components/LiffProvider";
import { LoadingScreen } from "@/components/LoadingScreen";
import { BTN_PRIMARY, CARD, PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { toJpegDataUrl } from "@/lib/image-convert";
import { customerFetch } from "@/lib/customer-fetch";
import { formatDateShort } from "@/lib/format-thai-date";
import { useTr, useLocale } from "@/components/LocaleProvider";
import { MAX_FLEA_PHOTOS, type FleaProofMode } from "@/lib/flea-update";
import type { GroomFormOption } from "@/lib/groom-form";

type FleaCat = { id: string; name: string; method: string; last: string; date: string; photoCount: number; updatedAt: string };
type Data = { proof: FleaProofMode; questions: { methodLabel: string; methods: GroomFormOption[]; dateLabel: string }; cats: FleaCat[] };

/** วันนี้ตามเวลาไทย YYYY-MM-DD — ห้ามเลือกวันในอนาคต */
function todayTh() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

/**
 * อัปเดตการให้ยากำจัดเห็บหมัด — เปิดจากการ์ดที่ร้านส่ง (cats=…) หรือลูกค้ากดเองจากหน้าแก้ไขข้อมูล (ไม่ใส่ = ทุกตัว)
 * เลือกวิธี + วันที่ให้ยาล่าสุด + แนบรูปหลักฐาน (ตามที่ร้านตั้ง: ไม่ขอ / แนบได้ / บังคับ)
 */
function FleaContent() {
  const tr = useTr();
  const params = useSearchParams();
  const { profile, ready } = useLiff();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const wanted = (params.get("cats") || "").split(",").filter(Boolean);

  useEffect(() => {
    if (!profile?.lineUserId) return;
    customerFetch("/api/customers/flea")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
  }, [profile?.lineUserId]);

  const cats = (data?.cats || []).filter((c) => !wanted.length || wanted.includes(c.id));

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader
        eyebrow="Flea & tick"
        title={tr("อัปเดตยากำจัดเห็บหมัด", "Flea & tick treatment")}
        subtitle={tr("แจ้งร้านทุกครั้งที่ให้ยาน้อง ร้านจะได้ดูแลน้องได้อย่างปลอดภัยค่ะ", "Let the shop know each time you treat your pet")}
        back="/app"
        backLabel={tr("กลับหน้าแรก", "Back to home")}
        showLang={false}
      />
      {!ready || (!data && !failed && !!profile?.lineUserId) ? (
        <LoadingScreen />
      ) : failed || !data ? (
        <EmptyState icon="alert" title={tr("เปิดหน้านี้ไม่สำเร็จ ลองเปิดลิงก์จาก LINE อีกครั้งนะคะ", "Couldn't load. Please open the link from LINE again.")} />
      ) : cats.length === 0 ? (
        <EmptyState icon="paw" title={tr("ไม่พบข้อมูลน้อง", "Pet not found")} />
      ) : (
        <div className="space-y-4">
          {cats.map((c) => (
            <FleaSection key={c.id} cat={c} data={data} />
          ))}
        </div>
      )}
    </div>
  );
}

function FleaSection({ cat, data }: { cat: FleaCat; data: Data }) {
  const tr = useTr();
  const { locale } = useLocale();
  const { questions, proof } = data;
  const [method, setMethod] = useState(cat.method && questions.methods.some((o) => o.key === cat.method) ? cat.method : "");
  const [date, setDate] = useState(cat.date || "");
  const [photos, setPhotos] = useState<string[]>([]);
  const [converting, setConverting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [saved, setSaved] = useState<{ label: string; date: string; count: number } | null>(null);
  const [error, setError] = useState("");

  const needPhoto = proof === "required" && photos.length === 0;
  const missing = !method || !date || needPhoto;

  const addPhotos = async (files: FileList) => {
    setConverting(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, MAX_FLEA_PHOTOS - photos.length)) {
        try {
          urls.push(await toJpegDataUrl(f));
        } catch {
          /* ข้ามรูปที่เปิดไม่ได้ */
        }
      }
      setPhotos((prev) => [...prev, ...urls].slice(0, MAX_FLEA_PHOTOS));
    } finally {
      setConverting(false);
    }
  };

  const save = async () => {
    setAttempted(true);
    if (missing) return;
    setSaving(true);
    setError("");
    try {
      const res = await customerFetch("/api/customers/flea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catId: cat.id, method, date, photos }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || String(res.status));
      setSaved({ label: questions.methods.find((o) => o.key === method)?.label || method, date, count: photos.length });
      setPhotos([]);
      setAttempted(false);
      savedPopup(tr("อัปเดตเรียบร้อย", "Updated"), [tr("ร้านได้รับข้อมูลยาเห็บหมัดแล้วค่ะ 🧡", "The shop has your flea & tick update 🧡")]);
    } catch {
      setError(tr("บันทึกไม่สำเร็จ ลองใหม่อีกครั้งนะคะ", "Couldn't save. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const lastLabel = questions.methods.find((o) => o.key === cat.method)?.label;

  return (
    <section className={CARD}>
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
          <Icon name="paw" size={20} />
        </span>
        <p className="min-w-0 truncate text-sm font-extrabold text-petflow-chocolate">{cat.name}</p>
      </div>

      {saved ? (
        <p className="mb-3 flex items-start gap-1.5 rounded-petflow-sm bg-sage/20 px-3 py-2 text-[11px] font-bold text-ok">
          <Icon name="check" size={14} strokeWidth={2.4} className="mt-0.5 shrink-0" />
          {tr(
            `อัปเดตแล้ว: ${saved.label} · ${formatDateShort(saved.date, locale)}${saved.count ? ` · แนบรูป ${saved.count} รูป` : ""} — ขอบคุณค่ะ`,
            `Updated: ${saved.label} · ${formatDateShort(saved.date, locale)}${saved.count ? ` · ${saved.count} photo(s)` : ""}. Thank you`
          )}
        </p>
      ) : (
        (cat.last || lastLabel) && (
          <p className="mb-3 rounded-petflow-sm bg-paper px-3 py-2 text-[11px] text-brown-soft">
            {tr("ข้อมูลเดิม", "Previous")}: {[lastLabel, cat.last].filter(Boolean).join(" · ")}
            {cat.photoCount > 0 ? tr(` · ร้านมีรูปหลักฐาน ${cat.photoCount} รูป`, ` · ${cat.photoCount} proof photo(s) on file`) : ""}
          </p>
        )
      )}

      <p className={`text-xs font-bold ${attempted && !method ? "text-wait" : "text-petflow-chocolate"}`}>
        {questions.methodLabel} <span className="text-wait">*</span>
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {questions.methods.map((o) => {
          const on = method === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => setMethod(o.key)}
              className={`min-h-[48px] rounded-petflow-sm border px-2 text-xs font-extrabold ${
                on ? "border-latte-deep bg-latte-deep text-card" : "border-petflow-line bg-paper text-petflow-chocolate"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      <label className="mt-4 block">
        <span className={`text-xs font-bold ${attempted && !date ? "text-wait" : "text-petflow-chocolate"}`}>
          {questions.dateLabel} <span className="text-wait">*</span>
        </span>
        <input
          type="date"
          value={date}
          max={todayTh()}
          onChange={(e) => setDate(e.target.value)}
          className="mt-2 min-h-[48px] w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 text-sm text-petflow-chocolate"
        />
      </label>

      {proof !== "off" && (
        <div className="mt-4">
          <p className={`text-xs font-bold ${attempted && needPhoto ? "text-wait" : "text-petflow-chocolate"}`}>
            {tr("รูปหลักฐาน", "Proof photo")}{" "}
            {proof === "required" ? <span className="text-wait">*</span> : <span className="font-normal text-brown-faint">{tr("(ไม่บังคับ)", "(optional)")}</span>}
          </p>
          <p className="mt-0.5 text-[11px] text-brown-faint">
            {tr("เช่น กล่องยา/หลอดยาที่ใช้ ใบเสร็จ หรือสมุดสุขภาพที่หมอบันทึกไว้", "e.g. the product box, a receipt, or the vet's record")}
          </p>
          {photos.length > 0 && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {photos.map((src, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`${tr("หลักฐาน", "Proof")} ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
                  <button
                    type="button"
                    aria-label={tr("ลบรูปนี้", "Remove this photo")}
                    onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white"
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {photos.length < MAX_FLEA_PHOTOS && (
            <label className="mt-2 flex min-h-[56px] cursor-pointer items-center gap-3 rounded-petflow-sm border border-dashed border-petflow-line bg-paper px-3 py-3">
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
                  ? tr("กำลังแนบรูป…", "Attaching…")
                  : tr(`แตะเพื่อถ่าย/เลือกรูป (สูงสุด ${MAX_FLEA_PHOTOS} รูป)`, `Tap to take/choose photos (up to ${MAX_FLEA_PHOTOS})`)}
              </span>
            </label>
          )}
        </div>
      )}

      {attempted && missing && (
        <p className="mt-3 text-[11px] font-bold text-wait">
          {tr("กรอกข้อที่มี * ให้ครบก่อนนะคะ", "Please complete the items marked *")}
        </p>
      )}
      {error && <p className="mt-3 text-[11px] font-bold text-wait">{error}</p>}
      <button type="button" disabled={saving || converting} onClick={save} className={`mt-4 ${BTN_PRIMARY}`}>
        <Icon name="send" size={16} />
        {saving ? tr("กำลังส่ง…", "Sending…") : tr("ส่งข้อมูลให้ร้าน", "Send to the shop")}
      </button>
    </section>
  );
}

export default function FleaPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <FleaContent />
    </Suspense>
  );
}
