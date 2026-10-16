"use client";

import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Toaster } from "@/components/Toast";
import { DocPdfButton, InvoiceDocument, docTitle, type Data, type Kind } from "@/components/InvoiceDocument";

/**
 * เอกสารที่ร้านส่งให้ลูกค้าทาง LINE — เปิดในเบราว์เซอร์ของ LINE ได้เลย ไม่ต้องล็อกอิน
 * (ลิงก์มีโทเคนที่เซ็นไว้) · บันทึกเป็น PDF ได้ในปุ่มเดียว
 */
export default function PublicDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const search = useSearchParams();
  const kind = (search.get("k") || "receipt") as Kind;
  const token = search.get("t") || "";
  const shop = search.get("s") || "";
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");

  useEffect(() => {
    fetch(`/api/doc-public?id=${encodeURIComponent(id)}&k=${kind}&s=${encodeURIComponent(shop)}&t=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Data | null) => {
        setData(d);
        setState(d ? "ok" : "missing");
      })
      .catch(() => setState("missing"));
  }, [id, kind, shop, token]);

  if (state === "loading") {
    return <p className="py-16 text-center text-sm text-brown-soft">กำลังเปิดเอกสาร…</p>;
  }
  if (!data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-paper text-brown-soft">
          <Icon name="receipt" size={26} />
        </span>
        <p className="text-base font-extrabold text-petflow-chocolate">เปิดเอกสารไม่ได้</p>
        <p className="mt-1 text-sm text-brown-soft">ลิงก์อาจไม่ครบหรือเอกสารถูกยกเลิกแล้ว ติดต่อร้านเพื่อขอใหม่ได้เลยค่ะ</p>
      </main>
    );
  }

  const title = docTitle(kind, !!data.seller.vatRegistered);
  const copies = ["ต้นฉบับ"] as const;

  return (
    <main className="min-h-screen bg-cream pb-28">
      <header className="mx-auto flex max-w-[800px] items-center gap-3 px-4 pb-3 pt-5 print:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="" className="h-10 w-10 rounded-full object-cover" />
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">{title.en}</p>
          <p className="truncate text-base font-extrabold text-petflow-chocolate">
            {title.th} · {data.seller.shopName}
          </p>
        </div>
      </header>
      <div className="px-3 sm:px-4">
        <InvoiceDocument data={data} kind={kind} copies={copies} />
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-petflow-line bg-card/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur print:hidden">
        <div className="mx-auto max-w-md">
          <DocPdfButton
            data={data}
            kind={kind}
            copies={copies}
            label="ดาวน์โหลด PDF"
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-petflow-chocolate text-base font-extrabold text-card disabled:opacity-60"
          />
        </div>
      </div>
      <Toaster />
    </main>
  );
}
