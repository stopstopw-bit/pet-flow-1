"use client";

import { Icon } from "@/components/Icon";
import {
  REGISTER_FORM_DEFAULTS,
  REGISTER_GROUP_LABELS,
  resolveRegisterForm,
  type RegisterFieldConfig,
  type RegisterFieldDef,
  type RegisterFormConfig,
} from "@/lib/register-form";

const GROUPS: RegisterFieldDef["group"][] = ["owner", "cat", "end"];

/** ตัวแก้ช่องฟอร์มสมัครสมาชิก — เปิด/ปิด บังคับกรอก แก้ชื่อช่อง */
export function RegisterFormEditor({
  value,
  onPatch,
  onReset,
}: {
  value: RegisterFormConfig;
  onPatch: (key: string, p: Partial<RegisterFieldConfig>) => void;
  onReset: () => void;
}) {
  const resolved = resolveRegisterForm(value);
  return (
    <div className="space-y-4">
      {GROUPS.map((g) => (
        <div key={g} className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">
            {REGISTER_GROUP_LABELS[g]}
          </p>
          {REGISTER_FORM_DEFAULTS.filter((d) => d.group === g).map((def) => {
            const f = resolved[def.key];
            return (
              <div
                key={def.key}
                className={`rounded-petflow-sm border p-3 ${
                  f.enabled ? "border-petflow-line bg-paper/40" : "border-dashed border-petflow-line bg-paper/20 opacity-60"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {def.locked ? (
                    <span className="flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[10px] font-bold text-brown-faint">
                      ต้องมีเสมอ
                    </span>
                  ) : (
                    <>
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-brown">
                        <input
                          type="checkbox"
                          checked={f.enabled}
                          onChange={(e) => onPatch(def.key, { enabled: e.target.checked })}
                          className="h-4 w-4 accent-latte-deep"
                        />
                        แสดงช่องนี้
                      </label>
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-brown">
                        <input
                          type="checkbox"
                          checked={f.required}
                          disabled={!f.enabled}
                          onChange={(e) => onPatch(def.key, { required: e.target.checked })}
                          className="h-4 w-4 accent-latte-deep"
                        />
                        บังคับกรอก
                      </label>
                    </>
                  )}
                </div>
                <input
                  value={value[def.key]?.label ?? def.label}
                  disabled={!f.enabled}
                  onChange={(e) => onPatch(def.key, { label: e.target.value })}
                  className="w-full rounded-petflow-sm border border-petflow-line bg-card px-2.5 py-2 text-xs font-bold text-brown"
                />
              </div>
            );
          })}
        </div>
      ))}
      <p className="text-[10px] text-brown-faint">
        ตัวเลือกสายพันธุ์ และตัวเลือกรู้จักเราจากทางไหน แก้ได้ที่ ตั้งค่า › รายการ
      </p>
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

/** ค่ารีเซ็ต — ส่งทุก key เป็น {} (config merge ทีละชั้น) */
export function resetRegisterForm(): RegisterFormConfig {
  return Object.fromEntries(REGISTER_FORM_DEFAULTS.map((d) => [d.key, {}]));
}

/** พรีวิวรายการช่องที่ลูกค้าจะเห็น */
export function RegisterFormPreview({ value }: { value: RegisterFormConfig }) {
  const resolved = resolveRegisterForm(value);
  return (
    <div className="rounded-2xl bg-[#efe6d6] p-3">
      <div className="rounded-petflow bg-[#fdfaf4] p-3">
        <p className="text-sm font-extrabold text-[#4a3a12]">สมัครสมาชิก</p>
        {GROUPS.map((g) => (
          <div key={g} className="mt-2.5">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[#8a7a5c]">
              {REGISTER_GROUP_LABELS[g]}
            </p>
            {REGISTER_FORM_DEFAULTS.filter((d) => d.group === g && resolved[d.key].enabled).map((d) => (
              <div
                key={d.key}
                className="mt-1 rounded border border-[#e2d4b8] bg-white px-2 py-1.5 text-[10px] font-bold text-[#6b5c40]"
              >
                {resolved[d.key].label}
                {resolved[d.key].required ? " *" : <span className="font-normal text-[#b3a68a]"> (ไม่บังคับ)</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
