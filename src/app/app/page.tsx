"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  type Booking,
} from "@/lib/business";
import { useConfig } from "@/components/ConfigProvider";
import { t } from "@/lib/i18n";
import { useLocale } from "@/components/LocaleProvider";
import { useLiff } from "@/components/LiffProvider";
import { Logo } from "@/components/Logo";
import { LangSwitch } from "@/components/LangSwitch";
import { CustomerExclusivePromos } from "@/components/CustomerExclusivePromos";
import { MyCatsSection } from "@/components/MyCatsSection";
import { MyPackagesSection } from "@/components/MyPackagesSection";
import { MyMemberCreditSection } from "@/components/MyMemberCreditSection";
import { PackageShopSection } from "@/components/PackageShopSection";
import { HeaderBand, IconChip } from "@/components/HeaderBand";

export default function CustomerHome() {
  const { locale } = useLocale();
  const { profile, ready, customer } = useLiff();
  const { config } = useConfig();
  const m = t(locale).home;
  const [nextBooking, setNextBooking] = useState<Booking | null>(null);
  const [hasPromos, setHasPromos] = useState(false);
  const [couponCount, setCouponCount] = useState(0);
  // เครดิต Member / คอร์ส — โชว์เฉพาะคนที่มีจริง
  // ถ้ามีอย่างใดอย่างหนึ่ง ก็ไม่ต้องโชว์ช่องแต้มซ้ำ (เมนูแต้มอยู่ด้านล่างแล้ว)
  // ถ้าไม่มีทั้งคู่ ค่อยโชว์ช่องแต้มไว้ ไม่งั้นหน้าแรกจะโล่ง
  // เก็บเป็น null = ยังเช็คไม่เสร็จ กันช่องแต้มกะพริบขึ้นมาแล้วหายไป
  const [hasCredit, setHasCredit] = useState<boolean | null>(null);
  const [hasPackages, setHasPackages] = useState<boolean | null>(null);
  const extrasChecked = hasCredit !== null && hasPackages !== null;
  const showPoints = !profile?.lineUserId || (extrasChecked && !hasCredit && !hasPackages);

  useEffect(() => {
    if (!profile?.lineUserId) return;
    fetch(`/api/coupons?lineUserId=${profile.lineUserId}&active=1`)
      .then((r) => r.json())
      .then((d) => setCouponCount((d.coupons || []).length))
      .catch(() => {});
  }, [profile?.lineUserId]);

  useEffect(() => {
    if (!profile?.lineUserId) return;
    const q = new URLSearchParams({ lineUserId: profile.lineUserId });
    fetch(`/api/bookings?${q}`)
      .then((r) => r.json())
      .then((data) => {
        const list: Booking[] = data.bookings || [];
        const pending = list.find((b) => b.status === "pending");
        setNextBooking(pending || null);
      })
      .catch(() => setNextBooking(null));
  }, [profile?.lineUserId]);

  const points = profile?.points ?? 0;

  // ยังไม่ได้สมัคร/ข้อมูลไม่ครบ (ไม่มีเบอร์ = ยังไม่เคยกรอกฟอร์มสมัคร) → ชวนให้กรอกให้จบ
  // กัน record ว่างค้างในระบบ และร้านติดต่อกลับได้เสมอ
  const needRegister = ready && !!profile?.lineUserId && !customer?.phone;

  return (
    <div className="pb-6">
      <HeaderBand className="px-4 pb-12 pt-5">
        <header className="flex items-center gap-3">
          {profile?.pictureUrl ? (
            <Image
              src={profile.pictureUrl}
              alt=""
              width={52}
              height={52}
              className="rounded-full border-2 border-card object-cover"
            />
          ) : (
            <Logo size={52} />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-petflow-chocolate/70">
              {m.greeting}
              {profile ? `, ${profile.displayName}` : ""}
            </p>
            <h1 className="text-xl font-extrabold text-petflow-chocolate">
              PetFlow <span className="text-card">Hotel</span>
            </h1>
          </div>
          <LangSwitch />
        </header>
      </HeaderBand>

      <div className="relative -mt-8 px-4">
      {needRegister && (
        <Link
          href="/app/register"
          className="mb-4 block rounded-petflow border-2 border-honey/60 bg-card p-4 shadow-petflow"
        >
          <p className="text-sm font-extrabold text-petflow-chocolate">
            📝 {locale === "th" ? "สมัครสมาชิกให้เสร็จก่อนนะคะ" : "Please complete your registration"}
          </p>
          <p className="mt-0.5 text-xs text-brown-soft">
            {locale === "th"
              ? "กรอกข้อมูลผู้ปกครองและน้องแมวสั้นๆ — รับสิทธิ์สะสมแต้ม โปรโมชัน และให้เราดูแลน้องได้เต็มที่ค่ะ 🧡"
              : "A quick form about you and your cat — unlock points, promos and better care 🧡"}
          </p>
          <span className="mt-2 inline-block rounded-full bg-latte-deep px-3.5 py-1.5 text-xs font-extrabold text-white">
            {locale === "th" ? "กรอกเลย →" : "Register →"}
          </span>
        </Link>
      )}

      <Link
        href="/app/book"
        className="mb-3 flex items-center gap-3 rounded-petflow bg-gradient-to-r from-latte-deep to-petflow-chocolate p-4 text-card shadow-petflow-sm transition active:scale-[0.98]"
      >
        <span className="text-2xl">📅</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold">จองคิวเอง</span>
          <span className="block text-[11px] opacity-80">
            เลือกวัน-เวลาว่างเอง ไม่ต้องคุยกับพนักงาน
          </span>
        </span>
        <span>→</span>
      </Link>

      <Link
        href="/app/coupons"
        className="mb-4 flex items-center justify-between gap-3 rounded-petflow border-2 border-amber-deep/30 bg-amber p-4 shadow-petflow"
      >
        <div className="min-w-0">
          <p className="text-base font-extrabold text-amber-deep">
            🎫 กระเป๋าคูปองของฉัน
          </p>
          <p className="mt-0.5 text-[11px] font-bold text-brown-soft">
            ชวนเพื่อนมาใช้บริการ รับคูปองคนละ 100฿
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-deep px-3.5 py-2 text-xs font-extrabold text-card shadow-petflow-sm">
          {couponCount > 0 ? `${couponCount} ใบ` : "เปิด"} →
        </span>
      </Link>

      {/* เมนูลัด — ไอคอนกลมแบบหมวดหมู่ */}
      <nav aria-label="menu" className="mb-5 mt-1 grid grid-cols-4 gap-2">
        <Link href="/app/rooms"><IconChip icon="bed" label={t(locale).nav.rooms} tone="honey" /></Link>
        <Link href="/app/grooming"><IconChip icon="bath" label={t(locale).nav.grooming} tone="sage" /></Link>
        <Link href="/app/bookings"><IconChip icon="calendar" label={t(locale).nav.bookings} tone="latte" badge={nextBooking ? 1 : undefined} /></Link>
        <Link href="/app/profile"><IconChip icon="edit" label={locale === "th" ? "แก้ข้อมูล" : "Profile"} tone="paper" /></Link>
      </nav>

      {!ready && (
        <p className="mb-4 rounded-petflow-sm bg-paper px-4 py-3 text-sm text-brown-soft">
          {t(locale).common.loading}
        </p>
      )}

      {/* แมวของฉัน — อัป/แก้รูปเองได้ */}
      <MyCatsSection />

      {/* เครดิต Member — โชว์เฉพาะคนที่เติมไว้ */}
      <MyMemberCreditSection onChecked={setHasCredit} />

      {/* คอร์สที่ซื้อไว้ — จ่ายเงินล่วงหน้าแล้ว ต้องเห็นว่าเหลือกี่ครั้ง */}
      <MyPackagesSection onChecked={setHasPackages} />

      {/* แต้มสะสม — โชว์เมื่อไม่มีเครดิต/คอร์ส เพื่อไม่ให้หน้าแรกโล่ง
          (ไม่มีปุ่มประวัติแต้ม เพราะเมนูแต้มด้านล่างพาไปหน้าเดียวกันอยู่แล้ว) */}
      {showPoints && (
        <section className="mb-4 overflow-hidden rounded-petflow bg-sky p-5 shadow-petflow">
          <p className="text-xs font-bold text-brown-soft">{m.yourPoints}</p>
          <p className="mt-1 text-4xl font-extrabold text-sky-deep">
            {points}
            <span className="ml-1 text-sm font-bold text-brown-faint">
              {locale === "th" ? "แต้ม" : "pts"}
            </span>
          </p>
          <p className="mt-1 text-[10px] text-brown-faint">
            {t(locale).points.rate} · {config.business.pointsRate}{" "}
            {locale === "th" ? "บาท" : "THB"}
          </p>
        </section>
      )}

      {/* คอร์สที่เปิดขาย — ซื้อ โอน แนบสลิป ได้ในที่เดียว */}
      <PackageShopSection />

      {/* โปรพิเศษลูกค้า — โผล่เฉพาะตอนมีโปรจริง (ไม่มี = ซ่อนทั้งช่อง) */}
      <CustomerExclusivePromos compact onHasPromos={setHasPromos} />

      {hasPromos && (
        <div className="mb-4 text-right">
          <Link href="/app/promos" className="text-[10px] font-bold text-latte-deep">
            {m.promosNow} · {m.seeAll} →
          </Link>
        </div>
      )}

      {/* คิวถัดไป */}
      {nextBooking ? (
        <section className="mb-4 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-petflow-chocolate">
              📅 {m.nextBooking}
            </h2>
            <span className="rounded-full bg-honey/30 px-2 py-0.5 text-[10px] font-bold text-wait">
              {t(locale).bookings.pending}
            </span>
          </div>
          <p className="text-sm font-bold text-brown">
            {nextBooking.catName} · {nextBooking.customerName}
          </p>
          <p className="text-xs text-brown-soft">
            {nextBooking.date}
            {nextBooking.time ? ` · ${nextBooking.time}` : ""}
          </p>
          <Link
            href="/app/bookings"
            className="mt-3 block rounded-petflow-sm bg-latte/25 py-2.5 text-center text-xs font-extrabold text-petflow-chocolate"
          >
            {m.confirmBooking} →
          </Link>
        </section>
      ) : null}

      <a
        href="https://line.me/R/ti/p/@petflow"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 block rounded-petflow-sm border border-petflow-line bg-card py-3 text-center text-xs font-bold text-brown-soft"
      >
        💬 LINE {config.business.lineOa} · {m.chatBook}
      </a>
      </div>
    </div>
  );
}
