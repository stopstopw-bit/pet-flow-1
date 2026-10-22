import { NextRequest, NextResponse } from "next/server";
import { getPlatformSessionFrom } from "@/lib/platform-auth";
import { getDirectoryDb } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import {
  clearTenantGateCache,
  ensureDueDateColumn,
  isMissingDueDate,
  extendDueDate,
} from "@/lib/tenant-billing";
import {
  clearTenantDomainCache,
  ensureCustomDomainColumn,
  isMissingCustomDomain,
  normalizeDomain,
} from "@/lib/tenant-domain";
import {
  shopSessionCookie,
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
  const sb = getDirectoryDb();
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
    clearTenantGateCache();
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

  if (action === "rename") {
    // ชื่อร้านในหน้าผู้ดูแลระบบ — ไม่แตะ slug/ลิงก์ร้าน เพราะลูกค้าและ LINE ใช้ลิงก์เดิมอยู่
    const name = String(body.name || "").trim();
    if (!name || name.length > 100) {
      return NextResponse.json({ error: "ชื่อร้านต้องมี 1–100 ตัวอักษร" }, { status: 400 });
    }
    const { error } = await sb.from("tenants").update({ name }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAudit({
      tenantId: id,
      actorType: "platform",
      actorId: "platform_owner",
      action: "rename_tenant",
      resourceType: "tenant",
      resourceId: id,
      beforeState: { name: tenant.name },
      afterState: { name },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "set_due_date" || action === "paid_month") {
    // วันครบกำหนดจ่ายรายเดือน — ถึงวันนั้นยังไม่จ่าย ร้านปิดเองอัตโนมัติ (ดู tenant-billing.ts)
    const read = () => sb.from("tenants").select("due_date").eq("id", id).maybeSingle();
    let { data: cur, error: readErr } = await read();
    if (readErr && isMissingDueDate(readErr.message) && (await ensureDueDateColumn())) {
      ({ data: cur, error: readErr } = await read());
    }
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    const before = (cur?.due_date as string | null) || null;

    let dueDate: string | null;
    const update: Record<string, unknown> = {};
    if (action === "set_due_date") {
      const v = String(body.dueDate || "").trim();
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return NextResponse.json({ error: "วันที่ไม่ถูกต้อง" }, { status: 400 });
      }
      dueDate = v || null;
    } else {
      // รับเงินสด/โอนนอกระบบ → ต่อ 1 เดือน (ดู extendDueDate) · ทดลองใช้อยู่ = เปลี่ยนเป็นใช้งานจริงด้วย
      dueDate = extendDueDate(before, 1);
      if (tenant.status === "trial") update.status = "active";
    }
    update.due_date = dueDate;
    const { error } = await sb.from("tenants").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    clearTenantGateCache();
    await logAudit({
      tenantId: id,
      actorType: "platform",
      actorId: "platform_owner",
      action: action === "paid_month" ? "tenant_paid_month" : "set_tenant_due_date",
      resourceType: "tenant",
      resourceId: id,
      beforeState: { dueDate: before, status: tenant.status },
      afterState: { dueDate, status: update.status || tenant.status },
    });
    return NextResponse.json({ ok: true, dueDate });
  }

  if (action === "set_domain") {
    // โดเมนของร้านเอง (เช่น catcha.com) — ว่าง = เลิกใช้โดเมน กลับไปใช้ลิงก์ /s/<slug> อย่างเดียว
    // ลิงก์ /s/<slug> เดิมใช้ได้ตลอดไม่ว่าจะตั้งโดเมนหรือไม่ ดูขั้นตอนฝั่ง Vercel/DNS ใน CUSTOM_DOMAIN.md
    const raw = String(body.domain || "").trim();
    const domain = raw ? normalizeDomain(raw) : null;
    if (raw && !domain) {
      return NextResponse.json(
        { error: "โดเมนไม่ถูกต้อง — ใส่แค่ชื่อโดเมน เช่น catcha.com (ใช้โดเมน vercel.app ไม่ได้)" },
        { status: 400 }
      );
    }
    const read = () => sb.from("tenants").select("custom_domain").eq("id", id).maybeSingle();
    let { data: cur, error: readErr } = await read();
    if (readErr && isMissingCustomDomain(readErr.message) && (await ensureCustomDomainColumn())) {
      ({ data: cur, error: readErr } = await read());
    }
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    const before = (cur?.custom_domain as string | null) || null;

    if (domain) {
      // โดเมนเดียวชี้ได้ร้านเดียว — เช็คก่อนให้ข้อความอ่านง่าย (ฐานมี unique index กันซ้ำอีกชั้น)
      const { data: taken } = await sb
        .from("tenants")
        .select("id, name")
        .eq("custom_domain", domain)
        .neq("id", id)
        .limit(1)
        .maybeSingle();
      if (taken) {
        return NextResponse.json({ error: `โดเมนนี้ผูกกับร้าน "${taken.name}" อยู่แล้ว` }, { status: 400 });
      }
    }
    const { error } = await sb.from("tenants").update({ custom_domain: domain }).eq("id", id);
    if (error) {
      const msg = error.code === "23505" ? "โดเมนนี้ผูกกับร้านอื่นอยู่แล้ว" : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    clearTenantDomainCache();
    await logAudit({
      tenantId: id,
      actorType: "platform",
      actorId: "platform_owner",
      action: "set_tenant_domain",
      resourceType: "tenant",
      resourceId: id,
      beforeState: { customDomain: before },
      afterState: { customDomain: domain },
    });
    return NextResponse.json({ ok: true, customDomain: domain });
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
    res.cookies.set(shopSessionCookie(tenant.slug), token, sessionCookieOptions(1));
    return res;
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
