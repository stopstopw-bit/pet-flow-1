import type { SiteConfig } from "./config-types";

/** ค่าเริ่มต้นของคูปองชวนเพื่อน — ร้านเดิมที่ไม่เคยตั้ง ได้เท่าเดิม */
export const REFERRAL_DEFAULT = { amount: 100, expiresInDays: 60 };

/** คูปองชวนเพื่อนของร้านนี้ (คนชวนและเพื่อนได้คนละใบเท่ากัน) */
export function referralReward(config: Pick<SiteConfig, "referral"> | null | undefined) {
  const amount = Math.round(Number(config?.referral?.amount));
  const days = Math.round(Number(config?.referral?.expiresInDays));
  return {
    amount: amount > 0 ? amount : REFERRAL_DEFAULT.amount,
    expiresInDays: days > 0 ? days : REFERRAL_DEFAULT.expiresInDays,
  };
}
