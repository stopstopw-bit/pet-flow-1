"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { BREED_OPTIONS } from "@/lib/cat-breeds";
import { promoRewardLabel } from "@/lib/promo-format";
import {
  type CustomerTier,
  type PromoKind,
  type PromoRestriction,
  type PromoRewardType,
} from "@/lib/promos-store";
import {
  TIER_LABELS,
  type CustomerTier as StoreCustomerTier,
} from "@/lib/customer-tier";
import {
  BROADCAST_ACTIONS,
  BROADCAST_TEMPLATES,
  type BroadcastActionId,
} from "@/lib/broadcast-constants";
import type { SegmentId } from "@/lib/customer-segments";
import { BROADCAST_DRAFT_KEY } from "@/components/SalesActions";
import { Icon } from "@/components/Icon";
import { EmptyState, MoreMenu, SearchField, SectionLabel, Segmented } from "@/components/ui";

/** กลุ่มลูกค้าสำเร็จรูป — ติ๊กได้หลายกลุ่ม ระบบเลือกคนที่ตรงทุกข้อ */
const SEGMENT_CHIPS: { id: SegmentId | "inactive90"; label: string }[] = [
  { id: "regular", label: "ขาประจำ" },
  { id: "longhair", label: "แมวขนยาว" },
  { id: "inactive90", label: "ไม่ได้มา 3 เดือน" },
  { id: "bath", label: "เคยอาบน้ำ" },
  { id: "stay", label: "เคยฝากพัก" },
  { id: "new", label: "ยังไม่เคยมา" },
];

type Promo = {
  id: string;
  title: { th: string; en: string };
  body: { th: string; en: string };
  discountPercent?: number;
  discountAmount?: number;
  imageUrl?: string;
  startDate: string;
  until: string;
  active: boolean;
  kind: PromoKind;
  restriction: PromoRestriction;
  validMonth?: string;
  tiers: CustomerTier[];
  couponCode?: string;
  rewardType: PromoRewardType;
  pointsBonus?: number;
  pointsMultiplier?: number;
};

type BroadcastRecipient = {
  id: string;
  name: string;
  lineDisplayName?: string;
  cats: string;
  tier?: string;
};

type BroadcastSkipped = {
  id: string;
  name: string;
  cats: string;
  reason: string;
};

type PromoClaim = {
  id: string;
  promoId: string;
  customerName: string;
  promoTitle: string;
  source: string;
  pointsAwarded?: number;
  createdAt: string;
};

const BUILTIN_TIER_OPTIONS: { value: CustomerTier; label: string }[] = [
  { value: "all", label: "ทุกคน" },
  { value: "new", label: "ลูกค้าใหม่" },
  { value: "regular", label: "ลูกค้าประจำ" },
  { value: "member", label: "Member" },
  { value: "vip", label: "VIP" },
  { value: "returning", label: "เคยมาแล้ว" },
];

function restrictionLabel(r: PromoRestriction, validMonth?: string) {
  if (r === "first_visit") return "ครั้งแรก";
  if (r === "calendar_month" && validMonth) return `เดือน ${validMonth}`;
  return "ไม่จำกัด";
}

function resetFormState() {
  return {
    imageUrl: "",
    showOnHome: false,
    restriction: "none" as PromoRestriction,
    tiers: ["all"] as CustomerTier[],
    rewardType: "discount" as PromoRewardType,
  };
}

type PromoSortKey = "title" | "start" | "end" | "claims" | "status";

export default function PromosAdminPage() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [claims, setClaims] = useState<PromoClaim[]>([]);
  const [promoQuery, setPromoQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [kindFilter, setKindFilter] = useState<"all" | PromoKind>("all");
  const [promoSortKey, setPromoSortKey] = useState<PromoSortKey>("start");
  const [promoSortDir, setPromoSortDir] = useState<"asc" | "desc">("desc");
  const [view, setView] = useState<"list" | "broadcast">("list");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Promo | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [showOnHome, setShowOnHome] = useState(false);
  const [restriction, setRestriction] = useState<PromoRestriction>("none");
  const [tiers, setTiers] = useState<CustomerTier[]>(["all"]);
  const [rewardType, setRewardType] = useState<PromoRewardType>("discount");
  const [broadcastTier, setBroadcastTier] = useState<StoreCustomerTier | "all">("all");
  const [broadcastBreed, setBroadcastBreed] = useState("");
  const [broadcastInactive, setBroadcastInactive] = useState(0);
  const [broadcastSegments, setBroadcastSegments] = useState<SegmentId[]>([]);
  // กลุ่มเจาะจงรายคนที่ส่งมาจากหน้าสรุปข้อมูล (ปุ่ม "ส่งโปรกลุ่มนี้")
  const [targetGroup, setTargetGroup] = useState<{ label: string; customerIds: string[] } | null>(null);
  const [regularMinVisits, setRegularMinVisits] = useState(3);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastImage, setBroadcastImage] = useState("");
  const [broadcastActions, setBroadcastActions] = useState<BroadcastActionId[]>([
    "line_chat",
  ]);
  const [broadcastCount, setBroadcastCount] = useState<number | null>(null);
  const [broadcastRecipients, setBroadcastRecipients] = useState<BroadcastRecipient[]>([]);
  const [broadcastSkipped, setBroadcastSkipped] = useState<BroadcastSkipped[]>([]);
  const [broadcastSkippedTotal, setBroadcastSkippedTotal] = useState(0);
  const [broadcastNoConsent, setBroadcastNoConsent] = useState(0);
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const adminCode =
    typeof window !== "undefined"
      ? sessionStorage.getItem("petflow-admin") || ""
      : "";

  const load = useCallback(async () => {
    const [promoRes, claimRes] = await Promise.all([
      fetch("/api/promos"),
      fetch("/api/promos?claims=1"),
    ]);
    const promoData = await promoRes.json();
    const claimData = await claimRes.json();
    setPromos(promoData.promos || []);
    setClaims(claimData.claims || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("from")) return;
    try {
      const raw = sessionStorage.getItem(BROADCAST_DRAFT_KEY);
      if (!raw) return;
      sessionStorage.removeItem(BROADCAST_DRAFT_KEY);
      const d = JSON.parse(raw);
      if (!Array.isArray(d.customerIds) || d.customerIds.length === 0) return;
      setTargetGroup({ label: String(d.label || "กลุ่มที่เลือก"), customerIds: d.customerIds.map(String) });
      if (d.title) setBroadcastTitle(String(d.title));
      if (d.body) setBroadcastBody(String(d.body));
      setView("broadcast");
    } catch {
      /* ไม่มีร่าง — เปิดหน้าโปรตามปกติ */
    }
  }, []);

  useEffect(() => {
    setBroadcastLoading(true);
    const q = new URLSearchParams({ tier: broadcastTier });
    if (targetGroup) q.set("customerIds", targetGroup.customerIds.join(","));
    if (broadcastBreed) q.set("breed", broadcastBreed);
    if (broadcastInactive > 0) q.set("inactiveDays", String(broadcastInactive));
    if (broadcastSegments.length) q.set("segments", broadcastSegments.join(","));
    if (broadcastSegments.includes("regular")) q.set("regularMinVisits", String(regularMinVisits));
    fetch(`/api/line/broadcast?${q}`)
      .then((r) => r.json())
      .then((d) => {
        setBroadcastCount(d.withLine ?? d.count ?? 0);
        setBroadcastRecipients(d.recipients || []);
        setBroadcastSkipped(d.skipped || []);
        setBroadcastSkippedTotal(d.skippedNoLine ?? 0);
        setBroadcastNoConsent(d.skippedNoConsent ?? 0);
      })
      .finally(() => setBroadcastLoading(false));
  }, [broadcastTier, broadcastBreed, broadcastInactive, broadcastSegments, regularMinVisits, targetGroup]);

  const sendBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastBody.trim()) {
      setBroadcastMsg("กรอกหัวข้อและข้อความ");
      return;
    }
    if (!broadcastCount) {
      setBroadcastMsg("ไม่มีลูกค้าที่จะส่ง — เลือกกลุ่มอื่นหรือให้ลูกค้าผูก LINE ก่อน");
      return;
    }
    const names = broadcastRecipients
      .slice(0, 5)
      .map((r) => r.name)
      .join(", ");
    const more =
      broadcastRecipients.length > 5
        ? ` และอีก ${broadcastRecipients.length - 5} คน`
        : "";
    const actionLabels = broadcastActions
      .map((id) => BROADCAST_ACTIONS.find((a) => a.id === id)?.label || id)
      .join(", ");
    if (
      !confirm(
        `ส่งโปรให้ ${broadcastCount} คน?\n\n${names}${more}${
          actionLabels ? `\n\nปุ่ม: ${actionLabels}` : ""
        }`
      )
    ) {
      return;
    }
    setBroadcasting(true);
    setBroadcastMsg("");
    const res = await fetch("/api/line/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminCode,
        tier: broadcastTier,
        breed: broadcastBreed || undefined,
        inactiveDays: broadcastInactive || undefined,
        segments: broadcastSegments,
        regularMinVisits,
        customerIds: targetGroup?.customerIds,
        title: broadcastTitle,
        body: broadcastBody,
        imageData: broadcastImage.startsWith("data:") ? broadcastImage : undefined,
        actions: broadcastActions,
      }),
    });
    const data = await res.json();
    setBroadcasting(false);
    if (res.ok) {
      setBroadcastMsg(`ส่งแล้ว ${data.sent} คน (${data.tier})`);
    } else {
      setBroadcastMsg(data.error || "ส่งไม่สำเร็จ");
    }
  };

  const applyBroadcastTemplate = (idx: number) => {
    const tpl = BROADCAST_TEMPLATES[idx];
    if (!tpl) return;
    setBroadcastTitle(tpl.title);
    setBroadcastBody(tpl.body);
    setBroadcastActions(tpl.suggestedActions);
  };

  const onBroadcastImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setBroadcastImage(String(reader.result));
    reader.readAsDataURL(file);
  };

  const toggleBroadcastAction = (id: BroadcastActionId) => {
    setBroadcastActions((prev) => {
      if (prev.includes(id)) return prev.filter((a) => a !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const hasBroadcastImage =
    broadcastImage.startsWith("data:") || broadcastImage.startsWith("http");

  const closeModal = () => {
    setOpen(false);
    setEditing(null);
    const s = resetFormState();
    setImageUrl(s.imageUrl);
    setShowOnHome(s.showOnHome);
    setRestriction(s.restriction);
    setTiers(s.tiers);
    setRewardType(s.rewardType);
  };

  const openNew = () => {
    setEditing(null);
    const s = resetFormState();
    setImageUrl(s.imageUrl);
    setShowOnHome(s.showOnHome);
    setRestriction(s.restriction);
    setTiers(s.tiers);
    setRewardType(s.rewardType);
    setOpen(true);
  };

  const openEdit = (p: Promo) => {
    setEditing(p);
    setImageUrl(p.imageUrl || "");
    setShowOnHome(p.kind === "customer");
    setRestriction(p.restriction);
    setTiers(p.tiers?.length ? p.tiers : ["all"]);
    setRewardType(p.rewardType);
    setOpen(true);
  };

  const onImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setImageUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const toggleTier = (tier: CustomerTier) => {
    if (tier === "all") {
      setTiers(["all"]);
      return;
    }
    setTiers((prev) => {
      const next = prev.filter((t) => t !== "all");
      return next.includes(tier) ? next.filter((t) => t !== tier) : [...next, tier];
    });
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const kind: PromoKind = showOnHome ? "customer" : "display";
    const data = {
      title: { th: String(fd.get("titleTh")), en: String(fd.get("titleEn") || fd.get("titleTh")) },
      body: { th: String(fd.get("bodyTh")), en: String(fd.get("bodyEn") || fd.get("bodyTh")) },
      discountPercent: Number(fd.get("discountPercent")) || undefined,
      discountAmount: Number(fd.get("discountAmount")) || undefined,
      imageUrl: imageUrl || undefined,
      startDate: String(fd.get("startDate")),
      until: String(fd.get("until")),
      kind,
      restriction,
      validMonth: restriction === "calendar_month" ? String(fd.get("validMonth") || "") : undefined,
      tiers: tiers.length ? tiers : ["all"],
      couponCode: String(fd.get("couponCode") || "") || undefined,
      rewardType,
      pointsBonus: Number(fd.get("pointsBonus")) || undefined,
      pointsMultiplier: Number(fd.get("pointsMultiplier")) || undefined,
    };
    if (editing) {
      await fetch("/api/promos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, patch: data }),
      });
    } else {
      await fetch("/api/promos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, active: true }),
      });
    }
    closeModal();
    load();
  };

  const toggle = async (id: string, active: boolean) => {
    await fetch("/api/promos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, patch: { active: !active } }),
    });
    load();
  };

  const remove = async (p: Promo) => {
    if (!confirm(`ลบโปร "${p.title.th}"?\nลบแล้วกู้คืนไม่ได้`)) return;
    await fetch("/api/promos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id }),
    });
    load();
  };

  const toggleHome = async (p: Promo) => {
    const nextKind: PromoKind = p.kind === "customer" ? "display" : "customer";
    await fetch("/api/promos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, patch: { kind: nextKind } }),
    });
    load();
  };

  const hasImage = imageUrl.startsWith("data:") || imageUrl.startsWith("http") || imageUrl.startsWith("/");
  const claimsFor = (promoId: string) => claims.filter((c) => c.promoId === promoId);
  const showDiscount = rewardType === "discount" || rewardType === "both";
  const showPoints = rewardType === "points" || rewardType === "both";

  const togglePromoSort = (key: PromoSortKey) => {
    if (promoSortKey === key) {
      setPromoSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setPromoSortKey(key);
      setPromoSortDir("asc");
    }
  };

  const resetPromoFilters = () => {
    setPromoQuery("");
    setStatusFilter("all");
    setKindFilter("all");
    setPromoSortKey("start");
    setPromoSortDir("desc");
  };

  const q = promoQuery.trim().toLowerCase();
  const visiblePromos = promos
    .filter((p) => !q || p.title.th.toLowerCase().includes(q) || p.body.th.toLowerCase().includes(q))
    .filter((p) => statusFilter === "all" || (statusFilter === "active") === p.active)
    .filter((p) => kindFilter === "all" || p.kind === kindFilter)
    .slice()
    .sort((a, b) => {
      let cmp = 0;
      if (promoSortKey === "title") cmp = a.title.th.localeCompare(b.title.th, "th");
      else if (promoSortKey === "start") cmp = a.startDate.localeCompare(b.startDate);
      else if (promoSortKey === "end")
        cmp = (a.until || "9999-12-31").localeCompare(b.until || "9999-12-31");
      else if (promoSortKey === "claims") cmp = claimsFor(a.id).length - claimsFor(b.id).length;
      else if (promoSortKey === "status") cmp = Number(a.active) - Number(b.active);
      return promoSortDir === "asc" ? cmp : -cmp;
    });

  const filtersOn = Boolean(promoQuery || statusFilter !== "all" || kindFilter !== "all");

  return (
    <div className="pb-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Promotions</p>
          <h1 className="text-xl font-extrabold text-petflow-chocolate">โปรโมชั่น</h1>
          <p className="mt-0.5 text-xs text-brown-soft">ขึ้นหน้าแรกได้ · ส่วนลดหรือแต้ม · ส่งทาง LINE</p>
        </div>
        {view === "list" && (
          <button
            type="button"
            onClick={openNew}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-petflow-chocolate px-4 text-sm font-bold text-card shadow-petflow-sm"
          >
            <Icon name="plus" size={18} />
            เพิ่มโปร
          </button>
        )}
      </div>

      <Segmented
        value={view}
        onChange={setView}
        className="mb-4"
        options={[
          { id: "list", label: "รายการโปร", icon: "sparkle", badge: promos.length || undefined },
          { id: "broadcast", label: "ส่งทาง LINE", icon: "send" },
        ]}
      />

      {view === "broadcast" && (
        <div className="space-y-4">
          {/* ── กลุ่มผู้รับ ── */}
          <section>
            <SectionLabel>Audience · กลุ่มผู้รับ</SectionLabel>
            <div className="space-y-3 rounded-petflow bg-card p-4 shadow-petflow-sm">
              {targetGroup && (
                <div className="flex items-center justify-between gap-2 rounded-petflow-sm bg-sage/20 px-3 py-2 text-xs">
                  <span className="min-w-0 font-bold text-brown">
                    จากสรุปข้อมูล: {targetGroup.label} · {targetGroup.customerIds.length} คน
                  </span>
                  <button
                    type="button"
                    onClick={() => setTargetGroup(null)}
                    className="shrink-0 font-bold text-latte-deep underline"
                  >
                    ล้าง
                  </button>
                </div>
              )}
              {/* กลุ่มสำเร็จรูป — ติ๊กหลายอันได้ = ต้องตรงทุกข้อ */}
              <div className="flex flex-wrap gap-2">
                {SEGMENT_CHIPS.map((chip) => {
                  const active =
                    chip.id === "inactive90"
                      ? broadcastInactive === 90
                      : broadcastSegments.includes(chip.id);
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        if (chip.id === "inactive90") {
                          setBroadcastInactive(active ? 0 : 90);
                          return;
                        }
                        const id = chip.id;
                        setBroadcastSegments((prev) => {
                          if (prev.includes(id)) return prev.filter((x) => x !== id);
                          // "ยังไม่เคยมา" ขัดกับกลุ่มที่ต้องเคยมา — เลือกแล้วล้างอีกฝั่งให้
                          const clash: SegmentId[] =
                            id === "new" ? ["regular", "bath", "stay"] : ["regular", "bath", "stay"].includes(id) ? ["new"] : [];
                          return [...prev.filter((x) => !clash.includes(x)), id];
                        });
                        if (chip.id === "new") setBroadcastInactive(0);
                      }}
                      className={`flex min-h-[40px] items-center gap-1 rounded-full px-3.5 text-xs font-bold ${
                        active ? "bg-petflow-chocolate text-card" : "bg-paper text-brown-soft ring-1 ring-petflow-line"
                      }`}
                    >
                      {active && <Icon name="check" size={14} strokeWidth={2.4} />}
                      {chip.label}
                    </button>
                  );
                })}
              </div>
              {broadcastSegments.includes("regular") && (
                <label className="flex items-center gap-2 text-xs text-brown-soft">
                  ขาประจำ = มาแล้วตั้งแต่
                  <input
                    type="number"
                    min={1}
                    value={regularMinVisits}
                    onChange={(e) => setRegularMinVisits(Math.max(1, Number(e.target.value) || 1))}
                    className="h-9 w-16 rounded-petflow-sm border border-petflow-line bg-paper px-2 text-center text-sm text-brown"
                  />
                  ครั้ง
                </label>
              )}

              {/* ตัวกรองละเอียด — พับไว้ไม่ให้รก */}
              <details className="group rounded-petflow-sm border border-petflow-line bg-paper/50 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3 text-xs font-bold text-brown-soft">
                  <Icon name="filter" size={15} />
                  กรองเพิ่ม (ระดับ · พันธุ์ · จำนวนวันที่หายไป)
                  <Icon name="chevron" size={14} className="ml-auto text-brown-faint transition group-open:rotate-90" />
                </summary>
                <div className="space-y-2 border-t border-petflow-line p-3">
                  <select
                    value={broadcastTier}
                    onChange={(e) => setBroadcastTier(e.target.value as StoreCustomerTier | "all")}
                    className={FIELD}
                  >
                    <option value="all">ทุกระดับ</option>
                    {(Object.keys(TIER_LABELS) as StoreCustomerTier[]).map((t) => (
                      <option key={t} value={t}>
                        {TIER_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={broadcastBreed}
                      onChange={(e) => setBroadcastBreed(e.target.value)}
                      className={`${FIELD} min-w-0`}
                    >
                      <option value="">ทุกพันธุ์</option>
                      {BREED_OPTIONS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                    <label className="flex min-w-0 items-center gap-1.5 rounded-petflow-sm border border-petflow-line bg-card px-3">
                      <Icon name="clock" size={16} className="text-brown-soft" />
                      <span className="shrink-0 text-xs text-brown-soft">หายไป &gt;</span>
                      <input
                        type="number"
                        min={0}
                        value={broadcastInactive || ""}
                        onChange={(e) => setBroadcastInactive(Math.max(0, Number(e.target.value) || 0))}
                        placeholder="0"
                        className="h-10 w-full min-w-0 !border-0 !bg-transparent px-0 text-sm !shadow-none !outline-none"
                      />
                      <span className="shrink-0 text-xs text-brown-soft">วัน</span>
                    </label>
                  </div>
                </div>
              </details>

              {(broadcastBreed || broadcastInactive > 0 || broadcastSegments.length > 0 || broadcastTier !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setBroadcastBreed("");
                    setBroadcastInactive(0);
                    setBroadcastSegments([]);
                    setBroadcastTier("all");
                  }}
                  className="flex h-9 items-center gap-1 px-1 text-xs font-bold text-wait"
                >
                  <Icon name="x" size={14} />
                  ล้างตัวกรอง
                </button>
              )}
            </div>
          </section>

          {/* ── รายชื่อผู้รับ ── */}
          <details className="group overflow-hidden rounded-petflow bg-card shadow-petflow-sm [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex min-h-[48px] cursor-pointer list-none items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sage/25 text-petflow-chocolate">
                <Icon name="users" size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-petflow-chocolate">
                  จะส่งหา {broadcastLoading ? "…" : (broadcastCount ?? 0)} คน
                </span>
                <span className="block truncate text-[11px] text-brown-soft">
                  {broadcastSkippedTotal > 0 ? `ข้าม ${broadcastSkippedTotal} คน (ยังไม่ผูก LINE)` : "แตะเพื่อดูรายชื่อ"}
                  {broadcastNoConsent > 0 ? ` · ไม่ยินยอม ${broadcastNoConsent} คน` : ""}
                </span>
              </span>
              <Icon name="chevron" size={16} className="text-brown-faint transition group-open:rotate-90" />
            </summary>
            <div className="border-t border-petflow-line">
              {broadcastNoConsent > 0 && (
                <p className="flex items-center gap-1.5 bg-honey/15 px-4 py-2 text-[11px] font-bold text-wait">
                  <Icon name="alert" size={14} />
                  ไม่ส่งหา {broadcastNoConsent} คน (ไม่ยินยอมรับข่าวสาร)
                </p>
              )}
              {broadcastLoading ? (
                <p className="px-4 py-4 text-xs text-brown-soft">กำลังโหลดรายชื่อ…</p>
              ) : broadcastRecipients.length === 0 ? (
                <EmptyState icon="users" title="ไม่มีลูกค้าในกลุ่มนี้ที่ผูก LINE แล้ว" />
              ) : (
                <ul className="max-h-60 divide-y divide-petflow-line overflow-y-auto">
                  {broadcastRecipients.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 px-4 py-2.5 text-xs">
                      <Icon name={r.cats !== "—" ? "paw" : "user"} size={14} className="text-brown-soft" />
                      <span className="min-w-0 flex-1 truncate font-bold text-brown">
                        {r.cats !== "—" ? `${r.cats} · ` : ""}
                        {r.name}
                        {r.lineDisplayName && r.lineDisplayName !== r.name && (
                          <span className="font-normal text-brown-soft"> ({r.lineDisplayName})</span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-ok">
                        <Icon name="check" size={12} strokeWidth={2.4} />
                        LINE
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {broadcastSkippedTotal > 0 && (
                <div className="border-t border-petflow-line bg-paper/50 px-4 py-2.5">
                  <p className="mb-1 text-[11px] font-bold text-brown-faint">
                    ข้าม {broadcastSkippedTotal} คน (ยังไม่ผูก LINE)
                  </p>
                  <ul className="max-h-24 space-y-0.5 overflow-y-auto text-[11px] text-brown-faint">
                    {broadcastSkipped.map((r) => (
                      <li key={r.id}>
                        {r.cats !== "—" ? r.cats : r.name} · {r.name}
                      </li>
                    ))}
                    {broadcastSkippedTotal > broadcastSkipped.length && (
                      <li>…และอีก {broadcastSkippedTotal - broadcastSkipped.length} คน</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </details>

          {/* ── ข้อความ ── */}
          <section>
            <SectionLabel>Message · ข้อความ</SectionLabel>
            <div className="space-y-3 rounded-petflow bg-card p-4 shadow-petflow-sm">
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value !== "") applyBroadcastTemplate(Number(e.target.value));
                }}
                className={FIELD}
                aria-label="ใช้ตัวอย่างข้อความ"
              >
                <option value="">ใช้ตัวอย่างข้อความ…</option>
                {BROADCAST_TEMPLATES.map((tpl, i) => (
                  <option key={tpl.label} value={i}>
                    {tpl.label}
                  </option>
                ))}
              </select>
              <input
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                placeholder="หัวข้อการ์ด"
                className={FIELD}
              />
              <textarea
                value={broadcastBody}
                onChange={(e) => setBroadcastBody(e.target.value)}
                placeholder="ข้อความโปรโมชั่น"
                rows={3}
                className={FIELD}
              />

              <div className="flex items-center gap-3">
                {broadcastImage.startsWith("data:") ? (
                  <Image
                    src={broadcastImage}
                    alt="preview"
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded-petflow-sm object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-petflow-sm bg-paper text-brown-soft">
                    <Icon name="image" size={20} />
                  </span>
                )}
                <label className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-petflow-line text-xs font-bold text-brown">
                  <Icon name="image" size={16} />
                  {hasBroadcastImage ? "เปลี่ยนรูป" : "ใส่รูปโปร (ไม่บังคับ)"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && onBroadcastImage(e.target.files[0])}
                  />
                </label>
                {hasBroadcastImage && (
                  <button
                    type="button"
                    onClick={() => setBroadcastImage("")}
                    aria-label="ลบรูป"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-wait"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* ── ปุ่มในการ์ด ── */}
          <section>
            <SectionLabel>Buttons · ปุ่มในการ์ด (สูงสุด 3)</SectionLabel>
            <div className="rounded-petflow bg-card p-4 shadow-petflow-sm">
              <p className="mb-3 text-[11px] text-brown-soft">ลูกค้ากดแล้วเปิดแอป / แชท LINE / แผนที่ได้ทันที</p>
              <div className="flex flex-wrap gap-2">
                {BROADCAST_ACTIONS.map((action) => {
                  const selected = broadcastActions.includes(action.id);
                  const disabled = !selected && broadcastActions.length >= 3;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleBroadcastAction(action.id)}
                      title={action.description}
                      className={`flex h-9 items-center gap-1 rounded-full px-3.5 text-xs font-bold ${
                        selected
                          ? "bg-petflow-chocolate text-card"
                          : disabled
                            ? "bg-paper text-brown-faint opacity-50"
                            : "bg-paper text-brown"
                      }`}
                    >
                      {selected && <Icon name="check" size={14} strokeWidth={2.4} />}
                      {action.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ── ตัวอย่างใน LINE ── */}
          <details className="group overflow-hidden rounded-petflow bg-card shadow-petflow-sm [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex min-h-[48px] cursor-pointer list-none items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-honey/30 text-petflow-chocolate">
                <Icon name="eye" size={18} />
              </span>
              <span className="flex-1 text-sm font-extrabold text-petflow-chocolate">ตัวอย่างที่ลูกค้าจะเห็น</span>
              <Icon name="chevron" size={16} className="text-brown-faint transition group-open:rotate-90" />
            </summary>
            <div className="border-t border-petflow-line bg-paper/50 p-4">
              <div className="mx-auto max-w-[260px] overflow-hidden rounded-2xl border border-petflow-line bg-white">
                {broadcastImage.startsWith("data:") || broadcastImage.startsWith("http") ? (
                  <Image
                    src={broadcastImage}
                    alt="preview"
                    width={260}
                    height={169}
                    className="h-[169px] w-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="px-4 py-5" style={{ backgroundColor: "#5A8F5A" }}>
                    <span className="text-sm font-bold text-white">✨ โปรโมชั่น PetFlow</span>
                  </div>
                )}
                <div className="px-4 py-3">
                  <p className="text-base font-bold" style={{ color: "#5C4033" }}>
                    {broadcastTitle || "หัวข้อการ์ด…"}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed" style={{ color: "#4E3E32" }}>
                    {broadcastBody || "ข้อความโปรโมชั่น…"}
                  </p>
                </div>
                <div className="flex flex-col gap-2 px-4 pb-4">
                  {(broadcastActions.length
                    ? broadcastActions.map((id) => BROADCAST_ACTIONS.find((a) => a.id === id)?.label || id)
                    : ["ดูรายละเอียด"]
                  ).map((label, i) => (
                    <div
                      key={`${label}-${i}`}
                      className="rounded-lg py-2.5 text-center text-[13px] font-bold"
                      style={
                        i === 0
                          ? { backgroundColor: "#4A7348", color: "#fff" }
                          : { border: "1px solid #4A7348", color: "#4A7348" }
                      }
                    >
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </details>

          <button
            type="button"
            disabled={broadcasting}
            onClick={sendBroadcast}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-petflow-chocolate text-sm font-extrabold text-card shadow-petflow-sm disabled:opacity-60"
          >
            <Icon name="send" size={18} />
            {broadcasting ? "กำลังส่ง…" : `ส่งให้ลูกค้า (${broadcastCount ?? "…"} คน)`}
          </button>
          {broadcastMsg && <p className="text-center text-xs font-bold text-brown">{broadcastMsg}</p>}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-petflow bg-card shadow-petflow sm:rounded-petflow">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-petflow-line bg-card px-5 py-3">
              <h2 className="text-base font-extrabold text-petflow-chocolate">
                {editing ? "แก้ไขโปร" : "เพิ่มโปรใหม่"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                aria-label="ปิด"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-brown"
              >
                <Icon name="x" size={18} />
              </button>
            </div>
            <form key={editing?.id || "new"} onSubmit={submit} className="space-y-4 p-5">
              <label className="flex items-start gap-3 rounded-petflow-sm bg-honey/15 px-3.5 py-3 text-sm font-bold text-petflow-chocolate">
                <input
                  type="checkbox"
                  checked={showOnHome}
                  onChange={(e) => setShowOnHome(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  ขึ้นหน้าแรกแอปลูกค้า
                  <span className="mt-0.5 block text-[11px] font-normal text-brown-soft">
                    ติ๊ก = โชว์หน้าแรก + ลูกค้ากดใช้ได้ · ไม่ติ๊ก = แสดงแค่หน้าโปร
                  </span>
                </span>
              </label>

              <div>
                <p className="mb-1.5 text-[11px] font-bold text-brown-soft">ประเภทรางวัล</p>
                <Segmented
                  value={rewardType}
                  onChange={setRewardType}
                  options={[
                    { id: "discount", label: "ส่วนลด" },
                    { id: "points", label: "แต้ม" },
                    { id: "both", label: "ทั้งคู่" },
                  ]}
                />
              </div>

              <input name="titleTh" required defaultValue={editing?.title.th} placeholder="หัวข้อ (ไทย)" className={FIELD} />
              <textarea name="bodyTh" required defaultValue={editing?.body.th} placeholder="รายละเอียด" rows={2} className={FIELD} />

              {showDiscount && (
                <div className="grid grid-cols-2 gap-2">
                  <input name="discountPercent" type="number" defaultValue={editing?.discountPercent ?? ""} placeholder="ส่วนลด %" className={`${FIELD} min-w-0`} />
                  <input name="discountAmount" type="number" defaultValue={editing?.discountAmount ?? ""} placeholder="ส่วนลด บาท" className={`${FIELD} min-w-0`} />
                </div>
              )}

              {showPoints && (
                <div className="grid grid-cols-2 gap-2">
                  <input name="pointsBonus" type="number" defaultValue={editing?.pointsBonus ?? ""} placeholder="แต้มโบนัส" className={`${FIELD} min-w-0`} />
                  <input name="pointsMultiplier" type="number" step="0.1" defaultValue={editing?.pointsMultiplier ?? ""} placeholder="ตัวคูณแต้ม เช่น 2" className={`${FIELD} min-w-0`} />
                </div>
              )}

              <input name="couponCode" defaultValue={editing?.couponCode ?? ""} placeholder="รหัสโปร (ถ้ามี)" className={FIELD} />

              <div>
                <p className="mb-1.5 text-[11px] font-bold text-brown-soft">กลุ่มลูกค้า</p>
                <div className="flex flex-wrap gap-2">
                  {BUILTIN_TIER_OPTIONS.map((opt) => {
                    const on = tiers.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleTier(opt.value)}
                        className={`flex h-9 items-center gap-1 rounded-full px-3.5 text-xs font-bold ${
                          on ? "bg-petflow-chocolate text-card" : "bg-paper text-brown-soft"
                        }`}
                      >
                        {on && <Icon name="check" size={14} strokeWidth={2.4} />}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[10px] text-brown-faint">
                  Member = เติมเครดิตแล้ว · ใหม่ = ยังไม่เคยมา · เก่า = เคยมาแล้ว
                </p>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-bold text-brown-soft">เงื่อนไขการใช้</p>
                <Segmented
                  value={restriction}
                  onChange={setRestriction}
                  options={[
                    { id: "none", label: "ไม่จำกัด" },
                    { id: "first_visit", label: "ครั้งแรก" },
                    { id: "calendar_month", label: "เฉพาะเดือน" },
                  ]}
                />
              </div>
              {restriction === "calendar_month" && (
                <input name="validMonth" type="month" required defaultValue={editing?.validMonth ?? ""} className={FIELD} />
              )}

              <div className="grid grid-cols-2 gap-2">
                <label className="block min-w-0 text-[11px] font-bold text-brown-soft">
                  เริ่มใช้ได้
                  <input name="startDate" type="date" required defaultValue={editing?.startDate ?? ""} className={`${FIELD} mt-1`} />
                </label>
                <label className="block min-w-0 text-[11px] font-bold text-brown-soft">
                  วันสิ้นสุด
                  <input name="until" type="date" defaultValue={editing?.until ?? ""} className={`${FIELD} mt-1`} />
                </label>
              </div>
              <p className="-mt-2 text-[10px] text-brown-faint">เว้นวันสิ้นสุดว่าง = ไม่หมดอายุ</p>

              <div className="flex items-center gap-3">
                {hasImage ? (
                  <Image src={imageUrl} alt="" width={64} height={48} className="h-12 w-16 rounded-petflow-sm object-cover" unoptimized />
                ) : (
                  <span className="flex h-12 w-16 items-center justify-center rounded-petflow-sm bg-paper text-brown-soft">
                    <Icon name="image" size={20} />
                  </span>
                )}
                <label className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-petflow-line text-xs font-bold text-brown">
                  <Icon name="image" size={16} />
                  {hasImage ? "เปลี่ยนรูปโปร" : "ใส่รูปโปร (ถ้ามี)"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onImage(e.target.files[0])} />
                </label>
              </div>

              <div className="sticky bottom-0 -mx-5 -mb-5 flex gap-2 border-t border-petflow-line bg-card px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button type="button" onClick={closeModal} className="h-11 flex-1 rounded-full bg-paper text-sm font-bold text-brown-soft">
                  ยกเลิก
                </button>
                <button type="submit" className="h-11 flex-[2] rounded-full bg-petflow-chocolate text-sm font-extrabold text-card">
                  {editing ? "บันทึกการแก้ไข" : "บันทึกโปร"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {view === "list" && (
        <>
          <SearchField value={promoQuery} onChange={setPromoQuery} placeholder="ค้นหาชื่อ/รายละเอียด" className="mb-2" />
          <div className="mb-3 grid grid-cols-3 gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
              className={CHIP_SELECT}
              aria-label="สถานะ"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="active">ใช้งาน</option>
              <option value="inactive">ปิด</option>
            </select>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as "all" | PromoKind)}
              className={CHIP_SELECT}
              aria-label="ที่แสดงผล"
            >
              <option value="all">ทุกที่แสดง</option>
              <option value="customer">หน้าแรก</option>
              <option value="display">หน้าโปรเท่านั้น</option>
            </select>
            <div className="flex min-w-0 gap-1">
              <select
                value={promoSortKey}
                onChange={(e) => setPromoSortKey(e.target.value as PromoSortKey)}
                className={`${CHIP_SELECT} flex-1`}
                aria-label="เรียงตาม"
              >
                <option value="start">วันเริ่ม</option>
                <option value="end">วันจบ</option>
                <option value="title">ชื่อ</option>
                <option value="claims">ใช้แล้ว</option>
                <option value="status">สถานะ</option>
              </select>
              <button
                type="button"
                onClick={() => togglePromoSort(promoSortKey)}
                aria-label={promoSortDir === "asc" ? "เรียงน้อยไปมาก" : "เรียงมากไปน้อย"}
                className="flex h-10 w-9 shrink-0 items-center justify-center rounded-full bg-paper text-brown"
              >
                <span className="text-xs font-bold">{promoSortDir === "asc" ? "↑" : "↓"}</span>
              </button>
            </div>
          </div>

          <SectionLabel
            action={
              filtersOn ? (
                <button
                  type="button"
                  onClick={resetPromoFilters}
                  className="flex h-8 items-center gap-1 px-1 text-[11px] font-bold text-brown-soft"
                >
                  <Icon name="x" size={12} />
                  ล้างตัวกรอง
                </button>
              ) : undefined
            }
          >
            {visiblePromos.length}
            {visiblePromos.length !== promos.length ? ` / ${promos.length}` : ""} โปร
          </SectionLabel>

          {visiblePromos.length === 0 ? (
            <div className="rounded-petflow bg-card shadow-petflow-sm">
              <EmptyState
                icon="sparkle"
                title={promos.length === 0 ? "ยังไม่มีโปรโมชั่น" : "ไม่พบโปรโมชั่น"}
                sub={promos.length === 0 ? "กด “เพิ่มโปร” เพื่อสร้างโปรแรก" : "ลองเปลี่ยนคำค้นหรือตัวกรอง"}
              />
            </div>
          ) : (
            <ul className="divide-y divide-petflow-line rounded-petflow bg-card shadow-petflow-sm">
              {visiblePromos.map((p) => {
                const reward = promoRewardLabel(p);
                const used = claimsFor(p.id);
                return (
                  <li key={p.id} className="flex items-start gap-3 px-4 py-3">
                    <button type="button" onClick={() => openEdit(p)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                      {p.imageUrl ? (
                        <Image src={p.imageUrl} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-xl object-cover" unoptimized />
                      ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
                          <Icon name={p.kind === "customer" ? "home" : "sparkle"} size={20} />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-extrabold text-petflow-chocolate">{p.title.th}</span>
                          {p.kind === "customer" && (
                            <span className="shrink-0 rounded-full bg-honey/35 px-1.5 text-[10px] font-bold leading-4 text-petflow-chocolate">
                              หน้าแรก
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[11px] text-brown-soft">
                          {reward ? `${reward} · ` : ""}
                          {restrictionLabel(p.restriction, p.validMonth)} · {p.tiers.join(", ")}
                        </span>
                        <span className="block truncate text-[11px] text-brown-faint">
                          {p.startDate} → {p.until || "ไม่หมดอายุ"}
                          {used.length > 0 ? ` · ใช้แล้ว ${used.length} ครั้ง` : ""}
                        </span>
                        {used.length > 0 && (
                          <span className="mt-1 block text-[10px] text-brown-faint">
                            {used.slice(0, 3).map((c) => (
                              <span key={c.id} className="block truncate">
                                {c.createdAt.slice(0, 10)} · {c.customerName}
                                {c.pointsAwarded ? ` · +${c.pointsAwarded} แต้ม` : ""}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggle(p.id, p.active)}
                        aria-label={p.active ? "ปิดโปร" : "เปิดโปร"}
                        className={`h-9 rounded-full px-3 text-[11px] font-bold ${
                          p.active ? "bg-sage/25 text-ok" : "bg-paper text-brown-faint"
                        }`}
                      >
                        {p.active ? "เปิด" : "ปิด"}
                      </button>
                      <MoreMenu
                        items={[
                          { label: "แก้ไข", icon: "edit", onClick: () => openEdit(p) },
                          {
                            label: p.kind === "customer" ? "เอาออกจากหน้าแรก" : "ขึ้นหน้าแรก",
                            icon: "home",
                            onClick: () => toggleHome(p),
                          },
                          { label: "ลบโปร", icon: "trash", danger: true, onClick: () => remove(p) },
                        ]}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

const FIELD =
  "w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm text-brown";
const CHIP_SELECT =
  "h-10 w-full min-w-0 rounded-full border border-petflow-line bg-card px-3 text-xs font-bold text-brown";
