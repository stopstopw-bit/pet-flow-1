"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { clashLine, CLASH_WINDOW_MIN, type ClashBooking } from "@/lib/groom-clash";

/** คิวอาบน้ำที่ชนกับวัน/เวลาที่เลือก — ดึงจากเซิร์ฟเวอร์ทุกครั้งที่วัน/เวลาเปลี่ยน */
export function useGroomClashes(date: string, time: string, exclude: string[] = []) {
  const [clashes, setClashes] = useState<ClashBooking[]>([]);
  const ex = exclude.join(",");
  useEffect(() => {
    if (!date || !time) {
      setClashes([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      const q = new URLSearchParams({ date, time, exclude: ex });
      fetch(`/api/bookings/clash?${q}`)
        .then((r) => r.json())
        .then((d) => alive && setClashes(d.clashes || []))
        .catch(() => alive && setClashes([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [date, time, ex]);
  return clashes;
}

/** ถามยืนยันก่อนบันทึกถ้าคิวชน — คืน true = จองต่อได้ */
export function confirmClashes(clashes: ClashBooking[]) {
  if (clashes.length === 0) return true;
  return window.confirm(
    `⚠️ เวลานี้มีคิวอาบน้ำอยู่แล้ว ${clashes.length} คิว\n\n${clashes.map(clashLine).join("\n")}\n\nยังจะจองเวลานี้ไหม?`
  );
}

export function GroomClashNote({ clashes }: { clashes: ClashBooking[] }) {
  if (clashes.length === 0) return null;
  return (
    <div role="alert" className="mt-2 flex gap-2 rounded-petflow-sm bg-honey/20 px-3 py-2.5 text-[11px] font-bold text-petflow-chocolate">
      <Icon name="alert" size={15} className="mt-px shrink-0" />
      <div>
        <p>คิวชน — ช่วงเวลานี้ (±{CLASH_WINDOW_MIN} นาที) มีนัดอยู่แล้ว</p>
        <ul className="mt-0.5 font-normal">
          {clashes.map((c) => (
            <li key={c.id}>{clashLine(c)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
