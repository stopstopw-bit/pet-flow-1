"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/Logo";

export default function AdminLoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // เปิดมาจากลิงก์ร้าน /s/<slug>/admin/login → ล็อกอินได้แค่บัญชีของร้านนั้น
  const [shop, setShop] = useState("");
  useEffect(() => {
    const m = window.location.pathname.match(/^\/s\/([a-z0-9-]+)\//i);
    if (m) setShop(m[1].toLowerCase());
  }, []);
  const home = shop ? `/s/${shop}/admin` : "/admin";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    // ตรวจที่เซิร์ฟเวอร์เสมอ แล้วรับคุกกี้ที่เซ็นชื่อกลับมา
    // (เมื่อก่อนเทียบรหัสในเบราว์เซอร์ = รหัสจริงติดไปกับไฟล์ JS ให้ใครก็เปิดดูได้)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, shop }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        // เก็บไว้แค่ให้หน้าจอรู้ว่าจะโชว์เมนูไหน — สิทธิ์จริงอยู่ที่คุกกี้ฝั่งเซิร์ฟเวอร์
        sessionStorage.setItem("petflow-role", data.role);
        sessionStorage.setItem("petflow-staff-name", data.name || "พนักงาน");
        const next = params.get("next");
        if (data.role === "staff") {
          sessionStorage.setItem("petflow-menus", JSON.stringify(data.menus || []));
          router.push(next || (data.menus || [])[0] || home);
        } else {
          sessionStorage.removeItem("petflow-menus");
          router.push(next || home);
        }
      } else {
        setErr(data.error || "username หรือ password ไม่ถูกต้อง");
      }
    } catch {
      setErr("เชื่อมต่อไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-petflow-gradient px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-petflow border border-petflow-line bg-card p-8 shadow-petflow"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={64} />
          <h1 className="mt-4 text-lg font-extrabold text-petflow-chocolate">
            PetFlow Admin
          </h1>
          <p className="mt-1 text-xs text-brown-soft">เข้าสู่ระบบเจ้าของ / พนักงาน</p>
          {shop && (
            <p className="mt-2 rounded-full bg-paper px-3 py-1 text-xs font-bold text-petflow-chocolate">
              ร้าน: {shop}
            </p>
          )}
        </div>

        <label className="mb-2 block text-xs font-bold text-brown-soft">Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-3 w-full rounded-petflow-sm border border-petflow-line bg-paper px-4 py-3 text-sm outline-none focus:border-latte-deep"
          placeholder="username"
          autoCapitalize="none"
          autoComplete="username"
        />
        <label className="mb-2 block text-xs font-bold text-brown-soft">Password</label>
        <div className="relative mb-4">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-petflow-sm border border-petflow-line bg-paper px-4 py-3 pr-11 text-sm outline-none focus:border-latte-deep"
            placeholder="••••••••"
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-brown-faint"
          >
            {showPassword ? "🙈" : "👁️"}
          </button>
        </div>

        {err && <p className="mb-3 text-xs font-semibold text-red-600">{err}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-petflow-sm bg-gradient-to-r from-latte-deep to-petflow-chocolate py-3 text-sm font-extrabold text-white disabled:opacity-60"
        >
          {busy ? "กำลังตรวจสอบ…" : "เข้าใช้งาน 🐾"}
        </button>
        <p className="mt-4 text-center text-[10px] text-brown-faint">
          username/password ของเจ้าของร้านได้จาก /platform — ของพนักงานเจ้าของร้านตั้งให้ (ตั้งค่า → ขั้นสูง → พนักงาน)
        </p>
      </form>
    </div>
  );
}
