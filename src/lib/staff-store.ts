import { getSupabase } from "./supabase/server";
import { requireTenantId } from "./tenant-context";
import { generateSalt, getBootstrapTenantId, hashPassword } from "./auth";

/**
 * บัญชีพนักงาน — เจ้าของสร้างให้ พร้อมเลือกเมนูที่พนักงานคนนั้นมองเห็นได้
 * ล็อกอินด้วย username + password (ไม่ใช่อีเมล) — username ต้อง unique ทั้งแพลตฟอร์ม
 * ไม่ใช่แค่ในร้านตัวเอง เพราะตอนล็อกอินยังไม่รู้ว่าเป็นร้านไหนจนกว่าจะหา username เจอ
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

/** username ต้องไม่ซ้ำกับใครเลยทั้งแพลตฟอร์ม (ข้ามร้าน) — เช็คก่อนสร้าง/แก้ไขทุกครั้ง */
async function usernameTaken(username: string, excludeId?: string): Promise<boolean> {
  const sb = getSupabase();
  const norm = normUsername(username);
  if (sb) {
    let q = sb.from("staff_users").select("id").eq("username", norm).limit(1);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q.maybeSingle();
    return Boolean(data);
  }
  return mem.some((s) => normUsername(s.username) === norm && s.id !== excludeId);
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
      const { error } = await sb.from("staff_users").insert({
        id: staff.id,
        tenant_id: requireTenantId(),
        name: staff.name,
        username: staff.username,
        password_hash: passwordHash,
        password_salt: salt,
        menus: staff.menus,
        active: true,
        created_at: staff.createdAt,
      });
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
      const { error } = await sb
        .from("staff_users")
        .update(row)
        .eq("id", id)
        .eq("tenant_id", requireTenantId());
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
 * ตรวจ username+password ตอนล็อกอิน — ค้น "ข้ามทุกร้าน" เพราะยังไม่รู้ว่าเป็นร้านไหน
 * จนกว่าจะเจอ username (unique ทั้งแพลตฟอร์มอยู่แล้ว) คืน tenantId มาด้วยเพื่อผูก session
 * ที่อื่นห้ามเรียกฟังก์ชันนี้ ต้องผ่าน listStaff ที่กรองด้วย tenant_id เสมอ
 */
export async function verifyStaffLogin(
  username: string,
  password: string
): Promise<(StaffUser & { tenantId: string }) | null> {
  const norm = normUsername(username);
  if (!norm || !password) return null;

  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from("staff_users")
      .select("*")
      .eq("username", norm)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const row = data as StaffRow & { tenant_id: string };
    if (!row.tenant_id || !row.password_hash || !row.password_salt) return null;
    const hash = await hashPassword(password, row.password_salt);
    if (hash !== row.password_hash) return null;
    return { ...rowToStaff(row), tenantId: row.tenant_id };
  }

  const s = mem.find((x) => normUsername(x.username) === norm && x.active);
  if (!s) return null;
  const hash = await hashPassword(password, s.passwordSalt);
  if (hash !== s.passwordHash) return null;
  // โหมดไม่มีฐานข้อมูล (dev) มีร้านเดียวคือร้าน bootstrap
  return { ...s, tenantId: getBootstrapTenantId() || "" };
}
