/**
 * ขอข้อมูลก่อนรับน้องแบบ "ปุ่มเดียว ไล่ทีละหน้า" — ประวัติ → สมุดวัคซีน → บัตรประชาชน → กฎ + กดยินยอม
 * การ์ด LINE มีปุ่มเดียว (LIFF path=intake) แล้วแต่ละหน้าพาไปขั้นต่อไปเอง เรื่องที่ส่งแล้วไม่อยู่ในลำดับตั้งแต่ตอนส่งการ์ด
 *
 * พารามิเตอร์ที่ส่งต่อกันไปทุกหน้า:
 *   flow = ขั้นที่เหลือ (ไม่รวมหน้าปัจจุบัน) เช่น "vaccine:B1.B2,idcard,consent:B1"
 *   by   = b (อ้างนัด) | c (อ้างตัวน้อง — ส่งจากหน้าข้อมูลลูกค้า ยังไม่มีนัด)
 *   kind = stay | groom (ฟอร์มประวัติแบบไหน)
 *   n    = จำนวนขั้นทั้งหมด (ไว้โชว์ "ขั้นที่ x จาก n")
 * ไฟล์นี้ใช้ได้ทั้งฝั่งเบราว์เซอร์และเซิร์ฟเวอร์
 */

export type FlowStep = "info" | "vaccine" | "idcard" | "consent";
export type FlowToken = { step: FlowStep; ids: string[] };
export type FlowBy = "b" | "c";

const STEPS: FlowStep[] = ["info", "vaccine", "idcard", "consent"];

export const FLOW_STEP_LABEL: Record<FlowStep, string> = {
  info: "แจ้งประวัติน้อง",
  vaccine: "แนบสมุดวัคซีน",
  idcard: "แนบบัตรประชาชน",
  consent: "อ่านกฎ + กดยินยอม",
};

export function encodeFlow(tokens: FlowToken[]): string {
  return tokens.map((t) => (t.ids.length ? `${t.step}:${t.ids.join(".")}` : t.step)).join(",");
}

export function decodeFlow(raw: string | null | undefined): FlowToken[] {
  return (raw || "")
    .split(",")
    .map((part) => {
      const [step, ids = ""] = part.trim().split(":");
      return { step: step as FlowStep, ids: ids.split(".").filter(Boolean) };
    })
    .filter((t) => STEPS.includes(t.step));
}

/** หน้าในแอปของขั้นนั้น พร้อมพารามิเตอร์พาไปขั้นที่เหลือ */
export function flowStepHref(
  token: FlowToken,
  rest: FlowToken[],
  opts: { by: FlowBy; kind: string; total: number }
): string {
  const ids = token.ids.join(",");
  const q = new URLSearchParams();
  let path = "/app";
  if (token.step === "info") {
    path = "/app/groom-info";
    q.set(opts.by === "c" ? "cats" : "id", ids);
    q.set("kind", opts.kind === "groom" ? "groom" : "stay");
  } else if (token.step === "vaccine" || token.step === "idcard") {
    path = "/app/pet-docs";
    q.set("need", token.step);
    if (ids) q.set(opts.by === "c" ? "cats" : "id", ids);
  } else if (token.step === "consent") {
    path = "/app/consent";
    if (opts.by === "b" && token.ids[0]) q.set("id", token.ids[0]);
    else q.set("mode", "customer");
  }
  q.set("n", String(opts.total));
  q.set("by", opts.by);
  if (opts.kind) q.set("fk", opts.kind);
  if (rest.length) q.set("flow", encodeFlow(rest));
  return `${path}?${q}`;
}

/** หน้าแรกของลำดับ — ใช้ตอนเปิดจากปุ่มในการ์ด (LIFF path=intake) */
export function firstFlowHref(params: URLSearchParams): string | null {
  const tokens = decodeFlow(params.get("flow"));
  if (!tokens.length) return null;
  const by: FlowBy = params.get("by") === "c" ? "c" : "b";
  return flowStepHref(tokens[0], tokens.slice(1), { by, kind: params.get("kind") || "", total: tokens.length });
}

/** ลิงก์ร้าน (/s/<slug>) ของหน้าปัจจุบัน — ไปขั้นต่อไปต้องอยู่ร้านเดิม */
function shopPrefix(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname.match(/^\/s\/[a-z0-9-]+/i)?.[0] || "";
}

/** ขั้นต่อไปจากหน้าปัจจุบัน — null = ไม่ได้มาจากลำดับ หรือเป็นขั้นสุดท้ายแล้ว */
export function flowProgress(params: URLSearchParams): {
  index: number;
  total: number;
  next: { href: string; label: string } | null;
} | null {
  const total = Number(params.get("n")) || 0;
  if (!total) return null;
  const rest = decodeFlow(params.get("flow"));
  const by: FlowBy = params.get("by") === "c" ? "c" : "b";
  const next = rest.length
    ? {
        href: shopPrefix() + flowStepHref(rest[0], rest.slice(1), { by, kind: params.get("fk") || "", total }),
        label: FLOW_STEP_LABEL[rest[0].step],
      }
    : null;
  return { index: total - rest.length, total, next };
}
