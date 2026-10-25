import { getDirectoryDb } from "./supabase/server";

/**
 * ระบบอัปเดตโครงสร้างฐานข้อมูลอัตโนมัติ (auto-migrate)
 * ------------------------------------------------------
 * แอปคุยกับ DB จริงผ่าน service key อยู่แล้ว แต่ supabase-js (PostgREST)
 * สั่ง DDL (ALTER TABLE) ตรงๆ ไม่ได้ จึงใช้ฟังก์ชัน exec_sql ใน DB เป็นตัวกลาง
 *
 * ตั้งค่าครั้งเดียว (ครั้งสุดท้ายที่ต้องแตะ SQL): รัน EXEC_SQL_BOOTSTRAP
 * ในหน้า SQL Editor ของ Supabase — สร้างฟังก์ชัน + ล็อกให้เรียกได้เฉพาะ
 * service role (ฝั่งเซิร์ฟเวอร์). หลังจากนั้นทุก migration จะรันเองผ่านปุ่ม
 * "อัปเดตฐานข้อมูล" หรืออัตโนมัติเมื่อเปิดหลังบ้าน.
 */

/** SQL ที่ผู้ใช้ต้องรันครั้งเดียวใน Supabase SQL Editor */
export const EXEC_SQL_BOOTSTRAP = `-- ตั้งค่าครั้งเดียว: ให้แอปอัปเดตฐานข้อมูลเองได้
create or replace function public.exec_sql(sql text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  execute sql;
end;
$$;

-- ล็อก: เรียกได้เฉพาะ service role (ฝั่งเซิร์ฟเวอร์เท่านั้น)
revoke all on function public.exec_sql(text) from public;
grant execute on function public.exec_sql(text) to service_role;

notify pgrst, 'reload schema';`;

/**
 * รายการ migration — ต้อง idempotent (รันซ้ำได้ ไม่พัง) เสมอ
 * ใช้ "add column if not exists" / "create table if not exists" เท่านั้น
 * เพิ่มฟีเจอร์ใหม่ที่ต้องใช้คอลัมน์ใหม่ → เพิ่มบรรทัดที่นี่ได้เลย
 */
/**
 * รายการที่ต้องมีจริงใน DB หลังรัน migration ครบ — ไว้ "ตรวจ" ว่าปุ่มอัปเดตทำงานจริง
 * ไม่ใช่แค่ตอบว่าสำเร็จ. เช็คด้วยการ select คอลัมน์นั้นแบบไม่เอาแถว (limit 0)
 * ถ้าคอลัมน์/ตารางหาย PostgREST จะฟ้องกลับมาเอง — อ่านได้โดยไม่ต้องมีสิทธิ์ DDL
 */
const SCHEMA_CHECKS: { table: string; column: string; feature: string }[] = [
  { table: "customers", column: "deposit_credit", feature: "เครดิตมัดจำ" },
  { table: "customers", column: "line_user_ids", feature: "ลูกค้าหลาย LINE" },
  { table: "customers", column: "id_card_url", feature: "บัตรประชาชนผู้ปกครอง" },
  { table: "cats", column: "staff_private_note", feature: "โน้ตลับร้าน" },
  { table: "bookings", column: "consent_accepted_at", feature: "กดยอมรับเงื่อนไข" },
  { table: "bookings", column: "care_note", feature: "โน้ตการดูแล" },
  { table: "invoices", column: "deleted_at", feature: "ถังขยะบิล" },
  { table: "finance_records", column: "excluded", feature: "ยอดยกมา (ไม่นับเป็นรายได้)" },
  { table: "customer_packages", column: "unit", feature: "คอร์สแบบนับคืน" },
  { table: "products", column: "tenant_id", feature: "สินค้าหน้าร้าน" },
  { table: "audit_logs", column: "action", feature: "ประวัติการใช้งาน" },
  { table: "broadcast_images", column: "content_type", feature: "รูปโปร (ทางสำรอง)" },
  { table: "birthday_greetings", column: "status", feature: "คิววันเกิดรอตรวจ" },
  { table: "bookings", column: "flea_tick_treated", feature: "หลักฐานหยดยาเห็บหมัด" },
  { table: "bookings", column: "room_unit", feature: "ระบุห้องจริงตอนจอง" },
  { table: "room_plans", column: "payments", feature: "แพ็กห้องรายเดือน (แบ่งจ่าย)" },
  { table: "customer_packages", column: "room_type", feature: "คอร์สคืนผูกประเภทห้อง" },
  { table: "invoice_docs", column: "receipt_no", feature: "ใบเสร็จ/ใบเสนอราคาในนามบริษัท" },
  { table: "pos_products", column: "image_url", feature: "POS สินค้า/สต็อก" },
  { table: "pos_sales", column: "method", feature: "POS บิลขายหน้าร้าน" },
  { table: "pos_closings", column: "counted_cash", feature: "POS ปิดยอดรายวัน" },
  { table: "customer_packages", column: "groom_program", feature: "คอร์สอาบน้ำแยกตามโปรแกรม" },
  { table: "bookings", column: "transport", feature: "บริการรับ-ส่งในนัด" },
  { table: "bookings", column: "deposit_status", feature: "มัดจำ + สลิปตอนลูกค้าจองเอง" },
  { table: "booking_ops", column: "care_checks", feature: "บอร์ดคิวอาบน้ำ + เช็คลิสต์ดูแลรายวัน" },
  { table: "payroll_employees", column: "groom_commission_pct", feature: "เงินเดือน + ค่าคอมพนักงาน" },
  { table: "cats", column: "vaccine_photos", feature: "สมุดวัคซีนที่ตัวน้อง (ขอก่อนมีนัด)" },
  { table: "customers", column: "consent_accepted_at", feature: "ยอมรับข้อตกลงจากหน้าลูกค้า" },
  { table: "cats", column: "species", feature: "น้องแต่ละตัวเป็นหมาหรือแมว" },
  { table: "member_topups", column: "source_invoice_id", feature: "ยกเลิกนัด เก็บยอดเป็นเครดิต" },
  { table: "cats", column: "neutered", feature: "ทำหมันแล้ว/ยังไม่ทำ" },
  { table: "cats", column: "seizure_history", feature: "ประวัติการชัก/ช็อค และการแพ้" },
];

export type SchemaCheckRow = {
  table: string;
  column: string;
  feature: string;
  ok: boolean;
  error?: string;
};

/** ตรวจว่าโครงสร้างจริงใน DB ครบตามที่โค้ดต้องใช้ไหม (อ่านอย่างเดียว ไม่แก้อะไร) */
export async function checkSchema(): Promise<{
  ok: boolean;
  connected: boolean;
  rows: SchemaCheckRow[];
}> {
  const sb = getDirectoryDb();
  if (!sb) return { ok: false, connected: false, rows: [] };

  const rows: SchemaCheckRow[] = [];
  for (const c of SCHEMA_CHECKS) {
    const { error } = await sb.from(c.table).select(c.column).limit(0);
    rows.push({ ...c, ok: !error, error: error?.message });
  }
  return { ok: rows.every((r) => r.ok), connected: true, rows };
}

export const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "customers.deposit_credit",
    sql: "alter table customers add column if not exists deposit_credit numeric not null default 0;",
  },
  {
    name: "cats.staff_private_note",
    sql: "alter table cats add column if not exists staff_private_note text;",
  },
  {
    name: "bookings.consent_accepted_at",
    sql: "alter table bookings add column if not exists consent_accepted_at timestamptz;",
  },
  {
    name: "bookings.care_note",
    sql: "alter table bookings add column if not exists care_note text;",
  },
  {
    name: "invoices.deleted_at",
    sql: "alter table invoices add column if not exists deleted_at timestamptz;",
  },
  {
    name: "customers.deleted_at",
    sql: "alter table customers add column if not exists deleted_at timestamptz;",
  },
  {
    name: "bookings.arrival_time",
    sql: "alter table bookings add column if not exists arrival_time text;",
  },
  {
    name: "bookings.pickup_time",
    sql: "alter table bookings add column if not exists pickup_time text;",
  },
  {
    name: "invoices.deposit_received_at",
    sql: "alter table invoices add column if not exists deposit_received_at timestamptz;",
  },
  {
    name: "bookings.groom_health_info",
    sql: "alter table bookings add column if not exists groom_health_info text;",
  },
  {
    name: "cats.groom_health_info",
    sql: "alter table cats add column if not exists groom_health_info text;",
  },
  // ── ฟอร์มลงทะเบียนสมาชิก (ผู้ปกครอง + น้องแมว) ──
  {
    name: "customers.registration_details",
    sql: "alter table customers add column if not exists email text, add column if not exists birthday date, add column if not exists marketing_consent boolean not null default true, add column if not exists referral_source text;",
  },
  {
    name: "cats.registration_details",
    sql: "alter table cats add column if not exists gender text, add column if not exists breed text, add column if not exists age text, add column if not exists medical text;",
  },
  {
    name: "cats.birthday",
    sql: "alter table cats add column if not exists birthday date;",
  },
  {
    name: "cats.age_structured",
    sql: "alter table cats add column if not exists age_value integer, add column if not exists age_unit text, add column if not exists age_as_of date;",
  },
  // ── ระบบคูปอง + ชวนเพื่อน ──
  {
    name: "customers.referral_code",
    sql: "alter table customers add column if not exists referral_code text, add column if not exists referred_by text;",
  },
  {
    name: "coupons.table",
    sql: "create table if not exists coupons (id text primary key, code text, customer_id text, amount numeric not null default 0, reason text, status text not null default 'active', expires_at timestamptz, used_at timestamptz, used_invoice_id text, created_at timestamptz not null default now());",
  },
  {
    name: "coupons.offer_id",
    sql: "alter table coupons add column if not exists offer_id text;",
  },
  {
    name: "coupon_offers.table",
    sql: "create table if not exists coupon_offers (id text primary key, title text, amount numeric not null default 0, reason text, valid_days integer not null default 60, active boolean not null default true, created_at timestamptz not null default now());",
  },
  {
    name: "customer_packages.table",
    sql: "create table if not exists customer_packages (id text primary key, customer_id text, name text, total_uses integer not null default 0, used_uses integer not null default 0, price numeric not null default 0, status text not null default 'active', created_at timestamptz not null default now());",
  },
  {
    name: "cats.media",
    sql: "alter table cats add column if not exists media jsonb not null default '[]'::jsonb;",
  },
  {
    name: "chat_watch.table",
    sql: "create table if not exists chat_watch (line_user_id text primary key, last_message_at timestamptz, last_notified_at timestamptz);",
  },
  {
    name: "bookings.consent_signature",
    sql: "alter table bookings add column if not exists consent_signature text;",
  },
  {
    // หลักฐานตอนยอมรับข้อตกลงก่อนเข้าพัก — รูปสมุดวัคซีน + ยืนยันว่าหยดยาเห็บหมัดมาแล้ว
    // ไว้ใช้อ้างอิงถ้าพบเห็บหมัดตอนน้องเข้าพักอยู่ที่ร้าน
    name: "bookings.vaccine_flea_consent",
    sql: `
      alter table bookings add column if not exists vaccine_photo_url text;
      alter table bookings add column if not exists flea_tick_treated boolean not null default false;
    `,
  },
  {
    name: "cats.fur_length",
    sql: "alter table cats add column if not exists fur_length text;",
  },
  {
    name: "customers.address",
    sql: "alter table customers add column if not exists address text, add column if not exists address_map_url text;",
  },
  {
    name: "customers.postal_code",
    sql: "alter table customers add column if not exists postal_code text;",
  },
  {
    // ขอบิล/ใบกำกับภาษีเต็มรูป (นิติบุคคลหรือบุคคลธรรมดา) — ติ๊กตอนสมัคร / แก้ในหลังบ้าน
    name: "customers.tax_invoice",
    sql: "alter table customers add column if not exists tax_invoice jsonb;",
  },
  {
    name: "articles.table",
    sql: "create table if not exists articles (id text primary key, slug text not null, title text not null, description text, body text, cover_url text, emoji text, published boolean not null default true, date_published date, created_at timestamptz not null default now());",
  },
  {
    name: "staff_users.table",
    sql: "create table if not exists staff_users (id text primary key, name text not null, code text not null, menus jsonb not null default '[]'::jsonb, active boolean not null default true, created_at timestamptz not null default now());",
  },
  {
    // ย้ายจากล็อกอินด้วยรหัส PIN (code) มาเป็น username+password ต่อร้าน — ตารางเดิม (โหมดเดี่ยว
    // ก่อนมี multi-tenant) ยังไม่มีคอลัมน์พวกนี้เลย ทำให้เพิ่มพนักงานไม่ได้ (insert ชน code NOT NULL)
    name: "staff_users.tenant_login_columns",
    sql: "alter table staff_users add column if not exists tenant_id text, add column if not exists username text, add column if not exists password_hash text, add column if not exists password_salt text;",
  },
  {
    // code (PIN เดิม) เลิกใช้แล้ว แต่ตารางเก่ายังตั้ง NOT NULL ไว้ — insert แถวใหม่ที่ไม่มี code จะชน constraint นี้
    name: "staff_users.code_nullable",
    sql: "alter table staff_users alter column code drop not null;",
  },
  {
    name: "cats.color",
    sql: "alter table cats add column if not exists color text;",
  },
  {
    // น้ำหนักน้อง (กก.) — กรอกตอนสมัครสมาชิก / แก้ในหลังบ้าน
    name: "cats.weight_kg",
    sql: "alter table cats add column if not exists weight_kg numeric;",
  },
  {
    // หมาหรือแมว ของน้องแต่ละตัว — ร้านที่รับทั้งสองแบบ
    name: "cats.species",
    sql: "alter table cats add column if not exists species text;",
  },
  {
    // รายชื่อข้อความอัตโนมัติที่ "นัดนี้" ไม่ต้องส่ง (ปิดเป็นรายเคส ไม่ใช่ปิดทั้งร้าน)
    name: "bookings.auto_off",
    sql: "alter table bookings add column if not exists auto_off text[] not null default array[]::text[];",
  },
  {
    // นัดที่ลูกค้าจองเองผ่านแอป — ต้องรอร้านยืนยัน (ลูกค้ายืนยันเองไม่ได้)
    name: "bookings.self_booked",
    sql: "alter table bookings add column if not exists self_booked boolean not null default false;",
  },
  {
    // โปรแกรมอาบน้ำที่เลือกไว้ตอนจอง (id ใน GROOM_PROGRAMS) — ให้ลิงก์ไปการ์ดแจ้งเตือน + ออกบิลได้เลย ไม่ต้องถามซ้ำ
    name: "bookings.groom_program",
    sql: "alter table bookings add column if not exists groom_program text;",
  },
  {
    // ยอดยกมาจากระบบเก่า — ไม่ใช่รายรับเดือนนี้ ต้องแยกได้ว่าเติมครั้งไหนเป็นยอดยกมา
    name: "member_topups.is_legacy",
    sql: "alter table member_topups add column if not exists is_legacy boolean not null default false;",
  },
  {
    // แพ็กเกจที่เปิดขายในแอปลูกค้า (ร้านตั้งเองว่าจะขายอะไรบ้าง)
    name: "package_offers.table",
    sql: "create table if not exists package_offers (id text primary key, name text, total_uses integer not null default 0, price numeric not null default 0, description text, active boolean not null default true, created_at timestamptz not null default now());",
  },
  {
    // ออร์เดอร์ที่ลูกค้ากดซื้อ — รอร้านยืนยันรับเงินก่อนถึงจะกลายเป็นคอร์สจริง
    name: "package_orders.table",
    sql: "create table if not exists package_orders (id text primary key, customer_id text, customer_name text, line_user_id text, offer_id text, name text, total_uses integer not null default 0, price numeric not null default 0, status text not null default 'pending', slip_url text, package_id text, created_at timestamptz not null default now(), paid_at timestamptz);",
  },
  {
    name: "package_orders.status_idx",
    sql: "create index if not exists package_orders_status_idx on package_orders(status);",
  },
  {
    // รูปหน้าปกคอร์สที่ลูกค้าเห็นในแอป
    name: "package_offers.image_url",
    sql: "alter table package_offers add column if not exists image_url text;",
  },
  {
    // ขายได้ 2 แบบ: "package" (คอร์ส N ครั้ง) หรือ "credit" (เติมเครดิต Member เป็นยอดเงิน)
    // credit_amount = เครดิตที่ลูกค้าจะได้รับ (ตั้งสูงกว่า price ได้เพื่อแถมโบนัส เช่น จ่าย 1000 ได้ 1200)
    name: "package_offers.kind_credit",
    sql: "alter table package_offers add column if not exists kind text not null default 'package', add column if not exists credit_amount numeric;",
  },
  {
    // ก๊อปชนิด+ยอดเครดิต ณ ตอนสั่งซื้อ ไว้ในออร์เดอร์เหมือน total_uses/price — กันร้านแก้ offer ทีหลังแล้วออร์เดอร์เก่าเพี้ยน
    name: "package_orders.kind_credit",
    sql: "alter table package_orders add column if not exists kind text not null default 'package', add column if not exists credit_amount numeric;",
  },
  {
    // คอร์สที่บิลนี้หักไป 1 ครั้ง — ใช้โชว์ประวัติการใช้คอร์ส + คืนครั้งตอนยกเลิกบิล
    name: "invoices.package_id",
    sql: "alter table invoices add column if not exists package_id text;",
  },
  {
    // รูปบิล/ใบเสร็จที่แนบกับรายการเงิน — หลักฐานตอนยื่นภาษี
    name: "finance_records.receipt_url",
    sql: "alter table finance_records add column if not exists receipt_url text;",
  },
  {
    // รูปบัตรประชาชนผู้ปกครอง (ลงทะเบียนเข้าพัก) — ผูกกับลูกค้า แนบครั้งเดียวใช้ได้ทุกรอบ
    name: "customers.id_card_url",
    sql: "alter table customers add column if not exists id_card_url text;",
  },
  {
    // ล้างของเก่า: ตัดบรรทัด "ของแถมฟรี" (ขึ้นต้นด้วย 🎁) ที่เคยหลุดไปฝัง
    // ในโน้ตนิสัยแมว ออกให้หมด — ของแถมต้องผูกกับการจองแต่ละรอบ ไม่ใช่ข้อมูลถาวรของแมว
    // idempotent: พอล้างแล้วไม่มี 🎁 เหลือ WHERE ก็ไม่ match อะไร รันซ้ำได้
    // (รันด้วย service role ข้าม RLS → ล้างให้ทุกร้านทีเดียว)
    name: "cats.strip_freebie_from_staff_note",
    sql: `update cats
set staff_note = nullif(
  array_to_string(
    array(
      select l
      from unnest(string_to_array(staff_note, E'\\n')) as l
      where btrim(l) not like '🎁%'
    ),
    E'\\n'
  ),
  ''
)
where staff_note like '%🎁%';`,
  },
  {
    // LINE User ID ทุกตัวของลูกค้าคนเดียว (คอม/มือถือคนละ Provider ได้ ID คนละตัว)
    name: "customers.line_user_ids",
    sql: "alter table customers add column if not exists line_user_ids text[];",
  },
  {
    // สินค้าขายหน้าร้าน (ของกิน/ทราย/ของเล่น) — แยกจากคอร์ส/แพ็กเกจ เพราะมีสต็อกนับจำนวนได้
    name: "products.table",
    sql: "create table if not exists products (id text primary key, tenant_id text not null, name text not null, category text not null default '', price numeric not null default 0, image_url text, stock_count integer not null default 0, active boolean not null default true, created_at timestamptz not null default now());",
  },
  {
    name: "products.tenant_idx",
    sql: "create index if not exists products_tenant_idx on products(tenant_id);",
  },
  {
    // แจ้งเตือน "ลูกค้ารอเกิน 10 นาที" เดิมนับจากช่องว่างระหว่างข้อความล่าสุด 2 อันของลูกค้า
    // (ผิด — ยิงทุกครั้งที่ลูกค้าทักห่างกันเกิน 10 นาที ไม่ว่าจะเคยตอบไปแล้วหรือไม่)
    // คอลัมน์นี้ไว้จับ "เวลาที่เริ่มเงียบจริงๆ" ของแต่ละรอบสนทนา นับ 10 นาทีจากจุดนี้แทน
    // คอร์สแบบ "ซื้อวันเข้าพัก" — หักตามจำนวนคืนที่พักจริง ไม่ใช่ 1 ครั้งต่อบิล
    // unit บอกว่า 1 หน่วยของคอร์สคือ ครั้ง หรือ คืน (คอร์สเดิมทั้งหมด = ครั้ง)
    // package_units จำว่าบิลนั้นหักไปกี่หน่วย เพื่อคืนให้ครบตอนยกเลิกบิล
    /**
     * เปิด Row Level Security ทุกตารางใน public
     *
     * แอปต่อ Supabase ด้วย service_role จากฝั่งเซิร์ฟเวอร์เท่านั้น (ไม่มี anon key
     * ในโค้ดเลย) และ service_role ข้าม RLS อยู่แล้ว — เปิดตรงนี้จึงไม่กระทบการทำงาน
     *
     * แต่ทุกโปรเจกต์ Supabase มี anon key ติดมาด้วยเสมอ และ URL ของโปรเจกต์อยู่ใน
     * โค้ดฝั่งเบราว์เซอร์ ถ้า anon key หลุดออกไปเมื่อไหร่ (ภาพหน้าจอ/คอมมิตเก่า)
     * ตารางที่ไม่ได้เปิด RLS จะถูกอ่านและแก้ได้ทั้งหมด — ชื่อ เบอร์ ที่อยู่ลูกค้า บัญชีเงิน
     *
     * เปิด RLS โดยไม่สร้าง policy ใดๆ = ปฏิเสธทุกคนที่ไม่ใช่ service_role
     */
    name: "public.enable_rls_all",
    sql: `
      do $$
      declare t record;
      begin
        for t in
          select tablename from pg_tables where schemaname = 'public'
        loop
          execute format('alter table public.%I enable row level security', t.tablename);
        end loop;
      end $$;
    `,
  },
  {
    // บันทึกว่าใครทำอะไรกับเงิน/สิทธิ์ลูกค้า — ร้านที่มีพนักงานหลายคนจะไล่ย้อนได้
    name: "audit_logs.table",
    sql: `
      create table if not exists audit_logs (
        id bigserial primary key,
        actor text not null default '',
        action text not null,
        resource_type text not null,
        resource_id text,
        detail jsonb,
        created_at timestamptz not null default now()
      );
      create index if not exists audit_logs_created_idx on audit_logs (created_at desc);
    `,
  },
  {
    // ที่เก็บรูป broadcast สำรอง — ปกติรูปขึ้น Supabase Storage แต่ถ้าอัปไม่สำเร็จ
    // โค้ดจะถอยมาเก็บ base64 ในตารางนี้แล้วเสิร์ฟผ่าน /api/line/broadcast-image/[id]
    // ถ้าไม่มีตาราง ทางถอยจะไปตกที่หน่วยความจำของ instance เดียว แล้ว LINE
    // ดึงรูปไม่เจอ = ยิงโปรออกไปแบบรูปเสีย โดยไม่มีใครรู้
    name: "broadcast_images.table",
    sql: `
      create table if not exists broadcast_images (
        id uuid primary key,
        data text not null,
        content_type text not null default 'image/jpeg',
        created_at timestamptz not null default now()
      );
      create index if not exists broadcast_images_created_idx on broadcast_images (created_at desc);
    `,
  },
  {
    // คิววันเกิดรอตรวจก่อนส่ง — cron คัดกรองแล้วจอดที่นี่ ไม่ยิง LINE เอง
    // ต้องมีคนกดอนุมัติที่ /admin/birthdays ก่อน ถึงจะส่งจริง+แจกคูปอง
    name: "birthday_greetings.table",
    sql: `
      create table if not exists birthday_greetings (
        id text primary key,
        tenant_id text not null,
        customer_id text not null,
        customer_name text not null default '',
        kind text not null default 'cat',
        cat_name text,
        for_date text not null,
        status text not null default 'pending',
        created_at timestamptz not null default now(),
        sent_at timestamptz
      );
      create index if not exists birthday_greetings_tenant_idx on birthday_greetings (tenant_id);
      create index if not exists birthday_greetings_status_idx on birthday_greetings (status);
      create unique index if not exists birthday_greetings_dedup_idx
        on birthday_greetings (tenant_id, customer_id, for_date);
    `,
  },
  {
    // ยอดยกมาจากระบบเก่า / รายการที่ไม่ใช่เงินเข้า-ออกจริง — เก็บแถวไว้ แต่ไม่นับในยอดสรุป
    name: "finance.excluded",
    sql: "alter table finance_records add column if not exists excluded boolean not null default false;",
  },
  {
    name: "packages.night_unit",
    sql: `
      alter table customer_packages add column if not exists unit text not null default 'use';
      alter table invoices add column if not exists package_units integer;
    `,
  },
  {
    name: "chat_watch.first_unanswered_at",
    sql: "alter table chat_watch add column if not exists first_unanswered_at timestamptz;",
  },
  {
    // ห้องจริงที่ปักหมุดไว้ตอนจอง (เลข 1..จำนวนห้องของประเภทนั้น)
    name: "bookings.room_unit",
    sql: "alter table bookings add column if not exists room_unit integer;",
  },
  {
    // เติมความจุห้อง + สูตรห้องเชื่อม ให้ร้านที่ตั้งค่าห้องไว้ก่อนจะมีสองฟิลด์นี้
    //
    // ก่อนหน้านี้ระบบเดาความจุจากข้อความโฆษณา ("แมวที่ 2 +50") ซึ่งใช้ได้เฉพาะร้านที่
    // เขียนแบบนั้น พอเปลี่ยนมาใช้ค่าที่ตั้งไว้จริง ร้านเดิมจะกลายเป็นจุห้องละ 1 ตัว
    // และห้องเชื่อมจะไม่รู้ว่ากินห้องจริงกี่ห้อง — เติมค่าที่ถูกต้องกลับให้
    //
    // จับคู่ด้วย id ห้อง จึงแตะเฉพาะร้านที่ใช้ชุดห้องนี้จริง และข้ามไปถ้าเคยเติมแล้ว
    name: "site_config.room_capacity_backfill",
    sql: `
      update site_config sc
      set data = jsonb_set(sc.data, '{rooms}', (
        select jsonb_agg(
          case r->>'id'
            when 'mini-meow' then r || '{"maxCats":2}'::jsonb
            when 'mid-cozy'  then r || '{"maxCats":3}'::jsonb
            when 'catflix'   then r || '{"maxCats":4}'::jsonb
            when 'mini-duo'  then r || '{"maxCats":4,"composedOf":[{"typeId":"mini-meow","units":2}]}'::jsonb
            when 'cozy-duo'  then r || '{"maxCats":5,"composedOf":[{"typeId":"mid-cozy","units":2}]}'::jsonb
            when 'cat-tower' then r || '{"maxCats":5,"composedOf":[{"typeId":"mini-meow","units":1},{"typeId":"mid-cozy","units":1}]}'::jsonb
            else r
          end order by idx
        )
        from jsonb_array_elements(sc.data->'rooms') with ordinality as t(r, idx)
      ))
      where sc.data ? 'rooms'
        and jsonb_typeof(sc.data->'rooms') = 'array'
        and exists (
          select 1 from jsonb_array_elements(sc.data->'rooms') e where e->>'id' = 'mini-meow'
        )
        and not exists (
          select 1 from jsonb_array_elements(sc.data->'rooms') e where e ? 'maxCats'
        );
    `,
  },
  {
    // แพ็กห้องรายเดือน — ลูกค้าเลือกห้องแต่ละประเภทกี่คืน ลดราคา แบ่งจ่ายเป็นงวดได้
    // คอร์สคืนผูกประเภทห้อง: หักได้เฉพาะตอนพักห้องประเภทนั้น
    name: "room_plans.setup",
    sql: `
      alter table customer_packages add column if not exists room_type text, add column if not exists room_label text, add column if not exists plan_id text;
      create table if not exists room_plans (id text primary key, tenant_id text not null, customer_id text, customer_name text, line_user_id text, name text, items jsonb not null default '[]'::jsonb, full_price numeric not null default 0, discount_pct numeric not null default 0, price numeric not null default 0, installments integer not null default 1, payments jsonb not null default '[]'::jsonb, status text not null default 'active', created_at timestamptz not null default now());
      alter table room_plans add column if not exists tenant_id text;
      create index if not exists room_plans_tenant_idx on room_plans (tenant_id, customer_id);
      alter table room_plans enable row level security;
    `,
  },
  {
    // เอกสารทางการของบิล: ข้อมูลผู้ซื้อ (ในนามบริษัท) + เลขที่ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ
    // แยกตารางจาก invoices — ไม่แตะคอลัมน์บิลเดิม เลขที่ออกครั้งเดียวแล้วคงที่
    name: "invoice_docs.setup",
    sql: `
      create table if not exists invoice_docs (invoice_id text primary key, tenant_id text not null, customer_id text, buyer jsonb, quote_no text, quote_at timestamptz, invoice_no text, invoice_at timestamptz, receipt_no text, receipt_at timestamptz, note text, updated_at timestamptz not null default now());
      alter table invoice_docs add column if not exists tenant_id text;
      create index if not exists invoice_docs_customer_idx on invoice_docs (tenant_id, customer_id);
      alter table invoice_docs enable row level security;
    `,
  },
  {
    // คอร์สนับครั้งผูกโปรแกรมอาบน้ำ (อาบน้ำ 10 ครั้ง / สปา 5 ครั้ง) — ว่าง = คอร์สแบบเดิม
    // ร้านตั้งคอร์สในแอปผูกโปรแกรมได้ด้วย ออร์เดอร์ก๊อปโปรแกรมไว้ ณ ตอนสั่ง
    name: "packages.groom_program",
    sql: `
      alter table customer_packages add column if not exists groom_program text;
      alter table package_offers add column if not exists groom_program text;
      alter table package_orders add column if not exists groom_program text;
    `,
  },
  {
    // บริการรับ-ส่งของนัด {pickup, dropoff, mapUrl, address} — ว่าง = ลูกค้ามาเอง
    name: "bookings.transport",
    sql: "alter table bookings add column if not exists transport jsonb;",
  },
  {
    // มัดจำตอนลูกค้าจองเอง — ยอด (บาท, ของทั้งกลุ่มที่จองพร้อมกัน), ลิงก์สลิป, สถานะ none | pending_review | paid
    name: "bookings.deposit",
    sql: "alter table bookings add column if not exists deposit_amount numeric, add column if not exists deposit_slip_url text, add column if not exists deposit_status text;",
  },
  {
    // POS หน้าร้าน: สินค้า+สต็อก, ประวัติสต็อก, บิลขายเร็ว, ปิดยอดรายวัน — ตารางใหม่ทั้งหมด
    name: "pos.setup",
    sql: `
      create table if not exists pos_products (id text primary key, tenant_id text not null, name text not null, sku text, category text, price numeric not null default 0, cost numeric, track_stock boolean not null default true, stock integer not null default 0, low_stock integer, active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
      alter table pos_products add column if not exists image_url text;
      create index if not exists pos_products_sku_idx on pos_products (tenant_id, sku);
      create table if not exists pos_stock_moves (id text primary key, tenant_id text not null, product_id text not null, qty integer not null, reason text not null, ref_id text, note text, created_at timestamptz not null default now());
      create index if not exists pos_stock_moves_product_idx on pos_stock_moves (product_id, created_at desc);
      create table if not exists pos_sales (id text primary key, tenant_id text not null, no text not null, date date not null, items jsonb not null default '[]'::jsonb, subtotal numeric not null default 0, discount numeric not null default 0, total numeric not null default 0, method text not null, cash_received numeric, change numeric, customer_id text, customer_name text, note text, status text not null default 'paid', created_at timestamptz not null default now(), voided_at timestamptz);
      create index if not exists pos_sales_date_idx on pos_sales (tenant_id, date, created_at desc);
      create table if not exists pos_closings (id text primary key, tenant_id text not null, date date not null, expected_cash numeric not null default 0, counted_cash numeric not null default 0, diff numeric not null default 0, opening_cash numeric not null default 0, totals jsonb, note text, created_at timestamptz not null default now());
      create unique index if not exists pos_closings_tenant_date_idx on pos_closings (tenant_id, date);
      alter table pos_products enable row level security;
      alter table pos_stock_moves enable row level security;
      alter table pos_sales enable row level security;
      alter table pos_closings enable row level security;
    `,
  },
  {
    // ย้ายสินค้าจากหน้า "สินค้าหน้าร้าน" เดิม (ตาราง products) เข้า POS — ใช้ id เดิม
    // บิลเก่าที่ผูก productId ไว้จึงยังคืน/ตัดสต็อกถูกตัว · ซ้ำได้ (ข้ามแถวที่ย้ายแล้ว)
    name: "pos.import_products",
    sql: `
      do $$
      begin
        if to_regclass('public.products') is not null then
          insert into pos_products (id, tenant_id, name, category, price, image_url, track_stock, stock, active, created_at, updated_at)
          select id, tenant_id, name, nullif(category, ''), price, image_url, true, greatest(stock_count, 0), active, created_at, now()
          from products
          where tenant_id is not null
          on conflict (id) do nothing;
        end if;
      end $$;
    `,
  },
  {
    // บอร์ดคิวอาบน้ำ (เริ่มทำ/ช่างที่รับ) + เช็คลิสต์ดูแลรายวันของน้องที่เข้าพัก — แยกจาก bookings
    name: "booking_ops.setup",
    sql: `
      create table if not exists booking_ops (booking_id text primary key, tenant_id text not null, groom_started_at timestamptz, groomer text, care_checks jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
      alter table booking_ops add column if not exists tenant_id text;
      create index if not exists booking_ops_tenant_idx on booking_ops (tenant_id);
      alter table booking_ops enable row level security;
    `,
  },
  {
    // เงินเดือน + ค่าคอมพนักงาน — แยกตารางเพราะ site_config เปิดให้แอปลูกค้าอ่าน
    name: "payroll_employees.setup",
    sql: `
      create table if not exists payroll_employees (id text primary key, tenant_id text not null, name text not null, base_salary numeric not null default 0, groom_commission_pct numeric not null default 0, groom_commission_per_cat numeric not null default 0, active boolean not null default true, created_at timestamptz not null default now());
      alter table payroll_employees add column if not exists tenant_id text;
      create index if not exists payroll_employees_tenant_idx on payroll_employees (tenant_id);
      alter table payroll_employees enable row level security;
    `,
  },
  {
    // คำตอบแบบสอบถามเจ้าของร้านใหม่ (/shop-questions) — ระดับแพลตฟอร์ม ยังไม่ผูกกับร้านไหน
    name: "shop_intake.setup",
    sql: `
      create table if not exists shop_intake (id text primary key, shop_name text, answers jsonb not null default '{}'::jsonb, text text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
      create index if not exists shop_intake_updated_idx on shop_intake (updated_at desc);
      alter table shop_intake add column if not exists tenant_id text;
      alter table shop_intake enable row level security;
    `,
  },
  {
    // วันครบกำหนดจ่ายค่าบริการรายเดือนของร้าน — ถึงวันนี้แล้วยังไม่จ่าย = ร้านถูกระงับอัตโนมัติ
    name: "tenants.due_date",
    sql: "alter table tenants add column if not exists due_date date;",
  },
  {
    // โดเมนของร้านเอง (เช่น catcha.com) — middleware ใช้หาร้านจากชื่อโดเมน ดู tenant-domain.ts
    // ห้ามซ้ำ: โดเมนเดียวชี้ได้ร้านเดียวเท่านั้น
    name: "tenants.custom_domain",
    sql: `
      alter table tenants add column if not exists custom_domain text;
      create unique index if not exists tenants_custom_domain_key on tenants (custom_domain) where custom_domain is not null;
    `,
  },
  {
    // ค่าบริการ PetFlow — ราคา/บัญชีรับเงิน (platform_settings) + สลิปที่ร้านส่งมาให้อนุมัติ (tenant_payments)
    name: "subscriptions.setup",
    sql: `
      alter table tenants add column if not exists due_date date;
      create table if not exists platform_settings (key text primary key, value jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
      alter table platform_settings enable row level security;
      create table if not exists tenant_payments (id text primary key, tenant_id text not null, plan text not null, amount numeric not null default 0, slip_url text, note text, status text not null default 'pending', due_before date, due_after date, decided_note text, created_at timestamptz not null default now(), decided_at timestamptz);
      create index if not exists tenant_payments_status_idx on tenant_payments (status, created_at desc);
      create index if not exists tenant_payments_tenant_idx on tenant_payments (tenant_id, created_at desc);
      alter table tenant_payments enable row level security;
    `,
  },
  {
    // ทุกร้านแยกขาดจากกัน — username พนักงานห้ามซ้ำแค่ "ในร้านเดียวกัน" (เดิมห้ามซ้ำทั้งแพลตฟอร์ม
    // ร้านหนึ่งตั้ง demo แล้วอีกร้านตั้ง demo ไม่ได้) ล็อกอินหาร้านจากลิงก์ /s/<slug>/admin/login แทน
    name: "staff_users.username_per_shop",
    sql: `
      alter table staff_users drop constraint if exists staff_users_username_key;
      drop index if exists staff_users_username_key;
      create unique index if not exists staff_users_tenant_username_key on staff_users (tenant_id, username);
    `,
  },
  {
    // username เจ้าของร้านก็เหมือนกัน — ห้ามซ้ำในร้านตัวเองเท่านั้น (ร้านละคนอยู่แล้ว) ไม่บังคับข้ามร้าน
    name: "tenants.owner_username_per_shop",
    sql: `
      alter table tenants drop constraint if exists tenants_owner_username_key;
      drop index if exists tenants_owner_username_key;
      create index if not exists tenants_owner_username_idx on tenants (owner_username);
    `,
  },
  {
    // ฐานที่สร้างจาก schema.sql รุ่นแรกยังบังคับ LINE ID ห้ามซ้ำทั้งแพลตฟอร์ม — ลูกค้าคนเดียวกัน
    // สมัครสองร้านไม่ได้ เปลี่ยนเป็นห้ามซ้ำต่อร้าน
    name: "customers.line_user_per_shop",
    sql: `
      create unique index if not exists customers_tenant_line_user_key on customers (tenant_id, line_user_id);
      alter table customers drop constraint if exists customers_line_user_id_key;
      drop index if exists customers_line_user_id_key;
    `,
  },
  {
    // ขอสมุดวัคซีน / ข้อตกลง จากหน้าข้อมูลลูกค้า ก่อนลงนัด — เก็บที่ตัวน้อง/ลูกค้า
    name: "cats.vaccine_photos+customers.consent",
    sql: `
      alter table cats add column if not exists vaccine_photos text, add column if not exists stay_info text;
      alter table customers
        add column if not exists consent_accepted_at timestamptz,
        add column if not exists consent_signature text,
        add column if not exists consent_flea_tick boolean,
        add column if not exists consent_care_note text;
    `,
  },
  {
    // ทำหมันแล้ว (true) / ยังไม่ทำ (false) / ยังไม่ได้ถาม (null) — ถามตอนสมัครสมาชิก
    // เพิ่มคอลัมน์อย่างเดียว แถวเดิมได้ null ไม่แก้ข้อมูลเก่า
    name: "cats.neutered",
    sql: "alter table cats add column if not exists neutered boolean;",
  },
  {
    // ประวัติการชัก/ช็อค + ประวัติการแพ้ — ถามตอนสมัครสมาชิก (ไม่บังคับ) · เพิ่มคอลัมน์อย่างเดียว
    name: "cats.seizure_allergy",
    sql: "alter table cats add column if not exists seizure_history text, add column if not exists allergy text;",
  },
  {
    // 🔁 เครดิตจากบิลที่ยกเลิกนัด — เงินเข้าร้านไปแล้วตอนจ่ายบิลเดิม จึงไม่ลงรายรับ/ไม่ให้แต้มซ้ำ
    // source_invoice_id = เลขบิลเดิม (ไว้โชว์ในประวัติเครดิต + กันแปลงบิลเดียวกันซ้ำ)
    // เพิ่มคอลัมน์อย่างเดียว ไม่แก้ข้อมูลเดิม (แถวเก่าได้ค่าเริ่มต้น false / null)
    name: "member_topups.cancel_credit",
    sql: "alter table member_topups add column if not exists is_cancel_credit boolean not null default false, add column if not exists source_invoice_id text;",
  },
];

export type MigrateResult = {
  ok: boolean;
  bootstrapNeeded: boolean;
  applied: string[];
  errors: { name: string; error: string }[];
};

function looksLikeMissingFunction(msg: string) {
  return /exec_sql/i.test(msg) &&
    /(does not exist|could not find|schema cache|PGRST202|not found|404)/i.test(msg);
}

/**
 * รัน migration ตัวเดียวตามชื่อ แล้วบอก PostgREST ให้รีโหลด schema
 *
 * ใช้ตอนฟีเจอร์ไปเจอคอลัมน์ที่ยังไม่มี (เช่น ใส่รูปคอร์สแล้วยังไม่มี image_url) —
 * จะได้ซ่อมให้เองแล้วลองใหม่ทันที ไม่ต้องให้ร้านไปกดตั้งค่าก่อน
 * คืน true ถ้าคอลัมน์พร้อมใช้ (idempotent — "add column if not exists")
 */
export async function ensureMigration(name: string): Promise<boolean> {
  const sb = getDirectoryDb();
  if (!sb) return false;
  const m = MIGRATIONS.find((x) => x.name === name);
  if (!m) return false;
  try {
    const { error } = await sb.rpc("exec_sql", { sql: m.sql });
    if (error) return false;
    await sb.rpc("exec_sql", { sql: "notify pgrst, 'reload schema';" }).then(
      () => {},
      () => {}
    );
    return true;
  } catch {
    return false;
  }
}

/** รันทุก migration ผ่าน exec_sql (idempotent — ปลอดภัยรันซ้ำ) */
export async function runMigrations(): Promise<MigrateResult> {
  const sb = getDirectoryDb();
  if (!sb) {
    return {
      ok: false,
      bootstrapNeeded: false,
      applied: [],
      errors: [{ name: "_", error: "ไม่มีการเชื่อม Supabase (โหมด dev/mem)" }],
    };
  }

  const applied: string[] = [];
  const errors: { name: string; error: string }[] = [];

  for (const m of MIGRATIONS) {
    const { error } = await sb.rpc("exec_sql", { sql: m.sql });
    if (error) {
      const msg = error.message || String(error);
      if (looksLikeMissingFunction(msg)) {
        return { ok: false, bootstrapNeeded: true, applied, errors };
      }
      errors.push({ name: m.name, error: msg });
    } else {
      applied.push(m.name);
    }
  }

  // ให้ PostgREST รู้จักคอลัมน์ใหม่ทันที
  if (applied.length > 0) {
    await sb.rpc("exec_sql", { sql: "notify pgrst, 'reload schema';" }).then(
      () => {},
      () => {}
    );
  }

  return {
    ok: errors.length === 0,
    bootstrapNeeded: false,
    applied,
    errors,
  };
}
