"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

export function AddCustomerModal({
  onAdded,
}: {
  onAdded: (customerId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [catName, setCatName] = useState("");
  const [catNote, setCatNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const close = () => {
    setOpen(false);
    setName("");
    setPhone("");
    setCatName("");
    setCatNote("");
    setError("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !catName.trim()) return;
    setSaving(true);
    setError("");

    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: name.trim(),
        catName: catName.trim(),
        phone: phone.trim() || undefined,
        staffNote: catNote.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (res.ok && data.customer?.id) {
      close();
      onAdded(data.customer.id);
    } else {
      setError(data.error || "บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-petflow-sm bg-gradient-to-r from-honey to-honey-deep py-3 text-sm font-extrabold text-petflow-chocolate shadow-petflow-sm"
      >
        <Icon name="plus" size={18} strokeWidth={2.2} />
        เพิ่มลูกค้าเอง
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-petflow bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-petflow sm:rounded-petflow">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-petflow-chocolate">
                <Icon name="user" size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">New customer</p>
                <h2 className="text-base font-extrabold text-petflow-chocolate">เพิ่มลูกค้าเอง</h2>
                <p className="mt-0.5 text-[11px] text-brown-soft">
                  บันทึกในระบบก่อน — แล้วส่งลิงก์ผูก LINE ให้ลูกค้าในหน้าโปรไฟล์
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="ปิด"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper text-brown"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <label className="block text-xs font-bold text-brown-soft">
                ชื่อลูกค้า *
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น คุณมาย"
                  required
                  autoFocus
                  className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-3 text-sm font-bold"
                />
              </label>
              <label className="block text-xs font-bold text-brown-soft">
                เบอร์โทร
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                  placeholder="08x-xxx-xxxx"
                  className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-3 text-sm"
                />
              </label>
              <label className="block text-xs font-bold text-brown-soft">
                ชื่อน้องแมว *
                <input
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="เช่น น้องจู๊ด"
                  required
                  className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-3 text-sm font-bold"
                />
              </label>
              <label className="block text-xs font-bold text-brown-soft">
                โน้ตแมว (ถ้ามี)
                <textarea
                  value={catNote}
                  onChange={(e) => setCatNote(e.target.value)}
                  placeholder="นิสัย / แพ้อาหาร"
                  rows={2}
                  className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm"
                />
              </label>
              {error && (
                <p className="text-xs font-bold text-wait">{error}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={close}
                  className="min-h-[44px] flex-1 rounded-petflow-sm bg-paper py-3 text-sm font-bold text-brown-soft"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving || !name.trim() || !catName.trim()}
                  className="flex min-h-[44px] flex-[2] items-center justify-center gap-1.5 rounded-petflow-sm bg-petflow-chocolate py-3 text-sm font-extrabold text-card shadow-petflow-sm disabled:opacity-50"
                >
                  {!saving && <Icon name="check" size={16} strokeWidth={2.4} />}
                  {saving ? "กำลังบันทึก…" : "บันทึก"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
