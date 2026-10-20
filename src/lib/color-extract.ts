"use client";

function toHex(n: number) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** แปลง RGB → HSL (h เป็นองศา 0-360, s/l เป็น 0-1) */
function hsl(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** ความสว่างสัมพัทธ์ (WCAG) — ใช้เช็คว่าตัวหนังสือขาวบนปุ่มอ่านออก */
function luminance(hex: string) {
  const chan = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(1) + 0.7152 * chan(3) + 0.0722 * chan(5);
}

export type LogoPalette = {
  primary: string;
  accent: string;
  heading: string;
  background: string;
  surface: string;
  text: string;
  backgroundGradientFrom: string;
  backgroundGradientTo: string;
};

/**
 * หาสีแบรนด์ที่เด่นที่สุดในโลโก้ (ทำในเบราว์เซอร์ล้วนๆ ผ่าน canvas) แล้วสร้างชุดสีทั้งหน้าจากโทนนั้น —
 * ปุ่มเข้มพอให้ตัวหนังสือขาวอ่านออก, ไฮไลท์/พื้นหลังเป็นเฉดอ่อนของสีเดียวกัน, ตัวอักษรเกือบดำ
 * ข้ามสีขาว/ดำ/เทา (พื้นหลังโลโก้หรือขอบภาพแคปจอ) ไม่งั้นได้ปุ่มสีเทาซีดๆ
 * คืนค่า null ถ้าดึงรูปไม่ได้ (เช่น URL ต่างโดเมนที่ไม่อนุญาต CORS) หรือโลโก้ไม่มีสีสดเลย
 */
export async function extractLogoColors(imageUrl: string): Promise<LogoPalette | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("โหลดรูปไม่ได้"));
      el.src = imageUrl;
    });

    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    // จับกลุ่มสีที่ใกล้เคียงกัน (ปัดแต่ละช่อง R/G/B ลงกล่องละ 24) แล้วนับความถี่ — เฉพาะสีที่มีสีสันจริง
    const buckets = new Map<string, { r: number; g: number; b: number; count: number; score: number }>();
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (data[i + 3] < 200) continue; // โปร่งใส — ข้าม
      const { s, l } = hsl(r, g, b);
      if (l < 0.12 || l > 0.85 || s < 0.25) continue; // ขาว/ดำ/เทา/พาสเทลจางมาก (มักเป็นพื้นหลังหรือขอบเบลอ) — ไม่ใช่สีแบรนด์
      const key = `${Math.round(r / 24)}_${Math.round(g / 24)}_${Math.round(b / 24)}`;
      const cur = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0, score: 0 };
      cur.r += r;
      cur.g += g;
      cur.b += b;
      cur.count += 1;
      cur.score += 0.4 + s * 1.6; // สีสดได้น้ำหนักมากกว่า
      buckets.set(key, cur);
    }

    let best: { r: number; g: number; b: number; weight: number } | null = null;
    for (const c of buckets.values()) {
      const cand = { r: c.r / c.count, g: c.g / c.count, b: c.b / c.count, weight: c.count * c.score };
      if (!best || cand.weight > best.weight) best = cand;
    }
    // ต้องมีพิกเซลสีสดพอสมควร (ไม่ใช่จุดเล็กๆ ไม่กี่จุด) ถึงจะถือเป็นสีแบรนด์
    if (!best || best.weight < size * size * 0.01) return null;

    const { h, s } = hsl(best.r, best.g, best.b);
    const sat = Math.min(Math.max(s, 0.35), 0.6);

    // ปุ่ม: ไล่ให้เข้มลงจนตัวหนังสือขาวมีคอนทราสต์ ≥ 4:1
    let pl = 0.42;
    let primary = hslToHex(h, sat, pl);
    while ((1.05 / (luminance(primary) + 0.05)) < 4 && pl > 0.18) {
      pl -= 0.02;
      primary = hslToHex(h, sat, pl);
    }

    const background = hslToHex(h, Math.min(sat, 0.45), 0.97);
    const accent = hslToHex(h, Math.min(sat, 0.5), 0.84);
    return {
      primary,
      accent,
      heading: hslToHex(h, Math.min(sat, 0.45), 0.2),
      background,
      surface: "#ffffff",
      text: hslToHex(h, 0.15, 0.17),
      // ปิดพื้นหลังไล่เฉดเดิม (อาจเป็นสีชุดเก่า) ให้เห็นสีใหม่ชัดๆ
      backgroundGradientFrom: "",
      backgroundGradientTo: "",
    };
  } catch {
    return null;
  }
}
