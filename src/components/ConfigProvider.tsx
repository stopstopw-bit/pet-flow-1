"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import type { SiteConfig } from "@/lib/config-types";
import { getDefaultSiteConfig } from "@/lib/defaults/site-config";
import { petWords } from "@/lib/pet-kind";

/** ค่าก่อนโหลดเสร็จ — ชื่อร้านว่างไว้ ไม่งั้นจะเห็นชื่อระบบ (PetFlow) แวบขึ้นมาก่อนชื่อร้านจริง */
function initialConfig(): SiteConfig {
  const c = getDefaultSiteConfig();
  c.business.name = "";
  return c;
}

type ConfigCtx = {
  config: SiteConfig;
  loading: boolean;
  refresh: () => Promise<void>;
};

const ConfigContext = createContext<ConfigCtx>({
  config: initialConfig(),
  loading: true,
  refresh: async () => {},
});

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<SiteConfig>(initialConfig);
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      // บอกร้านตามลิงก์ที่เปิดอยู่ (/s/<slug>/...) ตรง ๆ — ไม่พึ่ง session/cookie ที่อาจเป็นของร้านอื่น
      const m = window.location.pathname.match(/^\/s\/([a-z0-9-]+)(?:\/|$)/i);
      const res = await fetch(m ? `/api/config?shop=${m[1].toLowerCase()}` : "/api/config");
      const data = await res.json();
      if (data.config) setConfig(data.config);
    } catch {
      /* ใช้ default */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ชื่อแท็บ/หัวหน้าต่าง LINE = ชื่อร้าน (ตั้งใหม่ทุกครั้งที่เปลี่ยนหน้า เพราะ Next จะคืนค่าเป็นชื่อเริ่มต้น)
  const shopName = config.business?.name?.trim();
  useEffect(() => {
    if (shopName) document.title = shopName;
  }, [shopName, pathname]);

  // ไอคอนแท็บ/หน้าจอโฮม (Add to Home Screen) = โลโก้ร้าน ผ่าน /api/shop-icon
  // (ร้านไม่ได้ตั้งโลโก้ = ไอคอน PetFlow เดิมจาก app/favicon.ico + app/apple-icon.png)
  // แก้ href ของ <link> ที่ Next ใส่ไว้ แทนการลบทิ้ง — ลบแล้ว React จะหา node ไม่เจอตอนเปลี่ยนหน้า
  const logo = config.branding?.logoUrl?.trim();
  useEffect(() => {
    if (!logo) return;
    const m = window.location.pathname.match(/^\/s\/([a-z0-9-]+)(?:\/|$)/i);
    const params = new URLSearchParams({ v: shortHash(logo) });
    if (m) params.set("shop", m[1].toLowerCase());
    const iconUrl = new URL(`/api/shop-icon?${params}`, window.location.origin).href;
    for (const rel of ["icon", "apple-touch-icon"]) {
      let links = Array.from(document.head.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`));
      if (links.length === 0) {
        const el = document.createElement("link");
        el.rel = rel;
        document.head.appendChild(el);
        links = [el];
      }
      for (const el of links) {
        // type="image/x-icon" ของ favicon.ico ทำให้เบราว์เซอร์ข้ามรูป jpg/png ของร้าน
        el.removeAttribute("type");
        el.removeAttribute("sizes");
        if (el.href !== iconUrl) el.href = iconUrl;
      }
    }
  }, [logo, pathname]);

  return (
    <ConfigContext.Provider value={{ config, loading, refresh }}>
      {children}
    </ConfigContext.Provider>
  );
}

/** ตัวเลขสั้น ๆ ที่เปลี่ยนตามโลโก้ — ใส่ใน ?v= ให้เบราว์เซอร์/iPhone โหลดไอคอนใหม่เมื่อเปลี่ยนโลโก้ */
function shortHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function useConfig() {
  return useContext(ConfigContext);
}

/** คำเรียกน้องตามชนิดสัตว์ของร้าน (แมว/หมา/หมา·แมว) — ดู lib/pet-kind.ts */
export function usePetWords() {
  return petWords(useContext(ConfigContext).config);
}
