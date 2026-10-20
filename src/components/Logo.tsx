"use client";

import Image from "next/image";
import { useConfig } from "@/components/ConfigProvider";

export function Logo({ size = 48 }: { size?: number }) {
  const { config } = useConfig();
  const src = config.branding?.logoUrl || "/logo.jpg";
  // โลโก้ที่ร้านอัปโหลดอยู่ใน Supabase Storage (ต่างโดเมน) — ไม่ผ่านตัวย่อรูปของ Next
  // ไม่งั้นโดนบล็อกเพราะโดเมนไม่อยู่ใน images.remotePatterns แล้วรูปแตก
  const external = !src.startsWith("/");

  return (
    <div
      className="overflow-hidden rounded-2xl border border-petflow-line bg-cream shadow-petflow-sm"
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={config.business?.name || "PetFlow"}
        width={size}
        height={size}
        className="h-full w-full object-cover"
        unoptimized={external}
        priority
      />
    </div>
  );
}
