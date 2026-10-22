import { bookingsForDate, listBookings } from "@/lib/bookings-store";
import { searchCustomers, listCustomers, getCatStaffNotes } from "@/lib/customers-store";
import { todayFinance, monthFinance } from "@/lib/finance-store";
import { salesSummary } from "@/lib/invoices-store";
import { adminDashboardStats, bookingsForMonth } from "@/lib/admin-stats";
import {
  bookFromTelegram,
  customerSummaryForTelegram,
  sendBookingConfirmFromTelegram,
} from "@/lib/telegram-actions";

import { parseTelegramCommand } from "@/lib/telegram";
import { buildTransportSummaryMessage } from "@/lib/transport-summary";

/**
 * สร้างข้อความตารางงานของวันหนึ่ง — อาบน้ำ + เช็คอิน + เช็คเอาท์
 * ปรับหัวข้อได้ (heading) และข้อความตอนว่างได้ (emptyText) เพื่อใช้ซ้ำทั้ง
 * "เตรียมตัวพรุ่งนี้", "สรุปเช้าวันนี้", และท้ายสรุปปิดวัน
 */
export async function buildDayScheduleMessage(
  date: string,
  opts?: { heading?: string; emptyText?: string; includeOngoingStays?: boolean }
) {
  const heading = opts?.heading ?? `🗓️ ตารางงาน (${date})`;
  const all = await listBookings();
  // ยกเลิก/ไม่มา ไม่ต้องขึ้นตารางงาน — ไม่มีอะไรให้ทำแล้ว
  const live = all.filter((b) => b.status !== "cancelled" && b.status !== "no_show");
  // เรียงตามเวลา ให้อ่านเป็นไทม์ไลน์ของวัน — ยังไม่แจ้งเวลาไว้ท้าย
  const byTime = (pick: (b: (typeof live)[number]) => string | undefined) =>
    (a: (typeof live)[number], b: (typeof live)[number]) =>
      (pick(a) || "99").localeCompare(pick(b) || "99");
  const groom = live
    .filter((b) => b.service === "groom" && b.date === date)
    .sort(byTime((b) => b.time));
  const checkin = live
    .filter((b) => b.service === "room" && b.checkin === date)
    .sort(byTime((b) => b.arrivalTime));
  const checkout = live
    .filter((b) => b.service === "room" && b.checkout === date)
    .sort(byTime((b) => b.pickupTime));
  // คำเดียวกับปฏิทินร้าน: "มาส่ง 09:00" / "มารับ 17:00" / "ยังไม่แจ้งเวลา"
  const moveText = (word: string, time?: string) =>
    time ? `${word} ${time} น.` : `${word} · ยังไม่แจ้งเวลา`;
  // ยังพักอยู่วันนี้ แต่ไม่ใช่วันเข้า/ออก — ไม่งั้นแจ้งแค่วันแรกกับวันสุดท้าย ตัวที่พักยาว
  // หลายคืนตรงกลางจะไม่มีใครเห็นโน้ต/เงื่อนไขที่ลูกค้าเซ็นไว้เลยจนกว่าจะถึงวันออก
  const ongoing = opts?.includeOngoingStays
    ? live.filter(
        (b) =>
          b.service === "room" &&
          (b.checkin || "") < date &&
          date < (b.checkout || b.checkin || "")
      )
    : [];
  const total = groom.length + checkin.length + checkout.length + ongoing.length;

  if (total === 0) {
    return `${heading}\n\n${opts?.emptyText ?? "ยังไม่มีนัด/เข้าพัก-ออกพักในระบบค่ะ 🎉"}`;
  }

  const lines: string[] = [heading];
  if (ongoing.length) {
    lines.push(
      `\n🏠 กำลังเข้าพักอยู่ (${ongoing.length}):\n` +
        ongoing
          .map((b, i) => {
            const consent = b.consentAcceptedAt ? "✅ เซ็นแล้ว" : "⏳ ยังไม่เซ็น";
            const note = b.careNote ? ` — 📝 ${b.careNote}` : "";
            return `${i + 1}. ${b.catName} · ${b.customerName} — ห้อง ${b.room || "-"} · ${consent}${note}`;
          })
          .join("\n")
    );
  }
  if (groom.length) {
    // แปะหมายเหตุที่ช่างต้องรู้ก่อนจับน้อง (โน้ตลับร้าน/โรคประจำตัว/โน้ตนัดนี้)
    // Telegram เห็นเฉพาะพนักงาน จึงใส่โน้ตลับได้ ลูกค้าไม่เห็น
    const groomLines = await Promise.all(
      groom.map(async (b, i) => {
        const base = `${i + 1}. ${b.catName} · ${b.customerName} — ${b.time || "ไม่ระบุเวลา"}`;
        const notes = b.lineUserId
          ? await getCatStaffNotes(b.lineUserId, b.catName).catch(() => undefined)
          : undefined;
        const flags = [
          notes?.privateNote ? `🔒 ${notes.privateNote}` : "",
          notes?.medical && notes.medical !== "ไม่มี" ? `💊 ${notes.medical}` : "",
          b.notes ? `📝 ${b.notes}` : "",
        ].filter(Boolean);
        return flags.length ? `${base}\n   ⚠️ ${flags.join(" · ")}` : base;
      })
    );
    lines.push(`\n🛁 นัดอาบน้ำ (${groom.length}):\n` + groomLines.join("\n"));
  }
  if (checkin.length) {
    lines.push(
      `\n🏠 เช็คอิน (${checkin.length}):\n` +
        checkin
          .map(
            (b, i) =>
              `${i + 1}. ${moveText("มาส่ง", b.arrivalTime)} — ${b.catName} · ${b.customerName} · ห้อง ${b.room || "-"}`
          )
          .join("\n")
    );
  }
  if (checkout.length) {
    lines.push(
      `\n🏠 เช็คเอาท์ (${checkout.length}):\n` +
        checkout
          .map(
            (b, i) =>
              `${i + 1}. ${moveText("มารับ", b.pickupTime)} — ${b.catName} · ${b.customerName} · ห้อง ${b.room || "-"}`
          )
          .join("\n")
    );
  }
  lines.push(`\nรวมทั้งหมด: ${total} รายการ`);
  return lines.join("\n");
}

/** สร้างข้อความ "เตรียมตัวพรุ่งนี้" — ใช้ทั้งคำสั่ง /tomorrow และ digest อัตโนมัติตอนเช้า */
export async function buildTomorrowPrepMessage(tomorrow: string) {
  return buildDayScheduleMessage(tomorrow, {
    heading: `🗓️ เตรียมตัวพรุ่งนี้ (${tomorrow})`,
  });
}

/** สรุปเช้า — งานของวันนี้ทั้งหมด ส่งให้ร้านตอนเช้าทุกวัน */
export async function buildMorningSummaryMessage(today: string) {
  return buildDayScheduleMessage(today, {
    heading: `☀️ สรุปเช้า — งานวันนี้ (${today})`,
    emptyText: "วันนี้ยังไม่มีนัด/เข้าพัก-ออกพักในระบบค่ะ พักผ่อนได้เต็มที่ 🐱",
    // แจ้งตัวที่ยังพักอยู่ (ไม่ใช่แค่วันเข้า/วันออก) ทุกเช้า จะได้เห็นโน้ต/สถานะเซ็นเงื่อนไข
    // ของทุกตัวที่ยังอยู่กับร้าน ไม่ใช่แค่วันแรกกับวันสุดท้ายของการพัก
    includeOngoingStays: true,
  });
}

/**
 * สรุปปิดวัน — ยอดรายรับ-รายจ่ายของวันนี้ + ตารางงานพรุ่งนี้ ส่งตอนเย็นทุกวัน
 * ตัวเลขดึงจากบัญชีรายรับ-รายจ่ายชุดเดียวกับหน้า /finance
 */
export async function buildEndOfDaySummaryMessage(today: string, tomorrow: string) {
  const fin = await todayFinance();
  const lines: string[] = [
    `🌙 สรุปปิดวัน (${today})`,
    "",
    `💰 รายรับวันนี้: ${fin.income.toLocaleString()} บาท`,
  ];
  if (fin.expense > 0) {
    lines.push(`💸 รายจ่ายวันนี้: ${fin.expense.toLocaleString()} บาท`);
    lines.push(`🧮 คงเหลือสุทธิ: ${fin.net.toLocaleString()} บาท`);
  }
  lines.push(`📑 รายการทั้งหมด: ${fin.count} รายการ`);
  lines.push("");
  lines.push(await buildDayScheduleMessage(tomorrow, {
    heading: `🗓️ ตารางพรุ่งนี้ (${tomorrow})`,
    emptyText: "พรุ่งนี้ยังไม่มีนัดในระบบค่ะ 🎉",
  }));
  return lines.join("\n");
}

export async function handleTelegramCommand(
  text: string,
  _chatId?: number | string
) {
  const today = new Date().toISOString().slice(0, 10);
  const ym = today.slice(0, 7);
  const { command, payload } = parseTelegramCommand(text);

  if (text === "/help" || command === "/help") {
    return {
      html: true,
      message:
        `🐾 <b>วิธีใช้บอทของร้าน</b>\n\n` +
        `👇 กดปุ่มเมนูด้านล่างได้เลย\n` +
        `📅 นัดวันนี้ · 🌅 เตรียมตัวพรุ่งนี้\n` +
        `⏳ คิวรอยืนยัน · 🗓️ ตารางเดือน\n` +
        `🚗 รับ-ส่งน้อง (วันนี้ + พรุ่งนี้ พร้อมลิงก์แผนที่)\n` +
        `💰 ยอดขาย · 📒 การเงิน\n` +
        `➕ เพิ่มนัด · 📋 สรุปลูกค้า · ✅ ส่งยืนยันนัด\n\n` +
        `<b>เพิ่มนัด</b>\n` +
        `<code>/book อาบ น้องส้ม 2026-07-15 12:30</code>\n` +
        `<code>/book ห้อง น้องมิว 2026-07-15 2026-07-20</code>\n\n` +
        `<b>สรุปลูกค้า</b> <code>/summary ชื่อแมว</code>\n` +
        `<b>ส่งยืนยันนัด</b> <code>/confirm รหัสนัด</code>\n` +
        `<b>ค้นหา</b> <code>/search ชื่อ</code>`,
    };
  }

  if (command === "/today") {
    const list = await bookingsForDate(today);
    if (!list.length) return { message: "📅 วันนี้ยังไม่มีนัดในระบบ" };
    return {
      message:
        `📅 นัดวันนี้ (${today})\n\n` +
        list
          .map(
            (b, i) =>
              `${i + 1}. ${b.catName} · ${b.customerName}\n` +
              `   ${b.service === "room" ? "ห้องพัก" : "อาบน้ำ"} ${b.time || ""} · ${b.status === "confirmed" ? "✅" : "⏳"}`
          )
          .join("\n\n"),
    };
  }

  if (command === "/tomorrow") {
    const tomorrow = new Date(`${today}T12:00:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const message = await buildTomorrowPrepMessage(tomorrow.toISOString().slice(0, 10));
    return { message };
  }

  if (command === "/transport") {
    const tomorrow = new Date(`${today}T12:00:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const [t1, t2] = await Promise.all([
      buildTransportSummaryMessage(today, {
        heading: `🚗 รับ-ส่งวันนี้ (${today})`,
        emptyText: "วันนี้ไม่มีรับ-ส่งค่ะ",
      }),
      buildTransportSummaryMessage(tomorrow.toISOString().slice(0, 10), {
        heading: `🚗 รับ-ส่งพรุ่งนี้ (${tomorrow.toISOString().slice(0, 10)})`,
        emptyText: "พรุ่งนี้ไม่มีรับ-ส่งค่ะ",
      }),
    ]);
    return { html: true, message: `${t1}\n\n${t2}` };
  }

  if (command === "/month") {
    const list = await bookingsForMonth(ym);
    const byDay = new Map<string, number>();
    for (const b of list) {
      const d = b.date || b.checkin || "";
      if (d) byDay.set(d, (byDay.get(d) || 0) + 1);
    }
    const lines = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, n]) => `${d}: ${n} นัด`)
      .join("\n");
    return {
      message: `🗓️ ตาราง ${ym}\nรวม ${list.length} นัด\n\n${lines || "ยังไม่มีนัด"}`,
    };
  }

  if (command === "/queue") {
    const pending = (await listBookings()).filter((b) => b.status === "pending");
    if (!pending.length) return { message: "⏳ ไม่มีคิวรอยืนยัน" };
    return {
      message:
        `⏳ คิวรอยืนยัน (${pending.length})\n\n` +
        pending
          .map(
            (b, i) =>
              `${i + 1}. ${b.id} · ${b.catName} · ${b.customerName}\n   ${b.date || b.checkin} ${b.time || ""}`
          )
          .join("\n\n") +
        `\n\nส่งการ์ด: /confirm รหัสนัด`,
    };
  }

  if (command === "/sales") {
    const s = await salesSummary(today, today);
    const stats = await adminDashboardStats();
    return {
      message:
        `💰 ยอดขายวันนี้ (${today})\n` +
        `รับชำระ: ${s.total.toLocaleString()} บาท (${s.count} บิล)\n` +
        `รอชำระ: ${s.pending} บิล\n` +
        `นัดวันนี้: ${stats.todayAppointments} · รอยืนยัน: ${stats.queue}`,
    };
  }

  if (command === "/finance") {
    const f = await todayFinance();
    const m = await monthFinance(ym);
    return {
      message:
        `📒 การเงินวันนี้\n` +
        `รายรับ: ${f.income.toLocaleString()} บาท\n` +
        `รายจ่าย: ${f.expense.toLocaleString()} บาท\n` +
        `สุทธิ: ${f.net.toLocaleString()} บาท\n\n` +
        `เดือนนี้สุทธิ: ${m.net.toLocaleString()} บาท`,
    };
  }

  if (command === "/book") {
    const result = await bookFromTelegram(payload || "");
    return { message: result.message };
  }

  if (command === "/summary") {
    const result = await customerSummaryForTelegram(payload || "");
    return { message: result.message };
  }

  if (command === "/confirm") {
    const result = await sendBookingConfirmFromTelegram(payload || "");
    return { message: result.message };
  }

  if (command === "/search") {
    const q = payload?.trim() || "";
    if (!q) return { message: "พิมพ์ /search ชื่อลูกค้าหรือชื่อแมว" };
    const found = await searchCustomers(q);
    if (!found.length) return { message: `ไม่พบ "${q}"` };
    return {
      message: found
        .slice(0, 8)
        .map(
          (c, i) =>
            `${i + 1}. ${c.name}${c.isMember ? " 💎" : ""}\n` +
            `   แมว: ${c.cats.map((cat) => cat.name).join(", ")}\n` +
            `   เครดิต: ${c.memberCredit} บาท`
        )
        .join("\n\n"),
    };
  }

  if (command === "/customers") {
    const all = (await listCustomers()).slice(0, 10);
    return {
      message: all
        .map((c, i) => `${i + 1}. ${c.name} · ${c.cats[0]?.name || "-"}`)
        .join("\n"),
    };
  }

  return {
    html: true,
    message: "กดปุ่มเมนูด้านล่าง หรือพิมพ์ <code>/help</code> ดูวิธีใช้",
  };
}
