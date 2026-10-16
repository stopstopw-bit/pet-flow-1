import { NextRequest, NextResponse } from "next/server";
import { withResolvedTenant } from "@/lib/tenant-context";
import { getGroomAvailability, getRoomAvailability } from "@/lib/availability";

export const dynamic = "force-dynamic";

/** ลูกค้าเช็คความว่างก่อนจองเอง — เปิดสาธารณะ (ใต้ /api/bookings จึงผ่านด่าน SHARED_API อยู่แล้ว) */
export async function GET(req: NextRequest) {
  return withResolvedTenant(req, () => handleGet(req));
}

async function handleGet(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const service = sp.get("service");

  if (service === "groom") {
    const date = sp.get("date")?.trim();
    if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });
    const cats = Math.min(20, Math.max(1, Number(sp.get("cats")) || 1));
    return NextResponse.json(await getGroomAvailability(date, cats));
  }

  if (service === "room") {
    const roomType = sp.get("roomType")?.trim();
    const checkin = sp.get("checkin")?.trim();
    const checkout = sp.get("checkout")?.trim();
    if (!roomType || !checkin || !checkout) {
      return NextResponse.json(
        { error: "roomType, checkin, checkout required" },
        { status: 400 }
      );
    }
    if (checkout <= checkin) {
      return NextResponse.json({ error: "invalid_range" }, { status: 400 });
    }
    const avail = await getRoomAvailability(roomType, checkin, checkout);
    if (!avail) return NextResponse.json({ error: "not_self_bookable" }, { status: 400 });
    return NextResponse.json(avail);
  }

  return NextResponse.json({ error: "invalid service" }, { status: 400 });
}
