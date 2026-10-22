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

type CatGender = "male" | "female";
type CatInput = {
  name: string;
  gender?: CatGender;
  breed: string;
  breedOther: string;
  furLength: "" | "short" | "long";
  color: string;
  ageValue: string;
  ageUnit: "year" | "month";
  /** น้ำหนัก (กก.) — เก็บเป็นข้อความระหว่างพิมพ์ */
  weightKg: string;
  birthday: string;
  medical: string;
  note: string;
  /** รูปน้อง (JPEG data URL) — อัปขึ้นหลังสมัครเสร็จ เพราะต้องรู้ id แมวก่อน */
  photo?: string;
};

const REFERRAL_OPTIONS = [
  "Facebook",
  "Instagram",
  "TikTok",
  "Google / ค้นหา",
  "Google Maps",
  "เพื่อนแนะนำ / ผ่านหน้าร้าน",
];

import { BREED_OPTIONS, OTHER_BREED } from "@/lib/cat-breeds";
import { StaffNoteTagPicker } from "@/components/StaffNoteTagPicker";

function emptyCat(): CatInput {
  return {
    name: "",
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

export default function RegisterPage() {
  const router = useRouter();
  const { profile, ready, customer, refreshCustomer, refreshAccount } = useLiff();
  const { config } = useConfig();
  const breeds = config.options?.catBreeds?.length ? config.options.catBreeds : BREED_OPTIONS;
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
  const [cats, setCats] = useState<CatInput[]>([emptyCat()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [referralCode, setReferralCode] = useState("");

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) setReferralCode(ref);
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

    const named = cats.filter((c) => c.name.trim());
    if (named.some((c) => !c.gender)) {
      setError("เลือกเพศน้องแมวทุกตัวด้วยนะคะ 🐱");
      return;
    }
    if (!referral) {
      setError("เลือกช่องทางที่รู้จักเราด้วยนะคะ");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/customers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId: profile.lineUserId,
          name,
          phone,
          email,
          birthday,
          referralSource: referral,
          referralCode: referralCode || undefined,
          postalCode: postalCode || undefined,
          marketingConsent: consent,
          cats: cats
            .filter((c) => c.name.trim())
            .map((c) => ({
              name: c.name,
              gender: c.gender,
              breed:
                (c.breed === OTHER_BREED ? c.breedOther.trim() : c.breed) ||
                undefined,
              ageValue: c.ageValue ? Number(c.ageValue) : undefined,
              ageUnit: c.ageUnit,
              weightKg: c.weightKg ? Number(c.weightKg) : undefined,
              birthday: c.birthday || undefined,
              medical: c.medical || undefined,
              furLength: c.furLength || undefined,
              color: c.color || undefined,
              staffNote: c.note || undefined,
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
      for (const c of named) {
        if (!c.photo) continue;
        const match = [...savedCats]
          .reverse()
          .find((sc) => !used.has(sc.id) && sc.name.trim() === c.name.trim());
        if (!match) continue;
        used.add(match.id);
        await fetch("/api/customers/cat-photo", {
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

      {referralCode && (
        <div className="mb-4 flex items-start gap-2 rounded-petflow border border-honey/50 bg-honey/20 px-4 py-3 text-xs font-extrabold text-petflow-chocolate">
          <Icon name="gift" size={16} className="mt-px" />
          <span>สมัครผ่านเพื่อนแนะนำ — มาใช้บริการครั้งแรก รับคูปองส่วนลด <span className="text-latte-deep">100฿</span> ทั้งคุณและเพื่อน!</span>
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        {/* ── ข้อมูลผู้ปกครอง ── */}
        <section>
        <SectionLabel>Owner · ข้อมูลผู้ปกครอง</SectionLabel>
        <div className="space-y-3 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-brown">
            ชื่อผู้ปกครอง{" "}
            <span className="font-normal text-brown-faint">
              (ชื่อเล่นหรือชื่อจริงก็ได้นะคะ)
            </span>
          </span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น คุณมาย"
            className={fieldClass}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-brown">เบอร์โทร</span>
          <input
            required
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08x-xxx-xxxx"
            className={fieldClass}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
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
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-brown">
            รหัสไปรษณีย์{" "}
            <span className="font-normal text-brown-faint">(ไม่บังคับ)</span>
          </span>
          <input
            value={postalCode}
            onChange={(e) =>
              setPostalCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))
            }
            inputMode="numeric"
            placeholder="เช่น 10540"
            className={fieldClass}
          />
        </label>
        </div>
        </section>

        {/* ── น้องแมว ── */}
        <section>
          <SectionLabel>My cats · น้องแมว</SectionLabel>
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
                <input
                  required={idx === 0}
                  value={cat.name}
                  onChange={(e) => updateCat(idx, { name: e.target.value })}
                  placeholder="ชื่อน้องแมว"
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
                  required={idx === 0}
                  value={cat.breed}
                  onChange={(e) => updateCat(idx, { breed: e.target.value })}
                  className={`${subFieldClass} ${
                    cat.breed ? "text-brown" : "text-brown-faint"
                  }`}
                >
                  <option value="">เลือกสายพันธุ์…</option>
                  {breeds.map((b) => (
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
                <input
                  value={cat.color}
                  onChange={(e) => updateCat(idx, { color: e.target.value })}
                  placeholder="สี/ลักษณะเด่น เช่น สีขาวสลับดำ มีจุดที่หู (ไม่บังคับ)"
                  className={subFieldClass}
                />
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
                    onChange={(e) =>
                      updateCat(idx, {
                        ageUnit: e.target.value as "year" | "month",
                      })
                    }
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
                    className={`${subFieldClass} mt-0.5`}
                  />
                </label>
                <div className="text-[11px] font-bold text-brown-soft">
                  วันเกิดน้องแมว{" "}
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

                <StaffNoteTagPicker
                  medicalValue={cat.medical}
                  noteValue={cat.note}
                  onChange={(medical, note) => updateCat(idx, { medical, note })}
                />

                {cats.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCat(idx)}
                    className="-ml-1 flex min-h-[44px] items-center gap-1.5 px-1 text-xs font-bold text-brown-soft"
                  >
                    <Icon name="trash" size={15} />
                    ลบน้องแมวตัวนี้
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
              <span className="block text-sm font-extrabold">เพิ่มน้องแมวอีกตัว</span>
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
