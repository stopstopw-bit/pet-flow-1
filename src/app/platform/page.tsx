"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MigrateOldDb from "./MigrateOldDb";

type Tenant = {
  id: string;
  slug: string;
  name: string;
  status: "trial" | "active" | "suspended" | "cancelled";
  template: string | null;
  trialEndsAt: string | null;
  createdAt: string;
  ownerUsername: string | null;
};

const STATUS_LABEL: Record<Tenant["status"], string> = {
  trial: "ทดลองใช้",
  active: "ใช้งานอยู่",
  suspended: "ระงับใช้งาน",
  cancelled: "ยกเลิกแล้ว",
};

const STATUS_COLOR: Record<Tenant["status"], string> = {
  trial: "bg-honey/30 text-latte-deep",
  active: "bg-sage/25 text-ok",
  suspended: "bg-wait/20 text-wait",
  cancelled: "bg-white/10 text-white/50",
};

export default function PlatformDashboard() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState("");
  const [ownerLogin, setOwnerLogin] = useState<{
    tenantName: string;
    slug: string;
    username: string;
    password: string;
  } | null>(null);
  const [copiedLinkFor, setCopiedLinkFor] = useState("");

  /** ลิงก์ล็อกอินหลังบ้านของร้านนี้ — ต้องมี /s/<slug> นำหน้าเสมอ ไม่งั้นระบบไม่รู้ว่าเป็นร้านไหน */
  const loginLinkFor = (slugValue: string) =>
    typeof window !== "undefined"
      ? `${window.location.origin}/s/${slugValue}/admin/login`
      : `/s/${slugValue}/admin/login`;

  const copyLink = (slugValue: string) => {
    navigator.clipboard.writeText(loginLinkFor(slugValue));
    setCopiedLinkFor(slugValue);
    setTimeout(() => setCopiedLinkFor(""), 1500);
  };

  /** session ผู้ดูแลระบบหมดอายุ (อยู่ได้ 1 วัน) ระหว่างเปิดหน้าค้างไว้ — พากลับไปล็อกอินใหม่ แทนที่จะโชว์ "unauthorized" เฉยๆ */
  const expired = useCallback(
    (res: Response | null) => {
      if (res?.status !== 401) return false;
      router.replace("/platform/login?expired=1");
      return true;
    },
    [router]
  );

  const load = useCallback(async () => {
    const res = await fetch("/api/platform/tenants").catch(() => null);
    if (expired(res)) return;
    if (res?.ok) {
      const d = await res.json();
      setTenants(d.tenants || []);
      setLoadErr("");
    } else {
      // อย่าโชว์ "ยังไม่มีร้าน" ตอนโหลดพลาด — ทำให้เข้าใจผิดว่าข้อมูลหาย
      const d = await res?.json().catch(() => null);
      setLoadErr(d?.error || (res ? `HTTP ${res.status}` : "เชื่อมต่อไม่ได้"));
    }
    setLoading(false);
  }, [expired]);

  useEffect(() => {
    load();
  }, [load]);

  const createTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setMsg("");
    try {
      const res = await fetch("/api/platform/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });
      if (expired(res)) return;
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg("");
        setOwnerLogin({
          tenantName: d.tenant.name,
          slug: d.tenant.slug,
          username: d.tenant.ownerUsername,
          password: d.ownerPassword,
        });
        setName("");
        setSlug("");
        load();
      } else {
        setMsg(`❌ ${d.error || "สร้างไม่สำเร็จ"}`);
      }
    } finally {
      setCreating(false);
    }
  };

  const setStatus = async (id: string, status: Tenant["status"]) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/platform/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_status", status }),
      });
      if (expired(res)) return;
      load();
    } finally {
      setBusyId("");
    }
  };

  const resetOwnerLogin = async (t: Tenant) => {
    if (
      !confirm(
        `ตั้ง/รีเซ็ต username+password ของ "${t.name}" ใหม่? password เก่า (ถ้ามี) จะใช้ไม่ได้อีก`
      )
    )
      return;
    setBusyId(t.id);
    try {
      const res = await fetch(`/api/platform/tenants/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_owner_login" }),
      });
      if (expired(res)) return;
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setOwnerLogin({
          tenantName: t.name,
          slug: t.slug,
          username: d.ownerUsername,
          password: d.ownerPassword,
        });
        load();
      } else {
        setMsg(`❌ ${d.error || "ตั้งไม่สำเร็จ"}`);
      }
    } finally {
      setBusyId("");
    }
  };

  const impersonate = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/platform/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "impersonate" }),
      });
      if (expired(res)) return;
      const d = await res.json().catch(() => ({}));
      if (res.ok) router.push(d.redirect || "/admin");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div>
      <h1 className="mb-1 text-lg font-extrabold">📊 ร้านทั้งหมด</h1>
      <p className="mb-5 text-xs text-white/50">
        จัดการทุกร้านบนแพลตฟอร์มจากที่เดียว — สร้างร้านใหม่, ระงับ/เปิดใช้งาน, เข้าดูแทน
      </p>

      <MigrateOldDb />

      <form
        onSubmit={createTenant}
        className="mb-6 rounded-petflow border border-white/10 bg-[#232637] p-4"
      >
        <p className="mb-3 text-sm font-extrabold">➕ สร้างร้านใหม่</p>
        <div className="mb-2 grid gap-2 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ชื่อร้าน"
            className="rounded-petflow-sm border border-white/10 bg-[#1a1d29] px-3 py-2 text-sm text-white outline-none focus:border-latte-deep"
          />
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="slug (เว้นว่าง = สร้างจากชื่อ) — ใช้เป็น username เจ้าของด้วย"
            className="rounded-petflow-sm border border-white/10 bg-[#1a1d29] px-3 py-2 text-sm text-white outline-none focus:border-latte-deep"
          />
        </div>
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="w-full rounded-petflow-sm bg-latte-deep py-2.5 text-xs font-extrabold text-white disabled:opacity-40 sm:w-auto sm:px-6"
        >
          {creating ? "กำลังสร้าง…" : "สร้างร้าน"}
        </button>
        {msg && <p className="mt-2 text-xs font-bold text-white/70">{msg}</p>}
      </form>

      {ownerLogin && (
        <div className="mb-6 rounded-petflow border-2 border-honey/50 bg-honey/10 p-4">
          <p className="mb-1 text-sm font-extrabold text-honey">
            ✅ &quot;{ownerLogin.tenantName}&quot; — username/password ของเจ้าของร้าน
          </p>
          <p className="mb-2 text-xs text-white/60">
            ก็อปไปให้เจ้าของร้านนี้เลย <b className="text-white">password เห็นได้ครั้งนี้ครั้งเดียว</b>{" "}
            (ระบบเก็บแค่แฮชไว้ ดึงกลับมาดูอีกไม่ได้)
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-white/50">ลิงก์</span>
              <code className="flex-1 truncate rounded-petflow-sm bg-[#1a1d29] px-3 py-2 text-xs font-extrabold text-honey">
                {loginLinkFor(ownerLogin.slug)}
              </code>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-white/50">Username</span>
              <code className="flex-1 rounded-petflow-sm bg-[#1a1d29] px-3 py-2 text-sm font-extrabold text-honey">
                {ownerLogin.username}
              </code>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-white/50">Password</span>
              <code className="flex-1 rounded-petflow-sm bg-[#1a1d29] px-3 py-2 text-lg font-extrabold tracking-widest text-honey">
                {ownerLogin.password}
              </code>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                navigator.clipboard.writeText(
                  `ลิงก์: ${loginLinkFor(ownerLogin.slug)}\nusername: ${ownerLogin.username}\npassword: ${ownerLogin.password}`
                )
              }
              className="rounded-petflow-sm bg-honey/25 px-3 py-2 text-xs font-bold text-latte-deep"
            >
              📋 ก็อปทั้งหมด
            </button>
            <button
              type="button"
              onClick={() => setOwnerLogin(null)}
              className="rounded-petflow-sm bg-white/10 px-3 py-2 text-xs font-bold text-white/60"
            >
              ปิด
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-sm text-white/40">กำลังโหลด…</p>
      ) : loadErr ? (
        <p className="rounded-petflow border border-white/10 bg-[#232637] p-6 text-center text-sm text-white/70">
          ❌ โหลดรายชื่อร้านไม่ได้: {loadErr}
        </p>
      ) : tenants.length === 0 ? (
        <p className="rounded-petflow border border-white/10 bg-[#232637] p-6 text-center text-sm text-white/40">
          ยังไม่มีร้านบนแพลตฟอร์ม
        </p>
      ) : (
        <div className="space-y-2">
          {tenants.map((t) => (
            <div
              key={t.id}
              className="rounded-petflow-sm border border-white/10 bg-[#232637] p-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-extrabold">
                    {t.name}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_COLOR[t.status]}`}
                    >
                      {STATUS_LABEL[t.status]}
                    </span>
                  </p>
                  <p className="text-[10px] text-white/40">
                    /{t.slug} · {t.ownerUsername ? `username: ${t.ownerUsername}` : "ยังไม่ได้ตั้ง login"} · สร้างเมื่อ{" "}
                    {t.createdAt.slice(0, 10)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => copyLink(t.slug)}
                    className="rounded-full bg-latte/20 px-3 py-1.5 text-[11px] font-extrabold text-latte-deep"
                  >
                    {copiedLinkFor === t.slug ? "✅ ก็อปแล้ว" : "🔗 ก็อปลิงก์"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === t.id}
                    onClick={() => resetOwnerLogin(t)}
                    className="rounded-full bg-honey/20 px-3 py-1.5 text-[11px] font-extrabold text-latte-deep disabled:opacity-40"
                  >
                    🔐 {t.ownerUsername ? "รีเซ็ต" : "ตั้ง"} login
                  </button>
                  <button
                    type="button"
                    disabled={busyId === t.id}
                    onClick={() => impersonate(t.id)}
                    className="rounded-full bg-latte-deep px-3 py-1.5 text-[11px] font-extrabold text-white disabled:opacity-40"
                  >
                    🔑 เข้าดูแทน
                  </button>
                  {t.status !== "suspended" ? (
                    <button
                      type="button"
                      disabled={busyId === t.id}
                      onClick={() => setStatus(t.id, "suspended")}
                      className="rounded-full bg-wait/20 px-3 py-1.5 text-[11px] font-bold text-wait disabled:opacity-40"
                    >
                      ⏸️ ระงับ
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === t.id}
                      onClick={() => setStatus(t.id, "active")}
                      className="rounded-full bg-sage/20 px-3 py-1.5 text-[11px] font-bold text-ok disabled:opacity-40"
                    >
                      ▶️ เปิดใช้งาน
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
