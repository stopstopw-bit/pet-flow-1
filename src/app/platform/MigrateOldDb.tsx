"use client";

import { useEffect, useState } from "react";

type Status = { configured: boolean; ready: boolean; message: string };
type Report = {
  ok: boolean;
  schema: string;
  tables: { table: string; rows: number; error?: string }[];
  files: { copied: number; failed: number };
};

/**
 * ปุ่มย้ายข้อมูลจาก Supabase ตัวเก่า — โชว์เฉพาะตอนตั้ง OLD_SUPABASE_URL ไว้ใน Vercel
 * ย้ายเสร็จแล้วลบ env สองตัวนั้นทิ้ง การ์ดนี้จะหายไปเอง
 */
export default function MigrateOldDb({ explainMissing = false }: { explainMissing?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [statusErr, setStatusErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/platform/migrate-old")
      .then(async (r) => {
        if (r.ok) return setStatus(await r.json());
        const d = await r.json().catch(() => null);
        setStatusErr(d?.error || `HTTP ${r.status}`);
      })
      .catch(() => setStatusErr("เชื่อมต่อไม่ได้"));
  }, []);

  if (!status?.configured) {
    // ยังไม่มีร้านเลย แต่การ์ดย้ายข้อมูลไม่ขึ้น — บอกเหตุผลไว้ ไม่งั้นดูเหมือนข้อมูลหายเฉยๆ
    if (!explainMissing || (!status && !statusErr)) return null;
    return (
      <p className="mb-6 rounded-petflow border border-white/10 bg-[#232637] p-4 text-xs text-white/60">
        📦 ย้ายข้อมูลจากฐานข้อมูลเก่ายังใช้ไม่ได้: {statusErr || status?.message}
        {status && " — ถ้าใส่ไว้แล้ว ตรวจว่าติ๊ก Production และกด Redeploy"}
      </p>
    );
  }

  const run = async () => {
    if (!confirm("คัดลอกข้อมูลและรูปทั้งหมดจากฐานข้อมูลเก่ามาตัวใหม่? (กดซ้ำได้ ไม่ทำให้ข้อมูลซ้ำ)")) return;
    setBusy(true);
    setErr("");
    setReport(null);
    try {
      const res = await fetch("/api/platform/migrate-old", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setReport(d);
      else setErr(d.error || "ย้ายไม่สำเร็จ");
    } catch {
      setErr("เชื่อมต่อไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  const copied = report?.tables.filter((t) => t.rows > 0) ?? [];
  const failed = report?.tables.filter((t) => t.error) ?? [];

  return (
    <div className="mb-6 rounded-petflow border border-white/10 bg-[#232637] p-4">
      <p className="mb-1 text-sm font-extrabold">📦 ย้ายข้อมูลจากฐานข้อมูลเก่า</p>
      <p className="mb-3 text-xs text-white/50">{status.message}</p>
      <button
        type="button"
        onClick={run}
        disabled={busy || !status.ready}
        className="w-full rounded-petflow-sm bg-latte-deep py-2.5 text-xs font-extrabold text-white disabled:opacity-40 sm:w-auto sm:px-6"
      >
        {busy ? "กำลังย้าย… (อาจใช้เวลาหลายนาที)" : "ย้ายข้อมูล"}
      </button>
      {err && <p className="mt-2 text-xs font-bold text-white/70">❌ {err}</p>}
      {report && (
        <div className="mt-3 space-y-1 text-xs text-white/70">
          <p className="font-bold">
            {report.ok ? "✅ ย้ายเสร็จแล้ว" : "⚠️ ย้ายได้บางส่วน — แคปหน้านี้ส่งให้ทีมดูแล"}
          </p>
          <p>ตาราง: {report.schema}</p>
          <p>
            ข้อมูล:{" "}
            {copied.length
              ? copied.map((t) => `${t.table} ${t.rows}`).join(" · ")
              : "ไม่มีข้อมูลในฐานข้อมูลเก่า"}
          </p>
          <p>
            รูป: {report.files.copied} ไฟล์
            {report.files.failed ? ` · ไม่สำเร็จ ${report.files.failed}` : ""}
          </p>
          {failed.map((t) => (
            <p key={t.table} className="text-wait">
              ❌ {t.table}: {t.error}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
