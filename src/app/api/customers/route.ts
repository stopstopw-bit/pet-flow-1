import { NextRequest, NextResponse } from "next/server";
import { parseTaxInvoiceBody } from "@/lib/tax-invoice";
import {
  listCustomersWithAppointmentCounts,
  searchCustomers,
  getCustomer,
  updateCustomer,
  updateCat,
  updateCatPrivateNote,
  updateCatMedia,
  type CatMediaItem,
  addCat,
  deleteCat,
  deleteCustomer,
  restoreCustomer,
  mergeCustomers,
  listTrashedCustomers,
  topupMemberCredit,
  cancelMemberTopup,
  findCancelCreditTopup,
  deleteServiceRecord,
  upsertCustomerFromBooking,
  recalculateCustomerTier,
  recalcAllTiers,
  adoptLineFromBookings,
  unlinkCustomerLine,
  getOrCreateWalkInCustomer,
  addCatVaccinePhotos,
  setCatVaccinePhotos,
  normalizeSpecies,
} from "@/lib/customers-store";
import { splitVaccinePhotos } from "@/lib/vaccine-photos";
import { parseCatInput, type CatInput } from "@/lib/cat-input";
import type { CustomerTier } from "@/lib/customer-tier";
import { getAllPointsMap } from "@/lib/points-store";
import {
  customerActivityInfo,
  listInactiveCustomers,
  previewCustomerFollowUp,
  sendCustomerFollowUp,
  sendInactiveFollowUps,
} from "@/lib/customer-crm";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { withTenant } from "@/lib/tenant-context";
import { pushLineMessage, buildMemberBalanceFlex } from "@/lib/line";
import { getSiteConfig } from "@/lib/config-store";
import { isFeatureOn } from "@/lib/features";
import { customerServiceLog } from "@/lib/customer-service-log";

async function requireTenant(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return session.tenantId;
}

export async function GET(req: NextRequest) {
  const tenantId = await requireTenant(req);
  if (!tenantId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return withTenant(tenantId, () => handleGet(req));
}

async function handleGet(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const q = req.nextUrl.searchParams.get("q");
  const inactive = req.nextUrl.searchParams.get("inactive");

  if (inactive === "1") {
    const days = Number(req.nextUrl.searchParams.get("days")) || undefined;
    const rows = await listInactiveCustomers(days);
    return NextResponse.json({ inactive: rows });
  }

  if (req.nextUrl.searchParams.get("trash") === "1") {
    return NextResponse.json({ customers: await listTrashedCustomers() });
  }

  if (id) {
    const activity = await customerActivityInfo(id);
    if (!activity) return NextResponse.json({ error: "not found" }, { status: 404 });
    const serviceLog = await customerServiceLog(
      id,
      activity.history.pastBookings.map((b) => b.id)
    );
    return NextResponse.json({ ...activity, serviceLog });
  }

  if (q) {
    const [customers, pointsMap] = await Promise.all([
      searchCustomers(q),
      getAllPointsMap(),
    ]);
    return NextResponse.json({
      customers: customers.map((c) => ({
        ...c,
        points: pointsMap[`C:${c.id}`] ?? (c.lineUserId ? pointsMap[c.lineUserId] ?? 0 : 0),
      })),
    });
  }
  const [customers, pointsMap] = await Promise.all([
    listCustomersWithAppointmentCounts(),
    getAllPointsMap(),
  ]);
  return NextResponse.json({
    customers: customers.map((c) => ({
      ...c,
      // แต้มผูกกับลูกค้า (C:<id>) แล้ว — ถ้าไม่เจอค่อยถอยไปดูคีย์เก่าที่ผูกกับ LINE ID
      points: pointsMap[`C:${c.id}`] ?? (c.lineUserId ? pointsMap[c.lineUserId] ?? 0 : 0),
    })),
  });
}

export async function POST(req: NextRequest) {
  const tenantId = await requireTenant(req);
  if (!tenantId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return withTenant(tenantId, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  // ฟอร์ม "เพิ่มลูกค้าเอง" ส่งน้องมาเป็นรายการ (หลายตัว + รายละเอียดเหมือนตอนสมัคร) · ที่อื่นยังส่ง catName ตัวเดียว
  const cats: CatInput[] = Array.isArray(body.cats)
    ? body.cats.map(parseCatInput).filter((c: CatInput) => c.name)
    : [];
  const catName = cats[0]?.name || String(body.catName || "").trim();
  const customerName = String(body.customerName || "").trim();
  if (!customerName || !catName) {
    return NextResponse.json(
      { error: "กรอกชื่อลูกค้าและชื่อน้อง" },
      { status: 400 }
    );
  }
  // สมัครในนามนิติบุคคล / ขอใบกำกับภาษี — ตรวจก่อนสร้างลูกค้า จะได้ไม่ค้างครึ่ง ๆ
  const taxInvoice = parseTaxInvoiceBody(body.taxInvoice ?? undefined);
  if (taxInvoice.error) return NextResponse.json({ error: taxInvoice.error }, { status: 400 });
  let customer = await upsertCustomerFromBooking({
    customerName,
    catName,
    lineUserId: body.lineUserId,
    phone: body.phone,
    staffNote: cats.length ? undefined : body.staffNote,
  });
  // ข้อมูลเสริมตอนร้านเพิ่มลูกค้าเอง — ใส่เฉพาะช่องที่กรอกมา
  const extra: Parameters<typeof updateCustomer>[1] = {};
  for (const k of [
    "email",
    "birthday",
    "referralSource",
    "address",
    "addressMapUrl",
    "postalCode",
  ] as const) {
    const v = typeof body[k] === "string" ? body[k].trim() : "";
    if (v) extra[k] = v;
  }
  if (taxInvoice.value) extra.taxInvoice = taxInvoice.value;
  if (Object.keys(extra).length > 0) {
    customer = (await updateCustomer(customer.id, extra)) ?? customer;
  }
  // รายละเอียดน้อง — ตัวแรกถูกสร้างไว้แล้ว (หรือเป็นตัวเดิมของลูกค้าคนนี้) ก็เติมรายละเอียดให้ ตัวอื่นเพิ่มใหม่
  for (const cat of cats) {
    const found = customer.cats.find((x) => x.name.trim() === cat.name);
    // ช่องที่เว้นว่างไม่ส่งต่อ — ไม่งั้นจะไปลบรายละเอียดเดิมของน้องตัวที่มีอยู่แล้ว
    const filled = Object.fromEntries(
      Object.entries(cat).filter(([, v]) => v !== undefined)
    ) as CatInput;
    const updated = found
      ? await updateCat(customer.id, found.id, filled)
      : await addCat(customer.id, filled);
    if (updated) customer = updated;
  }
  return NextResponse.json({ ok: true, customer });
}

export async function PATCH(req: NextRequest) {
  const tenantId = await requireTenant(req);
  if (!tenantId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return withTenant(tenantId, () => handlePatch(req));
}

async function handlePatch(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id, action } = body;

  if (action === "recalc_all_tiers") {
    const res = await recalcAllTiers();
    return NextResponse.json({ ok: true, ...res });
  }

  // ลูกค้าโครงสำหรับ "ขายเร็ว ไม่ระบุลูกค้า" ในหน้าคิดเงิน (ขายสินค้าหน้าร้านล้วนๆ ไม่มีน้องแมว)
  if (action === "get_or_create_walkin") {
    const customer = await getOrCreateWalkInCustomer();
    return NextResponse.json({ ok: true, customer });
  }

  if (action === "update_customer") {
    const patch = { ...(body.patch || {}) };
    if ("taxInvoice" in patch) {
      const t = parseTaxInvoiceBody(patch.taxInvoice);
      if (t.error) return NextResponse.json({ error: t.error }, { status: 400 });
      patch.taxInvoice = t.value;
    }
    const c = await updateCustomer(id, patch);
    if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, customer: c });
  }

  if (action === "update_cat") {
    const catPatch = { ...(body.patch || {}) };
    if ("species" in catPatch) {
      const sp = normalizeSpecies(catPatch.species);
      if (sp) catPatch.species = sp;
      else delete catPatch.species;
    }
    const c = await updateCat(id, body.catId, catPatch);
    if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, customer: c });
  }

  // พนักงานแนบ / ลบรูปสมุดวัคซีนที่ตัวน้องเอง (ไม่ต้องมีนัด)
  if (action === "add_cat_vaccine") {
    const photos: string[] = Array.isArray(body.photos) ? body.photos.map((v: unknown) => String(v || "")) : [];
    const res = await addCatVaccinePhotos(id, String(body.catId || ""), photos);
    if (!res.ok) {
      return NextResponse.json(
        { error: res.error === "no_photo" ? "ไม่พบรูปที่แนบ" : res.error === "not_found" ? "not found" : "บันทึกไม่สำเร็จ" },
        { status: res.error === "need_sql" ? 500 : 400 }
      );
    }
    return NextResponse.json({ ok: true });
  }
  if (action === "remove_cat_vaccine") {
    const c = await getCustomer(id);
    const cat = c?.cats.find((x) => x.id === body.catId);
    if (!c || !cat) return NextResponse.json({ error: "not found" }, { status: 404 });
    const urls = splitVaccinePhotos(cat.vaccinePhotos).filter((u) => u !== String(body.url || ""));
    const res = await setCatVaccinePhotos(id, cat.id, urls);
    if (!res.ok) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "update_cat_private_note") {
    const res = await updateCatPrivateNote(id, body.catId, String(body.note ?? ""));
    if (!res.ok && res.error === "not_found") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    // ถ้ายังไม่ได้รัน SQL (ไม่มีคอลัมน์) จะได้ need_sql — ไม่ถือว่า error ร้ายแรง
    return NextResponse.json({
      ok: res.ok,
      needSql: !res.ok && res.error === "need_sql",
    });
  }

  if (action === "update_cat_media") {
    const media = Array.isArray(body.media) ? (body.media as CatMediaItem[]) : [];
    const res = await updateCatMedia(id, body.catId, media);
    if (!res.ok && res.error === "not_found") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: res.ok,
      needSql: !res.ok && res.error === "need_sql",
    });
  }

  if (action === "add_cat") {
    try {
      const c = await addCat(id, {
        name: String(body.name || ""),
        neutered: typeof body.neutered === "boolean" ? body.neutered : undefined,
        seizureHistory: body.seizureHistory ? String(body.seizureHistory) : undefined,
        allergy: body.allergy ? String(body.allergy) : undefined,
        staffNote: body.staffNote ? String(body.staffNote) : undefined,
        species: normalizeSpecies(body.species),
      });
      if (!c) {
        return NextResponse.json({ error: "กรอกชื่อน้อง" }, { status: 400 });
      }
      return NextResponse.json({ ok: true, customer: c });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "เพิ่มน้องไม่สำเร็จ" },
        { status: 500 }
      );
    }
  }

  // ลบประวัติใช้บริการทีละรายการ — เผื่อลงข้อมูลผิด ลูกค้าจะได้ไม่เห็นในแอปด้วย
  if (action === "delete_service_record") {
    const serviceId = String(body.serviceId || "");
    if (!serviceId) {
      return NextResponse.json({ error: "serviceId required" }, { status: 400 });
    }
    await deleteServiceRecord(serviceId);
    return NextResponse.json({ ok: true });
  }

  if (action === "delete_cat") {
    try {
      const c = await deleteCat(id, String(body.catId || ""));
      if (!c) {
        return NextResponse.json({ error: "ไม่พบน้องแมว" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, customer: c });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "ลบไม่สำเร็จ" },
        { status: 500 }
      );
    }
  }

  if (action === "delete_customer") {
    try {
      await deleteCustomer(id);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "ลบไม่สำเร็จ" },
        { status: 500 }
      );
    }
  }

  if (action === "restore_customer") {
    await restoreCustomer(id);
    return NextResponse.json({ ok: true });
  }

  // ปลดผูก LINE — ล้างให้หมดแล้วส่งลิงก์เชิญให้ลูกค้ากดผูกใหม่ได้เลย
  if (action === "unlink_line") {
    const res = await unlinkCustomerLine(id);
    if (!res.ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  // ผูก LINE ให้ลูกค้าโดยดึงจากนัดของเขาเอง — ไม่ต้องรบกวนลูกค้า ไม่ต้องงมหา record ซ้ำ
  if (action === "adopt_line_from_bookings") {
    const res = await adoptLineFromBookings(id);
    if (!res.ok) {
      const messages: Record<string, string> = {
        not_found: "ไม่พบลูกค้า",
        no_booking_line:
          "หา LINE ID ของลูกค้าคนนี้ไม่เจอเลย (ทั้งในนัดและบัญชีที่เคยรวม) — ใช้ลิงก์เชิญผูกแทน",
      };
      // เขียนฐานข้อมูลไม่ผ่าน — ต้องโชว์เหตุผลจริง ไม่ใช่ขึ้นว่าสำเร็จแล้วไม่ผูก
      if (res.error.startsWith("write_failed")) {
        return NextResponse.json(
          { error: `บันทึกไม่สำเร็จ — ${res.error.replace("write_failed: ", "")}` },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: messages[res.error] || res.error },
        { status: 400 }
      );
    }
    return NextResponse.json(res);
  }

  // รวมลูกค้าซ้ำ 2 record → 1 (ย้ายแต้ม/คูปอง/เครดิต/บิล/แมว/LINE ID ไปที่ target แล้วลบ source)
  if (action === "merge_customer") {
    const targetId = String(body.targetId || "").trim();
    const res = await mergeCustomers(id, targetId);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, targetId: res.targetId });
  }

  if (action === "topup_member") {
    // ร้านปิดเครดิต Member ในตั้งค่า › เปิด/ปิดฟีเจอร์ — เติมใหม่ไม่ได้
    if (!isFeatureOn(await getSiteConfig(), "memberCredit")) {
      return NextResponse.json({ error: "feature_disabled", feature: "memberCredit" }, { status: 403 });
    }
    const paidAmount =
      body.paidAmount != null
        ? Number(body.paidAmount)
        : Number(body.amount) || 0;
    const isCancelCredit = Boolean(body.isCancelCredit);
    const bonusAmount = isCancelCredit ? 0 : Number(body.bonusAmount) || 0;
    const sourceInvoiceId = isCancelCredit ? String(body.sourceInvoiceId || "").trim() : "";

    // 🔁 ระบุเลขบิลมา → ต้องเป็นบิลของลูกค้าคนนี้ที่จ่ายแล้ว และยังไม่เคยแปลงเป็นเครดิต
    // (กันกรอกเลขบิลผิด / แปลงบิลเดียวซ้ำสองรอบ)
    if (sourceInvoiceId) {
      const { getInvoice } = await import("@/lib/invoices-store");
      const src = await getInvoice(sourceInvoiceId);
      if (!src || src.customerId !== id) {
        return NextResponse.json({ error: "ไม่พบบิลนี้ของลูกค้าคนนี้" }, { status: 400 });
      }
      if (src.status !== "paid") {
        return NextResponse.json({ error: "บิลนี้ยังไม่ได้ชำระ" }, { status: 400 });
      }
      if (await findCancelCreditTopup(sourceInvoiceId)) {
        return NextResponse.json({ error: "บิลนี้เก็บเป็นเครดิตไปแล้ว" }, { status: 400 });
      }
    }

    const result = await topupMemberCredit(id, {
      paidAmount,
      bonusAmount,
      note:
        isCancelCredit && sourceInvoiceId
          ? [`ยกเลิกนัด · บิล ${sourceInvoiceId}`, String(body.note || "").trim()]
              .filter(Boolean)
              .join(" · ")
          : body.note,
      isLegacy: Boolean(body.isLegacy),
      isCancelCredit,
      sourceInvoiceId: sourceInvoiceId || undefined,
    });
    if (!result) {
      return NextResponse.json({ error: "invalid_topup" }, { status: 400 });
    }

    // แจ้งลูกค้าเฉพาะตอนติ๊กเท่านั้น — ยกยอดเก่าเข้าระบบทีละหลายคนไม่ควรไปกวนลูกค้า
    // (และไม่เสียโควตาข้อความโดยไม่จำเป็น)
    let notifyError: string | undefined;
    if (body.notify === true && result.customer.lineUserId) {
      const cfg = await getSiteConfig();
      try {
        await pushLineMessage(result.customer.lineUserId, [
          buildMemberBalanceFlex({
            customerName: result.customer.name,
            memberCredit: result.customer.memberCredit,
          }, cfg.cards?.memberBalance),
        ]);
      } catch (e) {
        notifyError = e instanceof Error ? e.message : String(e);
      }
    }

    return NextResponse.json({
      ok: true,
      customer: result.customer,
      topup: result.topup,
      notifyError,
    });
  }

  // ยกเลิกรายการเติมเครดิต — ถอนยอดออกจากเครดิตลูกค้า + ลบรายรับที่ลงคู่กันไว้
  if (action === "cancel_topup") {
    const topupId = String(body.topupId || "");
    if (!topupId) {
      return NextResponse.json({ error: "topupId required" }, { status: 400 });
    }
    const res = await cancelMemberTopup(topupId);
    if (!res.ok) {
      return NextResponse.json(
        res.error === "credit_spent"
          ? { error: res.error, balance: res.balance, creditAdded: res.creditAdded }
          : { error: res.error },
        { status: res.error === "credit_spent" ? 400 : 404 }
      );
    }
    return NextResponse.json({ ok: true, balance: res.balance });
  }

  if (action === "set_member") {
    const c = await updateCustomer(id, {
      isMember: Boolean(body.isMember),
      memberCredit: Number(body.memberCredit) || 0,
    });
    if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
    await recalculateCustomerTier(id);
    const refreshed = await getCustomer(id);
    return NextResponse.json({ ok: true, customer: refreshed });
  }

  if (action === "set_tier") {
    const tier = body.tier as CustomerTier;
    const c = await updateCustomer(id, { tier });
    if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, customer: c });
  }

  if (action === "recalculate_tier") {
    const c = await recalculateCustomerTier(id);
    if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, customer: c });
  }

  if (action === "set_staff_tiers") {
    return NextResponse.json({ error: "use set_tier instead" }, { status: 400 });
  }

  if (action === "send_follow_up") {
    // ดูตัวอย่างการ์ดก่อนส่งจริง — ยังไม่ส่ง ไม่นับ cooldown
    if (body.preview === true) {
      const preview = await previewCustomerFollowUp(id, {
        message: body.message ? String(body.message) : undefined,
      });
      if (!preview.ok) return NextResponse.json({ error: preview.error }, { status: 400 });
      return NextResponse.json({ ok: true, preview: preview.messages });
    }
    const result = await sendCustomerFollowUp(id, {
      message: body.message ? String(body.message) : undefined,
      force: Boolean(body.force),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, customer: result.customer, message: result.message });
  }

  if (action === "send_inactive_follow_ups") {
    const result = await sendInactiveFollowUps({
      inactiveDays: body.inactiveDays != null ? Number(body.inactiveDays) : undefined,
      limit: body.limit != null ? Number(body.limit) : 20,
      force: Boolean(body.force),
    });
    return NextResponse.json({ ok: true, ...result });
  }

  const c = await getCustomer(id);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ customer: c });
}
