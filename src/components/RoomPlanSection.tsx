"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { MoreMenu } from "@/components/ui";
import { NumInput } from "@/components/NumInput";

type PlanView = {
  id: string;
  name: string;
  kind?: "room" | "package";
  status: "active" | "cancelled";
  price: number;
  fullPrice: number;
  discountPct: number;
  installments: number;
  payments: { amount: number; date: string; method: string }[];
  paid: number;
  remaining: number;
  installmentsLeft: number;
  nextInstallment: number;
  nights: { roomType: string; roomLabel: string; total: number; left: number }[];
  createdAt: string;
};

type Room = { id: string; name: string; price: number };

type Quote = {
  ok: boolean;
  fullPrice?: number;
  discountPct?: number;
  price?: number;
  totalNights?: number;
  error?: string;
};

const baht = (n: number) => `${Math.round(n).toLocaleString()} ฿`;

/**
 * แพ็กห้องรายเดือนของลูกค้า — ขายแพ็ก (เลือกห้องแต่ละประเภทกี่คืน), รับเงินงวด,
 * ส่งการ์ดสรุป/คืนคงเหลือให้ลูกค้า
 */
export function RoomPlanSection({
  customerId,
  hasLine,
  onChanged,
}: {
  customerId: string;
  hasLine: boolean;
  onChanged?: () => void;
}) {
  const [plans, setPlans] = useState<PlanView[]>([]);
  const [settings, setSettings] = useState({ discountPct: 30, minNights: 30 });
  const [rooms, setRooms] = useState<Room[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");

  // ฟอร์มขาย
  const [nights, setNights] = useState<Record<string, string>>({});
  const [pct, setPct] = useState(""); // ว่าง = ใช้ค่าร้านอัตโนมัติ
  const [installments, setInstallments] = useState(1);
  const [firstPay, setFirstPay] = useState("");
  const [method, setMethod] = useState<"transfer" | "cash">("transfer");
  const [notify, setNotify] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);

  const load = useCallback(() => {
    fetch(`/api/room-plans?customerId=${customerId}`)
      .then((r) => r.json())
      .then((d) => {
        // คอร์สแบ่งจ่ายโชว์ในส่วนคอร์สแทน — ที่นี่เฉพาะแพ็กห้อง
        setPlans(((d.plans || []) as PlanView[]).filter((p) => p.kind !== "package"));
        if (d.settings) setSettings(d.settings);
      })
      .catch(() => {});
  }, [customerId]);

  useEffect(() => {
    load();
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) =>
        setRooms(
          (d.config?.rooms || []).map((r: Room) => ({ id: r.id, name: r.name, price: r.price }))
        )
      )
      .catch(() => {});
  }, [load]);

  const picks = useMemo(
    () =>
      rooms
        .map((r) => ({ roomType: r.id, nights: Math.round(Number(nights[r.id]) || 0) }))
        .filter((p) => p.nights > 0),
    [rooms, nights]
  );

  // คิดราคาจากเซิร์ฟเวอร์ (ราคาห้องจริงในตั้งค่า) ทุกครั้งที่เปลี่ยนจำนวนคืน/ส่วนลด
  useEffect(() => {
    if (!open || picks.length === 0) {
      setQuote(null);
      return;
    }
    const q = picks.map((p) => `${p.roomType}:${p.nights}`).join(",");
    const ctl = new AbortController();
    fetch(`/api/room-plans?quote=${encodeURIComponent(q)}&pct=${encodeURIComponent(pct)}`, {
      signal: ctl.signal,
    })
      .then((r) => r.json())
      .then((d) => setQuote(d))
      .catch(() => {});
    return () => ctl.abort();
  }, [open, picks, pct]);

  // ยอดงวดแรกแนะนำ = ราคาแพ็ก ÷ จำนวนงวด
  const suggestedFirst = quote?.price ? Math.ceil(quote.price / installments) : 0;

  const sell = async () => {
    if (!quote?.ok || !quote.price) return;
    const first = firstPay === "" ? suggestedFirst : Math.round(Number(firstPay) || 0);
    if (
      !confirm(
        `ขายแพ็กห้อง ${quote.totalNights} คืน ราคา ${baht(quote.price)}` +
          (installments > 1 ? ` แบ่ง ${installments} งวด` : "") +
          (first > 0 ? `\nรับเงินวันนี้ ${baht(first)}` : "\nยังไม่รับเงินวันนี้") +
          "\n\nยืนยัน?"
      )
    )
      return;
    setBusy("sell");
    try {
      const res = await fetch("/api/room-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          picks,
          discountPct: pct === "" ? undefined : Number(pct),
          installments,
          firstPayment: first,
          paymentMethod: method,
          notify: notify && hasLine,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.error === "need_sql") {
        alert("ยังใช้ไม่ได้ — ไปที่ ตั้งค่า > ขั้นสูง แล้วกด 'อัปเดตฐานข้อมูล' ครั้งเดียวก่อนนะคะ");
        return;
      }
      if (!res.ok || !d.ok) {
        toast("ขายแพ็กไม่สำเร็จ", "error");
        return;
      }
      toast(
        d.notifyError ? `ขายแล้ว · ⚠️ ส่ง LINE ไม่ได้: ${d.notifyError}` : "ขายแพ็กแล้ว 🏠",
        d.notifyError ? "info" : "success"
      );
      setNights({});
      setPct("");
      setInstallments(1);
      setFirstPay("");
      setOpen(false);
      load();
      onChanged?.();
    } finally {
      setBusy("");
    }
  };

  const pay = async (p: PlanView) => {
    const raw = prompt(
      `รับเงินงวด — ${p.name}\nคงเหลือ ${baht(p.remaining)} · เหลือ ${p.installmentsLeft} งวด\n\nรับรอบนี้กี่บาท?`,
      String(p.nextInstallment || "")
    );
    if (raw == null) return;
    const amount = Math.round(Number(raw.replace(/[,\s฿]/g, "")) || 0);
    if (amount <= 0) return;
    const m = confirm("รับเป็นเงินสดใช่ไหม?\n(ตกลง = เงินสด · ยกเลิก = โอน)") ? "cash" : "transfer";
    setBusy(p.id);
    try {
      const res = await fetch("/api/room-plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pay", planId: p.id, amount, paymentMethod: m }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        toast(
          `รับแล้ว ${baht(amount)} · คงเหลือ ${baht(d.plan.remaining)}` +
            (d.notifyError ? ` · ⚠️ ส่งการ์ดไม่ได้: ${d.notifyError}` : " · ส่งการ์ดสรุปให้ลูกค้าแล้ว"),
          d.notifyError ? "info" : "success"
        );
        load();
        onChanged?.();
      } else if (d.error === "over_due") {
        toast(`เกินยอดค้าง — ค้างอยู่ ${baht(d.due)}`, "error");
      } else {
        toast("ไม่สำเร็จ", "error");
      }
    } finally {
      setBusy("");
    }
  };

  const sendCard = async (p: PlanView) => {
    setBusy(p.id);
    try {
      const res = await fetch("/api/room-plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_card", planId: p.id }),
      });
      const d = await res.json().catch(() => ({}));
      toast(d.ok ? "ส่งการ์ดคืนคงเหลือแล้ว 💬" : `ส่งไม่ได้: ${d.notifyError || "ไม่ทราบสาเหตุ"}`, d.ok ? "success" : "error");
    } finally {
      setBusy("");
    }
  };

  const cancel = async (p: PlanView) => {
    if (!confirm(`ยกเลิก ${p.name}? คืนที่เหลือจะใช้ไม่ได้ (เงินที่รับแล้วไม่ถูกลบ ต้องคืนลูกค้าเองถ้าจะคืน)`)) return;
    setBusy(p.id);
    try {
      await fetch("/api/room-plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", planId: p.id }),
      });
      load();
      onChanged?.();
    } finally {
      setBusy("");
    }
  };

  const field =
    "mt-1 min-h-[44px] w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm text-brown";

  return (
    <section className="mb-4 rounded-petflow bg-card p-4 shadow-petflow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
            <Icon name="bed" size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Room plans</p>
            <h2 className="truncate text-sm font-extrabold text-petflow-chocolate">แพ็กห้องรายเดือน</h2>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold ${
            open ? "bg-paper text-brown" : "bg-honey/40 text-petflow-chocolate"
          }`}
        >
          <Icon name={open ? "x" : "plus"} size={16} strokeWidth={2.2} />
          {open ? "ปิด" : "ขายแพ็กใหม่"}
        </button>
      </div>

      {open && (
        <div className="mb-3 space-y-2 rounded-petflow-sm border border-honey-deep/40 bg-honey/10 p-3">
          <p className="text-[11px] text-brown-soft">
            เลือกห้องแต่ละแบบกี่คืน ผสมกันได้ · ราคาจากราคาเต็มลด {settings.discountPct}% เมื่อรวมครบ{" "}
            {settings.minNights} คืน · ไม่มีวันหมดอายุ · พักห้องไหนหักคืนของห้องนั้นตามจริง ·{" "}
            <b>ต้องจ่ายครบทุกงวดก่อนถึงจะเริ่มใช้คืนได้</b>
          </p>
          {rooms.map((r) => (
            <label key={r.id} className="flex min-h-[44px] items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate font-bold text-brown">
                ห้อง {r.name}{" "}
                <span className="font-normal text-brown-faint">({r.price.toLocaleString()}/คืน)</span>
              </span>
              <NumInput
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="0"
                value={nights[r.id] || ""}
                onChange={(e) => setNights({ ...nights, [r.id]: e.target.value })}
                className="min-h-[40px] w-20 rounded-petflow-sm border border-petflow-line bg-card px-2.5 text-right text-sm"
              />
              <span className="text-brown-faint">คืน</span>
            </label>
          ))}

          <div className="grid grid-cols-2 gap-2 border-t border-petflow-line pt-2">
            <label className="text-[11px] font-bold text-brown-soft">
              ส่วนลด %
              <NumInput
                type="number"
                min="0"
                max="100"
                placeholder={`อัตโนมัติ (${quote?.discountPct ?? settings.discountPct})`}
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                className={field}
              />
            </label>
            <label className="text-[11px] font-bold text-brown-soft">
              แบ่งจ่าย
              <select
                value={installments}
                onChange={(e) => setInstallments(Number(e.target.value))}
                className={field}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? "จ่ายครั้งเดียว" : `${n} งวด`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {quote?.ok && (
            <div className="space-y-0.5 rounded-petflow-sm bg-card px-3 py-2 text-xs">
              <div className="flex justify-between text-brown-soft">
                <span>ราคาเต็ม {quote.totalNights} คืน</span>
                <span>{baht(quote.fullPrice || 0)}</span>
              </div>
              <div className="flex justify-between text-wait">
                <span>ส่วนลด {quote.discountPct}%</span>
                <span>-{baht((quote.fullPrice || 0) - (quote.price || 0))}</span>
              </div>
              <div className="flex justify-between border-t border-petflow-line pt-1 text-sm font-extrabold text-petflow-chocolate">
                <span>ราคาแพ็ก</span>
                <span>{baht(quote.price || 0)}</span>
              </div>
              {installments > 1 && (
                <p className="text-[10px] text-brown-faint">
                  งวดละประมาณ {baht(suggestedFirst)} ({installments} งวด)
                </p>
              )}
              {(quote.totalNights || 0) < settings.minNights && pct === "" && (
                <p className="text-[10px] text-wait">
                  รวมยังไม่ถึง {settings.minNights} คืน — ไม่ได้ส่วนลดรายเดือน (ใส่ % เองได้)
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-bold text-brown-soft">
              รับเงินวันนี้ (บาท)
              <NumInput
                type="number"
                min="0"
                inputMode="numeric"
                placeholder={suggestedFirst ? String(suggestedFirst) : "0"}
                value={firstPay}
                onChange={(e) => setFirstPay(e.target.value)}
                className={field}
              />
            </label>
            <label className="text-[11px] font-bold text-brown-soft">
              วิธีจ่าย
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as "transfer" | "cash")}
                className={field}
              >
                <option value="transfer">โอน</option>
                <option value="cash">เงินสด</option>
              </select>
            </label>
          </div>
          <p className="text-[10px] text-brown-faint">
            ไม่ใส่ = รับงวดแรกตามยอดแนะนำ · ใส่ 0 = ยังไม่รับเงินวันนี้
          </p>
          {hasLine && (
            <label className="flex min-h-[40px] items-center gap-2.5 text-xs font-bold text-brown-soft">
              <input
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
                className="h-4 w-4 shrink-0 accent-latte-deep"
              />
              ส่งการ์ดสรุปให้ลูกค้าทาง LINE
            </label>
          )}
          <button
            type="button"
            disabled={!quote?.ok || busy === "sell"}
            onClick={sell}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-petflow-chocolate text-sm font-extrabold text-card shadow-petflow-sm disabled:opacity-40"
          >
            <Icon name="check" size={18} strokeWidth={2.2} />
            {busy === "sell" ? "กำลังบันทึก..." : "ขายแพ็กห้อง"}
          </button>
        </div>
      )}

      {plans.length === 0 ? (
        !open && (
          <p className="rounded-petflow-sm border border-dashed border-petflow-line py-4 text-center text-xs text-brown-faint">
            ยังไม่มีแพ็กห้อง
          </p>
        )
      ) : (
        <ul className="space-y-2">
          {plans.map((p) => {
            const off = p.status === "cancelled";
            return (
              <li
                key={p.id}
                className={`rounded-petflow-sm border p-3 text-xs ${
                  off ? "border-dashed border-brown-faint opacity-60" : "border-petflow-line bg-paper/50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-extrabold text-brown">
                    {p.name}
                    {off && " (ยกเลิกแล้ว)"}
                  </p>
                  <span className="shrink-0 text-[10px] text-brown-faint">
                    {p.createdAt.slice(0, 10)}
                  </span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {p.nights.map((n) => (
                    <li key={n.roomType} className="flex justify-between">
                      <span className="text-brown-soft">{n.roomLabel}</span>
                      <span className={`font-bold ${n.left > 0 ? "text-ok" : "text-brown-faint"}`}>
                        เหลือ {n.left}/{n.total} คืน
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-1.5 border-t border-petflow-line pt-1.5 text-brown-soft">
                  ราคา {baht(p.price)} (ลด {p.discountPct}% จาก {baht(p.fullPrice)}) · จ่ายแล้ว{" "}
                  <b className="text-ok">{baht(p.paid)}</b>
                  {p.remaining > 0 ? (
                    <>
                      {" "}
                      · ค้าง <b className="text-wait">{baht(p.remaining)}</b> · เหลือ {p.installmentsLeft} งวด
                      <span className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-wait">
                        <Icon name="alert" size={12} />
                        ยังใช้คืนไม่ได้จนกว่าจะจ่ายครบ
                      </span>
                    </>
                  ) : (
                    <span className="mt-0.5 flex items-center gap-1 font-bold text-ok">
                      <Icon name="check" size={12} strokeWidth={2.4} />
                      ครบแล้ว ใช้คืนได้
                    </span>
                  )}
                </div>
                {p.payments.length > 0 && (
                  <p className="mt-0.5 text-[10px] text-brown-faint">
                    {p.payments
                      .map((x, i) => `งวด ${i + 1}: ${x.date} ${Math.round(x.amount).toLocaleString()}`)
                      .join(" · ")}
                  </p>
                )}
                {!off && (
                  <div className="mt-2.5 flex items-center gap-2">
                    {p.remaining > 0 ? (
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => pay(p)}
                        className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-full bg-petflow-chocolate px-3 text-xs font-extrabold text-card disabled:opacity-50"
                      >
                        <Icon name="money" size={16} />
                        รับเงินงวด
                      </button>
                    ) : hasLine ? (
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => sendCard(p)}
                        className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-full bg-honey/40 px-3 text-xs font-extrabold text-petflow-chocolate disabled:opacity-50"
                      >
                        <Icon name="send" size={16} />
                        ส่งการ์ดคืนคงเหลือ
                      </button>
                    ) : (
                      <span className="flex-1" />
                    )}
                    <MoreMenu
                      label="จัดการแพ็ก"
                      items={[
                        ...(p.remaining > 0 && hasLine
                          ? [
                              {
                                label: "ส่งการ์ดคืนคงเหลือ",
                                icon: "send",
                                disabled: !!busy,
                                onClick: () => sendCard(p),
                              },
                            ]
                          : []),
                        {
                          label: "ยกเลิกแพ็ก",
                          icon: "trash",
                          danger: true,
                          disabled: !!busy,
                          onClick: () => cancel(p),
                        },
                      ]}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
