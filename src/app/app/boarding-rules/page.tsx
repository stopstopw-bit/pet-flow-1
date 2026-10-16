"use client";

import { useLocale } from "@/components/LocaleProvider";
import { useConfig } from "@/components/ConfigProvider";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui";
import { ContentBlocks } from "@/components/ContentBlocks";

export default function BoardingRulesPage() {
  const { locale } = useLocale();
  const { config } = useConfig();
  const blocks = config.boardingRules || [];

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader
        eyebrow="Boarding rules"
        title={locale === "th" ? "กฎระเบียบการฝาก" : "Boarding rules"}
        back="/app/services"
        backLabel={locale === "th" ? "บริการทั้งหมด" : "All services"}
      />
      {blocks.length === 0 ? (
        <div className="rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
          <EmptyState icon="doc" title={locale === "th" ? "ยังไม่มีข้อมูล" : "No content yet"} />
        </div>
      ) : (
        <ContentBlocks blocks={blocks} />
      )}
    </div>
  );
}
