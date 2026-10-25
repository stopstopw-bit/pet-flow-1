"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { EmptyState, SectionLabel } from "@/components/ui";
import type { AuditIssue } from "@/lib/bill-audit";
import { tidyServiceText } from "@/lib/stay-line";

const KIND_META: Record<AuditIssue["kind"], { label: string; tone: string }> = {
  duplicate: { label: "บิลซ้ำ", tone: "bg-red-50 text-red-700" },
  over_nights: { label: "คิดคืนเกิน", tone: "bg-wait/15 text-wait" },
  over_income: { label: "รายรับเกินบิล", tone: "bg-wait/15 text-wait" },
};

/**
 * ตรวจบิลเทียบกับนัดทั้งร้าน — บิลควรตรงกับนัด
 * ชี้บิลซ้ำ / คิดคืนเกินช่วงที่พักจริง / ลงรายรับเกินยอดบิล แล้วให้ร้านกดลบบิลที่ซ้ำเอง
 * (ลบ = ถอนรายรับ แต้ม และประวัติใช้บริการของบิลนั้น บิลไปอยู่ถังขยะ)
 */
export default function BillCheckPage() {
  const [issues, setIssues] = useState<AuditIssue[]>([]);
  const [checked, setChecked] = useState({ invoices: 0, bookings: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/invoices/audit").then((r) => r.json()).catch(() => ({}));
    setIssues(res.issues || []);
    setChecked(res.checked || { invoices: 0, bookings: 0 });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const removeBill = async (bill: AuditIssue["bills"][number]) => {
    const paidNote =
      bill.status === "paid"
        ? `\nรายรับ ${bill.income.toLocaleString()} บาท แต้ม และประวัติใช้บริการของบิลนี้จะถูกถอนออกด้วย`
        : "";
    if (!confirm(`ลบบิล ${bill.total.toLocaleString()} บาท (${bill.date}) ที่ซ้ำ?${paidNote}\nบิลไปอยู่ในถังขยะ`))
      return;
    setBusy(bill.id);
    const res = await fetch("/api/invoices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: bill.id, action: "delete" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return toast(data.error || "ลบไม่สำเร็จ", "error");
    toast("ลบบิลซ้ำแล้ว ถอนรายรับให้แล้ว", "success");
    load();
  };

  return (
    <div className="space-y-5 pb-6">
      <div>
        <Link href="/admin/billing" className="mb-1 inline-flex items-center gap-1 text-xs font-bold text-latte-deep">
          <Icon name="back" size={14} />
          คิดเงิน
        </Link>
        <h1 className="text-xl font-extrabold text-petflow-chocolate">ตรวจบิลเทียบนัด</h1>
        <p className="mt-0.5 text-xs text-brown-soft">
          หาบิลที่ออกซ้ำ คิดคืนเกินวันที่พักจริง หรือลงรายรับเกินยอดบิล ทั้งร้าน
          {!loading && ` · ตรวจแล้ว ${checked.invoices} บิล ${checked.bookings} นัด`}
        </p>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-brown-soft">กำลังตรวจ…</p>
      ) : issues.length === 0 ? (
        <EmptyState icon="check" title="บิลตรงกับนัดทั้งหมด" sub="ไม่พบบิลซ้ำหรือคิดเกิน" />
      ) : (
        <section>
          <SectionLabel>พบ {issues.length} จุดที่ต้องเช็ก</SectionLabel>
          <ul className="space-y-3">
            {issues.map((it) => {
              const meta = KIND_META[it.kind];
              return (
                <li key={it.key} className="rounded-petflow bg-card p-4 shadow-petflow-sm">
                  <div className="flex items-center gap-2">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${meta.tone}`}>
                      {meta.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-petflow-chocolate">
                      {it.customerName}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs font-bold text-brown">{it.message}</p>

                  {it.bookings.length > 0 && (
                    <p className="mt-1 text-[11px] text-brown-soft">
                      นัด:{" "}
                      {it.bookings
                        .map((b) => `${b.catName} ${b.when}${b.status === "pending" ? " (รอยืนยัน)" : ""}`)
                        .join(" · ")}
                    </p>
                  )}

                  <ul className="mt-2 divide-y divide-petflow-line rounded-petflow-sm border border-petflow-line text-xs">
                    {it.bills.map((b) => {
                      const suspect = it.suspectIds.includes(b.id);
                      return (
                        <li key={b.id} className="flex min-h-[48px] items-center gap-2 py-1.5 pl-3 pr-1.5">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-bold text-brown">
                              {tidyServiceText(b.label)} · {b.total.toLocaleString()} บาท
                            </span>
                            <span className="block text-[11px] text-brown-faint">
                              {b.date} · {b.status === "paid" ? "จ่ายแล้ว" : "รอชำระ"}
                              {b.income > 0 ? ` · ลงรายรับ ${b.income.toLocaleString()}` : ""}
                              {suspect ? " · น่าจะซ้ำ" : ""}
                            </span>
                          </span>
                          {(suspect || it.kind === "over_nights") && (
                            <button
                              type="button"
                              disabled={busy === b.id}
                              onClick={() => removeBill(b)}
                              className={`flex h-10 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-bold ${
                                suspect ? "bg-red-50 text-red-700" : "bg-paper text-brown-soft"
                              }`}
                            >
                              <Icon name="trash" size={14} />
                              {busy === b.id ? "กำลังลบ…" : "ลบบิลนี้"}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
