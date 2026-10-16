export type GroomSize = "kitten" | "m" | "l";

export const GROOM_SIZE_LABELS = {
  th: {
    kitten: "ลูกแมว (≤2 กก.)",
    m: "M (2–6 กก.)",
    l: "L (6 กก.↑)",
  },
  en: {
    kitten: "Kitten (≤2 kg)",
    m: "M (2–6 kg)",
    l: "L (6 kg+)",
  },
} as const;

export const GROOM_MENUS = {
  bath: {
    id: "bath",
    title: { th: "อาบน้ำ · เป่าขน", en: "Bath & blow-dry" },
    subtitle: {
      th: "แชมพูเกรดพรีเมียม · เกรดแมวประกวด",
      en: "Premium, show-grade shampoo",
    },
    poster: "/catalog/grooming/grooming-menu.jpg",
    programs: [
      {
        id: "dry",
        name: { th: "อาบน้ำ – เป่าขน", en: "Bath & blow-dry" },
        note: {
          th: "ทำความสะอาดผิวหนังธรรมดา",
          en: "Everyday skin & coat cleaning",
        },
      },
      {
        id: "degrease",
        name: { th: "อาบน้ำ + ขจัดคราบมัน", en: "Bath + degreasing" },
        note: {
          th: "สำหรับขนมัน จับเป็นซ่อ หรือมีคราบสะสม — ลดคราบมัน ขนเรียงตัว สะอาด เงางาม",
          en: "For oily, clumping or stained coats — less grease, smooth, clean and shiny",
        },
      },
    ],
    rows: [
      {
        breed: { th: "แมวไทย", en: "Thai cat" },
        dry: { kitten: 400, m: 450, l: 550 },
        degrease: { kitten: 500, m: 600, l: 700 },
      },
      {
        breed: { th: "แมวพันธุ์ขนสั้น", en: "Short hair" },
        dry: { kitten: 450, m: 500, l: 700 },
        degrease: { kitten: 600, m: 750, l: 900 },
      },
      {
        breed: { th: "แมวพันธุ์ขนยาว", en: "Long hair" },
        dry: { kitten: 550, m: 650, l: 850 },
        degrease: { kitten: 700, m: 850, l: 1050 },
      },
      {
        breed: { th: "แรคดอล / เมนคูน (ขนหนาฟู)", en: "Ragdoll / Maine Coon" },
        dry: { kitten: 650, m: 850, l: 1050 },
        degrease: { kitten: 800, m: 1050, l: 1250 },
      },
    ],
  },
  advance: {
    id: "advance",
    title: { th: "โปรแกรมดูแลพิเศษ", en: "Special care programs" },
    subtitle: {
      th: "PetFlow Premium หรือ ยับยั้งเชื้อรา (ราคาเดียวกันทั้ง 2 โปรแกรม)",
      en: "PetFlow Premium or antifungal (same price for both)",
    },
    poster: "",
    variants: [
      {
        id: "premium",
        name: { th: "PetFlow Premium", en: "PetFlow Premium" },
        features: {
          th: ["ขจัดคราบมัน", "ดีท็อกซ์ ทำความสะอาดคราบสะสม", "ทรีตเมนต์ บำรุงเส้นขน"],
          en: ["Degreasing", "Detox deep-clean", "Coat-nourishing treatment"],
        },
      },
      {
        id: "malaseb",
        name: { th: "ยับยั้งเชื้อรา (แชมพู Malaseb)", en: "Antifungal (Malaseb shampoo)" },
        features: {
          th: ["ประเมินก่อนบริการ", "หากมีโรคผิวหนัง ควรปรึกษาสัตวแพทย์ก่อน"],
          en: ["Assessed before service", "Please consult a vet first for skin conditions"],
        },
      },
    ],
    rows: [
      {
        breed: { th: "แมวพันธุ์ขนสั้น", en: "Short hair" },
        kitten: 700,
        m: 900,
        l: 1100,
      },
      {
        breed: { th: "แมวพันธุ์ขนยาว", en: "Long hair" },
        kitten: 800,
        m: 1000,
        l: 1250,
      },
      {
        breed: { th: "แรคดอล / เมนคูน (ขนหนาฟู)", en: "Ragdoll / Maine Coon" },
        kitten: 900,
        m: 1200,
        l: 1450,
      },
    ],
  },
} as const;

export const GROOM_SPECIALS = {
  th: [
    { name: "แก้ขนพันกันแน่น", price: "100–500" },
    { name: "ขจัดคราบเหลืองเฉพาะจุด", price: "200–500" },
    { name: "หยดยาป้องกันปรสิต", price: "360" },
  ],
  en: [
    { name: "Detangling matted fur", price: "100–500" },
    { name: "Deep stain removal (spot)", price: "200–500" },
    { name: "Parasite prevention drops", price: "360" },
  ],
} as const;

export const GROOM_NOTES = {
  th: [
    "ราคารวม ตัดเล็บ · เช็ดหูและตา · ไถก้น · ไถอุ้งเท้า",
    "บริการส่วนตัว รับทีละบ้าน · นัดหมายล่วงหน้า",
    "แมวเกิน 8 กก. ประเมินก่อนบริการ",
    "อาบน้ำเตรียมประกวด — สอบถามราคาเพิ่มเติม",
  ],
  en: [
    "Includes nail trim, ear/eye cleaning, paw & sanitary trim",
    "Private service — one household at a time, by appointment",
    "Cats over 8 kg are assessed before service",
    "Show preparation — please inquire for pricing",
  ],
} as const;
