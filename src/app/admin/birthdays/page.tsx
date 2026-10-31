"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/Toast";
import { formatThaiDate } from "@/lib/format-thai-date";
import { Icon } from "@/components/Icon";
import { EmptyState, MoreMenu } from "@/components/ui";

type Row = {
  id: string;
  customerId: string;
  customerName: string;
  kind: "owner" | "cat";
  catName?: string;
  forDate: string;
  text: string;
  /** จะแจกคูปองกี่บาท — 0 = ไม่แจก (เคยได้ปีนี้แล้ว หรือปิดฟีเจอร์คูปองไว้) */
  couponAmount: number;
};

export default function BirthdaysPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/birthdays")
      .then((r) => r.json())
      .then((d) => {
        const list: Row[] = d.rows || [];
        setRows(list);
        // ไม่ติ๊กให้ล่วงหน้า — ต้องเลือกเองทีละใบ กันกดส่งทั้งหมดโดยไม่ได้ตั้งใจ
        setSelected(new Set());
      })
      .catch(() => {
        setRows([]);
        setSelected(new Set());
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sendSelected = async () => {
    if (selected.size === 0) return;
    const picked = rows.filter((r) => selected.has(r.id));
    const couponTotal = picked.reduce((sum, r) => sum + r.couponAmount, 0);
    const names = picked
      .map((r) => `• ${r.customerName}${r.couponAmount > 0 ? ` (คูปอง ${r.couponAmount} บาท)` : ""}`)
      .join("\n");
    if (
      !confirm(
        `ส่งการ์ดวันเกิดทาง LINE ${picked.length} ใบ?\n\n${names}${
          couponTotal > 0 ? `\n\nแจกคูปองรวม ${couponTotal} บาท` : ""
        }\n\nส่งแล้วยกเลิกไม่ได้`
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/birthdays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", ids: Array.from(selected) }),
      });
      const d = await res.json();
      if (res.ok) {
        toast(
          `ส่งแล้ว ${d.sent} ใบ${d.coupons ? ` · แจกคูปอง ${d.coupons} ใบ` : ""}${
            d.errors?.length ? ` (พลาด ${d.errors.length})` : ""
          }`,
          d.errors?.length ? "error" : "success"
        );
        load();
      } else {
        toast(d.error || "ส่งไม่สำเร็จ", "error");
      }
    } catch {
      toast("เชื่อมต่อไม่สำเร็จ", "error");
    }
    setBusy(false);
  };

  const dismiss = async (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      await fetch("/api/admin/birthdays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", id }),
      });
    } catch {
      toast("ข้ามไม่สำเร็จ ลองใหม่อีกครั้ง", "error");
      load();
    }
  };

  if (loading) {
    return <p className="py-10 text-center text-sm text-brown-soft">กำลังโหลด…</p>;
  }

  return (
    <div className="space-y-4 pb-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Birthdays</p>
        <h1 className="text-xl font-extrabold text-petflow-chocolate">วันเกิดลูกค้ารอตรวจ</h1>
        <p className="mt-0.5 text-xs text-brown-soft">
          ระบบคัดกรองไว้ให้แล้ว แต่ยังไม่ส่ง — ตรวจข้อความแล้วค่อยกดส่ง (คูปองก็แจกตอนกดส่งเท่านั้น)
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-petflow bg-card shadow-petflow-sm">
          <EmptyState
            icon="cake"
            title="ไม่มีวันเกิดรอตรวจตอนนี้"
            sub="ระบบจะคัดกรองให้เองทุกวันตอนเที่ยง แล้วขึ้นให้ตรวจที่นี่"
          />
        </div>
      ) : (
        <>
          <div className="sticky top-2 z-20 flex items-center justify-between gap-2 rounded-full bg-card py-1.5 pl-4 pr-1.5 shadow-petflow">
            <p className="text-xs font-bold text-brown">
              เลือกแล้ว {selected.size} / {rows.length} ใบ
            </p>
            <button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={sendSelected}
              className="flex h-10 items-center gap-1.5 rounded-full bg-petflow-chocolate px-4 text-xs font-extrabold text-card disabled:opacity-50"
            >
              <Icon name="send" size={16} />
              {busy ? "กำลังส่ง…" : `ส่งที่เลือก (${selected.size})`}
            </button>
          </div>

          <ul className="divide-y divide-petflow-line rounded-petflow bg-card shadow-petflow-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-3 pl-4 pr-2">
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                  aria-label={`เลือก ${r.customerName}`}
                  className="mt-1 h-5 w-5 shrink-0 accent-honey-deep"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-petflow-chocolate">
                    {r.customerName}
                    <span className="font-bold text-brown-soft">
                      {r.kind === "cat" && r.catName ? ` · น้อง${r.catName}` : " · เจ้าของ"}
                    </span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                    <span className="inline-flex items-center gap-1 rounded-full bg-latte/25 px-2 py-0.5 text-latte-deep">
                      <Icon name="cake" size={12} />
                      {formatThaiDate(r.forDate) || r.forDate}
                    </span>
                    {r.couponAmount > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-ok/15 px-2 py-0.5 text-ok">
                        <Icon name="gift" size={12} />
                        คูปอง {r.couponAmount} บาท
                      </span>
                    ) : (
                      <span className="rounded-full bg-paper px-2 py-0.5 text-brown-faint">
                        ไม่แจกคูปอง (เคยได้ปีนี้แล้ว/ปิดไว้)
                      </span>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-line rounded-petflow-sm bg-paper px-3 py-2 text-[11px] text-brown">
                    {r.text}
                  </p>
                </div>
                <MoreMenu
                  items={[{ label: "ข้ามวันนี้", icon: "x", onClick: () => dismiss(r.id) }]}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
