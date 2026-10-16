"use client";

import { useLocale } from "./LocaleProvider";
import { t } from "@/lib/i18n";

export function LangSwitch() {
  const { locale, setLocale } = useLocale();
  const next = locale === "th" ? "en" : "th";
  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      aria-label={locale === "th" ? "Switch to English" : "เปลี่ยนเป็นภาษาไทย"}
      className="flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-full border border-petflow-line bg-card px-3 text-xs font-bold text-brown-soft shadow-petflow-sm transition active:scale-95"
    >
      {t(locale).common.lang}
    </button>
  );
}
