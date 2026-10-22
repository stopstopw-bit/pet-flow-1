"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useLiff } from "@/components/LiffProvider";
import { useConfig } from "@/components/ConfigProvider";
import { petWords, speciesOf, speciesWords } from "@/lib/pet-kind";
import { toJpegDataUrl } from "@/lib/image-convert";

type MyCat = {
  id: string;
  name: string;
  photoDataUrl?: string | null;
  breed?: string | null;
  species?: string | null;
};

const CHEERS = [
  "น่ารักขึ้นอีก! 😍",
  "โปรไฟล์ปังมาก 🌟",
  "หล่อ/สวยเลย 🐾",
  "ถ่ายเก่งจัง 📸",
];

export function MyCatsSection() {
  const { profile } = useLiff();
  const { config } = useConfig();
  const pw = petWords(config);
  const [cats, setCats] = useState<MyCat[]>([]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [cheer, setCheer] = useState("");
  const [uploadError, setUploadError] = useState("");

  const load = useCallback(async () => {
    if (!profile?.lineUserId) return;
    const res = await fetch(
      `/api/customers/cat-photo?lineUserId=${encodeURIComponent(profile.lineUserId)}`
    );
    const data = await res.json();
    setCats(data.cats || []);
  }, [profile?.lineUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (cat: MyCat, file: File) => {
    if (!profile?.lineUserId) return;
    setUploadError("");
    setUploadingId(cat.id);
    try {
      const dataUrl = await toJpegDataUrl(file);
      const res = await fetch("/api/customers/cat-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId: profile.lineUserId,
          catId: cat.id,
          photoDataUrl: dataUrl,
        }),
      });
      if (res.ok) {
        setCheer(CHEERS[cats.findIndex((c) => c.id === cat.id) % CHEERS.length]);
        setTimeout(() => setCheer(""), 2500);
        await load();
      } else {
        setUploadError("อัปโหลดรูปไม่สำเร็จ — ลองใหม่อีกครั้งนะคะ");
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploadingId(null);
    }
  };

  if (!profile?.lineUserId || cats.length === 0) return null;

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-extrabold text-petflow-chocolate">
          🐾 {pw.noun}ของฉัน
        </h2>
        <span className="text-[10px] font-bold text-brown-faint">
          แตะรูปเพื่อเปลี่ยน 📸
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1">
        {cats.map((cat) => (
          <label
            key={cat.id}
            className="group relative block w-24 shrink-0 cursor-pointer"
          >
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(cat, e.target.files[0])}
            />
            <div className="relative h-24 w-24 overflow-hidden rounded-petflow border-2 border-honey/50 bg-honey/10 shadow-petflow-sm">
              {cat.photoDataUrl ? (
                <Image
                  src={cat.photoDataUrl}
                  alt={cat.name}
                  width={96}
                  height={96}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center text-brown-faint">
                  <span className="text-3xl">{speciesWords(speciesOf(cat, config), config).emoji}</span>
                  <span className="text-[9px] font-bold">แตะเพิ่มรูป</span>
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-active:bg-black/20">
                <span className="scale-0 text-lg transition group-active:scale-100">
                  📸
                </span>
              </div>
              {uploadingId === cat.id && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-[10px] font-bold text-brown">
                  กำลังอัป…
                </div>
              )}
            </div>
            <p className="mt-1 truncate text-center text-[11px] font-bold text-brown">
              {cat.name}
            </p>
          </label>
        ))}
      </div>

      {cheer && (
        <p className="mt-1 text-center text-xs font-extrabold text-ok">{cheer}</p>
      )}
      {uploadError && (
        <p className="mt-1 text-center text-xs font-extrabold text-wait">
          😿 {uploadError}
        </p>
      )}
    </section>
  );
}
