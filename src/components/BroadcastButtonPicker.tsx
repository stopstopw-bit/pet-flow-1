"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import {
  BROADCAST_ACTIONS,
  COUPON_BUTTON_LABEL,
  couponActionId,
  isCouponAction,
  type BroadcastActionId,
} from "@/lib/broadcast-constants";

type Offer = { id: string; title: string; amount: number; active: boolean };

/** โหลดแคมเปญคูปองครั้งเดียวต่อหน้า — ใช้ร่วมกันทุกตัวเลือกปุ่ม */
let offersCache: Promise<Offer[]> | null = null;
function loadOffers() {
  offersCache ??= fetch("/api/coupons/offers")
    .then((r) => r.json())
    .then((d) => (d.offers || []) as Offer[])
    .catch(() => []);
  return offersCache;
}

/**
 * เลือกปุ่มในการ์ด LINE (สูงสุด 3) — ปุ่มลัดในแอป + ปุ่ม "กดรับคูปอง" ของแคมเปญที่เลือก
 */
export function BroadcastButtonPicker({
  value,
  onChange,
}: {
  value: BroadcastActionId[];
  onChange: (next: BroadcastActionId[]) => void;
}) {
  const [offers, setOffers] = useState<Offer[]>([]);
  useEffect(() => {
    loadOffers().then(setOffers);
  }, []);

  const full = value.length >= 3;
  const coupon = value.find(isCouponAction);
  const couponOfferId = coupon ? coupon.slice("coupon:".length) : "";

  const toggle = (id: BroadcastActionId) => {
    if (value.includes(id)) onChange(value.filter((a) => a !== id));
    else if (!full) onChange([...value, id]);
  };
  const setCoupon = (offerId: string) => {
    const rest = value.filter((a) => !isCouponAction(a));
    if (!offerId) return onChange(rest);
    // คูปองได้ 1 แคมเปญต่อการ์ด — ขึ้นเป็นปุ่มแรกให้เด่นสุด (ปุ่มครบ 3 แล้ว = ปุ่มท้ายหลุดไป)
    onChange([couponActionId(offerId), ...rest].slice(0, 3));
  };
  const chip = (selected: boolean, disabled: boolean) =>
    `flex h-9 items-center gap-1 rounded-full px-3.5 text-xs font-bold ${
      selected
        ? "bg-petflow-chocolate text-card"
        : disabled
          ? "bg-paper text-brown-faint opacity-50"
          : "bg-paper text-brown"
    }`;

  const activeOffers = offers.filter((o) => o.active || o.id === couponOfferId);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-2">
        {BROADCAST_ACTIONS.map((action) => {
          const selected = value.includes(action.id);
          const disabled = !selected && full;
          return (
            <button
              key={action.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(action.id)}
              title={action.description}
              className={chip(selected, disabled)}
            >
              {selected && <Icon name="check" size={14} strokeWidth={2.4} />}
              {action.label}
            </button>
          );
        })}
      </div>
      <label className="flex items-center gap-2 rounded-petflow-sm bg-paper px-3 py-2 text-xs">
        <span className={`shrink-0 font-bold ${coupon ? "text-petflow-chocolate" : "text-brown"}`}>{COUPON_BUTTON_LABEL}</span>
        <select
          value={couponOfferId}
          onChange={(e) => setCoupon(e.target.value)}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs font-bold text-brown focus:shadow-none disabled:opacity-50"
          aria-label="แคมเปญคูปองสำหรับปุ่มกดรับคูปอง"
        >
          <option value="">ไม่ใส่ปุ่มคูปอง</option>
          {activeOffers.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title} · ลด {o.amount} บาท
            </option>
          ))}
        </select>
      </label>
      {offers.length === 0 && (
        <p className="text-[10px] text-brown-faint">ยังไม่มีแคมเปญคูปอง — สร้างได้ที่เมนูคูปอง แล้วกลับมาเลือกที่นี่</p>
      )}
    </div>
  );
}
