"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PosPanel } from "@/components/PosPanel";
import { useConfig } from "@/components/ConfigProvider";
import { isFeatureOn } from "@/lib/features";
import type { PosProduct } from "@/lib/pos-store";
import { SERVICE_PRESETS, type ServicePreset } from "@/lib/service-presets";
import { CustomerSendButtons } from "@/components/CustomerSendButtons";
import { savedPopup, toast } from "@/components/Toast";
import { Icon, type IconName } from "@/components/Icon";
import { Avatar, EmptyState, MoreMenu, SearchField, Segmented, SectionLabel } from "@/components/ui";
import { groupCatNames, groupForBilling } from "@/lib/booking-group";
import { formatThaiDateShort } from "@/lib/format-thai-date";
import { bangkokToday } from "@/lib/bangkok-date";
import {
  GROOM_PROGRAMS,
  resolveGroomSizes,
  groomPrice,
  groomProgram,
  groomSizeLabel,
  resolveGroomPrograms,
  groomProgramName,
  type GroomSize,
  type GroomProgram,
} from "@/lib/grooming-prices";
import { priceSignature, findLastPrice } from "@/lib/special-price";
import { groomPrefillForPet, itemIsForPet, lastGroomForPet, type PetCard } from "@/lib/pet-groom-memory";
import { roomPricing, roomNightPrice } from "@/lib/room-board";
import { isRoomLine, roomLineLabel, splitRoomLabel } from "@/lib/stay-line";
import {
  LINE_PROMO_KINDS,
  normalizeLineDiscount,
  stripDiscountTag,
  type LinePromo,
  type LinePromoKind,
} from "@/lib/line-discount";

type Customer = {
  id: string;
  name: string;
  phone?: string;
  lineUserId?: string;
  cats: ({ id?: string } & PetCard)[];
  isMember: boolean;
  memberCredit: number;
  /** มัดจำล่วงหน้าคงเหลือ — หักบิลนี้อัตโนมัติ */
  depositCredit?: number;
};

type Promo = {
  id: string;
  title: { th: string };
  discountPercent?: number;
  discountAmount?: number;
};

type Invoice = {
  id: string;
  total: number;
  subtotal?: number;
  discount?: number;
  deposit?: number;
  promoLabel?: string;
  status: string;
  customerName: string;
  catName: string;
  lineUserId?: string;
  customerId?: string;
  bookingId?: string;
  depositReceivedAt?: string;
  createdAt?: string;
  items?: {
    label: string;
    amount: number;
    kind?: string;
    productId?: string;
    catName?: string;
    qty?: number;
    unitAmount?: number;
    discount?: number;
    discountPercent?: number;
    discountName?: string;
  }[];
};

type Booking = {
  id: string;
  customerId?: string;
  customerName: string;
  catName: string;
  service: "room" | "groom";
  room?: string;
  roomUnit?: number;
  checkin?: string;
  checkout?: string;
  date?: string;
  time?: string;
  status: string;
  autoOff?: string[];
  /** โปรแกรมอาบน้ำที่เลือกไว้ตอนจอง (id ใน GROOM_PROGRAMS) — ถ้ามีจะเลือกไว้ให้อัตโนมัติตอนออกบิล */
  groomProgram?: string;
};

type ItemKind = "grooming" | "room" | "service" | "custom" | "freebie" | "package" | "product";
type Item = {
  kind: ItemKind;
  program: string;
  breed: string;
  size: GroomSize;
  roomLabel: string;
  roomPrice: number;
  nights: number;
  label: string;
  amount: number;
  /** น้องแมวตัวไหน — บ้านที่มีหลายตัวจะได้รู้ว่าตัวไหนอาบโปรแกรมอะไร */
  catName?: string;
  /** จำนวนชิ้น (ห้องพักใช้ "คืน" แทน) */
  qty?: number;
  /** ราคาต่อหน่วยที่ตกลงกับลูกค้าคนนี้ — ทับราคากลางของร้านเฉพาะบิลนี้
   *  undefined = ใช้ราคาปกติ, 0 = ตั้งใจให้ฟรี (จึงเช็ค undefined ไม่ใช่ falsy) */
  priceOverride?: number;
  /** ส่วนลดเฉพาะรายการนี้ (หักจากยอดรวมของรายการ ก่อนส่วนลดท้ายบิล) — บาท หรือ % */
  discount?: number;
  discountMode?: "baht" | "percent";
  /** ชื่อโปรลดเฉพาะรายการ (ใส่ให้เองตอนเลือกโปร) */
  discountName?: string;
  /** บรรทัดค่าห้องจากบิลเดิมที่เปิดมาแก้ (โหลดเป็น "พิมพ์เอง") — qty = จำนวนคืน
   *  บันทึกกลับเป็นค่าห้อง "× N คืน" ไม่ใช่ "× N" ระบบต่อคืนจะได้นับคืนที่จ่ายไปแล้วถูก */
  roomLine?: { note?: string };
  /** สินค้าหน้าร้าน (kind "product") — ออก/แก้/ลบบิลแล้วตัด/คืนสต็อกให้เอง */
  productId?: string;
};

/**
 * ยอดที่ลงบัญชีไปแล้วของบิลที่ยังเปิดอยู่ = มัดจำที่ "กดรับแล้ว" เท่านั้น (มัดจำรอรับยังไม่ใช่เงินเข้า)
 * ตรงกับฝั่งเซิร์ฟเวอร์ที่ตอนปิดบิลเก็บ "ยอดบิล − รายรับที่ผูกบิลนี้" — ป้ายบนปุ่มจะได้ตรงกับยอดที่ลงบัญชีจริง
 */
function receivedOf(inv: { deposit?: number; depositReceivedAt?: string }): number {
  return inv.depositReceivedAt ? inv.deposit || 0 : 0;
}

/**
 * ขั้นของบิลที่ยังไม่ปิด — แยกให้เห็นว่าบิลค้างแต่ละใบรออะไรอยู่ ไม่ดูเหมือนค้างเงินทุกใบ
 * deposit = ตั้งมัดจำไว้แต่ยังไม่ได้รับ · partial = รับมัดจำ/รับบางส่วนแล้ว รอปิดบิล · full = ยังไม่ได้รับเงินเลย
 */
type PendingStage = "deposit" | "partial" | "full";
function pendingStageOf(inv: { deposit?: number; depositReceivedAt?: string }): PendingStage {
  if ((inv.deposit || 0) <= 0) return "full";
  return inv.depositReceivedAt ? "partial" : "deposit";
}
const STAGE_META: Record<PendingStage, { label: string; short: string; tone: string; icon: IconName }> = {
  deposit: { label: "รอมัดจำ", short: "รอมัดจำ", tone: "bg-wait/15 text-wait", icon: "clock" },
  partial: { label: "มัดจำแล้ว รอปิดบิล", short: "รอปิดบิล", tone: "bg-latte/20 text-latte-deep", icon: "check" },
  full: { label: "รอชำระเต็ม", short: "รอชำระ", tone: "bg-wait/15 text-wait", icon: "clock" },
};

/** programId มาจากนัด (booking.groomProgram) ถ้ามี — ให้เลือกโปรแกรมที่ลูกค้าเลือกไว้ตอนจองอัตโนมัติ */
function newGrooming(programId?: string, programs: GroomProgram[] = GROOM_PROGRAMS): Item {
  const prog = (programId && programs.find((p) => p.id === programId)) || programs[0];
  return {
    kind: "grooming",
    program: prog.id,
    breed: prog.breeds[0].breed,
    size: "m",
    roomLabel: "",
    roomPrice: 0,
    nights: 1,
    label: "",
    amount: 0,
  };
}

/**
 * บิลนี้มีอาบน้ำ ห้องพัก หรือทั้งคู่ — ใช้กรองว่าปุ่ม "ปิดข้อความอัตโนมัติ" ควรโชว์หัวข้อไหน
 * (บิลอาบน้ำล้วนไม่ควรมีตัวเลือกเรื่องเข้าพักมาให้เลือกโดยไม่มีผล)
 */
function billServiceKind(items?: { label: string; kind?: string }[]): "room" | "groom" | "both" {
  const hasRoom = !!items?.some((it) => it.kind === "room" || /คืน|ห้อง/.test(it.label));
  const hasGroom = !!items?.some((it) => it.kind === "grooming" || /อาบน้ำ|กรูม/.test(it.label));
  if (hasRoom && hasGroom) return "both";
  return hasRoom ? "room" : "groom";
}

/**
 * รายการเดียวใส่ชื่อน้องได้หลายตัว (เช่น แมว 2 ตัวนอนห้องเดียวกัน)
 * เก็บเป็นชื่อคั่นด้วย "," ในฟิลด์เดิม — ไม่ต้องแก้โครงสร้างบิล/ฐานข้อมูล
 */
const CAT_SEP = ", ";
/**
 * เทียบชื่อน้องแบบไม่แคร์ช่องว่าง/อักขระล่องหน — ชื่อไทยที่พิมพ์คนละครั้ง
 * อาจมี zero-width หรือสระเรียงคนละแบบ ทำให้ === ไม่ตรงทั้งที่ตาเห็นเหมือนกัน
 * (เป็นเหตุให้ติ๊กชื่อออกไม่ได้ แล้วชื่อน้องตัวอื่นติดมาในบรรทัดบิล)
 */
function catKey(name: string): string {
  return name.normalize("NFC").replace(/[\u200B-\u200D\uFEFF\s]/g, "").toLowerCase();
}
function parseCatNames(v?: string): string[] {
  return (v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
function joinCatNames(names: string[]): string | undefined {
  return names.length ? names.join(CAT_SEP) : undefined;
}

function computeLine(
  it: Item,
  programs: GroomProgram[] = GROOM_PROGRAMS,
  sizeLabels?: Partial<Record<GroomSize, string>>
): ReturnType<typeof computeLineBase> & {
  discount?: number;
  discountPercent?: number;
  discountName?: string;
} {
  const base = computeLineBase(it, programs, sizeLabels);
  const d = Math.max(0, it.discount || 0);
  if (it.kind === "freebie" || d <= 0 || base.amount <= 0) return base;
  // ส่งส่วนลดไปเป็นฟิลด์ของรายการ — เซิร์ฟเวอร์คิดยอด/ป้าย "(ส่วนลด …)" ด้วยสูตรเดียวกันนี้
  // (เมื่อก่อนส่งไปแค่ยอดที่ลดแล้ว แต่เซิร์ฟเวอร์คิดใหม่จากราคาต่อหน่วย ส่วนลดเลยหายตอนออกบิลครั้งแรก)
  return normalizeLineDiscount({
    ...base,
    ...(it.discountMode === "percent" ? { discountPercent: d } : { discount: d }),
    discountName: it.discountName,
  });
}

/** ประเภทของรายการในบิล ตามที่โปรลดเฉพาะรายการติ๊กเลือกได้ */
function linePromoKindOf(it: Item): LinePromoKind | null {
  if (it.roomLine) return "stay";
  if (it.kind === "room") return /day\s*care/i.test(it.roomLabel || "") ? "daycare" : "stay";
  if (it.kind === "grooming") return "grooming";
  if (it.kind === "service") return /รับ\s*-?\s*ส่ง/.test(it.label || "") ? "transport" : "service";
  if (it.kind === "product") return "product";
  return null;
}

/**
 * ใส่ส่วนลดจากโปรที่เลือกให้รายการที่ตรงประเภท — รายการที่ใส่ส่วนลดเองไว้แล้วใช้ของเดิม
 * (ไม่ได้เขียนทับลง state เพิ่มรายการทีหลังก็ได้ส่วนลดเอง เปลี่ยน/เลิกโปรก็กลับเป็นราคาเต็ม)
 */
function withLinePromo(it: Item, promo?: LinePromo): Item {
  if (!promo || (it.discount || 0) > 0) return it;
  const kind = linePromoKindOf(it);
  if (!kind || !promo.kinds.includes(kind)) return it;
  return { ...it, discount: promo.percent, discountMode: "percent", discountName: promo.name };
}

function computeLineBase(
  it: Item,
  programs: GroomProgram[] = GROOM_PROGRAMS,
  sizeLabels?: Partial<Record<GroomSize, string>>
): {
  label: string;
  amount: number;
  catName?: string;
  qty: number;
  unitAmount: number;
  productId?: string;
} {
  const cat = joinCatNames(parseCatNames(it.catName));
  /** ใส่ชื่อน้องนำหน้า ให้เจ้าของอ่านบิลแล้วรู้ทันทีว่าตัวไหนใช้อะไร */
  const withCat = (label: string) => (cat ? `🐱 ${cat} · ${label}` : label);
  const qty = Math.max(1, Math.round(it.qty || 1));

  if (it.kind === "grooming") {
    const prog = groomProgram(it.program, programs);
    const unit = it.priceOverride ?? groomPrice(it.program, it.breed, it.size, programs);
    const base = `${prog?.name || "อาบน้ำ"} · ${it.breed} · ${groomSizeLabel(it.size, sizeLabels)}`;
    return {
      label: withCat(qty > 1 ? `${base} × ${qty}` : base),
      amount: unit * qty,
      catName: cat,
      qty,
      unitAmount: unit,
    };
  }
  if (it.kind === "room") {
    // ห้องพักคิดเป็น "คืน" อยู่แล้ว จึงไม่ใช้ qty ซ้ำ
    const n = Math.max(1, it.nights || 1);
    const unit = it.priceOverride ?? (it.roomPrice || 0);
    return {
      label: withCat(`${it.roomLabel || "ห้องพัก"} × ${n} คืน`),
      amount: unit * n,
      catName: cat,
      qty: n,
      unitAmount: unit,
    };
  }
  if (it.kind === "freebie") {
    return {
      label: withCat(`🎁 ${it.label || "ของแถม"} (ฟรี)`),
      amount: 0,
      catName: cat,
      qty: 1,
      unitAmount: 0,
    };
  }
  const unit = it.priceOverride ?? (it.amount || 0);
  if (it.roomLine) {
    return {
      label: withCat(roomLineLabel(it.label, qty, it.roomLine.note)),
      amount: unit * qty,
      catName: cat,
      qty,
      unitAmount: unit,
    };
  }
  return {
    label: withCat(qty > 1 ? `${it.label} × ${qty}` : it.label),
    amount: unit * qty,
    catName: cat,
    qty,
    unitAmount: unit,
    productId: it.productId,
  };
}

/** ราคากลางของร้านสำหรับรายการนี้ — ไว้เทียบว่าราคาที่คิดอยู่ "พิเศษ" จริงไหม */
function standardUnitPrice(it: Item, programs: GroomProgram[] = GROOM_PROGRAMS): number {
  if (it.kind === "grooming") return groomPrice(it.program, it.breed, it.size, programs);
  if (it.kind === "room") return it.roomPrice || 0;
  if (it.kind === "freebie") return 0;
  return it.amount || 0;
}

/** สรุปการจอง (วัน/เวลา) จากนัดที่ผูกกับบิล — โชว์ในบิล + การ์ดสรุปให้ลูกค้า */
function scheduleLabelFor(bk?: {
  service?: string;
  checkin?: string;
  checkout?: string;
  date?: string;
  time?: string;
}): string {
  if (!bk) return "";
  const isRoom = bk.service === "room" || !!bk.checkin;
  if (isRoom) {
    const inD = formatThaiDateShort(bk.checkin || bk.date || "");
    const outD = bk.checkout ? formatThaiDateShort(bk.checkout) : "";
    let nights = 0;
    if (bk.checkin && bk.checkout) {
      nights = Math.max(
        1,
        Math.round(
          (new Date(`${bk.checkout}T12:00:00`).getTime() -
            new Date(`${bk.checkin}T12:00:00`).getTime()) /
            86400000
        )
      );
    }
    if (!inD) return "";
    return `🏠 เข้าพัก ${inD}${outD ? ` → ${outD}` : ""}${nights ? ` · ${nights} คืน` : ""}`;
  }
  const d = formatThaiDateShort(bk.date || "");
  if (!d) return "";
  return `🛁 นัดอาบน้ำ ${d}${bk.time ? ` · ${bk.time} น.` : ""}`;
}

const KIND_OPTIONS: { id: ItemKind; label: string }[] = [
  { id: "grooming", label: "อาบน้ำ / กรูม" },
  { id: "room", label: "ห้องพัก" },
  { id: "service", label: "บริการเสริม" },
  { id: "product", label: "สินค้าหน้าร้าน" },
  { id: "freebie", label: "ของแถม (ฟรี)" },
  { id: "package", label: "ขายคอร์ส/เครดิต (ไม่ได้แต้ม)" },
  { id: "custom", label: "พิมพ์เอง" },
];

const FREEBIE_PRESETS = [
  "กล้องวงจรปิด (CCTV)",
  "น้ำพุแมว",
  "รับ-ส่ง",
  "ขนม/ทรีท",
];

/**
 * ช่องกรอกตัวเลขที่ "ลบให้ว่างแล้วพิมพ์ใหม่ได้" — เก็บ draft เป็น string ระหว่างพิมพ์
 * ปัญหาเดิม: bind ค่าเป็นตัวเลข + `Number(x)||1` ทุก keystroke พอลบจนว่างมันเด้งกลับเป็น 1
 * ที่นี่ปล่อยให้ว่างได้ระหว่างพิมพ์ แล้วค่อย clamp ตอนออกจากช่อง (blur)
 */
function NumField({
  value,
  min = 0,
  onCommit,
  className,
}: {
  value: number;
  min?: number;
  onCommit: (n: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  // ค่าจากภายนอกเปลี่ยน (เช่น เลือกห้องใหม่) ตอนที่ไม่ได้พิมพ์อยู่ → sync ให้ตรง
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);
  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        const raw = e.target.value;
        if (!/^\d*$/.test(raw)) return; // ตัวเลขล้วน (อนุญาตว่าง)
        setDraft(raw);
        if (raw !== "") onCommit(Math.max(min, Number(raw)));
      }}
      onBlur={() => {
        setEditing(false);
        const n = draft === "" ? min : Math.max(min, Number(draft));
        setDraft(String(n));
        onCommit(n);
      }}
      className={className}
    />
  );
}

function BillsView({ tabs }: { tabs: React.ReactNode }) {
  const { config: siteConfig } = useConfig();
  const creditOn = isFeatureOn(siteConfig, "memberCredit");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [rooms, setRooms] = useState<(ServicePreset & { id: string; pricing: ReturnType<typeof roomPricing> })[]>([]);
  const [servicePresets, setServicePresets] = useState<ServicePreset[]>(SERVICE_PRESETS);
  /** สินค้าหน้าร้าน — เลือกใส่บิลได้ (ลูกค้ามาใช้บริการแล้วซื้อของติดมือด้วย) */
  const [posProducts, setPosProducts] = useState<PosProduct[]>([]);
  useEffect(() => {
    fetch("/api/pos/products")
      .then((r) => r.json())
      .then((d) => setPosProducts(d.products || []))
      .catch(() => {});
  }, []);
  const [freebiePresets, setFreebiePresets] = useState<string[]>(FREEBIE_PRESETS);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingId, setBookingId] = useState<string | undefined>(undefined);
  const [showBookings, setShowBookings] = useState(false);

  const [customerId, setCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [, setShowList] = useState(false);

  const [promoId, setPromoId] = useState("");
  const [autoPromoLabel, setAutoPromoLabel] = useState("");
  const [discount, setDiscount] = useState("");
  const [couponId, setCouponId] = useState("");
  const [customerCoupons, setCustomerCoupons] = useState<
    { id: string; amount: number; reason: string; code: string }[]
  >([]);
  const [packageId, setPackageId] = useState("");
  const [customerPackages, setCustomerPackages] = useState<
    {
      id: string;
      name: string;
      totalUses: number;
      usedUses: number;
      unit?: "use" | "night";
      /** คอร์สคืนที่ผูกประเภทห้อง (แพ็กห้องรายเดือน) — หักได้เฉพาะห้องประเภทนี้ */
      roomType?: string;
      roomLabel?: string;
      /** คอร์สนับครั้งที่ผูกโปรแกรมอาบน้ำ — หักตามจำนวนตัวที่อาบโปรแกรมนี้ในบิล */
      groomProgram?: string;
      /** แพ็กห้องรายเดือนที่ยังจ่ายไม่ครบ — ยังใช้ไม่ได้ */
      locked?: boolean;
      outstanding?: number;
    }[]
  >([]);
  /** พนักงานกดเลือก/ยกเลิกคอร์สเองแล้ว — ไม่เลือกคอร์สห้องให้อัตโนมัติทับอีก */
  const [packageTouched, setPackageTouched] = useState(false);
  const [billDeposit, setBillDeposit] = useState("");
  const [billDepPct, setBillDepPct] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState("");
  const [billFilter, setBillFilter] = useState<"all" | "pending" | "paid">("pending");
  const [pendingStage, setPendingStage] = useState<"all" | PendingStage>("all");
  const [billSearch, setBillSearch] = useState("");
  const [billSort, setBillSort] = useState<
    | "date-desc"
    | "date-asc"
    | "issued-desc"
    | "issued-asc"
    | "amount-desc"
    | "due-desc"
    | "name-asc"
  >("issued-desc");
  // กรองบิลรายเดือน — เปิดมาครั้งแรกเห็นเดือนปัจจุบันเลย ("" = ทุกเดือน)
  const [billMonth, setBillMonth] = useState("");
  // ตารางราคาโปรแกรมอาบน้ำ — ค่าเริ่มต้นของระบบ จนกว่า config จะโหลดเสร็จ (มีโปรแกรมที่ร้านเพิ่มเองด้วย)
  const [groomPrograms, setGroomPrograms] = useState<GroomProgram[]>(GROOM_PROGRAMS);
  const [groomSizeLabels, setGroomSizeLabels] = useState<Partial<Record<GroomSize, string>>>({});
  const [items, setItems] = useState<Item[]>([newGrooming()]);
  // ขายเร็ว ไม่ระบุลูกค้า — ใช้ลูกค้าโครง "ลูกค้าหน้าร้าน" แทน (สำหรับขายสินค้าล้วนๆ ไม่มีนัด)
  const [quickSale, setQuickSale] = useState(false);
  const [products, setProducts] = useState<
    { id: string; name: string; category: string; price: number; imageUrl?: string; stockCount: number }[]
  >([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productTab, setProductTab] = useState("ทั้งหมด");
  // ส่วนลดกรอกได้ทั้งบาทและเปอร์เซ็นต์ — ร้านคิดโปรเป็น % บ่อย จะได้ไม่ต้องกดเครื่องคิดเลขเอง
  const [discountMode, setDiscountMode] = useState<"baht" | "percent">("baht");
  /** โปรลดเฉพาะรายการ (ตั้งในตั้งค่า) + ตัวที่เลือกใช้กับบิลนี้ */
  const [linePromos, setLinePromos] = useState<LinePromo[]>([]);
  const [linePromoId, setLinePromoId] = useState("");
  const [creating, setCreating] = useState(false);
  const [pay, setPay] = useState({ bankName: "", accountNumber: "", accountName: "" });
  const [shopName, setShopName] = useState("");
  const [billMsg, setBillMsg] = useState({
    summaryBookingTitle: "สรุปการจอง",
    summaryDepositTitle: "แจ้งมัดจำ",
    summaryFullTitle: "แจ้งยอดชำระ",
    summaryClosing: "",
  });
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  // UI ล้วน: สรุปแบบไหนที่จะก๊อป/ส่ง · บิลที่เปิดแผ่นรับชำระ · บิลที่เปิดแผ่นส่ง LINE
  const [summaryMode, setSummaryMode] = useState<"booking" | "deposit" | "full">("booking");
  const [payFor, setPayFor] = useState<Invoice | null>(null);
  const [sendFor, setSendFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, p, i, cfg, b] = await Promise.all([
      fetch("/api/customers"),
      fetch("/api/promos?active=1"),
      fetch("/api/invoices"),
      fetch("/api/config"),
      fetch("/api/bookings"),
    ]);
    // parse ทั้งหมดก่อน แล้วค่อย setState (rooms ก่อน bookings) — กัน auto-pick
    // จาก URL รันก่อนห้องโหลดเสร็จ (ไม่งั้นราคาห้องออกมา 0)
    const [cj, pj, ij, cfgj, bj] = await Promise.all([
      c.json(),
      p.json(),
      i.json(),
      cfg.json(),
      b.json(),
    ]);
    const config = cfgj.config;
    setCustomers(cj.customers || []);
    setPromos(pj.promos || []);
    setInvoices(ij.invoices || []);
    setRooms(
      (config?.rooms || []).map((r: { id: string; name: string; price: number } & Parameters<typeof roomPricing>[0]) => ({
        id: r.id,
        label: `ห้อง ${r.name}`,
        amount: r.price,
        pricing: roomPricing(r),
      }))
    );
    setGroomPrograms(resolveGroomPrograms(config?.groomPricePrograms));
    setGroomSizeLabels(config?.groomSizeLabels || {});
    if (config?.payment) setPay(config.payment);
    if (config?.business?.name) setShopName(config.business.name);
    if (config?.billing) setBillMsg(config.billing);
    if (config?.options?.servicePresets?.length) setServicePresets(config.options.servicePresets);
    setLinePromos(config?.linePromos || []);
    if (config?.options?.freebies?.length) setFreebiePresets(config.options.freebies);
    // ดึงจากนัดเฉพาะที่ยังไม่จบ — เสร็จสิ้น/ยกเลิก/ไม่มา ไม่ควรโผล่ให้ออกบิลซ้ำอีก
    // (บิลที่ออกไปแล้วตัดออกด้วย paidForGroup ด้านล่าง)
    const ACTIVE_STATUSES = new Set(["pending", "confirmed", "ready"]);
    setBookings(
      (bj.bookings || []).filter((x: Booking) => ACTIVE_STATUSES.has(x.status))
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // โหลดสินค้าหน้าร้านตอนเปิดตัวเลือกครั้งแรกเท่านั้น (ไม่ใช่ทุกบิล) — ยอดขายส่วนใหญ่ไม่มีสินค้า
  useEffect(() => {
    if (!showProductPicker) return;
    // สินค้าชุดเดียวกับ POS (ขายหน้าร้าน) — สินค้าที่ไม่นับสต็อกถือว่ามีของเสมอ
    fetch("/api/pos/products")
      .then((r) => r.json())
      .then((d) =>
        setProducts(
          ((d.products || []) as { id: string; name: string; category?: string; price: number; imageUrl?: string; stock: number; trackStock: boolean }[]).map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category || "",
            price: p.price,
            imageUrl: p.imageUrl,
            stockCount: p.trackStock ? p.stock : Number.POSITIVE_INFINITY,
          }))
        )
      )
      .catch(() => {});
  }, [showProductPicker]);
  // มาจากปุ่ม "คิดเงิน" (หน้าแรก/แถบล่าง, ?view=pending) → เปิดที่บิลรอชำระทั้งหมด พร้อมกดรับชำระ
  const showPendingBills = useCallback(() => {
    setBillFilter("pending");
    setPendingStage("all");
    requestAnimationFrame(() =>
      document.getElementById("bills")?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }, []);
  const jumpedToBills = useRef(false);
  useEffect(() => {
    if (jumpedToBills.current || invoices.length === 0) return;
    if (new URLSearchParams(window.location.search).get("view") !== "pending") return;
    jumpedToBills.current = true;
    showPendingBills();
  }, [invoices, showPendingBills]);
  useEffect(() => {
    window.addEventListener("petflow:show-pending-bills", showPendingBills);
    return () => window.removeEventListener("petflow:show-pending-bills", showPendingBills);
  }, [showPendingBills]);

  // ดึงนัดจาก URL อัตโนมัติ (มาจากปุ่ม "ออกบิล" ในตารางนัด) — ทำครั้งเดียว
  const autoPicked = useRef(false);
  useEffect(() => {
    if (autoPicked.current || bookings.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const bId = params.get("bookingId");
    if (!bId) return;
    const bk = bookings.find((b) => b.id === bId);
    if (!bk) return;
    // กดปุ่ม "ออกบิล" จากตารางนัดส่งมาแค่ id เดียว — ดึงทั้งบ้านมาด้วย
    // (กดจากนัดอาบน้ำก่อนกลับ ก็ได้บิลเดียวกับค่าห้อง)
    const group = groupForBilling(bookings).find((g) => g.some((x) => x.id === bId));
    // นัดห้องพัก ต้องรอ rooms โหลดก่อน ไม่งั้น match ราคาไม่เจอ → ยอด 0
    if ((group || [bk]).some((x) => x.service === "room") && rooms.length === 0) return;
    autoPicked.current = true;
    pickBooking(group || [bk]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, rooms]);

  const selected = customers.find((c) => c.id === customerId);

  // โหลดคูปอง + คอร์สที่ใช้ได้ของลูกค้าที่เลือก
  useEffect(() => {
    setCouponId("");
    setPackageId("");
    setPackageTouched(false);
    if (!customerId) {
      setCustomerCoupons([]);
      setCustomerPackages([]);
      return;
    }
    let alive = true;
    fetch(`/api/coupons?customerId=${customerId}&active=1`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setCustomerCoupons(d.coupons || []);
      })
      .catch(() => {});
    fetch(`/api/packages?customerId=${customerId}&active=1`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setCustomerPackages(d.packages || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [customerId]);

  // บ้านเดียวกัน + นัดเดียวกัน = 1 รายการในลิสต์ ออกบิลใบเดียว
  //
  // บิลของบ้านรวมผูกกับ "นัดตัวแรก" ตัวเดียว ถ้าตัดทั้งกลุ่มเมื่อเจอบิลที่จ่ายแล้ว
  // บ้านที่ออกบิลไปแค่บางตัว (พนักงานลบบางแถวออก) จะหายทั้งกลุ่ม อีกหลายตัวออกบิลไม่ได้เลย
  // จึงดูจาก "ชื่อน้องที่ถูกออกบิลไปแล้ว" แทน แล้วเหลือเฉพาะตัวที่ยังไม่ได้ออกบิล
  const bookingGroups = groupForBilling(bookings)
    .map((group) => {
      const groupIds = new Set(group.map((b) => b.id));
      // ทั้งบิลที่จ่ายแล้วและบิลที่แค่ร่างไว้ (pending) ถือว่า "ออกบิลแล้ว" —
      // ไม่งั้นกดออกบิลจากนัดเดิมซ้ำได้ก่อนบิลแรกจะถูกจ่ายหรือลบทิ้ง
      const billedForGroup = invoices.filter(
        (i) => i.bookingId && groupIds.has(i.bookingId)
      );
      if (billedForGroup.length === 0) return group;
      // บิลเก่าที่ยังไม่มีชื่อน้องรายรายการ → ถือว่าคุมแค่น้องหลักของบิลนั้น (ปลอดภัยกว่าซ่อนเกิน)
      const billedCats = new Set(
        billedForGroup.flatMap((i) => {
          // 1 รายการใส่ชื่อน้องได้หลายตัว (คั่นด้วย ",") → ต้องแตกออกให้ครบ
          // ไม่งั้นบิลที่คุมแมว 2 ตัวจะซ่อนนัดให้แค่ตัวเดียว
          const perItem = (i.items || []).flatMap((it) => parseCatNames(it.catName));
          return perItem.length ? perItem : [i.catName];
        })
      );
      return group.filter((b) => !billedCats.has(b.catName));
    })
    .filter((group) => group.length > 0)
    // เรียงตามวันนัด ไม่ใช่วันที่กดจอง: วันนี้/ที่ผ่านมาแล้ว (ใกล้วันนี้ก่อน) ขึ้นบนสุด
    // เพราะเป็นนัดที่ต้องคิดเงินตอนนี้ ตามด้วยนัดล่วงหน้า (ใกล้สุดก่อน)
    .sort((a, b) => {
      const today = bangkokToday();
      const key = (g: Booking[]) => `${g[0].checkin || g[0].date || ""} ${g[0].time || ""}`;
      const ka = key(a);
      const kb = key(b);
      const aDue = ka.slice(0, 10) <= today;
      const bDue = kb.slice(0, 10) <= today;
      if (aDue !== bDue) return aDue ? -1 : 1;
      return aDue ? kb.localeCompare(ka) : ka.localeCompare(kb);
    });
  const linePromo = linePromos.find((p) => p.id === linePromoId);
  const lines = items.map((it) => computeLine(withLinePromo(it, linePromo), groomPrograms, groomSizeLabels));
  /** ยอดที่โปรลดเฉพาะรายการลดให้ในบิลนี้ (ไม่นับรายการที่ใส่ส่วนลดเองไว้) */
  const linePromoOff = lines.reduce(
    (sum, l, i) =>
      sum + ((items[i].discount || 0) > 0 || !l.discountName ? 0 : l.unitAmount * l.qty - l.amount),
    0
  );
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const selectedPromo = promos.find((p) => p.id === promoId);
  const promoDiscount = selectedPromo
    ? Math.min(
        subtotal,
        Math.max(
          selectedPromo.discountPercent
            ? Math.round((subtotal * selectedPromo.discountPercent) / 100)
            : 0,
          selectedPromo.discountAmount || 0
        )
      )
    : 0;
  const discountInput = Math.max(0, Number(discount) || 0);
  const manualDiscount =
    discountMode === "percent"
      ? // คิด % จากยอดรวมหลังหักโปรแล้ว และไม่ให้เกินยอดที่เหลือ
        Math.min(
          Math.max(0, subtotal - promoDiscount),
          Math.round(((subtotal - promoDiscount) * Math.min(100, discountInput)) / 100)
        )
      : discountInput;
  const couponAmount = customerCoupons.find((c) => c.id === couponId)?.amount || 0;

  const pickedPackage = customerPackages.find((p) => p.id === packageId);
  const packageLeft = pickedPackage
    ? pickedPackage.totalUses - pickedPackage.usedUses
    : 0;
  /**
   * คอร์สแบบคืน: หักตามจำนวนคืนที่พักจริง แล้วคลุมเฉพาะค่าห้องของคืนที่หักได้
   * (ค่าอาบน้ำ/ของเสริมในบิลเดียวกันยังต้องจ่าย) ถ้าคืนที่เหลือไม่พอ
   * จะคลุมเท่าที่เหลือ แล้วส่วนที่เกินลูกค้าจ่ายเพิ่มตามปกติ
   */
  // คอร์สผูกประเภทห้อง → นับเฉพาะบรรทัดห้องประเภทนั้น (หักตามห้องที่พักจริง)
  const lineMatchesRoom = (
    it: Item | undefined,
    pk?: { roomType?: string; roomLabel?: string }
  ) => {
    if (!it || it.kind !== "room") return false;
    if (!pk?.roomType) return true;
    const rid = rooms.find((r) => r.label === it.roomLabel)?.id;
    return rid === pk.roomType || (!!pk.roomLabel && it.roomLabel === pk.roomLabel);
  };
  const roomLines = lines
    .map((l, i) => ({ ...l, kind: items[i]?.kind, match: lineMatchesRoom(items[i], pickedPackage) }))
    .filter((l) => l.kind === "room" && l.match);
  const billHasRoom = items.some((it) => it.kind === "room");
  const nightsOnBill = roomLines.reduce((n, l) => n + Math.max(1, l.qty || 1), 0);
  const nightsToUse =
    pickedPackage?.unit === "night" ? Math.min(packageLeft, nightsOnBill) : 0;
  const nightsCover = (() => {
    if (!nightsToUse) return 0;
    let left = nightsToUse;
    let covered = 0;
    for (const l of roomLines) {
      if (left <= 0) break;
      const take = Math.min(left, Math.max(1, l.qty || 1));
      covered += take * (l.unitAmount || 0);
      left -= take;
    }
    return covered;
  })();

  /**
   * คอร์สนับครั้งผูกโปรแกรม: หักตามจำนวนตัว (qty) ที่อาบโปรแกรมนั้นในบิล
   * บ้านมา 2 ตัวอาบโปรแกรมเดียวกัน = หัก 2 ครั้ง · คลุมเฉพาะค่าโปรแกรมนั้น
   * โปรแกรมอื่น/ห้องพัก/ของเสริมในบิลเดียวกันยังคิดตามปกติ
   */
  const groomLinesOf = (pk?: { groomProgram?: string }) =>
    pk?.groomProgram
      ? lines.filter(
          (_, i) => items[i]?.kind === "grooming" && items[i]?.program === pk.groomProgram
        )
      : [];
  const programLines = groomLinesOf(pickedPackage);
  const programUsesOnBill = programLines.reduce((n, l) => n + Math.max(1, l.qty || 1), 0);
  const programUsesToUse = pickedPackage?.groomProgram
    ? Math.min(packageLeft, programUsesOnBill)
    : 0;
  const programCover = (() => {
    let left = programUsesToUse;
    let covered = 0;
    for (const l of programLines) {
      if (left <= 0) break;
      const take = Math.min(left, Math.max(1, l.qty || 1));
      covered += take * (l.unitAmount || 0);
      left -= take;
    }
    return covered;
  })();
  /** หน่วยที่จะหักจากคอร์สในบิลนี้ (คืน หรือ ครั้งของโปรแกรม) — ไม่ระบุ = 1 แบบเดิม */
  const packageUnitsToUse = nightsToUse || programUsesToUse;

  // ลูกค้ามีแพ็กห้องรายเดือนตรงกับห้องในบิล → เลือกคอร์สให้เลย (แบบ Member ที่หักอัตโนมัติ)
  // ถ้ามีหลายห้องในบิล เลือกคอร์สที่คลุมคืนได้มากสุด · พนักงานกดยกเลิกได้ ไม่เลือกทับอีก
  const autoRoomPackageId = (() => {
    if (packageTouched || packageId || editingId) return "";
    let best = "";
    let bestNights = 0;
    for (const pk of customerPackages) {
      if (pk.locked) continue;
      const isRoomPack = pk.unit === "night" && !!pk.roomType;
      // คอร์สอาบน้ำที่ผูกโปรแกรม เลือกให้อัตโนมัติด้วย (หักตามตัวที่อาบโปรแกรมนั้น)
      const isProgramPack = pk.unit !== "night" && !!pk.groomProgram;
      if (!isRoomPack && !isProgramPack) continue;
      const left = pk.totalUses - pk.usedUses;
      const onBill = isRoomPack
        ? items
            .filter((it) => lineMatchesRoom(it, pk))
            .reduce((n, it) => n + Math.max(1, it.nights || 1), 0)
        : items
            .filter((it) => it.kind === "grooming" && it.program === pk.groomProgram)
            .reduce((n, it) => n + Math.max(1, Math.round(it.qty || 1)), 0);
      const n = Math.min(left, onBill);
      if (n > bestNights) {
        best = pk.id;
        bestNights = n;
      }
    }
    return best;
  })();
  useEffect(() => {
    if (autoRoomPackageId) setPackageId(autoRoomPackageId);
  }, [autoRoomPackageId]);

  // คอร์สนับครั้ง: หัก 1 ครั้ง → คลุมยอดที่เหลือทั้งบิลให้เป็น 0 (จ่ายไปแล้วตอนซื้อคอร์ส)
  const packageCovers = !packageId
    ? 0
    : pickedPackage?.unit === "night"
      ? Math.min(nightsCover, Math.max(0, subtotal - promoDiscount - manualDiscount - couponAmount))
      : pickedPackage?.groomProgram
        ? Math.min(programCover, Math.max(0, subtotal - promoDiscount - manualDiscount - couponAmount))
        : Math.max(0, subtotal - promoDiscount - manualDiscount - couponAmount);
  const total = Math.max(
    0,
    subtotal - promoDiscount - manualDiscount - couponAmount - packageCovers
  );
  // มัดจำของบิลนี้ (กรอกในฟอร์ม) → คงเหลือ = ยอดสุทธิ − มัดจำ
  const depositAmount = Math.min(total, Math.max(0, Number(billDeposit) || 0));
  const remaining = Math.max(0, total - depositAmount);

  const buildSummary = (mode: "booking" | "deposit" | "full") => {
    const catName = selected?.cats[0]?.name || "น้อง";
    const L: string[] = [];
    L.push(`🐾 ${shopName}`);
    L.push(
      mode === "deposit"
        ? billMsg.summaryDepositTitle
        : mode === "full"
          ? billMsg.summaryFullTitle
          : billMsg.summaryBookingTitle
    );
    L.push("");
    if (selected) L.push(`ลูกค้า: ${selected.name} · 🐱 ${catName}`);
    L.push("— รายการ —");
    for (const l of lines) {
      if (!l.label.trim()) continue;
      L.push(`• ${l.label}${l.amount > 0 ? ` — ${l.amount.toLocaleString()} บาท` : ""}`);
    }
    if (promoDiscount + manualDiscount > 0)
      L.push(`ส่วนลด: -${(promoDiscount + manualDiscount).toLocaleString()} บาท`);
    L.push(`ยอดสุทธิ: ${total.toLocaleString()} บาท`);
    if (mode === "deposit" && depositAmount > 0) {
      L.push(`มัดจำที่ต้องโอน: ${depositAmount.toLocaleString()} บาท`);
      L.push(`ยอดคงเหลือ (ชำระก่อนเข้าพัก): ${remaining.toLocaleString()} บาท`);
    }
    if (mode === "full") L.push(`ยอดที่ต้องโอน: ${total.toLocaleString()} บาท`);
    if (mode !== "booking" && pay.accountNumber) {
      L.push("");
      L.push("— โอนเงิน —");
      L.push(pay.bankName);
      L.push(`เลขบัญชี: ${pay.accountNumber}`);
      L.push(`ชื่อบัญชี: ${pay.accountName}`);
    }
    return L.join("\n");
  };

  const buildSummaryPayload = (mode: "booking" | "deposit" | "full") => {
    const catName = selected?.cats[0]?.name || "น้อง";
    const title =
      mode === "deposit"
        ? billMsg.summaryDepositTitle
        : mode === "full"
          ? billMsg.summaryFullTitle
          : billMsg.summaryBookingTitle;
    const bk = bookings.find((b) => b.id === bookingId);
    const scheduleText = scheduleLabelFor(bk) || undefined;
    return {
      mode,
      title,
      closing: "",
      customerName: selected?.name || "",
      catName,
      scheduleText,
      items: lines
        .filter((l) => l.label.trim())
        .map((l) => ({ label: l.label, amount: l.amount })),
      subtotal,
      discount: promoDiscount + manualDiscount,
      total,
      deposit: mode === "deposit" ? depositAmount : 0,
      remaining: mode === "deposit" ? remaining : 0,
      bankName: pay.bankName,
      accountNumber: pay.accountNumber,
      accountName: pay.accountName,
    };
  };

  const sendSummaryLine = async (mode: "booking" | "deposit" | "full") => {
    if (!selected) return;
    if (!selected.lineUserId) return toast("ลูกค้ายังไม่ได้ผูก LINE — ส่งไม่ได้", "error");
    setSending(true);
    const res = await fetch("/api/line/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lineUserId: selected.lineUserId,
        summary: buildSummaryPayload(mode),
        text: buildSummary(mode),
      }),
    });
    setSending(false);
    toast(res.ok ? "ส่งการ์ดเข้า LINE ลูกค้าแล้ว 📨" : "ส่งไม่สำเร็จ", res.ok ? "success" : "error");
  };

  const copySummary = async (mode: "booking" | "deposit" | "full") => {
    try {
      await navigator.clipboard.writeText(buildSummary(mode));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("ก๊อปไม่สำเร็จ", "error");
    }
  };

  const filtered =
    search.trim().length === 0
      ? customers.slice(0, 8)
      : customers
          .filter((c) => {
            const q = search.toLowerCase();
            return (
              c.name.toLowerCase().includes(q) ||
              (c.phone || "").includes(q) ||
              c.cats.some((cat) => cat.name.toLowerCase().includes(q))
            );
          })
          .slice(0, 8);

  const pickCustomer = async (c: Customer) => {
    setCustomerId(c.id);
    // บรรทัดอาบน้ำเริ่มต้นที่ยังไม่มีใครแตะ → เลือกขน/ไซส์ตามน้อง (บ้านที่มีตัวเดียว)
    setItems((prev) => {
      const first = prev[0];
      const def = newGrooming(undefined, groomPrograms);
      const untouched =
        prev.length === 1 &&
        first.kind === "grooming" &&
        !first.catName &&
        first.priceOverride === undefined &&
        first.program === def.program &&
        first.breed === def.breed &&
        first.size === def.size;
      return untouched ? [prefillGroom(first, c)] : prev;
    });
    setSearch(c.name);
    setShowList(false);
    setPromoId("");
    setAutoPromoLabel("");
    try {
      const res = await fetch(`/api/promos?autoFor=${c.id}&subtotal=${subtotal}`);
      const { promo } = await res.json();
      if (promo) {
        setPromoId(promo.id);
        setAutoPromoLabel(promo.label);
      }
    } catch {
      /* ไม่มีโปรก็ข้าม */
    }
  };

  const clearCustomer = () => {
    setCustomerId("");
    setSearch("");
    setPromoId("");
    setAutoPromoLabel("");
    setBookingId(undefined);
    setShowList(true);
  };

  const nightsBetween = (ci?: string, co?: string) => {
    if (!ci || !co) return 1;
    const a = new Date(ci).getTime();
    const b = new Date(co).getTime();
    const n = Math.round((b - a) / 86400000);
    return n > 0 ? n : 1;
  };

  /**
   * ดึงนัดมาออกบิล — บ้านเดียวกัน วันเดียวกัน ออกเป็นบิลใบเดียว
   * (แมวแต่ละตัวเป็นคนละแถวในระบบ แต่เจ้าของคนเดียว จ่ายทีเดียว)
   */
  const pickBooking = async (group: Booking[]) => {
    const bk = group[0];
    setBookingId(bk.id);
    setShowBookings(false);
    const cust = customers.find((c) => c.id === bk.customerId);
    if (cust) await pickCustomer(cust);
    else setSearch(bk.customerName);

    // นัดนี้เคยออกบิลไปแล้วหรือยัง — 1 นัดออกได้แค่ 1 บิลเท่านั้น
    // มีบิลค้างอยู่แล้ว → เปิดมาแก้ไขบิลเดิมแทนสร้างซ้ำ, จ่ายจบแล้ว → ห้ามออกซ้ำ
    // เช็คทุกตัวในกลุ่ม เพราะบิลเก่าอาจผูกกับตัวไหนก็ได้
    const ids = new Set(group.map((g) => g.id));
    const matches = invoices.filter((i) => i.bookingId && ids.has(i.bookingId));
    const existing = matches.find((i) => i.status !== "paid") || matches[0];
    if (existing) {
      if (existing.status === "paid") {
        toast(
          "นัดนี้ออกบิลและชำระแล้ว — ถ้าลูกค้าอยู่ต่อ ให้แก้ \"วันออก\" ที่นัด ระบบจะออกบิลพักต่อเฉพาะคืนที่เพิ่มให้เอง",
          "error"
        );
        return;
      }
      toast("นัดนี้มีบิลค้างอยู่แล้ว — เปิดมาแก้ไขบิลเดิมให้แทน", "info");
      editInvoice(existing);
      return;
    }

    // ตั้งชื่อน้องให้แต่ละบรรทัดเมื่อมาหลายตัว จะได้รู้ว่าตัวไหนใช้บริการอะไร
    const many = new Set(group.map((g) => g.catName)).size > 1;
    // อาบน้ำก่อนกลับ = อยู่ในกลุ่มเดียวกับการเข้าพัก → บิลเดียว: บรรทัดห้อง + บรรทัดอาบน้ำ
    const groomLines = (list: Booking[]): Item[] =>
      list.map((g) =>
        prefillGroom(
          { ...newGrooming(g.groomProgram, groomPrograms), catName: many ? g.catName : undefined },
          cust,
          g.catName,
          !!g.groomProgram
        )
      );
    const stayPart = group.filter((g) => g.service === "room");
    if (stayPart.length > 0) {
      // คิดค่าห้องเป็นรายห้อง ไม่ใช่รายตัว: น้องที่อยู่ห้องเดียวกันรวมเป็นบรรทัดเดียว
      // ห้องที่ล็อกเลขไว้ = ห้องตามเลขนั้น · ไม่ได้ล็อก = จัดเต็มห้องละ cap ตัวตามที่ระบบจัดห้องทำ
      const units = new Map<string, Booking[]>();
      for (const g of stayPart) {
        const k = `${g.room || ""}#${g.roomUnit ?? "auto"}`;
        units.set(k, [...(units.get(k) || []), g]);
      }
      const lines: Booking[][] = [];
      for (const [k, cats] of units) {
        const matched = rooms.find((r) => cats[0].room && r.id === cats[0].room);
        const cap = k.endsWith("#auto") ? matched?.pricing.cap || 1 : cats.length;
        for (let i = 0; i < cats.length; i += cap) lines.push(cats.slice(i, i + cap));
      }
      setItems([
        ...lines.map((cats): Item => {
          const g = cats[0];
          // นัดเก็บ room เป็น id → จับคู่กับ id ก่อน แล้วค่อย fallback เป็นชื่อ
          const matched =
            rooms.find((r) => g.room && r.id === g.room) ||
            rooms.find((r) => g.room && r.label.includes(g.room));
          const price = matched?.amount ?? rooms[0]?.amount ?? 0;
          const n = cats.length;
          return {
            ...newGrooming(undefined, groomPrograms),
            kind: "room" as const,
            // ต้องตรงกับตัวเลือกห้องในบิล (ไม่ต่อท้ายอะไร) — ตัวไหนอยู่ห้องนี้ดูจากชิปชื่อน้อง
            roomLabel: matched?.label || rooms[0]?.label || (g.room ? `ห้อง ${g.room}` : "ห้องพัก"),
            roomPrice: matched ? roomNightPrice(price, matched.pricing, n) : price,
            nights: nightsBetween(g.checkin, g.checkout),
            catName: many ? cats.map((c) => c.catName).join(", ") : undefined,
          };
        }),
        ...groomLines(group.filter((g) => g.service === "groom")),
      ]);
    } else {
      setItems(groomLines(group));
    }
    if (many) {
      toast(`ดึงนัดบ้านนี้มาแล้ว ${new Set(group.map((g) => g.catName)).size} ตัว — ออกบิลใบเดียว 🧾`, "success");
    }
  };

  /** ราคาเก่าที่พนักงานกด "ใช้ราคาปกติ" ไปแล้ว — อย่าถามซ้ำในบิลใบเดียวกัน */
  const [dismissedRecalls, setDismissedRecalls] = useState<Set<string>>(new Set());
  const dismissRecall = (sig: string) =>
    setDismissedRecalls((prev) => new Set(prev).add(sig));

  /**
   * เลือก ขน/ไซส์ (และโปรแกรม) ให้บรรทัดอาบน้ำตามที่น้องตัวนี้เคยอาบครั้งล่าสุด
   * ยังไม่เคยมา → เดาจากการ์ดน้อง (พันธุ์/ขนสั้น-ยาว/น้ำหนัก) · ดู pet-groom-memory.ts
   * petName ว่าง = บ้านที่มีน้องตัวเดียว
   */
  const prefillGroom = (
    item: Item,
    cust: Customer | undefined,
    petName?: string,
    keepProgram = false
  ): Item => {
    if (item.kind !== "grooming" || !cust) return item;
    const pet = petName
      ? cust.cats.find((c) => catKey(c.name) === catKey(petName))
      : cust.cats.length === 1
        ? cust.cats[0]
        : undefined;
    if (!pet) return item;
    const pf = groomPrefillForPet({
      invoices,
      pet,
      onlyPet: cust.cats.length === 1,
      customerId: cust.id,
      programs: groomPrograms,
      sizeLabels: groomSizeLabels,
      currentProgram: item.program,
      keepProgram,
    });
    if (!pf) return item;
    return {
      ...item,
      program: pf.program ?? item.program,
      breed: pf.breed ?? item.breed,
      size: pf.size ?? item.size,
    };
  };

  /** ตั้งราคาต่อหน่วยของรายการ — ตรงกับราคากลางก็ล้าง override ทิ้ง
   *  ไม่งั้นบิลจะค้างราคาที่ "เท่าราคาปกติพอดี" ไว้ แล้วขึ้นป้ายราคาพิเศษหลอกตา */
  const setUnitPrice = (idx: number, n: number) => {
    const it = items[idx];
    if (!it) return;
    const std = standardUnitPrice(it, groomPrograms);
    if (it.kind === "service" || it.kind === "custom" || it.kind === "package" || it.kind === "product") {
      // สามอย่างนี้ราคาอยู่ในช่อง amount อยู่แล้ว แก้ตรงนั้นตรงไปตรงมากว่า
      updateItem(idx, { amount: n, priceOverride: undefined });
      return;
    }
    updateItem(idx, { priceOverride: n === std ? undefined : n });
  };

  const updateItem = (idx: number, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const changeKind = (idx: number, kind: ItemKind) => {
    // เลือกจาก dropdown นี้ได้เฉพาะ kind ที่พิมพ์เอง (ไม่มี "product" เป็นตัวเลือก) —
    // ต้องล้าง productId เสมอ ไม่งั้นเปลี่ยนจากสินค้าไปเป็นรายการอื่นแล้วจะยังไปตัดสต็อกสินค้าเดิมตอนบันทึกบิล
    let patch: Partial<Item> = { kind, productId: undefined };
    if (kind === "grooming") {
      const prog = groomPrograms[0];
      patch = { kind, program: prog.id, breed: prog.breeds[0].breed, size: "m" };
    } else if (kind === "room") {
      patch = {
        kind,
        roomLabel: rooms[0]?.label || "",
        roomPrice: rooms[0]?.amount || 0,
        nights: 1,
      };
    } else if (kind === "service") {
      patch = { kind, label: servicePresets[0]?.label || "", amount: servicePresets[0]?.amount || 0 };
    } else if (kind === "product") {
      const p = posProducts[0];
      patch = { kind, productId: p?.id, label: p?.name || "", amount: p?.price || 0 };
    } else if (kind === "freebie") {
      patch = { kind, label: freebiePresets[0] || "", amount: 0 };
    } else {
      patch = { kind, label: "", amount: 0 };
    }
    // เปลี่ยนประเภทแล้ว ไม่ใช่บรรทัดค่าห้องจากบิลเดิมอีกต่อไป
    updateItem(idx, { ...patch, roomLine: undefined });
  };

  const changeProgram = (idx: number, program: string) => {
    const prog = groomProgram(program, groomPrograms);
    updateItem(idx, { program, breed: prog?.breeds[0].breed || "" });
  };

  const removeItem = (idx: number) =>
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));

  /** แตะสินค้าจากกริด — มีอยู่แล้วในบิลก็บวก qty ต่อ ไม่มีก็เพิ่มบรรทัดใหม่ (บรรทัดว่างเริ่มต้นถูกกรองทิ้งตอนส่งอยู่แล้ว) */
  const addProduct = (p: { id: string; name: string; price: number }) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.kind === "product" && it.productId === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: (next[idx].qty || 1) + 1 };
        return next;
      }
      return [
        ...prev,
        { ...newGrooming(undefined, groomPrograms), kind: "product", productId: p.id, label: p.name, amount: p.price, qty: 1 },
      ];
    });
    toast(`เพิ่ม ${p.name} แล้ว — แตะสินค้าอื่นต่อได้เลย`, "success");
  };

  const resetForm = () => {
    // ยังอยู่โหมดขายเร็วต่อ (ขายของหน้าร้านหลายเจ้าติดกัน) — เริ่มบิลถัดไปด้วยตะกร้าว่าง
    // ไม่งั้นแถวอาบน้ำเริ่มต้น 450฿ จะโผล่มาอีกทุกครั้งทั้งที่ไม่มีใครตั้งใจขาย
    setItems(quickSale ? [] : [newGrooming(undefined, groomPrograms)]);
    setDiscount("");
    setDiscountMode("baht");
    setLinePromoId("");
    setBillDeposit("");
    setBillDepPct(null);
    setBookingId(undefined);
    setEditingId(null);
  };

  const createBill = async () => {
    let cust = selected;
    // แก้ไขบิลเดิมไม่ต้องมีลูกค้าตอนนี้ (customerId ผูกไว้ตั้งแต่ตอนเปิดแก้ไขแล้ว)
    // บิลใหม่ที่ไม่ได้เลือกลูกค้า ต้องเปิดโหมด "ขายเร็ว" ก่อน ไม่งั้นบังคับให้เลือกเหมือนเดิม
    if (!editingId && !cust) {
      if (!quickSale) return toast("เลือกลูกค้าก่อน", "error");
      setCreating(true);
      const wRes = await fetch("/api/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_or_create_walkin" }),
      });
      const wData = await wRes.json().catch(() => ({}));
      if (!wData.ok) {
        setCreating(false);
        return toast("สร้างลูกค้าขายเร็วไม่สำเร็จ", "error");
      }
      cust = wData.customer;
    }
    if (subtotal <= 0) return toast("ใส่รายการอย่างน้อย 1 อย่าง", "error");
    setCreating(true);
    // ชื่อน้องของบิล = ตัวที่ติ๊กไว้ในรายการ (ตัวที่มาจริง)
    // ไม่ใช่แมวตัวแรกของบ้าน — บ้านมี 3 ตัวแต่มา 2 ตัว ต้องไม่มีชื่อตัวที่ไม่ได้มา
    const billedCatNames = Array.from(
      new Set(items.flatMap((it) => parseCatNames(it.catName)))
    );
    const cat =
      billedCatNames.join(CAT_SEP) || cust?.cats[0]?.name || "น้อง";
    // เก็บของแถม (ฟรี) ด้วย — label มี แต่ยอด 0
    // โปรแกรมอาบน้ำติดไปกับรายการ — ให้เซิร์ฟเวอร์เช็คคอร์สที่ผูกโปรแกรมได้
    const payloadItems = items
      .map((it, i) => ({
        ...lines[i],
        kind: it.roomLine ? ("room" as const) : it.kind,
        ...(it.kind === "grooming" ? { program: it.program, breed: it.breed, size: it.size } : {}),
        ...(it.kind === "product" && it.productId ? { productId: it.productId } : {}),
      }))
      .filter((l) => l.label.trim());

    if (editingId) {
      // แก้ไขบิลเดิม
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          action: "update",
          items: payloadItems,
          extraDiscount: manualDiscount || undefined,
          deposit: depositAmount || 0,
          promoId: promoId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setCreating(false);
      if (res.ok) {
        savedPopup("แก้ไขบิลแล้ว");
        resetForm();
        load();
      } else {
        toast(
          data.error === "already_paid"
            ? "บิลปิดแล้ว แก้ไขไม่ได้"
            : data.error === "out_of_stock"
              ? `สต็อกไม่พอ: ${data.message || ""}`
              : "แก้ไขไม่สำเร็จ",
          "error"
        );
      }
      return;
    }

    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        customerId: cust!.id,
        lineUserId: cust!.lineUserId,
        customerName: cust!.name,
        catName: cat,
        items: payloadItems,
        promoId: promoId || undefined,
        // ยอดคูปองไม่ส่งไปเป็นตัวเลขแล้ว — เซิร์ฟเวอร์คิดจากคูปองจริงเองผ่าน couponId
        // (กันหน้าเว็บโดนแก้ค่าแล้วส่งยอดลดมาเอง)
        extraDiscount: (manualDiscount + packageCovers) || undefined,
        deposit: depositAmount || undefined,
        bookingId: bookingId || undefined,
        couponId: couponId || undefined,
        packageId: packageId || undefined,
        packageUnits: packageUnitsToUse || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCreating(false);
      toast(data.error || "ออกบิลไม่สำเร็จ", "error");
      return;
    }
    setCreating(false);
    if (data.invoice) {
      savedPopup(`ออกบิลแล้ว ${Number(data.invoice.total).toLocaleString()} บาท`, [
        depositAmount > 0 ? `มัดจำ ${depositAmount} · คงเหลือ ${remaining}` : "",
      ]);
      resetForm();
      load();
    } else {
      toast("ออกบิลไม่สำเร็จ", "error");
    }
  };

  const editInvoice = (inv: Invoice) => {
    if (inv.status === "paid") return toast("บิลปิดแล้ว แก้ไขไม่ได้ (ลบได้อย่างเดียว)", "error");
    if (inv.customerId) setCustomerId(inv.customerId);
    // โหลดรายการเป็นแบบ "พิมพ์เอง" (แก้ยอด/ชื่อได้) — เก็บของแถมฟรีด้วย
    setItems(
      (inv.items || []).map((raw) => {
        // ส่วนลดเฉพาะรายการ: ถอดป้าย "(ส่วนลด …)" ออกจากชื่อ แล้วคิดจากราคาก่อนลด
        // ช่อง "ลดเฉพาะรายการนี้" จะโหลดกลับมาให้ด้านล่าง (เมื่อก่อนหายตอนเปิดแก้บิล)
        const it = {
          ...raw,
          label: stripDiscountTag(raw.label),
          amount:
            raw.unitAmount !== undefined
              ? raw.unitAmount * Math.max(1, Math.round(raw.qty || 1))
              : raw.amount,
        };
        const qty = Math.max(1, Math.round(it.qty || 1));
        if (it.amount > 0 && isRoomLine(it)) {
          const { base, note } = splitRoomLabel(it.label.replace(/^🐱 .+? · /, ""));
          return {
            ...newGrooming(undefined, groomPrograms),
            kind: "custom" as const,
            label: base,
            roomLine: { note: note || undefined },
            catName: it.catName,
            qty,
            amount: it.unitAmount ?? Math.round(it.amount / qty),
          };
        }
        if (it.kind === "product" && it.productId) {
          return {
            ...newGrooming(undefined, groomPrograms),
            kind: "product" as const,
            productId: it.productId,
            label: it.label.replace(/^🐱 .+? · /, "").replace(/ × \d+$/, ""),
            catName: it.catName,
            qty,
            amount: it.unitAmount ?? Math.round(it.amount / qty),
          };
        }
        return {
          ...newGrooming(undefined, groomPrograms),
          kind: it.amount > 0 ? ("custom" as const) : ("freebie" as const),
          // ถอดคำนำหน้าชื่อน้อง/ตัวคูณออก แล้วเก็บกลับเป็นฟิลด์ — กันชื่อน้องซ้อนกันตอนบันทึกใหม่
          label: it.label
            .replace(/^🐱 .+? · /, "")
            .replace(/ × \d+$/, "")
            .replace(/^🎁 /, "")
            .replace(/ \(ฟรี\)$/, ""),
          catName: it.catName,
          qty,
          // ช่องราคาของรายการ "พิมพ์เอง" คือราคาต่อหน่วย
          amount: it.unitAmount ?? Math.round(it.amount / qty),
        };
      }).map((item, k) => {
        const raw = inv.items![k];
        if (raw.discountPercent)
          return {
            ...item,
            discount: raw.discountPercent,
            discountMode: "percent" as const,
            discountName: raw.discountName,
          };
        // บิลเก่าไม่มีฟิลด์ส่วนลด → ถอดจากส่วนต่างราคาเต็มกับยอดจริง
        const off =
          raw.discount ??
          (raw.unitAmount !== undefined
            ? raw.unitAmount * Math.max(1, Math.round(raw.qty || 1)) - raw.amount
            : 0);
        return off > 0 && item.kind !== "freebie"
          ? { ...item, discount: off, discountMode: "baht" as const }
          : item;
      })
    );
    setBillDeposit(inv.deposit ? String(inv.deposit) : "");
    setBillDepPct(null);
    setDiscount("");
    setLinePromoId(""); // ส่วนลดจากโปรเดิมโหลดกลับมาเป็นส่วนลดของแต่ละรายการแล้ว
    setEditingId(inv.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /**
   * ผูกบิลเข้ากับนัดด้วยมือ — ใช้ตอนบิลไม่มีนัดผูกอยู่ (เช่นบิลเก่า/พิมพ์เองไม่ได้ดึงจากนัด)
   * ปุ่มส่งการ์ดที่ต้องอิงนัด (แจ้งเตือนนัด/ส่งชุดการ์ด) จะกลับมาใช้ได้หลังผูกแล้ว
   */
  const linkInvoiceToBooking = async (invId: string, bookingId: string) => {
    setInvoiceBusy(`${invId}:link_booking`);
    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: invId, action: "link_booking", bookingId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast("ผูกนัดให้บิลแล้ว — ปุ่มส่งการ์ดกลับมาแล้ว 🔗", "success");
        load();
      } else if (data.error === "customer_mismatch") {
        toast("นัดนี้เป็นของลูกค้าคนอื่น — ผูกไม่ได้ (กันส่งการ์ดผิดคน)", "error");
      } else {
        toast("ผูกนัดไม่สำเร็จ", "error");
      }
    } finally {
      setInvoiceBusy("");
    }
  };

  const invoiceAction = async (
    id: string,
    action: string,
    okMsg: string,
    confirmMsg?: string
  ) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setInvoiceBusy(`${id}:${action}`);
    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast(okMsg, "success");
        if (editingId === id) resetForm();
        load();
      } else {
        toast(
          data.error === "already_received"
            ? "รับมัดจำบิลนี้ไปแล้ว"
            : data.error === "already_credited"
              ? "บิลนี้โยกเป็นเครดิตไปแล้ว"
              : "ไม่สำเร็จ",
          "error"
        );
      }
    } finally {
      setInvoiceBusy("");
    }
  };

  /** บิลที่กำลังจะตัดเครดิต — โชว์สรุปให้ดูก่อนว่าหักเท่าไหร่ เหลือเท่าไหร่ */
  const [confirmCredit, setConfirmCredit] = useState<Invoice | null>(null);

  const CreditConfirmModal = () => {
    if (!confirmCredit) return null;
    const inv = confirmCredit;
    const cust = customers.find((c) => c.id === inv.customerId);
    const balance = cust?.memberCredit ?? 0;
    const due = Math.max(0, inv.total - receivedOf(inv));
    const after = balance - due;
    const short = after < 0;
    return (
      <div
        className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center"
        onClick={() => setConfirmCredit(null)}
      >
        <div
          className="w-full max-w-sm rounded-petflow bg-card p-4 shadow-petflow"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-3 flex items-center justify-center gap-1.5 text-center text-sm font-extrabold text-petflow-chocolate">
            <Icon name="card" size={18} />
            ตัดจากเครดิต Member
          </p>
          <div className="space-y-1.5 rounded-petflow-sm bg-paper px-3 py-2.5 text-xs">
            <div className="flex justify-between">
              <span className="text-brown-soft">ยอดที่ต้องเก็บ</span>
              <span className="font-bold text-brown">{due.toLocaleString()} ฿</span>
            </div>
            <div className="flex justify-between">
              <span className="text-brown-soft">เครดิตคงเหลือตอนนี้</span>
              <span className="font-bold text-brown">{balance.toLocaleString()} ฿</span>
            </div>
            <div className="flex justify-between border-t border-petflow-line pt-1.5">
              <span className="font-bold text-brown-soft">หลังหัก จะเหลือ</span>
              <span
                className={`font-extrabold ${short ? "text-red-600" : "text-ok"}`}
              >
                {after.toLocaleString()} ฿
              </span>
            </div>
          </div>
          {short && (
            <p className="mt-2 flex items-start gap-2 rounded-petflow-sm bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">
              <Icon name="alert" size={16} />
              เครดิตไม่พอ ขาดอีก {Math.abs(after).toLocaleString()} ฿ —
              เติมเครดิตก่อน หรือเก็บเป็นเงินสด/โอนแทน
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmCredit(null)}
              className="min-h-[44px] flex-1 rounded-petflow-sm bg-paper py-3 text-sm font-bold text-brown-soft"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={short || !!invoiceBusy}
              onClick={() => {
                const id = inv.id;
                setConfirmCredit(null);
                markPaid(id, "member_credit");
              }}
              className="min-h-[44px] flex-1 rounded-petflow-sm bg-gradient-to-r from-honey to-honey-deep py-3 text-sm font-extrabold text-petflow-chocolate disabled:opacity-40"
            >
              ยืนยันตัดเครดิต
            </button>
          </div>
        </div>
      </div>
    );
  };

  const markPaid = async (
    id: string,
    method: "transfer" | "member_credit" | "cash"
  ) => {
    // กันกดรัว — ปุ่มนี้เมื่อก่อนไม่มีตัวล็อก กดสองทีเสี่ยงลงบัญชีซ้ำ
    if (invoiceBusy) return;
    setInvoiceBusy(`${id}:mark_paid`);
    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "mark_paid", paymentMethod: method }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // ปุ่มนี้เป็นแค่สถานะหลังบ้าน — ไม่ส่งอะไรหาลูกค้า ต้องบอกให้ร้านรู้ว่าใบเสร็จต้องกดส่งเอง
        toast("รับเงินแล้ว — ลงบัญชี + แต้ม ✅ (ใบเสร็จกดส่งเองที่ปุ่ม ส่ง LINE)", "success");
        load();
      } else if (data.error === "insufficient_credit") {
        toast("เครดิต Member ไม่พอ", "error");
      } else if (data.error === "invalid" || data.error === "already_paid") {
        toast("บิลนี้ปิดไปแล้ว (อาจกดซ้ำ) — รีเฟรชให้แล้วนะคะ", "error");
        load();
      } else {
        toast("ไม่สำเร็จ", "error");
      }
    } finally {
      setInvoiceBusy("");
    }
  };

  /**
   * รับเงินบางส่วน — ลูกค้าพักยาว/ต่อคืน จ่ายเป็นงวด ลงรายรับตามวันที่รับจริง บิลยังเปิดอยู่
   * งวดที่ทำให้จ่ายครบ จะปิดบิลต่อให้เลย (ตอนปิดเก็บแค่ยอดที่ยังค้าง = 0 ไม่ลงบัญชีซ้ำ)
   */
  const receivePartial = async (inv: Invoice) => {
    if (invoiceBusy) return;
    const remaining = Math.max(0, inv.total - receivedOf(inv));
    const raw = prompt(
      `รับมัดจำ / บางส่วน — ${inv.customerName}\nยอดบิล ${inv.total.toLocaleString()} · ค้างอยู่ ${remaining.toLocaleString()} บาท\n\nรับรอบนี้กี่บาท?`,
      ""
    );
    if (raw == null) return;
    const amount = Math.round(Number(raw.replace(/[,\s฿]/g, "")) || 0);
    if (amount <= 0) {
      toast("ใส่จำนวนเงินให้ถูกนะ", "error");
      return;
    }
    const method: "transfer" | "cash" = confirm("รับเป็นเงินสดใช่ไหม?\n(ตกลง = เงินสด · ยกเลิก = โอน)")
      ? "cash"
      : "transfer";
    setInvoiceBusy(`${inv.id}:receive_payment`);
    let fullyPaid = false;
    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: inv.id, action: "receive_payment", amount, paymentMethod: method }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        fullyPaid = !!data.fullyPaid;
        toast(
          fullyPaid
            ? "รับครบแล้ว — กำลังปิดบิล"
            : `รับแล้ว ${amount.toLocaleString()} · ค้างอีก ${Number(data.remaining).toLocaleString()} บาท`,
          "success"
        );
      } else if (data.error === "over_due") {
        toast(`เกินยอดที่ค้าง — ค้างอยู่ ${Number(data.due).toLocaleString()} บาท`, "error");
      } else if (data.error === "nothing_due") {
        toast("บิลนี้ไม่มียอดค้างแล้ว — กดปิดบิลได้เลย", "info");
      } else {
        toast("ไม่สำเร็จ", "error");
      }
    } finally {
      setInvoiceBusy("");
    }
    if (fullyPaid) await markPaid(inv.id, method);
    else load();
  };

  /**
   * แผ่นรับชำระ (bottom sheet) — ปุ่มรับเงินทุกแบบของบิลรวมไว้ที่เดียว แทนปุ่มเรียงยาวบนการ์ด
   * แต่ละแถวเรียกฟังก์ชันเดิมทั้งหมด (markPaid / invoiceAction / receivePartial / หัก Member)
   */
  const PaySheet = () => {
    if (!payFor) return null;
    const inv = payFor;
    const hasDep = (inv.deposit ?? 0) > 0;
    const cust = customers.find((c) => c.id === inv.customerId);
    const isMember = !!cust?.isMember;
    // เรียกเก็บมัดจำไว้ก่อนมีบิล (หรือจากการ์ดของน้องอีกตัวในบ้าน) → ไปค้างเป็นเครดิต ดึงเข้าบิลได้เลย ไม่ต้องกรอกยอด
    const pendingCredit = hasDep ? 0 : Math.min(inv.total, cust?.depositCredit ?? 0);
    // มัดจำที่ยังไม่ได้กดรับ ไม่หักออก — ปิดบิลตอนนี้ระบบลงรับเต็มยอดบิล
    const got = receivedOf(inv);
    const due = Math.max(0, inv.total - got);
    const close = () => setPayFor(null);
    const rows: { key: string; icon: string; title: string; sub?: string; run: () => void; when: boolean }[] = [
      {
        key: "apply_deposit_credit",
        icon: "money",
        title: "รับมัดจำแล้ว (ที่เรียกเก็บไว้)",
        sub: `${pendingCredit.toLocaleString()} ฿ · ผูกเข้าบิลนี้ ลงบัญชีให้`,
        when: pendingCredit > 0,
        run: () => invoiceAction(inv.id, "apply_deposit_credit", "รับมัดจำแล้ว 💰"),
      },
      {
        key: "receive_deposit",
        icon: "money",
        title: "รับมัดจำแล้ว",
        sub: `${(inv.deposit || 0).toLocaleString()} ฿ · ลงบัญชี + ส่งการ์ดขอบคุณให้ลูกค้า`,
        when: hasDep && !inv.depositReceivedAt,
        run: () =>
          invoiceAction(
            inv.id,
            "receive_deposit",
            "รับมัดจำแล้ว 💰 (ลงบัญชี + ส่งการ์ดขอบคุณให้ลูกค้า)"
          ),
      },
      {
        key: "transfer",
        icon: "wallet",
        title: got > 0 ? "รับเงินที่เหลือ · โอน (ปิดบิล)" : "รับเต็มจำนวน · โอน (ปิดบิล)",
        sub: `${due.toLocaleString()} ฿ · ปิดบิล ลงบัญชี + แต้ม`,
        when: true,
        run: () => markPaid(inv.id, "transfer"),
      },
      {
        key: "cash",
        icon: "money",
        title: got > 0 ? "รับเงินที่เหลือ · เงินสด (ปิดบิล)" : "รับเต็มจำนวน · เงินสด (ปิดบิล)",
        sub: `${due.toLocaleString()} ฿`,
        when: true,
        run: () => markPaid(inv.id, "cash"),
      },
      {
        key: "member",
        icon: "card",
        title: "หักเครดิต Member",
        sub: "ดูยอดก่อนยืนยัน",
        when: isMember,
        run: () => setConfirmCredit(inv),
      },
      {
        key: "partial",
        icon: "chart",
        // บิลที่ยังไม่ได้ตั้งมัดจำ ใช้แถวนี้ "รับแค่มัดจำ" ได้เลย (ใส่ยอดเอง บิลยังเปิดอยู่)
        title: hasDep ? "รับเงินบางส่วน" : "รับแค่มัดจำ / บางส่วน",
        sub: "ใส่ยอดเอง · บิลยังเปิด ค้างที่เหลือไว้เก็บทีหลัง",
        when: true,
        run: () => receivePartial(inv),
      },
    ];
    return (
      <div
        className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-3"
        onClick={close}
      >
        <div
          className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-card px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-petflow sm:rounded-petflow"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-petflow-line sm:hidden" />
          <div className="mb-3 flex items-center gap-3">
            <Avatar name={inv.customerName} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Payment · รับชำระ</p>
              <p className="truncate text-sm font-extrabold text-petflow-chocolate">
                {inv.customerName} · {inv.catName}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-base font-extrabold text-petflow-chocolate">{due.toLocaleString()} ฿</p>
              <p className="text-[10px] text-brown-soft">ยอดค้าง</p>
            </div>
          </div>
          {got > 0 && (
            <div className="mb-3 space-y-1 rounded-petflow-sm bg-paper/60 px-3 py-2 text-xs">
              <div className="flex justify-between text-brown-soft">
                <span>ยอดบิล</span>
                <span>{inv.total.toLocaleString()} ฿</span>
              </div>
              <div className="flex justify-between font-bold text-ok">
                <span>มัดจำ (รับแล้ว)</span>
                <span>−{got.toLocaleString()} ฿</span>
              </div>
              <div className="flex justify-between border-t border-petflow-line pt-1 font-extrabold text-petflow-chocolate">
                <span>รับรอบนี้ให้ครบ</span>
                <span>{due.toLocaleString()} ฿</span>
              </div>
            </div>
          )}
          <ul className="divide-y divide-petflow-line overflow-hidden rounded-petflow-sm border border-petflow-line">
            {rows
              .filter((r) => r.when)
              .map((r) => (
                <li key={r.key}>
                  <button
                    type="button"
                    disabled={!!invoiceBusy}
                    onClick={() => {
                      close();
                      r.run();
                    }}
                    className="flex min-h-[52px] w-full items-center gap-3 px-3 py-2.5 text-left active:bg-paper disabled:opacity-40"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
                      <Icon name={r.icon} size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold text-petflow-chocolate">{r.title}</span>
                      {r.sub && <span className="block truncate text-[11px] text-brown-soft">{r.sub}</span>}
                    </span>
                    <Icon name="chevron" size={16} className="text-brown-faint" />
                  </button>
                </li>
              ))}
          </ul>
          <button
            type="button"
            onClick={close}
            className="mt-3 min-h-[44px] w-full rounded-petflow-sm bg-paper text-sm font-bold text-brown-soft"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    );
  };

  const sub = "w-full rounded-lg border border-petflow-line bg-paper px-3 py-2 text-sm";
  const field =
    "w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm";

  return (
    <div>
      <CreditConfirmModal />
      <PaySheet />
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Billing</p>
          <h1 className="text-lg font-extrabold text-petflow-chocolate">
            {editingId ? "แก้ไขบิล" : "คิดเงิน · ออกบิล"}
          </h1>
        </div>
        {/* เรียกดูใบเสร็จ / ใบกำกับภาษี / ใบเสนอราคา ที่เคยออกไปแล้ว */}
        <a
          href="/admin/billing/docs"
          className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border border-petflow-line bg-card px-3.5 text-xs font-extrabold text-petflow-chocolate shadow-petflow-sm"
        >
          <Icon name="doc" size={15} />
          เอกสารที่ออกแล้ว
        </a>
      </div>
      {tabs}

      <div className="mb-6 space-y-5 rounded-petflow bg-card p-4 shadow-petflow-sm">
        {/* ── ดึงจากนัด ── */}
        {bookings.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowBookings((v) => !v)}
              className="flex min-h-[48px] w-full items-center gap-3 rounded-petflow-sm border border-latte/50 bg-latte/10 px-3 py-2 text-left"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-latte/30 text-petflow-chocolate">
                <Icon name="calendar" size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-petflow-chocolate">ดึงจากนัด</span>
                <span className="block text-[11px] text-brown-soft">
                  {bookingGroups.length} นัดที่ยังไม่ได้ออกบิล
                </span>
              </span>
              <Icon
                name="chevron"
                size={16}
                className={`text-brown-faint transition ${showBookings ? "rotate-90" : ""}`}
              />
            </button>
            {showBookings && (
              <ul className="mt-2 max-h-72 divide-y divide-petflow-line overflow-y-auto rounded-petflow-sm border border-petflow-line bg-card">
                {bookingGroups.length === 0 && (
                  <li>
                    <EmptyState icon="calendar" title="ไม่มีนัดค้างออกบิล" />
                  </li>
                )}
                {bookingGroups.map((group) => {
                  const bk = group[0];
                  const cats = new Set(group.map((g) => g.catName)).size;
                  const withBath = bk.service === "room" && group.some((g) => g.service === "groom");
                  return (
                    <li key={group.map((g) => g.id).join(",")}>
                      <button
                        type="button"
                        onClick={() => pickBooking(group)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-paper"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
                          <Icon name={bk.service === "room" ? "bed" : "bath"} size={20} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-bold text-petflow-chocolate">
                              {groupCatNames(group)} · {bk.customerName}
                            </span>
                            {cats > 1 && (
                              <span className="shrink-0 rounded-full bg-latte/25 px-1.5 py-px text-[10px] font-extrabold text-latte-deep">
                                {cats} ตัว
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-[11px] text-brown-soft">
                            {bk.service === "room"
                              ? `${bk.checkin || "?"} → ${bk.checkout || "?"}${bk.room ? ` · ${bk.room}` : ""}`
                              : bk.date || ""}
                            {withBath ? " · + อาบน้ำก่อนกลับ" : ""}
                            {group.length > 1 ? " · บิลใบเดียว" : ""}
                          </span>
                        </span>
                        <Icon name="chevron" size={16} className="text-brown-faint" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* ── ค้นหาลูกค้า (แบบเดียวกับหน้าจองคิว) ── */}
        <section>
          <SectionLabel>Customer · ลูกค้า</SectionLabel>
          {selected ? (
            <div className="rounded-petflow-sm border border-honey/60 bg-honey/10 px-3 py-3">
              <div className="flex items-center gap-3">
                <Avatar name={selected.name} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-extrabold text-petflow-chocolate">{selected.name}</span>
                    {selected.isMember && (
                      <span className="shrink-0 rounded-full bg-honey/50 px-1.5 py-px text-[9px] font-extrabold text-petflow-chocolate">
                        MEMBER {selected.memberCredit.toLocaleString()}฿
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-brown-soft">
                    {[
                      selected.cats.map((c) => c.name).join(", ") || "—",
                      selected.lineUserId ? "LINE ✓" : "ยังไม่ผูก LINE",
                    ].join(" · ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearCustomer}
                  className="min-h-[40px] shrink-0 rounded-full bg-card px-3.5 text-xs font-bold text-latte-deep shadow-petflow-sm"
                >
                  เปลี่ยน
                </button>
              </div>
              {(selected.depositCredit ?? 0) > 0 && (
                <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-ok/10 px-2.5 py-1.5 text-[11px] font-bold text-ok">
                  <Icon name="money" size={14} />
                  มีเครดิตมัดจำล่วงหน้า {selected.depositCredit!.toLocaleString()} บาท — ออกบิลนี้จะหักให้อัตโนมัติ
                </p>
              )}
            </div>
          ) : quickSale ? (
            <div className="flex items-center justify-between gap-2 rounded-petflow-sm border border-honey-deep/50 bg-honey/15 px-3 py-2">
              <span className="text-sm font-bold text-petflow-chocolate">
                ⚡ ขายเร็ว ไม่ระบุลูกค้า — ขายสินค้าหน้าร้านอย่างเดียวได้เลย
              </span>
              <button
                type="button"
                onClick={() => {
                  setQuickSale(false);
                  // กลับไปโหมดปกติ (มีลูกค้า/นัด) — คืนแถวอาบน้ำเริ่มต้นให้เหมือนเดิม
                  setItems([newGrooming(undefined, groomPrograms)]);
                }}
                className="shrink-0 text-xs font-bold text-wait"
              >
                ✕ เปลี่ยน
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setQuickSale(true);
                  // ขายเร็วมักเป็นบิลซื้อสินค้าล้วนๆ ไม่มีอาบน้ำ — ล้างแถวอาบน้ำเริ่มต้นทิ้ง
                  // ไม่งั้นค้างเป็นรายการ 450฿ ที่ไม่มีใครตั้งใจขาย ติดไปในบิลโดยไม่รู้ตัว
                  setItems([]);
                }}
                className="mb-2 flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-petflow-sm bg-honey/25 py-2 text-xs font-extrabold text-petflow-chocolate"
              >
                <Icon name="sparkle" size={14} />
                ขายเร็ว ไม่ระบุลูกค้า (ขายของหน้าร้านอย่างเดียว)
              </button>
              <SearchField
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setShowList(true);
                }}
                placeholder="ค้นหาชื่อ เบอร์ หรือชื่อน้อง"
              />
              <p className="mb-1 mt-3 px-1 text-[11px] font-bold text-brown-soft">
                {search.trim() ? `ผลการค้นหา ${filtered.length} ราย` : "ลูกค้าล่าสุด"}
              </p>
              <ul className="max-h-80 divide-y divide-petflow-line overflow-y-auto rounded-petflow-sm border border-petflow-line bg-card">
                {filtered.length === 0 ? (
                  <li>
                    <EmptyState icon="users" title="ไม่พบลูกค้า" sub="ลองค้นด้วยเบอร์ หรือชื่อน้อง" />
                  </li>
                ) : (
                  filtered.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => pickCustomer(c)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-paper"
                      >
                        <Avatar name={c.name} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-bold text-petflow-chocolate">{c.name}</span>
                            {c.lineUserId && (
                              <span className="shrink-0 rounded-full bg-ok/15 px-1.5 py-px text-[9px] font-bold text-ok">
                                LINE
                              </span>
                            )}
                            {c.isMember && (
                              <span className="shrink-0 rounded-full bg-honey/40 px-1.5 py-px text-[9px] font-bold text-petflow-chocolate">
                                MEMBER
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-[11px] text-brown-soft">
                            {[
                              c.phone || "ไม่มีเบอร์",
                              c.cats.length ? c.cats.map((cat) => cat.name).join(", ") : "ยังไม่มีน้องในระบบ",
                            ].join(" · ")}
                          </span>
                        </span>
                        <Icon name="chevron" size={16} className="text-brown-faint" />
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </>
          )}
        </section>

        {/* ── รายการ ── */}
        <section>
          <SectionLabel>Items · รายการ</SectionLabel>
          <div className="space-y-3">
            {items.map((item, i) => {
              const line = computeLine(item, groomPrograms, groomSizeLabels);
              const prog = groomProgram(item.program, groomPrograms);
              const stdUnit = standardUnitPrice(item, groomPrograms);
              const isSpecial =
                item.priceOverride !== undefined && item.priceOverride !== stdUnit;
              const sig = priceSignature(line.label);
              // น้องตัวไหน (ตัวเดียว) — ราคา/การอาบครั้งก่อนจะดูของตัวนี้ก่อน ไม่ใช่ของทั้งบ้าน
              const pickedPets = parseCatNames(item.catName);
              const onlyPet = (selected?.cats.length || 0) === 1;
              const petName =
                pickedPets.length === 1 ? pickedPets[0] : onlyPet ? selected?.cats[0].name : undefined;
              const isThisPet = petName
                ? (it: { label: string; catName?: string }) => itemIsForPet(it, petName, onlyPet)
                : undefined;
              // เตือนเฉพาะตอนที่ยังคิดราคาปกติอยู่ และราคาเก่าต่างจากราคาปกติจริงๆ
              const past =
                item.kind === "freebie" || item.priceOverride !== undefined
                  ? null
                  : findLastPrice(invoices, customerId, sig, isThisPet);
              const petLast =
                item.kind === "grooming" && petName
                  ? lastGroomForPet(invoices, petName, onlyPet, customerId)
                  : null;
              const recall =
                past && past.unitAmount !== stdUnit && !dismissedRecalls.has(sig)
                  ? past
                  : null;
              return (
                <div
                  key={i}
                  className="space-y-2.5 rounded-petflow-sm border border-petflow-line bg-paper/40 p-3"
                >
                  <div className="flex items-center gap-2">
                    <select
                      value={item.kind}
                      onChange={(e) => changeKind(i, e.target.value as ItemKind)}
                      className="min-h-[40px] min-w-0 flex-1 rounded-lg border border-petflow-line bg-card px-3 py-2 text-sm font-bold"
                    >
                      {/* รายการสินค้าจากกริดเท่านั้นที่มี kind นี้ — ไม่ให้เลือกเองจาก dropdown
                          (เปลี่ยนจาก dropdown จะล้าง productId ทิ้งเสมอ ดู changeKind) แต่ยังต้อง
                          มี option ไว้โชว์ค่าปัจจุบัน ไม่งั้น select จะโชว์ว่างเปล่า */}
                      {item.kind === "product" && (
                        <option value="product" hidden>
                          🛒 สินค้า
                        </option>
                      )}
                      {KIND_OPTIONS.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-brown-soft active:bg-paper"
                        aria-label="ลบรายการ"
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    )}
                  </div>

                  {/* บ้านที่มีแมวหลายตัว — ระบุว่ารายการนี้ของน้องตัวไหน
                      โชว์เฉพาะตอนที่ลูกค้ามีแมวมากกว่า 1 ตัว จะได้ไม่รกโดยไม่จำเป็น */}
                  {(selected?.cats.length || 0) > 1 && item.kind !== "freebie" && (
                    <div className="rounded-petflow-sm border border-petflow-line bg-paper px-2.5 py-2">
                      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-brown-soft">
                        <Icon name="paw" size={14} />
                        รายการนี้ของน้องตัวไหน — เลือกได้หลายตัว (เช่น นอนห้องเดียวกัน)
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {selected?.cats.map((c) => {
                          const picked = parseCatNames(item.catName);
                          const key = catKey(c.name);
                          const on = picked.some((n) => catKey(n) === key);
                          return (
                            <button
                              key={c.id || c.name}
                              type="button"
                              onClick={() => {
                                const names = on
                                  ? picked.filter((n) => catKey(n) !== key)
                                  : [...picked, c.name];
                                const next = { ...item, catName: joinCatNames(names) };
                                // ห้องพัก: ค่าตัวที่เกินคิด "ต่อคืน" — ติ๊กเพิ่ม/เอาออกแล้วราคาต่อคืนต้องตามจำนวนน้องทันที
                                // (เมื่อก่อนคิดใหม่เฉพาะตอนเปลี่ยนห้อง ร้านต้องพิมพ์ค่าตัวที่เกินเองแล้วกลายเป็นราคาพิเศษ)
                                if (item.kind === "room") {
                                  const r = rooms.find((x) => x.label === item.roomLabel);
                                  if (r) {
                                    next.roomPrice = roomNightPrice(r.amount, r.pricing, Math.max(1, names.length));
                                    if (next.priceOverride === next.roomPrice) next.priceOverride = undefined;
                                  }
                                }
                                // เลือกน้องตัวเดียว → เติมขน/ไซส์ตามที่ตัวนั้นเคยอาบ (โปรแกรมที่เลือกไว้แล้วไม่เปลี่ยน)
                                updateItem(
                                  i,
                                  names.length === 1 && item.priceOverride === undefined
                                    ? prefillGroom(
                                        next,
                                        selected,
                                        names[0],
                                        item.program !== groomPrograms[0]?.id
                                      )
                                    : next
                                );
                              }}
                              className={`flex min-h-[36px] items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${
                                on
                                  ? "bg-latte-deep text-white"
                                  : "bg-card text-brown-soft"
                              }`}
                            >
                              {on && <Icon name="check" size={13} strokeWidth={2.4} />}
                              {c.name}
                            </button>
                          );
                        })}
                      </div>
                      {parseCatNames(item.catName).length === 0 && (
                        <p className="mt-1 text-[10px] text-brown-faint">
                          ไม่ติ๊ก = ไม่ระบุตัว (ใช้ได้ปกติ)
                        </p>
                      )}
                    </div>
                  )}

                  {item.kind === "grooming" && (
                    <>
                      <select
                        value={item.program}
                        onChange={(e) => changeProgram(i, e.target.value)}
                        className={sub}
                      >
                        {groomPrograms.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={item.breed}
                          onChange={(e) => updateItem(i, { breed: e.target.value })}
                          className={sub}
                        >
                          {prog?.breeds.map((b) => (
                            <option key={b.breed} value={b.breed}>
                              {b.breed}
                            </option>
                          ))}
                        </select>
                        <select
                          value={item.size}
                          onChange={(e) =>
                            updateItem(i, { size: e.target.value as GroomSize })
                          }
                          className={sub}
                        >
                          {resolveGroomSizes(groomSizeLabels).map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  {item.kind === "room" && (
                    <div className="flex gap-2">
                      <select
                        value={item.roomLabel}
                        onChange={(e) => {
                          const r = rooms.find((x) => x.label === e.target.value);
                          // ค่าห้องเป็นรายห้อง — นับน้องที่อยู่บรรทัดนี้ เพื่อบวกค่าแมวตัวที่เกิน
                          const n = item.catName ? item.catName.split(",").filter((x) => x.trim()).length : 1;
                          updateItem(i, {
                            roomLabel: e.target.value,
                            roomPrice: r ? roomNightPrice(r.amount, r.pricing, n) : 0,
                          });
                        }}
                        className={`${sub} min-w-0 flex-1`}
                      >
                        {rooms.map((r) => (
                          <option key={r.label} value={r.label}>
                            {r.label} ({r.amount}฿/คืน)
                          </option>
                        ))}
                      </select>
                      <div className="flex shrink-0 items-center gap-1">
                        <NumField
                          value={item.nights || 1}
                          min={1}
                          onCommit={(n) => updateItem(i, { nights: n })}
                          className="w-16 rounded-lg border border-petflow-line bg-paper px-2 py-2 text-center text-sm"
                        />
                        <span className="text-xs font-bold text-brown-soft">คืน</span>
                      </div>
                    </div>
                  )}

                  {item.kind === "service" && (
                    <select
                      value={item.label}
                      onChange={(e) => {
                        const p = servicePresets.find((x) => x.label === e.target.value);
                        updateItem(i, {
                          label: e.target.value,
                          amount: p?.amount ?? item.amount,
                        });
                      }}
                      className={sub}
                    >
                      {servicePresets.map((p) => (
                        <option key={p.label} value={p.label}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  )}

                  {item.kind === "product" &&
                    (posProducts.length === 0 ? (
                      <p className="rounded-lg bg-paper px-3 py-2 text-[11px] text-brown-soft">
                        ยังไม่มีสินค้า เพิ่มได้ที่แท็บ ขายหน้าร้าน › สินค้า
                      </p>
                    ) : (
                      <select
                        value={item.productId || ""}
                        onChange={(e) => {
                          const p = posProducts.find((x) => x.id === e.target.value);
                          if (p) updateItem(i, { productId: p.id, label: p.name, amount: p.price, priceOverride: undefined });
                        }}
                        className={sub}
                      >
                        {!posProducts.some((p) => p.id === item.productId) && (
                          <option value={item.productId || ""}>{item.label || "เลือกสินค้า"}</option>
                        )}
                        {posProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {p.price.toLocaleString()} ฿
                            {p.trackStock ? ` (เหลือ ${p.stock})` : ""}
                          </option>
                        ))}
                      </select>
                    ))}

                  {(item.kind === "custom" || item.kind === "package") && (
                    <input
                      value={item.label}
                      onChange={(e) => updateItem(i, { label: e.target.value })}
                      placeholder={
                        item.kind === "package"
                          ? "ชื่อคอร์ส/แพ็กเกจ เช่น Member Package 10,000"
                          : "พิมพ์ชื่อรายการ"
                      }
                      className={sub}
                    />
                  )}
                  {item.kind === "package" && (
                    <p className="text-[10px] text-brown-faint">
                      ยอดนี้ไม่นับเป็นฐานแต้ม — ลูกค้าจะได้แต้มตอนเอาคอร์สมาใช้บริการ
                      (คอร์สแบบเครดิตได้แต้มตอนเติมอยู่แล้ว)
                    </p>
                  )}

                  {item.kind === "freebie" && (
                    <>
                      <input
                        value={item.label}
                        onChange={(e) => updateItem(i, { label: e.target.value })}
                        placeholder="ของแถม (เช่น กล้องวงจรปิด)"
                        list={`freebies-${i}`}
                        className={sub}
                      />
                      <datalist id={`freebies-${i}`}>
                        {freebiePresets.map((f) => (
                          <option key={f} value={f} />
                        ))}
                      </datalist>
                    </>
                  )}

                  {/* จำนวนชิ้น — ซื้อหลายอันไม่ต้องเพิ่มทีละบรรทัด
                      ห้องพักไม่มีช่องนี้ เพราะคิดเป็น "คืน" อยู่แล้ว */}
                  {item.kind !== "room" && item.kind !== "freebie" && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-brown-soft">{item.roomLine ? "จำนวนคืน" : "จำนวน"}</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateItem(i, { qty: Math.max(1, (item.qty || 1) - 1) })
                        }
                        className="h-10 w-10 shrink-0 rounded-full border border-petflow-line bg-card text-base font-extrabold text-brown disabled:opacity-40"
                        disabled={(item.qty || 1) <= 1}
                        aria-label="ลดจำนวน"
                      >
                        −
                      </button>
                      <NumField
                        value={item.qty || 1}
                        min={1}
                        onCommit={(n) => updateItem(i, { qty: n })}
                        className="h-10 w-14 rounded-lg border border-petflow-line bg-paper px-2 text-center text-sm font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => updateItem(i, { qty: (item.qty || 1) + 1 })}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-petflow-line bg-card text-brown"
                        aria-label="เพิ่มจำนวน"
                      >
                        <Icon name="plus" size={16} strokeWidth={2.2} />
                      </button>
                      {(item.qty || 1) > 1 && (
                        <span className="text-[11px] text-brown-faint">
                          {line.unitAmount.toLocaleString()} ฿ × {line.qty}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[11px] text-brown-faint">
                      {line.label}
                    </span>
                    {item.kind === "freebie" ? (
                      <span className="flex shrink-0 items-center gap-1 text-sm font-extrabold text-ok">
                        <Icon name="gift" size={16} />
                        ฟรี
                      </span>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1.5">
                        {item.kind === "room" ? (
                          // ราคาในช่องคือ "ต่อคืน" (รวมค่าตัวที่เกินแล้ว) — ยอดคือ ราคาต่อคืน × จำนวนคืน ก่อนส่วนลด
                          <span className="text-[10px] text-brown-faint">
                            × {line.qty} คืน = {(line.unitAmount * line.qty).toLocaleString()} ฿
                          </span>
                        ) : (item.qty || 1) > 1 ? (
                          <span className="text-[10px] text-brown-faint">
                            = {line.amount.toLocaleString()} ฿
                          </span>
                        ) : null}
                        <NumField
                          value={line.unitAmount}
                          min={0}
                          onCommit={(n) => setUnitPrice(i, n)}
                          className={`h-10 w-24 rounded-lg border bg-paper px-3 text-right text-sm font-bold ${
                            isSpecial
                              ? "border-honey-deep text-honey-deep"
                              : "border-petflow-line"
                          }`}
                        />
                      </div>
                    )}
                  </div>

                  {item.kind !== "freebie" && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-brown-soft">
                      <span className="flex items-center gap-1">
                        <Icon name="ticket" size={14} />
                        ลดเฉพาะรายการนี้
                      </span>
                      <NumField
                        value={item.discount || 0}
                        min={0}
                        onCommit={(n) => updateItem(i, { discount: n || undefined })}
                        className="h-9 w-16 rounded-lg border border-petflow-line bg-paper px-2 text-right text-xs font-bold"
                      />
                      <select
                        value={item.discountMode || "baht"}
                        onChange={(e) =>
                          updateItem(i, { discountMode: e.target.value as "baht" | "percent" })
                        }
                        className="h-9 rounded-lg border border-petflow-line bg-paper px-1.5 text-xs"
                      >
                        <option value="baht">บาท</option>
                        <option value="percent">%</option>
                      </select>
                      {(item.discount || 0) > 0 && (
                        <span className="text-ok">
                          = {line.amount.toLocaleString()} ฿
                        </span>
                      )}
                      {!(item.discount || 0) && line.discountName && (
                        <span className="text-ok">
                          {line.discountName} -{line.discountPercent}% = {line.amount.toLocaleString()} ฿
                        </span>
                      )}
                    </div>
                  )}

                  {isSpecial && (
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-honey/15 px-2.5 py-1">
                      <span className="flex items-center gap-1 text-[11px] font-bold text-brown">
                        <Icon name="star" size={14} />
                        ราคาพิเศษ (ปกติ {stdUnit.toLocaleString()} ฿)
                      </span>
                      <button
                        type="button"
                        onClick={() => updateItem(i, { priceOverride: undefined })}
                        className="min-h-[32px] px-1 text-[11px] font-bold text-latte-deep underline"
                      >
                        ใช้ราคาปกติ
                      </button>
                    </div>
                  )}

                  {petLast && (
                    <p className="flex items-start gap-1 text-[11px] text-brown-soft">
                      <Icon name="paw" size={13} />
                      <span>
                        ครั้งก่อน{petName}: {petLast.programName} · {petLast.breed} · {petLast.sizeLabel} ·{" "}
                        <b className="text-brown">฿{petLast.unitAmount.toLocaleString()}</b>
                        {petLast.when ? ` (${petLast.when.slice(0, 10)})` : ""}
                      </span>
                    </p>
                  )}

                  {/* เคยให้ราคาอื่นกับลูกค้าคนนี้มาก่อน — ถามก่อน ไม่เปลี่ยนให้เอง
                      เพราะราคาพิเศษครั้งก่อนอาจเป็นโปรที่จบไปแล้ว */}
                  {recall && (
                    <div className="rounded-lg border border-honey-deep/40 bg-honey/10 px-2 py-1.5">
                      <p className="flex items-start gap-1 text-[11px] font-bold text-brown">
                        <Icon name="clock" size={14} />
                        ครั้งก่อนลูกค้าคนนี้จ่าย {recall.unitAmount.toLocaleString()} ฿
                        {recall.when ? ` (${recall.when.slice(0, 10)})` : ""} · ราคาปกติ{" "}
                        {stdUnit.toLocaleString()} ฿
                      </p>
                      <div className="mt-1.5 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setUnitPrice(i, recall.unitAmount)}
                          className="min-h-[36px] flex-1 rounded-full bg-honey-deep/80 px-3 text-[11px] font-extrabold text-petflow-chocolate"
                        >
                          ใช้ราคาเดิม {recall.unitAmount.toLocaleString()} ฿
                        </button>
                        <button
                          type="button"
                          onClick={() => dismissRecall(sig)}
                          className="min-h-[36px] flex-1 rounded-full border border-petflow-line bg-card px-3 text-[11px] font-bold text-brown-soft"
                        >
                          ใช้ราคาปกติ
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() =>
                setItems((prev) => [...prev, prefillGroom(newGrooming(undefined, groomPrograms), selected)])
              }
              className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-petflow-sm border border-dashed border-latte/60 bg-latte/10 py-2.5 text-sm font-extrabold text-latte-deep transition active:scale-[.98]"
            >
              <Icon name="plus" size={18} />
              เพิ่มรายการ
            </button>
            <button
              type="button"
              onClick={() => setShowProductPicker((v) => !v)}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-petflow-sm border border-dashed border-sky-deep/50 bg-sky/20 py-2.5 text-sm font-extrabold text-sky-deep transition active:scale-[.98]"
            >
              <Icon name="cart" size={18} />
              เพิ่มสินค้า
            </button>
          </div>

          {showProductPicker && (
            <div className="mt-2 rounded-petflow-sm border border-petflow-line bg-card p-2.5">
              {products.length === 0 ? (
                <EmptyState icon="bag" title="ยังไม่มีสินค้า" sub="ไปเพิ่มที่เมนู “สินค้าหน้าร้าน” ก่อน" />
              ) : (
                <>
                  <div className="mb-2 flex gap-1.5 overflow-x-auto">
                    {["ทั้งหมด", ...new Set(products.map((p) => p.category).filter(Boolean))].map(
                      (t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setProductTab(t)}
                          className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                            productTab === t
                              ? "bg-honey/40 text-petflow-chocolate"
                              : "bg-paper text-brown-soft"
                          }`}
                        >
                          {t}
                        </button>
                      )
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {products
                      .filter((p) => productTab === "ทั้งหมด" || p.category === productTab)
                      .map((p) => {
                        const outOfStock = p.stockCount <= 0;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            disabled={outOfStock}
                            onClick={() => addProduct(p)}
                            className="relative flex flex-col items-center gap-1 rounded-petflow-sm border border-petflow-line bg-paper/50 p-2 text-center transition active:scale-[.97] disabled:opacity-40"
                          >
                            <span className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-petflow-sm bg-card">
                              {p.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={p.imageUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Icon name="bag" size={20} className="text-brown-soft" />
                              )}
                              {outOfStock && (
                                <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-[10px] font-extrabold text-white">
                                  หมด
                                </span>
                              )}
                            </span>
                            <span className="line-clamp-2 text-[10px] font-bold text-brown">
                              {p.name}
                            </span>
                            <span className="text-[10px] font-extrabold text-latte-deep">
                              {p.price.toLocaleString()}฿
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* ── โปร + ส่วนลด ── */}
        <section>
        <SectionLabel>Discount · โปร / ส่วนลด</SectionLabel>
        {/* โปรลดเฉพาะรายการ — ลดแค่ประเภทที่ตั้งไว้ (เช่น ห้องพัก/อาบน้ำ) ค่ารับ-ส่งไม่ลด */}
        <div className="mb-3 rounded-petflow-sm border border-petflow-line bg-paper/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-brown-soft">โปรลดเฉพาะรายการ</span>
            <Link
              href="/admin/settings?tab=linePromos"
              className="text-[11px] font-bold text-latte-deep underline-offset-2 hover:underline"
            >
              {linePromos.length ? "แก้โปร" : "+ ตั้งโปร"}
            </Link>
          </div>
          {linePromos.length === 0 ? (
            <p className="mt-1 text-[11px] text-brown-faint">
              ตั้งไว้ครั้งเดียว เช่น &quot;ลด 5% เฉพาะห้องพัก + อาบน้ำ&quot; แล้วกดเลือกตอนออกบิล
            </p>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[{ id: "", name: "ไม่ใช้", percent: 0, kinds: [] } as LinePromo, ...linePromos].map(
                  (p) => {
                    const on = linePromoId === p.id;
                    return (
                      <button
                        key={p.id || "none"}
                        type="button"
                        onClick={() => setLinePromoId(p.id)}
                        className={`min-h-[36px] rounded-full border px-3 text-xs font-bold ${
                          on
                            ? "border-petflow-chocolate bg-petflow-chocolate text-card"
                            : "border-petflow-line bg-card text-brown"
                        }`}
                      >
                        {p.id ? `${p.name} ${p.percent}%` : p.name}
                      </button>
                    );
                  }
                )}
              </div>
              {linePromo && (
                <p className="mt-2 text-[11px] font-bold text-ok">
                  ลด {linePromo.percent}% เฉพาะ{" "}
                  {LINE_PROMO_KINDS.filter((k) => linePromo.kinds.includes(k.id))
                    .map((k) => k.label)
                    .join(" · ") || "—"}
                  {linePromoOff > 0
                    ? ` = -${linePromoOff.toLocaleString()} บาท`
                    : " (บิลนี้ยังไม่มีรายการที่เข้าโปร)"}
                </p>
              )}
            </>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold text-brown-soft">
            โปรโมชั่น
            <select
              value={promoId}
              onChange={(e) => setPromoId(e.target.value)}
              className={`mt-1 min-h-[40px] ${field}`}
            >
              <option value="">ไม่ใช้โปร</option>
              {promos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title.th}
                  {p.discountPercent ? ` (${p.discountPercent}%)` : ""}
                  {p.discountAmount ? ` (-${p.discountAmount}฿)` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold text-brown-soft">
            ส่วนลดเพิ่ม
            <div className="mt-1 flex gap-1.5">
              <input
                type="number"
                min="0"
                max={discountMode === "percent" ? 100 : undefined}
                inputMode="numeric"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0"
                className={`min-h-[40px] min-w-0 flex-1 ${field}`}
              />
              <Segmented
                value={discountMode}
                onChange={setDiscountMode}
                options={[
                  { id: "baht", label: "฿" },
                  { id: "percent", label: "%" },
                ]}
                className="w-28 shrink-0"
              />
            </div>
            {discountMode === "percent" && discountInput > 0 && (
              <span className="mt-1 block text-[10px] font-normal text-brown-faint">
                ลด {Math.min(100, discountInput)}% = {manualDiscount.toLocaleString()} บาท
              </span>
            )}
          </label>

          {customerCoupons.length > 0 && (
            <div>
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-brown-soft">
                <Icon name="ticket" size={14} />
                คูปองของลูกค้า (แตะเพื่อใช้)
              </span>
              <div className="flex flex-wrap gap-2">
                {customerCoupons.map((cp) => (
                  <button
                    key={cp.id}
                    type="button"
                    onClick={() => setCouponId((prev) => (prev === cp.id ? "" : cp.id))}
                    className={`flex min-h-[40px] items-center gap-1 rounded-full px-3.5 py-2 text-xs font-bold ${
                      couponId === cp.id
                        ? "bg-latte-deep text-card"
                        : "bg-paper text-brown-soft"
                    }`}
                  >
                    {couponId === cp.id && <Icon name="check" size={13} strokeWidth={2.4} />}฿{cp.amount} · {cp.reason}
                  </button>
                ))}
              </div>
            </div>
          )}

          {customerPackages.length > 0 && (
            <div>
              <span className="mb-1.5 flex items-start gap-1.5 text-xs font-bold text-brown-soft">
                <Icon name="ticket" size={14} />
                คอร์สของลูกค้า (ใช้ร่วมกันได้ทั้งบ้าน)
              </span>
              <div className="flex flex-wrap gap-2">
                {customerPackages.map((pk) => (
                  <button
                    key={pk.id}
                    type="button"
                    disabled={pk.locked && packageId !== pk.id}
                    title={
                      pk.locked
                        ? `ค้างจ่าย ${(pk.outstanding || 0).toLocaleString()} บาท — ต้องจ่ายครบก่อนใช้`
                        : undefined
                    }
                    onClick={() => {
                      setPackageTouched(true);
                      setPackageId((prev) => (prev === pk.id ? "" : pk.id));
                    }}
                    className={`flex min-h-[40px] items-center gap-1 rounded-full px-3.5 py-2 text-left text-xs font-bold disabled:opacity-50 ${
                      packageId === pk.id ? "bg-sage text-card" : "bg-paper text-brown-soft"
                    }`}
                  >
                    {packageId === pk.id && <Icon name="check" size={13} strokeWidth={2.4} />}
                    {pk.roomType && <Icon name="bed" size={14} />}
                    {pk.roomType ? pk.roomLabel || pk.name : pk.name}
                    {pk.groomProgram &&
                      !pk.name.includes(groomProgramName(pk.groomProgram, groomPrograms) || "\u0000") &&
                      ` · ${groomProgramName(pk.groomProgram, groomPrograms) || "โปรแกรมที่ลบไปแล้ว"}`}{" "}
                    (เหลือ{" "}
                    {pk.totalUses - pk.usedUses}/{pk.totalUses} {pk.unit === "night" ? "คืน" : "ครั้ง"})
                    {pk.locked && ` · ค้างจ่าย ${(pk.outstanding || 0).toLocaleString()}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        </section>

        {pickedPackage?.unit === "night" && (
          <p className="rounded-petflow-sm bg-sage/15 px-3 py-2 text-[11px] font-bold text-ok">
            {nightsToUse > 0
              ? `หักคอร์ส ${nightsToUse} คืน (คลุมค่าห้าง ${nightsCover.toLocaleString()} บาท)`.replace(
                  "ค่าห้าง",
                  "ค่าห้อง"
                )
              : pickedPackage.roomType && billHasRoom
                ? `คอร์สนี้ใช้ได้กับ${pickedPackage.roomLabel || "ห้องอีกประเภท"}เท่านั้น — ห้องในบิลนี้ไม่ตรง`
                : "บิลนี้ไม่มีรายการห้องพัก หรือคอร์สหมดคืนแล้ว — ยังหักไม่ได้"}
            {nightsToUse > 0 && nightsOnBill > nightsToUse && (
              <span className="block font-normal text-brown-soft">
                บิลนี้พัก {nightsOnBill} คืน แต่คอร์สเหลือ {nightsToUse} คืน — ส่วนที่เกินคิดเงินตามปกติ
              </span>
            )}
          </p>
        )}

        {pickedPackage?.groomProgram && (
          <p className="rounded-petflow-sm bg-sage/15 px-3 py-2 text-[11px] font-bold text-ok">
            {programUsesToUse > 0
              ? `หักคอร์ส ${programUsesToUse} ครั้ง (คลุมค่า${
                  groomProgramName(pickedPackage.groomProgram, groomPrograms) || "โปรแกรมนี้"
                } ${programCover.toLocaleString()} บาท)`
              : `คอร์สนี้ใช้ได้กับ${
                  groomProgramName(pickedPackage.groomProgram, groomPrograms) || "โปรแกรมอื่น"
                }เท่านั้น — บิลนี้ยังไม่มีรายการโปรแกรมนี้`}
            {programUsesToUse > 0 && programUsesOnBill > programUsesToUse && (
              <span className="block font-normal text-brown-soft">
                บิลนี้อาบ {programUsesOnBill} ครั้ง แต่คอร์สเหลือ {programUsesToUse} ครั้ง — ส่วนที่เกินคิดเงินตามปกติ
              </span>
            )}
          </p>
        )}

        {autoPromoLabel && promoId && (
          <p className="flex items-center gap-1.5 rounded-petflow-sm bg-sage/15 px-3 py-2 text-[11px] font-bold text-ok">
            <Icon name="sparkle" size={14} />
            ใช้โปร &quot;{autoPromoLabel}&quot; อัตโนมัติ (ลูกค้าคนนี้มีสิทธิ์)
          </p>
        )}

        {/* ── สรุปยอด ── */}
        <div className="space-y-1.5 rounded-petflow-sm bg-paper/70 px-3.5 py-3 text-sm">
          <div className="flex justify-between text-brown-soft">
            <span>ยอดรวม</span>
            <span>{subtotal.toLocaleString()} ฿</span>
          </div>
          {(promoDiscount > 0 || manualDiscount > 0) && (
            <div className="flex justify-between text-wait">
              <span>ส่วนลด</span>
              <span>-{(promoDiscount + manualDiscount).toLocaleString()} ฿</span>
            </div>
          )}
          <div className="flex justify-between border-t border-petflow-line pt-1 text-base font-extrabold text-petflow-chocolate">
            <span>ยอดสุทธิ</span>
            <span>{total.toLocaleString()} ฿</span>
          </div>
          {/* มัดจำของบิลนี้ (ถ้ามี) — กด % หรือใส่เอง */}
          <div className="flex items-center justify-between gap-2 border-t border-petflow-line pt-1.5">
            <span className="text-xs font-bold text-brown-soft">มัดจำ (ถ้ามี)</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              placeholder="0"
              value={billDeposit}
              onChange={(e) => {
                setBillDeposit(e.target.value);
                setBillDepPct(null);
              }}
              className="h-10 w-24 rounded-lg border border-petflow-line bg-card px-3 text-right text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {[10, 20, 30, 50].map((pct) => {
              const amt = Math.round((total * pct) / 100);
              return (
                <button
                  key={pct}
                  type="button"
                  disabled={total <= 0}
                  onClick={() => {
                    setBillDeposit(String(amt));
                    setBillDepPct(pct);
                  }}
                  className={`min-h-[36px] flex-1 rounded-full px-2.5 py-1.5 text-xs font-bold disabled:opacity-40 ${
                    billDepPct === pct
                      ? "bg-honey text-petflow-chocolate"
                      : "bg-card text-brown-soft"
                  }`}
                >
                  {pct}%
                </button>
              );
            })}
            {billDeposit && (
              <button
                type="button"
                onClick={() => {
                  setBillDeposit("");
                  setBillDepPct(null);
                }}
                className="min-h-[36px] rounded-full px-2.5 py-1.5 text-xs font-bold text-wait"
              >
                ล้าง
              </button>
            )}
          </div>
          {depositAmount > 0 && (
            <div className="flex justify-between font-extrabold text-wait">
              <span>คงเหลือ (เก็บทีหลัง)</span>
              <span>{remaining.toLocaleString()} ฿</span>
            </div>
          )}
        </div>

        {/* ── สรุป (ก๊อป / ส่ง LINE ให้ลูกค้า) — เลือกแบบ แล้วกดส่งปุ่มเดียว ── */}
        <section className="rounded-petflow-sm border border-petflow-line bg-card p-3">
          <SectionLabel>Summary · สรุปให้ลูกค้า</SectionLabel>
          <Segmented
            value={summaryMode}
            onChange={setSummaryMode}
            options={[
              { id: "booking", label: "การจอง" },
              { id: "deposit", label: "มัดจำ" },
              { id: "full", label: "ยอดเต็ม" },
            ]}
          />
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => sendSummaryLine(summaryMode)}
              disabled={!selected || sending}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full bg-[#06C755]/15 px-4 text-sm font-extrabold text-[#06883c] disabled:opacity-40"
            >
              <Icon name="send" size={16} />
              {sending ? "กำลังส่ง…" : "ส่ง LINE"}
            </button>
            <button
              type="button"
              onClick={() => copySummary(summaryMode)}
              disabled={!selected}
              aria-label="ก๊อปข้อความสรุป"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper text-brown disabled:opacity-40"
            >
              <Icon name={copied ? "check" : "copy"} size={18} />
            </button>
          </div>
          {copied && (
            <p className="mt-2 text-center text-[11px] font-bold text-ok">ก๊อปข้อความแล้ว — เอาไปแปะแชทลูกค้าได้เลย</p>
          )}
        </section>

        <button
          type="button"
          disabled={creating}
          onClick={createBill}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-petflow-sm bg-gradient-to-r from-honey to-honey-deep py-3 text-sm font-extrabold text-petflow-chocolate shadow-petflow-sm disabled:opacity-60"
        >
          {!creating && <Icon name={editingId ? "check" : "receipt"} size={18} />}
          {creating
            ? "กำลังบันทึก…"
            : editingId
              ? "บันทึกการแก้ไขบิล"
              : `ออกบิล · ${total.toLocaleString()} ฿`}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={resetForm}
            className="-mt-2 min-h-[40px] w-full rounded-petflow-sm py-2 text-xs font-bold text-brown-soft"
          >
            ยกเลิกการแก้ไข
          </button>
        )}
      </div>

      <div id="bills" className="scroll-mt-20" />
      <SectionLabel
        action={(() => {
          const pending = invoices.filter((i) => i.status === "pending");
          // มัดจำที่ยังไม่ได้รับ ยังนับเป็นยอดค้าง
          const due = pending.reduce((s, i) => s + (i.total - receivedOf(i)), 0);
          return due > 0 ? (
            <span className="rounded-full bg-wait/15 px-2.5 py-1 text-[11px] font-extrabold text-wait">
              ค้างรวม {due.toLocaleString()} ฿ · {pending.length} บิล
            </span>
          ) : null;
        })()}
      >
        Invoices · บิล
      </SectionLabel>
      <Segmented
        value={billFilter}
        onChange={setBillFilter}
        className="mb-3"
        options={(
          [
            ["pending", "รอชำระ"],
            ["paid", "ปิดบิลแล้ว"],
            ["all", "ทั้งหมด"],
          ] as const
        ).map(([f, label]) => ({
          id: f,
          label,
          badge:
            (f === "all" ? invoices.length : invoices.filter((i) => i.status === f).length) ||
            undefined,
        }))}
      />
      {billFilter === "pending" && (
        <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {(["all", "deposit", "partial", "full"] as const).map((st) => {
            const n = invoices.filter(
              (i) => i.status === "pending" && (st === "all" || pendingStageOf(i) === st)
            ).length;
            const on = pendingStage === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setPendingStage(st)}
                className={`flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${
                  on ? "bg-petflow-chocolate text-card" : "bg-paper text-brown"
                }`}
              >
                {st === "all" ? "ทั้งหมด" : STAGE_META[st].label}
                <span className={`text-[10px] ${on ? "text-card/70" : "text-brown-faint"}`}>{n}</span>
              </button>
            );
          })}
        </div>
      )}
      <SearchField
        value={billSearch}
        onChange={setBillSearch}
        placeholder="ค้นหาชื่อน้อง / ลูกค้า / เลขบิล"
        className="mb-2"
      />
      {(() => {
        const linkedFor = (inv: Invoice) =>
          bookings.find((b) => b.id === inv.bookingId) ||
          bookings.find(
            (b) =>
              !!b.customerId &&
              b.customerId === inv.customerId &&
              b.catName === inv.catName &&
              b.status !== "cancelled"
          );
        const serviceDate = (inv: Invoice) => {
          const bk = linkedFor(inv);
          return bk?.checkin || bk?.date || (inv.createdAt || "").slice(0, 10) || "";
        };
        // มัดจำที่ยังไม่ได้รับ ยังนับเป็นยอดค้าง
        const dueOf = (inv: Invoice) => inv.total - receivedOf(inv);
        const q = billSearch.trim().toLowerCase();
        // เดือนอ้างอิง: เรียงตามวันออกบิล → เดือนที่ออกบิล, นอกนั้น → เดือนของวันนัด
        const monthOf = (inv: Invoice) =>
          (billSort === "issued-desc" || billSort === "issued-asc"
            ? (inv.createdAt || "").slice(0, 10)
            : serviceDate(inv)
          ).slice(0, 7);
        const monthSet = new Set(invoices.map(monthOf).filter(Boolean));
        monthSet.add(new Date().toISOString().slice(0, 7));
        const monthOptions = [...monthSet].sort().reverse();
        let list = invoices
          .filter((inv) => !billMonth || monthOf(inv) === billMonth)
          .filter((inv) => billFilter === "all" || inv.status === billFilter)
          .filter(
            (inv) =>
              billFilter !== "pending" || pendingStage === "all" || pendingStageOf(inv) === pendingStage
          )
          .filter(
            (inv) =>
              !q ||
              [inv.catName, inv.customerName, inv.id].some((s) =>
                (s || "").toLowerCase().includes(q)
              )
          );
        list = [...list].sort((a, b) => {
          if (billSort === "amount-desc") return b.total - a.total;
          if (billSort === "due-desc") return dueOf(b) - dueOf(a);
          if (billSort === "name-asc")
            return (a.customerName || "").localeCompare(b.customerName || "", "th");
          if (billSort === "issued-asc" || billSort === "issued-desc") {
            const ia = a.createdAt || "";
            const ib = b.createdAt || "";
            return billSort === "issued-asc"
              ? ia < ib ? -1 : ia > ib ? 1 : 0
              : ia > ib ? -1 : ia < ib ? 1 : 0;
          }
          const da = serviceDate(a);
          const db = serviceDate(b);
          if (billSort === "date-asc") return da < db ? -1 : da > db ? 1 : 0;
          return da > db ? -1 : da < db ? 1 : 0;
        });

        const renderBill = (inv: Invoice) => {
          // ผูกนัดโดยตรง หรือถ้าไม่ได้ผูก → เดาจากนัดของลูกค้า/น้องตัวเดียวกัน
          const linkedBk = linkedFor(inv);
          const sched = scheduleLabelFor(linkedBk);
          const paid = inv.status === "paid";
          const hasDep = (inv.deposit ?? 0) > 0;
          const busyHere = invoiceBusy.startsWith(`${inv.id}:`);
          const openSend = () => setSendFor(inv.id);
          const del = () =>
            invoiceAction(
              inv.id,
              "delete",
              "ลบบิลแล้ว 🗑️",
              `ลบบิลนี้? (${inv.total.toLocaleString()} บาท) — ลบรายการบัญชีที่ผูกด้วย กู้คืนไม่ได้`
            );
          // เอกสารทางการ (ใบเสร็จ/ใบกำกับภาษี · ใบเสนอราคา · ใบแจ้งหนี้) ออกในนามบริษัทได้
          const openDocs = () => window.open(`/admin/billing/doc/${inv.id}`, "_self");
          const menu = paid
            ? [
                { label: "ใบเสร็จ / ใบกำกับภาษี", icon: "receipt", onClick: openDocs },
                {
                  label: "ยกเลิกการชำระ (กดผิด)",
                  icon: "back",
                  disabled: invoiceBusy === `${inv.id}:unmark_paid`,
                  onClick: () =>
                    invoiceAction(
                      inv.id,
                      "unmark_paid",
                      "ยกเลิกการชำระแล้ว ↩️ — บิลกลับเป็น 'รอชำระ' แก้ไขต่อได้",
                      "ยกเลิกการชำระบิลนี้? (กดผิดใช่ไหม)\nจะกลับเป็น 'รอชำระ' + ย้อนรายรับ/แต้ม/เครดิตที่ลงไป"
                    ),
                },
                // ร้านปิดเครดิต Member ในตั้งค่า › เปิด/ปิดฟีเจอร์ — ไม่มีเมนูโยกเป็นเครดิต
                ...(creditOn
                  ? [
                    {
                      label: "โยกเป็นเครดิต (ลูกค้าไม่มา)",
                      icon: "wallet",
                      disabled: invoiceBusy === `${inv.id}:to_credit`,
                      onClick: () =>
                        invoiceAction(
                          inv.id,
                          "to_credit",
                          `โยกเป็นเครดิตแล้ว 💰 +${inv.total.toLocaleString()} บาท ใช้ได้ครั้งหน้า`,
                          `โยกยอด ${inv.total.toLocaleString()} บาท ไปเป็นเครดิต Member ของ ${inv.customerName}?\nลูกค้าจ่ายแล้วแต่ไม่มา — ใช้เครดิตนี้จ่ายครั้งหน้าได้ (ไม่นับรายรับซ้ำ)`
                        ),
                    },
                    ]
                  : []),
                { label: "ลบบิล", icon: "trash", danger: true, disabled: invoiceBusy === `${inv.id}:delete`, onClick: del },
              ]
            : [
                { label: "ส่ง LINE หาลูกค้า", icon: "send", onClick: openSend },
                { label: "ใบเสนอราคา / ใบแจ้งหนี้", icon: "doc", onClick: openDocs },
                { label: "แก้ไขบิล", icon: "edit", onClick: () => editInvoice(inv) },
                { label: "ลบบิล", icon: "trash", danger: true, disabled: invoiceBusy === `${inv.id}:delete`, onClick: del },
              ];
          return (
          <div key={inv.id} className="p-4">
            <div className="flex items-start gap-3">
              <Avatar name={inv.customerName} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-petflow-chocolate">{inv.customerName}</p>
                <p className="truncate text-[11px] text-brown-soft">{inv.catName}</p>
                {sched ? (
                  // ข้อความ sched ใช้ส่งให้ลูกค้าด้วย (มีอีโมจินำหน้า) — บนจอตัดอีโมจิออกแล้วใช้ไอคอนเส้นแทน
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-bold text-latte-deep">
                    <Icon name={linkedBk?.service === "room" || linkedBk?.checkin ? "bed" : "bath"} size={13} />
                    <span className="truncate">{sched.replace(/^\S+\s/, "")}</span>
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-base font-extrabold text-petflow-chocolate">{inv.total.toLocaleString()} ฿</p>
                {(() => {
                  const meta = paid ? null : STAGE_META[pendingStageOf(inv)];
                  return (
                    <span
                      className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                        meta ? meta.tone : "bg-ok/15 text-ok"
                      }`}
                    >
                      <Icon name={meta?.icon || "check"} size={11} strokeWidth={2.4} />
                      {meta ? meta.short : "ปิดบิลแล้ว"}
                    </span>
                  );
                })()}
              </div>
            </div>

            {inv.items && inv.items.length > 0 && (
              <div className="mt-3 space-y-1 rounded-petflow-sm bg-paper/60 px-3 py-2 text-xs text-brown-soft">
                {inv.items.map((it, k) => {
                  // ส่วนลดเฉพาะรายการ — โชว์ราคาเต็มขีดฆ่า + บรรทัด "ส่วนลด" แยกให้เห็นชัด
                  const gross =
                    it.unitAmount !== undefined ? it.unitAmount * Math.max(1, it.qty || 1) : it.amount;
                  const off = it.kind === "freebie" ? 0 : gross - it.amount;
                  return (
                    <div key={k}>
                      <div className="flex justify-between gap-2">
                        <span className="min-w-0 truncate">{off > 0 ? stripDiscountTag(it.label) : it.label}</span>
                        <span className="shrink-0">
                          {off > 0 && (
                            <s className="mr-1 text-brown-faint">{gross.toLocaleString()}</s>
                          )}
                          {it.amount.toLocaleString()} ฿
                        </span>
                      </div>
                      {off > 0 && (
                        <div className="flex justify-between gap-2 pl-2 text-[11px] font-bold text-ok">
                          <span>
                            {it.discountName ? `ส่วนลด ${it.discountName}` : "ส่วนลดรายการนี้"}
                            {it.discountPercent ? ` ${it.discountPercent}%` : ""}
                          </span>
                          <span>-{off.toLocaleString()} ฿</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {inv.discount ? (
                  <div className="flex justify-between border-t border-petflow-line pt-1 text-wait">
                    <span>ส่วนลด{inv.promoLabel ? ` (${inv.promoLabel})` : ""}</span>
                    <span>-{inv.discount.toLocaleString()} ฿</span>
                  </div>
                ) : null}
                {hasDep && (
                  <div className="flex justify-between border-t border-petflow-line pt-1 font-bold">
                    <span className={inv.depositReceivedAt || paid ? "text-ok" : "text-brown"}>
                      มัดจำ {inv.depositReceivedAt || paid ? "(รับแล้ว)" : "(รอรับ)"}
                    </span>
                    <span className={inv.depositReceivedAt || paid ? "text-ok" : "text-brown"}>
                      {inv.deposit!.toLocaleString()} ฿
                    </span>
                  </div>
                )}
                {hasDep && inv.status === "pending" && (
                  <div className="flex justify-between font-extrabold text-wait">
                    <span>คงเหลือ</span>
                    <span>{(inv.total - inv.deposit!).toLocaleString()} ฿</span>
                  </div>
                )}
                {/* ปิดบิลแล้ว — โชว์ยอดที่เหลือที่รับตอนปิดบิลด้วย ไม่งั้นดูเหมือนรับแค่มัดจำ */}
                {hasDep && paid && (
                  <>
                    <div className="flex justify-between font-bold text-ok">
                      <span>ยอดคงเหลือ (รับแล้ว)</span>
                      <span>{Math.max(0, inv.total - inv.deposit!).toLocaleString()} ฿</span>
                    </div>
                    <div className="flex justify-between border-t border-petflow-line pt-1 font-extrabold text-ok">
                      <span>รับครบแล้ว</span>
                      <span>{inv.total.toLocaleString()} ฿</span>
                    </div>
                  </>
                )}
              </div>
            )}
            {(!inv.items || inv.items.length === 0) && hasDep && (
              <p className="mt-2 text-[11px] font-bold text-ok">
                มัดจำ{inv.depositReceivedAt || paid ? " (รับแล้ว) " : " (รอรับ) "}
                {inv.deposit!.toLocaleString()}
                {inv.status === "pending" ? (
                  <span className="text-wait"> · คงเหลือ {(inv.total - inv.deposit!).toLocaleString()} บาท</span>
                ) : (
                  <span> · รับครบ {inv.total.toLocaleString()} บาท</span>
                )}
              </p>
            )}

            {/* บิลนี้ไม่มีนัดผูกอยู่ — การ์ดที่อิงนัด (แจ้งเตือนนัด/ส่งชุดการ์ด) เลยไม่ขึ้น
                ให้เลือกผูกนัดของลูกค้าคนนี้เองได้ ไม่ต้องแก้ที่ไหนเพิ่ม */}
            {!inv.bookingId && !linkedBk && (
              <label className="mt-2 flex min-h-[40px] items-center gap-2 rounded-full border border-dashed border-latte/60 bg-latte/10 px-3">
                <Icon name="link" size={15} className="shrink-0 text-latte-deep" />
                <select
                  disabled={invoiceBusy === `${inv.id}:link_booking`}
                  value=""
                  onChange={(e) => {
                    if (e.target.value) linkInvoiceToBooking(inv.id, e.target.value);
                  }}
                  aria-label="ผูกบิลกับนัด"
                  className="min-w-0 flex-1 !border-0 !bg-transparent p-0 text-[11px] font-bold text-latte-deep"
                >
                  <option value="">ยังไม่ผูกนัด — เลือกนัดของ {inv.customerName}…</option>
                  {bookings
                    .filter((b) => b.customerId === inv.customerId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.service === "room" ? "ห้องพัก" : "อาบน้ำ"} · {b.catName} ·{" "}
                        {b.service === "room"
                          ? `${b.checkin || "?"} → ${b.checkout || "?"}`
                          : b.date || ""}
                      </option>
                    ))}
                </select>
              </label>
            )}

            {/* ปุ่มหลักปุ่มเดียว: รอชำระ = รับชำระ · จ่ายแล้ว = ส่ง LINE (ใบเสร็จ/รีวิว) — ที่เหลืออยู่ในเมนู ⋯ */}
            <div className="mt-3 flex items-center gap-2">
              {paid ? (
                <button
                  type="button"
                  onClick={openSend}
                  className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full bg-[#06C755]/15 px-4 text-sm font-extrabold text-[#06883c]"
                >
                  <Icon name="send" size={16} />
                  ส่ง LINE
                  {!inv.lineUserId && <span className="text-[11px] font-bold text-brown-soft">· ยังไม่ผูก</span>}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!!invoiceBusy}
                  onClick={() => setPayFor(inv)}
                  className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-honey to-honey-deep px-4 text-sm font-extrabold text-petflow-chocolate disabled:opacity-50"
                >
                  <Icon name="money" size={16} />
                  {busyHere ? "กำลังบันทึก…" : "รับชำระ"}
                </button>
              )}
              <MoreMenu items={menu} />
            </div>

            {/* แผ่นส่งการ์ด LINE ของบิลนี้ — เปิดจากปุ่ม/เมนูด้านบน (ชุดปุ่มรวม เหมือนในปฏิทิน) */}
            <CustomerSendButtons
              invoiceId={inv.id}
              bookingId={inv.bookingId || linkedBk?.id}
              customerId={inv.customerId}
              lineUserId={inv.lineUserId}
              service={billServiceKind(inv.items)}
              invoiceDeposit={inv.deposit ?? 0}
              invoiceStatus={inv.status}
              initialAutoOff={linkedBk?.autoOff}
              onDone={load}
              hideTrigger
              open={sendFor === inv.id}
              onOpenChange={(v) => setSendFor(v ? inv.id : null)}
            />
          </div>
          );
        };

        const monthBar = (
          <div className="mb-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex min-h-[40px] items-center gap-1.5 rounded-full border border-petflow-line bg-paper px-3">
              <Icon name="filter" size={15} className="shrink-0 text-brown-soft" />
              <select
                value={billSort}
                onChange={(e) => setBillSort(e.target.value as typeof billSort)}
                aria-label="เรียงบิล"
                className="min-w-0 flex-1 !border-0 !bg-transparent p-0 text-xs font-bold text-brown"
              >
                <option value="issued-desc">ออกบิลล่าสุดก่อน</option>
                <option value="issued-asc">ออกบิลเก่าก่อน</option>
                <option value="date-desc">วันนัดล่าสุดก่อน</option>
                <option value="date-asc">วันนัดเก่าก่อน</option>
                <option value="amount-desc">ยอดมากสุด</option>
                <option value="due-desc">ค้างชำระมากสุด</option>
                <option value="name-asc">ชื่อลูกค้า ก–ฮ</option>
              </select>
            </label>
            <label className="flex min-h-[40px] items-center gap-1.5 rounded-full border border-petflow-line bg-paper px-3">
              <Icon name="calendar" size={15} className="shrink-0 text-brown-soft" />
            <select
              value={billMonth}
              onChange={(e) => setBillMonth(e.target.value)}
              aria-label="เดือน"
              className="min-w-0 flex-1 !border-0 !bg-transparent p-0 text-xs font-bold text-brown"
            >
              <option value="">ทุกเดือน</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {formatThaiDateShort(`${m}-01`).replace(/^1 /, "")}
                </option>
              ))}
            </select>
            </label>
          </div>
            <p className="mt-2 px-1 text-[11px] font-bold text-brown-soft">
              {list.length} บิล · รวม {list.reduce((n, i) => n + i.total, 0).toLocaleString()} ฿
              {list.some((i) => i.status === "pending")
                ? ` · ค้าง ${list
                    .filter((i) => i.status === "pending")
                    .reduce((n, i) => n + dueOf(i), 0)
                    .toLocaleString()} ฿`
                : ""}
            </p>
          </div>
        );

        if (
          billSort === "date-desc" ||
          billSort === "date-asc" ||
          billSort === "issued-desc" ||
          billSort === "issued-asc"
        ) {
          const isIssuedSort = billSort === "issued-desc" || billSort === "issued-asc";
          const groups: { date: string; bills: Invoice[] }[] = [];
          for (const inv of list) {
            const d = isIssuedSort
              ? (inv.createdAt || "").slice(0, 10)
              : serviceDate(inv);
            let g = groups.find((x) => x.date === d);
            if (!g) {
              g = { date: d, bills: [] };
              groups.push(g);
            }
            g.bills.push(inv);
          }
          if (groups.length === 0) {
            return (
              <>
                {monthBar}
                <div className="rounded-petflow bg-card shadow-petflow-sm">
                  <EmptyState icon="receipt" title="ไม่พบบิล" sub="ลองเปลี่ยนตัวกรอง หรือเดือน" />
                </div>
              </>
            );
          }
          return (
            <>
            {monthBar}
            <div className="space-y-4">
              {groups.map((g) => {
                const dayTotal = g.bills.reduce((s, i) => s + i.total, 0);
                const dayDue = g.bills
                  .filter((i) => i.status === "pending")
                  .reduce((s, i) => s + dueOf(i), 0);
                return (
                  <div key={g.date || "no-date"}>
                    <div className="mb-2 flex items-center justify-between gap-2 px-1">
                      <span className="flex items-center gap-1.5 text-xs font-extrabold text-petflow-chocolate">
                        <Icon name={isIssuedSort ? "receipt" : "calendar"} size={14} />
                        {g.date ? formatThaiDateShort(g.date) : "ไม่ระบุวัน"} ·{" "}
                        {g.bills.length} บิล
                      </span>
                      <span className="text-[11px] font-bold text-brown-soft">
                        {dayTotal.toLocaleString()} ฿
                        {dayDue > 0 ? ` · ค้าง ${dayDue.toLocaleString()}` : ""}
                      </span>
                    </div>
                    <div className="divide-y divide-petflow-line rounded-petflow bg-card shadow-petflow-sm">
                      {g.bills.map(renderBill)}
                    </div>
                  </div>
                );
              })}
            </div>
            </>
          );
        }

        if (list.length === 0) {
          return (
            <>
              {monthBar}
              <div className="rounded-petflow bg-card shadow-petflow-sm">
                <EmptyState icon="receipt" title="ไม่พบบิล" sub="ลองเปลี่ยนตัวกรอง หรือเดือน" />
              </div>
            </>
          );
        }
        return (
          <>
            {monthBar}
            <div className="divide-y divide-petflow-line rounded-petflow bg-card shadow-petflow-sm">
              {list.map(renderBill)}
            </div>
          </>
        );
      })()}
    </div>
  );
}

/** คิดเงิน — บิลบริการกับขายหน้าร้านอยู่หน้าเดียวกัน สลับด้วยแท็บ (?view=pos) */
function BillingTabs() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { config } = useConfig();
  // ร้านที่ปิด "ขายสินค้าหน้าร้าน" — เหลือแค่บิลบริการ ไม่มีแท็บให้สลับ
  const posOn = isFeatureOn(config, "pos");
  const tab = posOn && params.get("view") === "pos" ? "pos" : "bills";
  if (!posOn) return <BillsView tabs={null} />;
  const tabs = (
    <Segmented
      value={tab}
      onChange={(v) => router.replace(v === "pos" ? `${pathname}?view=pos` : pathname, { scroll: false })}
      className="mb-4"
      options={[
        { id: "bills", label: "บิลบริการ", icon: "receipt" },
        { id: "pos", label: "ขายหน้าร้าน", icon: "cart" },
      ]}
    />
  );
  if (tab === "pos") {
    return (
      <PosPanel
        header={
          <>
            <div className="mb-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Billing</p>
              <h1 className="text-lg font-extrabold text-petflow-chocolate">คิดเงิน · ขายหน้าร้าน</h1>
            </div>
            {tabs}
          </>
        }
      />
    );
  }
  return <BillsView tabs={tabs} />;
}

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingTabs />
    </Suspense>
  );
}
