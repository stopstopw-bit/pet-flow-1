"use client";

import { BookingCalendar } from "@/components/BookingCalendar";

/**
 * ตารางนัด — จองใหม่ใช้ปุ่ม + ในแถบล่าง (มือถือ) หรือเมนูซ้าย (จอใหญ่) ที่เดียว
 * ไม่ซ้ำปุ่มบนหัวหน้า
 */
export default function SchedulePage() {
  return (
    <div>
      <div className="mb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Schedule</p>
        <h1 className="text-xl font-extrabold text-petflow-chocolate">ตารางนัด</h1>
      </div>
      <BookingCalendar />
    </div>
  );
}
