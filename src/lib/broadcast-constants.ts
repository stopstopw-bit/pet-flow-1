/**
 * ค่าคงที่ล้วน ๆ ไม่มี import จาก server-only chain — แยกออกจาก line-broadcast.ts
 * เพื่อให้ client component (เช่นหน้า admin/promos) import ได้โดยไม่ลาก
 * line-config → secrets-store → tenant-context (node:async_hooks) เข้า bundle เบราว์เซอร์
 */
export type BroadcastActionId =
  | "promos"
  | "grooming"
  | "rooms"
  | "bookings"
  | "line_chat"
  | "maps"
  | "coupons"
  /** ปุ่มกดรับคูปองของแคมเปญนั้น ๆ — coupon:<offerId> */
  | `coupon:${string}`;

export const COUPON_ACTION_PREFIX = "coupon:";
export const couponActionId = (offerId: string): BroadcastActionId => `coupon:${offerId}`;
export const isCouponAction = (id: string): id is `coupon:${string}` => id.startsWith(COUPON_ACTION_PREFIX);

export type BroadcastAction = {
  id: BroadcastActionId;
  label: string;
  description: string;
};

export const BROADCAST_ACTIONS: BroadcastAction[] = [
  { id: "promos", label: "🎁 รับโปร", description: "เปิดหน้าโปรในแอป" },
  { id: "grooming", label: "🛁 จองอาบน้ำ", description: "ไปหน้าจองอาบน้ำ" },
  { id: "rooms", label: "🏠 จองห้องพัก", description: "ไปหน้าจองห้อง" },
  { id: "bookings", label: "📅 ดูนัดของฉัน", description: "เปิดรายการนัด" },
  { id: "line_chat", label: "💬 สนใจ / ทักแชท", description: "เปิดแชท LINE OA" },
  { id: "maps", label: "📍 ดูแผนที่", description: "เปิด Google Maps" },
  { id: "coupons", label: "🎟️ คูปองของฉัน", description: "เปิดกระเป๋าคูปองในแอป" },
];

export const COUPON_BUTTON_LABEL = "🎟️ กดรับคูปอง";

/** ชื่อปุ่มที่ลูกค้าเห็น (ใช้ทั้งตอนส่งจริงและพรีวิว) */
export function broadcastActionLabel(id: string): string {
  if (isCouponAction(id)) return COUPON_BUTTON_LABEL;
  return BROADCAST_ACTIONS.find((a) => a.id === id)?.label || id;
}

/** อ่านรายการปุ่มที่เก็บเป็นข้อความคั่นด้วย , — กรองของแปลก ๆ ทิ้ง ไม่เกิน 3 ปุ่ม */
export function parseBroadcastActions(raw: unknown): BroadcastActionId[] {
  const list = Array.isArray(raw) ? raw : String(raw || "").split(",");
  const ok = list
    .map((x) => String(x).trim())
    .filter((x) => isCouponAction(x) ? x.length > COUPON_ACTION_PREFIX.length : BROADCAST_ACTIONS.some((a) => a.id === x));
  return [...new Set(ok)].slice(0, 3) as BroadcastActionId[];
}

export type BroadcastTemplate = {
  label: string;
  title: string;
  body: string;
  suggestedActions: BroadcastActionId[];
};

export const BROADCAST_TEMPLATES: BroadcastTemplate[] = [
  {
    label: "โปร Member",
    title: "💎 โปรพิเศษ Member",
    body:
      "เติมเครดิตวันนี้ รับสิทธิพิเศษสำหรับสมาชิก\n" +
      "ทักจองคิวอาบน้ำหรือห้องพักได้เลยค่ะ 🐾",
    suggestedActions: ["promos", "line_chat"],
  },
  {
    label: "ลดราคาอาบน้ำ",
    title: "🛁 โปรอาบน้ำ & กรูมมิ่ง",
    body:
      "น้องสดชื่น หอมปราดเปรียะ\n" +
      "จองคิวอาบน้ำวันนี้ — รับสิทธิพิเศษสำหรับลูกค้าของเรา",
    suggestedActions: ["grooming", "line_chat"],
  },
  {
    label: "ห้องพักโปร",
    title: "🏠 โปรห้องพักน้อง",
    body:
      "ฝากน้องพักสบาย มี CCTV ดูแลตลอด\n" +
      "จองห้องพักล่วงหน้าได้เลย — ที่ว่างจำกัด",
    suggestedActions: ["rooms", "maps"],
  },
  {
    label: "ทักทายลูกค้าเก่า",
    title: "🐾 คิดถึงน้อง",
    body:
      "สวัสดีค่ะ 🐾\n" +
      "นานแล้วที่ไม่ได้เจอน้อง — มีโปรพิเศษรออยู่\n" +
      "ทักแชทหรือกดปุ่มด้านล่างเพื่อจองคิว",
    suggestedActions: ["line_chat", "grooming"],
  },
];
