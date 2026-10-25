import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ทุกโทนด้านล่างผูกกับ CSS var เพื่อให้แต่ละร้าน override สีได้ผ่าน <BrandingStyle> —
        // ยังใส่ opacity แบบ bg-honey/30 ได้ตามเดิมเพราะใช้ pattern rgb(var(..) / <alpha-value>)
        cream: "rgb(var(--cream-rgb) / <alpha-value>)",
        paper: "rgb(var(--paper-rgb) / <alpha-value>)",
        card: "rgb(var(--card-rgb) / <alpha-value>)",
        brown: {
          DEFAULT: "rgb(var(--brown-rgb) / <alpha-value>)",
          soft: "rgb(var(--brown-soft-rgb) / <alpha-value>)",
          faint: "rgb(var(--brown-faint-rgb) / <alpha-value>)",
        },
        honey: {
          DEFAULT: "rgb(var(--honey-rgb) / <alpha-value>)",
          deep: "rgb(var(--honey-deep-rgb) / <alpha-value>)",
        },
        latte: {
          DEFAULT: "rgb(var(--latte-rgb) / <alpha-value>)",
          deep: "rgb(var(--latte-deep-rgb) / <alpha-value>)",
        },
        petflow: {
          yellow: "#f5d76e",
          chocolate: "rgb(var(--chocolate-rgb) / <alpha-value>)",
          line: "rgb(var(--line-rgb) / <alpha-value>)",
        },
        sage: "#9fb79a",
        wait: "#d9a05b",
        ok: "#7fa876",
        // สีหมวดหมู่การ์ด (คงที่ ไม่ผูกกับสีแบรนด์ร้าน) — ใช้แยกแต่ละการ์ด/หมวดในหน้าลูกค้า
        // ให้ดูมีชีวิตชีวาแบบแอปพาสเทลหลายสี ไม่ใช่โทนเดียวซ้ำทั้งหน้า — DEFAULT = พื้นอ่อน, deep = ไอคอน/ตัวหนังสือ
        amber: { DEFAULT: "#fff1d6", deep: "#b6790e" },
        sky: { DEFAULT: "#dbeeff", deep: "#1c6dbd" },
        mint: { DEFAULT: "#dcf5e6", deep: "#1f8a54" },
        lavender: { DEFAULT: "#ece3fb", deep: "#6b46c1" },
      },
      borderRadius: { petflow: "24px", "petflow-sm": "16px" },
      keyframes: {
        pop: { "0%": { opacity: "0", transform: "scale(0.9)" }, "100%": { opacity: "1", transform: "scale(1)" } },
      },
      animation: { pop: "pop 160ms ease-out" },
      fontFamily: {
        sans: [
          "Sukhumvit Set",
          "-apple-system",
          "Leelawadee UI",
          "Noto Sans Thai",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
