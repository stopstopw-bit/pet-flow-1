import { NextRequest, NextResponse } from "next/server";
import { customerLangFor, englishCardsEnabled, translateMessagesInfo } from "@/lib/line-i18n";

export const runtime = "nodejs";

/** หลังบ้าน: ร้านนี้เปิดการ์ดภาษาอังกฤษไหม (ป๊อปอัปพรีวิว/หน้าลูกค้าใช้ซ่อน-โชว์ตัวเลือกภาษา) */
export async function GET() {
  return NextResponse.json({ enabled: await englishCardsEnabled() });
}

/**
 * หลังบ้าน: การ์ดในป๊อปอัปพรีวิวฉบับภาษาอังกฤษ (ให้เห็นก่อนส่งจริง)
 * POST { messages } → { messages } · POST { lineUserId } → { lang } (ภาษาที่ลูกค้าตั้งไว้)
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.lineUserId === "string" && body.lineUserId.trim()) {
    return NextResponse.json({ lang: await customerLangFor(body.lineUserId.trim()) });
  }
  const messages = Array.isArray(body.messages) ? body.messages.slice(0, 5) : [];
  if (messages.length === 0) return NextResponse.json({ error: "no_messages" }, { status: 400 });
  const r = translateMessagesInfo(messages);
  return NextResponse.json({ messages: r.messages, total: r.total, translated: r.translated });
}
