/**
 * แปลงหน้าเอกสาร ([data-doc-page]) เป็นไฟล์ PDF ขนาด A4 ในเบราว์เซอร์
 * ใช้แทนการพิมพ์ในที่ที่พิมพ์ไม่ได้ (เบราว์เซอร์ใน LINE, มือถือ)
 * มือถือที่แชร์ไฟล์ได้ → เปิดเมนูแชร์ (บันทึกลงไฟล์ / ส่งต่อทาง LINE ได้), นอกนั้นดาวน์โหลดเลย
 */
export async function exportDocPdf(root: HTMLElement, filename: string): Promise<"shared" | "saved"> {
  const [{ toJpeg }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const pages = [...root.querySelectorAll<HTMLElement>("[data-doc-page]")];
  if (!pages.length) throw new Error("no_pages");
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  for (let i = 0; i < pages.length; i++) {
    const el = pages[i];
    const url = await toJpeg(el, { quality: 0.92, pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true });
    const h = Math.min(297, (210 * el.offsetHeight) / el.offsetWidth);
    if (i > 0) pdf.addPage();
    pdf.addImage(url, "JPEG", 0, 0, 210, h);
  }
  const blob = pdf.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });
  const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  if (touch && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return "shared";
    } catch (e) {
      // ผู้ใช้กดยกเลิกเมนูแชร์ = ไม่ต้องดาวน์โหลดซ้ำ
      if (e instanceof DOMException && e.name === "AbortError") return "shared";
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(a.href);
  }, 30000);
  return "saved";
}
