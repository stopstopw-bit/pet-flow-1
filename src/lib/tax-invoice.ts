/**
 * ข้อมูล "ออกบิล/ใบกำกับภาษีเต็มรูป" ของลูกค้า — ลูกค้าติ๊กเองตอนสมัคร/แก้โปรไฟล์ หรือร้านกรอกให้ในหลังบ้าน
 * ออกได้ทั้งในนามนิติบุคคล (บริษัท/หจก.) และบุคคลธรรมดา (ชื่อ-สกุล + เลขบัตรประชาชน)
 * ใช้เติมผู้ซื้อบนใบเสร็จ/ใบกำกับภาษีให้อัตโนมัติ (รูปแบบเดียวกับ DocBuyer ของเอกสาร)
 * ไฟล์นี้ใช้ได้ทั้งฝั่งหน้าเว็บและเซิร์ฟเวอร์ — ห้าม import ของฝั่งเซิร์ฟเวอร์
 */
export type TaxInvoiceKind = "company" | "person";

export type CustomerTaxInvoice = {
  kind: TaxInvoiceKind;
  /** ชื่อบริษัทตามทะเบียน หรือ ชื่อ-นามสกุล (บุคคลธรรมดา) */
  name: string;
  /** เลขประจำตัวผู้เสียภาษี 13 หลัก (บุคคลธรรมดา = เลขบัตรประชาชน) เก็บเฉพาะตัวเลข */
  taxId: string;
  /** นิติบุคคลเท่านั้น: "สำนักงานใหญ่" หรือ "สาขา 00001" */
  branch?: string;
  /** ที่อยู่ตามทะเบียน / ตามบัตร */
  address: string;
  phone?: string;
  /** ลูกค้าสมัคร/ถูกเพิ่มในนามนิติบุคคล (ตัวลูกค้าคือบริษัท ไม่ใช่แค่ขอบิลในนามบริษัท) */
  account?: boolean;
};

/** ค่าในฟอร์ม (ระหว่างพิมพ์) */
export type TaxInvoiceForm = {
  on: boolean;
  kind: TaxInvoiceKind;
  name: string;
  taxId: string;
  headOffice: boolean;
  branchNo: string;
  address: string;
  phone: string;
  /** สมัครในนามนิติบุคคล — คงไว้ตอนแก้ข้อมูล */
  account?: boolean;
};

export const HEAD_OFFICE = "สำนักงานใหญ่";

export function emptyTaxInvoiceForm(kind: TaxInvoiceKind = "company"): TaxInvoiceForm {
  return { on: false, kind, name: "", taxId: "", headOffice: true, branchNo: "", address: "", phone: "" };
}

export function taxInvoiceToForm(t: CustomerTaxInvoice | null | undefined): TaxInvoiceForm {
  if (!t) return emptyTaxInvoiceForm();
  const m = /(\d{1,5})/.exec(t.branch || "");
  const head = !t.branch || t.branch.includes(HEAD_OFFICE) || !m;
  return {
    on: true,
    kind: t.kind === "person" ? "person" : "company",
    name: t.name || "",
    taxId: t.taxId || "",
    headOffice: head,
    branchNo: head || !m ? "" : m[1],
    address: t.address || "",
    phone: t.phone || "",
    ...(t.account ? { account: true } : {}),
  };
}

/** ฟอร์ม → ค่าที่ส่งไปเซิร์ฟเวอร์ (null = ไม่ต้องการ) */
export function formToTaxInvoice(f: TaxInvoiceForm): CustomerTaxInvoice | null {
  if (!f.on) return null;
  const out: CustomerTaxInvoice = {
    kind: f.kind,
    name: f.name.trim(),
    taxId: f.taxId.replace(/\D/g, ""),
    address: f.address.trim(),
  };
  if (f.kind === "company") {
    out.branch = f.headOffice ? HEAD_OFFICE : `สาขา ${f.branchNo.replace(/\D/g, "").padStart(5, "0")}`;
  }
  const phone = f.phone.trim();
  if (phone) out.phone = phone;
  if (f.kind === "company" && f.account) out.account = true;
  return out;
}

/** ข้อความเตือนถ้ากรอกไม่ครบ (ภาษาไทย) — ไม่มีปัญหาคืน "" */
export function taxInvoiceProblem(t: CustomerTaxInvoice | null | undefined): string {
  if (!t) return "";
  const person = t.kind === "person";
  if (!t.name) return person ? "กรอกชื่อ-นามสกุลสำหรับออกบิลด้วยนะคะ" : "กรอกชื่อบริษัท/นิติบุคคลสำหรับออกบิลด้วยนะคะ";
  if (person && t.name.trim().split(/\s+/).length < 2) return "กรอกทั้งชื่อและนามสกุล (เว้นวรรค) สำหรับออกบิลนะคะ";
  if (!/^\d{13}$/.test(t.taxId)) return "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลักค่ะ";
  if (!person && t.branch !== HEAD_OFFICE && (!/^สาขา \d{5}$/.test(t.branch || "") || t.branch === "สาขา 00000"))
    return "กรอกเลขสาขา (5 หลัก) ด้วยนะคะ";
  if (!t.address) return person ? "กรอกที่อยู่สำหรับออกบิลด้วยนะคะ" : "กรอกที่อยู่ตามทะเบียนของบริษัทด้วยนะคะ";
  if (person && (t.phone || "").replace(/\D/g, "").length < 9) return "กรอกเบอร์โทรสำหรับออกบิลด้วยนะคะ";
  return "";
}

function clean(o: Record<string, unknown>): CustomerTaxInvoice {
  const s = (k: string, max: number) => String(o[k] ?? "").trim().slice(0, max);
  const kind: TaxInvoiceKind = o.kind === "person" ? "person" : "company";
  const out: CustomerTaxInvoice = {
    kind,
    name: s("name", 200).replace(/\s+/g, " "),
    taxId: s("taxId", 30).replace(/\D/g, ""),
    address: s("address", 500),
  };
  if (kind === "company") {
    const raw = s("branch", 40);
    const no = /(\d{1,5})/.exec(raw)?.[1];
    out.branch = !raw || raw.includes(HEAD_OFFICE) || !no ? HEAD_OFFICE : `สาขา ${no.padStart(5, "0")}`;
  }
  const phone = s("phone", 30);
  if (phone) out.phone = phone;
  if (kind === "company" && o.account === true) out.account = true;
  return out;
}

/**
 * ค่าจาก body ของ API → ค่าที่เก็บได้
 * undefined = ไม่ได้ส่งมา (คงค่าเดิม), null = ปิด/ลบ, object = ค่าที่ผ่านการตรวจแล้ว
 * คืน { error } ถ้าเปิดไว้แต่กรอกไม่ครบ
 */
export function parseTaxInvoiceBody(
  v: unknown
): { value: CustomerTaxInvoice | null | undefined; error?: string } {
  if (v === undefined) return { value: undefined };
  if (v === null || typeof v !== "object") return { value: null };
  const value = clean(v as Record<string, unknown>);
  const error = taxInvoiceProblem(value);
  return error ? { value: undefined, error } : { value };
}

/** อ่านค่าจากคอลัมน์ jsonb — ข้อมูลเสีย/ว่าง = ไม่มี */
export function taxInvoiceFromRow(v: unknown): CustomerTaxInvoice | undefined {
  if (!v || typeof v !== "object") return undefined;
  const t = clean(v as Record<string, unknown>);
  return t.name ? t : undefined;
}
