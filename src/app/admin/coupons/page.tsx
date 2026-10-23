"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/Toast";
import { TIER_LABELS } from "@/lib/customer-tier";
import { Icon } from "@/components/Icon";
import { useConfig } from "@/components/ConfigProvider";
import { isFeatureOn } from "@/lib/features";
import { EmptyState, MoreMenu, SectionLabel, Segmented } from "@/components/ui";

type Offer = { id: string; title: string; amount: number; reason: string; validDays: number; active: boolean };
type Coupon = {
  id: string;
  amount: number;
  reason: string;
  status: string;
  customerName?: string;
  expiresAt?: string;
};

type Stats = {
  couponSummary: {
    total: number;
    active: number;
    used: number;
    expired: number;
    cancelled: number;
    valueUsed: number;
    valueOutstanding: number;
  };
  perOffer: { id: string; title: string; amount: number; issued: number; used: number; valueUsed: number; rate: number }[];
  referral: { issued: number; used: number; valueUsed: number };
  perPromo: { id: string; title: string; active: boolean; claims: number; uses: number; discount: number }[];
  monthlyDiscount?: {
    month: string;
    bills: number;
    total: number;
    coupon: number;
    promo: number;
    manual: number;
  }[];
};

const TIERS = ["all", "new", "regular", "member", "vip"] as const;

export default function AdminCouponsPage() {
  const { config } = useConfig();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [validDays, setValidDays] = useState("60");
  const [busy, setBusy] = useState("");
  const [tierByOffer, setTierByOffer] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<Stats | null>(null);
  const [view, setView] = useState<"offers" | "coupons" | "stats">("offers");
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    // ทุก fetch ต้องไม่ทำให้หน้าค้าง "กำลังโหลด…" หรือจอขาว ถ้า API พัง
    const safe = async (url: string) => {
      try {
        const r = await fetch(url);
        return r.ok ? await r.json() : null;
      } catch {
        return null;
      }
    };
    const [d, s] = await Promise.all([
      safe("/api/coupons/offers"),
      safe("/api/coupons/stats"),
    ]);
    setOffers(d?.offers || []);
    setCoupons(d?.coupons || []);
    // ต้องมีโครงครบจริงเท่านั้น — ของเดิมรับ {error} เข้ามาแล้วไปพังตอนอ่าน .couponSummary
    setStats(s?.couponSummary ? s : null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createOffer = async () => {
    const amt = Math.round(Number(amount) || 0);
    if (!title.trim() || amt <= 0) return toast("ใส่ชื่อแคมเปญ + มูลค่า", "error");
    setBusy("create");
    try {
      const res = await fetch("/api/coupons/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), amount: amt, validDays: Number(validDays) || 60 }),
      });
      if (res.ok) {
        toast("สร้างแคมเปญคูปองแล้ว 🎟️", "success");
        setTitle("");
        setAmount("");
        load();
      } else toast("สร้างไม่สำเร็จ", "error");
    } finally {
      setBusy("");
    }
  };

  const blast = async (offer: Offer) => {
    const tier = tierByOffer[offer.id] || "all";
    if (!confirm(`ยิงการ์ดคูปอง "${offer.title}" (฿${offer.amount}) ไปหา ${tier === "all" ? "ลูกค้าทุกกลุ่ม" : TIER_LABELS[tier as keyof typeof TIER_LABELS]}?`))
      return;
    setBusy("blast:" + offer.id);
    try {
      const res = await fetch("/api/coupons/offers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "blast", offerId: offer.id, tier }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) toast(`ยิงการ์ดแล้ว ส่งสำเร็จ ${d.sent} คน 🎟️`, "success");
      else toast(d.error ? `ไม่สำเร็จ: ${d.error}` : "ยิงไม่สำเร็จ", "error");
    } finally {
      setBusy("");
    }
  };

  const toggleOffer = async (offer: Offer) => {
    await fetch("/api/coupons/offers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_active", offerId: offer.id, active: !offer.active }),
    });
    load();
  };

  const cancelCoupon = async (c: Coupon) => {
    if (!confirm(`ยกเลิกคูปอง ฿${c.amount} ของ ${c.customerName}?`)) return;
    await fetch("/api/coupons/offers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel_coupon", couponId: c.id }),
    });
    toast("ยกเลิกคูปองแล้ว", "success");
    load();
  };

  const statusLabel: Record<string, string> = {
    active: "ใช้ได้",
    used: "ใช้แล้ว",
    expired: "หมดอายุ",
    cancelled: "ยกเลิก",
  };
  const statusTone: Record<string, string> = {
    active: "bg-sage/25 text-ok",
    used: "bg-paper text-brown-soft",
    expired: "bg-paper text-brown-faint",
    cancelled: "bg-wait/10 text-wait",
  };

  const field = "w-full min-w-0 rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm";

  return (
    <div className="pb-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Coupons</p>
          <h1 className="text-xl font-extrabold text-petflow-chocolate">คูปอง &amp; แคมเปญ</h1>
          <p className="mt-0.5 text-xs text-brown-soft">ส่งการ์ดคูปองให้ลูกค้ากดรับทาง LINE</p>
        </div>
        {view === "offers" && (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold shadow-petflow-sm ${
              showCreate ? "bg-card text-brown" : "bg-petflow-chocolate text-card"
            }`}
          >
            <Icon name={showCreate ? "x" : "plus"} size={18} />
            {showCreate ? "ปิด" : "สร้าง"}
          </button>
        )}
      </div>

      <Segmented
        value={view}
        onChange={setView}
        className="mb-4"
        options={[
          { id: "offers", label: "แคมเปญ", icon: "ticket" },
          { id: "coupons", label: "คูปอง", icon: "gift" },
          { id: "stats", label: "สถิติ", icon: "chart" },
        ]}
      />

      {view === "offers" && (
        <div className="space-y-4">
          {showCreate && (
            <section>
              <SectionLabel>New · สร้างแคมเปญคูปอง</SectionLabel>
              <div className="space-y-3 rounded-petflow bg-card p-4 shadow-petflow-sm">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="ชื่อแคมเปญ เช่น ปีใหม่แจกส่วนลด 100฿"
                  className={field}
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="ส่วนลด (บาท)"
                    className={`${field} flex-1`}
                  />
                  <label className="flex w-32 shrink-0 items-center gap-1.5 rounded-petflow-sm border border-petflow-line bg-paper px-3">
                    <span className="shrink-0 text-xs text-brown-soft">ใช้ได้</span>
                    <input
                      type="number"
                      value={validDays}
                      onChange={(e) => setValidDays(e.target.value)}
                      className="h-10 w-full min-w-0 !border-0 !bg-transparent px-0 text-sm !shadow-none !outline-none"
                    />
                    <span className="shrink-0 text-xs text-brown-soft">วัน</span>
                  </label>
                </div>
                <button
                  type="button"
                  disabled={busy === "create"}
                  onClick={createOffer}
                  className="h-11 w-full rounded-full bg-petflow-chocolate text-sm font-extrabold text-card disabled:opacity-50"
                >
                  สร้างแคมเปญ
                </button>
              </div>
            </section>
          )}

          <section>
            <SectionLabel>Campaigns · แคมเปญ ({offers.length})</SectionLabel>
            <div className="rounded-petflow bg-card shadow-petflow-sm">
              {offers.length === 0 ? (
                <EmptyState icon="ticket" title="ยังไม่มีแคมเปญ" sub="กด “สร้าง” เพื่อเริ่มแคมเปญคูปองแรก" />
              ) : (
                <ul className="divide-y divide-petflow-line">
                  {offers.map((o) => (
                    <li key={o.id} className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            o.active ? "bg-honey/30 text-petflow-chocolate" : "bg-paper text-brown-faint"
                          }`}
                        >
                          <Icon name="ticket" size={20} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-extrabold text-petflow-chocolate">{o.title}</p>
                          <p className="text-[11px] text-brown-soft">
                            ฿{o.amount} · ใช้ได้ {o.validDays} วัน ·{" "}
                            <span className={o.active ? "font-bold text-ok" : "text-brown-faint"}>
                              {o.active ? "เปิด" : "ปิด"}
                            </span>
                          </p>
                        </div>
                        <MoreMenu
                          items={[
                            {
                              label: o.active ? "ปิดแคมเปญ" : "เปิดแคมเปญ",
                              icon: o.active ? "x" : "check",
                              onClick: () => toggleOffer(o),
                            },
                          ]}
                        />
                      </div>
                      {o.active && (
                        <div className="mt-2.5 flex gap-2 pl-[52px]">
                          <select
                            value={tierByOffer[o.id] || "all"}
                            onChange={(e) => setTierByOffer((p) => ({ ...p, [o.id]: e.target.value }))}
                            className="h-10 min-w-0 flex-1 rounded-full border border-petflow-line bg-paper px-3 text-xs font-bold text-brown"
                            aria-label="กลุ่มลูกค้า"
                          >
                            {TIERS.map((t) => (
                              <option key={t} value={t}>
                                {t === "all" ? "ทุกกลุ่ม" : TIER_LABELS[t as keyof typeof TIER_LABELS]}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={busy === "blast:" + o.id}
                            onClick={() => blast(o)}
                            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-petflow-chocolate px-4 text-xs font-extrabold text-card disabled:opacity-40"
                          >
                            <Icon name="send" size={16} />
                            {busy === "blast:" + o.id ? "กำลังส่ง…" : "ยิงการ์ด"}
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}

      {view === "coupons" && (
        <section>
          <SectionLabel>All coupons · คูปองทั้งหมด ({coupons.length})</SectionLabel>
          <div className="rounded-petflow bg-card shadow-petflow-sm">
            {coupons.length === 0 ? (
              <EmptyState icon="gift" title="ยังไม่มีคูปอง" />
            ) : (
              <ul className="divide-y divide-petflow-line">
                {coupons.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2.5 pl-4 pr-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-brown">
                        ฿{c.amount} · {c.customerName}
                      </p>
                      <p className="truncate text-[11px] text-brown-faint">{c.reason}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        statusTone[c.status] || "bg-paper text-brown-soft"
                      }`}
                    >
                      {statusLabel[c.status] || c.status}
                    </span>
                    {c.status === "active" ? (
                      <MoreMenu
                        items={[
                          { label: "ยกเลิกคูปอง", icon: "x", danger: true, onClick: () => cancelCoupon(c) },
                        ]}
                      />
                    ) : (
                      <span className="w-9 shrink-0" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {view === "stats" &&
        (!stats ? (
          <div className="rounded-petflow bg-card shadow-petflow-sm">
            <EmptyState icon="chart" title="ยังไม่มีสถิติ" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "ออกไปทั้งหมด", value: stats.couponSummary.total, cls: "text-latte-deep" },
                { label: "ใช้แล้ว", value: stats.couponSummary.used, cls: "text-ok" },
                { label: "ยังไม่ใช้", value: stats.couponSummary.active, cls: "text-petflow-chocolate" },
              ].map((k) => (
                <div key={k.label} className="rounded-petflow-sm bg-card p-3 shadow-petflow-sm">
                  <p className="text-[10px] font-bold text-brown-soft">{k.label}</p>
                  <p className={`text-xl font-extrabold ${k.cls}`}>{k.value}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-petflow-sm bg-card p-3 shadow-petflow-sm">
                <p className="text-[10px] font-bold text-brown-soft">ส่วนลดที่ถูกใช้ไป</p>
                <p className="text-base font-extrabold text-ok">
                  {stats.couponSummary.valueUsed.toLocaleString()} ฿
                </p>
              </div>
              <div className="rounded-petflow-sm bg-card p-3 shadow-petflow-sm">
                <p className="text-[10px] font-bold text-brown-soft">คูปองค้าง (ภาระ)</p>
                <p className="text-base font-extrabold text-wait">
                  {stats.couponSummary.valueOutstanding.toLocaleString()} ฿
                </p>
              </div>
            </div>

            {/* ร้านปิดชวนเพื่อนแต่เคยแจกไปแล้ว ยังเห็นสถิติเดิม */}
            {(isFeatureOn(config, "referral") || stats.referral.issued > 0) && (
            <div className="flex items-center gap-3 rounded-petflow bg-card px-4 py-3 shadow-petflow-sm">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/30 text-petflow-chocolate">
                <Icon name="gift" size={20} />
              </span>
              <div className="min-w-0 flex-1 text-xs">
                <p className="text-sm font-extrabold text-petflow-chocolate">ชวนเพื่อน</p>
                <p className="text-[11px] text-brown-soft">
                  ออกคูปอง {stats.referral.issued} ใบ · ใช้แล้ว {stats.referral.used} ใบ · ส่วนลด{" "}
                  {stats.referral.valueUsed.toLocaleString()} ฿
                </p>
              </div>
            </div>
            )}

            {stats.perOffer.length > 0 && (
              <section>
                <SectionLabel>By campaign · ตามแคมเปญ</SectionLabel>
                <ul className="divide-y divide-petflow-line rounded-petflow bg-card shadow-petflow-sm">
                  {stats.perOffer.map((o) => (
                    <li key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-brown">
                          {o.title} <span className="font-normal text-brown-faint">฿{o.amount}</span>
                        </p>
                        <p className="text-[11px] text-brown-soft">
                          ออก {o.issued} · ใช้ <span className="text-ok">{o.used}</span>
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-extrabold text-petflow-chocolate">{o.rate}%</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ส่วนลดที่ให้ไปแต่ละเดือน — ดูได้ว่าเดือนไหนแจกไปเท่าไหร่ และมาจากทางไหน */}
            <section>
              <SectionLabel>Monthly · ส่วนลดที่ให้ไปรายเดือน</SectionLabel>
              <div className="rounded-petflow bg-card shadow-petflow-sm">
                {!stats.monthlyDiscount || stats.monthlyDiscount.length === 0 ? (
                  <EmptyState icon="calendar" title="ยังไม่มีบิลที่มีส่วนลด" />
                ) : (
                  <ul className="divide-y divide-petflow-line">
                    {stats.monthlyDiscount.map((m) => (
                      <li key={m.month} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-brown">{m.month}</p>
                          <p className="truncate text-[11px] text-brown-soft">
                            {m.bills} บิล · คูปอง {m.coupon ? m.coupon.toLocaleString() : "–"} · โปร{" "}
                            {m.promo ? m.promo.toLocaleString() : "–"} · ลดเอง{" "}
                            {m.manual ? m.manual.toLocaleString() : "–"}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-extrabold text-latte-deep">
                          {m.total.toLocaleString()} ฿
                        </span>
                      </li>
                    ))}
                    <li className="flex items-center gap-3 bg-paper/60 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-extrabold text-brown">รวมทุกเดือน</p>
                        <p className="truncate text-[11px] text-brown-soft">
                          {stats.monthlyDiscount.reduce((s, m) => s + m.bills, 0)} บิล · คูปอง{" "}
                          {stats.monthlyDiscount.reduce((s, m) => s + m.coupon, 0).toLocaleString()} · โปร{" "}
                          {stats.monthlyDiscount.reduce((s, m) => s + m.promo, 0).toLocaleString()} · ลดเอง{" "}
                          {stats.monthlyDiscount.reduce((s, m) => s + m.manual, 0).toLocaleString()}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-extrabold text-latte-deep">
                        {stats.monthlyDiscount.reduce((s, m) => s + m.total, 0).toLocaleString()} ฿
                      </span>
                    </li>
                  </ul>
                )}
              </div>
              <p className="mt-1.5 px-1 text-[10px] text-brown-faint">
                นับจากบิลที่ปิดแล้ว ตามเดือนที่ชำระ · คูปองแยกตามใบที่ถูกใช้จริง
                ที่เหลือถ้าบิลผูกโปรไว้นับเป็นโปร ไม่งั้นคือลดหน้าร้าน
              </p>
            </section>

            <section>
              <SectionLabel>Promotions · สถิติโปรโมชั่น</SectionLabel>
              <div className="rounded-petflow bg-card shadow-petflow-sm">
                {stats.perPromo.length === 0 ? (
                  <EmptyState icon="sparkle" title="ยังไม่มีโปรโมชั่น" />
                ) : (
                  <ul className="divide-y divide-petflow-line">
                    {stats.perPromo.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-brown">
                            {p.title}
                            {!p.active && <span className="font-normal text-brown-faint"> (ปิด)</span>}
                          </p>
                          <p className="text-[11px] text-brown-soft">
                            กดรับ {p.claims} · ใช้จริง <span className="text-ok">{p.uses}</span>
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-extrabold text-petflow-chocolate">
                          {p.discount.toLocaleString()} ฿
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        ))}
    </div>
  );
}
