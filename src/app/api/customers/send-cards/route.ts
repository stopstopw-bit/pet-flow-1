import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { withTenant } from "@/lib/tenant-context";
import { getCustomer } from "@/lib/customers-store";
import { getSiteConfig } from "@/lib/config-store";
import { getLineCredentials } from "@/lib/line-config";
import { DEFAULT_MESSAGES } from "@/lib/messages";
import {
  pushLineMessage,
  buildConsentFlex,
  buildPrestayFlex,
  buildGroomInfoFlex,
  buildDocRequestFlex,
} from "@/lib/line";
import { buildGroomInfoBody, buildPrestayFlexData, buildStayInfoBody } from "@/lib/booking-reminders";
import {
  buildCatInfoUrl,
  buildCatVaccineUrl,
  buildCustomerConsentUrl,
  buildIdCardUrl,
} from "@/lib/liff-urls";

/** การ์ดที่ส่งจากหน้าข้อมูลลูกค้าได้ (ยังไม่ต้องมีนัด) */
const CUSTOMER_CARD_PARTS = ["groomInfo", "stayInfo", "vaccine", "idcard", "consent", "prestay"] as const;
type Part = (typeof CUSTOMER_CARD_PARTS)[number];

/**
 * POST /api/customers/send-cards — ส่งการ์ดถามข้อมูลก่อนรับน้องจากหน้าข้อมูลลูกค้า (หลังบ้านเท่านั้น)
 * body: { customerId, parts: Part[], catIds?: string[], preview?: true }
 * ส่งหลายใบรวมใน push เดียว (LINE นับ 1 ข้อความ, สูงสุด 5 ใบ) — preview คืน flex ตัวเดียวกับที่จะส่งจริง
 */
export async function POST(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const preview = body.preview === true;
  const c = await getCustomer(String(body.customerId || ""));
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!c.lineUserId) {
    return NextResponse.json({ error: "ลูกค้ายังไม่ผูก LINE — ส่งการ์ดไม่ได้" }, { status: 400 });
  }
  const parts: Part[] = (Array.isArray(body.parts) ? body.parts : [])
    .map(String)
    .filter((p: string): p is Part => (CUSTOMER_CARD_PARTS as readonly string[]).includes(p))
    .slice(0, 5);
  if (parts.length === 0) return NextResponse.json({ error: "เลือกอย่างน้อย 1 การ์ด" }, { status: 400 });

  const wanted: string[] = Array.isArray(body.catIds) ? body.catIds.map(String) : [];
  const cats = wanted.length ? c.cats.filter((x) => wanted.includes(x.id)) : c.cats;
  const needCats = parts.some((p) => p === "groomInfo" || p === "stayInfo" || p === "vaccine");
  if (needCats && cats.length === 0) {
    return NextResponse.json({ error: "ลูกค้ายังไม่มีข้อมูลน้อง — เพิ่มน้องก่อน" }, { status: 400 });
  }

  const liffId = (await getLineCredentials())?.liffId;
  if (!liffId) {
    return NextResponse.json(
      { error: "ยังไม่ได้ตั้ง LIFF ID — ไป Admin → ติดตั้ง เพื่อตั้งค่าก่อน" },
      { status: 400 }
    );
  }
  const cfg = await getSiteConfig();
  const catIds = cats.map((x) => x.id);
  const catNames = cats.map((x) => x.name).join(", ") || c.name;
  const manyLabel = cats.length > 1 ? `น้องๆ ${cats.length} ตัว` : catNames;

  const messages: object[] = [];
  for (const part of parts) {
    if (part === "groomInfo" || part === "stayInfo") {
      const stay = part === "stayInfo";
      const style = cfg.cards?.groomInfo;
      const button = style?.texts?.button || "🩺 แจ้งประวัติน้อง";
      messages.push(
        buildGroomInfoFlex(
          {
            catName: catNames,
            body: (stay ? buildStayInfoBody : buildGroomInfoBody)({ catName: manyLabel }, cfg),
            url: buildCatInfoUrl(liffId, catIds, stay ? "stay" : "groom"),
            label: cats.length > 1 ? `${button} (${cats.length} ตัว)` : button,
          },
          stay
            ? { ...style, texts: { ...style?.texts, header: "🐾 ข้อมูลน้องก่อนเข้าพัก" } }
            : style
        )
      );
    } else if (part === "vaccine" || part === "idcard") {
      messages.push(
        buildDocRequestFlex({
          kind: part,
          businessName: cfg.business.name,
          catName: catNames,
          url: part === "vaccine" ? buildCatVaccineUrl(liffId, catIds) : buildIdCardUrl(liffId),
        })
      );
    } else if (part === "consent") {
      messages.push(
        buildConsentFlex(
          {
            businessName: cfg.business.name,
            title: cfg.messages.consentTitle || DEFAULT_MESSAGES.consentTitle,
            catName: catNames,
            terms: cfg.messages.consentTerms?.length
              ? cfg.messages.consentTerms
              : DEFAULT_MESSAGES.consentTerms,
            url: buildCustomerConsentUrl(liffId),
          },
          cfg.cards?.consent
        )
      );
    } else if (part === "prestay") {
      messages.push(
        buildPrestayFlex(
          {
            ...buildPrestayFlexData({ catName: catNames, date: "" }, cfg),
            consentUrl: undefined,
          },
          cfg.cards?.prestay
        )
      );
    }
  }

  try {
    if (preview) return NextResponse.json({ ok: true, preview: messages });
    await pushLineMessage(c.lineUserId, messages);
    return NextResponse.json({ ok: true, sent: messages.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
