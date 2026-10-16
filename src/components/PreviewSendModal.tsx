"use client";

import { FlexPreviewStack } from "@/components/FlexPreview";
import { Icon } from "@/components/Icon";

/** พรีวิวการ์ดก่อนส่งจริง — ใช้ร่วมกันทั้งปุ่มส่งเดี่ยวและส่งชุดการ์ด */
export function PreviewSendModal({
  messages,
  skipped,
  sending,
  onConfirm,
  onCancel,
}: {
  messages: Record<string, unknown>[];
  skipped?: string[];
  sending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-3"
      onClick={onCancel}
    >
      <div
        className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-t-[28px] bg-paper px-4 pb-6 pt-3 shadow-petflow sm:rounded-petflow sm:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-petflow-line sm:hidden" />
        <div className="mb-3 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Preview</p>
          <p className="flex items-center justify-center gap-1.5 text-sm font-extrabold text-petflow-chocolate">
            <Icon name="eye" size={16} />
            ตัวอย่างที่ลูกค้าจะเห็นใน LINE
          </p>
        </div>

        <FlexPreviewStack messages={messages} />

        {skipped && skipped.length > 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-petflow-sm bg-wait/10 px-3 py-2 text-[11px] font-bold text-wait">
            <Icon name="alert" size={16} />
            ข้ามให้: {skipped.join(", ")}
          </p>
        )}

        <div className="sticky bottom-0 -mx-4 mt-4 flex gap-2 bg-paper px-4 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            className="min-h-[44px] flex-1 rounded-petflow-sm bg-card py-3 text-sm font-bold text-brown shadow-petflow-sm disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={sending}
            className="flex min-h-[44px] flex-[1.4] items-center justify-center gap-2 rounded-petflow-sm bg-[#06C755] py-3 text-sm font-extrabold text-white disabled:opacity-50"
          >
            {!sending && <Icon name="send" size={16} />}
            {sending ? "กำลังส่ง…" : "ยืนยันส่งจริง"}
          </button>
        </div>
      </div>
    </div>
  );
}
