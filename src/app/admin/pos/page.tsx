import { redirect } from "next/navigation";

/** ขายหน้าร้านย้ายไปอยู่ในหน้าคิดเงินแล้ว — ลิงก์เก่ายังใช้ได้ */
export default function PosRedirect() {
  redirect("/admin/billing?view=pos");
}
