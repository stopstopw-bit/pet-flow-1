import { NextRequest, NextResponse } from "next/server";
import {
  findCustomerByLine,
  updateCustomer,
  updateCat,
  addCat,
  normalizeSpecies, normalizeWeightKg,
} from "@/lib/customers-store";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
import { parseTaxInvoiceBody, type CustomerTaxInvoice } from "@/lib/tax-invoice";
import { withResolvedTenant } from "@/lib/tenant-context";
import { requireCustomerSession } from "@/lib/customer-session";

/** ลูกค้าดึงข้อมูลตัวเอง (สำหรับหน้าแก้ไขโปรไฟล์ใน LINE) — ครบทุกฟิลด์ที่กรอกตอนสมัคร */
export async function GET(req: NextRequest) {
  return withResolvedTenant(req, () => handleGet(req));
}

async function handleGet(req: NextRequest) {
  const session = await requireCustomerSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const c = await findCustomerByLine(session.lineUserId);
  if (!c) return NextResponse.json({ found: false });
  return NextResponse.json({
    found: true,
    customer: {
      id: c.id,
      name: c.name,
      phone: c.phone || "",
      email: c.email || "",
      birthday: c.birthday || "",
      referralSource: c.referralSource || "",
      address: c.address || "",
      addressMapUrl: c.addressMapUrl || "",
      postalCode: c.postalCode || "",
      idCardUrl: c.idCardUrl || "",
      consentAcceptedAt: c.consentAcceptedAt || "",
      taxInvoice: c.taxInvoice ?? null,
      marketingConsent: c.marketingConsent !== false,
      cats: c.cats.map((x) => ({
        id: x.id,
        name: x.name,
        species: x.species || "",
        gender: x.gender || "",
        breed: x.breed || "",
        ageValue: x.ageValue ?? "",
        ageUnit: x.ageUnit || "year",
        weightKg: x.weightKg ?? "",
        birthday: x.birthday || "",
        medical: x.medical || "",
        note: x.staffNote || "",
        // หน้าแนบสมุดวัคซีน/ฟอร์มประวัติใช้บอกลูกค้าว่าส่งอะไรไปแล้วบ้าง (ไม่ส่งตัวรูปออกไป)
        vaccineCount: x.vaccinePhotos ? x.vaccinePhotos.split("\n").filter(Boolean).length : 0,
        hasPetInfo: Boolean(x.groomHealthInfo),
        hasStayInfo: Boolean(x.stayInfo),
      })),
    },
  });
}

/** ลูกค้าแก้ไขข้อมูลตัวเอง — ผู้ปกครอง + น้อง (ยืนยันตัวจาก lineUserId ของ LIFF) */
export async function POST(req: NextRequest) {
  return withResolvedTenant(req, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const session = await requireCustomerSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const c = await findCustomerByLine(session.lineUserId);
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const patch: {
    name?: string;
    phone?: string;
    email?: string;
    birthday?: string;
    referralSource?: string;
    address?: string;
    addressMapUrl?: string;
    postalCode?: string;
    marketingConsent?: boolean;
    taxInvoice?: CustomerTaxInvoice | null;
  } = {};
  // หน้าเก่าที่ยังไม่มีช่องนี้จะไม่ส่ง taxInvoice มา — คงค่าเดิมไว้
  const taxInvoice = parseTaxInvoiceBody(body.taxInvoice);
  if (taxInvoice.error) return NextResponse.json({ error: taxInvoice.error }, { status: 400 });
  if (taxInvoice.value !== undefined) patch.taxInvoice = taxInvoice.value;
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.phone === "string") patch.phone = body.phone.trim() || undefined;
  if (typeof body.email === "string") patch.email = body.email.trim() || undefined;
  if (typeof body.birthday === "string") patch.birthday = body.birthday.trim() || undefined;
  if (typeof body.referralSource === "string")
    patch.referralSource = body.referralSource.trim() || undefined;
  if (typeof body.address === "string") patch.address = body.address.trim() || undefined;
  if (typeof body.addressMapUrl === "string")
    patch.addressMapUrl = body.addressMapUrl.trim() || undefined;
  if (typeof body.postalCode === "string")
    patch.postalCode = body.postalCode.trim() || undefined;
  if (typeof body.marketingConsent === "boolean")
    patch.marketingConsent = body.marketingConsent;
  await updateCustomer(c.id, patch);

  if (Array.isArray(body.cats)) {
    for (const cat of body.cats) {
      if (typeof cat?.name !== "string" || !cat.name.trim()) continue;
      const shared = {
        name: cat.name.trim(),
        gender:
          cat.gender === "male" || cat.gender === "female" ? cat.gender : undefined,
        breed: cat.breed ? String(cat.breed).trim() : undefined,
        ageValue:
          cat.ageValue !== "" && cat.ageValue != null && !isNaN(Number(cat.ageValue))
            ? Number(cat.ageValue)
            : undefined,
        ageUnit: (cat.ageUnit === "month" ? "month" : "year") as "month" | "year",
        birthday: cat.birthday ? String(cat.birthday) : undefined,
        medical: cat.medical ? String(cat.medical).trim() : undefined,
        staffNote: cat.note ? String(cat.note).trim() : undefined,
        // ไม่ส่งมา = คงค่าเดิม
        species: normalizeSpecies(cat.species),
      };
      // id ที่ขึ้นต้นด้วย "new-" มาจากการกด "เพิ่มน้องแมว" ในหน้านี้ — ยังไม่มีตัวจริงในระบบ
      const weightKg = normalizeWeightKg(cat.weightKg);
      if (!cat?.id || String(cat.id).startsWith("new-")) {
        await addCat(c.id, { ...shared, weightKg });
      } else {
        // หน้าเก่าที่ยังไม่มีช่องน้ำหนักจะไม่ส่ง weightKg มา — อย่าไปลบค่าที่ร้านกรอกไว้
        await updateCat(c.id, String(cat.id), {
          ...shared,
          ...("weightKg" in cat ? { weightKg: weightKg ?? null } : {}),
        });
      }
    }
  }

  await sendTelegram(
    formatBookingTelegram("✏️ ลูกค้าแก้ไขข้อมูลตัวเอง", {
      ลูกค้า: patch.name || c.name,
      เบอร์: patch.phone ?? c.phone ?? "-",
    })
  );

  return NextResponse.json({ ok: true });
}
