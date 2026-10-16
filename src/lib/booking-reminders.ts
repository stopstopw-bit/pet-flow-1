import { getLineCredentials } from "./line-config";
import { politeCat } from "./line";
import { buildConsentUrl, buildBookingTimeUrl, buildGroomInfoUrl } from "./liff-urls";
import { renderTemplate, DEFAULT_MESSAGES, DEEMED_CONSENT_NOTICE } from "./messages";
import { formatThaiDateShort } from "./format-thai-date";
import type { StoredBooking } from "./bookings-store";
import type { InvoiceRecord } from "./invoices-store";
import type { SiteConfig } from "./config-types";

/**
 * ตัวสร้างข้อความเตือนลูกค้า — ใช้ร่วมกันทั้ง "cron อัตโนมัติ" และ "ปุ่มกดส่งเอง"
 * เพื่อให้แก้ข้อความที่เดียว (Settings) แล้วมีผลทุกที่
 */

/** ข้อความวัน/เวลา ของนัด — อาบน้ำ = วันที่+เวลา · ห้องพัก = ช่วงเข้าพัก */
export function bookingScheduleText(b: {
  service?: string;
  date?: string;
  time?: string;
  checkin?: string;
  checkout?: string;
}): string {
  if (b.service === "room" || b.checkin) {
    const inD = formatThaiDateShort(b.checkin || b.date || "");
    const outD = b.checkout ? formatThaiDateShort(b.checkout) : "";
    return `🏠 เข้าพัก: ${inD}${outD ? ` → ${outD}` : ""}`;
  }
  const d = formatThaiDateShort(b.date || "");
  return `📅 นัดอาบน้ำ: ${d}${b.time ? ` ${b.time} น.` : ""}`.trim();
}

/** ลิงก์หน้ายอมรับข้อตกลง (คืน "" ถ้ายังไม่ได้ตั้ง LIFF ID) — ใส่ bookingId ให้ชี้เฉพาะรอบเข้าพักนั้นเสมอ */
export async function getConsentUrl(bookingId?: string): Promise<string> {
  const liffId = (await getLineCredentials())?.liffId;
  return liffId ? buildConsentUrl(liffId, bookingId) : "";
}

/** ลิงก์หน้าเลือกเวลาส่ง/รับน้อง (คืน "" ถ้ายังไม่ได้ตั้ง LIFF ID) */
export async function getBookingTimeUrl(
  bookingId: string,
  type: "checkin" | "checkout"
): Promise<string> {
  const liffId = (await getLineCredentials())?.liffId;
  return liffId ? buildBookingTimeUrl(liffId, bookingId, type) : "";
}

/** เนื้อความการ์ดเลือกเวลาเข้าพัก (เช็คอิน) */
export function buildCheckinBodyText(
  b: Pick<StoredBooking, "catName" | "checkin" | "date" | "room">,
  cfg: SiteConfig
): string {
  return renderTemplate(cfg.messages.checkinReminder, {
    shop: cfg.business.name,
    cat: politeCat(b.catName),
    checkin: b.checkin || b.date || "",
    room: b.room ? `🏠 ห้อง: ${b.room}` : "",
    litterNote: "",
  });
}

/** ลิงก์หน้ากรอกประวัติน้องก่อนอาบน้ำ (คืน "" ถ้ายังไม่ได้ตั้ง LIFF ID) — ใส่ array ได้ถ้าจองทั้งบ้านหลายตัว */
export async function getGroomInfoUrl(bookingIds: string | string[]): Promise<string> {
  const liffId = (await getLineCredentials())?.liffId;
  return liffId ? buildGroomInfoUrl(liffId, bookingIds) : "";
}

/** ขอให้ลูกค้าถ่ายรูปน้องปัจจุบันส่งมาด้วย — ต่อท้ายทุกการ์ดขอประวัติ ไม่ว่า config จะเป็นแบบไหน */
const GROOM_PHOTO_REQUEST =
  "และรบกวนถ่ายรูปน้องในปัจจุบันส่งให้ทางร้านด้วยนะคะ 📸🐱 เพื่อให้เราเตรียมดูแลน้องได้อย่างเหมาะสมค่ะ";

/** เนื้อความการ์ดสอบถามประวัติน้องก่อนอาบน้ำ */
export function buildGroomInfoBody(
  b: Pick<StoredBooking, "catName">,
  cfg: SiteConfig
): string {
  const intro = renderTemplate(cfg.messages.groomInfoIntro ?? DEFAULT_MESSAGES.groomInfoIntro, {
    shop: cfg.business.name,
    cat: politeCat(b.catName),
  });
  return `${intro}\n\n${GROOM_PHOTO_REQUEST}`;
}

/**
 * เนื้อความการ์ด "แก้ไข/เพิ่มเติมประวัติ" — สำหรับตัวที่เคยกรอกประวัติไว้แล้ว
 * คนละโทนกับตอนขอครั้งแรก (buildGroomInfoBody) เพื่อไม่ให้ดูเหมือนร้านลืม/ถามซ้ำ
 * ลิงก์เดียวกัน หน้ากรอกจะดึงคำตอบเดิมมาเติมให้อยู่แล้ว แก้ตรงไหนก็ได้
 */
export function buildGroomInfoEditBody(
  b: Pick<StoredBooking, "catName">,
  cfg: SiteConfig
): string {
  return `${cfg.business.name} เคยได้รับประวัติของ${politeCat(b.catName)}ไว้แล้วค่ะ 🧡 ` +
    `ถ้ามีอะไรเปลี่ยนแปลงหรืออยากเพิ่มเติม กดแก้ไขได้เลยนะคะ`;
}

/** เนื้อความการ์ดเลือกเวลารับน้อง (เช็คเอาท์) */
export function buildCheckoutBodyText(
  b: Pick<StoredBooking, "catName" | "checkout">,
  cfg: SiteConfig
): string {
  return renderTemplate(cfg.messages.checkoutReminder, {
    shop: cfg.business.name,
    cat: politeCat(b.catName),
    checkout: b.checkout || "",
  });
}

/** ข้อความเตือนยอดคงเหลือ/มัดจำ — คืน null ถ้าไม่มียอดต้องโอน */
export function buildDepositReminderText(
  b: Pick<StoredBooking, "catName" | "checkin" | "date">,
  inv: InvoiceRecord,
  cfg: SiteConfig
): string | null {
  const deposit = inv.deposit || 0;
  const remaining = inv.total - deposit;
  if (remaining <= 0) return null;
  return renderTemplate(cfg.messages.depositReminder, {
    shop: cfg.business.name,
    cat: politeCat(b.catName),
    checkin: b.checkin || b.date || "",
    deposit: deposit.toLocaleString(),
    remaining: remaining.toLocaleString(),
    bank: cfg.payment.bankName,
    accountNumber: cfg.payment.accountNumber,
    accountName: cfg.payment.accountName,
  });
}

/** ข้อความชวนกดยอมรับข้อตกลง (แนบลิงก์) — คืน "" ถ้ายังไม่มีลิงก์ */
export function buildConsentInviteText(
  b: Pick<StoredBooking, "catName">,
  cfg: SiteConfig,
  url: string
): string {
  if (!url) return "";
  const invite = renderTemplate(cfg.messages.consentInvite, {
    shop: cfg.business.name,
    cat: politeCat(b.catName),
    url,
  });
  return `${invite}\n\n${DEEMED_CONSENT_NOTICE}`;
}

/** ห้องที่ทรายแมวฟรีมีเงื่อนไขจำนวนคืนขั้นต่ำ — ห้องอื่นๆ แถมทรายให้ตลอดการเข้าพักไม่ว่าจะกี่คืน */
const ROOMS_WITH_LITTER_MIN_NIGHTS = ["mini-meow", "mid-cozy"];

/** ข้อความเตือน "เตรียมทรายมาเอง" ถ้าเข้าพักไม่ถึงเกณฑ์แถมทรายฟรี (คืน "" ถ้าถึงเกณฑ์ หรือห้องแถมทรายฟรีอยู่แล้ว) */
export function litterNoteFor(
  b: { checkin?: string; checkout?: string; date?: string; room?: string },
  cfg: SiteConfig
): string {
  if (!b.room || !ROOMS_WITH_LITTER_MIN_NIGHTS.includes(b.room)) return "";
  const min = cfg.automation?.freeLitterMinNights ?? 3;
  const nights =
    b.checkin && b.checkout
      ? Math.max(
          1,
          Math.round(
            (new Date(`${b.checkout}T12:00:00`).getTime() -
              new Date(`${b.checkin}T12:00:00`).getTime()) /
              86400000
          )
        )
      : 1;
  if (nights >= min) return "";
  return renderTemplate(
    cfg.messages?.prestayLitterNote ?? DEFAULT_MESSAGES.prestayLitterNote,
    { min }
  );
}

/** เนื้อความเตรียมตัวก่อนเข้าพัก (ไม่แนบลิงก์ — ใช้กับการ์ดที่มีปุ่มยอมรับเงื่อนไข) */
export function buildPrestayBodyText(
  b: Pick<StoredBooking, "catName" | "checkin" | "checkout" | "room" | "date">,
  cfg: SiteConfig
): string {
  return renderTemplate(cfg.messages.prestayReminder, {
    shop: cfg.business.name,
    cat: politeCat(b.catName),
    checkin: b.checkin || b.date || "",
    checkout: b.checkout ? `→ ${b.checkout}` : "",
    room: b.room ? `🏠 ห้อง: ${b.room}` : "",
    litterNote: litterNoteFor(b, cfg),
    consentUrl: "",
  });
}

/** ข้อมูลการ์ดแจ้งเข้าพัก (แบบจัดรูปแบบสวยงาม) — ป้อนให้ buildPrestayFlex */
export function buildPrestayFlexData(
  b: Pick<StoredBooking, "catName" | "checkin" | "checkout" | "room" | "date">,
  cfg: SiteConfig
) {
  const inDate = b.checkin || b.date || "";
  const dateText = inDate
    ? `${formatThaiDateShort(inDate)}${
        b.checkout ? ` → ${formatThaiDateShort(b.checkout)}` : ""
      }`
    : "";
  const msg = cfg.messages;
  return {
    businessName: cfg.business.name,
    catName: b.catName,
    dateText,
    room: b.room,
    intro: renderTemplate(msg.prestayIntro ?? DEFAULT_MESSAGES.prestayIntro, {
      shop: cfg.business.name,
      cat: politeCat(b.catName),
    }),
    prepIntro: msg.prestayPrepIntro ?? DEFAULT_MESSAGES.prestayPrepIntro,
    prepItems: (msg.prestayPrepItems ?? DEFAULT_MESSAGES.prestayPrepItems).filter(
      Boolean
    ),
    careNote: renderTemplate(msg.prestayCareNote ?? DEFAULT_MESSAGES.prestayCareNote, {
      cat: politeCat(b.catName),
    }),
    litterNote: litterNoteFor(b, cfg) || undefined,
  };
}

/** ข้อความแจ้งรายละเอียดก่อนเข้าพัก (+ แนบลิงก์ยอมรับข้อตกลงถ้ามี) */
export function buildPrestayReminderText(
  b: Pick<StoredBooking, "catName" | "checkin" | "checkout" | "room" | "date">,
  cfg: SiteConfig,
  consentUrl: string
): string {
  let text = renderTemplate(cfg.messages.prestayReminder, {
    shop: cfg.business.name,
    cat: politeCat(b.catName),
    checkin: b.checkin || b.date || "",
    checkout: b.checkout ? `→ ${b.checkout}` : "",
    room: b.room ? `🏠 ห้อง: ${b.room}` : "",
    consentUrl,
  });
  const invite = buildConsentInviteText(b, cfg, consentUrl);
  if (invite && consentUrl && !text.includes(consentUrl)) {
    text += `\n\n${invite}`;
  }
  return text;
}
