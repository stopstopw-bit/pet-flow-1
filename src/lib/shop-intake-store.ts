import { getDirectoryDb } from "./supabase/server";
import { ensureMigration } from "./migrations";

/**
 * คำตอบแบบสอบถามเจ้าของร้านใหม่ (หน้า /shop-questions) — ใช้ตั้งค่าร้านก่อนเปิดใช้จริง
 *
 * เก็บระดับแพลตฟอร์ม (getDirectoryDb) — ตอบผ่านลิงก์ของร้าน (/s/<slug>/shop-questions) จะผูก tenant_id
 * ไว้ด้วย เพื่อเอาไปตั้งค่าร้านนั้นต่อ · ตอบผ่านลิงก์กลาง (/shop-questions) = ยังไม่ผูกร้าน
 * อ่านได้เฉพาะผู้ดูแลแพลตฟอร์ม (/platform) · id มาจากเบราว์เซอร์ผู้ตอบ
 * ส่งซ้ำหลังแก้คำตอบ = ทับแถวเดิม ไม่เกิดแถวซ้ำ
 */

export type ShopIntake = {
  id: string;
  /** ร้านในระบบที่คำตอบนี้เป็นของ — ว่าง = ตอบผ่านลิงก์กลาง ยังไม่ผูกร้าน */
  tenantId: string;
  shopName: string;
  text: string;
  answers: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type IntakeRow = {
  id: string;
  tenant_id: string | null;
  shop_name: string | null;
  text: string | null;
  answers: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

const mem: ShopIntake[] = [];

function rowToIntake(r: IntakeRow): ShopIntake {
  return {
    id: r.id,
    tenantId: r.tenant_id || "",
    shopName: r.shop_name || "",
    text: r.text || "",
    answers: r.answers || {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** ตาราง/คอลัมน์ยังไม่มี — DB ที่ยังไม่เคยรัน migration shop_intake.setup ฉบับล่าสุด */
function isMissingSchema(msg: string) {
  return /(shop_intake|tenant_id)/i.test(msg) && /(does not exist|could not find|schema cache|PGRST204|PGRST205|42P01|42703)/i.test(msg);
}

export async function saveShopIntake(input: {
  id: string;
  tenantId: string;
  shopName: string;
  text: string;
  answers: Record<string, unknown>;
}): Promise<void> {
  const now = new Date().toISOString();
  const sb = getDirectoryDb();
  if (!sb) {
    const i = mem.findIndex((x) => x.id === input.id);
    const row: ShopIntake = { ...input, createdAt: i >= 0 ? mem[i].createdAt : now, updatedAt: now };
    if (i >= 0) mem[i] = row;
    else mem.unshift(row);
    return;
  }
  const row = {
    id: input.id,
    tenant_id: input.tenantId || null,
    shop_name: input.shopName,
    text: input.text,
    answers: input.answers,
    updated_at: now,
  };
  // คำตอบที่ผูกกับร้านแล้ว ห้ามให้คำขอที่มาจากร้านอื่น (หรือไม่ระบุร้าน) เขียนทับ
  const { data: existing } = await sb.from("shop_intake").select("tenant_id").eq("id", input.id).maybeSingle();
  const owner = (existing as { tenant_id?: string | null } | null)?.tenant_id || null;
  if (owner && owner !== (input.tenantId || null)) throw new Error("intake_belongs_to_other_shop");
  let { error } = await sb.from("shop_intake").upsert(row);
  // ตาราง/คอลัมน์ยังไม่มี (ยังไม่เคยกดอัปเดตฐานข้อมูล) — สร้างให้เองแล้วลองใหม่ครั้งเดียว
  if (error && isMissingSchema(error.message) && (await ensureMigration("shop_intake.setup"))) {
    ({ error } = await sb.from("shop_intake").upsert(row));
  }
  if (error) throw new Error(error.message);
}

export async function listShopIntakes(): Promise<ShopIntake[]> {
  const sb = getDirectoryDb();
  if (!sb) return mem;
  const query = () =>
    sb
      .from("shop_intake")
      .select("id, tenant_id, shop_name, text, answers, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);
  let { data, error } = await query();
  // ตารางมีแต่ยังไม่มีคอลัมน์ tenant_id — เติมให้แล้วอ่านใหม่ครั้งเดียว
  if (error && /tenant_id/i.test(error.message) && isMissingSchema(error.message) && (await ensureMigration("shop_intake.setup"))) {
    ({ data, error } = await query());
  }
  if (error) {
    if (isMissingSchema(error.message)) return [];
    throw new Error(error.message);
  }
  return (data as IntakeRow[]).map(rowToIntake);
}

export async function deleteShopIntake(id: string): Promise<void> {
  const sb = getDirectoryDb();
  if (!sb) {
    const i = mem.findIndex((x) => x.id === id);
    if (i >= 0) mem.splice(i, 1);
    return;
  }
  const { error } = await sb.from("shop_intake").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getShopIntake(id: string): Promise<ShopIntake | null> {
  const sb = getDirectoryDb();
  if (!sb) return mem.find((x) => x.id === id) || null;
  const { data, error } = await sb
    .from("shop_intake")
    .select("id, tenant_id, shop_name, text, answers, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToIntake(data as IntakeRow) : null;
}

/** ย้ายคำตอบไปผูกกับร้านอื่น — ใช้ตอนส่งผ่านลิงก์ผิดร้าน */
export async function setShopIntakeTenant(id: string, tenantId: string): Promise<void> {
  const sb = getDirectoryDb();
  if (!sb) {
    const it = mem.find((x) => x.id === id);
    if (it) it.tenantId = tenantId;
    return;
  }
  const { error } = await sb.from("shop_intake").update({ tenant_id: tenantId || null }).eq("id", id);
  if (error) throw new Error(error.message);
}
