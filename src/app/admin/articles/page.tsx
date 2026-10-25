"use client";

import { Icon } from "@/components/Icon";
import { EmptyState, MoreMenu, SectionLabel } from "@/components/ui";
import { useCallback, useEffect, useState } from "react";
import { toJpegDataUrl } from "@/lib/image-convert";
import { toast } from "@/components/Toast";

/**
 * จัดการบทความหน้าเว็บ — เพิ่ม/แก้/ลบบทความ + อัปรูปปกเอง ไม่ต้องแก้โค้ด
 * บทความโชว์รวมกับบทความ SEO เดิมที่ /blog อัตโนมัติ
 */

type Article = {
  id: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  coverUrl?: string;
  emoji: string;
  published: boolean;
  datePublished: string;
};

const EMPTY: Omit<Article, "id"> & { id?: string } = {
  slug: "",
  title: "",
  description: "",
  body: "",
  emoji: "📝",
  published: true,
  datePublished: new Date().toISOString().slice(0, 10),
};

type BuiltinArticle = Omit<Article, "id"> & { builtin: true };

export default function ArticlesAdminPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [builtins, setBuiltins] = useState<BuiltinArticle[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [coverDataUrl, setCoverDataUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const adminCode =
    typeof window !== "undefined" ? sessionStorage.getItem("petflow-admin") || "" : "";

  const load = useCallback(async () => {
    const res = await fetch("/api/articles?all=1", {
      headers: { "x-admin-code": adminCode },
    });
    const d = await res.json().catch(() => ({}));
    setArticles(d.articles || []);
    setBuiltins(d.builtins || []);
    setLoaded(true);
  }, [adminCode]);

  useEffect(() => {
    load();
  }, [load]);

  const startNew = () => {
    setForm({ ...EMPTY, datePublished: new Date().toISOString().slice(0, 10) });
    setCoverDataUrl("");
  };
  const startEdit = (a: Article) => {
    setForm({ ...a });
    setCoverDataUrl("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // แก้บทความ SEO เดิม = โหลดเข้าฟอร์ม (ยังไม่มี id) พอบันทึกจะสร้างฉบับแก้ในหลังบ้านที่แทนที่ของเดิม
  const startEditBuiltin = (a: BuiltinArticle) => {
    setForm({
      slug: a.slug,
      title: a.title,
      description: a.description,
      body: a.body,
      coverUrl: a.coverUrl,
      emoji: a.emoji,
      published: a.published,
      datePublished: a.datePublished,
    });
    setCoverDataUrl("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const patch = (p: Partial<typeof EMPTY>) =>
    setForm((prev) => (prev ? { ...prev, ...p } : prev));

  const onCover = async (file: File) => {
    try {
      const dataUrl = await toJpegDataUrl(file, 1400);
      setCoverDataUrl(dataUrl);
    } catch {
      toast("อ่านไฟล์รูปไม่สำเร็จ", "error");
    }
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-code": adminCode },
        body: JSON.stringify({
          ...form,
          coverDataUrl: coverDataUrl || undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        toast("✅ บันทึกบทความแล้ว — ขึ้นหน้าเว็บภายใน ~5 นาที", "success");
        setForm(null);
        setCoverDataUrl("");
        load();
      } else {
        toast(d.error || "บันทึกไม่สำเร็จ", "error");
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: Article) => {
    if (!confirm(`ลบบทความ "${a.title}"?`)) return;
    await fetch(`/api/articles?id=${a.id}`, {
      method: "DELETE",
      headers: { "x-admin-code": adminCode },
    });
    load();
  };

  const field =
    "w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-sm";

  if (!loaded) return <p className="py-10 text-center text-sm text-brown-soft">กำลังโหลด…</p>;

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Articles</p>
          <h1 className="text-xl font-extrabold text-petflow-chocolate">บทความหน้าเว็บ</h1>
          <p className="mt-0.5 text-xs text-brown-soft">
            เพิ่มบทความใหม่ + รูปปกได้เอง — ขึ้นที่หน้า{" "}
            <a href="/blog" target="_blank" className="font-bold text-latte-deep underline">
              /blog
            </a>{" "}
            รวมกับบทความเดิมอัตโนมัติ
          </p>
        </div>
        {!form && (
          <button
            type="button"
            onClick={startNew}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-petflow-chocolate px-4 text-sm font-bold text-card shadow-petflow-sm"
          >
            <Icon name="plus" size={18} />
            เขียนใหม่
          </button>
        )}
      </div>

      {form && (
        <div className="mb-5 space-y-3 rounded-petflow bg-card p-4 shadow-petflow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-extrabold text-petflow-chocolate">
              {form.id ? "แก้ไขบทความ" : "บทความใหม่"}
            </p>
            <button
              type="button"
              onClick={() => setForm(null)}
              aria-label="ปิด"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-brown"
            >
              <Icon name="x" size={18} />
            </button>
          </div>
          <label className="block text-xs font-bold text-brown-soft">
            หัวข้อบทความ *
            <input
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="เช่น 5 สัญญาณว่าน้องเครียด และวิธีช่วย"
              className={`${field} mt-1`}
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-brown-soft">
              ชื่อลิงก์ (อังกฤษ ใช้ - คั่น) *
              <input
                value={form.slug}
                onChange={(e) => patch({ slug: e.target.value })}
                placeholder="cat-stress-signs"
                className={`${field} mt-1 font-mono`}
              />
            </label>
            <label className="block text-xs font-bold text-brown-soft">
              วันที่เผยแพร่
              <input
                type="date"
                value={form.datePublished}
                onChange={(e) => patch({ datePublished: e.target.value })}
                className={`${field} mt-1`}
              />
            </label>
          </div>
          <label className="block text-xs font-bold text-brown-soft">
            คำโปรย (โชว์ใต้หัวข้อ + ใช้เป็น SEO description)
            <textarea
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
              rows={2}
              className={`${field} mt-1`}
            />
          </label>
          <label className="block text-xs font-bold text-brown-soft">
            เนื้อหา *
            <textarea
              value={form.body}
              onChange={(e) => patch({ body: e.target.value })}
              rows={12}
              placeholder={"พิมพ์เนื้อหาตรงนี้…\n\n## หัวข้อย่อย\n\nย่อหน้าใหม่ = เว้นบรรทัดว่าง 1 บรรทัด\n\n- รายการข้อ 1\n- รายการข้อ 2"}
              className={`${field} mt-1 leading-relaxed`}
            />
            <span className="mt-1 block text-[10px] font-normal text-brown-faint">
              เว้นบรรทัดว่าง = ย่อหน้าใหม่ · ขึ้นต้น <b>##</b> = หัวข้อย่อย · ขึ้นต้น <b>-</b> = รายการ
            </span>
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-brown-soft">
              รูปปก (อัปโหลดใหม่)
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onCover(f);
                }}
                className="mt-1 block w-full text-[11px] text-brown-soft file:mr-2 file:h-9 file:cursor-pointer file:rounded-full file:border-0 file:bg-honey/30 file:px-3 file:text-xs file:font-bold file:text-petflow-chocolate"
              />
              {(coverDataUrl || form.coverUrl) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverDataUrl || form.coverUrl}
                  alt="ปก"
                  className="mt-2 h-24 w-full rounded-petflow-sm object-cover"
                />
              )}
            </label>
            <div className="space-y-2">
              <label className="block text-xs font-bold text-brown-soft">
                อิโมจิ (โชว์ถ้าไม่มีรูปปก)
                <input
                  value={form.emoji}
                  onChange={(e) => patch({ emoji: e.target.value })}
                  className={`${field} mt-1 w-20 text-center`}
                />
              </label>
              <label className="flex min-h-[44px] items-center gap-2 text-xs font-bold text-brown">
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(e) => patch({ published: e.target.checked })}
                  className="h-4 w-4 accent-latte-deep"
                />
                เผยแพร่ (ติ๊กออก = เก็บเป็นฉบับร่าง)
              </label>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setForm(null)}
              className="h-11 flex-1 rounded-full bg-paper text-sm font-bold text-brown-soft"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={saving || !form.title.trim() || !form.slug.trim()}
              onClick={save}
              className="h-11 flex-[2] rounded-full bg-petflow-chocolate text-sm font-extrabold text-card disabled:opacity-40"
            >
              {saving ? "กำลังบันทึก…" : "บันทึกบทความ"}
            </button>
          </div>
        </div>
      )}

      {articles.length === 0 && builtins.length === 0 ? (
        <div className="rounded-petflow bg-card shadow-petflow-sm">
          <EmptyState icon="doc" title="ยังไม่มีบทความ" sub="กด “เขียนใหม่” ได้เลย" />
        </div>
      ) : (
        <div className="space-y-5">
          {articles.length > 0 && (
            <section>
              <SectionLabel>My articles · บทความของร้าน ({articles.length})</SectionLabel>
              <ul className="divide-y divide-petflow-line rounded-petflow bg-card shadow-petflow-sm">
                {articles.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2.5 pl-4 pr-2">
                    <button
                      type="button"
                      onClick={() => startEdit(a)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-honey/25 text-lg">
                        {a.emoji}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-extrabold text-petflow-chocolate">{a.title}</span>
                          {!a.published && (
                            <span className="shrink-0 rounded-full bg-wait/15 px-1.5 text-[10px] font-bold leading-4 text-wait">
                              ร่าง
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[11px] text-brown-soft">
                          /blog/{a.slug} · {a.datePublished}
                        </span>
                      </span>
                    </button>
                    <MoreMenu
                      items={[
                        { label: "แก้ไข", icon: "edit", onClick: () => startEdit(a) },
                        { label: "ดูหน้าบทความ", icon: "eye", onClick: () => window.open(`/blog/${a.slug}`, "_blank") },
                        { label: "ลบบทความ", icon: "trash", danger: true, onClick: () => remove(a) },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* บทความ SEO เดิมของระบบ — แก้ได้ (กดแก้แล้วบันทึก = สร้างฉบับแก้ที่แทนที่ของเดิม) */}
          {builtins.length > 0 && (
            <section>
              <SectionLabel>Built-in · บทความ SEO เดิม ({builtins.length})</SectionLabel>
              <ul className="divide-y divide-petflow-line rounded-petflow bg-card shadow-petflow-sm">
                {builtins.map((a) => (
                  <li key={a.slug} className="flex items-center gap-3 py-2.5 pl-4 pr-2">
                    <button
                      type="button"
                      onClick={() => startEditBuiltin(a)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-paper text-lg">
                        {a.emoji}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-brown">{a.title}</span>
                        <span className="block truncate text-[11px] text-brown-soft">
                          /blog/{a.slug} · {a.datePublished}
                        </span>
                      </span>
                    </button>
                    <MoreMenu
                      items={[
                        { label: "แก้ไข", icon: "edit", onClick: () => startEditBuiltin(a) },
                        { label: "ดูหน้าบทความ", icon: "eye", onClick: () => window.open(`/blog/${a.slug}`, "_blank") },
                      ]}
                    />
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 px-1 text-[10px] text-brown-faint">แตะเพื่อแก้เนื้อหา/รูป — บันทึกแล้วจะแทนที่ของเดิม</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
