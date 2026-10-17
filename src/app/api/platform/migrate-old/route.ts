import { NextRequest, NextResponse } from "next/server";
import { getPlatformSessionFrom } from "@/lib/platform-auth";
import { migrateFromOldDb, migrateStatus } from "@/lib/migrate-old-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// ข้อมูล + รูปทั้งหมด อาจใช้เวลานานกว่าค่า default
export const maxDuration = 60;

/** พร้อมย้ายข้อมูลไหม (ตั้งค่า env ครบหรือยัง) */
export async function GET(req: NextRequest) {
  if (!(await getPlatformSessionFrom(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(migrateStatus());
}

/** ย้ายข้อมูลจากฐานข้อมูลเก่ามาตัวที่ใช้อยู่ — กดซ้ำได้ */
export async function POST(req: NextRequest) {
  if (!(await getPlatformSessionFrom(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const status = migrateStatus();
  if (!status.ready) return NextResponse.json({ error: status.message }, { status: 400 });
  try {
    return NextResponse.json(await migrateFromOldDb());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
