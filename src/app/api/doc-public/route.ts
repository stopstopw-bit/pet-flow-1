import { NextRequest, NextResponse } from "next/server";
import { verifyDocToken } from "@/lib/doc-share";
import { withTenant } from "@/lib/tenant-context";
import { buildDocPayload } from "@/lib/invoice-docs-payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET ?id=&k=&t= — เอกสารที่ร้านส่งให้ลูกค้าทาง LINE (ไม่ต้องล็อกอิน)
 * เปิดได้เฉพาะลิงก์ที่มีโทเคนถูกต้อง และเฉพาะเอกสารที่ออกเลขที่แล้ว
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const id = p.get("id") || "";
  const kind = p.get("k") || "";
  const tenantId = p.get("s") || "";
  if (!verifyDocToken(tenantId, id, kind, p.get("t") || "")) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return withTenant(tenantId, () => load(id, kind));
}

async function load(id: string, kind: string) {
  const data = await buildDocPayload(id, { forCustomer: true });
  const no = data && (kind === "quote" ? data.doc.quoteNo : kind === "invoice" ? data.doc.invoiceNo : data.doc.receiptNo);
  if (!data || !no || (kind === "receipt" && data.invoice.status !== "paid")) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
