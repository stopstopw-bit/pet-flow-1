"use client";

import { useConfig } from "@/components/ConfigProvider";
import { customerFont, customerTextCss } from "@/lib/customer-text";

/** ฟอนต์/ขนาด/สีตัวอักษรหน้าลูกค้าที่ร้านตั้งไว้ (ตั้งค่า › ร้าน) — ไม่ตั้ง = ไม่ใส่อะไรเลย */
export function CustomerTextStyle() {
  const { config } = useConfig();
  const c = config.customerText;
  const css = customerTextCss(c);
  const font = customerFont(c);
  if (!css) return null;
  return (
    <>
      {font?.google && (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${font.google}&display=swap`} />
      )}
      <style dangerouslySetInnerHTML={{ __html: css }} />
    </>
  );
}
