import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BUSINESS } from "@/lib/business";
import SiteFooter from "@/components/SiteFooter";

/** หน้าอาบน้ำแมว — เมนู + ราคาเต็ม (SEO service page) · ร้านไม่มีบริการตัดขน */

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://petflow.example.com";
const PHONE_MAIN = BUSINESS.phones[0] || "";
const LINE_URL = "https://line.me/R/ti/p/@petflow";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "อาบน้ำแมว ราคาเริ่ม 400.- แชมพูพรีเมียม | PetFlow บางนา เทพารักษ์",
  description:
    "อาบน้ำแมวโดยพี่เลี้ยงใจเย็น จับนุ่มนวล แชมพูเกรดพรีเมียม เกรดแมวประกวด — อาบน้ำ-เป่าขนเริ่ม 400.- ขจัดคราบมัน PetFlow Premium อาบยับยั้งเชื้อรา รวมตัดเล็บ เช็ดหู บริการแบบ Private รับทีละบ้าน ย่านบางนา เทพารักษ์ สมุทรปราการ",
  keywords: [
    "อาบน้ำแมว บางนา",
    "อาบน้ำแมว เทพารักษ์",
    "อาบน้ำแมว สมุทรปราการ",
    "อาบน้ำแมว ราคา",
    "ร้านอาบน้ำแมว ใกล้ฉัน",
    "กรูมมิ่งแมว บางนา",
  ],
  alternates: { canonical: "/cat-bath" },
  openGraph: {
    type: "website",
    locale: "th_TH",
    url: `${SITE_URL}/cat-bath`,
    siteName: "PetFlow",
    title: "อาบน้ำแมว PetFlow — เมนู + ราคา เริ่ม 400.-",
    description: "แชมพูพรีเมียม พี่เลี้ยงใจเย็น บริการ Private รับน้องแมวทีละบ้าน",
    images: [{ url: "/catalog/grooming/grooming-menu.jpg", width: 853, height: 1280, alt: "เมนูอาบน้ำแมว PetFlow" }],
  },
  robots: { index: true, follow: true },
};

const PRICE_ROWS = [
  ["แมวไทย", "400 / 450 / 550", "500 / 600 / 700"],
  ["แมวพันธุ์ขนสั้น", "450 / 500 / 700", "600 / 750 / 900"],
  ["แมวพันธุ์ขนยาว", "550 / 650 / 850", "700 / 850 / 1,050"],
  ["แรคดอล/เมนคูน/ขนหนาฟู", "650 / 850 / 1,050", "800 / 1,050 / 1,250"],
];

function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "อาบน้ำแมว PetFlow",
    serviceType: "Cat bathing & grooming spa",
    description:
      "อาบน้ำแมวแชมพูพรีเมียม เป่าแห้งสนิท รวมตัดเล็บ เช็ดหู-ตา ไถขนก้นและอุ้งเท้า บริการแบบ Private",
    provider: { "@type": "LocalBusiness", name: "PetFlow", telephone: "+6621234567" },
    areaServed: ["บางนา", "เทพารักษ์", "หนามแดง", "ศรีนครินทร์", "พัฒนาการ", "เมกาบางนา", "สมุทรปราการ"],
    offers: [
      { "@type": "Offer", name: "อาบน้ำ-เป่าขน", price: "400", priceCurrency: "THB" },
      { "@type": "Offer", name: "อาบน้ำ+ขจัดคราบมัน", price: "500", priceCurrency: "THB" },
      { "@type": "Offer", name: "PetFlow Premium", price: "700", priceCurrency: "THB" },
      { "@type": "Offer", name: "อาบน้ำยับยั้งเชื้อรา Malaseb", price: "700", priceCurrency: "THB" },
    ],
  };
}

export default function CatBathPage() {
  return (
    <main className="mx-auto max-w-5xl px-5 pb-16 pt-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()) }}
      />
      <Link href="/" className="text-xs font-bold text-brown-soft">
        ← หน้าแรก PetFlow
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold leading-snug text-petflow-chocolate md:text-3xl">
        🛁 อาบน้ำแมว — เมนู + ราคา
        <span className="block text-lg text-latte-deep md:text-xl">
          แชมพูเกรดพรีเมียม เกรดแมวประกวด เริ่มต้น 400.-
        </span>
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-brown-soft">
        อาบโดยพี่เลี้ยงที่จับแมวนุ่มนวล ใจเย็นกับน้องขี้กลัวเป็นพิเศษ เป่าแห้งสนิทถึงขนชั้นใน
        ราคารวม<b className="text-petflow-chocolate">ตัดเล็บ เช็ดหู-ตา ไถขนก้นและอุ้งเท้า</b>แล้ว
        เป็นบริการแบบ Private รับน้องแมวทีละบ้าน
        <span className="mt-1 block font-bold">
          หมายเหตุ: ทางร้านไม่มีบริการตัดขนนะคะ 🙏
        </span>
      </p>

      {/* ตารางราคาแบบอ่านง่าย (ให้ Google อ่านได้เป็นข้อความ) */}
      <div className="mt-8 overflow-x-auto rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="bg-honey/25 text-petflow-chocolate">
              <th className="px-4 py-3 font-extrabold">สายพันธุ์</th>
              <th className="px-4 py-3 font-extrabold">
                อาบน้ำ–เป่าขน
                <span className="block text-[10px] font-bold text-brown-soft">
                  ลูกแมว / M / L (บาท)
                </span>
              </th>
              <th className="px-4 py-3 font-extrabold">
                อาบน้ำ+ขจัดคราบมัน
                <span className="block text-[10px] font-bold text-brown-soft">
                  ลูกแมว / M / L (บาท)
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {PRICE_ROWS.map(([breed, bath, degrease]) => (
              <tr key={breed} className="border-t border-petflow-line">
                <td className="px-4 py-3 font-bold text-brown">{breed}</td>
                <td className="px-4 py-3 text-brown-soft">{bath}</td>
                <td className="px-4 py-3 text-brown-soft">{degrease}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-brown-soft">
        ขนาดตัว: ลูกแมวไม่เกิน 2 กก. · M มากกว่า 2–6 กก. · L มากกว่า 6 กก. · แมวเกิน 8 กก. ประเมินก่อนบริการ
        — โปรแกรมดูแลพิเศษ: PetFlow Premium และยับยั้งเชื้อรา (แชมพู Malaseb) เริ่ม 700.- (ดูเมนูเต็มด้านล่าง)
      </p>

      {/* เมนูฉบับเต็ม (รูป) */}
      <h2 className="mt-10 text-lg font-extrabold text-petflow-chocolate">
        📋 เมนูฉบับเต็ม — แตะเพื่อขยาย
      </h2>
      <div className="mx-auto mt-4 grid max-w-md gap-4">
        {[
          [
            "/catalog/grooming/grooming-menu.jpg",
            "เมนูอาบน้ำแมว PetFlow Grooming: อาบน้ำ-เป่าขน อาบน้ำ+ขจัดคราบมัน PetFlow Premium และยับยั้งเชื้อรา ทุกสายพันธุ์",
          ],
        ].map(([src, alt]) => (
          <a
            key={src}
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-petflow border border-petflow-line bg-card shadow-petflow-sm transition hover:-translate-y-0.5 hover:shadow-petflow"
          >
            <Image
              src={src}
              alt={alt}
              width={853}
              height={1280}
              sizes="(max-width: 640px) 100vw, 448px"
              className="h-auto w-full"
            />
          </a>
        ))}
      </div>

      {/* ก่อนพามาอาบ */}
      <h2 className="mt-10 text-lg font-extrabold text-petflow-chocolate">
        🐾 ก่อนพาน้องมาอาบน้ำ + การจองคิว
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {[
          ["/info/bath-info.jpg", "ข้อมูลก่อนพาน้องแมวมาอาบน้ำ งดอาหาร 2-3 ชั่วโมง แจ้งโรคประจำตัว พามาในกระเป๋าหรือกรง"],
          ["/info/bath-booking.jpg", "เงื่อนไขการจองคิวอาบน้ำแมว มัดจำ 200 บาท นำไปหักค่าอาบน้ำ"],
        ].map(([src, alt]) => (
          <a
            key={src}
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-petflow border border-petflow-line bg-card shadow-petflow-sm transition hover:-translate-y-0.5 hover:shadow-petflow"
          >
            <Image
              src={src}
              alt={alt}
              width={900}
              height={900}
              sizes="(max-width: 640px) 100vw, 50vw"
              className="h-auto w-full"
            />
          </a>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-12 rounded-petflow bg-gradient-to-br from-honey/35 via-card to-latte/15 p-6 text-center shadow-petflow md:p-8">
        <h2 className="text-lg font-extrabold text-petflow-chocolate">จองคิวอาบน้ำเลย 🧡</h2>
        <p className="mt-1 text-xs text-brown-soft">
          แจ้งพันธุ์ + น้ำหนักน้องทางไลน์ เดี๋ยวพี่เลี้ยงแจ้งราคาและคิวว่างให้ทันทีค่ะ (มัดจำ 200.- หักจากค่าอาบน้ำ)
        </p>
        <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
          <a
            href={LINE_URL}
            className="rounded-petflow-sm bg-[#06C755] px-6 py-3.5 text-sm font-extrabold text-white shadow-petflow-sm"
          >
            💬 LINE @petflow
          </a>
          {PHONE_MAIN ? (
            <a
              href={`tel:${PHONE_MAIN.replace(/-/g, "")}`}
              className="rounded-petflow-sm bg-latte-deep px-6 py-3.5 text-sm font-extrabold text-white shadow-petflow-sm"
            >
              📞 {PHONE_MAIN}
            </a>
          ) : null}
        </div>
        <p className="mt-4 text-[11px]">
          <Link href="/cat-hotel" className="font-bold text-latte-deep underline">
            🏨 ดูห้องพักแมว + ราคา →
          </Link>
        </p>
      </div>

      <SiteFooter />
    </main>
  );
}
