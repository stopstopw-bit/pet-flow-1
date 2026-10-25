-- PetFlow — รันใน Supabase SQL Editor (Dashboard → SQL → New query)

create table if not exists customers (
  id text primary key,
  name text not null,
  phone text,
  email text,
  birthday date,
  line_user_id text unique,
  line_display_name text,
  marketing_consent boolean not null default true,
  referral_source text,
  tier text not null default 'new' check (tier in ('new', 'regular', 'member', 'vip')),
  is_member boolean not null default false,
  member_credit numeric not null default 0,
  member_since date,
  last_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cats (
  id text primary key,
  customer_id text not null references customers(id) on delete cascade,
  name text not null,
  gender text,
  breed text,
  age text,
  age_value integer,
  age_unit text,
  age_as_of date,
  birthday date,
  medical text,
  photo_data_url text,
  staff_note text
);

create index if not exists cats_customer_id_idx on cats(customer_id);

create table if not exists bookings (
  id text primary key,
  customer_name text not null,
  cat_name text not null,
  service text not null check (service in ('groom', 'room')),
  date date,
  time text,
  checkout date,
  checkin date,
  room text,
  line_user_id text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  checkin_time text,
  calendar_event_id text,
  created_at timestamptz not null default now()
);

create index if not exists bookings_line_user_id_idx on bookings(line_user_id);
create index if not exists bookings_date_idx on bookings(date);
create index if not exists bookings_checkin_idx on bookings(checkin);

create table if not exists points_accounts (
  line_user_id text primary key,
  display_name text not null default '',
  points integer not null default 0
);

create table if not exists points_history (
  id text primary key,
  line_user_id text not null references points_accounts(line_user_id) on delete cascade,
  type text not null check (type in ('earn', 'redeem')),
  points integer not null,
  label_th text not null default '',
  label_en text not null default '',
  coupon_code text,
  created_at timestamptz not null default now()
);

create index if not exists points_history_line_user_id_idx on points_history(line_user_id);

create table if not exists promos (
  id text primary key,
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
  kind text not null default 'display' check (kind in ('display', 'customer')),
  restriction text not null default 'none' check (restriction in ('none', 'first_visit', 'calendar_month')),
  valid_month text,
  tiers text[] not null default array['all']::text[],
  coupon_code text,
  reward_type text not null default 'discount' check (reward_type in ('discount', 'points', 'both')),
  points_bonus integer,
  points_multiplier numeric
);

create table if not exists promo_claims (
  id text primary key,
  promo_id text not null references promos(id) on delete cascade,
  customer_id text not null references customers(id) on delete cascade,
  line_user_id text,
  customer_name text not null default '',
  promo_title text not null default '',
  source text not null default 'app' check (source in ('app', 'admin')),
  points_awarded integer,
  created_at timestamptz not null default now()
);

create index if not exists promo_claims_promo_id_idx on promo_claims(promo_id);
create index if not exists promo_claims_customer_id_idx on promo_claims(customer_id);
create unique index if not exists promo_claims_once_per_customer on promo_claims(promo_id, customer_id);

create table if not exists finance_records (
  id text primary key,
  type text not null check (type in ('income', 'expense')),
  amount numeric not null,
  category text not null default 'ทั่วไป',
  description text not null default '',
  date date not null,
  customer_id text references customers(id) on delete set null,
  invoice_id text,
  created_at timestamptz not null default now()
);

create index if not exists finance_records_date_idx on finance_records(date);

create table if not exists invoices (
  id text primary key,
  customer_id text not null references customers(id) on delete cascade,
  line_user_id text,
  customer_name text not null,
  cat_name text not null,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null,
  discount numeric not null default 0,
  deposit numeric not null default 0,
  promo_id text,
  promo_label text,
  total numeric not null,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  payment_method text,
  paid_at timestamptz,
  points_earned integer,
  booking_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists invoices_customer_id_idx on invoices(customer_id);
create index if not exists invoices_status_idx on invoices(status);

create table if not exists service_records (
  id text primary key,
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

create index if not exists service_records_customer_id_idx on service_records(customer_id);

-- ประวัติเติมเครดิต Member (แยกเงินที่รับจริง vs แถม)
create table if not exists member_topups (
  id text primary key,
  customer_id text not null references customers(id) on delete cascade,
  paid_amount numeric not null default 0,
  bonus_amount numeric not null default 0,
  credit_added numeric not null,
  balance_after numeric not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists member_topups_customer_id_idx on member_topups(customer_id);

-- หมายเหตุ: ไฟล์นี้สร้าง "โครงสร้าง" อย่างเดียว ไม่มีข้อมูลตัวอย่างติดมา
-- ร้านที่เพิ่งติดตั้งจะเริ่มจากศูนย์จริง ๆ
-- ถ้าอยากได้ข้อมูลตัวอย่างไว้เดโม ให้รัน supabase/demo-seed.sql เพิ่มเอง

-- ตั้งค่าเว็บทั้งหมด (CMS) — แก้จากหน้า Admin ตั้งค่า
create table if not exists site_config (
  id text primary key default 'main',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists broadcast_images (
  id text primary key,
  data text not null,
  content_type text not null default 'image/jpeg',
  created_at timestamptz not null default now()
);
create index if not exists broadcast_images_created_at_idx on broadcast_images(created_at);

-- ─────────────────────────────────────────────────────────────
-- เติมคอลัมน์ที่เพิ่มภายหลัง (idempotent) — ให้ DB เก่าที่สร้างก่อนหน้านี้
-- ได้คอลัมน์ครบเมื่อรัน bootstrap อีกครั้ง (customers/cats/invoices/promos)
-- ─────────────────────────────────────────────────────────────
alter table customers add column if not exists email text;
alter table customers add column if not exists birthday date;
alter table customers add column if not exists line_display_name text;
alter table customers add column if not exists marketing_consent boolean not null default true;
alter table customers add column if not exists referral_source text;
alter table customers add column if not exists tier text not null default 'new';
alter table customers add column if not exists last_follow_up_at timestamptz;
alter table customers add column if not exists tax_invoice jsonb;

alter table cats add column if not exists gender text;
alter table cats add column if not exists breed text;
alter table cats add column if not exists age text;
alter table cats add column if not exists age_value integer;
alter table cats add column if not exists weight_kg numeric;
alter table cats add column if not exists species text;
alter table cats add column if not exists age_unit text;
alter table cats add column if not exists age_as_of date;
alter table cats add column if not exists birthday date;
alter table cats add column if not exists medical text;

alter table invoices add column if not exists deposit numeric not null default 0;

alter table promos add column if not exists discount_amount integer;
alter table promos add column if not exists kind text not null default 'display';
alter table promos add column if not exists restriction text not null default 'none';
alter table promos add column if not exists valid_month text;
alter table promos add column if not exists tiers text[] not null default array['all']::text[];
alter table promos add column if not exists coupon_code text;
alter table promos add column if not exists reward_type text not null default 'discount';
alter table promos add column if not exists points_bonus integer;
alter table promos add column if not exists points_multiplier numeric;

-- ให้ PostgREST โหลด schema ใหม่ (รู้จักคอลัมน์ที่เพิ่งเติม)
notify pgrst, 'reload schema';
