"use client";

import Image from "next/image";
import { useConfig } from "@/components/ConfigProvider";
import { petKindOf } from "@/lib/pet-kind";

/** รูปห้องตัวอย่างที่ติดมากับระบบ (ห้องแมวของร้านตัวอย่าง PetFlow มีเบอร์/LINE ตัวอย่างในรูป) */
const SAMPLE_ROOM_IMAGE = /^\/catalog\/rooms\//;

/** แสดงโปสเตอร์ห้องเต็มใบ — ไม่ crop */
export function RoomPoster({
  src,
  alt,
  priority,
  className = "",
}: {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  const { config } = useConfig();
  // ร้านหมา / หมาและแมว ที่ยังใช้รูปห้องแมวตัวอย่างค้างจากค่าตั้งต้น — ถือว่ายังไม่มีรูป
  if (src && SAMPLE_ROOM_IMAGE.test(src) && petKindOf(config) !== "cat") src = "";
  // ร้านใหม่ (แบบร้านหมา / หมาและแมว) ยังไม่มีรูปห้อง — โชว์การ์ดชื่อห้องแทน ไม่โชว์รูปแตก
  if (!src) {
    return (
      <div
        className={`flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-petflow border border-petflow-line bg-honey/15 text-petflow-chocolate ${className}`}
      >
        <span className="text-4xl" aria-hidden="true">🛏️</span>
        <span className="px-4 text-center text-sm font-extrabold">{alt}</span>
      </div>
    );
  }
  return (
    <div
      className={`overflow-hidden rounded-petflow border border-petflow-line bg-paper ${className}`}
    >
      <Image
        src={src}
        alt={alt}
        width={1200}
        height={1600}
        priority={priority}
        className="h-auto w-full object-contain"
        sizes="(max-width: 512px) 100vw, 480px"
      />
    </div>
  );
}
