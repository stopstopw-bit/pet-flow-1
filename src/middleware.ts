import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_NAME_HEADER,
  shopSessionCookie,
  verifySession,
} from "@/lib/auth";
import { PLATFORM_SESSION_COOKIE, verifyPlatformSession } from "@/lib/platform-auth";
import { TENANT_COOKIE, TENANT_SLUG_HEADER } from "@/lib/tenant-resolve";
import { rateLimit, clientKey } from "@/lib/rate-limit";

/**
 * ด่านตรวจสิทธิ์ก่อนเข้าถึงหลังบ้าน + จับร้าน (multi-tenant, path-based)
 *
 * ก่อนหน้านี้หน้า /admin เช็ครหัสในเบราว์เซอร์อย่างเดียว ส่วน /api เปิดโล่งหมด
 * ใครก็ยิง /api/customers ดึงชื่อ-เบอร์-ที่อยู่ลูกค้าทั้งร้าน หรือ /api/finance ลบบัญชีได้
 * ตอนนี้ทุกอย่างต้องมีคุกกี้ที่เซ็นชื่อ ยกเว้นรายการสาธารณะด้านล่าง
 *
 * Multi-tenant (R3): ลูกค้าเข้าผ่าน /s/<slug>/... — ด่านนี้ตัด prefix ออก, ใส่ header
 * x-tenant-slug ให้ route อ่าน, ตั้ง cookie pf_tenant เพื่อให้ API call ต่อ ๆ มา
 * (ที่ไม่มี /s) ยังรู้ว่าเป็นร้านไหน แล้ว rewrite ไป path จริง
 */

/** เปิดสาธารณะจริง ๆ — แอปลูกค้าใน LINE, webhook ของ LINE/Telegram, cron, ไฟล์ที่ LINE มาดึง */
const PUBLIC_API = [
  "/api/auth/login",
  // แอปลูกค้า (LIFF) — ลูกค้ายังไม่ได้ล็อกอินหลังบ้าน
  "/api/customers/register",
  "/api/customers/link",
  "/api/customers/self",
  "/api/customers/line",
  "/api/customers/cat-photo",
  // แนบรูปบัตรประชาชนจากหน้าข้อตกลงเข้าพัก — route ตรวจคุกกี้เซสชันลูกค้าเอง (requireCustomerSession)
  // ตกหล่นไปตอนเพิ่มฟีเจอร์ ลูกค้าเลยโดน 401 แนบไม่ได้ (มีแต่เจ้าของร้านที่ล็อกอินหลังบ้านค้างไว้ที่แนบได้)
  "/api/customers/id-card",
  "/api/bookings/consent",
  "/api/bookings/groom-info",
  "/api/bookings/time",
  "/api/bookings/transport",
  "/api/coupons/claim",
  "/api/promos/claim",
  "/api/line/liff",
  // ลิงก์เอกสาร (ใบเสร็จ/ใบกำกับภาษี) ที่ส่งให้ลูกค้าทาง LINE — ตรวจโทเคนที่เซ็นไว้ใน route
  "/api/doc-public",
  // แบบสอบถามเจ้าของร้านใหม่ — ยังไม่มีบัญชีอะไรเลยตอนตอบ
  "/api/shop-questions",
  // ระบบภายนอกเรียกเข้ามา
  "/api/line/webhook",
  "/api/telegram/webhook",
  "/api/line/broadcast-image",
  "/api/cron",
];

/** เปิดเฉพาะตอนอ่าน (GET) — เขียนต้องเป็นหลังบ้าน */
const PUBLIC_GET = ["/api/config", "/api/articles", "/api/promos"];

/**
 * ใช้ร่วมกันทั้งลูกค้าและหลังบ้าน — ปล่อยผ่านด่านนี้ แล้วให้ตัว route
 * ตรวจเองว่าคนที่ไม่ได้ล็อกอินทำอะไรได้บ้าง (ดู requireAdmin ใน route)
 */
const SHARED_API = [
  "/api/bookings",
  "/api/packages",
  "/api/package-shop",
  "/api/points",
  "/api/coupons",
  "/api/invoices",
  // ไฟล์ส่วนตัว (บัตรประชาชน/สลิป/รูปแมว) — route ตรวจเองว่าเป็นคนของร้านนั้น
  "/api/files",
];

/** ร้านของหน้าที่ยิงคำขอนี้ — fetch/การเปลี่ยนหน้าในแอปส่ง Referer เป็นหน้าปัจจุบันเสมอ */
function refererShop(req: NextRequest): string | null {
  const ref = req.headers.get("referer");
  if (!ref) return null;
  try {
    const url = new URL(ref);
    if (url.host !== req.nextUrl.host) return null;
    const m = url.pathname.match(/^\/s\/([a-z0-9-]+)(?:\/|$)/i);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

/** หน้าที่ยิงคำขอนี้คือแอปลูกค้า (/app หรือ /s/<slug>/app) */
function refererIsCustomerApp(req: NextRequest): boolean {
  const ref = req.headers.get("referer");
  if (!ref) return false;
  try {
    const url = new URL(ref);
    return url.host === req.nextUrl.host && /^(\/s\/[a-z0-9-]+)?\/app(\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

/** หน้าที่ยิงคำขอนี้คือแอปลูกค้า /app แบบไม่มีชื่อร้านในลิงก์ */
function refererIsPlainApp(req: NextRequest): boolean {
  const ref = req.headers.get("referer");
  if (!ref) return false;
  try {
    const url = new URL(ref);
    return url.host === req.nextUrl.host && /^\/app(\/|$)/.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * API ข้อมูลอ่อนไหวที่พนักงานใช้ได้เฉพาะเมื่อเจ้าของเปิดเมนูนั้นให้ (เจ้าของร้านใช้ได้หมด)
 * เดิมจำกัดเมนูแค่ซ่อนปุ่มในหน้าเว็บ พนักงานยิง API ตรงก็ดาวน์โหลดข้อมูลลูกค้าทั้งร้าน
 * ดูบัญชี หรือส่ง LINE หาลูกค้าทุกคนได้
 */
const STAFF_API_MENUS: [string, string[]][] = [
  ["/api/admin/backup", ["/admin/settings"]],
  ["/api/audit", ["/admin/settings"]],
  ["/api/export/sheets", ["/admin/customers", "/admin/finance", "/admin/tax"]],
  ["/api/finance", ["/admin/finance", "/admin/tax"]],
  ["/api/line/broadcast", ["/admin/promos"]],
  ["/api/setup", ["/admin/setup"]],
  ["/api/admin/migrate-photos", ["/admin/setup"]],
  ["/api/admin/cleanup-broadcast-images", ["/admin/setup"]],
];

function staffMayCall(pathname: string, menus: string[] | undefined): boolean {
  const rule = STAFF_API_MENUS.find(([p]) => pathname === p || pathname.startsWith(`${p}/`));
  if (!rule) return true;
  return rule[1].some((m) => (menus || []).includes(m));
}

function matches(path: string, list: string[]) {
  return list.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * ระบบภายนอกยิงเข้ามาเป็นชุด — LINE ส่ง webhook ทีละหลายอีเวนต์, cron ยิงรอบเดียวจบ
 * ถ้าไปจำกัดตรงนี้ ข้อความลูกค้าจะหาย/แจ้งเตือนไม่ออก อันตรายกว่าที่ป้องกันได้
 */
const NO_LIMIT = ["/api/line/webhook", "/api/telegram/webhook", "/api/cron"];

/** เดารหัสหลังบ้านต้องยากที่สุด — ล็อกอินจึงคุมแยกและเข้มกว่าที่อื่นมาก */
const LOGIN_PATH = "/api/auth/login";

function limitFor(pathname: string, method: string) {
  if (matches(pathname, NO_LIMIT)) return null;
  // ล็อกอิน: 10 ครั้ง/นาที ต่อ IP — คนพิมพ์รหัสผิดจริงไม่ถึง แต่สคริปต์เดารหัสตันทันที
  if (pathname === LOGIN_PATH && method === "POST") return { limit: 10, windowMs: 60_000 };
  // เขียนข้อมูล (จอง/จ่าย/แก้ไข) หนักกว่าอ่าน จึงให้โควตาน้อยกว่า
  if (method !== "GET") return { limit: 60, windowMs: 60_000 };
  return { limit: 240, windowMs: 60_000 };
}

export async function middleware(req: NextRequest) {
  // ── จับร้านจาก /s/<slug>/... (path-based tenant) ───────────────────────────
  // ตัด prefix ออกก่อน แล้วให้ด่านตรวจสิทธิ์ด้านล่างทำงานบน path จริง
  let pathname = req.nextUrl.pathname;
  let tenantSlug: string | null = null;
  const slugMatch = pathname.match(/^\/s\/([a-z0-9-]+)(\/.*|)$/i);
  if (slugMatch) {
    tenantSlug = slugMatch[1].toLowerCase();
    pathname = slugMatch[2] || "/";
  }

  // ต้องลบ header นี้ทิ้งก่อนเสมอ — ถ้าไม่ลบ ผู้เรียกยิง API ตรง (ไม่ผ่าน /s/<slug>)
  // แล้วปลอม x-tenant-slug เองได้ จะสวมรอยเข้าข้อมูลร้านอื่นผ่าน route สาธารณะ (LIFF) ได้ทันที
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete(TENANT_SLUG_HEADER);
  if (tenantSlug) requestHeaders.set(TENANT_SLUG_HEADER, tenantSlug);
  // API ที่หน้าในลิงก์ร้าน (/s/<slug>/...) เรียก — ยึดร้านของหน้านั้น ไม่ใช่ "ร้านที่เปิดล่าสุด" (pf_tenant)
  // ไม่งั้นเปิดสองร้านไว้คนละแท็บ หน้าลูกค้าร้านหนึ่งจะไปโชว์ชื่อ/ข้อมูลของอีกร้าน
  else if (pathname.startsWith("/api/")) {
    const fromPage = refererShop(req);
    if (fromPage) requestHeaders.set(TENANT_SLUG_HEADER, fromPage);
  }
  // หน้าลูกค้า /app เปล่า ๆ (ไม่มีชื่อร้านในลิงก์) = ร้าน PetFlow เสมอ (ดู mainShopTenantId)
  // ห้ามเดาจาก "ร้านที่เปิดล่าสุด" — เคยทำให้ LINE ของ PetFlow เปิดเป็นร้านอื่นแล้วต่อ LINE ไม่ได้
  const fromPlainApp = !tenantSlug && pathname.startsWith("/api/") && refererIsPlainApp(req);

  // ── คุกกี้ล็อกอินของร้านที่เปิดอยู่ ─────────────────────────────────────────
  // แต่ละร้านมีคุกกี้ของตัวเอง (petflow_session__<slug>) ล็อกอินหลายร้านในเครื่องเดียวกันได้
  // ร้านของคำขอ: path /s/<slug> → หน้าที่เรียก API (Referer) → ร้านที่เปิดล่าสุด (pf_tenant)
  const pageShop =
    tenantSlug ||
    refererShop(req) ||
    req.cookies.get(TENANT_COOKIE)?.value?.trim().toLowerCase() ||
    null;
  const shopCookieName = pageShop ? shopSessionCookie(pageShop) : null;
  const shopToken = shopCookieName ? req.cookies.get(shopCookieName)?.value : undefined;
  const sessionCookieName = shopToken && shopCookieName ? shopCookieName : SESSION_COOKIE;
  const sessionToken = shopToken ?? req.cookies.get(SESSION_COOKIE)?.value;
  requestHeaders.delete(SESSION_COOKIE_NAME_HEADER);
  requestHeaders.set(SESSION_COOKIE_NAME_HEADER, sessionCookieName);
  if (shopToken) {
    // route อ่านคุกกี้ชื่อ SESSION_COOKIE เดิม — ส่งคุกกี้ของร้านนี้ไปในชื่อนั้นแทนตัวเดิม
    const others = (req.headers.get("cookie") || "")
      .split(";")
      .map((c) => c.trim())
      .filter((c) => c && !c.startsWith(`${SESSION_COOKIE}=`));
    requestHeaders.set("cookie", [...others, `${SESSION_COOKIE}=${shopToken}`].join("; "));
  }

  if (fromPlainApp) {
    const kept = (requestHeaders.get("cookie") || "")
      .split(";")
      .map((c) => c.trim())
      .filter((c) => c && !c.startsWith(`${TENANT_COOKIE}=`));
    requestHeaders.set("cookie", kept.join("; "));
  }
  // API ที่หน้าลูกค้าเรียก ห้ามพกคุกกี้ล็อกอินหลังบ้านไปด้วย — route หลายตัวเอาร้านของ session มาก่อน
  // เจ้าของที่ล็อกอินหลังบ้านร้านหนึ่งค้างไว้ในเบราว์เซอร์ LINE แล้วเปิดแอปลูกค้าอีกร้าน จะเห็นชื่อ/ข้อมูลร้านที่ล็อกอินอยู่
  if (pathname.startsWith("/api/") && refererIsCustomerApp(req)) {
    const kept = (requestHeaders.get("cookie") || "")
      .split(";")
      .map((c) => c.trim())
      .filter((c) => c && !c.startsWith(SESSION_COOKIE));
    requestHeaders.set("cookie", kept.join("; "));
  }

  /** ปล่อยผ่าน — ถ้ามาจาก /s/<slug> ต้อง rewrite ไป path จริง + แนบ header/cookie */
  function proceed(): NextResponse {
    if (tenantSlug) {
      const dest = req.nextUrl.clone();
      dest.pathname = pathname;
      const res = NextResponse.rewrite(dest, { request: { headers: requestHeaders } });
      setTenantCookie(res);
      return res;
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  /** สำหรับ response ที่ปฏิเสธ (redirect/401) — ยังตั้ง cookie ร้านไว้ให้ครั้งถัดไป */
  function withCookie(res: NextResponse): NextResponse {
    if (tenantSlug) setTenantCookie(res);
    return res;
  }

  function setTenantCookie(res: NextResponse) {
    if (!tenantSlug) return;
    res.cookies.set(TENANT_COOKIE, tenantSlug, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 180, // 180 วัน
    });
  }

  // หน้าเว็บโฆษณา (หน้าแรก/ห้องพัก/อาบน้ำ/บทความ) เขียนไว้เฉพาะร้านตัวอย่าง PetFlow —
  // ร้านอื่นเปิด /s/<slug>/ แล้วต้องไม่เห็นชื่อ/รูป/ราคาของ PetFlow → ส่งไปหน้าแอปของร้านตัวเองแทน
  if (
    tenantSlug &&
    tenantSlug !== "petflow" &&
    (pathname === "/" || /^\/(cat-bath|cat-hotel|blog)(\/|$)/.test(pathname))
  ) {
    const url = req.nextUrl.clone();
    url.pathname = `/s/${tenantSlug}/app`;
    url.search = "";
    return withCookie(NextResponse.redirect(url));
  }

  // ผู้ดูแลระบบ — คนละชั้นสิทธิ์กับ /admin (เจ้าของร้าน/พนักงาน) เลยแยกด่านตรวจ
  if (pathname.startsWith("/api/platform/")) {
    if (pathname === "/api/platform/auth") {
      // รหัสผู้ดูแลระบบเปิดได้ทุกร้าน — ต้องกันเดารหัสเข้มที่สุด (เดิมไม่มีการจำกัดเลย)
      if (req.method === "POST") {
        const hit = rateLimit(`platform-login:${clientKey(req)}`, 5, 60_000);
        if (!hit.ok) {
          return NextResponse.json(
            { error: "rate_limited", message: "ลองรหัสถี่เกินไป รอ 1 นาทีแล้วลองใหม่" },
            { status: 429, headers: { "Retry-After": String(hit.retryAfter) } }
          );
        }
      }
      return proceed();
    }
    const session = await verifyPlatformSession(
      req.cookies.get(PLATFORM_SESSION_COOKIE)?.value
    );
    if (!session) {
      return withCookie(
        NextResponse.json({ error: "unauthorized" }, { status: 401 })
      );
    }
    return proceed();
  }

  if (pathname.startsWith("/platform") && pathname !== "/platform/login") {
    const session = await verifyPlatformSession(
      req.cookies.get(PLATFORM_SESSION_COOKIE)?.value
    );
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = "/platform/login";
      return withCookie(NextResponse.redirect(url));
    }
    return proceed();
  }

  if (pathname.startsWith("/api/")) {
    const rule = limitFor(pathname, req.method);
    if (rule) {
      const scope = pathname === LOGIN_PATH ? LOGIN_PATH : req.method === "GET" ? "read" : "write";
      const hit = rateLimit(`${scope}:${clientKey(req)}`, rule.limit, rule.windowMs);
      if (!hit.ok) {
        return NextResponse.json(
          { error: "rate_limited", message: "ยิงคำขอถี่เกินไป รอสักครู่แล้วลองใหม่นะคะ" },
          { status: 429, headers: { "Retry-After": String(hit.retryAfter) } }
        );
      }
    }

    // ใช้ proceed() ไม่ใช่ NextResponse.next() — ไม่งั้น header x-tenant-slug ที่ผู้เรียกปลอมมาจะหลุดถึง route
    // และ /s/<slug>/api/... จะไม่ถูก rewrite ไป path จริง
    if (matches(pathname, PUBLIC_API)) return proceed();
    if (req.method === "GET" && matches(pathname, PUBLIC_GET)) {
      return proceed();
    }
    if (matches(pathname, SHARED_API)) return proceed();

    const session = await verifySession(sessionToken);
    if (!session) {
      return withCookie(
        NextResponse.json(
          { error: "unauthorized", message: "ต้องเข้าสู่ระบบหลังบ้านก่อน" },
          { status: 401 }
        )
      );
    }
    if (session.role === "staff" && !staffMayCall(pathname, session.menus)) {
      return NextResponse.json(
        { error: "forbidden", message: "บัญชีพนักงานนี้ไม่ได้รับสิทธิ์เมนูนี้ — ให้เจ้าของร้านเปิดสิทธิ์ให้" },
        { status: 403 }
      );
    }
    return proceed();
  }

  // ลิงก์เมนูหลังบ้านเป็น /admin/... เปล่า ๆ — ถ้ากดมาจากหน้าของร้านหนึ่ง ให้คงอยู่ในลิงก์ร้านนั้น
  // (ไม่งั้นแท็บของอีกร้านที่เปิดค้างไว้จะสลับไปใช้ร้านที่เปิดล่าสุด)
  if (!tenantSlug && pathname.startsWith("/admin")) {
    const fromShop = refererShop(req);
    if (fromShop) {
      const url = req.nextUrl.clone();
      url.pathname = `/s/${fromShop}${pathname}`;
      return NextResponse.redirect(url);
    }
  }

  // หน้าลูกค้า /app/... เปล่า ๆ (ลิงก์ในแอปเขียนไว้แบบนี้) — กดมาจากหน้าของร้านไหนก็คงอยู่ในลิงก์ร้านนั้น
  // เปิดตรง ๆ (เช่น LIFF ของร้านหลัก) = ร้านหลัก ไม่เดาจากร้านที่เปิดล่าสุด
  if (!tenantSlug && (pathname === "/app" || pathname.startsWith("/app/"))) {
    const shop = refererShop(req);
    if (shop) {
      const url = req.nextUrl.clone();
      url.pathname = `/s/${shop}${pathname}`;
      return NextResponse.redirect(url);
    }
  }

  // หน้าหลังบ้าน — ไม่มีคุกกี้ก็เด้งไปหน้าล็อกอิน
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const session = await verifySession(sessionToken);
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = tenantSlug ? `/s/${tenantSlug}/admin/login` : "/admin/login";
      url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
      return withCookie(NextResponse.redirect(url));
    }
    // เปิดลิงก์ของร้านหนึ่ง แต่คุกกี้ล็อกอินค้างเป็นของอีกร้าน — ห้ามโชว์หลังบ้านร้านที่ค้างอยู่
    if (tenantSlug && session.tenantSlug !== tenantSlug) {
      const url = req.nextUrl.clone();
      url.pathname = `/s/${tenantSlug}/admin/login`;
      url.search = "";
      return withCookie(NextResponse.redirect(url));
    }
  }

  return proceed();
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*", "/platform/:path*", "/s/:path*", "/app", "/app/:path*"],
};
