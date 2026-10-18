import { NextRequest, NextResponse } from "next/server";
import { getPlatformSessionFrom } from "@/lib/platform-auth";
import { getSupabase } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import {
  SESSION_COOKIE,
  generateSalt,
  hashPassword,
  sessionCookieOptions,
  signSession,
} from "@/lib/auth";

/** สุ่มรหัสผ่านให้อ่านง่าย จำง่าย — ตัวอักษร/ตัวเลขที่ไม่สับสน (ตัด 0/O, 1/I ออก) */
function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export const dynamic = "force-dynamic";

async function requirePlatform(req: NextRequest) {
  return !!(await getPlatformSessionFrom(req));
}

/** เปลี่ยนสถานะร้าน (suspend/activate) หรือ "เข้าดูแทน" (impersonate) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requirePlatform(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "no_db" }, { status: 500 });

  const { data: tenant } = await sb
    .from("tenants")
    .select("id, slug, name, status")
    .eq("id", id)
    .maybeSingle();
  if (!tenant) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (action === "set_status") {
    const status = String(body.status || "");
    if (!["trial", "active", "suspended", "cancelled"].includes(status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }
    await sb.from("tenants").update({ status }).eq("id", id);
    await logAudit({
      tenantId: id,
      actorType: "platform",
      actorId: "platform_owner",
      action: "set_tenant_status",
      resourceType: "tenant",
      resourceId: id,
      beforeState: { status: tenant.status },
      afterState: { status },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "reset_owner_login") {
    // ตั้ง/รีเซ็ต username+password ของเจ้าของร้าน — ใช้กับร้านเก่าที่ยังไม่มี หรือลืม password
    const username = String(body.username || tenant.slug).trim().toLowerCase();
    const password = generatePassword();
    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);

    const { error } = await sb
      .from("tenants")
      .update({
        owner_username: username,
        owner_password_hash: passwordHash,
        owner_password_salt: salt,
        // ล้างรหัสร้านแบบเก่า (owner_code_hash) ทิ้ง — ไม่งั้นรหัสเดิมยัง login ได้คู่กับ password ใหม่
        // (เช่นรหัส default petflow2026 ที่เผลอฝังไว้ตอนตั้งค่าแรก จะไม่ตายจนกว่าจะเคลียร์ตรงนี้)
        owner_code_hash: null,
      })
      .eq("id", id);
    if (error) {
      const msg = error.code === "23505" ? "username นี้ถูกใช้แล้ว" : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    await logAudit({
      tenantId: id,
      actorType: "platform",
      actorId: "platform_owner",
      action: "reset_owner_login",
      resourceType: "tenant",
      resourceId: id,
    });

    return NextResponse.json({ ok: true, ownerUsername: username, ownerPassword: password });
  }

  if (action === "impersonate") {
    // วาง session ของหลังบ้านร้านนั้นให้เลย (role owner) + ทำเครื่องหมายว่ากำลังเข้าดูแทน
    await logAudit({
      tenantId: id,
      actorType: "platform",
      actorId: "platform_owner",
      action: "impersonate",
      resourceType: "tenant",
      resourceId: id,
    });
    const token = await signSession({
      role: "owner",
      name: `${tenant.name} (เข้าดูแทน)`,
      tenantId: id,
      tenantSlug: tenant.slug,
      impersonating: true,
    });
    const res = NextResponse.json({ ok: true, redirect: `/s/${tenant.slug}/admin` });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(1));
    return res;
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
