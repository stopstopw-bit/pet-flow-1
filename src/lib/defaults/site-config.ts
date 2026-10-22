import {
  BUSINESS,
  ROOM_INVENTORY,
  ROOMS,
  GROOM_SLOTS,
  TRANSPORT,
  POINTS_REWARDS,
} from "../business";
import {
  GROOM_MENUS,
  GROOM_NOTES,
  GROOM_SIZE_LABELS,
  GROOM_SPECIALS,
} from "../grooming";
import { DEFAULT_MESSAGES } from "../messages";
import { SERVICE_PRESETS } from "../service-presets";
import { BREED_OPTIONS } from "../cat-breeds";
import { GROOM_PROGRAMS } from "../grooming-prices";
import type { SiteConfig } from "../config-types";

/**
 * ค่าเริ่มต้นของร้านที่เพิ่งสร้าง — ทุกอย่างที่เป็นของแต่ละร้าน (บัญชีธนาคาร, LINE, เบอร์, ลิงก์)
 * ว่างหมด ห้ามดึงค่าจาก env หรือร้านอื่นมาใส่ให้
 */
export function getBlankShopConfig(name: string): SiteConfig {
  const config = getDefaultSiteConfig();
  config.business.name = name;
  config.payment = { bankName: "", accountNumber: "", accountName: "", promptpayId: undefined };
  return config;
}

export function getDefaultSiteConfig(): SiteConfig {
  return JSON.parse(
    JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      crm: {
        inactiveDays: 60,
        followUpCooldownDays: 30,
        followUpMessage:
          "สวัสดีค่ะ {name} จาก {shop} 🐾\nคิดถึงน้อง{pets} นะคะ มาไม่ได้นาน {days} วันแล้ว มีโปรพิเศษรออยู่ที่แอปนะคะ 💛",
        tierPresets: ["VIP", "Gold", "Silver"],
        tierRules: {
          regularMinVisits: 1,
          vipMinVisits: 5,
          vipMinSpend: 0,
        },
      },
      messages: { ...DEFAULT_MESSAGES },
      automation: {
        confirmTomorrowEnabled: true,
        confirmDaysBefore: 1,
        depositReminderEnabled: true,
        depositReminderDays: 7,
        prestayReminderEnabled: true,
        prestayReminderDays: 3,
        checkinReminderEnabled: true,
        checkinReminderDays: 1,
        checkinReminderTime: "12:00",
        checkoutReminderEnabled: true,
        checkoutReminderDays: 1,
        checkoutReminderTime: "19:30",
        reviewRequestEnabled: true,
        reviewRequestDaysAfter: 1,
        groomInfoEnabled: true,
        intakeAutoEnabled: true,
        freeLitterMinNights: 3,
        birthdayEnabled: true,
        birthdayCouponEnabled: true,
        birthdayCouponAmount: 100,
        bookingApprovedEnabled: true,
      },
      business: { ...BUSINESS },
      payment: {
        bankName: process.env.BANK_NAME || "กรุงไทย",
        accountNumber: process.env.BANK_ACCOUNT_NUMBER || "XXX-X-XXXXX-X",
        // ห้าม default เป็นชื่อร้านใดร้านหนึ่ง — ร้านที่ยังไม่ตั้งค่าจะโชว์ชื่อบัญชีคนอื่นบนการ์ดโอนเงิน
        accountName: process.env.BANK_ACCOUNT_NAME || "",
        promptpayId: process.env.PROMPTPAY_ID || undefined,
      },
      // มัดจำตอนลูกค้าจองเอง — ปิดไว้ก่อนเสมอ ร้านเดิมใช้งานเหมือนเดิมจนกว่าจะเปิดเอง
      bookingDeposit: { enabled: false, groomAmount: 0, roomAmount: 0 },
      billing: {
        summaryBookingTitle: "สรุปการจอง",
        summaryDepositTitle: "แจ้งมัดจำ",
        summaryFullTitle: "แจ้งยอดชำระ",
        summaryClosing: "โอนแล้วแจ้งสลิปได้เลยนะคะ 🧡",
      },
      roomInventory: { ...ROOM_INVENTORY },
      rooms: ROOMS,
      groomPricePrograms: GROOM_PROGRAMS,
      boardingRules: [],
      roomsPageBlocks: [],
      groomingPageBlocks: [],
      groomSlots: [...GROOM_SLOTS],
      groomSlotDefaultCapacity: 1,
      closedWeekdays: [],
      closedDates: [],
      transport: {
        th: [...TRANSPORT.th],
        en: [...TRANSPORT.en],
      },
      pointsRewards: POINTS_REWARDS.map((r) => ({
        id: r.id,
        points: r.points,
        reward: { ...r.reward },
      })),
      grooming: {
        menus: JSON.parse(JSON.stringify(GROOM_MENUS)),
        specials: JSON.parse(JSON.stringify(GROOM_SPECIALS)),
        notes: {
          th: [...GROOM_NOTES.th],
          en: [...GROOM_NOTES.en],
        },
        sizeLabels: JSON.parse(JSON.stringify(GROOM_SIZE_LABELS)),
      },
      branding: {
        primary: "#b8698e",
        accent: "#f6c6d9",
        heading: "#6b2d47",
        background: "#fff6f9",
        surface: "#ffffff",
        text: "#4a2d3a",
      },
      options: {
        servicePresets: SERVICE_PRESETS.map((s) => ({ ...s })),
        freebies: ["กล้องวงจรปิด (CCTV)", "น้ำพุแมว", "ทรายแมว", "รับ-ส่ง", "ขนม/ทรีท"],
        catBreeds: [...BREED_OPTIONS],
        referralOptions: [
          "Facebook",
          "Instagram",
          "TikTok",
          "Google / ค้นหา",
          "Google Maps",
          "เพื่อนแนะนำ / ผ่านหน้าร้าน",
        ],
      },
    })
  ) as SiteConfig;
}
