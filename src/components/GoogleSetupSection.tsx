"use client";

import { Icon } from "@/components/Icon";
import { useCallback, useEffect, useState } from "react";

type GoogleStatus = {
  configured: boolean;
  source: string;
  serviceAccountEmail?: string;
  test?: { ok: boolean; messages: string[] };
};

export function GoogleSetupSection({ adminCode }: { adminCode: string }) {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [spreadsheetUrl, setSpreadsheetUrl] = useState(
    "https://docs.google.com/spreadsheets/d/1VQD7eHUpkiy6TuyfgVATsUM_aOxNdbxyZYSbrw1EF74/edit"
  );
  const [calendarUrl, setCalendarUrl] = useState(
    "https://calendar.google.com/calendar/u/0?cid=OGU5ZDJkZjU3ODBiOWJmY2U0NmI2NjBhZGQzY2VlMmVkNDFlZDcxZTFiZDcwNjViMWFlY2YzZTgxZTI3OTI3Y0Bncm91cC5jYWxlbmRhci5nb29nbGUuY29t"
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/setup/google");
    const data = await res.json();
    setStatus(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/setup/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminCode, jsonText, spreadsheetUrl, calendarUrl }),
    });
    const data = await res.json();
    setMsg(data.message || data.error || "");
    if (data.ok) await load();
    setSaving(false);
  };

  if (loading) {
    return <p className="text-xs text-brown-soft">กำลังตรวจ Google…</p>;
  }

  return (
    <section className="mb-4 space-y-3 rounded-petflow bg-card p-4 shadow-petflow-sm">
      <h2 className="flex items-center gap-2.5 text-sm font-extrabold text-petflow-chocolate">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-honey/30 text-petflow-chocolate">
          <Icon name="calendar" size={16} />
        </span>
        Google Calendar + Sheets
      </h2>
      <p className="text-xs text-brown-soft">
        วาง 3 อย่างแล้วกดบันทึก — <b>ไม่ต้องใส่ Vercel</b> (เก็บในระบบให้)
      </p>

      {status?.configured ? (
        <div className="rounded-petflow-sm bg-sage/15 px-3 py-2 text-xs">
          <p className="font-bold text-ok">Google พร้อมแล้ว ({status.source})</p>
          {status.serviceAccountEmail && (
            <p className="mt-1 text-brown-soft">Service: {status.serviceAccountEmail}</p>
          )}
        </div>
      ) : null}

      {msg && (
        <p className="whitespace-pre-line rounded-petflow-sm bg-paper px-3 py-2 text-xs font-bold text-brown">
          {msg}
        </p>
      )}

      <label className="block text-xs font-bold text-brown-soft">
        1. วางไฟล์ JSON จาก Google Cloud (ทั้งก้อน)
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          rows={6}
          placeholder='วางเนื้อหา petflow-hote-xxxxx.json ทั้งไฟล์…'
          className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper p-2 font-mono text-[10px]"
        />
      </label>

      <label className="block text-xs font-bold text-brown-soft">
        2. ลิงก์ Google Sheet
        <input
          value={spreadsheetUrl}
          onChange={(e) => setSpreadsheetUrl(e.target.value)}
          className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-xs"
        />
      </label>

      <label className="block text-xs font-bold text-brown-soft">
        3. ลิงก์ Google Calendar
        <input
          value={calendarUrl}
          onChange={(e) => setCalendarUrl(e.target.value)}
          className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-xs"
        />
      </label>

      <div className="rounded-petflow-sm bg-honey/15 px-3 py-2 text-[10px] text-brown-soft">
        <p className="font-bold text-petflow-chocolate">ก่อนกดบันทึก — Share ให้ service account:</p>
        <p className="mt-1">
          เปิด JSON ดู <code>client_email</code> → Share Sheet (Editor) + Calendar (แก้ไข event)
        </p>
      </div>

      <button
        type="button"
        disabled={saving || !jsonText.trim()}
        onClick={save}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-petflow-chocolate text-sm font-extrabold text-card disabled:opacity-50"
      >
        {saving ? "กำลังทดสอบและบันทึก…" : "บันทึก Google (ทดสอบอัตโนมัติ)"}
      </button>

      {status?.test?.messages?.length ? (
        <ul className="space-y-1 text-[10px] text-brown-soft">
          {status.test.messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
