/**
 * LINE Messaging API — ส่งการ์ดเตือนลูกค้า
 * ตั้งค่า: LINE_CHANNEL_TOKEN
 */

import { formatBookingWhen, formatThaiDate } from "./format-thai-date";
import { hasTransport, transportLabel, type BookingTransport } from "./transport";
import { getLineCredentials } from "./line-config";
import { DEEMED_CONSENT_NOTICE } from "./messages";
import type { CardStyleConfig } from "./config-types";
import { MISS_YOU_DEFAULT_TITLE } from "./miss-you-card";
import { DOC_REQUEST_DEFAULTS, INTAKE_CARD_DEFAULTS } from "./line-card-defaults";

export { DOC_REQUEST_DEFAULTS, INTAKE_CARD_DEFAULTS };

// สีแบรนด์ของการ์ด LINE — เปลี่ยนจากเขียวเดิม (#5A8F5A/#4A7348) มาเป็นโทน CI ของร้าน
// (plum หัวการ์ด + rose ปุ่ม) ให้เข้ากับหน้าแอป · ร้านที่อยากได้สีอื่นตั้ง headerColor/buttonColor
// รายใบได้ในหน้า "ปรับแต่งการ์ด LINE"
const BRAND_HEADER = "#6e2f48"; // แถบหัวการ์ด (ตัวอักษรขาวอ่านชัด)
const BRAND_ACTION = "#bd3a6a"; // ปุ่ม/ตัวเลขเด่น

async function lineChannelToken() {
  const creds = await getLineCredentials();
  if (!creds?.channelToken) {
    throw new Error(
      "ยังไม่ได้ตั้ง LINE — ไป Admin → ติดตั้ง → วาง Channel Access Token"
    );
  }
  return creds.channelToken;
}

/**
 * ใส่ "คุณ" นำหน้าชื่อลูกค้าเสมอตอนส่งข้อความหาลูกค้า — สุภาพกว่าเรียกชื่อเปล่าๆ
 * ไม่เขียนทับข้อมูลในระบบ แค่ตอนแสดงผลในการ์ด
 * กันซ้ำถ้าร้านพิมพ์ "คุณ" มาเองแล้ว และไม่ใส่ให้คำนำหน้าอื่น (คุณหมอ/ครู/พี่ ฯลฯ)
 */
const NAME_PREFIXES = ["คุณ", "ครู", "หมอ", "พี่", "น้อง", "ป้า", "ลุง", "น้า", "อา", "แม่", "พ่อ"];
export function politeName(name?: string): string {
  const n = (name || "").trim();
  if (!n) return "";
  return NAME_PREFIXES.some((p) => n.startsWith(p)) ? n : `คุณ${n}`;
}

/**
 * ใส่ "น้อง" นำหน้าชื่อแมวตอนส่งข้อความหาลูกค้า — กันซ้ำถ้าร้านพิมพ์มาเองแล้ว
 * ชื่อที่ขึ้นต้นด้วยคำเรียกอื่น (พี่/เจ้า) ปล่อยไว้ตามเดิม
 */
const CAT_PREFIXES = ["น้อง", "พี่", "เจ้า", "คุณ"];
export function politeCat(name?: string): string {
  const n = (name || "").trim();
  if (!n) return "";
  return CAT_PREFIXES.some((p) => n.startsWith(p)) ? n : `น้อง${n}`;
}

function flexDetailRow(icon: string, label: string, value: string) {
  return {
    type: "box" as const,
    layout: "horizontal" as const,
    spacing: "md" as const,
    margin: "lg" as const,
    contents: [
      {
        type: "text" as const,
        text: icon,
        size: "sm" as const,
        flex: 0,
      },
      {
        type: "box" as const,
        layout: "vertical" as const,
        flex: 5,
        contents: [
          {
            type: "text" as const,
            text: label,
            size: "xxs" as const,
            color: "#9B8B7E",
          },
          {
            type: "text" as const,
            text: value,
            size: "sm" as const,
            color: "#4E3E32",
            wrap: true,
            margin: "xs" as const,
          },
        ],
      },
    ],
  };
}

/**
 * LINE userId จริงต้องขึ้นต้น U ตามด้วยเลขฐาน 16 อีก 32 ตัว (เช่น U4af4980629...)
 * ถ้า LIFF ยังไม่ได้ตั้งค่า ลูกค้าจะถูกสวมบทบาทเป็น "dev-user" (ดู LiffProvider.tsx) —
 * เช็คตรงนี้ก่อนยิง LINE จะได้ error ที่บอกสาเหตุจริง แทนข้อความดิบจาก LINE API
 */
function isRealLineUserId(id: string): boolean {
  return /^U[0-9a-f]{32}$/i.test(id);
}

const FAKE_LINE_USER_ID_HINT =
  "ลูกค้ารายนี้ยังไม่ได้เชื่อมบัญชี LINE จริง (สร้างจากโหมดทดสอบตอน LIFF ยังไม่ตั้งค่า) — " +
  "ไปที่ Admin → ติดตั้ง → LIFF แล้ววาง LIFF ID ให้ครบก่อน ลูกค้าที่เข้ามาใหม่หลังจากนั้นจะผูก LINE จริง";

export async function pushLineMessage(to: string, messages: object[]) {
  if (!isRealLineUserId(to)) {
    throw new Error(FAKE_LINE_USER_ID_HINT);
  }
  const token = await lineChannelToken();

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to, messages }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let hint = errText;
    try {
      const parsed = JSON.parse(errText) as { message?: string };
      if (parsed.message?.includes("Authentication")) {
        hint = "LINE Token ผิด — ไป Admin → ติดตั้ง → LINE แล้ววาง Token ใหม่";
      } else if (parsed.message) {
        hint = parsed.message;
      }
    } catch {
      /* keep raw */
    }
    throw new Error(hint);
  }
  return { ok: true };
}

/** ส่งหลายคนพร้อมกัน (สูงสุด 500 ต่อครั้ง)
 * กรอง lineUserId ปลอม (เช่น "dev-user") ออกก่อน — ไม่งั้น ID เดียวในชุด 500 คน
 * จะทำให้ทั้งชุดถูก LINE ปฏิเสธ ลูกค้าจริงอีก 499 คนพลอยไม่ได้รับข้อความไปด้วย */
export async function multicastLineMessage(to: string[], messages: object[]) {
  const token = await lineChannelToken();
  const real = to.filter(isRealLineUserId);
  const skipped = to.length - real.length;
  if (real.length === 0) return { ok: true, sent: 0, skipped };

  const chunks: string[][] = [];
  for (let i = 0; i < real.length; i += 500) {
    chunks.push(real.slice(i, i + 500));
  }

  let sent = 0;
  for (const batch of chunks) {
    const res = await fetch("https://api.line.me/v2/bot/message/multicast", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to: batch, messages }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LINE multicast: ${errText}`);
    }
    sent += batch.length;
  }
  return { ok: true, sent, skipped };
}

export function buildAppointmentConfirmFlex(booking: {
  id: string;
  catName: string;
  customerName: string;
  service: string;
  date?: string;
  time?: string;
  checkin?: string;
  checkout?: string;
  room?: string;
  notes?: string;
  /** บริการรับ-ส่ง — โชว์แถวรับ-ส่ง + ปุ่มให้ลูกค้าส่งจุดรับ-ส่ง (ลิงก์ Google Maps) */
  transport?: BookingTransport;
  transportUrl?: string;
  confirmUrl: string;
  /** แผนที่/ที่อยู่ของร้าน — มาจาก config ไม่ใช่ค่าตายตัว ไม่มีก็ซ่อนแถวนั้นไป */
  mapsUrl?: string;
  location?: string;
  businessName?: string;
  /** ชื่อโปรแกรมอาบน้ำที่เลือกไว้ตอนจอง (ถ้ามี) — เฉพาะนัดอาบน้ำ */
  program?: string;
}, style?: CardStyleConfig) {
  const st = style || {};
  const show = (k: string) => st.show?.[k] !== false;
  const isRoom = booking.service === "room";
  const serviceTitle = isRoom
    ? `${st.texts?.roomServicePrefix || "ห้องพัก"} · ${politeCat(booking.catName)}`
    : `${st.texts?.groomServicePrefix || "อาบน้ำ & กรูมมิ่ง"} · ${politeCat(booking.catName)}${booking.program ? ` (${booking.program})` : ""}`;
  const dateText = isRoom
    ? formatBookingWhen({
        service: booking.service,
        checkin: booking.checkin || booking.date,
        checkout: booking.checkout,
      })
    : formatThaiDate(booking.date || booking.checkin || "");
  const timeText = isRoom
    ? booking.room
      ? `ห้อง ${booking.room}`
      : "เช็คอินตามเวลาที่ยืนยันในแอป"
    : booking.time
      ? `เวลา ${booking.time}`
      : "รอเลือกเวลาในแอป";

  const noteText =
    booking.notes?.trim() ||
    st.texts?.notesFallback ||
    "หากมีรายละเอียดอื่นๆ เพิ่มเติม สามารถแจ้งในแชท LINE ได้เลยนะคะ";

  const altText = `ยืนยันนัด ${politeCat(booking.catName)} — ${dateText}`;

  return {
    type: "flex",
    altText,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: st.headerColor || BRAND_HEADER,
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: st.texts?.header || "📅 กำหนดการนัด",
            color: st.headerTextColor || "#FFFFFF",
            weight: "bold",
            size: "sm",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: serviceTitle,
            weight: "bold",
            size: st.titleSize || "lg",
            color: st.accentColor || "#5C4033",
            wrap: true,
          },
          {
            type: "text",
            text: `${st.texts?.subtitle || "แจ้งกำหนดการนัด 🗓️"}\n${politeName(booking.customerName)}`,
            size: "xs",
            color: "#A2907E",
            margin: "md",
            wrap: true,
          },
          flexDetailRow("🗓️", st.texts?.dateLabel || "วันที่", dateText),
          flexDetailRow("⏰", st.texts?.timeLabel || "เวลา / รายละเอียด", timeText),
          ...(show("location") && booking.location
            ? [flexDetailRow("📍", st.texts?.locationLabel || "สถานที่", booking.location)]
            : []),
          ...(show("notes")
            ? [flexDetailRow("📝", st.texts?.notesLabel || "หมายเหตุ", noteText)]
            : []),
          ...(hasTransport(booking.transport)
            ? [
                flexDetailRow(
                  "🚗",
                  st.texts?.transportLabel || "รับ-ส่งน้อง",
                  `${transportLabel(booking.transport)}\n${
                    booking.transport.address ||
                    (booking.transport.mapUrl
                      ? "ได้รับแผนที่จุดรับ-ส่งแล้ว"
                      : "ยังไม่ได้ส่งจุดรับ-ส่ง กดปุ่มด้านล่างได้เลยค่ะ")
                  }`
                ),
              ]
            : []),
          // เฉพาะนัดอาบน้ำ — เตือนเรื่องขนมกับตะกร้า ให้เห็นเด่นแยกจากหมายเหตุทั่วไป
          ...(!isRoom && show("groomPrep")
            ? [
                {
                  type: "box" as const,
                  layout: "vertical" as const,
                  margin: "lg" as const,
                  paddingAll: "12px",
                  backgroundColor: "#FBEEE0",
                  cornerRadius: "10px",
                  contents: [
                    {
                      type: "text" as const,
                      text:
                        st.texts?.groomPrepNote ||
                        "🍬 อย่าลืมพกขนม/แมวเลียมาด้วยอย่างน้อย 1-2 ซองนะคะ\n🧺 และให้น้องอยู่ในตะกร้า/กระเป๋าทุกครั้งที่มาใช้บริการด้วยค่ะ",
                      size: "xs" as const,
                      color: "#B4553B",
                      weight: "bold" as const,
                      wrap: true,
                    },
                  ],
                },
              ]
            : []),
          // เฉพาะเข้าพักโรงแรม — เตือนเรื่องตะกร้า/กระเป๋าเช่นกัน (คนละข้อความกับนัดอาบน้ำ ไม่พูดเรื่องขนม)
          ...(isRoom && show("roomPrep")
            ? [
                {
                  type: "box" as const,
                  layout: "vertical" as const,
                  margin: "lg" as const,
                  paddingAll: "12px",
                  backgroundColor: "#FBEEE0",
                  cornerRadius: "10px",
                  contents: [
                    {
                      type: "text" as const,
                      text:
                        st.texts?.roomPrepNote ||
                        "🧺 รบกวนพาน้องใส่ตะกร้า/กระเป๋าทุกครั้งที่มาใช้บริการด้วยนะคะ",
                      size: "xs" as const,
                      color: "#B4553B",
                      weight: "bold" as const,
                      wrap: true,
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: st.buttonColor || BRAND_ACTION,
            height: "sm",
            action: {
              type: "uri",
              label: st.texts?.confirmButton || "🐾 ยืนยันนัด",
              uri: booking.confirmUrl,
            },
          },
          ...(booking.transportUrl
            ? [
                {
                  type: "button",
                  style: "secondary",
                  height: "sm",
                  action: {
                    type: "uri",
                    label:
                      booking.transport?.mapUrl || booking.transport?.address
                        ? "📍 แก้จุดรับ-ส่ง"
                        : "📍 ส่งจุดรับ-ส่ง (Google Maps)",
                    uri: booking.transportUrl,
                  },
                },
              ]
            : []),
          ...(show("map") && booking.mapsUrl
            ? [
                {
                  type: "button",
                  style: "link",
                  height: "sm",
                  action: {
                    type: "uri",
                    label: st.texts?.mapButton || "🗺️ ดูแผนที่ / เส้นทาง",
                    uri: booking.mapsUrl,
                  },
                },
              ]
            : []),
        ],
      },
    },
  };
}

/** กล่องข้อความ "ไม่ตอบ = ยอมรับข้อตกลง" ใช้ในการ์ดที่ให้ลูกค้ายืนยันเงื่อนไขก่อนเข้าพัก */
function deemedConsentBox(): Record<string, unknown> {
  return {
    type: "box",
    layout: "vertical",
    margin: "lg",
    paddingAll: "12px",
    backgroundColor: "#F4F1EC",
    cornerRadius: "10px",
    contents: [
      {
        type: "text",
        text: "ข้อตกลงโดยปริยาย",
        size: "xs",
        weight: "bold",
        color: "#5C4033",
      },
      {
        type: "text",
        text: DEEMED_CONSENT_NOTICE,
        size: "xxs",
        color: "#7A6A5A",
        margin: "xs",
        wrap: true,
      },
    ],
  };
}

/** การ์ดเงื่อนไขก่อนเข้าพัก — มีปุ่มไปหน้ากดยอมรับ + แจ้งการดูแลเพิ่มเติม */
export function buildConsentFlex(data: {
  businessName: string;
  title: string;
  catName: string;
  /** อีโมจิน้องตามชนิดที่ร้านรับ (petWords(cfg).emoji) — ไม่ส่ง = 🐱 */
  petEmoji?: string;
  checkin?: string;
  checkout?: string;
  room?: string;
  terms?: string[];
  url: string;
}, style?: CardStyleConfig) {
  const tx = (k: string, fb: string) => style?.texts?.[k]?.trim() || fb;
  const dateText = data.checkin
    ? `${data.checkin}${data.checkout ? ` → ${data.checkout}` : ""}${
        data.room ? ` · ห้อง ${data.room}` : ""
      }`
    : "";
  // ไม่ลิสต์เงื่อนไขทั้งหมดบนการ์ด — การ์ดยาวเกินลูกค้าเลื่อนผ่าน
  // ให้การ์ดสั้น ชัด แล้วบอกให้กดเข้าไปอ่านฉบับเต็ม + เซ็นในหน้าเว็บแทน
  const termsCount = (data.terms || []).length;

  const body: Record<string, unknown>[] = [
    {
      type: "text",
      text: data.title,
      weight: "bold",
      size: style?.titleSize || "lg",
      color: style?.accentColor || "#5C4033",
      wrap: true,
    },
    {
      type: "text",
      text: `${data.businessName} · ${data.petEmoji || "🐱"} ${politeCat(data.catName)}`,
      size: "xs",
      color: "#A2907E",
      margin: "md",
      wrap: true,
    },
  ];
  if (dateText) {
    body.push(flexDetailRow("🗓️", tx("stayLabel", "เข้าพัก"), dateText));
  }
  body.push({ type: "separator", margin: "lg" });
  body.push({
    type: "box",
    layout: "vertical",
    margin: "lg",
    paddingAll: "14px",
    backgroundColor: "#FBF4E9",
    cornerRadius: "12px",
    spacing: "sm",
    contents: [
      {
        type: "text",
        text: tx("stepsTitle", "⚠️ ก่อนฝากน้อง รบกวนทำ 2 ขั้นตอนนี้ก่อนนะคะ"),
        size: "sm",
        weight: "bold",
        color: "#5C4033",
        wrap: true,
      },
      {
        type: "text",
        text: tx(
          "steps",
          `1. กดปุ่มด้านล่าง เพื่ออ่านข้อตกลง${
            termsCount ? ` ${termsCount} ข้อ` : ""
          }\n2. กดยอมรับ และเซ็นรับทราบในหน้านั้น`
        ),
        size: "sm",
        color: "#4E3E32",
        wrap: true,
      },
    ],
  });
  body.push(deemedConsentBox());
  body.push({
    type: "text",
    text: style?.closing?.trim() || "แจ้งการดูแลเพิ่มเติมของน้องในหน้าเดียวกันได้เลยค่ะ 🧡",
    size: "xs",
    color: "#A2907E",
    margin: "lg",
    wrap: true,
  });

  return {
    type: "flex",
    altText: `${data.title} — ${politeCat(data.catName)}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: style?.headerColor || BRAND_HEADER,
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: tx("header", "📋 เงื่อนไขก่อนเข้าพัก"),
            color: style?.headerTextColor || "#FFFFFF",
            weight: "bold",
            size: "sm",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        contents: body,
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: style?.buttonColor || BRAND_ACTION,
            height: "sm",
            action: {
              type: "uri",
              label: tx("button", "อ่านเงื่อนไข + เซ็นยินยอม").slice(0, 40),
              uri: data.url,
            },
          },
        ],
      },
    },
  };
}

/** @deprecated ใช้ buildAppointmentConfirmFlex แทน */
export function buildReminderFlex(booking: {
  id: string;
  catName: string;
  customerName: string;
  service: string;
  when: string;
  confirmUrl: string;
  /** ข้อมูลร้านจาก config — ต้องส่งมา ไม่งั้นการ์ดจะไม่มีแผนที่/ที่อยู่ */
  mapsUrl?: string;
  location?: string;
}, style?: CardStyleConfig) {
  return buildAppointmentConfirmFlex({
    ...booking,
    date: booking.when,
    mapsUrl: booking.mapsUrl,
    location: booking.location,
  }, style);
}

export function buildPromoFlex(data: {
  title: string;
  body: string;
  imageUrl?: string;
  promoUrl: string;
  discountLabel?: string;
  buttons?: { label: string; uri: string }[];
  shopName?: string;
}, style?: CardStyleConfig) {
  const hero = data.imageUrl
    ? {
        type: "image" as const,
        url: data.imageUrl,
        size: "full" as const,
        aspectRatio: "20:13" as const,
        aspectMode: "cover" as const,
      }
    : {
        type: "box" as const,
        layout: "vertical" as const,
        backgroundColor: style?.headerColor || BRAND_HEADER,
        paddingAll: "20px",
        contents: [
          {
            type: "text" as const,
            text: style?.texts?.header || `✨ โปรโมชั่น${data.shopName ? ` ${data.shopName}` : ""}`,
            color: style?.headerTextColor || "#FFFFFF",
            weight: "bold" as const,
            size: "md" as const,
            wrap: true,
          },
        ],
      };

  return {
    type: "flex",
    altText: data.title,
    contents: {
      type: "bubble",
      size: "mega",
      hero,
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: data.title,
            weight: "bold",
            size: style?.titleSize || "lg",
            color: style?.accentColor || "#5C4033",
            wrap: true,
          },
          ...(data.discountLabel
            ? [
                {
                  type: "text" as const,
                  text: data.discountLabel,
                  size: "sm" as const,
                  color: style?.buttonColor || BRAND_ACTION,
                  weight: "bold" as const,
                  margin: "md" as const,
                },
              ]
            : []),
          {
            type: "text",
            text: data.body,
            size: "sm",
            color: "#4E3E32",
            margin: "md",
            wrap: true,
          },
          ...(style?.closing
            ? [
                {
                  type: "text" as const,
                  text: style.closing,
                  size: "xs" as const,
                  color: "#A2907E",
                  margin: "lg" as const,
                  wrap: true,
                },
              ]
            : []),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: (data.buttons?.length
          ? data.buttons.slice(0, 3)
          : [{ label: style?.texts?.detailButton || "ดูรายละเอียด", uri: data.promoUrl }]
        ).map((btn, i) => ({
          type: "button" as const,
          style: (i === 0 ? "primary" : "secondary") as "primary" | "secondary",
          color: i === 0 ? style?.buttonColor || BRAND_ACTION : undefined,
          height: "sm" as const,
          action: {
            type: "uri" as const,
            label: btn.label,
            uri: btn.uri,
          },
        })),
      },
    },
  };
}

export function buildPaymentFlex(data: {
  invoiceId: string;
  customerName: string;
  catName: string;
  total: number;
  items: { label: string; amount: number }[];
  payUrl: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}, style?: CardStyleConfig) {
  const show = (k: string) => style?.show?.[k] !== false;
  const lines = data.items
    .map((i) => `${i.label} ${i.amount.toLocaleString()} บาท`)
    .join("\n");

  return {
    type: "flex",
    altText: `ชำระเงิน ${data.total} บาท`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: style?.texts?.title || "💳 แจ้งชำระเงิน",
            weight: "bold",
            size: style?.titleSize || "lg",
            color: style?.headerColor || "#5C4033",
            wrap: true,
          },
          {
            type: "text",
            text: `${politeCat(data.catName)} · ${politeName(data.customerName)}`,
            size: "sm",
            color: "#A2907E",
            margin: "md",
            wrap: true,
          },
          ...(show("items")
            ? [
                {
                  type: "text" as const,
                  text: lines,
                  size: "xs" as const,
                  color: "#4E3E32",
                  margin: "md" as const,
                  wrap: true,
                },
              ]
            : []),
          {
            type: "separator",
            margin: "lg",
          },
          {
            type: "text",
            text: `${style?.texts?.totalLabel || "รวม"} ${data.total.toLocaleString()} บาท`,
            weight: "bold",
            size: "xl",
            color: style?.accentColor || "#C4956A",
            margin: "lg",
          },
          ...(show("bank") && data.accountNumber
            ? [
                {
                  type: "box" as const,
                  layout: "vertical" as const,
                  margin: "lg" as const,
                  spacing: "xs" as const,
                  paddingAll: "12px",
                  backgroundColor: "#F4ECE0",
                  cornerRadius: "10px",
                  contents: [
                    ...(data.bankName
                      ? [{ type: "text", text: data.bankName, weight: "bold", size: "md", color: "#5C4033" }]
                      : []),
                    {
                      type: "text",
                      text: data.accountNumber,
                      weight: "bold",
                      size: "xl",
                      color: "#4A7348",
                      wrap: true,
                    },
                    {
                      type: "text",
                      text: `${style?.texts?.accountNameLabel || "ชื่อบัญชี:"} ${data.accountName}`,
                      size: "sm",
                      color: "#A2907E",
                      wrap: true,
                    },
                  ],
                },
              ]
            : []),
          ...(style?.closing
            ? [
                {
                  type: "text" as const,
                  text: style.closing,
                  size: "xs" as const,
                  color: "#A2907E",
                  margin: "lg" as const,
                  wrap: true,
                },
              ]
            : []),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          ...(show("bank") && data.accountNumber
            ? [
                {
                  type: "button" as const,
                  style: "primary" as const,
                  color: style?.buttonColor || "#4A7348",
                  height: "sm" as const,
                  action: {
                    type: "clipboard" as const,
                    label: style?.texts?.copyButton || "📋 คัดลอกเลขบัญชี",
                    clipboardText: data.accountNumber,
                  },
                },
              ]
            : []),
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: {
              type: "uri",
              label: style?.texts?.detailButton || "ดูรายละเอียด",
              uri: data.payUrl,
            },
          },
        ],
      },
    },
  };
}

/** การ์ดสรุปให้ลูกค้า (สรุปการจอง / แจ้งมัดจำ / แจ้งยอดเต็ม) ส่งจากหน้าคิดเงิน */
export function buildBillSummaryFlex(data: {
  mode: "booking" | "deposit" | "full" | "remaining";
  title: string;
  closing?: string;
  customerName: string;
  catName: string;
  /** วันที่/เวลานัด หรือช่วงเข้าพัก (แสดงใต้ชื่อ) */
  scheduleText?: string;
  items: { label: string; amount: number }[];
  subtotal: number;
  discount?: number;
  /** ชื่อโปรที่ใช้ — โชว์ต่อท้าย "ส่วนลด" ให้ลูกค้ารู้ว่าลดจากโปรอะไร */
  promoLabel?: string;
  total: number;
  deposit?: number;
  remaining?: number;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
}, style?: CardStyleConfig) {
  const st = style || {};
  const show = (k: string) => st.show?.[k] !== false;
  const titleColor = st.headerColor || "#5C4033";
  const accent = st.accentColor || "#C4956A";
  const closing = st.closing ?? data.closing;
  const icon =
    data.mode === "deposit"
      ? "💰"
      : data.mode === "full" || data.mode === "remaining"
        ? "💳"
        : "📋";
  const showBank =
    show("bank") &&
    (data.mode === "deposit" ||
      data.mode === "full" ||
      data.mode === "remaining") &&
    !!data.accountNumber;
  const deposit = data.deposit || 0;
  const remaining = data.remaining ?? Math.max(0, data.total - deposit);
  const altAmount = data.mode === "remaining" ? remaining : data.total;

  const money = (n: number) => `${n.toLocaleString()} บาท`;

  // แยกของแถมฟรี (ยอด 0) ออกมาโชว์เป็นกล่อง "ของแถมฟรี" ต่างหาก
  const freebieItems = data.items.filter((i) => i.amount === 0);
  const paidItems = data.items.filter((i) => i.amount !== 0);

  const body: Record<string, unknown>[] = [
    {
      type: "text",
      text: `${icon} ${data.title}`,
      weight: "bold",
      size: st.titleSize || "lg",
      color: titleColor,
      wrap: true,
    },
    {
      type: "text",
      text: `${politeCat(data.catName)} · ${politeName(data.customerName)}`,
      size: "sm",
      color: "#A2907E",
      margin: "sm",
      wrap: true,
    },
    ...(data.scheduleText && show("schedule")
      ? [
          {
            type: "text",
            text: data.scheduleText,
            size: "sm",
            weight: "bold",
            color: "#5C4033",
            margin: "sm",
            wrap: true,
          },
        ]
      : []),
    { type: "separator", margin: "lg" },
    {
      type: "box",
      layout: "vertical",
      margin: "lg",
      spacing: "xs",
      contents: paidItems.map((i) => ({
        type: "box",
        layout: "horizontal",
        contents: [
          {
            type: "text",
            text: i.label,
            size: "sm",
            color: "#4E3E32",
            flex: 4,
            wrap: true,
          },
          {
            type: "text",
            text: money(i.amount),
            size: "sm",
            color: "#4E3E32",
            align: "end",
            flex: 3,
          },
        ],
      })),
    },
  ];

  if (data.discount && data.discount > 0) {
    body.push({
      type: "box",
      layout: "horizontal",
      margin: "md",
      contents: [
        {
          type: "text",
          // มีโปร → บอกชื่อโปรไปเลย ลูกค้าจะได้รู้ว่าลดเพราะอะไร
          text: data.promoLabel
            ? `${st.texts?.discountLabel || "ส่วนลด"} · ${data.promoLabel}`
            : st.texts?.discountLabel || "ส่วนลด",
          size: "sm",
          color: "#C08A2E",
          flex: 4,
          wrap: true,
        },
        {
          type: "text",
          text: `-${money(data.discount)}`,
          size: "sm",
          color: "#C08A2E",
          align: "end",
          flex: 3,
        },
      ],
    });
  }

  body.push({ type: "separator", margin: "lg" });
  body.push({
    type: "box",
    layout: "horizontal",
    margin: "lg",
    contents: [
      {
        type: "text",
        text: st.texts?.totalLabel || "ยอดสุทธิ",
        weight: "bold",
        size: "md",
        color: "#5C4033",
        flex: 3,
      },
      {
        type: "text",
        text: money(data.total),
        weight: "bold",
        size: "lg",
        color: accent,
        align: "end",
        flex: 4,
      },
    ],
  });

  // 🎁 ของแถมฟรี — โชว์ให้ลูกค้าเห็นว่าแถมอะไรบ้าง
  if (freebieItems.length && show("freebies")) {
    body.push({
      type: "box",
      layout: "vertical",
      margin: "lg",
      spacing: "xs",
      paddingAll: "12px",
      backgroundColor: "#FBF7F0",
      cornerRadius: "10px",
      contents: [
        {
          type: "text",
          text: st.texts?.freebiesLabel || "🎁 ของแถมฟรี",
          weight: "bold",
          size: "xs",
          color: "#5C4033",
        },
        ...freebieItems.map((i) => ({
          type: "text",
          text: `• ${i.label.replace(/^🎁\s*/, "").replace(/\s*\(ฟรี\)\s*$/, "")}`,
          size: "xs",
          color: "#7A6A5A",
          wrap: true,
        })),
      ],
    });
  }

  const showDeposit =
    data.mode === "deposit" ||
    data.mode === "remaining" ||
    (data.mode === "booking" && deposit > 0);
  if (showDeposit) {
    const isRemaining = data.mode === "remaining";
    const isBooking = data.mode === "booking";
    const paidLabel = isRemaining
      ? st.texts?.depositPaidLabelRemaining || "มัดจำที่ชำระแล้ว"
      : isBooking
        ? st.texts?.depositPaidLabelBooking || "มัดจำ"
        : st.texts?.depositPaidLabelFull || "มัดจำที่ต้องโอน";
    const dueLabel = isRemaining
      ? st.texts?.depositDueLabelRemaining || "ยอดที่ต้องโอนตอนนี้"
      : isBooking
        ? st.texts?.depositDueLabelBooking || "ยอดคงเหลือ"
        : st.texts?.depositDueLabelFull || "ยอดคงเหลือ (ก่อนเข้าพัก)";
    body.push({
      type: "box",
      layout: "vertical",
      margin: "md",
      spacing: "xs",
      paddingAll: "10px",
      backgroundColor: "#F4ECE0",
      cornerRadius: "10px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: paidLabel, size: "sm", color: "#4E3E32", flex: 5 },
            {
              type: "text",
              text: money(deposit),
              size: "sm",
              weight: "bold",
              color: "#4A7348",
              align: "end",
              flex: 4,
            },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: dueLabel, size: isRemaining ? "md" : "sm", color: "#4E3E32", flex: 5 },
            {
              type: "text",
              text: money(remaining),
              size: isRemaining ? "lg" : "sm",
              weight: "bold",
              color: "#B4553B",
              align: "end",
              flex: 4,
            },
          ],
        },
      ],
    });
  }

  if (showBank) {
    body.push({
      type: "box",
      layout: "vertical",
      margin: "lg",
      spacing: "xs",
      paddingAll: "12px",
      backgroundColor: "#F4ECE0",
      cornerRadius: "10px",
      contents: [
        ...(data.bankName
          ? [{ type: "text", text: data.bankName, weight: "bold", size: "md", color: "#5C4033" }]
          : []),
        {
          type: "text",
          text: data.accountNumber || "",
          weight: "bold",
          size: "xl",
          color: "#4A7348",
          wrap: true,
        },
        {
          type: "text",
          text: `${st.texts?.accountNameLabel || "ชื่อบัญชี:"} ${data.accountName || ""}`,
          size: "sm",
          color: "#A2907E",
          wrap: true,
        },
      ],
    });
  }

  if (closing && show("closing")) {
    body.push({
      type: "text",
      text: closing,
      size: "xs",
      color: "#A2907E",
      margin: "lg",
      wrap: true,
    });
  }

  const bubble: Record<string, unknown> = {
    type: "bubble",
    size: "mega",
    body: { type: "box", layout: "vertical", contents: body },
  };

  if (showBank) {
    bubble.footer = {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: st.buttonColor || "#4A7348",
          height: "sm",
          action: {
            type: "clipboard",
            label: st.texts?.copyButton || "📋 คัดลอกเลขบัญชี",
            clipboardText: data.accountNumber || "",
          },
        },
      ],
    };
  }

  return {
    type: "flex",
    altText: `${data.title} — ${money(altAmount)}`,
    contents: bubble,
  };
}

/** การ์ดแจ้งเข้าพัก — จัดรูปแบบสวยงาม อ่านง่าย + ปุ่มไปกดยอมรับเงื่อนไข */
export function buildPrestayFlex(data: {
  businessName: string;
  catName: string;
  /** อีโมจิน้องตามชนิดที่ร้านรับ (petWords(cfg).emoji) — ไม่ส่ง = 🐱 */
  petEmoji?: string;
  /** ช่วงวันเข้าพัก จัดรูปแล้ว เช่น "12 ก.ค. 2569 → 17 ก.ค. 2569" */
  dateText: string;
  room?: string;
  intro: string;
  prepIntro?: string;
  prepItems: string[];
  careNote?: string;
  litterNote?: string;
  consentUrl?: string;
  consentLabel?: string;
}, style?: CardStyleConfig) {
  const show = (k: string) => style?.show?.[k] !== false;
  const body: Record<string, unknown>[] = [
    // ชื่อน้อง + ร้าน
    {
      type: "text",
      text: `${data.petEmoji || "🐱"} ${politeCat(data.catName)}`,
      weight: "bold",
      size: style?.titleSize || "xl",
      color: style?.accentColor || "#5C4033",
      wrap: true,
    },
    {
      type: "text",
      text: data.businessName,
      size: "xs",
      color: "#A2907E",
      margin: "xs",
    },
    // ทักทายเปิด
    {
      type: "text",
      text: data.intro,
      size: "sm",
      color: "#4E3E32",
      margin: "lg",
      wrap: true,
    },
  ];

  // กล่องไฮไลต์วันเข้าพัก + ห้อง
  const dateBox: Record<string, unknown>[] = [];
  if (data.dateText && show("dates")) {
    dateBox.push({
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "📅", size: "sm", flex: 0 },
        {
          type: "box",
          layout: "vertical",
          flex: 5,
          contents: [
            { type: "text", text: style?.texts?.dateLabel || "วันเข้าพัก", size: "xxs", color: "#9B8B7E" },
            {
              type: "text",
              text: data.dateText,
              size: "sm",
              weight: "bold",
              color: "#4A7348",
              wrap: true,
              margin: "xs",
            },
          ],
        },
      ],
    });
  }
  if (data.room && show("room")) {
    dateBox.push({
      type: "box",
      layout: "horizontal",
      margin: dateBox.length ? "md" : "none",
      contents: [
        { type: "text", text: "🏠", size: "sm", flex: 0 },
        {
          type: "box",
          layout: "vertical",
          flex: 5,
          contents: [
            { type: "text", text: style?.texts?.roomLabel || "ห้องพัก", size: "xxs", color: "#9B8B7E" },
            {
              type: "text",
              text: data.room,
              size: "sm",
              weight: "bold",
              color: "#4E3E32",
              wrap: true,
              margin: "xs",
            },
          ],
        },
      ],
    });
  }
  if (dateBox.length) {
    body.push({
      type: "box",
      layout: "vertical",
      margin: "lg",
      paddingAll: "14px",
      backgroundColor: "#F4ECE0",
      cornerRadius: "12px",
      spacing: "sm",
      contents: dateBox,
    });
  }

  // หัวข้อ + เกริ่นของที่ต้องเตรียม
  const prep = show("prep") ? data.prepItems.filter(Boolean) : [];
  if (prep.length) {
    body.push({ type: "separator", margin: "xl" });
    body.push({
      type: "text",
      text: style?.texts?.prepTitle || "🧳 สิ่งที่ต้องเตรียมมาด้วย",
      weight: "bold",
      size: "md",
      color: style?.headerColor || "#5C4033",
      margin: "lg",
    });
    if (data.prepIntro) {
      body.push({
        type: "text",
        text: data.prepIntro,
        size: "xs",
        color: "#A2907E",
        margin: "sm",
        wrap: true,
      });
    }
    body.push({
      type: "box",
      layout: "vertical",
      margin: "md",
      paddingAll: "12px",
      backgroundColor: "#FBF7F0",
      cornerRadius: "10px",
      spacing: "md",
      contents: prep.map((item) => ({
        type: "text",
        text: item,
        size: "sm",
        color: "#4E3E32",
        wrap: true,
      })),
    });
  }

  // เตือนพาน้องมาในตะกร้า/กระเป๋า — โทนส้มเดียวกับแจ้งเตรียมทราย ให้เห็นเด่นเหมือนกัน
  if (show("carrier")) {
    body.push({
      type: "box",
      layout: "vertical",
      margin: "md",
      paddingAll: "12px",
      backgroundColor: "#FBEEE0",
      cornerRadius: "10px",
      contents: [
        {
          type: "text",
          text:
            style?.texts?.carrierNote ||
            "🧺 รบกวนพาน้องใส่ตะกร้า/กระเป๋าทุกครั้งที่มาใช้บริการด้วยนะคะ",
          size: "xs",
          color: "#B4553B",
          weight: "bold",
          wrap: true,
        },
      ],
    });
  }

  // แจ้งเตรียมทราย (ถ้าเข้าพักไม่ถึงเกณฑ์แถมฟรี) — โทนส้มเตือน
  if (data.litterNote && show("litter")) {
    body.push({
      type: "box",
      layout: "vertical",
      margin: "md",
      paddingAll: "12px",
      backgroundColor: "#FBEEE0",
      cornerRadius: "10px",
      contents: [
        {
          type: "text",
          text: data.litterNote,
          size: "xs",
          color: "#B4553B",
          wrap: true,
        },
      ],
    });
  }

  // ปิดท้าย — ชวนแจ้งการดูแลพิเศษ (โทนอบอุ่น)
  if (data.careNote && show("care")) {
    body.push({
      type: "box",
      layout: "vertical",
      margin: "lg",
      paddingAll: "12px",
      backgroundColor: "#FBF0F1",
      cornerRadius: "10px",
      contents: [
        {
          type: "text",
          text: data.careNote,
          size: "xs",
          color: "#7A6A5A",
          wrap: true,
        },
      ],
    });
  }

  // มีปุ่มยืนยันการเข้าพัก → แจ้งว่าไม่ตอบ = ยอมรับโดยปริยาย
  if (data.consentUrl) body.push(deemedConsentBox());

  if (style?.closing) {
    body.push({
      type: "text",
      text: style.closing,
      size: "xs",
      color: "#A2907E",
      margin: "lg",
      wrap: true,
    });
  }

  const bubble: Record<string, unknown> = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: style?.headerColor || BRAND_HEADER,
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: style?.texts?.header || "🏠 เตรียมตัวก่อนเข้าพัก",
          color: style?.headerTextColor || "#FFFFFF",
          weight: "bold",
          size: "sm",
          wrap: true,
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      contents: body,
    },
  };

  if (data.consentUrl) {
    bubble.footer = {
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: style?.buttonColor || BRAND_ACTION,
          height: "sm",
          action: {
            type: "uri",
            label:
              data.consentLabel ||
              style?.texts?.confirmButton ||
              "🧡 อ่านรายละเอียด & ยืนยันการเข้าพัก",
            uri: data.consentUrl,
          },
        },
      ],
    };
  }

  return {
    type: "flex",
    altText: `เตรียมตัวก่อนเข้าพัก 🏠 ${politeCat(data.catName)}`,
    contents: bubble,
  };
}

/** การ์ดให้ลูกค้าเลือกเวลามาส่ง/รับน้อง — ข้อความ + ปุ่มไปหน้าเลือกเวลาใน LIFF */
export function buildTimePickerFlex(data: {
  title: string;
  body: string;
  url?: string;
  label?: string;
}, style?: CardStyleConfig) {
  const bodyContents: Record<string, unknown>[] = [
    {
      type: "text",
      text: data.body,
      size: "sm",
      color: "#4E3E32",
      wrap: true,
    },
  ];
  if (style?.closing) {
    bodyContents.push({
      type: "text",
      text: style.closing,
      size: "xs",
      color: "#A2907E",
      margin: "lg",
      wrap: true,
    });
  }
  const bubble: Record<string, unknown> = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: style?.headerColor || BRAND_HEADER,
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: style?.texts?.title || data.title,
          color: style?.headerTextColor || "#FFFFFF",
          weight: "bold",
          size: style?.titleSize || "sm",
          wrap: true,
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      contents: bodyContents,
    },
  };
  if (data.url) {
    bubble.footer = {
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: style?.buttonColor || BRAND_ACTION,
          height: "sm",
          action: {
            type: "uri",
            label: style?.texts?.button || data.label || "🕒 เลือกเวลา",
            uri: data.url,
          },
        },
      ],
    };
  }
  return {
    type: "flex",
    altText: `${style?.texts?.title || data.title} 🕒`,
    contents: bubble,
  };
}

/** การ์ดสอบถามประวัติน้องก่อนอาบน้ำ — ข้อความ + ปุ่มไปกรอกแบบฟอร์มใน LIFF */
export function buildGroomInfoFlex(data: {
  catName: string;
  /** อีโมจิน้องตามชนิดที่ร้านรับ (petWords(cfg).emoji) — ไม่ส่ง = 🐱 */
  petEmoji?: string;
  dateText?: string;
  body: string;
  url?: string;
  label?: string;
}, style?: CardStyleConfig) {
  const st = style || {};
  const show = (k: string) => st.show?.[k] !== false;
  const contents: Record<string, unknown>[] = [
    {
      type: "text",
      text: `${data.petEmoji || "🐱"} ${politeCat(data.catName)}`,
      weight: "bold",
      size: st.titleSize || "lg",
      color: st.accentColor || "#5C4033",
      wrap: true,
    },
  ];
  if (data.dateText && show("date")) {
    contents.push({
      type: "text",
      text: data.dateText,
      size: "xs",
      color: "#A2907E",
      margin: "xs",
      wrap: true,
    });
  }
  contents.push({
    type: "text",
    text: data.body,
    size: "sm",
    color: "#4E3E32",
    margin: "md",
    wrap: true,
  });

  if (st.closing) {
    contents.push({ type: "text", text: st.closing, size: "xs", color: "#A2907E", margin: "md", wrap: true });
  }

  const bubble: Record<string, unknown> = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: st.headerColor || BRAND_HEADER,
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: st.texts?.header || "🩺 ประวัติน้องก่อนอาบน้ำ",
          color: st.headerTextColor || "#FFFFFF",
          weight: "bold",
          size: "sm",
        },
      ],
    },
    body: { type: "box", layout: "vertical", paddingAll: "16px", contents },
  };
  if (data.url) {
    bubble.footer = {
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: st.buttonColor || BRAND_ACTION,
          height: "sm",
          action: {
            type: "uri",
            label: data.label || st.texts?.button || "🩺 แจ้งประวัติน้อง",
            uri: data.url,
          },
        },
      ],
    };
  }
  return {
    type: "flex",
    altText: `${st.texts?.header || "🩺 ประวัติน้องก่อนอาบน้ำ"} — ${politeCat(data.catName)}`,
    contents: bubble,
  };
}

/**
 * การ์ดขอเอกสารก่อนเข้าพัก — ขอรูปสมุดวัคซีน หรือ ขอรูปบัตรประชาชนผู้ปกครอง
 * ปุ่มเปิดหน้าแนบรูปในแอปลูกค้า (/app/pet-docs) ซึ่งแนบได้อย่างเดียว ไม่ต้องเซ็นข้อตกลงซ้ำ
 * ข้อความ/สีแก้ได้ใน /admin/cards (cards.docRequest) — {cat} = ชื่อน้อง
 */

export function buildDocRequestFlex(data: {
  kind: "vaccine" | "idcard";
  businessName: string;
  catName: string;
  /** อีโมจิน้องตามชนิดที่ร้านรับ (petWords(cfg).emoji) — ไม่ส่ง = 🐱 */
  petEmoji?: string;
  dateText?: string;
  url: string;
}, style?: CardStyleConfig) {
  const st = style || {};
  const t = (k: keyof typeof DOC_REQUEST_DEFAULTS) => st.texts?.[k]?.trim() || DOC_REQUEST_DEFAULTS[k];
  const vaccine = data.kind === "vaccine";
  const header = vaccine ? t("vaccineHeader") : t("idcardHeader");
  const bodyText = (vaccine ? t("vaccineBody") : t("idcardBody")).replaceAll("{cat}", politeCat(data.catName));
  const contents: Record<string, unknown>[] = [
    {
      type: "text",
      text: `${data.petEmoji || "🐱"} ${politeCat(data.catName)}`,
      weight: "bold",
      size: st.titleSize || "lg",
      color: st.accentColor || "#5C4033",
      wrap: true,
    },
    {
      type: "text",
      text: data.dateText ? `${data.businessName} · ${data.dateText}` : data.businessName,
      size: "xs",
      color: "#A2907E",
      margin: "xs",
      wrap: true,
    },
    { type: "text", text: bodyText, size: "sm", color: "#4E3E32", margin: "md", wrap: true },
  ];
  if (st.closing) {
    contents.push({ type: "text", text: st.closing, size: "xs", color: "#A2907E", margin: "md", wrap: true });
  }
  return {
    type: "flex",
    altText: `${header} — ${politeCat(data.catName)}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: st.headerColor || BRAND_HEADER,
        paddingAll: "16px",
        contents: [{ type: "text", text: header, color: st.headerTextColor || "#FFFFFF", weight: "bold", size: "sm" }],
      },
      body: { type: "box", layout: "vertical", paddingAll: "16px", contents },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: st.buttonColor || BRAND_ACTION,
            height: "sm",
            action: {
              type: "uri",
              label: vaccine ? t("vaccineButton") : t("idcardButton"),
              uri: data.url,
            },
          },
        ],
      },
    },
  };
}

/**
 * การ์ดรวมขอข้อมูลก่อนรับน้อง — ใบเดียว หลายปุ่ม แทนการ์ดแยก (ประวัติ / สมุดวัคซีน / บัตรประชาชน /
 * กฎ + กดยินยอม / มัดจำ) · คนเรียกใส่มาเฉพาะเรื่องที่บ้านนี้ยังขาด ปุ่มไหนครบแล้วจะไม่มีในการ์ด
 * ข้อความแก้ได้ใน /admin/cards (cards.intake) · หัวการ์ดตามบริการ (เข้าพัก / อาบน้ำ)
 */

/** stayInfo = ฟอร์มข้อมูลก่อนเข้าพัก · info = ประวัติก่อนอาบน้ำ (คนละฟอร์ม ป้ายปุ่มต้องไม่ซ้ำกัน) */
export type IntakeButtonKind = "stayInfo" | "info" | "vaccine" | "idcard" | "consent";
export type IntakeDeposit = {
  amount: number;
  bankName: string;
  accountNumber: string;
  accountName: string;
};

export function buildIntakeFlex(data: {
  service: "stay" | "groom";
  catName: string;
  /** อีโมจิน้องตามชนิดที่ร้านรับ (petWords(cfg).emoji) — ไม่ส่ง = 🐱 */
  petEmoji?: string;
  businessName: string;
  dateText?: string;
  buttons: { kind: IntakeButtonKind; url: string; count?: number }[];
  deposit?: IntakeDeposit;
}, style?: CardStyleConfig) {
  const st = style || {};
  const t = (k: keyof typeof INTAKE_CARD_DEFAULTS) => st.texts?.[k]?.trim() || INTAKE_CARD_DEFAULTS[k];
  const header = data.service === "stay" ? t("headerStay") : t("headerGroom");
  const cat = politeCat(data.catName);
  const contents: Record<string, unknown>[] = [
    { type: "text", text: `${data.petEmoji || "🐱"} ${cat}`, weight: "bold", size: st.titleSize || "lg", color: st.accentColor || "#5C4033", wrap: true },
    {
      type: "text",
      text: data.dateText ? `${data.businessName} · ${data.dateText}` : data.businessName,
      size: "xs",
      color: "#A2907E",
      margin: "xs",
      wrap: true,
    },
    {
      type: "text",
      text: t("body").replaceAll("{cat}", cat).replaceAll("{shop}", data.businessName),
      size: "sm",
      color: "#4E3E32",
      margin: "md",
      wrap: true,
    },
  ];
  if (data.deposit && data.deposit.amount > 0) {
    const d = data.deposit;
    contents.push({
      type: "box",
      layout: "vertical",
      margin: "lg",
      paddingAll: "12px",
      cornerRadius: "10px",
      backgroundColor: "#F4ECE0",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: t("depositLabel"), size: "sm", color: "#5C4033", flex: 3, wrap: true },
            {
              type: "text",
              text: `${d.amount.toLocaleString()} บาท`,
              size: "md",
              weight: "bold",
              color: st.accentColor || "#C4956A",
              align: "end",
              flex: 2,
            },
          ],
        },
        ...(d.accountNumber
          ? [
              {
                type: "text",
                text: [d.bankName, d.accountNumber, d.accountName].filter(Boolean).join(" · "),
                size: "xs",
                color: "#7A6A5C",
                margin: "sm",
                wrap: true,
              },
            ]
          : []),
      ],
    });
  }
  if (st.closing) {
    contents.push({ type: "text", text: st.closing, size: "xs", color: "#A2907E", margin: "md", wrap: true });
  }

  const label: Record<IntakeButtonKind, string> = {
    stayInfo: t("stayInfoButton"),
    info: t("infoButton"),
    vaccine: t("vaccineButton"),
    idcard: t("idcardButton"),
    consent: t("consentButton"),
  };
  const footer: Record<string, unknown>[] = data.buttons.map((b) => ({
    type: "button",
    style: "primary",
    color: st.buttonColor || BRAND_ACTION,
    height: "sm",
    action: {
      type: "uri",
      // LINE ตัดป้ายปุ่มที่ยาวเกิน 40 ตัวอักษร
      label: (b.count && b.count > 1 ? `${label[b.kind]} (${b.count} ตัว)` : label[b.kind]).slice(0, 40),
      uri: b.url,
    },
  }));
  if (data.deposit && data.deposit.amount > 0 && data.deposit.accountNumber) {
    footer.push({
      type: "button",
      style: "secondary",
      height: "sm",
      action: { type: "clipboard", label: t("copyButton").slice(0, 40), clipboardText: data.deposit.accountNumber },
    });
  }
  const bubble: Record<string, unknown> = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: st.headerColor || BRAND_HEADER,
      paddingAll: "16px",
      contents: [{ type: "text", text: header, color: st.headerTextColor || "#FFFFFF", weight: "bold", size: "sm" }],
    },
    body: { type: "box", layout: "vertical", paddingAll: "16px", contents },
  };
  if (footer.length) {
    bubble.footer = { type: "box", layout: "vertical", spacing: "sm", paddingAll: "12px", contents: footer };
  }
  return { type: "flex", altText: `${header} — ${cat}`, contents: bubble };
}

/**
 * เรื่องที่ต้องขอจากลูกค้า 1 เรื่อง — เก็บทั้ง "การ์ดเดี่ยวแบบเดิม" และ "ปุ่มในการ์ดรวม" ไว้คู่กัน
 * แล้วค่อยตัดสินตอนท้ายด้วย mergeIntakeCards ว่าจะส่งแบบไหน
 */
export type IntakeEntry = {
  kind: IntakeButtonKind | "deposit";
  card: object;
  url?: string;
  count?: number;
  deposit?: IntakeDeposit;
};

const INTAKE_ORDER: IntakeEntry["kind"][] = ["stayInfo", "info", "vaccine", "idcard", "consent", "deposit"];

/**
 * รวมหลายเรื่องเป็นการ์ดใบเดียว (ประหยัดโควตา LINE + ลูกค้าไม่ต้องไล่อ่านหลายใบ)
 * มีเรื่องเดียว = ส่งการ์ดเดี่ยวแบบเดิม (ข้อความที่ร้านแต่งไว้ของการ์ดนั้นยังใช้ได้) · always = รวมเสมอ
 */
export function mergeIntakeCards(
  entries: IntakeEntry[],
  ctx: {
    service: "stay" | "groom";
    catName: string;
    businessName: string;
    dateText?: string;
    always?: boolean;
    petEmoji?: string;
  },
  style?: CardStyleConfig
): object[] {
  if (entries.length === 0) return [];
  if (entries.length === 1 && !ctx.always) return [entries[0].card];
  const sorted = [...entries].sort((a, b) => INTAKE_ORDER.indexOf(a.kind) - INTAKE_ORDER.indexOf(b.kind));
  return [
    buildIntakeFlex(
      {
        service: ctx.service,
        catName: ctx.catName,
        petEmoji: ctx.petEmoji,
        businessName: ctx.businessName,
        dateText: ctx.dateText,
        buttons: sorted
          .filter((e) => e.kind !== "deposit" && e.url)
          .map((e) => ({ kind: e.kind as IntakeButtonKind, url: e.url!, count: e.count })),
        deposit: sorted.find((e) => e.kind === "deposit")?.deposit,
      },
      style
    ),
  ];
}

/** การ์ดเรียกเก็บมัดจำ — ชัดๆ ว่าต้องโอนเท่าไหร่ (ส่งก่อนลูกค้าโอน) */
export function buildDepositRequestFlex(data: {
  title: string;
  body: string;
  amount: number;
  bankName: string;
  accountNumber: string;
  accountName: string;
  note?: string;
  percentNote?: string;
}, style?: CardStyleConfig) {
  const st = style || {};
  const show = (k: string) => st.show?.[k] !== false;
  const body: Record<string, unknown>[] = [
    { type: "text", text: data.title, weight: "bold", size: st.titleSize || "lg", color: st.headerColor || "#5C4033", wrap: true },
    { type: "text", text: data.body, size: "sm", color: "#4E3E32", margin: "md", wrap: true },
  ];
  if (data.note && show("note")) {
    body.push({ type: "text", text: data.note, size: "xs", color: "#A2907E", margin: "sm", wrap: true });
  }
  body.push({
    type: "box",
    layout: "vertical",
    margin: "lg",
    paddingAll: "14px",
    backgroundColor: "#FBF4E9",
    cornerRadius: "12px",
    spacing: "xs",
    contents: [
      { type: "text", text: st.texts?.amountLabel || "มัดจำที่ต้องโอน", size: "sm", color: "#A2907E", align: "center" },
      {
        type: "text",
        text: `${data.amount.toLocaleString()} บาท`,
        weight: "bold",
        size: "3xl",
        color: st.accentColor || "#C4956A",
        align: "center",
      },
      ...(data.percentNote
        ? [
            {
              type: "text",
              text: `(${data.percentNote})`,
              size: "xs",
              color: "#A2907E",
              align: "center",
            },
          ]
        : []),
    ],
  });
  // LINE ไม่รับข้อความว่าง — ร้านที่ยังไม่ตั้งบัญชีจะส่งการ์ดไม่ผ่านทั้งชุด (messages[n] is invalid)
  const hasBank = show("bank") && !!data.accountNumber;
  if (hasBank) {
    body.push({
      type: "box",
      layout: "vertical",
      margin: "lg",
      spacing: "xs",
      paddingAll: "12px",
      backgroundColor: "#F4ECE0",
      cornerRadius: "10px",
      contents: [
        ...(data.bankName ? [{ type: "text", text: data.bankName, weight: "bold", size: "md", color: "#5C4033" }] : []),
        { type: "text", text: data.accountNumber, weight: "bold", size: "xl", color: "#4A7348", wrap: true },
        { type: "text", text: `${st.texts?.accountNameLabel || "ชื่อบัญชี:"} ${data.accountName}`, size: "sm", color: "#A2907E", wrap: true },
      ],
    });
  }
  if (st.closing) {
    body.push({ type: "text", text: st.closing, size: "xs", color: "#A2907E", margin: "lg", wrap: true });
  }

  return {
    type: "flex",
    altText: `ขอรับมัดจำ ${data.amount.toLocaleString()} บาท`,
    contents: {
      type: "bubble",
      size: "mega",
      body: { type: "box", layout: "vertical", contents: body },
      ...(hasBank
        ? {
            footer: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "button",
                  style: "primary",
                  color: st.buttonColor || "#4A7348",
                  height: "sm",
                  action: {
                    type: "clipboard",
                    label: st.texts?.copyButton || "📋 คัดลอกเลขบัญชี",
                    clipboardText: data.accountNumber,
                  },
                },
              ],
            },
          }
        : {}),
    },
  };
}

/** การ์ดขอบคุณ + เงื่อนไข ตอนรับมัดจำล่วงหน้า (ข้อความแก้ได้ในตั้งค่า > ข้อความ) */
export function buildDepositThanksFlex(data: {
  title: string;
  body: string;
  terms: string[];
  amount: number;
  note?: string;
  percentNote?: string;
}, style?: CardStyleConfig) {
  const show = (k: string) => style?.show?.[k] !== false;
  const boxContents: Record<string, unknown>[] = [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: style?.texts?.amountLabel || "มัดจำที่รับ", size: "sm", color: "#4E3E32", flex: 3 },
        {
          type: "text",
          text: `${data.amount.toLocaleString()} บาท`,
          size: "md",
          weight: "bold",
          color: style?.accentColor || "#4A7348",
          align: "end",
          flex: 4,
        },
      ],
    },
  ];
  if (data.percentNote && show("percent")) {
    boxContents.push({
      type: "text",
      text: data.percentNote,
      size: "xs",
      color: "#A2907E",
      margin: "xs",
      align: "end",
    });
  }
  if (data.note && show("note")) {
    boxContents.push({
      type: "text",
      text: data.note,
      size: "xs",
      color: "#A2907E",
      margin: "sm",
      wrap: true,
    });
  }

  const contents: Record<string, unknown>[] = [
    {
      type: "text",
      text: data.title,
      weight: "bold",
      size: style?.titleSize || "lg",
      color: style?.headerColor || "#5C4033",
      wrap: true,
    },
    { type: "text", text: data.body, size: "sm", color: "#4E3E32", margin: "md", wrap: true },
    {
      type: "box",
      layout: "vertical",
      margin: "lg",
      paddingAll: "12px",
      backgroundColor: "#F4ECE0",
      cornerRadius: "10px",
      contents: boxContents,
    },
  ];

  if (data.terms.length > 0 && show("terms")) {
    contents.push({ type: "separator", margin: "lg" });
    contents.push({
      type: "text",
      text: style?.texts?.termsTitle || "🐾 เงื่อนไขมัดจำ",
      weight: "bold",
      size: "xs",
      color: style?.headerColor || "#5C4033",
      margin: "lg",
    });
    contents.push({
      type: "box",
      layout: "vertical",
      margin: "sm",
      spacing: "sm",
      contents: data.terms.map((t) => ({
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          { type: "text", text: "•", size: "xs", color: "#C4956A", flex: 0 },
          { type: "text", text: t, size: "xs", color: "#7A6A5A", wrap: true, flex: 1 },
        ],
      })),
    });
  }

  if (style?.closing) {
    contents.push({
      type: "text",
      text: style.closing,
      size: "xs",
      color: "#A2907E",
      margin: "lg",
      wrap: true,
    });
  }

  return {
    type: "flex",
    altText: `${data.title} — ${data.amount.toLocaleString()} บาท`,
    contents: {
      type: "bubble",
      size: "mega",
      body: { type: "box", layout: "vertical", contents },
    },
  };
}

export function buildReceiptFlex(data: {
  invoiceId: string;
  customerName: string;
  catName: string;
  total: number;
  pointsEarned: number;
  paymentMethod: string;
  /** ส่วนลดที่ใช้ไป + ชื่อโปร — ให้ลูกค้าเห็นว่าบิลนี้ได้ลดจากอะไร */
  discount?: number;
  promoLabel?: string;
  /** ชื่อร้านจาก config — ไม่ส่งมาจะไม่ขึ้นบรรทัดชื่อร้าน (ดีกว่าโชว์ชื่อร้านอื่น) */
  shopName?: string;
  /** รายการในบิล — ให้ลูกค้าเห็นว่าจ่ายค่าอะไรไปบ้าง ไม่ใช่แค่ยอดรวม */
  items?: { label: string; amount: number }[];
  /** ตัดจากเครดิต Member ไปเท่าไหร่ และเหลือเท่าไหร่ (เฉพาะบิลที่จ่ายด้วยเครดิต) */
  memberCreditUsed?: number;
  memberCreditLeft?: number;
  /** คอร์สที่หักไปในบิลนี้ + ที่เหลือ — ให้ลูกค้าเห็นสิทธิ์คงเหลือในใบเสร็จเลย */
  packageName?: string;
  packageUsed?: number;
  packageLeft?: number;
  packageUnitLabel?: string;
}, style?: CardStyleConfig) {
  const st = style || {};
  const show = (k: string) => st.show?.[k] !== false;
  const bubble: Record<string, unknown> = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: st.headerColor || "#C4956A",
      paddingAll: "18px",
      contents: [
        { type: "text", text: st.texts?.header || "🧾 ใบเสร็จรับเงิน", color: st.headerTextColor || "#FFFFFF", weight: "bold", size: st.titleSize || "lg" },
        ...(data.shopName
          ? [{ type: "text", text: data.shopName, color: st.headerTextColor || "#FFFFFF", size: "xs", margin: "xs" }]
          : []),
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "18px",
      contents: [
        flexDetailRow("🐱", st.texts?.customerLabel || "ลูกค้า", `${politeCat(data.catName)} · ${politeName(data.customerName)}`),
        ...(show("invoiceNo")
          ? [flexDetailRow("🔖", st.texts?.invoiceNoLabel || "เลขที่", data.invoiceId)]
          : []),
        { type: "separator", margin: "lg", color: "#EFE3D2" },
        // รายการที่ใช้บริการไป — โดยเฉพาะลูกค้าที่ตัดเครดิต จะได้ตรวจได้ว่าหักค่าอะไร
        ...(data.items && data.items.length
          ? [
              {
                type: "box",
                layout: "vertical",
                margin: "lg",
                spacing: "sm",
                contents: data.items.map((it) => ({
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    { type: "text", text: it.label, size: "xs", color: "#5C4033", flex: 5, wrap: true },
                    {
                      type: "text",
                      text: it.amount > 0 ? `${it.amount.toLocaleString()} ฿` : "ฟรี",
                      size: "xs",
                      color: it.amount > 0 ? "#5C4033" : "#4A7348",
                      align: "end",
                      flex: 2,
                    },
                  ],
                })),
              },
            ]
          : []),
        {
          type: "box",
          layout: "vertical",
          margin: "lg",
          paddingAll: "16px",
          backgroundColor: "#FBF4E9",
          cornerRadius: "12px",
          spacing: "xs",
          contents: [
            { type: "text", text: st.texts?.paidLabel || "ชำระแล้ว", size: "sm", color: "#A2907E", align: "center" },
            {
              type: "text",
              text: `${data.total.toLocaleString()} บาท`,
              weight: "bold",
              size: "3xl",
              color: st.accentColor || "#4A7348",
              align: "center",
            },
            {
              type: "text",
              text: `(${data.paymentMethod})`,
              size: "xs",
              color: "#A2907E",
              align: "center",
            },
            // ใช้โปร/คูปองลดไป → บอกไว้ในใบเสร็จด้วยว่าลดเท่าไหร่ จากโปรอะไร
            ...(data.discount && data.discount > 0
              ? [
                  {
                    type: "text",
                    text: data.promoLabel
                      ? `${st.texts?.discountLabel || "ส่วนลดที่ใช้"} ${data.discount.toLocaleString()} บาท · ${data.promoLabel}`
                      : `${st.texts?.discountLabel || "ส่วนลดที่ใช้"} ${data.discount.toLocaleString()} บาท`,
                    size: "xs",
                    color: "#C08A2E",
                    align: "center",
                    margin: "sm",
                    wrap: true,
                  },
                ]
              : []),
          ],
        },
        // ตัดเครดิต Member — บอกให้ชัดว่าหักไปเท่าไหร่ เหลือเท่าไหร่ ลูกค้าจะได้ไม่ต้องถาม
        ...(data.memberCreditUsed && data.memberCreditUsed > 0
          ? [
              {
                type: "box",
                layout: "vertical",
                margin: "lg",
                paddingAll: "12px",
                backgroundColor: "#F4ECE0",
                cornerRadius: "10px",
                spacing: "xs",
                contents: [
                  {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                      { type: "text", text: "💎 ตัดจากเครดิต Member", size: "sm", color: "#5C4033", flex: 3 },
                      {
                        type: "text",
                        text: `−${data.memberCreditUsed.toLocaleString()} ฿`,
                        weight: "bold",
                        size: "sm",
                        color: "#B4634B",
                        align: "end",
                        flex: 2,
                      },
                    ],
                  },
                  ...(data.memberCreditLeft != null
                    ? [
                        {
                          type: "box",
                          layout: "horizontal",
                          contents: [
                            { type: "text", text: "เครดิตคงเหลือ", size: "sm", color: "#A2907E", flex: 3 },
                            {
                              type: "text",
                              text: `${data.memberCreditLeft.toLocaleString()} ฿`,
                              weight: "bold",
                              size: "sm",
                              color: "#4A7348",
                              align: "end",
                              flex: 2,
                            },
                          ],
                        },
                      ]
                    : []),
                  ...(data.packageLeft != null
                    ? [
                        {
                          type: "box",
                          layout: "horizontal",
                          contents: [
                            {
                              type: "text",
                              text: `คอร์สคงเหลือ${data.packageName ? ` (${data.packageName})` : ""}`,
                              size: "sm",
                              color: "#A2907E",
                              flex: 3,
                              wrap: true,
                            },
                            {
                              type: "text",
                              text: `${data.packageLeft.toLocaleString()} ${data.packageUnitLabel || "ครั้ง"}`,
                              weight: "bold",
                              size: "sm",
                              color: "#4A7348",
                              align: "end",
                              flex: 2,
                            },
                          ],
                        },
                      ]
                    : []),
                ],
              },
            ]
          : []),
        // ไม่ได้แต้ม (เช่น ตัดเครดิต Member) → ไม่ต้องโชว์แถว "+0" ให้สะดุดตา
        ...(show("points") && data.pointsEarned > 0
          ? [
              {
                type: "box",
                layout: "horizontal",
                margin: "lg",
                paddingAll: "12px",
                backgroundColor: "#F4ECE0",
                cornerRadius: "10px",
                contents: [
                  { type: "text", text: st.texts?.pointsLabel || "🎁 แต้มสะสมที่ได้รับ", size: "sm", color: "#5C4033", flex: 3 },
                  {
                    type: "text",
                    text: `+${data.pointsEarned}`,
                    weight: "bold",
                    size: "md",
                    color: "#C4956A",
                    align: "end",
                    flex: 2,
                  },
                ],
              },
            ]
          : []),
        ...(show("closing")
          ? [
              {
                type: "text",
                text: st.closing || `ขอบคุณที่ไว้วางใจ${data.shopName ? ` ${data.shopName}` : "เรา"} นะคะ 🧡`,
                size: "xs",
                color: "#A2907E",
                margin: "lg",
                align: "center",
                wrap: true,
              },
            ]
          : []),
      ],
    },
  };

  return {
    type: "flex",
    altText: `ใบเสร็จ ${data.total} บาท${data.shopName ? ` — ${data.shopName}` : ""}`,
    contents: bubble,
  };
}

/** การ์ดคูปองโปร — ลูกค้ากดรับเก็บเข้ากระเป๋าคูปอง */
export function buildCouponOfferFlex(data: {
  title: string;
  amount: number;
  body?: string;
  url: string;
  validDays?: number;
}, style?: CardStyleConfig) {
  return {
    type: "flex",
    altText: `🎟️ คูปองส่วนลด ${data.amount} บาท — ${data.title}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: style?.headerColor || BRAND_HEADER,
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: style?.texts?.header || "🎟️ คูปองส่วนลดพิเศษ",
            color: style?.headerTextColor || "#FFFFFF",
            weight: "bold",
            size: "sm",
            wrap: true,
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: data.title,
            weight: "bold",
            size: style?.titleSize || "lg",
            color: style?.accentColor || "#5C4033",
            wrap: true,
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            paddingAll: "14px",
            backgroundColor: "#FBF4E9",
            cornerRadius: "12px",
            contents: [
              {
                type: "text",
                text: style?.texts?.amountLabel || "ส่วนลด",
                size: "sm",
                color: "#A2907E",
                align: "center",
              },
              {
                type: "text",
                text: `${data.amount.toLocaleString()} บาท`,
                weight: "bold",
                size: "3xl",
                color: style?.accentColor || "#C4956A",
                align: "center",
              },
            ],
          },
          ...(data.body
            ? [
                {
                  type: "text" as const,
                  text: data.body,
                  size: "sm" as const,
                  color: "#4E3E32",
                  margin: "lg" as const,
                  wrap: true,
                },
              ]
            : []),
          {
            type: "text",
            text: `${style?.closing || "กดรับแล้วเก็บไว้ในกระเป๋าคูปอง ใช้เป็นส่วนลดได้เลย"}${
              data.validDays ? ` (ใช้ได้ ${data.validDays} วัน)` : ""
            } 🧡`,
            size: "xs",
            color: "#A2907E",
            margin: "lg",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: style?.buttonColor || BRAND_ACTION,
            height: "sm",
            action: {
              type: "uri",
              label: style?.texts?.button || "🎟️ กดรับคูปอง",
              uri: data.url,
            },
          },
        ],
      },
    },
  };
}

/** เลือกข้อความขอรีวิวให้ตรงกับบริการที่ใช้จริงในบิล — อาบน้ำ / เข้าพัก / ทั้งคู่ */
export function reviewMessageFor(
  hasGroom: boolean,
  hasRoom: boolean,
  /** ชื่อร้านจาก config — ไม่ส่งมาจะใช้คำว่า "เรา" แทน (ดีกว่าโฆษณาชื่อร้านอื่น) */
  shopName?: string,
  /** ให้แก้ข้อความทั้ง 3 แบบ (ทั้งบ้าน/ห้องพัก/อาบน้ำ) เองได้จากตั้งค่า → การ์ด → ขอรีวิว */
  style?: CardStyleConfig
): {
  title: string;
  body: string;
} {
  const t = style?.texts || {};
  const shop = shopName || "เรา";
  if (hasRoom && hasGroom) {
    return {
      title: t.titleBoth || `🧡 ขอบคุณที่เลือก${shopName ? ` ${shopName}` : ""} ดูแลน้องนะคะ`,
      body:
        t.bodyBoth ||
        "หวังว่าน้องจะกลับบ้านไปพร้อมความสุข และคุณพ่อคุณแม่จะอุ่นใจทุกครั้งที่ใช้บริการกับเรานะคะ 🐾\nถ้าประทับใจในการดูแลของเรา ฝากรีวิวให้ทีมงานสักนิดนะคะ\nทุกรีวิวมีความหมายกับพวกเรามาก และเป็นกำลังใจให้ตั้งใจดูแลน้อง ๆ ทุกตัวต่อไปค่ะ 🤍",
    };
  }
  if (hasRoom) {
    return {
      title: t.titleRoom || `ขอบคุณที่ไว้วางใจ${shopName ? ` ${shopName}` : "เรา"} นะคะ 🧡`,
      body:
        t.bodyRoom ||
        `ตลอดช่วงที่น้องเข้าพัก พวกเราตั้งใจดูแลเหมือนเป็นหนึ่งในครอบครัว\nหวังว่าน้องจะกลับบ้านไปอย่างมีความสุขนะคะ 🐾✨\nหากประทับใจการเข้าพักของน้อง ฝากรีวิวให้${shop} สัก 1 รีวิวนะคะ\nทุกรีวิวมีความหมายกับพวกเรามาก และเป็นกำลังใจให้ตั้งใจดูแลน้อง ๆ ทุกตัวต่อไปค่ะ`,
    };
  }
  // อาบน้ำล้วน (ค่าเริ่มต้นถ้าตรวจไม่พบรายการห้องพัก)
  return {
    title: t.titleGroom || `ขอบคุณที่ไว้วางใจ${shopName ? ` ${shopName}` : "เรา"} นะคะ 🧡`,
    body:
      t.bodyGroom ||
      "หวังว่าน้องจะกลับบ้านไปตัวหอม นุ่มฟู และมีความสุขนะคะ 🐱✨\nถ้าประทับใจบริการของเรา ฝากรีวิวสั้น ๆ ให้ทีมงานหน่อยนะคะ\nรีวิวของคุณคือกำลังใจเล็ก ๆ\nที่ทำให้พวกเราตั้งใจดูแลน้องแมวทุกตัวให้ดีที่สุดเลยค่ะ 💕",
  };
}

/** การ์ดขอรีวิว — ส่งหลังลูกค้าใช้บริการจริง (เช่น วันถัดจากเช็คเอาท์) */
export function buildReviewRequestFlex(data: {
  title: string;
  body: string;
  reviewUrl: string;
  reviewLabel?: string;
}, style?: CardStyleConfig) {
  const st = style || {};
  const show = (k: string) => st.show?.[k] !== false;
  // แยกข้อความเป็นบรรทัดตาม \n ที่คนพิมพ์ตั้งใจขึ้นบรรทัดใหม่ไว้อยู่แล้ว
  // แต่ละบรรทัดสั้นพอที่จะไม่ล้นแล้ววกกลับมาตัดคำ/อิโมจิแปลกๆ กลางประโยค
  const paragraphs = data.body
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (st.closing) paragraphs.push(st.closing);

  return {
    type: "flex",
    altText: data.title,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: st.headerColor || "#FBF4E9",
        paddingAll: "20px",
        spacing: "xs",
        contents: [
          ...(show("stars")
            ? [
                {
                  type: "text",
                  text: st.texts?.stars || "⭐ ⭐ ⭐ ⭐ ⭐",
                  size: "md",
                  align: "center",
                  color: st.accentColor || "#C4956A",
                },
              ]
            : []),
          {
            type: "text",
            text: data.title,
            weight: "bold",
            size: st.titleSize || "md",
            color: st.headerTextColor || "#5C4033",
            align: "center",
            margin: "sm",
            wrap: true,
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "18px",
        spacing: "md",
        contents: paragraphs.map((p) => ({
          type: "text",
          text: p,
          size: "sm",
          color: "#4E3E32",
          wrap: true,
        })),
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        spacing: "sm",
        contents: [
          { type: "separator", color: "#F0E4D4" },
          {
            type: "button",
            style: "primary",
            color: st.buttonColor || "#C4956A",
            height: "md",
            margin: "sm",
            action: {
              type: "uri",
              label: data.reviewLabel || "⭐ รีวิวให้เราหน่อยนะคะ",
              uri: data.reviewUrl,
            },
          },
        ],
      },
    },
  };
}

export function buildMemberBalanceFlex(data: {
  customerName: string;
  memberCredit: number;
  usedToday?: number;
  catName?: string;
}, style?: CardStyleConfig) {
  const show = (k: string) => style?.show?.[k] !== false;
  const contents: Record<string, unknown>[] = [
    {
      type: "text",
      text: style?.texts?.title || "💎 สรุปยอด Member",
      weight: "bold",
      size: style?.titleSize || "lg",
      color: style?.headerColor || "#5C4033",
      wrap: true,
    },
  ];
  if (show("customerName")) {
    contents.push({
      type: "text",
      text: politeName(data.customerName),
      size: "sm",
      color: "#A2907E",
      margin: "md",
      wrap: true,
    });
  }
  contents.push({
    type: "text",
    text: `${style?.texts?.balanceLabel || "คงเหลือ"} ${data.memberCredit.toLocaleString()} บาท`,
    weight: "bold",
    size: "xl",
    color: style?.accentColor || "#C4956A",
    margin: "lg",
    wrap: true,
  });
  if (show("usedToday") && data.usedToday) {
    contents.push({
      type: "text",
      text: `${style?.texts?.usedTodayPrefix || "ใช้วันนี้"} ${data.usedToday.toLocaleString()} บาท${data.catName ? ` · ${politeCat(data.catName)}` : ""}`,
      size: "xs",
      color: "#4E3E32",
      margin: "md",
      wrap: true,
    });
  }
  if (style?.closing) {
    contents.push({
      type: "text",
      text: style.closing,
      size: "xs",
      color: "#A2907E",
      margin: "lg",
      wrap: true,
    });
  }

  return {
    type: "flex",
    altText: `ยอด Member ${data.memberCredit} บาท`,
    contents: {
      type: "bubble",
      body: { type: "box", layout: "vertical", contents },
    },
  };
}

/**
 * การ์ดแพ็กห้องรายเดือน — คืนคงเหลือแยกตามห้อง (แบบการ์ด Member แต่เป็นคืน)
 * + สถานะการจ่าย (จ่ายแล้ว / คงเหลือ / เหลือกี่งวด) — ส่งตอนรับเงินงวด หรือกดส่งเองเพื่อแจ้งคืนคงเหลือ
 */
export function buildRoomPlanFlex(data: {
  customerName: string;
  planName: string;
  nights: { roomLabel: string; total: number; left: number; unit?: "night" | "use" }[];
  /** "package" = คอร์สทั่วไปแบบแบ่งจ่าย (นับครั้ง) — ใช้คำกลางแทน "แพ็กห้อง/คืน" */
  kind?: "room" | "package";
  price: number;
  paid: number;
  remaining: number;
  installmentsLeft: number;
  nextInstallment: number;
  /** ยอดที่เพิ่งรับรอบนี้ (ไม่ใส่ = การ์ดแจ้งคืนคงเหลืออย่างเดียว) */
  thisPayment?: number;
  installmentNo?: number;
}, style?: CardStyleConfig) {
  const tx = (k: string, fb: string) => style?.texts?.[k]?.trim() || fb;
  const row = (label: string, value: string, bold = false, color = "#4E3E32") => ({
    type: "box",
    layout: "horizontal",
    margin: "sm",
    contents: [
      { type: "text", text: label, size: "sm", color: "#A2907E", flex: 5, wrap: true },
      {
        type: "text",
        text: value,
        size: "sm",
        color,
        align: "end",
        flex: 4,
        weight: bold ? "bold" : "regular",
      },
    ],
  });
  const fmt = (n: number) => `${Math.round(n).toLocaleString()} บาท`;
  const totalLeft = data.nights.reduce((n, x) => n + x.left, 0);
  const generic = data.kind === "package";
  const unitOf = (u?: "night" | "use") => (u === "use" || (!u && generic) ? "ครั้ง" : "คืน");
  const mainUnit = unitOf(data.nights[0]?.unit);

  const contents: Record<string, unknown>[] = [
    {
      type: "text",
      text: data.thisPayment
        ? generic
          ? tx("paidTitlePackage", "🧾 รับชำระคอร์สแล้ว")
          : tx("paidTitleRoom", "🧾 รับชำระแพ็กห้องแล้ว")
        : generic
          ? tx("titlePackage", "🎫 คอร์สคงเหลือของคุณ")
          : tx("titleRoom", "🏠 คืนคงเหลือของคุณ"),
      weight: "bold",
      size: style?.titleSize || "lg",
      color: style?.headerColor || "#5C4033",
      wrap: true,
    },
    {
      type: "text",
      text: politeName(data.customerName),
      size: "sm",
      color: "#A2907E",
      margin: "md",
      wrap: true,
    },
    {
      type: "text",
      text: data.planName,
      weight: "bold",
      size: "md",
      color: "#4E3E32",
      margin: "md",
      wrap: true,
    },
  ];

  if (data.thisPayment) {
    contents.push({
      type: "text",
      text: `รับ${data.installmentNo ? `งวดที่ ${data.installmentNo}` : "ชำระ"} ${fmt(data.thisPayment)} เรียบร้อยค่ะ 🧡`,
      size: "sm",
      color: "#6E8B5E",
      weight: "bold",
      margin: "md",
      wrap: true,
    });
  }

  contents.push({
    type: "box",
    layout: "vertical",
    margin: "lg",
    paddingAll: "14px",
    backgroundColor: "#FBF4E9",
    cornerRadius: "12px",
    contents: [
      { type: "text", text: tx("leftLabel", `${mainUnit}ที่ใช้ได้อีก`), size: "xs", color: "#A2907E", align: "center" },
      {
        type: "text",
        text: `${totalLeft} ${mainUnit}`,
        weight: "bold",
        size: "xxl",
        color: style?.accentColor || "#C4956A",
        align: "center",
      },
      ...data.nights.map((n) => row(n.roomLabel, `${n.left} / ${n.total} ${unitOf(n.unit)}`, true)),
    ],
  });

  contents.push({ type: "separator", margin: "lg" });
  contents.push(row(tx("priceLabel", "ยอดแพ็ก"), fmt(data.price)));
  contents.push(row(tx("paidLabel", "จ่ายแล้ว"), fmt(data.paid), false, "#6E8B5E"));
  if (data.remaining > 0) {
    contents.push(row(tx("remainingLabel", "คงเหลือ"), fmt(data.remaining), true, "#C0703A"));
    contents.push(
      row(
        tx("installmentsLabel", "เหลืออีก"),
        data.installmentsLeft > 1
          ? `${data.installmentsLeft} งวด (งวดละ ~${data.nextInstallment.toLocaleString()})`
          : "1 งวด",
        false
      )
    );
    contents.push({
      type: "text",
      text: tx(
        "unpaidNote",
        generic ? "เริ่มใช้คอร์สได้เมื่อชำระครบทุกงวดนะคะ" : "เริ่มใช้คืนได้เมื่อชำระครบทุกงวดนะคะ"
      ),
      size: "xs",
      color: "#C0703A",
      margin: "md",
      wrap: true,
    });
  } else {
    contents.push(row(tx("statusLabel", "สถานะ"), tx("statusPaid", "ชำระครบ ใช้ได้เลย ✅"), true, "#6E8B5E"));
  }
  if (!generic) {
    contents.push({
      type: "text",
      text: style?.closing?.trim() || "พักห้องไหน ระบบหักคืนของห้องนั้นให้ตามจริงนะคะ 🐾",
      size: "xs",
      color: "#A2907E",
      margin: "lg",
      wrap: true,
    });
  }

  return {
    type: "flex",
    altText: data.thisPayment
      ? `รับชำระ${generic ? "คอร์ส" : "แพ็กห้อง"} ${data.thisPayment} บาท · คงเหลือ ${data.remaining} บาท`
      : `${mainUnit}คงเหลือ ${totalLeft} ${mainUnit}`,
    contents: {
      type: "bubble",
      body: { type: "box", layout: "vertical", contents },
    },
  };
}

/** การ์ดแจ้งคอร์สที่ลูกค้าซื้อ/ได้รับ — บอกจำนวนครั้งคงเหลือให้ชัด */
export function buildPackageFlex(data: {
  customerName: string;
  packageName: string;
  totalUses: number;
  usedUses?: number;
  price?: number;
  shopName?: string;
}, style?: CardStyleConfig) {
  const left = Math.max(0, data.totalUses - (data.usedUses || 0));
  const contents: Record<string, unknown>[] = [
    {
      type: "text",
      text: style?.texts?.title || "🎫 คอร์สของคุณ",
      weight: "bold",
      size: style?.titleSize || "lg",
      color: style?.headerColor || "#5C4033",
      wrap: true,
    },
    {
      type: "text",
      text: politeName(data.customerName),
      size: "sm",
      color: "#A2907E",
      margin: "md",
      wrap: true,
    },
    {
      type: "text",
      text: data.packageName,
      weight: "bold",
      size: "md",
      color: "#4E3E32",
      margin: "lg",
      wrap: true,
    },
    {
      type: "box",
      layout: "vertical",
      margin: "lg",
      paddingAll: "14px",
      backgroundColor: "#FBF4E9",
      cornerRadius: "12px",
      contents: [
        { type: "text", text: "ใช้ได้อีก", size: "xs", color: "#A2907E", align: "center" },
        {
          type: "text",
          text: `${left} / ${data.totalUses} ครั้ง`,
          weight: "bold",
          size: "xxl",
          color: style?.accentColor || "#C4956A",
          align: "center",
        },
      ],
    },
    {
      type: "text",
      text:
        style?.closing ||
        "แจ้งร้านได้เลยตอนมาใช้บริการว่าจะหักจากคอร์สนะคะ 🧡",
      size: "xs",
      color: "#A2907E",
      margin: "lg",
      wrap: true,
    },
  ];

  return {
    type: "flex",
    altText: `คอร์ส ${data.packageName} — ใช้ได้อีก ${left} ครั้ง`,
    contents: {
      type: "bubble",
      body: { type: "box", layout: "vertical", contents },
    },
  };
}


/**
 * การ์ดแจ้งลูกค้าว่าได้รับแต้มสะสม — ใช้ได้ทั้งตอนร้านเติมแต้มให้เอง
 * และตอนร้านกดใช้โปรแทนลูกค้า (เช่น ลูกค้ารีวิวร้านให้แล้ว)
 * reason = เหตุผล/ชื่อกิจกรรม ที่ทำให้ได้แต้มก้อนนี้
 */
export function buildPointsAwardFlex(data: {
  customerName: string;
  pointsAwarded: number;
  reason?: string;
  totalPoints?: number;
  shopName?: string;
}, style?: CardStyleConfig) {
  const show = (k: string) => style?.show?.[k] !== false;
  const contents: Record<string, unknown>[] = [
    {
      type: "text",
      text: style?.texts?.title || "🎁 ได้รับแต้มสะสมแล้ว",
      weight: "bold",
      size: style?.titleSize || "lg",
      color: style?.headerColor || "#5C4033",
      wrap: true,
    },
  ];
  if (show("customerName")) {
    contents.push({
      type: "text",
      text: politeName(data.customerName),
      size: "sm",
      color: "#A2907E",
      margin: "md",
      wrap: true,
    });
  }
  contents.push({
    type: "box",
    layout: "horizontal",
    margin: "lg",
    paddingAll: "12px",
    backgroundColor: "#F4ECE0",
    cornerRadius: "10px",
    contents: [
      {
        type: "text",
        text: style?.texts?.pointsLabel || "แต้มที่ได้รับ",
        size: "sm",
        color: "#5C4033",
        flex: 3,
      },
      {
        type: "text",
        text: `+${data.pointsAwarded.toLocaleString()}`,
        size: "xl",
        weight: "bold",
        color: style?.accentColor || "#C4956A",
        align: "end",
        flex: 2,
      },
    ],
  });
  if (show("reason") && data.reason) {
    contents.push({
      type: "text",
      text: `${style?.texts?.reasonLabel || "เหตุผล"}: ${data.reason}`,
      size: "sm",
      color: "#4E3E32",
      margin: "lg",
      wrap: true,
    });
  }
  if (show("totalPoints") && typeof data.totalPoints === "number") {
    contents.push({
      type: "text",
      text: `${style?.texts?.totalLabel || "แต้มสะสมรวมตอนนี้"} ${data.totalPoints.toLocaleString()} แต้ม`,
      size: "xs",
      color: "#A2907E",
      margin: "md",
      wrap: true,
    });
  }
  contents.push({
    type: "text",
    text: style?.closing || `ขอบคุณที่ไว้ใจ${data.shopName ? ` ${data.shopName}` : "เรา"} นะคะ 🧡`,
    size: "xs",
    color: "#A2907E",
    margin: "lg",
    wrap: true,
  });

  return {
    type: "flex",
    altText: `ได้รับ ${data.pointsAwarded} แต้ม${data.reason ? ` — ${data.reason}` : ""}`,
    contents: {
      type: "bubble",
      body: { type: "box", layout: "vertical", contents },
    },
  };
}

/**
 * การ์ด "คิดถึงน้อง" — ทักลูกค้าที่หายไปนาน (ปุ่มในหน้าลูกค้า + ส่งอัตโนมัติ)
 * body = ข้อความตามลูกค้าที่ร้านตั้งไว้ (เติมชื่อ/น้อง/จำนวนวันแล้ว)
 * หัว/หัวข้อ/สี/ปุ่ม แก้ได้ในหน้า "ปรับแต่งการ์ด LINE" → cards.missYou
 */
export function buildMissYouFlex(data: {
  body: string;
  shopName?: string;
  buttons?: { label: string; uri: string }[];
}, style?: CardStyleConfig) {
  const show = (k: string) => style?.show?.[k] !== false;
  const buttonColor = style?.buttonColor || BRAND_ACTION;
  const contents: Record<string, unknown>[] = [];
  const title = style?.texts?.title || MISS_YOU_DEFAULT_TITLE;
  contents.push({
      type: "text",
      text: title,
      weight: "bold",
      size: style?.titleSize || "lg",
    color: "#5C4033",
    wrap: true,
  });
  contents.push({
    type: "text",
    text: data.body,
    size: "sm",
    color: "#4E3E32",
    margin: "md",
    wrap: true,
  });
  if (style?.closing) {
    contents.push({
      type: "text",
      text: style.closing,
      size: "xs",
      color: "#A2907E",
      margin: "lg",
      wrap: true,
    });
  }
  const buttons = (data.buttons || []).slice(0, 3);

  return {
    type: "flex",
    altText: data.body.split("\n")[0].slice(0, 100) || "คิดถึงน้องนะคะ",
    contents: {
      type: "bubble",
      ...(show("header")
        ? {
            header: {
              type: "box",
              layout: "vertical",
              backgroundColor: style?.headerColor || BRAND_HEADER,
              paddingAll: "16px",
              contents: [
                {
                  type: "text",
                  text: style?.texts?.header || `🐾 ${data.shopName || "ร้านของเรา"}`,
                  color: style?.headerTextColor || "#FFFFFF",
                  weight: "bold",
                  size: "md",
                  wrap: true,
                },
              ],
            },
          }
        : {}),
      body: { type: "box", layout: "vertical", paddingAll: "16px", contents },
      ...(buttons.length
        ? {
            footer: {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              contents: buttons.map((b, i) => ({
                type: "button",
                style: i === 0 ? "primary" : "secondary",
                ...(i === 0 ? { color: buttonColor } : {}),
                height: "sm",
                action: { type: "uri", label: b.label.slice(0, 40), uri: b.uri },
              })),
            },
          }
        : {}),
    },
  };
}

/**
 * การ์ด "น้องพร้อมกลับบ้านแล้ว" — ร้านกดปุ่มเดียวตอนอาบเสร็จ/เช็คเอาท์พร้อม
 * ลูกค้ารู้ทันทีโดยไม่ต้องทักมาถามว่าเสร็จหรือยัง (ลดงานตอบแชทไปเยอะ)
 */
export function buildReadyForPickupFlex(data: {
  customerName: string;
  catName: string;
  service: "groom" | "room";
  shopName?: string;
  pickupTime?: string;
}, style?: CardStyleConfig) {
  const show = (k: string) => style?.show?.[k] !== false;
  const contents: Record<string, unknown>[] = [
    {
      type: "text",
      text: style?.texts?.title || "🎉 น้องพร้อมกลับบ้านแล้วค่ะ",
      weight: "bold",
      size: style?.titleSize || "lg",
      color: style?.headerColor || "#5C4033",
      wrap: true,
    },
  ];
  if (show("customerName")) {
    contents.push({
      type: "text",
      text: politeName(data.customerName),
      size: "sm",
      color: "#A2907E",
      margin: "md",
      wrap: true,
    });
  }
  contents.push({
    type: "box",
    layout: "vertical",
    margin: "lg",
    paddingAll: "12px",
    backgroundColor: "#F4ECE0",
    cornerRadius: "10px",
    contents: [
      {
        type: "text",
        text: politeCat(data.catName),
        weight: "bold",
        size: "md",
        color: style?.accentColor || "#C4956A",
        wrap: true,
      },
      {
        type: "text",
        text:
          data.service === "room"
            ? style?.texts?.roomBody || "เช็คเอาท์เรียบร้อย รอคุณแม่มารับได้เลยค่ะ"
            : style?.texts?.groomBody || "อาบน้ำเสร็จเรียบร้อย สวยหล่อพร้อมกลับบ้านแล้วค่ะ",
        size: "sm",
        color: "#4E3E32",
        margin: "sm",
        wrap: true,
      },
    ],
  });
  if (show("pickupTime") && data.pickupTime) {
    contents.push({
      type: "text",
      text: `${style?.texts?.pickupTimeLabel?.trim() || "🚗 เวลาที่แจ้งไว้ว่าจะมารับ"}: ${data.pickupTime} น.`,
      size: "xs",
      color: "#A2907E",
      margin: "md",
      wrap: true,
    });
  }
  contents.push({
    type: "text",
    text: style?.closing || `ขอบคุณที่ไว้ใจ${data.shopName ? ` ${data.shopName}` : "เรา"} นะคะ 🧡`,
    size: "xs",
    color: "#A2907E",
    margin: "lg",
    wrap: true,
  });

  return {
    type: "flex",
    altText: `${politeCat(data.catName)} พร้อมกลับบ้านแล้วค่ะ`,
    contents: {
      type: "bubble",
      body: { type: "box", layout: "vertical", contents },
    },
  };
}
