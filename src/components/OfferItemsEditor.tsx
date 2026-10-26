"use client";

import { Icon } from "@/components/Icon";
import type { RoomOption } from "@/components/RoomTypePicker";
import type { GroomProgram } from "@/lib/grooming-prices";
import { NumInput } from "@/components/NumInput";

/** รายการในคอร์สชุดรวม — ตรงกับ OfferItem ฝั่งเซิร์ฟเวอร์ (ฟอร์มเก็บตัวเลขเป็นข้อความ) */
export type OfferItemDraft = {
  unit: "night" | "use";
  paid: string;
  free: string;
  roomType: string;
  groomProgram: string;
};

export function emptyItem(unit: "night" | "use", rooms: RoomOption[], programs: GroomProgram[]): OfferItemDraft {
  return {
    unit,
    paid: "",
    free: "",
    roomType: unit === "night" ? rooms[0]?.id || "" : "",
    groomProgram: unit === "use" ? programs[0]?.id || "" : "",
  };
}

export function itemsFromOffer(
  items: { unit: "night" | "use"; paid: number; free?: number; roomType?: string; groomProgram?: string }[] | undefined
): OfferItemDraft[] {
  return (items || []).map((it) => ({
    unit: it.unit,
    paid: String(it.paid || ""),
    free: it.free ? String(it.free) : "",
    roomType: it.roomType || "",
    groomProgram: it.groomProgram || "",
  }));
}

/** แปลงฟอร์มเป็นรายการที่ส่งให้ API — ตัดแถวที่ไม่ได้ใส่จำนวน */
export function itemsToPayload(drafts: OfferItemDraft[]) {
  return drafts
    .map((d) => ({
      unit: d.unit,
      paid: Math.max(0, Math.round(Number(d.paid) || 0)),
      free: Math.max(0, Math.round(Number(d.free) || 0)),
      roomType: d.unit === "night" ? d.roomType || undefined : undefined,
      groomProgram: d.unit === "use" ? d.groomProgram || undefined : undefined,
    }))
    .filter((it) => it.paid + it.free > 0);
}

/**
 * ตั้งรายการในคอร์สชุดรวม เช่น พัก Mid Cozy 5 คืน + อาบน้ำ Catcha Premium 6 ครั้ง (แถม 2)
 * ตอนร้านยืนยันออร์เดอร์ แต่ละแถวกลายเป็นคอร์สของลูกค้า 1 ใบ แล้วตัดตอนออกบิลตามปกติ
 */
export function OfferItemsEditor({
  items,
  onChange,
  rooms,
  programs,
}: {
  items: OfferItemDraft[];
  onChange: (items: OfferItemDraft[]) => void;
  rooms: RoomOption[];
  programs: GroomProgram[];
}) {
  const set = (i: number, patch: Partial<OfferItemDraft>) =>
    onChange(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const field =
    "min-h-[38px] min-w-0 rounded-petflow-sm border border-petflow-line bg-card px-2 text-sm";
  const fullPrice = items.reduce((sum, it) => {
    if (it.unit !== "night") return sum;
    const room = rooms.find((r) => r.id === it.roomType);
    return sum + (room ? room.price * (Number(it.paid) || 0) : 0);
  }, 0);

  return (
    <div className="space-y-2">
      <span className="block text-xs font-bold text-brown-soft">รายการในคอร์ส</span>
      {items.map((it, i) => (
        <div key={i} className="space-y-2 rounded-petflow-sm bg-paper p-2.5">
          <div className="flex items-center gap-2">
            <Icon name={it.unit === "night" ? "bed" : "bath"} size={16} />
            {it.unit === "night" ? (
              <select
                value={it.roomType}
                onChange={(e) => set(i, { roomType: e.target.value })}
                className={`${field} flex-1`}
              >
                <option value="">ทุกห้อง</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    ห้อง {r.name} ({r.price.toLocaleString()}฿/คืน)
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={it.groomProgram}
                onChange={(e) => set(i, { groomProgram: e.target.value })}
                className={`${field} flex-1`}
              >
                <option value="">อาบน้ำทุกโปรแกรม (1 ครั้งคลุมทั้งบิล)</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name.includes("อาบน้ำ") ? p.name : `อาบน้ำ ${p.name}`}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => onChange(items.filter((_, k) => k !== i))}
              aria-label="ลบรายการ"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-wait"
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-brown-soft">
            <NumInput
              type="number"
              min={0}
              inputMode="numeric"
              value={it.paid}
              onChange={(e) => set(i, { paid: e.target.value })}
              placeholder={it.unit === "night" ? "กี่คืน" : "กี่ครั้ง"}
              className={`${field} w-20 text-right`}
            />
            {it.unit === "night" ? "คืน" : "ครั้ง"} · แถมฟรี
            <NumInput
              type="number"
              min={0}
              inputMode="numeric"
              value={it.free}
              onChange={(e) => set(i, { free: e.target.value })}
              placeholder="0"
              className={`${field} w-16 text-right`}
            />
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange([...items, emptyItem("night", rooms, programs)])}
          className="flex min-h-[38px] flex-1 items-center justify-center gap-1 rounded-full border border-dashed border-petflow-line text-xs font-bold text-brown"
        >
          <Icon name="plus" size={14} />
          วันพัก
        </button>
        <button
          type="button"
          onClick={() => onChange([...items, emptyItem("use", rooms, programs)])}
          className="flex min-h-[38px] flex-1 items-center justify-center gap-1 rounded-full border border-dashed border-petflow-line text-xs font-bold text-brown"
        >
          <Icon name="plus" size={14} />
          อาบน้ำ
        </button>
      </div>
      {fullPrice > 0 && (
        <p className="text-[11px] text-brown-faint">
          ค่าห้องราคาเต็ม (เฉพาะคืนที่จ่าย) {fullPrice.toLocaleString()}฿ — ใช้เทียบตอนตั้งราคาชุด
        </p>
      )}
    </div>
  );
}
