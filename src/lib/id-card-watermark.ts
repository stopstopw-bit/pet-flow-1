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
    const angle = -Math.atan2(h, w);
    const font = (px: number) =>
      `bold ${px}px "Sukhumvit Set", "Noto Sans Thai", "Thonburi", Tahoma, sans-serif`;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // ข้อความจางซ้ำทั่วรูป
    const small = Math.max(14, Math.round(diag / 45));
    ctx.font = font(small);
    ctx.fillStyle = "rgba(200, 30, 30, 0.22)";
    for (let y = -diag / 2; y <= diag / 2; y += small * 3.2) {
      ctx.fillText(`${ID_CARD_PURPOSE}   ${ID_CARD_PURPOSE}`, 0, y);
    }

    // เส้นคู่ขีดทับ + ข้อความหลักตรงกลาง
    let big = Math.max(18, Math.round(diag / 26));
    ctx.font = font(big);
    while (ctx.measureText(ID_CARD_PURPOSE).width > diag * 0.7 && big > 12) {
      big -= 1;
      ctx.font = font(big);
    }
    const gap = big * 1.1;
    ctx.strokeStyle = "rgba(200, 20, 20, 0.85)";
    ctx.lineWidth = Math.max(2, big / 7);
    for (const y of [-gap, gap]) {
      ctx.beginPath();
      ctx.moveTo(-diag / 2, y);
      ctx.lineTo(diag / 2, y);
      ctx.stroke();
    }
    ctx.lineWidth = Math.max(3, big / 4);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.strokeText(ID_CARD_PURPOSE, 0, 0);
    ctx.fillStyle = "rgba(200, 20, 20, 0.95)";
    ctx.fillText(ID_CARD_PURPOSE, 0, 0);
    ctx.restore();

    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
