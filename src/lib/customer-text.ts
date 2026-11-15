/**
 * ตัวอักษรหน้าลูกค้า (/app) ที่ร้านตั้งเองได้ในหลังบ้าน — ฟอนต์ / ขนาด / สี
 * ไม่ตั้ง = เหมือนเดิมทุกอย่าง (ร้านเดิมไม่เปลี่ยน ต้องเปิดเองรายร้าน)
 * ลูกค้ายังกดปุ่ม "กก" ปรับขนาดต่อเครื่องได้เหมือนเดิม (ซ้อนจากค่าของร้าน)
 */
import { darkenHex, hexToRgbTriplet, isValidHex } from "./color-utils";

export type CustomerTextConfig = {
  /** id จาก CUSTOMER_FONTS — ไม่ตั้ง/"default" = ฟอนต์ระบบเดิม */
  font?: string;
  /** id จาก CUSTOMER_TEXT_SIZES — ไม่ตั้ง/"normal" = ขนาดเดิม */
  size?: string;
  /** สีตัวอักษรเนื้อหา (hex) — ตัวรอง/ตัวจาง ไล่อ่อนลงจากสีนี้นิดเดียว */
  color?: string;
};

export const CUSTOMER_FONTS: { id: string; label: string; family?: string; google?: string }[] = [
  { id: "default", label: "ค่าเริ่มต้น (ไม่มีหัว)" },
  {
    id: "plex-looped",
    label: "IBM Plex Looped (มีหัว ทันสมัย)",
    family: "'IBM Plex Sans Thai Looped'",
    google: "IBM+Plex+Sans+Thai+Looped:wght@400;500;600;700",
  },
  {
    id: "noto-looped",
    label: "Noto Looped (มีหัว อ่านง่าย)",
    family: "'Noto Sans Thai Looped'",
    google: "Noto+Sans+Thai+Looped:wght@400;500;600;700;800",
  },
  { id: "sarabun", label: "Sarabun (มีหัว แบบทางการ)", family: "'Sarabun'", google: "Sarabun:wght@400;500;600;700;800" },
  { id: "krub", label: "Krub (มีหัว โค้งมน ทันสมัย)", family: "'Krub'", google: "Krub:wght@400;500;600;700" },
  { id: "bai-jamjuree", label: "Bai Jamjuree (มีหัว สะอาดตา)", family: "'Bai Jamjuree'", google: "Bai+Jamjuree:wght@400;500;600;700" },
  { id: "k2d", label: "K2D (มีหัว ทันสมัย)", family: "'K2D'", google: "K2D:wght@400;500;600;700" },
  { id: "niramit", label: "Niramit (มีหัว อ่านง่าย)", family: "'Niramit'", google: "Niramit:wght@400;500;600;700" },
  { id: "koho", label: "KoHo (มีหัว กลม น่ารัก)", family: "'KoHo'", google: "KoHo:wght@400;500;600;700" },
  { id: "mali", label: "Mali (มีหัว ลายมือ น่ารัก)", family: "'Mali'", google: "Mali:wght@400;500;600;700" },
  { id: "anuphan", label: "Anuphan (ไม่มีหัว ทันสมัย)", family: "'Anuphan'", google: "Anuphan:wght@400;500;600;700" },
];

/** ขนาดตัวเล็กในหน้า (px) ต่อระดับ — ปุ่ม/หัวข้อใหญ่ไม่แตะ ขยายเฉพาะตัวเล็กที่อ่านยาก */
export const CUSTOMER_TEXT_SIZES: { id: string; label: string; px?: Record<string, number> }[] = [
  { id: "normal", label: "ปกติ" },
  { id: "large", label: "ใหญ่ขึ้น", px: { sm: 15, xs: 13.5, "12": 13, "11": 13, "10": 12, "9": 11.5 } },
  { id: "xlarge", label: "ใหญ่มาก", px: { sm: 16, xs: 15, "12": 14.5, "11": 14.5, "10": 13.5, "9": 13 } },
];

export function customerFont(c?: CustomerTextConfig) {
  return CUSTOMER_FONTS.find((f) => f.id === c?.font && f.family);
}

/** CSS ที่ใส่ในหน้าลูกค้า (ครอบด้วย .customer-text) — ไม่มีอะไรตั้งไว้ = สตริงว่าง */
export function customerTextCss(c?: CustomerTextConfig): string {
  if (!c) return "";
  const out: string[] = [];
  const font = customerFont(c);
  if (font) {
    out.push(
      `.customer-text{font-family:${font.family},"Sukhumvit Set",-apple-system,"Leelawadee UI","Noto Sans Thai",sans-serif}`
    );
  }
  const size = CUSTOMER_TEXT_SIZES.find((s) => s.id === c.size)?.px;
  if (size) {
    const rule = (sel: string, px: number) => `.customer-text ${sel}{font-size:${px}px;line-height:1.5}`;
    out.push(rule(".text-sm", size.sm), rule(".text-xs", size.xs));
    out.push(rule(".text-\\[12px\\]", size["12"]), rule(".text-\\[11px\\]", size["11"]), rule(".text-\\[10px\\]", size["10"]));
    out.push(rule(".text-\\[9px\\], .customer-text .text-\\[9\\.5px\\], .customer-text .text-\\[8px\\]", size["9"]));
  }
  if (c.color && isValidHex(c.color)) {
    out.push(
      `.customer-text{--brown-rgb:${hexToRgbTriplet(c.color)};--brown-soft-rgb:${hexToRgbTriplet(
        darkenHex(c.color, -0.1)
      )};--brown-faint-rgb:${hexToRgbTriplet(darkenHex(c.color, -0.18))}}`
    );
  }
  return out.join("\n");
}
