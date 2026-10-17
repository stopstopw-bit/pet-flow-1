"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { LocaleProvider } from "@/components/LocaleProvider";
import { ConfigProvider, useConfig } from "@/components/ConfigProvider";
import { BrandingStyle } from "@/components/BrandingStyle";
import { Logo } from "@/components/Logo";
import { HeaderBand } from "@/components/HeaderBand";
import {
  AdminBottomBar,
  AdminNav,
  AdminSidebar,
  getAllowedMenus,
  isPathAllowed,
} from "@/components/AdminNav";
import { Toaster } from "@/components/Toast";
import { Icon } from "@/components/Icon";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function LogoutButton({ onClick, subtle }: { onClick: () => void; subtle?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="ออกจากระบบ"
      className={`flex h-10 w-10 items-center justify-center rounded-full text-petflow-chocolate ${
        subtle ? "bg-paper" : "bg-card/70 shadow-petflow-sm backdrop-blur"
      }`}
    >
      <Icon name="logout" size={19} />
    </button>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ok, setOk] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  // ชื่อร้านมาจาก config ของแต่ละร้าน (multi-tenant) — ไม่ hardcode
  const { config } = useConfig();
  const shopName = config.business?.name || "PetFlow";

  useEffect(() => {
    if (pathname === "/admin/login") {
      setOk(true);
      return;
    }
    // สิทธิ์จริงถูกตรวจที่ middleware แล้ว (คุกกี้เซ็นชื่อ) — ตรงนี้แค่ยืนยันกับเซิร์ฟเวอร์
    // ว่ายังล็อกอินอยู่ไหม แล้วซิงก์บทบาท/เมนูให้ตรงกับของจริง
    let alive = true;
    (async () => {
      const res = await fetch("/api/auth/login").catch(() => null);
      if (!alive) return;
      if (!res || !res.ok) {
        sessionStorage.removeItem("petflow-role");
        sessionStorage.removeItem("petflow-menus");
        router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      const me = await res.json().catch(() => null);
      if (!alive || !me?.ok) return;
      sessionStorage.setItem("petflow-role", me.role);
      sessionStorage.setItem("petflow-staff-name", me.name || "พนักงาน");
      setImpersonating(Boolean(me.impersonating));
      if (me.role === "staff") {
        sessionStorage.setItem("petflow-menus", JSON.stringify(me.menus || []));
      } else {
        sessionStorage.removeItem("petflow-menus");
      }
      // พนักงาน — เข้าได้เฉพาะเมนูที่เจ้าของอนุญาต ถ้าหลุดมาหน้าอื่นเด้งกลับเมนูแรกที่มีสิทธิ์
      const allowed = getAllowedMenus();
      if (!isPathAllowed(pathname, allowed)) {
        router.replace(allowed && allowed[0] ? allowed[0] : "/admin/login");
        return;
      }
      setOk(true);
      // อัปเดตฐานข้อมูลอัตโนมัติครั้งเดียวต่อ session (idempotent, ไม่บล็อก UI)
      if (!sessionStorage.getItem("petflow-migrated")) {
        sessionStorage.setItem("petflow-migrated", "1");
        fetch("/api/admin/migrate", { method: "POST" }).catch(() => {});
      }
    })();
    return () => {
      alive = false;
    };
  }, [pathname, router]);

  if (!ok) return null;

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const logout = async () => {
    // ต้องล้างคุกกี้ที่เซิร์ฟเวอร์ด้วย ไม่ใช่แค่ล้างใน sessionStorage
    await fetch("/api/auth/login", { method: "DELETE" }).catch(() => {});
    sessionStorage.clear();
    router.push("/admin/login");
  };

  // แดชบอร์ด: แถบหัวสูง ให้การ์ดสรุปเกยขึ้นไป · หน้าอื่นมีหัวข้อของตัวเองอยู่แล้ว ใช้แถบหัวแบบเตี้ย
  const isDashboard = pathname === "/admin";
  // หน้าปฏิทิน/บอร์ดคิว/เช็คลิสต์ — ใช้จอกว้างเต็มที่ เห็นทั้งเดือนในหน้าเดียว
  const isWide = ["/admin/schedule", "/admin/queue", "/admin/care"].includes(pathname);
  const maxW = isWide ? "max-w-[1600px]" : "max-w-3xl lg:max-w-6xl";

  return (
    <div className="min-h-screen bg-petflow-gradient pb-[calc(7.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <Toaster />
      {impersonating && (
        <div className="relative z-[60] flex items-center justify-between gap-2 bg-[#1a1d29] px-4 py-2 text-xs font-bold text-white print:hidden">
          <span>🛡️ กำลังเข้าดูแทนร้านนี้ในฐานะผู้ดูแลระบบ</span>
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/auth/login", { method: "DELETE" }).catch(() => {});
              sessionStorage.clear();
              router.push("/platform");
            }}
            className="shrink-0 rounded-full bg-white/15 px-3 py-1 hover:bg-white/25"
          >
            ออกจากโหมดเข้าดูแทน
          </button>
        </div>
      )}
      {isDashboard ? (
        <header className="print:hidden">
          <HeaderBand className="pb-12 lg:pb-14">
            <div className={`mx-auto flex ${maxW} items-center gap-3 px-4 pb-1 pt-5 lg:px-6 lg:pt-6`}>
              <Logo size={46} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-petflow-chocolate/60">
                  {greeting()}
                </p>
                <p className="truncate text-xl font-extrabold text-petflow-chocolate lg:text-2xl">
                  {shopName}
                </p>
                <p className="truncate text-[11px] font-bold text-petflow-chocolate/70">
                  {new Date().toLocaleDateString("th-TH", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              <LogoutButton onClick={logout} />
            </div>
          </HeaderBand>
        </header>
      ) : (
        <header className="sticky top-0 z-30 border-b border-petflow-line/70 bg-cream/85 backdrop-blur-md print:hidden">
          <div className={`mx-auto flex ${maxW} items-center gap-3 px-4 py-2.5 lg:px-6`}>
            <Logo size={34} />
            <div className="min-w-0 flex-1 leading-tight">
              {/* ชื่อหน้าอยู่ที่หัวของแต่ละหน้าแล้ว แถบนี้จึงแสดงแค่ชื่อร้าน ไม่ให้หัวซ้ำสองชั้น */}
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-latte-deep">Back office</p>
              <p className="truncate text-sm font-extrabold text-petflow-chocolate">{shopName}</p>
            </div>
            <LogoutButton onClick={logout} subtle />
          </div>
        </header>
      )}
      <AdminNav menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      <div className={`mx-auto ${maxW} ${isDashboard ? "-mt-8" : "mt-4 lg:mt-6"} px-4 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6 lg:px-6`}>
        <aside className="print:hidden">
          <AdminSidebar />
        </aside>
        <main className="relative min-w-0 rounded-t-petflow pb-5 lg:pb-8">{children}</main>
      </div>
      <AdminBottomBar menuOpen={menuOpen} onMenu={() => setMenuOpen(!menuOpen)} />
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <ConfigProvider>
        <BrandingStyle />
        <AdminShell>{children}</AdminShell>
      </ConfigProvider>
    </LocaleProvider>
  );
}
