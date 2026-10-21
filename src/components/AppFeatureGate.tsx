"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConfig } from "./ConfigProvider";
import { useLocale } from "./LocaleProvider";
import { disabledFeatureForAppPath } from "@/lib/features";

/**
 * หน้าในแอปลูกค้าของฟีเจอร์ที่ร้านปิดไว้ (ตั้งค่า › เปิด/ปิดฟีเจอร์)
 * — เปิดจากลิงก์เก่า/การ์ด LINE ก็เห็นข้อความแทน ไม่เห็นหน้าเดิม
 */
export function AppFeatureGate({ children }: { children: React.ReactNode }) {
  const { config, loading } = useConfig();
  const { locale } = useLocale();
  const pathname = usePathname().replace(/^\/s\/[a-z0-9-]+(?=\/)/i, "");
  if (loading || !disabledFeatureForAppPath(config, pathname)) return <>{children}</>;
  return (
    <div className="px-4 py-16 text-center">
      <p className="text-4xl">🙏</p>
      <p className="mt-3 text-base font-extrabold text-petflow-chocolate">
        {locale === "th" ? "ร้านยังไม่เปิดใช้บริการนี้ในแอป" : "This service isn't available in the app"}
      </p>
      <p className="mt-1 text-xs text-brown-soft">
        {locale === "th" ? "สอบถามเพิ่มเติมทาง LINE ของร้านได้เลยค่ะ" : "Please contact the shop on LINE"}
      </p>
      <Link
        href="/app"
        className="mt-5 inline-block rounded-full bg-petflow-chocolate px-5 py-2.5 text-xs font-extrabold text-card"
      >
        {locale === "th" ? "กลับหน้าหลัก" : "Back to home"}
      </Link>
    </div>
  );
}
