import { getSiteConfig } from "./config-store";
import { bookingConfirmUrl as buildConfirmUrl, bookingTransportUrl, shopAppBase } from "./line-config";
import { hasTransport, type BookingTransport } from "./transport";
import { getLineCredentials } from "./line-config";
import { buildAppointmentConfirmFlex } from "./line";
import { groomProgramName, isMassageBooking, resolveGroomPrograms } from "./grooming-prices";
import { roomName } from "./booking-reminders";

export async function bookingConfirmUrl(bookingId: string) {
  const creds = await getLineCredentials();
  return buildConfirmUrl(bookingId, creds?.liffId, await shopAppBase());
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
  },
  /** น้องทุกตัวในบ้านที่จองมาด้วยกัน (นัดละตัว) — อาบคนละโปรแกรม/คนละเวลา จะแยกบอกรายตัวในการ์ด */
  pets?: { catName: string; groomProgram?: string; time?: string }[]
) {
  const config = await getSiteConfig();
  const location =
    config.business.location.th;
  const mapsUrl = config.business.maps;

  const { groomProgram: groomProgramId, ...rest } = booking;
  const programs = resolveGroomPrograms(config.groomPricePrograms);
  const nameOf = (id?: string) => groomProgramName(id, programs) || undefined;

  // หลายตัวแต่โปรแกรม/เวลาไม่เหมือนกัน → บรรทัดรายตัว แทนชื่อโปรแกรมเดียวท้ายหัวการ์ด
  const group = booking.service === "groom" && pets && pets.length > 1 ? pets : [];
  const mixedProgram = new Set(group.map((x) => x.groomProgram || "")).size > 1;
  const mixedTime = new Set(group.map((x) => x.time || "")).size > 1;
  const petLines =
    mixedProgram || mixedTime
      ? group.map((x) => ({
          catName: x.catName,
          time: mixedTime ? x.time : undefined,
          program: nameOf(x.groomProgram) || (mixedProgram ? "ยังไม่ระบุโปรแกรม" : undefined),
        }))
      : undefined;
  const program = mixedProgram ? undefined : nameOf(group[0]?.groomProgram ?? groomProgramId);

  const creds = await getLineCredentials();
  return buildAppointmentConfirmFlex({
    ...rest,
    room: rest.room ? roomName(rest.room, config) : undefined,
    program,
    petLines,
    massage: isMassageBooking({ service: booking.service, groomProgram: group[0]?.groomProgram ?? groomProgramId }, programs),
    confirmUrl: await bookingConfirmUrl(booking.id),
    transportUrl: hasTransport(booking.transport)
      ? bookingTransportUrl(booking.id, creds?.liffId, await shopAppBase())
      : undefined,
    mapsUrl,
    location: [config.business.name, location].filter(Boolean).join(" · "),
    businessName: config.business.name,
  }, config.cards?.bookingConfirm);
}
