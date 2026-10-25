# PetFlow — Multi-Tenant & Capacity Plan

_ตรวจโค้ดจริงเมื่อ 2026-07-20 — แก้ความเข้าใจผิดครั้งแรกที่ว่า "ยังไม่เริ่มทำ multi-tenant"_

> **ข้อสรุปสั้น:** ระบบ multi-tenant **ทำไปแล้วประมาณ 80%** — มีตาราง `tenants`, ทุกตารางมี `tenant_id`,
> ทุก store กรองด้วย tenant, เจ้าของร้าน login ข้ามร้านด้วย username/password, และมีหน้า Platform
> สร้างร้านได้แล้ว **สิ่งที่ยังขาดจริง ๆ คือการ "รู้ว่าเป็นร้านไหน" ฝั่งลูกค้า (LIFF/LINE)** ซึ่งตอนนี้
> ยังผูกกับร้านเดียวผ่าน env `TENANT_ID`

> **อัปเดต 2026-10-17:** R1/R3 ทำแล้ว (`/s/<slug>`) · R2 ทำแล้ว (`requireTenantId()` throw เมื่อไม่มี context,
> slug ที่ไม่รู้จัก throw แทนตกไปร้าน bootstrap, ค่า LINE/Telegram/Google/บัญชีธนาคารใน env ใช้ได้เฉพาะร้าน bootstrap) ·
> R4 มี migration `012_enable_rls_all_tables.sql` แล้ว — รันหลังเช็ก `/api/platform/security-check` ว่า `rlsSafe: true` ·
> ไฟล์ส่วนตัวลูกค้า (บัตรประชาชน/สลิป/ลายเซ็น/วัคซีน/รูปแมว) ย้ายไป bucket `private` เปิดผ่าน `/api/files` เท่านั้น

---

## 1. สถานะปัจจุบัน (ตรวจจากโค้ด)

### ✅ ทำเสร็จแล้ว
| ส่วน | หลักฐานในโค้ด |
|---|---|
| ตาราง `tenants` (id, slug, name, status `trial`/`active`, template, owner_username, password hash+salt, owner_code_hash, trial_ends_at) | `tenant-directory.ts`, `api/platform/tenants/route.ts` |
| `tenant_id` ในทุกตารางข้อมูล + context กลาง | `tenant-context.ts` (AsyncLocalStorage) |
| 18 store กรอง `tenant_id` ทุก query | `customers-store`, `invoices-store`, `finance-store`, … |
| เจ้าของร้าน login ด้วย username+password ข้ามร้าน (T5) + fallback รหัสเดิม | `findTenantByOwnerLogin`, `findTenantByLegacyOwnerCode` |
| Platform (super admin): auth, list ร้าน, **สร้างร้านใหม่ + สุ่มรหัสผ่านให้อัตโนมัติ** | `api/platform/tenants/route.ts` |
| Per-tenant secrets + audit log | `secrets-store.ts`, `audit-log.ts` |
| Session หลังบ้านพก `tenantId` → `withTenant(session.tenantId)` | `middleware.ts`, `auth.ts` |

### 🔴 ยังขาด (นี่คือสิ่งที่บล็อกไม่ให้เปิดร้านที่ 2 ได้จริง)
| # | งานที่เหลือ | ทำไมสำคัญ |
|---|---|---|
| **R1** | **ฝั่งลูกค้า (LIFF) resolve ร้านจาก subdomain/host/LIFF ID** — ตอนนี้ route ลูกค้า (`customers/register`, `line`, `link`, `self`, `cat-photo`, `bookings/consent/time`, `coupons/claim`, `promos/claim`, `line/webhook`) ยังเรียก `withBootstrapTenant()` = อ่าน env `TENANT_ID` ร้านเดียว | ลูกค้าของร้านที่ 2 จะไปลงข้อมูลในร้านที่ 1 — **ต้องแก้ก่อนเปิดร้านจริงหลายร้าน** |
| **R2** | บังคับ `requireTenantId()` ให้ **throw** แทน fallback เงียบ เมื่อทุก route ห่อ context ครบ | ตอนนี้ถ้าลืมห่อ context มันเดาเป็นร้าน bootstrap → บั๊กข้อมูลข้ามร้านแบบเงียบ |
| **R3** | Middleware map `host → tenant` (ใช้คอลัมน์ `slug`/custom domain ในตาราง `tenants`) | ให้ R1 ทำงานอัตโนมัติทุก request |
| **R4** | เปิด **RLS** เป็นเกราะชั้นสอง (ปิดไว้ตั้งแต่ 2026-07-12 เพราะ key ที่ deploy ไม่ bypass) | ตอนนี้กันข้อมูลปนด้วย app-layer อย่างเดียว ถ้า query ลืม `tenant_id` = รั่ว |
| **R5** | **ย้ายรูปออกจาก DB** (base64) → Storage — ดูหัวข้อ Capacity | กัน DB บวมจนเต็ม 500 MB |
| **R6** | Sync `supabase/schema.sql` ให้ตรงของจริง (ตอนนี้ไม่มี `tenants`/`tenant_id`/หลายตารางใหม่ — DDL จริงถูกรันตรงเข้า prod) | ติดตั้งร้านใหม่จาก schema.sql จะได้ตารางไม่ครบ |

---

## 2. Capacity — อะไรจะเต็มก่อน (Supabase Free: DB 500 MB · Storage 1 GB · Egress 5 GB/เดือน)

| ลำดับที่เต็มก่อน | สาเหตุ (โค้ดจริง) | ผล |
|---|---|---|
| 🔴 1. **DB บวมเพราะ base64** | `broadcast_images.data text` เก็บ base64 ทั้งก้อน + `cats.photo_data_url` fallback เก็บ data URL เมื่ออัป bucket ไม่สำเร็จ | 200 แมวมีรูป ≈ 400 MB จาก 500 MB **ตั้งแต่เริ่ม** |
| 🟠 2. Storage 1 GB | bucket `media` เก็บรูปแมว/โปร | อัปหลายรูป/ความละเอียดสูง → ชน 1 GB |
| 🟡 3. Egress 5 GB/เดือน | รูป public bucket เสิร์ฟตรงจาก Supabase | เปิดดูบ่อย ๆ แตะ 5 GB (คนละถังกับ bandwidth Vercel) |
| 🟢 4. ข้อความ (ลูกค้า/จอง/การเงิน) | rows ปกติ | **ไม่เคยเป็นปัญหา** ~80 MB/ร้าน/ปี |

**สรุป:** ข้อมูลตัวอักษรไม่ใช่ปัญหา — **รูปภาพที่ยัด base64 ลง DB คือระเบิดเวลา** (= R5)

---

## 3. ค่าใช้จ่ายเป้าหมาย (10 ร้าน × ~200 คน ในระบบเดียว)

ข้อมูลรวม ~2,000 ลูกค้า ≈ 100–150 MB → **ยังอยู่ใน DB 500 MB ฟรี 1 project เดียว** ✅

| แผน | ต่อเดือน | หมายเหตุ |
|---|---|---|
| ประหยัดสุด | **~$20** | Vercel Pro (บังคับ เพราะขายเชิงพาณิชย์ Hobby ห้าม) + Supabase ฟรี ถ้าย้ายรูปไป R2/Vercel Blob หรือคุมขนาด |
| สบาย ๆ | **~$45** | + Supabase Pro เผื่อ Storage/Egress โต |

_ตัวเลขคร่าว ๆ — เช็ก pricing ล่าสุดก่อนตัดสินใจ_

---

## 4. ลำดับงานแนะนำ

1. **R5 (Quick Win)** — ย้าย `broadcast_images` base64 → Storage _(เริ่มทำแล้ว 2026-07-20)_
2. **R1 + R3** — customer/LIFF resolve ร้านจาก host/slug (หัวใจของการเปิดร้านที่ 2)
3. **R2** — รัด `requireTenantId()` ให้ throw
4. **R6** — sync `schema.sql`
5. **R4** — เปิด RLS เป็นเกราะชั้นสอง

**ความเสี่ยงสูงสุดตลอดงาน:** query ที่ลืมใส่ `tenant_id` → ข้อมูลร้านปนกัน → ต้องมี test/lint กันลืม ก่อนเปิดร้านที่ 2
