"use client";

import { useState } from "react";
import { useConfig } from "@/components/ConfigProvider";
import { t } from "@/lib/i18n";
import { useLocale } from "@/components/LocaleProvider";
import { useLiff } from "@/components/LiffProvider";
import { Icon } from "@/components/Icon";

export function PointsRedeem({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { locale } = useLocale();
  const { profile, customer, refreshAccount, setPoints } = useLiff();
  const { config } = useConfig();
  const m = t(locale).points;
  const [loading, setLoading] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    code: string;
    label: string;
  } | null>(null);
  const [err, setErr] = useState("");

  const points = profile?.points ?? 0;

  const redeem = async (rewardId: string) => {
    if (!profile?.lineUserId) return;
    const tier = config.pointsRewards.find((r) => r.id === rewardId);
    if (!tier) return;

    const ok = window.confirm(
      locale === "th"
        ? `แลก ${tier.points} แต้ม เป็น "${tier.reward.th}"?`
        : `Redeem ${tier.points} pts for "${tier.reward.en}"?`
    );
    if (!ok) return;

    setLoading(rewardId);
    setErr("");
    setSuccess(null);

    try {
      const res = await fetch("/api/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId: profile.lineUserId,
          rewardId,
          displayName: profile.displayName,
          customerId: customer?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.message || m.redeemFail);
        return;
      }
      setPoints(data.points);
      setSuccess({
        code: data.couponCode,
        label: tier.reward[locale],
      });
      await refreshAccount();
    } catch {
      setErr(m.redeemFail);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div>
      {success ? (
        <div className="mb-3 rounded-petflow-sm border border-ok/30 bg-sage/15 p-4 text-center">
          <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-ok/15 text-ok">
            <Icon name="check" size={20} strokeWidth={2.4} />
          </span>
          <p className="text-xs font-bold text-ok">{m.redeemOk}</p>
          <p className="mt-1 text-sm font-semibold text-brown">{success.label}</p>
          <p className="mx-auto mt-2 w-fit rounded-xl border border-dashed border-latte-deep/50 bg-card px-4 py-2 font-mono text-lg font-extrabold tracking-wider text-latte-deep">
            {success.code}
          </p>
          <p className="mt-2 text-[10px] text-brown-soft">{m.showCode}</p>
          <p className="mt-1 text-[10px] font-bold text-brown-faint">
            {locale === "th" ? "*ใช้ได้ 1 คูปอง / 1 บิลเท่านั้น" : "*One coupon per bill"}
          </p>
          <button
            type="button"
            onClick={() => setSuccess(null)}
            className="mt-2 min-h-[44px] px-4 text-xs font-bold text-brown-soft"
          >
            {m.dismiss}
          </button>
        </div>
      ) : null}

      {err ? (
        <p className="mb-3 rounded-petflow-sm bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
          {err}
        </p>
      ) : null}

      {config.pointsRewards.length > 1 && (
        <p className="mb-2 flex items-center gap-1 text-[11px] text-brown-faint">
          {locale === "th" ? "เลื่อนดูรางวัลทั้งหมด" : "Swipe to see all rewards"}
          <Icon name="chevron" size={12} />
        </p>
      )}

      <div
        className="-mx-1 flex gap-3 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {config.pointsRewards.map((tier) => {
          const canRedeem = points >= tier.points;
          return (
            <div
              key={tier.id}
              className={`flex snap-start shrink-0 flex-col justify-between overflow-hidden rounded-petflow-sm border bg-paper/60 ${
                compact ? "w-[72%] min-w-[220px]" : "w-[78%] min-w-[240px]"
              } max-w-[300px] ${
                canRedeem ? "border-petflow-line" : "border-petflow-line/50 opacity-75"
              }`}
            >
              {tier.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tier.imageUrl}
                  alt={tier.reward[locale]}
                  className="h-auto max-h-48 w-full bg-honey/10 object-contain"
                />
              )}
              <div className="flex flex-1 flex-col justify-between p-3">
                <div>
                  <p className="flex items-center gap-1 text-sm font-extrabold text-latte-deep">
                    <Icon name="star" size={15} />
                    {tier.points}{" "}
                    <span className="text-xs font-bold text-brown-faint">
                      {locale === "th" ? "แต้ม" : "pts"}
                    </span>
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-brown-soft">
                    {tier.reward[locale]}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canRedeem || loading === tier.id}
                  onClick={() => redeem(tier.id)}
                  className={`mt-3 min-h-[44px] w-full rounded-petflow-sm py-2.5 text-xs font-extrabold transition active:scale-[0.98] ${
                    canRedeem
                      ? "bg-latte-deep text-card shadow-petflow-sm"
                      : "bg-card text-brown-faint"
                  }`}
                >
                  {loading === tier.id ? "…" : m.redeem}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
