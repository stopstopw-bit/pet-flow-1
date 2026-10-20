import { getSiteConfig } from "./config-store";
import { bookingConfirmUrl as buildConfirmUrl, bookingTransportUrl } from "./line-config";
import { hasTransport, type BookingTransport } from "./transport";
import { getLineCredentials } from "./line-config";
import { buildAppointmentConfirmFlex } from "./line";
import { groomProgram } from "./grooming-prices";

export async function bookingConfirmUrl(bookingId: string) {
  const creds = await getLineCredentials();
  return buildConfirmUrl(bookingId, creds?.liffId);
}

export async function buildBookingConfirmFlex(
  booking: {
    id: string;
    catName: string;
    customerName: string;
    service: string;
    date?: string;
    time?: string;
    checkin?: string;
    checkout?: string;
    room?: string;
    notes?: string;
    /** id ใน GROOM_PROGRAMS (เช่น "bath-dry") — โชว์ชื่อโปรแกรมในการ์ดยืนยันนัด */
    groomProgram?: string;
    transport?: BookingTransport;
  }
) {
  const config = await getSiteConfig();
  const location =
    config.business.location.th;
  const mapsUrl = config.business.maps;

  const { groomProgram: groomProgramId, ...rest } = booking;

  const creds = await getLineCredentials();
  return buildAppointmentConfirmFlex({
    ...rest,
    program: groomProgramId ? groomProgram(groomProgramId)?.name : undefined,
    confirmUrl: await bookingConfirmUrl(booking.id),
    transportUrl: hasTransport(booking.transport)
      ? bookingTransportUrl(booking.id, creds?.liffId)
      : undefined,
    mapsUrl,
    location: [config.business.name, location].filter(Boolean).join(" · "),
    businessName: config.business.name,
  }, config.cards?.bookingConfirm);
}
