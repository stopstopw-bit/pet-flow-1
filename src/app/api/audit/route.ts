import { NextRequest, NextResponse } from "next/server";
import { listAudit } from "@/lib/audit-log";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { withTenant } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

/** บันทึกว่าใครทำอะไร — หลังบ้านเท่านั้น (middleware กันไว้อีกชั้นแล้ว) · เห็นเฉพาะของร้านตัวเอง */
export async function GET(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limit = Number(req.nextUrl.searchParams.get("limit")) || 200;
  return withTenant(session.tenantId, async () =>
    NextResponse.json({ logs: await listAudit(limit) })
  );
}
