import { NextRequest, NextResponse } from "next/server";
import {
  findCustomerByLine,
  updateCustomer,
  updateCat,
  addCat,
} from "@/lib/customers-store";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
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
      marketingConsent: c.marketingConsent !== false,
      cats: c.cats.map((x) => ({
        id: x.id,
        name: x.name,
        gender: x.gender || "",
        breed: x.breed || "",
        ageValue: x.ageValue ?? "",
        ageUnit: x.ageUnit || "year",
        birthday: x.birthday || "",
        medical: x.medical || "",
        note: x.staffNote || "",
      })),
    },
  });
}

/** ลูกค้าแก้ไขข้อมูลตัวเอง — ผู้ปกครอง + น้องแมว (ยืนยันตัวจาก lineUserId ของ LIFF) */
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
  } = {};
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
      };
      // id ที่ขึ้นต้นด้วย "new-" มาจากการกด "เพิ่มน้องแมว" ในหน้านี้ — ยังไม่มีตัวจริงในระบบ
      if (!cat?.id || String(cat.id).startsWith("new-")) {
        await addCat(c.id, shared);
      } else {
        await updateCat(c.id, String(cat.id), shared);
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
