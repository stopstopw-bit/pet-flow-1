/**
 * วันที่ปัจจุบันตามเวลาไทย (YYYY-MM-DD)
 *
 * ห้ามใช้ new Date().toISOString().slice(0, 10) กับวันที่ที่ลงบัญชี — นั่นคือวันที่ UTC
 * ซึ่งช้ากว่าไทย 7 ชั่วโมง กดรับเงินก่อน 7 โมงเช้าจะถูกลงเป็นวันของเมื่อวาน
 * (และวันที่ 1 ตอนเช้ามืดจะหลุดไปอยู่เดือนก่อน)
 */
export function bangkokToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
