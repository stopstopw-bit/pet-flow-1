/**
 * แมวที่ยังไม่รู้ชื่อตอนจอง — ลงเป็น "น้องไม่ระบุชื่อ", "น้องไม่ระบุชื่อ (2)" ... ไว้ก่อน
 * พอลูกค้ากรอกข้อมูลแมวแล้ว ร้านเลือกตัวจริงแทนได้ในหน้าแก้ไขนัด
 */
export const UNKNOWN_CAT = "น้องไม่ระบุชื่อ";

export const isUnknownCat = (name: string) =>
  name === UNKNOWN_CAT || name.startsWith(`${UNKNOWN_CAT} (`);

/** ชื่อแมวของลูกค้าที่ยังไม่ได้อยู่ในนัดนี้ (ไม่ซ้ำ ไม่รวมชื่อชั่วคราว) */
export function pickableCatNames(customerCats: string[], taken: string[]) {
  const norm = (s: string) => s.trim().toLowerCase();
  const used = new Set(taken.map(norm));
  const seen = new Set<string>();
  return customerCats.filter((n) => {
    const k = norm(n);
    if (!k || isUnknownCat(n.trim()) || used.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
