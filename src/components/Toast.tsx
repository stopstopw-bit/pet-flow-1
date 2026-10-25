"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; msg: string; kind: ToastKind };

let nextId = 1;
const listeners = new Set<(t: ToastItem) => void>();

/** เรียกจากที่ไหนก็ได้ — แจ้งเตือนมุมจอ ไม่ต้องกดปิด */
export function toast(msg: string, kind: ToastKind = "success") {
  const item = { id: nextId++, msg, kind };
  listeners.forEach((l) => l(item));
}

type PopupItem = { id: number; title: string; lines: string[] };
const popupListeners = new Set<(p: PopupItem) => void>();

/**
 * ป๊อปอัป "บันทึกแล้ว" กลางจอ — ใช้กับฟอร์มยาวที่ปุ่มบันทึกอยู่ล่างสุด
 * (แจ้งเตือนมุมบน/แผงด้านบนของหน้า คนกดอยู่ล่างจอมองไม่เห็น) ปิดเองใน 2.5 วิ หรือแตะปิด
 */
export function savedPopup(title: string, lines: string[] = []) {
  const item = { id: nextId++, title, lines: lines.filter(Boolean) };
  popupListeners.forEach((l) => l(item));
}

const STYLE: Record<ToastKind, string> = {
  success: "bg-sage/95 text-white",
  error: "bg-wait/95 text-white",
  info: "bg-petflow-chocolate/95 text-white",
};
const ICON: Record<ToastKind, string> = { success: "✅", error: "⚠️", info: "💬" };

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [popup, setPopup] = useState<PopupItem | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = (p: PopupItem) => {
      setPopup(p);
      if (timer) clearTimeout(timer);
      // มีรายละเอียดหลายบรรทัด = ให้เวลาอ่านนานขึ้นนิด
      timer = setTimeout(() => setPopup((cur) => (cur?.id === p.id ? null : cur)), p.lines.length ? 3500 : 2500);
    };
    popupListeners.add(show);
    return () => {
      popupListeners.delete(show);
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const add = (t: ToastItem) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== t.id));
      }, 3200);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);

  if (items.length === 0 && !popup) return null;

  return (
    <>
    {popup && (
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-petflow-chocolate/20 px-6 print:hidden"
        onClick={() => setPopup(null)}
        role="status"
        aria-live="polite"
      >
        <div className="animate-pop w-full max-w-xs rounded-petflow bg-card px-6 py-6 text-center shadow-petflow">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-ok text-card">
            <Icon name="check" size={28} strokeWidth={2.6} />
          </span>
          <p className="text-base font-extrabold text-petflow-chocolate">{popup.title}</p>
          {popup.lines.map((l, i) => (
            <p key={i} className="mt-1 text-xs text-brown-soft">
              {l}
            </p>
          ))}
          <button
            type="button"
            className="mt-4 min-h-[44px] w-full rounded-full bg-petflow-chocolate text-sm font-bold text-card"
          >
            ตกลง
          </button>
        </div>
      </div>
    )}
    {items.length > 0 && (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto max-w-md rounded-petflow-sm px-4 py-2.5 text-sm font-bold shadow-petflow ${STYLE[t.kind]}`}
          onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
        >
          {ICON[t.kind]} {t.msg}
        </div>
      ))}
    </div>
    )}
    </>
  );
}
