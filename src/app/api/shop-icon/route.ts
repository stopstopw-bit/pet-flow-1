import { NextRequest, NextResponse } from "next/server";
import { getSiteConfig } from "@/lib/config-store";
import { getSessionFrom } from "@/lib/auth";
import { withResolvedTenant, withTenant } from "@/lib/tenant-context";
import { tenantIdForSlug } from "@/lib/tenant-resolve";

export const dynamic = "force-dynamic";

/**
 * ไอคอนแท็บ/หน้าจอโฮม (Add to Home Screen) ของแต่ละร้าน = โลโก้ร้านใน Settings
 * ต้องเป็น URL จริงบนโดเมนเรา — iPhone ไม่อ่าน apple-touch-icon ที่เป็น data URL
 * ร้านไม่ได้ตั้งโลโก้ → ไอคอน PetFlow เดิม (app/apple-icon.png)
 * ร้านดูจาก ?shop=<slug> (ConfigProvider ส่งมา) ก่อน แล้วค่อย session/คุกกี้ เหมือน /api/config
 */
export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop")?.trim().toLowerCase();
  let logoUrl: string | undefined;
  try {
    if (shop) {
      const id = await tenantIdForSlug(shop);
      if (id) logoUrl = await withTenant(id, readLogo);
    } else {
      const session = await getSessionFrom(req);
      logoUrl = session
        ? await withTenant(session.tenantId, readLogo)
        : await withResolvedTenant(req, readLogo);
    }
  } catch {
    /* ใช้ไอคอนเริ่มต้น */
  }

  const image = logoUrl ? await loadImage(logoUrl, req) : null;
  if (!image) return NextResponse.redirect(new URL("/apple-icon.png", req.url));
  return new NextResponse(image.body, {
    headers: {
      "Content-Type": image.type,
      // ?v= เปลี่ยนตามโลโก้ (ดู ConfigProvider) — เก็บแคชได้นานโดยไม่ค้างโลโก้เก่า
      "Cache-Control": "public, max-age=86400",
    },
  });
}

async function readLogo() {
  const config = await getSiteConfig();
  return config.branding?.logoUrl?.trim() || undefined;
}

async function loadImage(src: string, req: NextRequest): Promise<{ body: ArrayBuffer; type: string } | null> {
  const data = src.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (data) {
    const buf = Buffer.from(data[2], "base64");
    return { body: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, type: data[1] };
  }
  try {
    const res = await fetch(new URL(src, req.url), { cache: "no-store" });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.startsWith("image/")) return null;
    return { body: await res.arrayBuffer(), type };
  } catch {
    return null;
  }
}
