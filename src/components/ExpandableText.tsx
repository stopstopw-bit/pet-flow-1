"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

/**
 * ข้อความยาว (คำอธิบายคอร์ส/โปร) — โชว์แค่ไม่กี่บรรทัดก่อน กด "รายละเอียดเพิ่มเติม" ถึงเห็นทั้งหมด
 * การ์ดจะได้สูงเท่าๆ กัน ไม่ยืดยาวจนต้องเลื่อนผ่าน
 * ข้อความสั้นที่ไม่เกินจำนวนบรรทัดก็ยังมีปุ่ม (วัดความสูงจริงไม่ได้ก่อน render) — เลยเช็คความยาวคร่าวๆ แทน
 */
export function ExpandableText({
  text,
  lines = 2,
  className = "",
  locale = "th",
}: {
  text: string;
  lines?: 2 | 3;
  className?: string;
  locale?: "th" | "en";
}) {
  const [open, setOpen] = useState(false);
  const long = text.length > (lines === 3 ? 110 : 70) || text.split("\n").length > lines;
  // อย่าใส่ block/flex ร่วมกับ line-clamp — มันทับ display:-webkit-box แล้วข้อความไม่ถูกตัด
  const clamp = !open && long ? (lines === 3 ? "line-clamp-3" : "line-clamp-2") : "";
  return (
    <div>
      <p className={`whitespace-pre-line ${clamp} ${className}`}>{text}</p>
      {long && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          aria-expanded={open}
          className="-ml-1 mt-0.5 flex min-h-[32px] items-center gap-1 px-1 text-[11px] font-bold text-latte-deep"
        >
          {open
            ? locale === "th"
              ? "ย่อ"
              : "Show less"
            : locale === "th"
              ? "รายละเอียดเพิ่มเติม"
              : "More details"}
          <Icon name="chevron" size={13} className={open ? "-rotate-90" : "rotate-90"} />
        </button>
      )}
    </div>
  );
}
