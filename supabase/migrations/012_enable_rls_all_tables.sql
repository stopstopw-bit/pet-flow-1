-- เปิด RLS ทุกตารางใน schema public — เกราะชั้นที่ 2 กันข้อมูลลูกค้ารั่ว/ปนกันระหว่างร้าน
--
-- ผลที่ได้: ใครถือ anon/publishable key (ซึ่งเป็นค่าที่เปิดเผยได้) จะอ่าน/เขียนตารางตรงผ่าน
-- REST API ของ Supabase ไม่ได้เลย เพราะไม่มี policy ให้ — แอปยังทำงานปกติเพราะฝั่งเซิร์ฟเวอร์
-- ใช้ service_role / secret key ซึ่ง bypass RLS
--
-- ⚠️ ก่อนรัน: เปิด /api/platform/security-check (ล็อกอิน platform) ต้องเห็น "rlsSafe": true
-- ถ้าเป็น false แปลว่า SUPABASE_SERVICE_ROLE_KEY ที่ deploy ไม่ใช่ service_role จริง
-- รันไปแล้วแอปจะอ่าน/เขียนข้อมูลไม่ได้ทั้งระบบ (เคยเกิดเมื่อ 2026-07-12 ดู 011)
-- ให้แก้ key ใน Vercel ก่อน (Supabase → Settings → API Keys → secret / service_role)
--
-- ย้อนกลับ (ถ้าจำเป็น): เปลี่ยน "enable" เป็น "disable" แล้วรันซ้ำ

do $$
declare
  r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

-- ตรวจผล: ทุกแถวต้องเป็น true
-- select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
