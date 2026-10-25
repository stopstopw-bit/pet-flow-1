import {
  resolveGroomSizes,
  type GroomProgram,
  type GroomSize,
} from "./grooming-prices";
import { priceLabel, unitOf, type PastInvoice } from "./special-price";

/**
 * จำการอาบน้ำครั้งล่าสุดของ "น้องแต่ละตัว"
 * ------------------------------------------
 * ตอนออกบิล พนักงานต้องเลือก โปรแกรม → ขน/พันธุ์ → ไซส์ ใหม่ทุกครั้ง ทั้งที่น้องตัวเดิม
 * มาแบบเดิม ราคาที่เคยตกลงกันก็ผูกกับสามอย่างนี้ (ดู priceSignature) เลือกผิดก็ไม่เจอราคาเดิม
 *
 * ที่นี่อ่านย้อนจากบิลเก่าเหมือน special-price.ts — ไม่มีตารางใหม่:
 *  1) เคยอาบแล้ว → เอาโปรแกรม/ขน/ไซส์/ราคาของครั้งล่าสุดของตัวนั้น
 *  2) ยังไม่เคย → เดาขน/ไซส์จากการ์ดน้อง (พันธุ์, ขนสั้น/ขนยาว, น้ำหนัก)
 */

export type PetCard = {
  name: string;
  breed?: string;
  furLength?: "short" | "long";
  weightKg?: number;
};

/** เทียบชื่อน้องแบบไม่แคร์ช่องว่าง/อักขระล่องหน (เหมือน catKey ในหน้าออกบิล) */
export function petKey(name: string): string {
  return name.normalize("NFC").replace(/[​-‍﻿\s]/g, "").toLowerCase();
}

type PastItem = NonNullable<PastInvoice["items"]>[number] & {
  catName?: string;
  program?: string;
  breed?: string;
  size?: string;
};

/**
 * รายการนี้เป็นของน้องตัวนี้ไหม — ดูช่อง catName ก่อน (บ้านหลายตัว) แล้วค่อยดูชื่อหน้า label
 * บ้านที่มีตัวเดียว บิลไม่ใส่ชื่อน้อง → onlyPet = true ให้นับทุกรายการเป็นของตัวนั้น
 */
export function itemIsForPet(
  it: { label: string; catName?: string },
  name: string,
  onlyPet: boolean
): boolean {
  const key = petKey(name);
  const names = (it.catName || "").split(",").map((s) => petKey(s)).filter(Boolean);
  if (names.length) return names.includes(key);
  const m = it.label.match(/^🐱([^·]*)·/u);
  if (m) return m[1].split(",").some((s) => petKey(s) === key);
  return onlyPet;
}

export type LastGroom = {
  programName: string;
  programId?: string;
  breed: string;
  sizeLabel: string;
  size?: GroomSize;
  unitAmount: number;
  when?: string;
};

/** อาบน้ำครั้งล่าสุดของน้องตัวนี้ (null = ยังไม่เคยมีในบิล) */
export function lastGroomForPet(
  invoices: PastInvoice[],
  petName: string,
  onlyPet: boolean,
  customerId?: string
): LastGroom | null {
  const mine = invoices
    .filter((i) => !customerId || i.customerId === customerId)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  for (const inv of mine) {
    for (const raw of inv.items || []) {
      const it = raw as PastItem;
      if (it.kind !== "grooming") continue;
      if (!itemIsForPet(it, petName, onlyPet)) continue;
      // "โปรแกรม · ขน/พันธุ์ · ไซส์" (priceLabel ตัดชื่อน้อง/จำนวน/ป้ายส่วนลดออกให้แล้ว)
      const parts = priceLabel(it.label).split(" · ");
      if (parts.length < 3 && !it.breed) continue;
      const unit = unitOf(it);
      return {
        programName: parts[0] || "",
        programId: it.program,
        breed: it.breed || parts[1] || "",
        sizeLabel: parts[2] || "",
        size: (["kitten", "m", "l"] as const).find((s) => s === it.size),
        unitAmount: unit,
        when: inv.createdAt,
      };
    }
  }
  return null;
}

/** ไซส์จากน้ำหนัก — ตรงกับเกณฑ์ใน GROOM_SIZES (≤2 / 2–6 / 6+ กก.) */
function sizeFromWeight(kg?: number): GroomSize | undefined {
  if (!kg || kg <= 0) return undefined;
  if (kg <= 2) return "kitten";
  if (kg < 6) return "m";
  return "l";
}

/** แถวขน/พันธุ์ในโปรแกรมที่ตรงกับการ์ดน้อง — พันธุ์ตรงก่อน แล้วค่อยขนสั้น/ขนยาว */
function breedRowForPet(prog: GroomProgram, pet: PetCard): string | undefined {
  const b = (pet.breed || "").trim();
  if (b.length >= 2) {
    const hit = prog.breeds.find((r) => r.breed.includes(b) || b.includes(r.breed));
    if (hit) return hit.breed;
  }
  const fur = pet.furLength === "short" ? "ขนสั้น" : pet.furLength === "long" ? "ขนยาว" : "";
  if (fur) return prog.breeds.find((r) => r.breed.includes(fur))?.breed;
  return undefined;
}

export type GroomPrefill = {
  program?: string;
  breed?: string;
  size?: GroomSize;
  /** มาจากไหน — โชว์ให้พนักงานรู้ว่าระบบเลือกให้เพราะอะไร */
  source: "last" | "card";
  last?: LastGroom;
};

/**
 * ค่าที่ควรเลือกไว้ให้ในบรรทัดอาบน้ำของน้องตัวนี้
 * keepProgram = โปรแกรมที่ลูกค้าเลือกไว้ตอนจอง (ถ้ามี จะไม่เปลี่ยนโปรแกรมให้)
 */
export function groomPrefillForPet(opts: {
  invoices: PastInvoice[];
  pet: PetCard;
  onlyPet: boolean;
  customerId?: string;
  programs: GroomProgram[];
  sizeLabels?: Partial<Record<GroomSize, string>>;
  currentProgram: string;
  keepProgram?: boolean;
}): GroomPrefill | null {
  const { programs } = opts;
  const last = lastGroomForPet(opts.invoices, opts.pet.name, opts.onlyPet, opts.customerId);
  if (last) {
    const lastProg =
      programs.find((p) => last.programId && p.id === last.programId) ||
      programs.find((p) => p.name === last.programName);
    const progId = opts.keepProgram || !lastProg ? opts.currentProgram : lastProg.id;
    const prog = programs.find((p) => p.id === progId);
    const breed =
      prog?.breeds.find((r) => r.breed === last.breed)?.breed ||
      (prog ? breedRowForPet(prog, opts.pet) : undefined);
    const size =
      last.size ||
      resolveGroomSizes(opts.sizeLabels).find((s) => s.label === last.sizeLabel)?.id ||
      sizeFromWeight(opts.pet.weightKg);
    if (breed || size) {
      return { program: progId, breed, size, source: "last", last };
    }
  }
  const prog = programs.find((p) => p.id === opts.currentProgram);
  const breed = prog ? breedRowForPet(prog, opts.pet) : undefined;
  const size = sizeFromWeight(opts.pet.weightKg);
  if (!breed && !size) return null;
  return { breed, size, source: "card" };
}
