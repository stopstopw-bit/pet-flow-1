"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Toast";
import { PreviewSendModal } from "@/components/PreviewSendModal";
import { VaccinePhotosAdmin } from "@/components/VaccinePhotosAdmin";
import { useConfig } from "@/components/ConfigProvider";
import { cardOn } from "@/lib/features";
import { INTAKE_LABEL } from "@/lib/intake-cards";
import { splitVaccinePhotos } from "@/lib/vaccine-photos";
import type { CustomerRecord } from "@/lib/customers-store";

type Part = "groomInfo" | "stayInfo" | "prestay" | "consent" | "vaccine" | "idcard";

/**
 * หน้าข้อมูลลูกค้า: ส่งการ์ดถามข้อมูลก่อนรับน้อง โดยยังไม่ต้องลงนัด
 * แต่ละเรื่องมีปุ่มส่ง LINE ของตัวเอง + ติ๊กหลายเรื่องส่งรวมเป็น 1 ข้อความได้ (สูงสุด 5 ใบ)
 * สถานะข้างแต่ละแถว = ลูกค้าส่งกลับมาแล้วหรือยัง · สมุดวัคซีนรายตัว พนักงานแนบเองได้
 */
export function CustomerIntakeCards({ customer, onDone }: { customer: CustomerRecord; onDone: () => void }) {
  const { config } = useConfig();
  // การ์ดที่ร้านปิดในตั้งค่า › เปิด/ปิดฟีเจอร์ ไม่โชว์ให้ส่ง
  const partOn = (part: Part) => cardOn(config, part);
  const [catIds, setCatIds] = useState<string[]>(customer.cats.map((c) => c.id));
  const [picked, setPicked] = useState<Part[]>([]);
  const [busy, setBusy] = useState("");
  const [pending, setPending] = useState<{ parts: Part[]; messages: Record<string, unknown>[] } | null>(null);
  const [sending, setSending] = useState(false);
  const noLine = !customer.lineUserId;
  const cats = customer.cats.filter((c) => catIds.includes(c.id));

  const infoDone = cats.length > 0 && cats.every((c) => c.groomHealthInfo);
  const stayDone = cats.length > 0 && cats.every((c) => c.stayInfo);
  const vaccineDone = cats.length > 0 && cats.every((c) => splitVaccinePhotos(c.vaccinePhotos).length > 0);
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
      label: INTAKE_LABEL.consent,
      icon: "doc",
      when: partOn("consent"),
      done: !!customer.consentAcceptedAt,
      status: customer.consentAcceptedAt
        ? `ยอมรับล่าสุด ${customer.consentAcceptedAt.slice(0, 10)}`
        : "ยังไม่เคยกดยอมรับ",
    },
    { part: "prestay", label: INTAKE_LABEL.prestay, icon: "bed", when: partOn("prestay") },
  ];

  const requestPreview = async (parts: Part[], key: string) => {
    if (parts.length === 0) return;
    setBusy(key);
    try {
      const res = await fetch("/api/customers/send-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customer.id, parts, catIds, preview: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(d.preview)) setPending({ parts, messages: d.preview });
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
        body: JSON.stringify({ customerId: customer.id, parts: pending.parts, catIds }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return toast(d.error ? `ส่งไม่สำเร็จ: ${d.error}` : "ส่งไม่สำเร็จ", "error");
      toast(`ส่งการ์ด ${pending.parts.length} ใบแล้ว 📨`, "success");
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
        แต่ละเรื่องกดส่ง LINE ได้เลย · หรือติ๊กหลายเรื่องแล้วส่งรวมเป็น 1 ข้อความ
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
                <Icon name="send" size={13} />
                {busy === r.part ? "…" : "ส่ง LINE"}
              </button>
            </li>
          ))}
      </ul>

      <button
        type="button"
        disabled={noLine || picked.length === 0 || busy !== ""}
        onClick={() => requestPreview(picked, "bundle")}
        className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-petflow-sm bg-latte-deep py-2.5 text-sm font-extrabold text-white disabled:opacity-40"
      >
        <Icon name="send" size={16} />
        {busy === "bundle" ? "กำลังโหลด…" : `ส่งที่ติ๊กไว้ ${picked.length} การ์ดใน 1 ข้อความ`}
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
      {customer.consentSignature && (
        <a
          href={customer.consentSignature}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex min-h-[36px] items-center gap-1 text-[11px] font-bold text-latte-deep underline"
        >
          ดูลายเซ็นยอมรับข้อตกลงล่าสุด
          {customer.consentFleaTick ? " · ยืนยันหยดยาเห็บหมัดแล้ว" : ""}
        </a>
      )}
    </div>
  );
}
