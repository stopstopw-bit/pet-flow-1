/**
 * fetch ฝั่งแอปลูกค้า — ถ้าเซิร์ฟเวอร์ตอบว่ายังไม่มีคุกกี้เซสชัน (code "no_session")
 * ให้ LiffProvider แลก LIFF token เป็นคุกกี้ใหม่ (POST /api/customers/line) แล้วยิงซ้ำให้อีกครั้งเดียว
 * ลูกค้าจะได้ไม่เจอ "บันทึกไม่สำเร็จ" เพราะคุกกี้หาย/ตอนเปิดแอปแลกไม่ทัน
 */
let refreshSession: (() => Promise<boolean>) | null = null;
/** สาเหตุล่าสุดที่แลกเซสชันไม่ผ่าน (เช่น no_token = LIFF ไม่ได้เปิด scope openid) — โชว์เป็นรหัสบนจอ */
let lastSessionIssue = "";

export function setCustomerSessionRefresher(fn: (() => Promise<boolean>) | null) {
  refreshSession = fn;
}

export function setCustomerSessionIssue(reason: string) {
  lastSessionIssue = reason;
}

/** ยังไม่มีเซสชันหลังลองแลกใหม่แล้ว — แปะรหัสสาเหตุท้ายข้อความ ลูกค้าแคปจอส่งร้านแล้วรู้เลยว่าติดตรงไหน */
async function withIssueCode(res: Response): Promise<Response> {
  if (res.status !== 401) return res;
  const data = await res.clone().json().catch(() => null);
  if (data?.code !== "no_session") return res;
  const issue = lastSessionIssue || "no_cookie";
  return new Response(
    JSON.stringify({ ...data, error: `${data.error} (รหัส: ${issue})`, issue }),
    { status: 401, headers: { "Content-Type": "application/json" } }
  );
}

export async function customerFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status !== 401) return res;
  const data = await res.clone().json().catch(() => null);
  if (data?.code !== "no_session") return res;
  if (!refreshSession || !(await refreshSession().catch(() => false))) return withIssueCode(res);
  // แลกผ่านแล้วแต่ยิงซ้ำยังไม่มีคุกกี้ = เบราว์เซอร์ไม่เก็บคุกกี้
  lastSessionIssue = "cookie_blocked";
  return withIssueCode(await fetch(input, init));
}
