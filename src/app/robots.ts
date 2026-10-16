import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://petflow.example.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // หน้าแอปสมาชิก/หลังบ้าน ไม่ต้อง index — ให้บอทโฟกัสหน้าเว็บหลัก
        disallow: ["/admin", "/api", "/app", "/doc"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
