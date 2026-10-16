import { redirect } from "next/navigation";

/** หน้าสินค้าเดิมย้ายไปรวมกับ POS แล้ว — สินค้าทั้งหมดจัดการที่ขายหน้าร้าน */
export default function ProductsMovedPage() {
  redirect("/admin/pos");
}
