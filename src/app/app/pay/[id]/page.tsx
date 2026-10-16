"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useConfig } from "@/components/ConfigProvider";
import Link from "next/link";
import { LoadingScreen } from "@/components/LoadingScreen";
import { BTN_SECONDARY, PageHeader } from "@/components/PageHeader";
import { SectionLabel } from "@/components/ui";
import { Icon } from "@/components/Icon";

type Invoice = {
  id: string;
  customerName: string;
  catName: string;
  items: { label: string; amount: number }[];
  subtotal: number;
  discount: number;
  promoLabel?: string;
  total: number;
  status: string;
};

type Payment = {
  bankName: string;
  accountNumber: string;
  accountName: string;
};

export default function PayPage() {
  const params = useParams();
  const { config } = useConfig();
  const id = String(params.id);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);

  useEffect(() => {
    fetch(`/api/invoices?id=${id}`)
      .then((r) => r.json())
      .then((data) => {
        setInvoice(data.invoice);
        setPayment(data.payment);
      });
  }, [id]);

  if (!invoice) {
    return <LoadingScreen message="กำลังโหลดข้อมูลบิล..." />;
  }

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader
        eyebrow="Payment"
        title="ชำระเงิน"
        subtitle={`${invoice.catName} · ${invoice.customerName}`}
        back="/app"
        backLabel="กลับหน้าหลัก"
        showLang={false}
      />

      <SectionLabel>Bill · รายการ</SectionLabel>
      <div className="overflow-hidden rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
        <ul className="divide-y divide-petflow-line text-sm text-brown">
          {invoice.items.map((item, i) => (
            <li key={i} className="flex justify-between gap-3 px-4 py-3">
              <span className="min-w-0">{item.label}</span>
              <span className="shrink-0 font-bold">{item.amount.toLocaleString()} ฿</span>
            </li>
          ))}
          {invoice.discount > 0 && (
            <li className="flex justify-between gap-3 px-4 py-3 text-ok">
              <span className="min-w-0">ส่วนลด{invoice.promoLabel ? ` (${invoice.promoLabel})` : ""}</span>
              <span className="shrink-0 font-bold">-{invoice.discount.toLocaleString()} ฿</span>
            </li>
          )}
        </ul>
        <div className="flex items-end justify-between gap-3 bg-honey/15 px-4 py-4">
          <span className="text-xs font-bold text-brown-soft">ยอดรวม</span>
          <span className="text-2xl font-extrabold text-latte-deep">
            {invoice.total.toLocaleString()} <span className="text-sm">บาท</span>
          </span>
        </div>
      </div>

      {invoice.status === "paid" ? (
        <p className="mt-4 flex items-center justify-center gap-2 rounded-petflow bg-sage/20 p-4 text-sm font-bold text-ok">
          <Icon name="check" size={18} strokeWidth={2.4} />
          ชำระเงินเรียบร้อยแล้ว
        </p>
      ) : payment ? (
        <div className="mt-4 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
              <Icon name="card" size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-brown-soft">โอนเข้าบัญชี · {payment.bankName}</p>
              <p className="text-lg font-extrabold tracking-wide text-petflow-chocolate">
                {payment.accountNumber}
              </p>
              <p className="truncate text-xs text-brown-soft">{payment.accountName}</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-brown-faint">
            โอนแล้วแจ้งพนักงาน หรือรอระบบยืนยันอัตโนมัติ
          </p>
        </div>
      ) : null}

      <a
        href={config.business.reviewUrl || config.business.maps}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-5 ${BTN_SECONDARY}`}
      >
        {!config.business.reviewButtonText && <Icon name="star" size={16} />}
        {config.business.reviewButtonText || "รีวิว PetFlow"}
      </a>

      <Link
        href="/app"
        className="mt-2 flex min-h-[44px] items-center justify-center text-xs font-bold text-latte-deep"
      >
        กลับหน้าหลัก
      </Link>
    </div>
  );
}
