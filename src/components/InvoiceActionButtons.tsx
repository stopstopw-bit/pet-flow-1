"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { MoreMenu } from "@/components/ui";
import { toast } from "@/components/Toast";
import { CancelToCreditButton } from "@/components/CancelToCreditButton";
import { askDepositReceive } from "@/lib/deposit-confirm";

type Inv = {
  id: string;
  total: number;
  deposit?: number;
  depositReceivedAt?: string;
  status: "pending" | "paid";
  customerId?: string;
  customerName?: string;
  lineUserId?: string;
};

/**
 * ปุ่มจัดการเงินของบิลที่ผูกกับนัด — ใช้ในหน้าตารางนัด ให้ทำได้เหมือนหน้าคิดบิล
 * (รับมัดจำ / รับเงิน / เงินสด / ยกเลิกชำระ / ลบบิล) — โผล่เฉพาะเมื่อมีบิลผูกอยู่
 */
export function InvoiceActionButtons({
  bookingId,
  onDone,
}: {
  bookingId?: string;
  onDone?: () => void;
}) {
  const [inv, setInv] = useState<Inv | null>(null);
  const [busy, setBusy] = useState("");
  const router = useRouter();

  const reload = useCallback(() => {
    if (!bookingId) return;
    fetch(`/api/invoices?bookingId=${bookingId}`)
      .then((r) => r.json())
      .then((d) => setInv(d.invoice || null))
      .catch(() => {});
  }, [bookingId]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!inv) return null;

  const remaining = inv.total - (inv.deposit ?? 0);
  const hasDeposit = (inv.deposit ?? 0) > 0;

  const act = async (
    key: string,
    body: Record<string, unknown>,
    okMsg: string,
    confirmMsg?: string
  ) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(key);
    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: inv.id, ...body }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        toast(okMsg, "success");
        reload();
        onDone?.();
      } else {
        toast(d.error ? `ไม่สำเร็จ: ${d.error}` : "ไม่สำเร็จ", "error");
      }
    } finally {
      setBusy("");
    }
  };

  const busyAny = busy !== "";
  // ถามก่อนเสมอ: ยืนยันลงบัญชี แล้วถามแยกว่าจะส่งการ์ดขอบคุณไหม (เดิมกดทีเดียวส่งการ์ดเลย)
  const receiveDeposit = () => {
    const ask = askDepositReceive(inv.customerName, inv.deposit ?? 0, !!inv.lineUserId);
    if (!ask) return;
    act(
      "receive_deposit",
      { action: "receive_deposit", notify: ask.notify },
      ask.notify ? "รับมัดจำแล้ว 💰 + ส่งการ์ดขอบคุณแล้ว" : "รับมัดจำแล้ว 💰 (ไม่ได้ส่งการ์ด)"
    );
  };
  const paidTransfer = () =>
    act(
      "paid_transfer",
      { action: "mark_paid", paymentMethod: "transfer" },
      "รับเงินแล้ว ✅ (ปิดบิล)"
    );
  const paidCash = () =>
    act("paid_cash", { action: "mark_paid", paymentMethod: "cash" }, "รับเงินสดแล้ว 💵 (ปิดบิล)");
  const unmarkPaid = () =>
    act(
      "unmark_paid",
      { action: "unmark_paid" },
      "ยกเลิกการชำระแล้ว ↩️ (กลับเป็นรอชำระ)",
      "ยกเลิกการชำระบิลนี้? (กดผิดใช่ไหม)\nจะกลับเป็น 'รอชำระ' + ย้อนรายรับ/แต้ม/เครดิต"
    );
  const goBill = () => router.push(`/admin/billing?bookingId=${bookingId}`);

  const paid = inv.status === "paid";
  const needDeposit = !paid && hasDeposit && !inv.depositReceivedAt;
  // ยอดที่รับมาแล้วจริง — โยกเป็นเครดิตได้ทั้งบิลที่จ่ายครบ และบิลที่รับมัดจำ/จ่ายบางส่วนไว้
  const received = paid ? inv.total : inv.depositReceivedAt ? inv.deposit ?? 0 : 0;

  return (
    <div className="mt-2 rounded-petflow-sm border border-petflow-line bg-paper/60 p-2.5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
          <Icon name="receipt" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-extrabold text-petflow-chocolate">
            {inv.total.toLocaleString()} ฿
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-px text-[10px] font-extrabold ${
                paid ? "bg-ok/15 text-ok" : "bg-wait/15 text-wait"
              }`}
            >
              <Icon name={paid ? "check" : "clock"} size={11} strokeWidth={2.4} />
              {paid ? "ชำระแล้ว" : "รอชำระ"}
            </span>
          </p>
          {hasDeposit && (
            <p className="truncate text-[11px] text-brown-soft">
              มัดจำ {inv.deposit!.toLocaleString()}
              {inv.depositReceivedAt || paid ? " (รับแล้ว)" : " (รอรับ)"}
              {remaining > 0 && !paid && (
                <span className="font-bold text-wait"> · คงเหลือ {remaining.toLocaleString()} บาท</span>
              )}
              {paid && (
                <span className="font-bold text-ok"> · รับครบ {inv.total.toLocaleString()} บาท</span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {paid ? (
          <Link
            href={`/admin/billing?bookingId=${bookingId}`}
            className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-full bg-card px-3 text-xs font-extrabold text-petflow-chocolate shadow-petflow-sm"
          >
            <Icon name="receipt" size={16} />
            ไปหน้าบิล
          </Link>
        ) : (
          <button
            type="button"
            disabled={busyAny}
            onClick={needDeposit ? receiveDeposit : paidTransfer}
            className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-honey to-honey-deep px-3 text-xs font-extrabold text-petflow-chocolate disabled:opacity-50"
          >
            <Icon name="money" size={16} />
            {busyAny
              ? "กำลังบันทึก…"
              : needDeposit
                ? "รับมัดจำแล้ว"
                : hasDeposit
                  ? "รับเงินที่เหลือ (ปิดบิล)"
                  : "รับเงินแล้ว"}
          </button>
        )}
        <MoreMenu
          items={
            paid
              ? [
                  { label: "ยกเลิกการชำระ (กดผิด)", icon: "back", onClick: unmarkPaid, danger: true, disabled: busyAny },
                ]
              : [
                  ...(needDeposit
                    ? [
                        {
                          label: hasDeposit ? "รับเงินที่เหลือ (ปิดบิล)" : "รับเงินแล้ว",
                          icon: "check",
                          onClick: paidTransfer,
                          disabled: busyAny,
                        },
                      ]
                    : []),
                  { label: "รับเป็นเงินสด (ปิดบิล)", icon: "money", onClick: paidCash, disabled: busyAny },
                  { label: "ไปหน้าบิล", icon: "receipt", onClick: goBill },
                ]
          }
        />
      </div>
      {/* ลูกค้าจ่ายแล้ว (ครบหรือบางส่วน) แต่ยกเลิก/ไม่มา — ยกเลิกนัด แล้วเก็บยอดไว้เป็นเครดิตใช้ครั้งหน้า */}
      {received > 0 && inv.customerId && (
        <div className="mt-2">
          <CancelToCreditButton
            invoiceId={inv.id}
            total={received}
            paid={paid}
            onDone={() => {
              reload();
              onDone?.();
            }}
          />
        </div>
      )}
    </div>
  );
}
