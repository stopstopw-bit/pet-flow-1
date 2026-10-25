"use client";

import { useState } from "react";
import { toast } from "@/components/Toast";
import { PreviewSendModal } from "@/components/PreviewSendModal";

/**
 * 🔁 ยกเลิกนัด เก็บยอดเป็นเครดิต — ปุ่มบนบิลที่รับเงินมาแล้ว (จ่ายครบ / มัดจำ / จ่ายบางส่วน)
 * ใช้ทั้งในตารางนัดและหน้าคิดบิล · `total` = ยอดที่รับมาแล้วจริง (ยอดที่จะเข้าเครดิต)
 * กดแล้วเปิดแผงยืนยันก่อน เลือกได้ว่าจะแจ้งยอดเครดิตทาง LINE ไหม (ติ๊ก → ดูการ์ดก่อนส่ง)
 */
export function CancelToCreditButton({
  invoiceId,
  total,
  onDone,
  size = "sm",
  paid = true,
}: {
  invoiceId: string;
  total: number;
  /** false = บิลยังไม่ปิด (รับมัดจำ/จ่ายบางส่วนมาแล้ว) */
  paid?: boolean;
  onDone?: () => void;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Record<string, unknown>[] | null>(null);

  const btn =
    size === "md"
      ? "rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-40"
      : "rounded-full px-2.5 py-1 text-[10px] font-bold disabled:opacity-40";

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: invoiceId, action: "cancel_to_credit", notify }),
      });
      const d = await res.json().catch(() => ({}));
      setPreview(null);
      if (res.ok) {
        setOpen(false);
        setNotify(false);
        toast(
          `ยกเลิกนัดแล้ว · เก็บเป็นเครดิต +${(d.amount ?? 0).toLocaleString()} บาท (คงเหลือ ${(d.balance ?? 0).toLocaleString()})` +
            (notify
              ? d.notifyError
                ? ` · ⚠️ ส่ง LINE ไม่ได้: ${d.notifyError}`
                : " · แจ้งลูกค้าแล้ว 💬"
              : ""),
          d.notifyError ? "error" : "success"
        );
        onDone?.();
      } else {
        toast(d.error ? `ไม่สำเร็จ: ${d.error}` : "ไม่สำเร็จ", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  /** ติ๊กแจ้ง LINE → ดูการ์ดก่อน (แบบเดียวกับเติมเครดิตหน้าลูกค้า) · ไม่ติ๊ก → ทำเลย */
  const start = async () => {
    if (!notify) return run();
    setBusy(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: invoiceId, action: "cancel_to_credit", notify: true, preview: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(d.preview) && d.preview.length > 0) {
        setPreview(d.preview);
      } else if (res.ok) {
        toast("ลูกค้ายังไม่มี LINE — เอาติ๊กแจ้ง LINE ออกแล้วกดใหม่", "error");
      } else {
        toast("ดูตัวอย่างการ์ดไม่สำเร็จ", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className={`${btn} bg-honey/40 text-petflow-chocolate`}
      >
        🔁 ยกเลิกนัด เก็บยอดเป็นเครดิต
      </button>
      {open && (
        <div className="mt-2 w-full rounded-petflow-sm border border-petflow-line bg-paper p-2 text-[10px] text-brown-soft">
          <p className="font-bold text-petflow-chocolate">
            🔁 ยกเลิกนัดนี้ แล้วเก็บยอด {total.toLocaleString()} บาท เป็นเครดิต Member
          </p>
          {paid ? (
            <p className="mt-0.5">
              บิลยังเป็น &quot;จ่ายแล้ว&quot; เหมือนเดิม · <b>ไม่ลงรายรับซ้ำ ไม่ให้แต้มซ้ำ</b> (ได้ไปแล้วตอนจ่ายบิล)
              · ประวัติเครดิตจะโชว์เลขบิลนี้ · ถ้าคืนเงินสดให้ลูกค้าจริง ใช้ &quot;ยกเลิกการชำระ&quot; แทน
            </p>
          ) : (
            <p className="mt-0.5">
              เก็บเฉพาะยอดที่รับมาแล้ว (มัดจำ/จ่ายบางส่วน) · <b>ไม่ลงรายรับซ้ำ</b> (ลงไปแล้วตอนรับเงิน)
              · หลังจากนี้บิลนี้รับเงินเพิ่มไม่ได้ · ประวัติเครดิตจะโชว์เลขบิลนี้
            </p>
          )}
          <label className="mt-1.5 flex items-center gap-1.5 font-bold">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              className="h-3.5 w-3.5 accent-latte-deep"
            />
            💬 แจ้งยอดเครดิตให้ลูกค้าทาง LINE (เสียโควตา 1 ข้อความ)
          </label>
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={start}
              className={`${btn} bg-sage/25 text-ok`}
            >
              {busy ? "…" : notify ? "🔍 ดูการ์ดก่อนยืนยัน" : "✅ ยืนยัน ยกเลิกนัด + เก็บเป็นเครดิต"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              className={`${btn} bg-paper text-brown-soft`}
            >
              ปิด
            </button>
          </div>
        </div>
      )}
      {preview && (
        <PreviewSendModal
          messages={preview}
          sending={busy}
          onConfirm={run}
          onCancel={() => setPreview(null)}
        />
      )}
    </>
  );
}
