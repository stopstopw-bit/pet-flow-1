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
  | "grooming"
  | "transport"
  | "points"
  | "promos"
  | "coupons"
  | "packages"
  | "pos"
  | "careChecklist"
  | "groomQueue"
  | "finance"
  | "tax"
  | "payroll"
  | "insights"
  | "staffPerformance"
  | "birthdays"
  | "followUp"
  | "lineCards"
  | "articles";

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
};

export const FEATURE_GROUPS = ["บริการของร้าน", "ลูกค้าในแอป", "ขายและการเงิน", "การตลาด", "หลังร้าน"] as const;

export const FEATURES: FeatureDef[] = [
  // ── บริการของร้าน ──
  {
    key: "hotel",
    label: "รับฝาก / ห้องพัก",
    hint: "หน้าห้องพัก กฎการฝาก และข้อตกลงก่อนเข้าพักในแอปลูกค้า",
    group: "บริการของร้าน",
    appPaths: ["/app/rooms", "/app/boarding-rules", "/app/consent"],
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
    hint: "หน้าอาบน้ำและฟอร์มประวัติก่อนอาบน้ำในแอปลูกค้า",
    group: "บริการของร้าน",
    appPaths: ["/app/grooming", "/app/groom-info"],
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
    hint: "เมนูแต้มและการแลกรางวัลในแอปลูกค้า",
    group: "ลูกค้าในแอป",
    appPaths: ["/app/points"],
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
    hint: "คูปองส่วนลด กระเป๋าคูปอง และคูปองชวนเพื่อน",
    group: "การตลาด",
    adminHrefs: ["/admin/coupons"],
    appPaths: ["/app/coupons", "/app/claim-coupon"],
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
    hint: "ปุ่มตามลูกค้าในหน้าลูกค้า และการส่งอัตโนมัติ",
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
];

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

/** ฟีเจอร์ที่ปิดอยู่ซึ่งคุมหน้านี้ (แอปลูกค้า) — null = เปิดได้ */
export function disabledFeatureForAppPath(config: WithFeatures, pathname: string): FeatureKey | null {
  const f = FEATURES.find((x) => x.appPaths?.some((h) => matches(pathname, h)));
  return f && !isFeatureOn(config, f.key) ? f.key : null;
}

export function featureLabel(key: FeatureKey) {
  return BY_KEY[key]?.label || key;
}
