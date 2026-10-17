-- ═════════════════════════════════════════════════════════════════════════════
-- PetFlow — ติดตั้งฐานข้อมูลใหม่ทั้งหมด (multi-tenant) ในไฟล์เดียว
-- Full, idempotent setup for a brand-new, empty Supabase Postgres database.
--
-- วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run
-- รันซ้ำได้ (create ... if not exists / add column if not exists ทั้งหมด)
--
-- เป็น superset ของ supabase/schema.sql + supabase/migrations/*.sql + MIGRATIONS
-- ใน src/lib/migrations.ts และเติม tenants + tenant_id ทุกตารางตามโค้ดปัจจุบัน
--
-- ไม่ได้เปิด RLS ในไฟล์นี้ (ดูหมายเหตุใน migrations/011) — แอปต่อด้วย service role
-- ไม่มีการ insert แถวร้าน/ผู้ใช้ใด ๆ — เพิ่ม tenants แถวแรกเองหลังรันไฟล์นี้
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 0) exec_sql — ตัวกลางให้แอปรัน migration เอง (เหมือน EXEC_SQL_BOOTSTRAP)
-- ─────────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────────
-- 1) tenants — รายชื่อร้าน (id เป็น text เพื่อเทียบกับ env TENANT_ID ได้ตรง ๆ)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists tenants (
  id text primary key default gen_random_uuid()::text,
  slug text not null,
  name text not null,
  status text not null default 'trial',          -- trial | active | suspended | cancelled
  template text,
  owner_username text,
  owner_password_hash text,
  owner_password_salt text,
  owner_code_hash text,                           -- รหัสร้านแบบเก่า (legacy login)
  trial_ends_at timestamptz,
  created_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table tenants
  add column if not exists slug text,
  add column if not exists name text,
  add column if not exists status text not null default 'trial',
  add column if not exists template text,
  add column if not exists owner_username text,
  add column if not exists owner_password_hash text,
  add column if not exists owner_password_salt text,
  add column if not exists owner_code_hash text,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists created_at timestamptz not null default now();
create unique index if not exists tenants_slug_key on tenants (slug);
create unique index if not exists tenants_owner_username_key on tenants (owner_username);
create index if not exists tenants_owner_code_hash_idx on tenants (owner_code_hash);
create index if not exists tenants_status_idx on tenants (status);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2) ลูกค้า / แมว
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists customers (
  id text primary key,
  tenant_id text not null,
  name text not null,
  phone text,
  email text,
  birthday date,
  line_user_id text,
  line_user_ids text[],
  id_card_url text,
  line_display_name text,
  marketing_consent boolean not null default true,
  referral_source text,
  referral_code text,
  referred_by text,
  address text,
  address_map_url text,
  postal_code text,
  tier text not null default 'new',              -- new | regular | member | vip
  is_member boolean not null default false,
  member_credit numeric not null default 0,
  deposit_credit numeric not null default 0,
  member_since date,
  last_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table customers
  add column if not exists tenant_id text,
  add column if not exists name text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists birthday date,
  add column if not exists line_user_id text,
  add column if not exists line_user_ids text[],
  add column if not exists id_card_url text,
  add column if not exists line_display_name text,
  add column if not exists marketing_consent boolean not null default true,
  add column if not exists referral_source text,
  add column if not exists referral_code text,
  add column if not exists referred_by text,
  add column if not exists address text,
  add column if not exists address_map_url text,
  add column if not exists postal_code text,
  add column if not exists tier text not null default 'new',
  add column if not exists is_member boolean not null default false,
  add column if not exists member_credit numeric not null default 0,
  add column if not exists deposit_credit numeric not null default 0,
  add column if not exists member_since date,
  add column if not exists last_follow_up_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;
create index if not exists customers_tenant_idx on customers (tenant_id);
-- LINE user id ห้ามซ้ำภายในร้านเดียวกัน (โค้ด merge ลูกค้าอาศัยข้อนี้)
create unique index if not exists customers_tenant_line_user_key on customers (tenant_id, line_user_id);
create index if not exists customers_line_user_id_idx on customers (line_user_id);
create index if not exists customers_tier_idx on customers (tier);
create index if not exists customers_phone_idx on customers (tenant_id, phone);
create index if not exists customers_line_user_ids_idx on customers using gin (line_user_ids);

create table if not exists cats (
  id text primary key,
  tenant_id text not null,
  customer_id text not null references customers(id) on delete cascade,  -- ใช้กับ select("*, cats(*)")
  name text not null,
  gender text,
  breed text,
  color text,
  fur_length text,
  age text,
  age_value integer,
  age_unit text,
  age_as_of date,
  birthday date,
  medical text,
  photo_data_url text,
  media jsonb not null default '[]'::jsonb,
  staff_note text,
  staff_private_note text,
  groom_health_info text
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table cats
  add column if not exists tenant_id text,
  add column if not exists customer_id text,
  add column if not exists name text,
  add column if not exists gender text,
  add column if not exists breed text,
  add column if not exists color text,
  add column if not exists fur_length text,
  add column if not exists age text,
  add column if not exists age_value integer,
  add column if not exists age_unit text,
  add column if not exists age_as_of date,
  add column if not exists birthday date,
  add column if not exists medical text,
  add column if not exists photo_data_url text,
  add column if not exists media jsonb not null default '[]'::jsonb,
  add column if not exists staff_note text,
  add column if not exists staff_private_note text,
  add column if not exists groom_health_info text;
create index if not exists cats_tenant_idx on cats (tenant_id);
create index if not exists cats_customer_id_idx on cats (customer_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3) นัด
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists bookings (
  id text primary key,
  tenant_id text not null,
  customer_name text not null,
  cat_name text not null,
  service text not null,                          -- groom | room
  date date,
  time text,
  checkout date,
  checkin date,
  room text,
  room_unit integer,
  line_user_id text,
  notes text,
  status text not null default 'pending',         -- pending | confirmed | ready | done | cancelled | no_show
  checkin_time text,
  arrival_time text,
  pickup_time text,
  calendar_event_id text,
  consent_accepted_at timestamptz,
  consent_signature text,
  vaccine_photo_url text,
  flea_tick_treated boolean not null default false,
  care_note text,
  groom_health_info text,
  groom_program text,
  auto_off text[] not null default array[]::text[],
  self_booked boolean not null default false,
  transport jsonb,
  deposit_amount numeric,                         -- มัดจำตอนลูกค้าจองเอง (ยอดของทั้งกลุ่ม)
  deposit_slip_url text,
  deposit_status text,                            -- none | pending_review | paid
  created_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table bookings
  add column if not exists tenant_id text,
  add column if not exists customer_name text,
  add column if not exists cat_name text,
  add column if not exists service text,
  add column if not exists date date,
  add column if not exists time text,
  add column if not exists checkout date,
  add column if not exists checkin date,
  add column if not exists room text,
  add column if not exists room_unit integer,
  add column if not exists line_user_id text,
  add column if not exists notes text,
  add column if not exists status text not null default 'pending',
  add column if not exists checkin_time text,
  add column if not exists arrival_time text,
  add column if not exists pickup_time text,
  add column if not exists calendar_event_id text,
  add column if not exists consent_accepted_at timestamptz,
  add column if not exists consent_signature text,
  add column if not exists vaccine_photo_url text,
  add column if not exists flea_tick_treated boolean not null default false,
  add column if not exists care_note text,
  add column if not exists groom_health_info text,
  add column if not exists groom_program text,
  add column if not exists auto_off text[] not null default array[]::text[],
  add column if not exists self_booked boolean not null default false,
  add column if not exists transport jsonb,
  add column if not exists deposit_amount numeric,
  add column if not exists deposit_slip_url text,
  add column if not exists deposit_status text,
  add column if not exists created_at timestamptz not null default now();
-- schema.sql เก่าเคยล็อกสถานะไว้แค่ 3 ค่า แต่โค้ดใช้ ready/done/no_show ด้วย — ไม่ล็อกแล้ว
alter table bookings drop constraint if exists bookings_status_check;
alter table bookings drop constraint if exists bookings_service_check;
create index if not exists bookings_tenant_idx on bookings (tenant_id);
create index if not exists bookings_line_user_id_idx on bookings (line_user_id);
create index if not exists bookings_date_idx on bookings (date);
create index if not exists bookings_checkin_idx on bookings (checkin);
create index if not exists bookings_tenant_created_idx on bookings (tenant_id, created_at desc);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4) แต้มสะสม
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists points_accounts (
  tenant_id text not null,
  line_user_id text not null,
  display_name text not null default '',
  points integer not null default 0,
  primary key (tenant_id, line_user_id)
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table points_accounts
  add column if not exists tenant_id text,
  add column if not exists line_user_id text,
  add column if not exists display_name text not null default '',
  add column if not exists points integer not null default 0;
create index if not exists points_accounts_line_user_id_idx on points_accounts (line_user_id);

-- ไม่มี FK ไป points_accounts: โค้ดย้าย history ไป key ใหม่ก่อนสร้างบัญชีปลายทาง
create table if not exists points_history (
  id text primary key,
  tenant_id text not null,
  line_user_id text not null,
  type text not null,                             -- earn | redeem
  points integer not null,
  label_th text not null default '',
  label_en text not null default '',
  coupon_code text,
  created_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table points_history
  add column if not exists tenant_id text,
  add column if not exists line_user_id text,
  add column if not exists type text,
  add column if not exists points integer,
  add column if not exists label_th text not null default '',
  add column if not exists label_en text not null default '',
  add column if not exists coupon_code text,
  add column if not exists created_at timestamptz not null default now();
create index if not exists points_history_tenant_idx on points_history (tenant_id);
create index if not exists points_history_line_user_id_idx on points_history (tenant_id, line_user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5) โปรโมชั่น
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists promos (
  id text primary key,
  tenant_id text not null,
  title_th text not null,
  title_en text not null,
  body_th text not null,
  body_en text not null,
  discount_percent integer,
  discount_amount integer,
  image_url text,
  start_date date not null,
  until date not null,
  active boolean not null default true,
  kind text not null default 'display',           -- display | customer
  restriction text not null default 'none',       -- none | first_visit | calendar_month
  valid_month text,
  tiers text[] not null default array['all']::text[],
  coupon_code text,
  reward_type text not null default 'discount',   -- discount | points | both
  points_bonus integer,
  points_multiplier numeric
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table promos
  add column if not exists tenant_id text,
  add column if not exists title_th text,
  add column if not exists title_en text,
  add column if not exists body_th text,
  add column if not exists body_en text,
  add column if not exists discount_percent integer,
  add column if not exists discount_amount integer,
  add column if not exists image_url text,
  add column if not exists start_date date,
  add column if not exists until date,
  add column if not exists active boolean not null default true,
  add column if not exists kind text not null default 'display',
  add column if not exists restriction text not null default 'none',
  add column if not exists valid_month text,
  add column if not exists tiers text[] not null default array['all']::text[],
  add column if not exists coupon_code text,
  add column if not exists reward_type text not null default 'discount',
  add column if not exists points_bonus integer,
  add column if not exists points_multiplier numeric;
create index if not exists promos_tenant_idx on promos (tenant_id);

create table if not exists promo_claims (
  id text primary key,
  tenant_id text not null,
  promo_id text not null references promos(id) on delete cascade,
  customer_id text not null references customers(id) on delete cascade,
  line_user_id text,
  customer_name text not null default '',
  promo_title text not null default '',
  source text not null default 'app',             -- app | admin
  points_awarded integer,
  created_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table promo_claims
  add column if not exists tenant_id text,
  add column if not exists promo_id text,
  add column if not exists customer_id text,
  add column if not exists line_user_id text,
  add column if not exists customer_name text not null default '',
  add column if not exists promo_title text not null default '',
  add column if not exists source text not null default 'app',
  add column if not exists points_awarded integer,
  add column if not exists created_at timestamptz not null default now();
create index if not exists promo_claims_tenant_idx on promo_claims (tenant_id);
create index if not exists promo_claims_promo_id_idx on promo_claims (promo_id);
create index if not exists promo_claims_customer_id_idx on promo_claims (customer_id);
create unique index if not exists promo_claims_once_per_customer on promo_claims (promo_id, customer_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 6) การเงิน / บิล / ประวัติบริการ / เติมเครดิต
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists finance_records (
  id text primary key,
  tenant_id text not null,
  type text not null,                             -- income | expense
  amount numeric not null,
  category text not null default 'ทั่วไป',
  description text not null default '',
  date date not null,
  customer_id text references customers(id) on delete set null,
  invoice_id text,
  receipt_url text,
  excluded boolean not null default false,
  created_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table finance_records
  add column if not exists tenant_id text,
  add column if not exists type text,
  add column if not exists amount numeric,
  add column if not exists category text not null default 'ทั่วไป',
  add column if not exists description text not null default '',
  add column if not exists date date,
  add column if not exists customer_id text,
  add column if not exists invoice_id text,
  add column if not exists receipt_url text,
  add column if not exists excluded boolean not null default false,
  add column if not exists created_at timestamptz not null default now();
create index if not exists finance_records_tenant_idx on finance_records (tenant_id);
create index if not exists finance_records_date_idx on finance_records (tenant_id, date);
create index if not exists finance_records_invoice_id_idx on finance_records (invoice_id);

create table if not exists invoices (
  id text primary key,
  tenant_id text not null,
  customer_id text not null references customers(id) on delete cascade,
  line_user_id text,
  customer_name text not null,
  cat_name text not null,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null,
  discount numeric not null default 0,
  deposit numeric not null default 0,
  deposit_received_at timestamptz,
  promo_id text,
  promo_label text,
  total numeric not null,
  status text not null default 'pending',         -- pending | paid
  payment_method text,
  paid_at timestamptz,
  points_earned integer,
  booking_id text,
  package_id text,
  package_units integer,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table invoices
  add column if not exists tenant_id text,
  add column if not exists customer_id text,
  add column if not exists line_user_id text,
  add column if not exists customer_name text,
  add column if not exists cat_name text,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists subtotal numeric,
  add column if not exists discount numeric not null default 0,
  add column if not exists deposit numeric not null default 0,
  add column if not exists deposit_received_at timestamptz,
  add column if not exists promo_id text,
  add column if not exists promo_label text,
  add column if not exists total numeric,
  add column if not exists status text not null default 'pending',
  add column if not exists payment_method text,
  add column if not exists paid_at timestamptz,
  add column if not exists points_earned integer,
  add column if not exists booking_id text,
  add column if not exists package_id text,
  add column if not exists package_units integer,
  add column if not exists sent_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;
create index if not exists invoices_tenant_idx on invoices (tenant_id);
create index if not exists invoices_customer_id_idx on invoices (customer_id);
create index if not exists invoices_status_idx on invoices (status);
create index if not exists invoices_booking_id_idx on invoices (booking_id);
create index if not exists invoices_tenant_created_idx on invoices (tenant_id, created_at desc);

create table if not exists service_records (
  id text primary key,
  tenant_id text not null,
  customer_id text not null references customers(id) on delete cascade,
  cat_name text not null,
  service text not null,
  date date not null,
  time text,
  amount numeric,
  invoice_id text,
  booking_id text,
  created_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table service_records
  add column if not exists tenant_id text,
  add column if not exists customer_id text,
  add column if not exists cat_name text,
  add column if not exists service text,
  add column if not exists date date,
  add column if not exists time text,
  add column if not exists amount numeric,
  add column if not exists invoice_id text,
  add column if not exists booking_id text,
  add column if not exists created_at timestamptz not null default now();
create index if not exists service_records_tenant_idx on service_records (tenant_id);
create index if not exists service_records_customer_id_idx on service_records (customer_id);

-- ประวัติเติมเครดิต Member (แยกเงินที่รับจริง vs แถม)
create table if not exists member_topups (
  id text primary key,
  tenant_id text not null,
  customer_id text not null references customers(id) on delete cascade,
  paid_amount numeric not null default 0,
  bonus_amount numeric not null default 0,
  credit_added numeric not null,
  balance_after numeric not null,
  note text,
  is_legacy boolean not null default false,
  created_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table member_topups
  add column if not exists tenant_id text,
  add column if not exists customer_id text,
  add column if not exists paid_amount numeric not null default 0,
  add column if not exists bonus_amount numeric not null default 0,
  add column if not exists credit_added numeric,
  add column if not exists balance_after numeric,
  add column if not exists note text,
  add column if not exists is_legacy boolean not null default false,
  add column if not exists created_at timestamptz not null default now();
create index if not exists member_topups_tenant_idx on member_topups (tenant_id);
create index if not exists member_topups_customer_id_idx on member_topups (customer_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 7) ตั้งค่าเว็บ (CMS) + secrets ต่อร้าน
--    id = tenant_id (config) หรือ 'secrets:<tenant_id>' (secrets-store) — upsert ด้วย PK
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists site_config (
  id text primary key,
  tenant_id text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table site_config
  add column if not exists tenant_id text,
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();
create index if not exists site_config_tenant_idx on site_config (tenant_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 8) รูป broadcast (ทางสำรองเมื่ออัป Storage ไม่ได้ / หรือเก็บ pointer ไป Storage)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists broadcast_images (
  id text primary key,                            -- crypto.randomUUID()
  tenant_id text not null,
  data text not null,
  content_type text not null default 'image/jpeg',
  created_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table broadcast_images
  add column if not exists tenant_id text,
  add column if not exists data text,
  add column if not exists content_type text not null default 'image/jpeg',
  add column if not exists created_at timestamptz not null default now();
create index if not exists broadcast_images_tenant_idx on broadcast_images (tenant_id);
create index if not exists broadcast_images_created_at_idx on broadcast_images (created_at);
create index if not exists broadcast_images_created_idx on broadcast_images (created_at desc);


-- ─────────────────────────────────────────────────────────────────────────────
-- 9) คูปอง
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists coupons (
  id text primary key,
  tenant_id text not null,
  code text,
  customer_id text,
  amount numeric not null default 0,
  reason text,
  status text not null default 'active',
  expires_at timestamptz,
  used_at timestamptz,
  used_invoice_id text,
  offer_id text,
  created_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table coupons
  add column if not exists tenant_id text,
  add column if not exists code text,
  add column if not exists customer_id text,
  add column if not exists amount numeric not null default 0,
  add column if not exists reason text,
  add column if not exists status text not null default 'active',
  add column if not exists expires_at timestamptz,
  add column if not exists used_at timestamptz,
  add column if not exists used_invoice_id text,
  add column if not exists offer_id text,
  add column if not exists created_at timestamptz not null default now();
create index if not exists coupons_tenant_idx on coupons (tenant_id);
create index if not exists coupons_code_idx on coupons (tenant_id, code);
create index if not exists coupons_customer_idx on coupons (tenant_id, customer_id);

create table if not exists coupon_offers (
  id text primary key,
  tenant_id text not null,
  title text,
  amount numeric not null default 0,
  reason text,
  valid_days integer not null default 60,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table coupon_offers
  add column if not exists tenant_id text,
  add column if not exists title text,
  add column if not exists amount numeric not null default 0,
  add column if not exists reason text,
  add column if not exists valid_days integer not null default 60,
  add column if not exists active boolean not null default true,
  add column if not exists created_at timestamptz not null default now();
create index if not exists coupon_offers_tenant_idx on coupon_offers (tenant_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 10) คอร์ส/แพ็กเกจ + ร้านขายคอร์สในแอป
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists customer_packages (
  id text primary key,
  tenant_id text not null,
  customer_id text,
  name text,
  total_uses integer not null default 0,
  used_uses integer not null default 0,
  price numeric not null default 0,
  status text not null default 'active',
  unit text not null default 'use',               -- use | night
  room_type text,
  room_label text,
  plan_id text,
  groom_program text,
  created_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table customer_packages
  add column if not exists tenant_id text,
  add column if not exists customer_id text,
  add column if not exists name text,
  add column if not exists total_uses integer not null default 0,
  add column if not exists used_uses integer not null default 0,
  add column if not exists price numeric not null default 0,
  add column if not exists status text not null default 'active',
  add column if not exists unit text not null default 'use',
  add column if not exists room_type text,
  add column if not exists room_label text,
  add column if not exists plan_id text,
  add column if not exists groom_program text,
  add column if not exists created_at timestamptz not null default now();
create index if not exists customer_packages_tenant_idx on customer_packages (tenant_id);
create index if not exists customer_packages_customer_idx on customer_packages (tenant_id, customer_id);

create table if not exists package_offers (
  id text primary key,
  tenant_id text not null,
  name text,
  total_uses integer not null default 0,
  price numeric not null default 0,
  description text,
  image_url text,
  kind text not null default 'package',           -- package | credit
  credit_amount numeric,
  groom_program text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table package_offers
  add column if not exists tenant_id text,
  add column if not exists name text,
  add column if not exists total_uses integer not null default 0,
  add column if not exists price numeric not null default 0,
  add column if not exists description text,
  add column if not exists image_url text,
  add column if not exists kind text not null default 'package',
  add column if not exists credit_amount numeric,
  add column if not exists groom_program text,
  add column if not exists active boolean not null default true,
  add column if not exists created_at timestamptz not null default now();
create index if not exists package_offers_tenant_idx on package_offers (tenant_id);

create table if not exists package_orders (
  id text primary key,
  tenant_id text not null,
  customer_id text,
  customer_name text,
  line_user_id text,
  offer_id text,
  name text,
  total_uses integer not null default 0,
  price numeric not null default 0,
  kind text not null default 'package',
  credit_amount numeric,
  groom_program text,
  status text not null default 'pending',
  slip_url text,
  package_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table package_orders
  add column if not exists tenant_id text,
  add column if not exists customer_id text,
  add column if not exists customer_name text,
  add column if not exists line_user_id text,
  add column if not exists offer_id text,
  add column if not exists name text,
  add column if not exists total_uses integer not null default 0,
  add column if not exists price numeric not null default 0,
  add column if not exists kind text not null default 'package',
  add column if not exists credit_amount numeric,
  add column if not exists groom_program text,
  add column if not exists status text not null default 'pending',
  add column if not exists slip_url text,
  add column if not exists package_id text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists paid_at timestamptz;
create index if not exists package_orders_tenant_idx on package_orders (tenant_id);
create index if not exists package_orders_status_idx on package_orders (status);


-- ─────────────────────────────────────────────────────────────────────────────
-- 11) แจ้งเตือนแชทที่ยังไม่ตอบ (ต่อร้าน) — upsert ด้วย PK
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists chat_watch (
  tenant_id text not null,
  line_user_id text not null,
  last_message_at timestamptz,
  first_unanswered_at timestamptz,
  last_notified_at timestamptz,
  primary key (tenant_id, line_user_id)
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table chat_watch
  add column if not exists tenant_id text,
  add column if not exists line_user_id text,
  add column if not exists last_message_at timestamptz,
  add column if not exists first_unanswered_at timestamptz,
  add column if not exists last_notified_at timestamptz;


-- ─────────────────────────────────────────────────────────────────────────────
-- 12) บทความ
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists articles (
  id text primary key,
  tenant_id text not null,
  slug text not null,
  title text not null,
  description text,
  body text,
  cover_url text,
  emoji text,
  published boolean not null default true,
  date_published date,
  created_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table articles
  add column if not exists tenant_id text,
  add column if not exists slug text,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists body text,
  add column if not exists cover_url text,
  add column if not exists emoji text,
  add column if not exists published boolean not null default true,
  add column if not exists date_published date,
  add column if not exists created_at timestamptz not null default now();
create index if not exists articles_tenant_idx on articles (tenant_id);
create unique index if not exists articles_tenant_slug_key on articles (tenant_id, slug);


-- ─────────────────────────────────────────────────────────────────────────────
-- 13) พนักงาน — username unique ทั้งแพลตฟอร์ม (login ก่อนรู้ว่าเป็นร้านไหน)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists staff_users (
  id text primary key,
  tenant_id text,
  name text not null,
  username text,
  password_hash text,
  password_salt text,
  code text,                                      -- PIN เดิม เลิกใช้แล้ว (nullable)
  menus jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table staff_users
  add column if not exists tenant_id text,
  add column if not exists name text,
  add column if not exists username text,
  add column if not exists password_hash text,
  add column if not exists password_salt text,
  add column if not exists code text,
  add column if not exists menus jsonb not null default '[]'::jsonb,
  add column if not exists active boolean not null default true,
  add column if not exists created_at timestamptz not null default now();
alter table staff_users alter column code drop not null;
create index if not exists staff_users_tenant_idx on staff_users (tenant_id);
create unique index if not exists staff_users_username_key on staff_users (username);


-- ─────────────────────────────────────────────────────────────────────────────
-- 14) สินค้าหน้าร้าน (ระบบเดิม — ย้ายเข้า POS แล้ว แต่โค้ดยังอ่าน/เขียนอยู่)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists products (
  id text primary key,
  tenant_id text not null,
  name text not null,
  category text not null default '',
  price numeric not null default 0,
  image_url text,
  stock_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table products
  add column if not exists tenant_id text,
  add column if not exists name text,
  add column if not exists category text not null default '',
  add column if not exists price numeric not null default 0,
  add column if not exists image_url text,
  add column if not exists stock_count integer not null default 0,
  add column if not exists active boolean not null default true,
  add column if not exists created_at timestamptz not null default now();
create index if not exists products_tenant_idx on products (tenant_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 15) ประวัติการใช้งาน (audit) — tenant_id ว่างได้ (action ระดับ platform)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists audit_logs (
  id bigserial primary key,
  tenant_id text,
  actor text not null default '',
  actor_type text,                                -- platform | tenant
  actor_id text,
  action text not null,
  resource_type text not null,
  resource_id text,
  detail jsonb,
  before_state jsonb,
  after_state jsonb,
  impersonation_id text,
  created_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table audit_logs
  add column if not exists tenant_id text,
  add column if not exists actor text not null default '',
  add column if not exists actor_type text,
  add column if not exists actor_id text,
  add column if not exists action text,
  add column if not exists resource_type text,
  add column if not exists resource_id text,
  add column if not exists detail jsonb,
  add column if not exists before_state jsonb,
  add column if not exists after_state jsonb,
  add column if not exists impersonation_id text,
  add column if not exists created_at timestamptz not null default now();
create index if not exists audit_logs_tenant_idx on audit_logs (tenant_id, created_at desc);
create index if not exists audit_logs_created_idx on audit_logs (created_at desc);


-- ─────────────────────────────────────────────────────────────────────────────
-- 16) คิววันเกิดรอตรวจ
-- ─────────────────────────────────────────────────────────────────────────────
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
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table birthday_greetings
  add column if not exists tenant_id text,
  add column if not exists customer_id text,
  add column if not exists customer_name text not null default '',
  add column if not exists kind text not null default 'cat',
  add column if not exists cat_name text,
  add column if not exists for_date text,
  add column if not exists status text not null default 'pending',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists sent_at timestamptz;
create index if not exists birthday_greetings_tenant_idx on birthday_greetings (tenant_id);
create index if not exists birthday_greetings_status_idx on birthday_greetings (status);
create unique index if not exists birthday_greetings_dedup_idx
  on birthday_greetings (tenant_id, customer_id, for_date);


-- ─────────────────────────────────────────────────────────────────────────────
-- 17) แพ็กห้องรายเดือน
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists room_plans (
  id text primary key,
  tenant_id text not null,
  customer_id text,
  customer_name text,
  line_user_id text,
  name text,
  items jsonb not null default '[]'::jsonb,
  full_price numeric not null default 0,
  discount_pct numeric not null default 0,
  price numeric not null default 0,
  installments integer not null default 1,
  payments jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table room_plans
  add column if not exists tenant_id text,
  add column if not exists customer_id text,
  add column if not exists customer_name text,
  add column if not exists line_user_id text,
  add column if not exists name text,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists full_price numeric not null default 0,
  add column if not exists discount_pct numeric not null default 0,
  add column if not exists price numeric not null default 0,
  add column if not exists installments integer not null default 1,
  add column if not exists payments jsonb not null default '[]'::jsonb,
  add column if not exists status text not null default 'active',
  add column if not exists created_at timestamptz not null default now();
create index if not exists room_plans_tenant_idx on room_plans (tenant_id, customer_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 18) เอกสารทางการของบิล (ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ) — upsert onConflict invoice_id
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists invoice_docs (
  invoice_id text primary key,
  tenant_id text not null,
  customer_id text,
  buyer jsonb,
  quote_no text,
  quote_at timestamptz,
  invoice_no text,
  invoice_at timestamptz,
  receipt_no text,
  receipt_at timestamptz,
  note text,
  updated_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table invoice_docs
  add column if not exists invoice_id text,
  add column if not exists tenant_id text,
  add column if not exists customer_id text,
  add column if not exists buyer jsonb,
  add column if not exists quote_no text,
  add column if not exists quote_at timestamptz,
  add column if not exists invoice_no text,
  add column if not exists invoice_at timestamptz,
  add column if not exists receipt_no text,
  add column if not exists receipt_at timestamptz,
  add column if not exists note text,
  add column if not exists updated_at timestamptz not null default now();
create index if not exists invoice_docs_customer_idx on invoice_docs (tenant_id, customer_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 19) POS หน้าร้าน
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists pos_products (
  id text primary key,
  tenant_id text not null,
  name text not null,
  sku text,
  category text,
  image_url text,
  price numeric not null default 0,
  cost numeric,
  track_stock boolean not null default true,
  stock integer not null default 0,
  low_stock integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table pos_products
  add column if not exists tenant_id text,
  add column if not exists name text,
  add column if not exists sku text,
  add column if not exists category text,
  add column if not exists image_url text,
  add column if not exists price numeric not null default 0,
  add column if not exists cost numeric,
  add column if not exists track_stock boolean not null default true,
  add column if not exists stock integer not null default 0,
  add column if not exists low_stock integer,
  add column if not exists active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
create index if not exists pos_products_tenant_idx on pos_products (tenant_id);
create index if not exists pos_products_sku_idx on pos_products (tenant_id, sku);

create table if not exists pos_stock_moves (
  id text primary key,
  tenant_id text not null,
  product_id text not null,
  qty integer not null,
  reason text not null,
  ref_id text,
  note text,
  created_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table pos_stock_moves
  add column if not exists tenant_id text,
  add column if not exists product_id text,
  add column if not exists qty integer,
  add column if not exists reason text,
  add column if not exists ref_id text,
  add column if not exists note text,
  add column if not exists created_at timestamptz not null default now();
create index if not exists pos_stock_moves_tenant_idx on pos_stock_moves (tenant_id);
create index if not exists pos_stock_moves_product_idx on pos_stock_moves (product_id, created_at desc);

create table if not exists pos_sales (
  id text primary key,
  tenant_id text not null,
  no text not null,
  date date not null,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  total numeric not null default 0,
  method text not null,
  cash_received numeric,
  change numeric,
  customer_id text,
  customer_name text,
  note text,
  status text not null default 'paid',            -- paid | void
  created_at timestamptz not null default now(),
  voided_at timestamptz
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table pos_sales
  add column if not exists tenant_id text,
  add column if not exists no text,
  add column if not exists date date,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists subtotal numeric not null default 0,
  add column if not exists discount numeric not null default 0,
  add column if not exists total numeric not null default 0,
  add column if not exists method text,
  add column if not exists cash_received numeric,
  add column if not exists change numeric,
  add column if not exists customer_id text,
  add column if not exists customer_name text,
  add column if not exists note text,
  add column if not exists status text not null default 'paid',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists voided_at timestamptz;
create index if not exists pos_sales_date_idx on pos_sales (tenant_id, date, created_at desc);

create table if not exists pos_closings (
  id text primary key,
  tenant_id text not null,
  date date not null,
  expected_cash numeric not null default 0,
  counted_cash numeric not null default 0,
  diff numeric not null default 0,
  opening_cash numeric not null default 0,
  totals jsonb,
  note text,
  created_at timestamptz not null default now()
);
-- เผื่อตารางเดิมมีอยู่แล้วแต่คอลัมน์ไม่ครบ (no-op บน DB ใหม่)
alter table pos_closings
  add column if not exists tenant_id text,
  add column if not exists date date,
  add column if not exists expected_cash numeric not null default 0,
  add column if not exists counted_cash numeric not null default 0,
  add column if not exists diff numeric not null default 0,
  add column if not exists opening_cash numeric not null default 0,
  add column if not exists totals jsonb,
  add column if not exists note text,
  add column if not exists created_at timestamptz not null default now();
-- upsert onConflict "tenant_id,date"
create unique index if not exists pos_closings_tenant_date_idx on pos_closings (tenant_id, date);


-- ─────────────────────────────────────────────────────────────────────────────
-- 19b) บอร์ดคิวอาบน้ำ + เช็คลิสต์ดูแลรายวัน + เงินเดือน/ค่าคอมพนักงาน
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists booking_ops (
  booking_id text primary key,
  tenant_id text not null,
  groom_started_at timestamptz,
  groomer text,                                   -- payroll_employees.id
  care_checks jsonb not null default '{}'::jsonb, -- { "YYYY-MM-DD": { taskId: { at, by } } }
  updated_at timestamptz not null default now()
);
create index if not exists booking_ops_tenant_idx on booking_ops (tenant_id);
alter table booking_ops enable row level security;

create table if not exists payroll_employees (
  id text primary key,
  tenant_id text not null,
  name text not null,
  base_salary numeric not null default 0,
  groom_commission_pct numeric not null default 0,
  groom_commission_per_cat numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists payroll_employees_tenant_idx on payroll_employees (tenant_id);
alter table payroll_employees enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- 20) Storage bucket "media" (โค้ดสร้างเองตอนใช้ครั้งแรกด้วย แต่สร้างไว้ก่อนกันพลาด)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('storage.buckets') is not null then
    begin
      insert into storage.buckets (id, name, public, file_size_limit)
      values ('media', 'media', true, 26214400)
      on conflict (id) do nothing;
    exception when others then
      raise notice 'skip storage bucket media: %', sqlerrm;
    end;
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 21) สิทธิ์ให้ service_role (Supabase ให้อยู่แล้วโดย default — ใส่ซ้ำไว้กันพลาด)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema public to service_role';
    execute 'grant all on all tables in schema public to service_role';
    execute 'grant all on all sequences in schema public to service_role';
  end if;
end $$;


-- ให้ PostgREST โหลด schema ใหม่
notify pgrst, 'reload schema';
