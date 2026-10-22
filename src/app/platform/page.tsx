"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MigrateOldDb from "./MigrateOldDb";
import ShopQuestions from "./ShopQuestions";
import Subscriptions from "./Subscriptions";

type Tenant = {
  id: string;
  slug: string;
  name: string;
  status: "trial" | "active" | "suspended" | "cancelled";
  template: string | null;
  trialEndsAt: string | null;
  /** วันครบกำหนดจ่ายค่าบริการ — ถึงวันนี้ยังไม่จ่าย ร้านปิดเองอัตโนมัติ */
  dueDate: string | null;
  /** โดเมนของร้านเอง (เช่น catcha.com) — ว่าง = ใช้ลิงก์ /s/<slug> อย่างเดียว */
  customDomain: string | null;
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
  /** แบบร้าน — ต้องเลือกก่อนสร้าง ระบบทั้งร้าน (คำ/สายพันธุ์/ห้อง/ราคาอาบน้ำ) ตั้งตามแบบนี้ */
  const [petKind, setPetKind] = useState<"" | "cat" | "dog" | "both">("");
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
  const [linksOpenFor, setLinksOpenFor] = useState("");
  /** ค่า LINE ของแต่ละร้าน (LIFF ID + มี Token ไหม) — ไว้เช็คว่า LINE อยู่ถูกร้าน */
  const [lineInfo, setLineInfo] = useState<Record<string, { liffId: string; hasToken: boolean }>>({});

  const linkFor = (slugValue: string, path: string) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/s/${slugValue}${path}`;
  /** ลิงก์ล็อกอินหลังบ้านของร้านนี้ — ต้องมี /s/<slug> นำหน้าเสมอ ไม่งั้นระบบไม่รู้ว่าเป็นร้านไหน */
  const loginLinkFor = (slugValue: string) => linkFor(slugValue, "/admin/login");
  /** ลิงก์หน้าลูกค้าของร้านนี้ (จองคิว/ดูประวัติ) — เอาไปใส่ LINE OA / Facebook ของร้าน */
  const customerLinkFor = (slugValue: string) => linkFor(slugValue, "/app");

  /** คัดลอกให้ได้ทั้งในเบราว์เซอร์ปกติและในเบราว์เซอร์ของ LINE (ที่มักไม่ให้ใช้ navigator.clipboard) */
  const copyLink = async (text: string, key: string) => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
    }
    if (!ok) {
      window.prompt("คัดลอกไม่ได้อัตโนมัติ — กดค้างที่ลิงก์นี้แล้วคัดลอกเอง", text);
      return;
    }
    setCopiedLinkFor(key);
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
      const lr = await fetch("/api/platform/line").catch(() => null);
      if (lr?.ok) {
        const ld = (await lr.json()) as { shops?: { id: string; liffId: string; hasToken: boolean }[] };
        setLineInfo(Object.fromEntries((ld.shops || []).map((x) => [x.id, x])));
      }
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

  /** ย้ายค่า LINE ของร้านนี้ไปร้าน PetFlow / ลบทิ้ง — ร้านแรกเคยถือ LINE PetFlow ไว้ก่อนสลับลิงก์เป็น Back Home */
  const lineAction = async (t: Tenant, mode: "move" | "clear") => {
    const petflow = tenants.find((x) => x.slug === "petflow");
    if (mode === "move" && !petflow) return;
    const ask =
      mode === "move"
        ? `ย้ายค่า LINE ของ "${t.name}" ไปร้าน PetFlow?\nหลังย้าย ${t.name} จะไม่มีค่า LINE (ต้องตั้ง LINE ของตัวเองใหม่)`
        : `ลบค่า LINE ของ "${t.name}"?`;
    if (!window.confirm(ask)) return;
    setBusyId(t.id);
    const res = await fetch("/api/platform/line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "move" ? { fromId: t.id, toId: petflow!.id } : { clearId: t.id }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setMsg(d?.message || (res?.ok ? "เรียบร้อย" : "ทำไม่สำเร็จ"));
    setBusyId("");
    await load();
  };

  const createTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !petKind) return;
    setCreating(true);
    setMsg("");
    try {
      const res = await fetch("/api/platform/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, petKind }),
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
        setPetKind("");
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

  /** วันนี้ตามเวลาไทย — เทียบกับวันครบกำหนดจ่าย */
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

  const billing = async (t: Tenant, body: Record<string, unknown>) => {
    setBusyId(t.id);
    try {
      const res = await fetch(`/api/platform/tenants/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (expired(res)) return;
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || "บันทึกไม่สำเร็จ");
      }
      load();
    } finally {
      setBusyId("");
    }
  };

  const rename = async (t: Tenant) => {
    const name = prompt("ชื่อร้านใหม่", t.name)?.trim();
    if (!name || name === t.name) return;
    setBusyId(t.id);
    try {
      const res = await fetch(`/api/platform/tenants/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", name }),
      });
      if (expired(res)) return;
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || "แก้ชื่อไม่สำเร็จ");
      }
      load();
    } finally {
      setBusyId("");
    }
  };

  /** ผูก/เลิกผูกโดเมนของร้านเอง — ต้องเพิ่มโดเมนเดียวกันใน Vercel ด้วย (ดู CUSTOM_DOMAIN.md) */
  const setDomain = async (t: Tenant) => {
    const input = prompt(
      "โดเมนของร้าน (เช่น catcha.com)\nต้องเพิ่มโดเมนนี้ใน Vercel → Settings → Domains ด้วย\nเว้นว่าง = เลิกใช้โดเมน (ลิงก์ /s/ เดิมใช้ได้ตลอด)",
      t.customDomain || ""
    );
    if (input === null) return;
    const domain = input.trim();
    if (domain === (t.customDomain || "")) return;
    setBusyId(t.id);
    try {
      const res = await fetch(`/api/platform/tenants/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_domain", domain }),
      });
      if (expired(res)) return;
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || "บันทึกโดเมนไม่สำเร็จ");
      }
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

      <MigrateOldDb explainMissing={!loading && !loadErr && tenants.length === 0} />

      <Subscriptions tenants={tenants} onChanged={load} />
      <ShopQuestions tenants={tenants} />

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
        <p className="mb-1.5 mt-3 text-xs font-bold text-white/70">แบบร้าน (เลือก 1 อย่าง)</p>
        <div className="mb-1 grid grid-cols-3 gap-2">
          {(
            [
              ["cat", "🐱 ร้านแมว"],
              ["dog", "🐶 ร้านหมา"],
              ["both", "🐾 ร้านหมาและแมว"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={petKind === k}
              onClick={() => setPetKind(k)}
              className={`min-h-[44px] rounded-petflow-sm border px-2 text-xs font-extrabold transition ${
                petKind === k
                  ? "border-latte-deep bg-latte-deep text-white"
                  : "border-white/10 bg-[#1a1d29] text-white/70"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mb-3 text-[11px] text-white/50">
          ระบบของร้านจะตั้งตามแบบนี้: คำในหน้าลูกค้า สายพันธุ์ ห้องพัก ไซส์และราคาอาบน้ำ ของแถม (แก้ต่อเองได้ในหน้าตั้งค่า)
        </p>
        <button
          type="submit"
          disabled={creating || !name.trim() || !petKind}
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
                  {t.customDomain && (
                    <p className="text-[10px] font-bold text-honey">🌐 {t.customDomain}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                    <label className="flex items-center gap-1 text-white/60">
                      📅 ครบกำหนดจ่าย
                      <input
                        type="date"
                        value={t.dueDate || ""}
                        disabled={busyId === t.id}
                        onChange={(e) => billing(t, { action: "set_due_date", dueDate: e.target.value })}
                        className="rounded border border-white/15 bg-black/30 px-1.5 py-0.5 text-white [color-scheme:dark]"
                      />
                    </label>
                    {t.dueDate && today >= t.dueDate && (
                      <span className="rounded-full bg-red-500/25 px-2 py-0.5 font-bold text-red-200">
                        ⛔ ค้างจ่าย ระงับอัตโนมัติ
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={busyId === t.id}
                      onClick={() => {
                        if (confirm(`รับเงิน "${t.name}" แล้ว ต่ออายุอีก 1 เดือน?`)) billing(t, { action: "paid_month" });
                      }}
                      className="rounded-full bg-sage/20 px-2.5 py-0.5 font-bold text-ok disabled:opacity-40"
                    >
                      💰 รับเงินแล้ว +1 เดือน
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLinksOpenFor(linksOpenFor === t.id ? "" : t.id)}
                    className="rounded-full bg-latte/20 px-3 py-1.5 text-[11px] font-extrabold text-latte-deep"
                  >
                    🔗 ลิงก์ร้าน
                  </button>
                  <button
                    type="button"
                    disabled={busyId === t.id}
                    onClick={() => rename(t)}
                    className="rounded-full bg-latte/20 px-3 py-1.5 text-[11px] font-extrabold text-latte-deep disabled:opacity-40"
                  >
                    ✏️ แก้ชื่อ
                  </button>
                  <button
                    type="button"
                    disabled={busyId === t.id}
                    onClick={() => setDomain(t)}
                    className="rounded-full bg-latte/20 px-3 py-1.5 text-[11px] font-extrabold text-latte-deep disabled:opacity-40"
                  >
                    🌐 โดเมนร้าน
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
                  {t.status === "trial" && (
                    <button
                      type="button"
                      disabled={busyId === t.id}
                      onClick={() => {
                        if (confirm(`เปลี่ยน "${t.name}" จากทดลองใช้เป็นลูกค้าจริง?`)) setStatus(t.id, "active");
                      }}
                      className="rounded-full bg-sage/20 px-3 py-1.5 text-[11px] font-bold text-ok disabled:opacity-40"
                    >
                      ✅ ใช้งานจริง
                    </button>
                  )}
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
              {linksOpenFor === t.id && (
                <div className="mt-3 space-y-2 rounded-petflow-sm bg-black/25 p-2.5">
                  {[
                    { key: `${t.id}:customer`, label: "🛍️ หน้าลูกค้า (จองคิว) — ใส่ใน LINE OA / Facebook ร้าน", url: customerLinkFor(t.slug) },
                    { key: `${t.id}:admin`, label: "🔐 หน้าล็อกอินหลังบ้าน (เจ้าของร้าน/พนักงาน)", url: loginLinkFor(t.slug) },
                    ...(t.customDomain
                      ? [
                          { key: `${t.id}:dcustomer`, label: "🌐 หน้าลูกค้า ผ่านโดเมนร้าน (ใช้ได้หลังตั้งใน Vercel แล้ว)", url: `https://${t.customDomain}/app` },
                          { key: `${t.id}:dadmin`, label: "🌐 หน้าล็อกอินหลังบ้าน ผ่านโดเมนร้าน", url: `https://${t.customDomain}/admin/login` },
                        ]
                      : []),
                  ].map((l) => (
                    <div key={l.key}>
                      <p className="mb-1 text-[11px] font-bold text-white/70">{l.label}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <input
                          readOnly
                          value={l.url}
                          onFocus={(e) => e.currentTarget.select()}
                          className="min-w-0 flex-1 rounded border border-white/15 bg-black/30 px-2 py-1 text-[11px] text-white"
                        />
                        <button
                          type="button"
                          onClick={() => copyLink(l.url, l.key)}
                          className="rounded-full bg-latte/20 px-3 py-1 text-[11px] font-extrabold text-latte-deep"
                        >
                          {copiedLinkFor === l.key ? "✅ ก็อปแล้ว" : "📋 ก็อป"}
                        </button>
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-extrabold text-white"
                        >
                          ↗️ เปิด
                        </a>
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-white/10 pt-2">
                    <p className="mb-1 text-[11px] font-bold text-white/70">💬 LINE ของร้านนี้</p>
                    {lineInfo[t.id]?.liffId || lineInfo[t.id]?.hasToken ? (
                      <>
                        <p className="text-[11px] text-white">
                          LIFF: {lineInfo[t.id]?.liffId || "—"} · Token: {lineInfo[t.id]?.hasToken ? "มี" : "ไม่มี"}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {t.slug !== "petflow" && tenants.some((x) => x.slug === "petflow") && (
                            <button
                              type="button"
                              disabled={busyId === t.id}
                              onClick={() => lineAction(t, "move")}
                              className="rounded-full bg-latte/20 px-3 py-1 text-[11px] font-extrabold text-latte-deep disabled:opacity-50"
                            >
                              ➡️ ย้าย LINE นี้ไปร้าน PetFlow
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busyId === t.id}
                            onClick={() => lineAction(t, "clear")}
                            className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-extrabold text-white disabled:opacity-50"
                          >
                            🗑️ ลบ LINE ร้านนี้
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-[11px] text-white/60">ยังไม่ได้ตั้ง</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
