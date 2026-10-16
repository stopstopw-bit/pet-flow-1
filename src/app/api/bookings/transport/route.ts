import { NextRequest, NextResponse } from "next/server";
import { requireCustomerSession } from "@/lib/customer-session";
import { getBooking, listBookings, setBookingTransportLocation } from "@/lib/bookings-store";
import { bookingGroupKey, groupCatNames } from "@/lib/booking-group";
import { findCustomerForBooking, updateCustomer } from "@/lib/customers-store";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
import { cleanMapUrl, hasTransport, transportLabel } from "@/lib/transport";
import { withResolvedTenant } from "@/lib/tenant-context";

/** นัดของบ้านเดียวกันรอบเดียวกัน — รับ-ส่งทีเดียวทั้งบ้าน จุดรับ-ส่งจึงใช้ร่วมกัน */
async function householdSiblings(b: NonNullable<Awaited<ReturnType<typeof getBooking>>>) {
  const key = bookingGroupKey(b);
  const all = await listBookings();
  const same = all.filter((x) => x.status !== "cancelled" && bookingGroupKey(x) === key);
  return same.length > 0 ? same : [b];
}

/** ข้อมูลนัดสำหรับหน้ากรอกจุดรับ-ส่ง — ไม่เคยกรอก ใช้ที่อยู่ในโปรไฟล์ลูกค้าเป็นค่าเริ่มต้น */
async function handleGet(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const b = await getBooking(id);
  if (!b || b.status === "cancelled") return NextResponse.json({ found: false });
  const lineUserId = (await requireCustomerSession(req))?.lineUserId || "";
  // ที่อยู่เป็นข้อมูลส่วนตัว — โชว์เฉพาะเจ้าของนัด
  const owner = !b.lineUserId || b.lineUserId === lineUserId;
  const siblings = await householdSiblings(b);
  const t = b.transport;
  let mapUrl = t?.mapUrl;
  let address = t?.address;
  if (owner && !mapUrl && !address) {
    const c = await findCustomerForBooking(b);
    mapUrl = c?.addressMapUrl;
    address = c?.address;
  }
  return NextResponse.json({
    found: true,
    booking: {
      id: b.id,
      catName: groupCatNames(siblings),
      service: b.service,
      date: b.date,
      time: b.time,
      checkin: b.checkin || b.date,
      checkout: b.checkout,
      pickup: !!t?.pickup,
      dropoff: !!t?.dropoff,
      mapUrl: owner ? mapUrl : undefined,
      address: owner ? address : undefined,
      saved: !!(t?.mapUrl || t?.address),
    },
  });
}

/** ลูกค้าส่งจุดรับ-ส่ง (ลิงก์ Google Maps + ที่อยู่/จุดสังเกต) */
async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const bookingId = String(body.bookingId || "").trim();
  const rawUrl = String(body.mapUrl || "").trim();
  const mapUrl = cleanMapUrl(rawUrl);
  const address = String(body.address || "").trim().slice(0, 300) || undefined;
  const lineUserId = (await requireCustomerSession(req))?.lineUserId || "";
  if (!bookingId) return NextResponse.json({ error: "bookingId required" }, { status: 400 });
  if (rawUrl && !mapUrl) return NextResponse.json({ error: "bad_url" }, { status: 400 });
  if (!mapUrl && !address) return NextResponse.json({ error: "location_required" }, { status: 400 });

  const res = await setBookingTransportLocation(bookingId, { mapUrl, address }, lineUserId || undefined);
  if (!res.ok) {
    const status =
      res.error === "not_found" ? 404 : res.error === "forbidden" ? 403 : res.error === "need_sql" ? 503 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }
  // ตัวอื่นในบ้านที่มารอบเดียวกันใช้จุดเดียวกัน
  for (const sib of await householdSiblings(res.booking)) {
    if (sib.id === bookingId || !hasTransport(sib.transport)) continue;
    await setBookingTransportLocation(sib.id, { mapUrl, address }, lineUserId || undefined);
  }
  // ครั้งแรกที่ให้ที่อยู่ — จำไว้ในโปรไฟล์ ครั้งหน้าจะใส่ให้อัตโนมัติ (ไม่เขียนทับที่อยู่ที่มีอยู่แล้ว)
  const cust = await findCustomerForBooking(res.booking);
  if (cust && !cust.addressMapUrl && mapUrl) {
    await updateCustomer(cust.id, { addressMapUrl: mapUrl, ...(cust.address ? {} : { address }) });
  }

  const b = res.booking;
  await sendTelegram(
    formatBookingTelegram("📍 ลูกค้าส่งจุดรับ-ส่ง", {
      ลูกค้า: b.customerName,
      น้องแมว: b.catName,
      บริการ: transportLabel(b.transport),
      วันที่: b.checkin || b.date || "-",
      ...(address ? { ที่อยู่: address } : {}),
      ...(mapUrl ? { แผนที่: mapUrl } : {}),
    })
  );
  return NextResponse.json({ ok: true });
}

/** แอปลูกค้า — หาร้านจากลิงก์/คุกกี้ของร้าน (multi-tenant) */

export async function GET(req: NextRequest) {
  return withResolvedTenant(req, () => handleGet(req));
}

export async function POST(req: NextRequest) {
  return withResolvedTenant(req, () => handlePost(req));
}
