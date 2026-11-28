import { listBookings, type StoredBooking } from "./bookings-store";
import { listCustomers } from "./customers-store";
import { bookingMatchesCustomer } from "./booking-customer-match";
import { groupBookings, groupCatNames, stayForGroom } from "./booking-group";
import { hasTransport } from "./transport";
import { listInvoicesForBookings } from "./invoices-store";
import { bookingExtras, extrasForCat, relatedBookingIds } from "./booking-extras";
import { roomOn } from "./room-segments";

/**
 * เตือนร้านอีกครั้งก่อนถึงเวลานัด ~3 ชั่วโมง (เจ้าของขอ 2026-11-28)
 * — อาบน้ำ / ลูกค้ามาส่งน้อง (วันเข้าพัก) / ลูกค้ามารับน้อง (วันออก)
 * — ถ้าร้านต้องไปรับ-ส่ง บอกเบอร์ แผนที่ ที่อยู่ · มีงานเพิ่มในบิล (ไถขน อาบน้ำ ฯลฯ) ก็บอกด้วย
 *
 * cron รันทุกชั่วโมงตรง แต่ละรอบเตือนนัดที่เวลาอยู่ในช่วง (ชั่วโมงนี้+2 ชม., ชั่วโมงนี้+3 ชม.]
 * เช่น รอบ 07:xx → นัด 09:01–10:00 · นัดแต่ละอันถูกเตือนครั้งเดียวโดยไม่ต้องจดในฐานข้อมูล
 * (อิงชั่วโมง ไม่ใช่นาที — cron ช้าไปไม่กี่นาทีก็ไม่หลุดช่วง)
 */

type Kind = "groom" | "in" | "out";
type Event = { kind: Kind; time: string; group: StoredBooking[]; inStay?: boolean };

const live = (b: StoredBooking) => b.status !== "cancelled" && b.status !== "no_show";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s: string) {
  return esc(s).replace(/"/g, "&quot;");
}

function toMin(t?: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function prevDay(date: string) {
  return new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

/** นัดของวันนี้ที่เวลาอยู่ในช่วง (fromMin, toMin] */
export function upcomingEvents(all: StoredBooking[], date: string, fromMin: number, untilMin: number): Event[] {
  const list = all.filter(live);
  const inWindow = (t?: string) => {
    const m = toMin(t);
    return m != null && m > fromMin && m <= untilMin;
  };
  const out: Event[] = [];
  for (const g of groupBookings(list.filter((b) => b.service === "groom" && b.date === date))) {
    if (inWindow(g[0].time)) out.push({ kind: "groom", time: g[0].time!, group: g, inStay: g.every((b) => !!stayForGroom(b, list)) });
  }
  const stays = list.filter((b) => b.service === "room");
  for (const g of groupBookings(stays.filter((b) => (b.checkin || b.date) === date))) {
    const t = g.find((b) => b.arrivalTime)?.arrivalTime;
    if (inWindow(t)) out.push({ kind: "in", time: t!, group: g });
  }
  for (const g of groupBookings(stays.filter((b) => b.checkout === date && b.checkout !== (b.checkin || b.date)))) {
    const t = g.find((b) => b.pickupTime)?.pickupTime;
    if (inWindow(t)) out.push({ kind: "out", time: t!, group: g });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * ข้อความเตือนของชั่วโมงนี้ (HTML) — ไม่มีนัดเข้าช่วง = null (cron จะไม่ส่ง)
 * nowHour = ชั่วโมงปัจจุบันตามเวลาไทย (0–23)
 */
export async function buildUpcomingReminderMessage(
  date: string,
  nowHour: number,
  opts?: { leadHours?: number; roomName?: (id?: string) => string; inBranch?: (b: StoredBooking) => boolean; heading?: string }
): Promise<string | null> {
  const lead = opts?.leadHours ?? 3;
  const all = await listBookings();
  const scoped = opts?.inBranch ? all.filter(opts.inBranch) : all;
  const events = upcomingEvents(scoped, date, (nowHour + lead - 1) * 60, (nowHour + lead) * 60);
  if (!events.length) return null;

  const live2 = all.filter(live);
  const rows = events.flatMap((e) => e.group);
  const [customers, invoices] = await Promise.all([
    listCustomers().catch(() => []),
    listInvoicesForBookings(Array.from(relatedBookingIds(rows, live2))).catch(() => []),
  ]);
  const roomName = opts?.roomName ?? ((id?: string) => id || "-");

  const lines: string[] = [`⏰ <b>อีกราว ${lead} ชั่วโมงมีนัด</b> (${date})${opts?.heading ? `\n${esc(opts.heading)}` : ""}`];
  for (const e of events) {
    const first = e.group[0];
    const names = esc(groupCatNames(e.group));
    const who = esc(first.customerName);
    const head =
      e.kind === "groom"
        ? `🛁 <b>${e.time} น. อาบน้ำ</b> — ${names} · ${who}${e.inStay ? " (พักอยู่ที่ร้าน)" : ""}`
        : e.kind === "in"
          ? `🏠 <b>${e.time} น. มาส่งน้อง (เข้าพัก)</b> — ${names} · ${who} · ห้อง ${esc(roomName(roomOn(first, date).room || first.room))}`
          : `🏠 <b>${e.time} น. มารับน้องกลับ (ออก)</b> — ${names} · ${who} · ห้อง ${esc(roomName(roomOn(first, prevDay(date)).room || first.room))}`;
    const out = [`\n${head}`];

    // รับ-ส่ง — ร้านต้องออกไปเอง เตือนให้เผื่อเวลาเดินทาง
    const t = e.group.find((b) => hasTransport(b.transport))?.transport;
    const pick = !e.inStay && t?.pickup && e.kind !== "out";
    const drop = !e.inStay && t?.dropoff && e.kind !== "in";
    if (pick || drop) {
      const what =
        e.kind === "groom"
          ? [pick ? `ไปรับน้องก่อน ${e.time}` : "", drop ? "ส่งกลับหลังอาบเสร็จ" : ""].filter(Boolean).join(" + ")
          : e.kind === "in"
            ? `ร้านไปรับน้องจากบ้าน (ลูกค้าแจ้ง ${e.time})`
            : `ร้านไปส่งน้องกลับบ้าน (ลูกค้าแจ้ง ${e.time})`;
      out.push(`   🚗 <b>${esc(what)}</b> — เผื่อเวลาเดินทาง`);
      const phone = customers.find((c) => bookingMatchesCustomer(first, c))?.phone;
      if (phone) out.push(`   📞 ${esc(phone)}`);
      if (t?.mapUrl) out.push(`   📍 <a href="${escAttr(t.mapUrl)}">เปิด Google Maps</a>`);
      else out.push("   ⚠️ ลูกค้ายังไม่ส่งพิกัด");
      if (t?.address) out.push(`   🏠 ${esc(t.address)}`);
    }

    // งานเพิ่มในบิล — นัดอาบน้ำไม่ซ้ำโปรแกรมอาบ
    const extras = bookingExtras(e.group, live2, invoices);
    const multi = new Set(e.group.map((b) => b.catName)).size > 1;
    const seen = new Set<string>();
    const texts: string[] = [];
    for (const b of e.group) {
      for (const x of extrasForCat(extras, b.catName)) {
        if (e.kind === "groom" && x.grooming) continue;
        const label = multi && x.cats.length ? `${b.catName}: ${x.text}` : x.text;
        if (seen.has(label)) continue;
        seen.add(label);
        texts.push(label);
      }
    }
    if (texts.length) out.push(`   ➕ งานเพิ่ม: ${esc(texts.join(", "))}`);
    lines.push(out.join("\n"));
  }
  return lines.join("\n");
}
