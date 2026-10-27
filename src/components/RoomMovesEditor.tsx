"use client";

/**
 * ย้ายห้องกลางทางในนัดเดียว — เช่น 25→28 Catflix แล้ว 28→31 Mid Cozy
 * ห้องแรกเลือกจากตัวเลือกห้องปกติ ส่วนนี้เพิ่ม "ตั้งแต่วันที่ … ย้ายไปห้อง …" ได้หลายครั้ง
 * ตัวเลขห้องว่างคิดเฉพาะช่วงของห้องนั้น (วันย้าย → วันย้ายครั้งถัดไป/วันออก)
 */
import { useMemo } from "react";
import { Icon } from "@/components/Icon";
import {
  compositionOf,
  freeUnitsForRange,
  typeAvailability,
  type BoardBooking,
  type BoardRoomType,
} from "@/lib/room-board";
import { shortRange, type RoomSegment } from "@/lib/room-segments";

type RoomOption = { id: string; name: string; price: number; count?: number };

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function RoomMovesEditor({
  rooms,
  boardRooms,
  existing,
  checkin,
  checkout,
  firstRoom,
  firstUnit,
  moves,
  onChange,
}: {
  rooms: RoomOption[];
  boardRooms: BoardRoomType[];
  /** นัดอื่นๆ ของร้าน (ไม่รวมนัดนี้เอง) ไว้คิดห้องว่าง */
  existing: BoardBooking[];
  checkin: string;
  checkout: string;
  firstRoom: string;
  firstUnit?: number | null;
  moves: RoomSegment[];
  onChange: (next: RoomSegment[]) => void;
}) {
  const nameOf = (id?: string) => rooms.find((r) => r.id === id)?.name || id || "-";
  const canMove = !!checkin && !!checkout && addDays(checkin, 1) < checkout;
  const ranges = moves.map((m, i) => [m.from, moves[i + 1]?.from || checkout] as const);

  // ห้องว่างของแต่ละช่วง — คิดทีละช่วง
  const avail = useMemo(
    () =>
      ranges.map(([from, to]) => {
        const out: Record<string, number> = {};
        if (!from || !to || from >= to) return out;
        for (const r of rooms) {
          if (!r.count && !compositionOf(r.id, boardRooms)) continue;
          out[r.id] = typeAvailability(boardRooms, existing, r.id, from, to).free;
        }
        return out;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(ranges), rooms, existing]
  );
  const units = useMemo(
    () =>
      moves.map((m, i) => {
        const [from, to] = ranges[i];
        if (!m.room || compositionOf(m.room, boardRooms) || !from || from >= to) return [];
        return freeUnitsForRange(boardRooms, existing, m.room, from, to);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(moves), checkout, rooms, existing]
  );

  const set = (i: number, patch: Partial<RoomSegment>) =>
    onChange(moves.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  const add = () => {
    const prev = moves[moves.length - 1];
    const from = addDays(prev ? prev.from : checkin, 1);
    if (from >= checkout) return;
    const prevRoom = prev?.room || firstRoom;
    const pick = rooms.find((r) => r.id !== prevRoom && (r.count || compositionOf(r.id, boardRooms))) || rooms[0];
    onChange([...moves, { from, room: pick?.id || "" }]);
  };

  if (!canMove && moves.length === 0) return null;

  return (
    <div className="rounded-petflow-sm border border-petflow-line bg-paper p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold text-brown-soft">
        <Icon name="bed" size={14} />
        ย้ายห้องระหว่างพัก (นัดเดียว บิลเดียว)
      </p>
      {moves.length > 0 && (
        <ol className="mt-2 space-y-2">
          <li className="rounded-petflow-sm bg-card px-3 py-2 text-[11px] font-bold text-petflow-chocolate ring-1 ring-petflow-line">
            1. {nameOf(firstRoom)}
            {firstUnit ? ` #${firstUnit}` : ""} · {shortRange(checkin, moves[0].from)}
          </li>
          {moves.map((m, i) => {
            const [from, to] = ranges[i];
            const bad = !from || from <= (i === 0 ? checkin : moves[i - 1].from) || from >= checkout;
            return (
              <li key={i} className="space-y-2 rounded-petflow-sm bg-honey/10 p-3 ring-1 ring-honey/60">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-petflow-chocolate">
                    {i + 2}. {!bad ? shortRange(from, to) : "เลือกวันย้าย"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange(moves.filter((_, j) => j !== i))}
                    className="min-h-[36px] px-2 text-[11px] font-bold text-brown-soft"
                  >
                    เอาออก
                  </button>
                </div>
                <label className="block text-[11px] font-bold text-brown-soft">
                  ย้ายวันที่
                  <input
                    type="date"
                    value={m.from}
                    min={addDays(i === 0 ? checkin : moves[i - 1].from, 1)}
                    max={addDays(checkout, -1)}
                    onChange={(e) => set(i, { from: e.target.value })}
                    className="mt-1 min-h-[44px] w-full rounded-petflow-sm border border-petflow-line bg-card px-3 py-2 text-sm text-brown"
                  />
                </label>
                <select
                  value={m.room}
                  onChange={(e) => set(i, { room: e.target.value, roomUnit: undefined })}
                  aria-label={`ห้องช่วงที่ ${i + 2}`}
                  className="min-h-[44px] w-full rounded-petflow-sm border border-petflow-line bg-card px-3 py-2 text-sm text-brown"
                >
                  {rooms.map((r) => {
                    const f = avail[i]?.[r.id];
                    const tracked = f !== undefined;
                    return (
                      <option key={r.id} value={r.id} disabled={tracked && f <= 0 && r.id !== m.room}>
                        {r.name} · {r.price} บาท/คืน{tracked ? (f > 0 ? ` · ว่าง ${f}` : " · เต็ม") : ""}
                      </option>
                    );
                  })}
                </select>
                {avail[i]?.[m.room] !== undefined && avail[i][m.room] <= 0 && (
                  <p className="text-[10px] font-bold text-red-600">ห้องนี้เต็มในช่วงนี้</p>
                )}
                {units[i]?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {units[i].map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => set(i, { roomUnit: m.roomUnit === u ? undefined : u })}
                        aria-pressed={m.roomUnit === u}
                        className={`min-h-[36px] rounded-full px-3 text-xs font-bold ${
                          m.roomUnit === u ? "bg-petflow-chocolate text-card" : "bg-card text-brown-soft ring-1 ring-petflow-line"
                        }`}
                      >
                        ห้อง {u}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {canMove && (moves.length === 0 || addDays(moves[moves.length - 1].from, 1) < checkout) && (
        <button
          type="button"
          onClick={add}
          className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-petflow-sm border border-dashed border-latte/60 text-xs font-bold text-latte-deep"
        >
          <Icon name="plus" size={15} />
          {moves.length === 0 ? "ย้ายห้องกลางทาง เช่น 25-28 ห้องหนึ่ง 28-31 อีกห้อง" : "ย้ายห้องอีกครั้ง"}
        </button>
      )}
      {moves.length > 0 && (
        <p className="mt-2 text-[10px] text-brown-faint">
          บิลแยกบรรทัดค่าห้องตามช่วง · ผังห้องเห็นวันย้ายเป็นออกห้องเก่า + เข้าห้องใหม่
        </p>
      )}
    </div>
  );
}
