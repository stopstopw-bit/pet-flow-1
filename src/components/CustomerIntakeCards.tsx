"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Toast";
import { PreviewSendModal } from "@/components/PreviewSendModal";
import { VaccinePhotosAdmin } from "@/components/VaccinePhotosAdmin";
import { useConfig } from "@/components/ConfigProvider";
import { cardOn, isFeatureOn } from "@/lib/features";
import { INTAKE_LABEL } from "@/lib/intake-cards";
import { splitVaccinePhotos } from "@/lib/vaccine-photos";
import { stayInfoDone } from "@/lib/intake-rules";
import { fleaQuestions, parseFleaInfo } from "@/lib/flea-update";
import { formatThaiDateShort } from "@/lib/format-thai-date";
import type { CustomerRecord } from "@/lib/customers-store";

type Part = "groomInfo" | "stayInfo" | "prestay" | "consent" | "groomConsent" | "vaccine" | "idcard" | "fleaUpdate";

/**
 * หน้าข้อมูลลูกค้า: ส่งการ์ดถามข้อมูลก่อนรับน้อง โดยยังไม่ต้องลงนัด
 * แต่ละเรื่องมีปุ่มส่ง LINE ของตัวเอง + ติ๊กหลายเรื่องส่งรวมเป็น 1 ข้อความได้ (สูงสุด 5 ใบ)
 * สถานะข้างแต่ละแถว = ลูกค้าส่งกลับมาแล้วหรือยัง · สมุดวัคซีนรายตัว พนักงานแนบเองได้
 */
export function CustomerIntakeCards({
  customer,
  onDone,
  bookingKind,
}: {
  customer: CustomerRecord;
  onDone: () => void;
  /** มาจากฟอร์มจองใหม่: โชว์เฉพาะเรื่องที่นัดนี้ใช้ (เข้าพักไม่อาบน้ำ = ไม่ถามประวัติก่อนอาบน้ำ)
   *  ไม่ใส่ = หน้าข้อมูลลูกค้า โชว์ทุกเรื่อง */
  bookingKind?: "groom" | "room" | "room+groom";
}) {
  const { config } = useConfig();
  const hotelOn = bookingKind !== "groom";
  const groomOn = bookingKind !== "room";
  // การ์ดที่ร้านปิดในตั้งค่า › เปิด/ปิดฟีเจอร์ ไม่โชว์ให้ส่ง · มาจากฟอร์มจอง = เฉพาะเรื่องที่นัดนี้ใช้
  const HOTEL_PARTS: Part[] = ["stayInfo", "idcard", "prestay", "fleaUpdate"];
  const partOn = (part: Part) =>
    cardOn(config, part) &&
    (part === "groomInfo" || part === "groomConsent" ? groomOn : HOTEL_PARTS.includes(part) ? hotelOn : true);
  const [catIds, setCatIds] = useState<string[]>(customer.cats.map((c) => c.id));
  const [picked, setPicked] = useState<Part[]>([]);
  const [busy, setBusy] = useState("");
  const [pending, setPending] = useState<{ parts: Part[]; updateParts: Part[]; messages: Record<string, unknown>[] } | null>(
    null
  );
  const [sending, setSending] = useState(false);
  const noLine = !customer.lineUserId;
  const cats = customer.cats.filter((c) => catIds.includes(c.id));

  const infoDone = cats.length > 0 && cats.every((c) => c.groomHealthInfo);
  const stayDone = cats.length > 0 && cats.every((c) => stayInfoDone(c.stayInfo));
  const vaccineDone = cats.length > 0 && cats.every((c) => splitVaccinePhotos(c.vaccinePhotos).length > 0);
  const groomConsentOn = partOn("groomConsent") && isFeatureOn(config, "grooming");
  // ยาเห็บหมัดล่าสุดของแต่ละตัว — ลูกค้าอัปเดตจากการ์ดนี้หรือจากฟอร์มก่อนเข้าพัก
  const fleaMethods = fleaQuestions(config).methods;
  const flea = cats.map((c) => ({ cat: c, info: parseFleaInfo(c.stayInfo) }));
  const fleaStatus = flea
    .filter((f) => f.info.method || f.info.last)
    .map((f) => {
      const m = fleaMethods.find((o) => o.key === f.info.method)?.label || "";
      const upd = f.info.updatedAt ? ` (อัปเดต ${formatThaiDateShort(f.info.updatedAt.slice(0, 10))})` : "";
      return `${cats.length > 1 ? `${f.cat.name}: ` : ""}${[m, f.info.last].filter(Boolean).join(" ")}${upd}`;
    })
    .join(" · ");
  const rows: { part: Part; label: string; icon: string; when: boolean; status?: string; done?: boolean }[] = [
    { part: "stayInfo", label: INTAKE_LABEL.stayInfo, icon: "edit", when: partOn("stayInfo"), done: stayDone, status: stayDone ? "กรอกแล้ว" : "ยังไม่กรอก" },
    { part: "groomInfo", label: INTAKE_LABEL.groomInfo, icon: "bath", when: partOn("groomInfo"), done: infoDone, status: infoDone ? "กรอกแล้ว" : "ยังไม่กรอก" },
    {
      part: "vaccine",
      label: INTAKE_LABEL.vaccine,
      icon: "image",
      when: partOn("vaccine"),
      done: vaccineDone,
      status: vaccineDone ? "ได้รับแล้ว" : "ยังไม่ได้รับ",
    },
    {
      part: "idcard",
      label: INTAKE_LABEL.idcard,
      icon: "user",
      when: partOn("idcard"),
      done: !!customer.idCardUrl,
      status: customer.idCardUrl ? "ได้รับแล้ว" : "ยังไม่ได้รับ",
    },
    {
      part: "consent",
      label: groomConsentOn ? "กฎเข้าพัก + กดยินยอม" : INTAKE_LABEL.consent,
      icon: "doc",
      // นัดอาบน้ำอย่างเดียว ใช้กฎอาบน้ำแทน
      when: partOn("consent") && (hotelOn || !groomConsentOn),
      done: !!customer.consentAcceptedAt,
      status: customer.consentAcceptedAt
        ? `ยอมรับล่าสุด ${customer.consentAcceptedAt.slice(0, 10)}`
        : "ยังไม่เคยกดยอมรับ",
    },
    // กฎอาบน้ำ/นวด แยกจากกฎเข้าพัก (ตั้งค่า › ข้อความ › ก่อนอาบน้ำ / นวด)
    { part: "groomConsent", label: "กฎอาบน้ำ/นวด + กดยินยอม", icon: "bath", when: groomConsentOn },
    { part: "prestay", label: INTAKE_LABEL.prestay, icon: "bed", when: partOn("prestay") },
    {
      part: "fleaUpdate",
      label: "อัปเดตยากำจัดเห็บหมัด",
      icon: "paw",
      when: partOn("fleaUpdate"),
      done: cats.length > 0 && flea.every((f) => f.info.updatedAt),
      status: fleaStatus || "ยังไม่เคยแจ้ง",
    },
  ];

  // สลับประเภทนัดแล้ว เรื่องที่ติ๊กไว้แต่ถูกซ่อน ไม่ส่งไปด้วย
  const shownPicked = picked.filter((p) => rows.some((r) => r.part === p && r.when));

  // เรื่องที่ลูกค้าส่งมาแล้ว → กดส่งอีก = "ขออัปเดต" (สมุดวัคซีนเล่มใหม่ / ประวัติน้องเปลี่ยน / บัตรใหม่)
  // กฎ + เตรียมตัวเข้าพัก ส่งซ้ำได้อยู่แล้ว ไม่ใช่การขออัปเดต
  const UPDATABLE: Part[] = ["stayInfo", "groomInfo", "vaccine", "idcard"];
  const isUpdate = (p: Part) => UPDATABLE.includes(p) && !!rows.find((r) => r.part === p)?.done;

  const requestPreview = async (parts: Part[], key: string) => {
    if (parts.length === 0) return;
    const updateParts = parts.filter(isUpdate);
    setBusy(key);
    try {
      const res = await fetch("/api/customers/send-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customer.id, parts, updateParts, catIds, preview: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(d.preview)) setPending({ parts, updateParts, messages: d.preview });
      else toast(d.error ? `โหลดตัวอย่างไม่สำเร็จ: ${d.error}` : "โหลดตัวอย่างไม่สำเร็จ", "error");
    } finally {
      setBusy("");
    }
  };

  const confirmSend = async () => {
    if (!pending) return;
    setSending(true);
    try {
      const res = await fetch("/api/customers/send-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customer.id, parts: pending.parts, updateParts: pending.updateParts, catIds }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return toast(d.error ? `ส่งไม่สำเร็จ: ${d.error}` : "ส่งไม่สำเร็จ", "error");
      toast(pending.updateParts.length ? "ส่งขออัปเดตข้อมูลแล้ว 📨" : `ส่งการ์ด ${pending.parts.length} ใบแล้ว 📨`, "success");
      setPending(null);
      setPicked([]);
    } finally {
      setSending(false);
    }
  };

  const togglePick = (p: Part) =>
    setPicked((prev) => {
      if (prev.includes(p)) return prev.filter((x) => x !== p);
      if (prev.length >= 5) {
        toast("เลือกได้สูงสุด 5 การ์ดต่อ 1 ข้อความ", "error");
        return prev;
      }
      return [...prev, p];
    });

  // ร้านปิดการ์ดถามข้อมูลทุกใบ — ไม่ต้องโชว์กล่องนี้เลย
  if (!rows.some((r) => r.when)) return null;

  return (
    <div className="mb-3 rounded-petflow-sm border border-petflow-line bg-card/85 p-3">
      {pending && (
        <PreviewSendModal
          messages={pending.messages}
          sending={sending}
          onConfirm={confirmSend}
          onCancel={() => setPending(null)}
        />
      )}
      <p className="flex items-center gap-2 text-xs font-extrabold text-petflow-chocolate">
        <Icon name="send" size={16} className="text-[#06883c]" />
        ถามข้อมูลก่อนรับน้อง (ยังไม่ต้องลงนัด)
      </p>
      <p className="mb-2 mt-0.5 text-[10px] text-brown-faint">
        แต่ละเรื่องกดส่ง LINE ได้เลย · หรือติ๊กหลายเรื่องแล้วส่งรวมเป็น 1 ข้อความ · เรื่องที่ได้รับแล้วกด
        &quot;ขออัปเดต&quot; เพื่อขอใหม่ได้ (เช่น สมุดวัคซีนเล่มใหม่ ข้อมูลเดิมยังเก็บไว้)
      </p>
      {noLine && (
        <p className="mb-2 flex items-center gap-2 rounded-petflow-sm bg-wait/10 px-3 py-2 text-[11px] font-bold text-wait">
          <Icon name="alert" size={14} />
          ลูกค้ายังไม่ผูก LINE — ส่งการ์ดไม่ได้
        </p>
      )}

      {customer.cats.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {customer.cats.map((c) => {
            const on = catIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCatIds((prev) => (on ? prev.filter((x) => x !== c.id) : [...prev, c.id]))}
                className={`flex min-h-[36px] items-center gap-1 rounded-full px-3 text-[11px] font-bold ${
                  on ? "bg-latte-deep text-white" : "bg-paper text-brown-soft"
                }`}
              >
                {on && <Icon name="check" size={12} strokeWidth={2.4} />}
                {c.name}
              </button>
            );
          })}
        </div>
      )}

      <ul className="divide-y divide-petflow-line overflow-hidden rounded-petflow-sm border border-petflow-line bg-card">
        {rows
          .filter((r) => r.when)
          .map((r) => (
            <li key={r.part} className="flex min-h-[52px] items-center gap-2 px-2.5 py-2">
              <input
                type="checkbox"
                aria-label={`เลือก ${r.label} เพื่อส่งรวม`}
                checked={picked.includes(r.part)}
                onChange={() => togglePick(r.part)}
                className="h-5 w-5 shrink-0 accent-latte-deep"
              />
              <Icon name={r.icon} size={16} className="shrink-0 text-brown-soft" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-petflow-chocolate">{r.label}</span>
                {r.status && (
                  <span className={`block text-[10px] font-bold ${r.done ? "text-ok" : "text-brown-faint"}`}>
                    {r.done ? "✓ " : ""}
                    {r.status}
                  </span>
                )}
              </span>
              <button
                type="button"
                disabled={noLine || busy !== ""}
                onClick={() => requestPreview([r.part], r.part)}
                className="flex min-h-[36px] shrink-0 items-center gap-1 rounded-full bg-[#06C755]/15 px-3 text-[11px] font-extrabold text-[#06883c] disabled:opacity-40"
              >
                <Icon name={isUpdate(r.part) ? "edit" : "send"} size={13} />
                {busy === r.part ? "…" : isUpdate(r.part) ? "ขออัปเดต" : "ส่ง LINE"}
              </button>
            </li>
          ))}
      </ul>

      <button
        type="button"
        disabled={noLine || shownPicked.length === 0 || busy !== ""}
        onClick={() => requestPreview(shownPicked, "bundle")}
        className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-petflow-sm bg-latte-deep py-2.5 text-sm font-extrabold text-white disabled:opacity-40"
      >
        <Icon name="send" size={16} />
        {busy === "bundle" ? "กำลังโหลด…" : `ส่งที่ติ๊กไว้ ${shownPicked.length} การ์ดใน 1 ข้อความ`}
      </button>

      {/* สมุดวัคซีนรายตัว — ลูกค้าส่งมา หรือพนักงานแนบเองจากรูปที่ลูกค้าส่งในแชท */}
      {customer.cats.length > 0 && partOn("vaccine") && (
        <div className="mt-3 space-y-1">
          {customer.cats.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              <span className="flex items-center gap-1 font-bold text-brown-soft">
                <Icon name="paw" size={12} />
                {c.name}
              </span>
              <VaccinePhotosAdmin customerId={customer.id} catId={c.id} value={c.vaccinePhotos} onDone={onDone} />
            </div>
          ))}
        </div>
      )}
      {/* รูปหลักฐานยาเห็บหมัดที่ลูกค้าแนบ (ล่าสุดก่อน) */}
      {partOn("fleaUpdate") && flea.some((f) => f.info.photos.length) && (
        <div className="mt-3 space-y-1">
          {flea
            .filter((f) => f.info.photos.length)
            .map((f) => (
              <div key={f.cat.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                <span className="flex items-center gap-1 font-bold text-brown-soft">💧 {f.cat.name}</span>
                {[...f.info.photos].reverse().map((url, i) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-bold text-ok underline">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="หลักฐานยาเห็บหมัด" className="h-8 w-8 rounded border border-petflow-line object-cover" />
                    {i === 0 && "หลักฐานยาเห็บหมัดล่าสุด"}
                  </a>
                ))}
              </div>
            ))}
        </div>
      )}
      {customer.consentSignature && (
        <a
          href={customer.consentSignature}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex min-h-[36px] items-center gap-1 text-[11px] font-bold text-latte-deep underline"
        >
          ดูลายเซ็นยอมรับข้อตกลงล่าสุด
          {customer.consentFleaTick ? " · ยืนยันป้องกันเห็บหมัดแล้ว" : ""}
        </a>
      )}
    </div>
  );
}
