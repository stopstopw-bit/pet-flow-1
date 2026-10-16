"use client";

import Link from "next/link";
import { t } from "@/lib/i18n";
import { useLocale } from "@/components/LocaleProvider";
import { useConfig } from "@/components/ConfigProvider";
import { BookingOnlyNotice, LineBookingCta, PageHeader } from "@/components/PageHeader";
import { ContentBlocks } from "@/components/ContentBlocks";

const GROOMING_MENU_POSTER = "/catalog/grooming/grooming-menu.jpg";
const LEGACY_POSTERS = new Set([
  "/catalog/grooming/bath-menu.jpg",
  "/catalog/grooming/advance-menu.jpg",
]);

export default function GroomingPage() {
  const { locale } = useLocale();
  const { config } = useConfig();
  const m = t(locale).grooming;

  const menus = config.grooming.menus as {
    bath?: { poster?: string };
    advance?: { poster?: string };
  };

  // เมนูชุดใหม่รวมทุกโปรแกรมไว้ในรูปเดียว — รูปเก่า 2 ใบที่ติดมากับระบบถือว่า "ไม่ได้ตั้ง"
  // ร้านอัปโปสเตอร์เองในตั้งค่า (รูปอื่นที่ไม่ใช่ของเดิม) ยังใช้ของร้านเหมือนเดิม
  const custom = [menus.bath?.poster, menus.advance?.poster].filter(
    (p): p is string => !!p && !LEGACY_POSTERS.has(p)
  );
  const posters = custom.length ? custom : [GROOMING_MENU_POSTER];

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader
        eyebrow="Grooming"
        title={m.title}
        back="/app/services"
        backLabel={locale === "th" ? "บริการทั้งหมด" : "All services"}
      />
      <BookingOnlyNotice locale={locale} />

      <div className="space-y-4">
        {posters.map((src) => (
          <div
            key={src}
            className="overflow-hidden rounded-petflow border border-petflow-line bg-card shadow-petflow-sm"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="block w-full h-auto" />
          </div>
        ))}
      </div>

      <ContentBlocks blocks={config.groomingPageBlocks} />

      <Link
        href="/app/book?service=groom"
        className="mt-5 block rounded-petflow-sm bg-latte-deep py-3.5 text-center text-sm font-extrabold text-white shadow-petflow-sm"
      >
        📅 จองคิวอาบน้ำเอง
      </Link>
      <LineBookingCta locale={locale} />
    </div>
  );
}
