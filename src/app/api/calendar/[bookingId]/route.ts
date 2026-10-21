import { NextRequest, NextResponse } from "next/server";
import { getBooking } from "@/lib/bookings-store";
import { buildIcsContent } from "@/lib/calendar";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { withTenant } from "@/lib/tenant-context";
import { getSiteConfig } from "@/lib/config-store";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { bookingId } = await params;
  return withTenant(session.tenantId, () => handleGet(bookingId));
}

async function handleGet(bookingId: string) {
  const b = await getBooking(bookingId);
  if (!b) return NextResponse.json({ error: "not found" }, { status: 404 });

  const shop = (await getSiteConfig()).business.name;
  const ics = await buildIcsContent({
    uid: b.calendarEventId || b.id,
    summary: `🐾 ${b.catName} (${b.customerName})${shop ? ` — ${shop}` : ""}`,
    description: `${b.service === "room" ? "ห้องพัก" : "อาบน้ำ"} · ${b.notes || ""}`,
    start: b.date || b.checkin || "",
    end: b.checkout || b.date || b.checkin || "",
    time: b.time,
    allDay: b.service === "room",
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="booking-${bookingId}.ics"`,
    },
  });
}
