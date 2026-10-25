import { getSupabase } from "./supabase/server";
import { requireTenantId } from "./tenant-context";
import {
  copyPublicFileToPrivate,
  removePublicFiles,
  sensitivePublicPath,
} from "./supabase/storage";

/** คอลัมน์ที่เก็บ URL ไฟล์ส่วนตัวลูกค้า — ค่าอาจมีหลาย URL คั่นบรรทัด (รูปวัคซีน) */
const URL_COLUMNS: { table: string; column: string }[] = [
  { table: "cats", column: "photo_data_url" },
  { table: "customers", column: "id_card_url" },
  { table: "bookings", column: "consent_signature" },
  { table: "bookings", column: "vaccine_photo_url" },
  { table: "bookings", column: "deposit_slip_url" },
  { table: "finance_records", column: "receipt_url" },
  { table: "package_orders", column: "slip_url" },
];

type Moved = { url: string; oldPath: string };

async function moveText(value: string, done: string[]): Promise<string | null> {
  let changed = false;
  const parts = await Promise.all(
    value.split("\n").map(async (line) => {
      const moved: Moved | null = await copyPublicFileToPrivate(line.trim());
      if (!moved) return line;
      changed = true;
      done.push(moved.oldPath);
      return moved.url;
    })
  );
  return changed ? parts.join("\n") : null;
}

/**
 * ย้ายไฟล์ส่วนตัวลูกค้าของร้านปัจจุบันที่ยังอยู่ใน bucket สาธารณะ ไป bucket ส่วนตัว
 * (บัตรประชาชน, ลายเซ็น, ใบวัคซีน, สลิป, รูปบิล, รูป/อัลบั้มน้องแมว)
 * เรียกซ้ำได้ปลอดภัย — ของที่ย้ายแล้วเป็น /api/files/... จะถูกข้าม
 * ลบไฟล์เก่าจาก bucket สาธารณะเฉพาะแถวที่อัปเดตฐานข้อมูลสำเร็จแล้ว
 */
export async function privatizeTenantFiles(): Promise<{
  ok: boolean;
  moved: number;
  errors: string[];
}> {
  const sb = getSupabase();
  if (!sb) return { ok: false, moved: 0, errors: ["no-supabase"] };
  const tenantId = requireTenantId();
  const errors: string[] = [];
  let moved = 0;

  for (const { table, column } of URL_COLUMNS) {
    const { data, error } = await sb
      .from(table)
      .select(`id, ${column}`)
      .eq("tenant_id", tenantId)
      .like(column, "%/storage/v1/object/public/media/%");
    if (error) continue; // ตาราง/คอลัมน์ยังไม่มีในร้านนี้
    for (const row of (data as unknown as Record<string, string>[] | null) || []) {
      const done: string[] = [];
      try {
        const next = await moveText(row[column] || "", done);
        if (next === null) continue;
        const { error: upErr } = await sb
          .from(table)
          .update({ [column]: next })
          .eq("id", row.id)
          .eq("tenant_id", tenantId);
        if (upErr) throw new Error(upErr.message);
        await removePublicFiles(done);
        moved += done.length;
      } catch (e) {
        errors.push(`${table}.${column} ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // อัลบั้มน้องแมว (jsonb array ของ { dataUrl, ... })
  const { data: cats, error: catsErr } = await sb
    .from("cats")
    .select("id, media")
    .eq("tenant_id", tenantId)
    .not("media", "is", null);
  if (!catsErr) {
    for (const cat of (cats as { id: string; media: unknown }[] | null) || []) {
      if (!Array.isArray(cat.media)) continue;
      const items = cat.media as { dataUrl?: string }[];
      if (!items.some((m) => m?.dataUrl && sensitivePublicPath(m.dataUrl))) continue;
      const done: string[] = [];
      try {
        const next = await Promise.all(
          items.map(async (m) => {
            const r = m?.dataUrl ? await copyPublicFileToPrivate(m.dataUrl) : null;
            if (!r) return m;
            done.push(r.oldPath);
            return { ...m, dataUrl: r.url };
          })
        );
        const { error: upErr } = await sb
          .from("cats")
          .update({ media: next })
          .eq("id", cat.id)
          .eq("tenant_id", tenantId);
        if (upErr) throw new Error(upErr.message);
        await removePublicFiles(done);
        moved += done.length;
      } catch (e) {
        errors.push(`cats.media ${cat.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return { ok: errors.length === 0, moved, errors };
}
