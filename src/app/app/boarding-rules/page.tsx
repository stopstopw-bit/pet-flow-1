"use client";

import { useLocale } from "@/components/LocaleProvider";
import { useConfig } from "@/components/ConfigProvider";
import { PageHeader } from "@/components/PageHeader";
import { ContentBlocks } from "@/components/ContentBlocks";
import { consentTextFor } from "@/lib/messages";

export default function BoardingRulesPage() {
  const { locale } = useLocale();
  const { config } = useConfig();
  const blocks = config.boardingRules || [];
  // กฎชุดเดียวกับการ์ด "กฎ + กดยินยอม" (ตั้งค่า › ข้อความ) — ร้านแก้ที่เดียว ข้อความตรงกันเสมอ
  const { title, terms } = consentTextFor(config.messages, "stay");

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader
        eyebrow="Boarding rules"
        title={locale === "th" ? "กฎระเบียบการฝาก" : "Boarding rules"}
        back="/app/services"
        backLabel={locale === "th" ? "บริการทั้งหมด" : "All services"}
      />
      <div className="rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
        <h2 className="mb-3 text-base font-extrabold text-brown">{title}</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-brown">
          {terms.map((term, i) => (
            <li key={i}>{term}</li>
          ))}
        </ol>
      </div>
      <ContentBlocks blocks={blocks} />
    </div>
  );
}
