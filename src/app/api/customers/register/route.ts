import { NextRequest, NextResponse } from "next/server";
import {
  registerCustomerFromLine,
  findCustomerByReferralCode,
  setReferredBy,
  normalizeWeightKg,
} from "@/lib/customers-store";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
import { withResolvedTenant } from "@/lib/tenant-context";
import { requireCustomerSession } from "@/lib/customer-session";

type CatBody = {
  name?: string;
  gender?: string;
  breed?: string;
  ageValue?: number | string;
  ageUnit?: string;
  birthday?: string;
  medical?: string;
  furLength?: string;
  color?: string;
  weightKg?: number | string;
  staffNote?: string;
};

/** ลูกค้ากรอกฟอร์มลงทะเบียน (ผู้ปกครอง + น้องแมว + ยินยอมรับข่าวสาร) */
export async function POST(req: NextRequest) {
  return withResolvedTenant(req, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  // สมัคร/แก้ข้อมูลได้เฉพาะบัญชี LINE ของตัวเอง (คุกกี้ที่ตรวจกับ LINE แล้ว) — ห้ามเชื่อ body.lineUserId
  // ไม่งั้นใครรู้ LINE ID ของคนอื่นก็เขียนทับชื่อ/เบอร์/ที่อยู่ของเขาได้
  const lineUserId = (await requireCustomerSession(req))?.lineUserId || "";
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim();
  const birthday = String(body.birthday || "").trim();
  const referralSource = String(body.referralSource || "").trim();
  const address = String(body.address || "").trim();
  const addressMapUrl = String(body.addressMapUrl || "").trim();
  const postalCode = String(body.postalCode || "").trim();
  const marketingConsent = body.marketingConsent !== false;
  const cats = Array.isArray(body.cats)
    ? body.cats.map((c: CatBody) => ({
        name: String(c.name || ""),
        gender:
          c.gender === "male" || c.gender === "female" ? c.gender : undefined,
        breed: c.breed ? String(c.breed) : undefined,
        ageValue:
          c.ageValue != null && c.ageValue !== "" && !isNaN(Number(c.ageValue))
            ? Number(c.ageValue)
            : undefined,
        ageUnit: c.ageUnit === "month" ? "month" : c.ageUnit === "year" ? "year" : undefined,
        birthday: c.birthday ? String(c.birthday) : undefined,
        medical: c.medical ? String(c.medical) : undefined,
        furLength:
          c.furLength === "short" || c.furLength === "long" ? c.furLength : undefined,
        color: c.color ? String(c.color) : undefined,
        weightKg: normalizeWeightKg(c.weightKg),
        staffNote: c.staffNote ? String(c.staffNote) : undefined,
      }))
    : [];

  if (!lineUserId) {
    return NextResponse.json(
      { error: "กรุณาเปิดหน้านี้จาก LINE ของร้านอีกครั้ง" },
      { status: 401 }
    );
  }
  if (!name || !phone || cats.filter((c: { name: string }) => c.name.trim()).length === 0) {
    return NextResponse.json(
      { error: "กรอกชื่อ เบอร์โทร และชื่อน้องแมวอย่างน้อย 1 ตัว" },
      { status: 400 }
    );
  }

  let customer;
  try {
    customer = await registerCustomerFromLine({
      lineUserId,
      name,
      phone,
      email: email || undefined,
      birthday: birthday || undefined,
      referralSource: referralSource || undefined,
      address: address || undefined,
      addressMapUrl: addressMapUrl || undefined,
      postalCode: postalCode || undefined,
      marketingConsent,
      cats,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("register failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!customer) {
    return NextResponse.json({ error: "ลงทะเบียนไม่สำเร็จ" }, { status: 500 });
  }

  // ── แจ้งเตือนลูกค้าสมัครใหม่ ──
  try {
    const catNames = customer.cats.map((c) => c.name).filter(Boolean).join(", ") || "-";
    await sendTelegram(
      formatBookingTelegram("🆕 ลูกค้าสมัครสมาชิกใหม่", {
        ชื่อ: customer.name,
        เบอร์: customer.phone || "-",
        น้องแมว: catNames,
        ช่องทาง: referralSource || "-",
      })
    );
  } catch (e) {
    console.error("new customer notify failed:", e);
  }

  // ── ชวนเพื่อน: บันทึกว่าถูกชวนมาโดยใคร (ยังไม่ออกคูปอง) ──
  // คูปองจะจ่ายให้ทั้งคู่ตอนเพื่อน "มาใช้บริการครั้งแรก" (กันปั๊มบัญชีปลอมรับคูปอง)
  const refCode = String(body.referralCode || "").trim();
  let referredOk = false;
  if (refCode && !customer.referredBy) {
    const referrer = await findCustomerByReferralCode(refCode);
    if (referrer && referrer.id !== customer.id) {
      try {
        await setReferredBy(customer.id, referrer.id);
        referredOk = true;
        await sendTelegram(
          formatBookingTelegram("👥 สมัครผ่านเพื่อนแนะนำ (รอมาใช้บริการ)", {
            คนชวน: referrer.name,
            คนถูกชวน: customer.name,
            หมายเหตุ: "คูปอง 100฿ x2 จะจ่ายเมื่อมาใช้บริการครั้งแรก",
          })
        );
      } catch (e) {
        console.error("referral link failed:", e);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    referredOk,
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      cats: customer.cats.map((cat) => {
        const rest = { ...cat };
        delete rest.staffPrivateNote;
        return rest;
      }),
      tier: customer.tier,
    },
  });
}
