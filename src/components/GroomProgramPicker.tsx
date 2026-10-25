"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { GROOM_PROGRAMS, resolveGroomPrograms, type GroomProgram } from "@/lib/grooming-prices";

/** โปรแกรมอาบน้ำจากตั้งค่าร้าน — โหลดครั้งเดียว ใช้ค่าเริ่มต้นไปก่อนระหว่างรอ */
export function useGroomPrograms(): GroomProgram[] {
  const [programs, setPrograms] = useState<GroomProgram[]>(GROOM_PROGRAMS);
  useEffect(() => {
    let alive = true;
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setPrograms(resolveGroomPrograms(d.config?.groomPricePrograms));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return programs;
}

/**
 * เลือกว่าคอร์สนับครั้งใช้กับโปรแกรมไหน
 * "" = ทุกโปรแกรม (แบบเดิม: หัก 1 ครั้งแล้วบิลนั้นฟรี)
 * เลือกโปรแกรม = หักตามจำนวนตัวที่อาบโปรแกรมนั้นในบิล ใช้ร่วมกันทั้งบ้าน
 */
export function GroomProgramPicker({
  value,
  onChange,
  programs,
}: {
  value: string;
  onChange: (id: string) => void;
  programs: GroomProgram[];
}) {
  const chip = (active: boolean) =>
    `flex min-h-[36px] items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${
      active ? "bg-petflow-chocolate text-card" : "bg-paper text-brown-soft"
    }`;
  return (
    <div>
      <span className="mb-1.5 block text-xs font-bold text-brown-soft">ใช้กับโปรแกรม</span>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => onChange("")} className={chip(!value)}>
          {!value && <Icon name="check" size={13} strokeWidth={2.4} />}
          ทุกโปรแกรม
        </button>
        {programs.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className={chip(value === p.id)}
          >
            {value === p.id && <Icon name="check" size={13} strokeWidth={2.4} />}
            {p.name}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-brown-faint">
        {value
          ? "หักครั้งตามจำนวนน้องที่อาบโปรแกรมนี้ในบิล ใช้ร่วมกันได้ทั้งบ้าน"
          : "หัก 1 ครั้งต่อบิล แล้วบิลนั้นฟรี (แบบเดิม)"}
      </p>
    </div>
  );
}

/**
 * ช่องเลือกโปรแกรมอาบน้ำของน้องตัวเดียว — ใช้ใต้ชื่อน้องแต่ละตัวตอนจองหลายตัวพร้อมกัน
 * (แต่ละตัวอาบคนละโปรแกรมได้ ค่าตั้งต้นตามโปรแกรมที่เลือกให้ทุกตัว)
 */
export function PetProgramSelect({
  cat,
  value,
  onChange,
  programs,
  emptyLabel,
}: {
  cat: string;
  value: string;
  onChange: (id: string) => void;
  programs: GroomProgram[];
  emptyLabel: string;
}) {
  return (
    <select
      aria-label={`โปรแกรมอาบน้ำของ ${cat}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-[40px] w-full basis-full rounded-petflow-sm border border-petflow-line bg-card px-2 py-1.5 text-sm text-brown"
    >
      <option value="">{emptyLabel}</option>
      {programs.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
