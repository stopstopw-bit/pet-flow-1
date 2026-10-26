"use client";

import { useCallback, useEffect, useState } from "react";
import { NumInput } from "@/components/NumInput";

type Settings = {
  monthly: number;
  yearly: number;
  bankName: string;
  accountName: string;
  accountNo: string;
  promptpay: string;
  note: string;
};
type Payment = {
  id: string;
  tenantId: string;
  plan: "month" | "year";
  amount: number;
  note: string;
  status: "pending" | "approved" | "rejected";
  dueAfter: string | null;
  decidedNote: string;
  createdAt: string;
};
type ShopRef = { id: string; name: string };

const PLAN_LABEL = { month: "รายเดือน", year: "รายปี" };
const STATUS_LABEL = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ไม่อนุมัติ" };

const FIELDS: { key: keyof Settings; label: string; num?: boolean }[] = [
  { key: "monthly", label: "ราคารายเดือน (บาท)", num: true },
  { key: "yearly", label: "ราคารายปี (บาท)", num: true },
  { key: "bankName", label: "ธนาคาร" },
  { key: "accountNo", label: "เลขบัญชี" },
  { key: "accountName", label: "ชื่อบัญชี" },
  { key: "promptpay", label: "พร้อมเพย์" },
  { key: "note", label: "หมายเหตุถึงร้าน" },
];

/**
 * ค่าบริการร้าน — ตั้งราคารายเดือน/รายปี + บัญชีรับเงิน และอนุมัติสลิปที่ร้านส่งมา
 * อนุมัติแล้วระบบต่ออายุร้านให้เอง (เลื่อนวันครบกำหนดจ่าย)
 */
export default function Subscriptions({ tenants, onChanged }: { tenants: ShopRef[]; onChanged: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState(false);

  const nameOf = (id: string) => tenants.find((t) => t.id === id)?.name || "ร้านที่ถูกลบ";

  const load = useCallback(async () => {
    setErr("");
    const res = await fetch("/api/platform/subscription").catch(() => null);
    const d = await res?.json().catch(() => ({}));
    if (res?.ok) {
      setSettings(d.settings);
      setPayments(d.payments || []);
    } else setErr(d?.error || "โหลดไม่สำเร็จ");
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!settings) return;
    setBusy("settings");
    const res = await fetch("/api/platform/subscription", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setBusy("");
    setMsg(res.ok ? "บันทึกราคาแล้ว" : "บันทึกไม่สำเร็จ");
    if (res.ok) setEditing(false);
  };

  const decide = async (p: Payment, approve: boolean) => {
    const note = approve ? "" : prompt("เหตุผลที่ไม่อนุมัติ (ร้านจะเห็น)") ?? null;
    if (note === null) return;
    if (approve && !confirm(`อนุมัติ ${nameOf(p.tenantId)} ${PLAN_LABEL[p.plan]} ${p.amount.toLocaleString()} บาท?`)) return;
    setBusy(p.id);
    const res = await fetch("/api/platform/subscription", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, approve, note }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy("");
    setMsg(res.ok ? (approve ? `ต่ออายุแล้ว ใช้ได้ถึง ${d.payment?.dueAfter}` : "ไม่อนุมัติแล้ว") : d.error || "ไม่สำเร็จ");
    load();
    onChanged();
  };

  const pending = payments.filter((p) => p.status === "pending");
  const done = payments.filter((p) => p.status !== "pending").slice(0, 10);

  return (
    <div className="mb-6 rounded-petflow border border-white/10 bg-[#232637] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-extrabold">
          💳 ค่าบริการร้าน {pending.length > 0 && <span className="ml-1 rounded-full bg-red-500 px-2 text-[11px]">{pending.length} รออนุมัติ</span>}
        </p>
        <button
          type="button"
          onClick={() => setEditing(!editing)}
          className="rounded-petflow-sm border border-white/20 px-3 py-1 text-[11px] font-bold"
        >
          {editing ? "ปิด" : "ตั้งราคา / บัญชีรับเงิน"}
        </button>
      </div>
      {settings && !editing && (
        <p className="mb-3 text-xs text-white/50">
          รายเดือน {settings.monthly.toLocaleString()} บาท · รายปี {settings.yearly.toLocaleString()} บาท
          {settings.accountNo ? ` · ${settings.bankName} ${settings.accountNo}` : " · ยังไม่ได้ใส่บัญชีรับเงิน"}
        </p>
      )}
      {settings && editing && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.key} className="text-[11px] text-white/60">
              {f.label}
              {f.num ? (
                <NumInput
                  inputMode="numeric"
                  value={settings[f.key] as number | undefined}
                  onChange={(e) => setSettings({ ...settings, [f.key]: Number(e.target.value) || 0 })}
                  className="mt-1 block w-full rounded-petflow-sm border border-white/15 bg-black/30 px-3 py-2 text-xs text-white"
                />
              ) : (
                <input
                  type="text"
                  value={String(settings[f.key] ?? "")}
                  onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}
                  className="mt-1 block w-full rounded-petflow-sm border border-white/15 bg-black/30 px-3 py-2 text-xs text-white"
                />
              )}
            </label>
          ))}
          <button
            type="button"
            disabled={busy === "settings"}
            onClick={save}
            className="rounded-petflow-sm bg-latte-deep px-4 py-2 text-xs font-extrabold text-white disabled:opacity-40 sm:col-span-2"
          >
            บันทึก
          </button>
        </div>
      )}
      {msg && <p className="mb-2 text-xs text-white/70">{msg}</p>}
      {err && <p className="text-xs font-bold text-white/70">❌ {err}</p>}
      {pending.length === 0 && <p className="text-xs text-white/50">ไม่มีสลิปรออนุมัติ</p>}
      <div className="space-y-2">
        {pending.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-petflow-sm border border-amber-400/40 p-3">
            <div className="min-w-0">
              <p className="text-sm font-bold">{nameOf(p.tenantId)}</p>
              <p className="text-[11px] text-white/60">
                {PLAN_LABEL[p.plan]} · {p.amount.toLocaleString()} บาท · ส่งเมื่อ{" "}
                {new Date(p.createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
                {p.note ? ` · ${p.note}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href={`/api/platform/subscription/slip?id=${encodeURIComponent(p.id)}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-petflow-sm border border-white/20 px-3 py-1 text-[11px] font-bold"
              >
                ดูสลิป
              </a>
              <button
                type="button"
                disabled={busy === p.id}
                onClick={() => decide(p, true)}
                className="rounded-petflow-sm bg-emerald-600 px-3 py-1 text-[11px] font-extrabold text-white disabled:opacity-40"
              >
                ✅ อนุมัติ
              </button>
              <button
                type="button"
                disabled={busy === p.id}
                onClick={() => decide(p, false)}
                className="rounded-petflow-sm border border-white/20 px-3 py-1 text-[11px] font-bold text-white/60 disabled:opacity-40"
              >
                ไม่อนุมัติ
              </button>
            </div>
          </div>
        ))}
      </div>
      {done.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] text-white/50">ประวัติล่าสุด</summary>
          <ul className="mt-2 space-y-1 text-[11px] text-white/60">
            {done.map((p) => (
              <li key={p.id}>
                {nameOf(p.tenantId)} · {PLAN_LABEL[p.plan]} {p.amount.toLocaleString()} บาท · {STATUS_LABEL[p.status]}
                {p.dueAfter ? ` · ถึง ${p.dueAfter}` : ""}
                {p.decidedNote ? ` · ${p.decidedNote}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
