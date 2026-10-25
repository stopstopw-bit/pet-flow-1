"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/Toast";
import { SectionLabel } from "@/components/ui";

type Plan = "month" | "year";
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
  plan: Plan;
  amount: number;
  slipUrl: string;
  status: "pending" | "approved" | "rejected";
  dueAfter: string | null;
  decidedNote: string;
  createdAt: string;
};
type Data = { status: string; dueDate: string | null; overdue: boolean; settings: Settings; payments: Payment[] };

const PLAN_LABEL: Record<Plan, string> = { month: "รายเดือน", year: "รายปี" };
const STATUS_LABEL = { pending: "⏳ รออนุมัติ", approved: "✅ อนุมัติแล้ว", rejected: "❌ ไม่อนุมัติ" };

function thaiDate(d: string) {
  return new Date(`${d.slice(0, 10)}T00:00:00+07:00`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

/** ย่อรูปสลิปก่อนส่ง — รูปจากมือถือใหญ่หลาย MB อ่านยอดได้ที่ด้านยาว 1600px ก็พอ */
function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("เปิดรูปไม่ได้"));
    };
    img.src = url;
  });
}

/** ค่าบริการ PetFlow — ร้านเลือกแพ็กเกจ โอนเงิน อัปสลิป แล้วรอผู้ดูแลระบบอนุมัติ */
export default function SubscriptionPage() {
  const [data, setData] = useState<Data | null>(null);
  const [plan, setPlan] = useState<Plan>("month");
  const [slip, setSlip] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const isOwner = typeof window !== "undefined" && sessionStorage.getItem("petflow-role") !== "staff";

  const load = useCallback(async () => {
    const res = await fetch("/api/subscription").catch(() => null);
    if (res?.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pickFile = async (file?: File) => {
    if (!file) return;
    try {
      setSlip(await shrinkImage(file));
    } catch {
      toast("เปิดรูปไม่ได้ ลองรูปอื่นนะคะ", "error");
    }
  };

  const send = async () => {
    if (!slip) return toast("แนบรูปสลิปก่อนนะคะ", "error");
    setSending(true);
    try {
      const res = await fetch("/api/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, slip, note }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return toast(d.error || "ส่งไม่สำเร็จ", "error");
      toast("ส่งสลิปแล้ว รออนุมัติสักครู่นะคะ", "success");
      setSlip("");
      setNote("");
      load();
    } finally {
      setSending(false);
    }
  };

  if (!data) return <p className="py-10 text-center text-sm text-brown-soft">กำลังโหลด…</p>;
  const s = data.settings;
  const price = plan === "year" ? s.yearly : s.monthly;
  const pending = data.payments.some((p) => p.status === "pending");

  return (
    <div className="space-y-5 pb-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Subscription</p>
        <h1 className="text-xl font-extrabold text-petflow-chocolate">ค่าบริการ PetFlow</h1>
      </div>

      <div
        className={`rounded-petflow p-4 shadow-petflow-sm ${data.overdue ? "bg-red-50 text-red-800" : "bg-card text-brown"}`}
      >
        {data.dueDate ? (
          <>
            <p className="text-xs font-bold opacity-70">{data.overdue ? "เลยวันครบกำหนดแล้ว" : "ใช้งานได้ถึง"}</p>
            <p className="text-lg font-extrabold">{thaiDate(data.dueDate)}</p>
            {data.overdue && (
              <p className="mt-1 text-xs font-bold">
                ร้านถูกระงับชั่วคราว ลูกค้าจองไม่ได้ ชำระแล้วอัปสลิปด้านล่าง อนุมัติแล้วเปิดใช้ต่อได้ทันที
              </p>
            )}
          </>
        ) : (
          <p className="text-sm font-bold">ยังไม่มีรอบชำระ — ชำระครั้งแรกแล้วระบบนับรอบให้เอง</p>
        )}
        {pending && <p className="mt-2 text-xs font-bold">⏳ มีสลิปรอผู้ดูแลระบบอนุมัติอยู่</p>}
      </div>

      {isOwner && (
        <section>
          <SectionLabel>ชำระค่าบริการ</SectionLabel>
          <div className="space-y-4 rounded-petflow bg-card p-4 shadow-petflow-sm">
            <div className="grid grid-cols-2 gap-2">
              {(["month", "year"] as Plan[]).map((p) => {
                const amount = p === "year" ? s.yearly : s.monthly;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlan(p)}
                    className={`rounded-petflow-sm border-2 p-3 text-left ${
                      plan === p ? "border-latte-deep bg-latte/10" : "border-petflow-line"
                    }`}
                  >
                    <p className="text-sm font-extrabold text-petflow-chocolate">{PLAN_LABEL[p]}</p>
                    <p className="text-xs text-brown-soft">
                      {amount ? `${amount.toLocaleString()} บาท` : "สอบถามราคา"}
                      {p === "year" && s.monthly > 0 && s.yearly > 0 && s.yearly < s.monthly * 12
                        ? ` · ประหยัด ${(s.monthly * 12 - s.yearly).toLocaleString()} บาท`
                        : ""}
                    </p>
                  </button>
                );
              })}
            </div>

            {(s.accountNo || s.promptpay) && (
              <div className="rounded-petflow-sm bg-paper p-3 text-sm text-brown">
                <p className="text-xs font-bold text-brown-soft">โอนเงิน {price ? `${price.toLocaleString()} บาท` : ""} มาที่</p>
                {s.accountNo && (
                  <p className="font-bold">
                    {s.bankName} {s.accountNo}
                    {s.accountName && <span className="font-normal"> · {s.accountName}</span>}
                  </p>
                )}
                {s.promptpay && <p className="font-bold">พร้อมเพย์ {s.promptpay}</p>}
                {s.note && <p className="mt-1 text-xs text-brown-soft">{s.note}</p>}
              </div>
            )}

            <label className="block">
              <span className="text-xs font-bold text-brown-soft">รูปสลิป</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => pickFile(e.target.files?.[0])}
                className="mt-1 block w-full text-xs"
              />
            </label>
            {slip && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={slip} alt="สลิป" className="max-h-64 rounded-petflow-sm border border-petflow-line" />
            )}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="หมายเหตุ (ถ้ามี)"
              className="w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={sending || !slip}
              onClick={send}
              className="w-full rounded-full bg-latte-deep py-3 text-sm font-extrabold text-white disabled:opacity-40"
            >
              {sending ? "กำลังส่ง…" : "ส่งสลิปให้ตรวจ"}
            </button>
          </div>
        </section>
      )}

      {data.payments.length > 0 && (
        <section>
          <SectionLabel>ประวัติการชำระ</SectionLabel>
          <ul className="divide-y divide-petflow-line rounded-petflow bg-card shadow-petflow-sm">
            {data.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-bold text-brown">
                    {PLAN_LABEL[p.plan]} · {p.amount.toLocaleString()} บาท
                  </p>
                  <p className="text-[11px] text-brown-soft">
                    ส่งเมื่อ {thaiDate(p.createdAt)}
                    {p.status === "approved" && p.dueAfter ? ` · ใช้ได้ถึง ${thaiDate(p.dueAfter)}` : ""}
                    {p.decidedNote ? ` · ${p.decidedNote}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {p.slipUrl && (
                    <a href={p.slipUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-latte-deep underline">
                      สลิป
                    </a>
                  )}
                  <span className="text-xs font-bold">{STATUS_LABEL[p.status]}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
