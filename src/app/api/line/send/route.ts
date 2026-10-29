import { NextRequest, NextResponse } from "next/server";
import { pushLineMessage, buildBillSummaryFlex } from "@/lib/line";
import { getSessionFrom } from "@/lib/auth";
import { withTenant } from "@/lib/tenant-context";

export const runtime = "nodejs";

type SummaryPayload = Parameters<typeof buildBillSummaryFlex>[0];

/**
 * ส่งสรุป/แจ้งยอดไปหาลูกค้าทาง LINE — ใช้จากหน้าคิดเงิน
 * ส่งเป็น "การ์ด" เท่านั้น (ต้องมี `summary`) — ร้านไม่ส่งข้อความเปล่าหาลูกค้าเลย
 *
 * ต้อง wrap ด้วย withTenant เสมอ — ไม่งั้น requireTenantId() ที่อยู่ลึกใน pushLineMessage
 * จะ fallback ไปใช้ช่อง LINE ของร้าน bootstrap แทนร้านของคนที่ล็อกอินอยู่จริง
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFrom(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withTenant(session.tenantId, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const lineUserId = String(body.lineUserId || "").trim();
  const summary = body.summary as SummaryPayload | undefined;

  if (!lineUserId) {
    return NextResponse.json({ error: "no_line_user" }, { status: 400 });
  }

  try {
    if (summary && Array.isArray(summary.items)) {
      const flex = buildBillSummaryFlex(summary);
      await pushLineMessage(lineUserId, [flex]);
      return NextResponse.json({ ok: true, kind: "flex" });
    }
    return NextResponse.json({ error: "card_only" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
