import { NextRequest, NextResponse } from "next/server";
import { getSessionFrom } from "@/lib/auth";
import { withTenant } from "@/lib/tenant-context";
import { storeBroadcastImage } from "@/lib/broadcast-image-store";
import { getBroadcastAudience, type CustomerTier, type CustomerRecord } from "@/lib/customers-store";
import {
  customerActivityMap,
  matchesSegments,
  parseSegments,
  DEFAULT_REGULAR_MIN_VISITS,
} from "@/lib/customer-segments";
import {
  buildBroadcastButtons,
  type BroadcastActionId,
} from "@/lib/line-broadcast";
import { buildPromoFlex, multicastLineMessage } from "@/lib/line";
import { getLineCredentials, getAppUrlFromEnv } from "@/lib/line-config";
import { TIER_LABELS } from "@/lib/customer-tier";
import { getSiteConfig } from "@/lib/config-store";

async function resolveLineImageUrl(body: {
  imageData?: string;
  imageUrl?: string;
}): Promise<string | undefined> {
  if (body.imageData && body.imageData.startsWith("data:")) {
    const id = await storeBroadcastImage(body.imageData);
    const base = getAppUrlFromEnv() || "https://petflow.example.com";
    return `${base}/api/line/broadcast-image/${id}`;
  }
  if (body.imageUrl) {
    return String(body.imageUrl);
  }
  return undefined;
}

type AudienceQuery = {
  tier: CustomerTier | "all";
  breed?: string;
  inactiveDays: number;
  segments: ReturnType<typeof parseSegments>;
  regularMinVisits: number;
  /** เจาะจงรายคน (มาจากกลุ่มในหน้าสรุปข้อมูล) — ว่าง = ไม่จำกัด */
  customerIds: string[];
};

function readAudienceQuery(get: (k: string) => unknown): AudienceQuery {
  return {
    tier: (String(get("tier") || "all") as CustomerTier | "all"),
    breed: get("breed") ? String(get("breed")) : undefined,
    inactiveDays: Number(get("inactiveDays")) || 0,
    segments: parseSegments(get("segments")),
    regularMinVisits: Number(get("regularMinVisits")) || DEFAULT_REGULAR_MIN_VISITS,
    customerIds: (() => {
      const v = get("customerIds");
      const raw = Array.isArray(v) ? v : String(v || "").split(",");
      return raw.map((x) => String(x).trim()).filter(Boolean);
    })(),
  };
}

const daysSince = (d: string) =>
  Math.floor((Date.now() - new Date(`${d.slice(0, 10)}T00:00:00Z`).getTime()) / 86400000);

/** กลุ่มผู้รับ = ระดับ + พันธุ์ + กลุ่มที่ติ๊ก + หายไปนาน (ต้องตรงทุกข้อ) */
async function resolveAudience(q: AudienceQuery) {
  const all = await getBroadcastAudience(q.tier, { breed: q.breed });
  // รายชื่อเจาะจงกรองจากลูกค้าของร้านนี้เท่านั้น — id ร้านอื่นหลุดมาก็ไม่มีผล
  const only = q.customerIds.length ? new Set(q.customerIds) : null;
  const pick = (list: CustomerRecord[]) => (only ? list.filter((c) => only.has(c.id)) : list);
  const audience = {
    ...all,
    recipients: pick(all.recipients),
    skippedNoLine: pick(all.skippedNoLine),
    skippedNoConsent: pick(all.skippedNoConsent),
  };
  if (!q.segments.length && q.inactiveDays <= 0) return audience;
  const everyone = [
    ...audience.recipients,
    ...audience.skippedNoLine,
    ...audience.skippedNoConsent,
  ];
  const activity = await customerActivityMap(everyone);
  const keep = (c: CustomerRecord) => {
    const a = activity.get(c.id);
    if (!matchesSegments(c, a, q.segments, q.regularMinVisits)) return false;
    if (q.inactiveDays > 0) {
      // หายไปนาน = เคยมาจริงแล้ว และครั้งล่าสุดนานกว่าที่ตั้งไว้
      if (!a?.lastVisit || daysSince(a.lastVisit) < q.inactiveDays) return false;
    }
    return true;
  };
  return {
    ...audience,
    recipients: audience.recipients.filter(keep),
    skippedNoLine: audience.skippedNoLine.filter(keep),
    skippedNoConsent: audience.skippedNoConsent.filter(keep),
  };
}

/** ส่งโปรโมชั่น / ข้อความไปยังกลุ่มลูกค้าตามระดับ */
export async function POST(req: NextRequest) {
  const session = await getSessionFrom(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const query = readAudienceQuery((k) => body[k]);
  const title = String(body.title || "").trim();
  const message = String(body.body || "").trim();
  const discountLabel = body.discountLabel
    ? String(body.discountLabel)
    : undefined;
  const actions = Array.isArray(body.actions)
    ? (body.actions as BroadcastActionId[])
    : [];

  if (!title || !message) {
    return NextResponse.json(
      { error: "กรอกหัวข้อและข้อความ" },
      { status: 400 }
    );
  }

  const customers = (await resolveAudience(query)).recipients;
  const lineIds = customers
    .map((c) => c.lineUserId)
    .filter((id): id is string => Boolean(id));

  if (lineIds.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: 0,
      message: "ไม่มีลูกค้าในกลุ่มนี้ที่ผูก LINE",
    });
  }

  const creds = await getLineCredentials();
  const base = getAppUrlFromEnv() || "";
  const promoUrl = `${base}/app/promos`;
  const imageUrl = await resolveLineImageUrl(body);
  const shopConfig = await getSiteConfig();
  const buttons = buildBroadcastButtons(actions, creds?.liffId, shopConfig.business);

  try {
    const flex = buildPromoFlex({
      title,
      body: message,
      imageUrl,
      promoUrl,
      discountLabel,
      buttons: buttons.length ? buttons : undefined,
    }, (await getSiteConfig()).cards?.promo);
    const result = await multicastLineMessage(lineIds, [flex]);
    return NextResponse.json({
      ok: true,
      sent: result.sent,
      // ลูกค้าที่ยังไม่มีบัญชี LINE จริงผูกอยู่ (สร้างตอน LIFF ยังไม่ตั้งค่า) — ไม่ได้รับข้อความนี้
      skipped: result.skipped,
      tier: query.tier === "all" ? "ทุกระดับ" : TIER_LABELS[query.tier],
      maps: shopConfig.business.maps,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const session = await getSessionFrom(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handleGet(req));
}

async function handleGet(req: NextRequest) {
  const query = readAudienceQuery((k) => req.nextUrl.searchParams.get(k));
  const { recipients, skippedNoLine, skippedNoConsent } = await resolveAudience(query);

  return NextResponse.json({
    tier: query.tier,
    count: recipients.length,
    withLine: recipients.length,
    skippedNoLine: skippedNoLine.length,
    skippedNoConsent: skippedNoConsent.length,
    recipients: recipients.map((c) => ({
      id: c.id,
      name: c.name,
      lineDisplayName: c.lineDisplayName,
      cats: c.cats.map((cat) => cat.name).join(", ") || "—",
      tier: c.tier,
    })),
    skipped: skippedNoLine.slice(0, 20).map((c) => ({
      id: c.id,
      name: c.name,
      cats: c.cats.map((cat) => cat.name).join(", ") || "—",
      reason: "ยังไม่ผูก LINE",
    })),
  });
}
