/**
 * หน้ากดยอมรับข้อตกลงก่อนเข้าพัก: แนบรูปหลักฐานการหยดยาเห็บหมัด (ไม่บังคับ — ไม่แนบ การติ๊กยืนยันก็ถือว่ายืนยันแล้ว)
 * และข้อความรับรองทางกฎหมายที่ขึ้นหลังลูกค้าติ๊กยืนยัน (2026-11-26)
 */
export const FLEA_PROOF_MAX = 3;

export const FLEA_LEGAL_NOTE_TH =
  "⚖️ การติ๊กยืนยันนี้ถือเป็นคำรับรองของผู้ปกครองว่าได้ป้องกันเห็บหมัดให้น้องจริงตามที่แจ้ง (หยด ทาน หรือฉีด) ระบบบันทึกวันเวลา บัญชี LINE รูปที่แนบ และลายเซ็นของท่านไว้เป็นข้อมูลอิเล็กทรอนิกส์ ซึ่งมีผลผูกพันและใช้เป็นพยานหลักฐานทางกฎหมายได้ตามพระราชบัญญัติว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544 หากภายหลังพบว่าไม่เป็นความจริง (เช่น ตรวจพบเห็บหมัดระหว่างเข้าพัก) ผู้ปกครองยินยอมรับผิดชอบค่าใช้จ่ายและความเสียหายตามข้อตกลงของร้าน";

export const FLEA_LEGAL_NOTE_EN =
  "⚖️ By ticking this box you certify that your pet really received the flea and tick treatment stated. The date and time, your LINE account, any photos attached and your signature are recorded as electronic data, which is binding and admissible as legal evidence under Thailand's Electronic Transactions Act B.E. 2544 (2001). If this later proves untrue (for example, fleas or ticks are found during the stay), you agree to cover the costs and damages set out in the shop's terms.";

type WithRules = { intakeRules?: { consentFleaProof?: boolean; fleaLegalNote?: string } } | null | undefined;

/** ร้านเปิดช่องแนบรูป + ข้อความรับรองทางกฎหมายในหน้ากดยอมรับไหม — ไม่ตั้ง = เปิด (ปิดได้ที่ ตั้งค่า › เปิด/ปิดฟีเจอร์) */
export function consentFleaProofOn(cfg: WithRules): boolean {
  return cfg?.intakeRules?.consentFleaProof !== false;
}

/** ข้อความรับรองทางกฎหมาย — ร้านแก้เองได้ (ภาษาไทย) · ว่าง = ข้อความเริ่มต้น */
export function fleaLegalNote(cfg: WithRules, en: boolean): string {
  if (en) return FLEA_LEGAL_NOTE_EN;
  return cfg?.intakeRules?.fleaLegalNote?.trim() || FLEA_LEGAL_NOTE_TH;
}

/**
 * ข้อความรับรองทางกฎหมายของสมุดวัคซีน — ขึ้นในหน้าแนบสมุดวัคซีน (/app/pet-docs) และช่องแนบสมุดวัคซีนในหน้ากดยอมรับ
 * เปิดทุกร้านเป็นค่าเริ่มต้น · ปิดได้ intakeRules.vaccineLegal=false · แก้ข้อความ intakeRules.vaccineLegalNote (2026-11-27)
 */
export const VACCINE_LEGAL_NOTE_TH =
  "⚖️ การแนบรูปสมุดวัคซีนนี้ถือเป็นคำรับรองของผู้ปกครองว่าเป็นสมุดวัคซีนของน้องตัวนี้จริง และข้อมูลวัคซีนในรูปถูกต้อง ไม่ได้ปลอมแปลงหรือแก้ไข ระบบบันทึกวันเวลา บัญชี LINE และรูปที่แนบไว้เป็นข้อมูลอิเล็กทรอนิกส์ ซึ่งมีผลผูกพันและใช้เป็นพยานหลักฐานทางกฎหมายได้ตามพระราชบัญญัติว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544 หากภายหลังพบว่าไม่เป็นความจริง (เช่น น้องไม่ได้ฉีดวัคซีนตามที่แจ้ง แล้วเกิดการติดเชื้อระหว่างใช้บริการ) ผู้ปกครองยินยอมรับผิดชอบค่าใช้จ่ายและความเสียหายตามข้อตกลงของร้าน";

export const VACCINE_LEGAL_NOTE_EN =
  "⚖️ By attaching these vaccine book photos you certify that they are your pet's own vaccine book and that the vaccination details shown are true and have not been forged or altered. The date and time, your LINE account and the photos attached are recorded as electronic data, which is binding and admissible as legal evidence under Thailand's Electronic Transactions Act B.E. 2544 (2001). If this later proves untrue (for example, your pet was not vaccinated as stated and an infection occurs during the service), you agree to cover the costs and damages set out in the shop's terms.";

type WithVaccineRules = { intakeRules?: { vaccineLegal?: boolean; vaccineLegalNote?: string } } | null | undefined;

export function vaccineLegalOn(cfg: WithVaccineRules): boolean {
  return cfg?.intakeRules?.vaccineLegal !== false;
}

export function vaccineLegalNote(cfg: WithVaccineRules, en: boolean): string {
  if (en) return VACCINE_LEGAL_NOTE_EN;
  return cfg?.intakeRules?.vaccineLegalNote?.trim() || VACCINE_LEGAL_NOTE_TH;
}
