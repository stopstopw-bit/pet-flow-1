import type { SiteConfig } from "./config-types";

/**
 * เปิด/ปิดฟีเจอร์รายร้าน — เก็บใน site_config.features ({ key: false } = ปิด)
 * ไม่มี key = เปิด → ร้านเดิมทุกร้านใช้งานได้เหมือนเดิมโดยไม่ต้องตั้งอะไร
 *
 * ปิดแล้ว: ซ่อนเมนูหลังร้าน (adminHrefs) + หน้าในแอปลูกค้า (appPaths) + API ฝั่งลูกค้า (ดู features-server.ts)
 * ฟีเจอร์ที่มี requires = ใช้ได้เมื่อฟีเจอร์แม่เปิดด้วย (เช่น ปิดรับฝาก → เช็คลิสต์ดูแลก็ปิดตาม)
 */
export type FeatureKey =
  | "selfBooking"
  | "hotel"
  | "stayInfo"
  | "idCard"
  | "prestay"
  | "checkinTime"
  | "grooming"
  | "groomInfo"
  | "vaccine"
  | "consent"
  | "transport"
  | "points"
  | "pointsRedeem"
  | "memberCredit"
  | "promos"
  | "coupons"
  | "referral"
  | "packages"
  | "pos"
  | "careChecklist"
  | "groomQueue"
  | "finance"
  | "tax"
  | "taxInvoice"
  | "payroll"
  | "insights"
  | "staffPerformance"
  | "birthdays"
  | "followUp"
  | "lineCards"
  | "articles"
  | "exportSheets"
  | "guide";

export type FeatureDef = {
  key: FeatureKey;
  label: string;
  hint: string;
  group: string;
  requires?: FeatureKey;
  /** เมนูหลังร้านที่ซ่อนเมื่อปิด */
  adminHrefs?: string[];
  /** หน้าในแอปลูกค้าที่เข้าไม่ได้เมื่อปิด */
  appPaths?: string[];
  /**
   * หน้าที่ใช้ร่วมกันหลายเรื่อง แยกด้วยพารามิเตอร์ในลิงก์ (เช่น /app/pet-docs?need=idcard)
   * ตรงกับลิงก์ = ใช้ฟีเจอร์นี้ตัดสินแทน appPaths ของหน้านั้น
   */
  appQueries?: { path: string; param: string; value: string }[];
};

export const FEATURE_GROUPS = [
  "บริการของร้าน",
  "ข้อมูลก่อนรับน้อง",
  "ลูกค้าในแอป",
  "ขายและการเงิน",
  "การตลาด",
  "หลังร้าน",
] as const;

/**
 * ลำดับในรายการ = ลำดับที่โชว์ในหน้าตั้งค่า — ฟีเจอร์ย่อย (requires) วางถัดจากฟีเจอร์แม่ หรือในกลุ่มของเรื่องนั้น
 */
export const FEATURES: FeatureDef[] = [
  // ── บริการของร้าน ──
  {
    key: "hotel",
    label: "รับฝาก / ห้องพัก",
    hint: "หน้าห้องพักและกฎการฝากในแอปลูกค้า",
    group: "บริการของร้าน",
    appPaths: ["/app/rooms", "/app/boarding-rules"],
  },
  {
    key: "checkinTime",
    label: "ให้ลูกค้าเลือกเวลาส่ง-รับน้อง",
    hint: "การ์ดเลือกเวลาเช็คอิน/เช็คเอาท์ ทั้งกดส่งเองและส่งอัตโนมัติ",
    group: "บริการของร้าน",
    requires: "hotel",
    appPaths: ["/app/booking-time"],
  },
  {
    key: "careChecklist",
    label: "เช็คลิสต์ดูแลน้องที่เข้าพัก",
    hint: "เมนูเช็คลิสต์ดูแลรายวัน",
    group: "บริการของร้าน",
    requires: "hotel",
    adminHrefs: ["/admin/care"],
  },
  {
    key: "grooming",
    label: "อาบน้ำตัดขน",
    hint: "หน้าอาบน้ำในแอปลูกค้า",
    group: "บริการของร้าน",
    appPaths: ["/app/grooming"],
  },
  {
    key: "groomQueue",
    label: "บอร์ดคิวอาบน้ำ",
    hint: "เมนูคิวอาบน้ำ แบ่งงานให้ช่าง",
    group: "บริการของร้าน",
    requires: "grooming",
    adminHrefs: ["/admin/queue"],
  },
  {
    key: "transport",
    label: "รับส่งน้อง",
    hint: "ลูกค้าเลือกให้ร้านไปรับ-ส่งน้องได้",
    group: "บริการของร้าน",
    appPaths: ["/app/booking-transport"],
  },
  // ── ข้อมูลก่อนรับน้อง (การ์ด LINE ที่ร้านขอจากลูกค้า) ──
  {
    key: "stayInfo",
    label: "ฟอร์มข้อมูลน้องก่อนเข้าพัก",
    hint: "การ์ดขอข้อมูลก่อนเข้าพัก (ใช้เมื่อเปิดรับฝาก)",
    group: "ข้อมูลก่อนรับน้อง",
    requires: "hotel",
    appQueries: [{ path: "/app/groom-info", param: "kind", value: "stay" }],
  },
  {
    key: "groomInfo",
    label: "ฟอร์มประวัติน้องก่อนอาบน้ำ",
    hint: "การ์ดขอประวัติก่อนอาบน้ำ (ใช้เมื่อเปิดอาบน้ำ)",
    group: "ข้อมูลก่อนรับน้อง",
    requires: "grooming",
    appPaths: ["/app/groom-info"],
  },
  {
    key: "vaccine",
    label: "ขอสมุดวัคซีน",
    hint: "การ์ดขอสมุดวัคซีน และช่องแนบสมุดวัคซีนในแอปลูกค้า",
    group: "ข้อมูลก่อนรับน้อง",
    appPaths: ["/app/pet-docs"],
  },
  {
    key: "idCard",
    label: "ขอบัตรประชาชนผู้ปกครอง",
    hint: "การ์ดขอบัตรประชาชน และช่องแนบบัตรตอนกดยอมรับกฎ (ใช้เมื่อเปิดรับฝาก)",
    group: "ข้อมูลก่อนรับน้อง",
    requires: "hotel",
    appQueries: [{ path: "/app/pet-docs", param: "need", value: "idcard" }],
  },
  {
    key: "consent",
    label: "กฎ + กดยินยอม (เซ็นชื่อ)",
    hint: "การ์ดกฎของร้านให้ลูกค้ากดยอมรับและเซ็นชื่อ",
    group: "ข้อมูลก่อนรับน้อง",
    appPaths: ["/app/consent"],
  },
  {
    key: "prestay",
    label: "การ์ดแจ้งเตรียมตัวก่อนเข้าพัก",
    hint: "การ์ดบอกของที่ต้องเตรียมมา (ใช้เมื่อเปิดรับฝาก)",
    group: "ข้อมูลก่อนรับน้อง",
    requires: "hotel",
  },
  // ── ลูกค้าในแอป ──
  {
    key: "selfBooking",
    label: "ลูกค้าจองคิวเองในแอป",
    hint: "ปิดแล้วลูกค้าต้องทักร้านเพื่อจอง ร้านลงนัดให้ในหลังร้าน",
    group: "ลูกค้าในแอป",
    appPaths: ["/app/book"],
  },
  {
    key: "points",
    label: "แต้มสะสม",
    hint: "เมนูแต้มในแอปลูกค้า",
    group: "ลูกค้าในแอป",
    appPaths: ["/app/points"],
  },
  {
    key: "pointsRedeem",
    label: "แลกแต้มเป็นรางวัล",
    hint: "ปิดแล้วลูกค้ายังเห็นแต้ม แต่กดแลกเองในแอปไม่ได้",
    group: "ลูกค้าในแอป",
    requires: "points",
  },
  {
    key: "memberCredit",
    label: "เครดิต Member (เติมเงินล่วงหน้า)",
    hint: "ปิดแล้วเติมเครดิตใหม่ไม่ได้ ยอดเดิมที่ลูกค้ามีอยู่ยังหักจ่ายได้",
    group: "ลูกค้าในแอป",
  },
  // ── ขายและการเงิน ──
  {
    key: "pos",
    label: "ขายสินค้าหน้าร้าน",
    hint: "แท็บขายหน้าร้านในหน้าคิดเงิน และรายการสินค้า",
    group: "ขายและการเงิน",
    adminHrefs: ["/admin/pos", "/admin/products"],
  },
  {
    key: "packages",
    label: "ขายคอร์ส / เครดิตในแอป",
    hint: "ลูกค้าซื้อคอร์สหรือเติมเครดิตเองในแอป",
    group: "ขายและการเงิน",
    adminHrefs: ["/admin/packages"],
  },
  {
    key: "taxInvoice",
    label: "ใบกำกับภาษี / สมัครในนามบริษัท",
    hint: "ช่องขอใบกำกับภาษี และตัวเลือกสมัครในนามนิติบุคคล ในหน้าสมัครสมาชิกและข้อมูลลูกค้า",
    group: "ขายและการเงิน",
  },
  {
    key: "finance",
    label: "รายรับ-รายจ่าย",
    hint: "เมนูบันทึกรายรับรายจ่ายของร้าน",
    group: "ขายและการเงิน",
    adminHrefs: ["/admin/finance"],
  },
  {
    key: "tax",
    label: "เอกสารรายได้ / ภาษี",
    hint: "เมนูเอกสารรายได้และภาษี",
    group: "ขายและการเงิน",
    adminHrefs: ["/admin/tax"],
  },
  {
    key: "payroll",
    label: "เงินเดือนและค่าคอม",
    hint: "เมนูคิดเงินเดือนพนักงาน",
    group: "ขายและการเงิน",
    adminHrefs: ["/admin/payroll"],
  },
  // ── การตลาด ──
  {
    key: "promos",
    label: "โปรโมชั่น",
    hint: "เมนูโปรในหลังร้านและในแอปลูกค้า",
    group: "การตลาด",
    adminHrefs: ["/admin/promos"],
    appPaths: ["/app/promos"],
  },
  {
    key: "coupons",
    label: "คูปอง",
    hint: "คูปองส่วนลด กระเป๋าคูปองในแอป และคูปองวันเกิด",
    group: "การตลาด",
    adminHrefs: ["/admin/coupons"],
    appPaths: ["/app/coupons", "/app/claim-coupon"],
  },
  {
    key: "referral",
    label: "ชวนเพื่อนรับคูปอง",
    hint: "ลิงก์/โค้ดชวนเพื่อนในกระเป๋าคูปอง — เพื่อนสมัครด้วยโค้ด ได้คูปองทั้งคู่ทันที",
    group: "การตลาด",
    requires: "coupons",
  },
  {
    key: "birthdays",
    label: "อวยพรวันเกิดลูกค้า",
    hint: "เมนูวันเกิดลูกค้า และการคัดรายชื่อวันเกิดอัตโนมัติ",
    group: "การตลาด",
    adminHrefs: ["/admin/birthdays"],
  },
  {
    key: "followUp",
    label: "ทักลูกค้าที่หายไปทาง LINE",
    hint: "ปุ่มการ์ด \"คิดถึงน้อง\" ในหน้าลูกค้า และการส่งอัตโนมัติ",
    group: "การตลาด",
  },
  {
    key: "articles",
    label: "บทความหน้าเว็บ",
    hint: "เมนูเขียนบทความ",
    group: "การตลาด",
    adminHrefs: ["/admin/articles"],
  },
  // ── หลังร้าน ──
  {
    key: "insights",
    label: "สรุปข้อมูล",
    hint: "เมนูสรุปยอดขายและกลุ่มลูกค้า",
    group: "หลังร้าน",
    adminHrefs: ["/admin/insights"],
  },
  {
    key: "staffPerformance",
    label: "ผลงานพนักงาน",
    hint: "เมนูสรุปผลงานรายคน",
    group: "หลังร้าน",
    adminHrefs: ["/admin/staff-performance"],
  },
  {
    key: "lineCards",
    label: "ปรับแต่งการ์ด LINE",
    hint: "เมนูแต่งสีและข้อความการ์ด LINE",
    group: "หลังร้าน",
    adminHrefs: ["/admin/cards"],
  },
  {
    key: "exportSheets",
    label: "ส่งออกไป Google Sheets",
    hint: "ปุ่มส่งออกข้อมูลในหน้าลูกค้า รายรับ-รายจ่าย และภาษี",
    group: "หลังร้าน",
  },
  {
    key: "guide",
    label: "ลิงก์คู่มือการใช้งาน",
    hint: "ปุ่ม \"คู่มือ\" ในเมนูหลังร้าน",
    group: "หลังร้าน",
  },
];

/**
 * การ์ดถามข้อมูล / หัวข้อข้อความอัตโนมัติ → ฟีเจอร์ที่คุม
 * (ชื่อ part เดียวกับ INTAKE_CARDS / AUTO_MESSAGE_TOPICS / ชุดการ์ด)
 */
export const CARD_FEATURE: Record<string, FeatureKey> = {
  stayInfo: "stayInfo",
  groomInfo: "groomInfo",
  vaccine: "vaccine",
  idcard: "idCard",
  consent: "consent",
  prestay: "prestay",
  checkin: "checkinTime",
  checkout: "checkinTime",
};

const BY_KEY = Object.fromEntries(FEATURES.map((f) => [f.key, f])) as Record<FeatureKey, FeatureDef>;

type WithFeatures = Pick<SiteConfig, "features"> | null | undefined;

/** ฟีเจอร์นี้เปิดอยู่ไหม — ไม่ได้ตั้ง = เปิด · ฟีเจอร์แม่ปิด = ปิดตาม */
export function isFeatureOn(config: WithFeatures, key: FeatureKey): boolean {
  if (config?.features?.[key] === false) return false;
  const parent = BY_KEY[key]?.requires;
  return parent ? isFeatureOn(config, parent) : true;
}

function matches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** ฟีเจอร์ที่ปิดอยู่ซึ่งคุมหน้านี้ (หลังร้าน) — null = เปิดได้ */
export function disabledFeatureForAdminPath(config: WithFeatures, pathname: string): FeatureKey | null {
  const f = FEATURES.find((x) => x.adminHrefs?.some((h) => matches(pathname, h)));
  return f && !isFeatureOn(config, f.key) ? f.key : null;
}

/**
 * ฟีเจอร์ที่ปิดอยู่ซึ่งคุมหน้านี้ (แอปลูกค้า) — null = เปิดได้
 * search = ส่วน ?a=b ของลิงก์ (ไม่ใส่ = ดูแค่ path)
 */
export function disabledFeatureForAppPath(
  config: WithFeatures,
  pathname: string,
  search = ""
): FeatureKey | null {
  const params = new URLSearchParams(search);
  const byQuery = FEATURES.find((x) =>
    x.appQueries?.some((q) => matches(pathname, q.path) && params.get(q.param) === q.value)
  );
  const f = byQuery || FEATURES.find((x) => x.appPaths?.some((h) => matches(pathname, h)));
  return f && !isFeatureOn(config, f.key) ? f.key : null;
}

/** การ์ด/หัวข้อนี้ส่งได้ไหม — part ที่ไม่ได้ผูกฟีเจอร์ (เช่น แจ้งเตือนนัด ใบเสร็จ) = ได้เสมอ */
export function cardOn(config: WithFeatures, part: string): boolean {
  const key = CARD_FEATURE[part];
  return key ? isFeatureOn(config, key) : true;
}

/** หัวข้อการ์ดที่ร้านปิดอยู่ทั้งหมด */
export function cardsOff(config: WithFeatures): string[] {
  return Object.keys(CARD_FEATURE).filter((p) => !cardOn(config, p));
}

export function featureLabel(key: FeatureKey) {
  return BY_KEY[key]?.label || key;
}
