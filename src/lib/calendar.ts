/**
 * Google Calendar + iPhone (.ics) — ปฏิทินร่วมของร้าน
 */

import type { calendar_v3 } from "googleapis";
import { getGoogleCredentials, isGoogleConfigured } from "./google-config";
import { getSiteConfig } from "./config-store";
import type { StoredBooking } from "./bookings-store";
import { hasTransport, transportLabel, type BookingTransport } from "./transport";

/** อีเมล "เจ้าของปฏิทิน" ของร้านปัจจุบัน — ตั้งค่าได้ต่อร้านในหน้าตั้งค่า ร้านอื่นไม่เห็นค่านี้ */
async function ownerEmails(): Promise<string[]> {
  const cfg = await getSiteConfig();
  return cfg.business.calendarOwnerEmails || [];
}

/** สถานที่ในนัด — ที่อยู่ร้าน (ไม่มีก็ใช้ชื่อร้าน) ห้ามใส่ชื่อระบบ/ร้านอื่น */
async function shopLocation(): Promise<string> {
  const b = (await getSiteConfig()).business;
  return [b.name, b.location?.th].map((x) => x?.trim()).filter(Boolean).join(" · ");
}

const TIMEZONE = "Asia/Bangkok";
const GROOM_DURATION_MIN = 90;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function addDaysYmd(ymd: string, days: number) {
  const d = new Date(`${ymd}T12:00:00+07:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toBangkokDateTime(ymd: string, time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${ymd}T${pad(h)}:${pad(m)}:00+07:00`;
}

function formatBangkokDateTime(d: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(d)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+07:00`;
}

function addMinutesToDateTime(iso: string, minutes: number) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + minutes);
  return formatBangkokDateTime(d);
}

function toIcsUtc(isoDate: string, time?: string) {
  if (!time) {
    return isoDate.replace(/-/g, "");
  }
  const [h, m] = time.split(":").map(Number);
  const d = new Date(`${isoDate}T${pad(h)}:${pad(m)}:00+07:00`);
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

export async function buildIcsContent(event: {
  uid: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  time?: string;
  endTime?: string;
  allDay?: boolean;
}) {
  const dtStart = event.allDay
    ? `DTSTART;VALUE=DATE:${event.start.replace(/-/g, "")}`
    : `DTSTART:${toIcsUtc(event.start, event.time)}`;
  const endDate = event.end || event.start;
  const dtEnd = event.allDay
    ? `DTEND;VALUE=DATE:${addDaysYmd(endDate, 1).replace(/-/g, "")}`
    : `DTEND:${toIcsUtc(endDate, event.endTime || event.time)}`;

  const emails = await ownerEmails();
  const attendees = emails
    .map((email) => `ATTENDEE;CN=${email}:mailto:${email}`)
    .join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Shop Calendar//TH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}@petflow`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString().slice(0, 10), "00:00")}`,
    dtStart,
    dtEnd,
    `SUMMARY:${event.summary}`,
    `DESCRIPTION:${event.description.replace(/\n/g, "\\n")}`,
    `LOCATION:${await shopLocation()}`,
    ...(attendees ? [attendees] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export async function buildGoogleCalendarUrl(event: {
  summary: string;
  description: string;
  start: string;
  end: string;
  time?: string;
  allDay?: boolean;
}) {
  const base = "https://calendar.google.com/calendar/render?action=TEMPLATE";
  const dates = event.allDay
    ? `${event.start.replace(/-/g, "")}/${addDaysYmd(event.end || event.start, 1).replace(/-/g, "")}`
    : `${toIcsUtc(event.start, event.time)}/${toIcsUtc(event.end || event.start, event.time)}`;
  const emails = await ownerEmails();
  const details = emails.length
    ? `${event.description}\n\nเจ้าของ: ${emails.join(", ")}`
    : event.description;
  const params = new URLSearchParams({
    text: event.summary,
    details,
    location: await shopLocation(),
    dates,
  });
  return `${base}&${params.toString()}`;
}

export type CalendarBookingInput = {
  summary: string;
  description: string;
  start: string;
  end: string;
  time?: string;
  allDay?: boolean;
  eventId?: string;
  service?: "room" | "groom";
  bookingId?: string;
};

type CalendarResult = {
  ok: boolean;
  mock?: boolean;
  reason?: string;
  eventId: string;
  ics: string;
  googleUrl: string;
  ownerEmails: string[];
  calendarId?: string;
  htmlLink?: string;
};

async function getCalendarApi() {
  const creds = await getGoogleCredentials();
  if (!creds) throw new Error("google_not_configured");
  const { google } = await import("googleapis");
  const auth = new google.auth.JWT({
    email: creds.serviceAccountEmail,
    key: creds.privateKey,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return google.calendar({ version: "v3", auth });
}

async function buildGoogleEventResource(
  booking: CalendarBookingInput,
  opts?: { confirmed?: boolean }
): Promise<calendar_v3.Schema$Event> {
  const confirmed = opts?.confirmed;
  const summary = confirmed
    ? `✅ ${booking.summary.replace(/^✅\s*/, "")}`
    : booking.summary;

  const emails = await ownerEmails();
  const description = [
    booking.description,
    booking.bookingId ? `— เลขที่จอง ${booking.bookingId}` : "",
    `สถานะ: ${confirmed ? "ยืนยันแล้ว" : "รอยืนยัน"}`,
    emails.length ? `เจ้าของ: ${emails.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const location = await shopLocation();
  const isRoom = booking.service === "room" || booking.allDay;
  const colorId = confirmed ? "10" : isRoom ? "9" : "5";

  if (isRoom) {
    const checkin = booking.start;
    const checkout = booking.end || booking.start;
    return {
      summary,
      description,
      location,
      colorId,
      start: { date: checkin },
      end: { date: addDaysYmd(checkout, 1) },
    };
  }

  const startDt = toBangkokDateTime(booking.start, booking.time || "09:30");
  const endDt = addMinutesToDateTime(startDt, GROOM_DURATION_MIN);

  return {
    summary,
    description,
    location,
    colorId,
    start: { dateTime: startDt, timeZone: TIMEZONE },
    end: { dateTime: endDt, timeZone: TIMEZONE },
  };
}

async function fallbackResult(
  booking: CalendarBookingInput,
  uid: string,
  reason: string
): Promise<CalendarResult> {
  const emails = await ownerEmails();
  const ics = await buildIcsContent({
    uid,
    summary: booking.summary,
    description: emails.length
      ? `${booking.description}\n\nแจ้งเตือน: ${emails.join(", ")}`
      : booking.description,
    start: booking.start,
    end: booking.end,
    time: booking.time,
    allDay: booking.allDay,
  });

  return {
    ok: true,
    mock: true,
    reason,
    eventId: uid,
    ics,
    googleUrl: await buildGoogleCalendarUrl(booking),
    ownerEmails: emails,
  };
}

export async function createCalendarEvent(
  booking: CalendarBookingInput
): Promise<CalendarResult> {
  const uid = booking.eventId || `evt_${Date.now()}`;
  const payload = { ...booking, bookingId: booking.eventId || booking.bookingId };

  if (!(await isGoogleConfigured())) {
    return fallbackResult(payload, uid, "calendar_not_configured");
  }

  try {
    const creds = await getGoogleCredentials();
    if (!creds) return fallbackResult(payload, uid, "calendar_not_configured");

    const calendar = await getCalendarApi();
    const calId = creds.calendarId;
    const resource = await buildGoogleEventResource(payload);

    const res = await calendar.events.insert({
      calendarId: calId,
      requestBody: resource,
      sendUpdates: "none",
    });

    const googleEventId = res.data.id || uid;
    const ics = await buildIcsContent({
      uid: googleEventId,
      summary: booking.summary,
      description: booking.description,
      start: booking.start,
      end: booking.end,
      time: booking.time,
      allDay: booking.allDay,
    });

    return {
      ok: true,
      eventId: googleEventId,
      calendarId: calId,
      htmlLink: res.data.htmlLink || undefined,
      ics,
      googleUrl: res.data.htmlLink || (await buildGoogleCalendarUrl(booking)),
      ownerEmails: await ownerEmails(),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fallbackResult(payload, uid, msg);
  }
}

export async function updateCalendarEventConfirmed(
  googleEventId: string,
  booking: CalendarBookingInput & { checkinTime?: string }
) {
  if (!(await isGoogleConfigured()) || !googleEventId) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    const creds = await getGoogleCredentials();
    if (!creds) return { ok: false, reason: "not_configured" };

    const calendar = await getCalendarApi();
    const calId = creds.calendarId;
    const existing = await calendar.events.get({ calendarId: calId, eventId: googleEventId });
    const base = await buildGoogleEventResource(booking, { confirmed: true });

    const description = [
      existing.data.description || booking.description,
      "สถานะ: ยืนยันแล้ว",
      booking.checkinTime ? `เวลาเช็คอิน: ${booking.checkinTime}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    await calendar.events.patch({
      calendarId: calId,
      eventId: googleEventId,
      requestBody: {
        ...base,
        description,
      },
      sendUpdates: "none",
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateCalendarEvent(
  googleEventId: string,
  booking: CalendarBookingInput,
  opts?: { cancelled?: boolean }
) {
  if (!(await isGoogleConfigured()) || !googleEventId) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    const creds = await getGoogleCredentials();
    if (!creds) return { ok: false, reason: "not_configured" };

    const calendar = await getCalendarApi();
    const calId = creds.calendarId;
    const cancelled = opts?.cancelled;
    const base = await buildGoogleEventResource(booking, { confirmed: false });
    const summary = cancelled
      ? `❌ ยกเลิก — ${booking.summary.replace(/^(✅|❌)\s*/, "")}`
      : booking.summary;

    const emails = await ownerEmails();
    const description = [
      booking.description,
      cancelled ? "สถานะ: ยกเลิกแล้ว" : "สถานะ: แก้ไขนัด",
      emails.length ? `เจ้าของ: ${emails.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    await calendar.events.patch({
      calendarId: calId,
      eventId: googleEventId,
      requestBody: {
        ...base,
        summary,
        description,
        status: cancelled ? "cancelled" : undefined,
      },
      sendUpdates: "none",
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteCalendarEvent(googleEventId: string) {
  if (!(await isGoogleConfigured()) || !googleEventId) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    const creds = await getGoogleCredentials();
    if (!creds) return { ok: false, reason: "not_configured" };

    const calendar = await getCalendarApi();
    await calendar.events.delete({
      calendarId: creds.calendarId,
      eventId: googleEventId,
      sendUpdates: "none",
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** บรรทัดรับ-ส่งในปฏิทิน — ให้คนขับเปิดแผนที่จากปฏิทินได้เลย */
export function transportCalendarText(t?: BookingTransport) {
  if (!hasTransport(t)) return "";
  return [
    `\n🚗 ${transportLabel(t)}`,
    t.address ? `จุดรับ-ส่ง: ${t.address}` : "",
    t.mapUrl ? `แผนที่: ${t.mapUrl}` : "ยังไม่ได้ส่งแผนที่",
  ]
    .filter(Boolean)
    .join("\n");
}

/** ข้อมูลนัดสำหรับสร้าง/แก้ event ใน Google Calendar */
export function bookingCalendarPayload(b: StoredBooking) {
  return {
    summary: `${b.service === "room" ? "🏠" : "🛁"}${hasTransport(b.transport) ? "🚗" : ""} ${b.catName} (${b.customerName})`,
    description: `${b.service === "room" ? "ห้องพัก" : "อาบน้ำ"} · ${b.notes || ""}${transportCalendarText(b.transport)}`,
    start: b.date || b.checkin || "",
    end: b.checkout || b.date || b.checkin || "",
    time: b.time,
    allDay: b.service === "room" && !b.time,
    service: b.service === "room" ? ("room" as const) : ("groom" as const),
    eventId: b.id,
  };
}
