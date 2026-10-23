import { NextRequest, NextResponse } from "next/server";
import { withResolvedTenant } from "@/lib/tenant-context";
import { getBooking, listBookings } from "@/lib/bookings-store";
import { stayForGroom } from "@/lib/booking-group";
import {
  findCustomerByLine,
  getCatGroomInfo,
  setCatGroomInfo,
  setCatStayInfo,
  type CustomerRecord,
} from "@/lib/customers-store";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
import { parseGroomInfo, groomInfoSummary } from "@/lib/groom-info";
import { getSiteConfig } from "@/lib/config-store";
import { isFeatureOn } from "@/lib/features";
import { intakeFields, sanitizeIntakeInfo } from "@/lib/intake-rules";
import { requireCustomerSession } from "@/lib/customer-session";
import { petKindOf, speciesOf } from "@/lib/pet-kind";
import { BATH_SHARED_WITH_STAY } from "@/lib/stay-form";

type Kind = "groom" | "stay";

/**
 * หาน้องที่ฟอร์มนี้พูดถึง — จากนัด (bookingId) หรือจากตัวน้องโดยตรง (catId, ลิงก์จากหน้าข้อมูลลูกค้า ยังไม่มีนัด)
 * ต้องเป็นของคนที่ล็อกอิน LINE อยู่เท่านั้น · kind: นัดเข้าพัก = ฟอร์มก่อนเข้าพัก, อื่นๆ = ก่อนอาบน้ำ (ส่ง kind มาบังคับได้)
 */
async function resolveTarget(lineUserId: string, bookingId: string, catId: string, kindParam: string) {
  const me = await findCustomerByLine(lineUserId);
  if (catId) {
    const cat = me?.cats.find((c) => c.id === catId);
    if (!me || !cat) return null;
    return { kind: (kindParam === "stay" ? "stay" : "groom") as Kind, catName: cat.name, me, cat, booking: undefined };
  }
  const b = await getBooking(bookingId);
  if (!b) return null;
  if (b.lineUserId && b.lineUserId !== lineUserId) return "forbidden" as const;
  const cat = me?.cats.find((c) => c.name.trim().toLowerCase() === String(b.catName).trim().toLowerCase());
  const kind: Kind = kindParam === "stay" || kindParam === "groom" ? kindParam : b.service === "room" ? "stay" : "groom";
  return { kind, catName: String(b.catName), me, cat, booking: b };
}

/**
 * เข้าพัก + อาบก่อนกลับ (นัดเดียวกัน) และน้องยังไม่เคยกรอกประวัติอาบน้ำ →
 * ฟอร์มก่อนเข้าพักถามเรื่องอาบน้ำต่อท้ายในหน้าเดียว (ข้อที่ซ้ำกันถามครั้งเดียว)
 */
async function needsBathPart(
  t: Exclude<Awaited<ReturnType<typeof resolveTarget>>, null | "forbidden">,
  lineUserId: string,
  cfg: Awaited<ReturnType<typeof getSiteConfig>>
): Promise<boolean> {
  const b = t.booking;
  if (t.kind !== "stay" || !b || b.service !== "room" || !isFeatureOn(cfg, "groomInfo")) return false;
  const list = await listBookings(b.lineUserId || lineUserId);
  const hasBath = list.some((g) => g.service === "groom" && stayForGroom(g, list)?.id === b.id);
  if (!hasBath) return false;
  const groomStored = t.cat?.groomHealthInfo ?? (await getCatGroomInfo(b.lineUserId || lineUserId, t.catName));
  return !parseGroomInfo(groomStored);
}

/**
 * ดึงข้อมูลนัด/ตัวน้อง + คำตอบที่เคยกรอกไว้ (เก็บถาวรที่แมว) — มีข้อมูลสุขภาพน้อง
 * ต้องเป็นเจ้าของจริง (ตรวจจากคุกกี้เซสชัน) ไม่ใช่แค่รู้ id
 */
async function getHandler(req: NextRequest) {
  const session = await requireCustomerSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const id = sp.get("id")?.trim() || "";
  const catId = sp.get("cat")?.trim() || "";
  if (!id && !catId) return NextResponse.json({ error: "id required" }, { status: 400 });
  const t = await resolveTarget(session.lineUserId, id, catId, sp.get("kind") || "");
  if (t === "forbidden") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!t) return NextResponse.json({ found: false });
  const groomStored =
    t.cat?.groomHealthInfo ?? (t.booking?.lineUserId ? await getCatGroomInfo(t.booking.lineUserId, t.catName) : undefined);
  const stored = t.kind === "stay" ? t.cat?.stayInfo : groomStored;
  const cfg = await getSiteConfig();
  // ร้านที่นัดอาบน้ำใช้ฟอร์มประวัติ (หมวดเจ้าของ + น้อง) — คำตอบชุดนี้ใช้ร่วมกับฟอร์มเข้าพัก
  // เติมคำตอบจากอีกฟอร์มให้ก่อน ลูกค้าไม่ต้องพิมพ์ซ้ำ (ของฟอร์มนี้เองทับ)
  const other = cfg.intakeRules?.groomUsesHistory ? (t.kind === "stay" ? groomStored : t.cat?.stayInfo) : undefined;
  const info = other ? { ...parseGroomInfo(other), ...parseGroomInfo(stored) } : parseGroomInfo(stored);
  return NextResponse.json({
    found: true,
    kind: t.kind,
    booking: t.booking
      ? { id: t.booking.id, catName: t.catName, service: t.booking.service, date: t.booking.date, time: t.booking.time }
      : { id: t.cat!.id, catName: t.catName },
    info,
    // ตอบโรคประจำตัวไว้แล้วตอนสมัครสมาชิก → ฟอร์มก่อนเข้าพักไม่ถามซ้ำ
    knownMedical: Boolean(t.cat?.medical?.trim()),
    // หมาหรือแมว — หน้าฟอร์มใช้เลือกชุดคำถาม (หมาไม่ถามเรื่องทราย) · ไม่รู้ = ไม่ส่ง ใช้ชนิดของร้าน
    species: speciesOf(t.cat, cfg),
    withBath: await needsBathPart(t, session.lineUserId, cfg),
  });
}

/** ลูกค้ากรอกข้อมูลน้อง (ก่อนอาบน้ำ / ก่อนเข้าพัก) — บันทึกถาวรที่แมว */
async function postHandler(req: NextRequest) {
  const session = await requireCustomerSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const bookingId = String(body.bookingId || "").trim();
  const catId = String(body.catId || "").trim();
  const info = body.info || {};
  if (!bookingId && !catId) {
    return NextResponse.json({ error: "bookingId required" }, { status: 400 });
  }
  const t = await resolveTarget(session.lineUserId, bookingId, catId, String(body.kind || ""));
  if (t === "forbidden") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });

  // เก็บตามคำถามที่ร้านตั้งไว้จริง (ร้านเพิ่ม/แก้ตัวเลือกเองได้)
  const cfg = await getSiteConfig();
  // ร้านปิดฟอร์มนี้ในตั้งค่า › เปิด/ปิดฟีเจอร์
  const feature = t.kind === "stay" ? "stayInfo" : "groomInfo";
  if (!isFeatureOn(cfg, feature)) {
    return NextResponse.json({ error: "feature_disabled", feature }, { status: 403 });
  }
  // ชุดคำถามตามชนิดของน้องตัวนี้ — ต้องตรงกับที่หน้าฟอร์มถาม ไม่งั้นคำตอบข้อของหมาจะหาย
  const kind = speciesOf(t.cat, cfg) ?? petKindOf(cfg);
  const fields = intakeFields(t.kind, kind, cfg);
  const payload = sanitizeIntakeInfo(fields, info);
  // ฟอร์มรวม เข้าพัก + อาบก่อนกลับ — ส่วนอาบน้ำเก็บเป็นประวัติอาบน้ำของน้องด้วย
  // ข้อที่ซ้ำกับฟอร์มเข้าพัก (key เดียวกัน หรือใน BATH_SHARED_WITH_STAY) ใช้คำตอบฝั่งเข้าพัก
  const groomFields = intakeFields("groom", kind, cfg);
  const shared: Record<string, string> = {
    ...Object.fromEntries(fields.map((f) => [f.key, f.key])),
    ...BATH_SHARED_WITH_STAY,
  };
  const groomPayload =
    t.kind === "stay" && body.groomInfo && typeof body.groomInfo === "object" && (await needsBathPart(t, session.lineUserId, cfg))
      ? sanitizeIntakeInfo(groomFields, {
          ...body.groomInfo,
          ...Object.fromEntries(
            Object.entries(shared)
              .filter(([g]) => groomFields.some((f) => f.key === g))
              .map(([g, st]) => [g, (info as Record<string, unknown>)[st]])
          ),
        })
      : null;

  let res: { ok: boolean; error?: string };
  if (t.kind === "stay") {
    // ฟอร์มก่อนเข้าพักเก็บที่ตัวน้องในบัญชีลูกค้า — ต้องมีน้องตัวนี้ในบัญชีจริง
    res = t.me && t.cat ? await setCatStayInfo(t.me.id, t.cat.id, JSON.stringify(payload)) : { ok: false, error: "not_found" };
  } else {
    res = await setCatGroomInfo(session.lineUserId, t.catName, JSON.stringify(payload));
  }
  if (!res.ok && res.error === "not_found") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (res.ok && groomPayload) {
    res = await setCatGroomInfo(t.booking?.lineUserId || session.lineUserId, t.catName, JSON.stringify(groomPayload));
  }

  const customerName = t.booking?.customerName || (t.me as CustomerRecord | undefined)?.name || "-";
  await sendTelegram(
    formatBookingTelegram(
      groomPayload
        ? "🏠🛁 ข้อมูลน้องก่อนเข้าพัก + อาบน้ำ (ลูกค้ากรอก)"
        : t.kind === "stay"
          ? "🏠 ข้อมูลน้องก่อนเข้าพัก (ลูกค้ากรอก)"
          : "🩺 ประวัติน้องก่อนอาบน้ำ (ลูกค้ากรอก)",
      {
        น้อง: t.catName,
        ลูกค้า: customerName,
        ...groomInfoSummary(payload, fields),
        // ข้อที่ถามครั้งเดียวขึ้นแล้วด้านบน — ไม่ซ้ำ
        ...(groomPayload
          ? groomInfoSummary(groomPayload, groomFields.filter((f) => !(f.key in shared)))
          : {}),
      }
    )
  );

  return NextResponse.json({ ok: res.ok, needSql: !res.ok && res.error === "need_sql" });
}

// R1/R3: resolve ร้านจาก request (header/cookie) ก่อนเข้า handler
export function GET(req: NextRequest) { return withResolvedTenant(req, () => getHandler(req)); }
export function POST(req: NextRequest) { return withResolvedTenant(req, () => postHandler(req)); }
