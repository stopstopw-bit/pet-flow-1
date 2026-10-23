import { NextRequest, NextResponse } from "next/server";
import {
  registerCustomerFromLine,
  findCustomerByReferralCode,
  setReferredBy,
} from "@/lib/customers-store";
import { parseCatInput } from "@/lib/cat-input";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
import { parseTaxInvoiceBody } from "@/lib/tax-invoice";
import { withResolvedTenant } from "@/lib/tenant-context";
import { requireCustomerSession } from "@/lib/customer-session";
import { issueCoupon, listCustomerCoupons } from "@/lib/coupons-store";
import { pushLineMessage } from "@/lib/line";

/** คูปองชวนเพื่อน — ออกให้ทั้งคู่ทันทีที่สมัครด้วยโค้ด (เจ้าของร้านเลือกแบบนี้ 2026-10-23) */
const REFERRAL_REWARD = 100;
const REFERRAL_TAG = "เพื่อนแนะนำ";

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
  // ขอใบกำกับภาษี/บิลเต็มรูป — ไม่ติ๊ก = ไม่ส่งมา; ติ๊กแล้วต้องกรอกครบ
  const taxInvoice = parseTaxInvoiceBody(body.taxInvoice);
  if (taxInvoice.error) {
    return NextResponse.json({ error: taxInvoice.error }, { status: 400 });
  }
  const cats = Array.isArray(body.cats)
    ? body.cats.map(parseCatInput)
    : [];

  if (!lineUserId) {
    return NextResponse.json(
      { error: "กรุณาเปิดหน้านี้จาก LINE ของร้านอีกครั้ง" },
      { status: 401 }
    );
  }
  // โค้ดเพื่อนแนะนำ (มาจากลิงก์ หรือลูกค้าพิมพ์เอง) — กรอกผิดบอกก่อนบันทึก จะได้แก้ได้
  const refCode = String(body.referralCode || "").trim().toUpperCase();
  const referrer = refCode ? await findCustomerByReferralCode(refCode) : undefined;
  if (refCode && !referrer) {
    return NextResponse.json(
      { error: `ไม่พบโค้ดเพื่อนแนะนำ "${refCode}" — เช็คตัวสะกดอีกครั้ง หรือเอาติ๊กออกถ้าไม่มีโค้ดนะคะ` },
      { status: 400 }
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
      taxInvoice: taxInvoice.value || undefined,
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
    const catNames =
      customer.cats
        .filter((c) => c.name)
        .map((c) => (c.species ? `${c.name} (${c.species === "dog" ? "หมา" : "แมว"})` : c.name))
        .join(", ") || "-";
    await sendTelegram(
      formatBookingTelegram("🆕 ลูกค้าสมัครสมาชิกใหม่", {
        ชื่อ: customer.name,
        เบอร์: customer.phone || "-",
        น้อง: catNames,
        ช่องทาง: referralSource || "-",
      })
    );
  } catch (e) {
    console.error("new customer notify failed:", e);
  }

  // ── ชวนเพื่อน: ผูกคนชวน + ออกคูปองให้ทั้งคู่ทันที ──
  // ใช้โค้ดได้ครั้งเดียวต่อบัญชี (referredBy) และห้ามใช้โค้ดตัวเอง
  let referredOk = false;
  if (referrer && referrer.id !== customer.id && !customer.referredBy) {
    try {
      await setReferredBy(customer.id, referrer.id);
      referredOk = true;
      const mine = await listCustomerCoupons(customer.id);
      if (!mine.some((c) => c.reason.includes(REFERRAL_TAG))) {
        await issueCoupon({
          customerId: customer.id,
          amount: REFERRAL_REWARD,
          reason: `🎁 สมัครด้วยโค้ด${REFERRAL_TAG}`,
          expiresInDays: 60,
        });
        await issueCoupon({
          customerId: referrer.id,
          amount: REFERRAL_REWARD,
          reason: `🎉 ${REFERRAL_TAG}: ${customer.name} สมัครด้วยโค้ดของคุณ`,
          expiresInDays: 60,
        });
        if (referrer.lineUserId) {
          await pushLineMessage(referrer.lineUserId, [
            {
              type: "text",
              text: `🎉 เพื่อนสมัครด้วยโค้ดของคุณแล้ว!\nคุณได้รับคูปองส่วนลด ${REFERRAL_REWARD}฿ เก็บไว้ในกระเป๋าคูปองแล้วนะคะ 🧡 (ใช้ได้ 60 วัน)`,
            },
          ]).catch((e) => console.error("referral push failed:", e));
        }
      }
      await sendTelegram(
        formatBookingTelegram(`🎁 สมัครด้วยโค้ดเพื่อนแนะนำ (คูปอง ${REFERRAL_REWARD}฿ x2)`, {
          คนชวน: referrer.name,
          คนถูกชวน: customer.name,
          โค้ด: refCode,
        })
      );
    } catch (e) {
      console.error("referral link failed:", e);
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
