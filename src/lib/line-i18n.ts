/**
 * การ์ด LINE ภาษาอังกฤษ — สลับข้อความในการ์ด (Flex/ข้อความ) เป็นอังกฤษตอนส่ง สำหรับลูกค้าที่ใช้ภาษาอังกฤษ
 *
 * - เปิด/ปิดรายร้าน: ตั้งค่า › อัตโนมัติ › การ์ด LINE ภาษาอังกฤษ (automation.englishCards) — ไม่มีค่า = ปิด ส่งไทยเหมือนเดิม
 * - ข้อความของระบบใช้ฉบับอังกฤษตายตัวใน lib/card-en.ts (ทันที ได้คำเดิมทุกครั้ง)
 *   ข้อความที่ร้านพิมพ์เองที่ไม่มีในตาราง (ชื่อโปร ฯลฯ) คงไทยไว้
 * - ภาษาที่ใช้: (1) แอดมินเลือกตอนส่ง (header x-card-lang จากป๊อปอัปพรีวิว) (2) ภาษาที่ลูกค้าตั้งไว้ (customers.language)
 *   แอดมินเลือกเองตอนส่งหาลูกค้าคนเดียว = จำเป็นภาษาของลูกค้าคนนั้น (การ์ดอัตโนมัติครั้งต่อไปใช้ภาษานี้)
 * - ปุ่มแบบ "ส่งข้อความ" (action type message) ไม่แปลข้อความที่ส่งกลับ — ระบบแชทจับคำไทยอยู่ แปลแค่ป้ายปุ่ม
 */
import { cardTextToEnglish } from "./card-en";

export type CardLang = "th" | "en";

const THAI = /[฀-๿]/;

/** ร้านนี้เปิดการ์ดภาษาอังกฤษไหม */
export async function englishCardsEnabled(): Promise<boolean> {
  try {
    const { getSiteConfig } = await import("./config-store");
    return (await getSiteConfig()).automation?.englishCards === true;
  } catch {
    return false;
  }
}

/** แอดมินเลือกภาษาตอนส่ง — ป๊อปอัปพรีวิวแนบ header x-card-lang มากับคำขอส่ง */
export async function cardLangOverride(): Promise<CardLang | undefined> {
  try {
    const { headers } = await import("next/headers");
    const v = (await headers()).get("x-card-lang");
    return v === "en" || v === "th" ? v : undefined;
  } catch {
    // นอกคำขอ (เช่นงานเบื้องหลัง) — ไม่มี header
    return undefined;
  }
}

/** ภาษาที่ลูกค้าตั้งไว้ (ไม่มี = ไทย) */
export async function customerLangFor(lineUserId: string): Promise<CardLang> {
  try {
    const { findCustomerByLine } = await import("./customers-store");
    const c = await findCustomerByLine(lineUserId);
    return c?.language === "en" ? "en" : "th";
  } catch {
    return "th";
  }
}

/** ภาษาที่จะใช้ส่งหาคนนี้: แอดมินเลือก (และจำไว้) > ภาษาลูกค้า · ร้านปิดสวิตช์ = ไทย */
export async function resolveCardLang(lineUserId: string): Promise<CardLang> {
  if (!(await englishCardsEnabled())) return "th";
  const forced = await cardLangOverride();
  if (!forced) return customerLangFor(lineUserId);
  try {
    const { findCustomerByLine, updateCustomer } = await import("./customers-store");
    const c = await findCustomerByLine(lineUserId);
    if (c && (c.language || "th") !== forced) await updateCustomer(c.id, { language: forced });
  } catch {
    // จำไม่สำเร็จไม่เป็นไร — ส่งการ์ดต่อได้
  }
  return forced;
}

/** แบ่งผู้รับตามภาษา (ส่งกลุ่ม) — แอดมินเลือกภาษาไว้ = ทุกคนภาษานั้น (ไม่จำ) */
export async function splitByCardLang(lineUserIds: string[]): Promise<Record<CardLang, string[]>> {
  if (!(await englishCardsEnabled())) return { th: lineUserIds, en: [] };
  const forced = await cardLangOverride();
  if (forced) return { th: forced === "th" ? lineUserIds : [], en: forced === "en" ? lineUserIds : [] };
  const out: Record<CardLang, string[]> = { th: [], en: [] };
  try {
    const { listCustomers } = await import("./customers-store");
    const en = new Set<string>();
    for (const c of await listCustomers()) {
      if (c.language !== "en") continue;
      if (c.lineUserId) en.add(c.lineUserId);
      for (const id of c.lineUserIds || []) en.add(id);
    }
    for (const id of lineUserIds) out[en.has(id) ? "en" : "th"].push(id);
  } catch {
    out.th = lineUserIds;
  }
  return out;
}

/** คีย์ที่เป็นข้อความให้ลูกค้าอ่าน */
const TEXT_KEYS = new Set(["text", "altText", "label", "displayText", "title"]);

type Visit = (holder: Record<string, unknown>, key: string, value: string) => void;

function walk(node: unknown, visit: Visit) {
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, visit));
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      // ปุ่มส่งข้อความกลับ — ข้อความที่ส่งต้องคงเดิม (ระบบแชทจับคำนี้)
      if (k === "text" && obj.type === "message" && "label" in obj) continue;
      if (TEXT_KEYS.has(k) && THAI.test(v)) visit(obj, k, v);
    } else if (v && typeof v === "object") {
      walk(v, visit);
    }
  }
}

/** แปลการ์ดทั้งชุดเป็นภาษาอังกฤษ (สำเนาใหม่ ไม่แก้ของเดิม) + บอกว่าแปลได้กี่ข้อความจากทั้งหมด */
export function translateMessagesInfo<T>(messages: T[]): { messages: T[]; total: number; translated: number } {
  const copy = JSON.parse(JSON.stringify(messages)) as T[];
  let total = 0;
  let translated = 0;
  walk(copy, (h, k, v) => {
    total++;
    const r = cardTextToEnglish(v);
    if (r.done) translated++;
    h[k] = r.text;
  });
  return { messages: copy, total, translated };
}

/** ข้อความชุดนี้สำหรับภาษานี้ */
export async function localizeMessages<T>(messages: T[], lang: CardLang): Promise<T[]> {
  return lang === "en" ? translateMessagesInfo(messages).messages : messages;
}
