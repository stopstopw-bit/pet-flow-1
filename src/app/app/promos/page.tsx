"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/components/LocaleProvider";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, SectionLabel } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { CustomerExclusivePromos } from "@/components/CustomerExclusivePromos";
import { PackageShopSection } from "@/components/PackageShopSection";
import { ExpandableText } from "@/components/ExpandableText";

type Promo = {
  id: string;
  title: { th: string; en: string };
  body: { th: string; en: string };
  until: string;
  imageUrl?: string;
  discountPercent?: number;
};

export default function PromosPage() {
  const { locale } = useLocale();
  const m = t(locale).promos;
  const [promos, setPromos] = useState<Promo[]>([]);

  useEffect(() => {
    // kind=display เท่านั้น — โปรแบบ "customer" (โปรเด่นเฉพาะคุณ) โชว์ผ่าน
    // CustomerExclusivePromos ด้านบนแล้ว ไม่งั้นจะขึ้นซ้ำสองรอบ
    fetch("/api/promos?active=1&kind=display")
      .then((r) => r.json())
      .then((data) => setPromos(data.promos || []));
  }, []);

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader eyebrow="Promotions" title={m.title} />

      {/* คอร์สที่เปิดขาย — ไว้บนสุด เพราะเป็นของที่ร้านอยากให้ลูกค้าเห็นก่อน
          (ซ่อนตัวเองอยู่แล้วถ้าไม่มีของขายและไม่มีออร์เดอร์ค้าง) */}
      <PackageShopSection />

      <CustomerExclusivePromos />

      <div className="mt-6">
        <SectionLabel>All promotions · {m.title}</SectionLabel>
      </div>
      {!promos.length ? (
        <div className="rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
          <EmptyState icon="gift" title="ยังไม่มีโปรทั่วไปช่วงนี้" />
        </div>
      ) : (
        <ul className="space-y-3">
          {promos.map((promo) => {
            return (
              <li
                key={promo.id}
                className="overflow-hidden rounded-petflow border border-petflow-line bg-card shadow-petflow-sm"
              >
                {promo.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={promo.imageUrl}
                    alt=""
                    className="h-auto max-h-64 w-full bg-honey/10 object-contain"
                  />
                )}
                <div className="p-4">
                  <p className="line-clamp-2 text-sm font-extrabold text-petflow-chocolate">
                    {promo.title[locale]}
                  </p>
                  <div className="mt-1">
                    <ExpandableText
                      text={promo.body[locale]}
                      locale={locale}
                      className="text-xs leading-relaxed text-brown-soft"
                    />
                  </div>
                  {promo.until ? (
                    <span className="mt-2 flex items-center gap-1 text-[11px] font-bold text-brown-faint">
                      <Icon name="clock" size={13} />
                      {m.until} {promo.until}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
