/**
 * คัดลอกข้อความลงคลิปบอร์ด — ใช้ได้ในเบราว์เซอร์ในแอป LINE ด้วย
 * navigator.clipboard ใน LINE (โดยเฉพาะ iPhone) มักไม่มี/ถูกปฏิเสธ จึงสำรองด้วย textarea + execCommand
 * @returns true ถ้าคัดลอกได้จริง
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* ตกไปใช้วิธีสำรอง */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS ต้องกำหนดช่วงเอง
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** ลิงก์เปิดหน้าเลือกเพื่อน/กลุ่มใน LINE พร้อมข้อความที่พิมพ์ไว้ให้ */
export function lineShareUrl(text: string): string {
  return `https://line.me/R/share?text=${encodeURIComponent(text)}`;
}
