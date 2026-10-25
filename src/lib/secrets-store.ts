import { getSupabase } from "./supabase/server";
import { requireTenantId } from "./tenant-context";
import { forgetInRequest, memoInRequest } from "./request-memo";

export type GoogleSecrets = {
  serviceAccountEmail: string;
  privateKey: string;
  calendarId: string;
  spreadsheetId: string;
  updatedAt: string;
};

export type TelegramSecrets = {
  botToken: string;
  ownerChatIds: string;
  appUrl: string;
  updatedAt: string;
};

export type LineSecrets = {
  channelToken?: string;
  /** Channel secret — ใช้ตรวจลายเซ็น X-Line-Signature กัน webhook ปลอม */
  channelSecret?: string;
  liffId?: string;
  updatedAt: string;
};

type SecretsPayload = {
  google?: GoogleSecrets;
  telegram?: TelegramSecrets;
  line?: LineSecrets;
};

/** แถวเดียวต่อร้าน — id เดิมตายตัวเป็น "secrets" ทำให้ทุกร้านใช้ credential ก้อนเดียวกัน */
function secretsId() {
  return `secrets:${requireTenantId()}`;
}

let memSecrets: SecretsPayload = {};

async function persistSecrets(next: SecretsPayload) {
  forgetInRequest(secretsId);
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("site_config").upsert({
      id: secretsId(),
      tenant_id: requireTenantId(),
      data: next,
      updated_at: new Date().toISOString(),
    });
    // เคยเงียบไว้ → หน้า setup ขึ้น "บันทึกแล้ว" ทั้งที่ยังไม่มีตาราง site_config
    if (error) throw new Error(`บันทึกไม่สำเร็จ: ${error.message}`);
  } else {
    memSecrets = next;
  }
  forgetInRequest(secretsId);
}

export async function getSecrets(): Promise<SecretsPayload> {
  // Telegram/LINE อ่านซ้ำหลายรอบใน request เดียว — อ่าน DB ครั้งเดียว (ดู request-memo.ts)
  return structuredClone(await memoInRequest(secretsId, readSecrets));
}

async function readSecrets(): Promise<SecretsPayload> {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from("site_config")
      .select("data")
      .eq("id", secretsId())
      .maybeSingle();
    if (data?.data) return data.data as SecretsPayload;
  }
  return memSecrets;
}

export async function saveGoogleSecrets(google: Omit<GoogleSecrets, "updatedAt">) {
  const current = await getSecrets();
  const next: SecretsPayload = {
    ...current,
    google: { ...google, updatedAt: new Date().toISOString() },
  };
  await persistSecrets(next);
  return next.google!;
}

export async function saveTelegramSecrets(
  telegram: Omit<TelegramSecrets, "updatedAt">
) {
  const current = await getSecrets();
  const next: SecretsPayload = {
    ...current,
    telegram: { ...telegram, updatedAt: new Date().toISOString() },
  };
  await persistSecrets(next);
  return next.telegram!;
}

export async function saveLineSecrets(
  line: Partial<Omit<LineSecrets, "updatedAt">>
) {
  const current = await getSecrets();
  const prev = current.line;
  const merged: LineSecrets = {
    channelToken: line.channelToken ?? prev?.channelToken,
    channelSecret: line.channelSecret ?? prev?.channelSecret,
    liffId: line.liffId ?? prev?.liffId,
    updatedAt: new Date().toISOString(),
  };
  if (!merged.channelToken && !merged.liffId) {
    throw new Error("ไม่มีข้อมูล LINE ที่จะบันทึก");
  }
  const next: SecretsPayload = {
    ...current,
    line: merged,
  };
  await persistSecrets(next);
  return next.line!;
}

export async function clearLineSecrets() {
  const current = await getSecrets();
  const next = { ...current };
  delete next.line;
  await persistSecrets(next);
}

export async function clearGoogleSecrets() {
  const current = await getSecrets();
  const next = { ...current };
  delete next.google;
  await persistSecrets(next);
}
