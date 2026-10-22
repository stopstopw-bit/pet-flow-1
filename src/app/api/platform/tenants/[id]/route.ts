import { NextRequest, NextResponse } from "next/server";
import { getPlatformSessionFrom } from "@/lib/platform-auth";
import { getDirectoryDb, getSupabase } from "@/lib/supabase/server";
import { getBootstrapTenantId } from "@/lib/auth";
import { mainShopTenantId } from "@/lib/tenant-resolve";
import { withTenantEvenIfClosed } from "@/lib/tenant-context";
import { getSiteConfig, updateSiteConfig } from "@/lib/config-store";
import { applyPetFormat } from "@/lib/defaults/pet-format";
import { getDefaultSiteConfig } from "@/lib/defaults/site-config";
import { PRIVATE_BUCKET } from "@/lib/supabase/storage";
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

  if (action === "set_pet_kind") {
    // แบบร้าน (แมว/หมา/ทั้งสองแบบ) — เปลี่ยนคำและสายพันธุ์เสมอ
    // withDefaults = ใส่ห้อง/ราคาอาบน้ำ/ของแถม ของแบบใหม่ทับของเดิมด้วย (สำหรับร้านที่ยังไม่ได้ตั้งเอง)
    const petKind = body.petKind;
    if (petKind !== "cat" && petKind !== "dog" && petKind !== "both") {
      return NextResponse.json({ error: "invalid_pet_kind" }, { status: 400 });
    }
    const withDefaults = body.withDefaults === true;
    const before = await withTenantEvenIfClosed(id, async () => {
      const cfg = await getSiteConfig();
      const prev = cfg.business?.petKind;
      if (withDefaults) {
        // ยกเฉพาะส่วนที่แบบร้านกำหนดมาทับ — ชื่อ/บัญชี/LINE/สี ของร้านไม่โดน (updateSiteConfig รวมทีละชั้น)
        const f = applyPetFormat(getDefaultSiteConfig(), petKind);
        await updateSiteConfig({
          business: { petKind, tagline: f.business.tagline } as typeof cfg.business,
          rooms: f.rooms,
          roomInventory: f.roomInventory,
          groomPricePrograms: f.groomPricePrograms,
          groomSizeLabels: f.groomSizeLabels ?? {},
          options: {
            freebies: f.options.freebies,
            servicePresets: f.options.servicePresets,
            catBreeds: f.options.catBreeds,
          } as typeof cfg.options,
          pointsRewards: f.pointsRewards,
          cards: {
            bookingConfirm: {
              ...cfg.cards?.bookingConfirm,
              // ร้านแมว = ข้อความเดิมของระบบ (ค่าว่าง → ใช้ค่าเริ่มต้น)
              texts: { ...cfg.cards?.bookingConfirm?.texts, groomPrepNote: f.cards?.bookingConfirm?.texts?.groomPrepNote || "" },
            },
            review: { ...cfg.cards?.review, texts: { ...cfg.cards?.review?.texts, bodyGroom: f.cards?.review?.texts?.bodyGroom || "" } },
          },
        });
      } else {
        await updateSiteConfig({ business: { petKind } as typeof cfg.business });
      }
      return prev;
    });
    await logAudit({
      tenantId: id,
      actorType: "platform",
      actorId: "platform_owner",
      action: "set_tenant_pet_kind",
      resourceType: "tenant",
      resourceId: id,
      beforeState: { petKind: before ?? null },
      afterState: { petKind, withDefaults },
    });
    return NextResponse.json({ ok: true });
  }

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

/**
 * ตารางที่เก็บข้อมูลของร้าน (มีคอลัมน์ tenant_id) — ลบร้านต้องลบให้ครบทุกตาราง
 * เพิ่มตารางใหม่ที่มี tenant_id เมื่อไหร่ ให้เพิ่มชื่อที่นี่ด้วย (ตารางลูกก่อนตารางแม่)
 */
const TENANT_TABLES = [
  "cats",
  "points_history",
  "points_accounts",
  "promo_claims",
  "promos",
  "service_records",
  "member_topups",
  "invoice_docs",
  "invoices",
  "finance_records",
  "booking_ops",
  "bookings",
  "customer_packages",
  "package_orders",
  "package_offers",
  "coupons",
  "coupon_offers",
  "room_plans",
  "birthday_greetings",
  "chat_watch",
  "broadcast_images",
  "articles",
  "products",
  "pos_sales",
  "pos_stock_moves",
  "pos_closings",
  "pos_products",
  "payroll_employees",
  "staff_users",
  "shop_intake",
  "tenant_payments",
  "customers",
  "site_config",
  "audit_logs",
];

/** ตารางยังไม่มีในฐาน / ไม่มีคอลัมน์ tenant_id = ไม่มีข้อมูลร้านนี้อยู่แล้ว ข้ามได้ */
function harmless(msg: string) {
  return /does not exist|could not find|schema cache/i.test(msg);
}

/** ลบไฟล์ส่วนตัวของร้านใน bucket private (<tenantId>/...) ทั้งโฟลเดอร์ */
async function removePrivateFolder(sb: NonNullable<ReturnType<typeof getSupabase>>, prefix: string): Promise<number> {
  let removed = 0;
  const { data } = await sb.storage.from(PRIVATE_BUCKET).list(prefix, { limit: 1000 });
  for (const item of data || []) {
    const path = `${prefix}/${item.name}`;
    if (item.id) {
      const { error } = await sb.storage.from(PRIVATE_BUCKET).remove([path]);
      if (!error) removed++;
    } else {
      removed += await removePrivateFolder(sb, path);
    }
  }
  return removed;
}

/**
 * ลบร้านถาวร — ข้อมูลทุกตารางของร้านนี้ (เฉพาะแถวที่ tenant_id ตรง) + ไฟล์ส่วนตัว + แถวร้าน
 * ต้องพิมพ์ slug ของร้านมายืนยัน · ร้านหลักของระบบ (bootstrap / ร้านเจ้าของ env) ลบไม่ได้
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requirePlatform(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const dir = getDirectoryDb();
  if (!dir) return NextResponse.json({ error: "no_db" }, { status: 500 });

  const { data: tenant } = await dir
    .from("tenants")
    .select("id, slug, name, status")
    .eq("id", id)
    .maybeSingle();
  if (!tenant) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (String(body.confirmSlug || "").trim() !== tenant.slug) {
    return NextResponse.json({ error: `พิมพ์ "${tenant.slug}" ให้ตรงเพื่อยืนยันการลบ` }, { status: 400 });
  }
  if (id === getBootstrapTenantId() || id === (await mainShopTenantId()) || tenant.slug === "petflow") {
    return NextResponse.json({ error: "ร้านหลักของระบบลบไม่ได้" }, { status: 400 });
  }

  const result = await withTenantEvenIfClosed(id, async () => {
    // ร้านที่แยกฐานไปแล้วได้ฐานของตัวเอง — ไม่งั้นฐานกลาง (ลบเฉพาะแถวของร้านนี้เท่านั้น)
    const sb = getSupabase();
    if (!sb) return { failed: ["no_db"], files: 0 };
    const failed: string[] = [];
    for (const table of TENANT_TABLES) {
      const { error } = await sb.from(table).delete().eq("tenant_id", id);
      if (error && !harmless(error.message)) failed.push(`${table}: ${error.message}`);
    }
    const files = await removePrivateFolder(sb, id).catch(() => 0);
    return { failed, files };
  });

  if (result.failed.length) {
    // ยังลบข้อมูลไม่หมด — เก็บแถวร้านไว้ กดลบซ้ำได้ (ลบซ้ำไม่พัง)
    return NextResponse.json(
      { error: `ลบข้อมูลบางส่วนไม่สำเร็จ ลองกดอีกครั้ง (${result.failed.join(" · ")})` },
      { status: 500 }
    );
  }

  const { error } = await dir.from("tenants").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  clearTenantGateCache();
  clearTenantDomainCache();

  await logAudit({
    tenantId: id,
    actorType: "platform",
    actorId: "platform_owner",
    action: "delete_tenant",
    resourceType: "tenant",
    resourceId: id,
    beforeState: { name: tenant.name, slug: tenant.slug, status: tenant.status },
    afterState: { deleted: true, privateFiles: result.files },
  });
  return NextResponse.json({ ok: true });
}
