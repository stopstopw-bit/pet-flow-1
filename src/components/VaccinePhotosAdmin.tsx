"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Toast";
import { toJpegDataUrl } from "@/lib/image-convert";
import { MAX_VACCINE_PHOTOS, splitVaccinePhotos } from "@/lib/vaccine-photos";

/**
 * รูปสมุดวัคซีนของน้องในหลังบ้าน — ดูรูป · พนักงานแนบเองได้ (เช่น ลูกค้าส่งรูปมาในแชท) · ลบรูปที่แนบผิด
 * ใช้ทั้งในการ์ดนัด (เก็บที่นัด) และหน้าข้อมูลลูกค้า (เก็บที่ตัวน้อง) — ปลายทางส่งมาทาง target
 * รูปเข้า bucket ส่วนตัวเสมอ (เปิดดูได้แค่คนของร้าน)
 */
export function VaccinePhotosAdmin({
  bookingId,
  customerId,
  catId,
  value,
  onDone,
}: {
  value?: string;
  onDone?: () => void;
} & ({ bookingId: string; customerId?: undefined; catId?: undefined } | { bookingId?: undefined; customerId: string; catId: string })) {
  const photos = splitVaccinePhotos(value);
  const [busy, setBusy] = useState(false);

  // นัด → /api/bookings · ตัวน้อง → /api/customers
  const patch = async (op: "add" | "remove", body: Record<string, unknown>) => {
    const res = bookingId
      ? await fetch("/api/bookings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: bookingId,
            action: op === "add" ? "add_vaccine_photos" : "remove_vaccine_photo",
            ...body,
          }),
        })
      : await fetch("/api/customers", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: customerId,
            catId,
            action: op === "add" ? "add_cat_vaccine" : "remove_cat_vaccine",
            ...body,
          }),
        });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "บันทึกไม่สำเร็จ");
  };

  const add = async (files: FileList) => {
    setBusy(true);
    try {
      const picked = Array.from(files).slice(0, MAX_VACCINE_PHOTOS);
      const urls: string[] = [];
      for (const f of picked) {
        try {
          urls.push(await toJpegDataUrl(f));
        } catch {
          /* แปลงรูปไหนไม่สำเร็จก็ข้ามรูปนั้นไป */
        }
      }
      if (!urls.length) return toast("เปิดรูปไม่ได้ ลองรูปอื่นนะ", "error");
      await patch("add", { photos: urls });
      toast(`แนบสมุดวัคซีนแล้ว ${urls.length} รูป 💉`, "success");
      onDone?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (url: string) => {
    if (!confirm("ลบรูปสมุดวัคซีนรูปนี้?")) return;
    setBusy(true);
    try {
      await patch("remove", { url });
      toast("ลบรูปแล้ว", "success");
      onDone?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : "ลบไม่สำเร็จ", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {photos.map((url, vi) => (
        <span key={url} className="relative flex min-h-[40px] items-center gap-1.5">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 font-bold text-ok underline"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="สมุดวัคซีน" className="h-8 w-8 rounded border border-petflow-line object-cover" />
            {vi === 0 && `ดูสมุดวัคซีน${photos.length > 1 ? ` (${photos.length} รูป)` : ""}`}
          </a>
          <button
            type="button"
            aria-label="ลบรูปนี้"
            disabled={busy}
            onClick={() => remove(url)}
            className="-ml-1 flex h-6 w-6 items-center justify-center rounded-full text-brown-faint disabled:opacity-40"
          >
            <Icon name="x" size={12} />
          </button>
        </span>
      ))}
      {!photos.length && <span className="text-brown-faint">ยังไม่มีสมุดวัคซีน</span>}
      <label
        className={`flex min-h-[40px] cursor-pointer items-center gap-1 rounded-full bg-paper px-2.5 font-bold text-brown-soft ${
          busy ? "pointer-events-none opacity-40" : ""
        }`}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) add(e.target.files);
            e.target.value = "";
          }}
        />
        <Icon name="plus" size={12} />
        {busy ? "กำลังบันทึก…" : "แนบสมุดวัคซีน"}
      </label>
    </>
  );
}
