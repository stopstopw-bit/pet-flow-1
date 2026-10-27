"use client";

import Image from "next/image";
import { useConfig } from "@/components/ConfigProvider";
import { isExternalLogo, shopLogoSrc } from "@/lib/shop-logo";

export function Logo({ size = 48 }: { size?: number }) {
  const { config } = useConfig();
  const src = shopLogoSrc(config);
  const name = config.business?.name || "";

  return (
    <div
      className="overflow-hidden rounded-2xl border border-petflow-line bg-cream shadow-petflow-sm"
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image
          src={src}
          alt={name}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          unoptimized={isExternalLogo(src)}
          priority
        />
      ) : (
        <LogoInitial name={name} />
      )}
    </div>
  );
}

/** ร้านที่ยังไม่มีโลโก้ — ตัวอักษรแรกของชื่อร้านบนพื้นสีร้าน (ห้ามใช้โลโก้ PetFlow แทน) */
export function LogoInitial({ name }: { name: string }) {
  return (
    <span className="flex h-full w-full items-center justify-center bg-honey/30 font-extrabold text-petflow-chocolate">
      {Array.from(name.trim())[0] || ""}
    </span>
  );
}
