import { NextRequest, NextResponse } from "next/server";
import { getPlatformSessionFrom } from "@/lib/platform-auth";
import { getDirectoryDb, getSupabaseUrl, getSupabaseUrlSource } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import { generateSalt, hashPassword } from "@/lib/auth";
import { withTenant } from "@/lib/tenant-context";
import { replaceSiteConfig } from "@/lib/config-store";
import { getBlankShopConfig } from "@/lib/defaults/site-config";
import { ensureDueDateColumn, isMissingDueDate } from "@/lib/tenant-billing";

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

/** รายชื่อร้านทั้งหมด — ข้ามการกรอง tenant_id โดยตั้งใจ (นี่คือมุมมองข้ามร้าน) */
export async function GET(req: NextRequest) {
  if (!(await requirePlatform(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = getDirectoryDb();
  if (!sb) {
    return NextResponse.json(
      { error: "ยังไม่ได้ตั้ง NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ใน Vercel" },
      { status: 500 }
    );
  }

  type Row = {
    id: string;
    slug: string;
    name: string;
    status: string;
    template: string | null;
    trial_ends_at: string | null;
    due_date?: string | null;
    custom_domain?: string | null;
    created_at: string;
    owner_username: string | null;
  };
  const list = async (cols: string) => {
    const r = await sb.from("tenants").select(cols).order("created_at", { ascending: false });
    return { data: r.data as unknown as Row[] | null, error: r.error };
  };
  const base = "id, slug, name, status, template, trial_ends_at, created_at, owner_username";
  let { data, error } = await list(`${base}, due_date`);
  // ยังไม่มีคอลัมน์วันครบกำหนดจ่าย — สร้างให้แล้วอ่านใหม่ (ไม่ได้ก็อ่านแบบเดิม)
  if (error && isMissingDueDate(error.message)) {
    ({ data, error } = (await ensureDueDateColumn()) ? await list(`${base}, due_date`) : await list(base));
  }
  // โดเมนของร้านเอง — อ่านแยก ฐานที่ยังไม่มีคอลัมน์นี้ (ยังไม่เคยตั้งโดเมนให้ร้านไหน) ต้องไม่ทำให้รายชื่อร้านพัง
  const domains = new Map<string, string>();
  if (!error) {
    const { data: rows } = await sb.from("tenants").select("id, custom_domain").not("custom_domain", "is", null);
    for (const r of (rows as { id: string; custom_domain: string | null }[] | null) || []) {
      if (r.custom_domain) domains.set(r.id, r.custom_domain);
    }
  }
  if (error) {
    const hint = /fetch failed/i.test(error.message) ? await probeSupabase() : "";
    return NextResponse.json({ error: hint ? `${error.message} — ${hint}` : error.message }, { status: 500 });
  }

  await repairBadSlugs(sb, data || []);

  return NextResponse.json({
    tenants: (data || []).map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      status: t.status,
      template: t.template,
      trialEndsAt: t.trial_ends_at,
      dueDate: t.due_date || null,
      customDomain: domains.get(t.id) || null,
      createdAt: t.created_at,
      ownerUsername: t.owner_username,
    })),
  });
}

/**
 * "fetch failed" ไม่บอกอะไรเลย — ลองต่อ Supabase ตรงๆ แล้วบอกว่าต่อไปที่ไหน และพังเพราะอะไร
 * (ชื่อโดเมนผิด / ต่อไม่ติด / ช้าเกิน) ไม่โชว์ key
 */
async function probeSupabase(): Promise<string> {
  const url = getSupabaseUrl();
  if (!url) return "ไม่มี NEXT_PUBLIC_SUPABASE_URL";
  const host = new URL(url).host;
  try {
    const res = await fetch(`${url}/auth/v1/health`, { signal: AbortSignal.timeout(8000) });
    return `ต่อ ${host} ได้ (HTTP ${res.status}) แต่คำขอเมื่อกี้ล้ม — ลองรีเฟรชอีกครั้ง`;
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } })?.cause;
    const code = cause?.code || (e instanceof Error ? e.name : "");
    const why =
      code === "ENOTFOUND" || code === "EAI_AGAIN"
        ? "หาโดเมนนี้ไม่เจอ — ที่อยู่ Supabase ผิด"
        : code === "TimeoutError" || code === "UND_ERR_CONNECT_TIMEOUT"
          ? "ต่อช้าเกินไป"
          : cause?.message || String(e);
    const sources = getSupabaseUrlSource()
      .map((s) => `${s.source}=${s.host ?? "-"}`)
      .join(", ");
    return `ต่อ ${host} ไม่ได้: ${why}${code ? ` (${code})` : ""} [${sources}]`;
  }
}

/**
 * ลิงก์ร้าน /s/<slug> รับแค่ a-z 0-9 และ - (ดู middleware) — ห้ามมีตัวไทย/สระลอยติดมา
 * ไม่งั้นสร้างร้านได้แต่เปิดลิงก์แล้วขึ้น 404
 */
function slugify(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

const VALID_SLUG = /^[a-z0-9-]+$/;

/** ซ่อมร้านที่สร้างไว้ก่อนแก้ slugify — slug มีตัวอักษรที่ลิงก์เปิดไม่ได้ */
async function repairBadSlugs(
  sb: NonNullable<ReturnType<typeof getDirectoryDb>>,
  rows: { id: string; slug: string; owner_username: string | null }[]
) {
  for (const t of rows) {
    if (VALID_SLUG.test(t.slug)) continue;
    const fixed = slugify(t.slug);
    if (!fixed || rows.some((o) => o.slug === fixed)) continue;
    const update: Record<string, string> = { slug: fixed };
    if (t.owner_username === t.slug) update.owner_username = fixed;
    const { error } = await sb.from("tenants").update(update).eq("id", t.id);
    if (error) continue;
    await logAudit({
      tenantId: t.id,
      actorType: "platform",
      actorId: "platform_owner",
      action: "repair_tenant_slug",
      resourceType: "tenant",
      resourceId: t.id,
      beforeState: { slug: t.slug },
      afterState: { slug: fixed },
    });
    if (update.owner_username) t.owner_username = fixed;
    t.slug = fixed;
  }
}

/** สร้างร้านใหม่ — username เจ้าของ = slug โดย default, password สุ่มให้ */
export async function POST(req: NextRequest) {
  if (!(await requirePlatform(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "กรอกชื่อร้าน" }, { status: 400 });
  }
  const slug = body.slug ? slugify(String(body.slug)) : slugify(name);
  if (!slug) {
    return NextResponse.json({ error: "ตั้ง slug ไม่ได้ — ลองใส่ชื่อเป็นภาษาอังกฤษ" }, { status: 400 });
  }

  const sb = getDirectoryDb();
  if (!sb) return NextResponse.json({ error: "no_db" }, { status: 500 });

  // username ของเจ้าของร้าน = slug (unique อยู่แล้ว), password สุ่มให้ — เก็บแค่แฮช
  // โชว์ password ตัวจริงครั้งเดียวตอนสร้างเสร็จ ก็อปไปให้เจ้าของร้านได้เลย
  const ownerPassword = generatePassword();
  const salt = generateSalt();
  const ownerPasswordHash = await hashPassword(ownerPassword, salt);

  const { data, error } = await sb
    .from("tenants")
    .insert({
      name,
      slug,
      status: "trial",
      owner_username: slug,
      owner_password_hash: ownerPasswordHash,
      owner_password_salt: salt,
    })
    .select("id, slug, name, status, created_at, owner_username")
    .single();

  if (error) {
    const msg = error.code === "23505" ? "slug นี้ถูกใช้แล้ว ลองชื่ออื่น" : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // ชื่อร้านที่ตั้งตอนสร้างต้องไปโผล่ทุกที่ในระบบของร้านนั้นทันที (business.name) —
  // ไม่งั้นร้านใหม่จะเห็น "PetFlow" (ค่า default) ทั่วทั้งระบบจนกว่าจะเข้าไปแก้เองในตั้งค่า
  // ช่องที่เป็นของร้าน (บัญชีธนาคาร/LINE/เบอร์/ลิงก์) เริ่มว่าง ไม่เอาของร้านอื่นหรือ env มาใส่
  await withTenant(data.id, () => replaceSiteConfig(getBlankShopConfig(name)));

  await logAudit({
    tenantId: data.id,
    actorType: "platform",
    actorId: "platform_owner",
    action: "create_tenant",
    resourceType: "tenant",
    resourceId: data.id,
    afterState: { name: data.name, slug: data.slug, status: data.status },
  });

  return NextResponse.json({
    ok: true,
    tenant: {
      id: data.id,
      slug: data.slug,
      name: data.name,
      status: data.status,
      createdAt: data.created_at,
      ownerUsername: data.owner_username,
    },
    // โชว์ password ให้เห็นครั้งเดียวตอนนี้เท่านั้น — ใน DB เก็บแค่แฮช ดึงกลับมาดูอีกไม่ได้
    ownerPassword,
  });
}
