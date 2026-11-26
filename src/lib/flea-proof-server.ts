import { uploadPrivateDataUrl } from "./supabase/storage";
import { setCatStayInfo, type CustomerRecord } from "./customers-store";
import { FLEA_PROOF_MAX } from "./flea-proof";
import { FLEA_UPDATE_SOURCE, MAX_FLEA_STORED } from "./flea-update";

/**
 * รูปหลักฐานการหยดยาเห็บหมัด ที่ลูกค้าแนบในหน้ากดยอมรับข้อตกลงก่อนเข้าพัก (ไม่บังคับ)
 * อัปขึ้น bucket ส่วนตัว แล้วเก็บต่อท้ายไว้ที่ตัวน้อง (stayInfo.fleaPhotos — ที่เดียวกับการ์ดอัปเดตยาเห็บหมัด)
 * คืนลิงก์ไว้ส่งตามข้อความ Telegram · catNames = น้องในนัดนี้ (จับคู่ตามชื่อ) · ไม่ส่ง = ทุกตัวของลูกค้า
 */
export async function saveFleaProof(
  customer: CustomerRecord | undefined | null,
  raw: unknown,
  catNames?: string[]
): Promise<string[]> {
  const list = (Array.isArray(raw) ? raw : [])
    .map((v) => String(v || "").trim())
    .filter((v) => v.startsWith("data:image/"))
    .slice(0, FLEA_PROOF_MAX);
  if (!list.length) return [];
  const urls: string[] = [];
  for (const [i, v] of list.entries()) {
    urls.push(await uploadPrivateDataUrl(`cat-flea/${customer?.id || "x"}-${Date.now()}-${i}`, v));
  }
  if (!customer) return urls;
  const key = (n: string) => n.replace(/^น้อง/, "").replace(/\s+/g, "").toLowerCase();
  const wanted = (catNames || []).map(key);
  const cats = wanted.length ? customer.cats.filter((c) => wanted.includes(key(c.name))) : customer.cats;
  for (const c of cats) {
    let info: Record<string, unknown> = {};
    try {
      info = c.stayInfo ? (JSON.parse(c.stayInfo) as Record<string, unknown>) : {};
    } catch {
      info = {};
    }
    const prev = Array.isArray(info.fleaPhotos) ? (info.fleaPhotos as string[]) : [];
    await setCatStayInfo(
      customer.id,
      c.id,
      JSON.stringify({
        ...info,
        // ยังไม่เคยกรอกฟอร์มก่อนเข้าพัก = ไม่นับว่ากรอกแล้ว (stayInfoDone)
        ...(c.stayInfo ? {} : { source: FLEA_UPDATE_SOURCE }),
        fleaPhotos: [...prev, ...urls].slice(-MAX_FLEA_STORED),
        fleaUpdatedAt: new Date().toISOString(),
      })
    ).catch(() => undefined);
  }
  return urls;
}
