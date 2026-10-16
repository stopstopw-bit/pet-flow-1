import { createHmac, timingSafeEqual } from "crypto";
import { getOwnerCode } from "./auth";
import { requireTenantId } from "./tenant-context";
import type { DocKind } from "./invoice-docs-store";

/**
 * ลิงก์เอกสารที่ส่งให้ลูกค้าทาง LINE — ลูกค้าเปิดได้โดยไม่ต้องล็อกอิน
 * แต่ต้องมีโทเคนที่เซ็นด้วย secret ของร้าน (เดา id บิลอื่นแล้วเปิดไม่ได้)
 */

function secret() {
  return `doc-share::${process.env.SESSION_SECRET || `petflow-session::${getOwnerCode()}`}`;
}

/** โทเคนผูกกับร้านด้วย — ลิงก์ของร้านหนึ่งเอาไปเปิดเป็นบิลของร้านอื่นไม่ได้ */
export function signDocToken(tenantId: string, invoiceId: string, kind: DocKind): string {
  return createHmac("sha256", secret()).update(`${tenantId}:${invoiceId}:${kind}`).digest("base64url").slice(0, 32);
}

export function verifyDocToken(tenantId: string, invoiceId: string, kind: string, token: string): boolean {
  if (!tenantId || !invoiceId || !token || !["quote", "invoice", "receipt"].includes(kind)) return false;
  const want = Buffer.from(signDocToken(tenantId, invoiceId, kind as DocKind));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** เรียกในบริบทของร้าน (withTenant) — ใส่ร้านไว้ในลิงก์ให้หน้าเอกสารรู้ว่าต้องเปิดบิลของร้านไหน */
export function docShareUrl(origin: string, invoiceId: string, kind: DocKind) {
  const tenantId = requireTenantId();
  return `${origin}/doc/${encodeURIComponent(invoiceId)}?k=${kind}&s=${encodeURIComponent(tenantId)}&t=${signDocToken(tenantId, invoiceId, kind)}`;
}
