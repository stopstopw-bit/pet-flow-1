"use client";

import { useCallback, useEffect, useState } from "react";
import { adminJson } from "@/lib/admin-fetch";
import { GoogleSetupSection } from "@/components/GoogleSetupSection";
import {
  LiffSetupSection,
  LineMessagingSetupSection,
} from "@/components/LineSetupSection";
import { TelegramSetupSection } from "@/components/TelegramSetupSection";
import { Icon } from "@/components/Icon";
import { HealthCheckSection } from "@/components/HealthCheckSection";

type Status = {
  supabaseUrl: boolean;
  serviceKey: boolean;
  databaseUrl: boolean;
  connected: boolean;
  tablesReady: boolean;
  missingTables: string[];
  message: string;
};

export default function SetupPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [booting, setBooting] = useState(false);
  const [msg, setMsg] = useState("");
  const adminCode = typeof window !== "undefined" ? sessionStorage.getItem("petflow-admin") || "" : "";

  const load = useCallback(async () => {
    setLoading(true);
    setMsg("");
    const result = await adminJson<{ status: Status }>("/api/setup");
    if (result.ok && result.data.status) {
      setStatus(result.data.status);
    } else {
      setStatus(null);
      setMsg(result.ok ? "ตรวจสอบไม่สำเร็จ" : result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const bootstrap = async () => {
    setBooting(true);
    setMsg("");
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminCode }),
    });
    const data = await res.json();
    setMsg(data.message || data.error || "");
    if (data.status) setStatus(data.status);
    setBooting(false);
    if (data.ok) setTimeout(load, 500);
  };

  const copySchema = async () => {
    const res = await fetch("/api/setup?action=schema");
    const text = await res.text();
    await navigator.clipboard.writeText(text);
    setMsg("คัดลอก SQL แล้ว — วางใน Supabase SQL Editor");
  };

  if (loading) {
    return <p className="text-center text-sm text-brown-soft py-10">กำลังตรวจสอบ…</p>;
  }

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Setup</p>
      <h1 className="text-xl font-extrabold text-petflow-chocolate">ติดตั้งระบบ</h1>
      <p className="mb-4 mt-0.5 text-xs text-brown-soft">
        ทำครั้งเดียว — วาง JSON / ลิงก์ แล้วกดบันทึก ไม่ต้องไล่ใส่ Vercel ทีละตัว
      </p>

      <HealthCheckSection />

      <GoogleSetupSection adminCode={adminCode} />
      <LiffSetupSection adminCode={adminCode} />
      <LineMessagingSetupSection adminCode={adminCode} />
      <TelegramSetupSection adminCode={adminCode} />

      {msg && (
        <p className="mb-4 rounded-petflow-sm bg-paper px-3 py-2 text-xs font-bold text-brown">
          {msg}
        </p>
      )}

      {status?.tablesReady ? (
        <div className="mb-4 rounded-petflow bg-sage/15 p-5 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-card text-ok">
            <Icon name="check" size={24} strokeWidth={2.2} />
          </span>
          <p className="mt-2 font-extrabold text-ok">พร้อมใช้งานแล้ว!</p>
          <p className="mt-1 text-xs text-brown-soft">{status.message}</p>
          <a
            href="/admin/settings"
            className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-full bg-petflow-chocolate px-5 text-xs font-bold text-card"
          >
            ไปตั้งค่าร้าน
            <Icon name="chevron" size={14} />
          </a>
        </div>
      ) : (
        <>
          <section className="mb-4 space-y-2 rounded-petflow bg-card p-4 shadow-petflow-sm">
            <h2 className="text-sm font-extrabold text-petflow-chocolate">สถานะ</h2>
            <StatusRow ok={status?.supabaseUrl} label="NEXT_PUBLIC_SUPABASE_URL" />
            <StatusRow ok={status?.serviceKey} label="SUPABASE_SERVICE_ROLE_KEY" />
            <StatusRow ok={status?.databaseUrl} label="DATABASE_URL (สำหรับสร้างตารางอัตโนมัติ)" />
            <StatusRow ok={status?.connected} label="เชื่อมต่อ Supabase" />
            <StatusRow ok={status?.tablesReady} label="ตารางฐานข้อมูลครบ" />
            {status?.missingTables?.length ? (
              <p className="text-[10px] text-wait">ขาด: {status.missingTables.join(", ")}</p>
            ) : null}
          </section>

          <section className="mb-4 rounded-petflow border border-honey/50 bg-honey/10 p-4">
            <h2 className="mb-2 text-sm font-extrabold text-petflow-chocolate">
              ขั้นที่ 1 — ใส่ใน Vercel (Settings → Environment)
            </h2>
            <ol className="space-y-2 text-xs text-brown-soft">
              <li>
                1. สร้างโปรเจกต์ที่{" "}
                <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="font-bold text-latte-deep">
                  supabase.com
                </a>
              </li>
              <li>2. Settings → API → copy <b>Project URL</b> → ใส่ <code>NEXT_PUBLIC_SUPABASE_URL</code></li>
              <li>3. copy <b>service_role</b> key → ใส่ <code>SUPABASE_SERVICE_ROLE_KEY</code></li>
              <li>4. Settings → Database → Connection string (URI) → ใส่ <code>DATABASE_URL</code></li>
              <li>5. Redeploy บน Vercel แล้วกลับมาหน้านี้</li>
            </ol>
          </section>

          <section className="mb-4 space-y-2 rounded-petflow bg-card p-4 shadow-petflow-sm">
            <h2 className="text-sm font-extrabold text-petflow-chocolate">ขั้นที่ 2 — สร้างตาราง</h2>
            <p className="text-xs text-brown-soft">เลือกวิธีใดวิธีหนึ่ง:</p>

            <button
              type="button"
              disabled={booting || !status?.databaseUrl}
              onClick={bootstrap}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-petflow-chocolate px-4 text-sm font-extrabold text-card disabled:opacity-40"
            >
              <Icon name="rocket" size={18} />
              {booting ? "กำลังสร้าง…" : "สร้างตารางอัตโนมัติ (ต้องมี DATABASE_URL)"}
            </button>

            <button
              type="button"
              onClick={copySchema}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-paper px-4 text-xs font-bold text-brown"
            >
              <Icon name="copy" size={16} />
              คัดลอก SQL ไปวางใน Supabase SQL Editor
            </button>
          </section>
        </>
      )}

      <button
        type="button"
        onClick={load}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-card text-xs font-bold text-brown shadow-petflow-sm"
      >
        <Icon name="search" size={16} />
        ตรวจสอบอีกครั้ง
      </button>
    </div>
  );
}

function StatusRow({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <div className="flex min-h-[32px] items-center gap-2 text-xs">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          ok ? "bg-sage/30 text-ok" : "bg-paper text-brown-faint"
        }`}
      >
        <Icon name={ok ? "check" : "clock"} size={14} strokeWidth={2.2} />
      </span>
      <span className={`min-w-0 break-all ${ok ? "font-semibold text-ok" : "text-brown-soft"}`}>{label}</span>
    </div>
  );
}
