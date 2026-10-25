import { NextRequest, NextResponse } from "next/server";
import { verifyStaffLogin } from "@/lib/staff-store";
import { withTenantEvenIfClosed } from "@/lib/tenant-context";
import { TENANT_SLUG_HEADER } from "@/lib/tenant-resolve";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_NAME_HEADER,
  shopSessionCookie,
  getBootstrapTenantId,
  getOwnerCode,
  isOwnerCodeConfigured,
  sessionCookieOptions,
  signSession,
  verifySession,
} from "@/lib/auth";
import { findTenantByLegacyOwnerCode, findTenantByOwnerLogin } from "@/lib/tenant-directory";
import { getDirectoryDb } from "@/lib/supabase/server";
import { isOverdue, tenantGateById, tenantGateBySlug } from "@/lib/tenant-billing";

export const dynamic = "force-dynamic";

/** ใครล็อกอินอยู่ตอนนี้ — ใช้ให้หน้าหลังบ้านรู้บทบาท/เมนูที่เข้าได้ */
export async function GET(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  // วันครบกำหนดจ่ายค่าบริการ — หลังบ้านใช้เตือนก่อนถึงวัน และพาไปหน้าค่าบริการเมื่อเลยกำหนด
  const gate = await tenantGateById(session.tenantId).catch(() => null);
  return NextResponse.json({
    ok: true,
    role: session.role,
    name: session.name,
    menus: session.menus,
    impersonating: session.impersonating || false,
    dueDate: gate?.dueDate || null,
    overdue: isOverdue(gate?.dueDate),
  });
}

/**
 * ล็อกอินหลังบ้าน — ตรวจ username+password ที่เซิร์ฟเวอร์ แล้ววางคุกกี้ httpOnly ที่เซ็นชื่อไว้
 * เบราว์เซอร์แก้เองไม่ได้ และ JS อ่านไม่ได้
 *
 * เจ้าของร้านและพนักงานล็อกอินด้วย username+password เหมือนกันหมด (ตั้งแต่ T5b) —
 * username ห้ามซ้ำแค่ในร้านเดียวกัน คนละร้านซ้ำได้ ร้านดูจากลิงก์ /s/<slug>/admin/login
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  // ร้านที่หน้าล็อกอินถูกเปิดมา (/s/<slug>/admin/login) — ว่าง = หน้า /admin/login แบบไม่ระบุร้าน
  // บนโดเมนของร้านเอง (catcha.com/admin/login) ลิงก์ไม่มี /s/<slug> — middleware ใส่ร้านมาใน header ให้แล้ว
  const fromBody = String(body.shop || "").trim().toLowerCase();
  const fromHeader = (req.headers.get(TENANT_SLUG_HEADER) || "").trim().toLowerCase();
  if (fromBody && fromHeader && fromBody !== fromHeader) {
    return NextResponse.json({ error: "ลิงก์ร้านไม่ตรงกัน — เปิดหน้าล็อกอินของร้านนี้ใหม่" }, { status: 400 });
  }
  const shop = fromBody || fromHeader;
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

  // ล็อกอินจากลิงก์ร้าน → หาเฉพาะบัญชีของร้านนั้น (คนละร้านใช้ username เดียวกันได้)
  // ไม่เช็คว่าร้านเปิดอยู่ — ร้านที่เลยกำหนดจ่ายยังต้องล็อกอินเข้าไปหน้าค่าบริการได้
  const shopId = shop ? (await tenantGateBySlug(shop).catch(() => null))?.id || null : null;
  if (shop && !shopId) {
    return NextResponse.json(
      { error: `ไม่พบร้าน "${shop}"` },
      { status: 404 }
    );
  }

  // 1) เจ้าของร้าน
  const tenant = await findTenantByOwnerLogin(username, password, shopId || undefined);
  if (tenant) {
    payload = { role: "owner", name: "เจ้าของร้าน", tenantId: tenant.id };
  }

  // 2) พนักงาน — ค้นในฐานของร้านนั้น (เผื่อร้านแยกไปฐานของตัวเองแล้ว)
  if (!payload) {
    const staff = shopId
      ? await withTenantEvenIfClosed(shopId, () => verifyStaffLogin(username, password, shopId))
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
  // ล็อกอินจากลิงก์ร้าน → คุกกี้ของร้านนั้นเท่านั้น ไม่ทับการล็อกอินของร้านอื่นในเครื่องเดียวกัน
  res.cookies.set(shop ? shopSessionCookie(shop) : SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}

async function slugForTenant(tenantId: string): Promise<string | undefined> {
  const sb = getDirectoryDb();
  if (!sb) return undefined;
  const { data } = await sb.from("tenants").select("slug").eq("id", tenantId).maybeSingle();
  return (data as { slug?: string } | null)?.slug || undefined;
}

/** ออกจากระบบ */
export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  // ออกเฉพาะร้านที่กดออก — ร้านอื่นที่ล็อกอินค้างไว้ในเครื่องเดียวกันยังอยู่
  const name = req.headers.get(SESSION_COOKIE_NAME_HEADER) || SESSION_COOKIE;
  res.cookies.set(name, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
