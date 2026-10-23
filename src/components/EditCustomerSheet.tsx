"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Toast";
import type { CustomerRecord } from "@/lib/customers-store";
import { TaxInvoiceFields } from "@/components/TaxInvoiceFields";
import {
  formToTaxInvoice,
  taxInvoiceProblem,
  taxInvoiceToForm,
  type TaxInvoiceForm,
} from "@/lib/tax-invoice";

const inputCls =
  "mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-3 text-sm outline-none transition focus:border-latte-deep focus:bg-card";

/** แผ่นแก้ไขข้อมูลลูกค้า — กรอกทุกช่องในที่เดียว แล้วกดบันทึกครั้งเดียว */
export function EditCustomerSheet({
  customer,
  onClose,
  onSaved,
}: {
  customer: CustomerRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: customer.name || "",
    phone: customer.phone || "",
    email: customer.email || "",
    birthday: customer.birthday || "",
    address: customer.address || "",
    addressMapUrl: customer.addressMapUrl || "",
    postalCode: customer.postalCode || "",
    referralSource: customer.referralSource || "",
  });
  const [taxInvoice, setTaxInvoice] = useState<TaxInvoiceForm>(() => taxInvoiceToForm(customer.taxInvoice));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setError("กรอกชื่อลูกค้า");
      return;
    }
    const taxProblem = taxInvoiceProblem(formToTaxInvoice(taxInvoice));
    if (taxProblem) {
      setError(taxProblem);
      return;
    }
    setSaving(true);
    setError("");
    // ช่องที่ลบจนว่าง = ล้างค่า (ส่ง "" ไป ระบบเก็บเป็น null)
    const patch = {
      name,
      phone: form.phone.trim(),
      email: form.email.trim(),
      birthday: form.birthday,
      address: form.address.trim(),
      addressMapUrl: form.addressMapUrl.trim(),
      postalCode: form.postalCode.trim(),
      referralSource: form.referralSource.trim(),
      taxInvoice: formToTaxInvoice(taxInvoice),
    };
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: customer.id, action: "update_customer", patch }),
    }).catch(() => null);
    setSaving(false);
    if (res && !res.ok) {
      const d = await res.json().catch(() => ({}));
      if (d.error) return setError(String(d.error));
    }
    if (res?.ok) {
      toast("บันทึกข้อมูลลูกค้าแล้ว", "success");
      onSaved();
      onClose();
    } else {
      setError("บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-petflow bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-petflow sm:rounded-petflow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
            <Icon name="edit" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Edit customer</p>
            <h2 className="text-base font-extrabold text-petflow-chocolate">แก้ไขข้อมูลลูกค้า</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper text-brown"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-xs font-bold text-brown-soft">
            ชื่อที่ใช้ในร้าน *
            <input
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              placeholder="เช่น คุณแม่น้องมะลิ"
              required
              className={`${inputCls} font-bold text-brown`}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-bold text-brown-soft">
              เบอร์โทร
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone")(e.target.value)}
                placeholder="08x-xxx-xxxx"
                className={inputCls}
              />
            </label>
            <label className="block text-xs font-bold text-brown-soft">
              วันเกิด
              <input
                type="date"
                value={form.birthday}
                onChange={(e) => set("birthday")(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
          <label className="block text-xs font-bold text-brown-soft">
            อีเมล
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email")(e.target.value)}
              placeholder="customer@email.com"
              className={inputCls}
            />
          </label>
          <label className="block text-xs font-bold text-brown-soft">
            ที่อยู่ (บริการรับ-ส่ง)
            <textarea
              value={form.address}
              onChange={(e) => set("address")(e.target.value)}
              placeholder="บ้านเลขที่ ซอย ถนน แขวง/ตำบล เขต/อำเภอ"
              rows={2}
              className={inputCls}
            />
          </label>
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <label className="block text-xs font-bold text-brown-soft">
              ลิงก์ Google Maps
              <input
                value={form.addressMapUrl}
                onChange={(e) => set("addressMapUrl")(e.target.value)}
                placeholder="วางลิงก์ที่ลูกค้าแชร์มา"
                className={inputCls}
              />
            </label>
            <label className="block text-xs font-bold text-brown-soft">
              รหัสไปรษณีย์
              <input
                value={form.postalCode}
                onChange={(e) => set("postalCode")(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
                inputMode="numeric"
                placeholder="10260"
                className={inputCls}
              />
            </label>
          </div>
          <label className="block text-xs font-bold text-brown-soft">
            รู้จักร้านจาก
            <input
              value={form.referralSource}
              onChange={(e) => set("referralSource")(e.target.value)}
              placeholder="เช่น Facebook, เพื่อนแนะนำ"
              className={inputCls}
            />
          </label>
          <div className="rounded-petflow-sm border border-petflow-line p-3 empty:hidden">
            <TaxInvoiceFields
              value={taxInvoice}
              onChange={setTaxInvoice}
              fieldClass={inputCls}
              prefill={{ name: form.name, phone: form.phone, address: form.address }}
            />
          </div>
          {error && <p className="text-xs font-bold text-wait">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] flex-1 rounded-petflow-sm bg-paper py-3 text-sm font-bold text-brown-soft"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="flex min-h-[44px] flex-[2] items-center justify-center gap-1.5 rounded-petflow-sm bg-petflow-chocolate py-3 text-sm font-extrabold text-card shadow-petflow-sm disabled:opacity-50"
            >
              {!saving && <Icon name="check" size={16} strokeWidth={2.4} />}
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
