"use client";

import { Icon } from "@/components/Icon";
import { useCallback, useEffect, useState } from "react";

type TelegramStatus = {
  configured: boolean;
  source: string;
  appUrl?: string;
  ownerChatIds?: string;
  botUsername?: string;
  hasOwnerIds?: boolean;
  webhookConnected?: boolean;
};

export function TelegramSetupSection({ adminCode }: { adminCode: string }) {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [botToken, setBotToken] = useState("");
  const [ownerChatIds, setOwnerChatIds] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/setup/telegram");
    const data = await res.json();
    setStatus(data);
    if (data.appUrl) setAppUrl(data.appUrl);
    if (data.ownerChatIds) setOwnerChatIds(data.ownerChatIds);
    if (!data.appUrl && typeof window !== "undefined") {
      setAppUrl(window.location.origin);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/setup/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminCode,
        botToken,
        ownerChatIds,
        appUrl: appUrl || window.location.origin,
      }),
    });
    const data = await res.json();
    setMsg(data.message || data.error || "");
    if (data.ok) {
      setBotToken("");
      await load();
    }
    setSaving(false);
  };

  if (loading) {
    return <p className="text-xs text-brown-soft">กำลังตรวจ Telegram…</p>;
  }

  return (
    <section className="mb-4 space-y-3 rounded-petflow bg-card p-4 shadow-petflow-sm">
      <h2 className="flex items-center gap-2.5 text-sm font-extrabold text-petflow-chocolate">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-honey/30 text-petflow-chocolate">
          <Icon name="send" size={16} />
        </span>
        Telegram Bot (แจ้งเตือนเจ้าของ)
      </h2>
      <p className="text-xs text-brown-soft">
        วาง Token แล้วกดบันทึก — <b>ไม่ต้องใส่ Vercel</b> ระบบตั้ง webhook ให้เอง
        {status?.source === "env" ? (
          <span className="mt-1 block text-wait">
            ตอนนี้ใช้ Token จาก Vercel — ถ้าผิด ให้ลบ TELEGRAM_BOT_TOKEN ใน Vercel แล้วบันทึกที่นี่แทน
          </span>
        ) : null}
      </p>

      {status?.configured ? (
        <div className="rounded-petflow-sm bg-sage/15 px-3 py-2 text-xs">
          <p className="font-bold text-ok">
            บอทพร้อมแล้ว
            {status.botUsername ? ` (@${status.botUsername})` : ""}
            {status.source ? ` · ${status.source}` : ""}
          </p>
          {status.webhookConnected === false && (
            <p className="mt-1 text-wait">
              ยังรับคำสั่งไม่ได้ — กดบันทึกอีกครั้ง หรือรีเฟรชหน้านี้
            </p>
          )}
          {status.webhookConnected && (
            <p className="mt-1 text-brown-soft">รับคำสั่งจากแชทได้แล้ว (พิมพ์ /start)</p>
          )}
          {!status.hasOwnerIds && (
            <p className="mt-1 text-wait">ยังไม่มี Chat ID — ใส่ด้านล่างแล้วบันทึกอีกครั้ง</p>
          )}
        </div>
      ) : null}

      {msg && (
        <p className="whitespace-pre-line rounded-petflow-sm bg-paper px-3 py-2 text-xs font-bold text-brown">
          {msg}
        </p>
      )}

      <ol className="space-y-1 text-[11px] text-brown-soft">
        <li>1. ทัก <b>@BotFather</b> → <code>/mybots</code> → เลือกบอท → <b>API Token</b> → Copy</li>
        <li>2. ทักบอท <code>/start</code> → copy <b>Chat ID</b> (หรือใช้เลขด้านล่าง)</li>
        <li>3. วางด้านล่างแล้วกดบันทึก</li>
      </ol>

      <label className="block text-xs font-bold text-brown-soft">
        Bot Token (จาก @BotFather)
        <input
          type="password"
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
          placeholder={
            status?.configured
              ? "ตั้งบอทไว้แล้ว — เว้นว่างได้ถ้าแค่แก้ Chat ID"
              : "1234567890:AAHxxxxxxxxxxxxxxxx"
          }
          className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-xs font-mono"
        />
      </label>

      <label className="block text-xs font-bold text-brown-soft">
        Chat ID เจ้าของ (รับแจ้งเตือนจอง)
        <input
          type="text"
          value={ownerChatIds}
          onChange={(e) => setOwnerChatIds(e.target.value)}
          placeholder="เช่น 123456789"
          className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-xs"
        />
        <span className="mt-1 block text-[10px] font-normal">
          ทักบอทของร้านใน Telegram แล้วพิมพ์ <code>/start</code> บอทจะตอบเลข Chat ID มาให้
          · ถ้าให้หลายคนรับแจ้งเตือน ใส่คั่นด้วย comma เช่น 123456789,987654321
        </span>
      </label>

      <label className="block text-xs font-bold text-brown-soft">
        URL เว็บ (สำหรับ webhook)
        <input
          type="url"
          value={appUrl}
          onChange={(e) => setAppUrl(e.target.value)}
          placeholder="https://ชื่อร้าน.vercel.app"
          className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-xs"
        />
      </label>

      <button
        type="button"
        disabled={saving || (!botToken.trim() && !status?.configured)}
        onClick={save}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-petflow-chocolate text-sm font-extrabold text-card disabled:opacity-50"
      >
        {saving
          ? "กำลังตั้งบอท…"
          : status?.configured && !botToken.trim()
            ? "บันทึก Chat ID"
            : "บันทึกและเปิดใช้บอท"}
      </button>
    </section>
  );
}
