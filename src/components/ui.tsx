"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";

/**
 * ชิ้นส่วน UI กลางที่ใช้ซ้ำทั้งระบบ — ให้ทุกหน้าค้นหา/เลือก/สลับแท็บ หน้าตาและการใช้งานเหมือนกัน
 */

/** ช่องติ๊กเลือก (แสดงผลอย่างเดียว — ให้ปุ่ม/แถวที่ครอบเป็นตัวกด) */
export function CheckBox({ on }: { on: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
        on ? "border-petflow-chocolate bg-petflow-chocolate text-card" : "border-petflow-line bg-card"
      }`}
    >
      {on && <Icon name="check" size={12} strokeWidth={3} />}
    </span>
  );
}

/** ช่องค้นหาแบบแคปซูล: ไอคอนแว่นขยาย + ปุ่มล้าง (โผล่เมื่อมีคำค้น) */
export function SearchField({
  value,
  onChange,
  placeholder = "ค้นหา",
  autoFocus,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-2 rounded-full border border-petflow-line bg-paper px-4 py-2.5 focus-within:border-honey-deep ${className}`}
    >
      <Icon name="search" size={18} className="text-brown-soft" />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 !border-0 !bg-transparent p-0 text-sm !shadow-none !outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="ล้างคำค้น"
          onClick={() => onChange("")}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-brown-faint/30 text-brown"
        >
          <Icon name="x" size={12} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}

/** วงกลมตัวอักษรแรกของชื่อ (ตัด คุณ/น้อง ออก) */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initial = (name || "?").trim().replace(/^(คุณ|น้อง)/, "").charAt(0) || "?";
  return (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-honey/40 text-sm font-extrabold text-petflow-chocolate"
    >
      {initial}
    </span>
  );
}

/** สวิตช์แบบแบ่งช่อง (segmented control) — ใช้แทนปุ่มแท็บหลายปุ่มเรียงกัน */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; icon?: string; badge?: number }[];
  className?: string;
}) {
  return (
    <div className={`flex gap-1 rounded-full bg-paper p-1 ${className}`} role="tablist">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold transition ${
              on ? "bg-card text-petflow-chocolate shadow-petflow-sm" : "text-brown-soft"
            }`}
          >
            {o.icon && <Icon name={o.icon} size={16} />}
            {o.label}
            {o.badge ? (
              <span className="rounded-full bg-petflow-chocolate px-1.5 text-[10px] leading-4 text-card">{o.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** หัวข้อส่วนเล็ก: อังกฤษตัวพิมพ์ใหญ่ · ไทย */
export function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-end justify-between gap-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">{children}</p>
      {action}
    </div>
  );
}

/** สถานะว่าง: ไอคอนในวงกลม + ข้อความ */
export function EmptyState({ icon = "inbox", title, sub }: { icon?: string; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-paper text-brown-soft">
        <Icon name={icon} size={22} />
      </span>
      <p className="text-sm font-bold text-brown">{title}</p>
      {sub && <p className="text-xs text-brown-soft">{sub}</p>}
    </div>
  );
}

/**
 * เมนู "เพิ่มเติม" (⋯) — รวมปุ่มรองหลายปุ่มไว้ในปุ่มเดียว เมนูลอยแบบ fixed (portal) จึงไม่โดนตัด/บังด้วยแถบเมนูล่าง
 * items: ปุ่มย่อยแต่ละอัน (label + icon + onClick) — ปุ่มหลักของการ์ดให้วางข้างนอกตามปกติ
 */
export function MoreMenu({
  items,
  label = "เพิ่มเติม",
  align = "right",
}: {
  items: { label: string; icon?: string; onClick: () => void; danger?: boolean; disabled?: boolean }[];
  label?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // วางเมนูแบบ fixed ตามตำแหน่งปุ่ม: ถ้าข้างล่างไม่พอ (ชนแถบเมนูล่าง/ขอบจอ) ให้เด้งขึ้นข้างบน
  // และจำกัดความสูงให้เลื่อนดูได้ — เมนูจะไม่โดนตัดหรือซ่อนหลัง bottom nav อีก
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const btn = btnRef.current;
      const menu = menuRef.current;
      if (!btn || !menu) return;
      const r = btn.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const gap = 6;
      const edge = 8;
      // แถบเมนูล่าง (+ ปุ่ม Book ที่ยื่นขึ้นมา 16px) กินพื้นที่ด้านล่าง
      let bottomLimit = vh - edge;
      document.querySelectorAll("[data-bottom-nav]").forEach((el) => {
        const top = el.getBoundingClientRect().top;
        if (top > 0 && top < vh) bottomLimit = Math.min(bottomLimit, top - 20);
      });
      const h = menu.scrollHeight;
      const below = bottomLimit - (r.bottom + gap);
      const above = r.top - gap - edge;
      const up = h > below && above > below;
      const style: CSSProperties = { maxHeight: Math.max(120, up ? above : below) };
      if (up) style.bottom = vh - r.top + gap;
      else style.top = r.bottom + gap;
      if (align === "right") style.right = Math.max(edge, vw - r.right);
      else style.left = Math.max(edge, r.left);
      setPos(style);
    };
    place();
    const close = (e: Event) => {
      const t = e.target as Node | null;
      if (t && (menuRef.current?.contains(t) || btnRef.current?.contains(t))) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open, align]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setPos(null);
          setOpen((o) => !o);
        }}
        className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-paper text-brown"
      >
        <Icon name="more" size={18} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={pos ?? { top: 0, left: 0, visibility: "hidden" }}
            className="fixed z-[80] min-w-[180px] max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain rounded-petflow-sm border border-petflow-line bg-card py-1 shadow-petflow"
          >
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-bold disabled:opacity-40 ${
                  it.danger ? "text-red-700" : "text-brown"
                } active:bg-paper`}
              >
                {it.icon && <Icon name={it.icon} size={16} />}
                {it.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
