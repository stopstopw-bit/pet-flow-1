"use client";

import { useLocale } from "./LocaleProvider";
import { useLiff } from "./LiffProvider";
import { useConfig } from "./ConfigProvider";
import { customerFetch } from "@/lib/customer-fetch";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/business";

/** ธงของแต่ละภาษา — ลูกค้าต่างชาติเห็นธงแล้วรู้ทันทีว่ากดตรงไหน */
export const LANG_FLAG: Record<Locale, string> = { th: "🇹🇭", en: "🇬🇧" };
const LANG_NAME: Record<Locale, string> = { th: "ไทย", en: "English" };

/** ร้านเปิดการ์ด LINE ภาษาอังกฤษไว้ (ตั้งค่า › อัตโนมัติ) — ปิด = หน้าตา/การทำงานเหมือนเดิม */
export function useEnglishCards() {
  const { config } = useConfig();
  return config.automation?.englishCards === true;
}

/** เปลี่ยนภาษา + (ร้านเปิดการ์ดอังกฤษ) ลูกค้าที่สมัครแล้ว จำภาษาไว้ที่ร้าน การ์ด LINE ต่อจากนี้ส่งภาษานี้ */
function useChooseLang() {
  const { locale, setLocale } = useLocale();
  const { profile, customer } = useLiff();
  const remember = useEnglishCards();
  const choose = (next: Locale) => {
    if (next === locale) return;
    setLocale(next);
    if (remember && customer && profile?.lineUserId) {
      void customerFetch("/api/customers/self", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineUserId: profile.lineUserId, language: next }),
      }).catch(() => {});
    }
  };
  return { locale, choose, remember };
}

/** ปุ่มเล็กมุมจอ — กดสลับไทย/อังกฤษ (ร้านเปิดการ์ดอังกฤษ = โชว์ธงของภาษาที่จะเปลี่ยนไป) */
export function LangSwitch() {
  const { locale, choose, remember } = useChooseLang();
  const next: Locale = locale === "th" ? "en" : "th";
  return (
    <button
      type="button"
      onClick={() => choose(next)}
      aria-label={locale === "th" ? "Switch to English" : "เปลี่ยนเป็นภาษาไทย"}
      className="flex h-11 min-w-[44px] shrink-0 items-center justify-center gap-1 rounded-full border border-petflow-line bg-card px-3 text-xs font-bold text-brown-soft shadow-petflow-sm transition active:scale-95"
    >
      {remember && <span className="text-base leading-none">{LANG_FLAG[next]}</span>}
      {t(locale).common.lang}
    </button>
  );
}

/** ปุ่มเลือกภาษาแบบใหญ่ 2 ปุ่ม (มีธง) — คำถามแรกของฟอร์มสมัคร (เฉพาะร้านที่เปิดการ์ดอังกฤษ) */
export function LanguagePicker({ className = "" }: { className?: string }) {
  const { locale, choose, remember } = useChooseLang();
  if (!remember) return null;
  return (
    <div className={`rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm ${className}`}>
      <p className="mb-2 text-center text-xs font-bold text-brown">
        {locale === "en" ? "Which language do you prefer?" : "สะดวกใช้ภาษาไหนคะ"}
        <span className="block text-[11px] font-normal text-brown-faint">
          {locale === "en"
            ? "We'll send your LINE cards in this language"
            : "Which language do you prefer? · ร้านจะส่งการ์ด LINE เป็นภาษานี้"}
        </span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(["th", "en"] as Locale[]).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => choose(l)}
            aria-pressed={locale === l}
            className={`flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 text-sm font-extrabold transition active:scale-95 ${
              locale === l
                ? "border-latte-deep bg-latte-deep/10 text-petflow-chocolate"
                : "border-petflow-line bg-paper text-brown-soft"
            }`}
          >
            <span className="text-2xl leading-none">{LANG_FLAG[l]}</span>
            {LANG_NAME[l]}
          </button>
        ))}
      </div>
    </div>
  );
}
