import { createCalendarEvent } from "./calendar";
import { addBooking, getBooking, listBookings, updateBooking } from "./bookings-store";
import {
  customerSummary,
  findCustomerByCatName,
  resolveCustomerForBooking,
  searchCustomers,
} from "./customers-store";
import { TIER_LABELS } from "./customer-tier";
import { listInvoices } from "./invoices-store";
import { pushLineMessage, buildReminderFlex } from "./line";
import { getSiteConfig } from "./config-store";
import { getLineCredentials, shopAppBase } from "./line-config";
import { formatBookingTelegram, sendTelegram } from "./telegram";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}$/;

function parseService(token: string): "groom" | "room" | null {
  const t = token.toLowerCase();
  if (["อาบ", "groom", "อาบน้ำ"].includes(t)) return "groom";
  if (["ห้อง", "room", "พัก"].includes(t)) return "room";
  return null;
}

/** /book อาบ น้องส้ม 2026-07-15 12:30 [คุณมาย] */
export async function bookFromTelegram(payload: string) {
  const parts = payload.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 3) {
    return {
      ok: false as const,
      message:
        "รูปแบบ:\n" +
        "/book อาบ ชื่อน้อง วันที่ เวลา\n" +
        "/book ห้อง ชื่อน้อง เช็คอิน เช็คเอาท์\n\n" +
        "ตัวอย่าง:\n" +
        "/book อาบ น้องส้ม 2026-07-15 12:30\n" +
        "/book ห้อง น้องมิว 2026-07-15 2026-07-20",
    };
  }

  const service = parseService(parts[0]);
  if (!service) {
    return { ok: false as const, message: "ระบุบริการ: อาบ หรือ ห้อง" };
  }

  const dates = parts.filter((p) => DATE_RE.test(p));
  const times = parts.filter((p) => TIME_RE.test(p));
  const rest = parts.slice(1).filter((p) => !DATE_RE.test(p) && !TIME_RE.test(p));

  if (!dates.length) {
    return { ok: false as const, message: "ระบุวันที่เป็น YYYY-MM-DD" };
  }

  let catName = "";
  let customerName: string | undefined;

  if (service === "groom") {
    if (!times.length) {
      return { ok: false as const, message: "อาบน้ำต้องระบุเวลา เช่น 12:30" };
    }
    catName = rest[0] || "";
    customerName = rest[1];
  } else {
    if (dates.length < 2) {
      return { ok: false as const, message: "ห้องพักต้องระบุเช็คอินและเช็คเอาท์" };
    }
    catName = rest[0] || "";
    customerName = rest[1];
  }

  if (!catName) {
    return { ok: false as const, message: "ระบุชื่อน้อง" };
  }

  const customer = await resolveCustomerForBooking({
    customerName,
    catName,
  });
  if (!customer) {
    return { ok: false as const, message: "ไม่พบลูกค้า — ตรวจชื่อน้อง" };
  }

  const booking = await addBooking({
    customerName: customer.name,
    catName,
    service,
    date: service === "groom" ? dates[0] : "",
    time: service === "groom" ? times[0] : undefined,
    checkin: service === "room" ? dates[0] : dates[0],
    checkout: service === "room" ? dates[1] : undefined,
    lineUserId: customer.lineUserId,
  });

  try {
    const cal = await createCalendarEvent({
      summary: `${service === "room" ? "🏠" : "🛁"} ${catName} (${customer.name})`,
      description: service === "room" ? "ห้องพัก" : "อาบน้ำ",
      start: dates[0],
      end: service === "room" ? dates[1] : dates[0],
      time: service === "groom" ? times[0] : undefined,
      allDay: service === "room",
      service,
      eventId: booking.id,
    });
    await updateBooking(booking.id, { calendarEventId: cal.eventId });
  } catch {
    /* calendar optional */
  }

  const when =
    service === "room"
      ? `${dates[0]} → ${dates[1]}`
      : `${dates[0]} ${times[0]}`;

  await sendTelegram(
    formatBookingTelegram("📌 จองใหม่ (Telegram)", {
      ลูกค้า: customer.name,
      น้อง: catName,
      บริการ: service === "room" ? "ห้องพัก" : "อาบน้ำ",
      วันที่: when,
      รหัส: booking.id,
    })
  );

  return {
    ok: true as const,
    message:
      `✅ บันทึกนัดแล้ว\n` +
      `${customer.name} · ${catName}\n` +
      `${service === "room" ? "ห้องพัก" : "อาบน้ำ"} ${when}\n` +
      `รหัส: ${booking.id}\n\n` +
      `ส่งการ์ดยืนยัน: /confirm ${booking.id}`,
    bookingId: booking.id,
  };
}

/** /summary ชื่อแมว หรือ ชื่อลูกค้า */
export async function customerSummaryForTelegram(query: string) {
  const q = query.trim();
  if (!q) {
    return {
      message:
        "พิมพ์ /summary ชื่อลูกค้าหรือชื่อน้อง\nตัวอย่าง: /summary น้องส้ม",
    };
  }

  const found = await searchCustomers(q);
  const customer = found[0];
  if (!customer) {
    return { message: `ไม่พบ "${q}"` };
  }

  const summary = await customerSummary(customer.id);
  if (!summary) return { message: "ไม่พบข้อมูล" };

  const invoices = await listInvoices(customer.id);
  const pending = invoices.filter((i) => i.status === "pending");
  const pendingTotal = pending.reduce((s, i) => s + i.total, 0);
  const upcoming = summary.history.upcomingBookings.slice(0, 3);

  const lines = [
    `📋 สรุป ${customer.name}${customer.isMember ? " 💎" : ""}`,
    `น้อง: ${customer.cats.map((c) => c.name).join(", ") || "-"}`,
    `แต้ม: ${summary.points} · มาใช้บริการ ${summary.visits} ครั้ง`,
    `เครดิต Member: ${customer.memberCredit.toLocaleString()} บาท`,
  ];

  if (customer.tier) {
    lines.push(`Tier: ${TIER_LABELS[customer.tier] || customer.tier}`);
  }
  if (pending.length) {
    lines.push(`บิลค้างชำระ: ${pending.length} ใบ · ${pendingTotal.toLocaleString()} บาท`);
  }
  if (upcoming.length) {
    lines.push(
      `นัดถัดไป:\n` +
        upcoming
          .map(
            (b) =>
              `· ${b.catName} ${b.date || b.checkin}${b.time ? ` ${b.time}` : ""} (${b.status === "confirmed" ? "✅" : "⏳"})`
          )
          .join("\n")
    );
  }
  if (!customer.lineUserId) {
    lines.push("⚠️ ยังไม่ผูก LINE — ส่งการ์ดยืนยันไม่ได้");
  }

  return { message: lines.join("\n") };
}

async function findBookingForConfirm(
  query: string
): Promise<
  | { kind: "booking"; booking: Awaited<ReturnType<typeof getBooking>> & object }
  | { kind: "ambiguous"; list: Awaited<ReturnType<typeof listBookings>> }
  | { kind: "none" }
> {
  const q = query.trim();
  if (!q) return { kind: "none" };

  const byId = await getBooking(q);
  if (byId && byId.status !== "cancelled") {
    return { kind: "booking", booking: byId };
  }

  const pending = (await listBookings()).filter((b) => b.status === "pending");
  const lower = q.toLowerCase();

  const byExactId = pending.find((b) => b.id.toLowerCase() === lower);
  if (byExactId) return { kind: "booking", booking: byExactId };

  const byCat = pending.filter((b) => b.catName.toLowerCase().includes(lower));
  if (byCat.length === 1) return { kind: "booking", booking: byCat[0] };

  const byCustomer = pending.filter((b) => b.customerName.toLowerCase().includes(lower));
  if (byCustomer.length === 1) return { kind: "booking", booking: byCustomer[0] };

  if (byCat.length > 1) return { kind: "ambiguous", list: byCat };
  if (byCustomer.length > 1) return { kind: "ambiguous", list: byCustomer };

  const byCatName = await findCustomerByCatName(q);
  if (byCatName.length === 1) {
    const match = pending.find(
      (b) => b.catName.toLowerCase() === byCatName[0].cats[0]?.name.toLowerCase()
    );
    if (match) return { kind: "booking", booking: match };
  }

  return { kind: "none" };
}

/** /confirm รหัสนัด หรือ ชื่อแมว — ส่งการ์ดยืนยันให้ลูกค้าทาง LINE */
export async function sendBookingConfirmFromTelegram(query: string) {
  const q = query.trim();

  if (!q) {
    const pending = (await listBookings()).filter((b) => b.status === "pending");
    if (!pending.length) return { message: "⏳ ไม่มีนัดรอยืนยัน" };
    return {
      message:
        `⏳ นัดรอยืนยัน (${pending.length})\n\n` +
        pending
          .slice(0, 8)
          .map(
            (b, i) =>
              `${i + 1}. ${b.id} · ${b.catName}\n   ${b.customerName} · ${b.date || b.checkin} ${b.time || ""}`
          )
          .join("\n\n") +
        `\n\nส่งการ์ด: /confirm รหัสนัด`,
    };
  }

  const found = await findBookingForConfirm(q);

  if (found.kind === "ambiguous") {
    return {
      message:
        `พบหลายนัด — ระบุรหัส:\n` +
        found.list
          .map((b) => `· ${b.id} ${b.catName} ${b.date || b.checkin}`)
          .join("\n"),
    };
  }

  if (found.kind !== "booking") {
    return { message: `ไม่พบนัดรอยืนยัน "${q}"` };
  }

  const b = found.booking;
  if (!b.lineUserId) {
    return {
      message: `❌ ${b.customerName} ยังไม่ผูก LINE — ส่งการ์ดไม่ได้`,
    };
  }

  const liffId = (await getLineCredentials())?.liffId;
  const base = await shopAppBase();
  const confirmUrl = liffId
    ? `https://liff.line.me/${liffId}?path=bookings&id=${b.id}`
    : `${base}/app/bookings`;

  const when =
    b.service === "room"
      ? `${b.checkin || b.date}${b.checkout ? ` → ${b.checkout}` : ""}`
      : `${b.date || b.checkin}${b.time ? ` ${b.time}` : ""}`;

  const cfgTa = await getSiteConfig();
  await pushLineMessage(b.lineUserId, [
    buildReminderFlex({
      id: b.id,
      catName: b.catName,
      customerName: b.customerName,
      service: b.service,
      when,
      confirmUrl,
      // ต้องส่งข้อมูลร้านจาก config เข้าไป ไม่งั้นการ์ดจะกลับไปใช้แผนที่/ชื่อของ PetFlow
      mapsUrl: cfgTa.business.maps,
      location: [cfgTa.business.name, cfgTa.business.location.th]
        .filter(Boolean)
        .join(" · "),
    }, cfgTa.cards?.bookingConfirm),
  ]);

  return {
    message:
      `✅ ส่งการ์ดยืนยันแล้ว\n` +
      `${b.customerName} · ${b.catName}\n` +
      `${when}\n` +
      `รหัส: ${b.id}`,
  };
}
