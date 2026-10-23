import type { SiteConfig } from "./config-types";
import { resolveGroomForm, type GroomField } from "./groom-form";
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
};

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
 */
export function intakeFields(
  form: "groom" | "stay",
  kind: PetKind | undefined,
  cfg: (WithRules & Pick<SiteConfig, "groomForm">) | null | undefined
): GroomField[] {
  const allRequired = Boolean(cfg?.intakeRules?.allRequired);
  if (form === "stay") return resolveStayForm(undefined, kind, { allRequired });
  if (cfg?.intakeRules?.groomUsesHistory) {
    const history = resolveHistoryForm(kind, { allRequired });
    if (history) return history;
  }
  return resolveGroomForm(cfg?.groomForm, kind);
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
  const fs = intakeFields(form, kind, cfg);
  return fs.some((f) => f.key in info) ? fs : undefined;
}
