"use client";

import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { flowProgress } from "@/lib/intake-flow";

/**
 * แถบ "ขั้นที่ x จาก n" + ปุ่มไปขั้นต่อไป — โชว์เฉพาะหน้าที่เปิดมาจากการ์ดรวมขอข้อมูล (ปุ่มเดียวไล่ทีละหน้า)
 * mode=progress: ป้ายเล็กบนหัวหน้า · mode=next: ปุ่มใหญ่ท้ายหน้า (ขั้นสุดท้าย = บอกว่าครบแล้ว)
 */
export function IntakeFlowBar({ mode }: { mode: "progress" | "next" }) {
  const params = useSearchParams();
  const p = flowProgress(params);
  if (!p) return null;

  if (mode === "progress") {
    return (
      <div className="mb-3 flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {Array.from({ length: p.total }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i < p.index ? "bg-latte-deep" : "bg-petflow-line"}`}
            />
          ))}
        </div>
        <span className="shrink-0 text-[11px] font-bold text-brown-soft">
          ขั้นที่ {p.index} จาก {p.total}
        </span>
      </div>
    );
  }

  if (!p.next) {
    return (
      <p className="mt-4 flex items-center justify-center gap-1.5 rounded-petflow-sm bg-sage/20 px-3 py-3 text-xs font-bold text-ok">
        <Icon name="check" size={16} strokeWidth={2.4} />
        ขั้นสุดท้ายแล้ว ส่งครบแล้วกลับไปที่แชท LINE ได้เลยค่ะ
      </p>
    );
  }
  return (
    <a
      href={p.next.href}
      className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-petflow-sm bg-latte-deep px-4 py-3 text-sm font-extrabold text-white shadow-petflow-sm"
    >
      ถัดไป: {p.next.label}
      <Icon name="chevron" size={16} />
    </a>
  );
}
