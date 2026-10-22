import { NextRequest, NextResponse } from "next/server";
import {
  createCalendarEvent,
  updateCalendarEventConfirmed,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "@/lib/calendar";
import {
  addBooking,
  cancelBooking,
  getBooking,
  listBookings,
  toBooking,
  updateBooking,
  deleteBooking,
  addBookingVaccinePhotos,
  setBookingVaccinePhotos,
  type StoredBooking,
} from "@/lib/bookings-store";
import { splitVaccinePhotos } from "@/lib/vaccine-photos";
import { AUTO_MESSAGE_TOPICS } from "@/lib/auto-messages";
import { rescheduleGroup, type DatePatch } from "@/lib/stay-sync";
import { bookingMatchesCustomer } from "@/lib/booking-customer-match";
import { groomProgram, resolveGroomPrograms } from "@/lib/grooming-prices";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { withResolvedTenant, withTenant } from "@/lib/tenant-context";
import { requireCustomerSession } from "@/lib/customer-session";
import { listCustomers, resolveCustomerForBooking } from "@/lib/customers-store";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
import {
  pushLineMessage,
  buildConsentFlex,
  buildPrestayFlex,
  buildTimePickerFlex,
  buildGroomInfoFlex,
  buildDepositRequestFlex,
  buildBillSummaryFlex,
  buildReviewRequestFlex,
  reviewMessageFor,
  buildReceiptFlex,
  buildReadyForPickupFlex,
  buildDepositThanksFlex,
  buildDocRequestFlex,
  politeName,
  politeCat,
} from "@/lib/line";
import { buildBookingConfirmFlex } from "@/lib/booking-line-card";
import {
  findCustomerForBooking,
  recalculateCustomerTier,
  adjustDepositCredit,
  getCatGroomInfo,
  getCustomer,
} from "@/lib/customers-store";
import { getSiteConfig } from "@/lib/config-store";
import { cleanTransport, hasTransport, transportLabel, type BookingTransport } from "@/lib/transport";
import { DEFAULT_MESSAGES, renderTemplate } from "@/lib/messages";
import { listInvoices, updateInvoice, invoiceCatNames, findOpenInvoiceForBooking } from "@/lib/invoices-store";
import { getPaymentConfig } from "@/lib/payment-config";
import {
  buildDepositReminderText,
  buildPrestayFlexData,
  buildCheckinBodyText,
  buildCheckoutBodyText,
  buildGroomInfoBody,
  getBookingTimeUrl,
  getGroomInfoUrl,
  getConsentUrl,
  getPetDocsUrl,
  buildStayInfoBody,
  bookingScheduleText,
} from "@/lib/booking-reminders";

export const dynamic = "force-dynamic";

/** บรรทัดรับ-ส่งในปฏิทิน — ให้คนขับเปิดแผนที่จากปฏิทินได้เลย */
function transportCalendarText(t?: BookingTransport) {
  if (!hasTransport(t)) return "";
  return [
    `\n🚗 ${transportLabel(t)}`,
    t.address ? `จุดรับ-ส่ง: ${t.address}` : "",
    t.mapUrl ? `แผนที่: ${t.mapUrl}` : "ยังไม่ได้ส่งแผนที่",
  ]
    .filter(Boolean)
    .join("\n");
}

function bookingCalendarPayload(b: StoredBooking) {
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

/** หา LINE User ID ปลายทางของนัด (จากตัวนัด หรือจับคู่ลูกค้าในระบบ) */
async function resolveRecipient(
  b: StoredBooking,
  lineUserId?: string
): Promise<string> {
  const direct = String(lineUserId || b.lineUserId || "").trim();
  if (direct) return direct;
  const matched = await findCustomerForBooking(b);
  return matched?.lineUserId || "";
}

const NO_LINE_ERROR =
  "ยังไม่มี LINE User ID — ให้ลูกค้าเปิดแอปจาก LINE หรือผูกในโปรไฟล์ลูกค้า";

/** ล็อกอินหลังบ้านอยู่ไหม — route นี้ใช้ร่วมกันทั้งแอปลูกค้าและหลังบ้าน */
async function getAdminSession(req: NextRequest) {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}

/**
 * บ้านเดียวกัน จองพร้อมกันหลายตัว (ปฏิทินส่ง ids ของทั้งกลุ่มมาใน body.ids) → คืน booking
 * จำลองที่ catName เป็นชื่อรวมทุกตัว ใช้แทน booking เดิมตอนสร้างการ์ด/ข้อความทุกชนิด
 * (ยืนยันนัด/เตรียมตัวเข้าพัก/เงื่อนไข/เลือกเวลา/ยอดคงเหลือ) กันการ์ดโชว์แค่ตัวที่กดจากแถวนั้น
 * ทั้งที่จองมาด้วยกันทั้งบ้าน — ไม่งั้นแต่ละตัวจะได้การ์ดแยก ส่งซ้ำเกินจำเป็น
 */
async function resolveGroupBooking(b: StoredBooking, ids: unknown): Promise<StoredBooking> {
  const list: string[] = Array.isArray(ids) && ids.length > 0 ? ids.map(String) : [b.id];
  if (list.length <= 1) return b;
  const group = (
    await Promise.all(list.map((x) => (x === b.id ? Promise.resolve(b) : getBooking(x))))
  ).filter((x): x is StoredBooking => !!x);
  if (group.length <= 1) return b;
  return { ...b, catName: group.map((x) => x.catName).join(", ") };
}

export async function GET(req: NextRequest) {
  const claimed = req.nextUrl.searchParams.get("lineUserId") || undefined;
  const session = await getAdminSession(req);

  // หลังบ้าน: ใช้ค่าที่ส่งมาตามเดิม (พนักงานอาจดูนัดของลูกค้ารายใดรายหนึ่ง)
  // และต้องไม่หยิบคุกกี้ลูกค้าที่อาจค้างอยู่ในเบราว์เซอร์เดียวกันมาใช้
  if (session) return withTenant(session.tenantId, () => handleGet(claimed));

  // แอปลูกค้า: ยึดตัวตนจากคุกกี้ที่ตรวจกับ LINE แล้ว ไม่ใช่ค่าที่ client ส่งมา
  // ไม่งั้นใครรู้ lineUserId ของคนอื่นก็ดึงนัดทั้งหมดของเขาได้
  return withResolvedTenant(req, async () => {
    // ห้ามตกไปใช้ lineUserId ใน query — LINE ID ของคนเดียวกันซ้ำกันได้ทุกร้านที่อยู่ provider เดียวกัน
    // พนักงานร้านหนึ่งเห็น LINE ID ลูกค้าในหลังบ้าน แล้วเอาไปดึงนัดของคนนั้นจากอีกร้านได้
    const customer = await requireCustomerSession(req);
    const lineUserId = customer?.lineUserId;
    if (!lineUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return handleGet(lineUserId);
  });
}

async function handleGet(lineUserId?: string) {
  const allCustomers = lineUserId ? [] : await listCustomers();
  const items = (await listBookings(lineUserId)).map((b) => {
    const customer = allCustomers.find((c) => bookingMatchesCustomer(b, c));
    // ป้ายเตือนที่พนักงานต้องเห็นก่อนจับน้อง — โน้ตลับร้านอยู่ในนี้ด้วย
    // จึงแนบเฉพาะฝั่งหลังบ้าน (allCustomers ว่างเสมอเมื่อเป็นแอปลูกค้า)
    const cat = customer?.cats.find((c) => c.name === b.catName);
    return {
      ...toBooking(b),
      lineUserId: b.lineUserId,
      service: b.service,
      room: b.room,
      checkin: b.checkin,
      checkout: b.checkout,
      notes: b.notes,
      consentAcceptedAt: b.consentAcceptedAt,
      consentSignature: b.consentSignature,
      vaccinePhotoUrl: b.vaccinePhotoUrl,
      fleaTickTreated: b.fleaTickTreated,
      careNote: b.careNote,
      arrivalTime: b.arrivalTime,
      pickupTime: b.pickupTime,
      groomHealthInfo: b.groomHealthInfo,
      autoOff: b.autoOff || [],
      groomProgram: b.groomProgram,
      transport: b.transport,
      roomUnit: b.roomUnit,
      depositAmount: b.depositAmount,
      depositSlipUrl: b.depositSlipUrl,
      depositStatus: b.depositStatus,
      customerId: customer?.id,
      catMedical: cat?.medical || undefined,
      catStaffNote: cat?.staffNote || undefined,
      catPrivateNote: cat?.staffPrivateNote || undefined,
    };
  });
  return NextResponse.json({ bookings: items });
}

export async function POST(req: NextRequest) {
  // หลังบ้านเท่านั้น — ลูกค้าจองเองมีเส้นทางของตัวเองที่ /api/bookings/self (ตรวจสิทธิ์+ความว่างครบ)
  // route นี้อยู่ใน SHARED_API (middleware ปล่อยผ่าน) ถ้าไม่เช็คตรงนี้ ใครก็สร้างนัด/ลูกค้าปลอมได้
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return withTenant(session.tenantId, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const customer = await resolveCustomerForBooking({
    customerName: body.customerName,
    catName: body.catName,
    lineUserId: body.lineUserId,
    customerId: body.customerId,
    phone: body.phone,
    staffNote: body.notes,
  });
  if (!customer) {
    return NextResponse.json({ error: "cat_name_required" }, { status: 400 });
  }

  const transport = cleanTransport(body.transport);
  const isRoom = body.service === "room";
  const booking = await addBooking({
    customerName: customer.name,
    catName: body.catName,
    service: body.service,
    date: body.date || body.checkin || "",
    time: body.time,
    checkout: body.checkout,
    checkin: body.checkin,
    room: body.room,
    roomUnit: body.roomUnit ? Number(body.roomUnit) || undefined : undefined,
    lineUserId: customer.lineUserId,
    notes: body.notes,
    groomProgram: body.groomProgram ? String(body.groomProgram) : undefined,
    transport,
    // เวลารับ/ส่งที่ร้านรู้แล้ว → ใส่ arrival/pickup ไว้เลย cron จะได้ไม่ถามลูกค้าซ้ำ
    arrivalTime: isRoom ? transport?.pickupTime : undefined,
    pickupTime: isRoom ? transport?.dropoffTime : undefined,
  });

  const cal = await createCalendarEvent({
    summary: `${body.service === "room" ? "🏠" : "🛁"}${hasTransport(booking.transport) ? "🚗" : ""} ${body.catName} (${customer.name})`,
    description: `${body.service === "room" ? "ห้องพัก" : "อาบน้ำ"} · ${body.notes || ""}${transportCalendarText(booking.transport)}`,
    start: body.date || body.checkin,
    end: body.checkout || body.date || body.checkin,
    time: body.time,
    allDay: body.service === "room" && !body.time,
    service: body.service === "room" ? "room" : "groom",
    eventId: booking.id,
  });

  await updateBooking(booking.id, { calendarEventId: cal.eventId });

  const base = process.env.NEXT_PUBLIC_APP_URL || "";
  const icsUrl = `${base}/api/calendar/${booking.id}`;

  await sendTelegram(
    formatBookingTelegram("📌 จองใหม่", {
      ลูกค้า: customer.name,
      น้องแมว: body.catName,
      บริการ: body.service === "room" ? "ห้องพัก" : "อาบน้ำ",
      ...(hasTransport(booking.transport) ? { รับส่ง: transportLabel(booking.transport) } : {}),
      วันที่: `${body.date || body.checkin}${body.time ? ` ${body.time}` : ""}`,
      ปฏิทิน: cal.googleUrl || icsUrl,
    })
  );

  return NextResponse.json({
    ok: true,
    booking: toBooking(booking),
    customerId: customer.id,
    calendar: { ...cal, icsUrl },
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession(req);
  if (session) return withTenant(session.tenantId, () => handlePatch(req, true));
  return withResolvedTenant(req, () => handlePatch(req, false));
}

async function handlePatch(req: NextRequest, admin: boolean) {
  const body = await req.json().catch(() => ({}));
  const { id, action, checkinTime } = body;
  // ลูกค้า (ไม่ได้ล็อกอินหลังบ้าน) ยืนยันตัวด้วยคุกกี้ที่ตรวจกับ LINE แล้วเท่านั้น ห้ามเชื่อ lineUserId ใน body
  const lineUserId: string | undefined = admin
    ? body.lineUserId
    : (await requireCustomerSession(req))?.lineUserId;
  // ดูตัวอย่างการ์ดก่อนส่งจริง — ทำทุกอย่างเหมือนส่งจริงเป๊ะ (ข้อมูล/เงื่อนไขเดียวกัน)
  // แค่ข้ามขั้นตอน push เข้า LINE + การเขียนข้อมูลที่มีผลจริง (เช่น ผูกมัดจำ) เท่านั้น
  const preview = body.preview === true;
  const b = await getBooking(id);
  if (!b) return NextResponse.json({ error: "not found" }, { status: 404 });

  // ลูกค้าใน LINE ทำได้อย่างเดียวคือกดยืนยันนัด "ของตัวเอง"
  // การกระทำอื่นทั้งหมด (ยกเลิก แก้ไข ส่งการ์ด เรียกเก็บเงิน) ต้องล็อกอินหลังบ้าน
  if (!admin) {
    const ownsBooking = !!lineUserId && b.lineUserId === lineUserId;
    if ((action !== "confirm" && action !== "confirm_group") || !ownsBooking) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    // นัดที่ลูกค้าจองเอง — ร้านเท่านั้นที่ยืนยันได้ ต้องกันที่ API ด้วย ไม่ใช่แค่ซ่อนปุ่ม
    // (ไม่งั้นยังจองเอง-ยืนยันเองได้ผ่านการ์ด LINE เก่าหรือยิง API ตรง)
    if (b.selfBooked) {
      return NextResponse.json(
        { error: "waiting_shop_confirm", message: "รอร้านยืนยันคิวนะคะ" },
        { status: 403 }
      );
    }
  }

  let notifyError: string | undefined;
  if (action === "confirm") {
    // ต้องเช็คสถานะ "ก่อน" อัปเดต — กันส่งข้อความซ้ำถ้ากดยืนยันซ้ำ/ลูกค้ากดยืนยันหลังร้านยืนยันไปแล้ว
    const wasNotYetConfirmed = b.status !== "confirmed";
    // เวลาที่เลือกตอนกดยืนยัน = เวลามาส่งน้อง (ที่เดียวกับหน้าเลือกเวลา/หลังบ้าน/แจ้งเตือน)
    await updateBooking(id, {
      status: "confirmed",
      ...(checkinTime ? { checkinTime, arrivalTime: checkinTime } : {}),
    });

    // แจ้งลูกค้าทันทีว่าได้คิวแล้ว — คนละเรื่องกับการ์ดเตือนล่วงหน้าก่อนถึงวันจริง (send_reminder / cron)
    // ส่งเฉพาะตอน "ร้าน" เป็นคนยืนยัน — ลูกค้ากดตอบรับเองในแอปไม่ต้องส่งซ้ำ (เขาเพิ่งกดเองเห็นผลอยู่แล้ว
    // ส่งไปก็เปลืองโควตาข้อความ LINE ฟรี ๆ)
    // ส่งไม่สำเร็จก็ยังยืนยันนัดต่อไปได้ (ไม่บล็อก) แต่ต้องบอก staff ว่าลูกค้าไม่ได้รับ ไม่ใช่เงียบไปเฉยๆ
    if (wasNotYetConfirmed && admin && b.lineUserId) {
      try {
        const cfg = await getSiteConfig();
        if (cfg.automation?.bookingApprovedEnabled !== false) {
          const text = renderTemplate(
            cfg.messages.bookingApprovedText || DEFAULT_MESSAGES.bookingApprovedText,
            {
              shop: cfg.business.name,
              cat: b.catName,
              when: bookingScheduleText(b),
            }
          );
          await pushLineMessage(b.lineUserId, [{ type: "text", text }]);
        }
      } catch (e) {
        notifyError = e instanceof Error ? e.message : String(e);
      }
    }

    if (b.calendarEventId) {
      await updateCalendarEventConfirmed(b.calendarEventId, {
        summary: `${b.service === "room" ? "🏠" : "🛁"} ${b.catName} (${b.customerName})`,
        description: `${b.service === "room" ? "ห้องพัก" : "อาบน้ำ"} · ${b.notes || ""}`,
        start: b.date || b.checkin || "",
        end: b.checkout || b.date || b.checkin || "",
        time: b.time,
        allDay: b.service === "room" && !b.time,
        service: b.service === "room" ? "room" : "groom",
        checkinTime,
      });
    }
    await sendTelegram(
      formatBookingTelegram("✅ ลูกค้ายืนยันแล้ว", {
        ลูกค้า: String(b.customerName),
        น้องแมว: String(b.catName),
        วันที่: String(b.date || b.checkin),
      })
    );
    const matched = await findCustomerForBooking(b);
    if (matched) await recalculateCustomerTier(matched.id);
    const updated = await getBooking(id);
    return NextResponse.json({ ok: true, booking: toBooking(updated!), notifyError });
  }

  // บ้านเดียวกัน จองพร้อมกันหลายตัว → ยืนยันทีเดียวทั้งกลุ่ม แจ้งร้านเป็นข้อความเดียว
  // (เมื่อก่อนลูกค้ากดยืนยันทีละตัว แต่ละตัวยิง Telegram แยก 3-4 ข้อความรัวๆ)
  if (action === "confirm_group") {
    const ids: string[] =
      Array.isArray(body.ids) && body.ids.length > 0 ? body.ids.map(String) : [id];
    const confirmed: (typeof b)[] = [];
    for (const bid of ids) {
      const bk = bid === id ? b : await getBooking(bid);
      if (!bk) continue;
      // ยืนยันได้เฉพาะนัดของตัวเอง แม้จะมาในกลุ่มเดียวกัน — กันแอบยัด id ของคนอื่นปนมา
      if (!admin && !(!!lineUserId && bk.lineUserId === lineUserId)) continue;
      await updateBooking(bk.id, {
        status: "confirmed",
        ...(checkinTime ? { checkinTime, arrivalTime: checkinTime } : {}),
      });
      if (bk.calendarEventId) {
        await updateCalendarEventConfirmed(bk.calendarEventId, {
          summary: `${bk.service === "room" ? "🏠" : "🛁"} ${bk.catName} (${bk.customerName})`,
          description: `${bk.service === "room" ? "ห้องพัก" : "อาบน้ำ"} · ${bk.notes || ""}`,
          start: bk.date || bk.checkin || "",
          end: bk.checkout || bk.date || bk.checkin || "",
          time: bk.time,
          allDay: bk.service === "room" && !bk.time,
          service: bk.service === "room" ? "room" : "groom",
          checkinTime,
        });
      }
      confirmed.push(bk);
    }
    if (confirmed.length === 0) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const first = confirmed[0]!;
    await sendTelegram(
      formatBookingTelegram("✅ ลูกค้ายืนยันแล้ว", {
        ลูกค้า: String(first.customerName),
        น้องแมว: confirmed.map((x) => x!.catName).join(", "),
        วันที่: String(first.date || first.checkin),
      })
    );
    const matched = await findCustomerForBooking(first);
    if (matched) await recalculateCustomerTier(matched.id);
    return NextResponse.json({ ok: true, count: confirmed.length });
  }

  if (action === "send_reminder") {
    let to = String(lineUserId || b.lineUserId || "").trim();
    if (!to) {
      const matched = await findCustomerForBooking(b);
      to = matched?.lineUserId || "";
    }
    if (!to) {
      return NextResponse.json(
        { error: "ยังไม่มี LINE User ID — ให้ลูกค้าเปิดแอปจาก LINE หรือผูกในโปรไฟล์ลูกค้า" },
        { status: 400 }
      );
    }

    try {
      // บ้านเดียวกัน จองพร้อมกันหลายตัว (ปฏิทินส่ง ids ของทั้งกลุ่มมา) → รวมชื่อแมว
      // ทุกตัวในการ์ดเดียว ไม่งั้นการ์ดจะโชว์แค่ตัวที่กดจากแถวนั้น ทั้งที่จองมาด้วยกัน
      const ids: string[] =
        Array.isArray(body.ids) && body.ids.length > 0 ? body.ids.map(String) : [id];
      const group = (
        await Promise.all(ids.map((x) => (x === id ? Promise.resolve(b) : getBooking(x))))
      ).filter((x): x is StoredBooking => !!x);
      const catLabel = group.length > 1 ? group.map((x) => x.catName).join(", ") : b.catName;

      const flex = await buildBookingConfirmFlex({
        id,
        catName: String(catLabel),
        customerName: String(b.customerName),
        service: String(b.service),
        date: b.date,
        time: b.time,
        checkin: b.checkin,
        checkout: b.checkout,
        room: b.room,
        notes: b.notes,
        groomProgram: b.groomProgram,
        transport: b.transport,
      });

      if (preview) return NextResponse.json({ ok: true, preview: [flex] });
      await pushLineMessage(to, [flex]);
      return NextResponse.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

/** นัดเข้าพักใช้การ์ดขอประวัติใบเดียวกัน — เปลี่ยนหัวการ์ด/วันที่ให้ตรงบริการ (ร้านตั้งหัวการ์ดเองไว้ก็ใช้ของร้าน) */
function groomInfoCardFor(b: StoredBooking, cfg: Awaited<ReturnType<typeof getSiteConfig>>) {
  const style = cfg.cards?.groomInfo;
  if (b.service !== "room") {
    return {
      body: buildGroomInfoBody,
      style,
      dateText: b.date
        ? `${style?.texts?.datePrefix || "📅 นัดอาบน้ำ:"} ${b.date}${b.time ? ` ${b.time}` : ""}`
        : undefined,
    };
  }
  return {
    body: buildStayInfoBody,
    style: { ...style, texts: { ...style?.texts, header: style?.texts?.header || "🐾 ข้อมูลน้องก่อนเข้าพัก" } },
    dateText: bookingScheduleText(b),
  };
}

  // ── การ์ดสอบถามประวัติน้องก่อนอาบน้ำ (กดเอง) ──
  if (action === "send_groom_info") {
    const to = await resolveRecipient(b, lineUserId);
    if (!to) {
      return NextResponse.json({ error: NO_LINE_ERROR }, { status: 400 });
    }
    const cfg = await getSiteConfig();
    const url = await getGroomInfoUrl(b.id);
    const card = groomInfoCardFor(b, cfg);
    const flex = buildGroomInfoFlex({
      catName: String(b.catName),
      dateText: card.dateText,
      body: card.body(b, cfg),
      url: url || undefined,
      label: cfg.cards?.groomInfo?.texts?.button || "🩺 แจ้งประวัติน้อง",
    }, card.style);
    try {
      if (preview) return NextResponse.json({ ok: true, preview: [flex] });
      await pushLineMessage(to, [flex]);
      return NextResponse.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // ── การ์ดสอบถามประวัติน้องก่อนอาบน้ำ แบบรวมทั้งบ้าน (หลายตัวพร้อมกัน) — ส่งการ์ดเดียว ลิงก์เดียว กรอกครบทุกตัวในหน้าเดียว ──
  if (action === "send_groom_info_group") {
    const ids: string[] = Array.isArray(body.ids) && body.ids.length > 0 ? body.ids : [id];
    const to = await resolveRecipient(b, lineUserId);
    if (!to) {
      return NextResponse.json({ error: NO_LINE_ERROR }, { status: 400 });
    }
    const bookings = (
      await Promise.all(ids.map((x: string) => getBooking(x)))
    ).filter((x): x is StoredBooking => !!x);
    if (bookings.length === 0) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const cfg = await getSiteConfig();
    const url = await getGroomInfoUrl(bookings.map((x) => x.id));
    const catNames = bookings.map((x) => x.catName).join(", ");
    const card = groomInfoCardFor(b, cfg);
    const flex = buildGroomInfoFlex({
      catName: catNames,
      dateText: card.dateText,
      body: card.body(
        { catName: bookings.length > 1 ? `น้องๆ ${bookings.length} ตัว` : catNames },
        cfg
      ),
      url: url || undefined,
      label:
        bookings.length > 1
          ? `${cfg.cards?.groomInfo?.texts?.button || "🩺 แจ้งประวัติน้อง"} (${bookings.length} ตัว)`
          : cfg.cards?.groomInfo?.texts?.button || "🩺 แจ้งประวัติน้อง",
    }, card.style);
    try {
      if (preview) return NextResponse.json({ ok: true, preview: [flex] });
      await pushLineMessage(to, [flex]);
      return NextResponse.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // ── การ์ดขอสมุดวัคซีน / ขอบัตรประชาชน (กดเองจากการ์ดนัด) — ปุ่มเปิดหน้าแนบรูปของนัดนี้ ──
  if (action === "send_vaccine_request" || action === "send_idcard_request") {
    const to = await resolveRecipient(b, lineUserId);
    if (!to) {
      return NextResponse.json({ error: NO_LINE_ERROR }, { status: 400 });
    }
    const kind = action === "send_vaccine_request" ? "vaccine" : "idcard";
    // จองทั้งบ้าน — ลิงก์เดียวแนบสมุดวัคซีนได้ครบทุกตัว (บัตรประชาชนผูกกับเจ้าของ ใช้นัดเดียวพอ)
    const groupIds: string[] =
      kind === "vaccine" && Array.isArray(body.ids) && body.ids.length > 0 ? body.ids.map(String) : [b.id];
    const url = await getPetDocsUrl(groupIds, kind);
    if (!url) {
      return NextResponse.json(
        { error: "ยังไม่ได้ตั้ง LIFF ID — ไป Admin → ติดตั้ง เพื่อตั้งค่าก่อน" },
        { status: 400 }
      );
    }
    const cfg = await getSiteConfig();
    const gb = await resolveGroupBooking(b, body.ids);
    const flex = buildDocRequestFlex({
      kind,
      businessName: cfg.business.name,
      catName: String(gb.catName),
      dateText: bookingScheduleText(gb),
      url,
    });
    try {
      if (preview) return NextResponse.json({ ok: true, preview: [flex] });
      await pushLineMessage(to, [flex]);
      return NextResponse.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // ── พนักงานแนบ / ลบรูปสมุดวัคซีนของน้องเองในหลังบ้าน (เฉพาะหลังบ้าน — ลูกค้าโดนกันไว้ด้านบนแล้ว) ──
  if (action === "add_vaccine_photos") {
    const photos: string[] = Array.isArray(body.photos)
      ? body.photos.map((v: unknown) => String(v || ""))
      : [];
    const res = await addBookingVaccinePhotos(b.id, photos);
    if (!res.ok) {
      return NextResponse.json(
        { error: res.error === "no_photo" ? "ไม่พบรูปที่แนบ" : "บันทึกไม่สำเร็จ" },
        { status: res.error === "no_photo" ? 400 : 500 }
      );
    }
    return NextResponse.json({ ok: true, vaccinePhotoUrl: res.urls.join("\n") });
  }
  if (action === "remove_vaccine_photo") {
    const target = String(body.url || "");
    const urls = splitVaccinePhotos(b.vaccinePhotoUrl).filter((u) => u !== target);
    const res = await setBookingVaccinePhotos(b.id, urls);
    if (!res.ok) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── การ์ดให้ลูกค้าเลือกเวลาส่ง/รับน้อง (กดเอง) ──
  if (action === "send_checkin_reminder" || action === "send_checkout_reminder") {
    const to = await resolveRecipient(b, lineUserId);
    if (!to) {
      return NextResponse.json({ error: NO_LINE_ERROR }, { status: 400 });
    }
    const cfg = await getSiteConfig();
    // บ้านเดียวกัน จองพร้อมกันหลายตัว — ใช้ booking จำลองที่มีชื่อรวมทุกตัวแทน b เดิม
    const gb = await resolveGroupBooking(b, body.ids);
    const type = action === "send_checkin_reminder" ? "checkin" : "checkout";
    const url = await getBookingTimeUrl(b.id, type);
    const flex =
      type === "checkin"
        ? buildTimePickerFlex({
            title: "🕒 เลือกเวลาเข้าพัก",
            body: buildCheckinBodyText(gb, cfg),
            url: url || undefined,
            label: "🕒 เลือกเวลาส่งน้อง",
          }, cfg.cards?.timePicker)
        : buildTimePickerFlex({
            title: "🕒 เลือกเวลารับน้อง",
            body: buildCheckoutBodyText(gb, cfg),
            url: url || undefined,
            label: "🕒 เลือกเวลารับน้อง",
          }, cfg.cards?.timePicker);
    try {
      if (preview) return NextResponse.json({ ok: true, preview: [flex] });
      await pushLineMessage(to, [flex]);
      return NextResponse.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // ── 📦 ส่งชุดการ์ดที่เลือกเอง — หลายการ์ดใน push เดียว (LINE นับเป็น 1 ข้อความ) ──
  // parts: reminder | prestay | consent | groomInfo | checkin | checkout
  //        | vaccine | idcard | deposit(+depositAmount) | depositThanks | summary | payment
  //        | receipt (เฉพาะบิลที่จ่ายแล้ว) | review
  if (action === "send_bundle") {
    const to = await resolveRecipient(b, lineUserId);
    if (!to) {
      return NextResponse.json({ error: NO_LINE_ERROR }, { status: 400 });
    }
    const parts: string[] = (Array.isArray(body.parts) ? body.parts : [])
      .map(String)
      .slice(0, 5); // LINE จำกัด 5 การ์ดต่อ push
    if (parts.length === 0) {
      return NextResponse.json({ error: "เลือกอย่างน้อย 1 การ์ด" }, { status: 400 });
    }
    const cfg = await getSiteConfig();
    const messages: object[] = [];
    /** การ์ดที่ระบบข้ามให้ พร้อมเหตุผล — ส่งกลับไปบอกพนักงานที่หน้าจอ */
    const skipped: string[] = [];
    // บ้านเดียวกัน จองพร้อมกันหลายตัว (ปฏิทินส่ง ids ของทั้งกลุ่มมา) — ใช้ booking จำลอง
    // ที่มีชื่อรวมทุกตัว แทน b เดิม ทุกการ์ดในชุดจะได้มีชื่อครบทุกตัวเหมือนกันหมด
    const gb = await resolveGroupBooking(b, body.ids);

    for (const part of parts) {
      if (part === "reminder") {
        messages.push(
          await buildBookingConfirmFlex({
            id,
            catName: String(gb.catName),
            customerName: String(b.customerName),
            service: String(b.service),
            date: b.date,
            time: b.time,
            checkin: b.checkin,
            checkout: b.checkout,
            room: b.room,
            notes: b.notes,
            groomProgram: b.groomProgram,
            transport: b.transport,
          })
        );
      } else if (part === "consent") {
        const url = await getConsentUrl(b.id);
        if (url) {
          messages.push(
            buildConsentFlex({
              businessName: cfg.business.name,
              title: cfg.messages.consentTitle || DEFAULT_MESSAGES.consentTitle,
              catName: String(gb.catName),
              checkin: gb.checkin || gb.date,
              checkout: gb.checkout,
              room: gb.room,
              terms: cfg.messages.consentTerms?.length
                ? cfg.messages.consentTerms
                : DEFAULT_MESSAGES.consentTerms,
              url,
            }, cfg.cards?.consent)
          );
        }
      } else if (part === "prestay") {
        // ไม่แนบลิงก์เซ็น — ถ้าต้องการให้ติ๊ก "เงื่อนไข + ลายเซ็น" เพิ่มเอง
        messages.push(
          buildPrestayFlex({
            ...buildPrestayFlexData(gb, cfg),
            consentUrl: undefined,
          }, cfg.cards?.prestay)
        );
      } else if (part === "receipt" || part === "depositThanks") {
        const all = await listInvoices();
        const inv =
          all.find((i) => i.bookingId === b.id && i.status === "paid") ||
          all.find((i) => i.bookingId === b.id);
        if (inv && part === "receipt" && inv.status === "paid") {
          const paidByCredit = inv.paymentMethod === "member_credit";
          // เครดิตปัจจุบัน = ยอดหลังหักบิลนี้ไปแล้ว (บิลถูกปิดไปก่อนถึงจะส่งใบเสร็จได้)
          const creditCustomer =
            paidByCredit && inv.customerId ? await getCustomer(inv.customerId) : null;
          messages.push(
            buildReceiptFlex({
              invoiceId: inv.id,
              customerName: inv.customerName,
              catName: invoiceCatNames(inv),
              total: inv.total,
              discount: inv.discount,
              promoLabel: inv.promoLabel,
              pointsEarned: inv.pointsEarned || 0,
              shopName: cfg.business.name,
              items: (inv.items || []).map((it) => ({ label: it.label, amount: it.amount })),
              memberCreditUsed: paidByCredit ? inv.total : undefined,
              memberCreditLeft: creditCustomer?.memberCredit,
              paymentMethod:
                inv.paymentMethod === "member_credit"
                  ? "Member Credit"
                  : inv.paymentMethod === "cash"
                    ? "เงินสด"
                    : "โอนเงิน",
            }, cfg.cards?.receipt)
          );
        }
        if (inv && part === "depositThanks" && (inv.deposit || 0) > 0) {
          messages.push(
            buildDepositThanksFlex({
              title: cfg.messages.depositThanksTitle,
              body: renderTemplate(cfg.messages.depositThanksBody, {
                name: politeName(inv.customerName),
                cat: politeCat(inv.catName),
                amount: (inv.deposit || 0).toLocaleString(),
              }),
              terms: cfg.messages.depositTerms || [],
              amount: inv.deposit || 0,
            }, cfg.cards?.depositThanks)
          );
        }
      } else if (part === "summary" || part === "review") {
        const all = await listInvoices();
        const inv =
          all.find((i) => i.bookingId === b.id && i.status !== "paid") ||
          all.find((i) => i.bookingId === b.id);
        if (inv && part === "summary") {
          const payment = await getPaymentConfig();
          messages.push(
            buildBillSummaryFlex({
              mode: "booking",
              title: cfg.billing.summaryBookingTitle,
              closing: "",
              customerName: inv.customerName,
              catName: inv.catName,
              scheduleText: bookingScheduleText(b),
              items: inv.items,
              subtotal: inv.subtotal,
              discount: inv.discount,
              promoLabel: inv.promoLabel,
              total: inv.total,
              deposit: inv.deposit || 0,
              remaining: Math.max(0, inv.total - (inv.deposit || 0)),
              bankName: payment.bankName,
              accountNumber: payment.accountNumber,
              accountName: payment.accountName,
            }, cfg.cards?.billSummary)
          );
        }
        if (inv && part === "review") {
          const reviewUrl = cfg.business.reviewUrl || cfg.business.maps;
          if (reviewUrl) {
            const hasGroom = (inv.items || []).some(
              (it) =>
                it.kind === "grooming" ||
                /อาบน้ำ|กรูม|premium|malaseb/i.test(it.label)
            );
            const hasRoom = (inv.items || []).some((it) => /คืน|ห้อง/.test(it.label));
            const msg = reviewMessageFor(hasGroom, hasRoom, cfg.business.name, cfg.cards?.review);
            messages.push(
              buildReviewRequestFlex({
                title: msg.title,
                body: msg.body,
                reviewUrl,
                reviewLabel: cfg.business.reviewButtonText,
              }, cfg.cards?.review)
            );
          }
        }
      } else if (part === "groomInfo") {
        // บ้านเดียวกันมาหลายตัว = ถามประวัติทั้งบ้านในการ์ดเดียว ลิงก์เดียว กรอกครบในหน้าเดียว
        // (เหมือนปุ่มส่งเดี่ยว "สอบถามประวัติ" ไม่ใช่ถามแค่ตัวที่กดมาจากแถวนั้น)
        const groupIds: string[] =
          Array.isArray(body.ids) && body.ids.length > 0
            ? body.ids.map(String)
            : [b.id];
        const groupBookings = (
          await Promise.all(
            groupIds.map((x) => (x === b.id ? Promise.resolve(b) : getBooking(x)))
          )
        ).filter((x): x is StoredBooking => !!x);
        // เคยกรอกประวัติไว้แล้ว → ไม่ถามซ้ำ (ประวัติผูกกับตัวแมว ข้ามนัดก็ยังจำได้)
        // ถ้าอยากถามใหม่จริง ๆ ให้ใช้ปุ่มส่งเดี่ยว "ขอประวัติ" แทน
        const needInfo: StoredBooking[] = [];
        for (const g of groupBookings) {
          const existing = to ? await getCatGroomInfo(to, String(g.catName)) : undefined;
          if (existing) skipped.push(`${g.catName}: เคยกรอกประวัติแล้ว ไม่ขอซ้ำ`);
          else needInfo.push(g);
        }
        if (needInfo.length > 0) {
          const url = await getGroomInfoUrl(needInfo.map((x) => x.id));
          const catNames = needInfo.map((x) => x.catName).join(", ");
          const card = groomInfoCardFor(b, cfg);
          messages.push(
            buildGroomInfoFlex({
              catName: catNames,
              dateText: card.dateText,
              body: card.body(
                { catName: needInfo.length > 1 ? `น้องๆ ${needInfo.length} ตัว` : catNames },
                cfg
              ),
              url: url || undefined,
              label:
                needInfo.length > 1
                  ? `${cfg.cards?.groomInfo?.texts?.button || "🩺 แจ้งประวัติน้อง"} (${needInfo.length} ตัว)`
                  : cfg.cards?.groomInfo?.texts?.button || "🩺 แจ้งประวัติน้อง",
            }, card.style)
          );
        }
      } else if (part === "checkin" && b.arrivalTime) {
        // ลูกค้าเลือกเวลาส่งน้องไว้แล้ว → ไม่ถามซ้ำ (อยากถามใหม่ใช้ปุ่มส่งเดี่ยวแทน)
        skipped.push(`เลือกเวลาเข้าพักไว้แล้ว (${b.arrivalTime}) ไม่ถามซ้ำ`);
      } else if (part === "checkout" && b.pickupTime) {
        skipped.push(`เลือกเวลารับน้องไว้แล้ว (${b.pickupTime}) ไม่ถามซ้ำ`);
      } else if (part === "vaccine" || part === "idcard") {
        const groupIds: string[] =
          part === "vaccine" && Array.isArray(body.ids) && body.ids.length > 0 ? body.ids.map(String) : [b.id];
        const url = await getPetDocsUrl(groupIds, part);
        if (url) {
          messages.push(
            buildDocRequestFlex({
              kind: part,
              businessName: cfg.business.name,
              catName: String(gb.catName),
              dateText: bookingScheduleText(gb),
              url,
            })
          );
        } else skipped.push("ยังไม่ได้ตั้ง LIFF ID — ข้ามการ์ดขอเอกสาร");
      } else if (part === "checkin" || part === "checkout") {
        const url = await getBookingTimeUrl(b.id, part);
        messages.push(
          part === "checkin"
            ? buildTimePickerFlex({
                title: "🕒 เลือกเวลาเข้าพัก",
                body: buildCheckinBodyText(gb, cfg),
                url: url || undefined,
                label: "🕒 เลือกเวลาส่งน้อง",
              }, cfg.cards?.timePicker)
            : buildTimePickerFlex({
                title: "🕒 เลือกเวลารับน้อง",
                body: buildCheckoutBodyText(gb, cfg),
                url: url || undefined,
                label: "🕒 เลือกเวลารับน้อง",
              }, cfg.cards?.timePicker)
        );
      } else if (part === "deposit") {
        const amount = Math.round(Number(body.depositAmount) || 0);
        if (amount > 0) {
          // ผูกมัดจำเหมือนกดปุ่มเรียกเก็บมัดจำเดี่ยว: มีบิลค้าง → ผูกบิล, ไม่มี → เครดิตล่วงหน้า
          // ตอนพรีวิว ข้ามการผูกจริง — แค่โชว์ตัวอย่างการ์ดด้วยยอดเดียวกัน ไม่แตะข้อมูลจริง
          if (!preview) {
            // นับบิลรวมทั้งบ้านด้วย ไม่งั้นมัดจำไปตกเป็นเครดิตล่วงหน้า แล้วบิลจริงไม่มีมัดจำ
            const found = await findOpenInvoiceForBooking(b.id);
            const openInv = found && found.status !== "paid" ? found : undefined;
            const customer = await findCustomerForBooking(b);
            if (openInv) {
              await updateInvoice(openInv.id, { deposit: amount });
            } else if (customer) {
              await adjustDepositCredit(customer.id, amount);
            }
          }
          const payment = await getPaymentConfig();
          messages.push(
            buildDepositRequestFlex({
              title: cfg.messages.depositRequestTitle,
              body: renderTemplate(cfg.messages.depositRequestBody, {
                name: String(b.customerName),
                cat: politeCat(String(b.catName)),
                amount: amount.toLocaleString(),
                pct: "",
              }),
              amount,
              bankName: payment.bankName,
              accountNumber: payment.accountNumber,
              accountName: payment.accountName,
            }, cfg.cards?.depositRequest)
          );
        }
      } else if (part === "payment") {
        const all = await listInvoices();
        const inv =
          all.find((i) => i.bookingId === b.id && i.status !== "paid") ||
          all.find((i) => i.bookingId === b.id);
        if (inv) {
          const payment = await getPaymentConfig();
          const deposit = inv.deposit || 0;
          const mode = deposit > 0 ? "remaining" : "full";
          messages.push(
            buildBillSummaryFlex({
              mode,
              title:
                mode === "remaining"
                  ? cfg.cards?.billSummary?.texts?.remainingTitle || "แจ้งยอดคงเหลือที่ต้องโอน"
                  : cfg.billing.summaryFullTitle,
              closing: "",
              customerName: inv.customerName,
              catName: inv.catName,
              scheduleText: bookingScheduleText(b),
              items: inv.items,
              subtotal: inv.subtotal,
              discount: inv.discount,
              promoLabel: inv.promoLabel,
              total: inv.total,
              deposit,
              remaining: Math.max(0, inv.total - deposit),
              bankName: payment.bankName,
              accountNumber: payment.accountNumber,
              accountName: payment.accountName,
            }, cfg.cards?.billSummary)
          );
        }
      }
    }

    if (messages.length === 0) {
      return NextResponse.json(
        {
          error: skipped.length
            ? `ไม่มีการ์ดให้ส่ง — ${skipped.join(", ")}`
            : "สร้างการ์ดไม่ได้สักใบ — เช็คว่ามีบิล/ตั้งค่า LIFF แล้ว",
        },
        { status: 400 }
      );
    }
    try {
      if (preview) return NextResponse.json({ ok: true, preview: messages, skipped });
      await pushLineMessage(to, messages);
      return NextResponse.json({ ok: true, sent: messages.length, skipped });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // ── ส่งข้อความเตือน (กดเอง) — ใช้ข้อความชุดเดียวกับ cron อัตโนมัติ ──
  if (
    action === "send_prestay" ||
    action === "send_consent" ||
    action === "send_deposit_reminder"
  ) {
    const to = await resolveRecipient(b, lineUserId);
    if (!to) {
      return NextResponse.json({ error: NO_LINE_ERROR }, { status: 400 });
    }
    const cfg = await getSiteConfig();
    // บ้านเดียวกัน จองพร้อมกันหลายตัว — ใช้ booking จำลองที่มีชื่อรวมทุกตัวแทน b เดิม
    const gb = await resolveGroupBooking(b, body.ids);

    // เงื่อนไขก่อนเข้าพัก → ส่งเป็น "การ์ด" พร้อมปุ่มไปหน้ากดยอมรับ
    if (action === "send_consent") {
      const url = await getConsentUrl(b.id);
      if (!url) {
        return NextResponse.json(
          { error: "ยังไม่ได้ตั้ง LIFF ID — ไป Admin → ติดตั้ง เพื่อตั้งค่าก่อน" },
          { status: 400 }
        );
      }
      const flex = buildConsentFlex({
        businessName: cfg.business.name,
        title: cfg.messages.consentTitle || DEFAULT_MESSAGES.consentTitle,
        catName: String(gb.catName),
        checkin: gb.checkin || gb.date,
        checkout: gb.checkout,
        room: gb.room,
        terms: cfg.messages.consentTerms?.length
          ? cfg.messages.consentTerms
          : DEFAULT_MESSAGES.consentTerms,
        url,
      }, cfg.cards?.consent);
      try {
        if (preview) return NextResponse.json({ ok: true, preview: [flex] });
        await pushLineMessage(to, [flex]);
        return NextResponse.json({ ok: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    // แจ้งเข้าพัก → การ์ดเดียว: รายละเอียดเตรียมตัว + ปุ่มไปกดยอมรับเงื่อนไข
    if (action === "send_prestay") {
      // การ์ดแจ้งเข้าพัก = เรื่องเตรียมตัวอย่างเดียว ไม่แนบลิงก์เซ็นแล้ว
      // (เงื่อนไข+ลายเซ็นแยกเป็นปุ่มของตัวเอง จะได้เลือกส่งทีละอย่างได้)
      const flex = buildPrestayFlex({
        ...buildPrestayFlexData(gb, cfg),
        consentUrl: undefined,
      }, cfg.cards?.prestay);
      try {
        if (preview) return NextResponse.json({ ok: true, preview: [flex] });
        await pushLineMessage(to, [flex]);
        return NextResponse.json({ ok: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    let text: string | null = null;
    {
      // send_deposit_reminder — หาใบแจ้งหนี้ที่มีมัดจำและยังค้างยอด
      const invoices = await listInvoices();
      const inv = invoices.find(
        (i) => i.bookingId === b.id && i.status === "pending" && (i.deposit || 0) > 0
      );
      if (!inv) {
        return NextResponse.json(
          { error: "ยังไม่มีบิลที่มีมัดจำค้างยอดของนัดนี้ — สร้างบิล + รับมัดจำก่อน" },
          { status: 400 }
        );
      }
      text = buildDepositReminderText(gb, inv, cfg);
      if (!text) {
        return NextResponse.json(
          { error: "ไม่มียอดคงเหลือที่ต้องโอนแล้ว" },
          { status: 400 }
        );
      }
    }

    try {
      const textMsg = [{ type: "text", text }];
      if (preview) return NextResponse.json({ ok: true, preview: textMsg });
      await pushLineMessage(to, textMsg);
      return NextResponse.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // ── เลื่อนวัน / ต่อคืน ทั้งบ้านในครั้งเดียว + ปรับบิลให้ตรงจำนวนคืน ──
  if (action === "reschedule") {
    const patch: DatePatch = {};
    if (body.date != null) patch.date = String(body.date);
    if (body.time != null) patch.time = String(body.time) || undefined;
    if (body.checkin != null) patch.checkin = String(body.checkin) || undefined;
    if (body.checkout != null) patch.checkout = String(body.checkout) || undefined;
    if (patch.checkin && patch.checkout && patch.checkout <= patch.checkin) {
      return NextResponse.json({ error: "checkout_before_checkin" }, { status: 400 });
    }
    const res = await rescheduleGroup(id, patch, body.applyToGroup !== false);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 404 });

    for (const u of res.updated) {
      if (u.calendarEventId && u.status !== "cancelled") {
        await updateCalendarEvent(u.calendarEventId, bookingCalendarPayload(u));
      }
    }
    const h = res.updated[0];
    const inv = res.invoice;
    await sendTelegram(
      formatBookingTelegram(h?.service === "room" ? "📅 เลื่อนวัน/ต่อคืน" : "📅 เลื่อนนัด", {
        ลูกค้า: String(h?.customerName || ""),
        น้องแมว: res.updated.map((u) => u.catName).join(", "),
        วันที่:
          h?.service === "room"
            ? `${h?.checkin || "-"} → ${h?.checkout || "-"}`
            : `${h?.date || "-"} ${h?.time || ""}`,
        บิล:
          inv.kind === "updated"
            ? `แก้บิลเดิมเป็น ${inv.nights} คืน · ${inv.total} บาท`
            : inv.kind === "created_extra"
              ? `ออกบิลพักต่อ ${inv.nights} คืน · ${inv.total} บาท`
              : inv.kind === "warn"
                ? `⚠️ ${inv.message}`
                : "-",
      })
    );
    return NextResponse.json({
      ok: true,
      movedCount: res.movedCount,
      invoice: res.invoice,
      bookings: res.updated.map(toBooking),
    });
  }

  if (action === "update") {
    const patch: Parameters<typeof updateBooking>[1] = {};
    if (body.customerName != null) patch.customerName = String(body.customerName);
    if (body.catName != null) patch.catName = String(body.catName);
    if (body.service != null) patch.service = body.service;
    if (body.date != null) patch.date = String(body.date);
    if (body.time != null) patch.time = String(body.time) || undefined;
    if (body.checkin != null) patch.checkin = String(body.checkin) || undefined;
    if (body.checkout != null) patch.checkout = String(body.checkout) || undefined;
    if (body.room != null) patch.room = String(body.room) || undefined;
    // ห้องจริงที่ปักหมุด — ส่ง 0 มาคือ "ให้ระบบเดาเอง" (ล้างการปักหมุด) ต้องเก็บเป็น 0 ไม่ใช่
    // undefined ไม่งั้นแยกไม่ออกว่า "ไม่ได้ส่งฟิลด์นี้มา" กับ "ตั้งใจถอนหมุด" แล้วถอนไม่ได้ผล
    if (body.roomUnit != null) patch.roomUnit = Number(body.roomUnit) || 0;
    if (body.notes != null) patch.notes = String(body.notes) || undefined;
    if (body.status != null) patch.status = body.status;
    // เวลาส่ง/รับน้อง — ปกติลูกค้าเลือกเองผ่านการ์ด LINE แต่ร้านรู้เวลาอยู่แล้ว
    // (คุยทางโทรศัพท์/แชทตรง) ก็กรอกแทนให้ลูกค้าได้เลย ไม่ต้องรอลูกค้ากดเลือก
    if (body.arrivalTime != null) patch.arrivalTime = String(body.arrivalTime) || undefined;
    if (body.pickupTime != null) patch.pickupTime = String(body.pickupTime) || undefined;
    // โปรแกรมอาบน้ำ — รับได้เฉพาะ id ที่มีจริง (รวมโปรแกรมที่ร้านเพิ่มเอง, ค่าว่าง = ล้างโปรแกรมออก)
    if (body.groomProgram != null) {
      const pid = String(body.groomProgram);
      const programs = resolveGroomPrograms((await getSiteConfig()).groomPricePrograms);
      patch.groomProgram = pid && groomProgram(pid, programs) ? pid : "";
    }
    // รับ-ส่ง — ส่ง null/{} มา = ยกเลิกบริการรับ-ส่งของนัดนี้
    if (body.transport !== undefined) patch.transport = cleanTransport(body.transport);
    // หัวข้อข้อความอัตโนมัติที่นัดนี้ไม่ต้องส่ง
    if (Array.isArray(body.autoOff)) {
      const valid = new Set(AUTO_MESSAGE_TOPICS.map((t) => t.id));
      patch.autoOff = body.autoOff.map(String).filter((t: string) => valid.has(t));
    }

    const updated = await updateBooking(id, patch);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

    if (updated.calendarEventId && updated.status !== "cancelled") {
      await updateCalendarEvent(updated.calendarEventId, bookingCalendarPayload(updated));
    }

    // แก้ทั้งบ้าน: ตัวแรกแจ้งครั้งเดียวพอ ตัวที่เหลือส่ง silent มา กันแจ้งเตือนรัวทีละตัว
    if (!body.silent) await sendTelegram(
      formatBookingTelegram("✏️ แก้ไขนัด", {
        ลูกค้า: String(updated.customerName),
        น้องแมว: String(updated.catName),
        วันที่: String(updated.date || updated.checkin),
        เวลา: String(updated.time || "-"),
      })
    );

    return NextResponse.json({ ok: true, booking: toBooking(updated) });
  }

  // ── น้องพร้อมกลับบ้าน — กดปุ่มเดียว ลูกค้ารู้ทันที ไม่ต้องโทรมาถามว่าเสร็จยัง ──
  if (action === "set_ready" || action === "set_done" || action === "set_no_show") {
    const status =
      action === "set_ready" ? "ready" : action === "set_done" ? "done" : "no_show";
    const gb = await resolveGroupBooking(b, body.ids);
    const ids: string[] =
      Array.isArray(body.ids) && body.ids.length > 0 ? body.ids.map(String) : [id];
    const cfg = await getSiteConfig();

    // แจ้งลูกค้าเฉพาะตอน "พร้อมรับกลับ" — อีก 2 สถานะเป็นงานหลังบ้านล้วน
    const notify = status === "ready" && body.notify !== false;
    const flex = buildReadyForPickupFlex(
      {
        customerName: String(b.customerName),
        catName: String(gb.catName),
        service: b.service === "room" ? "room" : "groom",
        shopName: cfg.business.name,
        pickupTime: b.pickupTime,
      },
      cfg.cards?.readyForPickup
    );

    if (preview) {
      return NextResponse.json({ ok: true, preview: notify ? [flex] : [] });
    }

    for (const x of ids) {
      const target = x === id ? b : await getBooking(x);
      // กันกดข้ามเคสของบ้านอื่นที่ id หลุดมาใน ids
      if (!target || target.customerName !== b.customerName) continue;
      await updateBooking(x, { status });
    }

    let sent = false;
    if (notify) {
      const to = await resolveRecipient(b, lineUserId);
      if (to) {
        try {
          await pushLineMessage(to, [flex]);
          sent = true;
        } catch {
          /* ส่งไม่ผ่านก็ไม่ย้อนสถานะ — พนักงานเห็นผลที่หน้าจอแล้วแจ้งเองได้ */
        }
      }
    }

    await sendTelegram(
      formatBookingTelegram(
        status === "ready"
          ? "🎉 น้องพร้อมกลับบ้าน"
          : status === "done"
            ? "✅ ปิดงานแล้ว"
            : "🚫 ลูกค้าไม่มาตามนัด",
        {
          ลูกค้า: String(b.customerName),
          น้องแมว: String(gb.catName),
          บริการ: b.service === "room" ? "ห้องพัก" : "อาบน้ำ",
          ...(status === "ready" ? { แจ้งลูกค้า: sent ? "ส่งแล้ว" : "ไม่ได้ส่ง" } : {}),
        }
      )
    );

    return NextResponse.json({ ok: true, sent, status });
  }

  if (action === "cancel") {
    const updated = await cancelBooking(id);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

    if (b.calendarEventId) {
      const del = await deleteCalendarEvent(b.calendarEventId);
      if (!del.ok) {
        await updateCalendarEvent(b.calendarEventId, bookingCalendarPayload(b), {
          cancelled: true,
        });
      }
    }

    await sendTelegram(
      formatBookingTelegram("❌ ยกเลิกนัด", {
        ลูกค้า: String(b.customerName),
        น้องแมว: String(b.catName),
        วันที่: String(b.date || b.checkin),
      })
    );

    return NextResponse.json({ ok: true, booking: toBooking(updated) });
  }

  // ลบนัดทิ้งถาวร — เผื่อลงข้อมูลผิด (คนละเรื่องกับ cancel ที่แค่เปลี่ยนสถานะ)
  if (action === "delete") {
    if (b.calendarEventId) {
      await deleteCalendarEvent(b.calendarEventId);
    }
    await deleteBooking(id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
