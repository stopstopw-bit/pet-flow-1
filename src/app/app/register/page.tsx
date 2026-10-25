"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLiff } from "@/components/LiffProvider";
import { useConfig } from "@/components/ConfigProvider";
import { BirthdayPicker } from "@/components/BirthdayPicker";
import { BTN_PRIMARY, PageHeader } from "@/components/PageHeader";
import { SectionLabel } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { LoadingScreen } from "@/components/LoadingScreen";
import { toJpegDataUrl } from "@/lib/image-convert";
import { AccountTypeFields, TaxInvoiceFields, companyContactProblem } from "@/components/TaxInvoiceFields";
import {
  emptyTaxInvoiceForm,
  formToTaxInvoice,
  taxInvoiceProblem,
  type TaxInvoiceForm,
} from "@/lib/tax-invoice";

type CatGender = "male" | "female";
type CatInput = {
  name: string;
  /** หมา/แมว — ถามเฉพาะร้านที่รับทั้งสองแบบ */
  species: PetSpecies | "";
  gender?: CatGender;
  breed: string;
  breedOther: string;
  furLength: "" | "short" | "long";
  neutered: "" | "yes" | "no";
  color: string;
  ageValue: string;
  ageUnit: "year" | "month";
  /** น้ำหนัก (กก.) — เก็บเป็นข้อความระหว่างพิมพ์ */
  weightKg: string;
  /** ลูกค้าติ๊ก "ไม่ทราบน้ำหนัก" — ไม่ต้องกรอกช่องน้ำหนัก */
  weightUnknown: boolean;
  /** ลูกค้าติ๊ก "ไม่ทราบอายุ/วันเกิด" — ไม่ต้องกรอกอายุ */
  ageUnknown: boolean;
  birthday: string;
  medical: string;
  seizureHistory: string;
  allergy: string;
  note: string;
  /** รูปน้อง (JPEG data URL) — อัปขึ้นหลังสมัครเสร็จ เพราะต้องรู้ id แมวก่อน */
  photo?: string;
  /** คำตอบประวัติน้อง (ร้านเปิดให้หน้าสมัครถามประวัติ) */
  history: IntakeAnswers;
};

import { OTHER_BREED } from "@/lib/cat-breeds";
import { REFERRAL_OPTIONS } from "@/lib/referral-options";
import { asksSpecies, breedOptionsForSpecies, petKindOf, petWords, speciesWords, type PetSpecies } from "@/lib/pet-kind";
import { registerHistoryFields, type IntakeAnswers } from "@/lib/intake-rules";
import { IntakeFieldsInput, intakeAnswerEmpty } from "@/components/IntakeFieldsInput";
import { SpeciesPicker } from "@/components/SpeciesPicker";
import { isFeatureOn } from "@/lib/features";
import { referralReward } from "@/lib/referral";
import { StaffNoteTagPicker } from "@/components/StaffNoteTagPicker";
import { customerFetch } from "@/lib/customer-fetch";

function emptyCat(): CatInput {
  return {
    name: "",
    species: "",
    breed: "",
    breedOther: "",
    furLength: "",
    neutered: "",
    color: "",
    ageValue: "",
    ageUnit: "year",
    weightKg: "",
    weightUnknown: false,
    ageUnknown: false,
    birthday: "",
    medical: "",
    seizureHistory: "",
    allergy: "",
    note: "",
    history: {},
  };
}

export default function RegisterPage() {
  const router = useRouter();
  const { profile, ready, customer, refreshCustomer, refreshAccount } = useLiff();
  const { config } = useConfig();
  const referralOn = isFeatureOn(config, "referral");
  const pw = petWords(config);
  const askSpecies = asksSpecies(config);
  const referrals = config.options?.referralOptions?.length
    ? config.options.referralOptions
    : REFERRAL_OPTIONS;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [referral, setReferral] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [consent, setConsent] = useState(true);
  const [taxInvoice, setTaxInvoice] = useState<TaxInvoiceForm>(() => emptyTaxInvoiceForm("person"));
  // สมัครในนามนิติบุคคล — ข้อมูลบริษัท + ผู้ติดต่อใช้ข้อมูลเดียวกับบริษัทไหม
  const [isCompany, setIsCompany] = useState(false);
  const [company, setCompany] = useState<TaxInvoiceForm>(() => ({
    ...emptyTaxInvoiceForm("company"),
    on: true,
    account: true,
  }));
  const [sameContact, setSameContact] = useState(true);
  const useCompanyContact = isCompany && sameContact;
  const [cats, setCats] = useState<CatInput[]>([emptyCat()]);
  /** ประวัติที่ร้านให้ถามตอนสมัคร — ตามชนิดของน้องแต่ละตัว (ร้านแมวไม่มีฟอร์มนี้ = ไม่ถาม) */
  const historyFor = (c: CatInput) => registerHistoryFields(c.species || petKindOf(config), config);
  const ownerHistory = cats.map(historyFor).find((h) => h && h.owner.length > 0)?.owner || [];
  const [ownerAnswers, setOwnerAnswers] = useState<IntakeAnswers>({});
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [referralCode, setReferralCode] = useState("");
  // ติ๊ก "มีโค้ดเพื่อนแนะนำ" แล้วค่อยโชว์ช่องกรอก — มาจากลิงก์ชวนจะติ๊ก + เติมโค้ดให้เอง
  const [hasReferralCode, setHasReferralCode] = useState(false);
  const [fromLink, setFromLink] = useState(false);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) {
      setReferralCode(ref.toUpperCase());
      setHasReferralCode(true);
      setFromLink(true);
    }
  }, []);

  useEffect(() => {
    if (!customer) return;
    // ชื่อผู้ปกครอง: เว้นว่างให้กรอกเอง (ไม่ดึงชื่อ LINE มาใส่)
    // เบอร์เดิมช่วยเติมให้ ถ้าเคยมีในระบบ
    setPhone((prev) => prev || customer.phone || "");
  }, [customer]);

  const addCat = () => setCats((prev) => [...prev, emptyCat()]);

  const updateCat = (idx: number, patch: Partial<CatInput>) => {
    setCats((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const pickPhoto = async (idx: number, file: File | undefined) => {
    if (!file) return;
    try {
      updateCat(idx, { photo: await toJpegDataUrl(file) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "เปิดไฟล์รูปนี้ไม่ได้ — ลองเลือกรูปอื่นนะคะ");
    }
  };

  const removeCat = (idx: number) => {
    if (cats.length <= 1) return;
    setCats((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.lineUserId) return;
    setAttempted(true);

    // บังคับกรอกให้ครบทุกช่อง (ยกเว้นรูป/สี/อายุ/วันเกิดน้อง/โรคประจำตัว) — ไม่อยากได้ตัวไหนให้กดลบออก
    const catProblem = (c: CatInput, n: string): string => {
      if (askSpecies && !c.species) return `เลือกว่าน้อง${n}เป็นหมาหรือแมวด้วยนะคะ`;
      const pw = speciesWords(c.species || undefined, config);
      if (!c.name.trim()) return `กรอกชื่อน้อง${pw.th}${n}ด้วยนะคะ`;
      if (!c.gender) return `เลือกเพศน้อง${pw.th}${n}ด้วยนะคะ ${pw.emoji}`;
      if (!c.breed || (c.breed === OTHER_BREED && !c.breedOther.trim()))
        return `เลือกสายพันธุ์น้อง${pw.th}${n}ด้วยนะคะ`;
      if (!c.furLength) return `เลือกลักษณะขนน้อง${pw.th}${n}ด้วยนะคะ`;
      if (!c.neutered) return `เลือกว่าน้อง${pw.th}${n}ทำหมันแล้วหรือยังด้วยนะคะ`;
      if (!c.weightUnknown && !(Number(c.weightKg) > 0))
        return `กรอกน้ำหนักน้อง${pw.th}${n} หรือติ๊ก "ไม่ทราบ" ด้วยนะคะ`;
      const h = historyFor(c);
      if (h) {
        const miss = h.pet.find((f) => f.required && intakeAnswerEmpty(c.history[f.key]));
        if (miss) return `ตอบ "${miss.label.split(" — ")[0]}" ของน้อง${pw.th}${n}ด้วยนะคะ`;
      }
      return "";
    };
    const ownerMiss = ownerHistory.find((f) => f.required && intakeAnswerEmpty(ownerAnswers[f.key]));
    if (ownerMiss) {
      setError(`กรอก "${ownerMiss.label.split(" — ")[0]}" ด้วยนะคะ`);
      return;
    }
    for (let i = 0; i < cats.length; i++) {
      const problem = catProblem(cats[i], cats.length > 1 ? ` ตัวที่ ${i + 1}` : "");
      if (problem) {
        setError(problem);
        return;
      }
    }
    if (!/^\d{5}$/.test(postalCode)) {
      setError("กรอกรหัสไปรษณีย์ 5 หลักด้วยนะคะ");
      return;
    }
    if (!referral) {
      setError("เลือกช่องทางที่รู้จักเราด้วยนะคะ");
      return;
    }
    if (referralOn && hasReferralCode && !referralCode.trim()) {
      setError("กรอกโค้ดเพื่อนแนะนำ หรือเอาติ๊กออกถ้าไม่มีโค้ดนะคะ");
      return;
    }
    const billing = formToTaxInvoice(isCompany ? company : taxInvoice);
    const taxProblem =
      taxInvoiceProblem(billing) || (isCompany ? companyContactProblem(company, sameContact) : "");
    if (taxProblem) {
      setError(taxProblem);
      return;
    }
    // สมัครสมาชิกต้องกรอกครบทุกช่อง — เบอร์บริษัทก็ต้องมี
    if (billing && (billing.phone || "").replace(/\D/g, "").length < 9) {
      setError("กรอกเบอร์โทรสำหรับออกบิลด้วยนะคะ");
      return;
    }
    // นิติบุคคล + ผู้ติดต่อใช้ข้อมูลเดียวกัน → ชื่อ/เบอร์/ที่อยู่ลูกค้า = ของบริษัท
    const contact = useCompanyContact
      ? { name: company.name.trim(), phone: company.phone.trim(), address: company.address.trim() }
      : { name, phone, address: undefined };

    setSaving(true);
    setError("");

    try {
      const res = await customerFetch("/api/customers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId: profile.lineUserId,
          name: contact.name,
          phone: contact.phone,
          address: contact.address,
          email: ownerHistory.length ? undefined : email,
          birthday: isCompany ? undefined : birthday,
          referralSource: referral,
          referralCode: (referralOn && hasReferralCode && referralCode.trim()) || undefined,
          postalCode: postalCode || undefined,
          taxInvoice: billing || undefined,
          marketingConsent: consent,
          cats: cats
            .filter((c) => c.name.trim())
            .map((c) => ({
              name: c.name,
              species: c.species || undefined,
              gender: c.gender,
              breed:
                (c.breed === OTHER_BREED ? c.breedOther.trim() : c.breed) ||
                undefined,
              ageValue: !c.ageUnknown && c.ageValue ? Number(c.ageValue) : undefined,
              ageUnit: !c.ageUnknown && c.ageValue ? c.ageUnit : undefined,
              weightKg: !c.weightUnknown && c.weightKg ? Number(c.weightKg) : undefined,
              birthday: (!c.ageUnknown && c.birthday) || undefined,
              medical: c.medical || undefined,
              seizureHistory: c.seizureHistory.trim() || undefined,
              allergy: c.allergy.trim() || undefined,
              furLength: c.furLength || undefined,
              neutered: c.neutered ? c.neutered === "yes" : undefined,
              color: c.color || undefined,
              staffNote: c.note || undefined,
              history: historyFor(c) ? { ...ownerAnswers, ...c.history } : undefined,
            })),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "ลงทะเบียนไม่สำเร็จ — ลองใหม่อีกครั้งนะคะ");
        return;
      }

      // รูปน้อง: ต้องรู้ id แมวจากผลสมัครก่อน แล้วค่อยอัปทีละตัว (อัปไม่ผ่านก็ไม่ขวางการสมัคร
      // ลูกค้าเพิ่มรูปทีหลังได้ที่หน้าโปรไฟล์)
      const savedCats: { id: string; name: string }[] = data.customer?.cats || [];
      const used = new Set<string>();
      for (const c of cats) {
        if (!c.photo) continue;
        const match = [...savedCats]
          .reverse()
          .find((sc) => !used.has(sc.id) && sc.name.trim() === c.name.trim());
        if (!match) continue;
        used.add(match.id);
        await customerFetch("/api/customers/cat-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ catId: match.id, photoDataUrl: c.photo }),
        }).catch(() => null);
      }

      await refreshCustomer();
      await refreshAccount();
      router.replace("/app");
    } catch {
      setError(
        "เชื่อมต่อไม่สำเร็จ — เช็คสัญญาณอินเทอร์เน็ตแล้วลองกดบันทึกอีกครั้งนะคะ"
      );
    } finally {
      setSaving(false);
    }
  };

  if (!ready) {
    return <LoadingScreen message="กำลังเชื่อมต่อ LINE…" />;
  }

  const fieldClass =
    "min-h-[44px] w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm";
  const subFieldClass =
    "min-h-[44px] w-full rounded-xl border border-petflow-line bg-paper px-3 py-2 text-sm";

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader
        eyebrow="Sign up"
        title="สมัครสมาชิก เพื่อรับสิทธิพิเศษ"
        subtitle="กรอกข้อมูลครั้งเดียว — ใช้ยืนยันนัด แต้มสะสม และโปรโมชั่น"
        back="/app"
        backLabel="กลับหน้าแรก"
        showLang={false}
      />

      {fromLink && referralOn && (
        <div className="mb-4 flex items-start gap-2 rounded-petflow border border-honey/50 bg-honey/20 px-4 py-3 text-xs font-extrabold text-petflow-chocolate">
          <Icon name="gift" size={16} className="mt-px" />
          <span>สมัครผ่านเพื่อนแนะนำ — สมัครเสร็จรับคูปองส่วนลด <span className="text-latte-deep">{referralReward(config).amount}฿</span> ทั้งคุณและเพื่อนทันที!</span>
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        {/* ── ข้อมูลผู้ปกครอง ── */}
        <section>
        <SectionLabel>Owner · ข้อมูลผู้ปกครอง</SectionLabel>
        <div className="space-y-3 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
        <AccountTypeFields
          isCompany={isCompany}
          onIsCompany={setIsCompany}
          company={company}
          onCompany={setCompany}
          sameContact={sameContact}
          onSameContact={setSameContact}
          fieldClass={fieldClass}
          requireAll
        />

        {!useCompanyContact && (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-brown">
                {isCompany ? "ชื่อผู้ติดต่อ" : ownerHistory.length ? "ชื่อจริง-นามสกุล" : "ชื่อผู้ปกครอง"}{" "}
                {!ownerHistory.length && (
                  <span className="font-normal text-brown-faint">
                    (ชื่อเล่นหรือชื่อจริงก็ได้นะคะ)
                  </span>
                )}
              </span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={ownerHistory.length ? "เช่น สมใจ ใจดี" : "เช่น คุณมาย"}
                className={fieldClass}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-bold text-brown">
                {isCompany ? "เบอร์ผู้ติดต่อ" : ownerHistory.length ? "เบอร์หลัก" : "เบอร์โทร"}
              </span>
              <input
                required
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="08x-xxx-xxxx"
                className={fieldClass}
              />
            </label>
          </>
        )}

        {ownerHistory.length > 0 && (
          <div className="space-y-3">
            <IntakeFieldsInput
              fields={ownerHistory}
              answers={ownerAnswers}
              onChange={(k, v) => setOwnerAnswers((a) => ({ ...a, [k]: v }))}
              showMissing={attempted}
              inputClass={fieldClass}
            />
          </div>
        )}

        {/* ร้านที่ถามประวัติตอนสมัคร (เช่น Back Home) ไม่ขออีเมล — ลิสต์ของร้านไม่มี */}
        {/* จอมือถือ: อีเมล/วันเกิดคนละแถว — วางคู่กันแล้วช่องวัน/เดือน/ปีแคบจนอ่านไม่ออก */}
        <div className={isCompany || ownerHistory.length ? "" : "grid gap-3 sm:grid-cols-2"}>
          {!ownerHistory.length && (
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-brown">อีเมล</span>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className={fieldClass}
              />
            </label>
          )}
          {!isCompany && (
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-brown">
                วันเกิดผู้ปกครอง
              </span>
              <BirthdayPicker
                required
                value={birthday}
                onChange={setBirthday}
                yearsBack={90}
              />
            </label>
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-brown">
            รหัสไปรษณีย์
          </span>
          <input
            required
            pattern="[0-9]{5}"
            value={postalCode}
            onChange={(e) =>
              setPostalCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))
            }
            inputMode="numeric"
            placeholder="เช่น 10540"
            className={fieldClass}
          />
        </label>

        {!isCompany && (
          <div className="border-t border-petflow-line pt-3 empty:hidden">
            <TaxInvoiceFields
              value={taxInvoice}
              onChange={setTaxInvoice}
              fieldClass={fieldClass}
              prefill={{ name, phone }}
              kinds={["person"]}
              requireAll
            />
          </div>
        )}
        </div>
        </section>

        {/* ── น้องแมว ── */}
        <section>
          <SectionLabel>{`My ${pw.enPlural} · น้อง${pw.th}`}</SectionLabel>
          <ul className="space-y-3">
            {cats.map((cat, idx) => (
              <li
                key={idx}
                className="space-y-2.5 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm"
              >
                {cats.length > 1 && (
                  <p className="flex items-center gap-1.5 text-xs font-extrabold text-petflow-chocolate">
                    <Icon name="paw" size={14} />
                    ตัวที่ {idx + 1}
                  </p>
                )}
                <label className="flex cursor-pointer items-center gap-3">
                  <span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-dashed border-latte bg-paper text-latte-deep">
                    {cat.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cat.photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Icon name="image" size={22} />
                    )}
                  </span>
                  <span className="text-xs font-bold text-brown-soft">
                    {cat.photo ? "เปลี่ยนรูปน้อง" : "ใส่รูปน้อง (ไม่บังคับ)"}
                    <span className="block text-[10px] font-normal text-brown-faint">
                      พี่เลี้ยงจะจำหน้าน้องได้ตั้งแต่วันแรก
                    </span>
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      pickPhoto(idx, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <SpeciesPicker
                  value={cat.species}
                  onChange={(species) =>
                    // เปลี่ยนชนิด → สายพันธุ์เดิมที่ไม่ใช่ของชนิดนี้ต้องเลือกใหม่
                    updateCat(idx, {
                      species,
                      breed:
                        cat.breed === OTHER_BREED ||
                        breedOptionsForSpecies(config, species).includes(cat.breed)
                          ? cat.breed
                          : "",
                    })
                  }
                />
                <input
                  required
                  value={cat.name}
                  onChange={(e) => updateCat(idx, { name: e.target.value })}
                  placeholder={`ชื่อน้อง${speciesWords(cat.species || undefined, config).th}`}
                  className={subFieldClass}
                />

                <div className="flex gap-1 rounded-full bg-paper p-1">
                  {(
                    [
                      ["male", "♂ ผู้"],
                      ["female", "♀ เมีย"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        updateCat(idx, {
                          gender: cat.gender === value ? undefined : value,
                        })
                      }
                      aria-pressed={cat.gender === value}
                      className={`min-h-[40px] flex-1 rounded-full text-sm font-bold transition ${
                        cat.gender === value
                          ? "bg-card text-petflow-chocolate shadow-petflow-sm"
                          : "text-brown-soft"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <select
                  required
                  value={cat.breed}
                  onChange={(e) => updateCat(idx, { breed: e.target.value })}
                  className={`${subFieldClass} ${
                    cat.breed ? "text-brown" : "text-brown-faint"
                  }`}
                >
                  <option value="">เลือกสายพันธุ์…</option>
                  {breedOptionsForSpecies(config, cat.species || undefined).map((b) => (
                    <option key={b} value={b} className="text-brown">
                      {b}
                    </option>
                  ))}
                  <option value={OTHER_BREED} className="text-brown">
                    {OTHER_BREED}
                  </option>
                </select>
                {cat.breed === OTHER_BREED && (
                  <input
                    required
                    value={cat.breedOther}
                    onChange={(e) => updateCat(idx, { breedOther: e.target.value })}
                    placeholder="ระบุสายพันธุ์"
                    className={subFieldClass}
                  />
                )}
                <div>
                  <span className="mb-1 block text-[11px] font-bold text-brown-soft">
                    ลักษณะขน
                  </span>
                  <div className="flex gap-1 rounded-full bg-paper p-1">
                    {(
                      [
                        ["short", "ขนสั้น"],
                        ["long", "ขนยาว"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => updateCat(idx, { furLength: value })}
                        aria-pressed={cat.furLength === value}
                        className={`min-h-[40px] flex-1 rounded-full text-sm font-bold transition ${
                          cat.furLength === value
                            ? "bg-card text-petflow-chocolate shadow-petflow-sm"
                            : "text-brown-soft"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="mb-1 block text-[11px] font-bold text-brown-soft">
                    ทำหมัน
                  </span>
                  <div className="flex gap-1 rounded-full bg-paper p-1">
                    {(
                      [
                        ["yes", "ทำหมันแล้ว"],
                        ["no", "ยังไม่ทำ"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => updateCat(idx, { neutered: value })}
                        aria-pressed={cat.neutered === value}
                        className={`min-h-[40px] flex-1 rounded-full text-sm font-bold transition ${
                          cat.neutered === value
                            ? "bg-card text-petflow-chocolate shadow-petflow-sm"
                            : "text-brown-soft"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  value={cat.color}
                  onChange={(e) => updateCat(idx, { color: e.target.value })}
                  placeholder="สี/ลักษณะเด่น (ไม่บังคับ) เช่น สีขาวสลับดำ"
                  className={subFieldClass}
                />
                <div className="text-[11px] font-bold text-brown-soft">
                  อายุ <span className="font-normal text-brown-faint">(ไม่บังคับ)</span>
                  <div className="mt-0.5 flex items-center gap-2">
                    <input
                      disabled={cat.ageUnknown}
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={cat.ageUnknown ? "" : cat.ageValue}
                      onChange={(e) => updateCat(idx, { ageValue: e.target.value })}
                      placeholder={cat.ageUnknown ? "ไม่ทราบอายุ" : "อายุ"}
                      className={`${subFieldClass} min-w-0 flex-1 disabled:opacity-50`}
                    />
                    {!cat.ageUnknown && (
                      <select
                        value={cat.ageUnit}
                        onChange={(e) =>
                          updateCat(idx, {
                            ageUnit: e.target.value as "year" | "month",
                          })
                        }
                        className="min-h-[44px] w-20 shrink-0 rounded-xl border border-petflow-line bg-paper px-3 py-2 text-sm font-normal text-brown"
                      >
                        <option value="year">ปี</option>
                        <option value="month">เดือน</option>
                      </select>
                    )}
                    <label className="flex min-h-[44px] shrink-0 cursor-pointer items-center gap-1.5 text-xs font-bold text-brown">
                      <input
                        type="checkbox"
                        checked={cat.ageUnknown}
                        onChange={(e) =>
                          updateCat(idx, {
                            ageUnknown: e.target.checked,
                            ageValue: "",
                            birthday: "",
                          })
                        }
                        className="h-5 w-5 accent-latte-deep"
                      />
                      ไม่ทราบ
                    </label>
                  </div>
                </div>
                {!cat.ageUnknown && (
                  <div className="text-[11px] font-bold text-brown-soft">
                    วันเกิดน้อง{pw.th}{" "}
                    <span className="font-normal text-brown-faint">
                      (ถ้าทราบ · ไม่บังคับ)
                    </span>
                    <div className="mt-0.5">
                      <BirthdayPicker
                        value={cat.birthday}
                        onChange={(iso) => updateCat(idx, { birthday: iso })}
                        yearsBack={25}
                      />
                    </div>
                  </div>
                )}
                <div className="text-[11px] font-bold text-brown-soft">
                  น้ำหนัก <span className="font-normal text-brown-faint">(กก.)</span>
                  <div className="mt-0.5 flex items-center gap-2">
                    <input
                      required={!cat.weightUnknown}
                      disabled={cat.weightUnknown}
                      type="number"
                      min="0"
                      step="0.1"
                      inputMode="decimal"
                      value={cat.weightUnknown ? "" : cat.weightKg}
                      onChange={(e) => updateCat(idx, { weightKg: e.target.value })}
                      placeholder={cat.weightUnknown ? "ไม่ทราบน้ำหนัก" : "เช่น 4.5"}
                      className={`${subFieldClass} min-w-0 flex-1 disabled:opacity-50`}
                    />
                    <label className="flex min-h-[44px] shrink-0 cursor-pointer items-center gap-1.5 text-xs font-bold text-brown">
                      <input
                        type="checkbox"
                        checked={cat.weightUnknown}
                        onChange={(e) =>
                          updateCat(idx, { weightUnknown: e.target.checked, weightKg: "" })
                        }
                        className="h-5 w-5 accent-latte-deep"
                      />
                      ไม่ทราบ
                    </label>
                  </div>
                </div>

                <StaffNoteTagPicker
                  label="โรคประจำตัว / เรื่องที่ช่างต้องรู้"
                  medicalValue={cat.medical}
                  noteValue={cat.note}
                  onChange={(medical, note) => updateCat(idx, { medical, note })}
                />
                <label className="block text-[11px] font-bold text-brown-soft">
                  ประวัติการชัก/ช็อค <span className="font-normal text-brown-faint">(ไม่มีเว้นว่างได้)</span>
                  <input
                    value={cat.seizureHistory}
                    onChange={(e) => updateCat(idx, { seizureHistory: e.target.value })}
                    placeholder="เช่น ไม่เคย · หรือ เคยชักตอนตกใจ"
                    className={`${subFieldClass} mt-0.5 font-normal text-brown`}
                  />
                </label>
                <label className="block text-[11px] font-bold text-brown-soft">
                  ประวัติการแพ้ <span className="font-normal text-brown-faint">(อาหาร / ยา / แชมพู · ไม่มีเว้นว่างได้)</span>
                  <input
                    value={cat.allergy}
                    onChange={(e) => updateCat(idx, { allergy: e.target.value })}
                    placeholder="เช่น ไม่มี · หรือ แพ้ไก่ แพ้แชมพูบางยี่ห้อ"
                    className={`${subFieldClass} mt-0.5 font-normal text-brown`}
                  />
                </label>

                {(() => {
                  const h = historyFor(cat);
                  if (!h || h.pet.length === 0) return null;
                  return (
                    <div className="space-y-3 border-t border-petflow-line pt-3">
                      <p className="text-sm font-extrabold text-petflow-chocolate">
                        ประวัติน้อง{speciesWords(cat.species || undefined, config).th}
                      </p>
                      <IntakeFieldsInput
                        fields={h.pet}
                        answers={cat.history}
                        onChange={(k, v) => updateCat(idx, { history: { ...cat.history, [k]: v } })}
                        showMissing={attempted}
                        inputClass={subFieldClass}
                      />
                    </div>
                  );
                })()}

                {cats.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCat(idx)}
                    className="-ml-1 flex min-h-[44px] items-center gap-1.5 px-1 text-xs font-bold text-brown-soft"
                  >
                    <Icon name="trash" size={15} />
                    ลบน้อง{pw.th}ตัวนี้
                  </button>
                )}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={addCat}
            className="mt-3 flex min-h-[60px] w-full items-center gap-3 rounded-petflow border-2 border-honey-deep bg-honey/45 px-4 text-left text-petflow-chocolate shadow-petflow-sm transition active:scale-[.98]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-petflow-chocolate text-card">
              <Icon name="plus" size={20} strokeWidth={2.4} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold">เพิ่มน้อง{pw.th}อีกตัว</span>
              <span className="block text-[11px] text-petflow-chocolate/70">มีหลายตัว เพิ่มได้ทุกตัวเลยค่ะ</span>
            </span>
            <Icon name="paw" size={22} className="text-petflow-chocolate/60" />
          </button>
        </section>

        {/* ── รู้จักเราจากทางไหน ── */}
        <section>
          <SectionLabel>
            Referral · รู้จักเราจากทางไหน? <span className="text-red-600">*</span>
          </SectionLabel>
          <div className="flex flex-wrap gap-2 rounded-petflow border border-petflow-line bg-card p-3 shadow-petflow-sm">
            {referrals.map((opt) => (
              <button
                key={opt}
                type="button"
                aria-pressed={referral === opt}
                onClick={() => setReferral((prev) => (prev === opt ? "" : opt))}
                className={`min-h-[44px] rounded-full px-4 text-xs font-bold transition ${
                  referral === opt
                    ? "bg-latte/40 text-petflow-chocolate ring-1 ring-latte-deep"
                    : "bg-paper text-brown-soft"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </section>

        {/* ── โค้ดเพื่อนแนะนำ (ไม่บังคับ) · ร้านปิด "ชวนเพื่อนรับคูปอง" = ไม่ถาม ── */}
        {referralOn && (
        <div className="rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={hasReferralCode}
              onChange={(e) => setHasReferralCode(e.target.checked)}
              className="h-5 w-5 flex-none accent-latte-deep"
            />
            <span className="text-xs font-bold text-brown">
              มีโค้ดเพื่อนแนะนำ
              <span className="block text-[11px] font-normal text-brown-faint">
                กรอกโค้ด รับคูปอง {referralReward(config).amount}฿ ทั้งคุณและเพื่อน
              </span>
            </span>
          </label>
          {hasReferralCode && (
            <input
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
              placeholder="เช่น CAT1A2B3C"
              autoCapitalize="characters"
              autoComplete="off"
              className={`mt-3 ${fieldClass} font-extrabold tracking-wider`}
            />
          )}
        </div>
        )}

        {/* ── ยินยอมรับข่าวสาร ── */}
        <label className="flex cursor-pointer items-start gap-3 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-5 w-5 flex-none accent-latte-deep"
          />
          <span className="text-xs text-brown">
            ยินยอมให้ส่งข่าวสาร โปรโมชั่น และสิทธิพิเศษ
            <span className="mt-0.5 block text-[11px] text-brown-faint">
              ถ้าไม่ยินยอม จะไม่ได้รับโปร/ข่าวสาร แต่ยังได้รับการยืนยันนัดและแจ้งชำระเงินตามปกติ
            </span>
          </span>
        </label>

        {error && (
          <p className="rounded-petflow-sm bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className={BTN_PRIMARY}
        >
          {saving ? "กำลังบันทึก…" : "บันทึกข้อมูล"}
        </button>
      </form>
    </div>
  );
}
