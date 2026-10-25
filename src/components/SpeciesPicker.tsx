"use client";

import { useConfig } from "@/components/ConfigProvider";
import { asksSpecies, type PetSpecies } from "@/lib/pet-kind";

/**
 * ปุ่มเลือก "หมา / แมว" ของน้องแต่ละตัว — โชว์เฉพาะร้านที่รับทั้งสองแบบ (ร้านรับชนิดเดียวไม่ต้องถาม)
 * สไตล์เดียวกับปุ่มเลือกเพศในหน้าสมัคร
 */
export function SpeciesPicker({
  value,
  onChange,
  className = "",
}: {
  value?: PetSpecies | "";
  onChange: (v: PetSpecies) => void;
  className?: string;
}) {
  const { config } = useConfig();
  if (!asksSpecies(config)) return null;
  return (
    <div className={`flex gap-1 rounded-full bg-paper p-1 ${className}`} role="radiogroup" aria-label="หมาหรือแมว">
      {(
        [
          ["dog", "🐶 หมา"],
          ["cat", "🐱 แมว"],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`min-h-[40px] flex-1 rounded-full text-sm font-bold transition ${
            value === v ? "bg-card text-petflow-chocolate shadow-petflow-sm" : "text-brown-soft"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
