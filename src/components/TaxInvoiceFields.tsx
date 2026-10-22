"use client";

import type { TaxInvoiceForm, TaxInvoiceKind } from "@/lib/tax-invoice";

/**
 * ช่องติ๊ก "ขอบิล/ใบกำกับภาษีเต็มรูป" + ช่องกรอกที่โผล่เฉพาะตอนติ๊ก
 * ใช้ร่วมกันในหน้าสมัครสมาชิก หน้าแก้ไขข้อมูลลูกค้า และหลังบ้าน
 */
export function TaxInvoiceFields({
  value,
  onChange,
  fieldClass,
  prefill,
  requireAll,
}: {
  value: TaxInvoiceForm;
  onChange: (next: TaxInvoiceForm) => void;
  fieldClass: string;
  /** ข้อมูลผู้ปกครองที่กรอกไว้แล้ว — เติมให้ตอนเลือก "บุคคลธรรมดา" ถ้าช่องยังว่าง */
  prefill?: { name?: string; phone?: string; address?: string };
  /** หน้าสมัครสมาชิก: ติ๊กขอบิลแล้วต้องกรอกครบทุกช่อง (รวมเบอร์บริษัท) */
  requireAll?: boolean;
}) {
  const set = (patch: Partial<TaxInvoiceForm>) => onChange({ ...value, ...patch });
  const pickKind = (kind: TaxInvoiceKind) => {
    if (kind === value.kind) return;
    // เปลี่ยนประเภท: ล้างชื่อ/เลขภาษีของอีกแบบ เติมข้อมูลผู้ปกครองให้ถ้าเป็นบุคคลธรรมดา
    set({
      kind,
      name: kind === "person" ? prefill?.name?.trim() || "" : "",
      taxId: "",
      phone: value.phone || (kind === "person" ? prefill?.phone || "" : ""),
      address: value.address || (kind === "person" ? prefill?.address || "" : ""),
    });
  };
  const person = value.kind === "person";
  const label = "mb-1 block text-xs font-bold text-brown";
  const hint = "font-normal text-brown-faint";
  const chip = (on: boolean) =>
    `min-h-[40px] flex-1 rounded-full border px-3 text-xs font-extrabold ${
      on ? "border-petflow-chocolate bg-petflow-chocolate text-card" : "border-petflow-line bg-paper text-brown"
    }`;

  return (
    <div className="space-y-3">
      <label className="flex min-h-[44px] cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={value.on}
          onChange={(e) => set({ on: e.target.checked })}
          className="mt-0.5 h-5 w-5 shrink-0 accent-latte-deep"
        />
        <span className="text-sm font-bold text-brown">
          ต้องการใบกำกับภาษี / ออกบิลในนามนิติบุคคล
          <span className="block text-[11px] font-normal text-brown-faint">
            ไม่ต้องการก็ไม่ต้องติ๊ก — ติ๊กแล้วร้านจะใช้ข้อมูลนี้ออกบิลให้อัตโนมัติ
          </span>
        </span>
      </label>

      {value.on && (
        <div className="space-y-3 rounded-petflow-sm border border-dashed border-latte bg-paper/60 p-3">
          <div className="flex gap-2">
            <button type="button" onClick={() => pickKind("company")} className={chip(!person)}>
              นิติบุคคล
            </button>
            <button type="button" onClick={() => pickKind("person")} className={chip(person)}>
              บุคคลธรรมดา
            </button>
          </div>

          <label className="block">
            <span className={label}>{person ? "ชื่อ-นามสกุล" : "ชื่อบริษัท / นิติบุคคล"}</span>
            <input
              required={requireAll}
              value={value.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder={person ? "เช่น สมชาย ใจดี" : "เช่น บริษัท ตัวอย่าง จำกัด"}
              className={fieldClass}
            />
          </label>

          <label className="block">
            <span className={label}>
              เลขประจำตัวผู้เสียภาษี{" "}
              <span className={hint}>{person ? "(เลขบัตรประชาชน 13 หลัก)" : "(13 หลัก)"}</span>
            </span>
            <input
              required={requireAll}
              value={value.taxId}
              inputMode="numeric"
              onChange={(e) => set({ taxId: e.target.value.replace(/\D/g, "").slice(0, 13) })}
              placeholder="x-xxxx-xxxxx-xx-x"
              className={fieldClass}
            />
          </label>

          {!person && (
            <div>
              <span className={label}>สำนักงาน</span>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => set({ headOffice: true })} className={chip(value.headOffice)}>
                  สำนักงานใหญ่
                </button>
                <button type="button" onClick={() => set({ headOffice: false })} className={chip(!value.headOffice)}>
                  สาขา
                </button>
              </div>
              {!value.headOffice && (
                <input
                  required={requireAll}
                  value={value.branchNo}
                  inputMode="numeric"
                  onChange={(e) => set({ branchNo: e.target.value.replace(/\D/g, "").slice(0, 5) })}
                  placeholder="เลขสาขา 5 หลัก เช่น 00001"
                  className={`${fieldClass} mt-2`}
                />
              )}
            </div>
          )}

          <label className="block">
            <span className={label}>{person ? "ที่อยู่" : "ที่อยู่ตามทะเบียน"}</span>
            <textarea
              required={requireAll}
              value={value.address}
              onChange={(e) => set({ address: e.target.value })}
              rows={3}
              placeholder="บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
              className={fieldClass}
            />
          </label>

          <label className="block">
            <span className={label}>
              เบอร์โทร {!person && !requireAll && <span className={hint}>(ไม่บังคับ)</span>}
            </span>
            <input
              required={requireAll}
              type="tel"
              value={value.phone}
              onChange={(e) => set({ phone: e.target.value })}
              placeholder="08x-xxx-xxxx"
              className={fieldClass}
            />
          </label>
        </div>
      )}
    </div>
  );
}
