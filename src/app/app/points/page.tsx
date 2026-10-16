"use client";

import { useConfig } from "@/components/ConfigProvider";
import { t } from "@/lib/i18n";
import { useLocale } from "@/components/LocaleProvider";
import { useLiff } from "@/components/LiffProvider";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, SectionLabel } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { PointsRedeem } from "@/components/PointsRedeem";

export default function PointsPage() {
  const { locale } = useLocale();
  const { profile, history } = useLiff();
  const { config } = useConfig();
  const m = t(locale).points;
  const points = profile?.points ?? 0;

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader eyebrow="Rewards" title={m.title} />

      <div className="mb-5 overflow-hidden rounded-petflow bg-gradient-to-br from-honey/45 via-card to-latte/15 p-5 shadow-petflow">
        <div className="flex items-center gap-2 text-brown-soft">
          <Icon name="star" size={16} />
          <p className="text-xs font-bold">{m.balance}</p>
        </div>
        <p className="mt-1 text-5xl font-extrabold text-latte-deep">
          {points}
          <span className="ml-1.5 text-sm font-bold text-brown-faint">
            {locale === "th" ? "แต้ม" : "pts"}
          </span>
        </p>
        <p className="mt-2 text-[11px] text-brown-faint">
          {m.rate} ({config.business.pointsRate} {locale === "th" ? "บาท" : "THB"})
        </p>
      </div>

      <section className="mb-5">
        <SectionLabel>Redeem · {m.redeemTitle}</SectionLabel>
        <div className="rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
          <PointsRedeem />
        </div>
      </section>

      <section>
        <SectionLabel>History · {m.history}</SectionLabel>
        <div className="overflow-hidden rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
          {history.length === 0 ? (
            <EmptyState icon="star" title={m.empty} />
          ) : (
            <ul className="divide-y divide-petflow-line">
              {history.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      h.points > 0 ? "bg-sage/25 text-ok" : "bg-honey/25 text-latte-deep"
                    }`}
                  >
                    <Icon name={h.points > 0 ? "plus" : "gift"} size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-brown">
                      {locale === "th" ? h.labelTh : h.labelEn}
                    </p>
                    <p className="text-[11px] text-brown-faint">
                      {new Date(h.at).toLocaleDateString(
                        locale === "th" ? "th-TH" : "en-GB",
                        locale === "th" ? { calendar: "gregory" } : undefined
                      )}
                      {h.couponCode ? (
                        <span className="ml-1.5 font-mono text-latte-deep">{h.couponCode}</span>
                      ) : null}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-extrabold ${
                      h.points > 0 ? "text-ok" : "text-latte-deep"
                    }`}
                  >
                    {h.points > 0 ? "+" : ""}
                    {h.points}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
