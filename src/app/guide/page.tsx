import type { Metadata } from "next";
import { GUIDE_TOPICS } from "@/lib/guide-content";
import { TopicCard } from "./GuideBits";

export const metadata: Metadata = {
  title: "วิธีใช้งานหลังร้าน",
  description: "สอนใช้งานหลังร้านทีละขั้น พร้อมภาพหน้าจอจริง สำหรับเจ้าของร้านและพนักงาน",
  robots: { index: false, follow: false },
};

const STAFF = GUIDE_TOPICS.filter((t) => t.who === "staff");
const OWNER = GUIDE_TOPICS.filter((t) => t.who === "owner");
const TOTAL_STEPS = GUIDE_TOPICS.reduce((n, t) => n + t.steps.length, 0);

export default function GuidePage() {
  return (
    <main className="min-h-screen bg-cream pb-24">
      {/* หัวหน้า: แมวทักทาย + บอกว่ามีกี่บท */}
      <header className="relative overflow-hidden bg-gradient-to-br from-honey/70 via-cream to-lavender px-5 pb-10 pt-8">
        <span aria-hidden className="pointer-events-none absolute -right-6 top-6 text-[120px] opacity-15">
          🐾
        </span>
        <span aria-hidden className="pointer-events-none absolute -left-4 bottom-0 text-6xl opacity-10">
          🐾
        </span>
        <div className="relative mx-auto max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-card/80 px-3 py-1 text-[11px] font-bold text-latte-deep shadow-petflow-sm">
            📖 คู่มือใช้งาน
          </span>
          <div className="mt-4 flex items-end gap-3">
            <span className="animate-[guide-bob_2.4s_ease-in-out_infinite] text-6xl drop-shadow-sm sm:text-7xl">
              🐱
            </span>
            <p className="relative mb-6 rounded-2xl rounded-bl-sm bg-card px-4 py-2.5 text-sm font-bold text-brown shadow-petflow-sm">
              สวัสดีค่า! มาเรียนใช้หลังร้านกันทีละขั้นนะ
            </p>
          </div>
          <h1 className="mt-2 text-[28px] font-extrabold leading-tight text-petflow-chocolate sm:text-4xl">
            ใช้หลังร้านเป็นใน 1 วัน
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-brown-soft">
            แต่ละบทสอนงานหนึ่งเรื่อง มีภาพหน้าจอจริงและวงสีชมพูบอกว่าต้องแตะตรงไหน อ่านจากมือถือได้สบาย
            ไม่ต้องจำ เปิดดูตอนทำงานได้เลย
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-card px-3 py-1.5 text-brown shadow-petflow-sm">
              🎓 {GUIDE_TOPICS.length} บทเรียน
            </span>
            <span className="rounded-full bg-card px-3 py-1.5 text-brown shadow-petflow-sm">
              👣 {TOTAL_STEPS} ขั้นตอน
            </span>
            <span className="rounded-full bg-card px-3 py-1.5 text-brown shadow-petflow-sm">
              📱 ภาพหน้าจอจริง
            </span>
          </div>
          <nav aria-label="เลือกกลุ่มบทเรียน" className="mt-6 grid grid-cols-2 gap-2 sm:max-w-md">
            <a
              href="#staff"
              className="rounded-petflow-sm bg-petflow-chocolate px-3 py-3 text-center text-sm font-extrabold text-card shadow-petflow-sm active:scale-95"
            >
              🧑‍🔧 ฉันเป็นพนักงาน
            </a>
            <a
              href="#owner"
              className="rounded-petflow-sm bg-card px-3 py-3 text-center text-sm font-extrabold text-petflow-chocolate shadow-petflow-sm ring-1 ring-petflow-line active:scale-95"
            >
              👑 ฉันเป็นเจ้าของร้าน
            </a>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4">
        <section id="staff" className="scroll-mt-4 pt-8">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-petflow-chocolate">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-mint text-base">
              🧑‍🔧
            </span>
            งานประจำวัน · ทุกคนในร้าน
          </h2>
          <p className="mb-4 mt-1 text-xs text-brown-faint">
            เรียงตามงานจริงในหนึ่งวัน เริ่มจากบทที่ 1 แล้วไล่ไปได้เลย
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {STAFF.map((t) => (
              <TopicCard key={t.slug} t={t} />
            ))}
          </div>
        </section>

        <section id="owner" className="scroll-mt-4 pt-10">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-petflow-chocolate">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber text-base">
              👑
            </span>
            เงิน ลูกค้า และตั้งค่า · เจ้าของร้าน
          </h2>
          <p className="mb-4 mt-1 text-xs text-brown-faint">
            เมนูเหล่านี้เจ้าของร้านเลือกได้ว่าจะให้พนักงานคนไหนเห็น (ดูบทที่ 13)
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {OWNER.map((t) => (
              <TopicCard key={t.slug} t={t} />
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-petflow bg-gradient-to-br from-sky to-lavender p-5 text-center shadow-petflow-sm">
          <p className="text-3xl">💬</p>
          <p className="mt-1 text-sm font-extrabold text-brown">ทำตามแล้วยังติดอยู่?</p>
          <p className="mt-1 text-xs leading-relaxed text-brown-soft">
            ถามเจ้าของร้านหรือทีมดูแลระบบได้เลย บอกชื่อบทและขั้นตอนที่ติด จะช่วยได้เร็วขึ้น
          </p>
        </section>
      </div>
    </main>
  );
}
