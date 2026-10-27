import type { SiteConfig } from "./config-types";

/**
 * รูปโลโก้ที่จะโชว์ในหน้าร้าน — โลโก้ที่ร้านอัปโหลดก่อนเสมอ
 * โลโก้ PetFlow (/logo.jpg) ใช้ได้เฉพาะร้าน PetFlow เอง ร้านอื่นที่ยังไม่มีโลโก้ = null (โชว์ตัวอักษรแรกของชื่อร้านแทน)
 * เดิม fallback เป็น /logo.jpg ทุกร้าน เลยเห็นโลโก้ PetFlow แวบขึ้นมาก่อนโลโก้ร้านจริง
 */
export function shopLogoSrc(config: SiteConfig): string | null {
  const logo = config.branding?.logoUrl?.trim();
  if (logo) return logo;
  return config.business?.name?.trim().toLowerCase() === "petflow" ? "/logo.jpg" : null;
}

/** โลโก้ที่อยู่นอกเว็บเรา (Supabase Storage/data:) ต้องไม่ผ่านตัวย่อรูปของ Next — ไม่งั้นโดนบล็อกแล้วรูปแตกเป็น "?" */
export function isExternalLogo(src: string): boolean {
  return !src.startsWith("/");
}
