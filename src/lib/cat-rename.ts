/**
 * เปลี่ยนชื่อน้องแล้วให้ตามไปทุกที่
 *
 * นัด/บิล/ประวัติบริการ/รายการการเงิน ผูกกับน้องด้วย "ชื่อ" (ไม่มี cat id) — แก้ชื่อที่หน้าลูกค้า
 * อย่างเดียว ของเก่าจะหลุดจากน้องทันที (ประวัติอาบน้ำหาย, นัดไม่ขึ้นในโปรไฟล์, บิลเก่าขึ้นชื่อเดิม)
 * ไฟล์นี้ไล่แก้ชื่อเดิม → ชื่อใหม่ ให้ครบทุกตารางในครั้งเดียว
 *
 * เอกสารทางการ (ใบเสร็จ/ใบกำกับ) ไม่พิมพ์ชื่อน้องอยู่แล้ว (formalItemLabel) แก้บิลที่จ่ายแล้วได้ไม่กระทบเอกสาร
 */

const ZERO_WIDTH_RE = new RegExp(
  "[" + String.fromCharCode(0x200b, 0x200c, 0x200d, 0xfeff) + "\\s]",
  "g"
);

/** เทียบชื่อน้องแบบไม่แคร์ช่องว่าง/อักขระล่องหน (เหมือน catKey ใน customers-store) */
export function catNameKey(name: string): string {
  return name.normalize("NFC").replace(ZERO_WIDTH_RE, "").toLowerCase();
}

/**
 * แทนชื่อในรายชื่อคั่นด้วยจุลภาค เช่น "ส้ม, ดำ" → "ส้มจี๊ด, ดำ"
 * คืนค่าเดิมทุกตัวอักษรถ้าไม่มีชื่อเดิมอยู่ในรายชื่อ (จะได้รู้ว่าไม่ต้องเขียนกลับ)
 */
export function replaceCatInList(text: string, oldName: string, newName: string): string {
  if (!text) return text;
  const key = catNameKey(oldName);
  const parts = text.split(",");
  if (!parts.some((p) => catNameKey(p) === key)) return text;
  return parts
    .map((p) => (catNameKey(p) === key ? newName : p.trim()))
    .filter(Boolean)
    .join(", ");
}

/** ชื่อหน้ารายการบิล "🐾 ส้ม, ดำ · อาบน้ำ" → แทนเฉพาะส่วนชื่อน้อง (คงอิโมจิเดิม 🐱/🐶/🐾) */
export function replaceCatInLabel(label: string, oldName: string, newName: string): string {
  const m = label.match(/^(🐱|🐶|🐾) (.+?) · /u);
  if (!m) return label;
  const names = replaceCatInList(m[2], oldName, newName);
  if (names === m[2]) return label;
  return `${m[1]} ${names} · ${label.slice(m[0].length)}`;
}

/** คำอธิบายรายการการเงิน "ส้ม · คุณมาย — ..." → แทนเฉพาะชื่อน้องข้างหน้า */
export function replaceCatInDescription(desc: string, oldName: string, newName: string): string {
  const i = desc.indexOf(" · ");
  if (i < 0) return desc;
  const head = desc.slice(0, i);
  const names = replaceCatInList(head, oldName, newName);
  if (names === head) return desc;
  return names + desc.slice(i);
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
  customer: { id: string; name: string; lineUserId?: string; lineUserIds?: string[] },
  oldName: string,
  newName: string
): Promise<CatRenameResult> {
  const result: CatRenameResult = { bookings: 0, invoices: 0, services: 0, finance: 0 };
  const from = oldName.trim();
  const to = newName.trim();
  if (!from || !to || catNameKey(from) === catNameKey(to)) return result;

  // นัด — หาจาก LINE ทุกตัวของลูกค้า + ชื่อลูกค้า (นัดที่ร้านลงให้ก่อนผูก LINE)
  try {
    const { listBookings, listBookingsByCustomerName, updateBooking } = await import(
      "./bookings-store"
    );
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
    const { bookingCalendarPayload, updateCalendarEvent } = await import("./calendar");
    for (const b of found.values()) {
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
