"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiff } from "@/components/LiffProvider";
import { formatThaiDateShort } from "@/lib/format-thai-date";
import { LoadingScreen } from "@/components/LoadingScreen";
import { BTN_PRIMARY, PageHeader } from "@/components/PageHeader";
import { EmptyState, SectionLabel } from "@/components/ui";
import { Icon } from "@/components/Icon";

type Bk = {
  id: string;
  catName: string;
  service: string;
  date?: string;
  time?: string;
  checkin?: string;
  checkout?: string;
  pickup: boolean;
  dropoff: boolean;
  mapUrl?: string;
  address?: string;
  saved: boolean;
};

const field =
  "w-full min-w-0 rounded-xl border border-petflow-line bg-paper px-3 py-3 text-sm text-brown placeholder:text-brown-faint";

/** ลูกค้ากรอกจุดรับ-ส่งน้องก่อนวันนัด — วางลิงก์ Google Maps หรือกดใช้ตำแหน่งปัจจุบัน */
function BookingTransportContent() {
  const id = useSearchParams().get("id") || "";
  const { profile } = useLiff();

  const [bk, setBk] = useState<Bk | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapUrl, setMapUrl] = useState("");
  const [address, setAddress] = useState("");
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    const q = new URLSearchParams({ id });
    if (profile?.lineUserId) q.set("lineUserId", profile.lineUserId);
    fetch(`/api/bookings/transport?${q}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.found) return;
        setBk(d.booking);
        setMapUrl(d.booking.mapUrl || "");
        setAddress(d.booking.address || "");
      })
      .finally(() => setLoading(false));
  }, [id, profile?.lineUserId]);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("เครื่องนี้ส่งตำแหน่งไม่ได้ — วางลิงก์ Google Maps แทนได้เลยค่ะ");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setMapUrl(`https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`);
        setLocating(false);
      },
      () => {
        setError("ยังไม่ได้อนุญาตให้ใช้ตำแหน่ง — วางลิงก์ Google Maps แทนได้เลยค่ะ");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const save = async () => {
    if (!mapUrl.trim() && !address.trim()) {
      setError("ใส่ลิงก์ Google Maps หรือที่อยู่อย่างน้อย 1 ช่องนะคะ");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/bookings/transport", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: id,
          mapUrl: mapUrl.trim(),
          address: address.trim(),
          lineUserId: profile?.lineUserId,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone(true);
      } else {
        setError(
          d.error === "bad_url"
            ? "ลิงก์ไม่ถูกต้อง — คัดลอกลิงก์จากปุ่มแชร์ใน Google Maps มาวางได้เลยค่ะ"
            : "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง หรือส่งตำแหน่งในแชท LINE ได้เลยค่ะ"
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    try {
      const liff = (await import("@line/liff")).default;
      if (liff.isInClient()) liff.closeWindow();
    } catch {
      /* ไม่ได้เปิดใน LINE */
    }
  };

  if (done) {
    return (
      <div className="px-4 pb-6 pt-10">
        <div className="rounded-petflow border border-petflow-line bg-card p-6 text-center shadow-petflow">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage/25 text-ok">
            <Icon name="check" size={28} strokeWidth={2.4} />
          </span>
          <h1 className="mt-4 text-lg font-extrabold text-petflow-chocolate">ได้รับจุดรับ-ส่งแล้วค่ะ</h1>
          <p className="mt-2 text-sm leading-relaxed text-brown-soft">
            พี่เลี้ยงจะติดต่อก่อนออกเดินทางนะคะ
            <br />
            กลับไปที่แชท LINE ได้เลยค่ะ
          </p>
          <button type="button" onClick={finish} className={`mt-5 ${BTN_PRIMARY}`}>
            กลับไปที่แชท
          </button>
        </div>
      </div>
    );
  }

  const isRoom = bk?.service === "room";
  const legs = bk
    ? [
        bk.pickup && {
          label: "รับน้อง",
          date: isRoom ? bk.checkin : bk.date,
          time: isRoom ? undefined : bk.time,
        },
        bk.dropoff && {
          label: "ส่งน้องกลับบ้าน",
          date: isRoom ? bk.checkout : bk.date,
          time: undefined,
        },
      ].filter((x): x is { label: string; date: string | undefined; time: string | undefined } => !!x)
    : [];

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader
        eyebrow="Pick-up & drop-off"
        title="จุดรับ-ส่งน้อง"
        back="/app"
        backLabel="กลับหน้าแรก"
        showLang={false}
      />

      {loading ? (
        <LoadingScreen />
      ) : !bk ? (
        <div className="rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
          <EmptyState icon="calendar" title="ไม่พบข้อมูลการจอง" />
        </div>
      ) : !bk.pickup && !bk.dropoff ? (
        <div className="rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
          <EmptyState icon="car" title="นัดนี้ไม่ได้ใช้บริการรับ-ส่ง" sub="ถ้าต้องการรับ-ส่ง ทักแชท LINE ได้เลยค่ะ" />
        </div>
      ) : (
        <>
          <div className="rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
            <p className="flex items-center gap-2 text-sm font-extrabold text-petflow-chocolate">
              <Icon name="paw" size={18} />
              {bk.catName}
            </p>
            <ul className="mt-3 space-y-2">
              {legs.map((l) => (
                <li key={l.label} className="flex items-center gap-2.5 rounded-xl bg-paper px-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-honey/30 text-petflow-chocolate">
                    <Icon name="car" size={16} />
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-bold text-brown">{l.label}</span>
                  <span className="shrink-0 text-xs text-brown-soft">
                    {l.date ? formatThaiDateShort(l.date) : "—"}
                    {l.time ? ` · ${l.time}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <section className="mt-5">
            <SectionLabel>Location · จุดรับ-ส่ง</SectionLabel>
            <div className="space-y-3 rounded-petflow border border-petflow-line bg-card p-4 shadow-petflow-sm">
              <button
                type="button"
                onClick={useCurrentLocation}
                disabled={locating}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-honey/40 px-3 text-sm font-extrabold text-petflow-chocolate disabled:opacity-50"
              >
                <Icon name="pin" size={18} />
                {locating ? "กำลังหาตำแหน่ง…" : "ใช้ตำแหน่งที่อยู่ตอนนี้"}
              </button>

              <div>
                <p className="mb-1.5 text-xs font-bold text-brown-soft">หรือวางลิงก์ Google Maps</p>
                <input
                  value={mapUrl}
                  onChange={(e) => setMapUrl(e.target.value)}
                  placeholder="https://maps.app.goo.gl/…"
                  inputMode="url"
                  className={field}
                />
                <p className="mt-1 text-[11px] text-brown-faint">
                  เปิด Google Maps › ปักหมุด › แชร์ › คัดลอกลิงก์ แล้วนำมาวางที่นี่
                </p>
                {mapUrl.trim() && /^https?:\/\//.test(mapUrl.trim()) && (
                  <a
                    href={mapUrl.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-latte-deep underline-offset-2 hover:underline"
                  >
                    <Icon name="link" size={13} />
                    เปิดดูแผนที่ที่ใส่ไว้
                  </a>
                )}
              </div>

              <div>
                <p className="mb-1.5 text-xs font-bold text-brown-soft">ที่อยู่ / จุดสังเกต (ถ้ามี)</p>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={3}
                  placeholder="เช่น หมู่บ้าน… ซอย… บ้านรั้วสีขาว / คอนโดตึก B ฝากรปภ.ได้"
                  className={field}
                />
              </div>

              {error && (
                <p className="rounded-xl bg-wait/10 px-3 py-2 text-xs font-bold text-wait">{error}</p>
              )}

              <button type="button" disabled={saving} onClick={save} className={BTN_PRIMARY}>
                {saving ? "กำลังบันทึก…" : bk.saved ? "บันทึกการแก้ไข" : "ส่งจุดรับ-ส่ง"}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default function BookingTransportPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <BookingTransportContent />
    </Suspense>
  );
}
