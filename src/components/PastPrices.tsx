"use client";

import { Icon } from "@/components/Icon";
import type { PastPrice } from "@/lib/special-price";

/**
 * ราคาที่ลูกค้าคนนี้เคยจ่าย แยกตามบริการ — ราคาล่าสุด + วันที่ + ราคาเคยเปลี่ยนไหม
 * ใช้ในหน้าลูกค้า และตอนจองคิว (พนักงานจะได้บอกราคาเดิมได้ถูก แม้ไม่ใช่คนที่ตกลงไว้)
 * ตอนออกบิล หน้าคิดเงินจะถามให้ใช้ราคาเดิมเองอยู่แล้ว (ดู findLastPrice)
 */
export function PastPricesList({
  prices,
  limit,
}: {
  prices: PastPrice[];
  /** โชว์กี่รายการ (ไม่ใส่ = ทั้งหมด) */
  limit?: number;
}) {
  if (prices.length === 0) return null;
  const shown = limit ? prices.slice(0, limit) : prices;
  return (
    <ul className="divide-y divide-petflow-line rounded-petflow-sm border border-petflow-line text-xs">
      {shown.map((p) => (
        <li key={p.signature} className="flex min-h-[44px] items-center gap-2 px-3 py-1.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold text-brown">{p.label}</span>
            <span className="block text-[11px] text-brown-faint">
              ล่าสุด {p.when ? p.when.slice(0, 10) : "-"} · {p.times} ครั้ง
              {p.previousAmount !== undefined
                ? ` · ก่อนหน้านี้ ฿${p.previousAmount.toLocaleString()}`
                : ""}
            </span>
          </span>
          <span className="shrink-0 font-extrabold text-latte-deep">
            ฿{p.unitAmount.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** หัวข้อเล็กๆ สำหรับวางในฟอร์ม (เช่นหน้าจองคิว) */
export function PastPricesHint({ prices }: { prices: PastPrice[] }) {
  if (prices.length === 0) return null;
  return (
    <div className="rounded-petflow-sm border border-honey-deep/40 bg-honey/10 p-2.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-brown">
        <Icon name="money" size={14} />
        ราคาที่ลูกค้าคนนี้เคยจ่าย
      </p>
      <PastPricesList prices={prices} limit={5} />
    </div>
  );
}
