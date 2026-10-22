"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useConfig } from "@/components/ConfigProvider";
import { BirthdayPicker } from "@/components/BirthdayPicker";
import { StaffNoteTagPicker } from "@/components/StaffNoteTagPicker";
import { OTHER_BREED } from "@/lib/cat-breeds";
import { breedOptionsFor, petWords } from "@/lib/pet-kind";
import { REFERRAL_OPTIONS } from "@/lib/referral-options";

/** รายละเอียดน้องหนึ่งตัว — ช่องเดียวกับฟอร์มสมัครสมาชิกของลูกค้า (app/register) */
type PetForm = {
  key: number;
  name: string;
  gender: "" | "male" | "female";
  breed: string;
  breedOther: string;
  furLength: "" | "short" | "long";
  color: string;
  ageValue: string;
  ageUnit: "year" | "month";
  weightKg: string;
  birthday: string;
  medical: string;
  note: string;
};

let nextKey = 1;
function emptyPet(): PetForm {
  return {
    key: nextKey++,
    name: "",
    gender: "",
    breed: "",
    breedOther: "",
    furLength: "",
    color: "",
    ageValue: "",
    ageUnit: "year",
    weightKg: "",
    birthday: "",
    medical: "",
    note: "",
  };
}

const fieldCls =
  "mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-3 text-sm";
const labelCls = "block text-xs font-bold text-brown-soft";

function Toggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | "";
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-full bg-paper p-1">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`min-h-[40px] flex-1 rounded-full text-sm font-bold transition ${
            value === v ? "bg-card text-petflow-chocolate shadow-petflow-sm" : "text-brown-soft"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function AddCustomerModal({
  onAdded,
}: {
  onAdded: (customerId: string) => void;
}) {
  const { config } = useConfig();
  const pw = petWords(config);
  const breeds = breedOptionsFor(config);
  const referrals = config.options?.referralOptions?.length
    ? config.options.referralOptions
    : REFERRAL_OPTIONS;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [referral, setReferral] = useState("");
  const [address, setAddress] = useState("");
  const [addressMapUrl, setAddressMapUrl] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [pets, setPets] = useState<PetForm[]>(() => [emptyPet()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const close = () => {
    setOpen(false);
    setName("");
    setPhone("");
    setEmail("");
    setBirthday("");
    setReferral("");
    setAddress("");
    setAddressMapUrl("");
    setPostalCode("");
    setPets([emptyPet()]);
    setError("");
  };

  const updatePet = (idx: number, patch: Partial<PetForm>) =>
    setPets((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));

  const namedPets = pets.filter((p) => p.name.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || namedPets.length === 0) return;
    setSaving(true);
    setError("");

    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        birthday: birthday || undefined,
        referralSource: referral || undefined,
        address: address.trim() || undefined,
        addressMapUrl: addressMapUrl.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        cats: namedPets.map((p) => ({
          name: p.name,
          gender: p.gender || undefined,
          breed: (p.breed === OTHER_BREED ? p.breedOther.trim() : p.breed) || undefined,
          furLength: p.furLength || undefined,
          color: p.color || undefined,
          ageValue: p.ageValue || undefined,
          ageUnit: p.ageValue ? p.ageUnit : undefined,
          weightKg: p.weightKg || undefined,
          birthday: p.birthday || undefined,
          medical: p.medical || undefined,
          staffNote: p.note || undefined,
        })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (res.ok && data.customer?.id) {
      close();
      onAdded(data.customer.id);
    } else {
      setError(data.error || "บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-petflow-sm bg-gradient-to-r from-honey to-honey-deep py-3 text-sm font-extrabold text-petflow-chocolate shadow-petflow-sm"
      >
        <Icon name="plus" size={18} strokeWidth={2.2} />
        เพิ่มลูกค้าเอง
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-petflow bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-petflow sm:rounded-petflow">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
                <Icon name="user" size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">New customer</p>
                <h2 className="text-base font-extrabold text-petflow-chocolate">เพิ่มลูกค้าเอง</h2>
                <p className="mt-0.5 text-[11px] text-brown-soft">
                  บันทึกในระบบก่อน — แล้วส่งลิงก์ผูก LINE ให้ลูกค้าในหน้าโปรไฟล์
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="ปิด"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper text-brown"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              {/* ── ผู้ปกครอง ── */}
              <label className={labelCls}>
                ชื่อลูกค้า *
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น คุณมาย"
                  required
                  autoFocus
                  className={`${fieldCls} font-bold`}
                />
              </label>
              <label className={labelCls}>
                เบอร์โทร
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                  placeholder="08x-xxx-xxxx"
                  className={fieldCls}
                />
              </label>
              <label className={labelCls}>
                อีเมล (ถ้ามี)
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="name@example.com"
                  className={fieldCls}
                />
              </label>
              <div className={labelCls}>
                วันเกิดลูกค้า (ถ้าทราบ)
                <div className="mt-1">
                  <BirthdayPicker value={birthday} onChange={setBirthday} yearsBack={90} />
                </div>
              </div>
              <label className={labelCls}>
                รู้จักร้านจากทางไหน (ถ้าทราบ)
                <select
                  value={referral}
                  onChange={(e) => setReferral(e.target.value)}
                  className={fieldCls}
                >
                  <option value="">ไม่ระบุ</option>
                  {referrals.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>

              {/* ── น้อง (เพิ่มได้หลายตัว) ── */}
              {pets.map((pet, idx) => (
                <fieldset
                  key={pet.key}
                  className="space-y-2.5 rounded-petflow-sm border border-petflow-line p-3"
                >
                  <legend className="px-1 text-xs font-extrabold text-petflow-chocolate">
                    {pw.emoji} น้อง{pw.th}
                    {pets.length > 1 ? ` ตัวที่ ${idx + 1}` : ""}
                  </legend>
                  <label className={labelCls}>
                    ชื่อน้อง{pw.th} {idx === 0 && "*"}
                    <input
                      value={pet.name}
                      onChange={(e) => updatePet(idx, { name: e.target.value })}
                      placeholder="เช่น น้องจู๊ด"
                      required={idx === 0}
                      className={`${fieldCls} font-bold`}
                    />
                  </label>
                  <Toggle
                    value={pet.gender}
                    onChange={(gender) => updatePet(idx, { gender })}
                    options={[
                      ["male", "♂ ผู้"],
                      ["female", "♀ เมีย"],
                    ]}
                  />
                  <label className={labelCls}>
                    สายพันธุ์
                    <select
                      value={pet.breed}
                      onChange={(e) => updatePet(idx, { breed: e.target.value })}
                      className={fieldCls}
                    >
                      <option value="">เลือกสายพันธุ์…</option>
                      {breeds.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                      <option value={OTHER_BREED}>{OTHER_BREED}</option>
                    </select>
                  </label>
                  {pet.breed === OTHER_BREED && (
                    <input
                      value={pet.breedOther}
                      onChange={(e) => updatePet(idx, { breedOther: e.target.value })}
                      placeholder="ระบุสายพันธุ์"
                      className={fieldCls}
                    />
                  )}
                  <div className={labelCls}>
                    ลักษณะขน
                    <div className="mt-1">
                      <Toggle
                        value={pet.furLength}
                        onChange={(furLength) => updatePet(idx, { furLength })}
                        options={[
                          ["short", "ขนสั้น"],
                          ["long", "ขนยาว"],
                        ]}
                      />
                    </div>
                  </div>
                  <label className={labelCls}>
                    สี/ลักษณะเด่น
                    <input
                      value={pet.color}
                      onChange={(e) => updatePet(idx, { color: e.target.value })}
                      placeholder="เช่น สีขาวสลับดำ มีจุดที่หู"
                      className={fieldCls}
                    />
                  </label>
                  <div className="flex gap-2">
                    <label className={`${labelCls} min-w-0 flex-1`}>
                      อายุ
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={pet.ageValue}
                        onChange={(e) => updatePet(idx, { ageValue: e.target.value })}
                        className={fieldCls}
                      />
                    </label>
                    <label className={`${labelCls} w-24 shrink-0`}>
                      หน่วย
                      <select
                        value={pet.ageUnit}
                        onChange={(e) =>
                          updatePet(idx, { ageUnit: e.target.value as "year" | "month" })
                        }
                        className={fieldCls}
                      >
                        <option value="year">ปี</option>
                        <option value="month">เดือน</option>
                      </select>
                    </label>
                  </div>
                  <label className={labelCls}>
                    น้ำหนัก (กก.)
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      inputMode="decimal"
                      value={pet.weightKg}
                      onChange={(e) => updatePet(idx, { weightKg: e.target.value })}
                      placeholder="เช่น 4.5"
                      className={fieldCls}
                    />
                  </label>
                  <div className={labelCls}>
                    วันเกิดน้อง (ถ้าทราบ)
                    <div className="mt-1">
                      <BirthdayPicker
                        value={pet.birthday}
                        onChange={(iso) => updatePet(idx, { birthday: iso })}
                        yearsBack={25}
                      />
                    </div>
                  </div>
                  <StaffNoteTagPicker
                    medicalValue={pet.medical}
                    noteValue={pet.note}
                    onChange={(medical, note) => updatePet(idx, { medical, note })}
                  />
                  {pets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPets((prev) => prev.filter((_, i) => i !== idx))}
                      className="-ml-1 flex min-h-[44px] items-center gap-1.5 px-1 text-xs font-bold text-brown-soft"
                    >
                      <Icon name="trash" size={15} />
                      ลบน้อง{pw.th}ตัวนี้
                    </button>
                  )}
                </fieldset>
              ))}
              <button
                type="button"
                onClick={() => setPets((prev) => [...prev, emptyPet()])}
                className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-petflow-sm border border-dashed border-petflow-line py-3 text-sm font-bold text-petflow-chocolate"
              >
                <Icon name="plus" size={16} strokeWidth={2.2} />
                เพิ่มน้อง{pw.th}อีกตัว
              </button>

              {/* ── ที่อยู่ ── */}
              <label className={labelCls}>
                ที่อยู่ (ถ้ามี — ใช้ตอนรับ-ส่งน้อง)
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="บ้านเลขที่ ซอย ถนน เขต"
                  rows={2}
                  className={`${fieldCls} py-2.5`}
                />
              </label>
              <label className={labelCls}>
                รหัสไปรษณีย์ (ถ้ามี)
                <input
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="เช่น 10110"
                  className={fieldCls}
                />
              </label>
              <label className={labelCls}>
                ลิงก์ Google Maps (ถ้ามี)
                <input
                  value={addressMapUrl}
                  onChange={(e) => setAddressMapUrl(e.target.value)}
                  placeholder="วางลิงก์ที่ลูกค้าแชร์มา"
                  className={fieldCls}
                />
              </label>
              {error && <p className="text-xs font-bold text-wait">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={close}
                  className="min-h-[44px] flex-1 rounded-petflow-sm bg-paper py-3 text-sm font-bold text-brown-soft"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving || !name.trim() || namedPets.length === 0}
                  className="flex min-h-[44px] flex-[2] items-center justify-center gap-1.5 rounded-petflow-sm bg-petflow-chocolate py-3 text-sm font-extrabold text-card shadow-petflow-sm disabled:opacity-50"
                >
                  {!saving && <Icon name="check" size={16} strokeWidth={2.4} />}
                  {saving ? "กำลังบันทึก…" : "บันทึก"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
