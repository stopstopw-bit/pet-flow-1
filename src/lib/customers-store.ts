import { bookingMatchesCustomer, datesForBooking, isUpcomingBooking } from "./booking-customer-match";
import type { Booking } from "./business";
import {
  computeTier,
  DEFAULT_TIER_RULES,
  type CustomerTier,
} from "./customer-tier";
import { listBookings, type StoredBooking } from "./bookings-store";
import { getAccount, getPointsHistory } from "./points-store";
import { getSupabase, selectAllRows } from "./supabase/server";
import { seedEnabled } from "./demo-seed";
import { uploadPrivateDataUrl } from "./supabase/storage";
import { getSiteConfig } from "./config-store";
import { requireTenantId } from "./tenant-context";
import { ensureMigration } from "./migrations";
import { normalizeSpecies, type PetSpecies } from "./pet-kind";
import { taxInvoiceFromRow, type CustomerTaxInvoice } from "./tax-invoice";
import { MAX_VACCINE_PHOTOS, joinVaccinePhotos, splitVaccinePhotos } from "./vaccine-photos";
import { stayInfoDone } from "./intake-rules";
import { cleanPetName } from "./pet-name";

export type { CustomerTier } from "./customer-tier";

export type CatGender = "male" | "female";
export { normalizeSpecies, type PetSpecies } from "./pet-kind";

export type CatRecord = {
  id: string;
  name: string;
  gender?: CatGender;
  breed?: string;
  /** อายุที่ระบุ ณ วันสมัคร (ใช้คู่กับ ageUnit + ageAsOf เพื่อคำนวณอายุปัจจุบัน) */
  ageValue?: number;
  ageUnit?: "year" | "month";
  ageAsOf?: string;
  birthday?: string;
  medical?: string;
  /** ขนสั้น/ขนยาว — ถามพร้อมสายพันธุ์ตอนสมัครสมาชิก */
  furLength?: "short" | "long";
  /** สี/ลักษณะเด่น — ถามตอนสมัครสมาชิก (ไม่บังคับ) */
  color?: string;
  /** ทำหมันแล้ว (true) / ยังไม่ทำ (false) / ไม่ได้ระบุ (undefined) */
  neutered?: boolean;
  /** ได้รับวัคซีนครบแล้ว (true) / ยังไม่ครบ (false) / ไม่ได้ระบุ (undefined) — ถามตอนสมัครสมาชิก */
  vaccinated?: boolean;
  /** ประวัติการชัก/ช็อค — ถามตอนสมัครสมาชิก (ไม่บังคับ) */
  seizureHistory?: string;
  /** ประวัติการแพ้ (อาหาร/ยา/แชมพู) — ถามตอนสมัครสมาชิก (ไม่บังคับ) */
  allergy?: string;
  /** น้ำหนักตัว (กก.) — ถามตอนสมัครสมาชิก แก้ได้ทั้งลูกค้าและหลังบ้าน */
  weightKg?: number;
  /** หมาหรือแมว — ไม่ได้ระบุ = ชนิดที่ร้านรับ (ดู speciesOf ใน pet-kind.ts) */
  species?: PetSpecies;
  photoDataUrl?: string;
  staffNote?: string;
  /** โน้ตลับของร้าน — ซ่อนจากลูกค้า (ต้องรัน OVERNIGHT_SQL.md ก่อนถึงจะเซฟได้) */
  staffPrivateNote?: string;
  /** ประวัติน้องก่อนอาบน้ำ (JSON) — เก็บถาวรที่แมว ถามครั้งแรกครั้งเดียว */
  groomHealthInfo?: string;
  /** รูปสมุดวัคซีนที่เก็บไว้ที่ตัวน้อง (ขอได้จากหน้าลูกค้าโดยไม่ต้องมีนัด) — คั่นบรรทัด เหมือน bookings.vaccine_photo_url */
  vaccinePhotos?: string;
  /** ข้อมูลน้องก่อนเข้าพัก (JSON ตามคำถามใน stay-form) — อาหาร/ชอบ-ไม่ชอบ/การดูแล เก็บถาวรที่ตัวน้อง */
  stayInfo?: string;
  /** อัลบั้มรูป/วิดีโออ้างอิงหน้าตา-นิสัยแมว — เก็บหลังบ้านเท่านั้น ลูกค้าไม่เห็น (ต้องรัน migration cats.media ก่อน) */
  media?: CatMediaItem[];
};

export type CatMediaItem = {
  id: string;
  type: "photo" | "video";
  dataUrl: string;
  caption?: string;
  createdAt: string;
};

export type CustomerRecord = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  birthday?: string;
  lineUserId?: string;
  /**
   * LINE User ID ทุกตัวของลูกค้าคนนี้ — LINE ให้ ID คนละตัวได้บนคอม (LIFF) กับมือถือ
   * ถ้า LIFF app กับ OA คนละ Provider เก็บทุกตัวไว้ที่นี่ ลูกค้าคนเดียวจะไม่แตกเป็นหลาย record
   */
  lineUserIds?: string[];
  /** ชื่อจากโปรไฟล์ LINE — อัปเดตอัตโนมัติ ไม่ทับชื่อที่ร้านตั้ง */
  lineDisplayName?: string;
  /** ยินยอมรับข่าวสาร/โปรโมชั่น — ถ้า false จะไม่ส่งโปรหา (แต่ยืนยันนัด/จ่ายเงินยังส่งได้) */
  marketingConsent: boolean;
  /** รู้จักร้านจากทางไหน */
  referralSource?: string;
  /** ที่อยู่บ้าน (พิมพ์เอง) — ไว้ใช้บริการรับ-ส่ง ไม่ต้องถามซ้ำทุกครั้ง */
  address?: string;
  /** ลิงก์ Google Maps ปักหมุดบ้านลูกค้า */
  addressMapUrl?: string;
  /** รหัสไปรษณีย์ — ไว้ดูว่าลูกค้าส่วนใหญ่อยู่แถวไหนสำหรับทำการตลาด */
  postalCode?: string;
  /** ขอบิล/ใบกำกับภาษีเต็มรูป (นิติบุคคลหรือบุคคลธรรมดา) — ไม่มี = ออกในชื่อลูกค้าตามปกติ */
  taxInvoice?: CustomerTaxInvoice;
  /** รูปบัตรประชาชนผู้ปกครอง (มีข้อความขีดทับ "ใช้ลงทะเบียนที่ร้าน" ฝังในรูปแล้ว) */
  idCardUrl?: string;
  /** ลูกค้ากดยอมรับข้อตกลงของร้านล่าสุด (ส่งจากหน้าลูกค้า ยังไม่ต้องมีนัด) */
  consentAcceptedAt?: string;
  /** ลายเซ็นตอนยอมรับข้อตกลงล่าสุด (ไฟล์ส่วนตัว /api/files) */
  consentSignature?: string;
  /** ลูกค้ายืนยันหยดยาเห็บหมัดตอนยอมรับข้อตกลงล่าสุด */
  consentFleaTick?: boolean;
  /** "แจ้งการดูแลเพิ่มเติม" ที่ลูกค้ากรอกตอนยอมรับข้อตกลงล่าสุด */
  consentCareNote?: string;
  /** รหัสชวนเพื่อนของลูกค้าคนนี้ (แชร์ให้เพื่อนสมัคร) */
  referralCode?: string;
  /** ถูกชวนมาโดยลูกค้ารหัสนี้ (กันออกคูปองซ้ำ) */
  referredBy?: string;
  cats: CatRecord[];
  isMember: boolean;
  memberCredit: number;
  /** มัดจำล่วงหน้าคงเหลือ — หักออกจากบิลถัดไปอัตโนมัติ (ต้องรัน OVERNIGHT_SQL.md) */
  depositCredit: number;
  /** ลบแบบกู้คืนได้ (soft delete) */
  deletedAt?: string;
  memberSince?: string;
  tier: CustomerTier;
  /** วันที่ส่งข้อความตามลูกค้าครั้งล่าสุด */
  lastFollowUpAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ServiceRecord = {
  id: string;
  customerId: string;
  catName: string;
  service: string;
  date: string;
  time?: string;
  amount?: number;
  invoiceId?: string;
  bookingId?: string;
  at: string;
};

/** ประวัติเติมเครดิต Member — แยกเงินที่รับจริง vs แถม */
export type MemberTopupRecord = {
  id: string;
  customerId: string;
  paidAmount: number;
  bonusAmount: number;
  creditAdded: number;
  balanceAfter: number;
  note?: string;
  createdAt: string;
  /** ยอดยกมาจากระบบเก่า — เติมเครดิตให้ลูกค้าจริง แต่ไม่ใช่รายรับของร้านเดือนนี้ */
  isLegacy?: boolean;
  /**
   * 🔁 ยกเลิกนัดแล้วเก็บยอดบิลเป็นเครดิต — เงินเข้าร้านไปแล้วตอนจ่ายบิลเดิม
   * (ลงรายรับ + ให้แต้มไปแล้วตอนนั้น) จึงไม่ลงรายรับและไม่ให้แต้มซ้ำอีกรอบ
   */
  isCancelCredit?: boolean;
  /** เลขบิลเดิมที่แปลงมาเป็นเครดิต (เฉพาะ isCancelCredit) */
  sourceInvoiceId?: string;
};

/** รายการใช้เครดิต Member จ่ายบิล */
export type MemberCreditUsageRecord = {
  id: string;
  customerId: string;
  amount: number;
  description: string;
  date: string;
  at: string;
};

type CatRow = {
  id: string;
  customer_id: string;
  name: string;
  gender: string | null;
  breed: string | null;
  age: string | null;
  age_value: number | null;
  age_unit: string | null;
  age_as_of: string | null;
  birthday: string | null;
  medical: string | null;
  fur_length?: string | null;
  color?: string | null;
  neutered?: boolean | null;
  vaccinated?: boolean | null;
  seizure_history?: string | null;
  allergy?: string | null;
  weight_kg?: number | string | null;
  species?: string | null;
  photo_data_url: string | null;
  staff_note: string | null;
  staff_private_note?: string | null;
  groom_health_info?: string | null;
  vaccine_photos?: string | null;
  stay_info?: string | null;
  media?: CatMediaItem[] | null;
};

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  line_user_id: string | null;
  line_user_ids?: string[] | null;
  line_display_name: string | null;
  marketing_consent: boolean | null;
  referral_source: string | null;
  address?: string | null;
  address_map_url?: string | null;
  postal_code?: string | null;
  tax_invoice?: unknown;
  id_card_url?: string | null;
  consent_accepted_at?: string | null;
  consent_signature?: string | null;
  consent_flea_tick?: boolean | null;
  consent_care_note?: string | null;
  referral_code?: string | null;
  referred_by?: string | null;
  is_member: boolean;
  member_credit: number;
  deposit_credit?: number | null;
  member_since: string | null;
  tier: string | null;
  last_follow_up_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  cats?: CatRow[];
};

type ServiceRow = {
  id: string;
  customer_id: string;
  cat_name: string;
  service: string;
  date: string;
  time: string | null;
  amount: number | null;
  invoice_id: string | null;
  booking_id: string | null;
  created_at: string;
};

type MemberTopupRow = {
  id: string;
  customer_id: string;
  paid_amount: number;
  bonus_amount: number;
  credit_added: number;
  balance_after: number;
  note: string | null;
  created_at: string;
  is_legacy?: boolean | null;
  is_cancel_credit?: boolean | null;
  source_invoice_id?: string | null;
};

function rowToTopup(r: MemberTopupRow): MemberTopupRecord {
  return {
    id: r.id,
    customerId: r.customer_id,
    paidAmount: Number(r.paid_amount),
    bonusAmount: Number(r.bonus_amount),
    creditAdded: Number(r.credit_added),
    balanceAfter: Number(r.balance_after),
    note: r.note ?? undefined,
    createdAt: r.created_at,
    isLegacy: r.is_legacy ?? false,
    isCancelCredit: r.is_cancel_credit ?? false,
    sourceInvoiceId: r.source_invoice_id ?? undefined,
  };
}

const memCustomers = new Map<string, CustomerRecord>();
const memServices: ServiceRecord[] = [];
const memMemberTopups: MemberTopupRecord[] = [];

function seedMem() {
  if (!seedEnabled()) return;
  const c: CustomerRecord = {
    id: "C001",
    name: "คุณมาย",
    lineUserId: "dev-user",
    marketingConsent: true,
    cats: [{ id: "CAT001", name: "น้องส้ม", staffNote: "อาบง่าย ไม่ดุ" }],
    isMember: false,
    memberCredit: 0,
    depositCredit: 0,
    tier: "new",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  memCustomers.set(c.id, c);
}
seedMem();

function mapCustomer(row: CustomerRow): CustomerRecord {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    birthday: row.birthday ?? undefined,
    lineUserId: row.line_user_id ?? undefined,
    lineUserIds: row.line_user_ids ?? undefined,
    lineDisplayName: row.line_display_name ?? undefined,
    marketingConsent: row.marketing_consent !== false,
    referralSource: row.referral_source ?? undefined,
    address: row.address ?? undefined,
    addressMapUrl: row.address_map_url ?? undefined,
    postalCode: row.postal_code ?? undefined,
    taxInvoice: taxInvoiceFromRow(row.tax_invoice),
    idCardUrl: row.id_card_url ?? undefined,
    consentAcceptedAt: row.consent_accepted_at ?? undefined,
    consentSignature: row.consent_signature ?? undefined,
    consentFleaTick: row.consent_flea_tick ?? undefined,
    consentCareNote: row.consent_care_note ?? undefined,
    referralCode: row.referral_code ?? undefined,
    referredBy: row.referred_by ?? undefined,
    isMember: row.is_member,
    memberCredit: Number(row.member_credit),
    depositCredit: Number(row.deposit_credit) || 0,
    deletedAt: row.deleted_at ?? undefined,
    memberSince: row.member_since ?? undefined,
    tier: (row.tier as CustomerTier) || "new",
    lastFollowUpAt: row.last_follow_up_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cats: (row.cats || []).map((c) => ({
      id: c.id,
      name: c.name,
      gender: (c.gender as CatGender) ?? undefined,
      breed: c.breed ?? undefined,
      ageValue: c.age_value ?? undefined,
      ageUnit: (c.age_unit as "year" | "month") ?? undefined,
      ageAsOf: c.age_as_of ?? undefined,
      birthday: c.birthday ?? undefined,
      medical: c.medical ?? undefined,
      furLength: (c.fur_length as "short" | "long" | undefined) ?? undefined,
      color: c.color ?? undefined,
      neutered: c.neutered ?? undefined,
      vaccinated: c.vaccinated ?? undefined,
      seizureHistory: c.seizure_history ?? undefined,
      allergy: c.allergy ?? undefined,
      weightKg: c.weight_kg != null && c.weight_kg !== "" ? Number(c.weight_kg) : undefined,
      species: normalizeSpecies(c.species),
      photoDataUrl: c.photo_data_url ?? undefined,
      staffNote: c.staff_note ?? undefined,
      staffPrivateNote: c.staff_private_note ?? undefined,
      groomHealthInfo: c.groom_health_info ?? undefined,
      vaccinePhotos: c.vaccine_photos ?? undefined,
      stayInfo: c.stay_info ?? undefined,
      media: Array.isArray(c.media) ? c.media : undefined,
    })),
  };
}

/**
 * แค่ id/ชื่อ/เบอร์ของลูกค้าทุกคน (ยังไม่ถูกลบ) — ใช้กันสมัครซ้ำด้วยเบอร์
 * ไม่ดึงข้อมูลน้อง/รูปทั้งร้านมาเหมือน fetchAllCustomers (ร้านลูกค้าเยอะแล้วสมัครช้าลงเรื่อย ๆ)
 * เทียบเบอร์ฝั่งโค้ด (normPhone) เพราะเบอร์ที่เก็บไว้มีหลายรูปแบบ (ขีด/เว้นวรรค/+66)
 */
async function listCustomerPhones(): Promise<Pick<CustomerRecord, "id" | "name" | "phone">[]> {
  const sb = getSupabase();
  if (!sb) {
    return (await fetchAllCustomers()).map((c) => ({ id: c.id, name: c.name, phone: c.phone }));
  }
  // select("*") ไม่ระบุ deleted_at ตรง ๆ — ร้านที่ยังไม่ migrate คอลัมน์นี้จะได้ไม่ error แล้วได้รายชื่อว่าง
  const rows = await selectAllRows<{ id: string; name: string; phone: string | null; deleted_at?: string | null }>(
    (from, to) =>
      sb
        .from("customers")
        .select("*")
        .eq("tenant_id", requireTenantId())
        .not("phone", "is", null)
        .order("id")
        .range(from, to)
  );
  return rows
    .filter((r) => !r.deleted_at)
    .map((r) => ({ id: r.id, name: r.name, phone: r.phone || undefined }));
}

async function fetchAllCustomers(
  includeDeleted = false
): Promise<CustomerRecord[]> {
  const sb = getSupabase();
  let all: CustomerRecord[];
  if (sb) {
    // เรียงตาม "สมัครล่าสุด" ไม่ใช่ "แก้ไขล่าสุด" — เดิมใช้ updated_at ทำให้ลูกค้าเก่าที่ถูกแก้ไข
    // (เติมแต้ม/แก้ข้อมูล/มีนัดใหม่) ลอยขึ้นแซงลูกค้าที่เพิ่งสมัครจริงๆ จนหาลูกค้าใหม่ไม่เจอ
    const { data } = await sb
      .from("customers")
      .select("*, cats(*)")
      .eq("tenant_id", requireTenantId())
      .order("created_at", { ascending: false });
    all = ((data as CustomerRow[] | null) || []).map(mapCustomer);
  } else {
    all = [...memCustomers.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }
  return includeDeleted ? all : all.filter((c) => !c.deletedAt);
}

/** ลูกค้าที่ถูกลบ (ถังขยะ) — กู้คืนได้ */
export async function listTrashedCustomers() {
  const all = await fetchAllCustomers(true);
  return all.filter((c) => c.deletedAt);
}

async function touchCustomer(id: string) {
  const sb = getSupabase();
  const now = new Date().toISOString();
  if (sb) {
    await sb
      .from("customers")
      .update({ updated_at: now })
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
  } else {
    const c = memCustomers.get(id);
    if (c) c.updatedAt = now;
  }
}

async function attachAppointmentCounts(customers: CustomerRecord[]) {
  const allBookings = await listBookings();
  return customers.map((c) => ({
    ...c,
    upcomingAppointments: allBookings.filter(
      (b) => bookingMatchesCustomer(b, c) && isUpcomingBooking(b)
    ).length,
  }));
}

export async function listCustomers() {
  return fetchAllCustomers();
}

export async function listCustomersWithAppointmentCounts() {
  return attachAppointmentCounts(await fetchAllCustomers());
}

export async function getCustomer(id: string) {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from("customers")
      .select("*, cats(*)")
      .eq("id", id)
      .eq("tenant_id", requireTenantId())
      .maybeSingle();
    return data ? mapCustomer(data as CustomerRow) : undefined;
  }
  return memCustomers.get(id);
}

export async function findCustomerByLine(lineUserId: string) {
  const uid = (lineUserId || "").trim();
  if (!uid) return undefined;
  const sb = getSupabase();
  // ลูกค้าที่ร้านลบแล้ว (ถังขยะ) ไม่นับ — ฝั่งลูกค้าเห็นเป็น "ยังไม่สมัคร" ต้องสมัครใหม่
  // ดึงหลายแถวแล้วกรองฝั่งโค้ด (select("*") ไม่อ้าง deleted_at ตรง ๆ — ฐานที่ยังไม่มีคอลัมน์จะได้ไม่ error)
  const firstLive = (rows: CustomerRow[] | null) => {
    const row = (rows || []).find((r) => !r.deleted_at);
    return row ? mapCustomer(row) : undefined;
  };
  if (sb) {
    const tenantId = requireTenantId();
    // จับคู่ทั้ง line_user_id หลัก และรายการ line_user_ids ที่ผูกไว้ (คนละอุปกรณ์/Provider)
    // uid เป็น LINE User ID (ตัวอักษร+ตัวเลข) ปลอดภัยพอจะใส่ใน .or filter
    const safe = /^[A-Za-z0-9_-]+$/.test(uid);
    if (safe) {
      try {
        const { data, error } = await sb
          .from("customers")
          .select("*, cats(*)")
          .eq("tenant_id", tenantId)
          .or(`line_user_id.eq.${uid},line_user_ids.cs.{${uid}}`)
          .order("updated_at", { ascending: false })
          .limit(10);
        if (!error) return firstLive(data as CustomerRow[] | null);
      } catch {
        /* ยังไม่มีคอลัมน์ line_user_ids — ตกไปใช้แบบเดิม */
      }
    }
    // สำรอง: จับคู่เฉพาะ line_user_id หลัก (เผื่อยังไม่รัน migration)
    const { data } = await sb
      .from("customers")
      .select("*, cats(*)")
      .eq("line_user_id", uid)
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .limit(10);
    return firstLive(data as CustomerRow[] | null);
  }
  return [...memCustomers.values()].find(
    (c) => !c.deletedAt && (c.lineUserId === uid || (c.lineUserIds || []).includes(uid))
  );
}

/**
 * เวลาที่ร้านลบบัญชีเก่าของ LINE ID นี้ล่าสุด (ไม่เคยถูกลบ = undefined)
 * ใช้ซ่อนของเก่าก่อนวันลบจากฝั่งลูกค้า — กลับมาสมัครใหม่ก็เริ่มจากศูนย์
 */
export async function lineDeletedAt(lineUserId: string): Promise<string | undefined> {
  const uid = (lineUserId || "").trim();
  if (!uid) return undefined;
  const sb = getSupabase();
  let rows: { deleted_at?: string | null }[] = [];
  if (sb) {
    if (!/^[A-Za-z0-9_-]+$/.test(uid)) return undefined;
    try {
      const { data, error } = await sb
        .from("customers")
        .select("*")
        .eq("tenant_id", requireTenantId())
        .or(`line_user_id.eq.${uid},line_user_ids.cs.{${uid}}`)
        .limit(20);
      if (!error) rows = (data as CustomerRow[] | null) || [];
    } catch {
      /* ยังไม่มีคอลัมน์ line_user_ids */
    }
  } else {
    rows = [...memCustomers.values()]
      .filter((c) => c.lineUserId === uid || (c.lineUserIds || []).includes(uid))
      .map((c) => ({ deleted_at: c.deletedAt }));
  }
  const times = rows.map((r) => r.deleted_at || "").filter(Boolean).sort();
  return times[times.length - 1];
}

/**
 * ปลด LINE ID หลักออกจากลูกค้าที่ถูกลบ — line_user_id ห้ามซ้ำในร้านเดียวกัน
 * ไม่ปลด = คนเดิมกลับมาสมัครใหม่สร้างบัญชีไม่ได้ (ลูกค้าที่ลบไว้ก่อนแก้นี้ยังถือ ID ค้างอยู่)
 * line_user_ids ยังเก็บไว้ ใช้ผูกกลับตอนกู้จากถังขยะ
 */
async function releaseLineFromDeleted(lineUserId: string) {
  const sb = getSupabase();
  if (!sb || !lineUserId) return;
  try {
    await sb
      .from("customers")
      .update({ line_user_id: null })
      .eq("tenant_id", requireTenantId())
      .eq("line_user_id", lineUserId)
      .not("deleted_at", "is", null);
  } catch {
    /* ยังไม่มีคอลัมน์ deleted_at — ไม่มีใครถูกลบนุ่ม */
  }
}

/** รหัสชวนเพื่อนของลูกค้า — คิดจาก id แบบเสถียร (ไม่ต้องเก็บ DB) */
export function referralCodeFor(customerId: string): string {
  const s = customerId || "";
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return "CAT" + h.toString(36).toUpperCase().padStart(6, "0").slice(-6);
}

/** หาลูกค้าจากรหัสชวนเพื่อน (สแกนเทียบรหัสที่คิดจาก id) */
export async function findCustomerByReferralCode(code: string) {
  const target = (code || "").trim().toUpperCase();
  if (!target) return undefined;
  const all = await fetchAllCustomers();
  return all.find((c) => referralCodeFor(c.id) === target);
}

/** บันทึกว่าลูกค้าถูกชวนมาโดยใคร (กันออกคูปองซ้ำ) — graceful */
export async function setReferredBy(customerId: string, referrerId: string) {
  const c = await getCustomer(customerId);
  if (!c) return;
  c.referredBy = referrerId;
  const sb = getSupabase();
  if (sb) {
    // supabase ไม่ throw แต่คืน error มา — เดิมกลืนเงียบ ถ้ายังไม่ได้ migrate คอลัมน์ referred_by
    // สมัครผ่านลิงก์เพื่อนจะ "ดูเหมือนสำเร็จ" แต่ไม่มีใครได้คูปองตอนมาใช้บริการ
    const { error } = await sb
      .from("customers")
      .update({ referred_by: referrerId })
      .eq("id", customerId)
      .eq("tenant_id", requireTenantId());
    if (error) throw new Error(`บันทึกคนชวนไม่สำเร็จ (ยังไม่ได้ migrate customers.referral_code?): ${error.message}`);
  } else {
    memCustomers.set(customerId, c);
  }
}

export async function searchCustomers(query: string) {
  const q = query.trim().toLowerCase();
  const all = await fetchAllCustomers();
  if (!q) return attachAppointmentCounts(all);
  const filtered = all.filter((c) => {
    const hay = [
      c.name,
      c.phone,
      c.lineUserId,
      c.lineDisplayName || "",
      ...c.cats.map((cat) => cat.name),
      ...c.cats.map((cat) => cat.staffNote || ""),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
  return attachAppointmentCounts(filtered);
}

function normName(s: string) {
  return s.trim().toLowerCase();
}

/**
 * เบอร์โทรแบบเทียบได้ — ตัดอักขระที่ไม่ใช่ตัวเลข + แปลง +66 เป็น 0
 * ใช้เป็น "ตัวระบุตัวตนหลัก" ตอนลูกค้าสมัครเอง (ชื่อ LINE เชื่อไม่ได้ แต่เบอร์เชื่อได้)
 */
function normPhone(s?: string): string {
  const d = (s || "").replace(/\D/g, "");
  if (!d) return "";
  const local = d.startsWith("66") ? `0${d.slice(2)}` : d;
  return local.length >= 9 ? local : "";
}

/**
 * ตัดบรรทัด "ของแถมฟรี" (และบรรทัดเฉพาะการจอง) ออกจากโน้ตนิสัยแมว
 * โน้ตนิสัยเป็นข้อมูลถาวรของแมว ไม่ควรมีของแถมของบิลนั้นๆ ปนเข้ามา
 */
function cleanCatPersonalityNote(note?: string): string | undefined {
  if (!note) return note;
  const cleaned = note
    .split("\n")
    .filter((line) => !line.trim().startsWith("🎁"))
    .join("\n")
    .trim();
  return cleaned || undefined;
}

/** ลูกค้าเปิดแอปจาก LINE → สร้าง/ผูกบัญชีอัตโนมัติ */
export async function upsertCustomerFromLine(data: {
  lineUserId: string;
  displayName: string;
}) {
  const lineUserId = data.lineUserId.trim();
  const displayName = data.displayName.trim() || "ลูกค้า LINE";
  if (!lineUserId) return null;

  const sb = getSupabase();
  let existing = await findCustomerByLine(lineUserId);

  if (!existing) {
    const all = await fetchAllCustomers();
    // 1) ลูกค้าที่ร้านสร้างเองไว้ (ยังไม่ผูก LINE) แล้วชื่อตรงกับชื่อ LINE
    existing = all.find(
      (c) => !c.lineUserId && normName(c.name) === normName(displayName)
    );
    // 2) ลูกค้าที่ผูก LINE แล้วและ "ชื่อโปรไฟล์ LINE" ตรงกันเป๊ะ + มีคนเดียว —
    //    คือคนเดียวกันแต่ LINE ให้ User ID คนละตัว (คอม/มือถือคนละ Provider)
    //    → ผูก ID ใหม่เข้า record เดิม ไม่สร้างซ้ำ ไม่ให้แต้ม/คูปองแตก
    if (!existing) {
      const sameLine = all.filter(
        (c) =>
          c.lineDisplayName &&
          normName(c.lineDisplayName) === normName(displayName) &&
          !(c.lineUserIds || [c.lineUserId]).includes(lineUserId)
      );
      if (sameLine.length === 1) existing = sameLine[0];
    }
  }

  const now = new Date().toISOString();

  if (existing) {
    // รวม LINE ID ทุกตัวของลูกค้าคนนี้ (union) — ไม่ทิ้งตัวเก่า เพื่อให้ค้นเจอทุกอุปกรณ์
    const ids = new Set(
      [...(existing.lineUserIds || []), existing.lineUserId, lineUserId].filter(Boolean) as string[]
    );
    existing.lineUserIds = [...ids];
    existing.lineUserId = lineUserId;
    existing.lineDisplayName = displayName;
    // ไม่ทับชื่อที่ร้านตั้งเอง — อัปเดตแค่ชื่อ LINE
    existing.updatedAt = now;
    if (sb) {
      // ปกติเขียนรวดเดียว (1 รอบ DB) — ถ้าพัง (ฐานยังไม่มีคอลัมน์ line_user_ids/deleted_at) ค่อยเขียนแยกทีละส่วนแบบเดิม
      const { error: oneShotError } = await sb
        .from("customers")
        .update({
          line_user_id: lineUserId,
          line_display_name: displayName,
          updated_at: now,
          line_user_ids: existing.lineUserIds,
        })
        .eq("id", existing.id)
        .eq("tenant_id", requireTenantId());
      if (oneShotError) {
      await sb
        .from("customers")
        .update({
          line_user_id: lineUserId,
          line_display_name: displayName,
          updated_at: now,
        })
        .eq("id", existing.id)
        .eq("tenant_id", requireTenantId());
      // เก็บ ID ทุกตัวแยก (คอลัมน์ใหม่) — ถ้ายังไม่รัน migration ก็ไม่พัง
      try {
        await sb
          .from("customers")
          .update({ line_user_ids: existing.lineUserIds })
          .eq("id", existing.id)
          .eq("tenant_id", requireTenantId());
      } catch {
        /* ยังไม่มีคอลัมน์ line_user_ids */
      }
      }
    } else {
      memCustomers.set(existing.id, existing);
    }
    await linkBookingsToLineCustomer(existing);
    return existing;
  }

  // คนที่ร้านลบไปแล้วกลับมาเปิดแอป = เริ่มบัญชีใหม่ ไม่กู้ของเก่ากลับมาเอง
  await releaseLineFromDeleted(lineUserId);

  // สุ่มท้าย id — id นี้ทำหน้าที่เป็น "โทเคนเชิญ" ในลิงก์ผูก LINE ถ้าเดาได้ = คนอื่นยึดบัญชีลูกค้าที่ยังไม่ผูกได้
  const id = `C${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const customer: CustomerRecord = {
    id,
    name: displayName,
    lineUserId,
    lineUserIds: [lineUserId],
    lineDisplayName: displayName,
    marketingConsent: true,
    cats: [],
    isMember: false,
    memberCredit: 0,
    depositCredit: 0,
    tier: "new",
    createdAt: now,
    updatedAt: now,
  };

  if (sb) {
    const { error } = await sb.from("customers").insert({
      id,
      tenant_id: requireTenantId(),
      name: displayName,
      line_user_id: lineUserId,
      line_display_name: displayName,
      is_member: false,
      member_credit: 0,
      tier: "new",
      created_at: now,
      updated_at: now,
    });
    if (error) {
      // เผยข้อผิดพลาดจริงแทนที่จะเงียบ (เดิมทำให้ลงทะเบียน "ไม่สำเร็จ" โดยไม่บอกสาเหตุ)
      throw new Error(`สร้างบัญชีลูกค้าไม่สำเร็จ: ${error.message}`);
    }
    try {
      await sb
        .from("customers")
        .update({ line_user_ids: [lineUserId] })
        .eq("id", id)
        .eq("tenant_id", requireTenantId());
    } catch {
      /* ยังไม่มีคอลัมน์ line_user_ids */
    }
  } else {
    memCustomers.set(id, customer);
  }

  await linkBookingsToLineCustomer(customer);
  return customer;
}

/** ผูก LINE กับลูกค้าที่ร้านสร้างไว้แล้ว (ลิงก์เชิญจากหลังบ้าน) */
export async function linkCustomerToLine(data: {
  customerId: string;
  lineUserId: string;
  displayName: string;
}) {
  const customerId = data.customerId.trim();
  const lineUserId = data.lineUserId.trim();
  const displayName = data.displayName.trim() || "ลูกค้า LINE";
  if (!customerId || !lineUserId) return null;

  const customer = await getCustomer(customerId);
  if (!customer) return { ok: false as const, error: "not_found" };

  if (customer.lineUserId && customer.lineUserId !== lineUserId) {
    return { ok: false as const, error: "already_linked" };
  }

  const other = await findCustomerByLine(lineUserId);
  if (other && other.id !== customerId) {
    // LINE นี้ไปอยู่บนอีก record แล้ว — เกือบทุกครั้งคือ "คนเดียวกัน" ที่สมัครซ้ำ
    // หรือระบบสร้างบัญชีอัตโนมัติตอนเปิดแอปครั้งแรก (คนละ record กับที่ร้านสร้างไว้)
    // จึงรวมบัญชีเก่าเข้าบัญชีที่ร้านสร้างไว้ (target) แทนการบล็อก แล้วค่อยผูก LINE ต่อ
    // (ย้ายแต้ม/คูปอง/บิล/แมว/เครดิตไปที่ target แล้ว soft-delete ตัวซ้ำ — กู้จากถังขยะได้)
    await mergeCustomers(other.id, customerId);
  }

  customer.lineUserId = lineUserId;
  customer.lineDisplayName = displayName;
  customer.updatedAt = new Date().toISOString();

  const sb = getSupabase();
  if (sb) {
    await sb
      .from("customers")
      .update({
        line_user_id: lineUserId,
        line_display_name: displayName,
        updated_at: customer.updatedAt,
      })
      .eq("id", customerId)
      .eq("tenant_id", requireTenantId());
  } else {
    memCustomers.set(customerId, customer);
  }

  await linkBookingsToLineCustomer(customer);
  const refreshed = await getCustomer(customerId);
  if (refreshed) await recalculateCustomerTier(refreshed.id);
  return { ok: true as const, customer: refreshed || customer };
}

/**
 * ผูก LINE ให้ลูกค้าโดยดึงจาก "นัด" ของเขาเอง — ลูกค้าไม่ต้องกดอะไรเลย
 * นัดที่จองผ่าน LINE เก็บ lineUserId ไว้กับตัวนัดอยู่แล้ว จึงย้อนหาได้เสมอ
 * ถ้า LINE นั้นไปค้างบน record อื่นที่ยังไม่ถูกลบ → รวมเข้ามาก่อนแล้วค่อยผูก
 */
export async function adoptLineFromBookings(customerId: string) {
  const customer = await getCustomer(customerId);
  if (!customer) return { ok: false as const, error: "not_found" };
  if (customer.lineUserId)
    return { ok: true as const, lineUserId: customer.lineUserId, already: true };

  // 1) เคยรวมบัญชีมาก่อน → LINE ถูกเก็บไว้ในช่องสำรอง (line_user_ids) แล้ว
  //    แค่ไม่ได้ตั้งเป็นช่องหลัก ป้ายเลยยังขึ้น "ยังไม่ผูก" — ยกขึ้นมาเป็นตัวหลักได้เลย
  const fromBackup = (customer.lineUserIds || []).find(Boolean);

  const { listBookings } = await import("./bookings-store");
  const { bookingMatchesCustomer } = await import("./booking-customer-match");
  const bookings = await listBookings();
  // 2) หาจากนัด — นัดล่าสุดก่อน (ถ้าลูกค้าเปลี่ยนเครื่อง จะได้ตัวที่ใช้อยู่จริง)
  //    ต้องจับคู่ด้วยชื่อเจ้าของเท่านั้น ห้ามใช้ชื่อแมวเด็ดขาด —
  //    ลูกค้าคนละคนตั้งชื่อแมวซ้ำกันได้ (เช่น "ทาโร่") จะดึง LINE ผิดคนทันที
  const fromBookings = bookings
    .filter((b) => b.lineUserId && bookingMatchesCustomer(b, customer))
    .map((b) => b.lineUserId as string);

  const lineUserId = fromBackup || fromBookings[0];
  if (!lineUserId) return { ok: false as const, error: "no_booking_line" };

  // LINE นี้อยู่บน record อื่นที่ยังไม่ถูกลบ → รวมเข้ามาก่อน
  const other = await findCustomerByLine(lineUserId);
  if (other && other.id !== customerId) {
    await mergeCustomers(other.id, customerId);
  }

  // ตั้งเป็น "ช่องหลัก" เสมอ ไม่ว่าจะผ่านทางรวมบัญชีหรือไม่
  // (record ต้นทางอาจถือ LINE ไว้ในช่องสำรองเหมือนกัน การรวมจึงไม่มีช่องหลักให้ยกมา)
  const now = new Date().toISOString();
  customer.lineUserId = lineUserId;
  customer.updatedAt = now;
  const sb = getSupabase();
  if (sb) {
    // ต้องถอด LINE ออกจาก record เก่าก่อน — ตารางห้าม line_user_id ซ้ำ
    // record ที่ถูกรวมไปแล้วเป็นการลบแบบนุ่ม (แถวยังอยู่) ถ้าไม่ถอดออก
    // การเขียนลงตัวใหม่จะถูกปฏิเสธเงียบๆ → ขึ้นว่าสำเร็จแต่ไม่ผูกจริง
    const tenantId = requireTenantId();
    await sb
      .from("customers")
      .update({ line_user_id: null })
      .eq("line_user_id", lineUserId)
      .neq("id", customerId)
      .eq("tenant_id", tenantId);
    const { error } = await sb
      .from("customers")
      .update({ line_user_id: lineUserId, updated_at: now })
      .eq("id", customerId)
      .eq("tenant_id", tenantId);
    if (error) {
      return { ok: false as const, error: `write_failed: ${error.message}` };
    }
  } else {
    for (const c of memCustomers.values()) {
      if (c.id !== customerId && c.lineUserId === lineUserId) c.lineUserId = undefined;
    }
    const cur = memCustomers.get(customerId) || customer;
    cur.lineUserId = lineUserId;
    cur.updatedAt = now;
    memCustomers.set(customerId, cur);
  }

  await linkBookingsToLineCustomer((await getCustomer(customerId)) || customer);
  const refreshed = await getCustomer(customerId);
  return {
    ok: true as const,
    lineUserId: refreshed?.lineUserId || lineUserId,
    merged: Boolean(other && other.id !== customerId),
  };
}

/**
 * ปลดผูก LINE ออกจากลูกค้า — ล้างทั้ง ID หลักและ ID สำรองทุกตัว
 * ใช้ตอนผูกผิดคน/ผูกมั่ว แล้วอยากส่งลิงก์เชิญให้ลูกค้ากดผูกใหม่จากศูนย์
 * แต้ม/คูปอง/บิล ไม่หาย เพราะผูกกับตัวลูกค้า (C:<id>) ไม่ได้ผูกกับ LINE ID
 */
export async function unlinkCustomerLine(customerId: string) {
  const customer = await getCustomer(customerId);
  if (!customer) return { ok: false as const, error: "not_found" };

  customer.lineUserId = undefined;
  customer.lineDisplayName = undefined;
  customer.lineUserIds = [];
  customer.updatedAt = new Date().toISOString();

  const sb = getSupabase();
  if (sb) {
    const tenantId = requireTenantId();
    await sb
      .from("customers")
      .update({
        line_user_id: null,
        line_display_name: null,
        updated_at: customer.updatedAt,
      })
      .eq("id", customerId)
      .eq("tenant_id", tenantId);
    try {
      await sb
        .from("customers")
        .update({ line_user_ids: [] })
        .eq("id", customerId)
        .eq("tenant_id", tenantId);
    } catch {
      /* ยังไม่มีคอลัมน์ line_user_ids */
    }
  } else {
    memCustomers.set(customerId, customer);
  }
  return { ok: true as const };
}

/** ข้อมูลย่อสำหรับหน้าผูก LINE */
export async function getCustomerLinkPreview(customerId: string) {
  const c = await getCustomer(customerId);
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    cats: c.cats.map((cat) => ({ id: cat.id, name: cat.name })),
    hasLine: Boolean(c.lineUserId),
  };
}

/** ผูกนัดเก่าที่ชื่อตรงแต่ยังไม่มี LINE ID */
async function linkBookingsToLineCustomer(customer: CustomerRecord) {
  if (!customer.lineUserId) return;
  const { listBookingsWithoutLine, updateBooking } = await import("./bookings-store");
  const { bookingMatchesCustomer } = await import("./booking-customer-match");
  // เฉพาะนัดที่ยังไม่ผูก LINE — เดิมดึงนัดทั้งร้านทุกครั้งที่ลูกค้าเปิดแอป/สมัคร
  const bookings = await listBookingsWithoutLine();
  for (const b of bookings) {
    if (b.lineUserId) continue;
    if (bookingMatchesCustomer(b, customer)) {
      await updateBooking(b.id, { lineUserId: customer.lineUserId });
    }
  }
}

export async function findCustomerByCatName(catName: string) {
  const q = normName(catName);
  if (!q) return [];
  return (await fetchAllCustomers()).filter((c) =>
    c.cats.some((cat) => normName(cat.name) === q)
  );
}

/** หาลูกค้าตอนบันทึกนัด — รู้แค่ชื่อแมวหรือชื่อ LINE ก็ได้ */
export async function resolveCustomerForBooking(data: {
  customerName?: string;
  catName: string;
  lineUserId?: string;
  customerId?: string;
  phone?: string;
  staffNote?: string;
}) {
  const catName = data.catName.trim();
  if (!catName) return null;

  let existing: CustomerRecord | undefined;

  if (data.customerId) {
    existing = await getCustomer(data.customerId);
  }
  if (!existing && data.lineUserId) {
    existing = await findCustomerByLine(data.lineUserId);
  }
  if (!existing && data.customerName?.trim()) {
    const name = data.customerName.trim();
    existing = (await fetchAllCustomers()).find(
      (c) =>
        normName(c.name) === normName(name) &&
        (c.cats.length === 0 ||
          c.cats.some((cat) => normName(cat.name) === normName(catName)))
    );
  }
  if (!existing) {
    const byCat = await findCustomerByCatName(catName);
    if (byCat.length === 1) {
      existing = byCat[0];
    } else if (byCat.length > 1 && data.customerName?.trim()) {
      existing = byCat.find(
        (c) => normName(c.name) === normName(data.customerName!.trim())
      );
    }
  }

  const customerName =
    existing?.name ||
    data.customerName?.trim() ||
    `ลูกค้า (${catName})`;
  const lineUserId = data.lineUserId || existing?.lineUserId;

  return upsertCustomerFromBooking({
    customerName,
    catName,
    lineUserId,
    phone: data.phone,
    staffNote: data.staffNote,
  });
}

export async function upsertCustomerFromBooking(data: {
  customerName: string;
  catName: string;
  lineUserId?: string;
  phone?: string;
  staffNote?: string;
}) {
  const sb = getSupabase();
  // โน้ตนิสัยแมว = ข้อมูลถาวร; ตัดของแถมของบิลนั้นๆ ออก ไม่ให้ปนลงข้อมูลแมว
  const catNote = cleanCatPersonalityNote(data.staffNote);
  let existing =
    (data.lineUserId && (await findCustomerByLine(data.lineUserId))) ||
    (await fetchAllCustomers()).find(
      (c) =>
        normName(c.name) === normName(data.customerName) &&
        (c.cats.length === 0 ||
          c.cats.some((cat) => normName(cat.name) === normName(data.catName)))
    );

  const now = new Date().toISOString();

  if (!existing) {
    // สุ่มท้าย id — id นี้ทำหน้าที่เป็น "โทเคนเชิญ" ในลิงก์ผูก LINE ถ้าเดาได้ = คนอื่นยึดบัญชีลูกค้าที่ยังไม่ผูกได้
  const id = `C${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    const catId = `CAT${Date.now()}`;
    existing = {
      id,
      name: data.customerName,
      phone: data.phone,
      lineUserId: data.lineUserId,
      marketingConsent: true,
      cats: [{ id: catId, name: data.catName, staffNote: catNote }],
      isMember: false,
      memberCredit: 0,
      depositCredit: 0,
      tier: "new",
      createdAt: now,
      updatedAt: now,
    };

    if (sb) {
      await sb.from("customers").insert({
        id,
        tenant_id: requireTenantId(),
        name: data.customerName,
        phone: data.phone || null,
        line_user_id: data.lineUserId || null,
        is_member: false,
        member_credit: 0,
        tier: "new",
        created_at: now,
        updated_at: now,
      });
      await sb.from("cats").insert({
        id: catId,
        tenant_id: requireTenantId(),
        customer_id: id,
        name: data.catName,
        staff_note: catNote || null,
      });
    } else {
      memCustomers.set(id, existing);
    }
    return existing;
  }

  if (data.lineUserId) existing.lineUserId = data.lineUserId;
  if (data.phone) existing.phone = data.phone;

  if (!existing.cats.some((cat) => cat.name === data.catName)) {
    const catId = `CAT${Date.now()}`;
    existing.cats.push({ id: catId, name: data.catName, staffNote: catNote });
    if (sb) {
      await sb.from("cats").insert({
        id: catId,
        tenant_id: requireTenantId(),
        customer_id: existing.id,
        name: data.catName,
        staff_note: catNote || null,
      });
    }
  } else if (catNote && !existing.cats.find((x) => x.name === data.catName)?.staffNote) {
    // เติมโน้ตนิสัยให้เฉพาะตอนแมวยังไม่มีโน้ตเท่านั้น
    // ห้ามให้การจองครั้งใหม่ไปทับโน้ตนิสัยเดิมที่ร้านตั้งไว้
    const cat = existing.cats.find((x) => x.name === data.catName);
    if (cat) {
      cat.staffNote = catNote;
      if (sb) {
        await sb
          .from("cats")
          .update({ staff_note: catNote })
          .eq("id", cat.id)
          .eq("tenant_id", requireTenantId());
      }
    }
  }

  existing.updatedAt = now;
  if (sb) {
    await sb
      .from("customers")
      .update({
        line_user_id: existing.lineUserId || null,
        phone: existing.phone || null,
        updated_at: now,
      })
      .eq("id", existing.id)
      .eq("tenant_id", requireTenantId());
  } else {
    memCustomers.set(existing.id, existing);
  }
  return existing;
}

const WALKIN_CUSTOMER_NAME = "ลูกค้าหน้าร้าน (ขายเร็ว)";

/**
 * ลูกค้าโครงสำหรับ "ขายเร็ว ไม่ระบุลูกค้า" (POS ขายของหน้าร้านโดยไม่ผูกกับใคร) —
 * หาก่อนด้วยชื่อ (tenant-scoped อัตโนมัติผ่าน requireTenantId() ใน fetchAllCustomers)
 * แล้วค่อยสร้างถ้ายังไม่มี ห้าม hardcode id ตายตัว เพราะ customers.id เป็น primary key
 * แบบ global (ไม่ใช่ composite กับ tenant_id) — id ซ้ำข้ามร้านจะชน constraint
 */
export async function getOrCreateWalkInCustomer(): Promise<CustomerRecord> {
  const all = await fetchAllCustomers();
  const existing = all
    .filter((c) => c.name === WALKIN_CUSTOMER_NAME)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (existing) return existing;

  const sb = getSupabase();
  const now = new Date().toISOString();
  const id = `WALK${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const rec: CustomerRecord = {
    id,
    name: WALKIN_CUSTOMER_NAME,
    marketingConsent: false,
    cats: [],
    isMember: false,
    memberCredit: 0,
    depositCredit: 0,
    tier: "new",
    createdAt: now,
    updatedAt: now,
  };
  if (sb) {
    await sb.from("customers").insert({
      id,
      tenant_id: requireTenantId(),
      name: WALKIN_CUSTOMER_NAME,
      marketing_consent: false,
      is_member: false,
      member_credit: 0,
      tier: "new",
      created_at: now,
      updated_at: now,
    });
  } else {
    memCustomers.set(id, rec);
  }
  return rec;
}

export async function findCustomerForBooking(
  booking: Pick<Booking, "customerName" | "catName"> & { lineUserId?: string }
) {
  const all = await fetchAllCustomers();
  return all.find((c) => bookingMatchesCustomer(booking, c));
}

export async function updateCustomer(
  id: string,
  patch: Partial<
    Pick<
      CustomerRecord,
      | "name"
      | "phone"
      | "email"
      | "birthday"
      | "lineUserId"
      | "marketingConsent"
      | "referralSource"
      | "address"
      | "addressMapUrl"
      | "postalCode"
      | "isMember"
      | "memberCredit"
      | "memberSince"
      | "tier"
      | "lastFollowUpAt"
    >
  > & { taxInvoice?: CustomerTaxInvoice | null }
) {
  const c = await getCustomer(id);
  if (!c) return null;

  Object.assign(c, patch);
  if (patch.taxInvoice === null) c.taxInvoice = undefined;
  if (patch.isMember && !c.memberSince) {
    c.memberSince = new Date().toISOString().slice(0, 10);
  }
  c.updatedAt = new Date().toISOString();

  const sb = getSupabase();
  if (sb) {
    await sb
      .from("customers")
      .update({
        name: c.name,
        phone: c.phone || null,
        email: c.email || null,
        birthday: c.birthday || null,
        line_user_id: c.lineUserId || null,
        line_display_name: c.lineDisplayName || null,
        marketing_consent: c.marketingConsent,
        referral_source: c.referralSource || null,
        is_member: c.isMember,
        member_credit: c.memberCredit,
        member_since: c.memberSince || null,
        tier: c.tier,
        last_follow_up_at: c.lastFollowUpAt || null,
        updated_at: c.updatedAt,
      })
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
    if (
      patch.address !== undefined ||
      patch.addressMapUrl !== undefined ||
      patch.postalCode !== undefined
    ) {
      // คอลัมน์ใหม่ — best-effort เผื่อยังไม่ได้รัน migration
      await sb
        .from("customers")
        .update({
          address: c.address || null,
          address_map_url: c.addressMapUrl || null,
          postal_code: c.postalCode || null,
        })
        .eq("id", id)
        .eq("tenant_id", requireTenantId())
        .then(
          () => {},
          () => {}
        );
    }
    if (patch.taxInvoice !== undefined) {
      // คอลัมน์ใหม่ — แยกเขียนเผื่อยังไม่ได้รัน migration จะได้ไม่ทำให้ช่องอื่นเซฟไม่ติด
      const write = () =>
        sb
          .from("customers")
          .update({ tax_invoice: c.taxInvoice ?? null })
          .eq("id", id)
          .eq("tenant_id", requireTenantId());
      const { error } = await write();
      if (error && (await ensureMigration("customers.tax_invoice"))) await write();
    }
  } else {
    memCustomers.set(id, c);
  }
  return c;
}

/**
 * ปรับยอดมัดจำล่วงหน้าของลูกค้า (+รับมัดจำ / −หักออกจากบิล).
 * เขียนเฉพาะคอลัมน์ deposit_credit + ครอบ try/catch — ถ้ายังไม่รัน OVERNIGHT_SQL.md
 * จะได้ need_sql โดยไม่ทำให้การบันทึกอื่นพัง.
 */
export async function adjustDepositCredit(customerId: string, delta: number) {
  const c = await getCustomer(customerId);
  if (!c) return { ok: false as const, error: "not_found" as const, balance: 0 };
  const next = Math.max(0, Math.round((c.depositCredit || 0) + delta));
  c.depositCredit = next;
  c.updatedAt = new Date().toISOString();
  const sb = getSupabase();
  if (sb) {
    try {
      const { error } = await sb
        .from("customers")
        .update({ deposit_credit: next })
        .eq("id", customerId)
        .eq("tenant_id", requireTenantId());
      if (error) {
        return { ok: false as const, error: "need_sql" as const, balance: next };
      }
    } catch {
      return { ok: false as const, error: "need_sql" as const, balance: next };
    }
  } else {
    memCustomers.set(customerId, c);
  }
  return { ok: true as const, balance: next };
}

/** น้ำหนัก (กก.) ที่รับได้ — ตัดค่าที่ไม่ใช่ตัวเลข/ติดลบ/เกินจริงทิ้ง และปัดเหลือทศนิยม 2 ตำแหน่ง */
export function normalizeWeightKg(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  if (!isFinite(n) || n <= 0 || n > 200) return undefined;
  return Math.round(n * 100) / 100;
}

/** เขียนชนิดน้อง (หมา/แมว) — คอลัมน์ใหม่ ถ้ายังไม่มีให้อัปเดตฐานข้อมูลแล้วลองอีกครั้ง · พังก็ไม่ทำให้ช่องอื่นเซฟไม่ติด */
async function writeCatSpecies(catId: string, species: PetSpecies) {
  const sb = getSupabase();
  if (!sb) return;
  const write = () =>
    sb.from("cats").update({ species }).eq("id", catId).eq("tenant_id", requireTenantId());
  try {
    const { error } = await write();
    if (error && (await ensureMigration("cats.species"))) await write();
  } catch {
    /* ข้าม */
  }
}

export async function updateCat(
  customerId: string,
  catId: string,
  patch: Partial<
    Pick<
      CatRecord,
      | "name"
      | "photoDataUrl"
      | "staffNote"
      | "gender"
      | "breed"
      | "ageValue"
      | "ageUnit"
      | "birthday"
      | "medical"
      | "furLength"
      | "color"
      | "species"
      | "seizureHistory"
      | "allergy"
    >
  > & { weightKg?: number | null; neutered?: boolean | null; vaccinated?: boolean | null }
) {
  const c = await getCustomer(customerId);
  if (!c) return null;
  const cat = c.cats.find((x) => x.id === catId);
  if (!cat) return null;

  // เปลี่ยนชื่อน้อง — นัด/บิล/ประวัติผูกกับชื่อ ต้องตามไปแก้ทุกที่
  // (route เรียก renameCatAfterUpdate ต่อเอง — ไฟล์นี้ถูก import ฝั่ง client ด้วย ดึง calendar มาไม่ได้)
  // ชื่อซ้ำกับน้องอีกตัวในบ้าน → ไม่เปลี่ยนชื่อ ไม่งั้นประวัติสองตัวจะปนกันแยกไม่ออก
  if (patch.name !== undefined) {
    const nextName = cleanPetName(patch.name);
    const clash = c.cats.some((x) => x.id !== catId && catKey(x.name) === catKey(nextName));
    if (!nextName || clash) {
      const { name: _drop, ...restPatch } = patch;
      void _drop;
      patch = restPatch;
    }
  }

  // เก็บรูปเป็นไฟล์ใน Supabase Storage แทนยัด base64 ลงฐานข้อมูลตรงๆ (ประหยัดพื้นที่ + bandwidth)
  if (patch.photoDataUrl?.startsWith("data:")) {
    patch = {
      ...patch,
      photoDataUrl: await uploadPrivateDataUrl(
        `cats/${catId}/profile-${Date.now()}`,
        patch.photoDataUrl
      ),
    };
  }

  const { weightKg, neutered, vaccinated, ...rest } = patch;
  Object.assign(cat, rest);
  if (typeof rest.name === "string") cat.name = cleanPetName(rest.name);
  // null = ล้างคำตอบ (ไม่ระบุ), ไม่ส่งมา = คงค่าเดิม
  const neuteredChanged = "neutered" in patch;
  if (neuteredChanged) cat.neutered = typeof neutered === "boolean" ? neutered : undefined;
  const vaccinatedChanged = "vaccinated" in patch;
  if (vaccinatedChanged) cat.vaccinated = typeof vaccinated === "boolean" ? vaccinated : undefined;
  const historyChanged = "seizureHistory" in patch || "allergy" in patch;
  if ("seizureHistory" in patch) cat.seizureHistory = patch.seizureHistory?.trim() || undefined;
  if ("allergy" in patch) cat.allergy = patch.allergy?.trim() || undefined;
  // null = ลบน้ำหนักออก, ไม่ส่งมา = คงค่าเดิม
  const weightChanged = "weightKg" in patch;
  if (weightChanged) cat.weightKg = normalizeWeightKg(weightKg);
  // ถ้าแก้อายุ → อัปเดตวันที่อ้างอิงอายุเป็นวันนี้ (ไว้คำนวณอายุปัจจุบัน)
  if (patch.ageValue != null) {
    cat.ageAsOf = new Date().toISOString().slice(0, 10);
  }
  await touchCustomer(customerId);

  const sb = getSupabase();
  if (sb) {
    // เขียนคอลัมน์พื้นฐานเสมอ (ต้องสำเร็จ) แล้วค่อยเขียนรายละเอียดเพิ่ม (best-effort เผื่อยังไม่ migrate)
    await sb
      .from("cats")
      .update({
        name: cat.name,
        photo_data_url: cat.photoDataUrl || null,
        staff_note: cat.staffNote || null,
      })
      .eq("id", catId)
      .eq("tenant_id", requireTenantId());
    try {
      await sb
        .from("cats")
        .update({
          gender: cat.gender || null,
          breed: cat.breed || null,
          age_value: cat.ageValue ?? null,
          age_unit: cat.ageUnit || null,
          age_as_of: cat.ageAsOf || null,
          birthday: cat.birthday || null,
          medical: cat.medical || null,
          fur_length: cat.furLength || null,
          color: cat.color || null,
        })
        .eq("id", catId)
        .eq("tenant_id", requireTenantId());
    } catch {
      /* ยังไม่ได้ migrate คอลัมน์เพิ่ม — ข้าม (ชื่อ/โน้ตยังบันทึกได้) */
    }
    if (patch.species) {
      // คอลัมน์ใหม่ — best-effort เผื่อยังไม่ได้รัน migration
      await writeCatSpecies(catId, patch.species);
    }
    if (weightChanged) {
      // คอลัมน์ใหม่ — แยกเขียนเผื่อยังไม่ได้รัน migration จะได้ไม่ทำให้ช่องอื่นเซฟไม่ติด
      await sb
        .from("cats")
        .update({ weight_kg: cat.weightKg ?? null })
        .eq("id", catId)
        .eq("tenant_id", requireTenantId())
        .then(
          () => {},
          () => {}
        );
    }
    if (vaccinatedChanged) {
      // คอลัมน์ใหม่ (cats.vaccinated) — แยกเขียนเผื่อยังไม่ได้รัน migration
      await sb
        .from("cats")
        .update({ vaccinated: cat.vaccinated ?? null })
        .eq("id", catId)
        .eq("tenant_id", requireTenantId())
        .then(
          () => {},
          () => {}
        );
    }
    if (neuteredChanged) {
      // คอลัมน์ใหม่ (cats.neutered) — แยกเขียนเผื่อยังไม่ได้รัน migration
      await sb
        .from("cats")
        .update({ neutered: cat.neutered ?? null })
        .eq("id", catId)
        .eq("tenant_id", requireTenantId())
        .then(
          () => {},
          () => {}
        );
    }
    if (historyChanged) {
      // คอลัมน์ใหม่ (cats.seizure_history / cats.allergy) — แยกเขียนเผื่อยังไม่ได้รัน migration
      await sb
        .from("cats")
        .update({ seizure_history: cat.seizureHistory ?? null, allergy: cat.allergy ?? null })
        .eq("id", catId)
        .eq("tenant_id", requireTenantId())
        .then(
          () => {},
          () => {}
        );
    }
  } else {
    memCustomers.set(customerId, c);
  }
  return c;
}

/**
 * เทียบชื่อน้องแบบไม่แคร์ช่องว่าง/อักขระล่องหน — ชื่อไทยที่พิมพ์คนละครั้ง
 * อาจมี zero-width หรือสระเรียงคนละแบบ ทำให้ === ไม่ตรงทั้งที่ตาเห็นเหมือนกัน
 * (เหตุเดียวกับที่ทำให้ติ๊กชื่อออกไม่ได้ในหน้าออกบิล — ดู catKey ใน admin/billing/page.tsx)
 */
const ZERO_WIDTH_RE = new RegExp(
  "[" + String.fromCharCode(0x200b, 0x200c, 0x200d, 0xfeff) + "\\s]",
  "g"
);
function catKey(name: string): string {
  return name.normalize("NFC").replace(ZERO_WIDTH_RE, "").toLowerCase();
}

/**
 * หาแมวจาก lineUserId + ชื่อ — ถ้าระบุ catName มาต้องหาตัวที่ตรงจริง (เทียบแบบ normalize แล้ว)
 * ไม่ fallback ไปแมวตัวแรกเงียบๆ เพราะเดาผิดตัวอันตรายกว่าไม่เจอเลย (ประวัติ/โน้ตเตือนของแมวคนละตัวกัน)
 */
async function resolveCatByLine(lineUserId: string, catName?: string) {
  const c = await findCustomerByLine(lineUserId);
  if (!c || c.cats.length === 0) return null;
  if (catName) {
    const key = catKey(catName);
    const cat = c.cats.find((x) => catKey(x.name) === key);
    if (!cat) return null;
    return { customerId: c.id, cat };
  }
  return { customerId: c.id, cat: c.cats[0] };
}

/** อ่านประวัติน้องก่อนอาบน้ำ ที่เก็บไว้ที่แมว (คืน undefined ถ้ายังไม่เคยกรอก) */
export async function getCatGroomInfo(lineUserId: string, catName?: string) {
  const r = await resolveCatByLine(lineUserId, catName);
  return r?.cat.groomHealthInfo;
}

/**
 * ลูกค้าส่งข้อมูลก่อนรับน้องอะไรมาแล้วบ้าง (ใช้ตัดการ์ดที่ไม่ต้องถามซ้ำตอนส่งอัตโนมัติ)
 * ไม่เจอลูกค้า/น้อง = ถือว่ายังไม่มีอะไรเลย
 */
export async function getIntakeStatus(lineUserId: string, catName?: string) {
  const c = await findCustomerByLine(lineUserId);
  const key = catName ? catKey(catName) : "";
  const cat = c?.cats.find((x) => !key || catKey(x.name) === key);
  return {
    stayInfo: stayInfoDone(cat?.stayInfo),
    groomInfo: Boolean(cat?.groomHealthInfo),
    vaccine: splitVaccinePhotos(cat?.vaccinePhotos).length > 0,
    idCard: Boolean(c?.idCardUrl),
  };
}

/** ข้อมูลน้องก่อนเข้าพักที่ลูกค้าเคยกรอกไว้ (อาหาร/นิสัย/การดูแล) */
export async function getCatStayInfo(lineUserId: string, catName?: string) {
  const r = await resolveCatByLine(lineUserId, catName);
  return r?.cat.stayInfo;
}

/**
 * โน้ตที่ช่างควรรู้ก่อนจับน้อง — นิสัยที่ลูกค้าบอก + โน้ตลับร้าน (เช่น "กัด ระวังตอนอาบ")
 * ใช้เติมในบรีฟก่อนอาบน้ำทาง Telegram ซึ่งเห็นเฉพาะพนักงาน ลูกค้าไม่เห็น
 */
export async function getCatStaffNotes(lineUserId: string, catName?: string) {
  const r = await resolveCatByLine(lineUserId, catName);
  if (!r) return undefined;
  return {
    staffNote: r.cat.staffNote?.trim() || undefined,
    privateNote: r.cat.staffPrivateNote?.trim() || undefined,
    medical: r.cat.medical?.trim() || undefined,
    seizureHistory: r.cat.seizureHistory?.trim() || undefined,
    allergy: r.cat.allergy?.trim() || undefined,
  };
}

/** บันทึกประวัติน้องก่อนอาบน้ำ ไว้ที่แมว (ถามครั้งแรกครั้งเดียว) — graceful */
export async function setCatGroomInfo(
  lineUserId: string,
  catName: string | undefined,
  infoJson: string
) {
  const r = await resolveCatByLine(lineUserId, catName);
  if (!r) return { ok: false as const, error: "not_found" };
  r.cat.groomHealthInfo = infoJson;
  await touchCustomer(r.customerId);
  const sb = getSupabase();
  if (sb) {
    try {
      const { error } = await sb
        .from("cats")
        .update({ groom_health_info: infoJson })
        .eq("id", r.cat.id)
        .eq("tenant_id", requireTenantId());
      if (error) return { ok: false as const, error: "need_sql", catName: r.cat.name };
    } catch {
      return { ok: false as const, error: "need_sql", catName: r.cat.name };
    }
  }
  return { ok: true as const, catName: r.cat.name };
}

export async function addCat(
  customerId: string,
  data: {
    name: string;
    gender?: CatGender;
    breed?: string;
    ageValue?: number;
    ageUnit?: "year" | "month";
    birthday?: string;
    medical?: string;
    furLength?: "short" | "long";
    color?: string;
    neutered?: boolean;
    vaccinated?: boolean;
    seizureHistory?: string;
    allergy?: string;
    weightKg?: number;
    species?: PetSpecies;
    staffNote?: string;
  }
) {
  const name = cleanPetName(data.name);
  if (!name) return null;

  const c = await getCustomer(customerId);
  if (!c) return null;

  const hasAge = data.ageValue != null && !isNaN(data.ageValue);
  const today = new Date().toISOString().slice(0, 10);

  // ต่อท้ายสุ่ม — เพิ่มหลายตัวติดกันในคำขอเดียว (สมัคร/ร้านเพิ่มลูกค้าเอง) อาจได้ Date.now() เดียวกัน
  const catId = `CAT${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const cat: CatRecord = {
    id: catId,
    name,
    gender: data.gender,
    breed: data.breed?.trim() || undefined,
    ageValue: hasAge ? data.ageValue : undefined,
    ageUnit: hasAge ? data.ageUnit || "year" : undefined,
    ageAsOf: hasAge ? today : undefined,
    birthday: data.birthday?.trim() || undefined,
    medical: data.medical?.trim() || undefined,
    furLength: data.furLength,
    color: data.color?.trim() || undefined,
    neutered: typeof data.neutered === "boolean" ? data.neutered : undefined,
    vaccinated: typeof data.vaccinated === "boolean" ? data.vaccinated : undefined,
    seizureHistory: data.seizureHistory?.trim() || undefined,
    allergy: data.allergy?.trim() || undefined,
    weightKg: normalizeWeightKg(data.weightKg),
    species: normalizeSpecies(data.species),
    staffNote: data.staffNote?.trim() || undefined,
  };

  c.cats.push(cat);
  await touchCustomer(customerId);

  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("cats").insert({
      id: catId,
      tenant_id: requireTenantId(),
      customer_id: customerId,
      name,
      gender: cat.gender || null,
      breed: cat.breed || null,
      age_value: cat.ageValue ?? null,
      age_unit: cat.ageUnit || null,
      age_as_of: cat.ageAsOf || null,
      birthday: cat.birthday || null,
      medical: cat.medical || null,
      staff_note: cat.staffNote || null,
    });
    if (error) throw new Error(error.message);
    if (cat.furLength || cat.color) {
      // คอลัมน์ใหม่ — best-effort เผื่อยังไม่ได้รัน migration
      await sb
        .from("cats")
        .update({ fur_length: cat.furLength || null, color: cat.color || null })
        .eq("id", catId)
        .eq("tenant_id", requireTenantId())
        .then(
          () => {},
          () => {}
        );
    }
    if (cat.species) await writeCatSpecies(catId, cat.species);
    if (cat.vaccinated != null) {
      await sb
        .from("cats")
        .update({ vaccinated: cat.vaccinated })
        .eq("id", catId)
        .eq("tenant_id", requireTenantId())
        .then(
          () => {},
          () => {}
        );
    }
    if (cat.neutered != null) {
      await sb
        .from("cats")
        .update({ neutered: cat.neutered })
        .eq("id", catId)
        .eq("tenant_id", requireTenantId())
        .then(
          () => {},
          () => {}
        );
    }
    if (cat.seizureHistory || cat.allergy) {
      await sb
        .from("cats")
        .update({ seizure_history: cat.seizureHistory ?? null, allergy: cat.allergy ?? null })
        .eq("id", catId)
        .eq("tenant_id", requireTenantId())
        .then(
          () => {},
          () => {}
        );
    }
    if (cat.weightKg != null) {
      await sb
        .from("cats")
        .update({ weight_kg: cat.weightKg })
        .eq("id", catId)
        .eq("tenant_id", requireTenantId())
        .then(
          () => {},
          () => {}
        );
    }
  } else {
    memCustomers.set(customerId, c);
  }
  return c;
}

export async function deleteCat(customerId: string, catId: string) {
  const c = await getCustomer(customerId);
  if (!c) return null;

  const idx = c.cats.findIndex((x) => x.id === catId);
  if (idx < 0) return null;

  c.cats.splice(idx, 1);
  await touchCustomer(customerId);

  const sb = getSupabase();
  if (sb) {
    const { error } = await sb
      .from("cats")
      .delete()
      .eq("id", catId)
      .eq("tenant_id", requireTenantId());
    if (error) throw new Error(error.message);
  } else {
    memCustomers.set(customerId, c);
  }
  return c;
}

/** ลบลูกค้า (ย้ายลงถังขยะ กู้คืนได้) */
export async function deleteCustomer(customerId: string) {
  const now = new Date().toISOString();
  const sb = getSupabase();
  if (sb) {
    try {
      const { error } = await sb
        .from("customers")
        .update({ deleted_at: now })
        .eq("id", customerId)
        .eq("tenant_id", requireTenantId());
      if (error) throw new Error(error.message);
      // ตัดการเชื่อม LINE ทันที — หน้าสมาชิกฝั่งลูกค้าไม่เห็นบัญชีนี้แล้ว จะใช้ต้องสมัครใหม่
      // (line_user_ids ยังเก็บไว้ กู้จากถังขยะแล้วผูกกลับได้)
      await sb
        .from("customers")
        .update({ line_user_id: null })
        .eq("id", customerId)
        .eq("tenant_id", requireTenantId());
    } catch {
      // ยังไม่ได้รัน migration deleted_at → ลบจริง (cascade)
      await sb
        .from("customers")
        .delete()
        .eq("id", customerId)
        .eq("tenant_id", requireTenantId());
    }
  } else {
    const c = memCustomers.get(customerId);
    if (c) c.deletedAt = now;
  }
  return { ok: true as const };
}

/**
 * รวมลูกค้าซ้ำ 2 record เป็นอันเดียว — ย้ายทุกอย่างจาก source → target แล้วลบ source
 *
 * ใช้ตอนคนเดียวโดนแยกเป็น 2 บัญชี (LINE ให้ User ID คนละตัวคอม/มือถือ)
 * ย้าย: แต้ม · คูปอง · คอร์ส · บิล · เติมเครดิต · ประวัติบริการ · รายรับ · แมว · LINE ID
 */
export async function mergeCustomers(sourceId: string, targetId: string) {
  if (!sourceId || !targetId || sourceId === targetId) {
    return { ok: false as const, error: "bad_ids" };
  }
  const [source, target] = await Promise.all([getCustomer(sourceId), getCustomer(targetId)]);
  if (!source || !target) return { ok: false as const, error: "not_found" };

  const sb = getSupabase();
  if (sb) {
    const tenantId = requireTenantId();
    // ย้าย customer_id ทุกตารางที่อ้างถึง (best-effort — ตารางไหนไม่มีก็ข้าม)
    const tables = [
      "cats",
      "coupons",
      "customer_packages",
      "invoices",
      "member_topups",
      "service_records",
      "finance_records",
      // ออร์เดอร์ซื้อคอร์ส (รอ/ปฏิเสธ/อนุมัติแล้ว) — เมื่อก่อนตกหล่น ทำให้ออร์เดอร์ค้าง
      // ผูกกับ record ที่ถูกลบไปหลังรวม แล้วหายไปจากลูกค้าปลายทาง
      "package_orders",
    ];
    for (const tbl of tables) {
      try {
        await sb
          .from(tbl)
          .update({ customer_id: targetId })
          .eq("customer_id", sourceId)
          .eq("tenant_id", tenantId);
      } catch {
        /* ตารางนี้ไม่มี customer_id หรือยังไม่มีตาราง — ข้าม */
      }
    }
    // รวมเครดิต Member + มัดจำล่วงหน้า เข้าปลายทาง
    const mergedCredit = (target.memberCredit || 0) + (source.memberCredit || 0);
    const mergedDeposit = (target.depositCredit || 0) + (source.depositCredit || 0);
    // รวม LINE ID ทุกตัวของทั้งคู่เข้าปลายทาง
    const ids = new Set(
      [
        ...(target.lineUserIds || []),
        target.lineUserId,
        ...(source.lineUserIds || []),
        source.lineUserId,
      ].filter(Boolean) as string[]
    );
    // ปลายทางยังไม่ผูก LINE แต่ต้นทางมี → ยก LINE หลักตามมาด้วย
    // ต้องถอดออกจากต้นทางก่อน เพราะตารางห้าม line_user_id ซ้ำ
    // (ต้นทางถูกลบแบบนุ่ม แถวยังอยู่ ถ้าไม่ถอดจะเขียนลงปลายทางไม่ติด)
    const takeLine = !target.lineUserId && source.lineUserId;
    if (takeLine) {
      await sb
        .from("customers")
        .update({ line_user_id: null })
        .eq("id", sourceId)
        .eq("tenant_id", tenantId);
    }
    // เติมข้อมูลโปรไฟล์ที่ปลายทางยังขาดจากต้นทาง — เมื่อก่อนย้ายแค่แต้ม/บิล/แมว
    // ทำให้เบอร์/อีเมล/วันเกิด/ที่อยู่ที่ลูกค้ากรอกตอนสมัคร หายไปกับ record ที่ถูกลบ
    const backfill: Record<string, unknown> = {};
    if (!target.phone && source.phone) backfill.phone = source.phone;
    if (!target.email && source.email) backfill.email = source.email;
    if (!target.birthday && source.birthday) backfill.birthday = source.birthday;
    if (!target.address && source.address) backfill.address = source.address;
    if (!target.addressMapUrl && source.addressMapUrl)
      backfill.address_map_url = source.addressMapUrl;
    if (!target.postalCode && source.postalCode) backfill.postal_code = source.postalCode;
    if (!target.referralSource && source.referralSource)
      backfill.referral_source = source.referralSource;
    if (!target.lineDisplayName && source.lineDisplayName && !takeLine)
      backfill.line_display_name = source.lineDisplayName;
    await sb
      .from("customers")
      .update({
        member_credit: mergedCredit,
        is_member: target.isMember || source.isMember,
        ...backfill,
        ...(takeLine
          ? {
              line_user_id: source.lineUserId,
              line_display_name: source.lineDisplayName || null,
            }
          : {}),
      })
      .eq("id", targetId)
      .eq("tenant_id", tenantId);
    try {
      await sb
        .from("customers")
        .update({ deposit_credit: mergedDeposit })
        .eq("id", targetId)
        .eq("tenant_id", tenantId);
    } catch {
      /* ยังไม่มีคอลัมน์ deposit_credit */
    }
    try {
      await sb
        .from("customers")
        .update({ line_user_ids: [...ids] })
        .eq("id", targetId)
        .eq("tenant_id", tenantId);
    } catch {
      /* ยังไม่มีคอลัมน์ line_user_ids */
    }
    if (!target.taxInvoice && source.taxInvoice) {
      // ข้อมูลออกบิล — คอลัมน์ใหม่ เขียนแยกเผื่อยังไม่ได้ migrate
      await sb
        .from("customers")
        .update({ tax_invoice: source.taxInvoice })
        .eq("id", targetId)
        .eq("tenant_id", tenantId)
        .then(
          () => {},
          () => {}
        );
    }
  } else {
    // mem — ย้ายเท่าที่เก็บใน map นี้ได้ (dev)
    const t = memCustomers.get(targetId);
    const s = memCustomers.get(sourceId);
    if (t && s) {
      t.memberCredit = (t.memberCredit || 0) + (s.memberCredit || 0);
      t.depositCredit = (t.depositCredit || 0) + (s.depositCredit || 0);
      t.cats = [...t.cats, ...s.cats];
      // เติมโปรไฟล์ที่ขาดจากต้นทาง (เหมือน sb path)
      t.phone = t.phone || s.phone;
      t.email = t.email || s.email;
      t.birthday = t.birthday || s.birthday;
      t.address = t.address || s.address;
      t.addressMapUrl = t.addressMapUrl || s.addressMapUrl;
      t.postalCode = t.postalCode || s.postalCode;
      t.taxInvoice = t.taxInvoice || s.taxInvoice;
      t.referralSource = t.referralSource || s.referralSource;
      t.lineDisplayName = t.lineDisplayName || s.lineDisplayName;
      if (!t.lineUserId && s.lineUserId) t.lineUserId = s.lineUserId;
      if (!t.lineUserId && s.lineUserId) {
        t.lineUserId = s.lineUserId;
        t.lineDisplayName = s.lineDisplayName;
      }
      const ids = new Set(
        [
          ...(t.lineUserIds || []),
          t.lineUserId,
          ...(s.lineUserIds || []),
          s.lineUserId,
        ].filter(Boolean) as string[]
      );
      t.lineUserIds = [...ids];
    }
  }

  // รวมแต้ม (คีย์ C:<id>) + คูปองในกระเป๋าเข้าปลายทาง
  try {
    const { mergePointsAccount } = await import("./points-store");
    await mergePointsAccount(sourceId, targetId);
  } catch {
    /* รวมแต้มไม่สำเร็จ — ส่วนอื่นย้ายแล้ว */
  }

  // ลบ record ต้นทางทิ้ง (soft delete)
  await deleteCustomer(sourceId);
  return { ok: true as const, targetId };
}

/** กู้ลูกค้าจากถังขยะ */
export async function restoreCustomer(customerId: string) {
  const sb = getSupabase();
  if (sb) {
    await sb
      .from("customers")
      .update({ deleted_at: null })
      .eq("id", customerId)
      .eq("tenant_id", requireTenantId());
    // ผูก LINE กลับ — เฉพาะ ID ที่ยังไม่มีบัญชีอื่นใช้ (ระหว่างนั้นลูกค้าอาจสมัครใหม่ไปแล้ว → ใช้รวมลูกค้าแทน)
    const c = await getCustomer(customerId);
    if (c && !c.lineUserId) {
      for (const uid of [...(c.lineUserIds || [])].reverse()) {
        const holder = await findCustomerByLine(uid);
        if (holder && holder.id !== customerId) continue;
        await releaseLineFromDeleted(uid);
        await sb
          .from("customers")
          .update({ line_user_id: uid })
          .eq("id", customerId)
          .eq("tenant_id", requireTenantId());
        break;
      }
    }
  } else {
    const c = memCustomers.get(customerId);
    if (c) c.deletedAt = undefined;
  }
  return { ok: true as const };
}

/**
 * บันทึกโน้ตลับของร้านต่อแมว (ซ่อนจากลูกค้า).
 * ต้องรัน OVERNIGHT_SQL.md (staff_private_note) ก่อนถึงจะบันทึกลง DB ได้ —
 * ถ้ายังไม่มีคอลัมน์ จะ return need_sql โดยไม่ทำให้หน้าแอดมินพัง.
 */
export async function updateCatPrivateNote(
  customerId: string,
  catId: string,
  note: string
) {
  const c = await getCustomer(customerId);
  if (!c) return { ok: false as const, error: "not_found" };
  const cat = c.cats.find((x) => x.id === catId);
  if (!cat) return { ok: false as const, error: "not_found" };
  const trimmed = note.trim();
  cat.staffPrivateNote = trimmed || undefined;
  const sb = getSupabase();
  if (sb) {
    try {
      const { error } = await sb
        .from("cats")
        .update({ staff_private_note: trimmed || null })
        .eq("id", catId)
        .eq("tenant_id", requireTenantId());
      if (error) {
        return { ok: false as const, error: "need_sql", message: error.message };
      }
    } catch (e) {
      return { ok: false as const, error: "need_sql", message: String(e) };
    }
  } else {
    memCustomers.set(customerId, c);
  }
  return { ok: true as const };
}

/**
 * บันทึกอัลบั้มรูป/วิดีโออ้างอิงของแมว (แทนที่ทั้งชุด — ฝั่งแอดมินส่ง array ที่แก้แล้วมา).
 * ต้องรัน migration "cats.media" ก่อนถึงจะบันทึกลง DB ได้ —
 * ถ้ายังไม่มีคอลัมน์ จะ return need_sql โดยไม่ทำให้หน้าแอดมินพัง.
 */
export async function updateCatMedia(
  customerId: string,
  catId: string,
  media: CatMediaItem[]
) {
  const c = await getCustomer(customerId);
  if (!c) return { ok: false as const, error: "not_found" };
  const cat = c.cats.find((x) => x.id === catId);
  if (!cat) return { ok: false as const, error: "not_found" };

  // เก็บรูป/วิดีโอในอัลบั้มเป็นไฟล์ใน Storage แทน base64 — วิดีโอเคยยัดลง jsonb ตรงๆ ได้ถึง 15MB/คลิป
  media = await Promise.all(
    media.map(async (m) =>
      m.dataUrl.startsWith("data:")
        ? { ...m, dataUrl: await uploadPrivateDataUrl(`cats/${catId}/media-${m.id}`, m.dataUrl) }
        : m
    )
  );

  cat.media = media;
  const sb = getSupabase();
  if (sb) {
    try {
      const { error } = await sb
        .from("cats")
        .update({ media })
        .eq("id", catId)
        .eq("tenant_id", requireTenantId());
      if (error) {
        return { ok: false as const, error: "need_sql", message: error.message };
      }
    } catch (e) {
      return { ok: false as const, error: "need_sql", message: String(e) };
    }
  } else {
    memCustomers.set(customerId, c);
  }
  return { ok: true as const };
}

export async function addMemberCredit(customerId: string, amount: number) {
  return topupMemberCredit(customerId, { paidAmount: amount, bonusAmount: 0 });
}

/**
 * คืนเครดิต Member แบบ "ปรับยอดคงเหลือเฉยๆ" ไม่ใช่การเติมเงินใหม่
 *
 * ใช้ตอนย้อนบิลที่จ่ายด้วยเครดิต (ยกเลิกการชำระ / แพ้ race ตอนปิดบิล) — ต้องการแค่ให้
 * ยอดคงเหลือกลับมาเท่าก่อนหักเฉยๆ ไม่สร้างประวัติเติมเงิน (member_topups) และไม่ลงรายรับซ้ำ
 * เพราะไม่ใช่เงินที่เพิ่งรับเข้าร้านจริง — addMemberCredit (ผ่าน topupMemberCredit) จะสร้าง
 * รายการเติมเงิน + รายรับปลอมทุกครั้ง ซึ่งพอถูกเรียกจากเส้นทาง revert ทำให้บัญชีรายรับบวมปลอม
 * และ deleteInvoicePaymentIncome หาไม่เจอ (รายรับปลอมนี้ไม่มี invoiceId ผูกไว้) ลบไม่ได้เลย
 */
export async function restoreMemberCredit(customerId: string, amount: number) {
  const amt = Math.round(amount);
  if (amt <= 0) return null;
  const c = await getCustomer(customerId);
  if (!c) return null;
  c.memberCredit += amt;
  const updated = await updateCustomer(customerId, { memberCredit: c.memberCredit });
  if (updated) await recalculateCustomerTier(customerId);
  return updated;
}

/**
 * ยกเลิกรายการเติมเครดิต — คืนยอดที่เติมออกจากเครดิตลูกค้า + ลบรายรับที่ลงไว้
 *
 * บล็อกไว้ถ้าลูกค้าใช้เครดิตไปบางส่วนแล้ว (ยอดคงเหลือน้อยกว่าที่จะถอน)
 * เพราะถ้าฝืนถอน เครดิตจะติดลบและตัวเลขจะเพี้ยนทั้งสาย —
 * เคสนั้นให้ยกเลิกบิลที่ใช้เครดิตก่อน (ซึ่งคืนเครดิตให้อยู่แล้ว) ค่อยมายกเลิกรายการเติม
 */
export async function cancelMemberTopup(topupId: string) {
  const sb = getSupabase();
  let topup: MemberTopupRecord | undefined;
  if (sb) {
    const { data } = await sb
      .from("member_topups")
      .select("*")
      .eq("id", topupId)
      .eq("tenant_id", requireTenantId())
      .maybeSingle();
    if (data) topup = rowToTopup(data as MemberTopupRow);
  } else {
    topup = memMemberTopups.find((t) => t.id === topupId);
  }
  if (!topup) return { ok: false as const, error: "not_found" };

  const c = await getCustomer(topup.customerId);
  if (!c) return { ok: false as const, error: "not_found" };
  if (c.memberCredit < topup.creditAdded) {
    return {
      ok: false as const,
      error: "credit_spent",
      balance: c.memberCredit,
      creditAdded: topup.creditAdded,
    };
  }

  const nextCredit = c.memberCredit - topup.creditAdded;
  await updateCustomer(topup.customerId, { memberCredit: nextCredit });

  // ลบรายรับที่ลงคู่กับการเติมครั้งนี้ — ยอดยกมา / 🔁 เครดิตจากบิลยกเลิกนัด ไม่เคยลงรายรับ จึงไม่ต้องหา
  // (ถ้าไปหา จะไปลบรายรับของการเติมจริงที่ยอดเท่ากันวันเดียวกันผิดตัว)
  if (!topup.isLegacy && !topup.isCancelCredit && topup.paidAmount > 0) {
    const { listFinance, deleteFinanceEntry } = await import("./finance-store");
    const all = await listFinance();
    const match = all.find(
      (r) =>
        r.type === "income" &&
        r.category === "member" &&
        r.customerId === topup!.customerId &&
        r.amount === topup!.paidAmount &&
        r.date === topup!.createdAt.slice(0, 10)
    );
    if (match) await deleteFinanceEntry(match.id);
  }

  if (sb) {
    await sb
      .from("member_topups")
      .delete()
      .eq("id", topupId)
      .eq("tenant_id", requireTenantId());
  } else {
    const i = memMemberTopups.findIndex((t) => t.id === topupId);
    if (i >= 0) memMemberTopups.splice(i, 1);
  }

  await recalculateCustomerTier(topup.customerId);
  return { ok: true as const, balance: nextCredit, creditRemoved: topup.creditAdded };
}

export async function topupMemberCredit(
  customerId: string,
  data: {
    paidAmount: number;
    bonusAmount?: number;
    note?: string;
    isLegacy?: boolean;
    /** 🔁 ยอดจากบิลที่ยกเลิกนัด — ไม่ลงรายรับ ไม่ให้แต้ม (ได้ไปแล้วตอนจ่ายบิลเดิม) */
    isCancelCredit?: boolean;
    sourceInvoiceId?: string;
  }
) {
  const isCancelCredit = Boolean(data.isCancelCredit);
  const paid = Math.max(0, Number(data.paidAmount) || 0);
  // เครดิตจากบิลยกเลิกนัด = ยอดบิลเดิมเป๊ะ ไม่มีแถม
  const bonus = isCancelCredit ? 0 : Math.max(0, Number(data.bonusAmount) || 0);
  const creditAdded = paid + bonus;
  if (creditAdded <= 0) return null;

  const c = await getCustomer(customerId);
  if (!c) return null;

  c.memberCredit += creditAdded;
  c.isMember = true;
  if (!c.memberSince) c.memberSince = new Date().toISOString().slice(0, 10);

  const updated = await updateCustomer(customerId, {
    isMember: c.isMember,
    memberCredit: c.memberCredit,
    memberSince: c.memberSince,
  });
  if (!updated) return null;

  const isLegacy = !isCancelCredit && Boolean(data.isLegacy);
  const sourceInvoiceId = isCancelCredit ? data.sourceInvoiceId?.trim() || undefined : undefined;
  const topup: MemberTopupRecord = {
    id: `MT${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    customerId,
    paidAmount: paid,
    bonusAmount: bonus,
    creditAdded,
    balanceAfter: c.memberCredit,
    note: data.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
    isLegacy,
    isCancelCredit,
    sourceInvoiceId,
  };

  const sb = getSupabase();
  if (sb) {
    const row = {
      id: topup.id,
      tenant_id: requireTenantId(),
      customer_id: topup.customerId,
      paid_amount: topup.paidAmount,
      bonus_amount: topup.bonusAmount,
      credit_added: topup.creditAdded,
      balance_after: topup.balanceAfter,
      note: topup.note || null,
      created_at: topup.createdAt,
    };
    // is_legacy / is_cancel_credit เพิ่งเพิ่มมาทีหลัง — ลองใส่ก่อน ถ้าเครื่องยังไม่อัปเดตฐานข้อมูล
    // (คอลัมน์ไม่มี) ให้ตกไปเขียนแบบเดิม กันบันทึกไม่สำเร็จทั้งก้อน
    let { error } = await sb.from("member_topups").insert(
      isCancelCredit
        ? { ...row, is_legacy: false, is_cancel_credit: true, source_invoice_id: sourceInvoiceId || null }
        : { ...row, is_legacy: isLegacy }
    );
    if (error && isCancelCredit) {
      // ยังไม่มีคอลัมน์ 🔁 → เพิ่มคอลัมน์ให้เองแล้วลองใหม่
      const { ensureMigration } = await import("./migrations");
      if (await ensureMigration("member_topups.cancel_credit")) {
        ({ error } = await sb.from("member_topups").insert({
          ...row,
          is_legacy: false,
          is_cancel_credit: true,
          source_invoice_id: sourceInvoiceId || null,
        }));
      }
      // ยังไม่ได้อีก → เก็บเป็น "ไม่นับรายรับ" (is_legacy) ไว้ก่อน + จดเลขบิลไว้ในโน้ต
      // อย่างน้อยตอนกดยกเลิกรายการนี้จะไม่ไปลบรายรับของการเติมอื่นผิดตัว
      if (error) {
        const label = `🔁 ยกเลิกนัด${sourceInvoiceId ? ` · บิล ${sourceInvoiceId}` : ""}`;
        ({ error } = await sb.from("member_topups").insert({
          ...row,
          note: row.note ? `${label} · ${row.note}` : label,
          is_legacy: true,
        }));
      }
    }
    if (error) {
      await sb.from("member_topups").insert(row);
    }
  } else {
    memMemberTopups.unshift(topup);
  }

  // ยอดยกมาจากระบบเก่า: เครดิตลูกค้าต้องได้เพิ่มจริง แต่ไม่ใช่เงินที่รับเข้าร้านเดือนนี้
  // ไม่บันทึกรายรับ กันยอดขายบวมจากเงินที่ไม่ได้รับจริงในเดือนนี้
  // 🔁 เครดิตจากบิลยกเลิกนัดก็ไม่ลง — เงินก้อนนี้ลงรายรับไปแล้วตอนจ่ายบิลเดิม
  if (paid > 0 && !isLegacy && !isCancelCredit) {
    const { addFinanceEntry } = await import("./finance-store");
    const bonusLabel =
      bonus > 0 ? ` (แถม ${bonus.toLocaleString()} บาท)` : "";
    await addFinanceEntry({
      type: "income",
      amount: paid,
      category: "member",
      description: `เติม Member ${c.name} +${creditAdded.toLocaleString()} บาท${bonusLabel}`,
      date: topup.createdAt.slice(0, 10),
      customerId,
    });
  }

  // ให้แต้มตอนเติมเครดิต — คิดจากยอดที่จ่ายจริงเท่านั้น ไม่รวมเครดิตแถม
  // (ยอดยกมาจากระบบเก่าไม่ให้ เพราะไม่ใช่การจ่ายเงินรอบนี้)
  // คู่กับ noPointsOnMemberCredit ที่ปิดแต้มตอนตัดใช้ → ได้แต้มรอบเดียว ไม่เบิ้ล
  // 🔁 เครดิตจากบิลยกเลิกนัดไม่ให้ — แต้มของเงินก้อนนี้ได้ไปแล้วตอนจ่ายบิลเดิม
  let pointsEarned = 0;
  if (paid > 0 && !isLegacy && !isCancelCredit && updated.lineUserId) {
    const { getSiteConfig } = await import("./config-store");
    const biz = (await getSiteConfig()).business;
    if (biz.pointsOnMemberTopup === true) {
      pointsEarned = Math.floor(paid / biz.pointsRate);
      if (pointsEarned > 0) {
        const { addPoints } = await import("./points-store");
        await addPoints(
          updated.lineUserId,
          pointsEarned,
          `เติมเครดิต Member ${paid.toLocaleString()} บาท`,
          `Member top-up ${paid} THB`,
          updated.name
        );
      }
    }
  }

  await recalculateCustomerTier(customerId);
  return { customer: updated, topup, pointsEarned };
}

export async function deductMemberCredit(customerId: string, amount: number) {
  const c = await getCustomer(customerId);
  if (!c || c.memberCredit < amount) return null;
  c.memberCredit -= amount;
  return updateCustomer(customerId, { memberCredit: c.memberCredit });
}

export async function addServiceRecord(
  data: Omit<ServiceRecord, "id" | "at"> & { at?: string }
) {
  const rec: ServiceRecord = {
    ...data,
    id: `S${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    at: data.at || new Date().toISOString(),
  };

  const sb = getSupabase();
  if (sb) {
    await sb.from("service_records").insert({
      id: rec.id,
      tenant_id: requireTenantId(),
      customer_id: rec.customerId,
      cat_name: rec.catName,
      service: rec.service,
      date: rec.date,
      time: rec.time || null,
      amount: rec.amount ?? null,
      invoice_id: rec.invoiceId || null,
      booking_id: rec.bookingId || null,
      created_at: rec.at,
    });
    await touchCustomer(rec.customerId);
    await recalculateCustomerTier(rec.customerId);
    return rec;
  }

  memServices.unshift(rec);
  await recalculateCustomerTier(rec.customerId);
  return rec;
}

/** ลบประวัติบริการที่ผูกกับบิล (ใช้ตอนยกเลิกการชำระ เพื่อไม่ให้จำนวนครั้งเกินจริง) */
export async function deleteServiceRecordByInvoice(invoiceId: string) {
  const sb = getSupabase();
  if (sb) {
    await sb
      .from("service_records")
      .delete()
      .eq("invoice_id", invoiceId)
      .eq("tenant_id", requireTenantId());
  } else {
    for (let i = memServices.length - 1; i >= 0; i--) {
      if (memServices[i].invoiceId === invoiceId) memServices.splice(i, 1);
    }
  }
}

/**
 * ลบประวัติใช้บริการทีละรายการจากหลังบ้าน — เผื่อร้านลงข้อมูลผิด
 * ลบแล้วหายจากประวัติที่ลูกค้าเห็นในแอปด้วย (คนละเรื่องกับ deleteServiceRecordByInvoice
 * ที่ลบอัตโนมัติตอนยกเลิกการชำระ)
 */
export async function deleteServiceRecord(id: string) {
  const sb = getSupabase();
  if (sb) {
    await sb
      .from("service_records")
      .delete()
      .eq("id", id)
      .eq("tenant_id", requireTenantId());
  } else {
    const i = memServices.findIndex((r) => r.id === id);
    if (i >= 0) memServices.splice(i, 1);
  }
  return { ok: true as const };
}

/** ทุกรายการ ทุกลูกค้า — ใช้สำหรับสำรองข้อมูลทั้งร้าน */
/** เปลี่ยนชื่อน้องในประวัติบริการของลูกค้า (ดู cat-rename.ts) — คืนจำนวนที่แก้ */
export async function renameCatInServiceRecords(
  customerId: string,
  oldName: string,
  newName: string
) {
  const { replaceCatInList } = await import("./cat-name-replace");
  const sb = getSupabase();
  const tenantId = sb ? requireTenantId() : "";
  const rows: { id: string; catName: string }[] = sb
    ? (
        ((
          await sb
            .from("service_records")
            .select("id, cat_name")
            .eq("customer_id", customerId)
            .eq("tenant_id", tenantId)
        ).data as { id: string; cat_name: string }[] | null) || []
      ).map((r) => ({ id: r.id, catName: r.cat_name }))
    : memServices.filter((r) => r.customerId === customerId);
  let n = 0;
  for (const r of rows) {
    const catName = replaceCatInList(r.catName || "", oldName, newName);
    if (catName === r.catName) continue;
    if (sb)
      await sb
        .from("service_records")
        .update({ cat_name: catName })
        .eq("id", r.id)
        .eq("tenant_id", tenantId);
    else {
      const rec = memServices.find((x) => x.id === r.id);
      if (rec) rec.catName = catName;
    }
    n++;
  }
  return n;
}

export async function listAllServiceRecords(): Promise<ServiceRecord[]> {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from("service_records")
      .select("*")
      .eq("tenant_id", requireTenantId())
      .order("created_at", { ascending: false });
    return ((data as ServiceRow[] | null) || []).map((r) => ({
      id: r.id,
      customerId: r.customer_id,
      catName: r.cat_name,
      service: r.service,
      date: r.date,
      time: r.time || undefined,
      amount: r.amount != null ? Number(r.amount) : undefined,
      invoiceId: r.invoice_id || undefined,
      bookingId: r.booking_id || undefined,
      at: r.created_at,
    }));
  }
  return [...memServices];
}

async function listServiceRecords(customerId: string) {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from("service_records")
      .select("*")
      .eq("customer_id", customerId)
      .eq("tenant_id", requireTenantId())
      .order("created_at", { ascending: false });
    return ((data as ServiceRow[] | null) || []).map((r) => ({
      id: r.id,
      customerId: r.customer_id,
      catName: r.cat_name,
      service: r.service,
      date: r.date,
      time: r.time || undefined,
      amount: r.amount != null ? Number(r.amount) : undefined,
      invoiceId: r.invoice_id || undefined,
      bookingId: r.booking_id || undefined,
      at: r.created_at,
    }));
  }
  return memServices.filter((s) => s.customerId === customerId);
}

/** ทุกรายการเติมเครดิต ทุกลูกค้า — ใช้สำหรับสำรองข้อมูลทั้งร้าน */
export async function listAllMemberTopups(): Promise<MemberTopupRecord[]> {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from("member_topups")
      .select("*")
      .eq("tenant_id", requireTenantId())
      .order("created_at", { ascending: false });
    return ((data as MemberTopupRow[] | null) || []).map(rowToTopup);
  }
  return [...memMemberTopups];
}

/**
 * รายการ 🔁 ที่แปลงมาจากบิลนี้ (ถ้ามี) — กันกดแปลงบิลเดียวกันซ้ำ และกันยกเลิกการชำระ/ลบบิล
 * ที่ยอดถูกโอนเป็นเครดิตไปแล้ว (ไม่งั้นลูกค้าได้เครดิตฟรีทั้งที่รายรับถูกถอนออก)
 */
export async function findCancelCreditTopup(
  invoiceId: string
): Promise<MemberTopupRecord | undefined> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("member_topups")
      .select("*")
      .eq("source_invoice_id", invoiceId)
      .eq("tenant_id", requireTenantId())
      .limit(1);
    const hit = !error ? (data as MemberTopupRow[] | null)?.[0] : undefined;
    if (hit) return rowToTopup(hit);
    // ยังไม่มีคอลัมน์ source_invoice_id → หาเลขบิลจากโน้ตแทน (ทางสำรองตอนบันทึก)
    // + เมนูเดิม "โยกเป็นเครดิต (ลูกค้าไม่มา)" จดไว้ในโน้ตว่า "โยกเป็นเครดิตจากบิล X (ไม่มาใช้บริการ)"
    const { data: byNote } = await sb
      .from("member_topups")
      .select("*")
      .eq("tenant_id", requireTenantId())
      .like("note", error ? `%บิล ${invoiceId}%` : `%จากบิล ${invoiceId} (%`)
      .limit(1);
    const r = (byNote as MemberTopupRow[] | null)?.[0];
    return r ? rowToTopup(r) : undefined;
  }
  return memMemberTopups.find((t) => t.sourceInvoiceId === invoiceId);
}

async function listMemberTopups(customerId: string): Promise<MemberTopupRecord[]> {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from("member_topups")
      .select("*")
      .eq("customer_id", customerId)
      .eq("tenant_id", requireTenantId())
      .order("created_at", { ascending: false });
    return ((data as MemberTopupRow[] | null) || []).map(rowToTopup);
  }
  return memMemberTopups.filter((t) => t.customerId === customerId);
}

async function listMemberCreditUsage(customerId: string): Promise<MemberCreditUsageRecord[]> {
  const { listInvoices } = await import("./invoices-store");
  const { summarizeInvoiceItems } = await import("./invoice-item-label");
  const invoices = await listInvoices(customerId);
  return invoices
    .filter((i) => i.status === "paid" && i.paymentMethod === "member_credit" && i.paidAt)
    .map((i) => {
      // ย่อรายการให้เหลือแค่ชื่อสั้นๆ ไม่ซ้ำ — บิลที่มีหลายตัว/หลายรายการจะได้ไม่ยาวจนอ่านไม่ไหว
      const summary = summarizeInvoiceItems(i.items);
      return {
        id: i.id,
        customerId: i.customerId,
        amount: i.total,
        description: `${i.catName} · ${summary}`,
        date: i.paidAt!.slice(0, 10),
        at: i.paidAt!,
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** ครั้งที่ลูกค้าใช้คอร์สไป — อ่านจากบิลที่จ่ายแล้วและผูกคอร์สไว้ */
export type PackageUsageRecord = {
  invoiceId: string;
  packageId: string;
  description: string;
  date: string;
  at: string;
};

async function listPackageUsage(customerId: string): Promise<PackageUsageRecord[]> {
  const { listInvoices } = await import("./invoices-store");
  const { summarizeInvoiceItems } = await import("./invoice-item-label");
  const invoices = await listInvoices(customerId);
  return invoices
    .filter((i) => i.packageId && i.status === "paid" && i.paidAt)
    .map((i) => ({
      invoiceId: i.id,
      packageId: i.packageId!,
      description: `${i.catName} · ${summarizeInvoiceItems(i.items)}`,
      date: i.paidAt!.slice(0, 10),
      at: i.paidAt!,
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** บิลแบบย่อ (เฉพาะบรรทัดอาบน้ำ/ห้องพัก) — ให้ประวัติรายตัวใช้โปรแกรม/ห้องตามที่ออกบิลจริง */
export type ServiceBill = {
  id: string;
  bookingId?: string;
  catName: string;
  date: string;
  items: { kind?: string; program?: string; label: string; catName?: string; qty?: number }[];
};

async function listServiceBills(customerId: string): Promise<ServiceBill[]> {
  const { listInvoices } = await import("./invoices-store");
  const { isRoomLine } = await import("./stay-line");
  const invoices = await listInvoices(customerId);
  return invoices
    .map((i) => ({
      id: i.id,
      bookingId: i.bookingId,
      catName: i.catName,
      date: (i.paidAt || i.createdAt || "").slice(0, 10),
      items: (i.items || [])
        .filter((it) => it.kind === "grooming" || isRoomLine(it))
        .map((it) => ({ kind: it.kind, program: it.program, label: it.label, catName: it.catName, qty: it.qty })),
    }))
    .filter((b) => b.items.length > 0);
}

export async function getCustomerHistory(customerId: string) {
  const c = await getCustomer(customerId);
  const allBookings = await listBookings();
  const bookings = c
    ? allBookings.filter((b) => bookingMatchesCustomer(b, c))
    : [];
  const upcomingBookings = bookings.filter((b) => isUpcomingBooking(b));
  const pastBookings = bookings.filter((b) => !isUpcomingBooking(b));
  const services = await listServiceRecords(customerId);
  const points = c?.lineUserId ? await getPointsHistory(c.lineUserId) : [];
  const memberTopups = await listMemberTopups(customerId);
  const memberCreditUsage = await listMemberCreditUsage(customerId);
  const packageUsage = await listPackageUsage(customerId);
  const serviceBills = await listServiceBills(customerId);
  return {
    bookings,
    upcomingBookings,
    pastBookings,
    services,
    points,
    memberTopups,
    memberCreditUsage,
    packageUsage,
    serviceBills,
  };
}

/**
 * จำนวน "ครั้งที่มาใช้บริการจริง" — นับเป็นวันที่มา ไม่ใช่จำนวนนัดหรือจำนวนแมว
 *
 * เดิมนับ services + นัดที่ยืนยันแล้ว ซึ่งผิดสองทาง:
 *  1) กดยืนยันนัดไม่ได้แปลว่าลูกค้ามาแล้ว — ลูกค้าที่แค่ลงนัดขึ้นเป็น "มาใช้บริการ" ทันที
 *  2) นับต่อนัด ซึ่งระบบเก็บ 1 นัดต่อแมว 1 ตัว — บ้านที่พามา 2 ตัววันเดียวกลายเป็น 2 ครั้ง
 *  3) พอปิดบิลแล้วจะมีทั้ง service record และนัดที่ยืนยันแล้ว = นับซ้ำอีกรอบ
 *
 * นับจาก "วันที่ต่างกัน" ที่มีหลักฐานว่าได้ให้บริการจริง คือมีบิลที่ปิดแล้ว
 * (service record) หรือปิดงานในระบบแล้ว (นัดสถานะ ready/done)
 */
function countVisitDays(history: {
  services: { date: string }[];
  bookings: { status: string; date?: string; checkin?: string }[];
}): number {
  const days = new Set<string>();
  for (const s of history.services) {
    if (s.date) days.add(s.date.slice(0, 10));
  }
  for (const b of history.bookings) {
    if (b.status !== "ready" && b.status !== "done") continue;
    const d = b.date || b.checkin || "";
    if (d) days.add(d.slice(0, 10));
  }
  return days.size;
}

export async function customerSummary(customerId: string) {
  const c = await getCustomer(customerId);
  if (!c) return null;
  const history = await getCustomerHistory(customerId);
  const points = c.lineUserId ? (await getAccount(c.lineUserId, c.name)).points : 0;
  const visits = countVisitDays(history);
  return { customer: c, history, points, visits };
}

export async function countCustomerVisits(customerId: string) {
  return countVisitDays(await getCustomerHistory(customerId));
}

/**
 * จำนวนครั้งที่มา ไม่นับนัดที่กำลังออกบิลอยู่ — ใช้ตัดสิน "ลูกค้าใหม่" ตอนออกบิล
 * (น้องรอกลับบ้านแล้ว นัดเป็น ready → ถ้านับด้วย ลูกค้าที่มาครั้งแรกจะกลายเป็นลูกค้าเก่าทันที)
 */
export async function countCustomerVisitsExcluding(
  customerId: string,
  excludeBookingIds: string[] = []
) {
  const history = await getCustomerHistory(customerId);
  if (!excludeBookingIds.length) return countVisitDays(history);
  const skip = new Set(excludeBookingIds);
  return countVisitDays({
    services: history.services,
    bookings: history.bookings.filter((b) => !skip.has(b.id)),
  });
}

/** ยอดสะสมรวม (บิลที่ชำระแล้ว) — ใช้เป็นเงื่อนไขเลื่อนระดับ VIP */
export async function customerTotalSpend(customerId: string) {
  const { listInvoices } = await import("./invoices-store");
  const invs = await listInvoices(customerId);
  return invs
    .filter((i) => i.status === "paid" && !i.deletedAt)
    .reduce((s, i) => s + (i.total || 0), 0);
}

/** อัปเกรดระดับลูกค้าตามเงื่อนไขที่ตั้งไว้ (จำนวนครั้ง / ยอดสะสม) */
export async function recalculateCustomerTier(customerId: string) {
  const c = await getCustomer(customerId);
  if (!c) return null;
  const visits = await countCustomerVisits(customerId);
  const spend = await customerTotalSpend(customerId);
  let rules = DEFAULT_TIER_RULES;
  try {
    const cfg = await getSiteConfig();
    rules = cfg.crm?.tierRules || DEFAULT_TIER_RULES;
  } catch {
    /* ใช้ค่า default ถ้าโหลด config ไม่ได้ */
  }
  const tier = computeTier(visits, spend, c.isMember, rules);
  if (tier === c.tier) return c;
  return updateCustomer(customerId, { tier });
}

/** คำนวณระดับลูกค้าใหม่ทั้งหมด (ใช้ตอนเปลี่ยนเงื่อนไข tier) */
export async function recalcAllTiers() {
  const all = await listCustomers();
  let updated = 0;
  for (const c of all) {
    const before = c.tier;
    const res = await recalculateCustomerTier(c.id);
    if (res && res.tier !== before) updated++;
  }
  return { total: all.length, updated };
}

export async function listCustomersByTier(
  tier: CustomerTier | "all",
  opts?: { breed?: string }
) {
  const { recipients } = await getBroadcastAudience(tier, opts);
  return recipients;
}

/** รายชื่อผู้รับ broadcast + คนที่ข้าม (ยังไม่ผูก LINE) */
export async function getBroadcastAudience(
  tier: CustomerTier | "all",
  opts?: { breed?: string }
) {
  const all = await fetchAllCustomers();
  let inTier = tier === "all" ? all : all.filter((c) => c.tier === tier);
  if (opts?.breed) {
    inTier = inTier.filter((c) =>
      c.cats.some((cat) => (cat.breed || "").trim() === opts.breed)
    );
  }
  const withLine = inTier.filter((c) => Boolean(c.lineUserId));
  // ส่งโปร/ข่าวสารเฉพาะคนที่ยินยอม — ยืนยันนัด/จ่ายเงินใช้คนละช่องทาง ไม่ผ่านฟังก์ชันนี้
  const recipients = withLine.filter((c) => c.marketingConsent !== false);
  const skippedNoConsent = withLine.filter((c) => c.marketingConsent === false);
  const skippedNoLine = inTier.filter((c) => !c.lineUserId);
  return { recipients, skippedNoLine, skippedNoConsent };
}

/** ลูกค้ากรอกฟอร์มลงทะเบียนจาก LIFF */
export async function registerCustomerFromLine(data: {
  lineUserId: string;
  name: string;
  phone: string;
  email?: string;
  birthday?: string;
  referralSource?: string;
  address?: string;
  addressMapUrl?: string;
  postalCode?: string;
  taxInvoice?: CustomerTaxInvoice;
  marketingConsent?: boolean;
  cats: {
    name: string;
    gender?: CatGender;
    breed?: string;
    ageValue?: number;
    ageUnit?: "year" | "month";
    birthday?: string;
    medical?: string;
    furLength?: "short" | "long";
    color?: string;
    neutered?: boolean;
    vaccinated?: boolean;
    seizureHistory?: string;
    allergy?: string;
    weightKg?: number;
    species?: PetSpecies;
    staffNote?: string;
  }[];
}) {
  const lineUserId = data.lineUserId.trim();
  const name = data.name.trim();
  const phone = data.phone.trim();
  const cats = data.cats
    .map((c) => ({
      name: c.name.trim(),
      gender: c.gender,
      breed: c.breed?.trim(),
      ageValue: c.ageValue,
      ageUnit: c.ageUnit,
      birthday: c.birthday?.trim(),
      medical: c.medical?.trim(),
      furLength: c.furLength,
      color: c.color?.trim(),
      neutered: c.neutered,
      vaccinated: c.vaccinated,
      seizureHistory: c.seizureHistory?.trim(),
      allergy: c.allergy?.trim(),
      weightKg: c.weightKg,
      species: c.species,
      staffNote: c.staffNote?.trim(),
    }))
    .filter((c) => c.name);

  if (!lineUserId || !name || !phone || cats.length === 0) return null;

  // ผ่าน upsert เสมอ — หาบัญชีเดิม/สร้างใหม่/กู้คืนถ้าเคยลบ (กัน insert ซ้ำจน unique ชน)
  const customer =
    (await upsertCustomerFromLine({ lineUserId, displayName: name })) ?? undefined;
  if (!customer) return null;

  // ── กันบัญชีซ้ำด้วย "เบอร์โทร" ──
  // ชื่อ LINE ตั้งเป็นอะไรก็ได้ จับคู่ด้วยชื่ออย่างเดียวจึงพลาดบ่อย (เกิด record ที่ 2)
  // แต่เบอร์โทรคือคนคนเดิมแน่ๆ — เจอเบอร์ซ้ำเมื่อไหร่ให้รวมเข้าด้วยกันทันที
  // (เคสจริง: ลูกค้าเคยมีนัด/เคยสมัครไว้ แล้วมาสมัครใหม่จากอีกเครื่อง LINE ให้ ID คนละตัว)
  const phoneKey = normPhone(phone);
  if (phoneKey) {
    const samePhone = (await listCustomerPhones()).filter(
      (c) => c.id !== customer.id && normPhone(c.phone) === phoneKey
    );
    for (const dupe of samePhone) {
      // รวมเฉพาะเมื่อ "ชื่อตรงกันด้วย" เท่านั้น — เบอร์อย่างเดียวไม่พอ เพราะ:
      // 1) คนในครอบครัวใช้เบอร์เดียวกันได้ (คนละคน ห้ามรวม)
      // 2) endpoint สมัครเปิดสาธารณะ — ถ้ารวมด้วยเบอร์อย่างเดียว คนไม่หวังดีที่รู้เบอร์
      //    ลูกค้าจะสมัครสวมเบอร์เพื่อดูดแต้ม/คูปอง/เครดิตไปเป็นของตัวเองได้
      if (normName(dupe.name) === normName(name)) {
        await mergeCustomers(dupe.id, customer.id);
      } else {
        // เบอร์ซ้ำแต่ชื่อไม่ตรง — ไม่รวมเอง แจ้งร้านให้ตรวจและกดรวมเองถ้าเป็นคนเดียวกัน
        try {
          const { sendTelegramLater, formatBookingTelegram } = await import("./telegram");
          sendTelegramLater(
            formatBookingTelegram("⚠️ สมัครใหม่เบอร์ซ้ำกับลูกค้าเดิม (ยังไม่รวมให้)", {
              สมัครใหม่: name,
              ลูกค้าเดิม: dupe.name,
              เบอร์: phone,
              ทำไง: "ถ้าเป็นคนเดียวกัน ใช้ปุ่ม 'รวมกับลูกค้าอื่น' ในหน้าลูกค้า",
            })
          );
        } catch {
          /* แจ้งเตือนไม่ได้ — ไม่ให้ล้มการสมัคร */
        }
      }
    }
  }

  await updateCustomer(customer.id, {
    name,
    phone,
    email: data.email?.trim() || undefined,
    birthday: data.birthday?.trim() || undefined,
    referralSource: data.referralSource?.trim() || undefined,
    address: data.address?.trim() || undefined,
    addressMapUrl: data.addressMapUrl?.trim() || undefined,
    postalCode: data.postalCode?.trim() || undefined,
    marketingConsent: data.marketingConsent ?? true,
    // ไม่ติ๊กตอนสมัคร = ไม่แตะค่าเดิม (เผื่อร้านกรอกไว้ให้ก่อนแล้ว)
    ...(data.taxInvoice ? { taxInvoice: data.taxInvoice } : {}),
  });

  for (const cat of cats) {
    const exists = customer.cats.some(
      (x) => cleanPetName(x.name).toLowerCase() === cleanPetName(cat.name).toLowerCase()
    );
    if (exists) continue;
    await addCat(customer.id, cat);
  }

  // ระดับลูกค้า (recalculateCustomerTier) คิดหลังตอบลูกค้าแล้วใน route สมัคร — ต้องดึงนัด/บิลทั้งร้าน ช้า
  return (await getCustomer(customer.id)) ?? null;
}

/**
 * บันทึกรูปบัตรประชาชนผู้ปกครอง — แนบครั้งเดียวใช้ได้ทุกรอบที่เข้าพัก (แนบใหม่ = แทนรูปเดิม)
 * ต้องรัน migration customers.id_card_url ก่อน ไม่งั้นคืน need_sql
 */
export async function setCustomerIdCard(customerId: string, url: string) {
  const sb = getSupabase();
  if (!sb) {
    const c = memCustomers.get(customerId);
    if (c) c.idCardUrl = url;
    return { ok: true as const };
  }
  const { error } = await sb.from("customers").update({ id_card_url: url }).eq("id", customerId).eq("tenant_id", requireTenantId());
  if (error) return { ok: false as const, error: "need_sql" as const, message: error.message };
  return { ok: true as const };
}

const CUSTOMER_DOCS_MIGRATION = "cats.vaccine_photos+customers.consent";

/**
 * รูปสมุดวัคซีนที่ตัวน้อง (ไม่ผูกนัด) — ต่อท้ายรูปเดิม เก็บได้สูงสุด MAX_VACCINE_PHOTOS รูป
 * รูปเข้า bucket ส่วนตัว prefix cat-vaccine/ (เปิดได้แค่หลังบ้าน ไม่ใช่ cats/ ที่ลูกค้าเปิดได้)
 * ต้องรัน migration cats.vaccine_photos ก่อน ไม่งั้นคืน need_sql
 */
export async function addCatVaccinePhotos(customerId: string, catId: string, photos: string[]) {
  const c = await getCustomer(customerId);
  const cat = c?.cats.find((x) => x.id === catId);
  if (!c || !cat) return { ok: false as const, error: "not_found" as const };
  const added: string[] = [];
  for (const [i, raw] of photos.slice(0, MAX_VACCINE_PHOTOS).entries()) {
    const v = raw.trim();
    if (!v.startsWith("data:image/")) continue;
    added.push(await uploadPrivateDataUrl(`cat-vaccine/${catId}-${Date.now()}-${i}`, v));
  }
  if (added.length === 0) return { ok: false as const, error: "no_photo" as const };
  const urls = [...splitVaccinePhotos(cat.vaccinePhotos), ...added].slice(-MAX_VACCINE_PHOTOS);
  const res = await setCatVaccinePhotos(customerId, catId, urls);
  return res.ok ? { ok: true as const, urls, added: added.length, cat, customer: c } : res;
}

/** เขียนรายการรูปสมุดวัคซีนของน้องทับทั้งชุด (ใช้ตอนลบรูปทีละรูป) */
export async function setCatVaccinePhotos(customerId: string, catId: string, urls: string[]) {
  const value = joinVaccinePhotos(urls);
  const sb = getSupabase();
  if (sb) {
    const write = () =>
      sb
        .from("cats")
        .update({ vaccine_photos: value || null })
        .eq("id", catId)
        .eq("customer_id", customerId)
        .eq("tenant_id", requireTenantId());
    let { error } = await write();
    // ยังไม่มีคอลัมน์ → ลองอัปเดตฐานข้อมูลให้เองแล้วเขียนใหม่
    if (error && (await ensureMigration(CUSTOMER_DOCS_MIGRATION))) ({ error } = await write());
    if (error) return { ok: false as const, error: "need_sql" as const };
  } else {
    const cat = memCustomers.get(customerId)?.cats.find((x) => x.id === catId);
    if (cat) cat.vaccinePhotos = value || undefined;
  }
  await touchCustomer(customerId);
  return { ok: true as const };
}

/** ลูกค้ายอมรับข้อตกลงของร้าน (จากลิงก์หน้าลูกค้า ยังไม่ต้องมีนัด) — เก็บครั้งล่าสุดไว้ที่ลูกค้า */
export async function setCustomerConsent(
  customerId: string,
  data: { signature: string; careNote?: string; fleaTick: boolean; at?: string }
) {
  const now = data.at || new Date().toISOString();
  let sig = data.signature.trim();
  if (sig.startsWith("data:")) {
    sig = await uploadPrivateDataUrl(`consent-signatures/customer-${customerId}-${Date.now()}`, sig);
  }
  const patch = {
    consent_accepted_at: now,
    consent_signature: sig || null,
    consent_flea_tick: data.fleaTick,
    consent_care_note: data.careNote?.trim() || null,
  };
  const sb = getSupabase();
  if (sb) {
    const write = () => sb.from("customers").update(patch).eq("id", customerId).eq("tenant_id", requireTenantId());
    let { error } = await write();
    if (error && (await ensureMigration(CUSTOMER_DOCS_MIGRATION))) ({ error } = await write());
    if (error) return { ok: false as const, error: "need_sql" as const };
  } else {
    const c = memCustomers.get(customerId);
    if (c) {
      c.consentAcceptedAt = now;
      c.consentSignature = sig || undefined;
      c.consentFleaTick = data.fleaTick;
      c.consentCareNote = patch.consent_care_note || undefined;
    }
  }
  return { ok: true as const, acceptedAt: now };
}

/**
 * สมุดวัคซีน + ข้อตกลงที่ลูกค้าส่งผ่านนัด (หน้ายอมรับข้อตกลง / ลิงก์ขอสมุดวัคซีนของนัด) เก็บไว้ที่นัด
 * → ยกขึ้นตัวน้อง/ลูกค้าด้วย ไม่งั้นหน้าข้อมูลลูกค้าขึ้น "ยังไม่ได้รับ" และรอบหน้าขอซ้ำ
 * newPhotos = รูปที่เพิ่งแนบเข้านัด (ต่อท้ายที่ตัวน้อง) · ไม่ใส่ = ยกรูปของนัดขึ้นเฉพาะตอนตัวน้องยังไม่มีรูปเลย
 * (กันรูปที่พนักงานลบออกจากตัวน้องแล้วเด้งกลับมา)
 */
export async function copyBookingDocsToCustomer(
  b: StoredBooking,
  opts: { customer?: CustomerRecord; newPhotos?: string[] } = {}
) {
  const c = opts.customer || (await findCustomerForBooking(b));
  if (!c) return false;
  let changed = false;
  const key = catKey(String(b.catName || ""));
  const cat = c.cats.find((x) => catKey(x.name) === key);
  if (cat) {
    const have = splitVaccinePhotos(cat.vaccinePhotos);
    const incoming = opts.newPhotos ?? (have.length ? [] : splitVaccinePhotos(b.vaccinePhotoUrl));
    const add = incoming.filter((u) => u && !have.includes(u));
    if (add.length) {
      const urls = [...have, ...add].slice(-MAX_VACCINE_PHOTOS);
      if ((await setCatVaccinePhotos(c.id, cat.id, urls)).ok) {
        cat.vaccinePhotos = joinVaccinePhotos(urls);
        changed = true;
      }
    }
  }
  // ข้อตกลงของนัดที่ใหม่กว่าครั้งล่าสุดที่ลูกค้า → ประทับที่ลูกค้าด้วย (ใช้เวลา/ลายเซ็นของนัดนั้น)
  if (b.consentAcceptedAt && b.consentAcceptedAt > (c.consentAcceptedAt || "")) {
    const res = await setCustomerConsent(c.id, {
      signature: b.consentSignature || "",
      careNote: b.careNote,
      fleaTick: Boolean(b.fleaTickTreated),
      at: b.consentAcceptedAt,
    });
    if (res.ok) {
      c.consentAcceptedAt = b.consentAcceptedAt;
      changed = true;
    }
  }
  return changed;
}

/** ยกสมุดวัคซีน/ข้อตกลงจากทุกนัดของลูกค้าขึ้นตัวน้อง/ลูกค้า (ข้อมูลเก่าก่อนมีการยกอัตโนมัติ) */
export async function syncCustomerDocsFromBookings(customerId: string) {
  const c = await getCustomer(customerId);
  if (!c) return false;
  const all = await listBookings();
  // เก่า → ใหม่ ให้ตัวน้องได้รูปจากนัดแรกที่มี และข้อตกลงล่าสุดทับทีหลัง
  const mine = all
    .filter((b) => b.status !== "cancelled" && bookingMatchesCustomer(b, c))
    .filter((b) => b.vaccinePhotoUrl || b.consentAcceptedAt)
    .sort((a, b) => (a.consentAcceptedAt || a.createdAt || "").localeCompare(b.consentAcceptedAt || b.createdAt || ""));
  let changed = false;
  for (const b of mine) if (await copyBookingDocsToCustomer(b, { customer: c })) changed = true;
  return changed;
}

/** บันทึกข้อมูลน้องก่อนเข้าพักไว้ที่ตัวน้อง (ตอบครั้งเดียว รอบหน้าดึงคำตอบเดิมมาให้แก้) */
export async function setCatStayInfo(customerId: string, catId: string, infoJson: string) {
  const sb = getSupabase();
  if (sb) {
    const write = () =>
      sb
        .from("cats")
        .update({ stay_info: infoJson })
        .eq("id", catId)
        .eq("customer_id", customerId)
        .eq("tenant_id", requireTenantId());
    let { error } = await write();
    if (error && (await ensureMigration(CUSTOMER_DOCS_MIGRATION))) ({ error } = await write());
    if (error) return { ok: false as const, error: "need_sql" as const };
  } else {
    const cat = memCustomers.get(customerId)?.cats.find((x) => x.id === catId);
    if (cat) cat.stayInfo = infoJson;
  }
  await touchCustomer(customerId);
  return { ok: true as const };
}
