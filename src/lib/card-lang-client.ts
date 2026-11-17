"use client";

/**
 * ภาษาการ์ดที่แอดมินเลือกในป๊อปอัปพรีวิว — แนบ header x-card-lang ไปกับคำขอส่งจริง
 * ทำที่จุดเดียว (ห่อ fetch ฝั่งเบราว์เซอร์ระหว่างกดยืนยัน) ปุ่มส่งทุกที่ที่ใช้ PreviewSendModal ได้ด้วยโดยไม่ต้องแก้ทีละที่
 */
export type CardLangChoice = "auto" | "th" | "en";

let active: "th" | "en" | null = null;
let patched = false;

function patchFetch() {
  if (patched || typeof window === "undefined") return;
  patched = true;
  const orig = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    if (active && (url.startsWith("/api/") || url.startsWith(`${location.origin}/api/`))) {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      headers.set("x-card-lang", active);
      return orig(input, { ...init, headers });
    }
    return orig(input, init);
  };
}

/** เรียก fn (ปุ่มยืนยันส่ง) โดยให้ทุกคำขอ /api ระหว่างนั้นบอกภาษาการ์ดที่เลือก */
export function runWithCardLang(lang: CardLangChoice, fn: () => unknown) {
  if (lang === "auto") return fn();
  patchFetch();
  active = lang;
  const clear = () => {
    active = null;
  };
  let ret: unknown;
  try {
    ret = fn();
  } catch (e) {
    clear();
    throw e;
  }
  if (ret && typeof (ret as Promise<unknown>).then === "function") {
    (ret as Promise<unknown>).then(clear, clear);
  } else {
    // ปุ่มที่ไม่คืน promise — คำขอส่งออกไปแล้วตั้งแต่ตอนกด ปิดหลังจากนั้นไม่นาน
    setTimeout(clear, 3000);
  }
  return ret;
}
