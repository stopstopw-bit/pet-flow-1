"use client";

import { savedPopup } from "@/components/Toast";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiff } from "@/components/LiffProvider";
import { LoadingScreen } from "@/components/LoadingScreen";
import { BTN_PRIMARY, PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui";
import { Icon } from "@/components/Icon";

type Offer = { id: string; title: string; amount: number; reason: string; validDays: number; active: boolean };

function ClaimContent() {
  const params = useSearchParams();
  const offerId = params.get("offer") || "";
  const { profile } = useLiff();

  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [result, setResult] = useState<"" | "ok" | "already" | "error">("");

  useEffect(() => {
    if (!offerId) {
      setLoading(false);
      return;
    }
    fetch(`/api/coupons/claim?offer=${offerId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.found) setOffer(d.offer);
      })
      .finally(() => setLoading(false));
  }, [offerId]);

  const claim = async () => {
    if (!offerId || !profile?.lineUserId) return;
    setClaiming(true);
    try {
      const res = await fetch("/api/coupons/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, lineUserId: profile.lineUserId }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        setResult("ok");
        savedPopup("รับคูปองสำเร็จ 🎟️");
      }
      else if (d.alreadyClaimed) setResult("already");
      else setResult("error");
    } finally {
      setClaiming(false);
    }
  };

  if (loading) return <LoadingScreen />;

  if (!offer)
    return (
      <div className="px-4 pb-6 pt-5">
        <PageHeader eyebrow="Coupon" title="คูปองส่วนลดพิเศษ" back="/app" backLabel="กลับหน้าแรก" showLang={false} />
        <div className="rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
          <EmptyState icon="ticket" title="ไม่พบคูปองนี้" sub="หรือแคมเปญปิดแล้วค่ะ" />
        </div>
        <Link href="/app/coupons" className={`mt-5 ${BTN_PRIMARY}`}>
          <Icon name="wallet" size={18} />
          ดูกระเป๋าคูปองของฉัน
        </Link>
      </div>
    );

  if (result === "ok" || result === "already")
    return (
      <div className="px-4 pb-6 pt-10">
        <div className="rounded-petflow border border-petflow-line bg-card p-6 text-center shadow-petflow">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage/25 text-ok">
            <Icon name="check" size={28} strokeWidth={2.4} />
          </span>
          <h1 className="mt-4 text-lg font-extrabold text-petflow-chocolate">
            {result === "ok" ? "รับคูปองเรียบร้อยแล้ว!" : "คุณรับคูปองนี้ไปแล้วนะคะ"}
          </h1>
          <p className="mt-2 text-sm text-brown-soft">
            คูปองส่วนลด {offer.amount} บาท อยู่ในกระเป๋าคูปองของคุณแล้ว 🧡
          </p>
        </div>
        <Link href="/app/coupons" className={`mt-5 ${BTN_PRIMARY}`}>
          <Icon name="wallet" size={18} />
          ดูกระเป๋าคูปอง
        </Link>
      </div>
    );

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader eyebrow="Coupon" title="คูปองส่วนลดพิเศษ" back="/app" backLabel="กลับหน้าแรก" showLang={false} />
      <div className="relative overflow-hidden rounded-petflow border border-honey/50 bg-gradient-to-br from-honey/30 via-card to-latte/15 p-6 text-center shadow-petflow">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-card text-latte-deep shadow-petflow-sm">
          <Icon name="ticket" size={24} />
        </span>
        <p className="mt-3 text-sm font-bold text-brown">{offer.title}</p>
        <p className="mt-1 text-4xl font-extrabold text-latte-deep">
          ฿{offer.amount.toLocaleString()}
        </p>
        {offer.reason && offer.reason !== offer.title && (
          <p className="mt-2 text-xs text-brown-soft">{offer.reason}</p>
        )}
        <p className="mt-2 text-[11px] text-brown-faint">ใช้เป็นส่วนลดได้ ({offer.validDays} วัน)</p>
      </div>
      {result === "error" && (
        <p className="mt-3 rounded-petflow-sm bg-red-50 px-3 py-2 text-center text-xs font-bold text-red-600">
          รับคูปองไม่สำเร็จ ลองใหม่นะคะ
        </p>
      )}
      <button
        type="button"
        onClick={claim}
        disabled={claiming || !offer.active}
        className={`mt-5 ${BTN_PRIMARY}`}
      >
        {offer.active && !claiming && <Icon name="gift" size={18} />}
        {claiming ? "กำลังรับ…" : offer.active ? "กดรับคูปองเข้ากระเป๋า" : "แคมเปญปิดแล้ว"}
      </button>
      <Link
        href="/app/coupons"
        className="mt-2 flex min-h-[44px] items-center justify-center gap-1 text-xs font-bold text-brown-soft"
      >
        ดูกระเป๋าคูปองของฉัน
        <Icon name="chevron" size={14} />
      </Link>
    </div>
  );
}

export default function ClaimCouponPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ClaimContent />
    </Suspense>
  );
}
