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
const PENDING_POPUP_KEY = "pf_pending_popup";

/**
 * ป๊อปอัป "สำเร็จ" กลางจอ — ใช้กับงานสำคัญ (สมัคร จอง ส่งฟอร์ม บันทึกฟอร์มยาว)
 * ที่คนกดต้องเห็นชัด ๆ ว่าผ่านแล้ว ปิดเองใน 2.5 วิ หรือแตะปิด
 *
 * afterNav: เรียกก่อนเปลี่ยนหน้า (router.replace / location.href) — เก็บไว้ใน sessionStorage
 * ถ้าหน้าโหลดใหม่ทั้งหน้า ป๊อปอัปจะขึ้นที่หน้าถัดไปแทน (ไม่หายไปกับหน้าเดิม)
 */
export function savedPopup(title: string, lines: string[] = [], opts: { afterNav?: boolean } = {}) {
  const item = { id: nextId++, title, lines: lines.filter(Boolean) };
  if (opts.afterNav) {
    try {
      sessionStorage.setItem(PENDING_POPUP_KEY, JSON.stringify({ title: item.title, lines: item.lines }));
    } catch {
      /* โหมดส่วนตัว/บล็อก storage — ยังโชว์ในหน้าเดิมได้ถ้า Toaster ไม่ถูกถอด */
    }
  }
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
      try {
        sessionStorage.removeItem(PENDING_POPUP_KEY);
      } catch {
        /* ignore */
      }
      setPopup(p);
      if (timer) clearTimeout(timer);
      // มีรายละเอียดหลายบรรทัด = ให้เวลาอ่านนานขึ้นนิด
      timer = setTimeout(() => setPopup((cur) => (cur?.id === p.id ? null : cur)), p.lines.length ? 3500 : 2500);
    };
    popupListeners.add(show);
    // ป๊อปอัปที่ค้างมาจากหน้าก่อน (เปลี่ยนหน้าแบบโหลดใหม่ทั้งหน้า)
    try {
      const raw = sessionStorage.getItem(PENDING_POPUP_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { title?: string; lines?: string[] };
        if (saved.title) show({ id: nextId++, title: saved.title, lines: saved.lines || [] });
        else sessionStorage.removeItem(PENDING_POPUP_KEY);
      }
    } catch {
      /* ignore */
    }
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
  // ถ้ามีป๊อปอัปใหญ่อยู่แล้ว ไม่ต้องซ้อนการ์ดสำเร็จเล็กอีกใบ
  const successItems = popup ? [] : items.filter((t) => t.kind === "success");
  const otherItems = items.filter((t) => t.kind !== "success");

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
    {successItems.length > 0 && (
      // แจ้ง "สำเร็จ" เป็นการ์ดกลางจอ เห็นชัดกว่ามุมบน แต่ไม่บังการกดต่อ (ไม่มีฉากหลังมาขวาง)
      <div className="pointer-events-none fixed inset-0 z-[95] flex flex-col items-center justify-center gap-2 px-6 print:hidden">
        {successItems.map((t) => (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className="animate-pop pointer-events-auto flex w-full max-w-xs flex-col items-center rounded-petflow bg-card px-5 py-4 text-center shadow-petflow ring-1 ring-petflow-line"
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
          >
            <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-ok text-card">
              <Icon name="check" size={24} strokeWidth={2.6} />
            </span>
            <p className="text-sm font-extrabold text-petflow-chocolate">{t.msg}</p>
          </div>
        ))}
      </div>
    )}
    {otherItems.length > 0 && (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
      {otherItems.map((t) => (
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
