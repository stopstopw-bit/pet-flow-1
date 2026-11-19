import type { MetadataRoute } from "next";
import { SEO_SOFTWARE_PAGES, SITE_URL } from "@/lib/seo-software-pages";

/**
 * sitemap ของเว็บขายระบบ PetFlow (petflow.online)
 * ใส่เฉพาะหน้าที่อยากให้ติด Google: หน้าแรก + หน้าคำค้นแต่ละประเภทร้าน + หน้าฟีเจอร์
 * หน้าโรงแรมแมวตัวอย่างเก่า (/cat-hotel, /cat-bath, /blog) ตั้ง noindex แล้ว จึงไม่ใส่ที่นี่
 */
const UPDATED = new Date("2026-11-19");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, lastModified: UPDATED, changeFrequency: "weekly", priority: 1 },
    ...SEO_SOFTWARE_PAGES.map((p) => ({
      url: `${SITE_URL}/${p.slug}`,
      lastModified: UPDATED,
      changeFrequency: "monthly" as const,
      priority: 0.9,
    })),
    { url: `${SITE_URL}/product`, lastModified: UPDATED, changeFrequency: "monthly", priority: 0.7 },
  ];
}
