"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "@/components/Toast";
import { toJpegDataUrl } from "@/lib/image-convert";
import { Icon } from "@/components/Icon";
import { EmptyState, MoreMenu, SectionLabel, Segmented } from "@/components/ui";
import { GroomProgramPicker, useGroomPrograms } from "@/components/GroomProgramPicker";
import { groomProgramName, type GroomProgram } from "@/lib/grooming-prices";

type OfferKind = "package" | "credit" | "nights";

type Offer = {
  id: string;
  name: string;
  kind: OfferKind;
  totalUses: number;
  price: number;
  /** เฉพาะ kind==="credit" — เครดิตที่ลูกค้าได้รับ (ตั้งสูงกว่า price ได้เพื่อแถมโบนัส) */
  creditAmount?: number;
  description?: string;
  imageUrl?: string;
  /** เฉพาะ kind==="package" — ผูกโปรแกรมอาบน้ำ ไม่ระบุ = ทุกโปรแกรม */
  groomProgram?: string;
  active: boolean;
};

type Order = {
  id: string;
  customerId: string;
  customerName: string;
  name: string;
  kind: OfferKind;
  totalUses: number;
  price: number;
  creditAmount?: number;
  status: "pending" | "paid" | "cancelled";
  slipUrl?: string;
  createdAt: string;
  paidAt?: string;
};

/** ป้ายชื่อช่องเล็กๆ เหนือช่องกรอก — พอมีค่าแล้ว placeholder หาย ยังรู้ว่าช่องไหนคืออะไร */
function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1 block px-1 text-[11px] font-bold text-brown-soft">{label}</span>
      {children}
    </label>
  );
}

/** เลือก/เปลี่ยน/เอาออก รูปหน้าปกคอร์ส — ใช้ทั้งตอนเพิ่มและตอนแก้ไข */
function CoverImagePicker({
  image,
  onPick,
  onRemove,
}: {
  image: string;
  onPick: (file: File) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-petflow-sm border border-dashed border-petflow-line bg-paper px-3 py-2.5">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="รูปหน้าปกคอร์ส" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-card text-brown-soft">
            <Icon name="image" size={20} />
          </span>
        )}
        <span className="min-w-0 text-xs font-bold text-brown">
          {image ? "เปลี่ยนรูปหน้าปก" : "ใส่รูปหน้าปก (ถ้ามี)"}
          <span className="block text-[11px] font-normal text-brown-faint">
            รูปสวยๆ ช่วยให้ลูกค้ากดซื้อง่ายขึ้น
          </span>
        </span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onPick(f);
          }}
        />
      </label>
      {image && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-10 shrink-0 items-center gap-1 rounded-full bg-card px-3 text-xs font-bold text-brown-soft"
        >
          <Icon name="trash" size={14} />
          เอารูปออก
        </button>
      )}
    </div>
  );
}

/** แถวคอร์สที่เปิดขาย — กดแก้ไขแล้วกลายเป็นฟอร์มอินไลน์ แก้ได้ทุกช่องเหมือนตอนเพิ่ม (รวมรายละเอียดและรูป) */
function OfferRow({
  offer,
  patch,
  pickImage,
  programs,
}: {
  offer: Offer;
  programs: GroomProgram[];
  patch: (body: Record<string, unknown>, okMsg: string, key: string) => Promise<void>;
  pickImage: (file: File, onDone: (dataUrl: string) => void) => Promise<void>;
}) {
  const o = offer;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(o.name);
  const [uses, setUses] = useState(String(o.totalUses));
  const [price, setPrice] = useState(String(o.price));
  const [creditAmount, setCreditAmount] = useState(String(o.creditAmount ?? o.price));
  const [desc, setDesc] = useState(o.description || "");
  const [program, setProgram] = useState(o.groomProgram || "");
  /** รูปหน้าปก: undefined = ไม่ได้เปลี่ยน · "" = เอารูปออก · data URL = รูปใหม่ */
  const [image, setImage] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const isCredit = o.kind === "credit";
  const isNights = o.kind === "nights";
  const unitWord = isNights ? "คืน" : "ครั้ง";

  const startEdit = () => {
    setName(o.name);
    setUses(String(o.totalUses));
    setPrice(String(o.price));
    setCreditAmount(String(o.creditAmount ?? o.price));
    setDesc(o.description || "");
    setProgram(o.groomProgram || "");
    setImage(undefined);
    setEditing(true);
  };

  const save = async () => {
    if (!name.trim()) {
      toast("กรอกชื่อ" + (isCredit ? "รายการ" : "คอร์ส"), "error");
      return;
    }
    if (!isCredit && Math.round(Number(uses) || 0) <= 0) {
      toast(`กรอกจำนวน${unitWord}`, "error");
      return;
    }
    setSaving(true);
    try {
      await patch(
        {
          action: "update_offer",
          offerId: o.id,
          name: name.trim(),
          totalUses: isCredit ? 0 : Math.round(Number(uses) || 0),
          price: Math.round(Number(price) || 0),
          ...(isCredit ? { creditAmount: Math.round(Number(creditAmount) || 0) } : {}),
          description: desc.trim(),
          ...(image !== undefined ? { image } : {}),
          ...(o.kind === "package" ? { groomProgram: program } : {}),
        },
        isCredit ? "แก้ไขรายการเติมเครดิตแล้ว ✏️" : "แก้ไขคอร์สแล้ว ✏️",
        o.id
      );
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const field =
    "w-full min-w-0 rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm";
  const shownImage = image !== undefined ? image : o.imageUrl || "";

  if (editing) {
    return (
      <li className="bg-paper/60 px-4 py-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-petflow-chocolate">
          <Icon name="edit" size={14} />
          {isCredit ? "แก้ไขรายการเติมเครดิต" : "แก้ไขคอร์ส"}
        </p>
        <div className="space-y-2.5">
          <Labeled label={isCredit ? "ชื่อรายการ" : "ชื่อคอร์ส"}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isCredit ? "ชื่อรายการ เช่น เติมเครดิต 1,000" : "ชื่อคอร์ส"}
              className={field}
            />
          </Labeled>
          {isCredit ? (
            <div className="flex gap-2">
              <Labeled label="ลูกค้าจ่าย (บาท)">
                <input
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0"
                  className={field}
                />
              </Labeled>
              <Labeled label="ได้เครดิต (บาท)">
                <input
                  type="number"
                  min={0}
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder="0"
                  className={field}
                />
              </Labeled>
            </div>
          ) : (
            <div className="flex gap-2">
              <Labeled label={isNights ? "กี่คืน" : "กี่ครั้ง"}>
                <input
                  type="number"
                  min={1}
                  value={uses}
                  onChange={(e) => setUses(e.target.value)}
                  placeholder={isNights ? "กี่คืน" : "กี่ครั้ง"}
                  className={field}
                />
              </Labeled>
              <Labeled label="ราคา (บาท)">
                <input
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0"
                  className={field}
                />
              </Labeled>
            </div>
          )}
          <Labeled label="รายละเอียด / คำโปรย (ลูกค้าเห็นในแอป)">
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={4}
              placeholder="เช่น เงื่อนไข สิ่งที่ได้ ประหยัดกว่าซื้อแยกเท่าไร (ขึ้นบรรทัดใหม่ได้)"
              className={`${field} resize-y leading-relaxed`}
            />
          </Labeled>
          {o.kind === "package" && (
            <GroomProgramPicker value={program} onChange={setProgram} programs={programs} />
          )}
          <CoverImagePicker
            image={shownImage}
            onPick={(f) => pickImage(f, setImage)}
            onRemove={o.imageUrl || image ? () => setImage("") : undefined}
          />
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="h-10 flex-1 rounded-full bg-card text-xs font-bold text-brown-soft"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="h-10 flex-[2] rounded-full bg-petflow-chocolate text-xs font-extrabold text-card disabled:opacity-40"
            >
              {saving ? "…" : "บันทึก"}
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <label
        className={`relative h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-xl bg-paper ${
          o.active ? "" : "opacity-50"
        }`}
        aria-label={o.imageUrl ? "เปลี่ยนรูป" : "ใส่รูป"}
      >
        {o.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={o.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-brown-soft">
            <Icon name="image" size={20} />
          </span>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            pickImage(f, (dataUrl) =>
              patch(
                { action: "set_offer_image", offerId: o.id, image: dataUrl },
                "เปลี่ยนรูปแล้ว 📷",
                o.id
              )
            );
          }}
        />
      </label>
      <button type="button" onClick={startEdit} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1.5">
          <span className={`truncate text-sm font-extrabold ${o.active ? "text-petflow-chocolate" : "text-brown-faint"}`}>
            {o.name}
          </span>
          {!o.active && (
            <span className="shrink-0 rounded-full bg-paper px-1.5 text-[10px] font-bold leading-4 text-brown-faint">
              ปิดขาย
            </span>
          )}
        </span>
        <span className="block truncate text-[11px] text-brown-soft">
          {isCredit
            ? `จ่าย ${o.price.toLocaleString()}฿ ได้เครดิต ${(o.creditAmount ?? o.price).toLocaleString()}฿`
            : `${o.totalUses} ${unitWord} · ${o.price.toLocaleString()} ฿`}
          {o.groomProgram && ` · ${groomProgramName(o.groomProgram, programs) || "โปรแกรมที่ลบไปแล้ว"}`}
        </span>
        {o.description ? (
          <span className="block truncate text-[11px] text-brown-faint">{o.description}</span>
        ) : null}
      </button>
      <MoreMenu
        items={[
          { label: "แก้ไข", icon: "edit", onClick: startEdit },
          {
            label: o.active ? "ปิดขาย" : "เปิดขาย",
            icon: o.active ? "eye" : "check",
            onClick: () =>
              patch(
                { action: "set_offer_active", offerId: o.id, active: !o.active },
                o.active ? "ปิดขายแล้ว" : "เปิดขายแล้ว",
                o.id
              ),
          },
          {
            label: "ลบออกจากรายการขาย",
            icon: "trash",
            danger: true,
            onClick: () => {
              if (!confirm(`ลบ "${o.name}" ออกจากรายการขาย?`)) return;
              patch({ action: "delete_offer", offerId: o.id }, "ลบออกจากรายการขายแล้ว", o.id);
            },
          },
        ]}
      />
    </li>
  );
}

/**
 * ขายคอร์สในแอป — ตั้งว่าจะขายอะไร + ยืนยันรับเงินจากออร์เดอร์ที่ลูกค้ากดซื้อ
 * กดยืนยันแล้วระบบจะเพิ่มคอร์สให้ลูกค้า + ลงรายรับให้อัตโนมัติ
 */
export default function AdminPackagesPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [zoomSlip, setZoomSlip] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<OfferKind>("package");
  const [uses, setUses] = useState("");
  const [price, setPrice] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [image, setImage] = useState("");
  const [program, setProgram] = useState("");
  const groomPrograms = useGroomPrograms();

  /** ย่อรูปก่อนส่งเสมอ — รูปจากมือถือ 5MB ยิงขึ้นไปตรงๆ จะโดนตีกลับ */
  const pickImage = async (file: File, onDone: (dataUrl: string) => void) => {
    try {
      onDone(await toJpegDataUrl(file, 900));
    } catch {
      toast("อ่านรูปไม่ได้ ลองรูปอื่นนะคะ", "error");
    }
  };

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/package-shop");
      const d = r.ok ? await r.json() : {};
      setOffers(d.offers || []);
      setOrders(d.orders || []);
    } catch {
      /* ไม่ให้ค้างที่ "กำลังโหลด" ถ้า API พัง */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isCreditForm = kind === "credit";

  const addOffer = async () => {
    if (!name.trim()) {
      toast(
        isCreditForm
          ? "กรอกชื่อรายการ"
          : `กรอกชื่อคอร์สและจำนวน${kind === "nights" ? "คืน" : "ครั้ง"}`,
        "error"
      );
      return;
    }
    const n = Math.round(Number(uses) || 0);
    if (!isCreditForm && n <= 0) {
      toast(`กรอกจำนวน${kind === "nights" ? "คืน" : "ครั้ง"}`, "error");
      return;
    }
    setBusy("add");
    try {
      const res = await fetch("/api/package-shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_offer",
          kind,
          name: name.trim(),
          totalUses: isCreditForm ? 0 : n,
          price: Math.round(Number(price) || 0),
          ...(isCreditForm ? { creditAmount: Math.round(Number(creditAmount) || 0) } : {}),
          description: desc.trim() || undefined,
          image: image || undefined,
          groomProgram: kind === "package" ? program || undefined : undefined,
        }),
      });
      if (res.ok) {
        toast(
          isCreditForm
            ? "เพิ่มรายการเติมเครดิตแล้ว — ลูกค้าเห็นในแอปทันที 💰"
            : "เพิ่มคอร์สที่ขายแล้ว — ลูกค้าเห็นในแอปทันที 🛍️",
          "success"
        );
        setName("");
        setUses("");
        setPrice("");
        setCreditAmount("");
        setDesc("");
        setImage("");
        setProgram("");
        load();
      } else {
        toast("เพิ่มไม่สำเร็จ", "error");
      }
    } finally {
      setBusy("");
    }
  };

  const patch = async (body: Record<string, unknown>, okMsg: string, key: string) => {
    setBusy(key);
    try {
      const res = await fetch("/api/package-shop", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        // เงินเข้าแล้วเสมอ — ถ้าส่งการ์ดไม่ได้ต้องบอกตรงๆ ไม่ใช่บอกว่าแจ้งแล้ว
        toast(
          d.notifyError ? `${okMsg} · ⚠️ ส่ง LINE ไม่ได้: ${d.notifyError}` : okMsg,
          d.notifyError ? "error" : "success"
        );
        load();
      } else if (d.error === "not_pending") {
        toast("ออร์เดอร์นี้ถูกจัดการไปแล้ว (อาจกดซ้ำ) — รีเฟรชให้แล้ว", "error");
        load();
      } else if (d.error === "no_column") {
        toast(
          "ยังบันทึกรูปไม่ได้ — ไปที่ ตั้งค่า แล้วกด 'อัปเดตฐานข้อมูล' ครั้งเดียว แล้วลองใหม่นะคะ",
          "error"
        );
      } else {
        toast("ไม่สำเร็จ", "error");
      }
    } finally {
      setBusy("");
    }
  };

  const pending = orders.filter((o) => o.status === "pending");
  const done = orders.filter((o) => o.status !== "pending");
  const field =
    "w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm";

  if (loading) {
    return <p className="py-10 text-center text-sm text-brown-soft">กำลังโหลด…</p>;
  }

  const unitOf = (k: OfferKind) => (k === "nights" ? "คืน" : "ครั้ง");

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Packages</p>
          <h1 className="text-xl font-extrabold text-petflow-chocolate">ขายคอร์สในแอป</h1>
          <p className="mt-0.5 text-xs text-brown-soft">ลูกค้าเห็นในหน้าแรกของแอป และกดซื้อได้เลย</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold shadow-petflow-sm ${
            showAdd ? "bg-card text-brown" : "bg-petflow-chocolate text-card"
          }`}
        >
          <Icon name={showAdd ? "x" : "plus"} size={18} />
          {showAdd ? "ปิด" : "เพิ่มคอร์ส"}
        </button>
      </div>

      {/* ── เพิ่มคอร์สที่จะขาย ── */}
      {showAdd && (
        <section>
          <SectionLabel>New · เพิ่มคอร์สที่จะขาย</SectionLabel>
          <div className="space-y-3 rounded-petflow bg-card p-4 shadow-petflow-sm">
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { id: "package", label: "นับครั้ง", icon: "ticket" },
                { id: "credit", label: "เครดิต", icon: "wallet" },
                { id: "nights", label: "วันพัก", icon: "bed" },
              ]}
            />
            {kind === "credit" && (
              <p className="text-[11px] text-brown-soft">เติมเครดิต Member — ลูกค้าจ่ายแล้วได้เครดิตไว้หักค่าบริการ</p>
            )}
            {kind === "nights" && (
              <p className="rounded-petflow-sm bg-honey/15 px-3 py-2 text-[11px] font-bold text-petflow-chocolate">
                ลูกค้าซื้อจำนวนคืนล่วงหน้าในราคาถูกกว่า แล้วหักตามคืนที่เข้าพักจริง
                <span className="mt-0.5 block font-normal text-brown-soft">
                  คลุมเฉพาะค่าห้อง — ค่าอาบน้ำ/ของเสริมในบิลเดียวกันยังคิดตามปกติ · ไม่มีวันหมดอายุ
                </span>
              </p>
            )}

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                isCreditForm
                  ? "ชื่อรายการ เช่น เติมเครดิต 1,000"
                  : kind === "nights"
                    ? "ชื่อคอร์ส เช่น แพ็กรายเดือน 30 คืน (ลด 30%)"
                    : "ชื่อคอร์ส เช่น อาบน้ำ 10 ครั้ง"
              }
              className={field}
            />
            {isCreditForm ? (
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="ลูกค้าจ่าย (บาท)"
                  className={`${field} min-w-0`}
                />
                <input
                  type="number"
                  min={0}
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder="ได้เครดิต (บาท)"
                  className={`${field} min-w-0`}
                />
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={uses}
                  onChange={(e) => setUses(e.target.value)}
                  placeholder={kind === "nights" ? "กี่คืน" : "กี่ครั้ง"}
                  className={`${field} min-w-0`}
                />
                <input
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="ราคา (บาท)"
                  className={`${field} min-w-0`}
                />
              </div>
            )}
            {isCreditForm && Number(creditAmount) > Number(price) && Number(price) > 0 && (
              <p className="rounded-petflow-sm bg-sage/10 px-3 py-2 text-[11px] font-bold text-ok">
                ลูกค้าจ่าย {Number(price).toLocaleString()}฿ ได้เครดิต {Number(creditAmount).toLocaleString()}฿ — แถม {(Number(creditAmount) - Number(price)).toLocaleString()}฿
              </p>
            )}
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              placeholder={
                isCreditForm
                  ? "รายละเอียด / คำโปรย (ถ้ามี) เช่น เติมเลยวันนี้ รับโบนัสฟรี 200฿ (ขึ้นบรรทัดใหม่ได้)"
                  : "รายละเอียด / คำโปรย (ถ้ามี) เช่น ประหยัดกว่าซื้อแยก 500฿ (ขึ้นบรรทัดใหม่ได้)"
              }
              className={`${field} resize-y leading-relaxed`}
            />
            {kind === "package" && (
              <GroomProgramPicker value={program} onChange={setProgram} programs={groomPrograms} />
            )}

            <CoverImagePicker
              image={image}
              onPick={(f) => pickImage(f, setImage)}
              onRemove={() => setImage("")}
            />

            <button
              type="button"
              disabled={busy === "add"}
              onClick={addOffer}
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-petflow-chocolate text-sm font-extrabold text-card disabled:opacity-40"
            >
              <Icon name="plus" size={18} />
              {busy === "add"
                ? "กำลังเพิ่ม…"
                : isCreditForm
                  ? "เพิ่มรายการเติมเครดิต"
                  : "เพิ่มคอร์สที่จะขาย"}
            </button>
          </div>
        </section>
      )}

      {/* ── ออร์เดอร์รอยืนยัน ── */}
      <section>
        <SectionLabel>Pending · รอยืนยันรับเงิน{pending.length > 0 ? ` (${pending.length})` : ""}</SectionLabel>
        <div className="rounded-petflow bg-card shadow-petflow-sm">
          {pending.length === 0 ? (
            <EmptyState
              icon="check"
              title="ไม่มีออร์เดอร์รอยืนยัน"
              sub="กดยืนยันแล้วระบบเพิ่มคอร์ส + ลงรายรับ + แจ้งลูกค้าให้อัตโนมัติ"
            />
          ) : (
            <ul className="divide-y divide-petflow-line">
              {pending.map((o) => (
                <li key={o.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/30 text-petflow-chocolate">
                      <Icon name={o.kind === "credit" ? "wallet" : o.kind === "nights" ? "bed" : "ticket"} size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold text-petflow-chocolate">{o.name}</p>
                      <Link
                        href={`/admin/customers?id=${o.customerId}`}
                        className="block truncate text-xs font-bold text-latte-deep underline-offset-2 hover:underline"
                      >
                        {o.customerName}
                      </Link>
                      <p className="truncate text-[11px] text-brown-soft">
                        {o.kind === "credit"
                          ? `ได้เครดิต ${(o.creditAmount ?? o.price).toLocaleString()}฿`
                          : `${o.totalUses} ${unitOf(o.kind)}`}{" "}
                        · {o.createdAt.slice(0, 10)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-extrabold text-petflow-chocolate">
                      {o.price.toLocaleString()} ฿
                    </p>
                  </div>

                  <div className="mt-2.5 flex items-center gap-2 pl-[52px]">
                    {o.slipUrl ? (
                      <button
                        type="button"
                        onClick={() => setZoomSlip(o.slipUrl!)}
                        className="flex h-10 items-center gap-1.5 rounded-full bg-sage/20 px-3 text-xs font-bold text-ok"
                      >
                        <Icon name="receipt" size={16} />
                        ดูสลิป
                      </button>
                    ) : (
                      <span className="flex h-10 items-center gap-1.5 rounded-full bg-honey/20 px-3 text-xs font-bold text-wait">
                        <Icon name="clock" size={16} />
                        ยังไม่แนบสลิป
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => {
                        if (
                          !confirm(
                            `ยืนยันว่าได้รับเงิน ${o.price.toLocaleString()} บาท จาก ${o.customerName}?\n` +
                              (o.kind === "credit"
                                ? `ระบบจะเติมเครดิต ${(o.creditAmount ?? o.price).toLocaleString()}฿ ให้ลูกค้าทันที`
                                : `ระบบจะเพิ่มคอร์ส "${o.name}" (${o.totalUses} ${o.kind === "nights" ? "คืน" : "ครั้ง"}) ให้ลูกค้าทันที`)
                          )
                        )
                          return;
                        patch(
                          { action: "confirm_order", orderId: o.id },
                          o.kind === "credit"
                            ? "ยืนยันรับเงินแล้ว — เติมเครดิตให้ลูกค้าเรียบร้อย 💰"
                            : "ยืนยันรับเงินแล้ว — เพิ่มคอร์สให้ลูกค้าเรียบร้อย 🎫",
                          o.id
                        );
                      }}
                      className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-petflow-chocolate text-xs font-extrabold text-card disabled:opacity-40"
                    >
                      <Icon name="check" size={16} strokeWidth={2.2} />
                      {busy === o.id ? "…" : "ได้รับเงินแล้ว"}
                    </button>
                    <MoreMenu
                      items={[
                        {
                          label: "ยกเลิกออร์เดอร์",
                          icon: "x",
                          danger: true,
                          disabled: !!busy,
                          onClick: () => {
                            if (!confirm("ยกเลิกออร์เดอร์นี้? (ลูกค้าจะไม่ได้คอร์ส)")) return;
                            patch({ action: "cancel_order", orderId: o.id }, "ยกเลิกออร์เดอร์แล้ว", o.id);
                          },
                        },
                      ]}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── คอร์สที่เปิดขาย ── */}
      <section>
        <SectionLabel>For sale · คอร์สที่เปิดขาย ({offers.length})</SectionLabel>
        <div className="rounded-petflow bg-card shadow-petflow-sm">
          {offers.length === 0 ? (
            <EmptyState icon="bag" title="ยังไม่มีคอร์สที่เปิดขาย" sub="กด “เพิ่มคอร์ส” ด้านบนเพื่อเริ่มขาย" />
          ) : (
            <ul className="divide-y divide-petflow-line">
              {offers.map((o) => (
                <OfferRow key={o.id} offer={o} patch={patch} pickImage={pickImage} programs={groomPrograms} />
              ))}
            </ul>
          )}
        </div>
        {offers.length > 0 && (
          <p className="mt-1.5 px-1 text-[10px] text-brown-faint">แตะรูปเพื่อเปลี่ยนรูป · แตะชื่อเพื่อแก้ไข</p>
        )}
      </section>

      {/* ── ประวัติออร์เดอร์ ── */}
      {done.length > 0 && (
        <details className="group rounded-petflow bg-card shadow-petflow-sm [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex min-h-[48px] cursor-pointer list-none items-center gap-3 px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-paper text-brown">
              <Icon name="doc" size={18} />
            </span>
            <span className="flex-1 text-sm font-extrabold text-petflow-chocolate">
              ออร์เดอร์ที่จบแล้ว ({done.length})
            </span>
            <Icon name="chevron" size={16} className="text-brown-faint transition group-open:rotate-90" />
          </summary>
          <ul className="divide-y divide-petflow-line border-t border-petflow-line">
            {done.map((o) => (
              <li key={o.id} className="flex items-center gap-2 py-1 pl-4 pr-2 text-xs">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-brown">{o.name}</span>
                  <span className="block truncate text-[11px] text-brown-soft">
                    {(o.paidAt || o.createdAt).slice(0, 10)} · {o.customerName}
                  </span>
                </span>
                <span className={`shrink-0 font-bold ${o.status === "paid" ? "text-ok" : "text-wait"}`}>
                  {o.status === "paid" ? `${o.price.toLocaleString()} ฿` : "ยกเลิก"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm("ลบออร์เดอร์นี้ออกจากประวัติ? (ไม่กระทบคอร์สที่ลูกค้าได้ไปแล้ว)")) return;
                    patch({ action: "delete_order", orderId: o.id }, "ลบออกจากประวัติแล้ว", o.id);
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-brown-faint hover:text-wait"
                  aria-label="ลบออร์เดอร์นี้"
                >
                  <Icon name="trash" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* ดูสลิปเต็มจอ */}
      {zoomSlip && (
        <button
          type="button"
          onClick={() => setZoomSlip(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoomSlip} alt="สลิปโอนเงิน" className="max-h-full max-w-full rounded-petflow object-contain" />
        </button>
      )}
    </div>
  );
}
