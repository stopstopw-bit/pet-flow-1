"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/ui";
import { toast } from "@/components/Toast";
import { bangkokToday } from "@/lib/bangkok-date";
import { NumInput } from "@/components/NumInput";

type Employee = {
  id: string;
  name: string;
  baseSalary: number;
  groomCommissionPct: number;
  groomCommissionPerCat: number;
  active: boolean;
  createdAt?: string;
};

type Line = {
  employee: Employee;
  groomCats: number;
  groomRevenue: number;
  commission: number;
  total: number;
  paidAmount?: number;
  paidOn?: string;
};

const baht = (n: number) => `฿${Math.round(n).toLocaleString()}`;

const BLANK: Employee = {
  id: "",
  name: "",
  baseSalary: 0,
  groomCommissionPct: 0,
  groomCommissionPerCat: 0,
  active: true,
};

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * เงินเดือน & ค่าคอม — คิดให้เองทุกเดือน: เงินเดือนฐาน + ค่าคอมจากตัวที่ช่างอาบเสร็จ
 * (ช่างของแต่ละตัวเลือกในบอร์ดคิวอาบน้ำ) · กดจ่ายแล้วลงรายจ่ายในรายรับ-รายจ่ายให้เอง
 */
export default function PayrollPage() {
  const [month, setMonth] = useState(() => bangkokToday().slice(0, 7));
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [extra, setExtra] = useState<Record<string, { bonus: string; deduction: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/payroll?month=${month}`, { cache: "no-store" }).catch(() => null);
    if (res?.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    const d = await res?.json().catch(() => ({}));
    setLines(d?.lines || []);
    setLoading(false);
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const saveEmployee = async () => {
    if (!editing?.name.trim()) return toast("ใส่ชื่อพนักงานก่อน", "error");
    setBusy("save");
    const res = await fetch("/api/payroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", employee: { ...editing, id: editing.id || undefined } }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return toast(d.error || "บันทึกไม่สำเร็จ", "error");
    toast("บันทึกแล้ว", "success");
    setEditing(null);
    load();
  };

  const removeEmployee = async (e: Employee) => {
    if (!confirm(`ลบ ${e.name} ออกจากรายชื่อเงินเดือน? (รายจ่ายที่ลงไปแล้วยังอยู่)`)) return;
    await fetch("/api/payroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: e.id }),
    });
    setEditing(null);
    load();
  };

  const net = (l: Line) => {
    const x = extra[l.employee.id];
    return l.total + (Number(x?.bonus) || 0) - (Number(x?.deduction) || 0);
  };

  const pay = async (l: Line) => {
    const amount = net(l);
    const [y, m] = month.split("-");
    if (!confirm(`จ่ายเงินเดือน ${l.employee.name} เดือน ${m}/${y} ยอด ${baht(amount)}?\nระบบจะลงเป็นรายจ่ายให้อัตโนมัติ`)) return;
    setBusy(l.employee.id);
    const x = extra[l.employee.id];
    const res = await fetch("/api/payroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "pay",
        employeeId: l.employee.id,
        month,
        bonus: Number(x?.bonus) || 0,
        deduction: Number(x?.deduction) || 0,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return toast(d.error || "บันทึกไม่สำเร็จ", "error");
    toast(`ลงรายจ่ายเงินเดือน ${baht(d.amount)} แล้ว`, "success");
    load();
  };

  const [y, m] = month.split("-").map(Number);
  const active = lines.filter((l) => l.employee.active || l.paidAmount !== undefined);
  const sum = (f: (l: Line) => number) => active.reduce((s, l) => s + f(l), 0);

  if (forbidden) {
    return (
      <div className="rounded-petflow bg-card p-6 shadow-petflow-sm">
        <EmptyState icon="money" title="เฉพาะเจ้าของร้าน" sub="ขอให้เจ้าของร้านเปิดเมนูเงินเดือนให้ในหน้าพนักงาน" />
      </div>
    );
  }

  const field = (
    label: string,
    key: keyof Employee,
    suffix: string
  ) => (
    <label className="block text-[11px] font-bold text-brown-soft">
      {label}
      <span className="mt-1 flex items-center gap-1.5">
        <NumInput
          type="number"
          min={0}
          inputMode="decimal"
          value={String(editing?.[key] ?? 0)}
          onChange={(e) => setEditing((cur) => (cur ? { ...cur, [key]: Number(e.target.value) || 0 } : cur))}
          className="min-w-0 flex-1 rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm text-brown"
        />
        <span className="shrink-0 text-xs text-brown-faint">{suffix}</span>
      </span>
    </label>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Payroll</p>
          <h1 className="text-xl font-extrabold text-petflow-chocolate">เงินเดือน &amp; ค่าคอม</h1>
          <p className="mt-0.5 text-xs text-brown-soft">
            คิดให้เองจากเงินเดือนฐาน + ตัวที่ช่างอาบเสร็จ (เลือกช่างในบอร์ดคิวอาบน้ำ)
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="เดือนก่อน"
            onClick={() => setMonth((cur) => shiftMonth(cur, -1))}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-brown shadow-petflow-sm"
          >
            <Icon name="back" size={16} />
          </button>
          <span className="min-w-[90px] text-center text-sm font-extrabold text-petflow-chocolate">
            {m}/{y}
          </span>
          <button
            type="button"
            aria-label="เดือนถัดไป"
            onClick={() => setMonth((cur) => shiftMonth(cur, 1))}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-brown shadow-petflow-sm"
          >
            <Icon name="chevron" size={16} />
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "เงินเดือนฐานรวม", value: sum((l) => l.employee.baseSalary) },
          { label: "ค่าคอมรวม", value: sum((l) => l.commission) },
          { label: "ยอดสุทธิรวม", value: sum(net) },
          { label: "จ่ายแล้ว", value: sum((l) => l.paidAmount || 0) },
        ].map((c) => (
          <div key={c.label} className="rounded-petflow bg-card p-3 shadow-petflow-sm">
            <p className="text-[11px] font-bold text-brown-soft">{c.label}</p>
            <p className="text-lg font-extrabold text-petflow-chocolate">{baht(c.value)}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-brown-faint">กำลังโหลด…</p>
      ) : (
        <div className="space-y-2">
          {active.length === 0 && (
            <div className="rounded-petflow bg-card p-6 shadow-petflow-sm">
              <EmptyState icon="team" title="ยังไม่มีรายชื่อพนักงาน" sub="เพิ่มพนักงาน ตั้งเงินเดือนและเรทค่าคอม แล้วระบบคิดให้ทุกเดือน" />
            </div>
          )}
          {active.map((l) => {
            const e = l.employee;
            const paid = l.paidAmount !== undefined;
            return (
              <div key={e.id} className="rounded-petflow bg-card p-4 shadow-petflow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-petflow-chocolate">
                      {e.name}
                      {!e.active && <span className="ml-1 text-[11px] text-brown-faint">(ปิดใช้งาน)</span>}
                    </p>
                    <p className="text-[11px] text-brown-soft">
                      ฐาน {baht(e.baseSalary)}
                      {e.groomCommissionPct > 0 && ` · คอม ${e.groomCommissionPct}% ของยอดอาบน้ำ`}
                      {e.groomCommissionPerCat > 0 && ` · ${baht(e.groomCommissionPerCat)}/ตัว`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing({ ...e })}
                    className="flex h-9 items-center gap-1 rounded-full bg-paper px-3 text-xs font-bold text-brown"
                  >
                    <Icon name="edit" size={13} />
                    แก้ไข
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded-petflow-sm bg-paper/70 p-2">
                    <p className="text-[10px] font-bold text-brown-faint">อาบเสร็จ</p>
                    <p className="font-extrabold text-brown">{l.groomCats} ตัว</p>
                  </div>
                  <div className="rounded-petflow-sm bg-paper/70 p-2">
                    <p className="text-[10px] font-bold text-brown-faint">ยอดอาบน้ำ (จ่ายแล้ว)</p>
                    <p className="font-extrabold text-brown">{baht(l.groomRevenue)}</p>
                  </div>
                  <div className="rounded-petflow-sm bg-paper/70 p-2">
                    <p className="text-[10px] font-bold text-brown-faint">ค่าคอม</p>
                    <p className="font-extrabold text-brown">{baht(l.commission)}</p>
                  </div>
                  <div className="rounded-petflow-sm bg-sage/20 p-2">
                    <p className="text-[10px] font-bold text-brown-faint">ฐาน + คอม</p>
                    <p className="font-extrabold text-ok">{baht(l.total)}</p>
                  </div>
                </div>

                {paid ? (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-sage/25 px-3 py-1.5 text-xs font-extrabold text-ok">
                    <Icon name="check" size={13} strokeWidth={2.6} />
                    จ่ายแล้ว {baht(l.paidAmount || 0)}
                    {l.paidOn ? ` · ${l.paidOn}` : ""}
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    {(["bonus", "deduction"] as const).map((k) => (
                      <label key={k} className="w-28 text-[10px] font-bold text-brown-soft">
                        {k === "bonus" ? "โบนัส +" : "หัก (ลา/สาย) −"}
                        <NumInput
                          type="number"
                          min={0}
                          inputMode="decimal"
                          value={extra[e.id]?.[k] || ""}
                          onChange={(ev) =>
                            setExtra((cur) => ({
                              ...cur,
                              [e.id]: { ...(cur[e.id] || { bonus: "", deduction: "" }), [k]: ev.target.value },
                            }))
                          }
                          className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-2 py-1.5 text-xs"
                        />
                      </label>
                    ))}
                    <button
                      type="button"
                      disabled={busy === e.id || net(l) <= 0}
                      onClick={() => pay(l)}
                      className="ml-auto flex h-10 items-center gap-1.5 rounded-full bg-petflow-chocolate px-4 text-xs font-extrabold text-card disabled:opacity-50"
                    >
                      <Icon name="money" size={14} />
                      จ่าย {baht(net(l))}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setEditing({ ...BLANK })}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-dashed border-latte-deep/50 bg-card text-xs font-extrabold text-latte-deep"
          >
            <Icon name="plus" size={16} />
            เพิ่มพนักงาน
          </button>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setEditing(null)}>
          <div
            className="w-full max-w-sm rounded-t-[28px] bg-card px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-petflow sm:rounded-petflow sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-base font-extrabold text-petflow-chocolate">
              {editing.id ? "แก้ไขพนักงาน" : "เพิ่มพนักงาน"}
            </p>
            <div className="space-y-2.5">
              <label className="block text-[11px] font-bold text-brown-soft">
                ชื่อ
                <input
                  value={editing.name}
                  onChange={(e) => setEditing((cur) => (cur ? { ...cur, name: e.target.value } : cur))}
                  className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm text-brown"
                />
              </label>
              {field("เงินเดือนฐานต่อเดือน", "baseSalary", "บาท")}
              <div className="grid grid-cols-2 gap-2">
                {field("ค่าคอม % ของยอดอาบน้ำ", "groomCommissionPct", "%")}
                {field("ค่าคอมต่อตัวที่อาบ", "groomCommissionPerCat", "บาท")}
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-brown">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) => setEditing((cur) => (cur ? { ...cur, active: e.target.checked } : cur))}
                />
                ยังทำงานอยู่ (ขึ้นในรายชื่อช่างของบอร์ดคิว)
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              {editing.id && (
                <button
                  type="button"
                  onClick={() => removeEmployee(editing)}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-wait/10 text-wait"
                  aria-label="ลบ"
                >
                  <Icon name="trash" size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="h-11 flex-1 rounded-full bg-paper text-sm font-bold text-brown"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={busy === "save"}
                onClick={saveEmployee}
                className="h-11 flex-[1.4] rounded-full bg-petflow-chocolate text-sm font-extrabold text-card disabled:opacity-50"
              >
                {busy === "save" ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
