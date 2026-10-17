"use client";

import { useCallback, useEffect, useState } from "react";
import { ADMIN_TABS } from "@/components/AdminNav";
import { ADMIN_TAB_ICONS, Icon } from "@/components/Icon";
import { Avatar, EmptyState, MoreMenu, SectionLabel } from "@/components/ui";

export type StaffItem = {
  id: string;
  name: string;
  username: string;
  menus: string[];
  active: boolean;
};

/**
 * จัดการบัญชีพนักงาน — เจ้าของเท่านั้นที่เห็น (API ตอบ 403 ให้พนักงาน)
 * ล็อกอินด้วย username + password — username ต้อง unique ทั้งแพลตฟอร์ม (ข้ามร้าน)
 *
 * แยกออกมาจากหน้าตั้งค่าเพราะมันเป็นงานคนละเรื่องกับการตั้งค่าระบบ
 * และเจ้าของร้านหาไม่เจอเวลามันซ่อนอยู่ท้ายหน้า
 */
export function StaffSection() {
  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newMenus, setNewMenus] = useState<string[]>([
    "/admin",
    "/admin/schedule",
    "/admin/queue",
    "/admin/care",
    "/admin/bookings/new",
    "/admin/customers",
    "/admin/billing",
  ]);
  const [busy, setBusy] = useState(false);

  const adminCode =
    typeof window !== "undefined" ? sessionStorage.getItem("petflow-admin") || "" : "";

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/staff", {
        headers: { "x-admin-code": adminCode },
      });
      if (res.status === 403) {
        setIsOwner(false);
        setLoaded(true);
        return;
      }
      const d = await res.json();
      setStaff(d.staff || []);
      setIsOwner(true);
    } catch {
      /* เงียบ — โชว์เป็นลิสต์ว่าง */
    }
    setLoaded(true);
  }, [adminCode]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleMenu = (list: string[], href: string) =>
    list.includes(href) ? list.filter((h) => h !== href) : [...list, href];

  const addStaff = async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-code": adminCode },
        body: JSON.stringify({
          action: "add",
          name: newName,
          username: newUsername,
          password: newPassword,
          menus: newMenus,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg(`เพิ่ม "${newName}" แล้ว — ให้พนักงานล็อกอินด้วย username/password นี้ได้เลย`);
        setNewName("");
        setNewUsername("");
        setNewPassword("");
        load();
      } else {
        setMsg(`${d.error || "เพิ่มไม่สำเร็จ"}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const patchStaff = async (id: string, patch: Record<string, unknown>) => {
    const res = await fetch("/api/admin/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-code": adminCode },
      body: JSON.stringify({ id, ...patch }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(`❌ ${d.error || "แก้ไขไม่สำเร็จ"}`);
      return;
    }
    load();
  };

  const removeStaff = async (s: StaffItem) => {
    if (!confirm(`ลบบัญชีพนักงาน "${s.name}"?`)) return;
    await fetch(`/api/admin/staff?id=${s.id}`, {
      method: "DELETE",
      headers: { "x-admin-code": adminCode },
    });
    load();
  };

  if (!loaded) {
    return <p className="py-10 text-center text-sm text-brown-soft">กำลังโหลด…</p>;
  }
  if (!isOwner) {
    return (
      <div className="rounded-petflow bg-card shadow-petflow-sm">
        <EmptyState icon="alert" title="หน้านี้สำหรับเจ้าของร้านเท่านั้น" />
      </div>
    );
  }

  const menuPicker = (selected: string[], onToggle: (href: string) => void) => (
    <div className="grid grid-cols-2 gap-x-2">
      {ADMIN_TABS.map((t) => (
        <label key={t.href} className="flex min-h-[40px] items-center gap-2 text-xs text-brown">
          <input
            type="checkbox"
            checked={selected.includes(t.href)}
            onChange={() => onToggle(t.href)}
            className="h-4 w-4 shrink-0 accent-latte-deep"
          />
          <Icon name={ADMIN_TAB_ICONS[t.href] || "grid"} size={14} className="text-brown-soft" />
          <span className="min-w-0 truncate">{t.label}</span>
        </label>
      ))}
    </div>
  );

  const field = "w-full min-w-0 rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2.5 text-sm";

  return (
    <div className="space-y-5">
      <section>
        <SectionLabel>Staff · บัญชีพนักงาน ({staff.length})</SectionLabel>
        <div className="rounded-petflow bg-card shadow-petflow-sm">
          {staff.length === 0 ? (
            <EmptyState icon="team" title="ยังไม่มีพนักงาน" sub="เพิ่มคนแรกได้ที่ช่องด้านล่าง" />
          ) : (
            <ul className="divide-y divide-petflow-line">
              {staff.map((s) => (
                <li key={s.id}>
                  <details className="group [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 px-4 py-2.5">
                      <Avatar name={s.name} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-extrabold text-petflow-chocolate">{s.name}</span>
                          {!s.active && (
                            <span className="shrink-0 rounded-full bg-paper px-1.5 text-[10px] font-bold leading-4 text-brown-faint">
                              พักใช้งาน
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[11px] text-brown-soft">
                          @{s.username} · เห็น {s.menus.length} เมนู
                        </span>
                      </span>
                      <Icon name="chevron" size={16} className="text-brown-faint transition group-open:rotate-90" />
                    </summary>
                    <div className="space-y-3 bg-paper/50 px-4 pb-3 pt-2">
                      <p className="text-[11px] font-bold text-brown-soft">เมนูที่ให้เห็น</p>
                      {menuPicker(s.menus, (href) =>
                        patchStaff(s.id, { menus: toggleMenu(s.menus, href) })
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const password = prompt("ตั้ง password ใหม่ (อย่างน้อย 6 ตัว):");
                            if (password && password.trim().length >= 6) {
                              patchStaff(s.id, { password: password.trim() });
                            }
                          }}
                          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-card text-xs font-bold text-brown"
                        >
                          <Icon name="edit" size={14} />
                          เปลี่ยน password
                        </button>
                        <MoreMenu
                          items={[
                            {
                              label: "เปลี่ยน username",
                              icon: "user",
                              onClick: () => {
                                const username = prompt("ตั้ง username ใหม่ (อย่างน้อย 3 ตัว):", s.username);
                                if (username && username.trim().length >= 3) {
                                  patchStaff(s.id, { username: username.trim() });
                                }
                              },
                            },
                            {
                              label: s.active ? "พักการใช้งาน" : "เปิดใช้งาน",
                              icon: s.active ? "clock" : "check",
                              onClick: () => patchStaff(s.id, { active: !s.active }),
                            },
                            { label: "ลบบัญชี", icon: "trash", danger: true, onClick: () => removeStaff(s) },
                          ]}
                        />
                      </div>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-brown-faint">
          ตั้ง username/password ให้พนักงานแต่ละคน แล้วเลือกว่าให้เห็นเมนูไหนบ้าง —
          username ต้องไม่ซ้ำกับใครในระบบเลย (ข้ามร้านด้วย)
        </p>
      </section>

      <section>
        <SectionLabel>New · เพิ่มพนักงานใหม่</SectionLabel>
        <div className="space-y-3 rounded-petflow bg-card p-4 shadow-petflow-sm">
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="ชื่อพนักงาน"
              className={field}
            />
            <input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="username (3 ตัวขึ้นไป)"
              autoCapitalize="none"
              className={field}
            />
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="password (6 ตัวขึ้นไป)"
              type="text"
              className={field}
            />
          </div>
          <p className="text-[11px] font-bold text-brown-soft">เมนูที่ให้เห็น</p>
          {menuPicker(newMenus, (href) => setNewMenus((prev) => toggleMenu(prev, href)))}
          <button
            type="button"
            disabled={
              busy ||
              !newName.trim() ||
              newUsername.trim().length < 3 ||
              newPassword.trim().length < 6
            }
            onClick={addStaff}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-petflow-chocolate text-sm font-extrabold text-card disabled:opacity-40"
          >
            <Icon name="plus" size={18} />
            {busy ? "กำลังเพิ่ม…" : "เพิ่มพนักงาน"}
          </button>
          {msg && <p className="text-[11px] font-bold text-brown">{msg}</p>}
        </div>
      </section>
    </div>
  );
}
