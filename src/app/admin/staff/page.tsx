"use client";

import { StaffSection } from "@/components/StaffSection";

/** พนักงาน — สร้างรหัสให้พนักงานและเลือกว่าให้เห็นเมนูไหนบ้าง */
export default function AdminStaffPage() {
  return (
    <div>
      <div className="mb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Team</p>
        <h1 className="text-xl font-extrabold text-petflow-chocolate">พนักงาน</h1>
        <p className="mt-0.5 text-xs text-brown-soft">สร้างรหัสให้พนักงาน และเลือกว่าให้เห็นเมนูไหนบ้าง</p>
      </div>
      <StaffSection />
    </div>
  );
}
