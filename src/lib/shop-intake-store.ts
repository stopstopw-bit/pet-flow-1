import { getDirectoryDb } from "./supabase/server";
import { ensureMigration } from "./migrations";

/**
 * คำตอบแบบสอบถามเจ้าของร้านใหม่ (หน้า /shop-questions) — ใช้ตั้งค่าร้านก่อนเปิดใช้จริง
 *
 * เป็นข้อมูลระดับแพลตฟอร์ม ไม่ผูก tenant เพราะตอนตอบยังไม่มีร้านในระบบ
 * อ่านได้เฉพาะผู้ดูแลแพลตฟอร์ม (/platform) · id มาจากเบราว์เซอร์ผู้ตอบ
 * ส่งซ้ำหลังแก้คำตอบ = ทับแถวเดิม ไม่เกิดแถวซ้ำ
 */

export type ShopIntake = {
  id: string;
  shopName: string;
  text: string;
  answers: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type IntakeRow = {
  id: string;
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
    shopName: r.shop_name || "",
    text: r.text || "",
    answers: r.answers || {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function isMissingTable(msg: string) {
  return /shop_intake/i.test(msg) && /(does not exist|could not find|schema cache|PGRST205|42P01)/i.test(msg);
}

export async function saveShopIntake(input: {
  id: string;
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
    shop_name: input.shopName,
    text: input.text,
    answers: input.answers,
    updated_at: now,
  };
  let { error } = await sb.from("shop_intake").upsert(row);
  // ตารางยังไม่มี (ร้านยังไม่เคยกดอัปเดตฐานข้อมูล) — สร้างให้เองแล้วลองใหม่ครั้งเดียว
  if (error && isMissingTable(error.message) && (await ensureMigration("shop_intake.setup"))) {
    ({ error } = await sb.from("shop_intake").upsert(row));
  }
  if (error) throw new Error(error.message);
}

export async function listShopIntakes(): Promise<ShopIntake[]> {
  const sb = getDirectoryDb();
  if (!sb) return mem;
  const { data, error } = await sb
    .from("shop_intake")
    .select("id, shop_name, text, answers, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingTable(error.message)) return [];
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
