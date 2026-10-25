import { NextRequest, NextResponse } from "next/server";
import { petWords } from "@/lib/pet-kind";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { withTenant } from "@/lib/tenant-context";
import { getCustomer } from "@/lib/customers-store";
import { getSiteConfig } from "@/lib/config-store";
import { cardOn } from "@/lib/features";
import { getLineCredentials } from "@/lib/line-config";
import { DEFAULT_MESSAGES } from "@/lib/messages";
import {
  pushLineMessage,
  buildConsentFlex,
  buildPrestayFlex,
  buildGroomInfoFlex,
  buildDocRequestFlex,
  mergeIntakeCards,
  type IntakeEntry,
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
 * เรื่องที่ขอข้อมูล (ประวัติ/สมุดวัคซีน/บัตร/กฎ) ตั้งแต่ 2 เรื่องขึ้นไป รวมเป็นการ์ดใบเดียวหลายปุ่ม
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
  const cfg = await getSiteConfig();
  // การ์ดที่ร้านปิดในตั้งค่า › เปิด/ปิดฟีเจอร์ ส่งไม่ได้
  const parts: Part[] = (Array.isArray(body.parts) ? body.parts : [])
    .map(String)
    .filter((p: string): p is Part => (CUSTOMER_CARD_PARTS as readonly string[]).includes(p))
    .filter((p: Part) => cardOn(cfg, p))
    .slice(0, CUSTOMER_CARD_PARTS.length);
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
  const catNames = cats.map((x) => x.name).join(", ") || c.name;

  const messages: object[] = [];
  const skipped: string[] = [];
  /** เรื่องที่ขอข้อมูล — รวมเป็นการ์ดเดียวตอนท้าย แทรกตรงตำแหน่งเรื่องแรก */
  const intake: IntakeEntry[] = [];
  let intakeAt = -1;
  const addIntake = (e: IntakeEntry) => {
    if (intakeAt < 0) intakeAt = messages.length;
    intake.push(e);
  };
  for (const part of parts) {
    if (part === "groomInfo" || part === "stayInfo") {
      const stay = part === "stayInfo";
      // ตัวที่เคยกรอกฟอร์มนี้แล้ว → ไม่ขอซ้ำเด็ดขาด (ข้อมูลผูกกับตัวน้อง)
      const ask = cats.filter((x) => !(stay ? x.stayInfo : x.groomHealthInfo));
      for (const x of cats) if (!ask.includes(x)) skipped.push(`${x.name}: เคยกรอกแล้ว ไม่ขอซ้ำ`);
      if (ask.length === 0) continue;
      const askNames = ask.map((x) => x.name).join(", ");
      const askLabel = ask.length > 1 ? `น้องๆ ${ask.length} ตัว` : askNames;
      const style = cfg.cards?.groomInfo;
      const button = style?.texts?.button || "🩺 แจ้งประวัติน้อง";
      const url = buildCatInfoUrl(liffId, ask.map((x) => x.id), stay ? "stay" : "groom");
      addIntake({
        kind: stay ? "stayInfo" : "info",
        url,
        ids: ask.map((x) => x.id),
        count: ask.length,
        card: buildGroomInfoFlex(
          {
            catName: askNames,
            petEmoji: petWords(cfg).emoji,
            body: (stay ? buildStayInfoBody : buildGroomInfoBody)({ catName: askLabel }, cfg),
            url,
            label: ask.length > 1 ? `${button} (${ask.length} ตัว)` : button,
          },
          stay
            ? { ...style, texts: { ...style?.texts, header: "🐾 ข้อมูลน้องก่อนเข้าพัก" } }
            : style
        ),
      });
    } else if (part === "vaccine") {
      // สมุดวัคซีนขอใหม่ได้ทุกรอบ (วัคซีนหมดอายุได้) — ร้านกดส่งเองก็ส่งเลย
      const ask = cats;
      if (ask.length === 0) continue;
      const url = buildCatVaccineUrl(liffId, ask.map((x) => x.id));
      addIntake({
        kind: "vaccine",
        url,
        ids: ask.map((x) => x.id),
        count: ask.length,
        card: buildDocRequestFlex(
          { kind: "vaccine", businessName: cfg.business.name, petEmoji: petWords(cfg).emoji, catName: ask.map((x) => x.name).join(", "), url },
          cfg.cards?.docRequest
        ),
      });
    } else if (part === "idcard") {
      // บัตรประชาชนแนบครั้งเดียวต่อลูกค้า
      if (c.idCardUrl) {
        skipped.push("มีบัตรประชาชนแล้ว ไม่ขอซ้ำ");
        continue;
      }
      const url = buildIdCardUrl(liffId);
      addIntake({
        kind: "idcard",
        url,
        card: buildDocRequestFlex(
          { kind: "idcard", businessName: cfg.business.name, petEmoji: petWords(cfg).emoji, catName: catNames, url },
          cfg.cards?.docRequest
        ),
      });
    } else if (part === "consent") {
      const url = buildCustomerConsentUrl(liffId);
      addIntake({
        kind: "consent",
        url,
        card: buildConsentFlex(
          {
            businessName: cfg.business.name,
            title: cfg.messages.consentTitle || DEFAULT_MESSAGES.consentTitle,
            catName: catNames,
            petEmoji: petWords(cfg).emoji,
            terms: cfg.messages.consentTerms?.length
              ? cfg.messages.consentTerms
              : DEFAULT_MESSAGES.consentTerms,
            url,
          },
          cfg.cards?.consent
        ),
      });
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

  if (intake.length > 0) {
    messages.splice(
      intakeAt,
      0,
      ...mergeIntakeCards(
        intake,
        {
          // มีเรื่องเข้าพัก (ข้อมูลก่อนเข้าพัก/บัตร) = หัวการ์ดเข้าพัก ไม่งั้นหัวอาบน้ำ
          service: parts.includes("stayInfo") || parts.includes("idcard") || !parts.includes("groomInfo") ? "stay" : "groom",
          catName: catNames,
          petEmoji: petWords(cfg).emoji,
          businessName: cfg.business.name,
          flow: { liffId, by: "c" },
        },
        cfg.cards?.intake
      )
    );
  }

  if (messages.length === 0) {
    return NextResponse.json(
      { error: `ไม่มีการ์ดให้ส่ง — ${skipped.join(", ")}`, skipped },
      { status: 400 }
    );
  }
  try {
    if (preview) return NextResponse.json({ ok: true, preview: messages, skipped });
    await pushLineMessage(c.lineUserId, messages);
    return NextResponse.json({ ok: true, sent: messages.length, skipped });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
