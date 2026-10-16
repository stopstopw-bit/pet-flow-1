"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/components/LocaleProvider";
import { useLiff } from "@/components/LiffProvider";
import { t } from "@/lib/i18n";
import type { CustomerPromoView } from "@/lib/promos-store";
import { Icon } from "@/components/Icon";
import { EmptyState, SectionLabel } from "@/components/ui";

type Props = {
  compact?: boolean;
  /** แจ้ง parent ว่ามีโปรให้แสดงไหม (ไว้ซ่อนลิงก์ "ดูทั้งหมด" ตามกัน) */
  onHasPromos?: (has: boolean) => void;
};

export function CustomerExclusivePromos({ compact, onHasPromos }: Props) {
  const { locale } = useLocale();
  const { profile, refreshAccount, setPoints } = useLiff();
  const m = t(locale).customerPromos;
  const [promos, setPromos] = useState<CustomerPromoView[]>([]);
  const [loading, setLoading] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimedInfo, setClaimedInfo] = useState<{
    title: string;
    code?: string;
    pointsAwarded?: number;
  } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.lineUserId) return;
    setLoading(true);
    const q = new URLSearchParams({
      forCustomer: "1",
      lineUserId: profile.lineUserId,
    });
    const res = await fetch(`/api/promos?${q}`);
    const data = await res.json();
    const list = data.promos || [];
    setPromos(list);
    onHasPromos?.(list.length > 0);
    setLoading(false);
  }, [profile?.lineUserId, onHasPromos]);

  useEffect(() => {
    load();
  }, [load]);

  const claim = async (promo: CustomerPromoView) => {
    if (!profile?.lineUserId || !promo.eligible) return;
    setClaimingId(promo.id);
    const res = await fetch("/api/promos/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promoId: promo.id, lineUserId: profile.lineUserId }),
    });
    const data = await res.json();
    setClaimingId(null);
    if (res.ok && data.ok) {
      if (typeof data.newPoints === "number") setPoints(data.newPoints);
      else await refreshAccount();
      setClaimedInfo({
        title: promo.title[locale],
        code: data.couponCode,
        pointsAwarded: data.pointsAwarded,
      });
      load();
    } else {
      alert(data.error || m.claimFail);
    }
  };

  if (!profile?.lineUserId) return null;

  // หน้าแรก (compact): ไม่มีโปร → ซ่อนทั้งช่องไปเลย (ไม่โชว์หัวข้อ/กล่องว่างแม้ตอนโหลด)
  if (compact && promos.length === 0 && !claimedInfo) return null;

  // หน้าแรก: โชว์แค่ teaser สั้นๆ (ไม่เอารายละเอียดเต็ม/ปุ่มกดใช้) — แตะเพื่อไปดูหน้าโปรเต็ม
  if (compact) {
    return (
      <section className="mb-4">
        <SectionLabel>For you · {m.title}</SectionLabel>
        <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {promos.map((promo) => (
            <Link
              key={promo.id}
              href="/app/promos"
              className="w-36 shrink-0"
            >
              <div className="h-36 w-36 overflow-hidden rounded-petflow border border-lavender-deep/30 bg-lavender shadow-petflow-sm">
                {promo.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={promo.imageUrl}
                    alt={promo.title[locale]}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-petflow-chocolate">
                    <Icon name="gift" size={36} />
                  </div>
                )}
              </div>
              <p className="mt-1.5 truncate text-center text-xs font-bold text-brown">
                {promo.title[locale]}
              </p>
            </Link>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className={compact ? "mb-4" : ""}>
      <SectionLabel>For you · {m.title}</SectionLabel>

      {loading ? (
        <p className="rounded-petflow bg-card p-4 text-center text-xs text-brown-soft">{t(locale).common.loading}</p>
      ) : promos.length === 0 ? (
        <div className="rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
          <EmptyState icon="gift" title={m.empty} />
        </div>
      ) : (
        <div className="space-y-3">
          {promos.map((promo, i) => {
            return (
              <div
                key={promo.id}
                className={`overflow-hidden rounded-petflow border bg-card shadow-petflow-sm ${
                  i === 0 ? "border-honey/60" : "border-petflow-line"
                }`}
              >
                {i === 0 && (
                  <div className="flex items-center gap-1.5 bg-gradient-to-r from-petflow-yellow/60 to-honey/50 px-3 py-1.5 text-[11px] font-extrabold text-petflow-chocolate">
                    <Icon name="sparkle" size={13} />
                    {m.featured}
                  </div>
                )}
                {promo.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={promo.imageUrl}
                    alt={promo.title[locale]}
                    className="h-auto max-h-64 w-full bg-honey/10 object-contain"
                  />
                )}
                <div className="p-4">
                  <p className="line-clamp-1 text-base font-extrabold text-petflow-chocolate">
                    {promo.title[locale]}
                  </p>

                  {expandedId === promo.id && (
                    <>
                      <p className="mt-1 text-xs leading-relaxed text-brown-soft">
                        {promo.body[locale]}
                      </p>
                      <p className="mt-2 text-[10px] font-bold text-brown-faint">
                        {promo.until ? `${m.until} ${promo.until}` : ""}
                        {promo.validMonth ? ` · ${m.monthOnly} ${promo.validMonth}` : ""}
                      </p>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId((cur) => (cur === promo.id ? null : promo.id))
                    }
                    aria-expanded={expandedId === promo.id}
                    className="-ml-1 mt-0.5 flex min-h-[44px] items-center gap-1 px-1 text-xs font-bold text-latte-deep"
                  >
                    {expandedId === promo.id
                      ? locale === "th"
                        ? "ย่อ"
                        : "Show less"
                      : locale === "th"
                        ? "รายละเอียดเพิ่มเติม"
                        : "More details"}
                    <Icon
                      name="chevron"
                      size={14}
                      className={expandedId === promo.id ? "-rotate-90" : "rotate-90"}
                    />
                  </button>

                  {promo.claimed ? (
                    <div className="mt-2 rounded-petflow-sm bg-sage/15 px-3 py-2.5 text-center">
                      <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-ok">
                        <Icon name="check" size={14} strokeWidth={2.4} />
                        {m.claimed}
                      </p>
                      {promo.couponCode && (
                        <p className="mt-1 text-sm font-extrabold tracking-wide text-petflow-chocolate">
                          {promo.couponCode}
                        </p>
                      )}
                      {promo.claimedAt && (
                        <p className="mt-1 text-[10px] text-brown-faint">
                          {m.claimedAt} {promo.claimedAt.slice(0, 10)}
                        </p>
                      )}
                    </div>
                  ) : promo.eligible ? (
                    <button
                      type="button"
                      disabled={claimingId === promo.id}
                      onClick={() => claim(promo)}
                      className="mt-2 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-petflow-sm bg-latte-deep py-3 text-sm font-extrabold text-card shadow-petflow-sm transition active:scale-[0.98] disabled:opacity-50"
                    >
                      {claimingId === promo.id ? m.claiming : m.claim}
                    </button>
                  ) : (
                    <p className="mt-2 rounded-petflow-sm bg-paper px-3 py-2.5 text-center text-[11px] font-bold text-brown-soft">
                      {promo.reason || m.notEligible}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {claimedInfo && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
          <div className="w-full max-w-sm rounded-petflow bg-card p-5 shadow-petflow">
            <span className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-sage/25 text-ok">
              <Icon name="check" size={22} strokeWidth={2.4} />
            </span>
            <p className="text-center text-sm font-extrabold text-ok">{m.claimOk}</p>
            <p className="mt-2 text-center text-xs text-brown-soft">{claimedInfo.title}</p>
            {claimedInfo.pointsAwarded ? (
              <p className="mt-3 text-center text-2xl font-extrabold text-latte-deep">
                +{claimedInfo.pointsAwarded} {locale === "th" ? "แต้ม" : "pts"}
              </p>
            ) : null}
            {claimedInfo.code && (
              <p className="mt-3 rounded-petflow-sm bg-honey/25 py-3 text-center text-lg font-extrabold tracking-widest text-petflow-chocolate">
                {claimedInfo.code}
              </p>
            )}
            <p className="mt-2 text-center text-[10px] text-brown-faint">{m.showAtShop}</p>
            <button
              type="button"
              onClick={() => setClaimedInfo(null)}
              className="mt-4 min-h-[48px] w-full rounded-petflow-sm bg-latte-deep py-3 text-sm font-extrabold text-card"
            >
              {t(locale).points.dismiss}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
