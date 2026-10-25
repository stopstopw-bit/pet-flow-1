"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { SearchField } from "@/components/ui";
import { STAFF_NOTE_TAGS } from "@/lib/staff-note-tags";

function parseTags(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * ปุ่ม + ป็อปอัพเลือก "เรื่องที่ช่างต้องรู้" — แทนที่ช่องพิมพ์อิสระ 2 ช่องเดิม
 * (โรคประจำตัว / รายละเอียดเพิ่มเติม) ด้วยแท็กสำเร็จรูปที่ค้นหาได้ + พิมพ์เองได้
 * ยังคง map กลับเป็น medical/note สองฟิลด์เดิมเป๊ะๆ ปลายทางไม่ต้องแก้อะไร
 */
export function StaffNoteTagPicker({
  medicalValue,
  noteValue,
  onChange,
  label = "เรื่องที่ช่างต้องรู้",
}: {
  medicalValue: string;
  noteValue: string;
  onChange: (medical: string, note: string) => void;
  /** หัวข้อบนปุ่ม — ฟอร์มสมัครใช้ "โรคประจำตัว / เรื่องที่ช่างต้องรู้" ให้ลูกค้ารู้ว่าตอบโรคประจำตัวตรงนี้ */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState("");
  const [search, setSearch] = useState("");

  // เปิดป็อปอัพทีไร ตั้งค่าเริ่มจากข้อความเดิม — จับคู่กับแท็กที่ตรง label เป๊ะ
  // ส่วนที่เหลือ (พิมพ์เองมาแต่แรก/ไม่ตรงแท็กไหนเลย) ไปกองในช่อง "อื่นๆ"
  const openPicker = () => {
    const known = new Set(STAFF_NOTE_TAGS.map((t) => t.label));
    const medicalTags = parseTags(medicalValue);
    const noteTags = parseTags(noteValue);
    const ids = STAFF_NOTE_TAGS.filter((t) =>
      medicalTags.includes(t.label) || noteTags.includes(t.label)
    ).map((t) => t.id);
    const leftover = [...medicalTags, ...noteTags].filter((s) => !known.has(s));
    setSelected(new Set(ids));
    setCustom(leftover.join(", "));
    setSearch("");
    setOpen(true);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return STAFF_NOTE_TAGS;
    return STAFF_NOTE_TAGS.filter((t) => t.label.toLowerCase().includes(q));
  }, [search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = () => {
    const picked = STAFF_NOTE_TAGS.filter((t) => selected.has(t.id));
    const medical = picked
      .filter((t) => t.category === "medical")
      .map((t) => t.label)
      .join(", ");
    const behaviorLabels = picked
      .filter((t) => t.category === "behavior")
      .map((t) => t.label);
    const note = [...behaviorLabels, custom.trim()].filter(Boolean).join(", ");
    onChange(medical, note);
    setOpen(false);
  };

  const summary = useMemo(() => {
    const parts = [...parseTags(medicalValue), ...parseTags(noteValue)];
    return parts.length ? parts.join(", ") : "ไม่มี / เลือกจากรายการ";
  }, [medicalValue, noteValue]);

  const hasValue = parseTags(medicalValue).length > 0 || parseTags(noteValue).length > 0;

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className="flex min-h-[48px] w-full items-center gap-3 rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-left text-sm"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-honey/25 text-petflow-chocolate">
          <Icon name="alert" size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold text-brown-soft">
            {label}
          </span>
          <span
            className={`block truncate ${hasValue ? "text-brown" : "text-brown-faint"}`}
          >
            {summary}
          </span>
        </span>
        <Icon name="chevron" size={16} className="text-brown-faint" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="flex h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-petflow bg-card shadow-petflow sm:h-[80vh] sm:rounded-petflow">
            <div className="shrink-0 border-b border-petflow-line px-4 pb-3 pt-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Staff notes</p>
                  <h2 className="text-base font-extrabold text-petflow-chocolate">
                    เรื่องที่ช่างต้องรู้
                  </h2>
                  <p className="mt-0.5 text-[10px] text-brown-soft">
                    พฤติกรรม โรคประจำตัว เรื่องผิวหนัง · เลือกได้หลายข้อ ไม่มีก็ข้ามได้
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="ปิด"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper text-brown"
                >
                  <Icon name="x" size={16} />
                </button>
              </div>
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder="พิมพ์เพื่อค้นหา"
                className="mt-3"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-2">
              {filtered.length === 0 ? (
                <p className="py-8 text-center text-xs text-brown-faint">ไม่พบรายการที่ตรงกัน</p>
              ) : (
                <ul className="divide-y divide-petflow-line/60">
                  {filtered.map((t) => {
                    const active = selected.has(t.id);
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => toggle(t.id)}
                          className={`flex min-h-[48px] w-full items-center gap-3 px-1 py-3 text-left text-sm ${
                            active ? "font-bold text-petflow-chocolate" : "text-brown"
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 text-white ${
                              active
                                ? "border-honey-deep bg-honey-deep"
                                : "border-petflow-line bg-card"
                            }`}
                          >
                            {active && <Icon name="check" size={14} strokeWidth={2.6} />}
                          </span>
                          <span>{t.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="py-3">
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">
                  Other · อื่นๆ (พิมพ์เอง)
                </p>
                <input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="เช่น แพ้ยาสลบ"
                  className="w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-3 text-sm"
                />
              </div>
            </div>

            <div className="shrink-0 border-t border-petflow-line p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={save}
                className="min-h-[48px] w-full rounded-petflow-sm bg-gradient-to-r from-honey to-honey-deep py-3 text-sm font-extrabold text-petflow-chocolate shadow-petflow-sm"
              >
                เสร็จสิ้น{selected.size > 0 ? ` (${selected.size})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
