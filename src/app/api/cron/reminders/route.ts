import { NextRequest, NextResponse } from "next/server";
import { petWords } from "@/lib/pet-kind";
import { listBookings } from "@/lib/bookings-store";
import { autoMuted } from "@/lib/auto-messages";
import { listInvoices } from "@/lib/invoices-store";
import { getSiteConfig } from "@/lib/config-store";
import { isFeatureOn } from "@/lib/features";
import { buildBookingConfirmFlex } from "@/lib/booking-line-card";
import {
  pushLineMessage,
  buildPrestayFlex,
  buildTimePickerFlex,
  buildReviewRequestFlex,
  buildGroomInfoFlex,
  buildBillSummaryFlex,
  buildConsentFlex,
  buildDocRequestFlex,
  mergeIntakeCards,
  politeCat,
  type IntakeEntry,
} from "@/lib/line";
import { getPaymentConfig } from "@/lib/payment-config";
import { getLineCredentials } from "@/lib/line-config";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
import {
  buildDepositReminderText,
  buildPrestayFlexData,
  buildCheckinBodyText,
  buildGroomInfoBody,
  getBookingTimeUrl,
  checkinPickerSender,
  getGroomInfoUrl,
  getConsentUrl,
  getPetDocsUrl,
  buildStayInfoBody,
  bookingScheduleText,
} from "@/lib/booking-reminders";
import { listCustomers, getCatGroomInfo, getCatStaffNotes, getIntakeStatus } from "@/lib/customers-store";
import type { StoredBooking } from "@/lib/bookings-store";
import { parseGroomInfo, groomInfoSummary } from "@/lib/groom-info";
import { resolveGroomForm } from "@/lib/groom-form";
import { renderTemplate, DEFAULT_MESSAGES } from "@/lib/messages";
import { withTenant } from "@/lib/tenant-context";
import { listActiveTenantIds } from "@/lib/tenant-directory";
import { verifyCronSecret } from "@/lib/cron-auth";
import { groupBookings, groupCatNames } from "@/lib/booking-group";
import { findBirthdayMatch } from "@/lib/birthday-greeting";
import { queueBirthdayGreeting } from "@/lib/birthday-queue";
import { getAppUrlFromEnv } from "@/lib/telegram-config";

function addDays(dateStr: string, n: number) {
  const dt = new Date(`${dateStr}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/**
 * Cron 12:00 น. ไทย (05:00 UTC) — ยืนยันนัดพรุ่งนี้ + เตือนมัดจำ 7 วัน + รายละเอียดเข้าพัก 3 วันก่อน
 * รันแทนทุกร้านที่ยังใช้งานอยู่ — เดิม (จาก CatCha เดี่ยว) รันแค่ร้าน bootstrap ร้านเดียว
 * ทำให้ร้านอื่นในระบบ multi-tenant ไม่เคยได้รับการเตือนอัตโนมัติเลย
 */
export async function GET(req: NextRequest) {
  const denied = verifyCronSecret(req);
  if (denied) return denied;

  const tenantIds = await listActiveTenantIds();
  const results = await Promise.all(
    tenantIds.map(async (tenantId) => {
      try {
        return { tenantId, ...(await withTenant(tenantId, runForTenant)) };
      } catch (e) {
        return { tenantId, ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    })
  );
  return NextResponse.json({ ok: true, tenants: results.length, results });
}

/** LINE รับได้สูงสุด 5 การ์ดต่อ 1 push — เกินนั้นแบ่งส่งเป็นหลายครั้ง */
async function pushInChunks(to: string, messages: object[]) {
  for (let i = 0; i < messages.length; i += 5) {
    await pushLineMessage(to, messages.slice(i, i + 5));
  }
}

/**
 * เรื่องที่ต้องขอก่อนรับน้องที่บ้านนี้ยังขาด (ชุดเดียวกับหน้าข้อมูลลูกค้า) — พ่วงไปกับการ์ดอัตโนมัติรอบนั้น
 * ส่งเฉพาะที่ลูกค้ายังไม่ได้ส่ง และนัดไม่ได้ปิดหัวข้อนั้นไว้ · กฎ + กดยินยอม แยกส่งโดยคนเรียก
 * room = ข้อมูลก่อนเข้าพัก + สมุดวัคซีน + บัตรประชาชน · groom = สมุดวัคซีนอย่างเดียว (ประวัติอาบน้ำมีของเดิมแล้ว)
 * คืนเป็นรายการเรื่อง — คนเรียกรวมเป็นการ์ดใบเดียวด้วย mergeIntakeCards
 */
async function intakeCardsFor(
  group: StoredBooking[],
  mode: "room" | "groom",
  cfg: Awaited<ReturnType<typeof getSiteConfig>>
): Promise<IntakeEntry[]> {
  if (cfg.automation?.intakeAutoEnabled === false) return [];
  const primary = group[0];
  const to = primary.lineUserId;
  if (!to) return [];
  const status = await Promise.all(group.map((x) => getIntakeStatus(String(x.lineUserId || to), x.catName)));
  const out: IntakeEntry[] = [];
  const names = (xs: StoredBooking[]) => xs.map((x) => x.catName).join(", ");

  if (mode === "room") {
    const needStay = group.filter((x, i) => !autoMuted(x, "stayInfo") && !status[i].stayInfo);
    if (needStay.length > 0) {
      const url = await getGroomInfoUrl(needStay.map((x) => x.id), "stay");
      const style = cfg.cards?.groomInfo;
      const btn = style?.texts?.button || "🩺 แจ้งประวัติน้อง";
      out.push({
        kind: "stayInfo",
        url: url || undefined,
        count: needStay.length,
        ids: needStay.map((x) => x.id),
        card: buildGroomInfoFlex(
          {
            catName: names(needStay),
            petEmoji: petWords(cfg).emoji,
            dateText: bookingScheduleText(primary),
            body: buildStayInfoBody(
              { catName: needStay.length > 1 ? `น้องๆ ${needStay.length} ตัว` : names(needStay) },
              cfg
            ),
            url: url || undefined,
            label: needStay.length > 1 ? `${btn} (${needStay.length} ตัว)` : btn,
          },
          // หัวที่ร้านตั้งเองเป็นของการ์ดก่อนอาบน้ำ — นัดเข้าพักใช้หัวเข้าพักเสมอ
          { ...style, texts: { ...style?.texts, header: "🐾 ข้อมูลน้องก่อนเข้าพัก" } }
        ),
      });
    }
  }

  const needVaccine = group.filter(
    (x, i) => !autoMuted(x, "vaccine") && !status[i].vaccine && !x.vaccinePhotoUrl
  );
  if (needVaccine.length > 0) {
    const url = await getPetDocsUrl(needVaccine.map((x) => x.id), "vaccine");
    if (url) {
      out.push({
        kind: "vaccine",
        url,
        count: needVaccine.length,
        ids: needVaccine.map((x) => x.id),
        card: buildDocRequestFlex(
          {
            kind: "vaccine",
            businessName: cfg.business.name,
            catName: names(needVaccine),
            petEmoji: petWords(cfg).emoji,
            dateText: bookingScheduleText(primary),
            url,
          },
          cfg.cards?.docRequest
        ),
      });
    }
  }

  if (mode === "room" && !group.every((x) => autoMuted(x, "idcard")) && !status[0].idCard) {
    const url = await getPetDocsUrl([primary.id], "idcard");
    if (url) {
      out.push({
        kind: "idcard",
        url,
        ids: [primary.id],
        card: buildDocRequestFlex(
          {
            kind: "idcard",
            businessName: cfg.business.name,
            catName: names(group),
            petEmoji: petWords(cfg).emoji,
            dateText: bookingScheduleText(primary),
            url,
          },
          cfg.cards?.docRequest
        ),
      });
    }
  }
  return out;
}

/** การ์ดกฎ + กดยินยอม ของนัดนี้ — ทุกนัดต้องกดยอมรับใหม่ (ลูกค้าเก่าก็ด้วย) ยอมรับแล้วไม่ส่งซ้ำ */
async function consentCardFor(
  group: StoredBooking[],
  b: StoredBooking,
  cfg: Awaited<ReturnType<typeof getSiteConfig>>
): Promise<IntakeEntry | null> {
  if (group.every((x) => autoMuted(x, "consent")) || group.every((x) => x.consentAcceptedAt)) return null;
  const consentUrl = await getConsentUrl(b.id);
  if (!consentUrl) return null;
  const card = buildConsentFlex(
    {
      businessName: cfg.business.name,
      title: cfg.messages.consentTitle || DEFAULT_MESSAGES.consentTitle,
      catName: String(b.catName),
      petEmoji: petWords(cfg).emoji,
      checkin: b.checkin || b.date,
      checkout: b.checkout,
      room: b.room,
      terms: cfg.messages.consentTerms?.length ? cfg.messages.consentTerms : DEFAULT_MESSAGES.consentTerms,
      url: consentUrl,
    },
    cfg.cards?.consent
  );
  return { kind: "consent", url: consentUrl, ids: [b.id], card };
}

async function runForTenant() {
  const cfg = await getSiteConfig();
  const auto = cfg.automation;
  /** การ์ดรวมขอข้อมูลใช้ปุ่มเดียวไล่ทีละหน้า — ต้องมี LIFF ID */
  const liffId = (await getLineCredentials())?.liffId;
  const errors: string[] = [];
  let sent = 0;
  let groomInfoCards = 0;
  let groomBriefs = 0;

  const todayStr = new Date().toISOString().slice(0, 10);
  const allBookings = await listBookings();
  const allInvoices = await listInvoices();

  // ── ยืนยันนัด ล่วงหน้า N วัน (ตั้งค่าได้ · เปิด/ปิดได้) ──
  const confirmDate = addDays(todayStr, auto?.confirmDaysBefore ?? 1);
  const confirmList =
    auto?.confirmTomorrowEnabled === false
      ? []
      : allBookings.filter(
          (b) =>
            b.lineUserId &&
            b.status !== "cancelled" &&
            b.status !== "no_show" &&
            !autoMuted(b, "confirm") &&
            (b.checkin || b.date) === confirmDate
        );
  // บ้านเดียวกัน + นัดเวลาเดียวกัน (จองหลายตัวพร้อมกัน) → รวมเป็นการ์ดยืนยันใบเดียว
  // เมื่อก่อนส่งแยกทีละตัว บ้านที่มี 3 ตัวได้ 3 การ์ดรัวๆ ลิงก์ยืนยันก็ยังใช้ตัวแทนกลุ่มได้
  // เพราะหน้ายืนยันของลูกค้าจัดกลุ่มด้วยกุญแจเดียวกันนี้อยู่แล้ว
  for (const group of groupBookings(confirmList)) {
    const primary = group[0];
    if (!primary.lineUserId) continue;
    try {
      const catLabel = groupCatNames(group);
      // รวมการ์ดของวันนี้ไว้ใน push เดียว (เตือนนัด + ขอประวัติ ถ้าจำเป็น) — นับ 1 ข้อความ LINE
      const dayMessages: object[] = [
        await buildBookingConfirmFlex({
          id: primary.id,
          catName: catLabel,
          customerName: primary.customerName,
          service: primary.service,
          date: primary.date,
          time: primary.time,
          checkin: primary.checkin,
          checkout: primary.checkout,
          room: primary.room,
          notes: primary.notes,
          groomProgram: primary.groomProgram,
          transport: primary.transport,
        }),
      ];

      // เรื่องที่ต้องขอจากลูกค้ารอบนี้ (ประวัติ/สมุดวัคซีน/กฎ) — รวมเป็นการ์ดใบเดียวตอนท้าย
      const intake: IntakeEntry[] = [];

      // นัดอาบน้ำ: เช็คทีละตัวในกลุ่ม — ตัวที่เคยกรอกประวัติแล้วบรีฟให้ร้านทาง Telegram
      // ตัวที่ยังไม่เคย รวมขอในการ์ดเดียว (ลิงก์เดียวกรอกได้ครบทุกตัว เหมือนปุ่มขอประวัติรวม)
      if (auto?.groomInfoEnabled !== false && primary.service === "groom") {
        const checked: { b: typeof primary; info: ReturnType<typeof parseGroomInfo> }[] = [];
        for (const cat of group) {
          if (autoMuted(cat, "groomInfo") || !cat.lineUserId) continue;
          const info = parseGroomInfo(await getCatGroomInfo(cat.lineUserId, cat.catName));
          checked.push({ b: cat, info });
        }
        const alreadyHave = checked.filter((x) => x.info);
        const needInfo = checked.filter((x) => !x.info);

        for (const { b: cat, info } of alreadyHave) {
          // โน้ตนิสัย/โน้ตลับร้าน — สิ่งที่ช่างต้องรู้ก่อนจับน้อง (เช่น กัด ดุตอนอาบ)
          // Telegram เห็นเฉพาะพนักงาน จึงใส่โน้ตลับได้ ลูกค้าไม่เห็น
          const notes = cat.lineUserId
            ? await getCatStaffNotes(cat.lineUserId, cat.catName)
            : undefined;
          await sendTelegram(
            formatBookingTelegram(`🩺 บรีฟก่อนอาบน้ำ: ${cat.catName}`, {
              ลูกค้า: cat.customerName,
              วันนัด: `${cat.date || ""}${cat.time ? ` ${cat.time}` : ""}`,
              ...groomInfoSummary(info!, resolveGroomForm(cfg.groomForm)),
              ...(notes?.medical ? { "โรคประจำตัว/ยา": notes.medical } : {}),
              ...(notes?.staffNote ? { นิสัย: notes.staffNote } : {}),
              ...(notes?.privateNote ? { "🔒 โน้ตลับร้าน": notes.privateNote } : {}),
              ...(cat.notes ? { โน้ตนัดนี้: cat.notes } : {}),
            })
          );
          groomBriefs++;
        }
        // เคยกรอกประวัติแล้ว = ไม่ส่งการ์ดขอประวัติใดๆ อีกเลย (รวมการ์ด "แก้ไข/เพิ่มเติม" ด้วย)
        // ร้านยังได้บรีฟทาง Telegram ด้านบนตามเดิม
        // ยังไม่เคยกรอกประวัติ แต่ร้านเคยจดโน้ตไว้ (เช่น "กัด") — ช่างต้องรู้อยู่ดี
        // ไม่งั้นเคสอันตรายที่สุดคือเคสที่ไม่มีประวัติ กลับเป็นเคสที่ไม่มีใครเตือน
        for (const { b: cat } of needInfo) {
          const notes = cat.lineUserId
            ? await getCatStaffNotes(cat.lineUserId, cat.catName)
            : undefined;
          if (!notes?.privateNote && !notes?.staffNote && !notes?.medical) continue;
          await sendTelegram(
            formatBookingTelegram(`🩺 บรีฟก่อนอาบน้ำ: ${cat.catName}`, {
              ลูกค้า: cat.customerName,
              วันนัด: `${cat.date || ""}${cat.time ? ` ${cat.time}` : ""}`,
              ประวัติ: "ยังไม่เคยกรอก — ขอไปในการ์ดวันนี้แล้ว",
              ...(notes.medical ? { "โรคประจำตัว/ยา": notes.medical } : {}),
              ...(notes.staffNote ? { นิสัย: notes.staffNote } : {}),
              ...(notes.privateNote ? { "🔒 โน้ตลับร้าน": notes.privateNote } : {}),
            })
          );
          groomBriefs++;
        }
        if (needInfo.length > 0) {
          const names = needInfo.map((x) => x.b.catName).join(", ");
          const url = await getGroomInfoUrl(needInfo.map((x) => x.b.id));
          intake.push({
            kind: "info",
            url: url || undefined,
            count: needInfo.length,
            ids: needInfo.map((x) => x.b.id),
            card: buildGroomInfoFlex({
              catName: names,
              petEmoji: petWords(cfg).emoji,
              dateText: primary.date ? `📅 นัดอาบน้ำ: ${primary.date}${primary.time ? ` ${primary.time}` : ""}` : undefined,
              body: buildGroomInfoBody(
                { catName: needInfo.length > 1 ? `น้องๆ ${needInfo.length} ตัว` : names },
                cfg
              ),
              url: url || undefined,
              label:
                needInfo.length > 1
                  ? `🩺 แจ้งประวัติน้อง (${needInfo.length} ตัว)`
                  : "🩺 แจ้งประวัติน้อง",
            }, cfg.cards?.groomInfo),
          });
          groomInfoCards++;
        }
      }

      // นัดอาบน้ำ: ถามสมุดวัคซีน + กฎ/กดยินยอม ที่ยังขาด พ่วงไปกับการ์ดยืนยันเลย
      // (นัดเข้าพักถามในชุดก่อนเข้าพักแทน — ส่งล่วงหน้ากว่า มีเวลาเตรียม)
      if (primary.service === "groom") {
        intake.push(...(await intakeCardsFor(group, "groom", cfg)));
        if (cfg.automation?.intakeAutoEnabled !== false) {
          const consent = await consentCardFor(group, primary, cfg);
          if (consent) intake.push(consent);
        }
      }
      // ขาดหลายเรื่อง = การ์ดใบเดียว ปุ่มเดียวไล่ทีละหน้า (เรื่องเดียว = การ์ดเดิม)
      dayMessages.push(
        ...mergeIntakeCards(
          intake,
          {
            service: primary.service === "room" ? "stay" : "groom",
            catName: catLabel,
            petEmoji: petWords(cfg).emoji,
            businessName: cfg.business.name,
            dateText: bookingScheduleText(primary),
            flow: liffId ? { liffId, by: "b" } : undefined,
          },
          cfg.cards?.intake
        )
      );

      await pushInChunks(primary.lineUserId, dayMessages);
      sent++;
    } catch (e) {
      errors.push(`${primary.id}: ${String(e)}`);
    }
  }

  // ── เตือนก่อนเข้าพัก (ห้องพัก) — จำนวนวันตั้งค่าได้ในหลังบ้าน ──
  const in7 = addDays(todayStr, auto?.depositReminderDays ?? 7);
  const in3 = addDays(todayStr, auto?.prestayReminderDays ?? 3);
  const afterCheckoutReview = addDays(todayStr, -(auto?.reviewRequestDaysAfter ?? 1));

  let depositReminders = 0;
  let prestayReminders = 0;
  let reviewRequests = 0;

  // บ้านเดียวกันเข้าพักพร้อมกันหลายตัว = การ์ดใบเดียว ไม่ใช่ใบต่อแมวหนึ่งตัว
  // (เมื่อก่อนวนทีละนัด บ้านที่ฝาก 3 ตัวจึงได้การ์ดเลือกเวลารับ-ส่งรัวๆ 3 ใบ)
  const roomStays = allBookings.filter(
    (b) =>
      b.service === "room" &&
      b.lineUserId &&
      b.status !== "cancelled" &&
      b.status !== "no_show"
  );
  for (const group of groupBookings(roomStays)) {
    const primary = group[0];
    const ids = group.map((x) => x.id);
    // ใช้ชื่อรวมทุกตัวในการ์ด แต่คงข้อมูลนัดอื่นๆ ของตัวแทนกลุ่มไว้
    const b = { ...primary, catName: groupCatNames(group) };
    const to = String(primary.lineUserId);
    /** ปิดเฉพาะเมื่อปิดครบทุกตัวในบ้าน — ปิดตัวเดียวไม่ควรทำให้ทั้งบ้านเงียบ */
    const groupMuted = (topic: string) => group.every((x) => autoMuted(x, topic));

    // #1 — แจ้งยอดคงเหลือ N วันก่อนเข้าพัก (ถ้ามีมัดจำ + ยังค้าง)
    if (
      auto?.depositReminderEnabled !== false &&
      !groupMuted("deposit") &&
      b.checkin === in7
    ) {
      const inv = allInvoices.find(
        (i) => i.bookingId && ids.includes(i.bookingId) && i.status === "pending" && (i.deposit || 0) > 0
      );
      if (inv) {
        const text = buildDepositReminderText(b, inv, cfg);
        if (text) {
          try {
            await pushLineMessage(to, [{ type: "text", text }]);
            depositReminders++;
          } catch (e) {
            errors.push(`deposit ${b.id}: ${String(e)}`);
          }
        }
        // แจ้งร้านด้วย — ลูกค้าอาจไม่สนใจการ์ดที่ส่งไป กันร้านลืมตามเก็บยอดคงเหลือตอนวันเข้าพักจริง
        const remaining = inv.total - (inv.deposit || 0);
        if (remaining > 0) {
          await sendTelegram(
            formatBookingTelegram("💰 เตือนเก็บยอดคงเหลือ (เข้าพักอีก 7 วัน)", {
              ลูกค้า: b.customerName,
              น้องแมว: String(b.catName),
              เข้าพัก: b.checkin || b.date || "",
              ยอดคงเหลือ: `${remaining.toLocaleString()} บาท`,
            })
          );
        }
      }
    }

    // #4 — ชุดก่อนเข้าพัก N วัน: เตรียมตัว+เงื่อนไข + ยอดคงเหลือ (ถ้ามี) + เลือกเวลาเช็คอิน
    // รวมทั้งหมดใน push เดียว = นับ 1 ข้อความ LINE — ลิงก์ยอมรับชี้ที่นัดนี้เท่านั้น
    if (
      auto?.prestayReminderEnabled !== false &&
      !groupMuted("prestay") &&
      b.checkin === in3
    ) {
      const prestayBundle: object[] = [
        // การ์ดเตรียมตัว (ไม่มีลิงก์เซ็นแล้ว) + การ์ดเงื่อนไข/ลายเซ็น แยกกันคนละใบ
        buildPrestayFlex({
          ...buildPrestayFlexData(b, cfg),
          consentUrl: undefined,
        }, cfg.cards?.prestay),
      ];
      // กฎ + กดยินยอม (ปิดรายนัดได้ ไม่ส่งซ้ำถ้ากดยอมรับนัดนี้แล้ว) + ข้อมูลก่อนเข้าพัก / สมุดวัคซีน /
      // บัตรประชาชน ที่ยังขาด — ขาดหลายเรื่องรวมเป็นการ์ดใบเดียว ปุ่มเดียวไล่ทีละหน้า
      const consent = await consentCardFor(group, b, cfg);
      const intake = [...(consent ? [consent] : []), ...(await intakeCardsFor(group, "room", cfg))];
      prestayBundle.push(
        ...mergeIntakeCards(
          intake,
          {
            service: "stay",
            catName: String(b.catName),
            petEmoji: petWords(cfg).emoji,
            businessName: cfg.business.name,
            dateText: bookingScheduleText(b),
            flow: liffId ? { liffId, by: "b" } : undefined,
          },
          cfg.cards?.intake
        )
      );
      // มีบิลค้าง + มัดจำแล้ว → แนบการ์ดยอดคงเหลือที่ต้องโอนก่อนเข้าพัก
      const pendingInv = allInvoices.find(
        (i) => i.bookingId && ids.includes(i.bookingId) && i.status === "pending" && (i.deposit || 0) > 0
      );
      if (pendingInv && pendingInv.total - (pendingInv.deposit || 0) > 0) {
        const payment = await getPaymentConfig();
        prestayBundle.push(
          buildBillSummaryFlex({
            mode: "remaining",
            title: "แจ้งยอดคงเหลือที่ต้องโอนก่อนเข้าพัก",
            closing: "",
            customerName: pendingInv.customerName,
            catName: pendingInv.catName,
            scheduleText: bookingScheduleText(b),
            items: pendingInv.items,
            subtotal: pendingInv.subtotal,
            discount: pendingInv.discount,
            promoLabel: pendingInv.promoLabel,
            total: pendingInv.total,
            deposit: pendingInv.deposit || 0,
            remaining: Math.max(0, pendingInv.total - (pendingInv.deposit || 0)),
            bankName: payment.bankName,
            accountNumber: payment.accountNumber,
            accountName: payment.accountName,
          }, cfg.cards?.billSummary)
        );
      }
      // แนบการ์ดเลือกเวลาเช็คอินไปเลย — ไม่ต้องรอส่งแยกอีกวัน
      // (ข้ามถ้าเลือกเวลาแล้ว หรือ cron เตือนเช็คอินเป็นคนส่งแทน — บ้านหนึ่งได้การ์ดนี้ใบเดียว)
      if (checkinPickerSender(group, cfg) === "prestay") {
        const checkinUrl = await getBookingTimeUrl(b.id, "checkin");
        prestayBundle.push(
          buildTimePickerFlex({
            title: "🕒 เลือกเวลาเข้าพัก",
            body: buildCheckinBodyText(b, cfg),
            url: checkinUrl || undefined,
            label: "🕒 เลือกเวลาส่งน้อง",
          }, cfg.cards?.timePicker)
        );
      }
      try {
        await pushInChunks(to, prestayBundle);
        prestayReminders++;
      } catch (e) {
        errors.push(`prestay ${b.id}: ${String(e)}`);
      }
    }

    // เตือนเช็คอิน/เช็คเอาท์ (ถามเวลามาส่ง/มารับน้อง) ย้ายไปที่ cron/checkin-checkout
    // แล้ว — เวลาที่ส่งตั้งได้ในหลังบ้าน (เช้า/เที่ยง/หัวค่ำ) จึงต้องมี cron แยกที่รันได้
    // หลายรอบต่อวัน ไม่ใช่ผูกกับรอบเที่ยงของ cron นี้ตัวเดียวเหมือนก่อน

    // ⭐ ขอรีวิว หลังเช็คเอาท์ (แยกจากใบเสร็จ — ลูกค้าใช้บริการจริงแล้ว)
    if (
      auto?.reviewRequestEnabled !== false &&
      !groupMuted("review") &&
      b.checkout &&
      b.checkout === afterCheckoutReview
    ) {
      const reviewUrl = cfg.business.reviewUrl || cfg.business.maps;
      if (reviewUrl) {
        const flex = buildReviewRequestFlex({
          title: "⭐ ขอบคุณที่ใช้บริการค่ะ",
          body: renderTemplate(cfg.messages.reviewRequest, {
            shop: cfg.business.name,
            cat: politeCat(b.catName),
          }),
          reviewUrl,
          reviewLabel: cfg.business.reviewButtonText,
        }, cfg.cards?.review);
        try {
          await pushLineMessage(to, [flex]);
          reviewRequests++;
        } catch (e) {
          errors.push(`review ${b.id}: ${String(e)}`);
        }
      }
    }
  }

  // ── 🎂 คัดกรองวันเกิด (แมว/เจ้าของ) เข้าคิวรอตรวจ — ไม่ส่งอัตโนมัติ ──
  // เดิมส่งทันทีตอนเจอ ข้อความหรือชื่อผิดแก้ทีหลังไม่ได้ ตอนนี้จอดในคิวให้คนตรวจ
  // แล้วกดส่งเองที่ /admin/birthdays — คูปองก็ยังไม่แจกจนกว่าจะกดส่งจริง (ดูใน route นั้น)
  let birthdayQueued = 0;
  const mmdd = todayStr.slice(5); // "MM-DD"
  try {
    if (auto?.birthdayEnabled !== false && isFeatureOn(cfg, "birthdays")) {
      const allCustomers = await listCustomers();
      for (const c of allCustomers) {
        if (!c.lineUserId || c.marketingConsent === false) continue;
        const hit = findBirthdayMatch(c, mmdd);
        if (!hit) continue;
        try {
          const res = await queueBirthdayGreeting({
            customerId: c.id,
            customerName: c.name,
            kind: hit.kind,
            catName: hit.catName,
            forDate: todayStr,
          });
          if (res.queued) birthdayQueued++;
        } catch (e) {
          errors.push(`birthday-queue ${c.id}: ${String(e)}`);
        }
      }
    }
  } catch (e) {
    errors.push(`birthday-scan: ${String(e)}`);
  }

  if (birthdayQueued > 0) {
    const base = getAppUrlFromEnv();
    await sendTelegram(
      formatBookingTelegram("🎂 มีวันเกิดรอตรวจก่อนส่ง", {
        จำนวน: String(birthdayQueued),
        ตรวจที่: base ? `${base}/admin/birthdays` : "หลังบ้าน > วันเกิดลูกค้า",
      })
    );
  }

  if (
    confirmList.length > 0 ||
    depositReminders > 0 ||
    prestayReminders > 0 ||
    reviewRequests > 0 ||
    groomInfoCards > 0 ||
    groomBriefs > 0
  ) {
    await sendTelegram(
      formatBookingTelegram("⏰ เตือนอัตโนมัติ 12:00", {
        ยืนยันนัด: String(confirmList.length),
        ส่งการ์ดสำเร็จ: String(sent),
        แจ้งยอดคงเหลือ: String(depositReminders),
        แจ้งเข้าพัก: String(prestayReminders),
        ขอรีวิว: String(reviewRequests),
        ประวัติก่อนอาบน้ำ: String(groomInfoCards),
        บรีฟก่อนอาบน้ำ: String(groomBriefs),
      })
    );
  }

  // หมายเหตุ: "เตรียมตัวพรุ่งนี้" ย้ายไปส่งรวมกับสรุปปิดวันตอน 2 ทุ่ม (cron/daily-close)
  // แล้ว — ไม่ส่งซ้ำตอนเที่ยงอีก

  return {
    ok: true,
    due: confirmList.length,
    sent,
    depositReminders,
    prestayReminders,
    reviewRequests,
    groomInfoCards,
    groomBriefs,
    birthdayQueued,
    errors,
  };
}
