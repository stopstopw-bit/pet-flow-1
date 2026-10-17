import { NextRequest, NextResponse } from "next/server";
import { listCustomers, updateCat, updateCatMedia } from "@/lib/customers-store";
import { listBookings } from "@/lib/bookings-store";
import { uploadPrivateDataUrl } from "@/lib/supabase/storage";
import { getSupabase } from "@/lib/supabase/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { withTenant } from "@/lib/tenant-context";
import { privatizeTenantFiles } from "@/lib/privatize-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ย้ายรูป/วิดีโอ/ลายเซ็นที่เคยเก็บเป็น base64 ตรงๆ ในฐานข้อมูล (ของเก่าก่อนมี Storage)
 * ไปเก็บเป็นไฟล์ใน Supabase Storage แทน — เรียกได้หลายครั้ง (ข้ามของที่ย้ายแล้ว)
 */
export async function POST(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, handlePost);
}

async function handlePost() {
  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ error: "ไม่มีการเชื่อม Supabase (โหมด dev/mem)" }, { status: 400 });
  }

  let photos = 0;
  let media = 0;
  let signatures = 0;
  const errors: string[] = [];

  try {
    const customers = await listCustomers();
    for (const c of customers) {
      for (const cat of c.cats) {
        try {
          if (cat.photoDataUrl?.startsWith("data:")) {
            await updateCat(c.id, cat.id, { photoDataUrl: cat.photoDataUrl });
            photos++;
          }
          if (cat.media?.some((m) => m.dataUrl.startsWith("data:"))) {
            await updateCatMedia(c.id, cat.id, cat.media);
            media += cat.media.filter((m) => m.dataUrl.startsWith("data:")).length;
          }
        } catch (e) {
          errors.push(`${cat.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    const bookings = await listBookings();
    for (const b of bookings) {
      if (!b.consentSignature?.startsWith("data:")) continue;
      try {
        const url = await uploadPrivateDataUrl(
          `consent-signatures/${b.id}-backfill`,
          b.consentSignature
        );
        if (url !== b.consentSignature) {
          await sb.from("bookings").update({ consent_signature: url }).eq("id", b.id);
          signatures++;
        }
      } catch (e) {
        errors.push(`booking ${b.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }

  // ไฟล์ที่อัปไว้แล้วแต่อยู่ใน bucket สาธารณะ → ย้ายไป bucket ส่วนตัว
  const privatized = await privatizeTenantFiles();
  errors.push(...privatized.errors);

  return NextResponse.json({ ok: true, photos, media, signatures, privatized: privatized.moved, errors });
}
