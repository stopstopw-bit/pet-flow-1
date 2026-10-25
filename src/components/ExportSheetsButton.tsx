"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useConfig } from "@/components/ConfigProvider";
import { isFeatureOn } from "@/lib/features";

/** คอลัมน์ลูกค้าที่เลือกส่งออกได้ (key ต้องตรงกับ lib/google-sheets-export.ts) */
const CUSTOMER_COLUMN_OPTIONS: { key: string; label: string }[] = [
  { key: "id", label: "รหัสลูกค้า" },
  { key: "name", label: "ชื่อผู้ปกครอง" },
  { key: "phone", label: "เบอร์โทร" },
  { key: "email", label: "อีเมล" },
  { key: "birthday", label: "วันเกิดผู้ปกครอง" },
  { key: "referral", label: "รู้จักจาก" },
  { key: "address", label: "ที่อยู่ (รับ-ส่ง)" },
  { key: "addressMap", label: "ลิงก์แผนที่" },
  { key: "postalCode", label: "รหัสไปรษณีย์" },
  { key: "consent", label: "ยินยอมรับข่าวสาร" },
  { key: "line", label: "ผูก LINE" },
  { key: "member", label: "สมาชิก" },
  { key: "credit", label: "เครดิตคงเหลือ" },
  { key: "depositCredit", label: "เครดิตมัดจำล่วงหน้า" },
  { key: "tier", label: "กลุ่มลูกค้า" },
  { key: "catName", label: "ชื่อน้อง" },
  { key: "catGender", label: "เพศน้อง" },
  { key: "catBreed", label: "พันธุ์" },
  { key: "catFur", label: "ลักษณะขน" },
  { key: "catColor", label: "สี/ลักษณะเด่น" },
  { key: "catAge", label: "อายุ" },
  { key: "catBirthday", label: "วันเกิดน้อง" },
  { key: "catMedical", label: "โรคประจำตัว" },
  { key: "catGroomInfo", label: "ประวัติก่อนอาบน้ำ" },
  { key: "catNote", label: "โน้ตน้อง" },
  { key: "catPrivateNote", label: "โน้ตลับร้าน" },
  { key: "createdAt", label: "วันที่สมัคร" },
  { key: "updatedAt", label: "อัปเดตล่าสุด" },
];

const ALL_KEYS = CUSTOMER_COLUMN_OPTIONS.map((c) => c.key);

export function ExportSheetsButton({ className = "" }: { className?: string }) {
  const { config } = useConfig();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [url, setUrl] = useState("");
  const [showCols, setShowCols] = useState(false);
  const [cols, setCols] = useState<string[]>(ALL_KEYS);

  const toggle = (key: string) =>
    setCols((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );

  const exportSheets = async () => {
    setLoading(true);
    setMsg("");
    setUrl("");
    const adminCode =
      typeof window !== "undefined"
        ? sessionStorage.getItem("petflow-admin") || ""
        : "";

    // เรียงตามลำดับ CUSTOMER_COLUMN_OPTIONS เพื่อให้คอลัมน์เรียงสวย
    const ordered = ALL_KEYS.filter((k) => cols.includes(k));
    const res = await fetch("/api/export/sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminCode, columns: ordered }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg(data.message || "ส่งออกสำเร็จ");
      if (data.spreadsheetUrl) setUrl(data.spreadsheetUrl);
    } else {
      setMsg(data.message || data.reason || "ส่งออกไม่สำเร็จ");
    }
    setLoading(false);
  };

  // ร้านปิด "ส่งออกไป Google Sheets" ในตั้งค่า › เปิด/ปิดฟีเจอร์
  if (!isFeatureOn(config, "exportSheets")) return null;

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={loading || cols.length === 0}
          onClick={exportSheets}
          className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-petflow-chocolate text-sm font-extrabold text-card disabled:opacity-50"
        >
          <Icon name="download" size={18} />
          {loading ? "กำลังส่งออก…" : "ส่งออก Google Sheets"}
        </button>
        <button
          type="button"
          onClick={() => setShowCols((v) => !v)}
          aria-expanded={showCols}
          className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold ${
            showCols ? "bg-petflow-chocolate/10 text-petflow-chocolate" : "bg-paper text-brown-soft"
          }`}
        >
          <Icon name="filter" size={16} />
          คอลัมน์ {cols.length}/{ALL_KEYS.length}
        </button>
      </div>
      {showCols && (
        <div className="mt-2 rounded-petflow-sm border border-petflow-line bg-paper/50 p-3">
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={() => setCols(ALL_KEYS)}
              className="h-8 rounded-full bg-card px-3 text-[11px] font-bold text-latte-deep"
            >
              เลือกทั้งหมด
            </button>
            <button
              type="button"
              onClick={() => setCols([])}
              className="h-8 rounded-full bg-card px-3 text-[11px] font-bold text-brown-faint"
            >
              ล้าง
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-2">
            {CUSTOMER_COLUMN_OPTIONS.map((c) => (
              <label
                key={c.key}
                className="flex min-h-[36px] items-center gap-2 text-xs text-brown"
              >
                <input
                  type="checkbox"
                  checked={cols.includes(c.key)}
                  onChange={() => toggle(c.key)}
                  className="h-4 w-4 accent-latte-deep"
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>
      )}
      {msg && (
        <p className="mt-2 text-center text-xs font-bold text-brown-soft">{msg}</p>
      )}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex h-10 items-center justify-center gap-1.5 text-xs font-bold text-latte-deep"
        >
          <Icon name="link" size={14} />
          เปิด Google Sheet
        </a>
      )}
    </div>
  );
}
