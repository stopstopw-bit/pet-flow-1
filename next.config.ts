import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // schema.sql ถูกอ่านตอนรัน (ปุ่ม "สร้างตารางอัตโนมัติ" / "Copy SQL" ในหน้าติดตั้ง)
  // ถ้าไม่บอกไว้ตรงนี้ ไฟล์จะไม่ถูก deploy ไปด้วย แล้วปุ่มจะพังบนเครื่องจริง
  outputFileTracingIncludes: {
    "/api/setup": ["./supabase/schema.sql", "./supabase/full-setup.sql"],
    "/admin/setup": ["./supabase/schema.sql", "./supabase/full-setup.sql"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "profile.line-scdn.net",
      },
    ],
  },
  // หน้าแรก (/) ให้เสิร์ฟหน้าขาย PetFlow (public/petflow.html) แทนหน้า demo โรงแรมแมว
  // ใช้ beforeFiles เพื่อให้ทำงานก่อน route page.tsx — URL ยังเป็น "/" สะอาดๆ
  // หน้า SEO เดิมยังเข้าได้ที่ /petflow.html ไม่ได้ถูกลบ
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/petflow.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
