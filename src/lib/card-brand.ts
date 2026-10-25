import type { CardStyleConfig, SiteConfig } from "./config-types";
import { isValidHex } from "./color-utils";

type ColorKey = "headerColor" | "headerTextColor" | "buttonColor" | "accentColor";

/** สีที่แต่ละการ์ด LINE ปรับได้ — ต้องตรงกับ CARDS ในหน้า "ปรับแต่งการ์ด LINE" */
export const CARD_COLOR_ROLES: Record<string, ColorKey[]> = {
  bookingConfirm: ["headerColor", "headerTextColor", "accentColor", "buttonColor"],
  billSummary: ["headerColor", "accentColor", "buttonColor"],
  depositRequest: ["headerColor", "accentColor", "buttonColor"],
  receipt: ["headerColor", "headerTextColor", "accentColor"],
  review: ["headerColor", "headerTextColor", "accentColor", "buttonColor"],
  groomInfo: ["headerColor", "headerTextColor", "accentColor", "buttonColor"],
  prestay: ["headerColor", "headerTextColor", "accentColor", "buttonColor"],
  timePicker: ["headerColor", "headerTextColor", "buttonColor"],
  depositThanks: ["headerColor", "accentColor"],
  memberBalance: ["headerColor", "accentColor"],
  payment: ["headerColor", "accentColor", "buttonColor"],
  coupon: ["headerColor", "headerTextColor", "accentColor", "buttonColor"],
  promo: ["headerColor", "headerTextColor", "accentColor", "buttonColor"],
  missYou: ["headerColor", "headerTextColor", "buttonColor"],
};

type Brand = { primary: string; accent: string; heading: string };

function validBrand(b: SiteConfig["branding"]): Brand | null {
  if (!b || ![b.primary, b.heading].every((c) => c && isValidHex(c))) return null;
  return { primary: b.primary, accent: b.accent, heading: b.heading };
}

/**
 * สีการ์ดที่ได้จากสีร้าน — การ์ดที่มีแถบหัว (มี headerTextColor) ใช้สีหลักเป็นพื้นแถบ + ตัวหนังสือขาว,
 * การ์ดที่ headerColor คือสีตัวหนังสือหัวข้อ (ไม่มีแถบ) ใช้สีหัวข้อของร้าน
 * accentColor เป็นสีตัวหนังสือเด่น (ชื่อบริการ/ยอดเงิน) บนพื้นขาว เลยใช้สีหลัก ไม่ใช่สีไฮไลท์อ่อนๆ ที่อ่านไม่ออก
 */
export function brandColorsFor(roles: ColorKey[], branding: Brand): Partial<CardStyleConfig> {
  const hasBar = roles.includes("headerTextColor");
  const next: Partial<CardStyleConfig> = {};
  for (const role of roles) {
    if (role === "headerColor") next.headerColor = hasBar ? branding.primary : branding.heading;
    if (role === "headerTextColor") next.headerTextColor = "#FFFFFF";
    if (role === "accentColor") next.accentColor = branding.primary;
    if (role === "buttonColor") next.buttonColor = branding.primary;
  }
  return next;
}

/**
 * การ์ดที่ร้านยังไม่ได้ตั้งสีเอง → ใช้สีร้าน (แทนน้ำตาล/ชมพูเริ่มต้นของ PetFlow)
 * สีที่ตั้งเองรายใบยังชนะเสมอ · ร้านที่ไม่ได้ตั้งสีร้าน = เหมือนเดิมทุกอย่าง
 */
export function applyBrandCardDefaults(config: SiteConfig): SiteConfig {
  const brand = validBrand(config.branding);
  if (!brand) return config;
  const cards: Record<string, CardStyleConfig> = { ...(config.cards || {}) };
  for (const [key, roles] of Object.entries(CARD_COLOR_ROLES)) {
    const own = cards[key] || {};
    const defaults = brandColorsFor(roles, brand);
    const merged: CardStyleConfig = { ...own };
    for (const role of roles) {
      if (!own[role]) merged[role] = defaults[role];
    }
    cards[key] = merged;
  }
  return { ...config, cards };
}

/**
 * ก่อนบันทึก — เอาสีที่ตรงกับสีร้านออก (เก็บเฉพาะสีที่ร้านเลือกเองจริงๆ)
 * ไม่งั้นค่าที่เติมไว้ตอนอ่านจะถูกบันทึกถาวร แล้วเปลี่ยนสีร้านทีหลังการ์ดไม่เปลี่ยนตาม
 */
export function stripBrandCardDefaults(config: SiteConfig): SiteConfig {
  const brand = validBrand(config.branding);
  if (!brand || !config.cards) return config;
  const cards: Record<string, CardStyleConfig> = {};
  for (const [key, st] of Object.entries(config.cards)) {
    const roles = CARD_COLOR_ROLES[key];
    if (!roles) {
      cards[key] = st;
      continue;
    }
    const defaults = brandColorsFor(roles, brand);
    const kept: CardStyleConfig = { ...st };
    for (const role of roles) {
      if (kept[role] && defaults[role] && kept[role]!.toLowerCase() === defaults[role]!.toLowerCase()) {
        delete kept[role];
      }
    }
    cards[key] = kept;
  }
  return { ...config, cards };
}
