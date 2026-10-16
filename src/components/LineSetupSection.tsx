"use client";

import { Icon } from "@/components/Icon";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TIER_LABELS, type CustomerTier } from "@/lib/customer-tier";

type LineStatus = {
  configured: boolean;
  liffConfigured?: boolean;
  channelSecretConfigured?: boolean;
  source: string;
  liffId?: string;
  endpointUrl?: string;
  testLiffUrl?: string;
  displayName?: string;
  basicId?: string;
};

export function RegistrationQrSection({ compact }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [liffId, setLiffId] = useState("");
  const [registerUrl, setRegisterUrl] = useState("");

  useEffect(() => {
    fetch("/api/setup/line")
      .then((r) => r.json())
      .then((d: LineStatus) => {
        const lid = d.liffId || "";
        setLiffId(lid);
        const base =
          typeof window !== "undefined" ? window.location.origin : "";
        setRegisterUrl(
          lid
            ? `https://liff.line.me/${lid}?path=register`
            : `${base}/app/register`
        );
      });
  }, []);

  const qrUrl = registerUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(registerUrl)}`
    : "";

  const copy = async () => {
    if (!registerUrl) return;
    await navigator.clipboard.writeText(registerUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section
      className={`rounded-petflow border border-sage/40 bg-sage/10 ${
        compact ? "p-4" : "p-5"
      }`}
    >
      <h2 className="flex items-center gap-2.5 text-sm font-extrabold text-petflow-chocolate">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-honey/30 text-petflow-chocolate">
          <Icon name="grid" size={16} />
        </span>
        QR ลงทะเบียนลูกค้า
      </h2>
      <p className="mb-3 text-[10px] text-brown-soft">
        ตั้งที่เคาน์เตอร์ — ลูกค้าสแกนแล้วกรอกชื่อ เบอร์ และน้องแมว
      </p>
      {qrUrl ? (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrUrl}
            alt="QR ลงทะเบียน"
            width={140}
            height={140}
            className="rounded-petflow-sm bg-white p-2 shadow-petflow-sm"
          />
          <div className="min-w-0 flex-1 text-xs">
            <p className="mb-2 break-all font-mono text-[10px] text-brown-soft">
              {registerUrl}
            </p>
            <button
              type="button"
              onClick={copy}
              className="flex h-10 items-center gap-1.5 rounded-full bg-card px-4 text-xs font-bold text-latte-deep"
            >
              {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
            </button>
            {!liffId && (
              <p className="mt-2 text-[10px] text-wait">
                ตั้ง LIFF ด้านบนก่อน — QR จะเปิดใน LINE โดยตรง
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-brown-soft">กำลังโหลด…</p>
      )}
    </section>
  );
}

/** ตั้งค่า LIFF — แอปลูกค้าใน LINE */
export function LiffSetupSection({ adminCode }: { adminCode?: string }) {
  const [status, setStatus] = useState<LineStatus | null>(null);
  const [liffId, setLiffId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const endpointUrl = useMemo(() => {
    if (status?.endpointUrl) return status.endpointUrl;
    if (typeof window !== "undefined") return `${window.location.origin}/app`;
    return "https://petflow.example.com/app";
  }, [status?.endpointUrl]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/setup/line");
    const data = await res.json();
    setStatus(data);
    if (data.liffId) setLiffId(data.liffId);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copyEndpoint = async () => {
    await navigator.clipboard.writeText(endpointUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveLiff = async () => {
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/setup/line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminCode,
        action: "save_liff",
        liffId,
      }),
    });
    const data = await res.json();
    setMsg(data.message || data.error || "");
    if (data.ok) await load();
    setSaving(false);
  };

  if (loading) {
    return <p className="text-xs text-brown-soft">กำลังตรวจ LIFF…</p>;
  }

  return (
    <section className="mb-4 space-y-3 rounded-petflow bg-card p-4 shadow-petflow-sm">
      <h2 className="flex items-center gap-2.5 text-base font-extrabold text-petflow-chocolate">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-honey/30 text-petflow-chocolate">
          <Icon name="phone" size={16} />
        </span>
        LINE LIFF — แอปลูกค้าใน LINE
      </h2>
      <p className="text-xs text-brown-soft">
        ใช้สำหรับลูกค้าเปิดแอปจาก LINE · ลงทะเบียน · ยืนยันนัดจากการ์ดที่ส่ง
      </p>

      {status?.liffConfigured ? (
        <div className="rounded-petflow-sm bg-sage/20 px-3 py-2 text-xs font-bold text-ok">
          ตั้ง LIFF แล้ว · ID: {status.liffId}
        </div>
      ) : (
        <div className="rounded-petflow-sm bg-honey/25 px-3 py-2 text-xs font-bold text-wait">
          ⏳ ยังไม่ได้ตั้ง LIFF — ลูกค้าเปิดแอปจาก LINE ไม่ได้
        </div>
      )}

      <ol className="space-y-2 rounded-petflow-sm bg-paper/80 p-3 text-xs text-brown-soft">
        <li>
          <b>1.</b> เปิด{" "}
          <a
            href="https://developers.line.biz/console/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-latte-deep"
          >
            LINE Developers
          </a>{" "}
          → เลือก Channel (LINE Login)
        </li>
        <li>
          <b>2.</b> แท็บ <b>LIFF</b> → Add → Size: <b>Full</b>
        </li>
        <li>
          <b>3.</b> Endpoint URL (copy ด้านล่าง):
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-card px-2 py-1 text-[10px] text-brown">
              {endpointUrl}
            </code>
            <button
              type="button"
              onClick={copyEndpoint}
              className="h-8 rounded-full bg-latte/20 px-3 text-[11px] font-bold"
            >
              {copied ? "คัดลอกแล้ว" : "คัดลอก"}
            </button>
          </div>
        </li>
        <li>
          <b>4.</b> Scope: <b>profile</b> (และ openid ถ้ามี)
        </li>
        <li>
          <b>5.</b> Copy <b>LIFF ID</b> มาวางด้านล่าง → กดบันทึก
        </li>
      </ol>

      <label className="block text-xs font-bold text-brown-soft">
        LIFF ID
        <input
          value={liffId}
          onChange={(e) => setLiffId(e.target.value)}
          placeholder="เช่น 2001234567-AbCdEfGh"
          className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-card px-3 py-2.5 text-sm font-mono"
        />
      </label>

      {msg && (
        <p className="rounded-petflow-sm bg-paper px-3 py-2 text-xs font-bold text-brown whitespace-pre-line">
          {msg}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || !liffId.trim()}
          onClick={saveLiff}
          className="flex h-12 flex-1 items-center justify-center rounded-full bg-petflow-chocolate text-sm font-extrabold text-card disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก…" : "บันทึก LIFF ID"}
        </button>
        {status?.testLiffUrl && (
          <a
            href={status.testLiffUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 items-center gap-1.5 rounded-full border border-petflow-line bg-card px-4 text-xs font-bold text-latte-deep"
          >
            ทดสอบ LIFF
          </a>
        )}
      </div>

      <RegistrationQrSection compact />
    </section>
  );
}

/** ตั้งค่า LINE Messaging API — ส่งการ์ดยืนยันนัด */
export function LineMessagingSetupSection({ adminCode }: { adminCode?: string }) {
  const [status, setStatus] = useState<LineStatus | null>(null);
  const [channelToken, setChannelToken] = useState("");
  const [channelSecret, setChannelSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/setup/line");
    const data = await res.json();
    setStatus(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveToken = async () => {
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/setup/line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminCode,
        action: "save_token",
        channelToken,
        channelSecret,
      }),
    });
    const data = await res.json();
    setMsg(data.message || data.error || "");
    if (data.ok) {
      setChannelToken("");
      setChannelSecret("");
      await load();
    }
    setSaving(false);
  };

  const setWebhook = async () => {
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/setup/line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminCode, action: "set_webhook" }),
    });
    const data = await res.json();
    setMsg(data.message || data.error || "");
    setSaving(false);
  };

  if (loading) {
    return <p className="text-xs text-brown-soft">กำลังตรวจ LINE Messaging…</p>;
  }

  return (
    <section className="mb-4 space-y-3 rounded-petflow bg-card p-4 shadow-petflow-sm">
      <h2 className="flex items-center gap-2.5 text-sm font-extrabold text-petflow-chocolate">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-honey/30 text-petflow-chocolate">
          <Icon name="message" size={16} />
        </span>
        LINE Messaging — ส่งการ์ดยืนยันนัด
      </h2>
      <p className="text-xs text-brown-soft">
        Channel Access Token สำหรับส่งการ์ด Flex ให้ลูกค้า (แยกจาก LIFF ด้านบน)
        {status?.source === "env" ? (
          <span className="mt-1 block text-wait">
            ใช้ Token จาก Vercel — ถ้าส่งไม่ได้ ให้บันทึกที่นี่แทน
          </span>
        ) : null}
      </p>

      {status?.configured ? (
        <div className="rounded-petflow-sm bg-sage/15 px-3 py-2 text-xs font-bold text-ok">
          พร้อมส่งการ์ด
          {status.displayName ? ` · ${status.displayName}` : ""}
        </div>
      ) : (
        <div className="rounded-petflow-sm bg-honey/20 px-3 py-2 text-xs font-bold text-wait">
          ⏳ ยังไม่ได้ตั้ง Token — กดส่งการ์ดจะขึ้น &quot;ส่งไม่สำเร็จ&quot;
        </div>
      )}

      {status?.configured && (
        <div className="rounded-petflow-sm border border-sage/40 bg-sage/5 p-3">
          <p className="mb-2 text-xs font-bold text-petflow-chocolate">
            แจ้งเตือนเข้า Telegram (คนแอด LINE + ลูกค้าตอบแชท)
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={setWebhook}
            className="w-full rounded-petflow-sm bg-[#06C755] py-2.5 text-xs font-extrabold text-white disabled:opacity-60"
          >
            {saving ? "กำลังตั้ง…" : "ตั้ง Webhook อัตโนมัติ (กดครั้งเดียว)"}
          </button>
          <p className="mt-1.5 text-[10px] text-brown-soft">
            กดปุ่มนี้ = บอก LINE ให้ส่ง event มาที่ระบบ ไม่ต้องเข้า Developers
            Console เอง
          </p>
        </div>
      )}

      <label className="block text-xs font-bold text-brown-soft">
        Channel Access Token
        <input
          type="password"
          value={channelToken}
          onChange={(e) => setChannelToken(e.target.value)}
          placeholder="LINE Developers → Messaging API → Issue token"
          className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm"
        />
      </label>

      <label className="block text-xs font-bold text-brown-soft">
        Channel Secret
        <input
          type="password"
          value={channelSecret}
          onChange={(e) => setChannelSecret(e.target.value)}
          placeholder="LINE Developers → Basic settings → Channel secret"
          className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm"
        />
      </label>
      {status?.configured && !status?.channelSecretConfigured ? (
        <div className="rounded-petflow-sm bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
          ⚠️ ยังไม่ได้ตั้ง Channel Secret — ระบบจะปฏิเสธ event LINE ทั้งหมดจนกว่าจะตั้งค่านี้
          (ป้องกันคนปลอมส่ง webhook เข้ามาแทนลูกค้าจริง)
        </div>
      ) : null}

      {msg && (
        <p className="rounded-petflow-sm bg-paper px-3 py-2 text-xs font-bold text-brown whitespace-pre-line">
          {msg}
        </p>
      )}

      <button
        type="button"
        disabled={saving || !channelToken.trim()}
        onClick={saveToken}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-petflow-chocolate text-sm font-extrabold text-card disabled:opacity-50"
      >
        {saving ? "กำลังบันทึก…" : "บันทึก LINE Token"}
      </button>

      <div className="border-t border-petflow-line pt-3">
        <p className="mb-2 text-xs font-bold text-brown">ระดับลูกค้า (อัตโนมัติ)</p>
        <ul className="space-y-1 text-[10px] text-brown-soft">
          {(Object.entries(TIER_LABELS) as [CustomerTier, string][]).map(
            ([key, label]) => (
              <li key={key}>
                <b>{label}</b>
                {key === "new" && " — ยังไม่เคยมา"}
                {key === "regular" && " — มาแล้ว 1+ ครั้ง"}
                {key === "member" && " — เติมเครดิต Member"}
                {key === "vip" && " — มาแล้ว 5+ ครั้ง"}
              </li>
            )
          )}
        </ul>
      </div>
    </section>
  );
}

/** @deprecated use LiffSetupSection + LineMessagingSetupSection */
export function LineSetupSection({ adminCode }: { adminCode?: string }) {
  return (
    <>
      <LiffSetupSection adminCode={adminCode} />
      <LineMessagingSetupSection adminCode={adminCode} />
    </>
  );
}
