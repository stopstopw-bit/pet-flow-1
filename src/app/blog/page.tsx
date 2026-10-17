import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BLOG_POSTS } from "@/lib/blog-posts";
import { listArticles } from "@/lib/articles-store";
import { withBootstrapTenant } from "@/lib/tenant-context";
import SiteFooter from "@/components/SiteFooter";

// บทความที่เขียนเองจากหลังบ้านโผล่ภายใน ~5 นาทีหลังบันทึก
export const revalidate = 300;

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://petflow.example.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "บทความน่ารู้เรื่องแมว | ฝากแมว อาบน้ำแมว ดูแลแมว — PetFlow บางนา เทพารักษ์",
  description:
    "รวมบทความจากโรงแรมแมว PetFlow — ฝากแมวครั้งแรกเตรียมอะไร แมวอาบน้ำบ่อยแค่ไหน วิธีเลือกโรงแรมแมว และเคล็ดลับดูแลน้องแมว สำหรับทาสแมวย่านบางนา เทพารักษ์ สมุทรปราการ",
  alternates: { canonical: "/blog" },
  openGraph: {
    type: "website",
    locale: "th_TH",
    url: `${SITE_URL}/blog`,
    siteName: "PetFlow",
    title: "บทความน่ารู้เรื่องแมว — PetFlow",
    description: "เคล็ดลับฝากแมว อาบน้ำแมว และดูแลน้องแมว จากพี่เลี้ยงตัวจริง",
  },
  robots: { index: true, follow: true },
};

export default async function BlogIndexPage() {
  // รวมบทความจากหลังบ้าน (DB) + บทความ SEO เดิม (โค้ด) เรียงตามวันที่
  // ถ้า slug ซ้ำ ให้ฉบับที่แก้ในหลังบ้าน (DB) แทนที่ของเดิมเสมอ — ไม่โชว์ซ้ำ
  // บล็อกหน้าเว็บหลักเป็นของร้าน bootstrap (env TENANT_ID) — ไม่ได้ตั้งก็โชว์แค่บทความในโค้ด
  const dbArticles = await Promise.resolve()
    .then(() => withBootstrapTenant(() => listArticles()))
    .catch(() => []);
  const dbSlugs = new Set(dbArticles.map((a) => a.slug));
  const posts = [
    ...dbArticles.map((a) => ({
      slug: a.slug,
      title: a.title,
      description: a.description,
      cover: a.coverUrl,
      external: true,
      emoji: a.emoji,
      readMinutes: Math.max(1, Math.round(a.body.length / 1200)),
      datePublished: a.datePublished,
    })),
    ...BLOG_POSTS.filter((p) => !dbSlugs.has(p.slug)).map((p) => ({
      slug: p.slug,
      title: p.title,
      description: p.description,
      cover: p.cover,
      external: false,
      emoji: p.emoji,
      readMinutes: p.readMinutes,
      datePublished: p.datePublished,
    })),
  ].sort((a, b) => b.datePublished.localeCompare(a.datePublished));

  return (
    <main className="mx-auto max-w-2xl px-5 pb-16 pt-8">
      <Link href="/" className="text-xs font-bold text-brown-soft">
        ← หน้าแรก PetFlow
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold text-petflow-chocolate">
        📚 บทความน่ารู้เรื่องแมว
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-brown-soft">
        เคล็ดลับฝากแมว อาบน้ำแมว และการดูแลน้องแมว เขียนจากประสบการณ์จริงของพี่เลี้ยง
        PetFlow โรงแรมแมวย่านบางนา–เทพารักษ์ สมุทรปราการ
      </p>

      <div className="mt-6 space-y-4">
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="block overflow-hidden rounded-petflow border border-petflow-line bg-card shadow-petflow-sm transition hover:border-honey/60"
          >
            {post.cover &&
              (post.external ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.cover} alt={post.title} className="h-auto w-full" />
              ) : (
                <Image
                  src={post.cover}
                  alt={post.title}
                  width={1200}
                  height={800}
                  sizes="(max-width: 640px) 100vw, 640px"
                  className="h-auto w-full"
                />
              ))}
            <div className="p-5">
            {!post.cover && <p className="text-3xl">{post.emoji}</p>}
            <h2 className="mt-2 text-base font-extrabold leading-snug text-petflow-chocolate">
              {post.title}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-brown-soft">{post.description}</p>
            <p className="mt-3 text-[11px] font-bold text-latte-deep">
              อ่านต่อ ({post.readMinutes} นาที) →
            </p>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-10 rounded-petflow bg-gradient-to-br from-honey/30 via-card to-latte/15 p-5 text-center shadow-petflow">
        <p className="text-sm font-extrabold text-petflow-chocolate">
          🐱 ฝากแมว / อาบน้ำแมว ย่านบางนา เทพารักษ์
        </p>
        <p className="mt-1 text-xs text-brown-soft">
          ห้องแอร์ส่วนตัว CCTV 24 ชม. รายงานเช้า-เย็นทุกวัน
        </p>
        <a
          href="https://line.me/R/ti/p/@petflow"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block rounded-petflow-sm bg-latte-deep px-6 py-2.5 text-sm font-extrabold text-card"
        >
          💬 ทัก LINE จองคิวเลย
        </a>
      </div>

      <SiteFooter />
    </main>
  );
}
