import { NextRequest, NextResponse } from "next/server";
import {
  findCustomerByLine,
  upsertCustomerFromLine,
} from "@/lib/customers-store";
import { isProfileComplete } from "@/lib/customer-tier";
import type { CatRecord } from "@/lib/customers-store";
import { requireTenantId, withResolvedTenant } from "@/lib/tenant-context";
import { verifyLiffAccessTokenDetailed, verifyLiffIdTokenDetailed } from "@/lib/liff-auth";
import {
  CUSTOMER_SESSION_COOKIE,
  customerSessionCookieOptions,
  requireCustomerSession,
  signCustomerSession,
  noCustomerSessionResponse,
} from "@/lib/customer-session";

/** ตัด staffPrivateNote (โน้ตลับร้าน) ออกก่อนส่งให้ฝั่งลูกค้าเสมอ */
function catsForCustomer(cats: CatRecord[]) {
  return cats.map((cat) => {
    const rest = { ...cat };
    delete rest.staffPrivateNote;
    return rest;
  });
}

/**
 * ลูกค้าเปิดแอปจาก LINE → สร้าง/ผูกบัญชีอัตโนมัติ + ออกคุกกี้เซสชันลูกค้า
 *
 * จุดตั้งต้นความน่าเชื่อถือของ "เป็นลูกค้าคนนี้จริง" ทั้งระบบ — ต้องมี idToken (LIFF ID token
 * ที่ LINE เซ็นให้ตอนล็อกอินสำเร็จ) มาตรวจกับ LINE ก่อนเสมอ ห้ามเชื่อ lineUserId ที่ client
 * ส่งมาตรงๆ อีกต่อไป ไม่งั้นใครก็ใส่ lineUserId ของคนอื่นแล้วสวมรอยได้
 * (devUserId ยอมรับเฉพาะตอน dev ในเครื่อง — ดู LiffProvider.tsx isLocalDev)
 */
export async function POST(req: NextRequest) {
  return withResolvedTenant(req, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const idToken = typeof body.idToken === "string" ? body.idToken : "";
  const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
  const devUserId = typeof body.devUserId === "string" ? body.devUserId.trim() : "";
  const displayName = String(body.displayName || "").trim();

  let lineUserId = "";
  let verifiedName = "";
  if (idToken || accessToken) {
    // ID token ก่อน · ไม่มี/ไม่ผ่าน (เช่น LIFF ไม่ได้ติ๊ก scope openid) ใช้ access token แทน
    let verified = idToken
      ? await verifyLiffIdTokenDetailed(idToken)
      : ({ ok: false, reason: "no_id_token" } as const);
    if (!verified.ok && accessToken) {
      const viaAccess = await verifyLiffAccessTokenDetailed(accessToken);
      verified = viaAccess.ok ? viaAccess : { ok: false, reason: `${verified.reason}+${viaAccess.reason}` };
    }
    if (!verified.ok) {
      // reason ไปโชว์เป็นรหัสบนจอลูกค้า (customer-fetch.ts) — ร้านดูแล้วรู้ว่าติดตรงไหน
      return NextResponse.json({ error: "invalid_id_token", reason: verified.reason }, { status: 401 });
    }
    lineUserId = verified.identity.lineUserId;
    verifiedName = verified.identity.displayName;
  } else if (devUserId && process.env.NODE_ENV !== "production") {
    lineUserId = devUserId;
  } else {
    console.warn("[liff-auth] แอปไม่ได้ส่ง token มาเลย");
    return NextResponse.json({ error: "idToken required", reason: "no_token" }, { status: 400 });
  }

  let customer;
  try {
    customer = await upsertCustomerFromLine({
      lineUserId,
      displayName: displayName || verifiedName,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("customers/line sync failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (!customer) {
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }

  const res = NextResponse.json({
    ok: true,
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      lineUserId: customer.lineUserId,
      lineDisplayName: customer.lineDisplayName,
      cats: catsForCustomer(customer.cats),
      isMember: customer.isMember,
      memberCredit: customer.memberCredit,
      tier: customer.tier,
    },
    needsRegistration: !isProfileComplete(customer),
  });
  res.cookies.set(
    CUSTOMER_SESSION_COOKIE,
    await signCustomerSession({ lineUserId, tenantId: requireTenantId() }),
    customerSessionCookieOptions()
  );
  return res;
}

export async function GET(req: NextRequest) {
  return withResolvedTenant(req, () => handleGet(req));
}

async function handleGet(req: NextRequest) {
  const session = await requireCustomerSession(req);
  if (!session) {
    return noCustomerSessionResponse();
  }

  const customer = await findCustomerByLine(session.lineUserId);
  if (!customer) {
    return NextResponse.json({ found: false, needsRegistration: true });
  }

  return NextResponse.json({
    found: true,
    needsRegistration: !isProfileComplete(customer),
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      cats: catsForCustomer(customer.cats),
      tier: customer.tier,
      // ต้องส่งเหมือนตอน sync (POST) ไม่งั้นพอ refreshCustomer แล้วเครดิตจะหายไปจากหน้าจอ
      isMember: customer.isMember,
      memberCredit: customer.memberCredit,
    },
  });
}
