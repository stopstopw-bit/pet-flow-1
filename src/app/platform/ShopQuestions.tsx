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
  // คำตอบที่กำลังเอาไปตั้งค่าร้าน
  const [applying, setApplying] = useState("");

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

  // ส่งผ่านลิงก์ผิดร้าน — ย้ายคำตอบไปผูกกับร้านที่ถูก
  const move = async (it: Item, tenantId: string) => {
    const to = nameOf(tenantId);
    if (!tenantId || !confirm(`ย้ายคำตอบนี้ไปเป็นของร้าน "${to}"?`)) return;
    const res = await fetch("/api/platform/shop-questions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: it.id, tenantId }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg(d.error || "ย้ายไม่สำเร็จ");
    setMsg(`ย้ายคำตอบไปร้าน ${to} แล้ว`);
    setApplying("");
    load();
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
                <div className="flex flex-wrap gap-2">
                  <select
                    value=""
                    onChange={(e) => move(it, e.target.value)}
                    aria-label="ย้ายไปร้าน"
                    className="rounded-petflow-sm border border-white/20 bg-black/30 px-2 py-1 text-[11px] font-bold"
                  >
                    <option value="">ย้ายไปร้าน…</option>
                    {tenants
                      .filter((t) => t.id !== it.tenantId)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                  {shop && (
                    <button
                      type="button"
                      onClick={() => setApplying(applying === it.id ? "" : it.id)}
                      className="rounded-petflow-sm bg-latte-deep px-3 py-1 text-[11px] font-extrabold text-white"
                    >
                      ⚙️ ตั้งค่าร้านจากคำตอบ
                    </button>
                  )}
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
              {applying === it.id && <ApplyPanel id={it.id} shop={shop} onDone={setMsg} />}
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

type Change = { key: string; label: string; before: string; after: string };

/** ดูก่อนว่าจะเปลี่ยนอะไรในตั้งค่าร้าน (ค่าเดิม → ค่าใหม่) เลือกข้อที่ต้องการ แล้วกดตั้งค่า */
function ApplyPanel({ id, shop, onDone }: { id: string; shop: string; onDone: (msg: string) => void }) {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [manual, setManual] = useState<string[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr("");
    try {
      const res = await fetch(`/api/platform/shop-questions/apply?id=${encodeURIComponent(id)}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return setErr(d.error || `HTTP ${res.status}`);
      setChanges(d.changes || []);
      setManual(d.manual || []);
      setPicked(new Set((d.changes || []).map((c: Change) => c.key)));
    } catch {
      setErr("เชื่อมต่อไม่ได้");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (key: string) => {
    const next = new Set(picked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPicked(next);
  };

  const apply = async () => {
    if (!confirm(`ตั้งค่าร้าน "${shop}" ${picked.size} ข้อ ตามคำตอบนี้?`)) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/platform/shop-questions/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, keys: [...picked] }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return setErr(d.error || `HTTP ${res.status}`);
      onDone(`ตั้งค่าร้าน ${shop} แล้ว ${d.applied} ข้อ`);
      await load();
    } catch {
      setErr("เชื่อมต่อไม่ได้");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-petflow-sm border border-white/15 bg-black/20 p-3">
      {err && <p className="mb-2 text-xs font-bold text-red-300">❌ {err}</p>}
      {!changes && !err && <p className="text-xs text-white/50">กำลังเทียบกับตั้งค่าร้าน…</p>}
      {changes && changes.length === 0 && (
        <p className="mb-2 text-xs text-white/60">ตั้งค่าร้านตรงกับคำตอบแล้วทุกข้อ</p>
      )}
      {changes && changes.length > 0 && (
        <>
          <p className="mb-2 text-xs text-white/60">ติ๊กข้อที่จะตั้งให้ร้าน {shop} (ค่าเดิม → ค่าใหม่)</p>
          <div className="space-y-1.5">
            {changes.map((c) => (
              <label key={c.key} className="flex cursor-pointer gap-2 text-xs">
                <input type="checkbox" checked={picked.has(c.key)} onChange={() => toggle(c.key)} className="mt-0.5" />
                <span>
                  <span className="font-bold">{c.label}</span>
                  <span className="block text-white/40 line-through">{c.before}</span>
                  <span className="block text-emerald-200">{c.after}</span>
                </span>
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={busy || picked.size === 0}
            onClick={apply}
            className="mt-3 rounded-petflow-sm bg-latte-deep px-4 py-1.5 text-xs font-extrabold text-white disabled:opacity-40"
          >
            {busy ? "กำลังตั้งค่า…" : `ตั้งค่าที่เลือก (${picked.size} ข้อ)`}
          </button>
        </>
      )}
      {manual.length > 0 && (
        <div className="mt-3 text-xs text-white/60">
          <p className="font-bold">ยังต้องตั้งเองในหลังบ้านร้าน (ดูคำตอบด้านล่าง)</p>
          <ul className="ml-4 list-disc">
            {manual.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
