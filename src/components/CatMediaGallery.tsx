"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { toJpegDataUrl } from "@/lib/image-convert";
import type { CatRecord, CatMediaItem } from "@/lib/customers-store";

const MAX_VIDEO_BYTES = 15 * 1024 * 1024; // 15MB — เก็บเป็น base64 ตรงๆ ไม่ผ่าน storage แยก

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

/**
 * อัลบั้มรูป/วิดีโออ้างอิงต่อแมว — เก็บหลังบ้านเท่านั้น ลูกค้าไม่เห็น
 * (คนละส่วนกับ "รูปโปรไฟล์" ด้านบนที่ลูกค้าเห็นในแอป)
 */
export function CatMediaGallery({
  customerId,
  cat,
  onSaved,
}: {
  customerId: string;
  cat: CatRecord;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needSql, setNeedSql] = useState(false);
  const media = cat.media || [];

  /** รูปที่กดดูแบบเต็มจออยู่ */
  const [viewing, setViewing] = useState<CatMediaItem | null>(null);

  const save = async (next: CatMediaItem[]) => {
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: customerId,
        action: "update_cat_media",
        catId: cat.id,
        media: next,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.needSql) {
      setNeedSql(true);
      return false;
    }
    if (!res.ok || !data?.ok) {
      setError("บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง");
      return false;
    }
    return true;
  };

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError("");
    const added: CatMediaItem[] = [];
    for (const file of Array.from(files)) {
      try {
        const isVideo = file.type.startsWith("video/");
        if (isVideo) {
          if (file.size > MAX_VIDEO_BYTES) {
            setError(`${file.name}: วิดีโอใหญ่เกิน 15MB — ลองคลิปสั้นลงนะคะ`);
            continue;
          }
          const dataUrl = await fileToDataUrl(file);
          added.push({
            id: `M${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
            type: "video",
            dataUrl,
            createdAt: new Date().toISOString(),
          });
        } else {
          const dataUrl = await toJpegDataUrl(file, 1200);
          added.push({
            id: `M${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
            type: "photo",
            dataUrl,
            createdAt: new Date().toISOString(),
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : `${file.name}: อัปโหลดไม่สำเร็จ`);
      }
    }
    if (added.length > 0) {
      const ok = await save([...media, ...added]);
      if (ok) onSaved();
    }
    setBusy(false);
  };

  const removeItem = async (id: string) => {
    setBusy(true);
    const ok = await save(media.filter((m) => m.id !== id));
    setBusy(false);
    if (ok) onSaved();
  };

  const setCaption = async (id: string, caption: string) => {
    const next = media.map((m) => (m.id === id ? { ...m, caption } : m));
    await save(next);
  };

  return (
    <div className="mt-2 rounded-petflow-sm border border-petflow-line bg-paper/60 p-3">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
          <Icon name="image" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-extrabold text-petflow-chocolate">
            อัลบั้มหลังบ้าน
            <span className="inline-flex items-center gap-1 rounded-full bg-card px-1.5 py-px text-[9px] font-bold text-brown-soft">
              <Icon name="eye" size={11} />
              ลูกค้าไม่เห็น
            </span>
          </p>
          <p className="mt-0.5 text-[10px] text-brown-faint">
            เก็บไว้ดูหน้าตา/นิสัยน้อง เช่น ตอนอาบน้ำดื้อไหม อัปได้หลายไฟล์ วิดีโอไม่เกิน 15MB/คลิป
          </p>
        </div>
      </div>

      {needSql && (
        <p className="mt-1.5 rounded-petflow-sm bg-wait/10 px-2 py-1.5 text-[10px] font-bold text-wait">
          ยังบันทึกไม่ได้ — ต้องอัปเดตฐานข้อมูลก่อน (ตั้งค่า → ขั้นสูง → อัปเดตฐานข้อมูล)
        </p>
      )}
      {error && (
        <p className="mt-1.5 rounded-petflow-sm bg-wait/10 px-2 py-1.5 text-[10px] font-bold text-wait">
          {error}
        </p>
      )}

      {viewing && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setViewing(null)}
        >
          <div className="max-h-full w-full max-w-lg text-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewing.dataUrl}
              alt={viewing.caption || ""}
              className="mx-auto max-h-[75vh] w-auto rounded-petflow-sm object-contain"
            />
            {viewing.caption && (
              <p className="mt-2 text-xs font-bold text-white">{viewing.caption}</p>
            )}
            <button
              type="button"
              onClick={() => setViewing(null)}
              className="mx-auto mt-3 flex min-h-[44px] items-center gap-1.5 rounded-full bg-white/90 px-5 py-2 text-sm font-extrabold text-brown"
            >
              <Icon name="x" size={16} />
              ปิด
            </button>
          </div>
        </div>
      )}

      {media.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {media.map((m) => (
            <div key={m.id} className="relative overflow-hidden rounded-petflow-sm border border-petflow-line bg-card shadow-petflow-sm">
              {m.type === "video" ? (
                <video src={m.dataUrl} controls className="h-28 w-full bg-black object-contain" />
              ) : (
                // รูปย่อในตารางเล็กมาก ดูรายละเอียดไม่ออก — กดแล้วเปิดเต็มจอ
                <button
                  type="button"
                  onClick={() => setViewing(m)}
                  className="block w-full"
                  title="กดเพื่อดูรูปเต็ม"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.dataUrl} alt={m.caption || ""} className="h-28 w-full object-cover" />
                </button>
              )}
              <input
                defaultValue={m.caption || ""}
                placeholder="โน้ตสั้นๆ เช่น ตอนอาบดื้อมาก"
                onBlur={(e) => setCaption(m.id, e.target.value)}
                className="w-full border-t border-petflow-line bg-card px-2.5 py-2.5 text-[11px] outline-none"
              />
              <button
                type="button"
                onClick={() => removeItem(m.id)}
                disabled={busy}
                aria-label="ลบไฟล์นี้"
                className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white disabled:opacity-50"
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <label
        className={`mt-3 flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-petflow-sm border border-dashed border-latte-deep/60 bg-card px-3 py-2.5 text-sm font-bold text-latte-deep ${
          busy ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          disabled={busy}
          className="sr-only"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Icon name={busy ? "clock" : "plus"} size={18} />
        {busy ? "กำลังอัป…" : "เพิ่มรูป / วิดีโอ"}
      </label>
    </div>
  );
}
