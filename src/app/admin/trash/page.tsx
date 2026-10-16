"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { Avatar, EmptyState, SectionLabel } from "@/components/ui";

type Invoice = { id: string; catName: string; customerName: string; total: number; status: string };
type Customer = { id: string; name: string; cats: { name?: string }[] };

export default function TrashPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [inv, cus] = await Promise.all([
      fetch("/api/invoices?trash=1").then((r) => r.json()),
      fetch("/api/customers?trash=1").then((r) => r.json()),
    ]);
    setInvoices(inv.invoices || []);
    setCustomers(cus.customers || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const restoreInvoice = async (id: string) => {
    const res = await fetch("/api/invoices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "restore" }),
    });
    if (res.ok) {
      toast("กู้บิลคืนแล้ว ♻️", "success");
      load();
    } else toast("กู้ไม่สำเร็จ", "error");
  };

  const restoreCustomer = async (id: string) => {
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "restore_customer" }),
    });
    if (res.ok) {
      toast("กู้ลูกค้าคืนแล้ว ♻️", "success");
      load();
    } else toast("กู้ไม่สำเร็จ", "error");
  };

  if (loading) {
    return <p className="py-10 text-center text-sm text-brown-soft">กำลังโหลด…</p>;
  }

  const empty = invoices.length === 0 && customers.length === 0;

  const restoreBtn = (onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-sage/25 px-3.5 text-xs font-bold text-ok"
    >
      <Icon name="back" size={14} />
      กู้คืน
    </button>
  );

  return (
    <div className="space-y-5 pb-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Trash</p>
        <h1 className="text-xl font-extrabold text-petflow-chocolate">ถังขยะ</h1>
        <p className="mt-0.5 text-xs text-brown-soft">
          รายการที่ลบไว้ กดกู้คืนได้ (บิลที่เคยจ่ายแล้ว กู้คืนได้แต่ควรเช็คยอดบัญชีอีกที)
        </p>
      </div>

      {empty && (
        <div className="rounded-petflow bg-card shadow-petflow-sm">
          <EmptyState icon="trash" title="ถังขยะว่างเปล่า" />
        </div>
      )}

      {invoices.length > 0 && (
        <section>
          <SectionLabel>Bills · บิลที่ลบ ({invoices.length})</SectionLabel>
          <ul className="divide-y divide-petflow-line rounded-petflow bg-card shadow-petflow-sm">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-paper text-brown-soft">
                  <Icon name="receipt" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-brown">
                    {inv.catName} · {inv.customerName}
                  </p>
                  <p className="text-[11px] text-brown-soft">
                    {inv.total.toLocaleString()} บาท · {inv.status === "paid" ? "เคยชำระ" : "รอชำระ"}
                  </p>
                </div>
                {restoreBtn(() => restoreInvoice(inv.id))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {customers.length > 0 && (
        <section>
          <SectionLabel>Customers · ลูกค้าที่ลบ ({customers.length})</SectionLabel>
          <ul className="divide-y divide-petflow-line rounded-petflow bg-card shadow-petflow-sm">
            {customers.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar name={c.name} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-brown">{c.name}</p>
                  <p className="truncate text-[11px] text-brown-soft">
                    {c.cats.map((x) => x.name).filter(Boolean).join(", ") || "—"}
                  </p>
                </div>
                {restoreBtn(() => restoreCustomer(c.id))}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
