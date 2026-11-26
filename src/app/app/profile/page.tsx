"use client";

import { savedPopup } from "@/components/Toast";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiff } from "@/components/LiffProvider";
import { useConfig } from "@/components/ConfigProvider";
import { isFeatureOn } from "@/lib/features";
import { OTHER_BREED } from "@/lib/cat-breeds";
import { asksSpecies, speciesName, breedOptionsFor, breedOptionsForSpecies, petWords, speciesOf, speciesWords, type PetSpecies } from "@/lib/pet-kind";
import { SpeciesPicker } from "@/components/SpeciesPicker";
import { LoadingScreen } from "@/components/LoadingScreen";
import { StaffNoteTagPicker } from "@/components/StaffNoteTagPicker";
import { BirthdayPicker } from "@/components/BirthdayPicker";
import { BTN_PRIMARY, PageHeader } from "@/components/PageHeader";
import { EmptyState, SectionLabel } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { CatPhoto } from "@/components/CatPhoto";
import { toJpegDataUrl } from "@/lib/image-convert";
import { TaxInvoiceFields } from "@/components/TaxInvoiceFields";
import {
  formToTaxInvoice,
  taxInvoiceProblem,
  taxInvoiceToForm,
  type TaxInvoiceForm,
} from "@/lib/tax-invoice";
import { customerFetch } from "@/lib/customer-fetch";
import { NumInput } from "@/components/NumInput";
import { resolveRegisterForm } from "@/lib/register-form";
import { breedLabel, enWord } from "@/lib/en-words";
import {
  EmergencyContactInput,
  emergencyFromForm,
  emptyEmergencyForm,
  type EmergencyForm,
} from "@/components/EmergencyContactInput";
import { ReviewSheet, reviewDate, type ReviewSection } from "@/components/ReviewSheet";
import { useTr, useLocale } from "@/components/LocaleProvider";

const REFERRAL_FALLBACK = [
  "Facebook",
  "Instagram",
  "TikTok",
  "Google / ค้นหา",
  "Google Maps",
  "เพื่อนแนะนำ / ผ่านหน้าร้าน",
];

type CatForm = {
  id: string;
  name: string;
  /** หมา/แมว — ถามเฉพาะร้านที่รับทั้งสองแบบ */
  species: PetSpecies | "";
  gender: "" | "male" | "female";
  breed: string;
  breedOther: string;
  ageValue: string;
  ageUnit: "year" | "month";
  weightKg: string;
  neutered: "" | "yes" | "no";
  vaccinated: "" | "yes" | "no";
  birthday: string;
  medical: string;
  seizureHistory: string;
  allergy: string;
  note: string;
};

export default function ProfilePage() {
  const { locale } = useLocale();
  const tr = useTr();
  const { ready, profile } = useLiff();
  const { config } = useConfig();
  const breeds = breedOptionsFor(config);
  const pw = petWords(config);
  const referrals = config.options?.referralOptions?.length
    ? config.options.referralOptions
    : REFERRAL_FALLBACK;

  const [loading, setLoading] = useState(true);
  const [found, setFound] = useState(false);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [referral, setReferral] = useState("");
  const [address, setAddress] = useState("");
  const [addressMapUrl, setAddressMapUrl] = useState("");
  const [postalCode, setPostalCode] = useState("");
  // เบอร์ติดต่อฉุกเฉิน — กรอกไว้ตอนสมัคร แก้ได้ที่นี่ (ร้านปิดช่องนี้ = ไม่แสดง)
  const emergencyField = resolveRegisterForm(config.registerForm, locale).emergency;
  const nicknameField = resolveRegisterForm(config.registerForm, locale).ownerNickname;
  const [emergency, setEmergency] = useState<EmergencyForm>(() => emptyEmergencyForm());
  const [consent, setConsent] = useState(true);
  const [taxInvoice, setTaxInvoice] = useState<TaxInvoiceForm>(() => taxInvoiceToForm(null));
  const [saveError, setSaveError] = useState("");
  const [cats, setCats] = useState<CatForm[]>([]);
  // รูปน้องแยกโหลด/อัปทีละตัว (ไม่ผูกกับปุ่มบันทึก) — อัปแล้วขึ้นทันที
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  // รูปของน้องที่ยังไม่ได้บันทึก (key = id "new-…") — โชว์ไว้ก่อน แล้วอัปให้อัตโนมัติตอนกดบันทึก
  const [pendingPhotos, setPendingPhotos] = useState<Record<string, string>>({});
  const [photoError, setPhotoError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // ป๊อปอัปสรุปให้เช็คก่อนบันทึกจริง
  const [reviewing, setReviewing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!profile?.lineUserId) return;
    customerFetch(`/api/customers/self?lineUserId=${profile.lineUserId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.found) return;
        setFound(true);
        const c = d.customer;
        setName(c.name || "");
        setNickname(c.nickname || "");
        setPhone(c.phone || "");
        setEmail(c.email || "");
        setBirthday(c.birthday || "");
        setReferral(c.referralSource || "");
        setAddress(c.address || "");
        setAddressMapUrl(c.addressMapUrl || "");
        setPostalCode(c.postalCode || "");
        setEmergency(emptyEmergencyForm(c.emergencyContact));
        setConsent(c.marketingConsent !== false);
        setTaxInvoice(taxInvoiceToForm(c.taxInvoice));
        setCats(
          (c.cats || []).map((x: Record<string, unknown>) => {
            const breedVal = String(x.breed || "");
            const known = breeds.includes(breedVal);
            return {
              id: String(x.id),
              name: String(x.name || ""),
              species: speciesOf({ species: x.species as string, breed: breedVal }, config) || "",
              gender: (x.gender as CatForm["gender"]) || "",
              breed: breedVal ? (known ? breedVal : OTHER_BREED) : "",
              breedOther: breedVal && !known ? breedVal : "",
              ageValue: x.ageValue != null ? String(x.ageValue) : "",
              ageUnit: (x.ageUnit as "year" | "month") || "year",
              weightKg: x.weightKg != null ? String(x.weightKg) : "",
              neutered: x.neutered === true ? "yes" : x.neutered === false ? "no" : "",
              vaccinated: x.vaccinated === true ? "yes" : x.vaccinated === false ? "no" : "",
              birthday: String(x.birthday || ""),
              medical: String(x.medical || ""),
              seizureHistory: String(x.seizureHistory || ""),
              allergy: String(x.allergy || ""),
              note: String(x.note || ""),
            };
          })
        );
      })
      .finally(() => setLoading(false));
  }, [profile?.lineUserId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPhotos = async (lineUserId: string) => {
    const d = await customerFetch(`/api/customers/cat-photo?lineUserId=${encodeURIComponent(lineUserId)}`)
      .then((r) => r.json())
      .catch(() => ({ cats: [] }));
    const map: Record<string, string | null> = {};
    for (const c of (d.cats || []) as { id: string; photoDataUrl?: string | null }[]) map[c.id] = c.photoDataUrl || null;
    setPhotos(map);
  };

  useEffect(() => {
    if (profile?.lineUserId) loadPhotos(profile.lineUserId);
  }, [profile?.lineUserId, reloadKey]);

  const postPhoto = async (lineUserId: string, catId: string, photoDataUrl: string) => {
    const res = await customerFetch("/api/customers/cat-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineUserId, catId, photoDataUrl }),
    });
    if (!res.ok) throw new Error(tr("อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้งนะคะ", "Photo upload failed. Please try again."));
  };

  const pickPendingPhoto = async (tempId: string, file: File) => {
    setPhotoError("");
    try {
      const url = await toJpegDataUrl(file);
      setPendingPhotos((m) => ({ ...m, [tempId]: url }));
    } catch {
      setPhotoError(tr("เปิดรูปนี้ไม่ได้ ลองเลือกรูปอื่นนะคะ", "Can't open this photo. Please choose another."));
    }
  };

  const uploadPhoto = async (catId: string, file: File) => {
    if (!profile?.lineUserId) return;
    setPhotoError("");
    setUploadingId(catId);
    try {
      const photoDataUrl = await toJpegDataUrl(file);
      await postPhoto(profile.lineUserId, catId, photoDataUrl);
      await loadPhotos(profile.lineUserId);
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : tr("อัปโหลดรูปไม่สำเร็จ", "Photo upload failed"));
    } finally {
      setUploadingId(null);
    }
  };

  const updateCat = (idx: number, patch: Partial<CatForm>) =>
    setCats((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));

  // id ขึ้นต้นด้วย "new-" = ยังไม่บันทึกจริง — /api/customers/self ใช้แยกว่าต้องสร้างใหม่ ไม่ใช่แก้ตัวเดิม
  const addCat = () =>
    setCats((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        name: "",
        species: "",
        gender: "",
        breed: "",
        breedOther: "",
        ageValue: "",
        ageUnit: "year",
        weightKg: "",
        neutered: "",
        vaccinated: "",
        birthday: "",
        medical: "",
        seizureHistory: "",
        allergy: "",
        note: "",
      },
    ]);

  const removeCat = (idx: number) => {
    const id = cats[idx]?.id;
    if (id) setPendingPhotos((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== id)));
    setCats((prev) => prev.filter((_, i) => i !== idx));
  };

  /** สรุปข้อมูลทั้งหมดก่อนบันทึก */
  const reviewSections = (): ReviewSection[] => [
    {
      title: tr("ข้อมูลผู้ปกครอง", "Owner details"),
      icon: "user",
      rows: [
        { label: tr("ชื่อผู้ปกครอง", "Owner name"), value: name },
        ...(nicknameField.enabled ? [{ label: nicknameField.label, value: nickname }] : []),
        { label: tr("เบอร์โทร", "Phone"), value: phone },
        { label: tr("อีเมล", "Email"), value: email },
        { label: tr("วันเกิด", "Birthday"), value: reviewDate(birthday, locale) },
        { label: tr("ที่อยู่บ้าน", "Home address"), value: address },
        { label: tr("ลิงก์แผนที่", "Map link"), value: addressMapUrl ? tr("แนบแล้ว", "Attached") : "" },
        { label: tr("รหัสไปรษณีย์", "Postal code"), value: postalCode },
        ...(emergencyField.enabled
          ? [{ label: emergencyField.label, value: [emergency.phone.trim(), emergency.relation.trim()].filter(Boolean).join(" · ") }]
          : []),
        ...(taxInvoice.on ? [{ label: tr("ใบกำกับภาษี", "Tax invoice"), value: [taxInvoice.name, taxInvoice.taxId].map((x) => x.trim()).filter(Boolean).join(" · ") }] : []),
      ],
    },
    ...cats
      .filter((c) => c.name.trim())
      .map((c) => ({
        title: c.id.startsWith("new-") ? tr(`น้อง${c.name.trim()} (เพิ่มใหม่)`, `${c.name.trim()} (new)`) : tr(`น้อง${c.name.trim()}`, c.name.trim()),
        icon: "paw",
        rows: [
          ...(asksSpecies(config) ? [{ label: tr("ชนิด", "Species"), value: speciesName(config, c.species) }] : []),
          { label: tr("เพศ", "Sex"), value: c.gender === "male" ? tr("♂ ผู้", "♂ Male") : c.gender === "female" ? tr("♀ เมีย", "♀ Female") : "" },
          { label: tr("สายพันธุ์", "Breed"), value: c.breed === OTHER_BREED ? c.breedOther : c.breed },
          { label: tr("ทำหมัน", "Neutered"), value: c.neutered === "yes" ? tr("ทำหมันแล้ว", "Neutered") : c.neutered === "no" ? tr("ยังไม่ทำ", "Not yet") : "" },
          {
            label: tr("อายุ", "Age"),
            value: [
              c.ageValue ? `${c.ageValue} ${c.ageUnit === "month" ? tr("เดือน", "months") : tr("ปี", "years")}` : "",
              c.birthday ? `${tr("เกิด", "born")} ${reviewDate(c.birthday, locale)}` : "",
            ]
              .filter(Boolean)
              .join(" · "),
          },
          { label: tr("น้ำหนัก", "Weight"), value: c.weightKg ? `${c.weightKg} ${tr("กก.", "kg")}` : "" },
          { label: tr("โรคประจำตัว / เรื่องที่ช่างต้องรู้", "Health conditions / notes for the groomer"), value: [c.medical, c.note].map((x) => x.trim()).filter(Boolean).join("\n") },
          { label: tr("ประวัติการชัก/ช็อค", "Seizure/shock history"), value: c.seizureHistory },
          { label: tr("ประวัติการแพ้", "Allergies"), value: c.allergy },
        ],
      })),
    {
      title: tr("อื่น ๆ", "Other"),
      icon: "sparkle",
      rows: [
        { label: tr("รู้จักเราจากทางไหน", "How did you hear about us"), value: referral },
        { label: tr("รับข่าวสาร/โปรโมชั่น", "News/promotions"), value: consent ? tr("ยินยอม", "Yes") : tr("ไม่ยินยอม", "No") },
      ],
    },
  ];

  /** กดบันทึก → เช็คข้อมูลก่อน ผ่านแล้วเปิดสรุปให้ดู (ยังไม่บันทึก) */
  const review = () => {
    if (!profile?.lineUserId || !name.trim()) return;
    if (asksSpecies(config) && cats.some((c) => c.name.trim() && !c.species)) {
      setSaveError(tr("เลือกชนิดของน้องแต่ละตัวด้วยนะคะ", "Please choose the species for each pet."));
      return;
    }
    if (emergency.phone.trim() && emergency.phone.replace(/\D/g, "").length < 9) {
      setSaveError(tr("เบอร์ติดต่อฉุกเฉินยังไม่ครบ ลองเช็คอีกทีนะคะ", "The emergency phone number looks incomplete. Please check it."));
      return;
    }
    const taxProblem = taxInvoiceProblem(formToTaxInvoice(taxInvoice), locale);
    setSaveError(taxProblem);
    if (taxProblem) return;
    setReviewing(true);
  };

  const save = async () => {
    if (!profile?.lineUserId || !name.trim()) return;
    setSaving(true);
    setSaved(false);
    setSaveError("");
    try {
      const res = await customerFetch("/api/customers/self", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId: profile.lineUserId,
          name: name.trim(),
          ...(nicknameField.enabled ? { nickname: nickname.trim() } : {}),
          phone: phone.trim(),
          email: email.trim(),
          birthday,
          referralSource: referral,
          address,
          addressMapUrl,
          postalCode,
          taxInvoice: formToTaxInvoice(taxInvoice),
          ...(emergencyField.enabled ? { emergencyContact: emergencyFromForm(emergency) ?? null } : {}),
          marketingConsent: consent,
          cats: cats.map((c) => ({
            id: c.id,
            name: c.name,
            species: c.species || undefined,
            gender: c.gender || undefined,
            breed:
              (c.breed === OTHER_BREED ? c.breedOther.trim() : c.breed) || undefined,
            ageValue: c.ageValue,
            ageUnit: c.ageUnit,
            weightKg: c.weightKg,
            neutered: c.neutered ? c.neutered === "yes" : null,
            vaccinated: c.vaccinated ? c.vaccinated === "yes" : null,
            birthday: c.birthday || undefined,
            medical: c.medical || undefined,
            seizureHistory: c.seizureHistory.trim(),
            allergy: c.allergy.trim(),
            note: c.note || undefined,
          })),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setSaveError(d.error || tr("บันทึกไม่สำเร็จ ลองใหม่อีกครั้งนะคะ", "Couldn't save. Please try again."));
      }
      if (res.ok) {
        // อัปรูปที่เลือกไว้ให้น้องที่เพิ่งได้ id จริง
        const d = await res.json().catch(() => ({}));
        const failed: string[] = [];
        for (const { tempId, id } of (d.created || []) as { tempId: string; id: string }[]) {
          const url = pendingPhotos[tempId];
          if (!url) continue;
          await postPhoto(profile.lineUserId, id, url).catch(() =>
            failed.push(cats.find((c) => c.id === tempId)?.name || tr("น้อง", "pet"))
          );
        }
        setPendingPhotos({});
        if (failed.length)
          setPhotoError(tr(`บันทึกข้อมูลแล้ว แต่อัปรูป ${failed.join(", ")} ไม่สำเร็จ ลองเพิ่มรูปใหม่อีกครั้งนะคะ`, `Saved, but the photo for ${failed.join(", ")} didn't upload. Please add it again.`));
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        setReviewing(false);
        savedPopup(tr("บันทึกข้อมูลสำเร็จ", "Saved"));
        // โหลดใหม่ให้น้องที่เพิ่งเพิ่ม (id "new-…") ได้ id จริง — ไม่งั้นกดบันทึกซ้ำจะสร้างซ้ำ และอัปรูปได้ทันที
        setReloadKey((k) => k + 1);
      }
    } catch {
      setSaveError(tr("เชื่อมต่อไม่สำเร็จ — เช็คสัญญาณอินเทอร์เน็ตแล้วลองใหม่นะคะ", "Connection failed. Check your internet and try again."));
    } finally {
      setSaving(false);
    }
  };

  const field = "min-h-[44px] w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm";
  const sub = "min-h-[44px] w-full rounded-xl border border-petflow-line bg-paper px-3 py-2 text-sm";
  const chip = (on: boolean) =>
    `min-h-[44px] rounded-full px-4 text-xs font-bold transition ${
      on ? "bg-latte/40 text-petflow-chocolate ring-1 ring-latte-deep" : "bg-paper text-brown-soft"
    }`;

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader
        eyebrow="Profile"
        title={tr("แก้ไขข้อมูลของฉัน", "Edit my details")}
        back="/app"
        backLabel={tr("กลับหน้าแรก", "Back to home")}
        showLang={false}
      />

      {!ready || loading ? (
        <LoadingScreen />
      ) : !found ? (
        <>
          <div className="rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
            <EmptyState icon="user" title={tr("ยังไม่มีข้อมูลของคุณในระบบ", "We don't have your details yet")} />
          </div>
          <Link href="/app/register" className={`mt-5 ${BTN_PRIMARY}`}>
            <Icon name="edit" size={18} />
            {tr("ลงทะเบียนก่อนค่ะ", "Sign up first")}
          </Link>
        </>
      ) : (
        <>
          {/* ลูกค้าอัปเดตยาเห็บหมัดเองได้ ไม่ต้องรอร้านส่งการ์ด (ร้านปิดการ์ดนี้ = ไม่โชว์) */}
          {isFeatureOn(config, "fleaUpdate") && (
            <Link
              href="/app/flea"
              className="mb-4 flex min-h-[56px] items-center gap-3 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-lg">💧</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-petflow-chocolate">{tr("อัปเดตยากำจัดเห็บหมัด", "Update flea & tick treatment")}</span>
                <span className="block text-[11px] text-brown-soft">
                  {tr("ให้ยาน้องแล้ว แจ้งวันที่ + แนบรูปให้ร้านได้เลย", "Treated your pet? Send the date and a photo")}
                </span>
              </span>
              <Icon name="chevron" size={16} className="text-brown-faint" />
            </Link>
          )}
          {/* ── ผู้ปกครอง ── */}
          <SectionLabel>{tr("Owner · ผู้ปกครอง", "Owner")}</SectionLabel>
          <div className="space-y-3 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
            <label className="block text-xs font-bold text-brown-soft">
              {tr("ชื่อ-นามสกุล", "Full name")}
              <input value={name} onChange={(e) => setName(e.target.value)} className={`${field} mt-1 font-bold text-brown`} />
            </label>
            {nicknameField.enabled && (
              <label className="block text-xs font-bold text-brown-soft">
                {nicknameField.label}
                <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={tr("เช่น มาย", "e.g. May")} className={`${field} mt-1`} />
              </label>
            )}
            <label className="block text-xs font-bold text-brown-soft">
              {tr("เบอร์โทร", "Phone")}
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="08x-xxx-xxxx" className={`${field} mt-1`} />
            </label>
            {emergencyField.enabled && (
              <EmergencyContactInput
                value={emergency}
                onChange={setEmergency}
                label={emergencyField.label}
                required={false}
                inputClass={field}
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-brown-soft">
                {tr("อีเมล", "Email")}
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@email.com" className={`${field} mt-1`} />
              </label>
              <label className="block text-xs font-bold text-brown-soft">
                {tr("วันเกิด", "Birthday")}
                <input value={birthday} onChange={(e) => setBirthday(e.target.value)} type="date" className={`${field} mt-1`} />
              </label>
            </div>
            <label className="block text-xs font-bold text-brown-soft">
              {tr("ที่อยู่บ้าน", "Home address")}{" "}
              <span className="font-normal text-brown-faint">{tr("(ไว้ใช้บริการรับ-ส่ง)", "(for pick-up/drop-off)")}</span>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={tr("เช่น บ้านเลขที่ ซอย ถนน แขวง/ตำบล เขต/อำเภอ", "e.g. house no., street, district")}
                rows={2}
                className={`${field} mt-1`}
              />
            </label>
            <label className="block text-xs font-bold text-brown-soft">
              {tr("ลิงก์ Google Maps", "Google Maps link")}
              <input
                value={addressMapUrl}
                onChange={(e) => setAddressMapUrl(e.target.value)}
                placeholder={tr("เปิด Maps แล้วกดแชร์ลิงก์มาวางตรงนี้", "Open Maps, tap Share and paste the link here")}
                className={`${field} mt-1`}
              />
            </label>
            <label className="block text-xs font-bold text-brown-soft">
              {tr("รหัสไปรษณีย์", "Postal code")}
              <input
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
                inputMode="numeric"
                placeholder={tr("เช่น 10260", "e.g. 10260")}
                className={`${field} mt-1`}
              />
            </label>
            <div className="border-t border-petflow-line pt-3 empty:hidden">
              <TaxInvoiceFields
                value={taxInvoice}
                onChange={setTaxInvoice}
                fieldClass={field}
                prefill={{ name, phone, address }}
              />
            </div>
          </div>

          {/* ── น้องแมว ── */}
          <div className="mt-6 space-y-3">
            <SectionLabel>{tr(`My ${pw.enPlural} · น้อง${pw.th}ของฉัน`, `My ${pw.enPlural}`)}</SectionLabel>
            {cats.map((cat, idx) => (
              <div key={cat.id} className="space-y-2.5 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
                {!cat.id.startsWith("new-") ? (
                  <CatPhoto
                    src={photos[cat.id]}
                    name={cat.name || tr(`น้อง${speciesWords(cat.species || undefined, config).th}`, speciesWords(cat.species || undefined, config).en)}
                    size={0}
                    onPick={(f) => uploadPhoto(cat.id, f)}
                    uploading={uploadingId === cat.id}
                  />
                ) : (
                  <CatPhoto
                    src={pendingPhotos[cat.id]}
                    name={cat.name || tr(`น้อง${speciesWords(cat.species || undefined, config).th}`, speciesWords(cat.species || undefined, config).en)}
                    size={0}
                    onPick={(f) => pickPendingPhoto(cat.id, f)}
                  />
                )}
                <SpeciesPicker
                  value={cat.species}
                  onChange={(species) =>
                    updateCat(idx, {
                      species,
                      // สายพันธุ์เดิมที่ไม่ใช่ของชนิดนี้ต้องเลือกใหม่
                      breed:
                        cat.breed === OTHER_BREED || breedOptionsForSpecies(config, species).includes(cat.breed)
                          ? cat.breed
                          : "",
                    })
                  }
                />
                <label className="block text-xs font-bold text-brown-soft">
                  {tr("ชื่อน้อง", "Pet's name")}
                  <input value={cat.name} onChange={(e) => updateCat(idx, { name: e.target.value })} className={`${sub} mt-1 font-bold text-brown`} />
                </label>
                <div className="flex gap-1 rounded-full bg-paper p-1">
                  {([["male", tr("♂ ผู้", "♂ Male")], ["female", tr("♀ เมีย", "♀ Female")]] as const).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={cat.gender === v}
                      onClick={() => updateCat(idx, { gender: cat.gender === v ? "" : v })}
                      className={`min-h-[40px] flex-1 rounded-full text-sm font-bold transition ${cat.gender === v ? "bg-card text-petflow-chocolate shadow-petflow-sm" : "text-brown-soft"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <select
                  value={cat.breed}
                  onChange={(e) => updateCat(idx, { breed: e.target.value })}
                  className={`${sub} ${cat.breed ? "text-brown" : "text-brown-faint"}`}
                >
                  <option value="">{tr("เลือกสายพันธุ์…", "Choose breed…")}</option>
                  {breedOptionsForSpecies(config, cat.species || undefined).map((b) => (
                    <option key={b} value={b} className="text-brown">{breedLabel(b, locale)}</option>
                  ))}
                  <option value={OTHER_BREED} className="text-brown">{breedLabel(OTHER_BREED, locale)}</option>
                </select>
                {cat.breed === OTHER_BREED && (
                  <input value={cat.breedOther} onChange={(e) => updateCat(idx, { breedOther: e.target.value })} placeholder={tr("ระบุสายพันธุ์", "Enter breed")} className={sub} />
                )}
                <div className="flex gap-1 rounded-full bg-paper p-1">
                  {([["yes", tr("ทำหมันแล้ว", "Neutered")], ["no", tr("ยังไม่ทำ", "Not yet")]] as const).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={cat.neutered === v}
                      onClick={() => updateCat(idx, { neutered: cat.neutered === v ? "" : v })}
                      className={`min-h-[40px] flex-1 rounded-full text-sm font-bold transition ${cat.neutered === v ? "bg-card text-petflow-chocolate shadow-petflow-sm" : "text-brown-soft"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 rounded-full bg-paper p-1">
                  {([["yes", tr("วัคซีนครบแล้ว", "Vaccines up to date")], ["no", tr("วัคซีนยังไม่ครบ", "Vaccines not complete")]] as const).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={cat.vaccinated === v}
                      onClick={() => updateCat(idx, { vaccinated: cat.vaccinated === v ? "" : v })}
                      className={`min-h-[40px] flex-1 rounded-full text-sm font-bold transition ${cat.vaccinated === v ? "bg-card text-petflow-chocolate shadow-petflow-sm" : "text-brown-soft"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <NumInput
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={cat.ageValue}
                    onChange={(e) => updateCat(idx, { ageValue: e.target.value })}
                    placeholder={tr("อายุ", "Age")}
                    className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-petflow-line bg-paper px-3 py-2 text-sm"
                  />
                  <select
                    value={cat.ageUnit}
                    onChange={(e) => updateCat(idx, { ageUnit: e.target.value as "year" | "month" })}
                    className="min-h-[44px] w-24 shrink-0 rounded-xl border border-petflow-line bg-paper px-3 py-2 text-sm"
                  >
                    <option value="year">{tr("ปี", "years")}</option>
                    <option value="month">{tr("เดือน", "months")}</option>
                  </select>
                </div>
                <label className="block text-[11px] font-bold text-brown-soft">
                  {tr("น้ำหนัก", "Weight")} <span className="font-normal text-brown-faint">{tr("(กก. · ไม่บังคับ)", "(kg · optional)")}</span>
                  <NumInput
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    value={cat.weightKg}
                    onChange={(e) => updateCat(idx, { weightKg: e.target.value })}
                    placeholder={tr("เช่น 4.5", "e.g. 4.5")}
                    className={`${sub} mt-0.5`}
                  />
                </label>
                <div className="text-[11px] font-bold text-brown-soft">
                  {tr("วันเกิดน้อง", "Pet's birthday")} <span className="font-normal text-brown-faint">{tr("(ถ้าทราบ)", "(if known)")}</span>
                  <div className="mt-0.5">
                    <BirthdayPicker
                      value={cat.birthday}
                      onChange={(iso) => updateCat(idx, { birthday: iso })}
                      yearsBack={25}
                      allowUnknown
                    />
                  </div>
                </div>
                <StaffNoteTagPicker
                  label={tr("โรคประจำตัว / เรื่องที่ช่างต้องรู้", "Health conditions / notes for the groomer")}
                  medicalValue={cat.medical}
                  noteValue={cat.note}
                  onChange={(medical, note) => updateCat(idx, { medical, note })}
                />
                <label className="block text-[11px] font-bold text-brown-soft">
                  {tr("ประวัติการชัก/ช็อค", "Seizure/shock history")} <span className="font-normal text-brown-faint">{tr("(ไม่มีเว้นว่างได้)", "(leave blank if none)")}</span>
                  <input value={cat.seizureHistory} onChange={(e) => updateCat(idx, { seizureHistory: e.target.value })} placeholder={tr("เช่น ไม่เคย · หรือ เคยชักตอนตกใจ", "e.g. never · or had a seizure when frightened")} className={`${sub} mt-0.5 font-normal text-brown`} />
                </label>
                <label className="block text-[11px] font-bold text-brown-soft">
                  {tr("ประวัติการแพ้", "Allergies")} <span className="font-normal text-brown-faint">{tr("(อาหาร / ยา / แชมพู)", "(food / medicine / shampoo)")}</span>
                  <input value={cat.allergy} onChange={(e) => updateCat(idx, { allergy: e.target.value })} placeholder={tr("เช่น ไม่มี · หรือ แพ้ไก่ แพ้แชมพูบางยี่ห้อ", "e.g. none · or chicken, some shampoos")} className={`${sub} mt-0.5 font-normal text-brown`} />
                </label>
                {cat.id.startsWith("new-") && (
                  <button
                    type="button"
                    onClick={() => removeCat(idx)}
                    className="-ml-1 flex min-h-[44px] items-center gap-1.5 px-1 text-xs font-bold text-brown-soft"
                  >
                    <Icon name="trash" size={15} />
                    {tr(`ลบน้อง${pw.th}ตัวนี้`, `Remove this ${pw.en}`)}
                  </button>
                )}
              </div>
            ))}
            {photoError && (
              <p className="flex items-center gap-2 text-xs font-bold text-wait">
                <Icon name="alert" size={15} />
                {photoError}
              </p>
            )}
            {/* ปุ่มเพิ่มน้องต้องเห็นชัด — ลูกค้าหลายบ้านมีแมวมากกว่าหนึ่งตัว */}
            <button
              type="button"
              onClick={addCat}
              className="flex min-h-[60px] w-full items-center gap-3 rounded-petflow border-2 border-honey-deep bg-honey/45 px-4 text-left text-petflow-chocolate shadow-petflow-sm transition active:scale-[.98]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-petflow-chocolate text-card">
                <Icon name="plus" size={20} strokeWidth={2.4} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold">{tr(`เพิ่มน้อง${pw.th}อีกตัว`, `Add another ${pw.en}`)}</span>
                <span className="block text-[11px] text-petflow-chocolate/70">{tr("มีหลายตัว เพิ่มได้ทุกตัวเลยค่ะ", "Have several? Add them all.")}</span>
              </span>
              <Icon name="paw" size={22} className="text-petflow-chocolate/60" />
            </button>
            <p className="text-[11px] text-brown-faint">
              {tr("กรอกข้อมูลน้องใหม่แล้วกด “บันทึก” ด้านล่างเพื่อเพิ่มเข้าระบบ 🧡", "Fill in the new pet's details, then tap “Save” below 🧡")}
            </p>
          </div>

          {/* ── รู้จักเราจากทางไหน ── */}
          <div className="mt-6">
            <SectionLabel>{tr("Referral · รู้จักเราจากทางไหน?", "How did you hear about us?")}</SectionLabel>
            <div className="flex flex-wrap gap-2 rounded-petflow border border-petflow-line bg-card p-3 shadow-petflow-sm">
              {referrals.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  aria-pressed={referral === opt}
                  onClick={() => setReferral((p) => (p === opt ? "" : opt))}
                  className={chip(referral === opt)}
                >
                  {enWord(opt, locale)}
                </button>
              ))}
            </div>
          </div>

          {/* ── ยินยอมรับข่าวสาร ── */}
          <label className="mt-4 flex min-h-[48px] cursor-pointer items-center gap-3 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="h-5 w-5 flex-none accent-latte-deep" />
            <span className="text-xs text-brown">{tr("ยินยอมให้ส่งข่าวสาร โปรโมชั่น และสิทธิพิเศษ", "I agree to receive news, promotions and special offers")}</span>
          </label>

          <button
            type="button"
            onClick={review}
            disabled={saving || !name.trim()}
            className={`mt-6 ${BTN_PRIMARY}`}
          >
            {saving ? tr("กำลังบันทึก…", "Saving…") : tr("บันทึกข้อมูล", "Save")}
          </button>
          {saveError && !reviewing && (
            <p className="mt-2 text-center text-sm font-bold text-red-700">{saveError}</p>
          )}
          <ReviewSheet
            open={reviewing}
            sections={reviewing ? reviewSections() : []}
            saving={saving}
            error={saveError}
            confirmLabel={tr("ยืนยัน บันทึกข้อมูล", "Confirm and save")}
            onEdit={() => {
              setReviewing(false);
              setSaveError("");
            }}
            onConfirm={save}
          />
          {saved && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-sm font-extrabold text-ok">
              <Icon name="check" size={16} strokeWidth={2.4} />
              {tr("บันทึกเรียบร้อยแล้วค่ะ 🧡", "Saved 🧡")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
