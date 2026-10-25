"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { adminJson } from "@/lib/admin-fetch";

type Health = {
  db: {
    connected: boolean;
    tablesReady: boolean;
    missingTables: string[];
    message?: string;
  } | null;
  line: {
    token: boolean;
    liff: boolean;
    webhook: { url: string; active: boolean; matchesShop: boolean } | null;
    expectedWebhook: string;
  };
  google: boolean;
  telegram: boolean;
  shop: {
    nameFilled: boolean;
    nameIsDefault: boolean;
    bankFilled: boolean;
  };
};

type Level = "ok" | "warn" | "fail";

type Row = {
  level: Level;
  label: string;
  hint?: string;
  href?: string;
};

const ICONS: Record<Level, string> = { ok: "check", warn: "clock", fail: "alert" };
const ICON_TONE: Record<Level, string> = {
  ok: "bg-ok/15 text-ok",
  warn: "bg-honey/30 text-petflow-chocolate",
  fail: "bg-red-100 text-red-700",
};

function buildRows(h: Health): { rows: Row[]; failCount: number } {
  const rows: Row[] = [];

  // ---- ฐานข้อมูล (จำเป็น) ----
  if (!h.db) {
    rows.push({ level: "fail", label: "ฐานข้อมูล — ตรวจไม่ได้", hint: "รีเฟรชหน้านี้ ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ PetFlow" });
  } else if (h.db.connected && h.db.tablesReady) {
    rows.push({ level: "ok", label: "ฐานข้อมูล (Supabase) เชื่อมต่อ + ตารางครบ" });
  } else if (!h.db.connected) {
    rows.push({
      level: "fail",
      label: "ฐานข้อมูลยังไม่เชื่อมต่อ — ข้อมูลยังอยู่ แค่แอปชี้ไม่ถูกที่",
      hint: h.db.message || "แจ้งผู้ดูแลระบบ PetFlow",
    });
  } else {
    rows.push({
      level: "fail",
      label: `ตารางฐานข้อมูลไม่ครบ (ขาด ${h.db.missingTables.length}: ${h.db.missingTables.join(", ")})`,
      hint: "แจ้งผู้ดูแลระบบ PetFlow ให้กด “สร้างตารางอัตโนมัติ”",
    });
  }

  // ---- LINE ----
  rows.push(
    h.line.token
      ? { level: "ok", label: "LINE Token — พร้อมส่งการ์ด/ใบเสร็จ" }
      : {
          level: "warn",
          label: "LINE Token ยังไม่ตั้ง",
          hint: "ส่งการ์ด/ใบเสร็จเข้า LINE ลูกค้าไม่ได้ — ตั้งที่การ์ด LINE Messaging ด้านล่าง",
        }
  );
  rows.push(
    h.line.liff
      ? { level: "ok", label: "LINE LIFF — ลูกค้าเปิดแอปจาก LINE ได้" }
      : {
          level: "warn",
          label: "LIFF ยังไม่ตั้ง",
          hint: "ลูกค้าเปิดแอป/สมัครสมาชิกจาก LINE ไม่ได้ — ตั้งที่การ์ด LINE LIFF ด้านล่าง",
        }
  );
  if (h.line.webhook) {
    if (h.line.webhook.active && h.line.webhook.matchesShop) {
      rows.push({ level: "ok", label: "LINE Webhook — เชื่อมแล้ว ชี้มาที่ร้านนี้" });
    } else if (!h.line.webhook.url) {
      rows.push({
        level: "warn",
        label: "ยังไม่ได้ตั้ง LINE Webhook",
        hint: "กดปุ่ม “ตั้ง Webhook อัตโนมัติ” ในการ์ด LINE Messaging",
      });
    } else if (h.line.webhook.matchesShop) {
      // URL ถูกแล้ว แต่สวิตช์ "Use webhook" ใน LINE ยังปิด — LINE ไม่มี API ให้เปิดสวิตช์นี้ กดปุ่มซ้ำไม่ช่วย
      rows.push({
        level: "fail",
        label: "LINE Webhook ปิดอยู่ (URL ถูกแล้ว)",
        hint: "เปิดสวิตช์ “Use webhook” ใน LINE Developers → แชนแนลของร้าน → แท็บ Messaging API (หรือ LINE OA Manager → ตั้งค่า → การตอบกลับ → Webhook) แล้วกดตรวจใหม่",
      });
    } else {
      rows.push({
        level: "fail",
        label: "LINE Webhook ชี้ไปที่อื่น (ไม่ใช่ร้านนี้)",
        hint: `ตอนนี้ชี้ไป ${h.line.webhook.url || "—"} ควรเป็น ${h.line.expectedWebhook} — กด “ตั้ง Webhook อัตโนมัติ” อีกครั้งเพื่อแก้`,
      });
    }
  }

  // ---- ข้อมูลร้าน ----
  if (!h.shop.nameFilled) {
    rows.push({ level: "warn", label: "ยังไม่ได้ตั้งชื่อร้าน", hint: "การ์ดที่ส่งหาลูกค้าจะไม่มีชื่อร้าน", href: "/admin/settings" });
  } else if (h.shop.nameIsDefault) {
    rows.push({
      level: "warn",
      label: "ชื่อร้านยังเป็นค่าเริ่มต้น (PetFlow)",
      hint: "ตั้งชื่อร้านของคุณใน ตั้งค่า ก่อนส่งการ์ดหาลูกค้า",
      href: "/admin/settings",
    });
  } else {
    rows.push({ level: "ok", label: "ตั้งชื่อร้านแล้ว" });
  }
  rows.push(
    h.shop.bankFilled
      ? { level: "ok", label: "บัญชีธนาคารครบ (ขึ้นบนการ์ดมัดจำ/ชำระเงิน)" }
      : { level: "warn", label: "บัญชีธนาคารยังไม่ครบ", hint: "ชื่อ/เลขบัญชียังว่างหรือเป็นค่าตัวอย่าง — กรอกใน ตั้งค่า", href: "/admin/settings" }
  );

  // ---- เสริม ----
  rows.push(
    h.google
      ? { level: "ok", label: "Google Calendar + Sheets เชื่อมแล้ว" }
      : { level: "warn", label: "Google ยังไม่เชื่อม (ข้ามได้)", hint: "จองไม่ขึ้นปฏิทิน / ส่งออกชีตไม่ได้ จนกว่าจะตั้ง" }
  );
  rows.push(
    h.telegram
      ? { level: "ok", label: "Telegram แจ้งเตือนเจ้าของ เชื่อมแล้ว" }
      : { level: "warn", label: "Telegram ยังไม่เชื่อม (ข้ามได้)", hint: "จะไม่มีแจ้งเตือนจองใหม่/คนแอด LINE เข้ามือถือเจ้าของ" }
  );

  return { rows, failCount: rows.filter((r) => r.level === "fail").length };
}

export function HealthCheckSection() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminJson<Health>("/api/setup/health");
      setHealth(result.ok ? result.data : null);
    } catch {
      setHealth(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <section className="mb-4 rounded-petflow bg-card p-4 shadow-petflow-sm">
        <p className="flex items-center gap-2 text-xs text-brown-soft">
          <Icon name="clock" size={16} />
          กำลังตรวจความพร้อมร้าน…
        </p>
      </section>
    );
  }
  if (!health) {
    return (
      <section className="mb-4 rounded-petflow bg-card p-4 shadow-petflow-sm">
        <p className="text-xs font-bold text-wait">ตรวจความพร้อมร้านไม่สำเร็จ — รีเฟรชหน้านี้อีกครั้ง</p>
      </section>
    );
  }

  const { rows, failCount } = buildRows(health);
  const okCount = rows.filter((r) => r.level === "ok").length;

  return (
    <section
      className={`mb-4 space-y-3 rounded-petflow border p-4 shadow-petflow-sm ${
        failCount ? "border-red-200 bg-red-50/50" : "border-sage/40 bg-sage/10"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            failCount ? "bg-red-100 text-red-700" : "bg-ok/15 text-ok"
          }`}
        >
          <Icon name={failCount ? "alert" : "check"} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Health check</p>
          <h2 className="text-sm font-extrabold text-petflow-chocolate">ตรวจความพร้อมร้าน</h2>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
            failCount ? "bg-red-100 text-red-700" : "bg-ok/15 text-ok"
          }`}
        >
          {failCount ? `ต้องแก้ ${failCount} จุด` : `พร้อม ${okCount}/${rows.length}`}
        </span>
        <button
          type="button"
          onClick={load}
          aria-label="ตรวจอีกครั้ง"
          title="ตรวจอีกครั้ง"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-brown shadow-petflow-sm"
        >
          <Icon name="clock" size={18} />
        </button>
      </div>

      <ul className="divide-y divide-petflow-line overflow-hidden rounded-petflow-sm border border-petflow-line bg-card">
        {rows.map((r) => (
          <li key={r.label} className="flex items-start gap-3 px-3 py-2.5">
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${ICON_TONE[r.level]}`}
            >
              <Icon name={ICONS[r.level]} size={13} strokeWidth={2.4} />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`block text-xs ${
                  r.level === "fail" ? "font-bold text-red-700" : r.level === "ok" ? "text-brown" : "font-bold text-brown"
                }`}
              >
                {r.label}
              </span>
              {r.hint && <span className="mt-0.5 block text-[11px] leading-relaxed text-brown-soft">{r.hint}</span>}
              {r.href && (
                <a
                  href={r.href}
                  className="mt-1 inline-flex min-h-[32px] items-center gap-1 text-[11px] font-bold text-latte-deep"
                >
                  เปิดหน้า
                  <Icon name="chevron" size={13} />
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
