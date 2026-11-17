"use client";

import { useLocale, useTr } from "@/components/LocaleProvider";
import { savedPopup } from "@/components/Toast";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLiff } from "@/components/LiffProvider";
import { useConfig } from "@/components/ConfigProvider";
import { catCurrentAgeLabel } from "@/lib/cat-age";
import { BirthdayPicker } from "@/components/BirthdayPicker";
import { BTN_PRIMARY, PageHeader } from "@/components/PageHeader";
import { LanguagePicker } from "@/components/LangSwitch";
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
  vaccinated: "" | "yes" | "no";
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
import { breedLabel, enWord } from "@/lib/en-words";
import { localizeFields } from "@/lib/form-en";
import { asksSpecies, speciesName, breedOptionsForSpecies, formKindOf, petWords, speciesWords, type PetSpecies } from "@/lib/pet-kind";
import { registerHistoryFields, type IntakeAnswers } from "@/lib/intake-rules";
import { IntakeFieldsInput, intakeAnswerEmpty } from "@/components/IntakeFieldsInput";
import { SpeciesPicker } from "@/components/SpeciesPicker";
import { isFeatureOn } from "@/lib/features";
import { referralReward } from "@/lib/referral";
import { StaffNoteTagPicker } from "@/components/StaffNoteTagPicker";
import { customerFetch } from "@/lib/customer-fetch";
import { resolveRegisterForm } from "@/lib/register-form";
import { NumInput } from "@/components/NumInput";
import {
  EmergencyContactInput,
  emergencyFromForm,
  emergencyProblem,
  emptyEmergencyForm,
  type EmergencyForm,
} from "@/components/EmergencyContactInput";
import { otherKey } from "@/lib/groom-form";
import { ReviewSheet, reviewDate as thaiDate, type ReviewSection } from "@/components/ReviewSheet";

function emptyCat(): CatInput {
  return {
    name: "",
    species: "",
    breed: "",
    breedOther: "",
    furLength: "",
    neutered: "",
    vaccinated: "",
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
  // ช่องไหนแสดง/บังคับ/ชื่อช่อง — ร้านตั้งเองในหลังบ้าน › การ์ด › ฟอร์มสมัครสมาชิก
  const { locale } = useLocale();
  const tr = useTr();
  const rf = resolveRegisterForm(config.registerForm, locale);
  /** ป้ายที่ร้านตั้งเองของช่องที่ล็อก (ไม่ตั้ง = ป้ายเดิมตามแบบฟอร์ม) */
  const customLabel = (k: "ownerName" | "phone" | "catName") =>
    (locale === "en" ? config.registerForm?.[k]?.labelEn : config.registerForm?.[k]?.label)?.trim();
  /** ป้าย (ไม่บังคับ) ต่อท้ายชื่อช่องที่ร้านตั้งว่าไม่บังคับ */
  const optTag = (on: boolean) =>
    on ? null : <span className="font-normal text-brown-faint"> {tr("(ไม่บังคับ)", "(optional)")}</span>;
  const pw = petWords(config);
  const askSpecies = asksSpecies(config);
  const referrals = config.options?.referralOptions?.length
    ? config.options.referralOptions
    : REFERRAL_OPTIONS;
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [referral, setReferral] = useState("");
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
  // ชื่อเล่นผู้ปกครอง — ช่องแยกจากชื่อ (ร้านปิด/บังคับได้ในการ์ด › ฟอร์มสมัครสมาชิก) · สมัครในนามบริษัทแบบใช้ข้อมูลบริษัทไม่ถาม
  const askNickname = rf.ownerNickname.enabled && !useCompanyContact;
  const [cats, setCats] = useState<CatInput[]>([emptyCat()]);
  /** ประวัติที่ร้านให้ถามตอนสมัคร — ตามชนิดของน้องแต่ละตัว (ร้านแมวไม่มีฟอร์มนี้ = ไม่ถาม) */
  const historyFor = (c: CatInput) => {
    const h = registerHistoryFields(formKindOf(c.species, config), config);
    return h && { owner: localizeFields(h.owner, locale), pet: localizeFields(h.pet, locale) };
  };
  /** ร้านใช้ฟอร์มประวัติตอนสมัคร (เช่น Back Home) — ป้ายชื่อจริง/เบอร์หลัก ไม่ขออีเมล ตามลิสต์ของร้าน */
  const historyStyle = cats.some((c) => historyFor(c) !== null);
  /** เบอร์ติดต่อฉุกเฉิน — ถามที่หน้านี้ที่เดียว (ร้านปิด/เลิกบังคับได้ในหลังบ้าน › การ์ด › ฟอร์มสมัครสมาชิก) */
  const [emergency, setEmergency] = useState<EmergencyForm>(() => emptyEmergencyForm());
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  // ข้อความเตือนอยู่ติดปุ่มบันทึก — เลื่อนให้เห็นทุกครั้งที่มีข้อความใหม่ (ไม่ให้ดูเหมือนกดแล้วไม่เกิดอะไร)
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);
  const [referralCode, setReferralCode] = useState("");
  // ติ๊ก "มีโค้ดเพื่อนแนะนำ" แล้วค่อยโชว์ช่องกรอก — มาจากลิงก์ชวนจะติ๊ก + เติมโค้ดให้เอง
  const [hasReferralCode, setHasReferralCode] = useState(false);
  const [fromLink, setFromLink] = useState(false);
  // ป๊อปอัปสรุปให้ลูกค้าเช็คก่อนบันทึกจริง
  const [reviewing, setReviewing] = useState(false);

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
      setError(e instanceof Error ? e.message : tr("เปิดไฟล์รูปนี้ไม่ได้ — ลองเลือกรูปอื่นนะคะ", "Couldn't open this photo — please choose another one"));
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

    // บังคับเฉพาะช่องที่ร้านตั้งว่าบังคับ (ค่าเริ่มต้น: ทุกช่อง ยกเว้นรูป/สี/อายุ/โรคประจำตัว/ชัก/แพ้)
    const catProblem = (c: CatInput, n: string): string => {
      if (askSpecies && !c.species) return tr(`เลือกชนิดของน้อง${n}ด้วยนะคะ`, `Please choose the type of pet${n}`);
      const pw = speciesWords(c.species || undefined, config);
      if (!c.name.trim()) return tr(`กรอกชื่อน้อง${pw.th}${n}ด้วยนะคะ`, `Please enter your ${pw.en}'s name${n}`);
      if (rf.gender.required && !c.gender) return tr(`เลือกเพศน้อง${pw.th}${n}ด้วยนะคะ ${pw.emoji}`, `Please choose your ${pw.en}'s sex${n} ${pw.emoji}`);
      if (rf.breed.required && (!c.breed || (c.breed === OTHER_BREED && !c.breedOther.trim())))
        return tr(`เลือกสายพันธุ์น้อง${pw.th}${n}ด้วยนะคะ`, `Please choose your ${pw.en}'s breed${n}`);
      if (rf.furLength.required && !c.furLength) return tr(`เลือกลักษณะขนน้อง${pw.th}${n}ด้วยนะคะ`, `Please choose your ${pw.en}'s coat type${n}`);
      if (rf.neutered.required && !c.neutered) return tr(`เลือกว่าน้อง${pw.th}${n}ทำหมันแล้วหรือยังด้วยนะคะ`, `Please tell us if your ${pw.en}${n} is neutered/spayed`);
      if (rf.vaccinated.required && !c.vaccinated) return tr(`เลือกว่าน้อง${pw.th}${n}ได้รับวัคซีนครบหรือยังด้วยนะคะ`, `Please tell us if your ${pw.en}${n} is fully vaccinated`);
      if (rf.color.required && !c.color.trim()) return tr(`กรอกสี/ลักษณะเด่นน้อง${pw.th}${n}ด้วยนะคะ`, `Please enter your ${pw.en}'s colour/markings${n}`);
      if (rf.age.required && !c.ageUnknown && !c.birthday && !(Number(c.ageValue) > 0))
        return tr(`กรอกอายุน้อง${pw.th}${n} หรือติ๊ก "ไม่ทราบ" ด้วยนะคะ`, `Please enter your ${pw.en}'s age${n} or tick "Not sure"`);
      if (rf.weight.required && !c.weightUnknown && !(Number(c.weightKg) > 0))
        return tr(`กรอกน้ำหนักน้อง${pw.th}${n} หรือติ๊ก "ไม่ทราบ" ด้วยนะคะ`, `Please enter your ${pw.en}'s weight${n} or tick "Not sure"`);
      if (rf.medical.required && !c.medical.trim() && !c.note.trim())
        return tr(`เลือกโรคประจำตัวน้อง${pw.th}${n} (ไม่มีก็เลือก/พิมพ์ว่า "ไม่มี") ด้วยนะคะ`, `Please fill in your ${pw.en}'s health conditions${n} (type "none" if none)`);
      if (rf.seizure.required && !c.seizureHistory.trim())
        return tr(`กรอกประวัติการชัก/ช็อคน้อง${pw.th}${n} (ไม่มีพิมพ์ว่า "ไม่มี") ด้วยนะคะ`, `Please fill in your ${pw.en}'s seizure/shock history${n} (type "none" if none)`);
      if (rf.allergy.required && !c.allergy.trim())
        return tr(`กรอกประวัติการแพ้น้อง${pw.th}${n} (ไม่มีพิมพ์ว่า "ไม่มี") ด้วยนะคะ`, `Please fill in your ${pw.en}'s allergies${n} (type "none" if none)`);
      const h = historyFor(c);
      if (h) {
        const miss = h.pet.find((f) => f.required && intakeAnswerEmpty(c.history[f.key]));
        if (miss) return tr(`ตอบ "${miss.label.split(" — ")[0]}" ของน้อง${pw.th}${n}ด้วยนะคะ`, `Please answer "${miss.label.split(" — ")[0]}" for your ${pw.en}${n}`);
      }
      return "";
    };
    // ฟอร์มปิดการตรวจของเบราว์เซอร์ (noValidate) — ทุกช่องต้องตรวจที่นี่ ให้ขึ้นข้อความเสมอ
    // (เดิมช่องที่ติด required ว่างอยู่ = เบราว์เซอร์ใน LINE บล็อกปุ่มบันทึกเงียบ ๆ ลูกค้าไม่รู้ว่าขาดอะไร)
    if (!useCompanyContact && !name.trim()) {
      setError(tr("กรอกชื่อ-นามสกุลด้วยนะคะ", "Please enter your full name"));
      return;
    }
    if (!useCompanyContact && phone.replace(/\D/g, "").length < 9) {
      setError(tr("กรอกเบอร์โทรให้ครบด้วยนะคะ", "Please enter your full phone number"));
      return;
    }
    if (askNickname && rf.ownerNickname.required && !nickname.trim()) {
      setError(tr("กรอกชื่อเล่นด้วยนะคะ", "Please enter your nickname"));
      return;
    }
    const emergencyMiss = rf.emergency.enabled ? emergencyProblem(emergency, rf.emergency.required, locale) : "";
    if (emergencyMiss) {
      setError(emergencyMiss);
      return;
    }
    for (let i = 0; i < cats.length; i++) {
      const problem = catProblem(cats[i], cats.length > 1 ? tr(` ตัวที่ ${i + 1}`, ` (#${i + 1})`) : "");
      if (problem) {
        setError(problem);
        return;
      }
    }
    if (rf.email.required && !historyStyle && !email.trim()) {
      setError(tr("กรอกอีเมลด้วยนะคะ", "Please enter your email"));
      return;
    }
    if (!historyStyle && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(tr("อีเมลไม่ถูกต้อง — เช็คตัวสะกดอีกครั้งนะคะ", "This email doesn't look right — please check the spelling"));
      return;
    }
    if (rf.ownerBirthday.required && !isCompany && !birthday) {
      setError(tr("เลือกวันเกิดผู้ปกครองด้วยนะคะ", "Please choose your birthday"));
      return;
    }
    if (rf.referral.enabled && rf.referral.required && !referral) {
      setError(tr("เลือกช่องทางที่รู้จักเราด้วยนะคะ", "Please tell us how you heard about us"));
      return;
    }
    if (referralOn && hasReferralCode && !referralCode.trim()) {
      setError(tr("กรอกโค้ดเพื่อนแนะนำ หรือเอาติ๊กออกถ้าไม่มีโค้ดนะคะ", "Enter your friend's referral code, or untick the box if you don't have one"));
      return;
    }
    const billing = formToTaxInvoice(isCompany ? company : taxInvoice);
    const taxProblem =
      taxInvoiceProblem(billing, locale) || (isCompany ? companyContactProblem(company, sameContact, locale) : "");
    if (taxProblem) {
      setError(taxProblem);
      return;
    }
    // สมัครสมาชิกต้องกรอกครบทุกช่อง — เบอร์บริษัทก็ต้องมี
    if (billing && (billing.phone || "").replace(/\D/g, "").length < 9) {
      setError(tr("กรอกเบอร์โทรสำหรับออกบิลด้วยนะคะ", "Please enter a phone number for billing"));
      return;
    }
    // ผ่านครบ → โชว์สรุปให้เช็คก่อน ยังไม่บันทึก
    setError("");
    setReviewing(true);
  };

  /** สรุปทุกช่องที่ร้านเปิดไว้ — ให้ลูกค้าเห็นภาพเดียวกับที่ร้านจะได้ */
  const reviewSections = (): ReviewSection[] => {
    const owner: ReviewSection = {
      title: tr("ข้อมูลผู้ปกครอง", "Owner details"),
      icon: "user",
      rows: [
        ...(isCompany
          ? [
              { label: tr("ชื่อบริษัท", "Company name"), value: company.name },
              { label: tr("เลขผู้เสียภาษี", "Tax ID"), value: company.taxId },
              { label: tr("ที่อยู่บริษัท", "Company address"), value: company.address },
              { label: tr("เบอร์บริษัท", "Company phone"), value: company.phone },
            ]
          : []),
        ...(!useCompanyContact
          ? [
              { label: customLabel("ownerName") || (isCompany ? tr("ชื่อผู้ติดต่อ", "Contact name") : rf.ownerName.label), value: name },
              { label: customLabel("phone") || (isCompany ? tr("เบอร์ผู้ติดต่อ", "Contact phone") : rf.phone.label), value: phone },
            ]
          : []),
        ...(askNickname ? [{ label: rf.ownerNickname.label, value: nickname }] : []),
        ...(rf.emergency.enabled
          ? [{ label: rf.emergency.label, value: [emergency.phone.trim(), emergency.relation.trim()].filter(Boolean).join(" · ") }]
          : []),
        ...(rf.email.enabled && !historyStyle ? [{ label: rf.email.label, value: email }] : []),
        ...(rf.ownerBirthday.enabled && !isCompany ? [{ label: rf.ownerBirthday.label, value: thaiDate(birthday) }] : []),
        ...(!isCompany && taxInvoice.on
          ? [{ label: tr("ใบกำกับภาษี", "Tax invoice"), value: [taxInvoice.name, taxInvoice.taxId].map((x) => x.trim()).filter(Boolean).join(" · ") }]
          : []),
      ],
    };
    const catSections: ReviewSection[] = cats
      .filter((c) => c.name.trim())
      .map((c, i, arr) => ({
        title: tr(
          `น้อง${speciesWords(c.species || undefined, config).th}${arr.length > 1 ? `ตัวที่ ${i + 1}` : ""} · ${c.name.trim()}`,
          `${arr.length > 1 ? `Pet #${i + 1}` : "Pet"} · ${c.name.trim()}`,
        ),
        icon: "paw",
        rows: [
          ...(asksSpecies(config) ? [{ label: tr("ชนิด", "Type"), value: speciesName(config, c.species) }] : []),
          ...(rf.gender.enabled
            ? [{ label: rf.gender.label, value: c.gender === "male" ? tr("♂ ผู้", "♂ Male") : c.gender === "female" ? tr("♀ เมีย", "♀ Female") : "" }]
            : []),
          ...(rf.breed.enabled
            ? [{ label: rf.breed.label, value: c.breed === OTHER_BREED ? c.breedOther : c.breed }]
            : []),
          ...(rf.furLength.enabled
            ? [{ label: rf.furLength.label, value: c.furLength === "long" ? tr("ขนยาว", "Long hair") : c.furLength === "short" ? tr("ขนสั้น", "Short hair") : "" }]
            : []),
          ...(rf.neutered.enabled
            ? [{ label: rf.neutered.label, value: c.neutered === "yes" ? tr("ทำหมันแล้ว", "Yes") : c.neutered === "no" ? tr("ยังไม่ทำหมัน", "No") : "" }]
            : []),
          ...(rf.vaccinated.enabled
            ? [{ label: rf.vaccinated.label, value: c.vaccinated === "yes" ? tr("ครบแล้ว", "Up to date") : c.vaccinated === "no" ? tr("ยังไม่ครบ", "Not complete") : "" }]
            : []),
          ...(rf.color.enabled ? [{ label: rf.color.label, value: c.color }] : []),
          ...(rf.age.enabled
            ? [
                {
                  label: rf.age.label,
                  value: c.ageUnknown
                    ? tr("ไม่ทราบ", "Not sure")
                    : [c.ageValue ? `${c.ageValue} ${c.ageUnit === "month" ? tr("เดือน", "months") : tr("ปี", "years")}` : "", c.birthday ? `${tr("เกิด", "Born")} ${thaiDate(c.birthday, locale)}` : ""]
                        .filter(Boolean)
                        .join(" · "),
                },
              ]
            : []),
          ...(rf.weight.enabled
            ? [{ label: rf.weight.label, value: c.weightUnknown ? tr("ไม่ทราบ", "Not sure") : c.weightKg ? `${c.weightKg} ${tr("กก.", "kg")}` : "" }]
            : []),
          ...(rf.medical.enabled
            ? [{ label: rf.medical.label, value: [c.medical, c.note].map((x) => x.trim()).filter(Boolean).join("\n") }]
            : []),
          ...(rf.seizure.enabled ? [{ label: rf.seizure.label, value: c.seizureHistory }] : []),
          ...(rf.allergy.enabled ? [{ label: rf.allergy.label, value: c.allergy }] : []),
          // ประวัติที่ร้านให้ถามตอนสมัคร — ตัวเลือกโชว์ชื่อ ไม่ใช่ key
          ...(historyFor(c)?.pet || []).map((fd) => {
            const v = c.history[fd.key];
            const keys = Array.isArray(v) ? v : v ? [String(v)] : [];
            const other = fd.allowOther ? String(c.history[otherKey(fd.key)] || "").trim() : "";
            return {
              label: fd.label,
              value:
                fd.type === "single" || fd.type === "multi"
                  ? [...keys.map((k) => fd.options.find((o) => o.key === k)?.label || k), other]
                  : String(v || ""),
            };
          }),
        ],
      }));
    const other: ReviewSection = {
      title: tr("อื่น ๆ", "Other"),
      icon: "sparkle",
      rows: [
        ...(rf.referral.enabled ? [{ label: rf.referral.label, value: referral }] : []),
        ...(referralOn && hasReferralCode ? [{ label: tr("โค้ดเพื่อนแนะนำ", "Referral code"), value: referralCode }] : []),
        { label: tr("รับข่าวสาร/โปรโมชั่น", "News & promotions"), value: consent ? tr("ยินยอม", "Yes") : tr("ไม่ยินยอม", "No") },
      ],
    };
    return [owner, ...catSections, other];
  };

  const save = async () => {
    if (!profile?.lineUserId) return;
    const billing = formToTaxInvoice(isCompany ? company : taxInvoice);
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
          // ร้านเปิดการ์ดอังกฤษ = จำภาษาที่ลูกค้าเลือก (ปิด = ไม่ส่ง ไม่แตะค่าเดิม)
          language: config.automation?.englishCards === true ? locale : undefined,
          name: contact.name,
          phone: contact.phone,
          address: contact.address,
          email: historyStyle ? undefined : email,
          birthday: isCompany ? undefined : birthday,
          referralSource: referral,
          referralCode: (referralOn && hasReferralCode && referralCode.trim()) || undefined,
          taxInvoice: billing || undefined,
          emergencyContact: rf.emergency.enabled ? emergencyFromForm(emergency) : undefined,
          nickname: (askNickname && nickname.trim()) || undefined,
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
              vaccinated: c.vaccinated ? c.vaccinated === "yes" : undefined,
              color: c.color || undefined,
              staffNote: c.note || undefined,
              history: historyFor(c) ? c.history : undefined,
            })),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || tr("ลงทะเบียนไม่สำเร็จ — ลองใหม่อีกครั้งนะคะ", "Sign-up failed — please try again"));
        return;
      }

      // รูปน้อง: ต้องรู้ id แมวจากผลสมัครก่อน แล้วค่อยอัปทีละตัว (อัปไม่ผ่านก็ไม่ขวางการสมัคร
      // ลูกค้าเพิ่มรูปทีหลังได้ที่หน้าโปรไฟล์)
      const savedCats: { id: string; name: string }[] = data.customer?.cats || [];
      const used = new Set<string>();
      const uploads: Promise<unknown>[] = [];
      for (const c of cats) {
        if (!c.photo) continue;
        const match = [...savedCats]
          .reverse()
          .find((sc) => !used.has(sc.id) && sc.name.trim() === c.name.trim());
        if (!match) continue;
        used.add(match.id);
        // อัปรูปทุกตัวพร้อมกัน — เดิมรอทีละตัว น้องหลายตัว = รอนานขึ้นเรื่อย ๆ
        uploads.push(
          customerFetch("/api/customers/cat-photo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ catId: match.id, photoDataUrl: c.photo }),
          }).catch(() => null)
        );
      }

      await Promise.all(uploads);
      // ข้อมูลลูกค้ากับแต้มไม่ขึ้นต่อกัน — โหลดพร้อมกัน (หลังอัปรูปเสร็จ หน้าแรกจะได้เห็นรูปน้อง)
      await Promise.all([refreshCustomer(), refreshAccount()]);
      const petNames = cats.map((c) => c.name.trim()).filter(Boolean);
      savedPopup(
        tr("สมัครสมาชิกสำเร็จ 🎉", "You're signed up 🎉"),
        [
          petNames.length ? tr(`ลงทะเบียนน้อง ${petNames.join(", ")} เรียบร้อยแล้วค่ะ`, `${petNames.join(", ")} registered`) : "",
          tr("จองคิวและดูข้อมูลน้องได้ที่หน้าแรกเลยค่ะ", "Book and see your pet's details on the home page"),
        ],
        { afterNav: true }
      );
      setReviewing(false);
      router.replace("/app");
    } catch {
      setError(
        tr("เชื่อมต่อไม่สำเร็จ — เช็คสัญญาณอินเทอร์เน็ตแล้วลองกดบันทึกอีกครั้งนะคะ", "Connection failed — check your internet and tap save again")
      );
    } finally {
      setSaving(false);
    }
  };

  if (!ready) {
    return <LoadingScreen message={tr("กำลังเชื่อมต่อ LINE…", "Connecting to LINE…")} />;
  }

  const fieldClass =
    "min-h-[44px] w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm";
  const subFieldClass =
    "min-h-[44px] w-full rounded-xl border border-petflow-line bg-paper px-3 py-2 text-sm";

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader
        eyebrow="Sign up"
        title={tr("สมัครสมาชิก เพื่อรับสิทธิพิเศษ", "Sign up for member perks")}
        subtitle={tr("กรอกข้อมูลครั้งเดียว — ใช้ยืนยันนัด แต้มสะสม และโปรโมชั่น", "Fill this in once — used for bookings, points and promotions")}
        back="/app"
        backLabel={tr("กลับหน้าแรก", "Back to home")}
        showLang={false}
      />

      {/* ร้านเปิดการ์ด LINE ภาษาอังกฤษ — ถามภาษาก่อนเลย เลือกแล้วฟอร์มเปลี่ยนภาษาทันที และร้านจำไว้ส่งการ์ดภาษานี้ */}
      <LanguagePicker className="mb-4" />

      {fromLink && referralOn && (
        <div className="mb-4 flex items-start gap-2 rounded-petflow border border-honey/50 bg-honey/20 px-4 py-3 text-xs font-extrabold text-petflow-chocolate">
          <Icon name="gift" size={16} className="mt-px" />
          <span>{tr("สมัครผ่านเพื่อนแนะนำ — สมัครเสร็จรับคูปองส่วนลด ", "Referred by a friend — sign up and you both get a ")}<span className="text-latte-deep">{referralReward(config).amount}฿</span>{tr(" ทั้งคุณและเพื่อนทันที!", " discount coupon right away!")}</span>
        </div>
      )}

      <form onSubmit={submit} noValidate className="space-y-6">
        {/* ── ข้อมูลผู้ปกครอง ── */}
        <section>
        <SectionLabel>{tr("Owner · ข้อมูลผู้ปกครอง", "Owner")}</SectionLabel>
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
                {customLabel("ownerName") || (isCompany ? tr("ชื่อผู้ติดต่อ", "Contact name") : historyStyle ? tr("ชื่อจริง-นามสกุล", "First and last name") : rf.ownerName.label)}{" "}
                {!historyStyle && !askNickname && (
                  <span className="font-normal text-brown-faint">
                    {tr("(ชื่อเล่นหรือชื่อจริงก็ได้นะคะ)", "(nickname or real name is fine)")}
                  </span>
                )}
              </span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isCompany ? tr("เช่น คุณมาย", "e.g. May") : tr("เช่น สมใจ ใจดี", "e.g. Somjai Jaidee")}
                className={fieldClass}
              />
            </label>

            {askNickname && (
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-brown">
                  {rf.ownerNickname.label}
                  {!rf.ownerNickname.required && (
                    <span className="font-normal text-brown-faint"> {tr("(ไม่บังคับ)", "(optional)")}</span>
                  )}
                </span>
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder={tr("เช่น มาย", "e.g. May")}
                  className={fieldClass}
                />
              </label>
            )}

            <label className="block">
              <span className="mb-1 block text-xs font-bold text-brown">
                {customLabel("phone") || (isCompany ? tr("เบอร์ผู้ติดต่อ", "Contact phone") : historyStyle ? tr("เบอร์หลัก", "Main phone number") : rf.phone.label)}
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

        {rf.emergency.enabled && (
          <EmergencyContactInput
            value={emergency}
            onChange={setEmergency}
            label={rf.emergency.label}
            required={rf.emergency.required}
            showMissing={attempted}
            inputClass={fieldClass}
          />
        )}

        {/* ร้านที่ถามประวัติตอนสมัคร (เช่น Back Home) ไม่ขออีเมล — ลิสต์ของร้านไม่มี */}
        {/* จอมือถือ: อีเมล/วันเกิดคนละแถว — วางคู่กันแล้วช่องวัน/เดือน/ปีแคบจนอ่านไม่ออก */}
        <div className={isCompany || historyStyle || !rf.email.enabled || !rf.ownerBirthday.enabled ? "" : "grid gap-3 sm:grid-cols-2"}>
          {!historyStyle && rf.email.enabled && (
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-brown">{rf.email.label}{optTag(rf.email.required)}</span>
              <input
                required={rf.email.required}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className={fieldClass}
              />
            </label>
          )}
          {!isCompany && rf.ownerBirthday.enabled && (
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-brown">
                {rf.ownerBirthday.label}{optTag(rf.ownerBirthday.required)}
              </span>
              <BirthdayPicker
                required={rf.ownerBirthday.required}
                value={birthday}
                onChange={setBirthday}
                yearsBack={90}
              />
            </label>
          )}
        </div>


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
          <SectionLabel>{tr(`My ${pw.enPlural} · น้อง${pw.th}`, `My ${pw.enPlural}`)}</SectionLabel>
          <ul className="space-y-3">
            {cats.map((cat, idx) => (
              <li
                key={idx}
                className="space-y-2.5 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm"
              >
                {cats.length > 1 && (
                  <p className="flex items-center gap-1.5 text-xs font-extrabold text-petflow-chocolate">
                    <Icon name="paw" size={14} />
                    {tr("ตัวที่", "Pet #")} {idx + 1}
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
                    {cat.photo ? tr("เปลี่ยนรูปน้อง", "Change photo") : tr("ใส่รูปน้อง (ไม่บังคับ)", "Add a photo (optional)")}
                    <span className="block text-[10px] font-normal text-brown-faint">
                      {tr("พี่เลี้ยงจะจำหน้าน้องได้ตั้งแต่วันแรก", "Helps our staff recognise your pet from day one")}
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
                  placeholder={customLabel("catName") || tr(`ชื่อน้อง${speciesWords(cat.species || undefined, config).th}`, `${speciesWords(cat.species || undefined, config).en[0].toUpperCase()}${speciesWords(cat.species || undefined, config).en.slice(1)}'s name`)}
                  className={subFieldClass}
                />

                {rf.gender.enabled && (
                <div>
                <span className="mb-1 block text-[11px] font-bold text-brown-soft">
                  {rf.gender.label}{optTag(rf.gender.required)}
                </span>
                <div className="flex gap-1 rounded-full bg-paper p-1">
                  {(
                    [
                      ["male", tr("♂ ผู้", "♂ Male")],
                      ["female", tr("♀ เมีย", "♀ Female")],
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
                </div>
                )}

                {rf.breed.enabled && (
                <div>
                <span className="mb-1 block text-[11px] font-bold text-brown-soft">
                  {rf.breed.label}{optTag(rf.breed.required)}
                </span>
                <select
                  required={rf.breed.required}
                  value={cat.breed}
                  onChange={(e) => updateCat(idx, { breed: e.target.value })}
                  className={`${subFieldClass} ${
                    cat.breed ? "text-brown" : "text-brown-faint"
                  }`}
                >
                  <option value="">{tr("เลือกสายพันธุ์…", "Choose breed…")}</option>
                  {breedOptionsForSpecies(config, cat.species || undefined).map((b) => (
                    <option key={b} value={b} className="text-brown">
                      {breedLabel(b, locale)}
                    </option>
                  ))}
                  <option value={OTHER_BREED} className="text-brown">
                    {breedLabel(OTHER_BREED, locale)}
                  </option>
                </select>
                {cat.breed === OTHER_BREED && (
                  <input
                    required
                    value={cat.breedOther}
                    onChange={(e) => updateCat(idx, { breedOther: e.target.value })}
                    placeholder={tr("ระบุสายพันธุ์", "Enter breed")}
                    className={`${subFieldClass} mt-2`}
                  />
                )}
                </div>
                )}
                {rf.furLength.enabled && (
                <div>
                  <span className="mb-1 block text-[11px] font-bold text-brown-soft">
                    {rf.furLength.label}{optTag(rf.furLength.required)}
                  </span>
                  <div className="flex gap-1 rounded-full bg-paper p-1">
                    {(
                      [
                        ["short", tr("ขนสั้น", "Short hair")],
                        ["long", tr("ขนยาว", "Long hair")],
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
                )}
                {rf.neutered.enabled && (
                <div>
                  <span className="mb-1 block text-[11px] font-bold text-brown-soft">
                    {rf.neutered.label}{optTag(rf.neutered.required)}
                  </span>
                  <div className="flex gap-1 rounded-full bg-paper p-1">
                    {(
                      [
                        ["yes", tr("ทำหมันแล้ว", "Yes")],
                        ["no", tr("ยังไม่ทำ", "No")],
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
                )}
                {rf.vaccinated.enabled && (
                <div>
                  <span className="mb-1 block text-[11px] font-bold text-brown-soft">
                    {rf.vaccinated.label}{optTag(rf.vaccinated.required)}
                  </span>
                  <div className="flex gap-1 rounded-full bg-paper p-1">
                    {(
                      [
                        ["yes", tr("ครบแล้ว", "Up to date")],
                        ["no", tr("ยังไม่ครบ", "Not complete")],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => updateCat(idx, { vaccinated: value })}
                        aria-pressed={cat.vaccinated === value}
                        className={`min-h-[40px] flex-1 rounded-full text-sm font-bold transition ${
                          cat.vaccinated === value
                            ? "bg-card text-petflow-chocolate shadow-petflow-sm"
                            : "text-brown-soft"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                )}
                {rf.color.enabled && (
                <div className="text-[11px] font-bold text-brown-soft">
                  {rf.color.label}{optTag(rf.color.required)}
                <input
                  value={cat.color}
                  onChange={(e) => updateCat(idx, { color: e.target.value })}
                  placeholder={tr("เช่น สีขาวสลับดำ", "e.g. black and white")}
                  className={`${subFieldClass} mt-0.5 font-normal text-brown`}
                />
                </div>
                )}
                {rf.age.enabled && (
                <>
                {/* วันเกิดก่อน — กรอกแล้วระบบคิดอายุให้เอง ไม่ต้องกรอกอายุซ้ำ · ไม่ทราบวันเกิดค่อยใส่อายุคร่าวๆ (ไม่บังคับ) */}
                {!cat.ageUnknown && (
                  <div className="text-[11px] font-bold text-brown-soft">
                    {tr(`วันเกิดน้อง${pw.th}`, "Birthday")}{" "}
                    <span className="font-normal text-brown-faint">
                      {tr("(ถ้าทราบ · ไม่บังคับ)", "(if known · optional)")}
                    </span>
                    <div className="mt-0.5">
                      <BirthdayPicker
                        value={cat.birthday}
                        onChange={(iso) => updateCat(idx, { birthday: iso, ...(iso ? { ageValue: "" } : {}) })}
                        yearsBack={25}
                        allowUnknown
                      />
                    </div>
                    {cat.birthday && (
                      <p className="mt-1 text-xs font-bold text-ok">
                        {tr("อายุ", "Age")} {catCurrentAgeLabel({ birthday: cat.birthday })} {tr("(คิดจากวันเกิดให้แล้ว)", "(from birthday)")}
                      </p>
                    )}
                  </div>
                )}
                {!cat.birthday && (
                <div className="text-[11px] font-bold text-brown-soft">
                  {cat.ageUnknown ? rf.age.label : tr("หรือใส่อายุคร่าวๆ (ถ้าไม่ทราบวันเกิด)", "Or enter an approximate age (if birthday unknown)")}{optTag(rf.age.required)}
                  <div className="mt-0.5 flex items-center gap-2">
                    <NumInput
                      disabled={cat.ageUnknown}
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={cat.ageUnknown ? "" : cat.ageValue}
                      onChange={(e) => updateCat(idx, { ageValue: e.target.value })}
                      placeholder={cat.ageUnknown ? tr("ไม่ทราบอายุ", "Age unknown") : tr("อายุ", "Age")}
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
                        <option value="year">{tr("ปี", "years")}</option>
                        <option value="month">{tr("เดือน", "months")}</option>
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
                      {tr("ไม่ทราบ", "Not sure")}
                    </label>
                  </div>
                </div>
                )}
                </>
                )}
                {rf.weight.enabled && (
                <div className="text-[11px] font-bold text-brown-soft">
                  {rf.weight.label}{optTag(rf.weight.required)}
                  <div className="mt-0.5 flex items-center gap-2">
                    <NumInput
                      required={rf.weight.required && !cat.weightUnknown}
                      disabled={cat.weightUnknown}
                      type="number"
                      min="0"
                      step="0.1"
                      inputMode="decimal"
                      value={cat.weightUnknown ? "" : cat.weightKg}
                      onChange={(e) => updateCat(idx, { weightKg: e.target.value })}
                      placeholder={cat.weightUnknown ? tr("ไม่ทราบน้ำหนัก", "Weight unknown") : tr("เช่น 4.5", "e.g. 4.5")}
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
                      {tr("ไม่ทราบ", "Not sure")}
                    </label>
                  </div>
                </div>
                )}

                {rf.medical.enabled && (
                <StaffNoteTagPicker
                  label={rf.medical.required ? `${rf.medical.label} *` : rf.medical.label}
                  medicalValue={cat.medical}
                  noteValue={cat.note}
                  onChange={(medical, note) => updateCat(idx, { medical, note })}
                />
                )}
                {rf.seizure.enabled && (
                <label className="block text-[11px] font-bold text-brown-soft">
                  {rf.seizure.label}{" "}
                  <span className="font-normal text-brown-faint">
                    {rf.seizure.required ? tr("(ไม่มีพิมพ์ว่า ไม่มี)", "(type \"none\" if none)") : tr("(ไม่มีเว้นว่างได้)", "(leave blank if none)")}
                  </span>
                  <input
                    value={cat.seizureHistory}
                    onChange={(e) => updateCat(idx, { seizureHistory: e.target.value })}
                    placeholder={tr("เช่น ไม่เคย · หรือ เคยชักตอนตกใจ", "e.g. never · or had a seizure when scared")}
                    className={`${subFieldClass} mt-0.5 font-normal text-brown`}
                  />
                </label>
                )}
                {rf.allergy.enabled && (
                <label className="block text-[11px] font-bold text-brown-soft">
                  {rf.allergy.label}{" "}
                  <span className="font-normal text-brown-faint">
                    {rf.allergy.required ? tr("(ไม่มีพิมพ์ว่า ไม่มี)", "(type \"none\" if none)") : tr("(ไม่มีเว้นว่างได้)", "(leave blank if none)")}
                  </span>
                  <input
                    value={cat.allergy}
                    onChange={(e) => updateCat(idx, { allergy: e.target.value })}
                    placeholder={tr("เช่น ไม่มี · หรือ แพ้ไก่ แพ้แชมพูบางยี่ห้อ", "e.g. none · or allergic to chicken, some shampoos")}
                    className={`${subFieldClass} mt-0.5 font-normal text-brown`}
                  />
                </label>
                )}

                {(() => {
                  const h = historyFor(cat);
                  if (!h || h.pet.length === 0) return null;
                  return (
                    <div className="space-y-3 border-t border-petflow-line pt-3">
                      <p className="text-sm font-extrabold text-petflow-chocolate">
                        {tr(`ประวัติน้อง${speciesWords(cat.species || undefined, config).th}`, "Pet history")}
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
                    {tr(`ลบน้อง${pw.th}ตัวนี้`, "Remove this pet")}
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
              <span className="block text-sm font-extrabold">{tr(`เพิ่มน้อง${pw.th}อีกตัว`, `Add another ${pw.en}`)}</span>
              <span className="block text-[11px] text-petflow-chocolate/70">{tr("มีหลายตัว เพิ่มได้ทุกตัวเลยค่ะ", "Have more? Add them all")}</span>
            </span>
            <Icon name="paw" size={22} className="text-petflow-chocolate/60" />
          </button>
        </section>

        {/* ── รู้จักเราจากทางไหน ── */}
        {rf.referral.enabled && (
        <section>
          <SectionLabel>
            {tr("Referral · ", "")}{rf.referral.label}{" "}
            {rf.referral.required && <span className="text-red-600">*</span>}
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
                {enWord(opt, locale)}
              </button>
            ))}
          </div>
        </section>
        )}

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
              {tr("มีโค้ดเพื่อนแนะนำ", "I have a referral code")}
              <span className="block text-[11px] font-normal text-brown-faint">
                {tr("กรอกโค้ด รับคูปอง", "Enter the code to get a")} {referralReward(config).amount}฿ {tr("ทั้งคุณและเพื่อน", "coupon for you and your friend")}
              </span>
            </span>
          </label>
          {hasReferralCode && (
            <input
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
              placeholder={tr("เช่น CAT1A2B3C", "e.g. CAT1A2B3C")}
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
            {tr("ยินยอมให้ส่งข่าวสาร โปรโมชั่น และสิทธิพิเศษ", "Send me news, promotions and special offers")}
            <span className="mt-0.5 block text-[11px] text-brown-faint">
              {tr("ถ้าไม่ยินยอม จะไม่ได้รับโปร/ข่าวสาร แต่ยังได้รับการยืนยันนัดและแจ้งชำระเงินตามปกติ", "If unticked you won't get promos, but you'll still get booking confirmations and payment notices")}
            </span>
          </span>
        </label>

        {error && (
          <p ref={errorRef} className="rounded-petflow-sm bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className={BTN_PRIMARY}
        >
          {saving ? tr("กำลังบันทึก…", "Saving…") : tr("บันทึกข้อมูล", "Save")}
        </button>
      </form>
      <ReviewSheet
        open={reviewing}
        sections={reviewing ? reviewSections() : []}
        saving={saving}
        error={error}
        confirmLabel={tr("ยืนยัน สมัครสมาชิก", "Confirm sign-up")}
        onEdit={() => {
          setReviewing(false);
          setError("");
        }}
        onConfirm={save}
      />
    </div>
  );
}
