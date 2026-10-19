import { NextRequest, NextResponse } from "next/server";
import { verifyStaffLogin } from "@/lib/staff-store";
import { withTenant } from "@/lib/tenant-context";
import { tenantIdForSlug } from "@/lib/tenant-resolve";
import {
  SESSION_COOKIE,
  getBootstrapTenantId,
  getOwnerCode,
  isOwnerCodeConfigured,
  sessionCookieOptions,
  signSession,
  verifySession,
} from "@/lib/auth";
import { findTenantByLegacyOwnerCode, findTenantByOwnerLogin } from "@/lib/tenant-directory";
import { getDirectoryDb } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** ใครล็อกอินอยู่ตอนนี้ — ใช้ให้หน้าหลังบ้านรู้บทบาท/เมนูที่เข้าได้ */
export async function GET(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({
    ok: true,
    role: session.role,
    name: session.name,
    menus: session.menus,
    impersonating: session.impersonating || false,
  });
}

/**
 * ล็อกอินหลังบ้าน — ตรวจ username+password ที่เซิร์ฟเวอร์ แล้ววางคุกกี้ httpOnly ที่เซ็นชื่อไว้
 * เบราว์เซอร์แก้เองไม่ได้ และ JS อ่านไม่ได้
 *
 * เจ้าของร้านและพนักงานล็อกอินด้วย username+password เหมือนกันหมด (ตั้งแต่ T5b) —
 * username ต้อง unique ทั้งแพลตฟอร์ม (ข้ามร้าน) เพราะยังไม่รู้ว่าเป็นร้านไหนจนกว่าจะเจอ
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  // ร้านที่หน้าล็อกอินถูกเปิดมา (/s/<slug>/admin/login) — ว่าง = หน้า /admin/login แบบไม่ระบุร้าน
  const shop = String(body.shop || "").trim().toLowerCase();
  if (!username) {
    return NextResponse.json({ error: "กรอก username" }, { status: 400 });
  }

  let payload:
    | {
        role: "owner" | "staff";
        name: string;
        tenantId: string;
        tenantSlug?: string;
        menus?: string[];
      }
    | null = null;

  // 1) เจ้าของร้าน — username+password ค้นข้ามทุกร้าน
  const tenant = await findTenantByOwnerLogin(username, password);
  if (tenant) {
    payload = { role: "owner", name: "เจ้าของร้าน", tenantId: tenant.id };
  }

  // 2) พนักงาน — username+password ค้นข้ามทุกร้านเช่นกัน
  if (!payload) {
    // ล็อกอินจากลิงก์ร้าน → ค้นในฐานของร้านนั้น (เผื่อร้านแยกไปฐานของตัวเองแล้ว)
    const shopId = shop ? await tenantIdForSlug(shop) : null;
    const staff = shopId
      ? await withTenant(shopId, () => verifyStaffLogin(username, password))
      : await verifyStaffLogin(username, password);
    if (staff) {
      payload = {
        role: "staff",
        name: staff.name || "พนักงาน",
        tenantId: staff.tenantId,
        menus: staff.menus || [],
      };
    }
  }

  // 3) ร้านเก่าที่ยังไม่ได้ตั้ง username/password ใหม่ — พิมพ์รหัสร้านเดิมลงช่อง username
  //    เว้น password ว่างได้ (เผื่อร้านที่ตั้งไว้ก่อน T5b ยังไม่ได้อัปเดต)
  if (!payload && !password) {
    const legacyTenant = await findTenantByLegacyOwnerCode(username);
    if (legacyTenant) {
      payload = { role: "owner", name: "เจ้าของร้าน", tenantId: legacyTenant.id };
    } else {
      // bootstrap login (env ADMIN_CODE) — ยอมรับต่อเมื่อร้าน "ตั้งรหัสเอง" จริงเท่านั้น
      // ถ้ายังไม่ตั้ง getOwnerCode() จะเป็น default "petflow2026" ที่ทุก clone รู้ = ห้ามให้ผ่าน
      const bootstrapTenantId = getBootstrapTenantId();
      if (
        bootstrapTenantId &&
        isOwnerCodeConfigured() &&
        username === getOwnerCode()
      ) {
        payload = { role: "owner", name: "เจ้าของร้าน", tenantId: bootstrapTenantId };
      }
    }
  }

  if (!payload) {
    return NextResponse.json({ error: "username หรือ password ไม่ถูกต้อง" }, { status: 401 });
  }

  const tenantSlug = await slugForTenant(payload.tenantId);
  if (tenantSlug) payload.tenantSlug = tenantSlug;
  // ล็อกอินจากลิงก์ของร้านหนึ่ง ต้องเป็นบัญชีของร้านนั้นเท่านั้น
  if (shop && tenantSlug !== shop) {
    return NextResponse.json(
      { error: `บัญชีนี้ไม่ใช่ของร้าน "${shop}" — ใช้ username/password ของร้านนี้` },
      { status: 401 }
    );
  }

  let token: string;
  try {
    token = await signSession(payload);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ตั้งค่าเซิร์ฟเวอร์ไม่ครบ ล็อกอินไม่ได้" },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ ok: true, ...payload });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}

async function slugForTenant(tenantId: string): Promise<string | undefined> {
  const sb = getDirectoryDb();
  if (!sb) return undefined;
  const { data } = await sb.from("tenants").select("slug").eq("id", tenantId).maybeSingle();
  return (data as { slug?: string } | null)?.slug || undefined;
}

/** ออกจากระบบ */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
