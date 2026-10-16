"use client";

import { Icon } from "@/components/Icon";

/**
 * ชิ้นส่วน UI กลางที่ใช้ซ้ำทั้งระบบ — ให้ทุกหน้าค้นหา/เลือก/สลับแท็บ หน้าตาและการใช้งานเหมือนกัน
 */

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
      className={`flex items-center gap-2 rounded-full border border-petflow-line bg-paper px-4 py-2.5 focus-within:border-honey-deep ${className}`}
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
 * เมนู "เพิ่มเติม" (⋯) — รวมปุ่มรองหลายปุ่มไว้ในปุ่มเดียว ใช้ <details> ไม่ต้องมี state
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
  return (
    <details className="relative [&_summary::-webkit-details-marker]:hidden">
      <summary
        aria-label={label}
        className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full bg-paper text-brown"
      >
        <Icon name="more" size={18} />
      </summary>
      <div
        className={`absolute z-30 mt-1 min-w-[180px] overflow-hidden rounded-petflow-sm border border-petflow-line bg-card py-1 shadow-petflow ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            disabled={it.disabled}
            onClick={(e) => {
              (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
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
      </div>
    </details>
  );
}
