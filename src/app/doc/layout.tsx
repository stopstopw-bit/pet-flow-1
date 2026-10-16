import type { Metadata } from "next";

// ลิงก์เอกสารส่วนตัวของลูกค้า — ห้าม search engine เก็บ
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function DocLayout({ children }: { children: React.ReactNode }) {
  return children;
}
