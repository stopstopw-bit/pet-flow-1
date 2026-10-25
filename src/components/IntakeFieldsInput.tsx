"use client";

import type { GroomField } from "@/lib/groom-form";
import type { IntakeAnswers } from "@/lib/intake-rules";

/** ช่องตอบคำถามฟอร์มทำประวัติ (ปุ่มเลือก / ช่องพิมพ์) — ใช้ในหน้าสมัครสมาชิก */
export function IntakeFieldsInput({
  fields,
  answers,
  onChange,
  showMissing,
  inputClass,
}: {
  fields: GroomField[];
  answers: IntakeAnswers;
  onChange: (key: string, value: string | string[]) => void;
  /** กดบันทึกแล้ว — ข้อบังคับที่ยังว่างขึ้นสีเตือน */
  showMissing: boolean;
  inputClass: string;
}) {
  const chip = (active: boolean, label: string, onClick: () => void, key: string) => (
    <button
      key={key}
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
  return (
    <>
      {fields.map((fd) => {
        const value = answers[fd.key];
        const missing = showMissing && fd.required && intakeAnswerEmpty(value);
        return (
          <div key={fd.key}>
            <p className={`mb-1 text-xs font-bold ${missing ? "text-wait" : "text-brown"}`}>
              {fd.label}
              {fd.required && <span className="text-red-600"> *</span>}
            </p>
            {fd.type === "single" && (
              <div className="flex flex-wrap gap-2">
                {fd.options.map((o) => chip(value === o.key, o.label, () => onChange(fd.key, o.key), o.key))}
              </div>
            )}
            {fd.type === "multi" && (
              <div className="flex flex-wrap gap-2">
                {fd.options.map((o) => {
                  const cur = Array.isArray(value) ? value : [];
                  const on = cur.includes(o.key);
                  return chip(on, o.label, () => onChange(fd.key, on ? cur.filter((x) => x !== o.key) : [...cur, o.key]), o.key);
                })}
              </div>
            )}
            {fd.type === "text" && (
              <input
                value={String(value || "")}
                onChange={(e) => onChange(fd.key, e.target.value)}
                placeholder={fd.placeholder}
                className={inputClass}
              />
            )}
            {fd.type === "textarea" && (
              <textarea
                value={String(value || "")}
                onChange={(e) => onChange(fd.key, e.target.value)}
                placeholder={fd.placeholder}
                rows={2}
                className={inputClass}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

export function intakeAnswerEmpty(v: string | string[] | undefined): boolean {
  return Array.isArray(v) ? v.length === 0 : !String(v || "").trim();
}
