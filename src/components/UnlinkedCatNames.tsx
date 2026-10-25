"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Toast";

type Row = { name: string; bookings: number; invoices: number };

/**
 * ชื่อน้องในนัด/บิลที่ไม่ตรงกับน้องตัวไหนในบ้าน — เช่น "น้องไม่ระบุชื่อ (2)" ที่ใส่ไว้ตอนจอง
 * แล้วลูกค้ากรอกน้องเข้ามาเป็นตัวใหม่ หรือชื่อเก่าที่แก้ไปก่อนมีระบบตามแก้
 * เลือกว่าเป็นน้องตัวไหน → เปลี่ยนชื่อในนัด/บิล/ประวัติ/ปฏิทินให้ทั้งหมด
 */
export function UnlinkedCatNames({
  customerId,
  cats,
  reloadKey,
  onLinked,
}: {
  customerId: string;
  cats: { id: string; name: string }[];
  reloadKey?: string;
  onLinked: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/customers?id=${customerId}&unlinked=1`)
      .then((r) => (r.ok ? r.json() : { names: [] }))
      .then((d) => alive && setRows(Array.isArray(d.names) ? d.names : []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [customerId, reloadKey]);

  if (!rows.length || !cats.length) return null;

  const link = async (from: string) => {
    const catId = pick[from];
    if (!catId) return;
    setBusy(from);
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: customerId, action: "relink_cat_name", from, catId }),
    }).catch(() => null);
    setBusy("");
    if (!res?.ok) {
      toast("จับคู่ไม่สำเร็จ ลองใหม่อีกครั้งนะคะ", "error");
      return;
    }
    const to = cats.find((c) => c.id === catId)?.name || "";
    toast(`✅ เปลี่ยน "${from}" เป็น ${to} ในนัดและบิลแล้ว`, "success");
    setRows((r) => r.filter((x) => x.name !== from));
    onLinked();
  };

  return (
    <section className="mb-4 rounded-petflow border border-honey/50 bg-honey/10 p-4">
      <div className="mb-1 flex items-center gap-2">
        <Icon name="paw" size={18} className="text-latte-deep" />
        <h2 className="text-sm font-extrabold text-petflow-chocolate">ชื่อน้องในนัด/บิลที่ยังไม่ตรง</h2>
      </div>
      <p className="mb-3 text-[11px] text-brown-soft">
        เลือกว่าเป็นน้องตัวไหน ระบบจะเปลี่ยนชื่อในนัด บิล ประวัติ และปฏิทินให้ทั้งหมด
      </p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.name} className="rounded-petflow-sm bg-card p-3 shadow-petflow-sm">
            <p className="text-sm font-bold text-brown">{r.name}</p>
            <p className="mb-2 text-[11px] text-brown-faint">
              {[r.bookings ? `${r.bookings} นัด` : "", r.invoices ? `${r.invoices} บิล` : ""]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="flex gap-2">
              <select
                value={pick[r.name] || ""}
                onChange={(e) => setPick((p) => ({ ...p, [r.name]: e.target.value }))}
                className="min-h-[44px] min-w-0 flex-1 rounded-petflow-sm border border-latte/40 bg-white px-3 text-sm font-bold text-brown"
              >
                <option value="">เป็นน้องตัวไหน?</option>
                {cats
                  .filter((c) => c.name !== r.name)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={!pick[r.name] || busy === r.name}
                onClick={() => link(r.name)}
                className="min-h-[44px] rounded-petflow-sm bg-latte-deep px-4 text-sm font-bold text-white disabled:opacity-40"
              >
                {busy === r.name ? "กำลังแก้…" : "จับคู่"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
