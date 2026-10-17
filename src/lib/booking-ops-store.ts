import { getSupabase } from "./supabase/server";
import { requireTenantId } from "./tenant-context";
import { ensureMigration } from "./migrations";

/**
 * งานหน้าร้านของแต่ละนัด — แยกตารางจาก bookings ไม่แตะคอลัมน์นัดเดิม
 *
 * - บอร์ดคิวอาบน้ำ: เวลาที่เริ่มทำ (groomStartedAt) = อยู่ช่อง "กำลังทำ" + ช่างที่รับเคส (groomer)
 *   ช่างคือ id ใน payroll_employees — ใช้คิดค่าคอมตอนสิ้นเดือน
 * - เช็คลิสต์ดูแลรายวันของน้องที่เข้าพัก: careChecks[วันที่][งาน] = เวลาที่ติ๊ก + คนติ๊ก
 */
export type CareCheck = { at: string; by?: string };

export type BookingOps = {
  bookingId: string;
  groomStartedAt?: string;
  groomer?: string;
  careChecks: Record<string, Record<string, CareCheck>>;
};

type OpsRow = {
  booking_id: string;
  groom_started_at: string | null;
  groomer: string | null;
  care_checks: Record<string, Record<string, CareCheck>> | null;
};

const mem = new Map<string, BookingOps>();

function rowToOps(r: OpsRow): BookingOps {
  return {
    bookingId: r.booking_id,
    groomStartedAt: r.groom_started_at || undefined,
    groomer: r.groomer || undefined,
    careChecks: r.care_checks && typeof r.care_checks === "object" ? r.care_checks : {},
  };
}

export async function listBookingOps(bookingIds?: string[]): Promise<BookingOps[]> {
  const sb = getSupabase();
  if (sb) {
    let q = sb.from("booking_ops").select("*").eq("tenant_id", requireTenantId());
    if (bookingIds) {
      if (bookingIds.length === 0) return [];
      q = q.in("booking_id", bookingIds);
    }
    const { data, error } = await q;
    if (error) return [];
    return ((data as OpsRow[] | null) || []).map(rowToOps);
  }
  const all = [...mem.values()];
  return bookingIds ? all.filter((o) => bookingIds.includes(o.bookingId)) : all;
}

async function getOps(bookingId: string): Promise<BookingOps> {
  const [found] = await listBookingOps([bookingId]);
  return found || { bookingId, careChecks: {} };
}

async function saveOps(o: BookingOps): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) {
    mem.set(o.bookingId, o);
    return true;
  }
  const row = {
    booking_id: o.bookingId,
    tenant_id: requireTenantId(),
    groom_started_at: o.groomStartedAt || null,
    groomer: o.groomer || null,
    care_checks: o.careChecks,
    updated_at: new Date().toISOString(),
  };
  let { error } = await sb.from("booking_ops").upsert(row);
  // ร้านที่ยังไม่ได้อัปเดตฐานข้อมูล — สร้างตารางให้เองแล้วลองอีกครั้ง
  if (error && (await ensureMigration("booking_ops.setup"))) {
    ({ error } = await sb.from("booking_ops").upsert(row));
  }
  return !error;
}

/** เริ่มทำ (ย้ายเข้าช่อง "กำลังทำ") / ย้อนกลับไปรอคิว — started=false ล้างเวลาเริ่ม */
export async function setGroomStarted(bookingId: string, started: boolean, groomer?: string) {
  const o = await getOps(bookingId);
  o.groomStartedAt = started ? o.groomStartedAt || new Date().toISOString() : undefined;
  if (groomer !== undefined) o.groomer = groomer || undefined;
  return saveOps(o);
}

export async function setGroomer(bookingId: string, groomer: string) {
  const o = await getOps(bookingId);
  o.groomer = groomer || undefined;
  return saveOps(o);
}

/** ติ๊ก/เอาติ๊กออก งานดูแล 1 อย่างของวันนั้น */
export async function setCareCheck(
  bookingId: string,
  date: string,
  taskId: string,
  done: boolean,
  by?: string
) {
  const o = await getOps(bookingId);
  const day = { ...(o.careChecks[date] || {}) };
  if (done) day[taskId] = { at: new Date().toISOString(), by };
  else delete day[taskId];
  o.careChecks = { ...o.careChecks, [date]: day };
  return saveOps(o);
}
