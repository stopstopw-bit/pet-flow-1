"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExportSheetsButton } from "@/components/ExportSheetsButton";
import { Icon } from "@/components/Icon";
import { EmptyState, Segmented } from "@/components/ui";

type Rec = {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string;
  date: string;
  customerName?: string;
  catName?: string;
  displayTitle: string;
  receiptUrl?: string;
};

const THAI_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TaxPage() {
  const nowYear = new Date().getFullYear();
  const [year, setYear] = useState(nowYear);
  const [records, setRecords] = useState<Rec[]>([]);
  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopTaxId, setShopTaxId] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [view, setView] = useState<"summary" | "ledger">("summary");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance?from=${year}-01-01&to=${year}-12-31`);
      const d = await res.json();
      // รายการที่ติ๊ก "ไม่นับเป็นรายได้" (ยอดยกมาจากระบบเก่า) ไม่ควรอยู่ในเอกสารภาษี
      setRecords((d.records || []).filter((r: { excluded?: boolean }) => !r.excluded));
    } catch {
      /* โหลดไม่ได้ = โชว์ว่าง */
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        const b = d.config?.business;
        if (b?.name) setShopName(b.name);
        if (b?.location?.th) setShopAddress(b.location.th);
        if (b?.taxId) setShopTaxId(b.taxId);
        if (b?.phones?.length) setShopPhone(b.phones[0]);
      })
      .catch(() => {});
  }, []);

  const totals = useMemo(() => {
    const income = records.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
    const expense = records.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);
    return { income, expense, net: income - expense };
  }, [records]);

  // แยกยอดรายเดือน — รายรับ/รายจ่าย/สุทธิ ทีละเดือน
  const monthly = useMemo(() => {
    const rows = THAI_MONTHS.map((label, i) => ({ label, month: i + 1, income: 0, expense: 0 }));
    for (const r of records) {
      const m = Number(r.date.slice(5, 7)) - 1;
      if (m < 0 || m > 11) continue;
      if (r.type === "income") rows[m].income += r.amount;
      else rows[m].expense += r.amount;
    }
    return rows;
  }, [records]);

  // แยกรายรับตามหมวด — ไว้ดูว่ารายได้มาจากอะไรบ้าง
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of records) {
      if (r.type !== "income") continue;
      const key = r.category?.trim() || "อื่นๆ";
      map.set(key, (map.get(key) || 0) + r.amount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [records]);

  const ledger = useMemo(
    () => [...records].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    [records]
  );

  const years = useMemo(() => {
    const set = new Set<number>([nowYear]);
    for (const r of records) set.add(Number(r.date.slice(0, 4)));
    // เผื่อปีที่แล้วไว้ให้เลือกเสมอ
    set.add(nowYear - 1);
    return [...set].filter((y) => y > 2000).sort((a, b) => b - a);
  }, [records, nowYear]);

  return (
    <div>
      {/* แถบเครื่องมือ — ซ่อนตอนพิมพ์ */}
      <div className="mb-4 print:hidden">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Tax documents</p>
        <h1 className="text-xl font-extrabold text-petflow-chocolate">เอกสารรายได้ / ภาษี</h1>
        <div className="mt-3 flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="ปี"
            className="h-10 shrink-0 rounded-full border border-petflow-line bg-card px-4 text-sm font-bold text-brown"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                ปี {y}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-petflow-chocolate px-4 text-sm font-bold text-card shadow-petflow-sm"
          >
            <Icon name="download" size={18} />
            พิมพ์ / บันทึก PDF
          </button>
        </div>
      </div>

      <Segmented
        value={view}
        onChange={setView}
        className="mb-4 print:hidden"
        options={[
          { id: "summary", label: "สรุปรายเดือน", icon: "chart" },
          { id: "ledger", label: "บัญชีรายวัน", icon: "doc" },
        ]}
      />

      {/* เอกสาร — โชว์บนจอและตอนพิมพ์ */}
      <div className="rounded-petflow bg-card p-5 text-brown shadow-petflow-sm print:rounded-none print:p-0 print:shadow-none">
        {/* หัวเอกสารทางการ */}
        <div className="mb-4 border-b border-petflow-line pb-3 text-center">
          <p className="text-base font-extrabold text-petflow-chocolate">{shopName}</p>
          {shopAddress && <p className="text-[11px] text-brown-soft">{shopAddress}</p>}
          <p className="text-[11px] text-brown-soft">
            {shopTaxId && `เลขประจำตัวผู้เสียภาษี: ${shopTaxId}`}
            {shopTaxId && shopPhone && " · "}
            {shopPhone && `โทร. ${shopPhone}`}
          </p>
          <p className="mt-1.5 text-sm font-bold">
            {view === "summary"
              ? "รายงานสรุปรายรับ-รายจ่าย"
              : "บัญชีรายรับ-รายจ่าย (รายวัน)"}
          </p>
          <p className="text-xs text-brown-soft">
            ประจำปี {year}
          </p>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-brown-soft">กำลังโหลด…</p>
        ) : records.length === 0 ? (
          <EmptyState icon="receipt" title="ปีนี้ยังไม่มีรายการในบัญชี" />
        ) : view === "summary" ? (
          <>
            {/* ยอดรวมทั้งปี */}
            <div className="mb-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-petflow-sm bg-sage/15 p-3">
                <p className="text-[11px] text-brown-soft">รายรับรวม</p>
                <p className="text-sm font-extrabold text-ok">{baht(totals.income)}</p>
              </div>
              <div className="rounded-petflow-sm bg-honey/20 p-3">
                <p className="text-[11px] text-brown-soft">รายจ่ายรวม</p>
                <p className="text-sm font-extrabold text-wait">{baht(totals.expense)}</p>
              </div>
              <div className="rounded-petflow-sm bg-latte/15 p-3">
                <p className="text-[11px] text-brown-soft">กำไรสุทธิ</p>
                <p className="text-sm font-extrabold text-latte-deep">{baht(totals.net)}</p>
              </div>
            </div>

            {/* ตารางรายเดือน */}
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-y border-petflow-line text-brown-soft">
                  <th className="py-2 text-left font-bold">เดือน</th>
                  <th className="py-2 text-right font-bold">รายรับ</th>
                  <th className="py-2 text-right font-bold">รายจ่าย</th>
                  <th className="py-2 text-right font-bold">สุทธิ</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => {
                  const empty = m.income === 0 && m.expense === 0;
                  return (
                    <tr
                      key={m.month}
                      className={`border-b border-petflow-line/60 ${empty ? "text-brown-faint" : ""}`}
                    >
                      <td className="py-1.5">{m.label}</td>
                      <td className="py-1.5 text-right">{m.income ? baht(m.income) : "-"}</td>
                      <td className="py-1.5 text-right">{m.expense ? baht(m.expense) : "-"}</td>
                      <td className="py-1.5 text-right font-bold">
                        {empty ? "-" : baht(m.income - m.expense)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-petflow-chocolate font-extrabold text-petflow-chocolate">
                  <td className="py-2">รวมทั้งปี</td>
                  <td className="py-2 text-right">{baht(totals.income)}</td>
                  <td className="py-2 text-right">{baht(totals.expense)}</td>
                  <td className="py-2 text-right">{baht(totals.net)}</td>
                </tr>
              </tfoot>
            </table>

            {/* รายรับแยกตามหมวด */}
            {byCategory.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-sm font-bold text-petflow-chocolate">รายรับแยกตามหมวด</p>
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {byCategory.map(([cat, amt]) => (
                      <tr key={cat} className="border-b border-petflow-line/60">
                        <td className="py-1.5">{cat}</td>
                        <td className="py-1.5 text-right">{baht(amt)}</td>
                        <td className="w-16 py-1.5 text-right text-brown-faint">
                          {totals.income ? Math.round((amt / totals.income) * 100) : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          /* บัญชีรายวัน (ledger) — เรียงตามวันที่ มีเลขที่รายการ + ยอดสะสม */
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-y border-petflow-line text-brown-soft">
                <th className="py-2 text-left font-bold">ลำดับ</th>
                <th className="py-2 text-left font-bold">วันที่</th>
                <th className="py-2 text-left font-bold">รายการ</th>
                <th className="py-2 text-right font-bold">รายรับ</th>
                <th className="py-2 text-right font-bold">รายจ่าย</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((r, i) => (
                <tr key={r.id} className="border-b border-petflow-line/60 align-top">
                  <td className="py-1.5 pr-2 text-brown-faint">{i + 1}</td>
                  <td className="whitespace-nowrap py-1.5 pr-2">{r.date}</td>
                  <td className="py-1.5 pr-2">
                    {r.displayTitle}
                    {/* โชว์หมวดต่อท้ายเฉพาะตอนที่ไม่ซ้ำกับชื่อรายการอยู่แล้ว — กันบรรทัดซ้ำ */}
                    {r.category && !r.displayTitle.includes(r.category) && (
                      <span className="block text-brown-faint">หมวด: {r.category}</span>
                    )}
                    <span className="mt-0.5 flex flex-wrap gap-3 print:hidden">
                      <a
                        href={`/admin/voucher/${r.id}`}
                        className="inline-flex items-center gap-1 py-1 text-[10px] font-bold text-latte-deep"
                      >
                        <Icon name="doc" size={12} />
                        ใบสำคัญ
                      </a>
                      {r.receiptUrl && (
                        <a
                          href={r.receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 py-1 text-[10px] font-bold text-latte-deep"
                        >
                          <Icon name="receipt" size={12} />
                          ดูรูปบิล
                        </a>
                      )}
                    </span>
                  </td>
                  <td className="py-1.5 text-right text-ok">
                    {r.type === "income" ? baht(r.amount) : "-"}
                  </td>
                  <td className="py-1.5 text-right text-wait">
                    {r.type === "expense" ? baht(r.amount) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-petflow-chocolate font-extrabold text-petflow-chocolate">
                <td className="py-2" colSpan={3}>
                  รวมทั้งปี ({ledger.length} รายการ)
                </td>
                <td className="py-2 text-right">{baht(totals.income)}</td>
                <td className="py-2 text-right">{baht(totals.expense)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        {/* ท้ายเอกสาร — ช่องเซ็นชื่อ (ไว้ให้บัญชี/ผู้จัดทำ) + วันที่ออกเอกสาร */}
        {!loading && records.length > 0 && (
          <>
            <div className="mt-8 hidden grid-cols-2 gap-8 text-center text-[11px] text-brown-soft print:grid">
              <div>
                <div className="mx-auto mb-1 w-40 border-b border-dashed border-petflow-line" />
                ผู้จัดทำ / เจ้าของกิจการ
              </div>
              <div>
                <div className="mx-auto mb-1 w-40 border-b border-dashed border-petflow-line" />
                ผู้ตรวจสอบ / ผู้ทำบัญชี
              </div>
            </div>
            <p className="mt-6 text-right text-[10px] text-brown-faint">
              เอกสารสร้างจากระบบ {shopName} · ยอดสุทธิทั้งปี {baht(totals.net)} บาท
            </p>
          </>
        )}
      </div>

      {/* ส่งออกเข้า Google Sheet — แท็บ "รายรับรายจ่าย" มีคอลัมน์เดือน + ลิงก์รูปบิลให้ด้วย */}
      <div className="mt-4 rounded-petflow bg-card p-4 shadow-petflow-sm print:hidden">
        <ExportSheetsButton />
        <p className="mt-2 text-[11px] text-brown-faint">
          “พิมพ์ / บันทึก PDF” = ออกเอกสารยื่นภาษี/ส่งบัญชี · “ส่งออก Google Sheets” =
          ยกทุกรายการเข้าชีต (แท็บรายรับรายจ่าย มีคอลัมน์เดือนไว้สรุป + ลิงก์รูปบิลกดเปิดได้)
        </p>
      </div>
    </div>
  );
}
