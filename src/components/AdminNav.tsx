"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ADMIN_TAB_EN, ADMIN_TAB_GROUPS, ADMIN_TAB_ICONS, Icon } from "@/components/Icon";

export const ADMIN_TABS = [
  { href: "/admin", label: "แดชบอร์ด", icon: "📊" },
  { href: "/admin/schedule", label: "ตารางนัด", icon: "🗓️" },
  { href: "/admin/bookings/new", label: "จองใหม่", icon: "➕" },
  { href: "/admin/queue", label: "คิวอาบน้ำ", icon: "🛁" },
  { href: "/admin/care", label: "เช็คลิสต์ดูแล", icon: "✅" },
  { href: "/admin/customers", label: "ลูกค้า", icon: "👤" },
  { href: "/admin/billing", label: "คิดเงิน", icon: "💳" },
  { href: "/admin/finance", label: "รายรับ-รายจ่าย", icon: "📒" },
  { href: "/admin/tax", label: "เอกสารรายได้ / ภาษี", icon: "📑" },
  { href: "/admin/payroll", label: "เงินเดือน & ค่าคอม", icon: "💰" },
  { href: "/admin/insights", label: "สรุปข้อมูล", icon: "📊" },
  { href: "/admin/promos", label: "โปร", icon: "✨" },
  { href: "/admin/coupons", label: "คูปอง", icon: "🎟️" },
  { href: "/admin/birthdays", label: "วันเกิดลูกค้า", icon: "🎂" },
  { href: "/admin/packages", label: "ขายคอร์สในแอป", icon: "🛍️" },
  { href: "/admin/cards", label: "ปรับแต่งการ์ด LINE", icon: "🎴" },
  { href: "/admin/articles", label: "บทความหน้าเว็บ", icon: "📝" },
  { href: "/admin/staff", label: "พนักงาน", icon: "👥" },
  { href: "/admin/settings", label: "ตั้งค่า", icon: "⚙️" },
  { href: "/admin/trash", label: "ถังขยะ", icon: "🗑️" },
  { href: "/admin/setup", label: "ติดตั้ง", icon: "🚀" },
] as const;

const TABS = ADMIN_TABS;

function isTabActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** เมนูที่ผู้ใช้ปัจจุบันเห็นได้ — null = เจ้าของ (เห็นทุกเมนู) */
export function getAllowedMenus(): string[] | null {
  if (typeof window === "undefined") return null;
  if (sessionStorage.getItem("petflow-role") !== "staff") return null;
  try {
    const menus = JSON.parse(sessionStorage.getItem("petflow-menus") || "[]");
    if (!Array.isArray(menus)) return [];
    // สิทธิ์ "สินค้าหน้าร้าน" เดิม = ขายหน้าร้าน (POS) และขายหน้าร้านย้ายไปเป็นแท็บในหน้าคิดเงินแล้ว
    // พนักงานที่เคยได้สิทธิ์ทั้งสองแบบยังเข้าได้
    const out = [...menus];
    if (out.includes("/admin/products") && !out.includes("/admin/pos")) out.push("/admin/pos");
    if (out.includes("/admin/pos") && !out.includes("/admin/billing")) out.push("/admin/billing");
    return out;
  } catch {
    return [];
  }
}

/** พนักงานเปิดหน้าที่ไม่มีสิทธิ์ได้ไหม — ใช้ทั้ง nav และ guard ใน layout */
export function isPathAllowed(pathname: string, allowed: string[] | null) {
  if (!allowed) return true;
  return allowed.some((href) => isTabActive(pathname, href));
}

/** ชื่ออังกฤษของเมนูที่เปิดอยู่ — ใช้เป็นหัวเล็กในแถบหัว */
export function getActiveAdminTabEn(pathname: string) {
  const tab = TABS.find((t) => isTabActive(pathname, t.href));
  return tab ? ADMIN_TAB_EN[tab.href] || "" : "";
}

export function getActiveAdminTabLabel(pathname: string) {
  return TABS.find((t) => isTabActive(pathname, t.href))?.label || "เมนู";
}

function NavLink({
  href,
  label,
  icon,
  active,
  onNavigate,
  className = "",
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-petflow-sm font-bold transition ${
        active
          ? "bg-petflow-chocolate text-card"
          : "text-brown hover:bg-paper hover:text-petflow-chocolate"
      } ${className}`}
    >
      <Icon name={ADMIN_TAB_ICONS[href] || icon} size={20} />
      <span>{label}</span>
    </Link>
  );
}

export function AdminMenuButton({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls="admin-menu"
      aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-petflow-sm border border-petflow-line bg-paper"
    >
      <span className="relative block h-4 w-5">
        <span
          className={`absolute left-0 top-0 block h-0.5 w-5 rounded-full bg-petflow-chocolate transition ${
            open ? "top-[7px] rotate-45" : ""
          }`}
        />
        <span
          className={`absolute left-0 top-[7px] block h-0.5 w-5 rounded-full bg-petflow-chocolate transition ${
            open ? "opacity-0" : ""
          }`}
        />
        <span
          className={`absolute bottom-0 left-0 block h-0.5 w-5 rounded-full bg-petflow-chocolate transition ${
            open ? "bottom-[7px] -rotate-45" : ""
          }`}
        />
      </span>
    </button>
  );
}

export function AdminNav({
  menuOpen,
  setMenuOpen,
}: {
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
}) {
  const pathname = usePathname();
  // เมนูของพนักงานถูกกรองตามสิทธิ์ที่เจ้าของตั้งไว้ (เมนูเปิดหลัง mount เสมอ อ่าน sessionStorage ได้เลย)
  const allowed = getAllowedMenus();
  const visibleTabs = TABS.filter((t) => !allowed || allowed.includes(t.href));

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname, setMenuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [menuOpen, setMenuOpen]);

  const closeMenu = () => setMenuOpen(false);

  if (!menuOpen) return null;

  return (
    <>
      <button
        type="button"
        aria-label="ปิดเมนู"
        className="fixed inset-0 z-40 bg-petflow-chocolate/30 backdrop-blur-[2px] lg:hidden"
        onClick={closeMenu}
      />
      <nav
        id="admin-menu"
        className="fixed inset-x-0 bottom-0 z-[44] max-h-[88vh] overflow-y-auto rounded-t-[28px] bg-cream px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-3 shadow-petflow lg:hidden"
        aria-label="เมนูหลังบ้าน"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-brown-faint/50" />
        <div className="mx-auto max-w-lg space-y-4">
          {groupTabs(visibleTabs).map((g) => (
            <section key={g.title}>
              <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">
                {g.title}
              </p>
              <ul className="grid grid-cols-4 gap-2 rounded-petflow bg-card p-3 shadow-petflow-sm">
                {g.tabs.map((tab) => {
                  const active = isTabActive(pathname, tab.href);
                  return (
                    <li key={tab.href}>
                      <Link
                        href={tab.href}
                        onClick={closeMenu}
                        className="flex flex-col items-center gap-1.5 rounded-petflow-sm py-1.5 text-center"
                      >
                        <span
                          className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                            active
                              ? "bg-petflow-chocolate text-card"
                              : "bg-honey/25 text-petflow-chocolate"
                          }`}
                        >
                          <Icon name={ADMIN_TAB_ICONS[tab.href]} size={22} />
                        </span>
                        <span className="text-[11px] font-bold leading-tight text-brown">
                          {tab.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </nav>
    </>
  );
}

type Tab = (typeof TABS)[number];

/** แบ่งเมนูที่มองเห็นเป็นกลุ่ม — เมนูที่ไม่อยู่ในกลุ่มไหนไปรวมท้ายสุด */
function groupTabs(tabs: readonly Tab[]) {
  const used = new Set<string>();
  const groups = ADMIN_TAB_GROUPS.map((g) => {
    const list = tabs.filter((t) => g.hrefs.includes(t.href));
    list.forEach((t) => used.add(t.href));
    return { title: g.title, tabs: list };
  });
  const rest = tabs.filter((t) => !used.has(t.href));
  if (rest.length) groups.push({ title: "More", tabs: rest });
  return groups.filter((g) => g.tabs.length > 0);
}

/** แถบเมนูซ้ายบนจอใหญ่ — แสดงทุกเมนูที่ผู้ใช้มีสิทธิ์ แบ่งเป็นกลุ่ม */
export function AdminSidebar() {
  const pathname = usePathname();
  const allowed = getAllowedMenus();
  const visibleTabs = TABS.filter((t) => !allowed || allowed.includes(t.href));
  const navRef = useRef<HTMLElement | null>(null);
  // เมนูยาวกว่าจอเตี้ยๆ → เลื่อนให้เห็นเมนูหน้าที่เปิดอยู่เสมอ
  // (top-[76px] = ใต้แถบหัวหลังบ้านที่ติดอยู่ด้านบน ไม่ให้เมนูมุดใต้หัว)
  useEffect(() => {
    // เลื่อนเฉพาะในกล่องเมนู ไม่ใช้ scrollIntoView เพราะจะพาทั้งหน้าเลื่อนตามไปด้วย
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) return;
    const navBox = nav.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    if (box.top < navBox.top || box.bottom > navBox.bottom) {
      nav.scrollTop += box.top - navBox.top - nav.clientHeight / 2 + box.height / 2;
    }
  }, [pathname]);
  return (
    <nav
      ref={navRef}
      aria-label="เมนูหลังบ้าน"
      className="sticky top-[76px] hidden max-h-[calc(100dvh-92px)] overflow-y-auto overscroll-contain rounded-petflow bg-card p-2.5 shadow-petflow lg:block"
    >
      {groupTabs(visibleTabs).map((g) => (
        <div key={g.title} className="mb-2 last:mb-0">
          <p className="mb-1 px-3 pt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-brown-faint">
            {g.title}
          </p>
          <ul className="space-y-0.5">
            {g.tabs.map((tab) => (
              <li key={tab.href}>
                <NavLink
                  {...tab}
                  active={isTabActive(pathname, tab.href)}
                  className="w-full px-3 py-1.5 text-sm"
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** แถบเมนูล่างบนมือถือ — หน้าหลัก · ตารางนัด · [+ จองใหม่] · คิดเงิน · เมนู (ลูกค้าอยู่ในเมนู) */
const BOTTOM_LEFT = ["/admin", "/admin/schedule"];
const BOTTOM_RIGHT = ["/admin/billing"];
const BOTTOM_LABEL: Record<string, string> = {
  "/admin": "Home",
  "/admin/schedule": "Schedule",
  "/admin/billing": "คิดเงิน",
};
/** ปุ่มคิดเงินเปิดตรงไปที่ลิสต์บิลรอชำระ ไม่ใช่ฟอร์มออกบิลด้านบน */
const BOTTOM_LINK: Record<string, string> = {
  "/admin/billing": "/admin/billing?view=pending",
};

export function AdminBottomBar({
  menuOpen,
  onMenu,
}: {
  menuOpen: boolean;
  onMenu: () => void;
}) {
  const pathname = usePathname();
  const allowed = getAllowedMenus();
  const can = (href: string) => !allowed || allowed.includes(href);
  const shown = [...BOTTOM_LEFT, "/admin/bookings/new", ...BOTTOM_RIGHT];
  const anyActive = shown.some((h) => can(h) && isTabActive(pathname, h));

  const item = (href: string) =>
    can(href) ? (
      <Link
        key={href}
        href={BOTTOM_LINK[href] || href}
        onClick={() => {
          // อยู่หน้าคิดเงินอยู่แล้ว กดซ้ำ = เด้งกลับไปที่บิลรอชำระ
          if (href === "/admin/billing" && pathname === href) {
            window.dispatchEvent(new Event("petflow:show-pending-bills"));
          }
        }}
        className={`flex min-w-0 flex-1 flex-col items-center gap-1 py-1 text-[10px] font-bold tracking-wide transition ${
          !menuOpen && isTabActive(pathname, href) ? "text-petflow-chocolate" : "text-brown-faint"
        }`}
      >
        <Icon name={ADMIN_TAB_ICONS[href]} size={23} strokeWidth={!menuOpen && isTabActive(pathname, href) ? 2.2 : 1.8} />
        <span className="truncate leading-tight">{BOTTOM_LABEL[href]}</span>
      </Link>
    ) : null;

  return (
    <nav
      aria-label="เมนูลัด"
      data-bottom-nav
      className="fixed inset-x-0 bottom-0 z-[45] border-t border-petflow-line bg-card/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md print:hidden lg:hidden"
    >
      <div className="mx-auto flex max-w-lg items-end justify-between px-2">
        {BOTTOM_LEFT.map(item)}
        {can("/admin/bookings/new") ? (
          <Link
            href="/admin/bookings/new"
            aria-label="จองใหม่"
            className="flex min-w-0 flex-1 flex-col items-center gap-1 text-[10px] font-bold tracking-wide text-petflow-chocolate"
          >
            <span className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-honey to-honey-deep text-petflow-chocolate shadow-petflow ring-4 ring-card">
              <Icon name="plus" size={26} strokeWidth={2.4} />
            </span>
            <span className="leading-tight">Book</span>
          </Link>
        ) : null}
        {BOTTOM_RIGHT.map(item)}
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="admin-menu"
          onClick={onMenu}
          className={`flex min-w-0 flex-1 flex-col items-center gap-1 py-1 text-[10px] font-bold tracking-wide transition ${
            menuOpen || !anyActive ? "text-petflow-chocolate" : "text-brown-faint"
          }`}
        >
          <Icon name="grid" size={23} strokeWidth={menuOpen || !anyActive ? 2.2 : 1.8} />
          <span className="truncate leading-tight">Menu</span>
        </button>
      </div>
    </nav>
  );
}
