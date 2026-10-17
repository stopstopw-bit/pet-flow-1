import { getSecrets, type GoogleSecrets } from "./secrets-store";
import { isBootstrapTenant } from "./tenant-context";

export type GoogleCredentials = {
  serviceAccountEmail: string;
  privateKey: string;
  calendarId: string;
  spreadsheetId: string;
  source: "env" | "database";
};

export function parseSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  return trimmed;
}

export function parseCalendarId(input: string): string {
  const trimmed = input.trim();
  const cid = trimmed.match(/[?&]cid=([^&]+)/)?.[1];
  if (cid) {
    try {
      return Buffer.from(cid, "base64").toString("utf8");
    } catch {
      /* fall through */
    }
  }
  if (trimmed.includes("@group.calendar.google.com")) return trimmed;
  return trimmed;
}

export function parseServiceAccountJson(raw: string): {
  serviceAccountEmail: string;
  privateKey: string;
} {
  const parsed = JSON.parse(raw) as {
    client_email?: string;
    private_key?: string;
  };
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("JSON ต้องมี client_email และ private_key");
  }
  return {
    serviceAccountEmail: parsed.client_email,
    privateKey: parsed.private_key,
  };
}

export async function getGoogleCredentials(): Promise<GoogleCredentials | null> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID?.trim();

  // Google Sheet/Calendar ใน env เป็นของร้าน bootstrap — ถ้าให้ทุกร้านใช้ backup ทุกคืน
  // จะเขียนข้อมูลทุกร้านลงชีตเดียวกัน (ทับกัน + ข้อมูลลูกค้าปนกัน)
  if (email && key && calendarId && spreadsheetId && isBootstrapTenant()) {
    return {
      serviceAccountEmail: email,
      privateKey: key,
      calendarId,
      spreadsheetId,
      source: "env",
    };
  }

  const secrets = await getSecrets();
  const g = secrets.google;
  if (g?.serviceAccountEmail && g.privateKey && g.calendarId && g.spreadsheetId) {
    return {
      serviceAccountEmail: g.serviceAccountEmail,
      privateKey: g.privateKey.replace(/\\n/g, "\n"),
      calendarId: g.calendarId,
      spreadsheetId: g.spreadsheetId,
      source: "database",
    };
  }

  return null;
}

export async function isGoogleConfigured() {
  const creds = await getGoogleCredentials();
  return Boolean(creds?.serviceAccountEmail && creds.privateKey);
}

export async function getGoogleIds() {
  const creds = await getGoogleCredentials();
  return {
    calendarId: creds?.calendarId,
    spreadsheetId: creds?.spreadsheetId,
    serviceAccountEmail: creds?.serviceAccountEmail,
    source: creds?.source,
  };
}

export type GoogleTestResult = {
  ok: boolean;
  calendar: boolean;
  sheets: boolean;
  serviceAccountEmail?: string;
  messages: string[];
};

export async function testGoogleConnection(
  creds: GoogleCredentials
): Promise<GoogleTestResult> {
  const messages: string[] = [];
  let calendar = false;
  let sheets = false;

  const { google } = await import("googleapis");
  const auth = new google.auth.JWT({
    email: creds.serviceAccountEmail,
    key: creds.privateKey,
    scopes: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });

  try {
    const cal = google.calendar({ version: "v3", auth });
    await cal.calendars.get({ calendarId: creds.calendarId });
    calendar = true;
    messages.push("✅ เชื่อมปฏิทินได้");
  } catch (e) {
    messages.push(
      `❌ ปฏิทิน: ${e instanceof Error ? e.message : String(e)} — แชร์ปฏิทินให้ ${creds.serviceAccountEmail}`
    );
  }

  try {
    const sheetsApi = google.sheets({ version: "v4", auth });
    await sheetsApi.spreadsheets.get({ spreadsheetId: creds.spreadsheetId });
    sheets = true;
    messages.push("✅ เชื่อม Google Sheet ได้");
  } catch (e) {
    messages.push(
      `❌ Sheet: ${e instanceof Error ? e.message : String(e)} — แชร์ชีตให้ ${creds.serviceAccountEmail} (Editor)`
    );
  }

  return {
    ok: calendar && sheets,
    calendar,
    sheets,
    serviceAccountEmail: creds.serviceAccountEmail,
    messages,
  };
}

export type GoogleSecretsInput = Omit<GoogleSecrets, "updatedAt">;
