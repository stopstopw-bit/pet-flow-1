"use client";

import { useEffect, useState } from "react";
import { useLiff } from "@/components/LiffProvider";

type CustomerPackage = {
  id: string;
  name: string;
  totalUses: number;
  usedUses: number;
  status: "active" | "done" | "cancelled";
  /** คืน = คอร์สวันพัก (ไม่ระบุ = ครั้ง) */
  unit?: "use" | "night";
  /** "ห้อง Mid Cozy" — คอร์สวันพักที่ผูกห้อง */
  roomLabel?: string;
  /** แบ่งจ่ายยังไม่ครบ — ยังใช้ไม่ได้ */
  locked?: boolean;
  outstanding?: number;
};

/**
 * คอร์ส/แพ็กเกจที่ลูกค้าซื้อไว้ — ลูกค้าจ่ายเงินล่วงหน้าแล้ว ต้องเปิดดูเองได้ว่าเหลือกี่ครั้ง
 * ไม่มีคอร์ส = ซ่อนทั้งช่อง (ไม่ต้องรกหน้าแรก)
 */
export function MyPackagesSection({
  onChecked,
}: {
  /** บอกหน้าแม่ว่าเช็คเสร็จแล้วและมีคอร์สไหม — ใช้ตัดสินใจว่าจะโชว์ช่องแต้มไหม */
  onChecked?: (hasPackages: boolean) => void;
}) {
  const { profile } = useLiff();
  const [packages, setPackages] = useState<CustomerPackage[]>([]);

  useEffect(() => {
    if (!profile?.lineUserId) return;
    let alive = true;
    fetch(`/api/packages?lineUserId=${encodeURIComponent(profile.lineUserId)}&active=1`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const list = d.packages || [];
        setPackages(list);
        onChecked?.(list.length > 0);
      })
      .catch(() => {
        if (alive) onChecked?.(false);
      });
    return () => {
      alive = false;
    };
    // onChecked ตั้งใจไม่ใส่ใน deps — หน้าแม่ส่ง setState มาตรงๆ ใส่แล้วจะวนไม่จบ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.lineUserId]);

  if (packages.length === 0) return null;

  return (
    <section className="mb-4 rounded-petflow border-2 border-latte/50 bg-gradient-to-br from-latte/20 via-card to-honey/10 p-4 shadow-petflow">
      <p className="mb-2 text-sm font-extrabold text-petflow-chocolate">
        🎫 คอร์สของฉัน
      </p>
      <div className="space-y-2">
        {packages.map((p) => {
          const left = Math.max(0, p.totalUses - p.usedUses);
          const unit = p.unit === "night" ? "คืน" : "ครั้ง";
          const usedPct = p.totalUses > 0 ? (p.usedUses / p.totalUses) * 100 : 0;
          return (
            <div key={p.id} className="rounded-petflow-sm bg-card/80 px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 truncate text-xs font-bold text-brown">{p.name}</p>
                <p className="shrink-0 text-xs font-extrabold text-latte-deep">
                  เหลือ {left}/{p.totalUses} {unit}
                </p>
              </div>
              {(p.roomLabel || p.locked) && (
                <p className="mt-0.5 text-[11px] text-brown-soft">
                  {p.roomLabel && `ใช้กับ${p.roomLabel}`}
                  {p.roomLabel && p.locked && " · "}
                  {p.locked && (
                    <span className="font-bold text-wait">
                      🔒 ใช้ได้เมื่อจ่ายครบ (ค้าง {Math.round(p.outstanding || 0).toLocaleString()} บาท)
                    </span>
                  )}
                </p>
              )}
              {/* แถบแสดงว่าใช้ไปเท่าไหร่แล้ว — เห็นภาพเร็วกว่าตัวเลขอย่างเดียว */}
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper">
                <div
                  className="h-full rounded-full bg-latte-deep transition-all"
                  style={{ width: `${usedPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-brown-faint">
        ใช้ได้เลยตอนมาใช้บริการ — แจ้งร้านได้ว่าจะหักจากคอร์สนะคะ 🧡
      </p>
    </section>
  );
}
