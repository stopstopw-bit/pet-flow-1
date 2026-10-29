"use client";

import { savedPopup } from "@/components/Toast";
import { roomPricing } from "@/lib/room-board";
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { SiteConfig, BoardingRuleBlock } from "@/lib/config-types";
import type { RoomType } from "@/lib/business";
import {
  GROOM_SIZES,
  bathPrograms,
  isMassageProgram,
  resolveGroomPrograms,
  resolveMassagePrograms,
  type GroomProgram,
  type GroomSize,
} from "@/lib/grooming-prices";
import { roomColorMap } from "@/lib/room-colors";
import { adminJson } from "@/lib/admin-fetch";
import { toJpegDataUrl } from "@/lib/image-convert";
import { extractLogoColors } from "@/lib/color-extract";
import { contrastRatio, isValidHex } from "@/lib/color-utils";
import { Icon } from "@/components/Icon";
import { useConfig } from "@/components/ConfigProvider";
import { FEATURES, FEATURE_GROUPS, isFeatureOn, type FeatureKey } from "@/lib/features";
import { GROOM_EXTRA_CARDS, groomUsesCard, type IntakeRules } from "@/lib/intake-rules";
import { REFERRAL_DEFAULT, referralReward } from "@/lib/referral";
import { breedOptionsFor, petKindOf, petWords, usesLitter, withDefaultBreeds, type PetKind } from "@/lib/pet-kind";
import { NumInput } from "@/components/NumInput";

type Tab =
  | "features"
  | "shop"
  | "payment"
  | "linePromos"
  | "messages"
  | "automation"
  | "lists"
  | "rooms"
  | "groomPrograms"
  | "massagePrograms"
  | "boardingRules"
  | "roomsPageBlocks"
  | "groomingPageBlocks"
  | "grooming"
  | "points"
  | "crm"
  | "advanced";

/** หน้าตั้งค่าแบบแอป: เปิดมาเป็นรายการหมวด แตะเข้าไปทีละหมวด (แทนแท็บ 14 อันที่ต้องเลื่อนข้าง) */
const TAB_GROUPS: { title: string; items: { id: Tab; icon: string; hint?: string }[] }[] = [
  {
    title: "Features",
    items: [{ id: "features", icon: "grid", hint: "เลือกว่าร้านใช้เมนูไหนบ้าง ปิดแล้วซ่อนทั้งหลังร้านและในแอปลูกค้า" }],
  },
  {
    title: "Shop",
    items: [
      { id: "shop", icon: "home", hint: "ชื่อร้าน ช่องทางติดต่อ ที่อยู่" },
      { id: "payment", icon: "wallet", hint: "บัญชีรับโอน" },
      { id: "lists", icon: "doc", hint: "ประเภทร้าน · สายพันธุ์ · ของแถม" },
      { id: "points", icon: "star", hint: "อัตราแต้มสะสม" },
      { id: "crm", icon: "users" },
    ],
  },
  {
    title: "Hotel",
    items: [
      { id: "rooms", icon: "bed", hint: "ประเภทห้องและราคา" },
      { id: "boardingRules", icon: "receipt", hint: "รูป/ข้อความเสริมหน้ากฎการฝาก" },
      { id: "roomsPageBlocks", icon: "grid", hint: "เนื้อหาท้ายหน้าห้องพัก" },
    ],
  },
  {
    title: "Grooming",
    items: [
      { id: "grooming", icon: "bath" },
      { id: "groomPrograms", icon: "sparkle", hint: "โปรแกรมและราคาอาบน้ำ" },
      { id: "massagePrograms", icon: "paw", hint: "โปรแกรม ราคา และรอบเวลานวด (เปิดบริการนวดที่ เปิด/ปิดฟีเจอร์)" },
      { id: "groomingPageBlocks", icon: "grid", hint: "เนื้อหาท้ายหน้าอาบน้ำ" },
    ],
  },
  {
    title: "Messages",
    items: [
      { id: "messages", icon: "message" },
      { id: "automation", icon: "clock" },
    ],
  },
  { title: "System", items: [{ id: "advanced", icon: "download", hint: "ดาวน์โหลดข้อมูลร้านเก็บไว้" }] },
];

const TABS: { id: Tab; label: string }[] = [
  { id: "features", label: "เปิด/ปิดฟีเจอร์" },
  { id: "shop", label: "ร้าน" },
  { id: "payment", label: "บัญชี" },
  { id: "linePromos", label: "โปรลดเฉพาะรายการ" },
  { id: "messages", label: "ข้อความ" },
  { id: "automation", label: "อัตโนมัติ" },
  { id: "lists", label: "รายการ" },
  { id: "rooms", label: "ห้อง" },
  { id: "groomPrograms", label: "โปรแกรมอาบน้ำ" },
  { id: "massagePrograms", label: "ราคานวด" },
  { id: "boardingRules", label: "กฎระเบียบ" },
  { id: "roomsPageBlocks", label: "เนื้อหาห้องพัก" },
  { id: "groomingPageBlocks", label: "เนื้อหาอาบน้ำ" },
  { id: "grooming", label: "อาบน้ำ" },
  { id: "points", label: "แต้ม" },
  { id: "crm", label: "ลูกค้า" },
  { id: "advanced", label: "สำรองข้อมูล" },
];

// index ต้องตรงกับ Date.prototype.getDay() (0=อาทิตย์ … 6=เสาร์) — ใช้เทียบกับ config.closedWeekdays
const WEEKDAY_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

export default function SettingsPage() {
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  // เมนูหลังร้านอ่านค่าจาก ConfigProvider — บันทึกแล้วต้องรีเฟรชให้เมนูที่ปิด/เปิดอัปเดตทันที
  const { refresh: refreshShared } = useConfig();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await adminJson<{ config: SiteConfig }>("/api/config");
    if (result.ok && result.data.config) {
      setConfig(result.data.config);
    } else {
      setConfig(null);
      setError(result.ok ? "โหลดข้อมูลไม่สำเร็จ" : result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // เปิดหมวดตรงจากลิงก์ เช่น /admin/settings?tab=linePromos (ปุ่ม "ตั้งโปร" ในหน้าออกบิล)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && TABS.some((x) => x.id === t)) setTab(t as Tab);
  }, []);

  const save = async (patch: Partial<SiteConfig>) => {
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch }),
    });
    const data = await res.json();
    if (res.ok) {
      setConfig(data.config);
      setMsg("บันทึกแล้ว — หน้าลูกค้าอัปเดตทันที");
      savedPopup("บันทึกการตั้งค่าแล้ว", ["หน้าลูกค้าอัปเดตทันที"]);
      void refreshShared();
    } else {
      setMsg("บันทึกไม่สำเร็จ");
    }
    setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  };

  if (loading) {
    return <p className="text-center text-sm text-brown-soft py-10">กำลังโหลด…</p>;
  }

  if (!config) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm font-bold text-wait">{error || "โหลดไม่สำเร็จ"}</p>
        <button
          type="button"
          onClick={load}
          className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-full bg-petflow-chocolate px-5 text-xs font-bold text-card"
        >
          ลองใหม่
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Settings</p>
      <h1 className="text-xl font-extrabold text-petflow-chocolate">ตั้งค่าระบบ</h1>
      <p className="mb-4 mt-0.5 text-xs text-brown-soft">
        แก้รูป ราคา โปร ข้อมูลร้าน — ไม่ต้องแก้โค้ด · v{config.version}
      </p>

      {msg && (
        <p className="sticky top-2 z-20 mb-3 flex items-center gap-2 rounded-full bg-petflow-chocolate px-4 py-2.5 text-xs font-bold text-card shadow-petflow">
          <Icon name={msg.includes("ไม่") ? "alert" : "check"} size={16} />
          {msg}
        </p>
      )}

      {tab === null ? (
        <div className="space-y-4">
          {TAB_GROUPS.map((g) => (
            <section key={g.title}>
              <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">
                {g.title}
              </p>
              <ul className="divide-y divide-petflow-line overflow-hidden rounded-petflow bg-card shadow-petflow-sm">
                {g.items.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => setTab(it.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-honey/30 text-petflow-chocolate">
                        <Icon name={it.icon} size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-petflow-chocolate">
                          {TABS.find((t) => t.id === it.id)?.label}
                        </span>
                        {it.hint ? (
                          <span className="block truncate text-[11px] text-brown-soft">{it.hint}</span>
                        ) : null}
                      </span>
                      <Icon name="chevron" size={16} className="text-brown-faint" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <Link
            href="/admin/promos"
            className="flex items-center gap-3 rounded-petflow bg-card px-4 py-3 shadow-petflow-sm"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-latte/30 text-petflow-chocolate">
              <Icon name="sparkle" size={18} />
            </span>
            <span className="flex-1 text-sm font-bold text-petflow-chocolate">จัดการโปรโมชั่น</span>
            <Icon name="chevron" size={16} className="text-brown-faint" />
          </Link>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setTab(null)}
          className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-card px-3.5 py-2 text-xs font-bold text-petflow-chocolate shadow-petflow-sm"
        >
          <Icon name="back" size={16} />
          ตั้งค่าทั้งหมด
          <span className="text-brown-faint">· {TABS.find((t) => t.id === tab)?.label}</span>
        </button>
      )}

      {tab === "features" && (
        <FeaturesTab config={config} saving={saving} onSave={save} />
      )}
      {tab === "shop" && (
        <ShopTab config={config} saving={saving} onSave={save} />
      )}
      {tab === "payment" && (
        <PaymentTab config={config} saving={saving} onSave={save} />
      )}
      {tab === "linePromos" && (
        // ย้ายไปรวมที่หน้าโปรโมชั่นแล้ว — ลิงก์เก่ายังพาไปถูกที่
        <Link
          href="/admin/promos"
          className="block rounded-petflow bg-card p-4 text-sm font-bold text-petflow-chocolate shadow-petflow-sm"
        >
          โปรลดเฉพาะรายการ / แถมคืนฟรี ย้ายไปอยู่หน้าโปรโมชั่นแล้ว →
        </Link>
      )}
      {tab === "messages" && (
        <MessagesTab config={config} saving={saving} onSave={save} />
      )}
      {tab === "automation" && (
        <AutomationTab config={config} saving={saving} onSave={save} />
      )}
      {tab === "lists" && (
        <ListsTab config={config} saving={saving} onSave={save} />
      )}
      {tab === "rooms" && (
        <RoomsTab config={config} saving={saving} onSave={save} />
      )}
      {tab === "groomPrograms" && (
        <GroomProgramsTab config={config} saving={saving} onSave={save} />
      )}
      {tab === "massagePrograms" && (
        <GroomProgramsTab config={config} saving={saving} onSave={save} massage />
      )}
      {tab === "boardingRules" && (
        <ContentBlocksTab
          config={config}
          saving={saving}
          onSave={save}
          field="boardingRules"
          hint="หน้ากฎระเบียบการฝาก (ฝั่งลูกค้า ในหน้าบริการ) โชว์ข้อตกลงชุดเดียวกับการ์ดกดยินยอมอัตโนมัติ — แก้ข้อกฎที่ ข้อความ › กฎ + กดยินยอม · บล็อกด้านล่างเป็นรูป/ข้อความเสริมที่ต่อท้าย ไม่ต้องใส่ก็ได้"
          saveLabel="บันทึกกฎระเบียบ"
        />
      )}
      {tab === "roomsPageBlocks" && (
        <ContentBlocksTab
          config={config}
          saving={saving}
          onSave={save}
          field="roomsPageBlocks"
          hint="เนื้อหาเสริมท้ายหน้าห้องพัก (ทั้งหน้า SEO /cat-hotel และหน้าห้องพักในแอปลูกค้า) — จะเพิ่มแค่รูป แค่ข้อความ หรือทั้งคู่ต่อบล็อกก็ได้"
          saveLabel="บันทึกเนื้อหาห้องพัก"
        />
      )}
      {tab === "groomingPageBlocks" && (
        <ContentBlocksTab
          config={config}
          saving={saving}
          onSave={save}
          field="groomingPageBlocks"
          hint="เนื้อหาเสริมท้ายหน้าอาบน้ำ (ทั้งหน้า SEO /cat-bath และหน้าอาบน้ำในแอปลูกค้า) — จะเพิ่มแค่รูป แค่ข้อความ หรือทั้งคู่ต่อบล็อกก็ได้"
          saveLabel="บันทึกเนื้อหาอาบน้ำ"
        />
      )}
      {tab === "grooming" && (
        <GroomingTab config={config} saving={saving} onSave={save} />
      )}
      {tab === "points" && (
        <PointsTab config={config} saving={saving} onSave={save} />
      )}
      {tab === "crm" && (
        <CrmTab config={config} saving={saving} onSave={save} />
      )}
      {tab === "advanced" && (
        <BackupTab />
      )}
    </div>
  );
}

const BRANDING_DEFAULT: NonNullable<SiteConfig["branding"]> = {
  primary: "#b8698e",
  accent: "#f6c6d9",
  heading: "#6b2d47",
  background: "#fff6f9",
  surface: "#ffffff",
  text: "#4a2d3a",
};

// ชุดสีสำเร็จรูป — กดทีเดียวเปลี่ยนสีทั้งหน้า (ไม่แตะโลโก้) แล้วค่อยปรับละเอียดต่อเองได้
const BRANDING_PRESETS: { label: string; swatch: string; colors: Omit<NonNullable<SiteConfig["branding"]>, "logoUrl"> }[] = [
  { label: "ชมพูพาสเทล (เริ่มต้น)", swatch: "#f6c6d9", colors: BRANDING_DEFAULT },
  {
    // จากโลโก้ Back Home Dog Service — บ้านสีเขียวมิ้นต์ พื้นขาว ตัวหนังสือดำ
    label: "เขียวมิ้นต์ (Back Home)",
    swatch: "#77c2ae",
    colors: {
      primary: "#2f8a77",
      accent: "#bfe5da",
      heading: "#1f4a41",
      background: "#f2faf7",
      surface: "#ffffff",
      text: "#24312e",
    },
  },
];

function ShopTab({
  config,
  saving,
  onSave,
}: {
  config: SiteConfig;
  saving: boolean;
  onSave: (p: Partial<SiteConfig>) => void;
}) {
  const [form, setForm] = useState(config.business);
  const [branding, setBranding] = useState({ ...BRANDING_DEFAULT, ...config.branding });
  const gradientOn = Boolean(branding.backgroundGradientFrom && branding.backgroundGradientTo);
  const [extracting, setExtracting] = useState(false);
  const [extractErr, setExtractErr] = useState("");

  const autoDetectColors = async () => {
    if (!branding.logoUrl) return;
    setExtracting(true);
    setExtractErr("");
    const picked = await extractLogoColors(branding.logoUrl);
    setExtracting(false);
    if (!picked) {
      setExtractErr("ดึงสีจากโลโก้ไม่สำเร็จ — ลองอัปโหลดรูปใหม่ หรือปรับสีเองด้านล่างได้เลย");
      return;
    }
    setBranding((b) => ({ ...b, ...picked }));
  };

  useEffect(() => {
    setForm(config.business);
  }, [config.business]);
  useEffect(() => {
    setBranding({ ...BRANDING_DEFAULT, ...config.branding });
  }, [config.branding]);

  // เตือนก่อนบันทึก ถ้าคู่สีที่ต้องอ่านคู่กันจริงในหน้าเว็บ (ตัวอักษร/พื้นหลัง, ปุ่ม/ตัวหนังสือขาว)
  // คอนทราสต์ต่ำเกินไป — กันเคสแบบ "แก้สีตัวอักษรแล้วอ่านไม่ออกทั้งระบบ" ไม่ให้เงียบๆ หลุดไป
  const contrastWarnings = useMemo(() => {
    const warnings: string[] = [];
    const vals = [branding.background, branding.surface, branding.text, branding.primary, branding.heading];
    if (vals.some((v) => !v || !isValidHex(v))) return warnings;
    if (contrastRatio(branding.text, branding.background) < 3) {
      warnings.push("ตัวอักษร vs พื้นหลังเว็บ — สีใกล้กันเกินไป อ่านยาก");
    }
    if (contrastRatio(branding.text, branding.surface) < 3) {
      warnings.push("ตัวอักษร vs พื้นการ์ด — สีใกล้กันเกินไป อ่านยาก");
    }
    if (contrastRatio("#ffffff", branding.primary) < 2.2) {
      warnings.push("สีหลัก (ปุ่ม) อ่อนไป — ตัวหนังสือสีขาวบนปุ่มจะมองแทบไม่เห็น");
    }
    if (contrastRatio(branding.heading, branding.surface) < 3) {
      warnings.push("สีหัวข้อ vs พื้นการ์ด — สีใกล้กันเกินไป อ่านยาก");
    }
    return warnings;
  }, [branding.background, branding.surface, branding.text, branding.primary, branding.heading]);

  return (
    <form
      className="space-y-3 rounded-petflow bg-card p-4 shadow-petflow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ business: form, branding });
      }}
    >
      <p className="text-xs font-extrabold text-petflow-chocolate">🎨 สีและโลโก้ประจำร้าน</p>
      <p className="text-[10px] text-brown-faint">
        ปรับสีทั้งหน้า (พื้นหลัง การ์ด ปุ่ม หัวข้อ ตัวอักษร) และโลโก้ ให้เข้ากับแบรนด์ร้าน —
        มีผลทั้งหน้าลูกค้าและหลังบ้าน ไม่ต้องแก้โค้ด
      </p>
      <PosterField
        label="โลโก้ร้าน"
        value={branding.logoUrl || ""}
        onChange={(v) => setBranding({ ...branding, logoUrl: v })}
        onUpload={(f) => {
          const reader = new FileReader();
          reader.onload = () => {
            const url = String(reader.result);
            setBranding((b) => ({ ...b, logoUrl: url }));
            extractLogoColors(url).then((picked) => {
              if (picked) setBranding((b) => ({ ...b, ...picked }));
            });
          };
          reader.readAsDataURL(f);
        }}
      />
      {branding.logoUrl && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={extracting}
            onClick={autoDetectColors}
            className="rounded-full bg-honey/30 px-3 py-1.5 text-[11px] font-bold text-latte-deep disabled:opacity-50"
          >
            {extracting ? "กำลังดึงสี…" : "🪄 ดึงสีจากโลโก้อัตโนมัติ"}
          </button>
          {extractErr && <span className="text-[10px] font-bold text-wait">{extractErr}</span>}
        </div>
      )}
      <p className="text-[10px] font-bold text-brown-soft">ชุดสีสำเร็จรูป</p>
      <div className="flex flex-wrap gap-2">
        {BRANDING_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() =>
              setBranding((b) => ({ ...b, ...p.colors, backgroundGradientFrom: "", backgroundGradientTo: "" }))
            }
            className="flex items-center gap-1.5 rounded-full border border-petflow-line bg-card px-3 py-1.5 text-[11px] font-bold text-brown"
          >
            <span className="h-3.5 w-3.5 rounded-full" style={{ background: p.swatch }} />
            {p.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] font-bold text-brown-soft">ปุ่ม / จุดเน้น</p>
      <div className="grid grid-cols-3 gap-2">
        <ColorField
          label="สีหลัก (ปุ่ม)"
          value={branding.primary}
          onChange={(v) => setBranding({ ...branding, primary: v })}
        />
        <ColorField
          label="สีไฮไลท์"
          value={branding.accent}
          onChange={(v) => setBranding({ ...branding, accent: v })}
        />
        <ColorField
          label="สีหัวข้อ"
          value={branding.heading}
          onChange={(v) => setBranding({ ...branding, heading: v })}
        />
      </div>
      <p className="text-[10px] font-bold text-brown-soft">พื้นหลัง / ตัวอักษร</p>
      <div className="grid grid-cols-3 gap-2">
        <ColorField
          label={gradientOn ? "พื้นหลัง (ทึบ — สำรอง)" : "พื้นหลังเว็บ"}
          value={branding.background}
          onChange={(v) => setBranding({ ...branding, background: v })}
        />
        <ColorField
          label="พื้นการ์ด"
          value={branding.surface}
          onChange={(v) => setBranding({ ...branding, surface: v })}
        />
        <ColorField
          label="ตัวอักษร"
          value={branding.text}
          onChange={(v) => setBranding({ ...branding, text: v })}
        />
      </div>
      {contrastWarnings.length > 0 && (
        <div className="rounded-petflow-sm border border-wait/40 bg-wait/10 p-3">
          <p className="mb-1 text-[11px] font-extrabold text-wait">
            ⚠️ สีบางคู่อ่านยาก — เสี่ยงมองไม่เห็นตัวอักษร/ปุ่ม
          </p>
          <ul className="list-disc space-y-0.5 pl-4 text-[10px] text-brown-soft">
            {contrastWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-petflow-sm border border-petflow-line p-3">
        <Toggle
          label="🌈 พื้นหลังไล่เฉด (gradient) แทนสีทึบ"
          checked={gradientOn}
          onChange={(v) =>
            setBranding((b) => ({
              ...b,
              backgroundGradientFrom: v ? b.background : "",
              backgroundGradientTo: v ? b.accent : "",
            }))
          }
        />
        {gradientOn && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ColorField
              label="จุดเริ่มไล่สี"
              value={branding.backgroundGradientFrom || branding.background}
              onChange={(v) => setBranding({ ...branding, backgroundGradientFrom: v })}
            />
            <ColorField
              label="จุดจบไล่สี"
              value={branding.backgroundGradientTo || branding.accent}
              onChange={(v) => setBranding({ ...branding, backgroundGradientTo: v })}
            />
          </div>
        )}
      </div>

      <div
        className="space-y-2 rounded-petflow-sm p-4"
        style={{
          background: gradientOn
            ? `linear-gradient(135deg, ${branding.backgroundGradientFrom} 0%, ${branding.backgroundGradientTo} 100%)`
            : branding.background,
        }}
      >
        <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: branding.text, opacity: 0.5 }}>
          ตัวอย่าง
        </p>
        <div className="rounded-petflow-sm p-3" style={{ background: branding.surface }}>
          <p className="text-sm font-extrabold" style={{ color: branding.heading }}>
            ตัวอย่างหัวข้อ
          </p>
          <p className="mb-2 text-xs" style={{ color: branding.text }}>
            ตัวอย่างข้อความเนื้อหาในการ์ด
          </p>
          <span
            className="inline-block rounded-full px-3 py-1.5 text-xs font-extrabold text-white"
            style={{ background: branding.primary }}
          >
            ตัวอย่างปุ่ม
          </span>
          <span
            className="ml-2 inline-block rounded-full px-3 py-1.5 text-xs font-extrabold"
            style={{ background: branding.accent, color: branding.heading }}
          >
            ไฮไลท์
          </span>
        </div>
      </div>
      {JSON.stringify(branding) !== JSON.stringify(BRANDING_DEFAULT) && (
        <button
          type="button"
          onClick={() => setBranding(BRANDING_DEFAULT)}
          className="text-[10px] font-bold text-brown-faint underline"
        >
          🔄 รีเซ็ตเป็นสีเริ่มต้น
        </button>
      )}

      <hr className="border-petflow-line" />
      <Field label="ชื่อร้าน" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
      <Field label="LINE OA" value={form.lineOa} onChange={(v) => setForm({ ...form, lineOa: v })} />
      <Field
        label="เบอร์โทร (คั่นด้วย ,)"
        value={form.phones.join(", ")}
        onChange={(v) => setForm({ ...form, phones: v.split(",").map((s) => s.trim()) })}
      />
      <Field label="Google Maps URL" value={form.maps} onChange={(v) => setForm({ ...form, maps: v })} />
      <Field label="Facebook" value={form.facebook} onChange={(v) => setForm({ ...form, facebook: v })} />
      <Field
        label="ลิงก์รีวิว (Google) — ส่งให้ลูกค้ารีวิว"
        value={form.reviewUrl || ""}
        onChange={(v) => setForm({ ...form, reviewUrl: v })}
      />
      <Field
        label="คำในปุ่มรีวิว"
        value={form.reviewButtonText || ""}
        onChange={(v) => setForm({ ...form, reviewButtonText: v })}
      />
      {/* รับเฉพาะจองล่วงหน้าไหม — ป้ายในหน้าลูกค้า (ร้านที่รับ walk-in ปิดไว้) */}
      <div className="rounded-petflow-sm border border-petflow-line bg-paper px-3 py-3">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={!!form.byAppointmentOnly}
            onChange={(e) => setForm({ ...form, byAppointmentOnly: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-latte-deep"
          />
          <span className="text-xs font-bold text-brown-soft">
            📌 รับเฉพาะลูกค้าที่จองล่วงหน้า (ไม่รับ Walk-in)
            <span className="mt-0.5 block text-[10px] font-normal text-brown-faint">
              เปิดแล้วจะขึ้นป้ายบอกลูกค้าในหน้าบริการ · ห้องพัก · อาบน้ำ
              ลูกค้าจะได้ไม่เดินทางมาถึงร้านแล้วต้องกลับ
            </span>
          </span>
        </label>
        {form.byAppointmentOnly && (
          <div className="mt-2 space-y-2">
            <Field
              label="ข้อความในป้าย (ไทย) — เว้นว่างเพื่อใช้ข้อความมาตรฐาน"
              value={form.byAppointmentNote?.th || ""}
              onChange={(v) =>
                setForm({
                  ...form,
                  byAppointmentNote: { th: v, en: form.byAppointmentNote?.en || "" },
                })
              }
            />
            <Field
              label="ข้อความในป้าย (EN)"
              value={form.byAppointmentNote?.en || ""}
              onChange={(v) =>
                setForm({
                  ...form,
                  byAppointmentNote: { th: form.byAppointmentNote?.th || "", en: v },
                })
              }
            />
          </div>
        )}
      </div>
      <Field label="ที่อยู่ (ไทย)" value={form.location.th} onChange={(v) => setForm({ ...form, location: { ...form.location, th: v } })} />
      <Field label="ที่อยู่ (EN)" value={form.location.en} onChange={(v) => setForm({ ...form, location: { ...form.location, en: v } })} />
      <div className="rounded-petflow-sm border border-petflow-line bg-paper px-3 py-3">
        <p className="mb-1 text-xs font-extrabold text-petflow-chocolate">เอกสารภาษี · ใบเสร็จ / ใบเสนอราคา</p>
        <p className="mb-2 text-[10px] text-brown-faint">
          ข้อมูลผู้ขายที่โชว์บนใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จรับเงิน (ออกได้จากเมนู ⋯ ของแต่ละบิล)
        </p>
        <div className="space-y-2">
          <Field
            label="ชื่อตามทะเบียน (ไม่ใส่ = ใช้ชื่อร้าน)"
            value={form.legalName || ""}
            onChange={(v) => setForm({ ...form, legalName: v })}
          />
          <Field
            label="เลขประจำตัวผู้เสียภาษี (13 หลัก)"
            value={form.taxId || ""}
            onChange={(v) => setForm({ ...form, taxId: v })}
          />
          <Field
            label="สาขา (เช่น สำนักงานใหญ่)"
            value={form.taxBranch || ""}
            onChange={(v) => setForm({ ...form, taxBranch: v })}
          />
          <Toggle
            label="จดทะเบียน VAT แล้ว (ใบเสร็จเป็นใบกำกับภาษี แยก VAT)"
            checked={!!form.vatRegistered}
            onChange={(v) => setForm({ ...form, vatRegistered: v })}
          />
          {form.vatRegistered && (
            <Field
              label="อัตรา VAT (%) — ราคาในร้านถือว่ารวม VAT แล้ว"
              type="number"
              value={String(form.vatRate ?? 7)}
              onChange={(v) => setForm({ ...form, vatRate: Math.min(30, Math.max(0, Number(v) || 0)) })}
            />
          )}
        </div>
      </div>
      <Field
        label="อีเมลเจ้าของปฏิทินนัด (คั่นด้วย , · ไม่บังคับ)"
        value={(form.calendarOwnerEmails || []).join(", ")}
        onChange={(v) =>
          setForm({
            ...form,
            calendarOwnerEmails: v
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
      />
      <p className="-mt-2 text-[10px] text-brown-faint">
        อีเมลนี้จะถูกเชิญเป็นเจ้าของนัดใน Google Calendar และโชว์ในไฟล์ปฏิทิน (.ics)
        เฉพาะของร้านนี้เท่านั้น — ร้านอื่นไม่เห็นอีเมลของร้านนี้ และร้านนี้ก็ไม่เห็นของร้านอื่น
      </p>
      <Field
        label="อัตราแต้ม (บาท = 1 แต้ม)"
        type="number"
        value={String(form.pointsRate)}
        onChange={(v) => setForm({ ...form, pointsRate: Number(v) || 100 })}
      />
      <div className="rounded-petflow-sm border border-petflow-line bg-paper px-3 py-3">
        <p className="mb-1 text-xs font-extrabold text-petflow-chocolate">แพ็กห้องรายเดือน</p>
        <p className="mb-2 text-[10px] text-brown-faint">
          ลูกค้าเลือกห้องแต่ละแบบกี่คืน ราคาคิดจากราคาเต็มแล้วลดตาม % นี้ (ปรับเป็นรายเคสตอนขายได้)
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="ส่วนลด (%)"
            type="number"
            value={String(form.roomPlanDiscountPct ?? 30)}
            onChange={(v) =>
              setForm({ ...form, roomPlanDiscountPct: Math.min(100, Math.max(0, Number(v) || 0)) })
            }
          />
          <Field
            label="รวมกี่คืนขึ้นไปถึงลด"
            type="number"
            value={String(form.roomPlanMinNights ?? 30)}
            onChange={(v) => setForm({ ...form, roomPlanMinNights: Math.max(1, Number(v) || 30) })}
          />
        </div>
      </div>
      <div className="rounded-petflow-sm border border-petflow-line bg-paper px-3 py-3">
        <p className="mb-2 text-xs font-extrabold text-petflow-chocolate">
          แต้มของลูกค้า Member
        </p>
        <p className="mb-2.5 text-[10px] text-brown-faint">
          เติมเครดิต Member และซื้อคอร์สไม่ได้แต้ม — แต้มให้เฉพาะบริการรายครั้ง
        </p>
        <label className="mt-2 flex items-start gap-2 border-t border-petflow-line pt-2.5">
          <input
            type="checkbox"
            checked={form.noPointsOnMemberCredit !== false}
            onChange={(e) => setForm({ ...form, noPointsOnMemberCredit: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-latte-deep"
          />
          <span className="text-xs font-bold text-brown-soft">
            จ่ายด้วยเครดิต Member <span className="text-wait">ไม่ให้แต้ม</span>
            <span className="mt-0.5 block text-[10px] font-normal text-brown-faint">
              ติ๊กไว้ = ลูกค้า Member ไม่ได้แต้มเลย · เอาติ๊กออก = ได้แต้มตอนตัดเครดิตใช้บริการแต่ละครั้ง
            </span>
          </span>
        </label>
      </div>
      <SaveBtn saving={saving} />
    </form>
  );
}

function PaymentTab({
  config,
  saving,
  onSave,
}: {
  config: SiteConfig;
  saving: boolean;
  onSave: (p: Partial<SiteConfig>) => void;
}) {
  const [form, setForm] = useState(config.payment);
  useEffect(() => setForm(config.payment), [config.payment]);
  const [dep, setDep] = useState(config.bookingDeposit || {});
  useEffect(() => setDep(config.bookingDeposit || {}), [config.bookingDeposit]);
  const hasPromptpay = /^(0\d{9}|\d{13})$/.test(form.promptpayId || "");

  return (
    <form
      className="space-y-3 rounded-petflow bg-card p-4 shadow-petflow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          payment: form,
          bookingDeposit: {
            enabled: !!dep.enabled,
            groomAmount: Math.max(0, Math.round(Number(dep.groomAmount) || 0)),
            roomAmount: Math.max(0, Math.round(Number(dep.roomAmount) || 0)),
          },
        });
      }}
    >
      <Field label="ธนาคาร" value={form.bankName} onChange={(v) => setForm({ ...form, bankName: v })} />
      <Field label="เลขบัญชี" value={form.accountNumber} onChange={(v) => setForm({ ...form, accountNumber: v })} />
      <Field label="ชื่อบัญชี" value={form.accountName} onChange={(v) => setForm({ ...form, accountName: v })} />
      <Field
        label="พร้อมเพย์ (เบอร์มือถือ หรือเลข 13 หลัก) — ใช้ทำ QR ที่หน้าขาย POS และมัดจำตอนจอง"
        value={form.promptpayId || ""}
        onChange={(v) => setForm({ ...form, promptpayId: v.replace(/[^0-9]/g, "") })}
      />
      <div className="rounded-petflow-sm border border-petflow-line bg-paper/50 p-3">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={!!dep.enabled}
            onChange={(e) => setDep({ ...dep, enabled: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-latte-deep"
          />
          <span className="text-xs font-bold text-brown-soft">
            เก็บมัดจำตอนลูกค้าจองเอง
            <span className="mt-0.5 block text-[10px] font-normal text-brown-faint">
              หน้าจองในแอปจะโชว์ยอดมัดจำ + QR พร้อมเพย์ ให้ลูกค้าโอนแล้วแนบสลิป
              (หรือเลือก “โอนทีหลัง” ก็จองได้) · ยอดต่อ 1 การจอง ไม่คูณจำนวนน้อง
            </span>
          </span>
        </label>
        {dep.enabled && (
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <Field
              label="มัดจำอาบน้ำ (บาท)"
              type="number"
              value={dep.groomAmount ? String(dep.groomAmount) : ""}
              placeholder="0 = ไม่เก็บ"
              onChange={(v) => setDep({ ...dep, groomAmount: Number(v) || 0 })}
            />
            <Field
              label="มัดจำห้องพัก (บาท)"
              type="number"
              value={dep.roomAmount ? String(dep.roomAmount) : ""}
              placeholder="0 = ไม่เก็บ"
              onChange={(v) => setDep({ ...dep, roomAmount: Number(v) || 0 })}
            />
          </div>
        )}
        {dep.enabled && !hasPromptpay && (
          <p className="mt-2 rounded bg-honey/20 px-2 py-1 text-[10px] font-bold text-wait">
            ยังไม่ได้ใส่เลขพร้อมเพย์ — ลูกค้าจะเห็นแค่เลขบัญชีธนาคาร ไม่มี QR
          </p>
        )}
      </div>
      <p className="rounded-petflow-sm bg-paper px-3 py-2 text-[11px] text-brown-faint">
        ข้อความสรุป/แจ้งมัดจำ/เก็บเงิน และข้อความอื่นๆ ที่ส่งให้ลูกค้า
        ย้ายไปแก้ที่แท็บ <b>ข้อความ</b> แล้ว
      </p>
      <SaveBtn saving={saving} />
    </form>
  );
}

/** หมวดของหน้าข้อความ — เรียงตามลำดับที่ลูกค้าเจอจริง ตั้งแต่จองจนหลังกลับบ้าน */
const MESSAGE_SECTIONS = [
  { id: "bill", emoji: "💰", title: "สรุปยอด / เก็บเงิน", hint: "หัวเรื่องและข้อความปิดท้าย ตอนกดคิดเงิน" },
  { id: "deposit", emoji: "🧡", title: "มัดจำ", hint: "การ์ดเรียกมัดจำ · ขอบคุณ · เงื่อนไข · เตือนยอดคงเหลือ" },
  { id: "consent", emoji: "📋", title: "กฎ + กดยินยอม", hint: "ข้อตกลงที่ลูกค้าอ่านแล้วกดยอมรับ" },
  { id: "groom", emoji: "🛁", title: "ก่อนอาบน้ำ / นวด", hint: "ข้อความชวนกรอกประวัติก่อนอาบน้ำ" },
  { id: "prestay", emoji: "🏠", title: "ก่อนเข้าพัก", hint: "การ์ดแจ้งเข้าพัก · ของที่ต้องเตรียม · เตือนเช็คอิน" },
  { id: "after", emoji: "👋", title: "รับกลับ / หลังเข้าพัก", hint: "เตือนเช็คเอาท์ · ขอรีวิว" },
  { id: "crm", emoji: "💌", title: "ตามลูกค้า + วันเกิด", hint: "ตามลูกค้าที่หายไป · อวยพรวันเกิด" },
] as const;

type MessageSectionId = (typeof MESSAGE_SECTIONS)[number]["id"];

function MessagesTab({
  config,
  saving,
  onSave,
}: {
  config: SiteConfig;
  saving: boolean;
  onSave: (p: Partial<SiteConfig>) => void;
}) {
  const [bill, setBill] = useState(config.billing);
  const [msgs, setMsgs] = useState(config.messages);
  const [crm, setCrm] = useState(config.crm);
  const [open, setOpen] = useState<Set<MessageSectionId>>(new Set());
  // ร้านหมาล้วนไม่มีทราย — ซ่อนช่องข้อความเตรียมทราย
  const litter = usesLitter(config);
  useEffect(() => setBill(config.billing), [config.billing]);
  useEffect(() => setMsgs(config.messages), [config.messages]);
  useEffect(() => setCrm(config.crm), [config.crm]);

  const toggle = (id: MessageSectionId) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  /** กดชิปด้านบน: เปิดหมวดนั้นแล้วเลื่อนไปหา */
  const jump = (id: MessageSectionId) => {
    setOpen((s) => new Set(s).add(id));
    requestAnimationFrame(() =>
      document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  };
  const section = (id: MessageSectionId, children: React.ReactNode) => {
    const s = MESSAGE_SECTIONS.find((x) => x.id === id)!;
    const isOpen = open.has(id);
    return (
      <section id={`msg-${id}`} className="scroll-mt-16 overflow-hidden rounded-petflow bg-card shadow-petflow-sm">
        <button
          type="button"
          onClick={() => toggle(id)}
          aria-expanded={isOpen}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/30 text-xl">
            {s.emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-extrabold text-petflow-chocolate">{s.title}</span>
            <span className="block text-[11px] text-brown-soft">{s.hint}</span>
          </span>
          <span className={`shrink-0 text-brown-soft transition-transform ${isOpen ? "rotate-90" : ""}`}>
            <Icon name="chevron" size={18} />
          </span>
        </button>
        {isOpen && <div className="space-y-4 border-t border-petflow-line px-4 pb-4 pt-3">{children}</div>}
      </section>
    );
  };
  const sub = (text: string) => (
    <p className="border-l-4 border-honey pl-2 text-sm font-extrabold text-petflow-chocolate">{text}</p>
  );
  const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ billing: bill, messages: msgs, crm });
      }}
    >
      <div className="rounded-petflow bg-card p-3 shadow-petflow-sm">
        <p className="px-1 pb-2 text-[11px] font-bold text-brown-soft">กดหัวข้อที่อยากแก้</p>
        <div className="flex flex-wrap gap-1.5">
          {MESSAGE_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => jump(s.id)}
              className={`min-h-[36px] rounded-full border px-3 text-xs font-bold ${
                open.has(s.id)
                  ? "border-petflow-chocolate bg-petflow-chocolate text-card"
                  : "border-petflow-line bg-paper text-petflow-chocolate"
              }`}
            >
              {s.emoji} {s.title}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-3 px-1 pt-2 text-[11px] font-bold text-brown-soft">
          <button type="button" onClick={() => setOpen(new Set(MESSAGE_SECTIONS.map((s) => s.id)))}>
            เปิดทั้งหมด
          </button>
          <button type="button" onClick={() => setOpen(new Set())}>
            ปิดทั้งหมด
          </button>
        </div>
      </div>

      {section(
        "bill",
        <>
          <Field
            label="หัวเรื่อง — สรุปการจอง"
            value={bill?.summaryBookingTitle || ""}
            onChange={(v) => setBill({ ...bill, summaryBookingTitle: v })}
          />
          <Field
            label="หัวเรื่อง — แจ้งมัดจำ"
            value={bill?.summaryDepositTitle || ""}
            onChange={(v) => setBill({ ...bill, summaryDepositTitle: v })}
          />
          <Field
            label="หัวเรื่อง — แจ้งยอดเต็ม (เก็บเงิน)"
            value={bill?.summaryFullTitle || ""}
            onChange={(v) => setBill({ ...bill, summaryFullTitle: v })}
          />
          <Field
            label="ข้อความปิดท้าย (ทุกแบบ)"
            value={bill?.summaryClosing || ""}
            onChange={(v) => setBill({ ...bill, summaryClosing: v })}
          />
        </>
      )}

      {section(
        "deposit",
        <>
          {sub("การ์ดเรียกเก็บมัดจำ (ส่งก่อนลูกค้าโอน)")}
          <Field
            label="หัวเรื่อง"
            value={msgs?.depositRequestTitle || ""}
            onChange={(v) => setMsgs({ ...msgs, depositRequestTitle: v })}
          />
          <TextAreaField
            label="ข้อความ"
            hint="ใช้ได้: {name} {pet} {amount} · {pct} = ' 30% ของค่าบริการ' (เว้นว่างถ้าไม่ได้เลือก %)"
            value={msgs?.depositRequestBody || ""}
            onChange={(v) => setMsgs({ ...msgs, depositRequestBody: v })}
            rows={4}
          />
          {sub("การ์ดขอบคุณตอนรับมัดจำ")}
          <Field
            label="หัวเรื่อง"
            value={msgs?.depositThanksTitle || ""}
            onChange={(v) => setMsgs({ ...msgs, depositThanksTitle: v })}
          />
          <TextAreaField
            label="ข้อความขอบคุณ"
            hint="ใช้ได้: {name} {pet} {amount}"
            value={msgs?.depositThanksBody || ""}
            onChange={(v) => setMsgs({ ...msgs, depositThanksBody: v })}
            rows={4}
          />
          <TextAreaField
            label="เงื่อนไขมัดจำ (1 บรรทัด = 1 ข้อ)"
            value={(msgs?.depositTerms || []).join("\n")}
            onChange={(v) => setMsgs({ ...msgs, depositTerms: lines(v) })}
            rows={5}
          />
          {sub("เตือนยอดคงเหลือก่อนเข้าพัก")}
          <p className="text-[11px] font-bold text-brown-soft">
            ปกติยอดคงเหลืออยู่ในการ์ดเตรียมตัวก่อนเข้าพักใบเดียวกัน (ส่งแยกเฉพาะเมื่อปิดการ์ดเตรียมตัว) — แก้ข้อความการ์ดแยกได้ที่{" "}
            <a href="/admin/cards?card=depositReminder" className="text-latte-deep underline">ปรับแต่งการ์ด › แจ้งยอดก่อนเข้าพัก</a>
          </p>
        </>
      )}

      {section(
        "consent",
        <>
          <Field
            label="หัวเรื่อง"
            value={msgs?.consentTitle || ""}
            onChange={(v) => setMsgs({ ...msgs, consentTitle: v })}
          />
          <TextAreaField
            label="ข้อตกลง (1 บรรทัด = 1 ข้อ)"
            value={(msgs?.consentTerms || []).join("\n")}
            onChange={(v) => setMsgs({ ...msgs, consentTerms: lines(v) })}
            rows={10}
          />
          <TextAreaField
            label="ข้อความชวนกดยอมรับ (แนบลิงก์ตอนแจ้งเข้าพัก + ปุ่ม 📋 เงื่อนไข)"
            hint="ใช้ได้: {shop} {pet} {url} — ต้องมี {url} เพื่อแนบลิงก์"
            value={msgs?.consentInvite || ""}
            onChange={(v) => setMsgs({ ...msgs, consentInvite: v })}
            rows={3}
          />
        </>
      )}

      {section(
        "groom",
        <>
          <TextAreaField
            label="สอบถามประวัติน้องก่อนอาบน้ำ"
            hint="ใช้ได้: {shop} {pet}"
            value={msgs?.groomInfoIntro || ""}
            onChange={(v) => setMsgs({ ...msgs, groomInfoIntro: v })}
            rows={5}
          />
          {sub("ข้อตกลงก่อนอาบน้ำ (นัดอาบน้ำใช้ชุดนี้แทนกฎเข้าพัก)")}
          <Field
            label="หัวเรื่อง"
            value={msgs?.groomConsentTitle || ""}
            onChange={(v) => setMsgs({ ...msgs, groomConsentTitle: v })}
          />
          <TextAreaField
            label="ข้อตกลงอาบน้ำ (1 บรรทัด = 1 ข้อ · ขึ้นต้นด้วย หัวข้อ — แล้วตามด้วยเนื้อหา หัวข้อจะเป็นตัวหนา)"
            value={(msgs?.groomConsentTerms || []).join("\n")}
            onChange={(v) => setMsgs({ ...msgs, groomConsentTerms: lines(v) })}
            rows={10}
          />
        </>
      )}

      {section(
        "prestay",
        <>
          {sub("การ์ดแจ้งเข้าพัก (ส่ง 3 วันก่อนเข้าพัก · จัดรูปแบบให้อัตโนมัติ)")}
          <TextAreaField
            label="ทักทายเปิดการ์ด"
            hint="ใช้ได้: {shop} {pet}"
            value={msgs?.prestayIntro || ""}
            onChange={(v) => setMsgs({ ...msgs, prestayIntro: v })}
            rows={2}
          />
          <TextAreaField
            label="เกริ่นก่อนลิสต์ของที่ต้องเตรียม"
            value={msgs?.prestayPrepIntro || ""}
            onChange={(v) => setMsgs({ ...msgs, prestayPrepIntro: v })}
            rows={2}
          />
          <TextAreaField
            label="ของที่ต้องเตรียม (1 บรรทัด = 1 ข้อ · ใส่อีโมจิหน้าได้)"
            value={(msgs?.prestayPrepItems || []).join("\n")}
            onChange={(v) => setMsgs({ ...msgs, prestayPrepItems: lines(v) })}
            rows={4}
          />
          <TextAreaField
            label="ข้อความปิดท้าย (ชวนแจ้งการดูแลพิเศษ)"
            hint="ใช้ได้: {pet}"
            value={msgs?.prestayCareNote || ""}
            onChange={(v) => setMsgs({ ...msgs, prestayCareNote: v })}
            rows={3}
          />
          {litter && (
            <TextAreaField
              label="ข้อความเตือนให้เตรียมทราย (เฉพาะเข้าพักสั้นกว่าเกณฑ์แถมฟรี)"
              hint="ใช้ได้: {min} = จำนวนคืนขั้นต่ำที่แถมทรายฟรี (ตั้งในแท็บ ⏰ อัตโนมัติ)"
              value={msgs?.prestayLitterNote || ""}
              onChange={(v) => setMsgs({ ...msgs, prestayLitterNote: v })}
              rows={3}
            />
          )}
          {sub("เตือนเช็คอิน (ก่อนวันเข้าพัก)")}
          <TextAreaField
            label="ข้อความ"
            hint={litter ? "ใช้ได้: {shop} {pet} {checkin} {room} {litterNote}" : "ใช้ได้: {shop} {pet} {checkin} {room}"}
            value={msgs?.checkinReminder || ""}
            onChange={(v) => setMsgs({ ...msgs, checkinReminder: v })}
            rows={8}
          />
        </>
      )}

      {section(
        "after",
        <>
          <TextAreaField
            label="เตือนเช็คเอาท์ (ก่อนวันออก)"
            hint="ใช้ได้: {shop} {pet} {checkout}"
            value={msgs?.checkoutReminder || ""}
            onChange={(v) => setMsgs({ ...msgs, checkoutReminder: v })}
            rows={6}
          />
          <TextAreaField
            label="ขอรีวิว (หลังเช็คเอาท์)"
            hint="ใช้ได้: {shop} {pet}"
            value={msgs?.reviewRequest || ""}
            onChange={(v) => setMsgs({ ...msgs, reviewRequest: v })}
            rows={5}
          />
        </>
      )}

      {section(
        "crm",
        <>
          {sub("ตามลูกค้าที่หายไป")}
          <TextAreaField
            label="ข้อความตามลูกค้า"
            hint="ใช้ได้: {name} = ชื่อลูกค้า · {pets} = ชื่อน้อง · {days} = จำนวนวัน · {shop} = ชื่อร้าน"
            value={crm?.followUpMessage || ""}
            onChange={(v) => setCrm({ ...crm, followUpMessage: v })}
            rows={3}
          />
          {sub("อวยพรวันเกิดอัตโนมัติ")}
          <p className="text-[11px] text-brown-soft">
            ส่งอัตโนมัติเที่ยงวันที่ตรงกับวันเกิด (เฉพาะลูกค้าที่ยินยอมรับข่าวสาร) — วันเกิดน้องกับวันเกิดเจ้าของใช้คนละข้อความ ถ้าตรงกันวันเดียวจะส่งแค่ใบของเจ้าของใบเดียว
          </p>
          <TextAreaField
            label="ข้อความอวยพร — วันเกิดน้อง"
            hint="ใช้ได้: {shop} {name} {pet}"
            value={msgs?.birthdayGreeting || ""}
            onChange={(v) => setMsgs({ ...msgs, birthdayGreeting: v })}
            rows={5}
          />
          <TextAreaField
            label="ข้อความอวยพร — วันเกิดเจ้าของ"
            hint="ใช้ได้: {shop} {name} · ไม่มี {pet} เพราะอวยพรคน ไม่ใช่น้อง"
            value={msgs?.birthdayGreetingOwner || ""}
            onChange={(v) => setMsgs({ ...msgs, birthdayGreetingOwner: v })}
            rows={5}
          />
        </>
      )}

      <div className="sticky bottom-3 z-10">
        <SaveBtn saving={saving} />
      </div>
    </form>
  );
}

/** ข้อความค่าน้องตัวเกินที่ลูกค้าเห็น ให้ตรงกับตัวเลขที่ตั้งไว้ */
function extraCatText(includedCats: number, price: number) {
  if (!price) return { th: "", en: "" };
  const n = includedCats + 1;
  const suf = n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return { th: `ตัวที่ ${n} +${price}`, en: `${n}${suf} pet +${price}` };
}

function RoomsTab({
  config,
  saving,
  onSave,
}: {
  config: SiteConfig;
  saving: boolean;
  onSave: (p: Partial<SiteConfig>) => void;
}) {
  const [rooms, setRooms] = useState(config.rooms);
  useEffect(() => setRooms(config.rooms), [config.rooms]);

  const updateRoom = (idx: number, patch: Partial<RoomType>) => {
    const next = [...rooms];
    next[idx] = { ...next[idx], ...patch };
    setRooms(next);
  };

  const onImage = (idx: number, file: File) => {
    const reader = new FileReader();
    reader.onload = () => updateRoom(idx, { image: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const addRoom = () => {
    const id = `room-${Date.now()}`;
    setRooms((prev) => [
      ...prev,
      {
        id,
        name: "ห้องใหม่",
        size: "S" as RoomType["size"],
        count: 1,
        maxCats: 1,
        price: 0,
        cats: { th: "", en: "" },
        extra: { th: "", en: "" },
        note: { th: "", en: "" },
        image: "",
        amenities: { th: [], en: [] },
      },
    ]);
  };

  const removeRoom = (idx: number) => {
    if (!confirm(`ลบ "${rooms[idx].name}" ออกจากรายการห้องเลยไหม?`)) return;
    setRooms((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-4">
      {rooms.map((room, idx) => (
        <div key={room.id} className="rounded-petflow border border-petflow-line bg-card p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <input
              value={room.name}
              onChange={(e) => updateRoom(idx, { name: e.target.value })}
              className="min-w-0 flex-1 rounded-petflow-sm border border-petflow-line bg-paper px-2.5 py-1.5 text-sm font-bold text-brown"
              placeholder="ชื่อห้อง"
            />
            <label className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-brown-soft">
              ขนาด
              <select
                value={room.size}
                onChange={(e) => updateRoom(idx, { size: e.target.value as RoomType["size"] })}
                className="rounded-petflow-sm border border-petflow-line bg-paper px-1.5 py-1 text-[11px]"
              >
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="S+S">S+S</option>
                <option value="M+M">M+M</option>
                <option value="S+M">S+M</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => removeRoom(idx)}
              className="flex h-10 shrink-0 items-center gap-1 rounded-full bg-wait/10 px-3 text-[11px] font-bold text-wait"
            >
              <Icon name="trash" size={14} />
              ลบ
            </button>
          </div>
          <div className="mb-3 flex gap-3">
            {room.image.startsWith("data:") || room.image.startsWith("http") ? (
              <Image
                src={room.image}
                alt=""
                width={80}
                height={100}
                className="h-[100px] w-[80px] rounded-petflow-sm object-contain bg-paper"
                unoptimized
              />
            ) : (
              <div className="flex h-[100px] w-[80px] items-center justify-center rounded-petflow-sm bg-paper text-xs text-brown-faint">
                ไม่มีรูป
              </div>
            )}
            <div className="flex-1 space-y-2">
              <Field
                label="ราคา/คืน (บาท)"
                type="number"
                value={String(room.price)}
                onChange={(v) => updateRoom(idx, { price: Number(v) })}
              />
              <Field
                label="URL รูปโปสเตอร์"
                value={room.image.startsWith("data:") ? "" : room.image}
                onChange={(v) => updateRoom(idx, { image: v })}
                placeholder="/catalog/rooms/xxx.jpg หรือ https://..."
              />
              <label className="block text-[10px] font-bold text-latte-deep">
                อัปโหลดรูป
                <input
                  type="file"
                  accept="image/*"
                  className="mt-1 block w-full text-[11px] text-brown-soft file:mr-2 file:h-9 file:cursor-pointer file:rounded-full file:border-0 file:bg-honey/30 file:px-3 file:text-xs file:font-bold file:text-petflow-chocolate"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onImage(idx, f);
                  }}
                />
              </label>
            </div>
          </div>
          <Field
            label="โน้ต (ไทย)"
            value={room.note?.th || ""}
            onChange={(v) =>
              updateRoom(idx, { note: { th: v, en: room.note?.en || v } })
            }
          />

          {/* ความจุ + ห้องเชื่อม — ตารางที่ว่างใช้สองค่านี้คำนวณว่ารับได้อีกกี่ตัว */}
          <div className="mt-3 rounded-petflow-sm border border-petflow-line bg-paper/50 p-3">
            <p className="text-[11px] font-extrabold text-petflow-chocolate">
              🛏️ ความจุ &amp; การจัดห้อง
            </p>
            <p className="mb-2 mt-0.5 text-[10px] text-brown-faint">
              ใช้คำนวณผังห้องและที่ว่าง — ตั้งผิดจะรับลูกค้าได้น้อยกว่าจริง หรือรับเกินห้องที่มี
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field
                label="จำนวนห้องจริง (ห้องเชื่อมใส่ 0)"
                type="number"
                value={String(room.count ?? 0)}
                onChange={(v) => updateRoom(idx, { count: Math.max(0, Number(v) || 0) })}
              />
              <Field
                label="จุน้องได้กี่ตัว/ห้อง"
                type="number"
                value={String(room.maxCats ?? 1)}
                onChange={(v) => updateRoom(idx, { maxCats: Math.max(1, Number(v) || 1) })}
              />
            </div>
            <p className="mt-1 text-[10px] text-brown-faint">
              น้องของบ้านเดียวกันช่วงวันเดียวกันเท่านั้นที่นอนรวมห้องได้ · คนละบ้านไม่รวมกันเสมอ
            </p>
            <label className="mt-2 flex items-center gap-2 text-[11px] font-bold text-brown-soft">
              สีในปฏิทิน
              <input
                type="color"
                value={room.color || roomColorMap(rooms)[room.id]}
                onChange={(e) => updateRoom(idx, { color: e.target.value })}
                className="h-8 w-12 cursor-pointer rounded border border-petflow-line bg-card"
              />
              {room.color && (
                <button
                  type="button"
                  onClick={() => updateRoom(idx, { color: undefined })}
                  className="text-[10px] font-bold text-latte-deep underline"
                >
                  ใช้สีอัตโนมัติ
                </button>
              )}
            </label>
            {(room.maxCats ?? 1) > 1 && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Field
                  label="ราคาห้องรวมน้องกี่ตัว"
                  type="number"
                  value={String(roomPricing(room).base)}
                  onChange={(v) => {
                    const includedCats = Math.max(1, Number(v) || 1);
                    const extraCatPrice = roomPricing(room).extraPrice;
                    updateRoom(idx, { includedCats, extraCatPrice, extra: extraCatText(includedCats, extraCatPrice) });
                  }}
                />
                <Field
                  label={`ตัวที่ ${roomPricing(room).base + 1} ขึ้นไป +฿/ตัว/คืน`}
                  type="number"
                  value={String(roomPricing(room).extraPrice)}
                  onChange={(v) => {
                    const includedCats = roomPricing(room).base;
                    const extraCatPrice = Math.max(0, Number(v) || 0);
                    updateRoom(idx, { includedCats, extraCatPrice, extra: extraCatText(includedCats, extraCatPrice) });
                  }}
                />
              </div>
            )}

            <p className="mt-3 text-[10px] font-extrabold text-brown-soft">
              🔗 ห้องเชื่อม — ห้องนี้เกิดจากเปิดห้องจริงถึงกันหรือเปล่า?
            </p>
            <p className="mb-1.5 text-[10px] text-brown-faint">
              ติ๊กแล้วใส่จำนวนห้องที่ใช้ · ที่ว่างจะคิดจากห้องจริงเหล่านั้นแทน
            </p>
            <div className="space-y-1">
              {rooms
                .filter((r) => r.id !== room.id && (r.count ?? 0) > 0)
                .map((part) => {
                  const cur = room.composedOf?.find((c) => c.typeId === part.id);
                  return (
                    <div key={part.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!cur}
                        onChange={(e) => {
                          const rest = (room.composedOf || []).filter(
                            (c) => c.typeId !== part.id
                          );
                          updateRoom(idx, {
                            composedOf: e.target.checked
                              ? [...rest, { typeId: part.id, units: cur?.units || 1 }]
                              : rest,
                          });
                        }}
                        className="h-3.5 w-3.5 accent-latte-deep"
                      />
                      <span className="flex-1 text-[11px] font-bold text-brown-soft">
                        {part.name}
                      </span>
                      {cur && (
                        <NumInput
                          type="number"
                          min={1}
                          value={cur.units}
                          onChange={(e) =>
                            updateRoom(idx, {
                              composedOf: (room.composedOf || []).map((c) =>
                                c.typeId === part.id
                                  ? { ...c, units: Math.max(1, Number(e.target.value) || 1) }
                                  : c
                              ),
                            })
                          }
                          className="w-16 rounded-petflow-sm border border-petflow-line bg-paper px-2 py-1 text-xs"
                        />
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addRoom}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-dashed border-latte-deep/50 bg-card text-xs font-extrabold text-latte-deep"
      >
        <Icon name="plus" size={16} />
        เพิ่มห้อง/แพ็กเกจใหม่
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => onSave({ rooms })}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-petflow-chocolate text-sm font-extrabold text-card shadow-petflow-sm disabled:opacity-50"
      >
        <Icon name="check" size={18} strokeWidth={2.2} />
        {saving ? "กำลังบันทึก…" : "บันทึกห้องทั้งหมด"}
      </button>
    </div>
  );
}

/**
 * ตารางราคาอาบน้ำ หรือ ราคานวด (massage) — เก็บรวมกันใน groomPricePrograms (นวดมี kind "massage")
 * แต่ละหน้าแก้เฉพาะชุดของตัวเอง แล้วรวมกับอีกชุดตอนบันทึก (ไม่ทับกัน)
 */
function GroomProgramsTab({
  config,
  saving,
  onSave,
  massage = false,
}: {
  config: SiteConfig;
  saving: boolean;
  onSave: (p: Partial<SiteConfig>) => void;
  massage?: boolean;
}) {
  const own = (list?: GroomProgram[]) =>
    massage ? resolveMassagePrograms(list) : bathPrograms(resolveGroomPrograms(list));
  const [programs, setPrograms] = useState<GroomProgram[]>(own(config.groomPricePrograms));
  useEffect(
    () => setPrograms(own(config.groomPricePrograms)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.groomPricePrograms, massage]
  );
  // รอบเวลา/จำนวนรับของนวด (คิวแยกจากอาบน้ำ)
  const [massageSlots, setMassageSlots] = useState((config.massageSlots || []).join(", "));
  const [massageCap, setMassageCap] = useState(String(config.massageSlotCapacity ?? 1));
  /** รวมชุดที่แก้กับอีกชุดที่ไม่ได้แก้ — ร้านที่ยังใช้ค่าตั้งต้นจะถูกบันทึกเป็นของร้านไปด้วย */
  const mergedPrograms = () => {
    const other = massage
      ? bathPrograms(resolveGroomPrograms(config.groomPricePrograms))
      : (config.groomPricePrograms || []).filter(isMassageProgram);
    const mine = programs.map((p) => (massage ? { ...p, kind: "massage" as const } : { ...p, kind: undefined }));
    return massage ? [...other, ...mine] : [...mine, ...other];
  };
  // ป้ายช่วงน้ำหนักของ 3 ไซส์ — ราคาในตารางคิดตามช่วงนี้
  const [sizeLabels, setSizeLabels] = useState<Partial<Record<GroomSize, string>>>(
    config.groomSizeLabels || {}
  );
  useEffect(() => setSizeLabels(config.groomSizeLabels || {}), [config.groomSizeLabels]);
  const sizes = GROOM_SIZES.map((sz) => ({ ...sz, label: sizeLabels[sz.id]?.trim() || sz.label }));
  const [tagDraft, setTagDraft] = useState<Record<string, string>>({});

  const updateProgram = (idx: number, patch: Partial<GroomProgram>) =>
    setPrograms((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));

  const addProgram = () => {
    setPrograms((prev) => [
      ...prev,
      massage
        ? {
            id: `massage-${Date.now()}`,
            name: "นวดแบบใหม่",
            kind: "massage" as const,
            breeds: [{ breed: "ทุกพันธุ์", prices: { kitten: 0, m: 0, l: 0 } }],
          }
        : {
            id: `program-${Date.now()}`,
            name: "โปรแกรมใหม่",
            breeds: [{ breed: "ขนสั้น", prices: { kitten: 0, m: 0, l: 0 } }],
          },
    ]);
  };

  const removeProgram = (idx: number) => {
    if (!confirm(`ลบโปรแกรม "${programs[idx].name}" เลยไหม?`)) return;
    setPrograms((prev) => prev.filter((_, i) => i !== idx));
  };

  const addBreedRow = (progIdx: number) => {
    setPrograms((prev) =>
      prev.map((p, i) =>
        i === progIdx
          ? { ...p, breeds: [...p.breeds, { breed: "", prices: { kitten: 0, m: 0, l: 0 } }] }
          : p
      )
    );
  };

  const updateBreedRow = (
    progIdx: number,
    breedIdx: number,
    patch: Partial<GroomProgram["breeds"][number]>
  ) =>
    setPrograms((prev) =>
      prev.map((p, i) =>
        i === progIdx
          ? {
              ...p,
              breeds: p.breeds.map((b, j) => (j === breedIdx ? { ...b, ...patch } : b)),
            }
          : p
      )
    );

  const removeBreedRow = (progIdx: number, breedIdx: number) =>
    setPrograms((prev) =>
      prev.map((p, i) =>
        i === progIdx ? { ...p, breeds: p.breeds.filter((_, j) => j !== breedIdx) } : p
      )
    );

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-brown-faint">
        {massage
          ? "ราคานวดที่ใช้ตอนคิดเงินและตอนเลือกโปรแกรมในแท็บนวด — ไซส์ใช้ช่วงน้ำหนักเดียวกับอาบน้ำ · เปิดบริการนวดที่ ตั้งค่า › เปิด/ปิดฟีเจอร์"
          : "ตารางราคาที่ใช้ตอนคิดเงินและตอนลูกค้าเลือกโปรแกรมตอนจอง — เพิ่ม/ลบโปรแกรมหรือแถวพันธุ์ได้เอง"}
      </p>
      {massage && (
        <div className="rounded-petflow border border-petflow-line bg-card p-4">
          <p className="text-xs font-extrabold text-petflow-chocolate">🕒 รอบเวลานวด</p>
          <p className="mb-2 mt-0.5 text-[10px] text-brown-faint">
            คิวนวดแยกจากคิวอาบน้ำ · ใส่เวลาคั่นด้วยจุลภาค เช่น 10:00, 13:00, 15:00 · เว้นว่าง = ใช้รอบเดียวกับอาบน้ำ
          </p>
          <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
            <input
              value={massageSlots}
              onChange={(e) => setMassageSlots(e.target.value)}
              placeholder={(config.groomSlots || []).join(", ")}
              className="min-w-0 rounded-petflow-sm border border-petflow-line bg-paper px-2.5 py-2 text-xs font-bold text-brown"
            />
            <label className="text-[10px] font-bold text-brown-soft">
              รับพร้อมกันต่อรอบ (ตัว)
              <NumInput
                type="number"
                min={1}
                value={massageCap}
                onChange={(e) => setMassageCap(e.target.value)}
                className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-2.5 py-2 text-xs font-bold text-brown"
              />
            </label>
          </div>
        </div>
      )}
      <div className="rounded-petflow border border-petflow-line bg-card p-4">
        <p className="text-xs font-extrabold text-petflow-chocolate">⚖️ ช่วงน้ำหนัก (ไซส์)</p>
        <p className="mb-2 mt-0.5 text-[10px] text-brown-faint">
          ราคาแต่ละแถวคิดตามช่วงน้ำหนักนี้ เช่น &quot;0–4 กก.&quot; · &quot;4–6 กก.&quot; · &quot;มากกว่า 6 กก.&quot;
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {GROOM_SIZES.map((sz) => (
            <input
              key={sz.id}
              value={sizeLabels[sz.id] ?? ""}
              placeholder={sz.label}
              onChange={(e) => setSizeLabels((cur) => ({ ...cur, [sz.id]: e.target.value }))}
              className="min-w-0 rounded-petflow-sm border border-petflow-line bg-paper px-2.5 py-2 text-xs font-bold text-brown"
            />
          ))}
        </div>
      </div>
      {programs.map((prog, progIdx) => (
        <div key={prog.id} className="rounded-petflow border border-petflow-line bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <input
              value={prog.name}
              onChange={(e) => updateProgram(progIdx, { name: e.target.value })}
              className="min-w-0 flex-1 rounded-petflow-sm border border-petflow-line bg-paper px-2.5 py-1.5 text-sm font-bold text-brown"
              placeholder="ชื่อโปรแกรม"
            />
            <button
              type="button"
              onClick={() => removeProgram(progIdx)}
              className="flex h-10 shrink-0 items-center gap-1 rounded-full bg-wait/10 px-3 text-[11px] font-bold text-wait"
            >
              <Icon name="trash" size={14} />
              ลบโปรแกรม
            </button>
          </div>

          {/* บริการย่อยที่รวมในโปรแกรม — โชว์เป็นแท็กตอนเลือกโปรแกรมและบนบอร์ดคิว */}
          <div className="mb-3">
            <p className="mb-1 text-[10px] font-bold text-brown-soft">รวมบริการย่อย (แท็ก)</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {(prog.includes || []).map((tag, tagIdx) => (
                <span
                  key={`${tag}-${tagIdx}`}
                  className="inline-flex items-center gap-1 rounded-full bg-sage/25 px-2.5 py-1 text-[11px] font-bold text-brown"
                >
                  {tag}
                  <button
                    type="button"
                    aria-label={`ลบ ${tag}`}
                    onClick={() =>
                      updateProgram(progIdx, {
                        includes: (prog.includes || []).filter((_, k) => k !== tagIdx),
                      })
                    }
                    className="text-brown-faint"
                  >
                    <Icon name="x" size={12} />
                  </button>
                </span>
              ))}
              <input
                value={tagDraft[prog.id] || ""}
                onChange={(e) => setTagDraft((d) => ({ ...d, [prog.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const tag = (tagDraft[prog.id] || "").trim();
                  if (!tag) return;
                  updateProgram(progIdx, { includes: [...(prog.includes || []), tag] });
                  setTagDraft((d) => ({ ...d, [prog.id]: "" }));
                }}
                placeholder="พิมพ์แล้วกด Enter เช่น ตัดเล็บ"
                className="min-w-[160px] flex-1 rounded-full border border-dashed border-petflow-line bg-paper px-3 py-1 text-[11px]"
              />
            </div>
          </div>

          <div className="space-y-2">
            {prog.breeds.map((b, breedIdx) => (
              <div
                key={breedIdx}
                className="rounded-petflow-sm border border-petflow-line bg-paper/50 p-2.5"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <input
                    value={b.breed}
                    onChange={(e) => updateBreedRow(progIdx, breedIdx, { breed: e.target.value })}
                    placeholder="เช่น ขนสั้น, ขนยาว"
                    className="min-w-0 flex-1 rounded-petflow-sm border border-petflow-line bg-card px-2 py-1.5 text-xs font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => removeBreedRow(progIdx, breedIdx)}
                    className="flex h-9 shrink-0 items-center gap-1 px-2 text-[11px] font-bold text-wait"
                  >
                    <Icon name="x" size={14} />
                    ลบแถว
                  </button>
                </div>
                <div className="flex gap-2">
                  {sizes.map((sz) => (
                    <label key={sz.id} className="flex-1 text-[10px] font-bold text-brown-soft">
                      {sz.label}
                      <NumInput
                        type="number"
                        value={b.prices[sz.id as GroomSize]}
                        onChange={(e) =>
                          updateBreedRow(progIdx, breedIdx, {
                            prices: { ...b.prices, [sz.id]: Number(e.target.value) || 0 },
                          })
                        }
                        className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-card px-2 py-1.5 text-xs"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => addBreedRow(progIdx)}
            className="mt-2 w-full rounded-petflow-sm border border-dashed border-latte/60 py-1.5 text-[11px] font-bold text-latte-deep"
          >
            <Icon name="plus" size={16} />
            เพิ่มแถวพันธุ์/ราคา
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addProgram}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-dashed border-latte-deep/50 bg-card text-xs font-extrabold text-latte-deep"
      >
        <Icon name="plus" size={16} />
        เพิ่มโปรแกรมใหม่
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() =>
          onSave({
            groomPricePrograms: mergedPrograms(),
            groomSizeLabels: sizeLabels,
            ...(massage
              ? {
                  massageSlots: massageSlots
                    .split(/[,\s]+/)
                    .map((t) => t.trim())
                    .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
                    .map((t) => t.padStart(5, "0"))
                    .sort(),
                  massageSlotCapacity: Math.max(1, Math.round(Number(massageCap) || 1)),
                }
              : {}),
          })
        }
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-petflow-chocolate text-sm font-extrabold text-card shadow-petflow-sm disabled:opacity-50"
      >
        <Icon name="check" size={18} strokeWidth={2.2} />
        {saving ? "กำลังบันทึก…" : massage ? "บันทึกราคานวดทั้งหมด" : "บันทึกโปรแกรมอาบน้ำทั้งหมด"}
      </button>
    </div>
  );
}

/**
 * ตัวแก้ไขบล็อกเนื้อหา (รูป/ข้อความ อย่างใดอย่างหนึ่งหรือทั้งคู่) ใช้ร่วมกัน 3 ที่:
 * กฎระเบียบการฝาก, เนื้อหาเสริมหน้าห้องพัก, เนื้อหาเสริมหน้าอาบน้ำ — ต่างกันแค่ field ที่บันทึกลง config
 */
function ContentBlocksTab({
  config,
  saving,
  onSave,
  field,
  hint,
  saveLabel,
}: {
  config: SiteConfig;
  saving: boolean;
  onSave: (p: Partial<SiteConfig>) => void;
  field: "boardingRules" | "roomsPageBlocks" | "groomingPageBlocks";
  hint: string;
  saveLabel: string;
}) {
  const [blocks, setBlocks] = useState<BoardingRuleBlock[]>(config[field] || []);
  useEffect(() => setBlocks(config[field] || []), [config, field]);

  const updateBlock = (idx: number, patch: Partial<BoardingRuleBlock>) =>
    setBlocks((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)));

  const addBlock = () =>
    setBlocks((prev) => [...prev, { id: `rule-${Date.now()}`, text: "" }]);

  const removeBlock = (idx: number) =>
    setBlocks((prev) => prev.filter((_, i) => i !== idx));

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= blocks.length) return;
    setBlocks((prev) => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const onImage = (idx: number, file: File) => {
    const reader = new FileReader();
    reader.onload = () => updateBlock(idx, { image: String(reader.result) });
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-brown-faint">{hint}</p>
      {blocks.map((b, idx) => (
        <div key={b.id} className="rounded-petflow border border-petflow-line bg-card p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-brown-soft">บล็อกที่ {idx + 1}</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-paper text-brown-soft disabled:opacity-30"
                aria-label="เลื่อนขึ้น"
              >
                <Icon name="chevron" size={16} className="-rotate-90" />
              </button>
              <button
                type="button"
                onClick={() => move(idx, 1)}
                disabled={idx === blocks.length - 1}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-paper text-brown-soft disabled:opacity-30"
                aria-label="เลื่อนลง"
              >
                <Icon name="chevron" size={16} className="rotate-90" />
              </button>
              <button
                type="button"
                onClick={() => removeBlock(idx)}
                className="rounded-full bg-wait/10 px-2.5 py-1 text-[10px] font-bold text-wait"
              >
                ลบ
              </button>
            </div>
          </div>

          {b.image && (
            <Image
              src={b.image}
              alt=""
              width={200}
              height={140}
              className="mb-2 h-[140px] w-full rounded-petflow-sm object-cover bg-paper"
              unoptimized
            />
          )}
          <label className="block text-[10px] font-bold text-latte-deep">
            {b.image ? "เปลี่ยนรูป" : "แนบรูป (ไม่บังคับ)"}
            <input
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-[11px] text-brown-soft file:mr-2 file:h-9 file:cursor-pointer file:rounded-full file:border-0 file:bg-honey/30 file:px-3 file:text-xs file:font-bold file:text-petflow-chocolate"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImage(idx, f);
              }}
            />
          </label>
          {b.image && (
            <button
              type="button"
              onClick={() => updateBlock(idx, { image: undefined })}
              className="mt-1 text-[10px] font-bold text-wait underline"
            >
              เอารูปออก
            </button>
          )}

          <label className="mt-2 block text-[10px] font-bold text-brown-soft">
            ข้อความ (ไม่บังคับถ้ามีแต่รูป)
            <textarea
              value={b.text || ""}
              onChange={(e) => updateBlock(idx, { text: e.target.value })}
              rows={3}
              placeholder="เช่น กติกาการฝากเลี้ยง วัคซีน อาหาร ฯลฯ"
              className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm"
            />
          </label>
        </div>
      ))}
      <button
        type="button"
        onClick={addBlock}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-dashed border-latte-deep/50 bg-card text-xs font-extrabold text-latte-deep"
      >
        <Icon name="plus" size={16} />
        เพิ่มบล็อก
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => onSave({ [field]: blocks })}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-petflow-chocolate text-sm font-extrabold text-card shadow-petflow-sm disabled:opacity-50"
      >
        {saving ? "กำลังบันทึก…" : saveLabel}
      </button>
    </div>
  );
}

function GroomingTab({
  config,
  saving,
  onSave,
}: {
  config: SiteConfig;
  saving: boolean;
  onSave: (p: Partial<SiteConfig>) => void;
}) {
  const menus = config.grooming.menus as {
    bath?: { poster?: string };
    advance?: { poster?: string };
  };
  const [slotRows, setSlotRows] = useState(() =>
    config.groomSlots.map((time) => ({
      time,
      capacity: config.groomSlotCapacity?.[time] ?? config.groomSlotDefaultCapacity ?? 1,
    }))
  );
  const [defaultCapacity, setDefaultCapacity] = useState(config.groomSlotDefaultCapacity ?? 1);
  const [durationOn, setDurationOn] = useState(Boolean(config.groomDuration?.firstCatMinutes));
  const [firstCatMinutes, setFirstCatMinutes] = useState(config.groomDuration?.firstCatMinutes || 60);
  const [extraCatMinutes, setExtraCatMinutes] = useState(
    config.groomDuration?.extraCatMinutes ?? 30
  );
  const [closedWeekdays, setClosedWeekdays] = useState<number[]>(config.closedWeekdays ?? []);
  const [closedDates, setClosedDates] = useState<{ date: string; note?: string }[]>(
    config.closedDates ?? []
  );
  const [bathPoster, setBathPoster] = useState(menus.bath?.poster || "");
  const [advancePoster, setAdvancePoster] = useState(menus.advance?.poster || "");
  const [transportTh, setTransportTh] = useState(config.transport.th.join("\n"));
  const [transportEn, setTransportEn] = useState(config.transport.en.join("\n"));

  const onPoster = (which: "bath" | "advance", file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      if (which === "bath") setBathPoster(url);
      else setAdvancePoster(url);
    };
    reader.readAsDataURL(file);
  };

  const submit = () => {
    const grooming = JSON.parse(JSON.stringify(config.grooming)) as SiteConfig["grooming"];
    const m = grooming.menus as { bath?: { poster?: string }; advance?: { poster?: string } };
    if (m.bath) m.bath.poster = bathPoster;
    if (m.advance) m.advance.poster = advancePoster;
    const cleanRows = slotRows.filter((r) => r.time.trim());
    onSave({
      groomSlots: cleanRows.map((r) => r.time.trim()),
      groomSlotCapacity: Object.fromEntries(
        cleanRows.map((r) => [r.time.trim(), Math.max(1, r.capacity || 1)])
      ),
      groomSlotDefaultCapacity: Math.max(1, defaultCapacity || 1),
      groomDuration: durationOn
        ? {
            firstCatMinutes: Math.max(5, firstCatMinutes || 60),
            extraCatMinutes: Math.max(0, extraCatMinutes || 0),
          }
        : { firstCatMinutes: 0 },
      closedWeekdays,
      closedDates: closedDates.filter((d) => d.date.trim()),
      transport: {
        th: transportTh.split("\n").filter(Boolean),
        en: transportEn.split("\n").filter(Boolean),
      },
      grooming,
    });
  };

  return (
    <div className="space-y-3 rounded-petflow bg-card p-4 shadow-petflow-sm">
      <div>
        <p className="mb-1 text-xs font-extrabold text-petflow-chocolate">
          🕒 รอบเวลาอาบน้ำ + จำนวนคิวที่รับต่อรอบ
        </p>
        <p className="mb-2 text-[10px] text-brown-faint">
          ใช้กับหน้า “จองคิวเอง” ของลูกค้า — สล็อตที่เต็มแล้วลูกค้าจะเลือกไม่ได้
        </p>
        <div className="space-y-2">
          {slotRows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="time"
                value={row.time}
                onChange={(e) => {
                  const next = [...slotRows];
                  next[i] = { ...next[i], time: e.target.value };
                  setSlotRows(next);
                }}
                className="rounded-petflow-sm border border-petflow-line bg-paper px-2 py-1.5 text-sm"
              />
              <NumInput
                type="number"
                min={1}
                value={row.capacity}
                onChange={(e) => {
                  const next = [...slotRows];
                  next[i] = { ...next[i], capacity: Number(e.target.value) || 1 };
                  setSlotRows(next);
                }}
                className="w-16 rounded-petflow-sm border border-petflow-line bg-paper px-2 py-1.5 text-sm"
              />
              <span className="text-[10px] text-brown-faint">คิว/รอบ</span>
              <button
                type="button"
                onClick={() => setSlotRows(slotRows.filter((_, k) => k !== i))}
                className="ml-auto shrink-0 px-2 text-wait"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSlotRows([...slotRows, { time: "10:00", capacity: defaultCapacity }])}
            className="w-full rounded-petflow-sm border border-dashed border-petflow-line py-2 text-xs font-bold text-latte-deep"
          >
            + เพิ่มรอบเวลา
          </button>
        </div>
        <label className="mt-2 flex items-center gap-2 text-[11px] font-bold text-brown-soft">
          จำนวนคิวเริ่มต้น (ใช้ตอนเพิ่มรอบใหม่)
          <NumInput
            type="number"
            min={1}
            value={defaultCapacity}
            onChange={(e) => setDefaultCapacity(Number(e.target.value) || 1)}
            className="w-16 rounded-petflow-sm border border-petflow-line bg-paper px-2 py-1.5 text-sm font-normal"
          />
        </label>
      </div>

      <div className="rounded-petflow-sm bg-paper/70 p-3">
        <label className="flex items-center gap-2 text-xs font-extrabold text-petflow-chocolate">
          <input type="checkbox" checked={durationOn} onChange={(e) => setDurationOn(e.target.checked)} />
          ⏱ คิดเวลาอาบน้ำตามจำนวนน้อง (บ้านเดียวกันมาพร้อมกัน)
        </label>
        <p className="mt-1 text-[10px] text-brown-faint">
          เปิดแล้ว น้องทั้งบ้านเริ่มเวลาเดียวกัน ระบบคิดเวลารวมแล้วกันทุกรอบที่อยู่ในช่วงนั้น · ตัวเลข “คิว/รอบ” ด้านบน
          = รับพร้อมกันได้กี่บ้าน · ปิดไว้ = น้อง 1 ตัว = 1 คิว แบบเดิม
        </p>
        {durationOn && (
          <div className="mt-2 space-y-1.5 text-[11px] font-bold text-brown-soft">
            <label className="flex items-center gap-2">
              ตัวแรกใช้
              <NumInput
                type="number"
                min={5}
                step={5}
                value={firstCatMinutes}
                onChange={(e) => setFirstCatMinutes(Number(e.target.value) || 0)}
                className="w-20 rounded-petflow-sm border border-petflow-line bg-card px-2 py-1.5 text-sm font-normal"
              />
              นาที
            </label>
            <label className="flex items-center gap-2">
              ตัวต่อไป +
              <NumInput
                type="number"
                min={0}
                step={5}
                value={extraCatMinutes}
                onChange={(e) => setExtraCatMinutes(Number(e.target.value) || 0)}
                className="w-20 rounded-petflow-sm border border-petflow-line bg-card px-2 py-1.5 text-sm font-normal"
              />
              นาที/ตัว
            </label>
            <p className="text-[10px] font-normal text-brown-faint">
              ตัวอย่าง: มา 3 ตัว = {firstCatMinutes + 2 * extraCatMinutes} นาที (
              {Math.floor((firstCatMinutes + 2 * extraCatMinutes) / 60)} ชม.{" "}
              {(firstCatMinutes + 2 * extraCatMinutes) % 60} นาที) · ใส่รอบเวลาถี่ขึ้น (เช่นทุก 30 นาที) จะจองได้ยืดหยุ่นกว่า
            </p>
          </div>
        )}
      </div>

      <div>
        <p className="mb-1 text-xs font-extrabold text-petflow-chocolate">วันที่ร้านปิด</p>
        <p className="mb-2 text-[10px] text-brown-faint">
          มีผลกับ “จองคิวเอง” ทั้งอาบน้ำและห้องพัก — ลูกค้าจองวันนี้ไม่ได้ (น้องที่เข้าพักอยู่แล้วไม่กระทบ)
        </p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {WEEKDAY_LABELS.map((label, idx) => {
            const active = closedWeekdays.includes(idx);
            return (
              <button
                key={idx}
                type="button"
                onClick={() =>
                  setClosedWeekdays(
                    active ? closedWeekdays.filter((d) => d !== idx) : [...closedWeekdays, idx]
                  )
                }
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                  active
                    ? "border-wait bg-wait/15 text-wait"
                    : "border-petflow-line bg-paper text-brown-soft"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          {closedDates.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="date"
                value={row.date}
                onChange={(e) => {
                  const next = [...closedDates];
                  next[i] = { ...next[i], date: e.target.value };
                  setClosedDates(next);
                }}
                className="rounded-petflow-sm border border-petflow-line bg-paper px-2 py-1.5 text-sm"
              />
              <input
                type="text"
                placeholder="หมายเหตุ (ไม่บังคับ) เช่น ปิดปีใหม่"
                value={row.note || ""}
                onChange={(e) => {
                  const next = [...closedDates];
                  next[i] = { ...next[i], note: e.target.value };
                  setClosedDates(next);
                }}
                className="flex-1 rounded-petflow-sm border border-petflow-line bg-paper px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => setClosedDates(closedDates.filter((_, k) => k !== i))}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-wait"
                aria-label="ลบ"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setClosedDates([...closedDates, { date: "", note: "" }])}
            className="w-full rounded-petflow-sm border border-dashed border-petflow-line py-2 text-xs font-bold text-latte-deep"
          >
            + เพิ่มวันหยุด
          </button>
        </div>
      </div>

      <PosterField
        label="รูปเมนูอาบน้ำ"
        value={bathPoster}
        onChange={setBathPoster}
        onUpload={(f) => onPoster("bath", f)}
      />
      <PosterField
        label="รูปเมนู Advance"
        value={advancePoster}
        onChange={setAdvancePoster}
        onUpload={(f) => onPoster("advance", f)}
      />

      <label className="block text-xs font-bold text-brown-soft">
        รับส่ง (ไทย) — หนึ่งบรรทัดต่อข้อ
        <textarea value={transportTh} onChange={(e) => setTransportTh(e.target.value)} rows={4} className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm" />
      </label>
      <label className="block text-xs font-bold text-brown-soft">
        รับส่ง (EN)
        <textarea value={transportEn} onChange={(e) => setTransportEn(e.target.value)} rows={4} className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm" />
      </label>
      <p className="text-[10px] text-brown-faint">
        หน้าลูกค้าจะแสดงรูป 2 รูปนี้เต็มๆ — ไม่มีตารางราคา
      </p>
      <button type="button" disabled={saving} onClick={submit} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-petflow-chocolate text-sm font-extrabold text-card shadow-petflow-sm disabled:opacity-50">
        <Icon name="check" size={18} strokeWidth={2.2} />
        {saving ? "กำลังบันทึก…" : "บันทึกอาบน้ำ/กรูมมิ่ง"}
      </button>
    </div>
  );
}

function PointsTab({
  config,
  saving,
  onSave,
}: {
  config: SiteConfig;
  saving: boolean;
  onSave: (p: Partial<SiteConfig>) => void;
}) {
  const [rewards, setRewards] = useState(config.pointsRewards);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  useEffect(() => setRewards(config.pointsRewards), [config.pointsRewards]);

  const onRewardImage = async (i: number, id: string, file: File) => {
    setUploadingId(id);
    try {
      const dataUrl = await toJpegDataUrl(file);
      setRewards((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], imageUrl: dataUrl };
        return next;
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {rewards.map((r, i) => (
        <div key={r.id} className="rounded-petflow border border-petflow-line bg-card p-3 space-y-2">
          <p className="text-xs font-bold text-brown-faint">{r.id}</p>
          <div className="flex gap-3">
            {r.imageUrl ? (
              <Image
                src={r.imageUrl}
                alt=""
                width={64}
                height={64}
                className="h-16 w-16 shrink-0 rounded-petflow-sm object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-petflow-sm bg-paper text-brown-soft">
                <Icon name="gift" size={24} />
              </div>
            )}
            <label className="flex-1 text-[10px] font-bold text-latte-deep">
              รูปของรางวัล (ไม่บังคับ)
              <input
                type="file"
                accept="image/*"
                disabled={uploadingId === r.id}
                className="mt-1 block w-full text-[11px] text-brown-soft file:mr-2 file:h-9 file:cursor-pointer file:rounded-full file:border-0 file:bg-honey/30 file:px-3 file:text-xs file:font-bold file:text-petflow-chocolate"
                onChange={(e) => e.target.files?.[0] && onRewardImage(i, r.id, e.target.files[0])}
              />
              {r.imageUrl && (
                <button
                  type="button"
                  onClick={() => {
                    const next = [...rewards];
                    next[i] = { ...next[i], imageUrl: undefined };
                    setRewards(next);
                  }}
                  className="mt-1 text-wait"
                >
                  ลบรูป
                </button>
              )}
            </label>
          </div>
          <Field
            label="แต้มที่ใช้"
            type="number"
            value={String(r.points)}
            onChange={(v) => {
              const next = [...rewards];
              next[i] = { ...r, points: Number(v) };
              setRewards(next);
            }}
          />
          <Field
            label="มูลค่าส่วนลด (บาท) — ตั้งไว้ = แลกแต้มแล้วได้คูปองใช้จริง"
            type="number"
            value={String(r.discount ?? "")}
            onChange={(v) => {
              const next = [...rewards];
              next[i] = { ...r, discount: v ? Number(v) : undefined };
              setRewards(next);
            }}
          />
          <Field
            label="รางวัล (ไทย)"
            value={r.reward.th}
            onChange={(v) => {
              const next = [...rewards];
              next[i] = { ...r, reward: { ...r.reward, th: v } };
              setRewards(next);
            }}
          />
          <Field
            label="รางวัล (EN)"
            value={r.reward.en}
            onChange={(v) => {
              const next = [...rewards];
              next[i] = { ...r, reward: { ...r.reward, en: v } };
              setRewards(next);
            }}
          />
        </div>
      ))}
      <button
        type="button"
        disabled={saving}
        onClick={() => onSave({ pointsRewards: rewards })}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-petflow-chocolate text-sm font-extrabold text-card shadow-petflow-sm disabled:opacity-50"
      >
        <Icon name="check" size={18} strokeWidth={2.2} />
        บันทึกรางวัลแต้ม
      </button>
    </div>
  );
}

function CrmTab({
  config,
  saving,
  onSave,
}: {
  config: SiteConfig;
  saving: boolean;
  onSave: (p: Partial<SiteConfig>) => void;
}) {
  const [form, setForm] = useState(config.crm);
  const [presetsText, setPresetsText] = useState(config.crm.tierPresets.join(", "));
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState("");

  useEffect(() => {
    setForm(config.crm);
    setPresetsText(config.crm.tierPresets.join(", "));
  }, [config.crm]);

  const rules = form.tierRules || {
    regularMinVisits: 1,
    vipMinVisits: 5,
    vipMinSpend: 0,
  };
  const setRule = (patch: Partial<typeof rules>) =>
    setForm({ ...form, tierRules: { ...rules, ...patch } });

  const recalcAll = async () => {
    setRecalcBusy(true);
    setRecalcMsg("");
    try {
      const res = await fetch("/api/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recalc_all_tiers" }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setRecalcMsg(`คำนวณใหม่ ${d.total} คน · เปลี่ยนระดับ ${d.updated} คน`);
      } else {
        setRecalcMsg("คำนวณไม่สำเร็จ");
      }
    } finally {
      setRecalcBusy(false);
    }
  };

  return (
    <form
      className="space-y-3 rounded-petflow bg-card p-4 shadow-petflow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          crm: {
            ...form,
            tierPresets: presetsText
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          },
        });
      }}
    >
      <p className="text-xs text-brown-soft">
        ตั้งค่าตรวจจับลูกค้าที่หายไป + ข้อความตามทาง LINE · ใช้ใน Admin และ Telegram Bot
      </p>
      <Field
        label="ถือว่าหายไป (วัน)"
        type="number"
        value={String(form.inactiveDays)}
        onChange={(v) => setForm({ ...form, inactiveDays: Math.max(1, Number(v) || 60) })}
      />
      <Field
        label="ไม่ส่งซ้ำภายใน (วัน)"
        type="number"
        value={String(form.followUpCooldownDays)}
        onChange={(v) =>
          setForm({ ...form, followUpCooldownDays: Math.max(1, Number(v) || 30) })
        }
      />
      <label className="block text-xs font-bold text-brown-soft">
        ข้อความตามลูกค้า — ใช้ {"{name}"} {"{days}"} {"{pets}"} {"{shop}"}
        <textarea
          value={form.followUpMessage}
          onChange={(e) => setForm({ ...form, followUpMessage: e.target.value })}
          rows={5}
          className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm"
        />
        <a href="/admin/cards?card=missYou" className="mt-1 block text-[11px] font-bold text-latte-deep underline">
          ดูตัวอย่างการ์ด + แก้หัวข้อ สี และปุ่ม
        </a>
      </label>
      <Field
        label="Tier ที่ตั้งได้ (คั่นด้วย ,)"
        value={presetsText}
        onChange={setPresetsText}
      />

      <hr className="border-petflow-line" />
      <p className="text-xs font-extrabold text-petflow-chocolate">
        เงื่อนไขเลื่อนระดับลูกค้าอัตโนมัติ
      </p>
      <p className="text-[10px] text-brown-faint">
        ระบบจะเลื่อนระดับให้เองเมื่อลูกค้ามาใช้บริการครบ หรือยอดสะสมถึงเกณฑ์
        (Member = ลูกค้าที่เติมเครดิต)
      </p>
      <Field
        label="ลูกค้าประจำ — มาใช้บริการ (ครั้ง) ขึ้นไป"
        type="number"
        value={String(rules.regularMinVisits)}
        onChange={(v) => setRule({ regularMinVisits: Math.max(0, Number(v) || 0) })}
      />
      <Field
        label="VIP — มาใช้บริการ (ครั้ง) ขึ้นไป"
        type="number"
        value={String(rules.vipMinVisits)}
        onChange={(v) => setRule({ vipMinVisits: Math.max(0, Number(v) || 0) })}
      />
      <Field
        label="VIP — หรือยอดสะสมรวม (บาท) ขึ้นไป · 0 = ปิด"
        type="number"
        value={String(rules.vipMinSpend)}
        onChange={(v) => setRule({ vipMinSpend: Math.max(0, Number(v) || 0) })}
      />

      <SaveBtn saving={saving} />

      <hr className="border-petflow-line" />
      <button
        type="button"
        onClick={recalcAll}
        disabled={recalcBusy}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-paper text-xs font-extrabold text-petflow-chocolate disabled:opacity-50"
      >
        {recalcBusy ? "กำลังคำนวณ…" : "คำนวณระดับลูกค้าใหม่ทั้งหมด (หลังแก้เงื่อนไข)"}
      </button>
      {recalcMsg && (
        <p className="text-center text-[11px] font-bold text-ok">{recalcMsg}</p>
      )}
      <p className="text-[10px] text-brown-faint">
        Cron อัตโนมัติ: GET /api/cron/inactive-followup (ตั้งใน Vercel Cron)
      </p>
    </form>
  );
}

/** ร้านดาวน์โหลดข้อมูลทั้งหมดของร้านตัวเองเก็บไว้ — งานดูแลฐานข้อมูลระบบทำให้อัตโนมัติแล้ว */
function BackupTab() {
  return (
    <div className="space-y-3 rounded-petflow bg-card p-4 shadow-petflow-sm">
      <a
        href="/api/admin/backup"
        download
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-paper text-xs font-extrabold text-petflow-chocolate"
      >
        <Icon name="download" size={16} />
        ดาวน์โหลดสำรองข้อมูลทั้งหมด (.json)
      </a>
      <p className="text-[10px] text-brown-faint">
        ไฟล์เดียวครบทุกอย่าง ลูกค้า น้อง นัด บิล บัญชี แต้ม โปร คูปอง คอร์ส
        บทความ พนักงาน ประวัติเติมเครดิต ประวัติใช้บริการ และการตั้งค่า —
        มีข้อมูลส่วนตัวลูกค้า เก็บในที่ปลอดภัย
      </p>
    </div>
  );
}

function PosterField({
  label,
  value,
  onChange,
  onUpload,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onUpload: (f: File) => void;
}) {
  const hasImage = value.startsWith("data:") || value.startsWith("http") || value.startsWith("/");

  return (
    <div className="rounded-petflow-sm border border-petflow-line bg-paper p-3">
      <p className="mb-2 text-xs font-bold text-brown-soft">{label}</p>
      <div className="flex gap-3">
        {hasImage ? (
          <Image
            src={value}
            alt=""
            width={72}
            height={96}
            className="h-24 w-[72px] shrink-0 rounded-petflow-sm object-cover bg-card"
            unoptimized
          />
        ) : (
          <div className="flex h-24 w-[72px] shrink-0 items-center justify-center rounded-petflow-sm bg-card text-[9px] text-brown-faint">
            ยังไม่มี
          </div>
        )}
        <div className="flex flex-1 flex-col gap-2">
          <label className="block text-[10px] font-bold text-latte-deep">
            อัปโหลดรูป
            <input
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-[11px] text-brown-soft file:mr-2 file:h-9 file:cursor-pointer file:rounded-full file:border-0 file:bg-honey/30 file:px-3 file:text-xs file:font-bold file:text-petflow-chocolate"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
              }}
            />
          </label>
          <input
            value={value.startsWith("data:") ? "" : value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="หรือวาง URL"
            className="w-full rounded-petflow-sm border border-petflow-line bg-card px-2 py-1.5 text-xs"
          />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs font-bold text-brown-soft">
      {label}
      {type === "number" ? (
        <NumInput
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm"
        />
      ) : (
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm"
        />
      )}
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-[10px] font-bold text-brown-soft">
      {label}
      <div className="mt-1 flex items-center gap-1.5 rounded-petflow-sm border border-petflow-line bg-paper px-2 py-1.5">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : "#000000"}
          onChange={(e) => onChange(e.target.value.trim())}
          className="h-6 w-6 shrink-0 cursor-pointer border-0 bg-transparent p-0"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          className="min-w-0 flex-1 bg-transparent text-xs font-mono outline-none"
        />
      </div>
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  hint,
  rows = 4,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs font-bold text-brown-soft">
      {label}
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm leading-relaxed"
      />
      {hint && (
        <span className="mt-0.5 block font-normal text-[10px] text-brown-faint">
          {hint}
        </span>
      )}
    </label>
  );
}

/** เวลาที่ส่ง — ตัวเลือกจำกัดตามรอบ cron ที่ตั้งไว้จริง (08:00 / 12:00 / 18:00 ไทย)
 *  เลือกได้เท่านี้เพราะ cron รันเป็นรอบตายตัว ไม่ใช่นาฬิกาที่ตั้งเวลาไหนก็ได้ */
function TimeSlotField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs font-bold text-brown-soft">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm"
      >
        <option value="08:00">เช้า (8 โมง)</option>
        <option value="12:00">เที่ยง (12 โมง)</option>
        <option value="18:00">หัวค่ำ (6 โมงเย็น)</option>
        <option value="19:30">ค่ำ (1 ทุ่มครึ่ง)</option>
      </select>
    </label>
  );
}

const AUTOMATION_DEFAULT = {
  confirmTomorrowEnabled: true,
  confirmDaysBefore: 1,
  depositReminderEnabled: true,
  depositReminderDays: 7,
  prestayReminderEnabled: true,
  prestayReminderDays: 3,
  checkinReminderEnabled: true,
  checkinReminderDays: 1,
  checkinReminderTime: "12:00",
  checkoutReminderEnabled: true,
  checkoutReminderDays: 1,
  checkoutReminderTime: "19:30",
  reviewRequestEnabled: true,
  reviewRequestDaysAfter: 1,
  groomInfoEnabled: true,
  intakeAutoEnabled: true,
  freeLitterMinNights: 3,
  birthdayEnabled: true,
  birthdayCouponEnabled: true,
  birthdayCouponAmount: 100,
  bookingApprovedEnabled: true,
};

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex min-h-[44px] w-full items-center justify-between gap-3 py-1 text-left"
    >
      <span className="text-xs font-bold text-brown">{label}</span>
      <span
        className={`flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition ${
          checked ? "bg-sage justify-end" : "bg-paper justify-start"
        }`}
      >
        <span className="h-5 w-5 rounded-full bg-card shadow-petflow-sm" />
      </span>
    </button>
  );
}

/** เปิด/ปิดฟีเจอร์รายร้าน — ปิด = ซ่อนเมนูหลังร้าน + ส่วนที่ลูกค้าเห็น + API ฝั่งลูกค้า */
function FeaturesTab({
  config,
  saving,
  onSave,
}: {
  config: SiteConfig;
  saving: boolean;
  onSave: (patch: Partial<SiteConfig>) => void;
}) {
  const [form, setForm] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      FEATURES.map((f) => [f.key, f.defaultOff ? config.features?.[f.key] === true : config.features?.[f.key] !== false])
    )
  );
  const draft = { features: form };
  const parentOff = (key?: FeatureKey) => (key ? !isFeatureOn(draft, key) : false);
  // คูปองชวนเพื่อน — ตั้งมูลค่า/อายุเองได้ (ว่าง = ค่าเริ่มต้น 100 บาท · 60 วัน)
  const [referral, setReferral] = useState(() => {
    const r = referralReward(config);
    return { amount: String(r.amount), expiresInDays: String(r.expiresInDays) };
  });
  // ขอข้อมูลตามบริการ — นัดอาบน้ำ/นวดขออะไรเพิ่ม, ใช้ฟอร์มไหน, บังคับตอบทุกข้อไหม
  const [rules, setRules] = useState<IntakeRules>(() => ({ groomCards: [], ...config.intakeRules }));
  const toggleGroomCard = (key: string, v: boolean) =>
    setRules((r) => {
      const cur = r.groomCards || [];
      return { ...r, groomCards: v ? [...cur.filter((k) => k !== key), key] : cur.filter((k) => k !== key) };
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          features: form,
          intakeRules: rules,
          referral: {
            amount: Math.max(0, Math.round(Number(referral.amount) || 0)) || REFERRAL_DEFAULT.amount,
            expiresInDays:
              Math.max(0, Math.round(Number(referral.expiresInDays) || 0)) || REFERRAL_DEFAULT.expiresInDays,
          },
        });
      }}
      className="space-y-4"
    >
      <p className="rounded-petflow-sm bg-paper px-3 py-2.5 text-[11px] leading-relaxed text-brown-soft">
        ปิดฟีเจอร์ไหน เมนูนั้นจะหายจากหลังร้าน และลูกค้าจะไม่เห็นในแอป ข้อมูลเดิมไม่หาย เปิดกลับมาเมื่อไหร่ก็ใช้ต่อได้ทันที
      </p>
      {FEATURE_GROUPS.map((g) => (
        <section key={g} className="rounded-petflow bg-card p-4 shadow-petflow-sm">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">{g}</p>
          <ul className="divide-y divide-petflow-line">
            {FEATURES.filter((f) => f.group === g).map((f) => {
              const locked = parentOff(f.requires);
              return (
                <li key={f.key} className={`py-1 ${f.requires ? "pl-4" : ""} ${locked ? "opacity-40" : ""}`}>
                  <Toggle
                    label={f.label}
                    checked={!locked && form[f.key]}
                    onChange={(v) => !locked && setForm((prev) => ({ ...prev, [f.key]: v }))}
                  />
                  <p className="-mt-1 pb-1 text-[10px] text-brown-faint">
                    {locked ? `ปิดอยู่เพราะปิด "${FEATURES.find((x) => x.key === f.requires)?.label}"` : f.hint}
                  </p>
                  {f.key === "referral" && !locked && form.referral && (
                    <div className="grid grid-cols-2 gap-2 pb-2">
                      <Field
                        label="คูปองคนละ (บาท)"
                        type="number"
                        value={referral.amount}
                        onChange={(v) => setReferral((r) => ({ ...r, amount: v }))}
                      />
                      <Field
                        label="ใช้ได้กี่วัน"
                        type="number"
                        value={referral.expiresInDays}
                        onChange={(v) => setReferral((r) => ({ ...r, expiresInDays: v }))}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {g === "ข้อมูลก่อนรับน้อง" && (
            <div className="mt-3 border-t border-petflow-line pt-3">
              <p className="text-sm font-extrabold text-petflow-chocolate">ขอข้อมูลตามบริการ</p>
              <p className="pb-2 text-[10px] text-brown-faint">
                แต่ละร้านขอข้อมูลไม่เหมือนกัน — ตั้งว่านัดอาบน้ำ/นวดขออะไร และฟอร์มทำประวัติบังคับตอบไหม (ใช้ทั้งปุ่มส่งการ์ดและการ์ดอัตโนมัติ)
              </p>
              <p className="pt-1 text-xs font-bold text-petflow-chocolate">นัดอาบน้ำ / นวด ขอเพิ่มด้วย</p>
              <ul className="divide-y divide-petflow-line">
                {GROOM_EXTRA_CARDS.map((c) => (
                  <li key={c.key} className="py-1">
                    <Toggle
                      label={c.label}
                      checked={Boolean(rules.groomCards?.includes(c.key))}
                      onChange={(v) => toggleGroomCard(c.key, v)}
                    />
                  </li>
                ))}
                <li className="py-1">
                  <Toggle
                    label="นัดอาบน้ำ / นวด ใช้ฟอร์มทำประวัติ (เจ้าของ + น้อง)"
                    checked={Boolean(rules.groomUsesHistory)}
                    onChange={(v) => setRules((r) => ({ ...r, groomUsesHistory: v }))}
                  />
                  <p className="-mt-1 pb-1 text-[10px] text-brown-faint">
                    เปิด = ลูกค้าอาบน้ำกรอกแค่ประวัติเจ้าของ + ประวัติน้อง (ฟอร์มหมา) แทนฟอร์มก่อนอาบน้ำ · ฝากเลี้ยงกรอกหมวดการดูแลเพิ่ม ไม่ต้องพิมพ์ซ้ำ
                  </p>
                </li>
                <li className="py-1">
                  <Toggle
                    label="ฟอร์มทำประวัติ / ก่อนเข้าพัก บังคับตอบทุกข้อ"
                    checked={Boolean(rules.allRequired)}
                    onChange={(v) => setRules((r) => ({ ...r, allRequired: v }))}
                  />
                  <p className="-mt-1 pb-1 text-[10px] text-brown-faint">ข้อที่ไม่มี ให้ลูกค้าพิมพ์ &quot;ไม่มี&quot;</p>
                </li>
                <li className="py-1">
                  <Toggle
                    label="หน้าสมัครสมาชิก ถามประวัติเจ้าของ + น้องไปเลย"
                    checked={Boolean(rules.registerAsksHistory)}
                    onChange={(v) => setRules((r) => ({ ...r, registerAsksHistory: v }))}
                  />
                  <p className="-mt-1 pb-1 text-[10px] text-brown-faint">
                    ถามตามฟอร์มทำประวัติ ไม่บังคับ ไม่กรอกก็สมัครได้ · เก็บไว้ที่น้องแต่ละตัว ฟอร์มก่อนเข้าพัก/อาบน้ำจะเติมให้เอง ไม่ต้องกรอกซ้ำ · ตอนนี้มีฟอร์มทำประวัติเฉพาะหมา
                  </p>
                </li>
              </ul>
            </div>
          )}
        </section>
      ))}
      <SaveBtn saving={saving} />
    </form>
  );
}

type AutoForm = typeof AUTOMATION_DEFAULT;

/** วันที่ส่งเทียบกับวันนัด — 0 = วันนั้นเลย */
function autoDayText(days: number, anchor: string) {
  return days <= 0 ? `วัน${anchor}` : `${days} วันก่อน${anchor}`;
}

/** ไทม์ไลน์ว่าลูกค้าได้อะไรวันไหน ตามที่ตั้งไว้ตอนนี้ — ใบที่ส่งรอบเดียวกันจะรวมอยู่ในข้อความเดียว */
function AutoTimeline({ form, config }: { form: AutoForm; config: SiteConfig }) {
  const intake = form.intakeAutoEnabled !== false;
  const groomExtras = GROOM_EXTRA_CARDS.filter((c) => groomUsesCard(config, c.key)).map((c) => c.label);
  type Row = { order: number; when: string; what: string; parts?: string[] };
  const groom: Row[] = [];
  const stay: Row[] = [];
  if (form.confirmTomorrowEnabled) {
    const d = form.confirmDaysBefore;
    groom.push({
      order: d,
      when: `${autoDayText(d, "นัด")} · 12:00`,
      what: "การ์ดเตือนนัด",
      parts: [
        ...(form.groomInfoEnabled ? ["ฟอร์มประวัติก่อนอาบน้ำ (ถ้ายังไม่เคยกรอก)"] : []),
        ...(intake ? groomExtras : []),
      ],
    });
    stay.push({ order: d, when: `${autoDayText(d, "เข้าพัก")} · 12:00`, what: "การ์ดเตือนนัด" });
  }
  if (form.depositReminderEnabled)
    stay.push({
      order: form.depositReminderDays,
      when: `${autoDayText(form.depositReminderDays, "เข้าพัก")} · 12:00`,
      what: "ข้อความเตือนยอดคงเหลือ (เฉพาะนัดที่จ่ายมัดจำแล้วยังค้าง)",
    });
  if (form.prestayReminderEnabled)
    stay.push({
      order: form.prestayReminderDays,
      when: `${autoDayText(form.prestayReminderDays, "เข้าพัก")} · 12:00`,
      what: "ชุดก่อนเข้าพัก",
      parts: [
        "การ์ดเตรียมตัว",
        ...(intake ? ["ฟอร์มก่อนเข้าพัก / สมุดวัคซีน / บัตรประชาชน / กฎ + กดยินยอม (ใบที่ยังขาด)"] : []),
        "ยอดคงเหลือ (ถ้ามี)",
        "เลือกเวลามาส่งน้อง",
      ],
    });
  if (form.checkinReminderEnabled)
    stay.push({
      order: form.checkinReminderDays - 0.1,
      when: `${autoDayText(form.checkinReminderDays, "เข้าพัก")} · ${form.checkinReminderTime || "12:00"}`,
      what: "เตือนเช็คอิน + เลือกเวลามาส่ง (ถ้ายังไม่ได้เลือกในชุดก่อนเข้าพัก)",
    });
  if (form.checkoutReminderEnabled)
    stay.push({
      order: -100 - (10 - form.checkoutReminderDays),
      when: `${autoDayText(form.checkoutReminderDays, "รับกลับ")} · ${form.checkoutReminderTime || "19:30"}`,
      what: "เตือนเช็คเอาท์ + เลือกเวลามารับ",
    });
  if (form.reviewRequestEnabled)
    stay.push({
      order: -1000 - form.reviewRequestDaysAfter,
      when: `${form.reviewRequestDaysAfter <= 0 ? "วันรับกลับ" : `${form.reviewRequestDaysAfter} วันหลังรับกลับ`} · 12:00`,
      what: "ขอรีวิว",
    });

  const list = (title: string, rows: Row[]) => (
    <div className="rounded-petflow-sm bg-paper p-3">
      <p className="pb-1.5 text-sm font-extrabold text-petflow-chocolate">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[11px] text-brown-faint">ไม่มีการส่งอัตโนมัติ</p>
      ) : (
        <ol className="space-y-2">
          {[...rows]
            .sort((a, b) => b.order - a.order)
            .map((r, i) => (
              <li key={i} className="border-l-4 border-honey pl-2">
                <p className="text-[11px] font-bold text-brown-soft">{r.when}</p>
                <p className="text-xs font-bold text-brown">{r.what}</p>
                {r.parts && r.parts.length > 0 && (
                  <p className="text-[11px] text-brown-soft">+ {r.parts.join(" · ")}</p>
                )}
              </li>
            ))}
        </ol>
      )}
    </div>
  );

  return (
    <section className="space-y-2 rounded-petflow bg-card p-4 shadow-petflow-sm">
      <p className="text-base font-extrabold text-petflow-chocolate">📅 ลูกค้าจะได้อะไร วันไหน</p>
      <p className="text-[11px] leading-relaxed text-brown-soft">
        สรุปจากที่ตั้งไว้ด้านล่าง (ยังไม่บันทึกก็เห็นผลทันที) · ใบที่เขียนต่อกันด้วย + ส่งรวมเป็นข้อความเดียว
        · หัวข้อที่อยู่คนละบรรทัดส่งแยกกัน แม้ตั้งเป็นวันเดียวกัน · ส่งซ้ำไม่ได้ ใบที่ลูกค้าส่งแล้วจะไม่ขออีก
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {list("🛁 นัดอาบน้ำ / นวด", groom)}
        {list("🏠 นัดเข้าพัก", stay)}
      </div>
    </section>
  );
}

function AutomationTab({
  config,
  saving,
  onSave,
}: {
  config: SiteConfig;
  saving: boolean;
  onSave: (p: Partial<SiteConfig>) => void;
}) {
  const [form, setForm] = useState({ ...AUTOMATION_DEFAULT, ...config.automation });
  useEffect(
    () => setForm({ ...AUTOMATION_DEFAULT, ...config.automation }),
    [config.automation]
  );
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const groomExtras = GROOM_EXTRA_CARDS.filter((c) => groomUsesCard(config, c.key)).map((c) => c.label);

  /** การ์ดหนึ่งเรื่อง: หัวข้อ · ใช้กับบริการไหน · ส่งเมื่อไหร่ · ในข้อความมีอะไร */
  const item = (o: {
    emoji: string;
    title: string;
    services: ("groom" | "stay")[];
    when: string;
    sends: string;
    on?: boolean;
    onToggle?: (v: boolean) => void;
    children?: React.ReactNode;
  }) => (
    <div className={`rounded-petflow-sm border border-petflow-line p-3 ${o.on === false ? "bg-paper/60" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-honey/30 text-lg">{o.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-petflow-chocolate">{o.title}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {o.services.map((s) => (
              <span key={s} className="rounded-full bg-sage/20 px-2 py-0.5 text-[10px] font-bold text-brown">
                {s === "groom" ? "🛁 อาบน้ำ / นวด" : "🏠 เข้าพัก"}
              </span>
            ))}
            <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-bold text-brown-soft">⏰ {o.when}</span>
          </div>
        </div>
        {o.onToggle && (
          <div className="shrink-0">
            <Toggle label="" checked={o.on !== false} onChange={o.onToggle} />
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-brown-soft">
        <span className="font-bold text-brown">ส่งอะไร: </span>
        {o.sends}
      </p>
      {o.on !== false && o.children && <div className="mt-2 space-y-2">{o.children}</div>}
    </div>
  );
  const group = (title: string, children: React.ReactNode) => (
    <section className="space-y-2 rounded-petflow bg-card p-4 shadow-petflow-sm">
      <p className="text-base font-extrabold text-petflow-chocolate">{title}</p>
      {children}
    </section>
  );

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ automation: form });
      }}
    >
      <p className="rounded-petflow-sm bg-paper px-3 py-2.5 text-[11px] leading-relaxed text-brown-soft">
        ระบบส่งรอบเที่ยงวัน (เวลาไทย) ทุกวัน ยกเว้นเตือนเช็คอิน/เช็คเอาท์ที่เลือกช่วงเวลาได้ · ข้อความแก้ได้ที่ตั้งค่า › ข้อความ
        <br />
        การ์ดของเรื่องที่ปิดไว้ในแท็บ “เปิด/ปิดฟีเจอร์” จะไม่ถูกส่ง แม้เปิดไว้ตรงนี้ · ปิดรายนัดได้ที่การ์ดนัดนั้น
        <br />
        <Link href="/admin/audit" className="font-bold text-petflow-chocolate underline">
          ดูผลแต่ละรอบ (ส่งกี่ใบ ติดอะไร) ›
        </Link>
      </p>

      <AutoTimeline form={form} config={config} />

      {group(
        "✔️ ยืนยันนัด",
        <>
          {item({
            emoji: "📆",
            title: "การ์ดเตือนนัดล่วงหน้า",
            services: ["groom", "stay"],
            when: `${autoDayText(form.confirmDaysBefore, "นัด")} · 12:00`,
            sends:
              "การ์ดเตือนนัดให้ลูกค้ากดยืนยัน · นัดอาบน้ำ/นวด จะพ่วงฟอร์มประวัติและเอกสารที่ร้านเลือก ไว้ในข้อความเดียวกัน · บ้านเดียวกันหลายตัวได้ใบเดียว",
            on: form.confirmTomorrowEnabled,
            onToggle: (v) => set({ confirmTomorrowEnabled: v }),
            children: (
              <Field
                label="ส่งล่วงหน้า (วัน) — 1 = พรุ่งนี้"
                type="number"
                value={String(form.confirmDaysBefore)}
                onChange={(v) => set({ confirmDaysBefore: Math.max(1, Number(v) || 1) })}
              />
            ),
          })}
        </>
      )}

      {group(
        "📝 ขอข้อมูลก่อนรับน้อง",
        <>
          {item({
            emoji: "🛁",
            title: "ขอประวัติน้องก่อนอาบน้ำ / นวด",
            services: ["groom"],
            when: "พร้อมการ์ดเตือนนัด",
            sends:
              "ฟอร์มประวัติน้อง (โรค นิสัย แพ้) เฉพาะน้องที่ยังไม่เคยกรอก · น้องที่กรอกแล้ว ร้านได้บรีฟทาง Telegram แทน",
            on: form.groomInfoEnabled,
            onToggle: (v) => set({ groomInfoEnabled: v }),
          })}
          {item({
            emoji: "📋",
            title: "ขอเอกสารที่ยังขาดอัตโนมัติ",
            services: ["groom", "stay"],
            when: "พ่วงไปกับการ์ดเตือนนัด / ชุดก่อนเข้าพัก",
            sends: `เข้าพัก: ฟอร์มก่อนเข้าพัก สมุดวัคซีน บัตรประชาชน กฎ + กดยินยอม (ไปกับชุดก่อนเข้าพัก) · อาบน้ำ/นวด: ${
              groomExtras.length ? groomExtras.join(" ") : "ไม่ขอเพิ่ม"
            } (ไปกับการ์ดเตือนนัด · เลือกได้ที่ เปิด/ปิดฟีเจอร์ › ขอข้อมูลตามบริการ) · ขาดหลายใบรวมเป็นการ์ดเดียว ปุ่มเดียวไล่ทีละหน้า · ใบที่ส่งแล้วไม่ขอซ้ำ`,
            on: form.intakeAutoEnabled !== false,
            onToggle: (v) => set({ intakeAutoEnabled: v }),
          })}
        </>
      )}

      {group(
        "🏠 ก่อนเข้าพัก",
        <>
          {item({
            emoji: "💰",
            title: "เตือนยอดคงเหลือ",
            services: ["stay"],
            when: `${autoDayText(form.depositReminderDays, "เข้าพัก")} · 12:00`,
            sends: "ข้อความแจ้งยอดที่ต้องโอนก่อนเข้าพัก เฉพาะนัดที่จ่ายมัดจำแล้วยังค้าง · ร้านได้แจ้งเตือนทาง Telegram ด้วย · ส่งแยกเป็นอีกข้อความ",
            on: form.depositReminderEnabled,
            onToggle: (v) => set({ depositReminderEnabled: v }),
            children: (
              <Field
                label="ส่งก่อนเข้าพัก (วัน)"
                type="number"
                value={String(form.depositReminderDays)}
                onChange={(v) => set({ depositReminderDays: Math.max(0, Number(v) || 0) })}
              />
            ),
          })}
          {item({
            emoji: "🧳",
            title: "ชุดแจ้งเตรียมตัวก่อนเข้าพัก",
            services: ["stay"],
            when: `${autoDayText(form.prestayReminderDays, "เข้าพัก")} · 12:00`,
            sends:
              "รวมในข้อความเดียว: การ์ดเตรียมตัว + เอกสารที่ยังขาด + ยอดคงเหลือ (ถ้ามี) + ปุ่มเลือกเวลามาส่งน้อง",
            on: form.prestayReminderEnabled,
            onToggle: (v) => set({ prestayReminderEnabled: v }),
            children: (
              <>
                <Field
                  label="ส่งก่อนเข้าพัก (วัน)"
                  type="number"
                  value={String(form.prestayReminderDays)}
                  onChange={(v) => set({ prestayReminderDays: Math.max(0, Number(v) || 0) })}
                />
                {usesLitter(config) && (
                  <>
                    <Field
                      label="แถมทรายฟรีเมื่อเข้าพัก (คืน) ขึ้นไป"
                      type="number"
                      value={String(form.freeLitterMinNights)}
                      onChange={(v) => set({ freeLitterMinNights: Math.max(1, Number(v) || 1) })}
                    />
                    <p className="text-[10px] text-brown-faint">
                      เข้าพักน้อยกว่านี้ การ์ดเตรียมตัวจะบอกให้เตรียมทรายมาเอง (ใส่ {"{litterNote}"} ในข้อความ)
                    </p>
                  </>
                )}
              </>
            ),
          })}
          {item({
            emoji: "🕒",
            title: "เตือนเช็คอิน (ถามเวลามาส่ง)",
            services: ["stay"],
            when: `${autoDayText(form.checkinReminderDays, "เข้าพัก")} · ${form.checkinReminderTime || "12:00"}`,
            sends:
              "การ์ดให้ลูกค้าเลือกเวลามาส่งน้อง · ถ้าเลือกเวลาไปแล้วจากชุดก่อนเข้าพัก จะไม่ส่งซ้ำ (บ้านหนึ่งได้ปุ่มเลือกเวลาใบเดียว)",
            on: form.checkinReminderEnabled,
            onToggle: (v) => set({ checkinReminderEnabled: v }),
            children: (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="ส่งก่อนเข้าพัก (วัน)"
                    type="number"
                    value={String(form.checkinReminderDays)}
                    onChange={(v) => set({ checkinReminderDays: Math.max(0, Number(v) || 0) })}
                  />
                  <TimeSlotField
                    label="ส่งช่วงไหน"
                    value={form.checkinReminderTime || "12:00"}
                    onChange={(v) => set({ checkinReminderTime: v })}
                  />
                </div>
                <p className="text-[10px] text-brown-faint">ใส่ 0 = ส่งวันเข้าพักเลย</p>
              </>
            ),
          })}
        </>
      )}

      {group(
        "👋 รับกลับ / หลังเข้าพัก",
        <>
          {item({
            emoji: "🏡",
            title: "เตือนเช็คเอาท์ (ถามเวลามารับ)",
            services: ["stay"],
            when: `${autoDayText(form.checkoutReminderDays, "รับกลับ")} · ${form.checkoutReminderTime || "19:30"}`,
            sends: "การ์ดให้ลูกค้าเลือกเวลามารับน้อง",
            on: form.checkoutReminderEnabled,
            onToggle: (v) => set({ checkoutReminderEnabled: v }),
            children: (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="ส่งก่อนเช็คเอาท์ (วัน)"
                    type="number"
                    value={String(form.checkoutReminderDays)}
                    onChange={(v) => set({ checkoutReminderDays: Math.max(0, Number(v) || 0) })}
                  />
                  <TimeSlotField
                    label="ส่งช่วงไหน"
                    value={form.checkoutReminderTime || "19:30"}
                    onChange={(v) => set({ checkoutReminderTime: v })}
                  />
                </div>
                <p className="text-[10px] text-brown-faint">ใส่ 0 = ส่งวันเช็คเอาท์เลย</p>
              </>
            ),
          })}
          {item({
            emoji: "⭐",
            title: "ขอรีวิว",
            services: ["stay"],
            when: `${form.reviewRequestDaysAfter <= 0 ? "วันรับกลับ" : `${form.reviewRequestDaysAfter} วันหลังรับกลับ`} · 12:00`,
            sends: "การ์ดขอบคุณ + ปุ่มรีวิว (แยกจากใบเสร็จ ลูกค้าที่จ่ายล่วงหน้าจะไม่ถูกขอรีวิวตอนจ่ายเงิน)",
            on: form.reviewRequestEnabled,
            onToggle: (v) => set({ reviewRequestEnabled: v }),
            children: (
              <Field
                label="ส่งหลังเช็คเอาท์ (วัน)"
                type="number"
                value={String(form.reviewRequestDaysAfter)}
                onChange={(v) => set({ reviewRequestDaysAfter: Math.max(0, Number(v) || 0) })}
              />
            ),
          })}
        </>
      )}

      {group(
        "🎂 วันเกิด",
        <>
          {item({
            emoji: "🎂",
            title: "คัดวันเกิดเข้าคิวรอตรวจ",
            services: ["groom", "stay"],
            when: "ทุกวัน · ร้านกดส่งเอง",
            sends: "ไม่ส่งเอง — ระบบคัดวันเกิดของวันนี้ไว้ให้ที่หน้าวันเกิดลูกค้า ร้านตรวจข้อความแล้วกดส่ง",
            on: form.birthdayEnabled,
            onToggle: (v) => set({ birthdayEnabled: v }),
            children: (
              <a href="/admin/birthdays" className="text-[11px] font-bold underline">
                เปิดหน้าวันเกิดลูกค้า
              </a>
            ),
          })}
          {item({
            emoji: "🎁",
            title: "แจกคูปองวันเกิดตอนกดส่ง",
            services: ["groom", "stay"],
            when: "ตอนร้านกดส่งอวยพร",
            sends: "คูปองเข้ากระเป๋าลูกค้า (ครั้งเดียวต่อปี · ใช้ได้ 30 วัน) พร้อมข้อความอวยพร",
            on: form.birthdayCouponEnabled,
            onToggle: (v) => set({ birthdayCouponEnabled: v }),
            children: (
              <Field
                label="มูลค่าคูปองวันเกิด (บาท)"
                type="number"
                value={String(form.birthdayCouponAmount)}
                onChange={(v) => set({ birthdayCouponAmount: Math.max(0, Number(v) || 0) })}
              />
            ),
          })}
        </>
      )}

      <div className="sticky bottom-3 z-10">
        <SaveBtn saving={saving} />
      </div>
    </form>
  );
}

const OPTIONS_DEFAULT = {
  servicePresets: [] as { label: string; amount: number }[],
  freebies: [] as string[],
  catBreeds: [] as string[],
  referralOptions: [] as string[],
};

function ListsTab({
  config,
  saving,
  onSave,
}: {
  config: SiteConfig;
  saving: boolean;
  onSave: (p: Partial<SiteConfig>) => void;
}) {
  const initForm = () => ({ ...OPTIONS_DEFAULT, ...config.options, catBreeds: breedOptionsFor(config) });
  const [form, setForm] = useState(initForm);
  const [petKind, setPetKind] = useState<PetKind>(petKindOf(config));
  useEffect(() => {
    setForm(initForm());
    setPetKind(petKindOf(config));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.options, config.business?.petKind]);
  const presets = form.servicePresets;
  const pickPetKind = (kind: PetKind) => {
    setPetKind(kind);
    // ยังใช้รายชื่อเริ่มต้นอยู่ → เปลี่ยนเป็นสายพันธุ์ของชนิดใหม่ให้เลย · ร้านแก้รายชื่อเองแล้วไม่แตะ
    setForm((f) =>
      f.catBreeds.join("\n") === breedOptionsFor({ business: { petKind } }).join("\n")
        ? { ...f, catBreeds: breedOptionsFor({ business: { petKind: kind } }) }
        : f
    );
  };

  const setPreset = (i: number, patch: Partial<{ label: string; amount: number }>) =>
    setForm((f) => ({
      ...f,
      servicePresets: f.servicePresets.map((p, k) => (k === i ? { ...p, ...patch } : p)),
    }));

  return (
    <form
      className="space-y-3 rounded-petflow bg-card p-4 shadow-petflow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          business: { petKind } as SiteConfig["business"],
          options: {
            ...form,
            servicePresets: form.servicePresets.filter((p) => p.label.trim()),
          },
        });
      }}
    >
      <p className="text-xs font-extrabold text-petflow-chocolate">ร้านดูแลน้องอะไร</p>
      <div className="flex gap-1 rounded-full bg-paper p-1">
        {(
          [
            ["cat", "🐱 แมว"],
            ["dog", "🐶 หมา"],
            ["both", "🐾 ทั้งหมาและแมว"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={petKind === k}
            onClick={() => pickPetKind(k)}
            className={`min-h-[40px] flex-1 rounded-full text-xs font-bold transition ${
              petKind === k ? "bg-card text-petflow-chocolate shadow-petflow-sm" : "text-brown-soft"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-brown-soft">
        ใช้เปลี่ยนคำในแอปลูกค้าและหลังบ้าน (น้องแมว / น้องหมา) และรายชื่อสายพันธุ์ด้านล่าง
        {petKind === "both" &&
          " · รับทั้งสองแบบ: ตอนสมัคร/เพิ่มน้อง จะมีปุ่มให้เลือกว่าน้องแต่ละตัวเป็นหมาหรือแมว แล้วรายชื่อสายพันธุ์จะโชว์เฉพาะของชนิดนั้น"}
      </p>

      <hr className="border-petflow-line" />
      <p className="text-xs font-extrabold text-petflow-chocolate">
        บริการเสริม (หน้าคิดเงิน) — ชื่อ + ราคา
      </p>
      <div className="space-y-2">
        {presets.map((p, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={p.label}
              onChange={(e) => setPreset(i, { label: e.target.value })}
              placeholder="ชื่อบริการ"
              className="min-w-0 flex-1 rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm"
            />
            <NumInput
              type="number"
              value={String(p.amount)}
              onChange={(e) => setPreset(i, { amount: Number(e.target.value) || 0 })}
              className="w-20 rounded-petflow-sm border border-petflow-line bg-paper px-2 py-2 text-right text-sm"
            />
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  servicePresets: f.servicePresets.filter((_, k) => k !== i),
                }))
              }
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-wait"
              aria-label="ลบ"
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setForm((f) => ({
              ...f,
              servicePresets: [...f.servicePresets, { label: "", amount: 0 }],
            }))
          }
          className="w-full rounded-petflow-sm border border-dashed border-petflow-line py-2 text-xs font-bold text-latte-deep"
        >
          + เพิ่มบริการ
        </button>
      </div>

      <hr className="border-petflow-line" />
      <TextAreaField
        label="ของแถม (ฟรี) — 1 บรรทัด = 1 อย่าง"
        value={form.freebies.join("\n")}
        onChange={(v) =>
          setForm((f) => ({ ...f, freebies: v.split("\n").map((s) => s.trim()).filter(Boolean) }))
        }
        rows={4}
      />
      <TextAreaField
        label={`สายพันธุ์${petWords({ business: { petKind } }).th} (หน้าลงทะเบียน) — 1 บรรทัด = 1 พันธุ์`}
        value={form.catBreeds.join("\n")}
        onChange={(v) =>
          setForm((f) => ({ ...f, catBreeds: v.split("\n").map((s) => s.trim()).filter(Boolean) }))
        }
        rows={8}
      />
      <button
        type="button"
        onClick={() =>
          setForm((f) => ({ ...f, catBreeds: withDefaultBreeds(f.catBreeds, petKind) }))
        }
        className="-mt-1 min-h-[40px] rounded-full bg-paper px-4 text-xs font-bold text-petflow-chocolate"
      >
        + เติมสายพันธุ์ยอดนิยมให้ครบ (ของร้านอยู่บนสุดเหมือนเดิม)
      </button>
      <TextAreaField
        label="รู้จักร้านจากไหน (referral) — 1 บรรทัด = 1 ตัวเลือก"
        value={form.referralOptions.join("\n")}
        onChange={(v) =>
          setForm((f) => ({
            ...f,
            referralOptions: v.split("\n").map((s) => s.trim()).filter(Boolean),
          }))
        }
        rows={5}
      />

      <SaveBtn saving={saving} />
    </form>
  );
}

function SaveBtn({ saving }: { saving: boolean }) {
  return (
    <button
      type="submit"
      disabled={saving}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-petflow-chocolate text-sm font-extrabold text-card shadow-petflow-sm disabled:opacity-50"
    >
      <Icon name="check" size={18} strokeWidth={2.2} />
      {saving ? "กำลังบันทึก…" : "บันทึก"}
    </button>
  );
}
