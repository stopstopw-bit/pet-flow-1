import { getDirectoryDb, getSupabase } from "./supabase/server";
import { ensureMigration } from "./migrations";
import { requireTenantId } from "./tenant-context";
import { generateSalt, getBootstrapTenantId, hashPassword } from "./auth";

/**
 * บัญชีพนักงาน — เจ้าของสร้างให้ พร้อมเลือกเมนูที่พนักงานคนนั้นมองเห็นได้
 * ล็อกอินด้วย username + password (ไม่ใช่อีเมล) — username ซ้ำไม่ได้ "ในร้านเดียวกัน" เท่านั้น
 * คนละร้านตั้งชื่อเดียวกันได้ (ทุกร้านแยกขาดจากกัน) เพราะล็อกอินผ่านลิงก์ของร้าน /s/<slug>/admin/login
 */

export type StaffUser = {
  id: string;
  name: string;
  username: string;
  menus: string[];
  active: boolean;
  createdAt: string;
};

type StaffRow = {
  id: string;
  name: string;
  username: string;
  password_hash: string;
  password_salt: string;
  menus: string[] | null;
  active: boolean;
  created_at: string;
  tenant_id?: string;
};

const mem: (StaffUser & { passwordHash: string; passwordSalt: string })[] = [];

function rowToStaff(r: StaffRow): StaffUser {
  return {
    id: r.id,
    name: r.name,
    username: r.username,
    menus: Array.isArray(r.menus) ? r.menus : [],
    active: r.active !== false,
    createdAt: r.created_at,
  };
}

function normUsername(s: string) {
  return s.trim().toLowerCase();
}

export async function listStaff(): Promise<StaffUser[]> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from("staff_users")
        .select("*")
        .eq("tenant_id", requireTenantId())
        .order("created_at", { ascending: true });
      if (error) return [];
      return ((data as StaffRow[] | null) || []).map(rowToStaff);
    } catch {
      return [];
    }
  }
  return mem.map(({ passwordHash: _h, passwordSalt: _s, ...s }) => s);
}

/**
 * username ซ้ำไม่ได้ในร้านเดียวกัน — ทั้งกับพนักงานคนอื่นและกับ username ของเจ้าของร้าน
 * (ร้านอื่นใช้ชื่อเดียวกันได้ ไม่เกี่ยวกัน)
 */
async function usernameTaken(username: string, excludeId?: string): Promise<boolean> {
  const sb = getSupabase();
  const norm = normUsername(username);
  if (sb) {
    const tenantId = requireTenantId();
    let q = sb
      .from("staff_users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("username", norm)
      .limit(1);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q.maybeSingle();
    if (data) return true;
    return (await ownerUsernameOf(tenantId)) === norm;
  }
  return mem.some((s) => normUsername(s.username) === norm && s.id !== excludeId);
}

async function ownerUsernameOf(tenantId: string): Promise<string | null> {
  const dir = getDirectoryDb();
  if (!dir) return null;
  const { data } = await dir.from("tenants").select("owner_username").eq("id", tenantId).maybeSingle();
  const u = (data as { owner_username?: string | null } | null)?.owner_username;
  return u ? normUsername(u) : null;
}

/**
 * ฐานข้อมูลเก่ายังมี unique index ที่บังคับ username ห้ามซ้ำทั้งแพลตฟอร์ม —
 * ชนเมื่อไหร่ให้อัปเดตฐานข้อมูล (เปลี่ยนเป็นห้ามซ้ำต่อร้าน) แล้วลองใหม่ครั้งเดียว
 */
async function withPerShopUsernames<T extends { error: { code?: string } | null }>(
  run: () => PromiseLike<T>
): Promise<T> {
  let res = await run();
  if (res.error?.code === "23505" && (await ensureMigration("staff_users.username_per_shop"))) {
    res = await run();
  }
  return res;
}

export async function addStaff(data: {
  name: string;
  username: string;
  password: string;
  menus: string[];
}): Promise<{ ok: true; staff: StaffUser } | { ok: false; error: string }> {
  const name = data.name.trim();
  const username = normUsername(data.username);
  const password = data.password;
  if (!name || !username || !password) return { ok: false, error: "missing_fields" };
  if (username.length < 3) return { ok: false, error: "username_too_short" };
  if (password.length < 6) return { ok: false, error: "password_too_short" };

  if (await usernameTaken(username)) {
    return { ok: false, error: "username_in_use" };
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);

  const staff: StaffUser = {
    id: `ST${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    name,
    username,
    menus: data.menus,
    active: true,
    createdAt: new Date().toISOString(),
  };

  const sb = getSupabase();
  if (sb) {
    try {
      const { error } = await withPerShopUsernames(() => sb.from("staff_users").insert({
        id: staff.id,
        tenant_id: requireTenantId(),
        name: staff.name,
        username: staff.username,
        password_hash: passwordHash,
        password_salt: salt,
        menus: staff.menus,
        active: true,
        created_at: staff.createdAt,
      }));
      if (error) {
        return {
          ok: false,
          error: error.code === "23505" ? "username_in_use" : "need_sql",
        };
      }
    } catch {
      return { ok: false, error: "need_sql" };
    }
  } else {
    mem.push({ ...staff, passwordHash, passwordSalt: salt });
  }
  return { ok: true, staff };
}

export async function updateStaff(
  id: string,
  patch: Partial<Pick<StaffUser, "name" | "username" | "menus" | "active">> & {
    password?: string;
  }
) {
  const sb = getSupabase();

  if (patch.username !== undefined) {
    const norm = normUsername(patch.username);
    if (norm.length < 3) return { ok: false as const, error: "username_too_short" };
    if (await usernameTaken(norm, id)) return { ok: false as const, error: "username_in_use" };
    patch.username = norm;
  }
  if (patch.password !== undefined && patch.password.length < 6) {
    return { ok: false as const, error: "password_too_short" };
  }

  if (sb) {
    try {
      const row: Record<string, unknown> = {};
      if (patch.name !== undefined) row.name = patch.name.trim();
      if (patch.username !== undefined) row.username = patch.username;
      if (patch.menus !== undefined) row.menus = patch.menus;
      if (patch.active !== undefined) row.active = patch.active;
      if (patch.password !== undefined) {
        const salt = generateSalt();
        row.password_salt = salt;
        row.password_hash = await hashPassword(patch.password, salt);
      }
      const tenantId = requireTenantId();
      const { error } = await withPerShopUsernames(() =>
        sb.from("staff_users").update(row).eq("id", id).eq("tenant_id", tenantId)
      );
      if (error) {
        return {
          ok: false as const,
          error: error.code === "23505" ? "username_in_use" : "need_sql",
        };
      }
    } catch {
      return { ok: false as const, error: "need_sql" };
    }
  } else {
    const s = mem.find((x) => x.id === id);
    if (!s) return { ok: false as const, error: "not_found" };
    if (patch.name !== undefined) s.name = patch.name.trim();
    if (patch.username !== undefined) s.username = patch.username;
    if (patch.menus !== undefined) s.menus = patch.menus;
    if (patch.active !== undefined) s.active = patch.active;
    if (patch.password !== undefined) {
      s.passwordSalt = generateSalt();
      s.passwordHash = await hashPassword(patch.password, s.passwordSalt);
    }
  }
  return { ok: true as const };
}

export async function deleteStaff(id: string) {
  const sb = getSupabase();
  if (sb) {
    try {
      await sb
        .from("staff_users")
        .delete()
        .eq("id", id)
        .eq("tenant_id", requireTenantId());
    } catch {
      /* ตารางยังไม่มี — ไม่มีอะไรให้ลบ */
    }
  } else {
    const i = mem.findIndex((x) => x.id === id);
    if (i >= 0) mem.splice(i, 1);
  }
  return { ok: true as const };
}

/**
 * ตรวจ username+password ตอนล็อกอิน คืน tenantId มาด้วยเพื่อผูก session
 *
 * - ส่ง tenantId มา (ล็อกอินจากลิงก์ร้าน) = ค้นเฉพาะพนักงานของร้านนั้น
 * - ไม่ส่ง (หน้า /admin/login แบบไม่ระบุร้าน) = ค้นทุกร้าน แต่ต้องตรงแค่บัญชีเดียว
 *   ถ้าชื่อ+รหัสตรงกันมากกว่าหนึ่งร้าน จะไม่รู้ว่าเป็นร้านไหน → ไม่ให้ผ่าน (ให้ใช้ลิงก์ร้าน)
 * ที่อื่นห้ามเรียกฟังก์ชันนี้ ต้องผ่าน listStaff ที่กรองด้วย tenant_id เสมอ
 */
export async function verifyStaffLogin(
  username: string,
  password: string,
  tenantId?: string
): Promise<(StaffUser & { tenantId: string }) | null> {
  const norm = normUsername(username);
  if (!norm || !password) return null;

  const sb = getSupabase();
  if (sb) {
    let q = sb.from("staff_users").select("*").eq("username", norm).eq("active", true);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data } = await q.limit(20);
    const matches: (StaffUser & { tenantId: string })[] = [];
    for (const row of (data as (StaffRow & { tenant_id: string })[] | null) || []) {
      if (!row.tenant_id || !row.password_hash || !row.password_salt) continue;
      const hash = await hashPassword(password, row.password_salt);
      if (hash === row.password_hash) matches.push({ ...rowToStaff(row), tenantId: row.tenant_id });
    }
    return matches.length === 1 ? matches[0] : null;
  }

  const s = mem.find((x) => normUsername(x.username) === norm && x.active);
  if (!s) return null;
  const hash = await hashPassword(password, s.passwordSalt);
  if (hash !== s.passwordHash) return null;
  // โหมดไม่มีฐานข้อมูล (dev) มีร้านเดียวคือร้าน bootstrap
  return { ...s, tenantId: getBootstrapTenantId() || "" };
}
