"use client";

import Link from "next/link";
import { t } from "@/lib/i18n";
import { useLocale } from "@/components/LocaleProvider";
import { useConfig } from "@/components/ConfigProvider";
import { BookingOnlyNotice, LineBookingCta, PageHeader } from "@/components/PageHeader";
import { ContentBlocks } from "@/components/ContentBlocks";
import { petKindOf } from "@/lib/pet-kind";
import { isFeatureOn } from "@/lib/features";
import { bathPrograms, resolveGroomPrograms, resolveMassagePrograms, resolveGroomSizes } from "@/lib/grooming-prices";

const GROOMING_MENU_POSTER = "/catalog/grooming/grooming-menu.jpg";
// รูปที่ติดมากับระบบ (ของร้านตัวอย่าง PetFlow) — ถ้าค่าที่บันทึกไว้เป็นรูปพวกนี้ ถือว่าร้านยังไม่ได้อัปเอง
// grooming-menu.jpg ติดอยู่ในค่าตั้งต้นของร้านเก่า เลยเคยหลุดไปโชว์โปสเตอร์ร้านแมว + LINE @petflow ในร้านหมา
const LEGACY_POSTERS = new Set([
  GROOMING_MENU_POSTER,
  "/catalog/grooming/bath-menu.jpg",
  "/catalog/grooming/advance-menu.jpg",
]);

export default function GroomingPage() {
  const { locale } = useLocale();
  const { config } = useConfig();
  const m = t(locale).grooming;

  const menus = config.grooming.menus as {
    bath?: { poster?: string };
    advance?: { poster?: string };
  };

  // เมนูชุดใหม่รวมทุกโปรแกรมไว้ในรูปเดียว — รูปเก่า 2 ใบที่ติดมากับระบบถือว่า "ไม่ได้ตั้ง"
  // ร้านอัปโปสเตอร์เองในตั้งค่า (รูปอื่นที่ไม่ใช่ของเดิม) ยังใช้ของร้านเหมือนเดิม
  const custom = [menus.bath?.poster, menus.advance?.poster].filter(
    (p): p is string => !!p && !LEGACY_POSTERS.has(p)
  );
  // รูปเมนูที่ติดมากับระบบเป็นเมนูร้านแมว — ร้านหมา / หมาและแมวที่ยังไม่อัปรูปเอง โชว์ตารางราคาจากหน้าตั้งค่าแทน
  const showTable = !custom.length && petKindOf(config) !== "cat";
  const posters = custom.length ? custom : showTable ? [] : [GROOMING_MENU_POSTER];
  const sizes = resolveGroomSizes(config.groomSizeLabels);

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader
        eyebrow="Grooming"
        title={m.title}
        back="/app/services"
        backLabel={locale === "th" ? "บริการทั้งหมด" : "All services"}
      />
      <BookingOnlyNotice locale={locale} />

      <div className="space-y-4">
        {posters.map((src) => (
          <div
            key={src}
            className="overflow-hidden rounded-petflow border border-petflow-line bg-card shadow-petflow-sm"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="block w-full h-auto" />
          </div>
        ))}
      </div>

      {showTable && (
        <div className="space-y-4">
          {[
            ...bathPrograms(resolveGroomPrograms(config.groomPricePrograms)),
            // ร้านเปิดบริการนวด — โชว์ราคานวดต่อท้ายในหน้าเดียวกัน
            ...(isFeatureOn(config, "massage") ? resolveMassagePrograms(config.groomPricePrograms) : []),
          ].map((p) => (
            <div key={p.id} className="overflow-hidden rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
              <p className="bg-honey/25 px-4 py-2.5 text-sm font-extrabold text-petflow-chocolate">{p.name}</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-brown-soft">
                    <th className="px-3 py-2 text-left font-bold" />
                    {sizes.map((s) => (
                      <th key={s.id} className="px-2 py-2 text-right font-bold">{s.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {p.breeds.map((b) => (
                    <tr key={b.breed} className="border-t border-petflow-line">
                      <td className="px-3 py-2 font-bold text-brown">{b.breed}</td>
                      {sizes.map((s) => (
                        <td key={s.id} className="px-2 py-2 text-right text-brown">
                          {b.prices[s.id] ? b.prices[s.id].toLocaleString() : "–"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!!p.includes?.length && (
                <p className="border-t border-petflow-line px-4 py-2 text-[11px] text-brown-soft">รวม: {p.includes.join(" · ")}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <ContentBlocks blocks={config.groomingPageBlocks} />

      {/* ร้านปิด "จองคิวเอง" ไว้ → ไม่โชว์ปุ่ม (เดิมกดแล้วไปเจอหน้าปิดใช้งาน) */}
      {isFeatureOn(config, "selfBooking") && (
        <Link
          href="/app/book?service=groom"
          className="mt-5 block rounded-petflow-sm bg-latte-deep py-3.5 text-center text-sm font-extrabold text-white shadow-petflow-sm"
        >
          📅 จองคิวอาบน้ำเอง
        </Link>
      )}
      {isFeatureOn(config, "selfBooking") && isFeatureOn(config, "massage") && (
        <Link
          href="/app/book?service=massage"
          className="mt-3 block rounded-petflow-sm border border-latte-deep bg-card py-3.5 text-center text-sm font-extrabold text-latte-deep shadow-petflow-sm"
        >
          💆 จองคิวนวดเอง
        </Link>
      )}
      <LineBookingCta locale={locale} />
    </div>
  );
}
