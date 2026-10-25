"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { BTN_PRIMARY } from "@/components/PageHeader";
import { toast } from "@/components/Toast";
import { toJpegDataUrl } from "@/lib/image-convert";
import { EmptyState, MoreMenu, SearchField, SectionLabel, Segmented } from "@/components/ui";
import type { DayTotals, PosClosing, PosMethod, PosProduct, PosSale, StockMove } from "@/lib/pos-store";

const FIELD = "w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm text-brown";
const baht = (n: number) => `฿${(Math.round(n * 100) / 100).toLocaleString("th-TH")}`;
const METHOD_LABEL: Record<PosMethod, string> = { cash: "เงินสด", promptpay: "QR พร้อมเพย์", transfer: "โอน" };

type CartLine = { key: string; productId?: string; name: string; price: number; qty: number; max?: number };

/** ขายหน้าร้าน (POS) — อยู่เป็นแท็บหนึ่งในหน้าคิดเงิน (/admin/billing?view=pos) */
export function PosPanel({ header }: { header?: React.ReactNode }) {
  const [view, setView] = useState<"sell" | "products" | "close">("sell");
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadProducts = useCallback(async () => {
    const d = await fetch("/api/pos/products?all=1").then((r) => r.json()).catch(() => ({}));
    setProducts(d.products || []);
    setLoaded(true);
  }, []);
  useEffect(() => {
    loadProducts();
  }, [loadProducts]);
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => {
        const name = c?.business?.name;
        slipShopName = typeof name === "string" ? name : name?.th || "";
      })
      .catch(() => {});
  }, []);

  const lowCount = products.filter((p) => p.active && p.trackStock && p.stock <= (p.lowStock ?? 0)).length;

  return (
    <div className="pb-28">
      {header}
      <Segmented
        value={view}
        onChange={setView}
        className="mb-4"
        options={[
          { id: "sell", label: "ขาย", icon: "cart" },
          { id: "products", label: "สินค้า", icon: "box", badge: lowCount || undefined },
          { id: "close", label: "ปิดยอด", icon: "wallet" },
        ]}
      />
      {view === "sell" && <SellView products={products.filter((p) => p.active)} loaded={loaded} onSold={loadProducts} />}
      {view === "products" && <ProductsView products={products} onChanged={loadProducts} />}
      {view === "close" && <CloseView />}
    </div>
  );
}

// ── ขาย ────────────────────────────────────────────────

function SellView({ products, loaded, onSold }: { products: PosProduct[]; loaded: boolean; onSold: () => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkout, setCheckout] = useState(false);
  const [custom, setCustom] = useState<{ name: string; price: string } | null>(null);
  const [sales, setSales] = useState<PosSale[]>([]);

  const loadSales = useCallback(async () => {
    const d = await fetch("/api/pos/sales").then((r) => r.json()).catch(() => ({}));
    setSales(d.sales || []);
  }, []);
  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean) as string[])].sort(),
    [products]
  );
  const shown = products.filter((p) => {
    if (cat && p.category !== cat) return false;
    const s = q.trim().toLowerCase();
    return !s || p.name.toLowerCase().includes(s) || (p.sku || "").toLowerCase() === s;
  });

  const inCart = (id: string) => cart.find((l) => l.productId === id)?.qty || 0;
  const add = (p: PosProduct) => {
    if (p.trackStock && inCart(p.id) >= p.stock) {
      toast(`${p.name} เหลือ ${p.stock} ชิ้น`, "error");
      return;
    }
    setCart((c) => {
      const i = c.findIndex((l) => l.productId === p.id);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { key: p.id, productId: p.id, name: p.name, price: p.price, qty: 1, max: p.trackStock ? p.stock : undefined }];
    });
  };

  // เครื่องสแกนบาร์โค้ดพิมพ์รหัสแล้วกด Enter — ตรงรหัสสินค้าก็หยิบใส่ตะกร้าเลย
  const onSearchEnter = () => {
    const s = q.trim().toLowerCase();
    const hit = products.find((p) => (p.sku || "").toLowerCase() === s) || (shown.length === 1 ? shown[0] : undefined);
    if (hit) {
      add(hit);
      setQ("");
    }
  };

  const count = cart.reduce((s, l) => s + l.qty, 0);
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);

  return (
    <div className="space-y-4">
      <div onKeyDown={(e) => e.key === "Enter" && onSearchEnter()}>
        <SearchField value={q} onChange={setQ} placeholder="ค้นหาสินค้า หรือสแกนบาร์โค้ด" />
      </div>
      {categories.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {["", ...categories].map((c) => (
            <button
              key={c || "all"}
              type="button"
              onClick={() => setCat(c)}
              className={`h-9 shrink-0 rounded-full px-3.5 text-xs font-bold ${
                cat === c ? "bg-petflow-chocolate text-card" : "bg-card text-brown-soft ring-1 ring-petflow-line"
              }`}
            >
              {c || "ทั้งหมด"}
            </button>
          ))}
        </div>
      )}

      {!loaded ? (
        <p className="py-6 text-center text-xs text-brown-soft">กำลังโหลด…</p>
      ) : products.length === 0 ? (
        <div className="rounded-petflow bg-card shadow-petflow-sm">
          <EmptyState icon="box" title="ยังไม่มีสินค้า" sub="ไปที่แท็บ สินค้า เพื่อเพิ่มรายการแรก" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {shown.map((p) => {
            const left = p.trackStock ? p.stock - inCart(p.id) : null;
            const out = left !== null && left <= 0;
            const low = left !== null && !out && left <= (p.lowStock ?? 0);
            const n = inCart(p.id);
            return (
              <button
                key={p.id}
                type="button"
                disabled={out && n === 0}
                onClick={() => add(p)}
                className={`relative flex min-h-[92px] flex-col items-start justify-between rounded-petflow-sm bg-card p-3 text-left shadow-petflow-sm ring-1 transition active:scale-[0.98] disabled:opacity-45 ${
                  n ? "ring-2 ring-latte-deep" : "ring-petflow-line"
                }`}
              >
                {p.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="mb-2 aspect-[4/3] w-full rounded-lg bg-paper object-cover" />
                )}
                {n > 0 && (
                  <span className="absolute right-2 top-2 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-latte-deep px-1.5 text-[11px] font-extrabold text-card">
                    {n}
                  </span>
                )}
                <span className="line-clamp-2 pr-6 text-sm font-bold leading-snug text-brown">{p.name}</span>
                <span className="mt-2 flex w-full items-end justify-between gap-1">
                  <span className="text-base font-extrabold text-petflow-chocolate">{baht(p.price)}</span>
                  {left !== null && (
                    <span className={`text-[10px] font-bold ${out ? "text-wait" : low ? "text-wait" : "text-brown-faint"}`}>
                      {out ? "หมด" : `เหลือ ${left}`}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setCustom({ name: "", price: "" })}
            className="flex min-h-[92px] flex-col items-center justify-center gap-1 rounded-petflow-sm border border-dashed border-petflow-line text-xs font-bold text-brown-soft"
          >
            <Icon name="plus" size={18} />
            พิมพ์รายการเอง
          </button>
        </div>
      )}

      <TodaySales sales={sales} onVoided={() => { loadSales(); onSold(); }} />

      {count > 0 && !checkout && (
        <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 px-4 lg:bottom-4 lg:left-64">
          <button
            type="button"
            onClick={() => setCheckout(true)}
            className="mx-auto flex min-h-[56px] w-full max-w-xl items-center gap-3 rounded-full bg-petflow-chocolate px-5 text-card shadow-petflow"
          >
            <Icon name="cart" size={20} />
            <span className="flex-1 text-left text-sm font-bold">{count} ชิ้น</span>
            <span className="text-base font-extrabold">{baht(subtotal)}</span>
            <Icon name="chevron" size={16} />
          </button>
        </div>
      )}

      {custom && (
        <Sheet title="พิมพ์รายการเอง" onClose={() => setCustom(null)}>
          <div className="space-y-3">
            <input autoFocus value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="ชื่อรายการ" className={FIELD} />
            <input value={custom.price} onChange={(e) => setCustom({ ...custom, price: e.target.value })} placeholder="ราคา (บาท)" inputMode="decimal" className={FIELD} />
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={!custom.name.trim() || !(Number(custom.price) > 0)}
              onClick={() => {
                setCart((c) => [...c, { key: `c${Date.now()}`, name: custom.name.trim(), price: Number(custom.price), qty: 1 }]);
                setCustom(null);
              }}
            >
              ใส่ตะกร้า
            </button>
          </div>
        </Sheet>
      )}

      {checkout && (
        <Checkout
          cart={cart}
          setCart={setCart}
          onClose={() => setCheckout(false)}
          onDone={() => {
            setCart([]);
            setCheckout(false);
            loadSales();
            onSold();
          }}
        />
      )}
    </div>
  );
}

function Checkout({
  cart,
  setCart,
  onClose,
  onDone,
}: {
  cart: CartLine[];
  setCart: (fn: (c: CartLine[]) => CartLine[]) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const [method, setMethod] = useState<PosMethod>("cash");
  const [discount, setDiscount] = useState("");
  const [received, setReceived] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [qr, setQr] = useState<{ dataUrl?: string; account?: string; name?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<PosSale | null>(null);

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const disc = Math.min(subtotal, Math.max(0, Number(discount) || 0));
  const total = Math.round((subtotal - disc) * 100) / 100;
  const got = Number(received) || 0;
  const change = got - total;

  useEffect(() => {
    if (method !== "promptpay" || total <= 0) return;
    let alive = true;
    setQr(null);
    fetch(`/api/pos/qr?amount=${total}`)
      .then(async (r) => (r.ok ? r.json() : { error: "no_promptpay" }))
      .then((d) => alive && setQr(d));
    return () => {
      alive = false;
    };
  }, [method, total]);

  const setQty = (key: string, qty: number) =>
    setCart((c) => c.flatMap((l) => (l.key !== key ? [l] : qty <= 0 ? [] : [{ ...l, qty: l.max != null ? Math.min(qty, l.max) : qty }])));

  const pay = async () => {
    setBusy(true);
    setError("");
    const res = await fetch("/api/pos/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart.map((l) => ({ productId: l.productId, name: l.name, price: l.price, qty: l.qty })),
        discount: disc,
        method,
        cashReceived: method === "cash" ? got || total : undefined,
        customerName: customerName.trim() || undefined,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(d.error || "บันทึกไม่สำเร็จ");
      return;
    }
    setDone(d.sale);
  };

  if (done) {
    return (
      <Sheet title="รับเงินแล้ว" onClose={onDone}>
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage/25 text-ok">
            <Icon name="check" size={28} strokeWidth={2.4} />
          </span>
          <p className="mt-3 text-xs text-brown-soft">{done.no} · {METHOD_LABEL[done.method]}</p>
          <p className="mt-1 text-2xl font-extrabold text-petflow-chocolate">{baht(done.total)}</p>
          {done.method === "cash" && (done.change ?? 0) > 0 && (
            <p className="mt-3 rounded-petflow-sm bg-honey/30 px-3 py-3 text-lg font-extrabold text-petflow-chocolate">
              ทอน {baht(done.change || 0)}
            </p>
          )}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => printSlip(done)} className="flex min-h-[48px] items-center justify-center gap-2 rounded-petflow-sm bg-paper text-sm font-bold text-brown">
            <Icon name="receipt" size={18} />
            พิมพ์ใบเสร็จ
          </button>
          <button type="button" onClick={onDone} className={BTN_PRIMARY}>
            บิลใหม่
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="ชำระเงิน" onClose={onClose}>
      <ul className="divide-y divide-petflow-line rounded-petflow-sm bg-paper">
        {cart.map((l) => (
          <li key={l.key} className="flex items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-brown">{l.name}</span>
              <span className="text-[11px] text-brown-soft">{baht(l.price)}</span>
            </span>
            <button type="button" aria-label="ลด" onClick={() => setQty(l.key, l.qty - 1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-lg font-bold text-brown">−</button>
            <span className="w-6 text-center text-sm font-extrabold">{l.qty}</span>
            <button type="button" aria-label="เพิ่ม" onClick={() => setQty(l.key, l.qty + 1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-lg font-bold text-brown">+</button>
            <span className="w-16 text-right text-sm font-bold text-petflow-chocolate">{baht(l.price * l.qty)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="ส่วนลด (บาท)" className={FIELD} />
        <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="ชื่อลูกค้า (ถ้ามี)" className={FIELD} />
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-sm font-bold text-brown-soft">ยอดชำระ{disc > 0 ? ` (ลด ${baht(disc)})` : ""}</span>
        <span className="text-2xl font-extrabold text-petflow-chocolate">{baht(total)}</span>
      </div>

      <Segmented
        value={method}
        onChange={setMethod}
        className="mt-3"
        options={[
          { id: "cash", label: "เงินสด", icon: "money" },
          { id: "promptpay", label: "QR", icon: "qr" },
          { id: "transfer", label: "โอน", icon: "card" },
        ]}
      />

      {method === "cash" && (
        <div className="mt-3 space-y-2">
          <input value={received} onChange={(e) => setReceived(e.target.value)} inputMode="decimal" placeholder={`รับเงินมา (ว่าง = พอดี ${baht(total)})`} className={`${FIELD} text-base`} />
          <div className="flex flex-wrap gap-2">
            {[...new Set([Math.ceil(total), ...[100, 500, 1000].filter((n) => n > total)])].slice(0, 4).map((n) => (
              <button key={n} type="button" onClick={() => setReceived(String(n))} className="h-9 rounded-full bg-paper px-3.5 text-xs font-bold text-brown">
                {baht(n)}
              </button>
            ))}
          </div>
          {got > 0 && (
            <p className={`rounded-petflow-sm px-3 py-2 text-sm font-extrabold ${change < 0 ? "bg-wait/10 text-wait" : "bg-honey/30 text-petflow-chocolate"}`}>
              {change < 0 ? `ยังขาด ${baht(-change)}` : `ทอน ${baht(change)}`}
            </p>
          )}
        </div>
      )}

      {method === "promptpay" && (
        <div className="mt-3 rounded-petflow-sm bg-paper p-3 text-center">
          {!qr ? (
            <p className="py-8 text-xs text-brown-soft">กำลังสร้าง QR…</p>
          ) : qr.error ? (
            <p className="py-4 text-xs font-bold text-wait">ยังไม่ได้ใส่เลขพร้อมเพย์ — ไปที่ ตั้งค่า › การชำระเงิน</p>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr.dataUrl} alt="QR พร้อมเพย์" className="mx-auto h-56 w-56 rounded-lg bg-white p-2" />
              <p className="mt-2 text-xs text-brown-soft">
                พร้อมเพย์ {qr.account}
                {qr.name ? ` · ${qr.name}` : ""}
              </p>
              <p className="text-[11px] text-brown-faint">ดูสลิปลูกค้าว่าเงินเข้าแล้ว ค่อยกดยืนยัน</p>
            </>
          )}
        </div>
      )}

      {error && <p className="mt-3 rounded-petflow-sm bg-wait/10 px-3 py-2 text-xs font-bold text-wait">{error}</p>}

      <button
        type="button"
        disabled={busy || cart.length === 0 || (method === "cash" && got > 0 && change < 0)}
        onClick={pay}
        className={`mt-4 ${BTN_PRIMARY}`}
      >
        {busy ? "กำลังบันทึก…" : method === "cash" ? `รับเงินสด ${baht(total)}` : `ได้รับเงินแล้ว ${baht(total)}`}
      </button>
    </Sheet>
  );
}

function TodaySales({ sales, onVoided }: { sales: PosSale[]; onVoided: () => void }) {
  if (!sales.length) return null;
  const paid = sales.filter((s) => s.status === "paid");
  const total = paid.reduce((s, x) => s + x.total, 0);
  const voidSale = async (s: PosSale) => {
    if (!confirm(`ยกเลิกบิล ${s.no} ${baht(s.total)}?\nสต็อกจะคืนและรายรับจะถูกลบ`)) return;
    const res = await fetch("/api/pos/sales", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id }) });
    if (res.ok) {
      toast("ยกเลิกบิลแล้ว");
      onVoided();
    } else toast("ยกเลิกไม่สำเร็จ", "error");
  };
  return (
    <section>
      <SectionLabel>Today · ขายวันนี้ {paid.length} บิล · {baht(total)}</SectionLabel>
      <ul className="divide-y divide-petflow-line rounded-petflow bg-card shadow-petflow-sm">
        {sales.map((s) => (
          <li key={s.id} className={`flex items-center gap-3 px-4 py-2.5 ${s.status === "void" ? "opacity-50" : ""}`}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-brown">
                {s.items.map((i) => (i.qty > 1 ? `${i.name} x${i.qty}` : i.name)).join(", ")}
              </span>
              <span className="text-[11px] text-brown-soft">
                {s.no} · {new Date(s.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })} · {METHOD_LABEL[s.method]}
                {s.customerName ? ` · ${s.customerName}` : ""}
                {s.status === "void" ? " · ยกเลิกแล้ว" : ""}
              </span>
            </span>
            <span className={`text-sm font-extrabold ${s.status === "void" ? "text-brown-faint line-through" : "text-petflow-chocolate"}`}>{baht(s.total)}</span>
            <MoreMenu
              items={[
                { label: "พิมพ์ใบเสร็จ", icon: "receipt", onClick: () => printSlip(s) },
                { label: "ยกเลิกบิล", icon: "x", danger: true, disabled: s.status === "void", onClick: () => voidSale(s) },
              ]}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** ใบเสร็จย่อแบบเครื่องพิมพ์สลิป 58/80 มม. — เปิดหน้าต่างใหม่แล้วสั่งพิมพ์ */
/** ชื่อร้านที่หัวสลิป — โหลดจากตั้งค่าของร้านตอนเปิดหน้าขายหน้าร้าน */
let slipShopName = "";

function printSlip(s: PosSale) {
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) return;
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const row = (a: string, b: string) => `<tr><td>${a}</td><td class="r">${b}</td></tr>`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.no)}</title>
<style>body{font:13px/1.45 system-ui,sans-serif;width:72mm;margin:0 auto;padding:8px;color:#000}h1{font-size:16px;text-align:center;margin:0 0 2px}p{margin:0;text-align:center}table{width:100%;border-collapse:collapse;margin:8px 0}td{padding:2px 0;vertical-align:top}.r{text-align:right;white-space:nowrap}hr{border:0;border-top:1px dashed #000;margin:6px 0}.b td{font-weight:700;font-size:15px}@page{margin:0}</style>
</head><body><h1>${esc(slipShopName || "ใบเสร็จ")}</h1><p>ใบเสร็จรับเงิน</p><p>${esc(s.no)} · ${new Date(s.createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</p><hr>
<table>${s.items.map((i) => row(`${esc(i.name)}${i.qty > 1 ? ` x${i.qty}` : ""}`, (i.price * i.qty).toLocaleString())).join("")}</table><hr>
<table>${s.discount > 0 ? row("ส่วนลด", `-${s.discount.toLocaleString()}`) : ""}<tbody class="b">${row("รวม", `${s.total.toLocaleString()} บาท`)}</tbody>
${row(METHOD_LABEL[s.method], (s.cashReceived ?? s.total).toLocaleString())}${s.change ? row("ทอน", s.change.toLocaleString()) : ""}</table>
<hr><p>ขอบคุณค่ะ</p><script>window.onload=()=>{window.print();}</script></body></html>`);
  w.document.close();
}

// ── สินค้า ─────────────────────────────────────────────

function ProductsView({ products, onChanged }: { products: PosProduct[]; onChanged: () => void }) {
  const [q, setQ] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [editing, setEditing] = useState<PosProduct | "new" | null>(null);
  const isLow = (p: PosProduct) => p.trackStock && p.stock <= (p.lowStock ?? 0);
  const shown = products.filter((p) => {
    if (onlyLow && !(p.active && isLow(p))) return false;
    const s = q.trim().toLowerCase();
    return !s || p.name.toLowerCase().includes(s) || (p.sku || "").toLowerCase().includes(s) || (p.category || "").toLowerCase().includes(s);
  });
  const lowCount = products.filter((p) => p.active && isLow(p)).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <SearchField value={q} onChange={setQ} placeholder="ค้นหาสินค้า" className="flex-1" />
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-petflow-chocolate px-4 text-sm font-bold text-card shadow-petflow-sm"
        >
          <Icon name="plus" size={18} />
          เพิ่ม
        </button>
      </div>
      {lowCount > 0 && (
        <button
          type="button"
          onClick={() => setOnlyLow((v) => !v)}
          className={`flex min-h-[40px] w-full items-center gap-2 rounded-petflow-sm px-3 text-xs font-bold ${
            onlyLow ? "bg-wait text-card" : "bg-wait/10 text-wait"
          }`}
        >
          <Icon name="alert" size={15} />
          ใกล้หมด / หมดแล้ว {lowCount} รายการ {onlyLow ? "· แสดงทั้งหมด" : "· แตะเพื่อดู"}
        </button>
      )}
      {products.length === 0 ? (
        <div className="rounded-petflow bg-card shadow-petflow-sm">
          <EmptyState icon="box" title="ยังไม่มีสินค้า" sub="เพิ่มอาหาร ทราย ขนม ของเล่น หรือบริการเสริมที่ขายหน้าร้าน" />
        </div>
      ) : (
        <ul className="divide-y divide-petflow-line rounded-petflow bg-card shadow-petflow-sm">
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setEditing(p)} className={`flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left ${p.active ? "" : "opacity-50"}`}>
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl bg-paper object-cover" />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-honey/30 text-petflow-chocolate">
                    <Icon name="box" size={18} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-brown">{p.name}</span>
                  <span className="text-[11px] text-brown-soft">
                    {[p.category, p.sku, p.active ? "" : "ปิดขาย"].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-extrabold text-petflow-chocolate">{baht(p.price)}</span>
                  {p.trackStock && (
                    <span className={`text-[11px] font-bold ${isLow(p) ? "text-wait" : "text-brown-soft"}`}>
                      {p.stock <= 0 ? "หมด" : `เหลือ ${p.stock}`}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <ProductSheet
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function ProductSheet({ product, onClose, onSaved }: { product: PosProduct | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: product?.name || "",
    imageUrl: product?.imageUrl || "",
    price: product ? String(product.price) : "",
    cost: product?.cost != null ? String(product.cost) : "",
    sku: product?.sku || "",
    category: product?.category || "",
    trackStock: product?.trackStock ?? true,
    stock: "",
    lowStock: product?.lowStock != null ? String(product.lowStock) : "3",
    active: product?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [restock, setRestock] = useState("");
  const [moves, setMoves] = useState<StockMove[]>([]);

  useEffect(() => {
    if (!product) return;
    fetch(`/api/pos/products?moves=${product.id}`).then((r) => r.json()).then((d) => setMoves(d.moves || [])).catch(() => {});
  }, [product]);

  const save = async () => {
    setBusy(true);
    const res = await fetch("/api/pos/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: product?.id,
        name: f.name,
        imageUrl: f.imageUrl,
        price: Number(f.price) || 0,
        cost: f.cost === "" ? null : Number(f.cost),
        sku: f.sku,
        category: f.category,
        trackStock: f.trackStock,
        stock: product ? undefined : Number(f.stock) || 0,
        lowStock: f.lowStock === "" ? null : Number(f.lowStock),
        active: f.active,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(d.error || "บันทึกไม่สำเร็จ", "error");
    toast("บันทึกแล้ว");
    onSaved();
  };

  const moveStock = async (reason: "restock" | "adjust") => {
    if (!product) return;
    const n = Math.round(Number(restock) || 0);
    if (!n) return;
    // ปรับยอด = พิมพ์จำนวนที่นับได้จริง ระบบคำนวณส่วนต่างให้
    const qty = reason === "adjust" ? n - product.stock : n;
    const res = await fetch("/api/pos/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: product.id, qty, reason, note: reason === "adjust" ? `นับได้ ${n}` : undefined }),
    });
    if (!res.ok) return toast("ปรับสต็อกไม่สำเร็จ", "error");
    toast(reason === "restock" ? `รับเข้า ${n} ชิ้น` : `ปรับเป็น ${n} ชิ้น`);
    onSaved();
  };

  const REASON: Record<string, string> = { sale: "ขาย", restock: "รับเข้า", adjust: "ปรับยอด", void: "ยกเลิกบิล" };

  return (
    <Sheet title={product ? "แก้สินค้า" : "เพิ่มสินค้า"} onClose={onClose}>
      <div className="space-y-2.5">
        <div className="flex items-center gap-3">
          <label className="relative flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-petflow-sm border border-dashed border-petflow-line bg-paper text-brown-soft">
            {f.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-0.5 text-[10px] font-bold">
                <Icon name="image" size={20} />
                ใส่รูป
              </span>
            )}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  setF((cur) => ({ ...cur, imageUrl: "" }));
                  const url = await toJpegDataUrl(file, 600);
                  setF((cur) => ({ ...cur, imageUrl: url }));
                } catch {
                  toast("อ่านรูปไม่ได้ ลองรูปอื่นนะคะ", "error");
                }
              }}
            />
          </label>
          <div className="min-w-0 flex-1 text-[11px] text-brown-soft">
            รูปสินค้าจะโชว์ในหน้าขาย ให้กดหาง่ายขึ้น
            {f.imageUrl && (
              <button type="button" onClick={() => setF({ ...f, imageUrl: "" })} className="mt-1 block font-bold text-wait">
                ลบรูป
              </button>
            )}
          </div>
        </div>
        <input autoFocus={!product} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="ชื่อสินค้า เช่น ทรายเต้าหู้ 6 ลิตร" className={FIELD} />
        <div className="grid grid-cols-2 gap-2">
          <input value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} inputMode="decimal" placeholder="ราคาขาย" className={FIELD} />
          <input value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} inputMode="decimal" placeholder="ต้นทุน (ถ้ามี)" className={FIELD} />
          <input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="หมวด เช่น อาหาร" className={FIELD} list="pos-cats" />
          <input value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} placeholder="บาร์โค้ด (ถ้ามี)" className={FIELD} />
        </div>
        <datalist id="pos-cats">
          {["อาหาร", "ขนม", "ทราย", "ของเล่น", "อุปกรณ์", "บริการเสริม"].map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <label className="flex min-h-[44px] items-center justify-between rounded-petflow-sm bg-paper px-3 text-sm font-bold text-brown">
          นับสต็อก
          <input type="checkbox" checked={f.trackStock} onChange={(e) => setF({ ...f, trackStock: e.target.checked })} className="h-5 w-5 accent-latte-deep" />
        </label>
        {f.trackStock && (
          <div className="grid grid-cols-2 gap-2">
            {!product && (
              <input value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} inputMode="numeric" placeholder="สต็อกตั้งต้น" className={FIELD} />
            )}
            <label className="flex items-center gap-2 rounded-petflow-sm border border-petflow-line bg-paper px-3 text-xs text-brown-soft">
              เตือนเมื่อเหลือ
              <input value={f.lowStock} onChange={(e) => setF({ ...f, lowStock: e.target.value })} inputMode="numeric" className="h-10 w-full min-w-0 bg-transparent text-sm text-brown outline-none" />
            </label>
          </div>
        )}
        {product && (
          <label className="flex min-h-[44px] items-center justify-between rounded-petflow-sm bg-paper px-3 text-sm font-bold text-brown">
            เปิดขาย
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="h-5 w-5 accent-latte-deep" />
          </label>
        )}
        <button type="button" disabled={busy || !f.name.trim()} onClick={save} className={BTN_PRIMARY}>
          {busy ? "กำลังบันทึก…" : "บันทึก"}
        </button>

        {product && product.trackStock && (
          <div className="mt-2 rounded-petflow-sm border border-petflow-line p-3">
            <p className="mb-2 text-xs font-extrabold text-petflow-chocolate">สต็อกตอนนี้ {product.stock} ชิ้น</p>
            <div className="flex gap-2">
              <input value={restock} onChange={(e) => setRestock(e.target.value)} inputMode="numeric" placeholder="จำนวน" className={`${FIELD} min-w-0 flex-1`} />
              <button type="button" onClick={() => moveStock("restock")} className="shrink-0 rounded-petflow-sm bg-sage/30 px-3 text-xs font-bold text-petflow-chocolate">
                รับของเข้า
              </button>
              <button type="button" onClick={() => moveStock("adjust")} className="shrink-0 rounded-petflow-sm bg-paper px-3 text-xs font-bold text-brown">
                นับได้เท่านี้
              </button>
            </div>
            {moves.length > 0 && (
              <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-[11px] text-brown-soft">
                {moves.map((m) => (
                  <li key={m.id} className="flex justify-between gap-2">
                    <span>
                      {new Date(m.createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" })} · {REASON[m.reason] || m.reason}
                      {m.note ? ` · ${m.note}` : ""}
                    </span>
                    <span className={`font-bold ${m.qty < 0 ? "text-wait" : "text-ok"}`}>{m.qty > 0 ? `+${m.qty}` : m.qty}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ── ปิดยอด ─────────────────────────────────────────────

function CloseView() {
  const [data, setData] = useState<{ date: string; totals: DayTotals; closing: PosClosing | null; history: PosClosing[] } | null>(null);
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch("/api/pos/close").then((r) => r.json()).catch(() => null);
    setData(d);
    if (d?.closing) {
      setOpening(String(d.closing.openingCash || ""));
      setCounted(String(d.closing.countedCash));
      setNote(d.closing.note || "");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <p className="py-6 text-center text-xs text-brown-soft">กำลังโหลด…</p>;
  const t = data.totals;
  const cashIn = t.pos.cash + t.services.cash;
  const expected = (Number(opening) || 0) + cashIn;
  const diff = counted === "" ? null : (Number(counted) || 0) - expected;
  const grand = t.pos.cash + t.pos.promptpay + t.pos.transfer + t.services.cash + t.services.transfer + t.services.member_credit;

  const save = async () => {
    setBusy(true);
    const res = await fetch("/api/pos/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openingCash: Number(opening) || 0, countedCash: counted, note }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(d.error || "บันทึกไม่สำเร็จ", "error");
    toast("ปิดยอดแล้ว");
    load();
  };

  const Row = ({ label, value, strong }: { label: string; value: number; strong?: boolean }) => (
    <div className={`flex items-center justify-between py-1.5 text-sm ${strong ? "font-extrabold text-petflow-chocolate" : "text-brown"}`}>
      <span>{label}</span>
      <span className={strong ? "" : "font-bold"}>{baht(value)}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <section>
        <SectionLabel>Today · ยอดวันนี้ {new Date(`${data.date}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</SectionLabel>
        <div className="rounded-petflow bg-card p-4 shadow-petflow-sm">
          <p className="text-[11px] font-bold text-brown-soft">ขายหน้าร้าน · {t.posCount} บิล</p>
          <Row label="เงินสด" value={t.pos.cash} />
          <Row label="QR พร้อมเพย์" value={t.pos.promptpay} />
          <Row label="โอน" value={t.pos.transfer} />
          <p className="mt-2 border-t border-petflow-line pt-2 text-[11px] font-bold text-brown-soft">บิลบริการ (อาบน้ำ/ห้องพัก) · {t.servicesCount} บิล</p>
          <Row label="เงินสด" value={t.services.cash} />
          <Row label="โอน" value={t.services.transfer} />
          {t.services.member_credit > 0 && <Row label="เครดิต Member" value={t.services.member_credit} />}
          <div className="mt-2 border-t border-petflow-line pt-1">
            <Row label="รวมทั้งวัน" value={grand} strong />
          </div>
        </div>
      </section>

      <section>
        <SectionLabel>Cash count · นับเงินในลิ้นชัก</SectionLabel>
        <div className="space-y-2.5 rounded-petflow bg-card p-4 shadow-petflow-sm">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-bold text-brown-soft">
              เงินทอนตั้งต้น
              <input value={opening} onChange={(e) => setOpening(e.target.value)} inputMode="decimal" placeholder="0" className={`mt-1 ${FIELD}`} />
            </label>
            <label className="text-[11px] font-bold text-brown-soft">
              นับได้จริง
              <input value={counted} onChange={(e) => setCounted(e.target.value)} inputMode="decimal" placeholder="0" className={`mt-1 ${FIELD}`} />
            </label>
          </div>
          <div className="rounded-petflow-sm bg-paper px-3 py-2">
            <Row label="ควรมีเงินสด" value={expected} />
            {diff !== null && (
              <p className={`flex justify-between py-1 text-sm font-extrabold ${Math.abs(diff) < 0.01 ? "text-ok" : "text-wait"}`}>
                <span>{Math.abs(diff) < 0.01 ? "ตรงพอดี" : diff > 0 ? "เกิน" : "ขาด"}</span>
                <span>{Math.abs(diff) < 0.01 ? "✓" : baht(Math.abs(diff))}</span>
              </p>
            )}
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุ (ถ้ามี)" className={FIELD} />
          <button type="button" disabled={busy || counted === ""} onClick={save} className={BTN_PRIMARY}>
            {busy ? "กำลังบันทึก…" : data.closing ? "บันทึกปิดยอดใหม่" : "ปิดยอดวันนี้"}
          </button>
          {data.closing && (
            <p className="text-center text-[11px] text-brown-soft">
              ปิดยอดไว้แล้วเมื่อ {new Date(data.closing.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}
            </p>
          )}
        </div>
      </section>

      {data.history.length > 0 && (
        <section>
          <SectionLabel>History · ปิดยอดย้อนหลัง</SectionLabel>
          <ul className="divide-y divide-petflow-line rounded-petflow bg-card shadow-petflow-sm">
            {data.history.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="flex-1 text-brown">
                  {new Date(`${c.date}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                  <span className="ml-2 text-[11px] text-brown-soft">เงินสด {baht(c.countedCash)}</span>
                </span>
                <span className={`text-xs font-bold ${Math.abs(c.diff) < 0.01 ? "text-ok" : "text-wait"}`}>
                  {Math.abs(c.diff) < 0.01 ? "ตรง" : `${c.diff > 0 ? "เกิน" : "ขาด"} ${baht(Math.abs(c.diff))}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-petflow-chocolate/40 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-petflow bg-card p-4 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-petflow sm:rounded-petflow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-petflow-chocolate">{title}</h2>
          <button type="button" aria-label="ปิด" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-paper text-brown">
            <Icon name="x" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
