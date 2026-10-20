"use client";

import { useCallback, useEffect, useState } from "react";

type Item = { id: string; shopName: string; text: string; createdAt: string; updatedAt: string };

/**
 * คำตอบแบบสอบถามเจ้าของร้านใหม่ — ส่งลิงก์ /shop-questions ให้เจ้าของร้านตอบ
 * แล้วมาเปิดอ่านตรงนี้ก่อนตั้งค่าร้านให้
 */
export default function ShopQuestions() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState("");
  const [msg, setMsg] = useState("");

  const link = typeof window !== "undefined" ? `${window.location.origin}/shop-questions` : "/shop-questions";

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

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(done);
    } catch {
      setMsg("คัดลอกไม่ได้ — กดค้างที่ข้อความแล้วคัดลอกเอง");
    }
  };

  const remove = async (it: Item) => {
    if (!confirm(`ลบคำตอบของ "${it.shopName || "ไม่มีชื่อร้าน"}"?`)) return;
    const res = await fetch(`/api/platform/shop-questions?id=${encodeURIComponent(it.id)}`, { method: "DELETE" });
    if (res.ok) load();
    else setMsg("ลบไม่สำเร็จ");
  };

  return (
    <div className="mb-6 rounded-petflow border border-white/10 bg-[#232637] p-4">
      <p className="mb-1 text-sm font-extrabold">📝 แบบสอบถามเจ้าของร้านใหม่</p>
      <p className="mb-3 text-xs text-white/50">ส่งลิงก์นี้ให้เจ้าของร้านตอบ คำตอบจะขึ้นด้านล่าง</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <code className="break-all rounded bg-black/30 px-2 py-1 text-xs">{link}</code>
        <button
          type="button"
          onClick={() => copy(link, "คัดลอกลิงก์แล้ว")}
          className="rounded-petflow-sm bg-latte-deep px-4 py-1.5 text-xs font-extrabold text-white"
        >
          คัดลอกลิงก์
        </button>
      </div>
      {msg && <p className="mb-2 text-xs text-white/70">{msg}</p>}
      {err && <p className="text-xs font-bold text-white/70">❌ {err}</p>}
      {items && items.length === 0 && <p className="text-xs text-white/50">ยังไม่มีใครตอบ</p>}
      <div className="space-y-2">
        {items?.map((it) => (
          <div key={it.id} className="rounded-petflow-sm border border-white/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={() => setOpen(open === it.id ? "" : it.id)} className="text-left">
                <span className="text-sm font-bold">{it.shopName || "ไม่มีชื่อร้าน"}</span>
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
        ))}
      </div>
    </div>
  );
}
