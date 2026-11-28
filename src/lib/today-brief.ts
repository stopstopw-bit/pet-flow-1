import { stayInfoDone } from "./intake-rules";
import { listBookings, type StoredBooking } from "@/lib/bookings-store";
import { bookingMatchesCustomer } from "@/lib/booking-customer-match";
import { stayForGroom } from "@/lib/booking-group";
import { catNameKey } from "@/lib/cat-name-replace";
import { getSiteConfig } from "@/lib/config-store";
import { listCustomers, type CatRecord, type CustomerRecord } from "@/lib/customers-store";
import { isFeatureOn } from "@/lib/features";
import { GROOM_DRY_METHOD_LABELS, GROOM_HEALTH_LABELS, GROOM_TEMPERAMENT_LABELS, parseGroomInfo } from "@/lib/groom-info";
import { groomProgramName, resolveGroomPrograms } from "@/lib/grooming-prices";
import { listInvoicesForBookings } from "@/lib/invoices-store";
import { bookingExtras, extrasForCat, relatedBookingIds } from "@/lib/booking-extras";
import { roomOn } from "@/lib/room-segments";
import { hasTransport } from "@/lib/transport";
import { splitVaccinePhotos } from "@/lib/vaccine-photos";

/**
 * "ลูกค้าวันนี้" บนหน้าแรกหลังร้าน — 1 การ์ด = 1 บ้าน 1 นัด
 * รวมทุกอย่างที่ลูกค้าตอบมา (ฟอร์มก่อนอาบน้ำ/ก่อนเข้าพัก, หน้าสมัคร, ข้อตกลง, เวลา, รับ-ส่ง, บิล)
 * แล้วแปลงเป็น 3 กอง: ต้องระวัง · ต้องทำวันนี้ · การดูแล — เปิดมาแล้วรู้เลยไม่ต้องกดเข้าไปอ่านทีละฟอร์ม
 */

export type BriefTone = "red" | "amber" | "info";
export type BriefItem = { text: string; tone: BriefTone; cat?: string; href?: string };
export type BriefCare = { cat?: string; label: string; value: string };
export type BriefKind = "checkin" | "checkout" | "groom" | "stay";

export type TodayBrief = {
  key: string;
  kind: BriefKind;
  time?: string;
  customerName: string;
  customerId?: string;
  phone?: string;
  catNames: string[];
  room?: string;
  status: string;
  bookingIds: string[];
  /** อาบน้ำระหว่างพัก — น้องอยู่ร้านแล้ว ไม่ต้องรอรับ */
  inStay?: boolean;
  cautions: BriefItem[];
  todos: BriefItem[];
  care: BriefCare[];
};

/** คำตอบที่แปลว่า "ไม่มี" — ไม่ต้องเตือน */
function isNone(v?: string | null) {
  const s = String(v ?? "").trim().toLowerCase();
  return !s || ["-", "ไม่มี", "ไม่เคย", "no", "none", "ไม่", "ปกติ", "ไม่มีค่ะ", "ไม่มีครับ"].includes(s);
}

function parseObj(json?: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown) => String(v ?? "").trim();
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);

function findCat(cats: CatRecord[] | undefined, name: string): CatRecord | undefined {
  const key = catNameKey(name || "");
  const exact = cats?.find((c) => catNameKey(c.name) === key);
  if (exact) return exact;
  const bare = (n: string) => catNameKey(n).replace(/^น้อง/, "");
  return bare(name) ? cats?.find((c) => bare(c.name) === bare(name)) : undefined;
}

/** สิ่งที่ต้องระวังของน้อง 1 ตัว — จากหน้าสมัคร + ฟอร์มก่อนอาบน้ำ + ฟอร์มก่อนเข้าพัก + โน้ตร้าน */
export function catCautions(cat: CatRecord | undefined, kind: BriefKind): BriefItem[] {
  if (!cat) return [];
  const out: BriefItem[] = [];
  const add = (text: string, tone: BriefTone) => {
    if (!out.some((x) => x.text === text)) out.push({ text, tone });
  };
  const groom = parseGroomInfo(cat.groomHealthInfo);
  const stay = parseObj(cat.stayInfo);

  // ร้ายแรงก่อน
  const seizure = !isNone(cat.seizureHistory) ? cat.seizureHistory!.trim() : "";
  if (seizure || (groom?.health || []).includes("seizure"))
    add(seizure ? `เคยชัก/ช็อค: ${seizure}` : "มีประวัติลมชัก/ชัก", "red");
  if (groom?.heartDisease === "yes" || (groom?.health || []).includes("heart")) add("โรคหัวใจ", "red");
  const allergies = [cat.allergy, groom?.allergy].filter((a) => !isNone(a)).map((a) => a!.trim());
  for (const a of Array.from(new Set(allergies))) add(`แพ้: ${a}`, "red");
  if ((groom?.temperament || []).includes("aggressive")) add("ดุ/กัด/ข่วน", "red");
  const vaccNo = groom?.vaccinated === "no" || str(stay?.vaccinated) === "no";
  if (vaccNo) add("วัคซีนยังไม่ครบ", "red");

  // ควรรู้
  const meds = [cat.medical, str(stay?.medical)].filter((m) => !isNone(m)).map((m) => m!.trim());
  for (const m of Array.from(new Set(meds))) add(`โรค/ยา: ${m}`, "amber");
  for (const h of groom?.health || []) {
    if (h === "skin" || h === "senior") add(GROOM_HEALTH_LABELS[h], "amber");
  }
  for (const t of groom?.temperament || []) {
    if (["fearful", "struggle", "stressed", "strangerShy"].includes(t)) add(GROOM_TEMPERAMENT_LABELS[t], "amber");
  }
  if (groom?.heartDisease === "unknown" && kind === "groom") add("ไม่เคยตรวจโรคหัวใจ", "amber");
  if (!isNone(str(stay?.dislikes)) && kind !== "groom") add(`ไม่ชอบ/กลัว: ${str(stay?.dislikes)}`, "amber");
  if (cat.staffPrivateNote?.trim()) add(`โน้ตร้าน: ${cat.staffPrivateNote.trim()}`, "amber");
  if (cat.staffNote?.trim()) add(`โน้ต: ${cat.staffNote.trim()}`, "info");
  if (cat.neutered === false && kind !== "groom") add("ยังไม่ทำหมัน", "info");
  return out;
}

/** การดูแลระหว่างพัก (อาหาร มื้อ ขนม ยา สิ่งที่ชอบ ฯลฯ) */
function stayCare(cat: CatRecord | undefined): { label: string; value: string }[] {
  const stay = parseObj(cat?.stayInfo);
  if (!stay) return [];
  const rows: [string, string][] = [
    ["อาหาร", str(stay.food)],
    ["มื้อ", str(stay.meals)],
    ["ขนม", str(stay.snacks)],
    ["ทราย", str(stay.litter)],
    ["ชอบ", str(stay.likes)],
    ["ฝากดูแล", str(stay.note)],
  ];
  return rows.filter(([, v]) => !isNone(v)).map(([label, value]) => ({ label, value }));
}

/** รายละเอียดงานอาบน้ำที่ลูกค้าขอ (ไถขน วิธีเป่า ครั้งแรก) */
function groomCare(cat: CatRecord | undefined): { label: string; value: string }[] {
  const g = parseGroomInfo(cat?.groomHealthInfo);
  if (!g) return [];
  const out: { label: string; value: string }[] = [];
  if (g.bathedBefore === "no") out.push({ label: "อาบครั้งแรก", value: "ยังไม่เคยอาบที่ไหนมาก่อน" });
  const shave = [g.shaveButt === "yes" ? "ก้น" : "", g.shavePaws === "yes" ? "อุ้งเท้า" : ""].filter(Boolean);
  if (shave.length) out.push({ label: "ไถขน", value: shave.join(" + ") });
  const noShave = [g.shaveButt === "no" ? "ก้น" : "", g.shavePaws === "no" ? "อุ้งเท้า" : ""].filter(Boolean);
  if (noShave.length) out.push({ label: "ไม่ไถ", value: noShave.join(" + ") });
  const dry = list(g.dryMethod).map((d) => GROOM_DRY_METHOD_LABELS[d] || d);
  if (dry.length) out.push({ label: "เคยเป่าด้วย", value: dry.join(", ") });
  if (g.weight && g.weight !== "unknown") out.push({ label: "น้ำหนัก", value: `${g.weight} กก.` });
  if (!isNone(g.note)) out.push({ label: "ฝากบอก", value: g.note!.trim() });
  return out;
}

const live = (b: StoredBooking) => b.status !== "cancelled" && b.status !== "no_show";

/** สร้างการ์ดลูกค้าของวันหนึ่ง */
export async function buildTodayBrief(date: string): Promise<TodayBrief[]> {
  const [all, customers, cfg] = await Promise.all([
    listBookings(),
    listCustomers().catch(() => [] as CustomerRecord[]),
    getSiteConfig(),
  ]);
  const on = (k: Parameters<typeof isFeatureOn>[1]) => isFeatureOn(cfg, k);
  const programs = resolveGroomPrograms(cfg.groomPricePrograms);
  const roomName = (id?: string) => cfg.rooms.find((r) => r.id === id)?.name || id || "";
  const bookings = all.filter(live);

  const customerOf = (b: StoredBooking) =>
    customers.find((c) => !!b.lineUserId && (c.lineUserId === b.lineUserId || (c.lineUserIds || []).includes(b.lineUserId))) ||
    customers.find((c) => bookingMatchesCustomer(b, c));

  type Draft = { kind: BriefKind; time: string; rows: StoredBooking[]; inStay?: boolean };
  const drafts = new Map<string, Draft>();
  const put = (b: StoredBooking, kind: BriefKind, time: string, inStay?: boolean) => {
    const who = customerOf(b)?.id || b.lineUserId || b.customerName;
    const k = [kind, who, time, b.checkin || "", b.checkout || ""].join("|");
    const d = drafts.get(k);
    if (d) d.rows.push(b);
    else drafts.set(k, { kind, time, rows: [b], inStay });
  };
  for (const b of bookings) {
    if (b.service === "room") {
      const cin = b.checkin || b.date;
      if (cin === date) put(b, "checkin", b.arrivalTime || "");
      else if (b.checkout === date && b.checkout !== cin) put(b, "checkout", b.pickupTime || "");
      else if (cin < date && date < (b.checkout || "")) put(b, "stay", "");
    } else if (b.date === date) {
      put(b, "groom", b.time || "", !!stayForGroom(b, bookings));
    }
  }

  const drafted = Array.from(drafts.values());
  // บิลของทุกการ์ด (รวมบ้านเดียวกัน + อาบน้ำก่อนกลับที่ออกบิลรวมค่าห้อง) — ใช้ทั้งยอดค้างตอนออก
  // และ "งานเพิ่มในบิล" (ไถขน อาบน้ำ ฯลฯ) ที่พนักงานต้องรู้ว่าน้องตัวไหนต้องทำอะไรเพิ่ม
  const extrasOn = cfg.automation?.billExtras === true;
  const relatedIds = relatedBookingIds(
    extrasOn ? drafted.flatMap((d) => d.rows) : drafted.filter((d) => d.kind === "checkout").flatMap((d) => d.rows),
    bookings
  );
  const invoices = relatedIds.size ? await listInvoicesForBookings(Array.from(relatedIds)).catch(() => []) : [];

  const out: TodayBrief[] = drafted.map((d) => {
    const first = d.rows[0];
    const customer = customerOf(first);
    const multi = new Set(d.rows.map((r) => r.catName)).size > 1;
    const cats = d.rows.map((r) => ({ b: r, cat: findCat(customer?.cats, r.catName) }));
    const cautions: BriefItem[] = [];
    const todos: BriefItem[] = [];
    const care: BriefCare[] = [];
    const tag = (name: string) => (multi ? name : undefined);

    for (const { b, cat } of cats) {
      for (const c of catCautions(cat, d.kind)) cautions.push({ ...c, cat: tag(b.catName) });
    }
    // โน้ตของนัดนี้ (ร้านจด) + คำขอดูแลเพิ่มเติมตอนกดยอมรับข้อตกลง (ลูกค้าพิมพ์)
    for (const n of Array.from(new Set(d.rows.map((r) => r.notes?.trim()).filter(Boolean)))) {
      cautions.push({ text: `โน้ตนัด: ${n}`, tone: "info" });
    }
    for (const n of Array.from(new Set(d.rows.map((r) => r.careNote?.trim()).filter(Boolean)))) {
      cautions.push({ text: `ลูกค้าฝาก: ${n}`, tone: "amber" });
    }
    cautions.sort((a, b) => ["red", "amber", "info"].indexOf(a.tone) - ["red", "amber", "info"].indexOf(b.tone));

    const tr = d.rows.find((r) => hasTransport(r.transport))?.transport;
    const place = tr ? [tr.address].filter(Boolean).join(" ") : "";
    const room = (() => {
      const names = Array.from(
        new Set(
          d.rows.map((r) => {
            const at = d.kind === "checkout" ? prevDay(date) : date;
            const o = d.kind === "groom" ? { room: r.room, roomUnit: r.roomUnit } : roomOn(r, at);
            return o.room ? `${roomName(o.room)}${o.roomUnit ? ` #${o.roomUnit}` : ""}` : "";
          })
        )
      ).filter(Boolean);
      return names.join(", ") || undefined;
    })();

    if (d.kind === "checkin") {
      if (!d.time && on("checkinTime")) todos.push({ text: "ยังไม่แจ้งเวลามาส่ง — โทรถามลูกค้า", tone: "amber" });
      if (tr?.pickup)
        todos.push({ text: `ร้านไปรับน้อง${place ? ` · ${place}` : ""}`, tone: "info", href: tr.mapUrl });
      if (on("consent") && d.rows.some((r) => !r.consentAcceptedAt))
        todos.push({ text: "ยังไม่ยอมรับเงื่อนไขเข้าพัก — ให้เซ็นตอนมาส่ง", tone: "amber" });
      for (const { b, cat } of cats) {
        if (on("stayInfo") && !stayInfoDone(cat?.stayInfo))
          todos.push({ text: "ยังไม่กรอกข้อมูลก่อนเข้าพัก — ถามอาหาร/ยาตอนรับน้อง", tone: "amber", cat: tag(b.catName) });
        if (on("vaccine") && !b.vaccinePhotoUrl && splitVaccinePhotos(cat?.vaccinePhotos).length === 0)
          todos.push({ text: "ยังไม่มีรูปสมุดวัคซีน — ขอดูตอนมาส่ง", tone: "amber", cat: tag(b.catName) });
      }
      if (on("idCard") && customer && !customer.idCardUrl)
        todos.push({ text: "ยังไม่มีรูปบัตรประชาชน", tone: "amber" });
    }

    if (d.kind === "checkout") {
      if (!d.time && on("checkinTime")) todos.push({ text: "ยังไม่แจ้งเวลามารับ — โทรถามลูกค้า", tone: "amber" });
      if (tr?.dropoff)
        todos.push({ text: `ร้านไปส่งน้องกลับบ้าน${place ? ` · ${place}` : ""}`, tone: "info", href: tr.mapUrl });
      // อาบน้ำก่อนกลับ
      for (const g of bookings) {
        if (g.service === "groom" && g.date === date && d.rows.some((r) => stayForGroom(g, bookings)?.id === r.id))
          todos.push({ text: `อาบน้ำก่อนกลับ${g.time ? ` ${g.time} น.` : ""}`, tone: "info", cat: tag(g.catName) });
      }
      const ids = new Set(d.rows.map((r) => r.id));
      const inv = invoices.filter((i) => i.bookingId && ids.has(i.bookingId) && !i.deletedAt);
      const due = inv.filter((i) => i.status === "pending").reduce((s, i) => s + (i.total - (i.deposit || 0)), 0);
      if (!inv.length) todos.push({ text: "ยังไม่ออกบิล — ออกบิลก่อนลูกค้ามารับ", tone: "amber", href: `/admin/billing?bookingId=${first.id}` });
      else if (due > 0)
        todos.push({ text: `เก็บเงินคงค้าง ${due.toLocaleString()} ฿`, tone: "red", href: `/admin/billing?bookingId=${first.id}` });
      else todos.push({ text: "จ่ายครบแล้ว", tone: "info" });
    }

    if (d.kind === "groom") {
      const prog = Array.from(new Set(d.rows.map((r) => groomProgramName(r.groomProgram, programs)).filter(Boolean)));
      if (prog.length) todos.push({ text: `โปรแกรม: ${prog.join(", ")}`, tone: "info" });
      if (d.inStay) todos.push({ text: "น้องพักอยู่ที่ร้าน — อาบระหว่างพัก", tone: "info" });
      else {
        if (tr?.pickup) todos.push({ text: `ร้านไปรับน้อง${place ? ` · ${place}` : ""}`, tone: "info", href: tr.mapUrl });
        if (tr?.dropoff) todos.push({ text: "ร้านไปส่งน้องกลับบ้านหลังอาบ", tone: "info", href: tr.mapUrl });
      }
      for (const { b, cat } of cats) {
        if (on("groomInfo") && !cat?.groomHealthInfo)
          todos.push({ text: "ยังไม่กรอกประวัติก่อนอาบน้ำ — ถามนิสัย/สุขภาพก่อนจับน้อง", tone: "amber", cat: tag(b.catName) });
        for (const c of groomCare(cat)) care.push({ ...c, cat: tag(b.catName) });
      }
    }

    // งานเพิ่มที่ใส่ไว้ในบิล — การ์ดอาบน้ำโชว์โปรแกรมอยู่แล้ว / วันออกที่มีนัดอาบก่อนกลับก็บอกแล้ว ไม่ต้องซ้ำ
    if (extrasOn) {
      const extras = bookingExtras(d.rows, bookings, invoices);
      const skipGrooming = d.kind === "groom" || todos.some((t) => t.text.startsWith("อาบน้ำก่อนกลับ"));
      const seen = new Set<string>();
      for (const { b } of cats) {
        for (const x of extrasForCat(extras, b.catName)) {
          if (skipGrooming && x.grooming) continue;
          const shared = !x.cats.length;
          const key = shared ? `*|${x.text}` : `${b.catName}|${x.text}`;
          if (seen.has(key)) continue;
          seen.add(key);
          todos.push({ text: `งานเพิ่มในบิล: ${x.text}`, tone: "amber", cat: shared ? undefined : tag(b.catName) });
        }
      }
    }

    if (d.kind === "checkin" || d.kind === "stay") {
      // ย้ายห้องกลางทางวันนี้
      for (const r of d.rows) {
        const seg = (r.roomSegments || []).find((s) => s.from === date);
        if (seg) {
          const prev = roomOn(r, prevDay(date));
          todos.push({
            text: `ย้ายห้อง ${roomName(prev.room)} → ${roomName(seg.room)}`,
            tone: "amber",
            cat: tag(r.catName),
          });
        }
      }
      for (const { b, cat } of cats) for (const c of stayCare(cat)) care.push({ ...c, cat: tag(b.catName) });
    }

    return {
      key: `${d.kind}-${first.id}`,
      kind: d.kind,
      time: d.time || undefined,
      customerName: customer?.name || first.customerName,
      customerId: customer?.id,
      phone: customer?.phone,
      catNames: Array.from(new Set(d.rows.map((r) => r.catName))),
      room,
      status: first.status,
      bookingIds: d.rows.map((r) => r.id),
      inStay: d.inStay || undefined,
      cautions,
      todos,
      care,
    };
  });

  const order: Record<BriefKind, number> = { checkin: 0, groom: 0, checkout: 0, stay: 1 };
  return out.sort(
    (a, b) => order[a.kind] - order[b.kind] || (a.time || "99").localeCompare(b.time || "99")
  );
}

function prevDay(date: string) {
  return new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}
