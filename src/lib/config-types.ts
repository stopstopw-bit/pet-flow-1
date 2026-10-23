import type { RoomType } from "./business";
import type { GroomFormConfig } from "./groom-form";
import type { GroomProgram } from "./grooming-prices";
import type { RoomClosure } from "./room-board";

/** บล็อกเนื้อหาหน้ากฎระเบียบการฝาก — ใส่ได้ทั้งรูปและ/หรือข้อความ เรียงตามลำดับที่ตั้งไว้ */
export type BookingDepositConfig = {
  enabled?: boolean;
  /** ยอดมัดจำคิวอาบน้ำ (บาท) — 0/ไม่ตั้ง = ไม่เก็บมัดจำอาบน้ำ */
  groomAmount?: number;
  /** ยอดมัดจำห้องพัก (บาท) — 0/ไม่ตั้ง = ไม่เก็บมัดจำห้องพัก */
  roomAmount?: number;
};

export type BoardingRuleBlock = {
  id: string;
  /** URL รูป หรือ data: URL ที่อัปโหลดไว้ — ไม่ใส่ก็ได้ถ้าบล็อกนี้มีแต่ข้อความ */
  image?: string;
  text?: string;
};

export type LocalizedLines = { th: string[]; en: string[] };

export type PointsRewardConfig = {
  id: string;
  points: number;
  reward: { th: string; en: string };
  imageUrl?: string;
  /** มูลค่าส่วนลด (บาท) ของรางวัลนี้ — ถ้าไม่ตั้งไว้ ระบบจะลองอ่านจากชื่อรางวัลแทน */
  discount?: number;
};

export type GroomingConfig = {
  menus: Record<string, unknown>;
  specials: { th: { name: string; price: string }[]; en: { name: string; price: string }[] };
  notes: LocalizedLines;
  sizeLabels: { th: Record<string, string>; en: Record<string, string> };
};

export type CrmConfig = {
  /** จำนวนวันที่ไม่มาใช้บริการ = ถือว่าหายไป */
  inactiveDays: number;
  /** ไม่ส่งตามซ้ำภายในกี่วัน */
  followUpCooldownDays: number;
  /** ข้อความตามลูกค้า — ใช้ {name} {days} {pets} (เดิม {cats} ยังใช้ได้) {shop} */
  followUpMessage: string;
  /** tier ที่ตั้งเองได้ในโปรไฟล์ลูกค้า */
  tierPresets: string[];
  /** เงื่อนไขอัปเกรดระดับลูกค้าอัตโนมัติ (ตั้งเองได้) */
  tierRules: TierRulesConfig;
};

/** เงื่อนไขเลื่อนระดับลูกค้า — ถึงระดับเมื่อ "ครบครั้ง" หรือ "ยอดถึง" (อย่างใดอย่างหนึ่ง) */
export type TierRulesConfig = {
  /** มาใช้บริการกี่ครั้งขึ้นไป = ลูกค้าประจำ */
  regularMinVisits: number;
  /** มาใช้บริการกี่ครั้งขึ้นไป = VIP */
  vipMinVisits: number;
  /** ยอดสะสมรวมกี่บาทขึ้นไป = VIP (0 = ปิด ไม่ใช้เงื่อนไขยอด) */
  vipMinSpend: number;
};

/** ข้อความ (plain text) ที่ส่งหาลูกค้า — แก้ได้ในหน้าตั้งค่า > ข้อความ */
export type MessagesConfig = {
  /** เตือนยอดคงเหลือ 7 วันก่อนเข้าพัก — {shop} {cat} {checkin} {deposit} {remaining} {bank} {accountNumber} {accountName} */
  depositReminder: string;
  /** รายละเอียด 3 วันก่อนเข้าพัก — {shop} {cat} {checkin} {checkout} {room} (เก่า/สำรอง) */
  prestayReminder: string;
  /** การ์ดเข้าพัก — ประโยคทักทายเปิด — {shop} {cat} */
  prestayIntro: string;
  /** การ์ดเข้าพัก — ประโยคเกริ่นก่อนลิสต์ของที่ต้องเตรียม */
  prestayPrepIntro: string;
  /** การ์ดเข้าพัก — รายการของที่ต้องเตรียม (บรรทัดละ 1 ข้อ) */
  prestayPrepItems: string[];
  /** การ์ดเข้าพัก — ประโยคปิดชวนแจ้งการดูแลพิเศษ — {cat} */
  prestayCareNote: string;
  /** การ์ดเข้าพัก — ข้อความเตือนให้เตรียมทราย (เข้าพักสั้นกว่าเกณฑ์แถมฟรี) — {min} */
  prestayLitterNote: string;
  /** เตือนเช็คอิน ก่อนเข้าพัก — {shop} {cat} {checkin} {room} */
  checkinReminder: string;
  /** เตือนเช็คเอาท์ ก่อนออก — {shop} {cat} {checkout} */
  checkoutReminder: string;
  /** ขอรีวิวหลังเช็คเอาท์ — {shop} {cat} */
  reviewRequest: string;
  /** สอบถามประวัติน้องก่อนอาบน้ำ — {shop} {cat} */
  groomInfoIntro: string;
  /** ข้อความชวนกดยอมรับข้อตกลงก่อนเข้าพัก (แนบลิงก์) — {shop} {cat} {url} */
  consentInvite: string;
  /** หัวเรื่องหน้ายอมรับข้อตกลงก่อนเข้าพัก */
  consentTitle: string;
  /** ข้อตกลงก่อนเข้าพัก — บรรทัดละ 1 ข้อ */
  consentTerms: string[];
  /** การ์ดเรียกเก็บมัดจำ (ส่งก่อนลูกค้าโอน) — หัวเรื่อง */
  depositRequestTitle: string;
  /** การ์ดเรียกเก็บมัดจำ — ข้อความ ({name} {cat} {amount}) */
  depositRequestBody: string;
  /** การ์ดขอบคุณตอนรับมัดจำ — หัวเรื่อง */
  depositThanksTitle: string;
  /** การ์ดขอบคุณตอนรับมัดจำ — ข้อความ ({name} {cat} {amount}) */
  depositThanksBody: string;
  /** เงื่อนไขมัดจำในการ์ด — บรรทัดละ 1 ข้อ */
  depositTerms: string[];
  /** อวยพรวันเกิดแมวอัตโนมัติ — {shop} {name} {cat} */
  birthdayGreeting: string;
  /** วันเกิดเจ้าของ — คนละข้อความกับวันเกิดน้องแมว */
  birthdayGreetingOwner: string;
  /** แจ้งลูกค้าทันทีที่ร้านกดยืนยันคิว — ยืนยันว่าได้คิววันที่จองมาแล้ว
   * (คนละอันกับ checkinReminder ที่เตือนล่วงหน้าก่อนถึงวันจริง)
   * — {shop} {cat} {when} (วันที่+เวลา+ประเภทนัด จัดรูปแบบมาแล้วจาก bookingScheduleText) */
  bookingApprovedText: string;
};

/** ตั้งค่าระบบส่งอัตโนมัติ — เปิด/ปิด + กี่วันก่อน (แก้ได้ในหน้าตั้งค่า > อัตโนมัติ) */
export type AutomationConfig = {
  /** ส่งการ์ดยืนยันนัดอัตโนมัติ */
  confirmTomorrowEnabled: boolean;
  /** ส่งการ์ดยืนยันนัด ล่วงหน้ากี่วัน (1 = พรุ่งนี้) */
  confirmDaysBefore: number;
  /** เตือนยอดคงเหลือก่อนเข้าพัก */
  depositReminderEnabled: boolean;
  /** กี่วันก่อนเข้าพัก ที่จะเตือนยอดคงเหลือ */
  depositReminderDays: number;
  /** แจ้งรายละเอียดเข้าพัก + เงื่อนไข ก่อนเข้าพัก */
  prestayReminderEnabled: boolean;
  /** กี่วันก่อนเข้าพัก ที่จะแจ้งรายละเอียด+เงื่อนไข */
  prestayReminderDays: number;
  /** เตือนเช็คอิน ก่อนวันเข้าพัก */
  checkinReminderEnabled: boolean;
  /** กี่วันก่อนเข้าพัก ที่จะเตือนเช็คอิน (0 = วันเข้าพักเลย) */
  checkinReminderDays: number;
  /** เวลาที่จะส่ง (ตามรอบ cron ที่มี: "08:00" | "12:00" | "18:00") */
  checkinReminderTime?: string;
  /** เตือนเช็คเอาท์ ก่อนวันออก */
  checkoutReminderEnabled: boolean;
  /** กี่วันก่อนเช็คเอาท์ ที่จะเตือน (0 = วันเช็คเอาท์เลย) */
  checkoutReminderDays: number;
  /** เวลาที่จะส่ง (ตามรอบ cron ที่มี: "08:00" | "12:00" | "18:00") */
  checkoutReminderTime?: string;
  /** ขอรีวิวอัตโนมัติ หลังลูกค้าเช็คเอาท์ (ห้องพัก) */
  reviewRequestEnabled: boolean;
  /** ส่งขอรีวิวหลังเช็คเอาท์ (วัน) */
  reviewRequestDaysAfter: number;
  /** ส่งการ์ดสอบถามประวัติน้องก่อนอาบน้ำ (พ่วงกับยืนยันนัด) */
  groomInfoEnabled: boolean;
  /**
   * ถามข้อมูลก่อนรับน้องอัตโนมัติ (ข้อมูลก่อนเข้าพัก / สมุดวัคซีน / บัตรประชาชน / กฎ + กดยินยอม)
   * ส่งเฉพาะใบที่ลูกค้ายังไม่ได้ส่ง — ไม่มีค่า = เปิด
   */
  intakeAutoEnabled?: boolean;
  /** เข้าพักกี่คืนขึ้นไป ถึงแถมทรายฟรี (ถ้าน้อยกว่านี้ ให้ลูกค้าเตรียมทรายมาเอง) */
  freeLitterMinNights: number;
  /** อวยพรวันเกิดแมวอัตโนมัติ */
  birthdayEnabled: boolean;
  /** แจกคูปองวันเกิดอัตโนมัติ (แมว/เจ้าของ) */
  birthdayCouponEnabled: boolean;
  /** มูลค่าคูปองวันเกิด (บาท) */
  birthdayCouponAmount: number;
  /** ส่งข้อความยืนยันคิวทันทีตอนร้านกดยืนยัน (คนละอันกับเตือนล่วงหน้าก่อนถึงวัน) */
  bookingApprovedEnabled: boolean;
};

/**
 * สไตล์การ์ด LINE ต่อใบ — ตั้งค่าจากหน้า "ปรับแต่งการ์ด LINE" (มีพรีวิวสด)
 * ทุกฟิลด์ optional: ไม่ตั้ง = ใช้หน้าตาเดิมของระบบ
 */
export type CardStyleConfig = {
  /** สีแถบหัวการ์ด */
  headerColor?: string;
  /** สีตัวหนังสือบนแถบหัว */
  headerTextColor?: string;
  /** สีปุ่มกดในการ์ด */
  buttonColor?: string;
  /** สีไฮไลท์ (ยอดเงิน/ตัวเลขเด่น) */
  accentColor?: string;
  /** ข้อความปิดท้ายการ์ด (แทนของเดิม) */
  closing?: string;
  /** ขนาดตัวอักษรหัวข้อการ์ด */
  titleSize?: "sm" | "md" | "lg" | "xl";
  /** เปิด/ปิดส่วนประกอบในการ์ด — key ตามการ์ดแต่ละใบ, ไม่ตั้ง = แสดง */
  show?: Record<string, boolean>;
  /** ข้อความในการ์ดที่แก้เองได้ — key ตามการ์ดแต่ละใบ, ไม่ตั้ง = ใช้ข้อความเดิม */
  texts?: Record<string, string>;
};

export type SiteConfig = {
  version: number;
  updatedAt: string;
  /**
   * เปิด/ปิดฟีเจอร์รายร้าน (key ตาม FeatureKey ใน src/lib/features.ts)
   * false = ปิด · ไม่มี key = เปิด (ร้านเดิมใช้งานได้เหมือนเดิม)
   */
  features?: Partial<Record<string, boolean>>;
  /** ชวนเพื่อนรับคูปอง — มูลค่าคูปองต่อคน/อายุคูปอง (ไม่ตั้ง = 100 บาท · 60 วัน) ดู src/lib/referral.ts */
  referral?: { amount?: number; expiresInDays?: number };
  crm: CrmConfig;
  messages: MessagesConfig;
  automation: AutomationConfig;
  business: {
    name: string;
    tagline: { th: string; en: string };
    lineOa: string;
    phones: string[];
    maps: string;
    facebook: string;
    /** ลิงก์ให้ลูกค้ารีวิว (แยกจากลิงก์แผนที่) */
    reviewUrl: string;
    /** คำในปุ่มรีวิว */
    reviewButtonText: string;
    /**
     * ร้านรับเฉพาะลูกค้าที่จองล่วงหน้าไหม — เปิดแล้วจะขึ้นป้ายบอกในหน้าบริการ/ห้องพัก/อาบน้ำ
     * ปิดไว้เป็นค่าเริ่มต้น เพราะหลายร้านรับ walk-in ตามปกติ
     */
    byAppointmentOnly?: boolean;
    /** ข้อความในป้าย (ไม่ใส่ = ใช้ข้อความมาตรฐาน) */
    byAppointmentNote?: { th: string; en: string };
    location: { th: string; en: string };
    /** ร้านดูแลน้องอะไร (ดู lib/pet-kind.ts) — ไม่ตั้ง = แมว · ตั้งจากแบบสอบถามเปิดร้านหรือหน้าตั้งค่า › ร้าน */
    petKind?: "cat" | "dog" | "both";
    pointsRate: number;
    /**
     * จ่ายด้วยเครดิต Member แล้วไม่ต้องให้แต้ม — ลูกค้าได้ส่วนลดตอนซื้อเครดิตไปแล้ว
     * ถ้าให้แต้มอีกจะเท่ากับได้ประโยชน์ซ้ำสองรอบจากเงินก้อนเดียว
     */
    noPointsOnMemberCredit?: boolean;
    /**
     * ให้แต้มตอนลูกค้าเติมเครดิต Member — คิดจากยอดเงินที่จ่ายจริง ไม่รวมเครดิตแถม
     * ใช้คู่กับ noPointsOnMemberCredit เพื่อให้แต้มรอบเดียวตอนเติม ไม่ให้ซ้ำตอนใช้
     */
    pointsOnMemberTopup?: boolean;
    /** เลขประจำตัวผู้เสียภาษี — โชว์บนเอกสารรายได้/ใบสำคัญจ่าย (ไม่บังคับ) */
    taxId?: string;
    /** อีเมลที่จะเชิญเป็น "เจ้าของ" ปฏิทินนัดของร้านนี้ — เฉพาะร้านนี้เห็น ร้านอื่นไม่เห็น */
    calendarOwnerEmails?: string[];
    /** ชื่อนิติบุคคล/ชื่อตามทะเบียนที่โชว์บนเอกสารทางการ (ไม่ตั้ง = ใช้ชื่อร้าน) */
    legalName?: string;
    /** สาขาตามทะเบียนภาษี เช่น "สำนักงานใหญ่" หรือ "สาขา 00001" */
    taxBranch?: string;
    /** จดทะเบียนภาษีมูลค่าเพิ่มแล้ว — เปิดแล้วใบเสร็จจะเป็น "ใบเสร็จรับเงิน/ใบกำกับภาษี" และแยก VAT */
    vatRegistered?: boolean;
    /** อัตรา VAT (%) — ไม่ตั้ง = 7 · ราคาที่ร้านตั้งถือว่ารวม VAT แล้ว */
    vatRate?: number;
    /** แพ็กห้องรายเดือน: ส่วนลดจากราคาเต็ม (%) — ไม่ตั้ง = 30 */
    roomPlanDiscountPct?: number;
    /** แพ็กห้องรายเดือน: รวมกี่คืนขึ้นไปถึงได้ส่วนลด — ไม่ตั้ง = 30 */
    roomPlanMinNights?: number;
  };
  payment: {
    bankName: string;
    accountNumber: string;
    accountName: string;
    /** พร้อมเพย์ (เบอร์มือถือ 10 หลัก หรือเลขผู้เสียภาษี/บัตร 13 หลัก) — ใช้สร้าง QR ที่หน้าขาย POS */
    promptpayId?: string;
  };
  /**
   * มัดจำตอนลูกค้าจองเอง (หน้า /app/book) — ไม่ตั้ง/ปิด = จองได้เหมือนเดิม ไม่มีขั้นมัดจำ
   * ยอดเป็นบาทต่อ 1 การจอง (ทั้งบ้านที่จองพร้อมกัน = 1 ยอด ไม่คูณจำนวนตัว)
   */
  bookingDeposit?: BookingDepositConfig;
  /** ข้อความหัวเรื่อง/ปิดท้าย ของสรุปที่ก๊อป/ส่งให้ลูกค้า (แก้ได้ในตั้งค่า) */
  billing: {
    summaryBookingTitle: string;
    summaryDepositTitle: string;
    summaryFullTitle: string;
    summaryClosing: string;
  };
  roomInventory: {
    total: number;
    miniMeow: number;
    midCozy: number;
    catflix: number;
  };
  rooms: RoomType[];
  /** ปิดห้องรายห้อง (ซ่อม/ใช้งานไม่ได้) — ตั้งจากผังห้องในตารางนัด */
  roomClosures?: RoomClosure[];
  /**
   * ตารางราคาโปรแกรมอาบน้ำ — ไม่ตั้ง/ว่าง = ใช้ค่าเริ่มต้นของระบบ (GROOM_PROGRAMS)
   * ร้านเพิ่ม/ลบ/แก้โปรแกรมเองได้ในหลังบ้าน แทนที่การฝังในโค้ด
   */
  groomPricePrograms?: GroomProgram[];
  /** เนื้อหาหน้ากฎระเบียบการฝาก (ฝั่งลูกค้า) — ไม่ตั้ง = ยังไม่มีหน้านี้ */
  boardingRules?: BoardingRuleBlock[];
  /** เนื้อหาเสริมท้ายหน้าห้องพัก (หน้าห้องพักในแอปลูกค้า) */
  roomsPageBlocks?: BoardingRuleBlock[];
  /** เนื้อหาเสริมท้ายหน้าอาบน้ำ (หน้าอาบน้ำในแอปลูกค้า) */
  groomingPageBlocks?: BoardingRuleBlock[];
  groomSlots: string[];
  /** จำนวนคิวที่รับพร้อมกันต่อสล็อต (key = เวลาใน groomSlots) — ไม่ตั้งไว้ = ใช้ groomSlotDefaultCapacity */
  groomSlotCapacity?: Record<string, number>;
  /** จำนวนคิวเริ่มต้นต่อสล็อต เมื่อไม่ได้ตั้งไว้ใน groomSlotCapacity */
  groomSlotDefaultCapacity?: number;
  /**
   * คิดเวลาอาบน้ำตามจำนวนแมวของบ้านเดียวกัน — ตั้ง firstCatMinutes > 0 = เปิดใช้
   * บ้านที่มา N ตัว เริ่มพร้อมกันเวลาเดียว ใช้เวลา first + (N-1) × extra นาที
   * และกันคิวทุกรอบที่อยู่ในช่วงนั้น (แทนการกระจายน้องไปรอบถัดๆ ไปทั้งวัน)
   */
  groomDuration?: { firstCatMinutes: number; extraCatMinutes?: number };
  /** วันหยุดประจำสัปดาห์ (0=อาทิตย์ … 6=เสาร์) — ลูกค้าจองคิวเอง/ห้องพักเองในวันนี้ไม่ได้ */
  closedWeekdays?: number[];
  /** วันหยุดเฉพาะวัน (ปีใหม่, ปิดพักร้อน ฯลฯ) — เพิ่ม/ลบได้ในหลังบ้าน */
  closedDates?: { date: string; note?: string }[];
  /** งานดูแลรายวันของน้องที่เข้าพัก (เช็คลิสต์) — ไม่ตั้ง = ใช้ DEFAULT_CARE_TASKS */
  careTasks?: { id: string; label: string }[];
  /** ป้ายช่วงน้ำหนักของไซส์อาบน้ำ (เช่น "0–4 กก.") — ไม่ตั้ง = ใช้ค่าใน GROOM_SIZES */
  groomSizeLabels?: Partial<Record<"kitten" | "m" | "l", string>>;
  transport: LocalizedLines;
  pointsRewards: PointsRewardConfig[];
  grooming: GroomingConfig;
  /** ตัวเลือก/รายการที่แก้ได้ในหลังบ้าน (แทนที่การฝังในโค้ด) */
  options: {
    /** บริการเสริมในหน้าคิดเงิน (ชื่อ + ราคา) */
    servicePresets: { label: string; amount: number }[];
    /** ของแถม (ฟรี) — ชื่ออย่างเดียว */
    freebies: string[];
    /** สายพันธุ์แมว (หน้าลงทะเบียน + ตัวกรอง broadcast) */
    catBreeds: string[];
    /** รู้จักร้านจากไหน (referral) — หน้าลงทะเบียน */
    referralOptions: string[];
  };
  /** สไตล์การ์ด LINE รายใบ — key: bookingConfirm | billSummary | depositRequest | receipt | review | groomInfo */
  cards?: Record<string, CardStyleConfig>;
  /** คำถาม/ตัวเลือกในฟอร์มประวัติน้องก่อนอาบน้ำ — แก้เองได้ในหลังบ้าน */
  groomForm?: GroomFormConfig;
  /** สีประจำร้าน — แต่ละร้านปรับเองได้ ไม่ตั้ง = ใช้โทนสีเริ่มต้นของ PetFlow */
  branding?: {
    /** สีหลัก (ปุ่ม, ลิงก์เด่น) */
    primary: string;
    /** สีไฮไลท์ (พื้นหลังนุ่ม ๆ, แถบ, badge) */
    accent: string;
    /** สีตัวอักษรหัวข้อ/โลโก้ */
    heading: string;
    /** สีพื้นหลังหลักทั้งเว็บ (ใช้เป็นค่าตั้งต้น/สีทึบเมื่อไม่ได้เปิดไล่เฉด) */
    background: string;
    /** จุดเริ่มไล่สีพื้นหลัง — ใส่คู่กับ backgroundGradientTo เพื่อเปิดพื้นหลังไล่เฉด */
    backgroundGradientFrom?: string;
    /** จุดจบไล่สีพื้นหลัง */
    backgroundGradientTo?: string;
    /** สีพื้นการ์ด/กล่อง (ทับพื้นหลังหลัก) */
    surface: string;
    /** สีตัวอักษรเนื้อหาทั่วไป */
    text: string;
    /** โลโก้ร้าน — data URL หรือ URL รูป, ไม่ตั้ง = ใช้โลโก้ PetFlow เริ่มต้น */
    logoUrl?: string;
  };
};
