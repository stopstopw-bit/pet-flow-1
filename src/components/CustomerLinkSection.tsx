"use client";

import { useEffect, useState } from "react";
import { buildCustomerLinkUrl } from "@/lib/liff-urls";
import { Icon } from "@/components/Icon";

export function CustomerLinkSection({
  customerId,
  customerName,
  hasLine,
}: {
  customerId: string;
  customerName: string;
  hasLine: boolean;
}) {
  const [liffId, setLiffId] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/line/liff")
      .then((r) => r.json())
      .then((d) => setLiffId(d.liffId || ""));
  }, []);

  if (hasLine) return null;

  const linkUrl = liffId
    ? buildCustomerLinkUrl(liffId, customerId)
    : typeof window !== "undefined"
      ? `${window.location.origin}/app/link?customerId=${customerId}`
      : "";

  const qrUrl = linkUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(linkUrl)}`
    : "";

  const copy = async () => {
    if (!linkUrl) return;
    await navigator.clipboard.writeText(linkUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="mb-4 rounded-petflow border border-latte/40 bg-latte/10 p-4">
      <div className="mb-1 flex items-center gap-2">
        <Icon name="link" size={18} className="text-latte-deep" />
        <h2 className="text-sm font-extrabold text-petflow-chocolate">ลิงก์ผูก LINE</h2>
      </div>
      <p className="mb-3 text-[11px] text-brown-soft">
        ส่งให้ {customerName} เปิดใน LINE — ระบบจะผูกบัญชีนี้กับข้อมูลที่ร้านบันทึกไว้
        (นัด · แต้ม · โปร)
      </p>
      {qrUrl ? (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrUrl}
            alt="QR ผูก LINE"
            width={120}
            height={120}
            className="rounded-petflow-sm bg-white p-2 shadow-petflow-sm"
          />
          <div className="w-full min-w-0 flex-1">
            <p className="mb-2 line-clamp-2 break-all rounded-xl bg-card/70 px-3 py-2 font-mono text-[10px] text-brown-soft">
              {linkUrl}
            </p>
            <button
              type="button"
              onClick={copy}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-petflow-sm bg-card px-3 py-2.5 text-sm font-bold text-latte-deep shadow-petflow-sm"
            >
              <Icon name={copied ? "check" : "copy"} size={16} />
              {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์ผูก LINE"}
            </button>
            {!liffId && (
              <p className="mt-2 text-[11px] text-wait">
                ตั้ง LIFF ใน Admin → ติดตั้ง — ลิงก์จะเปิดใน LINE โดยตรง
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-brown-soft">กำลังโหลด…</p>
      )}
    </section>
  );
}
