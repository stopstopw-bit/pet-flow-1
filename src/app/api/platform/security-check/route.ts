import { NextResponse } from "next/server";
import { getSupabaseKeyRole } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * ผู้ดูแลระบบเช็กก่อนรัน migration 012 (เปิด RLS) — middleware กันไว้ให้เฉพาะ platform session
 * rlsSafe = true แปลว่า key ที่ deploy bypass RLS ได้ เปิด RLS แล้วแอปไม่พัง
 */
export async function GET() {
  const keyRole = getSupabaseKeyRole();
  return NextResponse.json({ keyRole, rlsSafe: keyRole === "service_role" });
}
