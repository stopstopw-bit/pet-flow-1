import { roomSummary } from "./room-segments";
import { getLineCredentials } from "./line-config";
import { politeCat, buildDepositReminderFlex } from "./line";
import { DEPOSIT_REMINDER_DEFAULTS } from "./line-card-defaults";
import { buildConsentUrl, buildBookingTimeUrl, buildGroomInfoUrl, buildPetDocsUrl } from "./liff-urls";
import { renderTemplate, DEFAULT_MESSAGES, DEEMED_CONSENT_NOTICE } from "./messages";
import { formatThaiDateShort } from "./format-thai-date";
import type { StoredBooking } from "./bookings-store";
import type { InvoiceRecord } from "./invoices-store";
import type { SiteConfig } from "./config-types";
import { autoMuted } from "./auto-messages";
import { isFeatureOn } from "./features";
import { petWords, usesLitter } from "./pet-kind";
import { stayForGroom } from "./booking-group";
import { groomProgramName, resolveGroomPrograms } from "./grooming-prices";

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
  b: Pick<StoredBooking, "catName" | "checkin" | "checkout" | "date" | "room" | "roomSegments">,
  cfg: SiteConfig
): string {
  const checkin = b.checkin || b.date || "";
  return fixTomorrowWord(
    renderTemplate(cfg.messages.checkinReminder, {
      shop: cfg.business.name,
      cat: politeCat(b.catName),
      checkin,
      room: b.room ? `🏠 ห้อง: ${roomText(b, cfg)}` : "",
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
  // ร้านปิดการ์ดเลือกเวลาในตั้งค่า › เปิด/ปิดฟีเจอร์
  if (!isFeatureOn(cfg, "checkinTime")) return null;
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
export async function getGroomInfoUrl(
  bookingIds: string | string[],
  kind?: "stay" | "groom"
): Promise<string> {
  const liffId = (await getLineCredentials())?.liffId;
  return liffId ? buildGroomInfoUrl(liffId, bookingIds, kind) : "";
}

/** ขอให้ลูกค้าถ่ายรูปน้องปัจจุบันส่งมาด้วย — ต่อท้ายทุกการ์ดขอประวัติ ไม่ว่า config จะเป็นแบบไหน */
const GROOM_PHOTO_REQUEST =
  "และรบกวนถ่ายรูปน้องในปัจจุบันส่งให้ทางร้านด้วยนะคะ 📸🐾 เพื่อให้เราเตรียมดูแลน้องได้อย่างเหมาะสมค่ะ";

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

/** เนื้อความการ์ดขอข้อมูลน้องก่อนเข้าพัก — ฟอร์มเดียวกับก่อนอาบน้ำ แต่ไม่พูดถึงวันอาบน้ำ */
export function buildStayInfoBody(b: Pick<StoredBooking, "catName">, cfg: SiteConfig): string {
  return (
    `เพื่อเตรียมรับ${politeCat(b.catName)}เข้าพักกับ ${cfg.business.name} 🏠🐾\n\n` +
    `รบกวนแจ้งข้อมูลน้องสั้นๆ (นิสัย สุขภาพ การดูแล — กดเลือกเอา ไม่ต้องพิมพ์เยอะ) ` +
    `เพื่อให้เราดูแลน้องได้ถูกวิธีตลอดการเข้าพักนะคะ 🧡\n\n${GROOM_PHOTO_REQUEST}`
  );
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

/** จำนวนวันจากวันนี้ (เวลาไทย) ถึงวันที่ yyyy-mm-dd */
export function daysUntil(date: string, now = new Date()): number {
  const today = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  return Math.round(
    (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000
  );
}

/**
 * การ์ดแจ้งยอดคงเหลือก่อนเข้าพัก (เมื่อก่อนเป็นข้อความตัวหนังสือ) — คืน null ถ้าไม่มียอดต้องโอน
 * ใช้ทั้ง cron และปุ่มกดส่งเอง · ข้อความแก้ได้ที่ /admin/cards › แจ้งยอดก่อนเข้าพัก
 */
export function buildDepositReminderCard(
  b: Pick<StoredBooking, "catName" | "checkin" | "checkout" | "date" | "service">,
  inv: InvoiceRecord,
  cfg: SiteConfig,
  now = new Date()
): object | null {
  const deposit = inv.deposit || 0;
  const remaining = inv.total - deposit;
  if (remaining <= 0) return null;
  const style = cfg.cards?.depositReminder;
  const checkin = b.checkin || b.date || "";
  const days = checkin ? Math.max(0, daysUntil(checkin, now)) : 0;
  let body = renderTemplate(style?.texts?.body?.trim() || DEPOSIT_REMINDER_DEFAULTS.body, {
    shop: cfg.business.name,
    cat: politeCat(b.catName),
    days,
    checkin: checkin ? formatThaiDateShort(checkin) : "",
    deposit: deposit.toLocaleString(),
    remaining: remaining.toLocaleString(),
  });
  // ส่งวันเข้าพักพอดี/ส่งเองช้ากว่ากำหนด — "อีก 0 วัน" อ่านแปลก
  if (days === 0) body = body.replace(/อีก\s*0\s*วันถึง/g, "วันนี้เป็น");
  return buildDepositReminderFlex(
    {
      body,
      catName: String(b.catName),
      scheduleText: bookingScheduleText(b),
      deposit,
      remaining,
      bankName: cfg.payment.bankName,
      accountNumber: cfg.payment.accountNumber,
      accountName: cfg.payment.accountName,
    },
    style
  );
}

/**
 * ยอดคงเหลือส่งรอบไหน — ส่งรอบเดียวพอ ไม่งั้นลูกค้าได้บัญชีโอนซ้ำ
 * "prestay" = อยู่ในการ์ดเตรียมตัวก่อนเข้าพักใบเดียวกัน (ค่าตั้งต้น — ลูกค้าได้ข้อความน้อยที่สุด)
 * "deposit" = แยกส่งรอบของมันเอง เฉพาะเมื่อปิดชุดก่อนเข้าพัก หรือตั้งให้เตือนยอดหลังชุดก่อนเข้าพัก
 */
export function balanceReminderSender(
  group: Pick<StoredBooking, "autoOff">[],
  cfg: SiteConfig
): "deposit" | "prestay" | null {
  if (group.length === 0) return null;
  const auto = cfg.automation;
  const muted = (topic: string) => group.every((x) => autoMuted(x, topic));
  const depositOn = auto?.depositReminderEnabled !== false && !muted("deposit");
  const prestayOn = auto?.prestayReminderEnabled !== false && !muted("prestay");
  const depositDays = auto?.depositReminderDays ?? 7;
  const prestayDays = auto?.prestayReminderDays ?? 3;
  if (prestayOn && (!depositOn || depositDays >= prestayDays)) return "prestay";
  if (depositOn) return "deposit";
  return null;
}

/** ข้อความชวนกดยอมรับข้อตกลง (แนบลิงก์) — คืน "" ถ้ายังไม่มีลิงก์ */
/** ชื่อห้องของการเข้าพักนี้ — ย้ายห้องกลางทาง = "Catflix 25–28 ต.ค. → Mid Cozy 28–31 ต.ค." */
export function roomText(
  b: Pick<StoredBooking, "room" | "checkin" | "checkout" | "roomSegments">,
  cfg: Pick<SiteConfig, "rooms">
): string {
  return b.room ? roomSummary(b, (id) => (id ? roomName(id, cfg) : "-")) : "";
}

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

/** ชื่อห้องที่ลูกค้าเห็น (เช่น "ห้องหมาเล็ก (Small)") — ในนัดเก็บเป็นรหัสห้อง เช่น mini-meow */
export function roomName(id: string, cfg: Pick<SiteConfig, "rooms">): string {
  return cfg.rooms?.find((r) => r.id === id)?.name || id;
}

/** ห้องที่ทรายแมวฟรีมีเงื่อนไขจำนวนคืนขั้นต่ำ — ห้องอื่นๆ แถมทรายให้ตลอดการเข้าพักไม่ว่าจะกี่คืน */
const ROOMS_WITH_LITTER_MIN_NIGHTS = ["mini-meow", "mid-cozy"];

/** ข้อความเตือน "เตรียมทรายมาเอง" ถ้าเข้าพักไม่ถึงเกณฑ์แถมทรายฟรี (คืน "" ถ้าถึงเกณฑ์ หรือห้องแถมทรายฟรีอยู่แล้ว) */
export function litterNoteFor(
  b: { checkin?: string; checkout?: string; date?: string; room?: string },
  cfg: SiteConfig
): string {
  if (!usesLitter(cfg)) return "";
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
  b: Pick<StoredBooking, "catName" | "checkin" | "checkout" | "room" | "date" | "roomSegments">,
  cfg: SiteConfig
): string {
  return renderTemplate(cfg.messages.prestayReminder, {
    shop: cfg.business.name,
    cat: politeCat(b.catName),
    checkin: b.checkin || b.date || "",
    checkout: b.checkout ? `→ ${b.checkout}` : "",
    room: b.room ? `🏠 ห้อง: ${roomText(b, cfg)}` : "",
    litterNote: litterNoteFor(b, cfg),
    consentUrl: "",
  });
}

/** ข้อมูลการ์ดแจ้งเข้าพัก (แบบจัดรูปแบบสวยงาม) — ป้อนให้ buildPrestayFlex */
export function buildPrestayFlexData(
  b: Pick<StoredBooking, "catName" | "checkin" | "checkout" | "room" | "date" | "roomSegments">,
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
    petEmoji: petWords(cfg).emoji,
    dateText,
    room: b.room ? roomText(b, cfg) : undefined,
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

/**
 * นัดอาบน้ำก่อนกลับของการเข้าพักนี้ (เช่น "2 พ.ย. 2026 · 09:30 · อาบน้ำ – เป่าขน") — ใส่ในการ์ดเตรียมตัว
 * ลูกค้าจะได้รู้ตั้งแต่ก่อนเข้าพักว่ามีอาบน้ำด้วย ไม่ใช่มารู้ตอนกรอกฟอร์ม · ไม่มี = ""
 */
export function inStayBathText(
  stayIds: string[],
  all: StoredBooking[],
  cfg: Pick<SiteConfig, "groomPricePrograms">
): string {
  const programs = resolveGroomPrograms(cfg.groomPricePrograms);
  const seen = new Set<string>();
  for (const g of all) {
    const stay = stayForGroom(g, all);
    if (!stay || !stayIds.includes(stay.id)) continue;
    const program = g.groomProgram ? groomProgramName(g.groomProgram, programs) : "";
    seen.add(
      [formatThaiDateShort(String(g.date).slice(0, 10)), g.time, program].filter(Boolean).join(" · ")
    );
  }
  return Array.from(seen).join("\n");
}

/** ข้อความแจ้งรายละเอียดก่อนเข้าพัก (+ แนบลิงก์ยอมรับข้อตกลงถ้ามี) */
export function buildPrestayReminderText(
  b: Pick<StoredBooking, "catName" | "checkin" | "checkout" | "room" | "date" | "roomSegments">,
  cfg: SiteConfig,
  consentUrl: string
): string {
  let text = renderTemplate(cfg.messages.prestayReminder, {
    shop: cfg.business.name,
    cat: politeCat(b.catName),
    checkin: b.checkin || b.date || "",
    checkout: b.checkout ? `→ ${b.checkout}` : "",
    room: b.room ? `🏠 ห้อง: ${roomText(b, cfg)}` : "",
    consentUrl,
  });
  const invite = buildConsentInviteText(b, cfg, consentUrl);
  if (invite && consentUrl && !text.includes(consentUrl)) {
    text += `\n\n${invite}`;
  }
  return text;
}
