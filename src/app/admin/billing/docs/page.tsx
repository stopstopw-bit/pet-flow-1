"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { EmptyState, SearchField, Segmented } from "@/components/ui";

/**
 * เอกสารที่เคยออกไปแล้ว — ใบเสนอราคา / ใบแจ้งหนี้ / ใบเสร็จ (ใบกำกับภาษี)
 * ค้นจากเลขที่ ชื่อลูกค้า ชื่อบริษัท ชื่อน้อง · แตะเพื่อเปิดดู พิมพ์ ส่ง LINE หรือบันทึก PDF ซ้ำ
 */

type Kind = "quote" | "invoice" | "receipt";
type Row = {
  invoiceId: string;
  kind: Kind;
  no: string;
  at: string;
  buyerName: string;
  company: boolean;
  customerName: string;
  catName: string;
  total: number;
  status: "pending" | "paid";
};

const KIND_LABEL: Record<Kind, string> = { quote: "ใบเสนอราคา", invoice: "ใบแจ้งหนี้", receipt: "ใบเสร็จ" };
const SHORT: Record<Kind, string> = { quote: "เสนอราคา", invoice: "แจ้งหนี้", receipt: "ใบเสร็จ" };
const KIND_TONE: Record<Kind, string> = {
  quote: "bg-latte/25 text-latte-deep",
  invoice: "bg-wait/15 text-wait",
  receipt: "bg-ok/15 text-ok",
};

const monthLabel = (ym: string) =>
  new Date(`${ym}-01T00:00:00+07:00`).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" });
const dayLabel = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" }) : "";
const bkkMonth = (iso: string) =>
  iso ? new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 7) : "";

export default function IssuedDocsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | Kind>("all");

  useEffect(() => {
    fetch("/api/invoice-docs?list=1")
      .then((r) => (r.ok ? r.json() : { docs: [] }))
      .then((d) => setRows(d.docs || []))
      .catch(() => setRows([]));
  }, []);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows || [])
      .filter((r) => kind === "all" || r.kind === kind)
      .filter(
        (r) =>
          !needle ||
          [r.no, r.buyerName, r.customerName, r.catName].some((s) => (s || "").toLowerCase().includes(needle))
      );
  }, [rows, q, kind]);

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of list) {
      const key = bkkMonth(r.at) || "-";
      m.set(key, [...(m.get(key) || []), r]);
    }
    return [...m.entries()];
  }, [list]);

  const count = (k: "all" | Kind) => (rows || []).filter((r) => k === "all" || r.kind === k).length || undefined;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Link href="/admin/billing" aria-label="กลับ" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper text-brown">
          <Icon name="back" size={18} />
        </Link>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Documents</p>
          <h1 className="text-lg font-extrabold text-petflow-chocolate">เอกสารที่ออกแล้ว</h1>
        </div>
      </div>

      <SearchField value={q} onChange={setQ} placeholder="ค้นหาเลขที่ / ลูกค้า / บริษัท" className="mb-2" />
      <Segmented
        value={kind}
        onChange={setKind}
        className="mb-4"
        options={(["all", "receipt", "invoice", "quote"] as const).map((k) => ({
          id: k,
          label: k === "all" ? `ทั้งหมด${count("all") ? ` ${count("all")}` : ""}` : SHORT[k],
        }))}
      />

      {rows === null ? (
        <p className="py-10 text-center text-sm text-brown-soft">กำลังโหลด…</p>
      ) : list.length === 0 ? (
        <div className="rounded-petflow bg-card shadow-petflow-sm">
          <EmptyState
            icon="doc"
            title={rows.length ? "ไม่พบเอกสารที่ค้นหา" : "ยังไม่มีเอกสารที่ออก"}
            sub={rows.length ? "ลองค้นด้วยเลขที่หรือชื่อลูกค้า" : "เปิดบิล › ⋯ › ใบเสร็จ / ใบเสนอราคา เพื่อออกเอกสารใบแรก"}
          />
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([ym, items]) => (
            <section key={ym}>
              <p className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">
                <span>{ym === "-" ? "ไม่ระบุวันที่" : monthLabel(ym)}</span>
                <span className="normal-case tracking-normal">
                  {items.length} ใบ · {items.reduce((s, r) => s + r.total, 0).toLocaleString()} ฿
                </span>
              </p>
              <ul className="overflow-hidden rounded-petflow bg-card shadow-petflow-sm">
                {items.map((r) => (
                  <li key={`${r.invoiceId}:${r.kind}`} className="border-b border-petflow-line/60 last:border-0">
                    <Link
                      href={`/admin/billing/doc/${encodeURIComponent(r.invoiceId)}?type=${r.kind}&from=docs`}
                      className="flex min-h-[64px] items-center gap-3 px-3.5 py-2.5 active:bg-paper"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper text-petflow-chocolate">
                        <Icon name={r.company ? "team" : "receipt"} size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-extrabold text-petflow-chocolate">{r.buyerName}</span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${KIND_TONE[r.kind]}`}>
                            {KIND_LABEL[r.kind]}
                          </span>
                        </span>
                        <span className="block truncate text-[11px] text-brown-soft">
                          {r.no} · {dayLabel(r.at)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-extrabold text-petflow-chocolate">{r.total.toLocaleString()} ฿</span>
                        <Icon name="chevron" size={14} className="ml-auto text-brown-faint" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
