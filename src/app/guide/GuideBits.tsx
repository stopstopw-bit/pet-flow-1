import Link from "next/link";
import type { GuideTopic } from "@/lib/guide-content";

/** สีการ์ดวนตามลำดับบท — โทนพาสเทลเดียวกับแอปลูกค้า ไม่ผูกกับสีแบรนด์ร้าน */
export const GUIDE_TONES = [
  { bg: "bg-amber", fg: "text-amber-deep", ring: "ring-amber-deep/20" },
  { bg: "bg-sky", fg: "text-sky-deep", ring: "ring-sky-deep/20" },
  { bg: "bg-mint", fg: "text-mint-deep", ring: "ring-mint-deep/20" },
  {
    bg: "bg-lavender",
    fg: "text-lavender-deep",
    ring: "ring-lavender-deep/20",
  },
  { bg: "bg-honey/40", fg: "text-latte-deep", ring: "ring-latte-deep/20" },
];

export const toneOf = (no: number) => GUIDE_TONES[(no - 1) % GUIDE_TONES.length];

export const WHO_LABEL: Record<GuideTopic["who"], string> = {
  staff: "ทุกคนในร้าน",
  owner: "เจ้าของร้าน",
};

export function TopicCard({ t }: { t: GuideTopic }) {
  const tone = toneOf(t.no);
  return (
    <Link
      href={`/guide/${t.slug}`}
      className="group flex items-start gap-3 rounded-petflow bg-card p-4 shadow-petflow-sm ring-1 ring-petflow-line transition hover:-translate-y-0.5 hover:shadow-petflow active:scale-[0.98]"
    >
      <span
        className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl ring-4 ${tone.bg} ${tone.ring} transition group-hover:rotate-[-6deg]`}
      >
        {t.icon}
        <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-petflow-chocolate px-1 text-[11px] font-extrabold text-card">
          {t.no}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold leading-snug text-brown">{t.title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-brown-soft">{t.desc}</span>
        <span className={`mt-2 inline-flex items-center gap-1 text-[11px] font-bold ${tone.fg}`}>
          {t.steps.length} ขั้นตอน
          <span aria-hidden className="transition group-hover:translate-x-1">
            →
          </span>
        </span>
      </span>
    </Link>
  );
}
