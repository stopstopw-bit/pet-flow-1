"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { CustomerProfile } from "@/lib/business";
import type { PointsHistoryEntry } from "@/lib/points-store";
import type { CustomerTier } from "@/lib/customer-tier";

type LineCustomer = {
  id: string;
  name: string;
  phone?: string;
  cats: { id: string; name: string }[];
  tier: CustomerTier;
  /** สถานะ Member + เครดิตคงเหลือ — API ส่งมาอยู่แล้ว ใช้โชว์ในหน้าแรกของลูกค้า */
  isMember?: boolean;
  memberCredit?: number;
};

type LiffCtx = {
  ready: boolean;
  profile: CustomerProfile | null;
  customer: LineCustomer | null;
  needsRegistration: boolean;
  history: PointsHistoryEntry[];
  error: string | null;
  refreshAccount: () => Promise<void>;
  refreshCustomer: () => Promise<void>;
  setPoints: (points: number) => void;
};

const LiffContext = createContext<LiffCtx>({
  ready: false,
  profile: null,
  customer: null,
  needsRegistration: false,
  history: [],
  error: null,
  refreshAccount: async () => {},
  refreshCustomer: async () => {},
  setPoints: () => {},
});

async function fetchAccount(lineUserId: string, displayName: string, customerId?: string) {
  const q = new URLSearchParams({ lineUserId, displayName });
  if (customerId) q.set("customerId", customerId);
  // no-store — กัน webview ของ LINE เก็บผลแต้มเก่าไว้แล้วโชว์ค้าง (เช่น 0 ทั้งที่มีแต้ม)
  const res = await fetch(`/api/points?${q}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json() as Promise<{
    points: number;
    history: PointsHistoryEntry[];
  }>;
}

/**
 * แลก LIFF ID token (LINE เซ็นให้ ปลอมไม่ได้) เป็นคุกกี้เซสชันลูกค้า — ต้องเรียกก่อนเสมอ
 * ห้ามส่ง lineUserId ตรงๆ อีกต่อไป เพราะ server จะไม่เชื่อค่านี้แล้ว (ดู liff-auth.ts)
 */
async function syncLineCustomer(
  auth: { idToken: string } | { devUserId: string },
  displayName: string
) {
  const res = await fetch("/api/customers/line", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...auth, displayName }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<{
    customer: LineCustomer;
    needsRegistration: boolean;
  }>;
}

type LiffAuthModule = {
  getIDToken: () => string | null;
  getDecodedIDToken: () => { exp?: number } | null;
  login: (config?: { redirectUri?: string }) => void;
  logout: () => void;
  isInClient: () => boolean;
};

const RELOGIN_KEY = "petflow-liff-relogin";

/**
 * ID token ของ LIFF หมดอายุราว 1 ชม. แต่เปิดในเบราว์เซอร์นอก LINE แล้ว isLoggedIn() ยังเป็น true
 * และ getIDToken() คืน token เก่าที่หมดอายุแล้ว — server ตรวจไม่ผ่าน ลูกค้าเลยไม่มีข้อมูลบัญชี
 * (ขึ้น "สมัครสมาชิกให้เสร็จ" ค้าง / จองแล้วบอกว่าไม่มีแมว ทั้งที่สมัครไปแล้ว)
 * หมดอายุแล้ว → ล็อกอินใหม่เพื่อเอา token สด (กันวนซ้ำ: ลองได้ครั้งเดียวต่อ 1 นาที)
 * คืน true = กำลังพาไปล็อกอินใหม่ อย่าทำอะไรต่อ
 */
function reloginIfTokenExpired(liff: LiffAuthModule | null): boolean {
  // ในแอป LINE เปิดใหม่ทุกครั้งได้ token สดอยู่แล้ว (login() ใช้ในนั้นไม่ได้)
  if (!liff || typeof window === "undefined" || liff.isInClient()) return false;
  const exp = liff.getDecodedIDToken()?.exp;
  if (exp && exp * 1000 > Date.now() + 30_000) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOGIN_KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOGIN_KEY, String(Date.now()));
  } catch {
    return false;
  }
  liff.logout();
  liff.login({ redirectUri: window.location.href });
  return true;
}

export function LiffProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [customer, setCustomer] = useState<LineCustomer | null>(null);
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [history, setHistory] = useState<PointsHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  // เก็บ liff module ไว้เรียก getIDToken() ซ้ำได้ทุกครั้งที่ sync (dev mode ไม่มีตัวนี้)
  const liffModRef = useRef<LiffAuthModule | null>(null);
  const devUserIdRef = useRef<string | null>(null);

  /** ตัวยืนยันตัวตนสำหรับส่งให้ server แลกคุกกี้เซสชัน — ห้ามส่ง lineUserId ตรงๆ อีกต่อไป */
  const getAuth = useCallback((): { idToken: string } | { devUserId: string } | null => {
    if (devUserIdRef.current) return { devUserId: devUserIdRef.current };
    const idToken = liffModRef.current?.getIDToken();
    return idToken ? { idToken } : null;
  }, []);

  const refreshCustomer = useCallback(async () => {
    if (!profile?.lineUserId) return;
    if (reloginIfTokenExpired(liffModRef.current)) return;
    const auth = getAuth();
    if (!auth) return;
    const sync = await syncLineCustomer(auth, profile.displayName);
    if (sync) {
      setCustomer(sync.customer);
      setNeedsRegistration(sync.needsRegistration);
    }
  }, [profile?.lineUserId, profile?.displayName, getAuth]);

  const refreshAccount = useCallback(async () => {
    if (!profile?.lineUserId) return;
    const data = await fetchAccount(profile.lineUserId, profile.displayName, customer?.id);
    if (!data) return;
    setProfile((p) => (p ? { ...p, points: data.points } : p));
    setHistory(data.history);
  }, [profile?.lineUserId, profile?.displayName, customer?.id]);

  const setPoints = useCallback((points: number) => {
    setProfile((p) => (p ? { ...p, points } : p));
  }, []);

  useEffect(() => {
    async function initLiff() {
      async function applyAccount(base: CustomerProfile) {
        const auth = getAuth();
        if (!auth) {
          setError("เชื่อมต่อ LINE ไม่สำเร็จ — ปิดหน้านี้แล้วเปิดใหม่จาก LINE อีกครั้งนะคะ");
          setReady(true);
          return;
        }
        // sync ก่อนเพื่อรู้ customerId แล้วค่อยดึงแต้มด้วย customerId นั้น —
        // แต้มจะได้ผูกกับลูกค้าคนเดียวเสมอ ไม่แตกตามอุปกรณ์/LINE ID
        const sync = await syncLineCustomer(auth, base.displayName);
        if (sync) {
          setCustomer(sync.customer);
          setNeedsRegistration(sync.needsRegistration);
        }
        const data = await fetchAccount(base.lineUserId, base.displayName, sync?.customer?.id);
        if (data) {
          setProfile({ ...base, points: data.points });
          setHistory(data.history);
        } else {
          setProfile(base);
        }
        setReady(true);
      }

      let liffId = process.env.NEXT_PUBLIC_LIFF_ID?.trim() || "";
      if (!liffId) {
        try {
          // no-store — LINE's in-app webview can hold onto a stale cached response,
          // ทำให้ตกไปเป็น "dev-user" ค้างแม้ร้านตั้ง LIFF ID เสร็จแล้วก็ตาม
          const res = await fetch("/api/line/liff", { cache: "no-store" });
          const data = await res.json();
          liffId = data.liffId || "";
        } catch {
          /* fallback dev */
        }
      }

      if (!liffId) {
        // โหมดทดสอบ (dev-user) อนุญาตเฉพาะรันในเครื่องเท่านั้น — บน production ถ้าดึง LIFF ไม่ได้
        // (ยังไม่ตั้งค่า หรือเน็ตสะดุดชั่วคราว) ต้องบอกตรงๆ แล้วให้ลองใหม่
        // ห้ามเงียบๆ สวมบัญชีปลอมให้เด็ดขาด — เคยทำให้เกิดนัด "dev-user" ปนในร้านจริงมาแล้ว
        const host = typeof window !== "undefined" ? window.location.hostname : "";
        const isLocalDev =
          host === "localhost" || host === "127.0.0.1" || /^(10\.|192\.168\.)/.test(host);
        if (!isLocalDev) {
          setError("เชื่อมต่อ LINE ไม่สำเร็จ — ปิดหน้านี้แล้วเปิดใหม่จาก LINE อีกครั้งนะคะ");
          setReady(true);
          return;
        }
        devUserIdRef.current = "dev-user";
        await applyAccount({
          lineUserId: "dev-user",
          displayName: "คุณทดสอบ",
          points: 0,
        });
        return;
      }

      import("@line/liff")
        .then((liff) =>
          liff.default.init({ liffId }).then(async () => {
            if (!liff.default.isLoggedIn()) {
              liff.default.login();
              return;
            }
            liffModRef.current = liff.default as unknown as LiffAuthModule;
            if (reloginIfTokenExpired(liffModRef.current)) return;
            const p = await liff.default.getProfile();
            await applyAccount({
              lineUserId: p.userId,
              displayName: p.displayName,
              pictureUrl: p.pictureUrl,
              points: 0,
            });
          })
        )
        .catch((e) => {
          setError(String(e));
          setReady(true);
        });
    }

    initLiff();

    // ถ้าล็อกอิน LINE ค้างระหว่างทาง (redirect ไม่กลับมา) อย่าค้างจอเปล่าตลอดไป
    const stuckTimer = setTimeout(() => {
      setReady((r) => {
        if (!r) setError("เข้าสู่ระบบช้ากว่าปกติ — ลองแตะปุ่มด้านล่างเพื่อโหลดใหม่");
        return r;
      });
    }, 10000);
    return () => clearTimeout(stuckTimer);
  }, []);

  useEffect(() => {
    if (!ready || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const path = params.get("path");
    const bookingId = params.get("id");

    if (path === "bookings") {
      router.replace(
        bookingId ? `/app/bookings?id=${bookingId}` : "/app/bookings"
      );
      return;
    }
    if (path === "promos") {
      router.replace("/app/promos");
      return;
    }
    if (path === "grooming") {
      router.replace("/app/grooming");
      return;
    }
    if (path === "rooms") {
      router.replace("/app/rooms");
      return;
    }
    if (path === "services") {
      router.replace("/app/services");
      return;
    }
    if (path === "consent") {
      const bkId = params.get("id");
      router.replace(bkId ? `/app/consent?id=${encodeURIComponent(bkId)}` : "/app/consent");
      return;
    }
    if (path === "booking-time") {
      const bkId = params.get("id");
      const type = params.get("type") || "checkin";
      router.replace(
        `/app/booking-time?id=${bkId || ""}&type=${type}`
      );
      return;
    }
    if (path === "booking-transport") {
      const bkId = params.get("id");
      router.replace(`/app/booking-transport?id=${encodeURIComponent(bkId || "")}`);
      return;
    }
    if (path === "profile") {
      router.replace("/app/profile");
      return;
    }
    if (path === "coupons") {
      router.replace("/app/coupons");
      return;
    }
    if (path === "claim-coupon") {
      const offer = params.get("offer");
      router.replace(offer ? `/app/claim-coupon?offer=${encodeURIComponent(offer)}` : "/app/coupons");
      return;
    }
    if (path === "groom-info") {
      const bkId = params.get("id");
      router.replace(`/app/groom-info?id=${bkId || ""}`);
      return;
    }
    if (path === "register") {
      if (needsRegistration) {
        const ref = params.get("ref");
        router.replace(ref ? `/app/register?ref=${encodeURIComponent(ref)}` : "/app/register");
      } else {
        router.replace("/app");
      }
      return;
    }
    if (path === "link") {
      const customerId = params.get("customerId");
      router.replace(
        customerId
          ? `/app/link?customerId=${encodeURIComponent(customerId)}`
          : "/app"
      );
      return;
    }

    const skipRegister =
      pathname.startsWith("/app/register") ||
      pathname.startsWith("/app/link") ||
      pathname.startsWith("/app/bookings") ||
      pathname.startsWith("/app/pay") ||
      pathname.startsWith("/app/promos") ||
      pathname.startsWith("/app/grooming") ||
      pathname.startsWith("/app/rooms") ||
      pathname.startsWith("/app/services") ||
      pathname.startsWith("/app/consent") ||
      pathname.startsWith("/app/booking-time") ||
      pathname.startsWith("/app/booking-transport") ||
      pathname.startsWith("/app/profile") ||
      pathname.startsWith("/app/groom-info") ||
      pathname.startsWith("/app/coupons") ||
      pathname.startsWith("/app/claim-coupon");

    if (needsRegistration && !skipRegister) {
      router.replace("/app/register");
    }
  }, [ready, needsRegistration, pathname, router]);

  return (
    <LiffContext.Provider
      value={{
        ready,
        profile,
        customer,
        needsRegistration,
        history,
        error,
        refreshAccount,
        refreshCustomer,
        setPoints,
      }}
    >
      {children}
    </LiffContext.Provider>
  );
}

export function useLiff() {
  return useContext(LiffContext);
}
