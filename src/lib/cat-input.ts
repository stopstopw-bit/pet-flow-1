import { normalizeSpecies, normalizeWeightKg, type CatGender, type PetSpecies } from "./customers-store";

/** รายละเอียดน้องที่รับจากฟอร์ม (สมัครสมาชิก / ร้านเพิ่มลูกค้าเอง) — ตรวจและแปลงชนิดให้เรียบร้อยก่อนบันทึก */
export type CatInput = {
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
  seizureHistory?: string;
  allergy?: string;
  weightKg?: number;
  species?: PetSpecies;
  staffNote?: string;
};

export function parseCatInput(c: Record<string, unknown> | null | undefined): CatInput {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const age = c?.ageValue;
  return {
    name: String(c?.name || "").trim(),
    gender: c?.gender === "male" || c?.gender === "female" ? c.gender : undefined,
    breed: str(c?.breed),
    ageValue: age != null && age !== "" && !isNaN(Number(age)) ? Number(age) : undefined,
    ageUnit: c?.ageUnit === "month" ? "month" : c?.ageUnit === "year" ? "year" : undefined,
    birthday: str(c?.birthday),
    medical: str(c?.medical),
    furLength: c?.furLength === "short" || c?.furLength === "long" ? c.furLength : undefined,
    color: str(c?.color),
    neutered: typeof c?.neutered === "boolean" ? c.neutered : undefined,
    seizureHistory: str(c?.seizureHistory),
    allergy: str(c?.allergy),
    weightKg: normalizeWeightKg(c?.weightKg),
    species: normalizeSpecies(c?.species),
    staffNote: str(c?.staffNote),
  };
}
