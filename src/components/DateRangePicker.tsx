"use client";

import { RANGE_OPTIONS, type RangeId } from "@/lib/date-range";

const MAIN_IDS: RangeId[] = ["today", "week", "month"];

/** แถบเลือกช่วงเวลา — ใช้ร่วมกันทั้งแดชบอร์ด บัญชี และหน้าสรุปข้อมูล */
export function DateRangePicker({
  value,
  onChange,
  custom,
  onCustomChange,
  className = "",
}: {
  value: RangeId;
  onChange: (id: RangeId) => void;
  custom: { from: string; to: string };
  onCustomChange: (next: { from: string; to: string }) => void;
  className?: string;
}) {
  // โชว์ 3 ช่วงที่ใช้บ่อยเป็นแถบเลื่อน ที่เหลือเก็บไว้ในตัวเลือก "อื่นๆ" — ลดจำนวนปุ่มบนจอ
  const main = RANGE_OPTIONS.filter((o) => MAIN_IDS.includes(o.id));
  const more = RANGE_OPTIONS.filter((o) => !MAIN_IDS.includes(o.id));
  const inMore = more.some((o) => o.id === value);
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 rounded-full bg-paper p-1">
          {main.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              className={`flex-1 rounded-full px-2 py-1.5 text-[11px] font-bold transition ${
                value === o.id
                  ? "bg-card text-petflow-chocolate shadow-petflow-sm"
                  : "text-brown-soft"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <select
          aria-label="ช่วงเวลาอื่น"
          value={inMore ? value : ""}
          onChange={(e) => e.target.value && onChange(e.target.value as RangeId)}
          className={`shrink-0 rounded-full border-0 px-3 py-2 text-[11px] font-bold ${
            inMore ? "bg-petflow-chocolate text-card" : "bg-paper text-brown-soft"
          }`}
        >
          <option value="" disabled>
            อื่นๆ
          </option>
          {more.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {value === "custom" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={custom.from}
            onChange={(e) => onCustomChange({ ...custom, from: e.target.value })}
            className="rounded-petflow-sm border border-petflow-line bg-paper px-2.5 py-1.5 text-xs"
          />
          <span className="text-xs text-brown-faint">ถึง</span>
          <input
            type="date"
            value={custom.to}
            onChange={(e) => onCustomChange({ ...custom, to: e.target.value })}
            className="rounded-petflow-sm border border-petflow-line bg-paper px-2.5 py-1.5 text-xs"
          />
        </div>
      )}
    </div>
  );
}
