"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { type Booking } from "@/lib/business";
import { t } from "@/lib/i18n";
import { useLocale } from "@/components/LocaleProvider";
import { useLiff } from "@/components/LiffProvider";
import { BTN_PRIMARY, PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { LoadingScreen } from "@/components/LoadingScreen";
import { groomProgram } from "@/lib/grooming-prices";
import { groupBookings, groupCatNames, stayForGroom } from "@/lib/booking-group";
import { bangkokToday } from "@/lib/bangkok-date";
import { useConfig } from "@/components/ConfigProvider";
import { isFeatureOn } from "@/lib/features";

/** API ส่ง checkin มาด้วยจริง (ใช้จัดกลุ่มบ้านเดียวกัน/นัดเดียวกัน) แต่ type Booking กลางไม่มีฟิลด์นี้ */
type BookingRow = Booking & { checkin?: string; checkout?: string; arrivalTime?: string };

/** เวลามาส่งน้องที่บันทึกไว้ — ที่เดียวกับหน้าเลือกเวลาจากลิงก์ LINE และที่หลังบ้านเห็น */
const savedArrival = (b: BookingRow) => b.arrivalTime || b.checkinTime || "";
/** ทั้งบ้านในวันเดียวกัน = การ์ดเดียว ยืนยันครั้งเดียว (อาบน้ำคนละรอบเวลาก็รวม) — กุญแจเดียวกับการ์ดยืนยันใน LINE */
const HOUSEHOLD = { groomByDay: true };

function BookingsContent() {
  const { locale } = useLocale();
  const { profile, ready } = useLiff();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("id");
  const m = t(locale).bookings;
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const scrolledRef = useRef(false);
  const { config } = useConfig();
  // นัดเข้าพักให้เลือกเวลามาส่ง (เลือกแล้ว = ยืนยันนัด) — เว้นร้านปิด "ให้ลูกค้าเลือกเวลาส่ง-รับน้อง"
  const asksTime = (b: BookingRow) => b.service === "room" && isFeatureOn(config, "checkinTime");

  const load = useCallback(async () => {
    if (!profile?.lineUserId) return;
    const q = new URLSearchParams({ lineUserId: profile.lineUserId });
    const res = await fetch(`/api/bookings?${q}`);
    const data = await res.json();
    setBookings(data.bookings || []);
    setLoading(false);
  }, [profile?.lineUserId]);

  useEffect(() => {
    if (!profile?.lineUserId) {
      if (ready) setLoading(false);
      return;
    }
    load();
  }, [profile?.lineUserId, load, ready]);

  useEffect(() => {
    if (!highlightId || loading || scrolledRef.current) return;
    // นัดที่ถูก highlight อาจถูกรวมเป็นการ์ดเดียวกับตัวอื่นในบ้านเดียวกัน — หากลุ่มก่อน
    // แล้วอ้างอิงด้วย id ของตัวหลักในกลุ่ม (นั่นคือ id ที่การ์ดจริงเรนเดอร์ไว้)
    const group = groupBookings(bookings, HOUSEHOLD).find((g) => g.some((b) => b.id === highlightId));
    if (!group) return;
    const primary = group[0];
    scrolledRef.current = true;
    requestAnimationFrame(() => {
      document.getElementById(`booking-${primary.id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [highlightId, loading, bookings]);

  // อาบน้ำก่อนกลับระหว่างเข้าพัก = นัดเดียวกับการเข้าพัก (เจ้าของร้านตกลงไว้ 2026-10-23)
  // → ไม่โชว์เป็นการ์ดแยกที่ต้องกดยืนยันอีกรอบ แต่ติดไว้บนการ์ดเข้าพักแทน
  const inStayBaths = bookings.filter((b) => stayForGroom(b, bookings));
  const bathsOf = (group: BookingRow[]) =>
    inStayBaths.filter((x) => group.some((s) => stayForGroom(x, [s])));
  const today = bangkokToday();
  const lastDay = (b: BookingRow) => (b.checkout || b.date || b.checkin || "").slice(0, 10);
  // นัดที่ยังไม่ถึงขึ้นก่อน (ใกล้สุดก่อน) · นัดที่ผ่านไปแล้วไว้ท้ายสุด
  const groups = groupBookings(bookings.filter((b) => !inStayBaths.includes(b)), HOUSEHOLD).sort((a, b) => {
    const pa = lastDay(a[0]) < today;
    const pb = lastDay(b[0]) < today;
    if (pa !== pb) return pa ? 1 : -1;
    const ka = (a[0].checkin || a[0].date || "").slice(0, 10);
    const kb = (b[0].checkin || b[0].date || "").slice(0, 10);
    return pa ? kb.localeCompare(ka) : ka.localeCompare(kb);
  });

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader eyebrow="Bookings" title={m.title} />

      {loading ? (
        <LoadingScreen message={t(locale).common.loading} />
      ) : bookings.length === 0 ? (
        <div className="rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
          <EmptyState icon="calendar" title={m.empty} />
        </div>
      ) : (
        <ul className="space-y-3">
          {groups.map((group) => {
            // บ้านเดียวกัน วันเดียวกัน หลายตัว → การ์ดเดียว ยืนยันทีเดียวทั้งบ้าน (เจ้าของร้านขอ 2026-10-27)
            // อาบน้ำคนละรอบเวลาก็รวม — บอกเวลารายตัวในการ์ดแทน · ตัวที่ยังรอยืนยันเท่านั้นที่ถูกยืนยันตอนกด
            const primary = group[0];
            const status = group.some((x) => x.status === "pending") ? "pending" : primary.status;
            const baths = bathsOf(group);
            const past = lastDay(primary) < today;
            const waiting = group.filter((x) => x.status === "pending");
            const status = waiting.length > 0 ? "pending" : primary.status;
            const selfBooked = waiting.some((x) => x.selfBooked);
            const catLabel = groupCatNames(group);
            const mixedTime = new Set(group.map((x) => x.time || "")).size > 1;

            return (
              <li
                key={primary.id}
                id={`booking-${primary.id}`}
                className={`rounded-petflow border bg-card p-4 shadow-petflow-sm ${
                  group.some((x) => x.id === highlightId)
                    ? "border-sage ring-2 ring-sage/30"
                    : "border-petflow-line"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
                    <Icon name={primary.service === "groom" ? "bath" : "bed"} size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold text-petflow-chocolate">
                      {catLabel}{" "}
                      <span className="font-medium text-brown-soft">· {primary.customerName}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-brown-soft">
                      {primary.service === "groom" ? m.groom : m.room} ·{" "}
                      {primary.service === "room" && primary.checkin
                        ? `${primary.checkin}${primary.checkout ? ` → ${primary.checkout}` : ""}`
                        : primary.date}
                      {primary.time && !mixedTime ? ` · ${primary.time}` : ""}
                    </p>
                    {mixedTime && (
                      <ul className="mt-0.5 space-y-0.5 text-xs text-brown-soft">
                        {[...group]
                          .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
                          .map((x) => (
                            <li key={x.id} className="flex items-center gap-1.5">
                              <Icon name="paw" size={13} />
                              {x.catName}
                              {x.time ? ` · ${x.time}` : ""}
                            </li>
                          ))}
                      </ul>
                    )}
                    {primary.groomProgram && (
                      <p className="mt-0.5 text-[11px] font-bold text-latte-deep">
                        🧴 {groomProgram(primary.groomProgram)?.name || primary.groomProgram}
                      </p>
                    )}
                    {baths.length > 0 && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-brown-soft">
                        <Icon name="bath" size={13} />
                        {locale === "th" ? "อาบน้ำก่อนกลับ" : "Bath before going home"} {baths[0].date}
                        {baths[0].time ? ` · ${baths[0].time}` : ""}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                      status === "confirmed"
                        ? "bg-sage/20 text-ok"
                        : status === "cancelled"
                          ? "bg-brown-soft/15 text-brown-soft"
                          : "bg-honey/25 text-wait"
                    }`}
                  >
                    {status === "confirmed"
                      ? m.confirmed
                      : status === "cancelled"
                        ? m.cancelled
                        : past
                          ? locale === "th"
                            ? "ผ่านไปแล้ว"
                            : "Past"
                          : m.pending}
                  </span>
                </div>

                {/* นัดที่ลูกค้าจองเอง → รอร้านยืนยัน ลูกค้ายืนยันเองไม่ได้ (กัน "จองเอง ยืนยันเอง") */}
                {status === "pending" && selfBooked && !past && (
                  <p className="mt-3 flex items-center justify-center gap-1.5 rounded-petflow-sm bg-honey/25 px-3 py-2.5 text-center text-xs font-bold text-wait">
                    <Icon name="clock" size={14} />
                    {locale === "th"
                      ? "รอร้านยืนยันคิว — จะแจ้งกลับทาง LINE ทันทีที่ยืนยันนะคะ"
                      : "Waiting for the shop to confirm — we'll notify you on LINE"}
                  </p>
                )}
                {/* นัดที่ร้านสร้างให้ → ไม่มีปุ่ม "ยืนยันนัด" แล้ว กรอกข้อมูล/เลือกเวลาจากการ์ดใน LINE = ยืนยันนัด ทั้งบ้าน */}
                {status === "pending" && !selfBooked && !past && (
                  asksTime(primary) && !savedArrival(primary) ? (
                    <a
                      href={`/app/booking-time?id=${primary.id}&type=checkin`}
                      className={`mt-3 ${BTN_PRIMARY}`}
                    >
                      <Icon name="clock" size={18} strokeWidth={2.2} />
                      {m.checkin}
                    </a>
                  ) : (
                    <p className="mt-2 pl-[52px] text-xs text-brown-soft">
                      {locale === "th"
                        ? "กรอกข้อมูลจากการ์ดใน LINE ให้ครบ = ยืนยันนัดแล้ว"
                        : "Filling in the info from the LINE card confirms this booking"}
                    </p>
                  )
                )}
                {primary.service === "room" &&
                  primary.status !== "cancelled" &&
                  savedArrival(primary) && (
                    <p className="mt-3 flex items-center gap-1.5 pl-[52px] text-xs font-semibold text-ok">
                      <Icon name="clock" size={14} />
                      เวลามาส่งน้อง {savedArrival(primary)} น.
                      {primary.status === "confirmed" && asksTime(primary) && (
                        <a
                          href={`/app/booking-time?id=${primary.id}&type=checkin`}
                          className="ml-auto inline-flex min-h-[44px] items-center px-1 font-bold text-brown-soft underline"
                        >
                          เปลี่ยนเวลา
                        </a>
                      )}
                    </p>
                  )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function BookingsPage() {
  const { locale } = useLocale();
  const m = t(locale).bookings;
  return (
    <Suspense
      fallback={<LoadingScreen message={`${m.title}…`} />}
    >
      <BookingsContent />
    </Suspense>
  );
}
