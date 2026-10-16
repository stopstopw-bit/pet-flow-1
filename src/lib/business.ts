// ────────────────────────────────────────────────────────────
// ข้อมูลร้าน (DEMO) — เป็นค่าตัวอย่างของ "PetFlow" ไว้โชว์ลูกค้า
// ร้านจริงให้แก้ค่าในนี้ให้เป็นของร้านตัวเอง (ชื่อ เบอร์ แผนที่ โซเชียล)
// อย่าใส่ข้อมูลติดต่อของร้านอื่นเป็นค่า fallback — ให้เว้นว่างแทน
// ────────────────────────────────────────────────────────────
export const BUSINESS = {
  name: "PetFlow",
  tagline: { th: "โรงแรมแมว · อาบน้ำ & กรูมมิ่ง", en: "Cat Hotel · Grooming & Spa" },
  lineOa: "@petflow",
  phones: ["02-123-4567"],
  address: "",
  maps: "https://www.google.com/maps",
  facebook: "petflow",
  /** โซเชียลมีเดีย — ใส่ลิงก์ทางการของร้าน */
  social: {
    line: "https://line.me/R/ti/p/@petflow",
    instagram: "https://www.instagram.com/",
    tiktok: "https://www.tiktok.com/",
    facebook: "https://www.facebook.com/",
  },
  reviewUrl: "https://www.google.com/maps",
  reviewButtonText: "⭐ รีวิวให้เราหน่อยนะคะ",
  location: {
    th: "กรุงเทพฯ",
    en: "Bangkok",
  },
  pointsRate: 100, // บาท = 1 แต้ม
  // จ่ายด้วยเครดิต Member ไม่ได้แต้ม — ได้ส่วนลดตอนซื้อเครดิตไปแล้ว
  noPointsOnMemberCredit: true,
  // ให้แต้มตอนเติมเครดิตแทน คิดจากยอดที่จ่ายจริง (ไม่รวมเครดิตแถม)
  pointsOnMemberTopup: true,
  // อีเมลที่จะเชิญเป็น "เจ้าของ" ปฏิทินนัดของร้านนี้ (Google Calendar attendee + ที่โชว์ในไฟล์ .ics)
  // ต้องเว้นว่างเป็นค่าเริ่มต้นเสมอ — ห้ามใส่อีเมลของร้านใดร้านหนึ่งเป็นค่า fallback ให้ร้านอื่น
  calendarOwnerEmails: [] as string[],
} as const;

/** ห้องจริงทั้งหมด 13 ยูนิต */
export const ROOM_INVENTORY = {
  total: 13,
  miniMeow: 6, // S
  midCozy: 6, // M
  catflix: 1, // Netflix / Window with View
} as const;

export type RoomSize = "S" | "M" | "S+S" | "M+M" | "S+M";

export type RoomType = {
  id: string;
  name: string;
  subtitle?: { th: string; en: string };
  size: RoomSize;
  /** จำนวนยูนิต (เฉพาะห้องเดี่ยว) */
  count?: number;
  /**
   * จุแมวได้กี่ตัวต่อห้อง — แมวของบ้านเดียวกันช่วงวันเดียวกันนอนรวมห้องได้ถึงจำนวนนี้
   * ไม่ระบุ = 1 ตัว (คนละบ้านไม่นอนรวมกันเสมอ ไม่ว่าห้องจะจุได้เท่าไหร่)
   */
  maxCats?: number;
  /** ราคาห้อง (price) รวมแมวได้กี่ตัว — เกินจากนี้คิดเพิ่ม extraCatPrice ต่อตัวต่อคืน (ไม่ตั้ง = 2) */
  includedCats?: number;
  /** ค่าแมวตัวที่เกิน includedCats ต่อตัว/คืน — ไม่ตั้งหรือ 0 = ไม่คิดเพิ่ม */
  extraCatPrice?: number;
  /**
   * ห้องเชื่อม — เกิดจากเปิดห้องจริงที่อยู่ติดกันถึงกัน ไม่ใช่ห้องเพิ่ม
   * เช่น Duo = ห้อง S 2 ห้อง → [{ typeId: "<id ห้อง S>", units: 2 }]
   * ห้องแบบนี้ตั้ง count เป็น 0 แล้วที่ว่างจะคิดจากห้องจริงที่ใช้ประกอบแทน
   */
  composedOf?: { typeId: string; units: number }[];
  price: number;
  cats: { th: string; en: string };
  extra: { th: string; en: string };
  dimensions?: { th: string; en: string };
  /** ห้องเชื่อม — อธิบายการจัด */
  config?: { th: string; en: string };
  note?: { th: string; en: string };
  image: string;
  amenities: { th: string[]; en: string[] };
};

const BASE_AMENITIES = {
  th: [
    "พี่เลี้ยงทำความสะอาดห้องทุกวัน",
    "บริการถาดน้ำ อาหาร กระบะทราย",
    "จุดปลั๊กไฟ (เอาน้ำพุแมวมาใช้ได้ฟรี)",
    "พี่เลี้ยงพาเล่น/เดินเล่น วันละ 2 รอบ",
  ],
  en: [
    "Daily room cleaning",
    "Water, food & litter service",
    "Power outlet (bring your own fountain free)",
    "Playtime twice daily",
  ],
};

/** ประเภทห้องที่จองได้ (รวมห้องเชื่อม) */
export const ROOMS: RoomType[] = [
  {
    id: "mini-meow",
    maxCats: 2,
    name: "MiNi Meow",
    size: "S",
    count: 6,
    price: 350,
    cats: { th: "1 แมว", en: "1 cat" },
    extra: { th: "แมวที่ 2 +50", en: "2nd cat +50" },
    dimensions: { th: "90×100×110 ซม.", en: "90×100×110 cm" },
    note: {
      th: "ทรายแมวฟรีพัก 3 คืนขึ้นไป · CCTV +100 (พัก 5 คืน+ ฟรี) · น้ำพุ +80/ครั้ง",
      en: "Free litter 3+ nights · CCTV +100 (free 5+ nights) · fountain +80",
    },
    image: "/catalog/rooms/cat-hotel-bangna-mini-meow.jpg",
    amenities: { th: [...BASE_AMENITIES.th], en: [...BASE_AMENITIES.en] },
  },
  {
    id: "mid-cozy",
    maxCats: 3,
    name: "Mid Cozy Room",
    size: "M",
    count: 6,
    price: 450,
    cats: { th: "1–2 แมว", en: "1–2 cats" },
    extra: { th: "แมวที่ 3 +50", en: "3rd cat +50" },
    dimensions: { th: "90×100×150 ซม.", en: "90×100×150 cm" },
    note: {
      th: "ทรายแมวฟรีพัก 3 คืนขึ้นไป · CCTV +100 (พัก 5 คืน+ ฟรี) · น้ำพุ +80/ครั้ง",
      en: "Free litter 3+ nights · CCTV +100 (free 5+ nights) · fountain +80",
    },
    image: "/catalog/rooms/cat-hotel-bangna-mid-cozy.jpg",
    amenities: { th: [...BASE_AMENITIES.th], en: [...BASE_AMENITIES.en] },
  },
  {
    id: "catflix",
    maxCats: 4,
    name: "Catflix & Chill",
    subtitle: { th: "Window with View", en: "Window with View" },
    size: "M",
    count: 1,
    price: 750,
    cats: { th: "1–3 แมว", en: "1–3 cats" },
    extra: { th: "แมวที่ 4 +50", en: "4th cat +50" },
    dimensions: { th: "100×160×260 ซม.", en: "100×160×260 cm" },
    note: {
      th: "ฟรี CCTV 24 ชม. · ฟรีน้ำพุไร้สาย · ฟรีทรายแมวตลอดการเข้าพัก",
      en: "Free 24h CCTV · free fountain · free litter",
    },
    image: "/catalog/rooms/cat-hotel-bangna-catflix.jpg",
    amenities: {
      th: [
        ...BASE_AMENITIES.th,
        "ฟรีกล้องวงจรปิด 24 ชม.",
        "ฟรีน้ำพุแมวไร้สาย (เปลี่ยนไส้กรองทุกครั้ง)",
      ],
      en: [
        ...BASE_AMENITIES.en,
        "Free 24h CCTV",
        "Free wireless fountain (fresh filter each stay)",
      ],
    },
  },
  {
    id: "mini-duo",
    maxCats: 4,
    composedOf: [{ typeId: "mini-meow", units: 2 }],
    name: "Mini Duo",
    size: "S+S",
    price: 700,
    cats: { th: "1–3 แมว", en: "1–3 cats" },
    extra: { th: "แมวที่ 4 +50", en: "4th cat +50" },
    dimensions: { th: "180×100×110 ซม.", en: "180×100×110 cm" },
    config: {
      th: "2 ห้อง S · ประตูเชื่อม",
      en: "2 S rooms · connecting door",
    },
    note: {
      th: "ฟรี CCTV 24 ชม. · ฟรีน้ำพุไร้สาย · ฟรีทรายแมวตลอดการเข้าพัก",
      en: "Free 24h CCTV · free fountain · free litter",
    },
    image: "/catalog/rooms/cat-hotel-bangna-mini-duo.jpg",
    amenities: {
      th: [
        ...BASE_AMENITIES.th,
        "ฟรีกล้องวงจรปิด 24 ชม.",
        "ฟรีน้ำพุแมวไร้สาย (เปลี่ยนไส้กรองทุกครั้ง)",
        "ฟรีทรายแมวตลอดการเข้าพัก",
      ],
      en: [
        ...BASE_AMENITIES.en,
        "Free 24h CCTV",
        "Free wireless fountain",
        "Free litter throughout stay",
      ],
    },
  },
  {
    id: "cozy-duo",
    maxCats: 5,
    composedOf: [{ typeId: "mid-cozy", units: 2 }],
    name: "Cozy Duo",
    size: "M+M",
    price: 750,
    cats: { th: "1–4 แมว", en: "1–4 cats" },
    extra: { th: "แมวที่ 5 +50", en: "5th cat +50" },
    dimensions: { th: "180×100×150 ซม.", en: "180×100×150 cm" },
    config: {
      th: "2 ห้อง M · ประตูเชื่อม",
      en: "2 M rooms · connecting door",
    },
    note: {
      th: "ฟรี CCTV 24 ชม. · ฟรีน้ำพุไร้สาย · ฟรีทรายแมวตลอดการเข้าพัก",
      en: "Free 24h CCTV · free fountain · free litter",
    },
    image: "/catalog/rooms/cat-hotel-bangna-cozy-duo.jpg",
    amenities: {
      th: [
        ...BASE_AMENITIES.th,
        "ฟรีกล้องวงจรปิด 24 ชม.",
        "ฟรีน้ำพุแมวไร้สาย (เปลี่ยนไส้กรองทุกครั้ง)",
        "ฟรีทรายแมวตลอดการเข้าพัก",
      ],
      en: [
        ...BASE_AMENITIES.en,
        "Free 24h CCTV",
        "Free wireless fountain",
        "Free litter throughout stay",
      ],
    },
  },
  {
    id: "cat-tower",
    maxCats: 5,
    composedOf: [
      { typeId: "mini-meow", units: 1 },
      { typeId: "mid-cozy", units: 1 },
    ],
    name: "Cat Tower Suite",
    size: "S+M",
    price: 700,
    cats: { th: "1–4 แมว", en: "1–4 cats" },
    extra: { th: "แมวที่ 5 +50", en: "5th cat +50" },
    dimensions: { th: "100×160×370 ซม.", en: "100×160×370 cm" },
    config: {
      th: "ห้อง S + M · ประตูเชื่อม",
      en: "S + M rooms · connecting door",
    },
    note: {
      th: "ฟรี CCTV 24 ชม. · ฟรีน้ำพุไร้สาย · ฟรีทรายแมวตลอดการเข้าพัก",
      en: "Free 24h CCTV · free fountain · free litter",
    },
    image: "/catalog/rooms/cat-hotel-bangna-cat-tower.jpg",
    amenities: {
      th: [
        ...BASE_AMENITIES.th,
        "ฟรีกล้องวงจรปิด 24 ชม.",
        "ฟรีน้ำพุแมวไร้สาย (เปลี่ยนไส้กรองทุกครั้ง)",
        "ฟรีทรายแมวตลอดการเข้าพัก",
      ],
      en: [
        ...BASE_AMENITIES.en,
        "Free 24h CCTV",
        "Free wireless fountain",
        "Free litter throughout stay",
      ],
    },
  },
];

export const ROOM_AMENITIES = {
  th: [
    "พี่เลี้ยงทำความสะอาดห้องทุกวัน",
    "บริการถาดน้ำ อาหาร กระบะทราย",
    "จุดปลั๊กไฟ (เอาน้ำพุแมวมาใช้ได้ฟรี)",
    "พี่เลี้ยงพาเล่น/เดินเล่น วันละ 2 รอบ",
  ],
  en: [
    "Daily room cleaning",
    "Water, food & litter service",
    "Power outlet (bring your own fountain free)",
    "Playtime twice daily",
  ],
} as const;

/** บริการรับส่งน้องแมว */
export const TRANSPORT = {
  th: [
    "≤ 1 กม. ฟรีรับ-ส่ง",
    "≤ 5 กม. 100 บาท",
    "≤ 10 กม. 150 บาท",
    "> 10 กม. 150 บาท + 10 บาท/กม.",
  ],
  en: [
    "≤ 1 km free",
    "≤ 5 km 100 THB",
    "≤ 10 km 150 THB",
    "> 10 km 150 THB + 10 THB/km",
  ],
} as const;

/** แลกแต้ม — 100 บาท = 1 แต้ม */
export const POINTS_REWARDS = [
  {
    id: "treat",
    points: 5,
    reward: { th: "ทรีทเหลวพรีเมียม 1 ซอง หรือของเล่นแมว", en: "Premium treat or cat toy" },
  },
  {
    id: "coupon50",
    points: 10,
    reward: { th: "คูปองส่วนลด 50 บาท", en: "50 THB coupon" },
  },
  {
    id: "coupon100",
    points: 20,
    reward: { th: "คูปองส่วนลด 100 บาท", en: "100 THB coupon" },
  },
  {
    id: "coupon200",
    points: 30,
    reward: { th: "คูปองส่วนลด 200 บาท", en: "200 THB coupon" },
  },
  {
    id: "coupon500",
    points: 40,
    reward: { th: "คูปองส่วนลด 500 บาท", en: "500 THB coupon" },
  },
] as const;

export const GROOM_SLOTS = ["09:30", "12:30", "15:30"] as const;

export type Locale = "th" | "en";

/**
 * ขั้นของนัด: จอง → ยืนยัน → พร้อมรับกลับ → เสร็จ
 * "ready" = ทำเสร็จแล้ว รอเจ้าของมารับ (กดแล้วลูกค้ารู้ทันที ไม่ต้องโทรถาม)
 * "no_show" แยกจาก "cancelled" เพื่อดูได้ว่าใครชอบไม่มาโดยไม่แจ้ง
 */
export type BookingStatus =
  | "pending"
  | "confirmed"
  | "ready"
  | "done"
  | "cancelled"
  | "no_show";

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "รอยืนยัน",
  confirmed: "ยืนยันแล้ว",
  ready: "พร้อมรับกลับ",
  done: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
  no_show: "ไม่มา",
};

/** นัดที่ยัง "มีชีวิต" — ยังกินคิว/กินห้องอยู่ */
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "ready",
];

export type Booking = {
  id: string;
  customerName: string;
  catName: string;
  service: "groom" | "room";
  date: string;
  time?: string;
  checkout?: string;
  roomType?: string;
  status: BookingStatus;
  checkinTime?: string;
  /** true = ลูกค้าจองเองผ่านแอป (ต้องรอร้านยืนยัน ลูกค้ายืนยันเองไม่ได้) */
  selfBooked?: boolean;
  /** โปรแกรมอาบน้ำที่เลือกไว้ตอนจอง (id ใน GROOM_PROGRAMS) — เฉพาะ service=groom */
  groomProgram?: string;
};

export type CustomerProfile = {
  lineUserId: string;
  displayName: string;
  pictureUrl?: string;
  points: number;
};

export const DEMO_BOOKINGS: Booking[] = [
  {
    id: "B001",
    customerName: "คุณมาย",
    catName: "น้องส้ม",
    service: "groom",
    date: "2026-07-23",
    time: "12:30",
    status: "pending",
  },
];

export const DEMO_PROMOS = [
  {
    id: "P1",
    title: { th: "สมาชิกใหม่ รับแต้ม x2", en: "New member double points" },
    body: {
      th: "จองครั้งแรกรับแต้มสะสม 2 เท่า 🧡",
      en: "First booking earns 2x loyalty points 🧡",
    },
    until: "2026-08-31",
  },
  {
    id: "P2",
    title: { th: "พัก 7 คืนขึ้นไป ฟรีกล้อง CCTV", en: "7+ nights free CCTV" },
    body: {
      th: "ห้อง MiNi Meow / Mid Cozy / Cat Tower รับฟรีกล้องวงจรปิด",
      en: "MiNi Meow, Mid Cozy & Cat Tower — free CCTV for 7+ nights",
    },
    until: "2026-12-31",
  },
];

export function getRoomById(id: string) {
  return ROOMS.find((r) => r.id === id);
}

/** ค่าแมวเพิ่มต่อคืนของบ้านที่พัก n ตัวในห้องแบบนี้ (คิดต่อห้อง — n ตัวอาจใช้หลายห้อง) */
export function extraCatChargePerNight(
  room: Pick<RoomType, "maxCats" | "includedCats" | "extraCatPrice">,
  n: number
): { rooms: number; extraCats: number; perNight: number } {
  const max = Math.max(1, room.maxCats || 1);
  const rooms = Math.max(1, Math.ceil(n / max));
  const included = Math.max(1, room.includedCats ?? 2);
  // กระจายแมวให้เท่าๆ กันในแต่ละห้อง แล้วนับตัวที่เกินโควตาของแต่ละห้อง
  let extraCats = 0;
  for (let i = 0; i < rooms; i++) {
    const inRoom = Math.floor(n / rooms) + (i < n % rooms ? 1 : 0);
    extraCats += Math.max(0, inRoom - included);
  }
  const price = Math.max(0, room.extraCatPrice || 0);
  return { rooms, extraCats: price ? extraCats : 0, perNight: price * extraCats };
}
