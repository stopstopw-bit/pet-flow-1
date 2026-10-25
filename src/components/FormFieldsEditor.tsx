"use client";

import { Icon } from "@/components/Icon";
import type { GroomField, GroomFieldConfig, GroomFormConfig } from "@/lib/groom-form";

/**
 * ตัวแก้คำถามฟอร์มลูกค้า (ก่อนอาบน้ำ / ก่อนเข้าพัก) — เปิด/ปิด บังคับตอบ แก้คำถาม เพิ่ม-ลบตัวเลือก
 * เก็บเฉพาะที่ต่างจากค่าเริ่มต้นใน value (GroomFormConfig)
 */
export function FormFieldsEditor({
  defaults,
  value,
  onPatch,
  onReset,
}: {
  defaults: GroomField[];
  value: GroomFormConfig;
  onPatch: (key: string, p: Partial<GroomFieldConfig>) => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-3">
      {defaults.map((def) => {
        const c = value[def.key] || {};
        const enabled = c.enabled ?? def.enabled;
        const required = c.required ?? def.required;
        const options = c.options ?? def.options;
        const isChip = def.type === "single" || def.type === "multi";
        return (
          <div
            key={def.key}
            className={`rounded-petflow-sm border p-3 ${
              enabled ? "border-petflow-line bg-paper/40" : "border-dashed border-petflow-line bg-paper/20 opacity-60"
            }`}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-brown">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => onPatch(def.key, { enabled: e.target.checked })}
                  className="h-4 w-4 accent-latte-deep"
                />
                แสดงคำถามนี้
              </label>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-brown">
                <input
                  type="checkbox"
                  checked={required}
                  disabled={!enabled}
                  onChange={(e) => onPatch(def.key, { required: e.target.checked })}
                  className="h-4 w-4 accent-latte-deep"
                />
                บังคับตอบ
              </label>
              <span className="ml-auto rounded-full bg-card px-2 py-0.5 text-[9px] font-bold text-brown-faint">
                {def.type === "multi"
                  ? "เลือกหลายข้อ"
                  : def.type === "single"
                    ? "เลือก 1 ข้อ"
                    : def.type === "textarea"
                      ? "พิมพ์ยาว"
                      : "พิมพ์สั้น"}
              </span>
            </div>

            <input
              value={c.label ?? def.label}
              disabled={!enabled}
              onChange={(e) => onPatch(def.key, { label: e.target.value })}
              className="w-full rounded-petflow-sm border border-petflow-line bg-card px-2.5 py-2 text-xs font-bold text-brown"
            />

            {!isChip && (
              <input
                value={c.placeholder ?? def.placeholder ?? ""}
                disabled={!enabled}
                onChange={(e) => onPatch(def.key, { placeholder: e.target.value })}
                placeholder="ข้อความตัวอย่างในช่องพิมพ์"
                className="mt-1.5 w-full rounded-petflow-sm border border-petflow-line bg-card px-2.5 py-1.5 text-[11px] text-brown-soft"
              />
            )}

            {isChip && enabled && (
              <div className="mt-2">
                <p className="mb-1 text-[10px] font-bold text-brown-soft">
                  ตัวเลือก ({options.length})
                </p>
                <div className="space-y-1.5">
                  {options.map((o, i) => (
                    <div key={o.key} className="flex items-center gap-1.5">
                      <input
                        value={o.label}
                        onChange={(e) => {
                          const next = options.map((x, j) =>
                            j === i ? { ...x, label: e.target.value } : x
                          );
                          onPatch(def.key, { options: next });
                        }}
                        className="flex-1 rounded-petflow-sm border border-petflow-line bg-card px-2.5 py-1.5 text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onPatch(def.key, {
                            options: options.filter((_, j) => j !== i),
                          })
                        }
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wait/10 text-wait"
                        aria-label="ลบตัวเลือก"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const label = prompt("ชื่อตัวเลือกใหม่ (ใส่อิโมจิได้):");
                    if (!label?.trim()) return;
                    onPatch(def.key, {
                      options: [...options, { key: label.trim(), label: label.trim() }],
                    });
                  }}
                  className="mt-1.5 flex h-9 items-center gap-1 rounded-full bg-sage/20 px-3 text-[11px] font-bold text-ok"
                >
                  <Icon name="plus" size={14} />
                  เพิ่มตัวเลือก
                </button>
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={onReset}
        className="flex h-10 items-center gap-1.5 rounded-full bg-paper px-4 text-[11px] font-bold text-wait"
      >
        <Icon name="back" size={14} />
        รีเซ็ตฟอร์มกลับค่าเริ่มต้นทั้งหมด
      </button>
    </div>
  );
}

/** ค่ารีเซ็ต — ต้องส่งทุก key เป็น {} (config merge ทีละชั้น ส่ง {} เปล่าจะไม่ล้างค่าเก่า) */
export function resetFormConfig(defaults: { key: string }[]): GroomFormConfig {
  return Object.fromEntries(defaults.map((d) => [d.key, {}]));
}

/** พรีวิวฟอร์มแบบที่ลูกค้าเห็น */
export function FormFieldsPreview({ title, fields }: { title: string; fields: GroomField[] }) {
  return (
    <div className="rounded-2xl bg-[#efe6d6] p-3">
      <div className="rounded-petflow bg-[#fdfaf4] p-3">
        <p className="text-sm font-extrabold text-[#4a3a12]">{title}</p>
        <p className="mt-0.5 text-[10px] text-[#8a7a5c]">🐾 Soju</p>
        {fields.map((fd) => (
          <div key={fd.key} className="mt-2.5">
            <p className="mb-1 text-[10px] font-bold text-[#6b5c40]">
              {fd.label}
              {fd.required && " *"}
            </p>
            {fd.type === "single" || fd.type === "multi" ? (
              <div className="flex flex-wrap gap-1">
                {fd.options.map((o, i) => (
                  <span
                    key={o.key}
                    className={`rounded-full px-2 py-1 text-[9.5px] font-bold ${
                      i === 0
                        ? "bg-[#7a6a48] text-[#fff8ec]"
                        : "border border-[#e2d4b8] bg-[#f4ecd8] text-[#6b5c40]"
                    }`}
                  >
                    {o.label}
                  </span>
                ))}
                {fd.options.length === 0 && (
                  <span className="text-[9.5px] text-wait">
                    (ยังไม่มีตัวเลือก — เพิ่มด้านซ้าย)
                  </span>
                )}
              </div>
            ) : (
              <div className="rounded border border-[#e2d4b8] bg-white px-2 py-1.5 text-[9.5px] text-[#b3a68a]">
                {fd.placeholder || "…"}
              </div>
            )}
          </div>
        ))}
        <div className="mt-3 rounded-lg bg-[#8a7350] py-2 text-center text-[10px] font-extrabold text-[#fff8ec]">
          💛 ส่งข้อมูลให้ร้าน
        </div>
      </div>
    </div>
  );
}
