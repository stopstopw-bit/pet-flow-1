"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

/**
 * เลือกวันเกิดแบบ dropdown 3 ช่อง (วัน / เดือน / ปี) — ง่ายกว่าปฏิทิน native
 * มาก โดยเฉพาะการเลือกปีย้อนหลัง
 * - เก็บ state ภายในของแต่ละช่อง เพื่อให้เลือก "ทีละช่อง" ได้ (ค่าค้างไว้)
 * - ส่งออก (onChange) เป็น ISO "YYYY-MM-DD" (ค.ศ.) เมื่อเลือกครบทั้ง 3 ช่อง
 *   ถ้ายังไม่ครบจะส่ง "" (ให้ระบบคำนวณอายุ/บันทึกฐานข้อมูลใช้ต่อได้เหมือนเดิม)
 * - allowUnknown: มีติ๊ก "ไม่ทราบวันเกิด" ซ่อนช่องเลือกแล้วส่ง "" พร้อม { unknown: true }
 * - ช่องเลือกเป็นกล่องขาวขอบชัด + ลูกศรลงในวงกลม ให้ลูกค้ารู้ว่าแตะเลือกได้
 */

const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function BirthdayPicker({
  value,
  onChange,
  yearsBack = 30,
  required = false,
  selectClass,
  allowUnknown = false,
}: {
  value: string;
  onChange: (iso: string, info?: { unknown: boolean }) => void;
  yearsBack?: number;
  required?: boolean;
  selectClass?: string;
  allowUnknown?: boolean;
}) {
  const [unknown, setUnknown] = useState(false);
  const [d, setD] = useState(0);
  const [m, setM] = useState(0);
  const [y, setY] = useState(0);

  // ซิงค์จากค่าภายนอกเฉพาะตอนที่เป็นวันเกิดครบถ้วน (เช่น เติมค่าเดิม/แก้ไข)
  // ไม่รีเซ็ตเป็น 0 ตอน value ว่าง เพื่อไม่ลบสิ่งที่ผู้ใช้กำลังเลือกทีละช่อง
  useEffect(() => {
    if (!value) return;
    setUnknown(false);
    const [ys, ms, ds] = value.split("-");
    setY(Number(ys) || 0);
    setM(Number(ms) || 0);
    setD(Number(ds) || 0);
  }, [value]);

  const curYear = new Date().getFullYear();
  const years = Array.from({ length: yearsBack + 1 }, (_, i) => curYear - i);
  const daysInMonth = y && m ? new Date(y, m, 0).getDate() : 31;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const commit = (ny: number, nm: number, nd: number) => {
    // ถ้าเปลี่ยนเดือน/ปีแล้ววันเกินจำนวนวันของเดือนนั้น → ปรับวันลงให้พอดี
    const maxDay = ny && nm ? new Date(ny, nm, 0).getDate() : 31;
    const day = nd > maxDay ? maxDay : nd;
    setY(ny);
    setM(nm);
    setD(day);
    if (ny && nm && day) {
      onChange(`${ny}-${pad(nm)}-${pad(day)}`, { unknown: false });
    } else {
      onChange("", { unknown: false });
    }
  };

  const toggleUnknown = (next: boolean) => {
    setUnknown(next);
    if (next) {
      setD(0);
      setM(0);
      setY(0);
    }
    onChange("", { unknown: next });
  };

  const cls = (picked: boolean) =>
    selectClass ||
    `min-h-[44px] w-full cursor-pointer appearance-none rounded-xl border-2 border-latte/70 bg-card py-2 pl-2.5 pr-7 text-sm font-bold shadow-petflow-sm ${
      picked ? "text-brown" : "text-latte-deep"
    }`;

  // ลูกศรลงในวงกลมสีน้ำผึ้ง — บอกชัดว่า "แตะเพื่อเลือก"
  const arrow = selectClass ? null : (
    <span className="pointer-events-none absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-honey/40 text-petflow-chocolate">
      <Icon name="chevron" size={12} className="rotate-90" />
    </span>
  );

  const unknownTick = allowUnknown && (
    <label className="mt-2 inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border border-petflow-line bg-card px-3 text-xs font-bold text-brown">
      <input
        type="checkbox"
        checked={unknown}
        onChange={(e) => toggleUnknown(e.target.checked)}
        className="h-5 w-5 accent-latte-deep"
      />
      ไม่ทราบวันเกิด
    </label>
  );

  if (unknown) return <div>{unknownTick}</div>;

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <select
            required={required}
            value={d || ""}
            onChange={(e) => commit(y, m, Number(e.target.value))}
            className={cls(!!d)}
            aria-label="วันเกิด — วันที่"
          >
            <option value="">วัน</option>
            {days.map((dd) => (
              <option key={dd} value={dd}>
                {dd}
              </option>
            ))}
          </select>
          {arrow}
        </div>
        <div className="relative min-w-0 flex-[1.5]">
          <select
            required={required}
            value={m || ""}
            onChange={(e) => commit(y, Number(e.target.value), d)}
            className={cls(!!m)}
            aria-label="วันเกิด — เดือน"
          >
            <option value="">เดือน</option>
            {THAI_MONTHS.map((name, i) => (
              <option key={i} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
          {arrow}
        </div>
        <div className="relative min-w-0 flex-[1.3]">
          <select
            required={required}
            value={y || ""}
            onChange={(e) => commit(Number(e.target.value), m, d)}
            className={cls(!!y)}
            aria-label="วันเกิด — ปี ค.ศ."
          >
            <option value="">ปี</option>
            {years.map((yy) => (
              <option key={yy} value={yy}>
                {yy}
              </option>
            ))}
          </select>
          {arrow}
        </div>
      </div>
      {unknownTick}
    </div>
  );
}
