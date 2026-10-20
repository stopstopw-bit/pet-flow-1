import { Icon } from "@/components/Icon";

/**
 * แถบหัวโค้งมนสีน้ำผึ้ง + ลายกระดาษสีเล็กๆ ลอยอยู่ (สไตล์ภาพประกอบ)
 * ใช้เป็นหัวหน้าของหลังบ้านและแอปลูกค้า — การ์ดสรุปด้านล่างจะเกยขึ้นมาทับขอบล่างได้
 */
export function HeaderBand({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-b-[32px] bg-gradient-to-br from-honey via-honey to-honey-deep ${className}`}
    >
      <BandDecor />
      <div className="relative">{children}</div>
    </div>
  );
}

/** รูปทรงตกแต่ง — วงกลม สามเหลี่ยม ครึ่งวงกลม และเส้นหยัก โทนสีเดิมของร้าน */
export function BandDecor() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 400 200"
    >
      <circle cx="350" cy="30" r="46" fill="#fffdfa" opacity="0.18" />
      <circle cx="30" cy="190" r="38" fill="#fffdfa" opacity="0.14" />
      <circle cx="250" cy="190" r="5" fill="rgb(var(--chocolate-rgb))" opacity="0.22" />
      <circle cx="190" cy="14" r="4" fill="#fffdfa" opacity="0.7" />
      <circle cx="210" cy="176" r="3" fill="#fffdfa" opacity="0.7" />
      <path d="M232 26 l12 -16 l6 20 z" fill="rgb(var(--latte-deep-rgb))" opacity="0.35" />
      <path d="M330 120 a10 10 0 0 1 20 0 z" fill="#fffdfa" opacity="0.35" />
      <path d="M384 168 l8 8 m0 -8 l-8 8" stroke="rgb(var(--chocolate-rgb))" strokeOpacity="0.25" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M300 186 q10 -12 20 0 t20 0 t20 0"
        fill="none"
        stroke="#fffdfa"
        strokeOpacity="0.5"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** ปุ่มไอคอนแบบหมวดหมู่ (ไอคอนเส้นในกรอบมน + ชื่อใต้) — icon = ชื่อใน Icon.tsx */
export function IconChip({
  icon,
  label,
  badge,
  tone = "honey",
}: {
  icon: string;
  label: string;
  badge?: number | string;
  tone?: "honey" | "latte" | "sage" | "paper";
}) {
  const bg = {
    honey: "bg-honey/35",
    latte: "bg-latte/30",
    sage: "bg-sage/30",
    paper: "bg-paper",
  }[tone];
  return (
    <span className="flex flex-col items-center gap-1.5 text-center">
      <span
        className={`relative flex h-14 w-14 items-center justify-center rounded-2xl ${bg} text-petflow-chocolate`}
      >
        <Icon name={icon} size={24} />
        {badge ? (
          <span className="absolute -right-1 -top-1 min-w-[20px] rounded-full bg-petflow-chocolate px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-card">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="text-[11px] font-bold leading-tight text-brown">{label}</span>
    </span>
  );
}

/** แถวรายการ: ไอคอนกลมซ้าย · ชื่อ/คำอธิบาย · ค่าขวา */
export function ListRowContent({
  icon,
  title,
  sub,
  value,
  valueClass = "text-petflow-chocolate",
}: {
  icon: string;
  title: string;
  sub?: string;
  value?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <span className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
        <Icon name={icon} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-extrabold text-petflow-chocolate">{title}</span>
        {sub ? <span className="block truncate text-[11px] text-brown-soft">{sub}</span> : null}
      </span>
      {value !== undefined ? (
        <span className={`shrink-0 text-sm font-extrabold ${valueClass}`}>{value}</span>
      ) : null}
    </span>
  );
}
