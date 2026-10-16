"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import type { RoomClosure } from "@/lib/room-board";

const REASONS = ["ซ่อมบำรุง", "ใช้งานไม่ได้", "ทำความสะอาดใหญ่", "สำรองไว้"];

/**
 * ปิด/เปิดห้องรายห้อง — เลือกเหตุผล วันเริ่ม และวันสุดท้ายที่ปิด (ไม่ใส่ = ปิดจนกว่าจะกดเปิด)
 * ช่วงที่ปิด ระบบจะไม่จัดแมวลงห้องนี้ และไม่นับเป็นห้องว่างตอนจอง
 */
export function RoomClosureSheet({
  typeName,
  unit,
  date,
  current,
  onClose,
  onSave,
  onReopen,
}: {
  typeName: string;
  unit: number;
  /** วันที่กำลังดูในผังห้อง — ใช้เป็นวันเริ่มปิด */
  date: string;
  current?: RoomClosure;
  onClose: () => void;
  onSave: (c: { from: string; to?: string; reason: string }) => Promise<void> | void;
  onReopen?: () => Promise<void> | void;
}) {
  const [reason, setReason] = useState(current?.reason || REASONS[0]);
  const [from, setFrom] = useState(current?.from || date);
  const [to, setTo] = useState(current?.to || "");
  const [busy, setBusy] = useState(false);
  const field = "mt-1 min-h-[44px] w-full rounded-xl border border-petflow-line bg-paper px-3 py-2 text-sm";
  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-petflow bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-petflow sm:rounded-petflow"
      >
        <div className="mb-3 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Room status</p>
            <p className="text-base font-extrabold text-petflow-chocolate">
              {current ? "แก้การปิดห้อง" : "ปิดห้อง"} {typeName} #{unit}
            </p>
          </div>
          <button type="button" aria-label="ปิด" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-brown">
            <Icon name="x" size={18} />
          </button>
        </div>

        <p className="text-xs font-bold text-brown-soft">เหตุผล</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={`min-h-[40px] rounded-full px-3.5 text-xs font-bold ${
                reason === r ? "bg-petflow-chocolate text-card" : "bg-paper text-brown"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="หรือพิมพ์เหตุผลเอง เช่น แอร์เสีย"
          className={`${field} mt-2`}
        />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block text-xs font-bold text-brown-soft">
            ปิดตั้งแต่
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
          </label>
          <label className="block text-xs font-bold text-brown-soft">
            ปิดถึงวันที่
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={field} />
          </label>
        </div>
        <p className="mt-1.5 text-[11px] text-brown-faint">
          {to ? "เปิดให้จองอีกครั้งวันถัดจากวันสุดท้าย" : "ไม่ใส่วันสุดท้าย = ปิดไว้จนกว่าจะกดเปิดห้อง"}
        </p>

        <div className={`mt-4 grid gap-2 ${current && onReopen ? "grid-cols-[auto_1fr]" : "grid-cols-1"}`}>
          {current && onReopen && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(onReopen)}
              className="min-h-[48px] rounded-full bg-paper px-4 text-sm font-bold text-brown disabled:opacity-50"
            >
              เปิดห้อง
            </button>
          )}
          <button
            type="button"
            disabled={busy || !from || !reason.trim() || (!!to && to < from)}
            onClick={() => run(() => onSave({ from, to: to || undefined, reason: reason.trim() }))}
            className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-full bg-petflow-chocolate text-sm font-extrabold text-card disabled:opacity-50"
          >
            <Icon name="check" size={16} strokeWidth={2.4} />
            {current ? "บันทึก" : "ปิดห้องนี้"}
          </button>
        </div>
      </div>
    </div>
  );
}
