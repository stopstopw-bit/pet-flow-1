"use client";

import { useState } from "react";

/**
 * ช่วงเวลามาส่ง/มารับน้อง — ชุดเดียวใช้ทุกหน้า (การ์ด "คิวของฉัน" + หน้าเลือกเวลาจากลิงก์ LINE)
 * เดิมสองหน้ามีชุดเวลาไม่เท่ากัน (10-18 กับ 09-19) และเก็บคนละช่อง ลูกค้าเลยเห็นเวลาไม่ตรงกัน
 */
export const TIME_SLOTS = Array.from({ length: 11 }, (_, i) => `${String(9 + i).padStart(2, "0")}:00`);

export function TimeSlotPicker({
  value,
  onPick,
  disabled,
}: {
  value?: string | null;
  onPick: (time: string) => void;
  disabled?: boolean;
}) {
  const [custom, setCustom] = useState("");
  // เวลาที่เคยกรอกเองไม่อยู่ในช่องสำเร็จรูป → โชว์ในช่องกรอกให้เห็นว่าเลือกไว้แล้ว
  const customValue = custom || (value && !TIME_SLOTS.includes(value) ? value : "");

  return (
    <div>
      <div className="grid grid-cols-4 gap-1.5">
        {TIME_SLOTS.map((t) => (
          <button
            key={t}
            type="button"
            disabled={disabled}
            onClick={() => {
              setCustom("");
              onPick(t);
            }}
            className={`min-h-[44px] rounded-xl text-sm font-bold transition disabled:opacity-50 ${
              value === t ? "bg-latte-deep text-card shadow-petflow-sm" : "bg-card text-brown-soft"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <p className="mb-1.5 mt-3 text-xs font-bold text-brown-soft">หรือกรอกเวลาเอง</p>
      <div className="flex gap-2">
        <input
          type="time"
          value={customValue}
          onChange={(e) => setCustom(e.target.value)}
          className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-petflow-line bg-card px-3 text-sm"
        />
        <button
          type="button"
          disabled={!custom || disabled}
          onClick={() => onPick(custom)}
          className="min-h-[44px] shrink-0 rounded-xl bg-honey/50 px-4 text-sm font-extrabold text-petflow-chocolate disabled:opacity-40"
        >
          ใช้เวลานี้
        </button>
      </div>
    </div>
  );
}
