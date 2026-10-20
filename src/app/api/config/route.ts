import { NextRequest, NextResponse } from "next/server";
import { getSiteConfig, updateSiteConfig, replaceSiteConfig } from "@/lib/config-store";
import { getSessionFrom } from "@/lib/auth";
import { withResolvedTenant, withTenant } from "@/lib/tenant-context";
import { tenantIdForSlug } from "@/lib/tenant-resolve";

export const dynamic = "force-dynamic";

/**
 * GET เปิดสาธารณะ (แอปลูกค้าดึงมาแสดงหน้าเว็บ) ต้องรู้ร้านจาก slug/cookie เวลาไม่มี session
 * — ก่อนหน้านี้ route นี้ไม่เคยห่อด้วย withTenant/withResolvedTenant เลยสักครั้ง ทุกร้าน
 * (ทั้งอ่านและเขียน) เลยตกไปใช้ร้าน bootstrap เดียวกันหมด นี่คือสาเหตุที่แก้สีร้านหนึ่ง
 * แล้วกระทบร้านอื่นด้วย — bug นี้ร้ายแรงสุดในบรรดาที่เจอ เพราะกระทบ config ทั้งก้อน
 */
export async function GET(req: NextRequest) {
  // หน้าเว็บอยู่ร้านไหน (/s/<slug>/...) ต้องได้โลโก้/ชื่อ/สีของร้านนั้นเสมอ — เดิมเอาร้านใน session
  // มาก่อน พอล็อกอินร้าน A ค้างไว้แล้วเปิดหน้าร้าน B ก็เห็นหน้าตาร้าน A (ดูเหมือนแก้ร้านหนึ่งแล้วร้านอื่นเปลี่ยนตาม)
  const pageShop = req.nextUrl.searchParams.get("shop")?.trim().toLowerCase() || shopFromReferer(req);
  if (pageShop) {
    const id = await tenantIdForSlug(pageShop);
    if (!id) return NextResponse.json({ error: "shop not found" }, { status: 404 });
    return withTenant(id, handleGet);
  }
  const session = await getSessionFrom(req);
  if (session) return withTenant(session.tenantId, handleGet);
  return withResolvedTenant(req, handleGet);
}

/** slug ร้านจากหน้าที่เรียก API นี้ (Referer /s/<slug>/...) */
function shopFromReferer(req: NextRequest): string | null {
  const ref = req.headers.get("referer");
  if (!ref) return null;
  try {
    const m = new URL(ref).pathname.match(/^\/s\/([a-z0-9-]+)(?:\/|$)/i);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

async function handleGet() {
  const config = await getSiteConfig();
  return NextResponse.json({ config });
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFrom(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePatch(req));
}

async function handlePatch(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  if (body.action === "replace" && body.config) {
    const config = await replaceSiteConfig(body.config);
    return NextResponse.json({ ok: true, config });
  }

  const config = await updateSiteConfig(body.patch || body);
  return NextResponse.json({ ok: true, config });
}
