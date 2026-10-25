import { getSupabase } from "./server";
import { requireTenantId } from "../tenant-context";

const BUCKET = "media";

function parseDataUrl(dataUrl: string) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const ext = mime.split("/")[1]?.split("+")[0]?.slice(0, 10) || "bin";
  return { mime, ext, buffer: Buffer.from(m[2], "base64") };
}

let bucketReady: Promise<void> | null = null;

/** สร้าง bucket "media" ครั้งแรกที่ใช้งาน (public, ไว้เก็บรูป/วิดีโอแมว) — เงียบถ้าสร้างไม่ได้ (เช่นมีอยู่แล้ว) */
function ensureBucket(sb: ReturnType<typeof getSupabase>) {
  if (!sb) return Promise.resolve();
  if (!bucketReady) {
    bucketReady = sb.storage
      .createBucket(BUCKET, { public: true, fileSizeLimit: "25MB" })
      .then(
        () => {},
        () => {}
      );
  }
  return bucketReady;
}

/**
 * อัปโหลด data URL (base64) ขึ้น Supabase Storage แทนที่จะเก็บ base64 ยัดในฐานข้อมูลตรงๆ
 * คืน public URL ถ้าอัปสำเร็จ — ถ้าอัปไม่ได้ (ยังไม่ตั้งค่า Supabase, bucket พัง ฯลฯ)
 * คืน data URL เดิมกลับไปเหมือนก่อนหน้านี้ กันไม่ให้ฟีเจอร์พัง (graceful degrade)
 */
export async function uploadDataUrlToStorage(
  path: string,
  dataUrl: string
): Promise<string> {
  if (!dataUrl.startsWith("data:")) return dataUrl; // เป็น URL อยู่แล้ว (อัปไปแล้วก่อนหน้า) ไม่ต้องทำซ้ำ
  const sb = getSupabase();
  if (!sb) return dataUrl;
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return dataUrl;

  await ensureBucket(sb);
  const fullPath = `${path}.${parsed.ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(fullPath, parsed.buffer, {
    contentType: parsed.mime,
    upsert: true,
  });
  if (error) return dataUrl;

  const { data } = sb.storage.from(BUCKET).getPublicUrl(fullPath);
  return data.publicUrl || dataUrl;
}

/** bucket ส่วนตัว — เปิดดูได้เฉพาะคนของร้านนั้นผ่าน /api/files (ไม่มี public URL) */
export const PRIVATE_BUCKET = "private";
/** URL ที่เก็บลงฐานข้อมูลแทน public URL — ชี้มาที่ route ของเราที่ตรวจสิทธิ์ก่อนเปิดไฟล์ */
export const PRIVATE_FILE_ROUTE = "/api/files";

let privateBucketReady: Promise<void> | null = null;

function ensurePrivateBucket(sb: NonNullable<ReturnType<typeof getSupabase>>) {
  if (!privateBucketReady) {
    privateBucketReady = sb.storage
      .createBucket(PRIVATE_BUCKET, { public: false, fileSizeLimit: "25MB" })
      .then(
        () => {},
        () => {}
      );
  }
  return privateBucketReady;
}

/**
 * อัปไฟล์ข้อมูลส่วนตัวลูกค้า (บัตรประชาชน, ลายเซ็น, ใบวัคซีน, สลิป, รูปน้องแมว)
 * ลง bucket ส่วนตัว ใต้โฟลเดอร์ของร้าน `<tenantId>/...` แล้วคืน `/api/files/<tenantId>/...`
 *
 * ต่างจาก uploadDataUrlToStorage ที่ได้ public URL — ใครได้ลิงก์ก็เปิดได้ตลอดไป
 * ไฟล์พวกนี้ต้องให้ /api/files ตรวจก่อนว่าคนเปิดเป็นคนของร้านเดียวกัน
 * อัปไม่ได้ → คืน data URL เดิม (เหมือนตัวเดิม ฟีเจอร์ไม่พัง)
 */
export async function uploadPrivateDataUrl(path: string, dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:")) return dataUrl;
  const sb = getSupabase();
  if (!sb) return dataUrl;
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return dataUrl;

  const fullPath = `${requireTenantId()}/${path}.${parsed.ext}`;

  await ensurePrivateBucket(sb);
  const { error } = await sb.storage.from(PRIVATE_BUCKET).upload(fullPath, parsed.buffer, {
    contentType: parsed.mime,
    upsert: true,
  });
  if (error) return dataUrl;
  return `${PRIVATE_FILE_ROUTE}/${fullPath}`;
}

/** สร้างลิงก์ชั่วคราว (หมดอายุเอง) ไปยังไฟล์ใน bucket ส่วนตัว */
export async function signPrivateFile(fullPath: string, expiresInSec = 300): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.storage
    .from(PRIVATE_BUCKET)
    .createSignedUrl(fullPath, expiresInSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** โฟลเดอร์ใน bucket สาธารณะ "media" ที่เป็นข้อมูลส่วนตัวลูกค้า — ต้องย้ายไป bucket ส่วนตัว */
const SENSITIVE_PREFIXES = [
  "cats/",
  "id-cards/",
  "consent-signatures/",
  "consent-vaccine/",
  "deposit-slips/",
  "finance-receipts/",
  "package-slips/",
];

/**
 * public URL ของไฟล์ส่วนตัวใน bucket "media" → path ใน bucket (null ถ้าไม่ใช่ไฟล์ที่ต้องย้าย)
 * เช่น https://x.supabase.co/storage/v1/object/public/media/id-cards/c1.jpeg → id-cards/c1.jpeg
 */
export function sensitivePublicPath(url: string): string | null {
  const m = url.match(/\/storage\/v1\/object\/public\/media\/([^?#]+)/);
  if (!m) return null;
  const path = decodeURIComponent(m[1]);
  return SENSITIVE_PREFIXES.some((p) => path.startsWith(p)) ? path : null;
}

/**
 * ย้ายไฟล์เก่าจาก bucket สาธารณะไป bucket ส่วนตัวของร้านปัจจุบัน
 * คืน URL ใหม่ (/api/files/...) กับ path เดิมไว้ลบทีหลัง — ลบหลังอัปเดตฐานข้อมูลสำเร็จเท่านั้น
 * ไม่ใช่ไฟล์ที่ต้องย้าย/ย้ายไม่ได้ → null (ค่าเดิมยังใช้ได้เหมือนเดิม)
 */
export async function copyPublicFileToPrivate(
  url: string
): Promise<{ url: string; oldPath: string } | null> {
  const oldPath = sensitivePublicPath(url);
  if (!oldPath) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const file = await sb.storage.from(BUCKET).download(oldPath);
  if (file.error || !file.data) return null;

  const fullPath = `${requireTenantId()}/${oldPath}`;
  await ensurePrivateBucket(sb);
  const { error } = await sb.storage
    .from(PRIVATE_BUCKET)
    .upload(fullPath, Buffer.from(await file.data.arrayBuffer()), {
      contentType: file.data.type || undefined,
      upsert: true,
    });
  if (error) return null;
  return { url: `${PRIVATE_FILE_ROUTE}/${fullPath}`, oldPath };
}

/** ลบไฟล์เก่าออกจาก bucket สาธารณะ (เรียกหลังชี้ฐานข้อมูลไปไฟล์ใหม่แล้ว) */
export async function removePublicFiles(paths: string[]) {
  const sb = getSupabase();
  if (!sb || !paths.length) return;
  for (let i = 0; i < paths.length; i += 100) {
    await sb.storage.from(BUCKET).remove(paths.slice(i, i + 100));
  }
}
