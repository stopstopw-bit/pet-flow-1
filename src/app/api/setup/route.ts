import { NextRequest, NextResponse } from "next/server";
import { getSessionFrom } from "@/lib/auth";
import {
  bootstrapDatabase,
  checkSetupStatus,
  getSchemaSqlForCopy,
} from "@/lib/supabase/bootstrap";

export const runtime = "nodejs";
// GET เดิมไม่มี query ที่แปรผัน (เหมือน /api/line/liff ที่เจอบั๊ก cache ค้าง) — บังคับ dynamic กันแคชค้าง
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");

  try {
    if (action === "schema") {
      return new NextResponse(getSchemaSqlForCopy(), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const status = await checkSetupStatus();
    return NextResponse.json({ status });
  } catch (e) {
    return NextResponse.json(
      { error: String(e), message: "ตรวจสอบ env แล้วลองใหม่" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const secret = process.env.SETUP_SECRET || process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  // เรียกจากสคริปต์ภายนอกด้วย Bearer หรือจากหลังบ้านที่ล็อกอินแล้ว
  // ต้อง fail closed — ถ้ายังไม่ตั้ง secret เลย ห้ามปล่อยผ่านเฉยๆ (เท่ากับเปิดโล่งให้ทุกคน)
  // สร้าง/ซ่อมตารางกระทบฐานข้อมูลที่ทุกร้านใช้ร่วมกัน — เจ้าของร้านเท่านั้น ไม่ใช่พนักงาน
  const hasSession = (await getSessionFrom(req))?.role === "owner";
  if (!hasSession && (!secret || auth !== `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await bootstrapDatabase();
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  const status = await checkSetupStatus();
  return NextResponse.json({ ...result, status });
}
