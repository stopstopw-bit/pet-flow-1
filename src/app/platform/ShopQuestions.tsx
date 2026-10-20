"use client";

import { useCallback, useEffect, useState } from "react";

type Item = { id: string; tenantId: string; shopName: string; text: string; createdAt: string; updatedAt: string };
type ShopRef = { id: string; slug: string; name: string };

/**
 * คำตอบแบบสอบถามเจ้าของร้านใหม่ — เลือกร้านแล้วส่งลิงก์ /s/<slug>/shop-questions ให้เจ้าของร้านตอบ
 * คำตอบจะผูกกับร้านนั้น แล้วมาเปิดอ่านตรงนี้ก่อนตั้งค่าร้านให้
 */
export default function ShopQuestions({ tenants }: { tenants: ShopRef[] }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState("");
  const [msg, setMsg] = useState("");
  const [pick, setPick] = useState("");
  // เปิดแบบสอบถามของร้านที่เลือกในหน้านี้เลย — ผู้ดูแลระบบกรอกแทนเจ้าของร้านได้
  const [filling, setFilling] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const picked = tenants.find((t) => t.id === pick);
  const link = picked ? `${origin}/s/${picked.slug}/shop-questions` : "";
  const nameOf = (tenantId: string) => tenants.find((t) => t.id === tenantId)?.name || "";

  const load = useCallback(async () => {
    setErr("");
    try {
      const res = await fetch("/api/platform/shop-questions");
      const d = await res.json().catch(() => ({}));
      if (res.ok) setItems(d.items || []);
      else setErr(d.error || `HTTP ${res.status}`);
    } catch {
      setErr("เชื่อมต่อไม่ได้");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // แบบสอบถามในกรอบด้านล่างส่งคำตอบสำเร็จ → โหลดรายการใหม่ให้เห็นทันที
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === "petflow-shop-questions-sent") {
        setMsg("ได้รับคำตอบแล้ว");
        load();
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [load]);

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(done);
    } catch {
      setMsg("คัดลอกไม่ได้ — กดค้างที่ข้อความแล้วคัดลอกเอง");
    }
  };

  const remove = async (it: Item) => {
    if (!confirm(`ลบคำตอบของ "${it.shopName || nameOf(it.tenantId) || "ไม่มีชื่อร้าน"}"?`)) return;
    const res = await fetch(`/api/platform/shop-questions?id=${encodeURIComponent(it.id)}`, { method: "DELETE" });
    if (res.ok) load();
    else setMsg("ลบไม่สำเร็จ");
  };

  // คำตอบของร้านที่เลือก ขึ้นก่อน
  const shown = (items || []).slice().sort((a, b) => Number(b.tenantId === pick) - Number(a.tenantId === pick));

  return (
    <div className="mb-6 rounded-petflow border border-white/10 bg-[#232637] p-4">
      <p className="mb-1 text-sm font-extrabold">📝 แบบสอบถามเจ้าของร้านใหม่</p>
      <p className="mb-3 text-xs text-white/50">
        เลือกร้าน แล้วกรอกในหน้านี้เลย หรือส่งลิงก์ให้เจ้าของร้านตอบ — คำตอบจะผูกกับร้านนั้น และขึ้นด้านล่างนี้
      </p>
      <div className="mb-3 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
        <select
          value={pick}
          onChange={(e) => {
            setPick(e.target.value);
            setFilling(false);
          }}
          className="rounded-petflow-sm border border-white/15 bg-black/30 px-3 py-2 text-xs"
        >
          <option value="">— เลือกร้าน —</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.slug})
            </option>
          ))}
        </select>
        {link && (
          <>
            <code className="break-all rounded bg-black/30 px-2 py-1 text-xs">{link}</code>
            <button
              type="button"
              onClick={() => copy(link, "คัดลอกลิงก์แล้ว")}
              className="rounded-petflow-sm bg-latte-deep px-4 py-1.5 text-xs font-extrabold text-white"
            >
              คัดลอกลิงก์
            </button>
            <button
              type="button"
              onClick={() => setFilling(!filling)}
              className="rounded-petflow-sm border border-white/20 px-4 py-1.5 text-xs font-extrabold"
            >
              {filling ? "ปิดแบบสอบถาม" : "📝 กรอกในหน้านี้"}
            </button>
          </>
        )}
      </div>
      {filling && link && (
        <iframe
          src={`/s/${picked?.slug}/shop-questions`}
          title={`แบบสอบถาม ${picked?.name}`}
          className="mb-3 h-[80vh] w-full rounded-petflow-sm border border-white/10 bg-white"
        />
      )}
      {msg && <p className="mb-2 text-xs text-white/70">{msg}</p>}
      {err && <p className="text-xs font-bold text-white/70">❌ {err}</p>}
      {items && items.length === 0 && <p className="text-xs text-white/50">ยังไม่มีใครตอบ</p>}
      <div className="space-y-2">
        {shown.map((it) => {
          const shop = nameOf(it.tenantId);
          return (
            <div key={it.id} className="rounded-petflow-sm border border-white/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" onClick={() => setOpen(open === it.id ? "" : it.id)} className="text-left">
                  <span className="text-sm font-bold">{it.shopName || shop || "ไม่มีชื่อร้าน"}</span>
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      shop ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 text-white/50"
                    }`}
                  >
                    {shop ? `ร้าน: ${shop}` : "ยังไม่ผูกร้าน"}
                  </span>
                  <span className="ml-2 text-[11px] text-white/50">
                    ส่งล่าสุด {new Date(it.updatedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
                  </span>
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => copy(it.text, "คัดลอกคำตอบแล้ว")}
                    className="rounded-petflow-sm border border-white/20 px-3 py-1 text-[11px] font-bold"
                  >
                    คัดลอก
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(it)}
                    className="rounded-petflow-sm border border-white/20 px-3 py-1 text-[11px] font-bold text-white/60"
                  >
                    ลบ
                  </button>
                </div>
              </div>
              {open === it.id && (
                <pre className="mt-2 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words text-xs text-white/80">{it.text}</pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
