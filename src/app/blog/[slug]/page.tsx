import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BLOG_POSTS, getBlogPost, type BlogPost } from "@/lib/blog-posts";
import { getArticleBySlug, articleBodyToBlocks } from "@/lib/articles-store";
import { withBootstrapTenant } from "@/lib/tenant-context";
import SiteFooter from "@/components/SiteFooter";

// รองรับบทความที่เขียนเองจากหลังบ้าน (ไม่ได้ prerender) — อัปเดตทุก ~5 นาที
export const revalidate = 300;

/** หาฉบับที่แก้ในหลังบ้าน (DB) ก่อน — ถ้าไม่มีค่อยใช้บทความ SEO เดิมในโค้ด */
async function resolvePost(
  slug: string
): Promise<{ post: BlogPost; external: boolean } | null> {
  // บล็อกหน้าเว็บหลักเป็นของร้าน bootstrap (env TENANT_ID)
  const db = await Promise.resolve()
    .then(() => withBootstrapTenant(() => getArticleBySlug(slug)))
    .catch(() => null);
  if (db) {
    return {
      external: true,
      post: {
        slug: db.slug,
        title: db.title,
        description: db.description,
        keywords: [],
        datePublished: db.datePublished,
        readMinutes: Math.max(1, Math.round(db.body.length / 1200)),
        emoji: db.emoji,
        cover: db.coverUrl,
        blocks: articleBodyToBlocks(db.body),
        faqs: [],
      },
    };
  }
  const builtin = getBlogPost(slug);
  if (builtin) return { post: builtin, external: false };
  return null;
}

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://petflow.example.com";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resolvedMeta = await resolvePost(slug);
  if (!resolvedMeta) return {};
  const post = resolvedMeta.post;
  return {
    metadataBase: new URL(SITE_URL),
    title: `${post.title} | PetFlow`,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      locale: "th_TH",
      url: `${SITE_URL}/blog/${post.slug}`,
      siteName: "PetFlow",
      title: post.title,
      description: post.description,
      publishedTime: post.datePublished,
      ...(post.cover
        ? { images: [{ url: post.cover, width: 1200, height: 800, alt: post.title }] }
        : {}),
    },
    robots: { index: true, follow: true },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const resolved = await resolvePost(slug);
  if (!resolved) notFound();
  const { post, external } = resolved;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: post.title,
        description: post.description,
        datePublished: post.datePublished,
        ...(post.cover ? { image: `${SITE_URL}${post.cover}` } : {}),
        inLanguage: "th",
        author: { "@type": "Organization", name: "PetFlow" },
        publisher: { "@type": "Organization", name: "PetFlow" },
        mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
      },
      {
        "@type": "FAQPage",
        mainEntity: post.faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  const others = BLOG_POSTS.filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <main className="mx-auto max-w-2xl px-5 pb-16 pt-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link href="/blog" className="text-xs font-bold text-brown-soft">
        ← บทความทั้งหมด
      </Link>

      <article className="mt-3">
        {post.cover ? (
          <a href={post.cover} target="_blank" rel="noopener noreferrer">
            {external ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.cover}
                alt={post.title}
                className="h-auto w-full rounded-petflow border border-petflow-line shadow-petflow-sm"
              />
            ) : (
              <Image
                src={post.cover}
                alt={post.title}
                width={1200}
                height={800}
                priority
                sizes="(max-width: 640px) 100vw, 640px"
                className="h-auto w-full rounded-petflow border border-petflow-line shadow-petflow-sm"
              />
            )}
          </a>
        ) : (
          <p className="text-4xl">{post.emoji}</p>
        )}
        <h1 className="mt-3 text-2xl font-extrabold leading-snug text-petflow-chocolate">
          {post.title}
        </h1>
        <p className="mt-2 text-[11px] font-bold text-brown-faint">
          โดย PetFlow · อ่าน {post.readMinutes} นาที
        </p>

        <div className="mt-5 space-y-4">
          {post.blocks.map((block, i) => {
            if (block.type === "h2") {
              return (
                <h2 key={i} className="pt-2 text-lg font-extrabold text-petflow-chocolate">
                  {block.text}
                </h2>
              );
            }
            if (block.type === "ul") {
              return (
                <ul key={i} className="space-y-2 pl-1">
                  {block.items.map((item, j) => (
                    <li key={j} className="flex gap-2 text-sm leading-relaxed text-brown">
                      <span className="shrink-0 text-latte-deep">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              );
            }
            return (
              <p key={i} className="text-sm leading-relaxed text-brown">
                {block.text}
              </p>
            );
          })}
        </div>

        {/* FAQ */}
        {post.faqs.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-extrabold text-petflow-chocolate">❓ คำถามที่พบบ่อย</h2>
          <div className="mt-3 space-y-3">
            {post.faqs.map((f, i) => (
              <div key={i} className="rounded-petflow border border-petflow-line bg-card p-4">
                <p className="text-sm font-extrabold text-petflow-chocolate">{f.q}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-brown-soft">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* CTA */}
        <div className="mt-8 rounded-petflow bg-gradient-to-br from-honey/30 via-card to-latte/15 p-5 text-center shadow-petflow">
          <p className="text-sm font-extrabold text-petflow-chocolate">
            🐱 PetFlow — โรงแรมแมว & อาบน้ำแมว
          </p>
          <p className="mt-1 text-xs text-brown-soft">
            ย่านเทพารักษ์–หนามแดง ใกล้บางนา ศรีนครินทร์ เมกาบางนา · เริ่มคืนละ 350.-
          </p>
          <a
            href="https://line.me/R/ti/p/@petflow"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block rounded-petflow-sm bg-latte-deep px-6 py-2.5 text-sm font-extrabold text-card"
          >
            💬 ทัก LINE จองคิว / สอบถาม
          </a>
          <p className="mt-2 text-[11px]">
            <Link href="/" className="font-bold text-latte-deep underline">
              ดูราคาห้องพัก + บริการทั้งหมด →
            </Link>
          </p>
        </div>
      </article>

      {/* บทความอื่น */}
      {others.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-extrabold text-petflow-chocolate">อ่านต่อ</h2>
          <div className="mt-3 space-y-2">
            {others.map((p) => (
              <Link
                key={p.slug}
                href={`/blog/${p.slug}`}
                className="block rounded-petflow-sm border border-petflow-line bg-card px-4 py-3 text-sm font-bold text-brown transition hover:border-honey/60"
              >
                {p.emoji} {p.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      <SiteFooter />
    </main>
  );
}
