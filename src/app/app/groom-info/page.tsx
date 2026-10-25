"use client";

import { IntakeFlowBar } from "@/components/IntakeFlowBar";
import { flowProgress } from "@/lib/intake-flow";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiff } from "@/components/LiffProvider";
import { useConfig } from "@/components/ConfigProvider";
import { type GroomField } from "@/lib/groom-form";
import { intakeFields } from "@/lib/intake-rules";
import { normalizeSpecies, petKindOf, petWords, speciesWords } from "@/lib/pet-kind";
import { BATH_SHARED_WITH_STAY } from "@/lib/stay-form";
import { LoadingScreen } from "@/components/LoadingScreen";
import { BTN_PRIMARY, PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui";
import { Icon } from "@/components/Icon";

type Answers = Record<string, string | string[]>;

type CatForm = {
  id: string;
  catName: string;
  /** คำถามของน้องตัวนี้ — หมากับแมวคนละชุด (หมาไม่ถามเรื่องทราย) */
  fields: GroomField[];
  /** อีโมจิของน้องตัวนี้ 🐶 / 🐱 */
  emoji: string;
  answers: Answers;
  /** ติ๊ก "ไม่ทราบน้ำหนัก" */
  weightUnknown: boolean;
  /** คำถามที่ข้ามให้ตัวนี้ (เช่น โรคประจำตัวที่ตอบไว้แล้วตอนสมัครสมาชิก) */
  skip: string[];
  /** เข้าพัก + อาบก่อนกลับ — ถามเรื่องอาบน้ำต่อท้ายในฟอร์มเดียว (key ขึ้นต้น "g:") */
  bath: boolean;
};

/** คำถามอาบน้ำในฟอร์มรวม — ใส่ "g:" กัน key ชนกับฝั่งเข้าพัก */
const BATH_PREFIX = "g:";

function emptyAnswers(fields: GroomField[]): Answers {
  const a: Answers = {};
  for (const f of fields) a[f.key] = f.type === "multi" ? [] : "";
  return a;
}

/** แปลงค่าที่เคยบันทึกไว้ให้ตรงชนิดของคำถาม (รองรับข้อมูลเก่าที่เป็น string เดี่ยว) */
function loadAnswers(fields: GroomField[], info: Record<string, unknown> | null): Answers {
  const a = emptyAnswers(fields);
  if (!info) return a;
  for (const f of fields) {
    const v = info[f.key];
    if (v == null) continue;
    if (f.type === "multi") {
      a[f.key] = Array.isArray(v) ? (v as string[]) : v ? [String(v)] : [];
    } else {
      a[f.key] = Array.isArray(v) ? String(v[0] ?? "") : String(v);
    }
  }
  return a;
}

function GroomInfoContent() {
  const params = useSearchParams();
  // ลิงก์จากนัด (id = bookingId) หรือจากหน้าข้อมูลลูกค้า (cats = ตัวน้อง ยังไม่ต้องมีนัด)
  const catMode = !!params.get("cats");
  const ids = (params.get("cats") || params.get("id") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const { profile } = useLiff();
  const { config } = useConfig();

  // คำถามทั้งหมด — ก่อนอาบน้ำ: ตามที่ร้านตั้งไว้ในหลังบ้าน · ก่อนเข้าพัก: ชุดการกิน/การดูแล (stay-form)
  // เลือกชุดตามชนิดของน้องแต่ละตัว (หมา/แมว) · ไม่รู้ชนิด = ชนิดที่ร้านรับ
  const petKind = petKindOf(config);
  const groomForm = config.groomForm;
  const rules = config.intakeRules;

  const [forms, setForms] = useState<CatForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [attempted, setAttempted] = useState(false);
  // โหลดไม่ขึ้นเพราะยืนยัน LINE ไม่ผ่าน (401) — บอกลูกค้าให้เปิดลิงก์ใหม่ แทน "ไม่พบข้อมูลการนัด"
  const [loadError, setLoadError] = useState("");
  // นัดเข้าพัก / ลิงก์ kind=stay → ฟอร์มก่อนเข้าพัก (คนละชุดคำถามกับก่อนอาบน้ำ)
  const kindParam = params.get("kind") || "";
  const [isStay, setIsStay] = useState(kindParam === "stay");

  useEffect(() => {
    if (ids.length === 0) {
      setLoading(false);
      return;
    }
    // รอเชื่อม LINE เสร็จก่อน (ได้คุกกี้เซสชันลูกค้า) — ยิงก่อนจะโดน 401 แล้วขึ้น "ไม่พบข้อมูลการนัด"
    if (!profile?.lineUserId) return;
    Promise.all(
      ids.map((id) =>
        fetch(
          `/api/bookings/groom-info?${catMode ? "cat" : "id"}=${encodeURIComponent(id)}${kindParam ? `&kind=${kindParam}` : ""}`
        )
          .then(async (r) => (r.status === 401 ? { unauthorized: true } : r.json()))
          .catch(() => null)
      )
    )
      .then((results) => {
        const loaded: CatForm[] = [];
        // เซิร์ฟเวอร์บอกว่าเป็นฟอร์มไหน (นัดเข้าพัก = ก่อนเข้าพัก) — ใช้ชุดคำถามนั้นทั้งหน้า
        // ไม่มีตัวไหนโหลดขึ้น → คงฟอร์มตามลิงก์ไว้ (ไม่งั้นการ์ดก่อนเข้าพักจะโชว์หัว "ก่อนอาบน้ำ")
        const anyFound = results.some((d) => d?.found);
        const stay = anyFound ? results.some((d) => d?.kind === "stay") : kindParam === "stay";
        setIsStay(stay);
        if (!anyFound && results.some((d) => d?.unauthorized)) {
          setLoadError("ระบบยังยืนยันบัญชี LINE ไม่สำเร็จ — ปิดหน้านี้แล้วเปิดลิงก์จากแชท LINE ใหม่อีกครั้งนะคะ");
        }
        results.forEach((d, i) => {
          if (!d?.found) return;
          const info = d.info || null;
          const species = normalizeSpecies(d.species);
          const kind = species ?? petKind;
          const own = intakeFields(stay ? "stay" : "groom", kind, { groomForm, intakeRules: rules });
          // เข้าพัก + อาบก่อนกลับ — ถามเรื่องอาบน้ำต่อท้าย ข้อที่ซ้ำกับฟอร์มเข้าพักถามครั้งเดียว
          const bath = stay && !!d.withBath;
          const bathFs = bath
            ? intakeFields("groom", kind, { groomForm, intakeRules: rules })
                .filter((fd) => !(fd.key in BATH_SHARED_WITH_STAY) && !own.some((o) => o.key === fd.key))
                .map((fd) => ({ ...fd, key: BATH_PREFIX + fd.key }))
            : [];
          const fs = [...own, ...bathFs];
          loaded.push({
            id: ids[i],
            catName: d.booking?.catName || "น้อง",
            fields: fs,
            emoji: speciesWords(species, config).emoji,
            answers: loadAnswers(fs, info),
            weightUnknown: info?.weight === "unknown",
            skip: d.knownMedical ? ["medical"] : [],
            bath,
          });
        });
        setForms(loaded);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString(), groomForm, rules, petKind, profile?.lineUserId]);

  const setAnswer = (idx: number, key: string, value: string | string[]) =>
    setForms((prev) =>
      prev.map((f, i) =>
        i === idx ? { ...f, answers: { ...f.answers, [key]: value } } : f
      )
    );

  const toggleOption = (idx: number, key: string, optKey: string) =>
    setForms((prev) =>
      prev.map((f, i) => {
        if (i !== idx) return f;
        const cur = (f.answers[key] as string[]) || [];
        return {
          ...f,
          answers: {
            ...f.answers,
            [key]: cur.includes(optKey)
              ? cur.filter((x) => x !== optKey)
              : [...cur, optKey],
          },
        };
      })
    );

  /** คำถามที่บังคับตอบแล้วยังว่างอยู่ */
  const missingKeys = (f: CatForm) =>
    f.fields
      .filter((fd) => {
        if (!fd.required || f.skip.includes(fd.key)) return false;
        if (fd.hasUnknownToggle && f.weightUnknown) return false;
        const v = f.answers[fd.key];
        return Array.isArray(v) ? v.length === 0 : !String(v || "").trim();
      })
      .map((fd) => fd.key);

  const nextStep = flowProgress(params)?.next;

  const submit = async () => {
    if (forms.length === 0) return;
    setAttempted(true);
    if (forms.some((f) => missingKeys(f).length > 0)) {
      setSaveError("กรุณาตอบให้ครบทุกข้อที่มีเครื่องหมาย * ก่อนส่งข้อมูลนะคะ 🙏");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const results = await Promise.all(
        forms.map((f) => {
          const own: Answers = {};
          const bath: Answers = {};
          for (const [k, v] of Object.entries(f.answers)) {
            if (k.startsWith(BATH_PREFIX)) bath[k.slice(BATH_PREFIX.length)] = v;
            else own[k] = v;
          }
          return fetch("/api/bookings/groom-info", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...(catMode ? { catId: f.id } : { bookingId: f.id }),
              kind: isStay ? "stay" : "groom",
              lineUserId: profile?.lineUserId,
              info: {
                ...own,
                weight: f.weightUnknown ? "unknown" : own.weight || "",
              },
              ...(f.bath
                ? { groomInfo: { ...bath, weight: f.weightUnknown ? "unknown" : bath.weight || "" } }
                : {}),
            }),
          }).then((r) => r.ok);
        })
      );
      if (!results.every(Boolean)) {
        setSaveError("บันทึกไม่สำเร็จบางตัว — ลองใหม่อีกครั้ง หรือแจ้งพนักงานที่ร้านได้เลยค่ะ");
        return;
      }
      // มาจากการ์ดรวมขอข้อมูล → ไปขั้นต่อไปเลย (สมุดวัคซีน / บัตร / กฎ) ไม่ปิดหน้า
      if (nextStep) {
        window.location.href = nextStep.href;
        return;
      }
      try {
        const liff = (await import("@line/liff")).default;
        if (liff.isInClient()) {
          liff.closeWindow();
          return;
        }
      } catch {
        /* เปิดนอก LINE — โชว์หน้าจอเสร็จแทน */
      }
      setDone(true);
    } catch {
      setSaveError("บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง หรือแจ้งพนักงานที่ร้านได้เลยค่ะ");
    } finally {
      setSaving(false);
    }
  };

  const Chip = ({
    active,
    label,
    onClick,
  }: {
    active: boolean;
    label: string;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-[44px] rounded-full px-4 text-xs font-bold transition ${
        active ? "bg-latte-deep text-card shadow-petflow-sm" : "bg-paper text-brown-soft"
      }`}
    >
      {label}
    </button>
  );

  if (done) {
    return (
      <div className="px-4 pb-6 pt-10">
        <div className="rounded-petflow border border-petflow-line bg-card p-6 text-center shadow-petflow">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage/25 text-ok">
          <Icon name="check" size={28} strokeWidth={2.4} />
        </span>
        <h1 className="mt-4 text-lg font-extrabold text-petflow-chocolate">
          ขอบคุณที่แจ้งประวัติน้องนะคะ!
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-brown-soft">
          เราจะดูแล{forms.map((f) => f.catName).join(", ") || "น้อง"}อย่างระมัดระวังที่สุด {petWords(config).emoji}
          <br />
          กลับไปที่แชท LINE ได้เลยค่ะ
        </p>
        </div>
      </div>
    );
  }

  const inputClass =
    "min-h-[44px] w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm";

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader
        eyebrow={isStay ? "Before your stay" : "Before grooming"}
        title={isStay ? (forms.some((f) => f.bath) ? "ข้อมูลน้องก่อนเข้าพัก + อาบน้ำ" : "ข้อมูลน้องก่อนเข้าพัก") : "ประวัติน้องก่อนอาบน้ำ"}
        back="/app"
        backLabel="กลับหน้าแรก"
        showLang={false}
      />
      <IntakeFlowBar mode="progress" />

      {loading ? (
        <LoadingScreen />
      ) : forms.length === 0 ? (
        <div className="rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
          <EmptyState
            icon="calendar"
            title={loadError || (catMode ? "ไม่พบข้อมูลน้องในบัญชี LINE นี้" : "ไม่พบข้อมูลการนัด")}
          />
        </div>
      ) : (
        <>
          {forms.length > 1 && (
            <p className="flex items-center gap-1.5 rounded-petflow-sm bg-honey/20 px-3 py-2 text-xs font-bold text-petflow-chocolate">
              <Icon name="paw" size={14} />
              มีน้อง {forms.length} ตัว — รบกวนกรอกให้ครบทุกตัวนะคะ
            </p>
          )}

          {forms.map((f, idx) => {
            const missing = missingKeys(f);
            return (
              <div
                key={f.id}
                className="mt-4 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm"
              >
                <p className="flex items-center gap-2 text-sm font-extrabold text-petflow-chocolate">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-honey/25">
                    <span aria-hidden className="text-base">{f.emoji}</span>
                  </span>
                  {f.catName}
                </p>
                {forms.length === 1 && (
                  <p className="mt-1 text-xs text-brown-soft">
                    เพื่อความปลอดภัยของน้อง 🧡 รบกวนแจ้งข้อมูลสั้นๆ ให้เราเตรียมดูแลน้องได้ถูกวิธีนะคะ
                  </p>
                )}

                {f.fields.filter((fd) => !f.skip.includes(fd.key)).map((fd) => {
                  const isMissing = attempted && missing.includes(fd.key);
                  const value = f.answers[fd.key];
                  return (
                    <div key={fd.key}>
                      {fd.key === f.fields.find((x) => x.key.startsWith(BATH_PREFIX))?.key && (
                        <div className="mt-5 border-t border-petflow-line pt-4">
                          <p className="flex items-center gap-1.5 text-sm font-extrabold text-petflow-chocolate">
                            <Icon name="bath" size={16} />
                            ก่อนอาบน้ำ (อาบก่อนกลับบ้าน)
                          </p>
                          <p className="mt-0.5 text-[11px] text-brown-faint">
                            น้องอาบน้ำก่อนกลับด้วย ขอถามเพิ่มอีกนิด ข้อที่ตอบไปแล้วด้านบนไม่ถามซ้ำค่ะ
                          </p>
                        </div>
                      )}
                      <p
                        className={`mt-3 mb-1.5 text-xs font-bold ${
                          isMissing ? "text-wait" : "text-brown-soft"
                        }`}
                      >
                        {fd.label}
                        {fd.required && " *"}
                        {isMissing &&
                          (fd.type === "multi"
                            ? " — กรุณาเลือกอย่างน้อย 1 ข้อ"
                            : fd.type === "single"
                              ? " — กรุณาเลือก"
                              : " — กรุณากรอก")}
                      </p>

                      {fd.type === "single" && (
                        <div className="flex flex-wrap gap-2">
                          {fd.options.map((o) => (
                            <Chip
                              key={o.key}
                              active={value === o.key}
                              label={o.label}
                              onClick={() => setAnswer(idx, fd.key, o.key)}
                            />
                          ))}
                        </div>
                      )}

                      {fd.type === "multi" && (
                        <div className="flex flex-wrap gap-2">
                          {fd.options.map((o) => (
                            <Chip
                              key={o.key}
                              active={((value as string[]) || []).includes(o.key)}
                              label={o.label}
                              onClick={() => toggleOption(idx, fd.key, o.key)}
                            />
                          ))}
                        </div>
                      )}

                      {fd.type === "text" && (
                        <>
                          <input
                            value={f.weightUnknown && fd.hasUnknownToggle ? "" : String(value || "")}
                            onChange={(e) => setAnswer(idx, fd.key, e.target.value)}
                            disabled={fd.hasUnknownToggle && f.weightUnknown}
                            placeholder={fd.placeholder}
                            inputMode={fd.hasUnknownToggle ? "decimal" : undefined}
                            className={`${inputClass} disabled:bg-paper/50 disabled:text-brown-faint`}
                          />
                          {fd.hasUnknownToggle && (
                            <label className="mt-1 flex min-h-[44px] cursor-pointer items-center gap-2 text-xs font-bold text-brown-soft">
                              <input
                                type="checkbox"
                                checked={f.weightUnknown}
                                onChange={(e) =>
                                  setForms((prev) =>
                                    prev.map((x, i) =>
                                      i === idx
                                        ? { ...x, weightUnknown: e.target.checked }
                                        : x
                                    )
                                  )
                                }
                                className="h-5 w-5 accent-latte-deep"
                              />
                              ไม่ทราบน้ำหนัก
                            </label>
                          )}
                        </>
                      )}

                      {fd.type === "textarea" && (
                        <textarea
                          value={String(value || "")}
                          onChange={(e) => setAnswer(idx, fd.key, e.target.value)}
                          placeholder={fd.placeholder}
                          rows={2}
                          className={inputClass}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {saveError && (
            <p className="mt-4 flex gap-2 rounded-petflow-sm bg-wait/10 px-3 py-2 text-xs font-bold text-wait">
              <Icon name="alert" size={15} className="mt-px" />
              {saveError}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className={`mt-5 ${BTN_PRIMARY}`}
          >
            {!saving && <Icon name="send" size={18} />}
            {saving
              ? "กำลังบันทึก…"
              : nextStep
                ? `บันทึก แล้วไปขั้นต่อไป: ${nextStep.label}`
                : forms.length > 1
                  ? `ส่งข้อมูลให้ร้าน (${forms.length} ตัว)`
                  : "ส่งข้อมูลให้ร้าน"}
          </button>
        </>
      )}
    </div>
  );
}

export default function GroomInfoPage() {
  return (
    <Suspense
      fallback={<LoadingScreen />}
    >
      <GroomInfoContent />
    </Suspense>
  );
}
