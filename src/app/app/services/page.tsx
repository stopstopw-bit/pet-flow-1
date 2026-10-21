"use client";

import Link from "next/link";
import { t } from "@/lib/i18n";
import { useLocale } from "@/components/LocaleProvider";
import { useConfig } from "@/components/ConfigProvider";
import { BookingOnlyNotice, PageHeader } from "@/components/PageHeader";
import { ListRowContent } from "@/components/HeaderBand";
import { Icon } from "@/components/Icon";
import { isFeatureOn } from "@/lib/features";

export default function ServicesPage() {
  const { locale } = useLocale();
  const { config } = useConfig();
  const m = t(locale).home;

  const hotelOn = isFeatureOn(config, "hotel");
  const groomOn = isFeatureOn(config, "grooming");
  const cards = [
    ...(hotelOn ? [{
      href: "/app/rooms",
      icon: "bed",
      title: m.room,
      desc:
        locale === "th"
          ? "ห้องพักแมวทุกแบบ + ราคา"
          : "All cat room types + pricing",
    }] : []),
    ...(groomOn ? [{
      href: "/app/grooming",
      icon: "bath",
      title: m.groom,
      desc:
        locale === "th"
          ? "เมนูอาบน้ำ-เป่าขน + รอบเวลา"
          : "Bath & grooming menu + time slots",
    }] : []),
    // โผล่ให้เห็นเฉพาะเมื่อร้านใส่เนื้อหาไว้แล้ว — ไม่งั้นเป็นลิงก์ไปหน้าเปล่า
    ...(hotelOn && config.boardingRules?.length
      ? [
          {
            href: "/app/boarding-rules",
            icon: "doc",
            title: locale === "th" ? "กฎระเบียบการฝาก" : "Boarding rules",
            desc:
              locale === "th"
                ? "อ่านก่อนฝากน้อง"
                : "Please read before boarding",
          },
        ]
      : []),
  ];

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader
        eyebrow="Services"
        title={m.services}
        back="/app"
        backLabel={locale === "th" ? "หน้าหลัก" : "Home"}
      />
      <BookingOnlyNotice locale={locale} />
      <ul className="divide-y divide-petflow-line overflow-hidden rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
        {cards.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              className="flex min-h-[64px] items-center gap-2 px-4 py-3 transition active:bg-paper"
            >
              <span className="min-w-0 flex-1">
                <ListRowContent icon={c.icon} title={c.title} sub={c.desc} />
              </span>
              <Icon name="chevron" size={18} className="text-brown-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
