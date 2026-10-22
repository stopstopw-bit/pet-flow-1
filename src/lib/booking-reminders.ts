import { getLineCredentials } from "./line-config";
import { politeCat } from "./line";
import { buildConsentUrl, buildBookingTimeUrl, buildGroomInfoUrl, buildPetDocsUrl } from "./liff-urls";
import { renderTemplate, DEFAULT_MESSAGES, DEEMED_CONSENT_NOTICE } from "./messages";
import { formatThaiDateShort } from "./format-thai-date";
import type { StoredBooking } from "./bookings-store";
import type { InvoiceRecord } from "./invoices-store";
import type { SiteConfig } from "./config-types";
import { autoMuted } from "./auto-messages";

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

/** ลิงก์หน้าแนบสมุดวัคซีน / บัตรประชาชน ของนัดนั้น (คืน "" ถ้ายังไม่ได้ตั้ง LIFF ID) */
export async function getPetDocsUrl(bookingIds: string | string[], need: "vaccine" | "idcard"): Promise<string> {
  const liffId = (await getLineCredentials())?.liffId;
  return liffId ? buildPetDocsUrl(liffId, bookingIds, need) : "";
}

/** ลิงก์หน้าเลือกเวลาส่ง/รับน้อง (คืน "" ถ้ายังไม่ได้ตั้ง LIFF ID) */
export async function getBookingTimeUrl(
  bookingId: string,
  type: "checkin" | "checkout"
): Promise<string> {
  const liffId = (await getLineCredentials())?.liffId;
  return liffId ? buildBookingTimeUrl(liffId, bookingId, type) : "";
}

/**
 * ข้อความที่ร้านเขียนไว้ว่า "พรุ่งนี้" แต่การ์ดถูกส่งก่อนหลายวัน (เช่น แนบไปกับชุดก่อนเข้าพัก 3 วัน)
 * → เปลี่ยนเป็นจำนวนวันจริง ณ ตอนส่ง ("อีก 3 วัน" / "วันนี้") ให้ลูกค้าไม่สับสน
 * ส่งก่อน 1 วันพอดี = ไม่แตะข้อความเลย
 */
export function fixTomorrowWord(text: string, date: string, now = new Date()): string {
  if (!date || !text.includes("พรุ่งนี้")) return text;
  const todayTh = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  const days = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayTh}T00:00:00Z`)) / 86400_000
  );
  if (!Number.isFinite(days) || days === 1 || days < 0) return text;
  return text.replaceAll("พรุ่งนี้", days === 0 ? "วันนี้" : `อีก ${days} วัน`);
}

/** เนื้อความการ์ดเลือกเวลาเข้าพัก (เช็คอิน) */
export function buildCheckinBodyText(
  b: Pick<StoredBooking, "catName" | "checkin" | "date" | "room">,
  cfg: SiteConfig
): string {
  const checkin = b.checkin || b.date || "";
  return fixTomorrowWord(
    renderTemplate(cfg.messages.checkinReminder, {
      shop: cfg.business.name,
      cat: politeCat(b.catName),
      checkin,
      room: b.room ? `🏠 ห้อง: ${b.room}` : "",
      litterNote: "",
    }),
    checkin
  );
}

/** วันที่ (YYYY-MM-DD) บวก/ลบ n วัน */
function shiftDate(dateStr: string, n: number) {
  const dt = new Date(`${dateStr}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/**
 * การ์ดเลือกเวลาเข้าพักของบ้านนี้ ให้ cron ตัวไหนส่ง — ส่งได้ตัวเดียวเท่านั้น
 *
 * มี 2 ทางที่ส่งการ์ดนี้อัตโนมัติ: แนบท้าย "ชุดก่อนเข้าพัก" (cron/reminders 12:00)
 * กับ "เตือนเช็คอิน" (cron/checkin-checkout ตามรอบที่ร้านตั้ง) เมื่อก่อนต่างคนต่างส่ง
 * ถ้าตั้งจำนวนวันตรงกัน ลูกค้าจะได้การ์ดเดียวกัน 2 ใบในวันเดียว (เปลือง LINE)
 * ตอนนี้ให้ตัวที่ถึงคิวก่อนเป็นคนส่ง — นัดที่จองหลังรอบนั้นผ่านไปแล้วค่อยให้อีกตัวส่งแทน
 * และไม่ส่งเลยถ้าลูกค้าเลือกเวลาไว้ครบทุกตัวแล้ว (arrivalTime)
 */
export function checkinPickerSender(
  group: Pick<StoredBooking, "checkin" | "date" | "arrivalTime" | "autoOff" | "createdAt">[],
  cfg: SiteConfig
): "prestay" | "checkin" | null {
  if (group.length === 0 || group.every((x) => x.arrivalTime)) return null;
  const auto = cfg.automation;
  const checkin = group[0].checkin || group[0].date || "";
  if (!checkin) return null;
  const muted = (topic: string) => group.every((x) => autoMuted(x, topic));
  const prestayOn = auto?.prestayReminderEnabled !== false && !muted("prestay");
  const checkinOn = auto?.checkinReminderEnabled !== false && !muted("checkin");
  // เวลาที่ cron แต่ละตัวยิง (เวลาไทย) — ชุดก่อนเข้าพักผูกกับรอบเที่ยงของ cron/reminders
  const prestayAt = Date.parse(
    `${shiftDate(checkin, -(auto?.prestayReminderDays ?? 3))}T12:00:00+07:00`
  );
  const checkinAt = Date.parse(
    `${shiftDate(checkin, -(auto?.checkinReminderDays ?? 1))}T${auto?.checkinReminderTime || "12:00"}:00+07:00`
  );
  const created = Math.min(...group.map((x) => Date.parse(x.createdAt) || 0));
  // ตัวที่ถึงคิวก่อนเป็นคนส่ง (ถึงพร้อมกัน ให้ชุดก่อนเข้าพักส่ง) แต่ต้องเป็นนัดที่มีอยู่แล้วตอนรอบนั้นยิง
  if (prestayOn && prestayAt <= checkinAt && created < prestayAt) return "prestay";
  if (checkinOn && created < checkinAt) return "checkin";
  if (prestayOn && created < prestayAt) return "prestay";
  return null;
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
  return fixTomorrowWord(
    renderTemplate(cfg.messages.checkoutReminder, {
      shop: cfg.business.name,
      cat: politeCat(b.catName),
      checkout: b.checkout || "",
    }),
    b.checkout || ""
  );
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
