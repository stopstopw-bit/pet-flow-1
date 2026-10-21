"use client";

import { useEffect, useState } from "react";
import { useLiff } from "@/components/LiffProvider";
import { useConfig } from "@/components/ConfigProvider";
import { LoadingScreen } from "@/components/LoadingScreen";
import { BTN_PRIMARY, BTN_SECONDARY, PageHeader } from "@/components/PageHeader";
import { EmptyState, SectionLabel } from "@/components/ui";
import { Icon } from "@/components/Icon";

type Coupon = {
  id: string;
  code: string;
  amount: number;
  reason: string;
  status: "active" | "used" | "expired";
  expiresAt?: string;
};

function daysLeft(iso?: string) {
  if (!iso) return null;
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  return d;
}

export default function CouponsPage() {
  const { ready, profile, customer } = useLiff();
  const { config } = useConfig();
  const [loading, setLoading] = useState(true);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [referralUrl, setReferralUrl] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [packages, setPackages] = useState<
    { id: string; name: string; totalUses: number; usedUses: number }[]
  >([]);
  const [voucher, setVoucher] = useState<Coupon | null>(null);

  useEffect(() => {
    if (!profile?.lineUserId) return;
    // คูปองผูกด้วย customerId (ตัวที่แอปรู้อยู่แล้ว) ถ้ามี — ตรงกันทุกอุปกรณ์ ไม่แตกตาม
    // LINE ID ที่สลับไปมา · no-store กัน webview เก็บผลเก่าไว้โชว์ค้าง
    const couponWho = customer?.id
      ? `customerId=${customer.id}`
      : `lineUserId=${profile.lineUserId}`;
    fetch(`/api/coupons?${couponWho}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.found) return;
        setCoupons(d.coupons || []);
        setReferralUrl(d.referralUrl || "");
        setReferralCode(d.referralCode || "");
      })
      .finally(() => setLoading(false));
    // คอร์ส: API บังคับใช้ lineUserId (กันเดา id คนอื่น) — ยิงด้วย lineUserId ของตัวเอง
    fetch(`/api/packages?lineUserId=${profile.lineUserId}&active=1`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPackages(d.packages || []))
      .catch(() => {});
  }, [profile?.lineUserId, customer?.id]);

  const share = async () => {
    const text = `🐾 มาใช้บริการที่ ${config.business.name} กันนะ! สมัครผ่านลิงก์นี้ + มาใช้บริการครั้งแรก รับคูปองส่วนลด 100฿ ทั้งคู่เลย 🎁\n${referralUrl}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const active = coupons.filter((c) => c.status === "active");
  const past = coupons.filter((c) => c.status !== "active");

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader
        eyebrow="Wallet"
        title="กระเป๋าคูปองของฉัน"
        back="/app"
        backLabel="กลับหน้าแรก"
        showLang={false}
      />

      {/* ── ชวนเพื่อน ── */}
      <div className="rounded-petflow border border-honey/50 bg-gradient-to-br from-honey/25 via-card to-latte/15 p-4 shadow-petflow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/40 text-petflow-chocolate">
            <Icon name="users" size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-petflow-chocolate">ชวนเพื่อน รับคนละ 100฿</p>
            <p className="mt-0.5 text-xs leading-relaxed text-brown-soft">
              ส่งลิงก์ให้เพื่อนสมัคร + <b className="text-latte-deep">มาใช้บริการครั้งแรก</b> — ได้คูปองส่วนลด <b className="text-latte-deep">100฿ ทั้งคุณและเพื่อน</b> 🧡
            </p>
          </div>
        </div>
        {referralCode && (
          <p className="mt-3 text-[11px] font-bold text-brown-soft">
            รหัสของคุณ: <span className="rounded bg-paper px-2 py-0.5 font-extrabold text-petflow-chocolate">{referralCode}</span>
          </p>
        )}
        <button
          type="button"
          onClick={share}
          disabled={!referralUrl}
          className={`mt-3 ${BTN_PRIMARY}`}
        >
          <Icon name={copied ? "check" : "link"} size={18} />
          {copied ? "คัดลอกลิงก์แล้ว — เอาไปส่งเพื่อนได้เลย!" : "คัดลอกลิงก์ชวนเพื่อน"}
        </button>
      </div>

      {/* ── คอร์ส/แพ็กเกจ ── */}
      {packages.length > 0 && (
        <section className="mt-6">
          <SectionLabel>Packages · คอร์สของฉัน</SectionLabel>
          <ul className="divide-y divide-petflow-line overflow-hidden rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
            {packages.map((p) => {
              const left = p.totalUses - p.usedUses;
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-sage/25 text-ok">
                    <span className="text-lg font-extrabold leading-none">{left}</span>
                    <span className="text-[9px] font-bold">เหลือ</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold text-petflow-chocolate">{p.name}</p>
                    <p className="text-[11px] text-brown-soft">
                      ใช้ไป {p.usedUses} จาก {p.totalUses} ครั้ง
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── คูปอง ── */}
      {!ready || loading ? (
        <LoadingScreen />
      ) : (
        <>
          <section className="mt-6">
            <SectionLabel>Coupons · ใช้ได้ ({active.length})</SectionLabel>
            <div className="overflow-hidden rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
              {active.length === 0 ? (
                <EmptyState
                  icon="ticket"
                  title="ยังไม่มีคูปอง"
                  sub="ชวนเพื่อนมาใช้บริการ รับ 100฿ ได้เลยนะคะ 🧡"
                />
              ) : (
                <ul className="divide-y divide-petflow-line">
                  {active.map((c) => {
                    const dl = daysLeft(c.expiresAt);
                    return (
                      <li key={c.id}>
                        {/* แตะทั้งแถว = เปิดคูปองให้พนักงานดู */}
                        <button
                          type="button"
                          onClick={() => setVoucher(c)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-paper"
                        >
                          <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-latte-deep text-card">
                            <span className="text-sm font-extrabold leading-none">฿{c.amount}</span>
                            <span className="text-[9px]">ส่วนลด</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-extrabold text-petflow-chocolate">{c.reason}</p>
                            <p className="text-[11px] text-brown-soft">
                              โค้ด {c.code}
                              {dl != null ? ` · หมดอายุใน ${dl} วัน` : ""}
                            </p>
                          </div>
                          <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-honey/35 px-3 py-1.5 text-xs font-extrabold text-petflow-chocolate">
                            ใช้
                            <Icon name="chevron" size={14} />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {past.length > 0 && (
            <section className="mt-6">
              <SectionLabel>History · ใช้แล้ว / หมดอายุ</SectionLabel>
              <ul className="divide-y divide-petflow-line overflow-hidden rounded-petflow border border-petflow-line bg-card/70">
                {past.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-3 opacity-70">
                    <span className="w-12 shrink-0 text-center text-sm font-extrabold text-brown-faint">฿{c.amount}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-brown-soft">{c.reason}</span>
                    <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[10px] font-bold text-brown-faint">
                      {c.status === "used" ? "ใช้แล้ว" : "หมดอายุ"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* วอเชอร์ — แสดงให้พนักงานตอนคิดเงิน */}
      {voucher && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setVoucher(null)}
        >
          <div
            className="max-h-[90dvh] w-full max-w-xs overflow-y-auto rounded-petflow bg-card p-6 text-center shadow-petflow"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Coupon</p>
            <p className="mt-1 text-5xl font-extrabold text-latte-deep">฿{voucher.amount}</p>
            <p className="mt-1 text-sm font-bold text-brown">{voucher.reason}</p>
            <div className="mt-4 rounded-petflow-sm border-2 border-dashed border-latte/50 bg-paper py-3">
              <p className="text-[10px] font-bold text-brown-soft">รหัสคูปอง</p>
              <p className="text-2xl font-extrabold tracking-widest text-petflow-chocolate">
                {voucher.code}
              </p>
            </div>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs font-bold text-petflow-chocolate">
              <Icon name="eye" size={15} />
              แสดงหน้านี้ให้พนักงานตอนคิดเงิน
            </p>
            <p className="mt-1 text-[11px] text-brown-faint">
              พนักงานจะกดใช้คูปองให้ตอนออกบิลค่ะ (คูปองจะถูกใช้เมื่อคิดเงินเท่านั้น)
            </p>
            <p className="mt-1 text-[11px] font-bold text-brown-faint">
              *ใช้ได้ 1 คูปอง / 1 บิลเท่านั้น
            </p>
            <button
              type="button"
              onClick={() => setVoucher(null)}
              className={`mt-5 ${BTN_SECONDARY}`}
            >
              ปิด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
