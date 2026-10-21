"use client";

import Image from "next/image";
import { useConfig } from "@/components/ConfigProvider";

/**
 * หน้าจอรอโหลดของแอปลูกค้า — ใช้แทนข้อความ "กำลังโหลด…" เปล่าๆ ทุกจุด
 * ให้เห็นโลโก้ร้านแทนจอว่างระหว่างรอ API (LIFF บนมือถือบางทีโหลดช้า)
 * ดึงโลโก้/ชื่อร้านจาก config เสมอ — คนละร้านต้องเห็นคนละโลโก้ ไม่ใช่ใช้ค่าเดียวทั้งระบบ
 */
export function LoadingScreen({
  message = "กำลังโหลดข้อมูล...",
}: {
  message?: string;
}) {
  const { config } = useConfig();
  const src = config.branding?.logoUrl || "/logo.jpg";
  const name = config.business?.name || "";

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <div className="h-24 w-24 animate-bounce overflow-hidden rounded-full border border-petflow-line bg-cream shadow-petflow">
        <Image
          src={src}
          alt={name}
          width={96}
          height={96}
          className="h-full w-full object-cover"
          unoptimized={src.startsWith("data:")}
          priority
        />
      </div>
      <div>
        <p className="text-sm font-extrabold tracking-wide text-petflow-chocolate">
          {name}
        </p>
        <p className="mt-1 text-xs text-brown-soft">{message}</p>
      </div>
      <div className="flex gap-1.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-honey-deep [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-honey-deep [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-honey-deep" />
      </div>
    </div>
  );
}
