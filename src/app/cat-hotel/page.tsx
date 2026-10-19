import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BUSINESS, ROOMS } from "@/lib/business";
import SiteFooter from "@/components/SiteFooter";

/** หน้าห้องพักโรงแรมแมว — รูปจริง + ราคา ครบทุกห้อง (SEO service page) */

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://petflow.example.com";
const PHONE_MAIN = BUSINESS.phones[0] || "";
const LINE_URL = "https://line.me/R/ti/p/@petflow";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "ห้องพักแมว ราคาเริ่ม 350.-/คืน รูปห้องจริงทุกห้อง | PetFlow โรงแรมแมว บางนา เทพารักษ์",
  description:
    "ดูห้องพักโรงแรมแมว PetFlow ครบทุกแบบพร้อมรูปจริงและราคา — MiNi Meow 350.-, Mid Cozy 450.-, Catflix & Chill วิวหน้าต่าง 750.- มีห้องคู่สำหรับบ้านแมวหลายตัว ห้องแอร์ทุกห้อง CCTV รายงานทุกวัน ย่านบางนา เทพารักษ์",
  keywords: [
    "ห้องพักแมว ราคา",
    "โรงแรมแมว ราคา",
    "โรงแรมแมว บางนา ราคา",
    "รับฝากแมว เทพารักษ์ ราคา",
    "ฝากแมว ราคาถูก สมุทรปราการ",
  ],
  alternates: { canonical: "/cat-hotel" },
  openGraph: {
    type: "website",
    locale: "th_TH",
    url: `${SITE_URL}/cat-hotel`,
    siteName: "PetFlow",
    title: "ห้องพักแมว PetFlow — รูปจริง + ราคา เริ่ม 350.-/คืน",
    description: "ห้องแอร์ส่วนตัวทุกห้อง มีห้องเดี่ยว ห้องคู่ ห้องวิวหน้าต่าง CCTV ดูน้องได้",
    images: [{ url: "/catalog/rooms/cat-hotel-bangna-catflix.jpg", width: 800, height: 800, alt: "ห้องพักแมว PetFlow" }],
  },
  robots: { index: true, follow: true },
};

function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "ห้องพักโรงแรมแมว PetFlow",
    description: "ห้องพักแมวห้องแอร์ส่วนตัว ย่านบางนา เทพารักษ์ สมุทรปราการ",
    image: `${SITE_URL}/catalog/rooms/cat-hotel-bangna-catflix.jpg`,
    offers: ROOMS.map((r) => ({
      "@type": "Offer",
      name: `ห้อง ${r.name}`,
      price: String(r.price),
      priceCurrency: "THB",
      availability: "https://schema.org/InStock",
    })),
  };
}

const singles = ROOMS.filter((r) => r.count);
const duos = ROOMS.filter((r) => !r.count);

function RoomCard({ room }: { room: (typeof ROOMS)[number] }) {
  return (
    <div className="overflow-hidden rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
      <a href={room.image} target="_blank" rel="noopener noreferrer">
        <Image
          src={room.image}
          alt={`ห้องพักแมว ${room.name} โรงแรมแมว PetFlow บางนา เทพารักษ์`}
          width={800}
          height={800}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="h-auto w-full transition hover:scale-[1.02]"
        />
      </a>
      <div className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-base font-extrabold text-petflow-chocolate">
              {room.name}
              <span className="ml-1.5 rounded-full bg-latte/20 px-2 py-0.5 text-[10px] font-bold text-latte-deep">
                {room.size}
              </span>
            </p>
            {room.subtitle && (
              <p className="text-[11px] font-bold text-brown-faint">{room.subtitle.th}</p>
            )}
          </div>
          <p className="shrink-0 text-right text-xl font-extrabold text-latte-deep">
            {room.price.toLocaleString()}
            <span className="block text-[10px] font-bold text-brown-faint">บาท/คืน</span>
          </p>
        </div>
        <p className="mt-2 text-xs font-bold text-brown">
          🐱 {room.cats.th} <span className="font-normal text-brown-soft">({room.extra.th})</span>
        </p>
        {room.dimensions && (
          <p className="mt-1 text-[11px] text-brown-soft">📐 ขนาด {room.dimensions.th}</p>
        )}
        {room.config && (
          <p className="mt-1 text-[11px] text-brown-soft">🚪 {room.config.th}</p>
        )}
        <ul className="mt-3 space-y-1 border-t border-petflow-line pt-3 text-[11px] text-brown-soft">
          {room.amenities.th.map((a) => (
            <li key={a}>✓ {a}</li>
          ))}
        </ul>
        {room.note && (
          <p className="mt-3 rounded-petflow-sm bg-honey/15 px-3 py-2 text-[10px] leading-relaxed text-brown-soft">
            💡 {room.note.th}
          </p>
        )}
      </div>
    </div>
  );
}

export default function CatHotelPage() {
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
        🏨 ห้องพักแมวทุกแบบ + ราคา
        <span className="block text-lg text-latte-deep md:text-xl">
          รูปห้องจริง เริ่มต้นคืนละ 350.-
        </span>
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-brown-soft">
        ทุกห้องเป็นห้องแอร์ส่วนตัว พี่เลี้ยงทำความสะอาดทุกวัน พาเล่นวันละ 2 รอบ
        พร้อมรายงานรูป-วิดีโอเช้า-เย็นทาง LINE — พัก 3 คืนขึ้นไปฟรีทรายแมว
      </p>

      <h2 className="mt-8 text-lg font-extrabold text-petflow-chocolate">ห้องเดี่ยว</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {singles.map((r) => (
          <RoomCard key={r.id} room={r} />
        ))}
      </div>

      <h2 className="mt-10 text-lg font-extrabold text-petflow-chocolate">
        ห้องเชื่อม — สำหรับบ้านแมวหลายตัว
      </h2>
      <p className="mt-1 text-xs text-brown-soft">
        เปิดประตูเชื่อมให้พี่น้องแมวอยู่ด้วยกันได้ พื้นที่กว้างขึ้นเท่าตัว
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {duos.map((r) => (
          <RoomCard key={r.id} room={r} />
        ))}
      </div>

      {/* CTA */}
      <div className="mt-12 rounded-petflow bg-gradient-to-br from-honey/35 via-card to-latte/15 p-6 text-center shadow-petflow md:p-8">
        <h2 className="text-lg font-extrabold text-petflow-chocolate">
          เช็กห้องว่าง / จองคิวเลย 🧡
        </h2>
        <p className="mt-1 text-xs text-brown-soft">
          แจ้งวันที่ + จำนวนแมว ทางไลน์ เดี๋ยวพี่เลี้ยงเช็กห้องว่างให้ทันทีค่ะ
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
          <Link href="/cat-bath" className="font-bold text-latte-deep underline">
            🛁 ดูเมนู-ราคาอาบน้ำแมว →
          </Link>
        </p>
      </div>

      <SiteFooter />
    </main>
  );
}
