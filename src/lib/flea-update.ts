import type { CardStyleConfig, SiteConfig } from "./config-types";
import type { GroomFormOption } from "./groom-form";
import { resolveStayForm } from "./stay-form";

/**
 * การ์ด "อัปเดตการให้ยากำจัดเห็บหมัด" — ร้านส่งจากหน้าข้อมูลลูกค้า (ถามข้อมูลก่อนรับน้อง)
 * ลูกค้าเลือกวิธี (หยด/ทาน/ฉีด) + วันที่ให้ยาล่าสุด + แนบรูปหลักฐาน (กล่องยา/ใบเสร็จ/สมุดหมอ)
 * คำตอบเขียนทับข้อ fleaMethod / fleaLast ในข้อมูลก่อนเข้าพักของน้อง (stayInfo) — สรุปในหลังบ้านเห็นค่าล่าสุดทันที
 * ลูกค้าเปิดหน้าเดียวกันเองได้จากหน้าแก้ไขข้อมูลของฉัน (ไม่ต้องรอร้านส่ง)
 * ตัวเลือก/คำถามใช้ชุดเดียวกับฟอร์มก่อนเข้าพักของร้าน (หลังบ้าน › การ์ด › ฟอร์มก่อนเข้าพัก) — ร้านแก้ที่เดียว
 * (Back Home ขอ 2026-11-26)
 */

/** ร้านขอรูปหลักฐานไหม — ตั้งที่ ตั้งค่า › เปิด/ปิดฟีเจอร์ ใต้สวิตช์การ์ดนี้ · ไม่ตั้ง = แนบได้ ไม่บังคับ */
export type FleaProofMode = "off" | "optional" | "required";

export const FLEA_PROOF_OPTIONS: { key: FleaProofMode; label: string }[] = [
  { key: "optional", label: "แนบได้ ไม่บังคับ" },
  { key: "required", label: "บังคับแนบรูป" },
  { key: "off", label: "ไม่ขอรูป" },
];

export function fleaProofMode(cfg: Pick<SiteConfig, "intakeRules"> | null | undefined): FleaProofMode {
  const v = cfg?.intakeRules?.fleaProof;
  return v === "off" || v === "required" ? v : "optional";
}

/** source ของ stayInfo ที่สร้างจากการ์ดนี้อย่างเดียว (ยังไม่เคยกรอกฟอร์มก่อนเข้าพัก) — ไม่นับว่ากรอกฟอร์มแล้ว */
export const FLEA_UPDATE_SOURCE = "flea-update";

export const MAX_FLEA_PHOTOS = 3;
/** เก็บรูปหลักฐานย้อนหลังได้กี่รูปต่อน้อง (ใหม่สุดอยู่ท้าย) */
export const MAX_FLEA_STORED = 9;

export const FLEA_CARD_DEFAULTS = {
  header: "💧 อัปเดตการให้ยากำจัดเห็บหมัด",
  body: "รบกวนอัปเดตการให้ยากำจัดเห็บหมัดของ{pet} ล่าสุดหน่อยนะคะ เลือกว่าเป็นยาหยด ยาทาน หรือยาฉีด ใส่วันที่ให้ยา และแนบรูปกล่องยา/ใบเสร็จ/สมุดหมอได้เลยค่ะ 🙏",
  button: "💧 อัปเดตยากำจัดเห็บหมัด",
} as const;

export function fleaCardText(style: CardStyleConfig | undefined, key: keyof typeof FLEA_CARD_DEFAULTS): string {
  return style?.texts?.[key]?.trim() || FLEA_CARD_DEFAULTS[key];
}

/** คำถาม + ตัวเลือก ตามฟอร์มก่อนเข้าพัก (หมา) ของร้าน — ตัด "ไม่ได้ทำ" ออก เพราะการ์ดนี้ใช้แจ้งตอนให้ยาแล้ว */
export function fleaQuestions(cfg: Pick<SiteConfig, "stayForm"> | null | undefined): {
  methodLabel: string;
  methods: GroomFormOption[];
  dateLabel: string;
} {
  const fs = resolveStayForm(cfg?.stayForm, "dog");
  const m = fs.find((f) => f.key === "fleaMethod");
  const d = fs.find((f) => f.key === "fleaLast");
  const methods = (m?.options || []).filter((o) => o.key !== "none");
  return {
    methodLabel: m?.label || "กำจัดเห็บหมัดแบบไหนคะ",
    methods: methods.length
      ? methods
      : [
          { key: "drop", label: "💧 หยด" },
          { key: "oral", label: "💊 ทานยา" },
          { key: "injection", label: "💉 ฉีดยา" },
        ],
    dateLabel: d?.label || "ให้ยาเห็บหมัดครั้งล่าสุดเมื่อไหร่คะ",
  };
}

/** ข้อมูลเห็บหมัดล่าสุดของน้อง (อ่านจาก stayInfo) */
export type FleaInfo = {
  method?: string;
  last?: string;
  /** YYYY-MM-DD ที่ลูกค้าเลือกในการ์ดนี้ */
  date?: string;
  photos: string[];
  updatedAt?: string;
};

export function parseFleaInfo(stayInfo?: string | null): FleaInfo {
  if (!stayInfo) return { photos: [] };
  try {
    const o = JSON.parse(stayInfo) as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === "string" && v ? v : undefined);
    return {
      method: s(o.fleaMethod),
      last: s(o.fleaLast),
      date: s(o.fleaDate),
      photos: Array.isArray(o.fleaPhotos) ? o.fleaPhotos.filter((x): x is string => typeof x === "string") : [],
      updatedAt: s(o.fleaUpdatedAt),
    };
  } catch {
    return { photos: [] };
  }
}
