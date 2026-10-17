/**
 * ไอคอนเส้น (stroke) ชุดเดียวกันทั้งแอป — แทนอีโมจิในเมนู/แถบนำทาง ให้ดูเป็นแอปมืออาชีพ
 * วาดบน viewBox 24x24 เส้นหนา 1.8 ปลายมน สีตาม currentColor
 */
const PATHS: Record<string, React.ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
      <path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17h2M11 17h2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2A6.5 6.5 0 0 1 21.5 20" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h10" />,
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <path d="M2.5 10h19M6.5 15h4" />
    </>
  ),
  wallet: (
    <>
      <path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5" />
      <circle cx="16.5" cy="13.5" r="1.3" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M14 6v12" strokeDasharray="2 2" />
    </>
  ),
  cake: (
    <>
      <path d="M4 21h16M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7" />
      <path d="M5 16c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 5 0M12 12V8" />
      <path d="M12 5.5c.8-.8.8-1.7 0-2.5-.8.8-.8 1.7 0 2.5z" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1 12.5a1 1 0 0 1-1 .5H7a1 1 0 0 1-1-.5z" />
      <path d="M9 10V6.5a3 3 0 0 1 6 0V10" />
    </>
  ),
  message: (
    <>
      <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
      <path d="M8 10h8M8 13h5" />
    </>
  ),
  doc: (
    <>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
      <path d="M14 3v5h5M8.5 13h7M8.5 17h5" />
    </>
  ),
  team: (
    <>
      <circle cx="12" cy="7.5" r="3" />
      <path d="M6.5 20a5.5 5.5 0 0 1 11 0" />
      <circle cx="4.5" cy="10" r="2" />
      <circle cx="19.5" cy="10" r="2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 2.5c3.5 2 5.5 5.5 5 10l-2.5 3h-5L7 12.5c-.5-4.5 1.5-8 5-10z" />
      <circle cx="12" cy="9" r="1.8" />
      <path d="M9.5 15.5 7 20l3-1.5M14.5 15.5 17 20l-3-1.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1.3" fill="currentColor" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
      <path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5" />
    </>
  ),
  send: (
    <>
      <path d="M21 3 10.5 13.5" />
      <path d="M21 3l-6.5 18-4-7.5L3 9.5z" />
    </>
  ),
  filter: <path d="M4 5h16l-6 7.5V19l-4 1.5v-8z" />,
  phone: (
    <path d="M5 3.5h3.5l1.5 4.5-2.2 1.4a11 11 0 0 0 6.8 6.8l1.4-2.2 4.5 1.5V19a1.5 1.5 0 0 1-1.6 1.5C10.6 20 4 13.4 3.5 5.1A1.5 1.5 0 0 1 5 3.5z" />
  ),
  download: (
    <>
      <path d="M12 3.5v12M7 11l5 5 5-5" />
      <path d="M4 20.5h16" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M21 16l-5-5-9 9" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 2.5 20h19z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </>
  ),
  money: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.5v.1M18 14.5v.1" />
    </>
  ),
  chevron: <path d="M9 5l7 7-7 7" />,
  back: <path d="M15 5l-7 7 7 7" />,
  logout: (
    <>
      <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2.2l2.1 10.6a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.1" />
      <circle cx="9.5" cy="19.5" r="1.3" />
      <circle cx="17" cy="19.5" r="1.3" />
    </>
  ),
  box: (
    <>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
    </>
  ),
  qr: (
    <>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM18 14h2.5M14 18v2.5" />
    </>
  ),
  car: (
    <>
      <path d="M5 17H3.5v-4.5L5.5 7h13l2 5.5V17H19" />
      <path d="M3.5 12.5h17" />
      <circle cx="7.5" cy="17" r="1.8" />
      <circle cx="16.5" cy="17" r="1.8" />
      <path d="M9.3 17h5.4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  bed: (
    <>
      <path d="M3 18V6M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5" />
      <circle cx="7" cy="11" r="1.8" />
    </>
  ),
  bath: (
    <>
      <path d="M3 12h18v2a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z" />
      <path d="M6 12V5.5A2.5 2.5 0 0 1 8.5 3c1 0 1.8.6 2.2 1.4M7 19l-1 2M17 19l1 2" />
    </>
  ),
  paw: (
    <>
      <circle cx="7" cy="10" r="1.8" />
      <circle cx="10.5" cy="6" r="1.8" />
      <circle cx="14.5" cy="6" r="1.8" />
      <circle cx="18" cy="10" r="1.8" />
      <path d="M12.5 11c-2.5 0-5 3.5-5 6 0 1.5 1 2.5 2.5 2.5 1 0 1.5-.5 2.5-.5s1.5.5 2.5.5c1.5 0 2.5-1 2.5-2.5 0-2.5-2.5-6-5-6z" />
    </>
  ),
  star: (
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z" />
  ),
  gift: (
    <>
      <rect x="3.5" y="8" width="17" height="4" rx="1" />
      <path d="M5 12v8h14v-8M12 8v12" />
      <path d="M12 8c-1.5-3-5-3.5-5-1.5S10 8 12 8zM12 8c1.5-3 5-3.5 5-1.5S14 8 12 8z" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  inbox: (
    <>
      <path d="M3 13l2.5-8h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M3 13h5l1.5 2.5h5L16 13h5" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 22,
  className = "",
  strokeWidth = 1.8,
}: {
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {PATHS[name] ?? PATHS.grid}
    </svg>
  );
}

/** ไอคอนของแต่ละเมนูหลังบ้าน (ผูกกับ href ใน ADMIN_TABS) */
export const ADMIN_TAB_ICONS: Record<string, string> = {
  "/admin": "home",
  "/admin/schedule": "calendar",
  "/admin/bookings/new": "plus",
  "/admin/queue": "bath",
  "/admin/care": "check",
  "/admin/payroll": "money",
  "/admin/customers": "users",
  "/admin/billing": "card",
  "/admin/pos": "cart",
  "/admin/finance": "wallet",
  "/admin/tax": "receipt",
  "/admin/insights": "chart",
  "/admin/promos": "sparkle",
  "/admin/coupons": "ticket",
  "/admin/birthdays": "cake",
  "/admin/packages": "bag",
  "/admin/cards": "message",
  "/admin/articles": "doc",
  "/admin/staff": "team",
  "/admin/settings": "settings",
  "/admin/trash": "trash",
  "/admin/setup": "rocket",
};

/** ชื่อภาษาอังกฤษสั้นๆ ของเมนู — ใช้เป็นหัวเล็กเหนือชื่อไทย และในแถบเมนูล่าง */
export const ADMIN_TAB_EN: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/schedule": "Schedule",
  "/admin/bookings/new": "New booking",
  "/admin/queue": "Grooming queue",
  "/admin/care": "Daily care",
  "/admin/payroll": "Payroll",
  "/admin/customers": "Customers",
  "/admin/billing": "Billing",
  "/admin/pos": "POS",
  "/admin/finance": "Finance",
  "/admin/tax": "Tax & Documents",
  "/admin/insights": "Insights",
  "/admin/promos": "Promotions",
  "/admin/coupons": "Coupons",
  "/admin/birthdays": "Birthdays",
  "/admin/packages": "Packages",
  "/admin/cards": "LINE Cards",
  "/admin/articles": "Articles",
  "/admin/staff": "Staff",
  "/admin/settings": "Settings",
  "/admin/trash": "Trash",
  "/admin/setup": "Setup",
};

/** จัดกลุ่มเมนูในแผ่นเมนูทั้งหมด/แถบซ้าย */
export const ADMIN_TAB_GROUPS: { title: string; hrefs: string[] }[] = [
  {
    title: "Daily",
    hrefs: [
      "/admin",
      "/admin/schedule",
      "/admin/queue",
      "/admin/care",
      "/admin/bookings/new",
      "/admin/customers",
      "/admin/billing",
    ],
  },
  { title: "Finance", hrefs: ["/admin/finance", "/admin/payroll", "/admin/tax", "/admin/insights"] },
  {
    title: "Marketing",
    hrefs: ["/admin/promos", "/admin/coupons", "/admin/birthdays", "/admin/packages", "/admin/cards", "/admin/articles"],
  },
  { title: "System", hrefs: ["/admin/staff", "/admin/settings", "/admin/trash", "/admin/setup"] },
];
