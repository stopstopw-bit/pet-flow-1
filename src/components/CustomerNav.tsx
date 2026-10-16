"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "./LocaleProvider";
import { t } from "@/lib/i18n";
import { Icon } from "./Icon";

const tabs = [
  { href: "/app", key: "home" as const, icon: "home", match: (p: string) => p === "/app" },
  {
    href: "/app/services",
    key: "services" as const,
    icon: "sparkle",
    match: (p: string) =>
      p.startsWith("/app/services") || p.startsWith("/app/rooms") || p.startsWith("/app/grooming"),
  },
  { href: "/app/bookings", key: "bookings" as const, icon: "calendar", match: (p: string) => p.startsWith("/app/bookings") },
  { href: "/app/promos", key: "promos" as const, icon: "gift", match: (p: string) => p.startsWith("/app/promos") },
  { href: "/app/points", key: "points" as const, icon: "star", match: (p: string) => p.startsWith("/app/points") },
];

export function CustomerNav() {
  const pathname = usePathname();
  const { locale } = useLocale();
  const m = t(locale).nav;

  return (
    <nav data-bottom-nav className="fixed inset-x-0 bottom-0 z-50 border-t border-petflow-line bg-card/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md">
      <div className="mx-auto flex max-w-lg justify-between px-2">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 py-1 text-[10px] font-bold transition ${
                active ? "text-petflow-chocolate" : "text-brown-faint"
              }`}
            >
              <Icon name={tab.icon} size={23} strokeWidth={active ? 2.2 : 1.8} />
              <span className="truncate leading-tight">{m[tab.key]}</span>
              <span className={`h-1 w-1 rounded-full ${active ? "bg-honey-deep" : "bg-transparent"}`} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
