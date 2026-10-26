"use client";

import { groomUsesCard } from "@/lib/intake-rules";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/Toast";
import { relevantAutoMessageTopics } from "@/lib/auto-messages";
import { PreviewSendModal } from "@/components/PreviewSendModal";
import { Icon } from "@/components/Icon";
import { Segmented } from "@/components/ui";
import { useConfig } from "@/components/ConfigProvider";
import { cardOn } from "@/lib/features";
import { INTAKE_LABEL } from "@/lib/intake-cards";

type PendingSend = {
  url: string;
  method: "PATCH" | "POST";
  body: Record<string, unknown>;
  okMsg: string;
  busyKey: string;
  messages: Record<string, unknown>[];
  skipped?: string[];
};

/**
 * ปุ่มลัดบนการ์ดนัด — การ์ดรวมขอข้อมูล (ใบเดียว ปุ่มเฉพาะเรื่องที่ยังขาด) + เตรียมตัวเข้าพัก
 * แล้วตามด้วยปุ่มแจ้งยอดโอน · การ์ดเดี่ยวแต่ละเรื่องยังอยู่ครบในแผ่น "ทีละใบ"
 */

/** หัวข้อขอข้อมูลในชุดการ์ด — เลือกหลายหัวข้อรวมเป็นการ์ดใบเดียวหลายปุ่ม (นับ 1 ใบ) */
const INTAKE_PARTS = new Set(["stayInfo", "groomInfo", "vaccine", "idcard", "consent", "deposit"]);
/** จำนวนการ์ดจริงที่จะได้จากหัวข้อที่เลือก — หัวข้อขอข้อมูลกี่เรื่องก็รวมเป็นใบเดียว */
const bundleCardCount = (parts: string[]) => {
  const intake = parts.filter((p) => INTAKE_PARTS.has(p)).length;
  return parts.length - intake + (intake > 0 ? 1 : 0);
};

/** เรื่องที่เลือกใส่ในการ์ดขอข้อมูลได้ (info = ประวัติ/ข้อมูลก่อนเข้าพักตามบริการ) — เรียงตามลำดับขั้น */
// payment = การ์ดแจ้งยอดชำระค่าบริการ (บิล) — ไม่ใช่เรื่องขอข้อมูล จึงส่งได้แค่แยกใบ
const INTAKE_PICK_KEYS = ["info", "vaccine", "idcard", "consent", "deposit", "payment"] as const;
type IntakePickKey = (typeof INTAKE_PICK_KEYS)[number];
/** แต่ละเรื่อง: ไม่ส่ง · รวม (อยู่ในการ์ดใบเดียวปุ่มเดียว) · แยก (การ์ดของตัวเอง) — ส่งพร้อมกันในครั้งเดียวได้ */
type IntakeMode = "off" | "combined" | "separate";
type IntakePick = { modes: Record<IntakePickKey, IntakeMode>; deposit: string };
const INTAKE_PICK_STORE = "petflow-intake-pick";

/** ตัวเลือกล่าสุดที่ร้านใช้ (เก็บในเครื่อง) — ครั้งแรก = ทุกเรื่องรวมใบเดียว ไม่ขอมัดจำ */
function loadIntakePick(depositAllowed: boolean): IntakePick {
  const modes = { info: "combined", vaccine: "combined", idcard: "combined", consent: "combined", deposit: "off", payment: "off" } as Record<
    IntakePickKey,
    IntakeMode
  >;
  let deposit = "";
  try {
    const saved = JSON.parse(localStorage.getItem(INTAKE_PICK_STORE) || "null");
    if (saved?.modes) {
      for (const k of INTAKE_PICK_KEYS) {
        const m = saved.modes[k];
        if (m === "off" || m === "combined" || m === "separate") modes[k] = m;
      }
      deposit = String(saved.deposit || "");
    }
  } catch {
    /* ไม่มีที่เก็บ = ใช้ค่าเริ่มต้น */
  }
  if (modes.payment === "combined") modes.payment = "separate";
  if (!depositAllowed) {
    modes.deposit = "off";
    deposit = "";
  }
  return { modes, deposit };
}

function saveIntakePick(pick: IntakePick) {
  try {
    localStorage.setItem(INTAKE_PICK_STORE, JSON.stringify(pick));
  } catch {
    /* เก็บไม่ได้ก็แค่ไม่จำ */
  }
}

/**
 * ปุ่มส่งหาลูกค้าแบบรวมศูนย์ — ใช้ได้ทุกที่ (การ์ดในปฏิทิน · บิล · ฯลฯ)
 * ปุ่มไหนโผล่ขึ้นกับ context ที่มี (booking / invoice / customer)
 * booking-based → /api/bookings · invoice/มัดจำ → /api/invoices
 *
 * ทุกปุ่มกดแล้วขึ้นพรีวิวการ์ดก่อนเสมอ (เซิร์ฟเวอร์คืน flex JSON ตัวเดียวกับที่จะส่งจริง
 * แค่ข้ามขั้นตอน push + การเขียนข้อมูลที่มีผลจริง) กดยืนยันในพรีวิวถึงจะยิงจริง
 */
export function CustomerSendButtons({
  lineUserId,
  customerId,
  bookingId,
  invoiceId,
  service,
  invoiceDeposit = 0,
  invoiceStatus,
  groomBookingIds,
  initialAutoOff,
  onDone,
  open,
  onOpenChange,
  hideTrigger,
}: {
  lineUserId?: string;
  customerId?: string;
  bookingId?: string;
  invoiceId?: string;
  service?: "room" | "groom" | "both";
  invoiceDeposit?: number;
  /** สถานะบิลที่ส่งมาจากหน้าบิล — ใช้ล็อกไม่ให้ส่งใบเสร็จตอนยังไม่จ่าย */
  invoiceStatus?: string;
  /** ถ้านัดนี้เป็นการ์ดรวมหลายตัว (จองทั้งบ้าน) — bookingId ของทุกตัว เอาไว้ส่งการ์ดสอบถามประวัติแยกให้ครบทุกตัว */
  groomBookingIds?: string[];
  /** หัวข้อข้อความอัตโนมัติที่นัดนี้ปิดไว้แล้ว (ถ้ามี) — ให้ปุ่มเปิด/ปิดตรงนี้เริ่มตรงกับของจริง */
  initialAutoOff?: string[];
  onDone?: () => void;
  /** (ไม่บังคับ) ควบคุมการเปิดแผ่นส่งการ์ดจากข้างนอก — เช่นเมนู ⋯ ของบิล */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** ซ่อนปุ่ม "ส่ง LINE" ของตัวเอง (ใช้คู่กับ open/onOpenChange) */
  hideTrigger?: boolean;
}) {
  const { config } = useConfig();
  // การ์ดที่ร้านปิดในตั้งค่า › เปิด/ปิดฟีเจอร์ ไม่มีปุ่มให้ส่ง
  const on = (part: string) => cardOn(config, part);
  const [busy, setBusy] = useState("");
  const [pending, setPending] = useState<PendingSend | null>(null);
  const [sending, setSending] = useState(false);
  const noLine = !lineUserId;

  // ถ้ามาจากการ์ดนัด (มี bookingId แต่ไม่มี invoiceId) → ไปหาบิลที่ผูกกับนัดนั้นเอง
  const [foundInvoiceId, setFoundInvoiceId] = useState<string | undefined>();
  const [foundDeposit, setFoundDeposit] = useState(0);
  const [foundStatus, setFoundStatus] = useState<string | undefined>();
  useEffect(() => {
    if (invoiceId || !bookingId) return;
    let alive = true;
    fetch(`/api/invoices?bookingId=${bookingId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d.invoice) return;
        setFoundInvoiceId(d.invoice.id);
        setFoundDeposit(d.invoice.deposit || 0);
        setFoundStatus(d.invoice.status);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [invoiceId, bookingId]);

  const invId = invoiceId || foundInvoiceId;
  // เรียกเก็บมัดจำได้จากหน้าบิลเท่านั้น (ต้องออกบิลก่อน) — หน้านัดไม่มีปุ่มมัดจำ
  const canAskDeposit = !bookingId || !!invoiceId;
  // บิลที่มีทั้งอาบน้ำและเข้าพัก (service = "both") ต้องเห็นการ์ดฝั่งเข้าพักด้วย
  const hasRoomStay = service === "room" || service === "both";
  /**
   * นัดอาบน้ำอย่างเดียวไม่มีเรื่องของการเข้าพัก (สมุดวัคซีน/บัตร/กฎ/เตรียมตัว/เวลาเข้า-ออก/มัดจำ)
   * เว้นแต่ร้านตั้งให้ขอในนัดอาบน้ำด้วย (ตั้งค่า › ขอข้อมูลตามบริการ เช่น สมุดวัคซีน)
   */
  const stayOk = service !== "groom";
  const stayOn = (part: string) => (stayOk || groomUsesCard(config, part)) && on(part);
  const depForBill = invoiceId ? invoiceDeposit : foundDeposit;
  const billPaid = (invoiceId ? invoiceStatus : foundStatus) === "paid";

  /** ขั้นที่ 1: ขอตัวอย่างการ์ดจากเซิร์ฟเวอร์ (preview: true) — ยังไม่ส่งจริง ยังไม่แตะข้อมูลจริง */
  const requestPreview = async (
    url: string,
    body: Record<string, unknown>,
    okMsg: string,
    busyKey: string
  ) => {
    setBusy(busyKey);
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, preview: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(d.preview)) {
        setPending({ url, method: "PATCH", body, okMsg, busyKey, messages: d.preview, skipped: d.skipped });
      } else {
        toast(d.error ? `โหลดตัวอย่างไม่สำเร็จ: ${d.error}` : "โหลดตัวอย่างไม่สำเร็จ", "error");
      }
    } finally {
      setBusy("");
    }
  };

  /** ขั้นที่ 2: กดยืนยันในพรีวิว → ยิงคำขอเดิมซ้ำแบบไม่ preview (ส่งจริง + เขียนข้อมูลจริง) */
  const confirmSend = async () => {
    if (!pending) return;
    setSending(true);
    try {
      const res = await fetch(pending.url, {
        method: pending.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending.body),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        const note = d.skipped?.length ? ` · ข้ามให้: ${d.skipped.join(", ")}` : "";
        toast(pending.okMsg + note, "success");
        onDone?.();
        setPending(null);
        setSheetOpen(false);
      } else {
        toast(d.error ? `ส่งไม่สำเร็จ: ${d.error}` : "ส่งไม่สำเร็จ — ตรวจ LINE / ตั้งค่า", "error");
      }
    } finally {
      setSending(false);
    }
  };

  const bookingSend = (action: string, okMsg: string) =>
    requestPreview(
      "/api/bookings",
      {
        id: bookingId,
        action,
        lineUserId,
        // บ้านเดียวกัน จองพร้อมกันหลายตัว — ทุกการ์ดที่อิงข้อมูลนัด (แจ้งเตือนนัด/เตรียมตัว/
        // เงื่อนไข/เลือกเวลา/ยอดคงเหลือ) รวมชื่อทุกตัวในใบเดียวเสมอ ไม่ใช่แค่ตัวที่กดจากแถวนั้น
        ids: groomBookingIds,
      },
      okMsg,
      action
    );

  // นัดที่จองทั้งบ้าน (หลายตัวพร้อมกัน) — ส่งการ์ดเดียว ลิงก์เดียว ให้กรอกประวัติครบทุกตัวในหน้าเดียวกัน
  // kind: "stay" = ฟอร์มข้อมูลก่อนเข้าพัก, "groom" = ประวัติก่อนอาบน้ำ (ส่งได้ทั้งสองแบบทุกนัด)
  const sendGroomInfoAll = (kind: "stay" | "groom") => {
    const ids =
      groomBookingIds && groomBookingIds.length > 0
        ? groomBookingIds
        : bookingId
          ? [bookingId]
          : [];
    if (ids.length === 0) return;
    return requestPreview(
      "/api/bookings",
      { id: ids[0], action: "send_groom_info_group", ids, lineUserId, kind },
      `ส่งการ์ด${kind === "stay" ? INTAKE_LABEL.stayInfo : INTAKE_LABEL.groomInfo}แล้ว${
        ids.length > 1 ? ` (${ids.length} ตัว)` : ""
      } 🩺`,
      kind === "stay" ? "send_stay_info" : "send_groom_info"
    );
  };

  // 📋 การ์ดขอข้อมูล — กดแล้วเปิดช่องให้ร้านเลือกทีละเรื่องว่า ไม่ส่ง / รวม / แยก (มัดจำด้วย)
  // เรื่องที่ "รวม" อยู่ในการ์ดใบเดียวปุ่มเดียวไล่ทีละหน้า · "แยก" ได้การ์ดของตัวเอง — ไปใน LINE ข้อความเดียวกัน
  // จำตัวเลือกล่าสุดไว้ในเครื่อง · เซิร์ฟเวอร์ยังข้ามเรื่องที่ลูกค้าส่งแล้วให้เองเหมือนเดิม
  const [intakePick, setIntakePick] = useState<IntakePick | null>(null);
  const sendIntake = () => setIntakePick(loadIntakePick(hasRoomStay));
  const confirmIntake = () => {
    if (!intakePick) return;
    const { modes } = intakePick;
    const withDeposit = canAskDeposit && hasRoomStay && modes.deposit !== "off";
    const depositAmount = withDeposit ? Math.max(0, Math.round(Number(intakePick.deposit) || 0)) : 0;
    if (withDeposit && depositAmount <= 0) {
      toast("ใส่ยอดมัดจำ หรือเลือก \"ไม่ส่ง\" ที่มัดจำ", "error");
      return;
    }
    const partOf = (k: IntakePickKey) => (k === "info" ? (hasRoomStay ? "stayInfo" : "groomInfo") : k);
    const on = intakePickOptions.map((o) => o.key).filter((k) => k !== "deposit" && modes[k] !== "off");
    if (on.length === 0 && !withDeposit) {
      toast("เลือกอย่างน้อย 1 เรื่อง", "error");
      return;
    }
    saveIntakePick(intakePick);
    setIntakePick(null);
    void requestPreview(
      "/api/bookings",
      {
        id: bookingId,
        action: "send_intake",
        lineUserId,
        ids: groomBookingIds,
        parts: on.map(partOf),
        separateParts: INTAKE_PICK_KEYS.filter((k) => modes[k] === "separate").map(partOf),
        depositAmount: depositAmount || undefined,
      },
      "ส่งการ์ดขอข้อมูลแล้ว 📋",
      "send_intake"
    );
  };
  const intakePickOptions: { key: IntakePickKey; label: string }[] = [
    { key: "info", label: hasRoomStay ? INTAKE_LABEL.stayInfo : INTAKE_LABEL.groomInfo },
    // สมุดวัคซีน บัตรประชาชน และกฎ/กดยินยอม เป็นเรื่องของการเข้าพัก —
    // นัดอาบน้ำโชว์เฉพาะที่ร้านตั้งให้ขอ (ตั้งค่า › ขอข้อมูลตามบริการ)
    ...(
      [
        { key: "vaccine" as const, label: "สมุดวัคซีน" },
        { key: "idcard" as const, label: "บัตรประชาชน" },
        { key: "consent" as const, label: hasRoomStay ? INTAKE_LABEL.consent : "ข้อตกลงอาบน้ำ + กดยินยอม" },
      ]
    ).filter((o) => hasRoomStay || groomUsesCard(config, o.key)),
    ...(hasRoomStay && canAskDeposit
      ? [{ key: "deposit" as const, label: depForBill > 0 ? `มัดจำ (ขอแล้ว ${depForBill.toLocaleString()}฿)` : "มัดจำ" }]
      : []),
    ...(invId && !billPaid
      ? [{ key: "payment" as const, label: depForBill > 0 ? "ชำระค่าบริการ (ยอดคงเหลือ)" : "ชำระค่าบริการ" }]
      : []),
  ];

  const invoiceSummary = (mode: string, okMsg: string) =>
    requestPreview("/api/invoices", { id: invId, action: "send_summary", mode }, okMsg, "inv:" + mode);

  const sendReview = () =>
    requestPreview(
      "/api/invoices",
      { id: invId, action: "send_review" },
      "ส่งการ์ดขอรีวิวแล้ว ⭐",
      "inv:review"
    );

  const sendReceipt = () =>
    requestPreview(
      "/api/invoices",
      { id: invId, action: "send_receipt" },
      "ส่งใบเสร็จรับเงินแล้ว 🧾",
      "inv:receipt"
    );

  const depositRequest = () => {
    // ถ้าบิลมีมัดจำอยู่แล้ว → เคยเรียกเก็บไปแล้ว กันส่งซ้ำโดยไม่ตั้งใจ ต้องกดยืนยันอีกที
    if (depForBill > 0) {
      const ok = confirm(
        `เรียกเก็บมัดจำนัดนี้ไปแล้ว ${depForBill.toLocaleString()} บาท — ต้องการส่งการ์ดซ้ำอีกครั้งไหม?`
      );
      if (!ok) return;
    }
    let amount = depForBill > 0 ? depForBill : 0;
    if (amount <= 0) {
      const raw = prompt("เรียกเก็บมัดจำเท่าไหร่? (บาท)");
      if (raw == null) return;
      amount = Math.round(Number(raw) || 0);
    }
    if (amount <= 0) {
      toast("ใส่จำนวนมัดจำ", "error");
      return;
    }
    // เซิร์ฟเวอร์จะผูกมัดจำให้เอง — มีบิลอยู่แล้วก็ผูกเข้าบิลนั้น
    // ไม่มีบิลก็พักไว้เป็นเครดิตมัดจำล่วงหน้า หักอัตโนมัติตอนออกบิลถัดไป
    void requestPreviewPost(
      "/api/invoices",
      { action: "send_deposit_request", customerId, amount, invoiceId: invId },
      invId
        ? `ส่งการ์ดเรียกเก็บมัดจำ ${amount.toLocaleString()} บาทแล้ว 📨 (ผูกกับบิลนี้แล้ว)`
        : `ส่งการ์ดเรียกเก็บมัดจำ ${amount.toLocaleString()} บาทแล้ว 📨 (จะหักเข้าบิลถัดไปให้อัตโนมัติ)`,
      "dep"
    );
  };

  // POST-based preview (send_deposit_request ใช้ POST ไม่ใช่ PATCH เหมือนตัวอื่น)
  const requestPreviewPost = async (
    url: string,
    body: Record<string, unknown>,
    okMsg: string,
    busyKey: string
  ) => {
    setBusy(busyKey);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, preview: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(d.preview)) {
        setPending({ url, method: "POST", body, okMsg, busyKey, messages: d.preview });
      } else {
        toast(d.error ? `โหลดตัวอย่างไม่สำเร็จ: ${d.error}` : "โหลดตัวอย่างไม่สำเร็จ", "error");
      }
    } finally {
      setBusy("");
    }
  };

  // 🔕 ปิดข้อความอัตโนมัติเฉพาะนัดนี้ — แก้ได้จากทุกที่ที่มีปุ่มส่ง LINE
  // (เดิมแก้ได้แค่ในหน้าแก้ไขนัดที่ ตารางนัด ย้ายมาไว้ตรงนี้ด้วยจะได้แก้จากหน้าคิดเงินได้เลย)
  const [autoOff, setAutoOff] = useState<string[]>(initialAutoOff || []);
  // แตะติดๆ กันได้เลย ไม่ล็อกปุ่มทั้งแถวระหว่างบันทึก (เดิมทุกชิปจางค้าง + iPhone วาดชิปซ้อนค้างไว้)
  // เก็บค่าล่าสุดใน ref แล้วบันทึกทีละครั้งตามลำดับ — ค่าสุดท้ายที่แตะคือค่าที่ถูกบันทึก
  const autoOffRef = useRef<string[]>(autoOff);
  const autoOffSaved = useRef<string[]>(autoOff);
  const autoOffSaving = useRef(false);
  useEffect(() => {
    if (autoOffSaving.current) return;
    autoOffRef.current = initialAutoOff || [];
    autoOffSaved.current = initialAutoOff || [];
    setAutoOff(initialAutoOff || []);
  }, [initialAutoOff]);
  const saveAutoOff = async () => {
    if (!bookingId || autoOffSaving.current) return;
    autoOffSaving.current = true;
    let ok = true;
    let last = autoOffSaved.current;
    try {
      while (autoOffRef.current !== last) {
        const next = autoOffRef.current;
        const res = await fetch("/api/bookings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: bookingId, action: "update", autoOff: next }),
        }).catch(() => null);
        if (!res?.ok) {
          ok = false;
          break;
        }
        last = next;
      }
    } finally {
      autoOffSaving.current = false;
    }
    if (ok) {
      const before = autoOffSaved.current;
      autoOffSaved.current = last;
      const turnedOff = last.length > before.length;
      toast(turnedOff ? "ปิดข้อความหัวข้อนี้แล้ว 🔕" : "เปิดกลับมาส่งตามปกติแล้ว", "success");
      onDone?.();
    } else {
      // ย้อนกลับเป็นค่าที่บันทึกได้ล่าสุด ถ้าบันทึกไม่สำเร็จ
      autoOffRef.current = autoOffSaved.current;
      setAutoOff(autoOffSaved.current);
      toast("บันทึกไม่สำเร็จ", "error");
    }
  };
  const toggleAutoOff = (topic: string) => {
    if (!bookingId) return;
    const cur = autoOffRef.current;
    const next = cur.includes(topic) ? cur.filter((x) => x !== topic) : [...cur, topic];
    autoOffRef.current = next;
    setAutoOff(next);
    void saveAutoOff();
  };

  // 📦 ชุดการ์ด — เลือกหลายใบ ส่งใน push เดียว (LINE นับ 1 ข้อความ)
  const [bundleParts, setBundleParts] = useState<string[]>([]);
  // LINE ส่งได้สูงสุด 5 การ์ดต่อ 1 ข้อความ — กันเลือกเกินแล้วโดนตัดทิ้งเงียบๆ
  const BUNDLE_MAX = 5;
  const toggleBundlePart = (p: string) =>
    setBundleParts((prev) => {
      if (prev.includes(p)) return prev.filter((x) => x !== p);
      if (bundleCardCount([...prev, p]) > BUNDLE_MAX) {
        toast(`เลือกได้สูงสุด ${BUNDLE_MAX} การ์ดต่อ 1 ข้อความ`, "error");
        return prev;
      }
      return [...prev, p];
    });

  const sendBundle = () => {
    if (!bookingId || bundleParts.length === 0) return;
    let depositAmount = 0;
    if (bundleParts.includes("deposit")) {
      const raw = prompt(
        "เรียกเก็บมัดจำเท่าไหร่? (บาท)",
        depForBill > 0 ? String(depForBill) : ""
      );
      if (raw == null) return;
      depositAmount = Math.round(Number(raw) || 0);
      if (depositAmount <= 0) {
        toast("ใส่จำนวนมัดจำ", "error");
        return;
      }
    }
    void requestPreview(
      "/api/bookings",
      {
        id: bookingId,
        action: "send_bundle",
        parts: bundleParts,
        // เปิดจากหน้าบิล — ให้เซิร์ฟเวอร์ใช้บิลนี้ตรงๆ (บิลที่ไม่ได้ผูก bookingId หาจากนัดไม่เจอ)
        invoiceId: invId || undefined,
        depositAmount: depositAmount || undefined,
        lineUserId,
        // บ้านเดียวกัน จองพร้อมกันหลายตัว — ให้การ์ด "แจ้งเตือนนัด" ในชุดรวมชื่อทุกตัวด้วย
        ids: groomBookingIds,
      },
      `ส่งชุดการ์ด ${bundleCardCount(bundleParts)} ใบใน 1 ข้อความแล้ว 📦`,
      "bundle"
    );
  };

  const hasRemaining = depForBill > 0;

  // ครบทุกหัวข้อเท่ากับปุ่มเดี่ยวด้านบน — เลือกผสมได้อิสระ ส่งใน 1 ข้อความ
  // การ์ดของการเข้าพัก (ข้อมูลก่อนเข้าพัก/บัตร/เตรียมตัว/เลือกเวลา) ไม่ขึ้นในนัดอาบน้ำอย่างเดียว
  // ใบที่ต้องมีบิล/จ่ายแล้วยังซ่อนไว้จนกว่าจะมีข้อมูลจริง (กันส่งการ์ดว่าง)
  // ชุดถามข้อมูลก่อนรับน้องขึ้นก่อน ชื่อ/ลำดับเดียวกับหน้าข้อมูลลูกค้า
  const BUNDLE_OPTIONS: { key: string; label: string; when: boolean }[] = [
    { key: "stayInfo", label: INTAKE_LABEL.stayInfo, when: !!bookingId && stayOn("stayInfo") },
    { key: "groomInfo", label: INTAKE_LABEL.groomInfo, when: !!bookingId && on("groomInfo") },
    { key: "vaccine", label: INTAKE_LABEL.vaccine, when: !!bookingId && stayOn("vaccine") },
    { key: "idcard", label: INTAKE_LABEL.idcard, when: !!bookingId && stayOn("idcard") },
    { key: "consent", label: INTAKE_LABEL.consent, when: !!bookingId && stayOn("consent") },
    { key: "prestay", label: INTAKE_LABEL.prestay, when: !!bookingId && stayOn("prestay") },
    { key: "reminder", label: "แจ้งเตือนนัด", when: !!bookingId },
    { key: "checkin", label: "เลือกเวลาเช็คอิน", when: !!bookingId && stayOn("checkin") },
    { key: "checkout", label: "เลือกเวลาเช็คเอาท์", when: !!bookingId && stayOn("checkout") },
    { key: "deposit", label: "เรียกเก็บมัดจำ", when: canAskDeposit },
    {
      key: "depositThanks",
      label: "ยืนยันรับมัดจำแล้ว",
      when: !!invId && hasRemaining,
    },
    { key: "summary", label: "สรุปการจอง", when: !!invId },
    {
      key: "payment",
      label: hasRemaining ? "เก็บส่วนที่เหลือ" : "แจ้งเก็บเงิน",
      when: !!invId && !billPaid,
    },
    // ใบเสร็จส่งได้เฉพาะบิลที่จ่ายแล้ว — กันส่งใบเสร็จของบิลที่ยังไม่ได้เงิน
    { key: "receipt", label: "ใบเสร็จ", when: !!invId && billPaid },
    { key: "review", label: "ขอรีวิว", when: !!invId },
  ];

  // ── รายการการ์ดเดี่ยว — ทุกปุ่มเดิมยังอยู่ครบ แค่ย้ายเข้าแผ่นล่าง (bottom sheet) ใบเดียว
  // ใบที่น่าจะใช้ที่สุดของบิล (ใบเสร็จ / แจ้งเก็บเงิน) ขึ้นก่อน
  const singleActions: { k: string; label: string; icon: string; when: boolean; onClick: () => void }[] = [
    {
      // จ่ายแล้ว = ส่งใบเสร็จได้ — กดส่งเองเสมอ ระบบไม่ยิงให้อัตโนมัติตอนกดรับเงิน
      // ส่งจากบิลตรงๆ ไม่ต้องมีนัดผูก (บิลที่ออกเองก็ส่งใบเสร็จได้)
      k: "inv:receipt",
      label: "ส่งใบเสร็จรับเงิน",
      icon: "receipt",
      when: !!invId && billPaid,
      onClick: sendReceipt,
    },
    {
      k: hasRemaining ? "inv:remaining" : "inv:full",
      label: hasRemaining ? "เก็บส่วนที่เหลือ" : "แจ้งเก็บเงิน",
      icon: "wallet",
      when: !!invId && !billPaid,
      onClick: () =>
        invoiceSummary(
          hasRemaining ? "remaining" : "full",
          hasRemaining ? "ส่งแจ้งเก็บส่วนที่เหลือแล้ว 💳" : "ส่งแจ้งเก็บเงินแล้ว 💳"
        ),
    },
    {
      k: "inv:booking",
      label: "สรุปการจอง",
      icon: "doc",
      when: !!invId,
      onClick: () => invoiceSummary("booking", "ส่งสรุปการจองแล้ว 🧾"),
    },
    // ── ชุดถามข้อมูลก่อนรับน้อง (ชื่อ/ลำดับเดียวกับหน้าข้อมูลลูกค้า) ──
    {
      // ใบเดียวหลายปุ่ม — ระบบดูให้ว่ายังขาดอะไร ครบแล้วไม่ขอซ้ำ
      k: "send_intake",
      label: "ขอข้อมูลลูกค้า (เลือกรวม/แยกการ์ด)",
      icon: "inbox",
      when: !!bookingId,
      onClick: sendIntake,
    },
    {
      k: "send_stay_info",
      label: `${INTAKE_LABEL.stayInfo}${groomBookingIds && groomBookingIds.length > 1 ? ` (${groomBookingIds.length} ตัว)` : ""}`,
      icon: "edit",
      when: !!bookingId && stayOn("stayInfo"),
      onClick: () => void sendGroomInfoAll("stay"),
    },
    {
      k: "send_groom_info",
      label: `${INTAKE_LABEL.groomInfo}${groomBookingIds && groomBookingIds.length > 1 ? ` (${groomBookingIds.length} ตัว)` : ""}`,
      icon: "bath",
      when: !!bookingId && on("groomInfo"),
      onClick: () => void sendGroomInfoAll("groom"),
    },
    {
      k: "send_vaccine_request",
      label: INTAKE_LABEL.vaccine,
      icon: "image",
      when: !!bookingId && stayOn("vaccine"),
      onClick: () => bookingSend("send_vaccine_request", "ส่งการ์ดขอสมุดวัคซีนแล้ว 💉"),
    },
    {
      k: "send_idcard_request",
      label: INTAKE_LABEL.idcard,
      icon: "user",
      when: !!bookingId && stayOn("idcard"),
      onClick: () => bookingSend("send_idcard_request", "ส่งการ์ดขอบัตรประชาชนแล้ว 🪪"),
    },
    {
      k: "send_consent",
      label: INTAKE_LABEL.consent,
      icon: "doc",
      when: !!bookingId && stayOn("consent"),
      onClick: () => bookingSend("send_consent", "ส่งการ์ดกฎ + กดยินยอมแล้ว 📋"),
    },
    {
      k: "send_prestay",
      label: INTAKE_LABEL.prestay,
      icon: "bed",
      when: !!bookingId && stayOn("prestay"),
      onClick: () => bookingSend("send_prestay", "ส่งการ์ดแจ้งเตรียมตัวเข้าพักแล้ว 🏠"),
    },
    {
      k: "send_reminder",
      label: "แจ้งเตือนนัด",
      icon: "message",
      when: !!bookingId,
      onClick: () => bookingSend("send_reminder", "ส่งแจ้งเตือนนัดแล้ว 📨"),
    },
    {
      k: "send_checkin_reminder",
      label: "เตือนเช็คอิน + เลือกเวลา",
      icon: "calendar",
      when: !!bookingId && hasRoomStay && stayOn("checkin"),
      onClick: () => bookingSend("send_checkin_reminder", "ส่งการ์ดเลือกเวลาเช็คอินแล้ว 🧳"),
    },
    {
      k: "send_checkout_reminder",
      label: "เตือนเช็คเอาท์ + เลือกเวลา",
      icon: "clock",
      when: !!bookingId && hasRoomStay && on("checkout"),
      onClick: () => bookingSend("send_checkout_reminder", "ส่งการ์ดเลือกเวลาเช็คเอาท์แล้ว 🧳"),
    },
    {
      k: "dep",
      label:
        depForBill > 0 ? `ขอมัดจำแล้ว (${depForBill.toLocaleString()}฿) · ส่งซ้ำ` : "เรียกเก็บมัดจำ",
      icon: "money",
      when: !!customerId && canAskDeposit,
      onClick: depositRequest,
    },
    {
      // ยอดคงเหลือจากนัด — ใช้เมื่อยังไม่มีบิลผูก (มีบิลแล้วใช้ "แจ้งเก็บเงิน" แทน)
      k: "send_deposit_reminder",
      label: "ยอดคงเหลือ",
      icon: "money",
      when: !!bookingId && !invId,
      onClick: () => bookingSend("send_deposit_reminder", "ส่งแจ้งยอดคงเหลือแล้ว 💰"),
    },
    { k: "inv:review", label: "ขอรีวิว", icon: "star", when: !!invId, onClick: sendReview },
  ];
  const intakeAction = singleActions.find((a) => a.k === "send_intake" && a.when);

  // แผ่นล่างเปิด/ปิด — ควบคุมจากข้างนอกได้ (หน้าบิลเปิดจากเมนู ⋯) หรือใช้ปุ่มของตัวเอง
  const [ownOpen, setOwnOpen] = useState(false);
  const sheetOpen = open ?? ownOpen;
  const setSheetOpen = (v: boolean) => {
    setOwnOpen(v);
    onOpenChange?.(v);
  };
  type Tab = "single" | "bundle" | "auto";
  const [tab, setTab] = useState<Tab>("single");
  const tabs: { id: Tab; label: string; badge?: number }[] = bookingId
    ? [
        { id: "single", label: "ทีละใบ" },
        { id: "bundle", label: "ชุดการ์ด", badge: bundleParts.length || undefined },
        { id: "auto", label: "อัตโนมัติ", badge: autoOff.length || undefined },
      ]
    : [];
  const activeTab: Tab = bookingId ? tab : "single";

  return (
    <>
      {pending && (
        <PreviewSendModal
          messages={pending.messages}
          skipped={pending.skipped}
          sending={sending}
          onConfirm={confirmSend}
          onCancel={() => setPending(null)}
        />
      )}

      {intakePick && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-3"
          onClick={() => setIntakePick(null)}
        >
          <div
            className="w-full max-w-md rounded-t-[28px] bg-card px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 shadow-petflow sm:rounded-petflow"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Request info</p>
            <p className="mb-3 text-sm font-extrabold text-petflow-chocolate">ขอข้อมูลลูกค้า — เลือกว่าจะส่งอะไรบ้าง</p>

            <ul className="divide-y divide-petflow-line rounded-petflow-sm border border-petflow-line">
              {intakePickOptions.map((o) => (
                <li key={o.key} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 text-xs font-bold text-petflow-chocolate">{o.label}</span>
                  <div className="flex shrink-0 gap-1 rounded-full bg-paper p-1">
                    {(
                      [
                        ["off", "ไม่ส่ง"],
                        ["combined", "รวม"],
                        ["separate", "แยก"],
                      ] as const
                    )
                      .filter(([m]) => !(o.key === "payment" && m === "combined"))
                      .map(([m, label]) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() =>
                          setIntakePick({ ...intakePick, modes: { ...intakePick.modes, [o.key]: m } })
                        }
                        className={`min-h-[34px] rounded-full px-3 text-[11px] font-bold ${
                          intakePick.modes[o.key] === m
                            ? m === "off"
                              ? "bg-card text-brown shadow-petflow-sm"
                              : "bg-latte-deep text-white"
                            : "text-brown-soft"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            {intakePick.modes.deposit !== "off" && (
              <label className="mt-3 flex items-center gap-2 text-xs font-bold text-petflow-chocolate">
                ยอดมัดจำ
                <input
                  inputMode="numeric"
                  value={intakePick.deposit}
                  onChange={(e) => setIntakePick({ ...intakePick, deposit: e.target.value.replace(/[^0-9]/g, "") })}
                  placeholder="เช่น 500"
                  className="min-h-[40px] w-28 rounded-petflow-sm border border-petflow-line bg-paper px-3 text-sm"
                />
                บาท
              </label>
            )}
            <p className="mt-2 text-[11px] text-brown-soft">
              รวม = อยู่ในการ์ดใบเดียว ปุ่มเดียว ลูกค้ากดแล้วระบบพาไปทีละหน้า · แยก = การ์ดของตัวเอง ·
              ทั้งหมดส่งไปใน LINE ข้อความเดียว · เรื่องที่ลูกค้าส่งแล้วระบบข้ามให้เอง
            </p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setIntakePick(null)}
                className="min-h-[48px] flex-1 rounded-petflow-sm bg-paper text-sm font-bold text-brown"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={busy !== ""}
                onClick={confirmIntake}
                className="flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-petflow-sm bg-latte-deep text-sm font-extrabold text-white disabled:opacity-40"
              >
                <Icon name="eye" size={16} />
                ดูตัวอย่างการ์ด
              </button>
            </div>
          </div>
        </div>
      )}

      {!hideTrigger && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex min-h-[40px] items-center gap-2 rounded-full bg-[#06C755]/15 px-4 py-2 text-xs font-extrabold text-[#06883c]"
        >
          <Icon name="send" size={16} />
          ส่ง LINE
          {noLine && <span className="font-bold text-brown-soft">· ยังไม่ผูก</span>}
          {autoOff.length > 0 && (
            <span className="rounded-full bg-wait/15 px-1.5 text-[10px] text-wait">
              ปิดอัตโนมัติ {autoOff.length}
            </span>
          )}
        </button>
      )}

      {sheetOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-3"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-card px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-petflow sm:rounded-petflow"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-petflow-line sm:hidden" />
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#06C755]/15 text-[#06883c]">
                <Icon name="send" size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Send · LINE</p>
                <p className="truncate text-sm font-extrabold text-petflow-chocolate">ส่งการ์ดหาลูกค้า</p>
              </div>
              <button
                type="button"
                aria-label="ปิด"
                onClick={() => setSheetOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper text-brown"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            {noLine && (
              <p className="mb-3 flex items-center gap-2 rounded-petflow-sm bg-wait/10 px-3 py-2 text-[11px] font-bold text-wait">
                <Icon name="alert" size={16} />
                ลูกค้ายังไม่ผูก LINE — ส่งการ์ดไม่ได้
              </p>
            )}

            {/* ขอข้อมูลลูกค้า — เลือกทีละเรื่องว่า ไม่ส่ง / รวมการ์ด / แยกการ์ด แล้วส่งใน LINE ข้อความเดียว */}
            {intakeAction && (
              <button
                type="button"
                disabled={noLine || busy !== ""}
                onClick={() => {
                  setSheetOpen(false);
                  intakeAction.onClick();
                }}
                className="mb-3 flex min-h-[56px] w-full items-center gap-3 rounded-petflow-sm bg-latte-deep px-3 py-2.5 text-left text-white active:opacity-90 disabled:opacity-40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
                  <Icon name={intakeAction.icon} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold">ขอข้อมูลลูกค้า</span>
                  <span className="block text-[11px] font-bold text-white/80">เลือกเรื่อง · รวมการ์ด / แยกการ์ด</span>
                </span>
                <Icon name="chevron" size={16} />
              </button>
            )}

            {tabs.length > 0 && (
              <Segmented value={activeTab} onChange={setTab} options={tabs} className="mb-3" />
            )}

            {activeTab === "single" && (
              <ul className="divide-y divide-petflow-line overflow-hidden rounded-petflow-sm border border-petflow-line bg-card">
                {singleActions
                  .filter((a) => a.when && a.k !== "send_intake")
                  .map((a) => (
                    <li key={a.k}>
                      <button
                        type="button"
                        disabled={noLine || busy !== ""}
                        onClick={a.onClick}
                        className="flex min-h-[48px] w-full items-center gap-3 px-3 py-2.5 text-left active:bg-paper disabled:opacity-40"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
                          <Icon name={a.icon} size={18} />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-petflow-chocolate">
                          {a.label}
                        </span>
                        {busy === a.k ? (
                          <span className="shrink-0 text-[11px] font-bold text-brown-soft">กำลังโหลด…</span>
                        ) : (
                          <Icon name="chevron" size={16} className="text-brown-faint" />
                        )}
                      </button>
                    </li>
                  ))}
              </ul>
            )}

            {/* ชุดการ์ด — รวมหลายใบส่งครั้งเดียว */}
            {activeTab === "bundle" && bookingId && (
              <div>
                <p className="mb-2 text-[11px] font-bold text-brown-soft">
                  เลือกการ์ดที่จะส่งพร้อมกัน ({bundleCardCount(bundleParts)}/{BUNDLE_MAX}) — ทั้งหมดรวมเป็น{" "}
                  <b>1 ข้อความ LINE</b> ตัดโควตาแค่ครั้งเดียว · เรื่องขอข้อมูล (ประวัติ/วัคซีน/บัตร/กฎ/มัดจำ)
                  เลือกหลายเรื่องจะรวมเป็นการ์ดใบเดียว
                </p>
                <div className="flex flex-wrap gap-2">
                  {BUNDLE_OPTIONS.filter((o) => o.when).map((o) => {
                    const on = bundleParts.includes(o.key);
                    return (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() => toggleBundlePart(o.key)}
                        className={`flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold ${
                          on ? "bg-latte-deep text-white" : "bg-paper text-brown-soft"
                        }`}
                      >
                        {on && <Icon name="check" size={14} strokeWidth={2.4} />}
                        {o.label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={noLine || bundleParts.length === 0 || busy !== ""}
                  onClick={sendBundle}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-petflow-sm bg-latte-deep py-3 text-sm font-extrabold text-white disabled:opacity-40"
                >
                  <Icon name="send" size={16} />
                  {busy === "bundle" ? "กำลังโหลด…" : `ส่ง ${bundleCardCount(bundleParts)} การ์ดใน 1 ข้อความ`}
                </button>
              </div>
            )}

            {/* ปิดข้อความอัตโนมัติเฉพาะนัดนี้ — แก้ตรงนี้ได้เลย ไม่ต้องไปเปิดหน้าแก้ไขนัด */}
            {activeTab === "auto" && bookingId && (
              <div>
                <p className="mb-2 text-[11px] font-bold text-brown-soft">
                  แตะหัวข้อที่ไม่อยากให้ระบบส่งอัตโนมัติหานัดนี้ (นัดอื่นไม่กระทบ)
                </p>
                <div className="flex flex-wrap gap-2">
                  {relevantAutoMessageTopics(service).filter((t) => on(t.id)).map((t) => {
                    const off = autoOff.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={off}
                        onClick={() => toggleAutoOff(t.id)}
                        className={`flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold ${
                          off ? "bg-wait text-white" : "bg-paper text-brown-soft"
                        }`}
                      >
                        {/* ไอคอนมีทุกสถานะ ชิปจะได้กว้างเท่าเดิม ไม่ดันกันขึ้นบรรทัดใหม่ตอนแตะ */}
                        <Icon name={off ? "x" : "check"} size={14} strokeWidth={2.4} />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
