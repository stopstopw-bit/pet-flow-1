"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function PlatformLoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // ถูกพากลับมาเพราะ session หมดอายุ — บอกให้รู้ว่าแค่ล็อกอินใหม่
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("expired")) {
      setErr("หมดเวลาเข้าสู่ระบบแล้ว — ใส่รหัสอีกครั้งเพื่อทำต่อ");
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/platform/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        router.push("/platform");
      } else {
        setErr(data.error || "รหัสไม่ถูกต้อง");
      }
    } catch {
      setErr("เชื่อมต่อไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1a1d29] px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-petflow border border-white/10 bg-[#232637] p-8 shadow-petflow"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-latte-deep text-2xl">
            🛡️
          </div>
          <h1 className="mt-4 text-lg font-extrabold text-white">
            PetFlow Platform
          </h1>
          <p className="mt-1 text-xs text-white/50">สำหรับผู้ดูแลระบบเท่านั้น</p>
        </div>
        <label className="mb-2 block text-xs font-bold text-white/70">
          รหัสผู้ดูแลระบบ
        </label>
        <div className="relative mb-4">
          <input
            type={showCode ? "text" : "password"}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-petflow-sm border border-white/10 bg-[#1a1d29] px-4 py-3 pr-11 text-sm text-white outline-none focus:border-latte-deep"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowCode((v) => !v)}
            aria-label={showCode ? "ซ่อนรหัส" : "แสดงรหัส"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-white/50"
          >
            {showCode ? "🙈" : "👁️"}
          </button>
        </div>
        {err && <p className="mb-3 text-xs font-semibold text-red-400">{err}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-petflow-sm bg-latte-deep py-3 text-sm font-extrabold text-white disabled:opacity-60"
        >
          {busy ? "กำลังตรวจสอบ…" : "เข้าใช้งาน"}
        </button>
      </form>
    </div>
  );
}
