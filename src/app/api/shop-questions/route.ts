import { NextRequest, NextResponse } from "next/server";
import { saveShopIntake } from "@/lib/shop-intake-store";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** คำตอบทั้งชุดรวมหมายเหตุ ไม่ควรเกินนี้ — กันคนยัดข้อมูลก้อนใหญ่เข้าฐานข้อมูล */
const MAX_BYTES = 200_000;

/**
 * รับคำตอบแบบสอบถามเจ้าของร้านใหม่ (หน้า /shop-questions) — เปิดสาธารณะ
 * คนตอบยังไม่มีบัญชีอะไรเลย จึงคุมด้วยขนาดข้อมูล + จำนวนครั้งต่อ IP แทน
 */
export async function POST(req: NextRequest) {
  // คนตอบจริงกดส่งไม่กี่ครั้ง (ส่ง + แก้แล้วส่งซ้ำ) — 20 ครั้ง/ชั่วโมงเหลือเฟือ
  const hit = rateLimit(`shop-questions:${clientKey(req)}`, 20, 60 * 60_000);
  if (!hit.ok) {
    return NextResponse.json({ error: "ส่งถี่เกินไป รอสักครู่แล้วลองใหม่นะคะ" }, { status: 429 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ error: "คำตอบยาวเกินไป" }, { status: 413 });
  }
  let body: { id?: unknown; shopName?: unknown; text?: unknown; answers?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const answers =
    body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
      ? (body.answers as Record<string, unknown>)
      : {};

  try {
    await saveShopIntake({
      id,
      shopName: typeof body.shopName === "string" ? body.shopName.trim().slice(0, 200) : "",
      text: typeof body.text === "string" ? body.text : "",
      answers,
    });
  } catch (e) {
    console.error("[shop-questions] save failed", e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
