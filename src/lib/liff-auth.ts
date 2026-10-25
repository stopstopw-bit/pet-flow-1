import { getLineCredentials } from "./line-config";

export type VerifiedLiffIdentity = { lineUserId: string; displayName: string };

export type LiffVerifyResult =
  | { ok: true; identity: VerifiedLiffIdentity }
  | { ok: false; reason: string };

/** channel id ของ LIFF ร้านนี้ ("<channelId>-<suffix>" → ส่วนหน้า) — ร้านอื่นใช้ token มาสวมรอยไม่ได้ */
async function shopChannel(): Promise<string> {
  const creds = await getLineCredentials().catch(() => null);
  return creds?.liffId?.split("-")[0]?.trim() || "";
}

/**
 * ตรวจ LIFF ID token กับ LINE ตรงๆ ก่อนเชื่อว่าเป็นลูกค้าคนนั้นจริง
 *
 * เดิมทุก route ฝั่งลูกค้าเชื่อ lineUserId ที่ client ส่งมาใน body/query ตรงๆ —
 * ใครก็ใส่ lineUserId ของคนอื่นแล้วสวมรอยอ่าน/แก้ข้อมูล จองคิว แลกแต้มแทนได้ทันที
 * ID token คือ JWT ที่ LINE เซ็นให้ตอนล็อกอิน LIFF สำเร็จ ปลอมไม่ได้ (ต่างจาก userId ที่เป็นแค่ string ธรรมดา)
 *
 * ตรวจไม่ผ่านคืน reason สั้นๆ ไว้โชว์เป็นรหัสบนจอลูกค้า + log ไว้ดูใน Vercel
 */
export async function verifyLiffIdTokenDetailed(idToken: string): Promise<LiffVerifyResult> {
  if (!idToken || typeof idToken !== "string") return { ok: false, reason: "no_token" };

  const clientId = await shopChannel();
  if (!clientId) {
    console.warn("[liff-auth] ร้านนี้ยังไม่ได้ตั้ง LIFF ID — ตรวจ token ไม่ได้");
    return { ok: false, reason: "no_liff_config" };
  }

  try {
    const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[liff-auth] LINE ตรวจ ID token ไม่ผ่าน ${res.status}: ${text}`);
      const desc = /"error_description"\s*:\s*"([^"]+)"/.exec(text)?.[1] || "";
      return { ok: false, reason: `line_${res.status}${desc ? `_${desc.replace(/\W+/g, "_").slice(0, 40)}` : ""}` };
    }
    const data = (await res.json()) as { sub?: string; name?: string; aud?: string };
    if (!data.sub) return { ok: false, reason: "no_sub" };
    // aud ต้องตรงกับ channel id ของ LIFF เราเท่านั้น — กัน token จาก LIFF app อื่นเอามาใช้ปลอมตัว
    if (data.aud && data.aud !== clientId) return { ok: false, reason: `channel_${data.aud}` };
    return { ok: true, identity: { lineUserId: data.sub, displayName: data.name || "" } };
  } catch (e) {
    console.warn("[liff-auth] เรียก LINE ไม่สำเร็จ", e);
    return { ok: false, reason: "line_unreachable" };
  }
}

export async function verifyLiffIdToken(
  idToken: string
): Promise<VerifiedLiffIdentity | null> {
  const r = await verifyLiffIdTokenDetailed(idToken);
  return r.ok ? r.identity : null;
}

/**
 * ทางสำรองเมื่อไม่มี ID token (LIFF app ไม่ได้ติ๊ก scope "openid" — getIDToken() คืน null)
 * ใช้ access token ของ LIFF แทน: ถาม LINE ว่า token นี้ออกให้ channel ไหน (ต้องเป็นของร้านนี้)
 * แล้วดึงโปรไฟล์ด้วย token นั้น — userId มาจาก LINE โดยตรง client ปลอมไม่ได้เหมือนกัน
 */
export async function verifyLiffAccessTokenDetailed(accessToken: string): Promise<LiffVerifyResult> {
  if (!accessToken || typeof accessToken !== "string") return { ok: false, reason: "no_token" };
  const clientId = await shopChannel();
  if (!clientId) return { ok: false, reason: "no_liff_config" };
  try {
    const v = await fetch(
      `https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`
    );
    if (!v.ok) {
      const text = await v.text().catch(() => "");
      console.warn(`[liff-auth] LINE ตรวจ access token ไม่ผ่าน ${v.status}: ${text}`);
      return { ok: false, reason: `line_at_${v.status}` };
    }
    const info = (await v.json()) as { client_id?: string; expires_in?: number };
    const tokenChannel = String(info.client_id || "");
    if (tokenChannel !== clientId) {
      console.warn(`[liff-auth] access token มาจาก channel ${tokenChannel || "?"} ไม่ใช่ของร้านนี้ (${clientId})`);
      return { ok: false, reason: `channel_${tokenChannel || "unknown"}` };
    }
    if (!info.expires_in || info.expires_in <= 0) return { ok: false, reason: "line_at_expired" };
    const p = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!p.ok) {
      console.warn(`[liff-auth] ดึงโปรไฟล์ด้วย access token ไม่ได้ ${p.status}`);
      return { ok: false, reason: `line_profile_${p.status}` };
    }
    const prof = (await p.json()) as { userId?: string; displayName?: string };
    if (!prof.userId) return { ok: false, reason: "no_sub" };
    return { ok: true, identity: { lineUserId: prof.userId, displayName: prof.displayName || "" } };
  } catch (e) {
    console.warn("[liff-auth] เรียก LINE ไม่สำเร็จ", e);
    return { ok: false, reason: "line_unreachable" };
  }
}
