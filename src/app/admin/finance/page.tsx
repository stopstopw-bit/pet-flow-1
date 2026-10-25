"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { resolveRange, inRange, type RangeId } from "@/lib/date-range";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExportSheetsButton } from "@/components/ExportSheetsButton";
import { toJpegDataUrl } from "@/lib/image-convert";
import { toast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { EmptyState, MoreMenu, SectionLabel, Segmented } from "@/components/ui";

type Record = {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string;
  date: string;
  customerId?: string;
  customerName?: string;
  catName?: string;
  displayTitle: string;
  receiptUrl?: string;
  /** ไม่นับเป็นรายรับ/รายจ่ายของกิจการ (ยอดยกมาจากระบบเก่า ฯลฯ) */
  excluded?: boolean;
};

const TODAY = () => new Date().toISOString().slice(0, 10);
const EMPTY_FORM = { type: "income", amount: "", category: "", description: "", date: TODAY() };

export default function FinancePage() {
  const [records, setRecords] = useState<Record[]>([]);
  /** ช่วงเวลาที่กำลังดู — ยอดสรุปและรายการคิดจากช่วงนี้เท่านั้น */
  const [rangeId, setRangeId] = useState<RangeId>("month");
  const [customRange, setCustomRange] = useState({ from: TODAY(), to: TODAY() });
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState("");
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [busyReceipt, setBusyReceipt] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const router = useRouter();

  /** ติ๊กว่ารายการนี้ไม่ใช่รายได้ของกิจการ (ยอดยกมาจากระบบเก่า ฯลฯ) */
  const toggleExcluded = async (id: string, excluded: boolean) => {
    const res = await fetch("/api/finance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "set_excluded", excluded }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.needSql) {
      alert("ยังใช้ไม่ได้ — ไปที่ ตั้งค่า > ขั้นสูง แล้วกด 'อัปเดตฐานข้อมูล' ครั้งเดียวก่อนนะคะ");
      return;
    }
    load();
  };

  const load = useCallback(async () => {
    // ดึงทั้งหมดครั้งเดียวแล้วกรองในหน้า — ยอดสรุปกับรายการจะตรงกันเสมอ
    // (เมื่อก่อนยอดสรุปมาจาก API คนละรอบกับรายการ มีโอกาสไม่ตรงกัน)
    const list = await fetch("/api/finance");
    const listData = await list.json();
    setRecords(listData.records || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const range = useMemo(
    () => resolveRange(rangeId, TODAY(), customRange),
    [rangeId, customRange]
  );
  const shown = useMemo(
    () => records.filter((r) => inRange(r.date, range)),
    [records, range]
  );
  const summary = useMemo(() => {
    // รายการที่ติ๊ก "ไม่นับเป็นรายได้" ยังโชว์ในลิสต์ แต่ไม่เข้ายอดสรุป
    const counted = shown.filter((r) => !r.excluded);
    const income = counted.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
    const expense = counted.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);
    return { income, expense, net: income - expense };
  }, [shown]);

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, date: TODAY() });
    setEditingId(null);
    setReceipt("");
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const payload = {
      type: form.type,
      amount: Number(form.amount),
      category: form.category,
      description: form.description,
      date: form.date || TODAY(),
      // ส่ง receipt เฉพาะตอนแนบใหม่ (data URL) — ตอนแก้ไขไม่แนบใหม่ก็ไม่แตะรูปเดิม
      ...(receipt.startsWith("data:") ? { receipt } : {}),
    };
    if (editingId) {
      await fetch("/api/finance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...payload }),
      });
    } else {
      await fetch("/api/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    resetForm();
    load();
  };

  const startEdit = (r: Record) => {
    setEditingId(r.id);
    setForm({
      type: r.type,
      amount: String(r.amount),
      category: r.category || "",
      description: r.description || "",
      date: r.date,
    });
    setReceipt(r.receiptUrl || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** เลือกรูปบิล — ย่อก่อนเสมอ กันไฟล์ใหญ่เปลืองที่ */
  const pickReceipt = async (file: File) => {
    setBusyReceipt(true);
    try {
      setReceipt(await toJpegDataUrl(file, 1400));
    } catch {
      toast("อ่านรูปไม่ได้ ลองรูปอื่นนะคะ", "error");
    } finally {
      setBusyReceipt(false);
    }
  };

  /** แนบ/เปลี่ยนรูปบิลของรายการที่มีอยู่แล้ว (จากแถวที่กางอยู่) */
  const attachToRow = async (id: string, file: File) => {
    setBusyReceipt(true);
    try {
      const dataUrl = await toJpegDataUrl(file, 1400);
      await fetch("/api/finance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, receipt: dataUrl }),
      });
      load();
    } catch {
      toast("แนบรูปไม่สำเร็จ", "error");
    } finally {
      setBusyReceipt(false);
    }
  };

  const del = async (id: string, title: string) => {
    if (!confirm(`ลบรายการ "${title}"?\nกู้คืนไม่ได้ (ยอดรวมจะปรับตามทันที)`)) return;
    await fetch(`/api/finance?id=${id}`, { method: "DELETE" });
    if (editingId === id) resetForm();
    load();
  };

  const field = "w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm";
  const openNew = () => {
    resetForm();
    setFormOpen(true);
  };
  const closeForm = () => {
    resetForm();
    setFormOpen(false);
  };

  return (
    <div className="pb-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Finance</p>
          <h1 className="text-xl font-extrabold text-petflow-chocolate">รายรับ-รายจ่าย</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <MoreMenu
            items={[
              { label: "เอกสารภาษี", icon: "doc", onClick: () => router.push("/admin/tax") },
              {
                label: showExport ? "ซ่อนส่งออก Google Sheets" : "ส่งออก Google Sheets",
                icon: "download",
                onClick: () => setShowExport((v) => !v),
              },
            ]}
          />
          <button
            type="button"
            onClick={openNew}
            className="flex h-10 items-center gap-1.5 rounded-full bg-petflow-chocolate px-4 text-sm font-bold text-card shadow-petflow-sm"
          >
            <Icon name="plus" size={18} />
            เพิ่ม
          </button>
        </div>
      </div>

      {showExport && (
        <div className="mb-4 rounded-petflow bg-card p-4 shadow-petflow-sm">
          <ExportSheetsButton />
        </div>
      )}

      <DateRangePicker
        className="mb-3"
        value={rangeId}
        onChange={setRangeId}
        custom={customRange}
        onCustomChange={setCustomRange}
      />

      <div className="mb-4 rounded-petflow bg-card p-4 shadow-petflow-sm">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold text-brown-soft">สุทธิ · {range.label}</p>
            <p className={`text-2xl font-extrabold ${summary.net < 0 ? "text-wait" : "text-petflow-chocolate"}`}>
              {summary.net.toLocaleString()} ฿
            </p>
          </div>
          <p className="text-[11px] text-brown-faint">{shown.length} รายการ</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-petflow-sm bg-sage/15 px-3 py-2">
            <p className="text-[11px] text-brown-soft">รายรับ</p>
            <p className="font-extrabold text-ok">+{summary.income.toLocaleString()}</p>
          </div>
          <div className="rounded-petflow-sm bg-honey/20 px-3 py-2">
            <p className="text-[11px] text-brown-soft">รายจ่าย</p>
            <p className="font-extrabold text-wait">-{summary.expense.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <form
            onSubmit={async (e) => {
              await submit(e);
              setFormOpen(false);
            }}
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-petflow bg-card shadow-petflow sm:rounded-petflow"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-petflow-line bg-card px-5 py-3">
              <h2 className="text-base font-extrabold text-petflow-chocolate">
                {editingId ? "แก้ไขรายการ" : "เพิ่มรายการ"}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                aria-label="ปิด"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-brown"
              >
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <Segmented
                value={form.type as "income" | "expense"}
                onChange={(v) => setForm({ ...form, type: v })}
                options={[
                  { id: "income", label: "รายรับ" },
                  { id: "expense", label: "รายจ่าย" },
                ]}
              />
              <input
                type="number"
                required
                inputMode="decimal"
                placeholder="จำนวนเงิน"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className={`${field} text-base font-bold`}
              />
              <input
                placeholder="หมวด เช่น อาหารสัตว์, ค่าเช่า"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={field}
              />
              <input
                placeholder="รายละเอียด"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={field}
              />
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={field}
              />

              {/* แนบรูปบิล/ใบเสร็จ — ไว้เป็นหลักฐานตอนยื่นภาษี (ย่อรูปให้อัตโนมัติ) */}
              <label className="flex cursor-pointer items-center gap-3 rounded-petflow-sm border border-dashed border-petflow-line bg-paper px-3 py-2.5">
                {receipt ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={receipt} alt="บิล" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-card text-brown-soft">
                    <Icon name="receipt" size={20} />
                  </span>
                )}
                <span className="min-w-0 flex-1 text-xs font-bold text-brown">
                  {busyReceipt ? "กำลังย่อรูป…" : receipt ? "เปลี่ยนรูปบิล/ใบเสร็จ" : "แนบรูปบิล/ใบเสร็จ (ถ้ามี)"}
                  <span className="block text-[11px] font-normal text-brown-faint">เก็บไว้เป็นหลักฐานยื่นภาษี</span>
                </span>
                {receipt && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setReceipt("");
                    }}
                    aria-label="เอารูปออก"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-wait"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) pickReceipt(f);
                  }}
                />
              </label>
            </div>
            <div className="sticky bottom-0 flex gap-2 border-t border-petflow-line bg-card px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={closeForm} className="h-11 flex-1 rounded-full bg-paper text-sm font-bold text-brown-soft">
                ยกเลิก
              </button>
              <button type="submit" className="h-11 flex-[2] rounded-full bg-petflow-chocolate text-sm font-extrabold text-card">
                {editingId ? "บันทึกการแก้ไข" : "บันทึก"}
              </button>
            </div>
          </form>
        </div>
      )}

      <SectionLabel>Transactions · รายการ</SectionLabel>
      {shown.length === 0 ? (
        <div className="rounded-petflow bg-card shadow-petflow-sm">
          <EmptyState icon="receipt" title="ไม่มีรายการในช่วงนี้" sub="ลองเลือกช่วงเวลาอื่น หรือกด “เพิ่ม”" />
        </div>
      ) : (
        <ul className="divide-y divide-petflow-line rounded-petflow bg-card shadow-petflow-sm">
          {shown.map((r) => {
            const open = openId === r.id;
            // ชื่อย่อ — โชว์แค่แมว·เจ้าของ (หรือหมวด) ให้แถวสั้น กดค่อยกางดูรายละเอียดเต็ม
            const compact = r.customerName
              ? `${r.catName ? `${r.catName} · ` : ""}${r.customerName}`
              : r.category || r.displayTitle;
            const income = r.type === "income";
            return (
              <li key={r.id} className={`text-xs ${r.excluded ? "opacity-60" : ""}`}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : r.id)}
                  className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left"
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      income ? "bg-sage/25 text-ok" : "bg-honey/30 text-wait"
                    }`}
                  >
                    <Icon name={r.customerName ? (r.catName ? "paw" : "user") : income ? "wallet" : "bag"} size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className="truncate text-sm font-bold text-brown">{compact}</span>
                      {r.receiptUrl && <Icon name="receipt" size={13} className="text-brown-faint" />}
                    </span>
                    <span className="block truncate text-[11px] text-brown-faint">
                      {r.date}
                      {r.excluded ? " · ไม่นับเป็นรายได้" : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 text-sm font-extrabold ${income ? "text-ok" : "text-wait"}`}>
                    {income ? "+" : "-"}
                    {r.amount.toLocaleString()}
                  </span>
                </button>

                {open && (
                  <div className="bg-paper/50 px-4 pb-3 pt-2">
                    <p className="font-bold text-brown">{r.displayTitle}</p>
                    <p className="mt-0.5 text-brown-faint">
                      {r.date} · หมวด: {r.category || "-"}
                    </p>
                    {r.customerId && (
                      <Link
                        href={`/admin/customers?id=${r.customerId}`}
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-latte-deep"
                      >
                        <Icon name="user" size={13} />
                        {r.customerName || "ดูลูกค้า"}
                      </Link>
                    )}

                    <div className="mt-3 flex items-center gap-2">
                      {/* รูปบิล/ใบเสร็จ — แตะดูเต็มจอ หรือแนบถ้ายังไม่มี */}
                      {r.receiptUrl ? (
                        <button
                          type="button"
                          onClick={() => setZoomUrl(r.receiptUrl!)}
                          className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-card px-1.5 pr-3 text-[11px] font-bold text-ok"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={r.receiptUrl} alt="บิล" className="h-7 w-7 rounded-full object-cover" />
                          ดูรูปบิล
                        </button>
                      ) : (
                        <label className="flex h-10 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-card text-[11px] font-bold text-brown">
                          <Icon name="link" size={14} />
                          {busyReceipt ? "กำลังแนบ…" : "แนบรูปบิล"}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f) attachToRow(r.id, f);
                            }}
                          />
                        </label>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          startEdit(r);
                          setFormOpen(true);
                        }}
                        className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-petflow-chocolate text-[11px] font-bold text-card"
                      >
                        <Icon name="edit" size={14} />
                        แก้ไข
                      </button>
                      <MoreMenu
                        items={[
                          {
                            label: income ? "ใบสำคัญรับ" : "ใบสำคัญจ่าย",
                            icon: "doc",
                            onClick: () => router.push(`/admin/voucher/${r.id}`),
                          },
                          {
                            label: r.excluded ? "นับเป็นรายได้" : "ไม่นับเป็นรายได้",
                            icon: r.excluded ? "check" : "x",
                            onClick: () => toggleExcluded(r.id, !r.excluded),
                          },
                          { label: "ลบรายการ", icon: "trash", danger: true, onClick: () => del(r.id, r.displayTitle) },
                        ]}
                      />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ดูรูปบิลเต็มจอ */}
      {zoomUrl && (
        <button
          type="button"
          onClick={() => setZoomUrl(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoomUrl} alt="รูปบิล" className="max-h-full max-w-full rounded-petflow object-contain" />
        </button>
      )}
    </div>
  );
}
