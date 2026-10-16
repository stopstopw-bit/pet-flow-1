"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

/**
 * รูปน้องแมว: แตะรูปเพื่อดูเต็มจอ · ปุ่มกล้องมุมล่างขวาสำหรับเปลี่ยนรูป (ถ้าส่ง onPick มา)
 * ไม่มีรูป = แตะทั้งกรอบเพื่อเพิ่มรูป
 * ใช้ <img> ธรรมดา เพราะรูปมีทั้ง data URL (ของเก่า) และ URL ใน Storage
 */
export function CatPhoto({
  src,
  name,
  size = 64,
  className = "",
  onPick,
  uploading,
}: {
  src?: string | null;
  name: string;
  /** ความกว้าง/สูงเป็น px — ส่ง 0 เพื่อให้เต็มความกว้างกรอบ (สัดส่วน 4:3) */
  size?: number;
  className?: string;
  onPick?: (file: File) => void;
  uploading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const full = size === 0;
  const box = full ? "aspect-[4/3] w-full" : "";
  const style = full ? undefined : { width: size, height: size };

  const picker = (label: string, cls: string, children: React.ReactNode) => (
    <label className={cls} aria-label={label} title={label}>
      {children}
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && onPick) onPick(f);
          e.target.value = "";
        }}
      />
    </label>
  );

  return (
    <div className={`relative shrink-0 ${box} ${className}`} style={style}>
      {src ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`ดูรูป ${name}`}
          className="block h-full w-full overflow-hidden rounded-petflow-sm bg-paper ring-2 ring-honey/40"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={name} className="h-full w-full object-cover" />
        </button>
      ) : onPick ? (
        picker(
          `เพิ่มรูป ${name}`,
          "flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-petflow-sm border-2 border-dashed border-latte/50 bg-paper text-latte-deep",
          <>
            <Icon name="image" size={full ? 30 : 22} />
            <span className={`font-bold ${full ? "text-sm" : "text-[9px]"}`}>เพิ่มรูป</span>
          </>
        )
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-petflow-sm bg-paper text-brown-soft ring-2 ring-honey/40">
          <Icon name="paw" size={full ? 34 : Math.round(size * 0.4)} />
        </div>
      )}

      {src && onPick &&
        picker(
          "เปลี่ยนรูป",
          `absolute flex cursor-pointer items-center justify-center rounded-full bg-petflow-chocolate text-card shadow-petflow-sm ${
            full ? "bottom-2 right-2 h-10 gap-1.5 px-3 text-xs font-bold" : "-bottom-1 -right-1 h-8 w-8"
          }`,
          <>
            <Icon name="image" size={15} />
            {full && "เปลี่ยนรูป"}
          </>
        )}

      {uploading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-petflow-sm bg-card/75 text-[11px] font-bold text-brown">
          กำลังอัป…
        </div>
      )}

      {open && src && <PhotoViewer src={src} name={name} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** ดูรูปเต็มจอ — แตะพื้นหลังหรือ ✕ เพื่อปิด */
export function PhotoViewer({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-label={`รูป ${name}`}
      onClick={onClose}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/85 p-4"
    >
      <button
        type="button"
        aria-label="ปิด"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
      >
        <Icon name="x" size={20} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={name}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] max-w-full rounded-petflow object-contain"
      />
      <p className="mt-3 text-sm font-bold text-white">{name}</p>
    </div>
  );
}
