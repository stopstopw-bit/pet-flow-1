"use client";

import { useCallback, useEffect, useState } from "react";
import { useLiff } from "@/components/LiffProvider";
import { toJpegDataUrl } from "@/lib/image-convert";
import { Icon } from "@/components/Icon";

type Offer = {
  id: string;
  kind: "package" | "credit" | "nights";
  name: string;
  totalUses: number;
  price: number;
  creditAmount?: number;
  description?: string;
  imageUrl?: string;
};

type Order = {
  id: string;
  kind: "package" | "credit" | "nights";
  name: string;
  totalUses: number;
  price: number;
  creditAmount?: number;
  status: "pending" | "paid" | "cancelled";
  slipUrl?: string;
  createdAt: string;
};

type Payment = { bankName: string; accountNumber: string; accountName: string };

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

/**
 * ร้านขายคอร์สในแอปลูกค้า — เห็นว่ามีอะไรขาย กดซื้อ โอน แล้วแนบสลิปได้ในที่เดียว
 * คอร์สจะเข้าระบบก็ต่อเมื่อร้านกดยืนยันรับเงินแล้วเท่านั้น
 *
 * ไม่มีของขายและไม่มีออร์เดอร์ค้าง = ซ่อนทั้งช่อง
 */
export function PackageShopSection() {
  const { profile } = useLiff();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [buying, setBuying] = useState("");
  const [uploading, setUploading] = useState("");
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    if (!profile?.lineUserId) return;
    try {
      const r = await fetch(
        `/api/package-shop?lineUserId=${encodeURIComponent(profile.lineUserId)}`
      );
      const d = await r.json();
      setOffers(d.offers || []);
      setOrders(d.orders || []);
      setPayment(d.payment || null);
    } catch {
      /* โหลดไม่ได้ = ซ่อนช่องไปเลย ดีกว่าโชว์ช่องว่าง */
    }
  }, [profile?.lineUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const pending = orders.filter((o) => o.status === "pending");

  const buy = async (offer: Offer) => {
    if (!profile?.lineUserId) return;
    const detail =
      offer.kind === "credit"
        ? `ได้รับเครดิต ${(offer.creditAmount ?? offer.price).toLocaleString()} บาท`
        : offer.kind === "nights"
          ? `(เข้าพักได้ ${offer.totalUses} คืน)`
          : `(${offer.totalUses} ครั้ง)`;
    if (
      !confirm(
        `สั่งซื้อ "${offer.name}" ${detail}\n` +
          `ยอดที่ต้องโอน ${offer.price.toLocaleString()} บาท\n\n` +
          `กดตกลงแล้วจะมีเลขบัญชีให้โอน แล้วแนบสลิปได้เลยนะคะ`
      )
    )
      return;
    setBuying(offer.id);
    setMsg("");
    try {
      const res = await fetch("/api/package-shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "order",
          lineUserId: profile.lineUserId,
          offerId: offer.id,
        }),
      });
      if (res.ok) {
        setMsg("สั่งซื้อแล้ว — โอนตามเลขบัญชีด้านล่าง แล้วแนบสลิปได้เลยค่ะ 🧡");
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        setMsg(
          d.error === "not_registered"
            ? "กรุณาสมัครสมาชิกก่อนสั่งซื้อนะคะ"
            : "สั่งซื้อไม่สำเร็จ ลองใหม่อีกครั้งนะคะ"
        );
      }
    } finally {
      setBuying("");
    }
  };

  const uploadSlip = async (orderId: string, file: File) => {
    if (!profile?.lineUserId) return;
    setUploading(orderId);
    setMsg("");
    try {
      // ย่อรูปก่อนส่ง — สลิปจากมือถือไฟล์ใหญ่มาก ถ้าย่อไม่ได้ค่อยส่งไฟล์เดิม
      const slip = await toJpegDataUrl(file, 1200).catch(() => fileToDataUrl(file));
      const res = await fetch("/api/package-shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "slip",
          lineUserId: profile.lineUserId,
          orderId,
          slip,
        }),
      });
      setMsg(
        res.ok
          ? "ส่งสลิปแล้ว รอร้านตรวจสอบสักครู่นะคะ 🧾"
          : "ส่งสลิปไม่สำเร็จ ลองใหม่อีกครั้งนะคะ"
      );
      if (res.ok) load();
    } finally {
      setUploading("");
    }
  };

  const copyAccount = async () => {
    if (!payment?.accountNumber) return;
    try {
      await navigator.clipboard.writeText(payment.accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* คลิปบอร์ดใช้ไม่ได้บนบางเครื่อง — ลูกค้าพิมพ์เองได้ */
    }
  };

  if (offers.length === 0 && pending.length === 0) return null;

  return (
    <section className="mb-4 rounded-petflow border border-mint-deep/30 bg-mint p-4 shadow-petflow">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint-deep/15 text-mint-deep">
          <Icon name="bag" size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Packages</p>
          <p className="text-sm font-extrabold text-mint-deep">คอร์สที่เปิดขาย</p>
        </div>
      </div>
      <p className="-mt-1 mb-3 text-[11px] text-brown-soft">
        ซื้อล่วงหน้าคุ้มกว่า · ใช้ได้ทุกครั้งที่มาใช้บริการ
      </p>

      {offers.length > 0 && (
        <>
        {offers.length > 1 && (
          <p className="mb-1.5 flex items-center gap-1 text-[11px] text-brown-faint">
            เลื่อนดูคอร์สทั้งหมด <Icon name="chevron" size={12} />
          </p>
        )}
        {/* เลื่อนซ้าย-ขวาแบบเดียวกับโปรโมชั่น — เพิ่มคอร์สใหม่แล้วไม่ดันหน้ายาว */}
        <div className="-mx-1 mb-3 flex gap-3 overflow-x-auto px-1 pb-2 scroll-smooth snap-x snap-mandatory overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {offers.map((o) => {
            const perUse = o.totalUses > 0 ? Math.round(o.price / o.totalUses) : 0;
            return (
              <div
                key={o.id}
                className={`flex shrink-0 snap-start flex-col overflow-hidden rounded-petflow-sm bg-card/90 shadow-petflow-sm ${
                  offers.length > 1 ? "w-[82%] min-w-[240px] max-w-[320px]" : "w-full"
                }`}
              >
                {o.imageUrl && (
                  // พื้นหลังนวลๆ กันภาพสัดส่วนแปลกๆ ดูโล่ง — ตัวรูปโชว์เต็มไม่โดน crop
                  <div className="flex items-center justify-center bg-latte/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={o.imageUrl}
                      alt={o.name}
                      loading="lazy"
                      className="max-h-48 w-full object-contain"
                    />
                  </div>
                )}
                <div className="flex flex-1 flex-col p-3">
                  <p className="text-sm font-extrabold leading-snug text-petflow-chocolate">
                    {o.name}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] font-bold text-brown-soft">
                    {o.kind === "credit" ? (
                      <span className="rounded-full bg-sage/20 px-2 py-0.5 text-ok">
                        ได้เครดิต {(o.creditAmount ?? o.price).toLocaleString()}฿
                        {(o.creditAmount ?? o.price) > o.price ? " 🎁" : ""}
                      </span>
                    ) : o.kind === "nights" ? (
                      <>
                        <span className="rounded-full bg-sage/20 px-2 py-0.5 text-ok">
                          เข้าพักได้ {o.totalUses} คืน
                        </span>
                        {o.totalUses > 0 && (
                          <span className="text-brown-faint">
                            ตกคืนละ {Math.round(o.price / o.totalUses).toLocaleString()}฿
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="rounded-full bg-sage/20 px-2 py-0.5 text-ok">
                          ใช้ได้ {o.totalUses} ครั้ง
                        </span>
                        {perUse > 0 && (
                          <span className="text-brown-faint">
                            ตกครั้งละ {perUse.toLocaleString()}฿
                          </span>
                        )}
                      </>
                    )}
                  </p>
                  {o.description && (
                    <p className="mt-1 whitespace-pre-line text-[10px] leading-relaxed text-brown-faint">
                      {o.description}
                    </p>
                  )}
                  <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
                    <p className="text-lg font-extrabold leading-none text-latte-deep">
                      {o.price.toLocaleString()}
                      <span className="text-xs">฿</span>
                    </p>
                    <button
                      type="button"
                      disabled={buying === o.id}
                      onClick={() => buy(o)}
                      className="min-h-[44px] rounded-full bg-latte-deep px-5 text-sm font-extrabold text-card shadow-petflow-sm transition active:scale-[0.97] disabled:opacity-40"
                    >
                      {buying === o.id ? "…" : "ซื้อเลย"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}

      {/* รอโอน — โชว์เลขบัญชี ยอดที่ต้องโอน และปุ่มแนบสลิป */}
      {pending.map((o) => (
        <div
          key={o.id}
          className="mb-2 rounded-petflow-sm border border-wait/40 bg-card/80 p-3"
        >
          <p className="flex items-center gap-1.5 text-xs font-extrabold text-wait">
            <Icon name="clock" size={14} />
            <span className="min-w-0 truncate">รอโอนเงิน · {o.name}</span>
          </p>
          <p className="mt-1 text-[11px] text-brown-soft">
            ยอดที่ต้องโอน{" "}
            <span className="text-sm font-extrabold text-petflow-chocolate">
              {o.price.toLocaleString()} บาท
            </span>
          </p>

          {payment?.accountNumber && (
            <div className="mt-2 flex items-center gap-3 rounded-petflow-sm bg-paper px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-brown-soft">{payment.bankName}</p>
                <p className="text-base font-extrabold tracking-wide text-petflow-chocolate">
                  {payment.accountNumber}
                </p>
                {payment.accountName && (
                  <p className="truncate text-[11px] text-brown-faint">
                    ชื่อบัญชี: {payment.accountName}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={copyAccount}
                aria-label="คัดลอกเลขบัญชี"
                className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-card px-3.5 text-xs font-extrabold text-petflow-chocolate shadow-petflow-sm"
              >
                <Icon name={copied ? "check" : "copy"} size={15} />
                {copied ? "คัดลอกแล้ว" : "คัดลอก"}
              </button>
            </div>
          )}

          {o.slipUrl ? (
            <p className="mt-2 flex items-start gap-1.5 rounded-petflow-sm bg-sage/15 px-3 py-2 text-[11px] font-bold text-ok">
              <Icon name="check" size={14} strokeWidth={2.4} className="mt-px" />
              ส่งสลิปแล้ว — รอร้านยืนยันรับเงิน คอร์สจะเข้าให้อัตโนมัติค่ะ
            </p>
          ) : (
            <label className="mt-2 flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-petflow-sm bg-latte-deep text-sm font-extrabold text-card shadow-petflow-sm transition active:scale-[0.98]">
              <Icon name="image" size={18} />
              {uploading === o.id ? "กำลังส่ง…" : "แนบสลิปโอนเงิน"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading === o.id}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadSlip(o.id, f);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      ))}

      {msg && (
        <p className="mt-1 rounded-petflow-sm bg-card px-3 py-2 text-[11px] font-bold text-brown-soft">
          {msg}
        </p>
      )}
    </section>
  );
}
