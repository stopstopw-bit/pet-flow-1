"use client";

import { Icon } from "@/components/Icon";
import type { BookingTransport } from "@/lib/transport";

/**
 * ติ๊กบริการรับ-ส่งของนัด — ใช้ทั้งหน้าลงนัดและหน้าแก้นัด
 * จุดรับ-ส่งปกติลูกค้าส่งเองผ่านการ์ดยืนยันนัด แต่ถ้าร้านมีลิงก์อยู่แล้วก็ใส่แทนได้
 */
export function TransportPicker({
  value,
  onChange,
}: {
  value: BookingTransport;
  onChange: (v: BookingTransport) => void;
}) {
  const on = !!value.pickup || !!value.dropoff;
  const chip = (active: boolean) =>
    `flex min-h-[40px] items-center gap-1 rounded-full px-3.5 text-xs font-bold ${
      active ? "bg-petflow-chocolate text-card" : "bg-card text-brown-soft ring-1 ring-petflow-line"
    }`;
  return (
    <div className="rounded-petflow-sm border border-petflow-line bg-paper/60 p-3">
      <p className="flex items-center gap-1.5 text-xs font-extrabold text-petflow-chocolate">
        <Icon name="car" size={15} />
        บริการรับ-ส่ง
      </p>
      <p className="mb-2 text-[10px] text-brown-soft">
        ติ๊กแล้วการ์ดยืนยันนัดจะมีปุ่มให้ลูกค้าส่งจุดรับ-ส่งเอง ไม่ต้องกรอกช่องด้านล่างก็ได้
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={!!value.pickup}
          onClick={() => onChange({ ...value, pickup: !value.pickup })}
          className={chip(!!value.pickup)}
        >
          {value.pickup && <Icon name="check" size={14} strokeWidth={2.4} />}
          รับน้อง
        </button>
        <button
          type="button"
          aria-pressed={!!value.dropoff}
          onClick={() => onChange({ ...value, dropoff: !value.dropoff })}
          className={chip(!!value.dropoff)}
        >
          {value.dropoff && <Icon name="check" size={14} strokeWidth={2.4} />}
          ส่งน้องกลับบ้าน
        </button>
      </div>
      {on && (
        <div className="mt-2.5 space-y-2">
          <input
            value={value.mapUrl || ""}
            onChange={(e) => onChange({ ...value, mapUrl: e.target.value })}
            placeholder="ลิงก์ Google Maps (ถ้ามี)"
            inputMode="url"
            className="min-h-[44px] w-full rounded-petflow-sm border border-petflow-line bg-card px-3 text-sm text-brown"
          />
          <input
            value={value.address || ""}
            onChange={(e) => onChange({ ...value, address: e.target.value })}
            placeholder="ที่อยู่ / จุดสังเกต (ถ้ามี)"
            className="min-h-[44px] w-full rounded-petflow-sm border border-petflow-line bg-card px-3 text-sm text-brown"
          />
          {value.mapUrl && /^https?:\/\//.test(value.mapUrl) && (
            <a
              href={value.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-bold text-latte-deep"
            >
              <Icon name="pin" size={13} />
              เปิดแผนที่
            </a>
          )}
        </div>
      )}
    </div>
  );
}
