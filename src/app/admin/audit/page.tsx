"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/ui";

type Row = {
  id: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  detail?: Record<string, unknown>;
  createdAt: string;
};

/** ชื่อไทยของแต่ละการกระทำ — ให้อ่านออกโดยไม่ต้องรู้ชื่อ action ในโค้ด */
const ACTION_LABEL: Record<string, string> = {
  mark_paid: "รับเงิน / ปิดบิล",
  delete_invoice: "ลบบิล",
  add_points: "เพิ่มแต้ม",
  reduce_points: "ลดแต้ม",
  delete_points_history: "ลบประวัติแต้ม",
  exclude_finance: "ตั้งไม่นับเป็นรายได้",
  include_finance: "กลับมานับเป็นรายได้",
  send_birthday_greetings: "ส่งการ์ดวันเกิด",
};

/** ไอคอนเส้นของแต่ละการกระทำ */
const ACTION_ICON: Record<string, string> = {
  mark_paid: "money",
  delete_invoice: "trash",
  add_points: "star",
  reduce_points: "star",
  delete_points_history: "trash",
  exclude_finance: "x",
  include_finance: "check",
  send_birthday_greetings: "cake",
};

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", calendar: "gregory" })} ${d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.`;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [actor, setActor] = useState("");

  useEffect(() => {
    fetch("/api/audit?limit=300")
      .then((r) => r.json())
      .then((d) => setLogs(d.logs || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  const actors = useMemo(
    () => [...new Set(logs.map((l) => l.actor).filter(Boolean))].sort(),
    [logs]
  );
  const shown = actor ? logs.filter((l) => l.actor === actor) : logs;

  if (loading) {
    return <p className="py-10 text-center text-sm text-brown-soft">กำลังโหลด…</p>;
  }

  return (
    <div className="space-y-4 pb-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Audit log</p>
        <h1 className="text-xl font-extrabold text-petflow-chocolate">ประวัติการใช้งาน</h1>
        <p className="mt-0.5 text-xs text-brown-soft">
          บันทึกเฉพาะการกระทำที่กระทบเงินและสิทธิ์ลูกค้า — ไว้ไล่ย้อนตอนยอดไม่ตรง
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-petflow bg-card shadow-petflow-sm">
          <EmptyState
            icon="clock"
            title="ยังไม่มีบันทึก"
            sub="ถ้าเพิ่งอัปเดต ให้กด “อัปเดตฐานข้อมูล” ที่ ตั้งค่า → ขั้นสูง หนึ่งครั้งก่อน แล้วระบบจะเริ่มเก็บให้เอง"
          />
        </div>
      ) : (
        <>
          {actors.length > 1 && (
            <select
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              aria-label="กรองตามผู้ใช้"
              className="h-10 w-full rounded-full border border-petflow-line bg-card px-4 text-sm font-bold text-brown"
            >
              <option value="">ทุกคน ({logs.length})</option>
              {actors.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          )}

          <ul className="divide-y divide-petflow-line rounded-petflow bg-card shadow-petflow-sm">
            {shown.map((l) => (
              <li key={l.id} className="flex items-start gap-3 px-4 py-3 text-xs">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
                  <Icon name={ACTION_ICON[l.action] || "doc"} size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="text-sm font-extrabold text-petflow-chocolate">
                      {ACTION_LABEL[l.action] || l.action}
                    </span>
                    <span className="text-[10px] text-brown-faint">{when(l.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 break-words text-[11px] text-brown-soft">
                    {l.actor || "ไม่ทราบ"}
                    {l.resourceId ? ` · ${l.resourceType} ${l.resourceId}` : ` · ${l.resourceType}`}
                  </p>
                  {l.detail && Object.keys(l.detail).length > 0 && (
                    <p className="mt-1.5 break-words rounded-petflow-sm bg-paper px-2.5 py-1.5 text-[10px] text-brown">
                      {Object.entries(l.detail)
                        .filter(([, v]) => v !== undefined && v !== null && v !== "")
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-center text-[10px] text-brown-faint">
            แสดง {shown.length} รายการล่าสุด
          </p>
        </>
      )}
    </div>
  );
}
