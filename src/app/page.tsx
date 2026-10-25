import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BUSINESS, ROOMS } from "@/lib/business";
import { BLOG_POSTS } from "@/lib/blog-posts";
import SiteFooter, { SocialLinks } from "@/components/SiteFooter";

/**
 * หน้าเว็บหลัก (SEO Landing Page) — โรงแรมแมว บางนา เทพารักษ์ สมุทรปราการ
 * เป้าหมาย: ติดอันดับ Google คำค้นท้องถิ่น เช่น "โรงแรมแมว บางนา", "รับฝากแมว เทพารักษ์"
 * หน้านี้เป็น Server Component ล้วน (static) — บอทอ่านเนื้อหาได้ครบ
 * หมายเหตุ: ร้านมีบริการ "อาบน้ำแมว" เท่านั้น ไม่มีบริการตัดขน
 */

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://petflow.example.com";
const PHONE_MAIN = BUSINESS.phones[0] || "";
const LINE_URL = "https://line.me/R/ti/p/@petflow";
const MAPS_URL = BUSINESS.maps;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title:
    "โรงแรมแมว บางนา–เทพารักษ์ | รับฝากแมว อาบน้ำแมว | PetFlow สมุทรปราการ",
  description:
    "PetFlow โรงแรมแมวย่านบางนา เทพารักษ์ หนามแดง ใกล้เมกาบางนา ศรีนครินทร์ — รับฝากแมวห้องแอร์ มี CCTV ดูน้องได้ 24 ชม. รายงานเช้า-เย็นทุกวัน พร้อมบริการอาบน้ำแมวโดยพี่เลี้ยงใจดี เริ่มคืนละ 350.-",
  keywords: [
    "โรงแรมแมว บางนา",
    "โรงแรมแมว เทพารักษ์",
    "โรงแรมแมว สมุทรปราการ",
    "รับฝากแมว บางนา",
    "ฝากแมว เทพารักษ์",
    "ฝากเลี้ยงแมว ใกล้ฉัน",
    "อาบน้ำแมว บางนา",
    "อาบน้ำแมว เทพารักษ์",
    "อาบน้ำแมว สมุทรปราการ",
    "โรงแรมแมว เมกาบางนา",
    "โรงแรมแมว ศรีนครินทร์",
    "โรงแรมแมว หนามแดง",
    "โรงแรมแมว พัฒนาการ",
    "รับฝากแมว พัฒนาการ",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "th_TH",
    url: SITE_URL,
    siteName: "PetFlow",
    title: "PetFlow — โรงแรมแมว & อาบน้ำแมว บางนา เทพารักษ์",
    description:
      "รับฝากแมวห้องแอร์ CCTV 24 ชม. รายงานเช้า-เย็น + อาบน้ำแมว ย่านบางนา เทพารักษ์ ใกล้เมกาบางนา เริ่มคืนละ 350.-",
    images: [{ url: "/info/welcome.jpg", width: 1200, height: 1200, alt: "PetFlow โรงแรมแมว บางนา" }],
  },
  robots: { index: true, follow: true },
};

const AREAS = [
  "บางนา",
  "เทพารักษ์",
  "หนามแดง",
  "ศรีนครินทร์",
  "เมกาบางนา",
  "พัฒนาการ",
  "แบริ่ง",
  "ลาซาล",
  "อุดมสุข",
  "สำโรง",
  "บางพลี",
  "บางแก้ว",
  "สมุทรปราการ",
];

const FAQS = [
  {
    q: "โรงแรมแมว PetFlow อยู่ตรงไหน?",
    a: "ร้านอยู่ย่านหนามแดง–เทพารักษ์ สมุทรปราการ ใกล้บางนาและเมกาบางนา เดินทางสะดวกจากศรีนครินทร์ แบริ่ง ลาซาล อุดมสุข และสำโรง มีที่จอดรถหน้าร้าน",
  },
  {
    q: "ราคาฝากแมวเริ่มต้นเท่าไหร่?",
    a: "ห้องพักแมวเริ่มต้นคืนละ 350 บาท (ห้อง MiNi Meow) มีหลายขนาดจนถึงห้องวิวหน้าต่าง Catflix & Chill คืนละ 750 บาท ทุกห้องเป็นห้องแอร์ พร้อมพี่เลี้ยงดูแลและทำความสะอาดทุกวัน",
  },
  {
    q: "ดูน้องแมวระหว่างฝากได้ไหม?",
    a: "ได้ค่ะ มีกล้อง CCTV ให้เจ้าของดูน้องได้ และพี่เลี้ยงส่งรูป-รายงานพฤติกรรมน้องทาง LINE เช้า-เย็นทุกวัน",
  },
  {
    q: "รับอาบน้ำแมวไหม ราคาเท่าไหร่?",
    a: "รับค่ะ อาบน้ำ-เป่าขนเริ่มต้น 400 บาท (ตามพันธุ์และขนาด) มีโปรแกรมขจัดคราบมัน และ PetFlow Premium ครบเซ็ต โดยพี่เลี้ยงที่จับแมวนุ่มนวล ใจเย็นกับน้องขี้กลัวเป็นพิเศษ (ทางร้านไม่มีบริการตัดขนนะคะ)",
  },
  {
    q: "ต้องเตรียมอะไรมาบ้างตอนฝากแมว?",
    a: "เตรียมอาหารที่น้องกินประจำ ยาประจำตัว (ถ้ามี) และสมุดวัคซีน น้องควรได้รับวัคซีนพื้นฐานและหยดยาป้องกันเห็บหมัดก่อนเข้าพัก พัก 3 คืนขึ้นไปมีทรายแมวฟรี",
  },
  {
    q: "จองคิวยังไง?",
    a: "ทักไลน์ @petflow หรือโทร 02-123-4567 ได้เลยค่ะ จองผ่านระบบสมาชิกในไลน์ได้ตลอด 24 ชม. มีระบบสะสมแต้มและคูปองส่วนลดสำหรับสมาชิก",
  },
];

/** Schema.org JSON-LD — ให้ Google เข้าใจว่าเป็นธุรกิจท้องถิ่น (พิกัด+เบอร์+เวลา) */
function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LocalBusiness",
        "@id": `${SITE_URL}#business`,
        name: "PetFlow โรงแรมแมว อาบน้ำแมว",
        alternateName: "PetFlow",
        description:
          "โรงแรมแมวและอาบน้ำแมว ย่านบางนา เทพารักษ์ หนามแดง สมุทรปราการ ห้องแอร์ CCTV รายงานเช้า-เย็น",
        url: SITE_URL,
        telephone: "+6621234567",
        priceRange: "฿350-฿1,450",
        image: `${SITE_URL}/logo.jpg`,
        address: {
          "@type": "PostalAddress",
          addressLocality: "หนามแดง เทพารักษ์",
          addressRegion: "สมุทรปราการ",
          addressCountry: "TH",
        },
        geo: { "@type": "GeoCoordinates", latitude: 13.7563, longitude: 100.5018 },
        hasMap: MAPS_URL,
        sameAs: [
          MAPS_URL,
          BUSINESS.social.facebook,
          BUSINESS.social.instagram,
          BUSINESS.social.tiktok,
        ].filter(Boolean),
        areaServed: AREAS.map((a) => ({ "@type": "Place", name: a })),
        makesOffer: [
          { "@type": "Offer", name: "รับฝากแมว ห้องพักแมวห้องแอร์", price: "350", priceCurrency: "THB" },
          { "@type": "Offer", name: "อาบน้ำแมว เป่าขน", price: "400", priceCurrency: "THB" },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQS.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
}

const singleRooms = ROOMS.filter((r) => r.count).slice(0, 3);

/** การ์ดรูปอินโฟกราฟิก — คลิกเปิดดูรูปเต็มได้ */
function InfoCard({
  src,
  alt,
  caption,
  priority,
}: {
  src: string;
  alt: string;
  caption?: string;
  priority?: boolean;
}) {
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-petflow border border-petflow-line bg-card shadow-petflow-sm transition hover:-translate-y-0.5 hover:shadow-petflow"
    >
      <Image
        src={src}
        alt={alt}
        width={800}
        height={900}
        priority={priority}
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        className="h-auto w-full"
      />
      {caption && (
        <p className="px-3 py-2 text-center text-[11px] font-bold text-brown-soft">
          {caption} <span className="text-latte-deep">· แตะเพื่อขยาย</span>
        </p>
      )}
    </a>
  );
}

export default function HomePage() {
  return (
    <main className="overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()) }}
      />

      {/* ── Hero ── */}
      <header className="bg-gradient-to-b from-honey/30 via-paper to-transparent">
        <div className="mx-auto grid max-w-5xl items-center gap-8 px-5 pb-12 pt-10 md:grid-cols-2 md:pb-16">
          <div className="text-center md:text-left">
            <Image
              src="/logo.jpg"
              alt="PetFlow โรงแรมแมว บางนา เทพารักษ์"
              width={88}
              height={88}
              className="mx-auto rounded-full border-4 border-honey/50 shadow-petflow md:mx-0"
              priority
            />
            <h1 className="mt-5 text-[26px] font-extrabold leading-tight text-petflow-chocolate sm:text-3xl md:text-4xl">
              โรงแรมแมว & อาบน้ำแมว
              <span className="mt-1 block text-latte-deep">
                บางนา · เทพารักษ์ · สมุทรปราการ
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-brown-soft md:mx-0 md:text-[15px]">
              PetFlow รับฝากแมว<b className="text-petflow-chocolate">ห้องแอร์ส่วนตัว</b>ใกล้เมกาบางนา
              ศรีนครินทร์ หนามแดง — มี CCTV ดูน้องได้ตลอด
              พี่เลี้ยงรายงานรูปเช้า-เย็นทุกวัน พร้อมบริการอาบน้ำแมวโดยพี่เลี้ยงใจดี
              <b className="text-latte-deep"> เริ่มต้นคืนละ 350.-</b>
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center md:justify-start">
              <a
                href={LINE_URL}
                className="rounded-petflow-sm bg-[#06C755] px-6 py-3.5 text-center text-sm font-extrabold text-white shadow-petflow-sm active:scale-[0.98]"
              >
                💬 จองผ่าน LINE @petflow
              </a>
              {PHONE_MAIN ? (
                <a
                  href={`tel:${PHONE_MAIN.replace(/-/g, "")}`}
                  className="rounded-petflow-sm bg-latte-deep px-6 py-3.5 text-center text-sm font-extrabold text-white shadow-petflow-sm active:scale-[0.98]"
                >
                  📞 โทร {PHONE_MAIN}
                </a>
              ) : null}
              {MAPS_URL ? (
                <a
                  href={MAPS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-petflow-sm border-2 border-latte-deep bg-card px-6 py-3 text-center text-sm font-extrabold text-latte-deep shadow-petflow-sm active:scale-[0.98]"
                >
                  🗺️ Google Maps นำทางมาร้าน
                </a>
              ) : null}
            </div>
            <div className="mt-5">
              <SocialLinks />
            </div>
          </div>
          <div className="mx-auto w-full max-w-sm md:max-w-none">
            <Image
              src="/info/welcome.jpg"
              alt="ยินดีต้อนรับสู่ PetFlow โรงแรมแมวระบบปิด ดูแลใกล้ชิด อบอุ่นเหมือนอยู่บ้าน"
              width={900}
              height={900}
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
              className="h-auto w-full rounded-petflow border border-honey/40 shadow-petflow"
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 pb-16">
        {/* ── จุดเด่น ── */}
        <section className="mt-2">
          <h2 className="text-center text-xl font-extrabold text-petflow-chocolate">
            ทำไมทาสแมวย่านบางนา–เทพารักษ์ ไว้ใจ PetFlow 🧡
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["📹", "CCTV ดูน้องได้", "เปิดดูน้องแมวระหว่างฝากได้ อุ่นใจตลอดทริป"],
              ["🧊", "ห้องแอร์ทุกห้อง", "สะอาด เย็นสบาย พี่เลี้ยงทำความสะอาดทุกวัน"],
              ["📸", "รายงานเช้า-เย็น", "ส่งรูป+อัปเดตพฤติกรรมน้องทาง LINE ทุกวัน"],
              ["🐾", "พาเล่นวันละ 2 รอบ", "น้องได้ยืดเส้น เดินเล่น ไม่เครียด"],
            ].map(([icon, title, desc]) => (
              <div
                key={title}
                className="rounded-petflow border border-petflow-line bg-card p-4 text-center shadow-petflow-sm"
              >
                <div className="text-3xl">{icon}</div>
                <p className="mt-2 text-sm font-extrabold text-petflow-chocolate">{title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-brown-soft">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── ห้องพัก + ราคา ── */}
        <section className="mt-14">
          <h2 className="text-center text-xl font-extrabold text-petflow-chocolate">
            🏨 ห้องพักแมว เริ่มต้นคืนละ 350.-
          </h2>
          <p className="mt-2 text-center text-xs text-brown-soft">
            ทั้งหมด 13 ห้อง · พัก 3 คืนขึ้นไปฟรีทรายแมว · พัก 7 คืนขึ้นไปฟรีกล้อง CCTV ส่วนตัว
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {singleRooms.map((r, i) => (
              <div
                key={r.id}
                className={`relative rounded-petflow border bg-card p-5 shadow-petflow-sm ${
                  i === 0 ? "border-honey/60" : "border-petflow-line"
                }`}
              >
                {i === 0 && (
                  <span className="absolute -top-2.5 left-4 rounded-full bg-honey px-3 py-0.5 text-[10px] font-extrabold text-petflow-chocolate">
                    ⭐ เริ่มต้น
                  </span>
                )}
                <p className="text-base font-extrabold text-petflow-chocolate">{r.name}</p>
                <p className="mt-0.5 text-xs text-brown-soft">{r.cats.th}</p>
                <p className="mt-3 text-2xl font-extrabold text-latte-deep">
                  {r.price.toLocaleString()}
                  <span className="text-xs font-bold text-brown-faint"> บาท/คืน</span>
                </p>
                <ul className="mt-3 space-y-1.5 text-[11px] text-brown-soft">
                  {r.amenities.th.slice(0, 3).map((a) => (
                    <li key={a}>✓ {a}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-brown-soft">
            มีห้องคู่/ห้องเชื่อมสำหรับบ้านที่มีแมวหลายตัว — สอบถามได้ทางไลน์เลยค่ะ
          </p>
          <div className="mt-4 text-center">
            <Link
              href="/cat-hotel"
              className="inline-block rounded-petflow-sm bg-latte/25 px-6 py-3 text-sm font-extrabold text-petflow-chocolate shadow-petflow-sm"
            >
              📷 ดูรูปห้องจริง + ราคาทุกห้อง →
            </Link>
          </div>
        </section>

        {/* ── จองยังไง + เวลาทำการ ── */}
        <section className="mt-14">
          <h2 className="text-center text-xl font-extrabold text-petflow-chocolate">
            📅 จองง่ายๆ 4 ขั้นตอน + เวลาให้บริการ
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <InfoCard
              src="/info/booking-steps.jpg"
              alt="วิธีจองห้องพักโรงแรมแมว PetFlow ง่ายๆ 4 ขั้นตอน แจ้งวัน ส่งข้อมูลน้องแมว ชำระมัดจำ รับ Booking Confirmation"
              caption="วิธีจองห้องพัก 4 ขั้นตอน"
            />
            <InfoCard
              src="/info/hours.jpg"
              alt="เวลาให้บริการ PetFlow 09:00-19:00 ทุกวัน เช็กอิน 09:00-18:00 เช็กเอาต์ 09:00-19:00"
              caption="เวลาให้บริการ · เช็กอิน-เช็กเอาต์"
            />
          </div>
        </section>

        {/* ── อาบน้ำแมว ── */}
        <section className="mt-14">
          <h2 className="text-center text-xl font-extrabold text-petflow-chocolate">
            🛁 อาบน้ำแมว (Cat Bathing)
          </h2>
          <p className="mt-2 text-center text-xs text-brown-soft">
            โดยพี่เลี้ยงที่จับแมวนุ่มนวล ใจเย็นกับน้องขี้กลัวเป็นพิเศษ
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              ["อาบน้ำ – เป่าขน", "เริ่ม 400.-", "อาบสะอาด เป่าแห้งสนิท ตัดเล็บ เช็ดหู"],
              ["อาบน้ำ + ขจัดคราบมัน", "เริ่ม 500.-", "สำหรับน้องขนมัน คราบเหนียว ขนกลับมาฟู"],
              ["PetFlow Premium", "เริ่ม 700.-", "จัดเต็มครบเซ็ต บำรุงขน แนะนำสำหรับขนยาว"],
            ].map(([name, price, desc]) => (
              <div
                key={name}
                className="rounded-petflow border border-petflow-line bg-card p-5 text-center shadow-petflow-sm"
              >
                <p className="text-sm font-extrabold text-petflow-chocolate">{name}</p>
                <p className="mt-2 text-xl font-extrabold text-latte-deep">{price}</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-brown-soft">{desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <InfoCard
              src="/info/bath-info.jpg"
              alt="ข้อมูลก่อนพาน้องแมวมาอาบน้ำที่ PetFlow งดอาหารก่อนอาบ 2-3 ชั่วโมง แจ้งโรคประจำตัว พามาในกระเป๋าหรือกรง"
              caption="ข้อมูลก่อนพาน้องมาอาบน้ำ"
            />
            <InfoCard
              src="/info/bath-booking.jpg"
              alt="เงื่อนไขการจองคิวอาบน้ำแมว PetFlow มัดจำ 200 บาท นำไปหักค่าอาบน้ำ"
              caption="เงื่อนไขการจองคิวอาบน้ำ"
            />
          </div>
          <p className="mt-4 text-center text-xs text-brown-soft">
            ราคาตามพันธุ์และน้ำหนัก · ถามประวัติน้องก่อนอาบทุกครั้ง เพื่อความปลอดภัยของน้องขี้กลัว/มีโรคประจำตัว
            <br />
            <span className="font-bold">หมายเหตุ: ทางร้านไม่มีบริการตัดขนนะคะ 🙏</span>
          </p>
          <div className="mt-4 text-center">
            <Link
              href="/cat-bath"
              className="inline-block rounded-petflow-sm bg-latte/25 px-6 py-3 text-sm font-extrabold text-petflow-chocolate shadow-petflow-sm"
            >
              📋 ดูเมนู-ราคาอาบน้ำทุกสายพันธุ์ →
            </Link>
          </div>
        </section>

        {/* ── เตรียมตัวก่อนเข้าพัก ── */}
        <section className="mt-14">
          <h2 className="text-center text-xl font-extrabold text-petflow-chocolate">
            🧳 เตรียมตัวก่อนพาน้องเข้าพัก
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoCard
              src="/info/prepare-checkin.jpg"
              alt="สิ่งที่ต้องเตรียมมาวันเข้าพักโรงแรมแมว สมุดวัคซีน อาหาร ทรายแมว ของใช้ประจำตัว กระเป๋าหรือกรง"
              caption="สิ่งที่ต้องเตรียมมาวันเข้าพัก"
            />
            <InfoCard
              src="/info/before-stay.jpg"
              alt="ก่อนเข้าพักโรงแรมแมว วัคซีนครบตามกำหนด หยดยาเห็บหมัดภายใน 1 เดือน ส่งหลักฐานก่อนเข้าพัก"
              caption="วัคซีน + ยาเห็บหมัด ก่อนเข้าพัก"
            />
            <InfoCard
              src="/info/stay-rules.jpg"
              alt="เงื่อนไขสำคัญในการเข้าพักโรงแรมแมว PetFlow รับเฉพาะแมวเลี้ยงระบบปิด สุขภาพแข็งแรง อัปเดตรูปทุกวัน"
              caption="เงื่อนไขสำคัญในการเข้าพัก"
            />
          </div>
        </section>

        {/* ── บริการรับส่ง ── */}
        <section className="mt-14">
          <div className="grid items-center gap-6 rounded-petflow bg-card p-5 shadow-petflow-sm md:grid-cols-2 md:p-8">
            <div className="text-center md:text-left">
              <h2 className="text-xl font-extrabold text-petflow-chocolate">
                🚗 มีบริการรับ-ส่งน้องแมวถึงบ้าน
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-brown-soft">
                ไม่สะดวกพาน้องมาเอง? เรามีบริการรับ-ส่งด้วยรถยนต์ส่วนตัว
                ไม่รวมกับแมวบ้านอื่น ทำความสะอาดฆ่าเชื้อทุกครั้งหลังใช้งาน
              </p>
              <ul className="mt-4 space-y-2 text-left text-sm text-brown">
                <li>✓ ไม่เกิน 1 กิโล — รับ-ส่ง<b className="text-latte-deep">ฟรี</b></li>
                <li>✓ ไม่เกิน 5 กิโล — เที่ยวละ 100 บาท</li>
                <li>✓ ไม่เกิน 10 กิโล — เที่ยวละ 150 บาท</li>
                <li>✓ เกิน 10 กิโล — เที่ยวละ 150 บาท + กิโลละ 10 บาท</li>
              </ul>
              <p className="mt-2 text-xs text-brown-soft">รับมาร้าน 1 เที่ยว · ไป-กลับ (รับ + ส่งกลับบ้าน) คิด 2 เที่ยว</p>
            </div>
            <div className="mx-auto w-full max-w-sm">
              <InfoCard
                src="/info/transport.jpg"
                alt="บริการรับส่งน้องแมว PetFlow เดินทางโดยรถยนต์ส่วนตัว คิดค่าบริการตามระยะทาง"
              />
            </div>
          </div>
        </section>

        {/* ── สมาชิก / สะสมแต้ม ── */}
        <section className="mt-14">
          <h2 className="text-center text-xl font-extrabold text-petflow-chocolate">
            🎁 เป็นสมาชิก ยิ่งพัก ยิ่งคุ้ม
          </h2>
          <p className="mt-2 text-center text-xs text-brown-soft">
            สะสมแต้มทุกการใช้บริการ (100 บาท = 1 คะแนน) แลกส่วนลดสูงสุด 500.- · สมาชิกใหม่รับส่วนลด 5%
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <InfoCard
              src="/info/rewards.jpg"
              alt="สะสมคะแนนแลกรางวัล PetFlow ครบ 5 คะแนนรับขนมแมวเลีย แลกส่วนลดสูงสุด 500 บาท"
              caption="สะสมคะแนน แลกส่วนลด/ของรางวัล"
            />
            <InfoCard
              src="/info/new-member.jpg"
              alt="สมาชิกใหม่ PetFlow รับส่วนลด 5% เมื่อสมัครสมาชิกและรีวิวบน Google Maps"
              caption="สมาชิกใหม่ รับส่วนลด 5%"
            />
          </div>
          <div className="mt-5 text-center">
            <Link
              href="/app"
              className="inline-block rounded-petflow-sm bg-honey/50 px-6 py-3 text-sm font-extrabold text-petflow-chocolate shadow-petflow-sm"
            >
              🐱 สมัครสมาชิก / เข้าระบบสมาชิก →
            </Link>
          </div>
        </section>

        {/* ── พื้นที่ให้บริการ ── */}
        <section className="mt-14 rounded-petflow bg-card p-6 text-center shadow-petflow-sm">
          <h2 className="text-xl font-extrabold text-petflow-chocolate">
            📍 รับฝากแมวใกล้คุณ — พื้นที่ให้บริการ
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-brown-soft">
            ร้านตั้งอยู่ย่านหนามแดง–เทพารักษ์ เดินทางสะดวกจาก
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {AREAS.map((a) => (
              <span
                key={a}
                className="rounded-full bg-paper px-3.5 py-1.5 text-xs font-bold text-brown-soft"
              >
                {a}
              </span>
            ))}
          </div>
          {MAPS_URL ? (
            <a
              href={MAPS_URL}
              className="mt-5 inline-block rounded-petflow-sm bg-honey/40 px-6 py-3 text-sm font-extrabold text-petflow-chocolate"
            >
              🗺️ นำทางด้วย Google Maps
            </a>
          ) : null}
        </section>

        {/* ── FAQ ── */}
        <section className="mt-14">
          <h2 className="text-center text-xl font-extrabold text-petflow-chocolate">
            ❓ คำถามที่พบบ่อย
          </h2>
          <div className="mt-6 space-y-3">
            {FAQS.map((f) => (
              <details
                key={f.q}
                className="group rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm"
              >
                <summary className="cursor-pointer list-none text-sm font-extrabold text-petflow-chocolate">
                  <span className="mr-1 inline-block transition group-open:rotate-90">▸</span>
                  {f.q}
                </summary>
                <p className="mt-2 pl-4 text-sm leading-relaxed text-brown-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── บทความ ── */}
        {BLOG_POSTS.length > 0 && (
        <section className="mt-14">
          <h2 className="text-center text-xl font-extrabold text-petflow-chocolate">
            📚 บทความน่ารู้จากพี่เลี้ยง {BUSINESS.name}
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {BLOG_POSTS.slice(0, 3).map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm transition hover:border-honey/60"
              >
                <p className="text-2xl">{post.emoji}</p>
                <p className="mt-2 text-sm font-extrabold leading-snug text-petflow-chocolate">
                  {post.title}
                </p>
                <p className="mt-2 text-[11px] font-bold text-latte-deep">
                  อ่านต่อ ({post.readMinutes} นาที) →
                </p>
              </Link>
            ))}
          </div>
          <p className="mt-4 text-center">
            <Link href="/blog" className="text-xs font-bold text-latte-deep underline">
              ดูบทความทั้งหมด →
            </Link>
          </p>
        </section>
        )}

        {/* ── CTA ท้าย ── */}
        <section className="mt-14 rounded-petflow bg-gradient-to-br from-honey/35 via-card to-latte/15 p-6 text-center shadow-petflow md:p-10">
          <h2 className="text-xl font-extrabold text-petflow-chocolate">
            พร้อมดูแลน้องแมวของคุณแล้ววันนี้ 🧡
          </h2>
          <p className="mt-2 text-xs text-brown-soft">
            จองคิวฝากแมว/อาบน้ำ ทักไลน์ได้เลย ตอบไวช่วงเวลาทำการ 09:00–19:00 ทุกวัน
          </p>
          <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
            <a
              href={LINE_URL}
              className="rounded-petflow-sm bg-[#06C755] px-6 py-3.5 text-sm font-extrabold text-white shadow-petflow-sm active:scale-[0.98]"
            >
              💬 LINE @petflow
            </a>
            {PHONE_MAIN ? (
              <a
                href={`tel:${PHONE_MAIN.replace(/-/g, "")}`}
                className="rounded-petflow-sm bg-latte-deep px-6 py-3.5 text-sm font-extrabold text-white shadow-petflow-sm active:scale-[0.98]"
              >
                📞 {PHONE_MAIN}
              </a>
            ) : null}
          </div>
          <Link href="/app" className="mt-5 inline-block text-xs font-bold text-latte-deep underline">
            เป็นสมาชิกอยู่แล้ว? เข้าระบบสมาชิก (สะสมแต้ม/จองคิว) →
          </Link>
        </section>

        {/* ── Footer / NAP ── */}
        <SiteFooter />
      </div>
    </main>
  );
}
