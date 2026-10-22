import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDE_TOPICS, getGuideTopic } from "@/lib/guide-content";
import { WHO_LABEL, toneOf } from "../GuideBits";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return GUIDE_TOPICS.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = getGuideTopic((await params).slug);
  return {
    title: t ? `${t.title} | วิธีใช้งานหลังร้าน` : "วิธีใช้งานหลังร้าน",
    description: t?.desc,
    robots: { index: false, follow: false },
  };
}

export default async function GuideTopicPage({ params }: Props) {
  const t = getGuideTopic((await params).slug);
  if (!t) notFound();
  const idx = GUIDE_TOPICS.indexOf(t);
  const prev = GUIDE_TOPICS[idx - 1];
  const next = GUIDE_TOPICS[idx + 1];
  const tone = toneOf(t.no);

  return (
    <main className="min-h-screen bg-cream pb-24">
      <header className={`relative overflow-hidden px-5 pb-8 pt-5 ${tone.bg}`}>
        <span aria-hidden className="pointer-events-none absolute -right-4 -top-2 text-[110px] opacity-20">
          {t.icon}
        </span>
        <div className="relative mx-auto max-w-3xl">
          <Link
            href="/guide"
            className="inline-flex items-center gap-1 rounded-full bg-card/80 px-3 py-1.5 text-xs font-bold text-brown shadow-petflow-sm"
          >
            ← บทเรียนทั้งหมด
          </Link>
          <div className="mt-5 flex items-center gap-2 text-[11px] font-extrabold">
            <span className="rounded-full bg-petflow-chocolate px-2.5 py-1 text-card">บทที่ {t.no}</span>
            <span className={`rounded-full bg-card/80 px-2.5 py-1 ${tone.fg}`}>สำหรับ{WHO_LABEL[t.who]}</span>
          </div>
          <h1 className="mt-3 flex items-start gap-2 text-2xl font-extrabold leading-tight text-petflow-chocolate sm:text-3xl">
            <span aria-hidden>{t.icon}</span>
            {t.title}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-brown-soft">{t.desc}</p>
          {/* ทางลัดไปแต่ละขั้น */}
          <nav aria-label="ขั้นตอน" className="mt-5 flex flex-wrap gap-1.5">
            {t.steps.map((s, i) => (
              <a
                key={i}
                href={`#step-${i + 1}`}
                title={s.title}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-xs font-extrabold text-petflow-chocolate shadow-petflow-sm active:scale-90"
              >
                {i + 1}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <ol className="mx-auto max-w-3xl px-4">
        {t.steps.map((s, i) => (
          <li
            key={i}
            id={`step-${i + 1}`}
            className="relative scroll-mt-4 border-l-[3px] border-dashed border-honey-deep/60 pb-8 pl-7 pt-8 last:border-transparent sm:ml-4"
          >
            <span className="absolute -left-[22px] top-7 flex h-10 w-10 items-center justify-center rounded-full bg-petflow-chocolate text-base font-extrabold text-card shadow-petflow ring-4 ring-cream">
              {i + 1}
            </span>
            <div className="grid items-start gap-5 sm:grid-cols-[1fr_260px]">
              <div className="sm:pt-1">
                <h2 className="text-lg font-extrabold leading-snug text-brown">{s.title}</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-brown-soft">{s.text}</p>
                {s.tip ? (
                  <p className="mt-3 flex gap-2 rounded-petflow-sm bg-amber p-3 text-sm leading-relaxed text-brown">
                    <span aria-hidden>💡</span>
                    <span>
                      <b className="text-amber-deep">เคล็ดลับ</b> {s.tip}
                    </span>
                  </p>
                ) : null}
              </div>
              {s.img ? (
                <figure className="mx-auto w-full max-w-[260px]">
                  <div className="overflow-hidden rounded-[34px] border-[7px] border-petflow-chocolate bg-card shadow-petflow">
                    <Image
                      src={s.img}
                      alt={`ภาพหน้าจอ: ${s.title}`}
                      width={600}
                      height={1298}
                      sizes="260px"
                      className="block h-auto w-full"
                    />
                  </div>
                  <figcaption className="mt-2 text-center text-[11px] text-brown-faint">
                    วงสีชมพู = ตรงที่ต้องแตะหรือดู
                  </figcaption>
                </figure>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <div className="mx-auto max-w-3xl px-4">
        <section className="rounded-petflow bg-gradient-to-br from-honey/60 to-lavender p-6 text-center shadow-petflow-sm">
          <p className="text-4xl">🎉</p>
          <p className="mt-1 text-lg font-extrabold text-petflow-chocolate">เก่งมาก! จบบทนี้แล้ว</p>
          <p className="mt-1 text-sm text-brown-soft">ลองทำจริงในหลังร้านดูสักรอบ แล้วไปบทต่อไปกัน</p>
        </section>

        <nav aria-label="บทอื่น" className="mt-5 grid gap-3 sm:grid-cols-2">
          {prev ? (
            <Link
              href={`/guide/${prev.slug}`}
              className="rounded-petflow bg-card p-4 shadow-petflow-sm ring-1 ring-petflow-line active:scale-[0.98]"
            >
              <span className="text-[11px] font-bold text-brown-faint">← บทที่ {prev.no}</span>
              <span className="mt-0.5 block text-sm font-extrabold text-brown">
                {prev.icon} {prev.title}
              </span>
            </Link>
          ) : (
            <span className="hidden sm:block" />
          )}
          {next ? (
            <Link
              href={`/guide/${next.slug}`}
              className="rounded-petflow bg-petflow-chocolate p-4 text-right shadow-petflow-sm active:scale-[0.98]"
            >
              <span className="text-[11px] font-bold text-card/70">บทต่อไป · บทที่ {next.no} →</span>
              <span className="mt-0.5 block text-sm font-extrabold text-card">
                {next.icon} {next.title}
              </span>
            </Link>
          ) : (
            <Link
              href="/guide"
              className="rounded-petflow bg-petflow-chocolate p-4 text-right shadow-petflow-sm active:scale-[0.98]"
            >
              <span className="text-[11px] font-bold text-card/70">ครบทุกบทแล้ว 🏆</span>
              <span className="mt-0.5 block text-sm font-extrabold text-card">กลับหน้าบทเรียนทั้งหมด</span>
            </Link>
          )}
        </nav>
      </div>
    </main>
  );
}
