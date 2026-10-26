"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue"> & {
  value: number | string | null | undefined;
};

const show = (v: Props["value"]) =>
  v === null || v === undefined || v === "" || !Number(v) ? "" : String(v);

/**
 * ช่องตัวเลขที่ค่า 0 แสดงเป็นช่องว่าง (placeholder "0") — กดแล้วพิมพ์ได้เลย ไม่ต้องลบ 0 ก่อน
 * ใช้แทน `<input type="number" value={n} onChange=...>` ได้ตรงๆ: onChange ยังได้ event เดิม
 * (ว่าง → e.target.value = "" → Number("") = 0 ตอนบันทึก)
 * เก็บข้อความที่พิมพ์ไว้เอง เพื่อให้พิมพ์ "0.5" ได้ (ไม่โดนเด้งเป็นว่างตอนพิมพ์ 0)
 */
export function NumInput({ value, onChange, onFocus, onBlur, placeholder, type, ...rest }: Props) {
  const [text, setText] = useState(() => show(value));
  const focused = useRef(false);
  // ค่าจากภายนอกเปลี่ยน (โหลดข้อมูล / รีเซ็ตฟอร์ม) และไม่ตรงกับที่พิมพ์อยู่ → sync
  // ระหว่างพิมพ์ไม่ sync — ลบจนว่างได้ ไม่เด้งกลับเป็นค่าตั้งต้น (ค่อย sync ตอนออกจากช่อง)
  // ยกเว้นถูกล้างเป็นว่าง/0 (เช่น กด Enter บันทึกแล้วฟอร์มรีเซ็ต) → ล้างตาม
  useEffect(() => {
    if (focused.current && show(value) !== "") return;
    setText((t) => (Number(t || 0) === Number(value || 0) ? t : show(value)));
  }, [value]);
  return (
    <input
      {...rest}
      type={type ?? "number"}
      placeholder={placeholder ?? "0"}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        onFocus?.(e);
      }}
      onChange={(e) => {
        setText(e.target.value);
        onChange?.(e);
      }}
      onBlur={(e) => {
        focused.current = false;
        setText((t) => (Number(t || 0) === Number(value || 0) ? t : show(value)));
        onBlur?.(e);
      }}
    />
  );
}
