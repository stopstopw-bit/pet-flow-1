/**
 * ฝังข้อความ "ขีดฆ่า" ลงในรูปบัตรประชาชนก่อนส่งขึ้นระบบ (ทำบนเครื่องลูกค้า ไฟล์ต้นฉบับไม่เคยออกจากมือถือ)
 * แบบเดียวกับสำเนาบัตรที่เซ็นกำกับ: เส้นคู่ขีดทแยงพาดกลางบัตร + ข้อความวัตถุประสงค์ระหว่างเส้น
 * และข้อความจางๆ ซ้ำทั่วรูป กันเอารูปไปตัดใช้ที่อื่น
 */
/** ข้อความขีดทับบัตร — ใส่ชื่อร้านที่ลูกค้าลงทะเบียนด้วย (ไม่ใช่ชื่อระบบ) */
export function idCardPurpose(shopName?: string) {
  const shop = shopName?.trim();
  return `ใช้สำหรับลงทะเบียนเข้าพัก${shop ? `ที่ ${shop}` : "ที่ร้าน"} เพื่อฝากน้องเข้าพักเท่านั้น`;
}

export async function watermarkIdCard(file: File, maxSize = 1400, shopName?: string): Promise<string> {
  const ID_CARD_PURPOSE = idCardPurpose(shopName);
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("เปิดไฟล์รูปนี้ไม่ได้ — ลองเลือกรูปอื่น (jpg/png) ดูนะคะ"));
      el.src = objectUrl;
    });
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("แปลงรูปไม่สำเร็จ");
    ctx.drawImage(img, 0, 0, w, h);

    const diag = Math.sqrt(w * w + h * h);
    // เอียงไม่เกิน 30° — รูปแนวตั้ง (แคปหน้าจอ/ถ่ายบัตรแนวตั้ง) เดิมเอียงตามเส้นทแยงมุมจนชันมาก
    // ข้อความหลักเลยล้นขอบรูปขาดหาย
    const tilt = Math.min(Math.atan2(h, w), Math.PI / 6);
    const font = (px: number, weight = "bold") =>
      `${weight} ${px}px "Sukhumvit Set", "Noto Sans Thai", "Thonburi", Tahoma, sans-serif`;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-tilt);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // ข้อความจางซ้ำทั่วรูป — จางมากและตัวบาง ให้ยังอ่านตัวหนังสือบนบัตรได้
    const small = Math.max(14, Math.round(diag / 45));
    ctx.font = font(small, "normal");
    ctx.fillStyle = "rgba(200, 30, 30, 0.1)";
    for (let y = -diag / 2; y <= diag / 2; y += small * 3.2) {
      ctx.fillText(Array(4).fill(ID_CARD_PURPOSE).join("   "), 0, y);
    }

    // ข้อความหลัก — ลองทั้งบรรทัดเดียวและแบ่ง 2 บรรทัด เลือกแบบที่ตัวใหญ่สุดที่ยังอยู่ในรูปครบ
    const { lines, size: big } = fitPurposeText(ctx, font, ID_CARD_PURPOSE, w, h, tilt);
    const lineH = big * 1.25;
    const gap = (lines.length * lineH) / 2 + big * 0.35;
    // ข้อความหลักและเส้นขีดคู่แบบโปร่ง (ไม่มีขอบขาว) เห็นตัวหนังสือบนบัตรลอดผ่านได้
    ctx.font = font(big, "600");
    ctx.strokeStyle = "rgba(200, 20, 20, 0.45)";
    ctx.lineWidth = Math.max(1.5, big / 12);
    for (const y of [-gap, gap]) {
      ctx.beginPath();
      ctx.moveTo(-diag / 2, y);
      ctx.lineTo(diag / 2, y);
      ctx.stroke();
    }
    lines.forEach((line, i) => {
      const y = (i - (lines.length - 1) / 2) * lineH;
      ctx.fillStyle = "rgba(200, 20, 20, 0.5)";
      ctx.fillText(line, 0, y);
    });
    ctx.restore();

    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** แบ่งข้อความเป็น 2 บรรทัดตรงคำว่า "เพื่อ" (หรือช่องว่างใกล้กลางที่สุด) */
function splitPurpose(text: string): string[] {
  const at = text.indexOf(" เพื่อ");
  if (at > 0) return [text.slice(0, at), text.slice(at + 1)];
  const spaces = [...text.matchAll(/ /g)].map((m) => m.index ?? 0);
  if (spaces.length === 0) return [text];
  const mid = spaces.reduce((a, b) => (Math.abs(b - text.length / 2) < Math.abs(a - text.length / 2) ? b : a));
  return [text.slice(0, mid), text.slice(mid + 1)];
}

/**
 * หาขนาดตัวอักษรใหญ่สุดที่กรอบข้อความ (รวมเส้นขีดคู่) เมื่อเอียง tilt แล้วยังอยู่ในรูปทั้งหมด
 * ใช้ราว 2 ใน 3 ของรูป (เจ้าของร้านอยากได้ขนาดกลางๆ ไม่ใหญ่เต็มรูป)
 */
function fitPurposeText(
  ctx: CanvasRenderingContext2D,
  font: (px: number) => string,
  text: string,
  w: number,
  h: number,
  tilt: number
): { lines: string[]; size: number } {
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const maxW = w * 0.68;
  const maxH = h * 0.68;
  const start = Math.max(18, Math.round(Math.sqrt(w * w + h * h) / 22));
  let best = { lines: [text], size: 0 };
  for (const lines of [[text], splitPurpose(text)]) {
    for (let px = start; px >= 10; px -= 1) {
      ctx.font = font(px);
      const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const boxH = lines.length * px * 1.25 + px * 0.7 + Math.max(2, px / 7);
      if (boxW * cos + boxH * sin <= maxW && boxW * sin + boxH * cos <= maxH) {
        if (px > best.size) best = { lines, size: px };
        break;
      }
    }
  }
  return best.size ? best : { lines: splitPurpose(text), size: 10 };
}
