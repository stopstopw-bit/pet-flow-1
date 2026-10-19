import { BUSINESS } from "@/lib/business";

/** แถวปุ่มโซเชียล — ใช้ซ้ำได้ทั้ง hero และ footer ทุกหน้า */
export function SocialLinks({ size = "sm" }: { size?: "sm" | "md" }) {
  const pad = size === "md" ? "px-4 py-2.5 text-xs" : "px-3.5 py-2 text-[11px]";
  const base = `inline-flex items-center gap-1.5 rounded-full font-bold shadow-petflow-sm transition hover:-translate-y-0.5 ${pad}`;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
      {BUSINESS.social.facebook ? (
        <a
          href={BUSINESS.social.facebook}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Facebook PetFlow"
          className={`${base} border border-[#1877F2]/30 bg-[#1877F2]/10 text-[#1560c2] hover:border-[#1877F2]`}
        >
          <span className="text-sm leading-none">📘</span> Facebook
        </a>
      ) : null}
      {BUSINESS.social.instagram ? (
        <a
          href={BUSINESS.social.instagram}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram PetFlow"
          className={`${base} border border-[#E1306C]/30 bg-[#E1306C]/10 text-[#c2255c] hover:border-[#E1306C]`}
        >
          <span className="text-sm leading-none">📸</span> Instagram
        </a>
      ) : null}
      {BUSINESS.social.tiktok ? (
        <a
          href={BUSINESS.social.tiktok}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="TikTok PetFlow"
          className={`${base} border border-petflow-line bg-card text-petflow-chocolate hover:border-brown-soft`}
        >
          <span className="text-sm leading-none">🎵</span> TikTok
        </a>
      ) : null}
      {BUSINESS.social.line ? (
        <a
          href={BUSINESS.social.line}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="LINE PetFlow"
          className={`${base} border border-[#06C755]/40 bg-[#06C755]/10 text-[#06934a] hover:border-[#06C755]`}
        >
          <span className="text-sm leading-none">💬</span> LINE
        </a>
      ) : null}
    </div>
  );
}

/** Footer กลาง — โซเชียล + ที่อยู่/เบอร์ (NAP) + ลิงก์แผนที่ โผล่ทุกหน้าสาธารณะ */
export default function SiteFooter() {
  return (
    <footer className="mt-14 border-t border-petflow-line pt-6 text-center text-[11px] leading-relaxed text-brown-faint">
      <div className="mb-4 flex justify-center">
        <SocialLinks size="md" />
      </div>
      {BUSINESS.maps ? (
        <a
          href={BUSINESS.maps}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 inline-flex items-center gap-1.5 rounded-petflow-sm border border-latte/40 bg-latte/10 px-5 py-2.5 text-xs font-extrabold text-latte-deep shadow-petflow-sm transition hover:-translate-y-0.5 hover:border-latte"
        >
          🗺️ เปิด Google Maps นำทางมาที่ร้าน
        </a>
      ) : null}
      <p className="font-bold text-brown-soft">
        {BUSINESS.name} — โรงแรมแมว รับฝากแมว อาบน้ำแมว
      </p>
      {BUSINESS.address ? <p>{BUSINESS.address}</p> : null}
      {BUSINESS.phones.length || BUSINESS.lineOa ? (
        <p>
          {[
            BUSINESS.phones.length ? `โทร ${BUSINESS.phones.join(" / ")}` : "",
            BUSINESS.lineOa ? `LINE ${BUSINESS.lineOa}` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
    </footer>
  );
}
