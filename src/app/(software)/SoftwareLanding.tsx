/* eslint-disable @next/next/no-html-link-for-pages -- "/", /product, /shop-questions เป็นไฟล์ HTML ใน public (rewrite) ใช้ <Link> ไม่ได้ ต้องโหลดเต็มหน้า */
import type { Metadata } from "next";
import {
  ORG_ID,
  PRICE_PLANS,
  SEO_SOFTWARE_PAGES,
  SITE_URL,
  SOFTWARE_ID,
  type SeoShot,
  type SeoSoftwarePage,
} from "@/lib/seo-software-pages";

/**
 * แม่แบบหน้า SEO ของซอฟต์แวร์ PetFlow — Server Component ล้วน บอทอ่านข้อความได้ครบ
 * สีและหน้าตาเดียวกับหน้าแรก (public/petflow.html: ฟ้า ชมพู เหลือง ตัวหนังสือกรมท่า)
 */

/** ลิงก์ "สนใจใช้" — แบบสอบถามเจ้าของร้านใหม่ (มีช่องเบอร์/LINE ให้ติดต่อกลับ) */
const CTA_HREF = "/shop-questions";

export function softwareMetadata(p: SeoSoftwarePage): Metadata {
  const url = `${SITE_URL}/${p.slug}`;
  return {
    metadataBase: new URL(SITE_URL),
    title: { absolute: p.title },
    description: p.description,
    keywords: p.keywords,
    alternates: { canonical: `/${p.slug}` },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: "th_TH",
      url,
      siteName: "PetFlow",
      title: p.title,
      description: p.description,
      images: [{ url: "/og-petflow.jpg", width: 1200, height: 630, alt: "PetFlow ระบบจัดการร้านสัตว์เลี้ยง" }],
    },
    twitter: { card: "summary_large_image", title: p.title, description: p.description, images: ["/og-petflow.jpg"] },
  };
}

function jsonLd(p: SeoSoftwarePage) {
  const url = `${SITE_URL}/${p.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORG_ID,
        name: "PetFlow",
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/petflow-logo.png`,
      },
      {
        "@type": "SoftwareApplication",
        "@id": SOFTWARE_ID,
        name: "PetFlow",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, iOS, Android",
        inLanguage: "th",
        url: `${SITE_URL}/`,
        publisher: { "@id": ORG_ID },
        description: "ระบบจัดการร้านสัตว์เลี้ยงครบวงจร สำหรับร้านอาบน้ำ-ตัดขน โรงแรมสัตว์เลี้ยง และรับฝากหมาแมว ทำงานบน LINE",
        image: `${SITE_URL}/og-petflow.jpg`,
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "THB",
          lowPrice: Math.min(...PRICE_PLANS.map((x) => x.month)),
          highPrice: Math.max(...PRICE_PLANS.map((x) => x.month)),
          offerCount: PRICE_PLANS.length,
          offers: PRICE_PLANS.map((x) => ({
            "@type": "Offer",
            name: x.name,
            price: x.month,
            priceCurrency: "THB",
            url: `${SITE_URL}/shop-questions`,
          })),
        },
      },
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: p.title,
        description: p.description,
        inLanguage: "th",
        about: { "@id": SOFTWARE_ID },
        primaryImageOfPage: `${SITE_URL}${p.hero.src}`,
        breadcrumb: { "@id": `${url}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "PetFlow", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: p.navLabel, item: url },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: p.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
}

function Shot({ s, className, eager }: { s: SeoShot; className?: string; eager?: boolean }) {
  const isPhone = s.h > s.w * 1.5;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ไฟล์ webp ย่อขนาดไว้แล้ว ไม่ต้องผ่าน next/image
    <img
      src={s.src}
      alt={s.alt}
      width={s.w}
      height={s.h}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={`${isPhone ? "sw-shot-phone" : s.w > 1000 ? "sw-shot-desk" : "sw-shot-card"} ${className || ""}`}
    />
  );
}

export function SoftwareLanding({ page }: { page: SeoSoftwarePage }) {
  const others = SEO_SOFTWARE_PAGES.filter((x) => x.slug !== page.slug);
  return (
    <div className="sw">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(page)).replace(/</g, "\\u003c") }}
      />

      <nav className="sw-top" aria-label="เมนูหลัก">
        <div className="sw-wrap sw-top-in">
          <a href="/" className="sw-top-logo" aria-label="PetFlow หน้าแรก">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/petflow-logo.png" alt="PetFlow" width={1100} height={355} />
          </a>
          <a href={CTA_HREF} className="sw-btn sw-btn-sm">
            สนใจใช้ระบบ
          </a>
        </div>
      </nav>

      <header className="sw-hero">
        <div className="sw-wrap sw-hero-grid">
          <div>
            <ol className="sw-crumb" aria-label="ตำแหน่งหน้า">
              <li>
                <a href="/">PetFlow</a>
              </li>
              <li aria-current="page">{page.navLabel}</li>
            </ol>
            <span className="sw-eyebrow">{page.eyebrow}</span>
            <h1 className="sw-h1">{page.h1}</h1>
            <p className="sw-lead">{page.lead}</p>
            <div className="sw-cta-row">
              <a href={CTA_HREF} className="sw-btn">
                🐾 สนใจใช้ PetFlow
              </a>
              <a href="/#screens" className="sw-btn sw-btn-ghost">
                ดูหน้าจอจริงทั้งหมด
              </a>
            </div>
            <p className="sw-note">ใช้งานบนเว็บ เปิดได้จากมือถือ แท็บเล็ต คอม · ลูกค้าใช้ผ่าน LINE ไม่ต้องโหลดแอป</p>
          </div>
          <figure className="sw-hero-fig">
            <Shot s={page.hero} eager />
            {page.heroSide && <Shot s={page.heroSide} className="sw-hero-side" eager />}
            <figcaption>ภาพหน้าจอจริงจากระบบ PetFlow (ข้อมูลตัวอย่าง)</figcaption>
          </figure>
        </div>
      </header>

      <section className="sw-section sw-pains">
        <div className="sw-wrap">
          <h2 className="sw-h2">ปัญหาที่ร้านเจอทุกวัน ถ้ายังไม่มีระบบ</h2>
          <ul className="sw-pain-list">
            {page.pains.map((t) => (
              <li key={t}>😩 {t}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sw-section">
        <div className="sw-wrap">
          <h2 className="sw-h2">{page.featuresTitle}</h2>
          <div className="sw-features">
            {page.features.map((f) => (
              <article key={f.title} className="sw-feature">
                {f.shot && (
                  <div className="sw-feature-shot">
                    <Shot s={f.shot} />
                  </div>
                )}
                <h3>
                  <span aria-hidden>{f.icon}</span> {f.title}
                </h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {page.articles.map((a) => (
        <section key={a.h2} className="sw-section sw-article">
          <div className="sw-wrap sw-narrow">
            <h2 className="sw-h2">{a.h2}</h2>
            {a.paras.map((t) => (
              <p key={t}>{t}</p>
            ))}
            {a.list && (
              <ul className="sw-check">
                {a.list.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ))}

      <section className="sw-section">
        <div className="sw-wrap sw-narrow">
          <h2 className="sw-h2">คำถามที่พบบ่อย</h2>
          <div className="sw-faq">
            {page.faq.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="sw-section sw-related">
        <div className="sw-wrap">
          <h2 className="sw-h2">PetFlow ทำอะไรได้อีก</h2>
          <div className="sw-related-grid">
            {others.map((o) => (
              <a key={o.slug} href={`/${o.slug}`} className="sw-related-card">
                <span aria-hidden className="sw-related-ic">
                  {o.navIcon}
                </span>
                <b>{o.navLabel}</b>
                <span>{o.title.split(" | ")[0]}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <footer className="sw-close">
        <div className="sw-wrap">
          <h2>ให้ร้านทำงานแทนคุณ ตั้งแต่วันแรกที่ใช้</h2>
          <p>บอกข้อมูลร้านคร่าว ๆ แล้วทีมงานจะติดต่อกลับเพื่อพาดูระบบและช่วยตั้งค่าให้</p>
          <a href={CTA_HREF} className="sw-btn">
            🐾 สนใจใช้ PetFlow
          </a>
          <nav className="sw-foot-links" aria-label="หน้าอื่นของ PetFlow">
            <a href="/">ระบบจัดการร้านสัตว์เลี้ยง PetFlow</a>
            {SEO_SOFTWARE_PAGES.map((o) => (
              <a key={o.slug} href={`/${o.slug}`}>
                {o.title.split(" | ")[0]}
              </a>
            ))}
            <a href="/product">ฟีเจอร์ทั้งหมด</a>
          </nav>
          <p className="sw-foot">© PetFlow — Pet Business Operating System</p>
        </div>
      </footer>
    </div>
  );
}
