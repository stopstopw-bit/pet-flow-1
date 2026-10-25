"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiff } from "@/components/LiffProvider";
import { useConfig } from "@/components/ConfigProvider";
import { OTHER_BREED } from "@/lib/cat-breeds";
import { asksSpecies, breedOptionsFor, breedOptionsForSpecies, petWords, speciesOf, speciesWords, type PetSpecies } from "@/lib/pet-kind";
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
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [referral, setReferral] = useState("");
  const [address, setAddress] = useState("");
  const [addressMapUrl, setAddressMapUrl] = useState("");
  const [postalCode, setPostalCode] = useState("");
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
        setPhone(c.phone || "");
        setEmail(c.email || "");
        setBirthday(c.birthday || "");
        setReferral(c.referralSource || "");
        setAddress(c.address || "");
        setAddressMapUrl(c.addressMapUrl || "");
        setPostalCode(c.postalCode || "");
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
    if (!res.ok) throw new Error("อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้งนะคะ");
  };

  const pickPendingPhoto = async (tempId: string, file: File) => {
    setPhotoError("");
    try {
      const url = await toJpegDataUrl(file);
      setPendingPhotos((m) => ({ ...m, [tempId]: url }));
    } catch {
      setPhotoError("เปิดรูปนี้ไม่ได้ ลองเลือกรูปอื่นนะคะ");
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
      setPhotoError(e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ");
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

  const save = async () => {
    if (!profile?.lineUserId || !name.trim()) return;
    if (asksSpecies(config) && cats.some((c) => c.name.trim() && !c.species)) {
      setSaveError("เลือกว่าน้องแต่ละตัวเป็นหมาหรือแมวด้วยนะคะ");
      return;
    }
    const taxProblem = taxInvoiceProblem(formToTaxInvoice(taxInvoice));
    setSaveError(taxProblem);
    if (taxProblem) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await customerFetch("/api/customers/self", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId: profile.lineUserId,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          birthday,
          referralSource: referral,
          address,
          addressMapUrl,
          postalCode,
          taxInvoice: formToTaxInvoice(taxInvoice),
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
        setSaveError(d.error || "บันทึกไม่สำเร็จ ลองใหม่อีกครั้งนะคะ");
      }
      if (res.ok) {
        // อัปรูปที่เลือกไว้ให้น้องที่เพิ่งได้ id จริง
        const d = await res.json().catch(() => ({}));
        const failed: string[] = [];
        for (const { tempId, id } of (d.created || []) as { tempId: string; id: string }[]) {
          const url = pendingPhotos[tempId];
          if (!url) continue;
          await postPhoto(profile.lineUserId, id, url).catch(() =>
            failed.push(cats.find((c) => c.id === tempId)?.name || "น้อง")
          );
        }
        setPendingPhotos({});
        if (failed.length)
          setPhotoError(`บันทึกข้อมูลแล้ว แต่อัปรูป ${failed.join(", ")} ไม่สำเร็จ ลองเพิ่มรูปใหม่อีกครั้งนะคะ`);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        // โหลดใหม่ให้น้องที่เพิ่งเพิ่ม (id "new-…") ได้ id จริง — ไม่งั้นกดบันทึกซ้ำจะสร้างซ้ำ และอัปรูปได้ทันที
        setReloadKey((k) => k + 1);
      }
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
        title="แก้ไขข้อมูลของฉัน"
        back="/app"
        backLabel="กลับหน้าแรก"
        showLang={false}
      />

      {!ready || loading ? (
        <LoadingScreen />
      ) : !found ? (
        <>
          <div className="rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
            <EmptyState icon="user" title="ยังไม่มีข้อมูลของคุณในระบบ" />
          </div>
          <Link href="/app/register" className={`mt-5 ${BTN_PRIMARY}`}>
            <Icon name="edit" size={18} />
            ลงทะเบียนก่อนค่ะ
          </Link>
        </>
      ) : (
        <>
          {/* ── ผู้ปกครอง ── */}
          <SectionLabel>Owner · ผู้ปกครอง</SectionLabel>
          <div className="space-y-3 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
            <label className="block text-xs font-bold text-brown-soft">
              ชื่อผู้ปกครอง
              <input value={name} onChange={(e) => setName(e.target.value)} className={`${field} mt-1 font-bold text-brown`} />
            </label>
            <label className="block text-xs font-bold text-brown-soft">
              เบอร์โทร
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="08x-xxx-xxxx" className={`${field} mt-1`} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-brown-soft">
                อีเมล
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@email.com" className={`${field} mt-1`} />
              </label>
              <label className="block text-xs font-bold text-brown-soft">
                วันเกิด
                <input value={birthday} onChange={(e) => setBirthday(e.target.value)} type="date" className={`${field} mt-1`} />
              </label>
            </div>
            <label className="block text-xs font-bold text-brown-soft">
              ที่อยู่บ้าน{" "}
              <span className="font-normal text-brown-faint">(ไว้ใช้บริการรับ-ส่ง)</span>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="เช่น บ้านเลขที่ ซอย ถนน แขวง/ตำบล เขต/อำเภอ"
                rows={2}
                className={`${field} mt-1`}
              />
            </label>
            <label className="block text-xs font-bold text-brown-soft">
              ลิงก์ Google Maps
              <input
                value={addressMapUrl}
                onChange={(e) => setAddressMapUrl(e.target.value)}
                placeholder="เปิด Maps แล้วกดแชร์ลิงก์มาวางตรงนี้"
                className={`${field} mt-1`}
              />
            </label>
            <label className="block text-xs font-bold text-brown-soft">
              รหัสไปรษณีย์
              <input
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
                inputMode="numeric"
                placeholder="เช่น 10260"
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
            <SectionLabel>{`My ${pw.enPlural} · น้อง${pw.th}ของฉัน`}</SectionLabel>
            {cats.map((cat, idx) => (
              <div key={cat.id} className="space-y-2.5 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
                {!cat.id.startsWith("new-") ? (
                  <CatPhoto
                    src={photos[cat.id]}
                    name={cat.name || `น้อง${speciesWords(cat.species || undefined, config).th}`}
                    size={0}
                    onPick={(f) => uploadPhoto(cat.id, f)}
                    uploading={uploadingId === cat.id}
                  />
                ) : (
                  <CatPhoto
                    src={pendingPhotos[cat.id]}
                    name={cat.name || `น้อง${speciesWords(cat.species || undefined, config).th}`}
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
                  ชื่อน้อง
                  <input value={cat.name} onChange={(e) => updateCat(idx, { name: e.target.value })} className={`${sub} mt-1 font-bold text-brown`} />
                </label>
                <div className="flex gap-1 rounded-full bg-paper p-1">
                  {([["male", "♂ ผู้"], ["female", "♀ เมีย"]] as const).map(([v, l]) => (
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
                  <option value="">เลือกสายพันธุ์…</option>
                  {breedOptionsForSpecies(config, cat.species || undefined).map((b) => (
                    <option key={b} value={b} className="text-brown">{b}</option>
                  ))}
                  <option value={OTHER_BREED} className="text-brown">{OTHER_BREED}</option>
                </select>
                {cat.breed === OTHER_BREED && (
                  <input value={cat.breedOther} onChange={(e) => updateCat(idx, { breedOther: e.target.value })} placeholder="ระบุสายพันธุ์" className={sub} />
                )}
                <div className="flex gap-1 rounded-full bg-paper p-1">
                  {([["yes", "ทำหมันแล้ว"], ["no", "ยังไม่ทำ"]] as const).map(([v, l]) => (
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
                  {([["yes", "วัคซีนครบแล้ว"], ["no", "วัคซีนยังไม่ครบ"]] as const).map(([v, l]) => (
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
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={cat.ageValue}
                    onChange={(e) => updateCat(idx, { ageValue: e.target.value })}
                    placeholder="อายุ"
                    className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-petflow-line bg-paper px-3 py-2 text-sm"
                  />
                  <select
                    value={cat.ageUnit}
                    onChange={(e) => updateCat(idx, { ageUnit: e.target.value as "year" | "month" })}
                    className="min-h-[44px] w-24 shrink-0 rounded-xl border border-petflow-line bg-paper px-3 py-2 text-sm"
                  >
                    <option value="year">ปี</option>
                    <option value="month">เดือน</option>
                  </select>
                </div>
                <label className="block text-[11px] font-bold text-brown-soft">
                  น้ำหนัก <span className="font-normal text-brown-faint">(กก. · ไม่บังคับ)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    value={cat.weightKg}
                    onChange={(e) => updateCat(idx, { weightKg: e.target.value })}
                    placeholder="เช่น 4.5"
                    className={`${sub} mt-0.5`}
                  />
                </label>
                <div className="text-[11px] font-bold text-brown-soft">
                  วันเกิดน้อง <span className="font-normal text-brown-faint">(ถ้าทราบ)</span>
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
                  label="โรคประจำตัว / เรื่องที่ช่างต้องรู้"
                  medicalValue={cat.medical}
                  noteValue={cat.note}
                  onChange={(medical, note) => updateCat(idx, { medical, note })}
                />
                <label className="block text-[11px] font-bold text-brown-soft">
                  ประวัติการชัก/ช็อค <span className="font-normal text-brown-faint">(ไม่มีเว้นว่างได้)</span>
                  <input value={cat.seizureHistory} onChange={(e) => updateCat(idx, { seizureHistory: e.target.value })} placeholder="เช่น ไม่เคย · หรือ เคยชักตอนตกใจ" className={`${sub} mt-0.5 font-normal text-brown`} />
                </label>
                <label className="block text-[11px] font-bold text-brown-soft">
                  ประวัติการแพ้ <span className="font-normal text-brown-faint">(อาหาร / ยา / แชมพู)</span>
                  <input value={cat.allergy} onChange={(e) => updateCat(idx, { allergy: e.target.value })} placeholder="เช่น ไม่มี · หรือ แพ้ไก่ แพ้แชมพูบางยี่ห้อ" className={`${sub} mt-0.5 font-normal text-brown`} />
                </label>
                {cat.id.startsWith("new-") && (
                  <button
                    type="button"
                    onClick={() => removeCat(idx)}
                    className="-ml-1 flex min-h-[44px] items-center gap-1.5 px-1 text-xs font-bold text-brown-soft"
                  >
                    <Icon name="trash" size={15} />
                    ลบน้อง{pw.th}ตัวนี้
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
                <span className="block text-sm font-extrabold">เพิ่มน้อง{pw.th}อีกตัว</span>
                <span className="block text-[11px] text-petflow-chocolate/70">มีหลายตัว เพิ่มได้ทุกตัวเลยค่ะ</span>
              </span>
              <Icon name="paw" size={22} className="text-petflow-chocolate/60" />
            </button>
            <p className="text-[11px] text-brown-faint">
              กรอกข้อมูลน้องใหม่แล้วกด “บันทึก” ด้านล่างเพื่อเพิ่มเข้าระบบ 🧡
            </p>
          </div>

          {/* ── รู้จักเราจากทางไหน ── */}
          <div className="mt-6">
            <SectionLabel>Referral · รู้จักเราจากทางไหน?</SectionLabel>
            <div className="flex flex-wrap gap-2 rounded-petflow border border-petflow-line bg-card p-3 shadow-petflow-sm">
              {referrals.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  aria-pressed={referral === opt}
                  onClick={() => setReferral((p) => (p === opt ? "" : opt))}
                  className={chip(referral === opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* ── ยินยอมรับข่าวสาร ── */}
          <label className="mt-4 flex min-h-[48px] cursor-pointer items-center gap-3 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="h-5 w-5 flex-none accent-latte-deep" />
            <span className="text-xs text-brown">ยินยอมให้ส่งข่าวสาร โปรโมชั่น และสิทธิพิเศษ</span>
          </label>

          <button
            type="button"
            onClick={save}
            disabled={saving || !name.trim()}
            className={`mt-6 ${BTN_PRIMARY}`}
          >
            {saving ? "กำลังบันทึก…" : "บันทึกข้อมูล"}
          </button>
          {saveError && (
            <p className="mt-2 text-center text-sm font-bold text-red-700">{saveError}</p>
          )}
          {saved && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-sm font-extrabold text-ok">
              <Icon name="check" size={16} strokeWidth={2.4} />
              บันทึกเรียบร้อยแล้วค่ะ 🧡
            </p>
          )}
        </>
      )}
    </div>
  );
}
