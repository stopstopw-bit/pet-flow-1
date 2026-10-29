import type { SiteConfig } from "./config-types";
import { otherKey, resolveGroomForm, type GroomField } from "./groom-form";
import { resolveHistoryForm, resolveStayForm } from "./stay-form";
import type { PetKind } from "./pet-kind";

/**
 * ร้านขอข้อมูลอะไรบ้างตามบริการ — ตั้งในหน้าตั้งค่า › เปิด/ปิดฟีเจอร์ (หมวดข้อมูลก่อนรับน้อง)
 * ไม่ได้ตั้ง = แบบเดิม: นัดอาบน้ำถามแค่ประวัติก่อนอาบน้ำ ไม่ขอสมุดวัคซีน/บัตร/กฎ
 */
export type IntakeRules = {
  /** การ์ดของการเข้าพักที่ขอในนัดอาบน้ำ/นวดด้วย (key ตาม GROOM_EXTRA_CARDS) */
  groomCards?: string[];
  /** นัดอาบน้ำ/นวด ใช้ฟอร์มประวัติ (หมวดเจ้าของ + น้อง ของฟอร์มทำประวัติ) แทนฟอร์มก่อนอาบน้ำ */
  groomUsesHistory?: boolean;
  /** ฟอร์มทำประวัติ / ก่อนเข้าพัก บังคับตอบทุกข้อ */
  allRequired?: boolean;
  /** หน้าสมัครสมาชิกถามประวัติเจ้าของ + น้อง (ของฟอร์มทำประวัติ) ไปเลย ไม่บังคับ — เก็บเป็นข้อมูลก่อนเข้าพักของน้อง */
  registerAsksHistory?: boolean;
};

export type IntakeAnswers = Record<string, string | string[]>;

/** การ์ดของการเข้าพักที่ร้านเลือกให้ขอในนัดอาบน้ำได้ */
export const GROOM_EXTRA_CARDS = [
  { key: "vaccine", label: "สมุดวัคซีน" },
  { key: "consent", label: "กฎ + กดยินยอม" },
  { key: "idcard", label: "บัตรประชาชน" },
] as const;

type WithRules = Pick<SiteConfig, "intakeRules"> | null | undefined;

/** นัดอาบน้ำ/นวดของร้านนี้ขอการ์ดนี้ด้วยไหม */
export function groomUsesCard(cfg: WithRules, part: string): boolean {
  return Boolean(cfg?.intakeRules?.groomCards?.includes(part));
}

/**
 * คำถามในฟอร์มที่ลูกค้ากรอก — ชุดเดียวกันทั้งหน้าฟอร์ม, API ที่บันทึก และสรุปในหลังบ้าน
 * form: "groom" ฟอร์มของนัดอาบน้ำ/นวด · "stay" ฟอร์มก่อนเข้าพัก · kind: ชนิดของน้องตัวนั้น
 * หมวดเจ้าของ (เบอร์ฉุกเฉิน) ถามครั้งเดียวตอนสมัครสมาชิก ไม่ถามซ้ำในฟอร์มนี้ (เจ้าของระบบ 2026-10-27)
 * — withOwner: ใส่หมวดเจ้าของด้วย ใช้ตอนสรุปคำตอบในหลังบ้าน
 */
export function intakeFields(
  form: "groom" | "stay",
  kind: PetKind | undefined,
  cfg: (WithRules & Partial<Pick<SiteConfig, "groomForm" | "stayForm">>) | null | undefined,
  opts?: { withOwner?: boolean }
): GroomField[] {
  const allRequired = Boolean(cfg?.intakeRules?.allRequired);
  const ask = (fs: GroomField[]) => (opts?.withOwner ? fs : fs.filter((f) => f.section !== "owner"));
  if (form === "stay") return ask(resolveStayForm(cfg?.stayForm, kind, { allRequired }));
  if (cfg?.intakeRules?.groomUsesHistory) {
    const history = resolveHistoryForm(kind, { allRequired }, cfg?.stayForm);
    if (history) return ask(history);
  }
  return resolveGroomForm(cfg?.groomForm, kind);
}

/** key หมวดเจ้าของของฟอร์มทำประวัติ — เก็บคำตอบจากหน้าสมัครไว้ตอนลูกค้าส่งฟอร์มก่อนเข้าพัก */
export function ownerHistoryKeys(kind: PetKind | undefined, cfg: Parameters<typeof intakeFields>[2]): string[] {
  return intakeFields("stay", kind, cfg, { withOwner: true })
    .filter((f) => f.section === "owner")
    .flatMap((f) => (f.allowOther ? [f.key, otherKey(f.key)] : [f.key]));
}

/**
 * คำถามไว้สรุปคำตอบที่เก็บไว้ — ใช้ชุดปัจจุบันของร้าน ถ้าคำตอบเป็นของชุดเดิม (ร้านเพิ่งเปลี่ยนฟอร์ม)
 * คืน undefined ให้ groomInfoSummary ใช้หัวข้อเริ่มต้น จะได้ไม่ขึ้น "-" ทุกข้อ
 */
export function summaryFields(
  form: "groom" | "stay",
  kind: PetKind | undefined,
  cfg: Parameters<typeof intakeFields>[2],
  info: Record<string, unknown>
): GroomField[] | undefined {
  const fs = intakeFields(form, kind, cfg, { withOwner: true });
  return fs.some((f) => f.key in info) ? fs : undefined;
}

/**
 * คำถามประวัติที่หน้าสมัครสมาชิกถามเพิ่ม (ร้านเปิด registerAsksHistory) — หมวดเจ้าของ + น้อง
 * ไม่บังคับ ไม่กรอกก็สมัครได้ (เจ้าของระบบ 2026-10-23) — ข้อที่เว้นไว้ ฟอร์มก่อนเข้าพักจะถามอีกที
 * ไม่มีฟอร์มประวัติสำหรับชนิดนี้ (แมว) = null
 */
export function registerHistoryFields(
  kind: PetKind | undefined,
  cfg: (WithRules & Partial<Pick<SiteConfig, "stayForm">>) | null | undefined
): { owner: GroomField[]; pet: GroomField[] } | null {
  if (!cfg?.intakeRules?.registerAsksHistory) return null;
  const fs = resolveHistoryForm(kind, undefined, cfg?.stayForm)?.map((f) => ({
    ...f,
    required: false,
    label: f.label.replace(/\s*\((ถ้าไม่มีเว้นว่างได้|หากมี|ถ้ามี)\)/, ""),
  }));
  if (!fs) return null;
  return {
    owner: fs.filter((f) => f.section === "owner"),
    pet: fs.filter((f) => f.section === "pet"),
  };
}

/** ประวัติที่ได้จากหน้าสมัคร — ยังไม่นับว่ากรอกฟอร์มก่อนเข้าพักแล้ว (หมวดการดูแลยังไม่ได้ถาม) */
export const REGISTER_HISTORY_SOURCE = "register";

/** ลูกค้ากรอกฟอร์มก่อนเข้าพักแล้วหรือยัง — คำตอบที่มาจากหน้าสมัครอย่างเดียวยังไม่นับ */
export function stayInfoDone(json?: string | null): boolean {
  if (!json) return false;
  try {
    return (JSON.parse(json) as { source?: string }).source !== REGISTER_HISTORY_SOURCE;
  } catch {
    return true;
  }
}

/** เก็บเฉพาะคำถามที่มีจริง — ตัดความยาว และแปลงชนิดให้ตรงกับคำถาม */
export function sanitizeIntakeInfo(
  fields: { key: string; type: string; allowOther?: boolean }[],
  info: unknown
): Record<string, unknown> {
  const payload: Record<string, unknown> = { submittedAt: new Date().toISOString() };
  const src = (info && typeof info === "object" ? info : {}) as Record<string, unknown>;
  for (const f of fields) {
    const raw = src[f.key];
    if (f.type === "multi") {
      payload[f.key] = Array.isArray(raw)
        ? raw.map((v) => String(v).slice(0, 120))
        : raw
          ? [String(raw).slice(0, 120)] // ข้อมูลเก่าที่เคยเก็บเป็น string เดี่ยว
          : [];
    } else {
      payload[f.key] = String(raw ?? "").trim().slice(0, 500);
    }
    if (f.allowOther) payload[otherKey(f.key)] = String(src[otherKey(f.key)] ?? "").trim().slice(0, 300);
  }
  return payload;
}
