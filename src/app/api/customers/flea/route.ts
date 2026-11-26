import { NextRequest, NextResponse } from "next/server";
import { withResolvedTenant } from "@/lib/tenant-context";
import { featureOff } from "@/lib/features-server";
import { requireCustomerSession, noCustomerSessionResponse } from "@/lib/customer-session";
import { findCustomerByLine, setCatStayInfo } from "@/lib/customers-store";
import { getSiteConfig } from "@/lib/config-store";
import { uploadPrivateDataUrl } from "@/lib/supabase/storage";
import { sendTelegramLater, formatBookingTelegram } from "@/lib/telegram";
import { formatThaiDateShort } from "@/lib/format-thai-date";
import {
  FLEA_UPDATE_SOURCE,
  MAX_FLEA_PHOTOS,
  MAX_FLEA_STORED,
  fleaProofMode,
  fleaQuestions,
  parseFleaInfo,
} from "@/lib/flea-update";

/**
 * หน้าอัปเดตยากำจัดเห็บหมัด (/app/flea) — ลูกค้าแก้ของน้องในบัญชีตัวเองเท่านั้น (ยึดคุกกี้เซสชันลูกค้า)
 * GET  = น้องทุกตัว + ค่าล่าสุด + คำถาม/ตัวเลือกของร้าน + ร้านขอรูปไหม
 * POST { catId, method, date (YYYY-MM-DD), photos?: dataUrl[] } = เขียนทับ fleaMethod/fleaLast ใน stayInfo ของน้อง
 */
export function GET(req: NextRequest) {
  return withResolvedTenant(req, () => handleGet(req));
}

async function handleGet(req: NextRequest) {
  const blocked = await featureOff("fleaUpdate");
  if (blocked) return blocked;
  const session = await requireCustomerSession(req);
  if (!session) return noCustomerSessionResponse();
  const [me, cfg] = await Promise.all([findCustomerByLine(session.lineUserId), getSiteConfig()]);
  if (!me) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    proof: fleaProofMode(cfg),
    questions: fleaQuestions(cfg),
    cats: me.cats.map((c) => {
      const f = parseFleaInfo(c.stayInfo);
      // ไม่ส่งลิงก์รูปออกไป (bucket ส่วนตัว) — บอกแค่จำนวน
      return { id: c.id, name: c.name, method: f.method || "", last: f.last || "", date: f.date || "", photoCount: f.photos.length, updatedAt: f.updatedAt || "" };
    }),
  });
}

export function POST(req: NextRequest) {
  return withResolvedTenant(req, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const blocked = await featureOff("fleaUpdate");
  if (blocked) return blocked;
  const session = await requireCustomerSession(req);
  if (!session) return noCustomerSessionResponse();
  const body = await req.json().catch(() => ({}));
  const [me, cfg] = await Promise.all([findCustomerByLine(session.lineUserId), getSiteConfig()]);
  const cat = me?.cats.find((c) => c.id === String(body.catId || ""));
  if (!me || !cat) return NextResponse.json({ error: "not found" }, { status: 404 });

  const q = fleaQuestions(cfg);
  const method = String(body.method || "");
  const opt = q.methods.find((o) => o.key === method);
  if (!opt) return NextResponse.json({ error: "method" }, { status: 400 });
  const date = String(body.date || "");
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) {
    return NextResponse.json({ error: "date" }, { status: 400 });
  }
  const proof = fleaProofMode(cfg);
  const raw: string[] = proof === "off" || !Array.isArray(body.photos) ? [] : body.photos.map((v: unknown) => String(v || ""));
  const added: string[] = [];
  for (const [i, v] of raw.slice(0, MAX_FLEA_PHOTOS).entries()) {
    if (!v.startsWith("data:image/")) continue;
    added.push(await uploadPrivateDataUrl(`cat-flea/${cat.id}-${Date.now()}-${i}`, v));
  }
  if (proof === "required" && added.length === 0) {
    return NextResponse.json({ error: "photo" }, { status: 400 });
  }

  let info: Record<string, unknown> = {};
  try {
    info = cat.stayInfo ? (JSON.parse(cat.stayInfo) as Record<string, unknown>) : {};
  } catch {
    info = {};
  }
  const prev = parseFleaInfo(cat.stayInfo);
  const next: Record<string, unknown> = {
    ...info,
    // ยังไม่เคยมีข้อมูลก่อนเข้าพัก = ไม่นับว่ากรอกฟอร์มแล้ว (ร้านยังขอฟอร์มเต็มได้)
    ...(cat.stayInfo ? {} : { source: FLEA_UPDATE_SOURCE }),
    fleaMethod: method,
    fleaLast: formatThaiDateShort(date),
    fleaDate: date,
    fleaPhotos: [...prev.photos, ...added].slice(-MAX_FLEA_STORED),
    fleaUpdatedAt: new Date().toISOString(),
  };
  const res = await setCatStayInfo(me.id, cat.id, JSON.stringify(next));
  if (!res.ok) return NextResponse.json({ error: "save failed" }, { status: 500 });

  sendTelegramLater(
    formatBookingTelegram("💧 ลูกค้าอัปเดตยากำจัดเห็บหมัด", {
      น้อง: cat.name,
      ลูกค้า: me.name,
      วิธี: opt.label,
      ให้ยาล่าสุด: formatThaiDateShort(date),
      หลักฐาน: added.length ? `แนบรูป ${added.length} รูป 📸` : "ไม่ได้แนบรูป",
    }),
    undefined,
    added.length ? [{ urls: added, caption: `💧 หลักฐานยาเห็บหมัด ${cat.name}` }] : undefined
  );
  return NextResponse.json({ ok: true });
}
