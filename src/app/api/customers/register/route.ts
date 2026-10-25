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
import { getSiteConfig } from "@/lib/config-store";
import { isFeatureOn } from "@/lib/features";
import { referralReward } from "@/lib/referral";
import { issueCoupon, listCustomerCoupons } from "@/lib/coupons-store";
import { pushLineMessage } from "@/lib/line";
import { setCatStayInfo } from "@/lib/customers-store";
import { REGISTER_HISTORY_SOURCE, registerHistoryFields, sanitizeIntakeInfo, stayInfoDone } from "@/lib/intake-rules";
import { petKindOf } from "@/lib/pet-kind";

/** คูปองชวนเพื่อน — ออกให้ทั้งคู่ทันทีที่สมัครด้วยโค้ด (เจ้าของร้านเลือกแบบนี้ 2026-10-23)
 * มูลค่า/อายุคูปองตั้งได้ในตั้งค่า › เปิด/ปิดฟีเจอร์ (ดู referralReward) */
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
  // ร้านปิด "ชวนเพื่อนรับคูปอง" ในตั้งค่า — ไม่สนโค้ด (ไม่ผูกคนชวน ไม่แจกคูปอง)
  const siteCfg = await getSiteConfig();
  const reward = referralReward(siteCfg);
  const refCode = isFeatureOn(siteCfg, "referral")
    ? String(body.referralCode || "").trim().toUpperCase()
    : "";
  const referrer = refCode ? await findCustomerByReferralCode(refCode) : undefined;
  if (refCode && !referrer) {
    return NextResponse.json(
      { error: `ไม่พบโค้ดเพื่อนแนะนำ "${refCode}" — เช็คตัวสะกดอีกครั้ง หรือเอาติ๊กออกถ้าไม่มีโค้ดนะคะ` },
      { status: 400 }
    );
  }
  if (!name || !phone || cats.filter((c: { name: string }) => c.name.trim()).length === 0) {
    return NextResponse.json(
      { error: "กรอกชื่อ เบอร์โทร และชื่อน้องอย่างน้อย 1 ตัว" },
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

  // ── ประวัติเจ้าของ + น้อง ที่ร้านให้ถามตอนสมัคร — เก็บเป็นข้อมูลก่อนเข้าพักของน้องแต่ละตัว
  // (ฟอร์มก่อนเข้าพัก/ทำประวัติดึงคำตอบนี้มาให้ ลูกค้าไม่ต้องกรอกซ้ำ) จับคู่น้องด้วยชื่อ ตัวล่าสุดก่อน
  const rawCats: Record<string, unknown>[] = Array.isArray(body.cats) ? body.cats : [];
  const usedCats = new Set<string>();
  for (const raw of rawCats) {
    const history = raw?.history;
    const catName = String(raw?.name || "").trim();
    if (!history || typeof history !== "object" || !catName) continue;
    const match = [...customer.cats].reverse().find((c) => !usedCats.has(c.id) && c.name.trim() === catName);
    if (!match) continue;
    usedCats.add(match.id);
    const h = registerHistoryFields(match.species || petKindOf(siteCfg), siteCfg);
    if (!h) continue;
    let prev: Record<string, unknown> = {};
    try {
      prev = match.stayInfo ? JSON.parse(match.stayInfo) : {};
    } catch {
      prev = {};
    }
    const answers = sanitizeIntakeInfo([...h.owner, ...h.pet], history);
    // ยังไม่เคยกรอกฟอร์มก่อนเข้าพัก = ติดป้ายไว้ ระบบจะยังส่งฟอร์มไปถามหมวดการดูแล (คำตอบนี้เติมให้แล้ว)
    const source = stayInfoDone(match.stayInfo) ? {} : { source: REGISTER_HISTORY_SOURCE };
    await setCatStayInfo(customer.id, match.id, JSON.stringify({ ...prev, ...answers, ...source })).catch((e) =>
      console.error("register history save failed:", e)
    );
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
          amount: reward.amount,
          reason: `🎁 สมัครด้วยโค้ด${REFERRAL_TAG}`,
          expiresInDays: reward.expiresInDays,
        });
        await issueCoupon({
          customerId: referrer.id,
          amount: reward.amount,
          reason: `🎉 ${REFERRAL_TAG}: ${customer.name} สมัครด้วยโค้ดของคุณ`,
          expiresInDays: reward.expiresInDays,
        });
        if (referrer.lineUserId) {
          await pushLineMessage(referrer.lineUserId, [
            {
              type: "text",
              text: `🎉 เพื่อนสมัครด้วยโค้ดของคุณแล้ว!\nคุณได้รับคูปองส่วนลด ${reward.amount}฿ เก็บไว้ในกระเป๋าคูปองแล้วนะคะ 🧡 (ใช้ได้ ${reward.expiresInDays} วัน)`,
            },
          ]).catch((e) => console.error("referral push failed:", e));
        }
      }
      await sendTelegram(
        formatBookingTelegram(`🎁 สมัครด้วยโค้ดเพื่อนแนะนำ (คูปอง ${reward.amount}฿ x2)`, {
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
