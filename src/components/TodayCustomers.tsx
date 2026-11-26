"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { IntakeAnswers } from "@/components/IntakeAnswers";
import type { BriefItem, BriefKind, TodayBrief } from "@/lib/today-brief";

const KIND: Record<BriefKind, { label: string; icon: string; tone: string }> = {
  checkin: { label: "เช็คอิน", icon: "bed", tone: "bg-honey/35" },
  checkout: { label: "เช็คเอาท์", icon: "home", tone: "bg-latte/30" },
  groom: { label: "อาบน้ำ", icon: "bath", tone: "bg-sage/30" },
  stay: { label: "พักอยู่", icon: "bed", tone: "bg-paper" },
};

const CHIP: Record<BriefItem["tone"], string> = {
  red: "bg-red-50 text-red-700 ring-1 ring-red-200",
  amber: "bg-wait/10 text-wait ring-1 ring-wait/25",
  info: "bg-paper text-brown",
};

const label = (it: { cat?: string; text: string }) => (it.cat ? `${it.cat}: ${it.text}` : it.text);

/**
 * หน้าแรกหลังร้าน › ลูกค้าวันนี้
 * 1 การ์ด = 1 บ้าน · โชว์ "ต้องระวัง" + "ต้องทำวันนี้" + "การดูแล" จากคำตอบลูกค้าเลย ไม่ต้องกดเข้าไปอ่านทีละฟอร์ม
 */
export function TodayCustomers() {
  const [items, setItems] = useState<TodayBrief[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/today-brief")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setItems(d.items || []))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  const today = (items || []).filter((x) => x.kind !== "stay");
  const staying = (items || []).filter((x) => x.kind === "stay");
  const redCount = today.reduce((s, x) => s + x.cautions.filter((c) => c.tone === "red").length, 0);

  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3 px-1">
        <div>
          <h2 className="text-base font-extrabold text-petflow-chocolate">ลูกค้าวันนี้</h2>
          <p className="text-[11px] text-brown-soft">
            {items ? `${today.length} นัด` : "กำลังโหลด…"}
            {redCount ? <span className="font-bold text-red-600"> · ต้องระวัง {redCount} เรื่อง</span> : null}
          </p>
        </div>
        <Link href="/admin/schedule" className="text-xs font-bold text-latte-deep">
          ดูตารางนัด
        </Link>
      </div>

      {error && (
        <p className="rounded-petflow bg-card px-4 py-6 text-center text-xs font-bold text-wait shadow-petflow-sm">
          โหลดรายละเอียดลูกค้าไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง
        </p>
      )}

      {items && today.length === 0 && (
        <div className="flex flex-col items-center rounded-petflow bg-card px-4 py-8 text-center shadow-petflow-sm">
          <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-paper text-brown-soft">
            <Icon name="paw" size={24} />
          </span>
          <p className="text-sm font-bold text-brown">วันนี้ไม่มีนัดเข้า-ออก/อาบน้ำ</p>
          <p className="text-xs text-brown-soft">กดปุ่ม + ด้านล่างเพื่อจองให้ลูกค้า</p>
        </div>
      )}

      <div className="space-y-3">
        {today.map((it) => (
          <BriefCard key={it.key} it={it} />
        ))}
      </div>

      {staying.length > 0 && (
        <details className="group mt-3 rounded-petflow bg-card shadow-petflow-sm">
          <summary className="flex min-h-[48px] cursor-pointer list-none items-center gap-2 px-4 text-sm font-extrabold text-petflow-chocolate">
            <Icon name="bed" size={16} className="text-latte-deep" />
            <span className="min-w-0 flex-1">
              กำลังพักอยู่ {staying.length} บ้าน
              <span className="ml-1 text-[11px] font-bold text-brown-soft">อาหาร · ยา · ข้อควรระวัง</span>
            </span>
            <Icon name="chevron" size={14} className="text-brown-faint transition-transform group-open:rotate-90" />
          </summary>
          <div className="space-y-3 px-3 pb-3">
            {staying.map((it) => (
              <BriefCard key={it.key} it={it} flat />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function BriefCard({ it, flat }: { it: TodayBrief; flat?: boolean }) {
  const k = KIND[it.kind];
  const sub =
    it.kind === "checkin"
      ? it.time
        ? `มาส่ง ${it.time} น.`
        : "ยังไม่แจ้งเวลา"
      : it.kind === "checkout"
        ? it.time
          ? `มารับ ${it.time} น.`
          : "ยังไม่แจ้งเวลา"
        : it.kind === "groom"
          ? it.time
            ? `${it.time} น.`
            : "ไม่ระบุเวลา"
          : "";
  const clean = it.cautions.length === 0;
  return (
    <article
      className={`rounded-petflow px-4 py-3 ${flat ? "bg-paper/60" : "bg-card shadow-petflow-sm"} ${
        it.cautions.some((c) => c.tone === "red") ? "border-l-4 border-red-400" : ""
      }`}
    >
      {/* หัวการ์ด: เวลา · ชื่อน้อง · ลูกค้า */}
      <div className="flex items-start gap-3">
        <span className="flex w-12 shrink-0 flex-col items-center pt-0.5">
          <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-petflow-chocolate ${k.tone}`}>
            <Icon name={k.icon} size={18} />
          </span>
          <span className="mt-1 text-[10px] font-extrabold text-brown-soft">{k.label}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold leading-snug text-petflow-chocolate">
            {it.customerId ? (
              <Link href={`/admin/customers?id=${encodeURIComponent(it.customerId)}`} className="underline-offset-2 hover:underline">
                {it.catNames.join(", ")}
              </Link>
            ) : (
              it.catNames.join(", ")
            )}
            {it.catNames.length > 1 && (
              <span className="ml-1 text-[11px] font-bold text-latte-deep">{it.catNames.length} ตัว</span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-brown-soft">
            {sub && <span className={`font-extrabold ${sub === "ยังไม่แจ้งเวลา" ? "text-wait" : "text-petflow-chocolate"}`}>{sub}</span>}
            {sub && " · "}
            {it.customerId ? (
              <Link href={`/admin/customers?id=${encodeURIComponent(it.customerId)}`} className="font-bold underline-offset-2 hover:underline">
                {it.customerName}
              </Link>
            ) : (
              it.customerName
            )}
            {it.room ? ` · ${it.room}` : ""}
          </p>
        </div>
        {it.phone && (
          <a
            href={`tel:${it.phone}`}
            aria-label={`โทรหา ${it.customerName}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper text-brown-soft"
          >
            <Icon name="phone" size={16} />
          </a>
        )}
      </div>

      {/* ต้องระวัง */}
      {!clean && (
        <div className="mt-2.5">
          <p className="mb-1 flex items-center gap-1 text-[11px] font-extrabold text-red-700">
            <Icon name="alert" size={12} />
            ต้องระวัง
          </p>
          <div className="flex flex-wrap gap-1.5">
            {it.cautions.map((c, i) => (
              <span key={i} className={`rounded-full px-2.5 py-1 text-[11px] font-bold leading-tight ${CHIP[c.tone]}`}>
                {label(c)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ต้องทำวันนี้ */}
      {it.todos.length > 0 && (
        <div className="mt-2.5">
          <p className="mb-1 flex items-center gap-1 text-[11px] font-extrabold text-petflow-chocolate">
            <Icon name="check" size={12} />
            ต้องทำวันนี้
          </p>
          <ul className="space-y-1">
            {it.todos.map((t, i) => {
              const body = (
                <>
                  <span
                    className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${
                      t.tone === "red" ? "bg-red-500" : t.tone === "amber" ? "bg-wait" : "bg-brown-faint"
                    }`}
                  />
                  <span
                    className={`min-w-0 flex-1 ${
                      t.tone === "red" ? "font-bold text-red-700" : t.tone === "amber" ? "font-bold text-wait" : "text-brown"
                    }`}
                  >
                    {label(t)}
                  </span>
                  {t.href && <Icon name={t.href.startsWith("http") ? "pin" : "chevron"} size={12} className="mt-0.5 text-brown-faint" />}
                </>
              );
              return (
                <li key={i} className="text-[12px] leading-snug">
                  {t.href ? (
                    <a
                      href={t.href}
                      target={t.href.startsWith("http") ? "_blank" : undefined}
                      rel="noreferrer"
                      className="flex gap-2"
                    >
                      {body}
                    </a>
                  ) : (
                    <span className="flex gap-2">{body}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* การดูแล — อาหาร/มื้อ/ไถขน ฯลฯ */}
      {it.care.length > 0 && (
        <dl className="mt-2.5 space-y-1 rounded-petflow-sm bg-sage/10 px-3 py-2 text-[12px]">
          {it.care.map((c, i) => (
            <div key={i} className="flex gap-2">
              <dt className="w-20 shrink-0 font-bold text-brown-soft">
                {c.cat ? `${c.cat} · ` : ""}
                {c.label}
              </dt>
              <dd className="min-w-0 flex-1 break-words text-brown">{c.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {clean && it.todos.length === 0 && it.care.length === 0 && (
        <p className="mt-2 text-[11px] text-brown-faint">ไม่มีเรื่องที่ต้องระวังเป็นพิเศษ</p>
      )}

      {it.kind !== "checkout" && <IntakeAnswers ids={it.bookingIds} />}
    </article>
  );
}
