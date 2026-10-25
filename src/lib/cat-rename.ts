/**
 * เปลี่ยนชื่อน้องแล้วให้ตามไปทุกที่
 *
 * นัด/บิล/ประวัติบริการ/รายการการเงิน ผูกกับน้องด้วย "ชื่อ" (ไม่มี cat id) — แก้ชื่อที่หน้าลูกค้า
 * อย่างเดียว ของเก่าจะหลุดจากน้องทันที (ประวัติอาบน้ำหาย, นัดไม่ขึ้นในโปรไฟล์, บิลเก่าขึ้นชื่อเดิม)
 * ไฟล์นี้ไล่แก้ชื่อเดิม → ชื่อใหม่ ให้ครบทุกตารางในครั้งเดียว
 *
 * เอกสารทางการ (ใบเสร็จ/ใบกำกับ) ไม่พิมพ์ชื่อน้องอยู่แล้ว (formalItemLabel) แก้บิลที่จ่ายแล้วได้ไม่กระทบเอกสาร
 */

import { catNameKey, replaceCatInLabel, replaceCatInList } from "./cat-name-replace";
import { isUnknownCat } from "./unknown-cat";

type CustomerRef = { id: string; name: string; lineUserId?: string; lineUserIds?: string[] };

/** นัดทั้งหมดของบ้านนี้ — จาก LINE ทุกตัว + ชื่อลูกค้า (นัดที่ร้านลงให้ก่อนผูก LINE) */
async function householdBookings(customer: CustomerRef) {
  const { listBookings, listBookingsByCustomerName } = await import("./bookings-store");
  const lineIds = new Set(
    [customer.lineUserId, ...(customer.lineUserIds || [])].filter(Boolean) as string[]
  );
  const found = new Map<string, Awaited<ReturnType<typeof listBookings>>[number]>();
  for (const lid of lineIds) {
    for (const b of await listBookings(lid)) found.set(b.id, b);
  }
  for (const b of await listBookingsByCustomerName(customer.name)) {
    // ชื่อลูกค้าซ้ำกันได้ — นัดที่ผูก LINE ของคนอื่นไว้ไม่ใช่ของบ้านนี้
    if (b.lineUserId && lineIds.size && !lineIds.has(b.lineUserId)) continue;
    found.set(b.id, b);
  }
  return [...found.values()];
}

export type CatRenameResult = {
  bookings: number;
  invoices: number;
  services: number;
  finance: number;
};

/**
 * ไล่เปลี่ยนชื่อน้องในทุกตารางของลูกค้ารายนี้ — best-effort ทีละตาราง
 * (ตารางไหนพังก็ข้าม ส่วนอื่นยังแก้ต่อได้)
 */
export async function renameCatEverywhere(
  customer: CustomerRef,
  oldName: string,
  newName: string
): Promise<CatRenameResult> {
  const result: CatRenameResult = { bookings: 0, invoices: 0, services: 0, finance: 0 };
  const from = oldName.trim();
  const to = newName.trim();
  if (!from || !to || catNameKey(from) === catNameKey(to)) return result;

  // นัด — หาจาก LINE ทุกตัวของลูกค้า + ชื่อลูกค้า (นัดที่ร้านลงให้ก่อนผูก LINE)
  try {
    const { updateBooking } = await import("./bookings-store");
    const { bookingCalendarPayload, updateCalendarEvent } = await import("./calendar");
    for (const b of await householdBookings(customer)) {
      const catName = replaceCatInList(b.catName, from, to);
      if (catName === b.catName) continue;
      const updated = await updateBooking(b.id, { catName });
      if (!updated) continue;
      result.bookings++;
      if (updated.calendarEventId && updated.status !== "cancelled") {
        await updateCalendarEvent(updated.calendarEventId, bookingCalendarPayload(updated)).catch(
          () => {}
        );
      }
    }
  } catch (e) {
    console.error("renameCat bookings", e);
  }

  // บิล — ชื่อหัวบิล + ชื่อน้องรายบรรทัด (ทั้งช่อง catName และ "🐾 ชื่อ · " หน้า label)
  try {
    const { listInvoices, setInvoiceCatNames } = await import("./invoices-store");
    for (const inv of await listInvoices(customer.id)) {
      const catName = replaceCatInList(inv.catName || "", from, to);
      let itemsChanged = false;
      const items = (inv.items || []).map((it) => {
        const next = {
          ...it,
          label: replaceCatInLabel(it.label, from, to),
          ...(it.catName ? { catName: replaceCatInList(it.catName, from, to) } : {}),
        };
        if (next.label !== it.label || next.catName !== it.catName) itemsChanged = true;
        return next;
      });
      if (catName === (inv.catName || "") && !itemsChanged) continue;
      await setInvoiceCatNames(inv.id, catName, items);
      result.invoices++;
    }
  } catch (e) {
    console.error("renameCat invoices", e);
  }

  // ประวัติบริการ (ใช้นับครั้ง/ประวัติน้อง) + คิวอวยพรวันเกิด
  try {
    const { renameCatInServiceRecords } = await import("./customers-store");
    result.services = await renameCatInServiceRecords(customer.id, from, to);
  } catch (e) {
    console.error("renameCat services", e);
  }
  try {
    const { renameCatInBirthdayQueue } = await import("./birthday-queue");
    await renameCatInBirthdayQueue(customer.id, from, to);
  } catch (e) {
    console.error("renameCat birthdays", e);
  }

  // รายรับ-รายจ่าย — คำอธิบายขึ้นต้นด้วยชื่อน้อง
  try {
    const { renameCatInFinance } = await import("./finance-store");
    result.finance = await renameCatInFinance(customer.id, from, to);
  } catch (e) {
    console.error("renameCat finance", e);
  }

  return result;
}

/**
 * เรียกหลัง updateCat — ถ้าชื่อน้องเปลี่ยนจริง ไล่แก้ชื่อในนัด/บิล/ประวัติให้
 * (แยกออกจาก customers-store เพราะไฟล์นั้นถูก import ฝั่ง client ด้วย ดึง calendar/googleapis มาไม่ได้)
 */
export async function renameCatAfterUpdate(
  customer:
    | { id: string; name: string; lineUserId?: string; lineUserIds?: string[]; cats: { id: string; name: string }[] }
    | null
    | undefined,
  catId: string,
  oldName: string | undefined
) {
  const now = customer?.cats.find((x) => x.id === catId)?.name;
  if (!customer || !oldName || !now || catNameKey(now) === catNameKey(oldName)) return null;
  return renameCatEverywhere(customer, oldName, now);
}

export type UnlinkedCatName = { name: string; bookings: number; invoices: number };

/**
 * ชื่อน้องในนัด/บิลของบ้านนี้ที่ไม่ตรงกับน้องตัวไหนในบ้าน — ชื่อชั่วคราว "น้องไม่ระบุชื่อ (2)"
 * (ลูกค้ากรอกน้องเข้ามาเป็นตัวใหม่ ไม่ได้เปลี่ยนชื่อตัวชั่วคราว) หรือชื่อเก่าที่แก้ไปก่อนมีระบบตามแก้
 * ให้ร้านเลือกว่าเป็นน้องตัวไหน แล้ว relinkCatName ไล่แก้ทุกที่
 */
export async function findUnlinkedCatNames(
  customer: CustomerRef & { cats: { name: string }[] }
): Promise<UnlinkedCatName[]> {
  // ชื่อชั่วคราวนับว่ายังไม่ผูกเสมอ แม้จะมีน้องชื่อนั้นในบ้าน (ตัวชั่วคราวที่สร้างตอนจอง)
  const known = new Set(
    customer.cats.filter((c) => !isUnknownCat(c.name.trim())).map((c) => catNameKey(c.name))
  );
  const hits = new Map<string, UnlinkedCatName>();
  const add = (raw: string, kind: "bookings" | "invoices") => {
    for (const part of raw.split(",")) {
      const name = part.trim();
      const key = catNameKey(name);
      if (!key || known.has(key)) continue;
      const row = hits.get(key) || { name, bookings: 0, invoices: 0 };
      row[kind]++;
      hits.set(key, row);
    }
  };
  for (const b of await householdBookings(customer)) {
    if (b.status !== "cancelled") add(b.catName || "", "bookings");
  }
  const { listInvoices } = await import("./invoices-store");
  for (const inv of await listInvoices(customer.id)) {
    const names = new Set<string>();
    for (const it of inv.items || []) {
      if (it.catName) names.add(it.catName);
      const m = it.label.match(/^(?:🐱|🐶|🐾) (.+?) · /u);
      if (m) names.add(m[1]);
    }
    if (!names.size && inv.catName) names.add(inv.catName);
    // นับบิลละครั้งต่อชื่อ
    const seen = new Set<string>();
    for (const n of names) {
      for (const part of n.split(",")) {
        const k = catNameKey(part);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        add(part, "invoices");
      }
    }
  }
  return [...hits.values()];
}

/**
 * ผูกชื่อในนัด/บิล (ชื่อชั่วคราวหรือชื่อเก่า) เข้ากับน้องตัวจริงในบ้าน — เปลี่ยนชื่อทุกที่ให้เป็นชื่อน้องตัวนั้น
 * ถ้ามีโปรไฟล์น้องชื่อชั่วคราวที่ว่างเปล่า (สร้างอัตโนมัติตอนจอง ไม่มีรูป/ข้อมูล) ลบทิ้งให้ด้วย จะได้ไม่ค้างในบ้าน
 */
export async function relinkCatName(customerId: string, fromName: string, catId: string) {
  const { getCustomer, deleteCat } = await import("./customers-store");
  const c = await getCustomer(customerId);
  const cat = c?.cats.find((x) => x.id === catId);
  if (!c || !cat) return null;
  const from = fromName.trim();
  if (!from || catNameKey(from) === catNameKey(cat.name)) return null;
  const result = await renameCatEverywhere(c, from, cat.name);
  const stub = c.cats.find(
    (x) =>
      x.id !== catId &&
      catNameKey(x.name) === catNameKey(from) &&
      isUnknownCat(x.name.trim()) &&
      !x.photoDataUrl &&
      !x.vaccinePhotos &&
      !x.staffNote &&
      !x.staffPrivateNote &&
      !x.groomHealthInfo &&
      !x.stayInfo &&
      !x.breed &&
      !x.birthday &&
      !(x.media && x.media.length)
  );
  if (stub) await deleteCat(customerId, stub.id).catch(() => null);
  return { ...result, removedStub: Boolean(stub) };
}
