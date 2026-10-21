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

  return (
    <ConfigContext.Provider value={{ config, loading, refresh }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  return useContext(ConfigContext);
}
