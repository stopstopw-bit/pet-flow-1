"use client";

import { useState } from "react";
import Image from "next/image";
import { useConfig } from "@/components/ConfigProvider";
import { petKindOf, petWords } from "@/lib/pet-kind";

export type PetPickItem = {
  id: string;
  name: string;
  breed?: string | null;
  photoDataUrl?: string | null;
};

/** ตัดวงเล็บภาษาอังกฤษออก — "สก็อตติช โฟลด์ (Scottish Fold)" → "สก็อตติช โฟลด์" ให้การ์ดดูสะอาด */
function shortBreed(breed?: string | null) {
  if (!breed) return "";
  return breed.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/** รูปการ์ตูนน้องน่ารักๆ แทนตอนยังไม่มีรูปจริง (แมวหูตั้ง / หมาหูตก ตามร้าน) — ใช้สีธีมร้าน (honey / chocolate) */
function CutePetPlaceholder({ dog }: { dog?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true">
      {dog ? (
        <>
          <path d="M32 14 Q52 14 52 36 Q52 54 32 54 Q12 54 12 36 Q12 14 32 14 Z" className="fill-honey" />
          <path d="M15 17 Q6 20 7 36 Q8 43 13 41 Q17 30 20 20 Z M49 17 Q58 20 57 36 Q56 43 51 41 Q47 30 44 20 Z" className="fill-latte-deep/60" />
        </>
      ) : (
        <>
          <path
            d="M14 26 L17 9 L29 19 Q32 18 35 19 L47 9 L50 26 Q54 33 52 41 Q48 54 32 54 Q16 54 12 41 Q10 33 14 26 Z"
            className="fill-honey"
          />
          <path d="M18 22 L19 14 L25 19 Z M46 22 L45 14 L39 19 Z" className="fill-latte-deep/40" />
        </>
      )}
      <ellipse cx="24" cy="35" rx="3" ry="3.6" className="fill-petflow-chocolate" />
      <ellipse cx="40" cy="35" rx="3" ry="3.6" className="fill-petflow-chocolate" />
      <circle cx="25" cy="33.8" r="1" fill="#fff" />
      <circle cx="41" cy="33.8" r="1" fill="#fff" />
      <ellipse cx="18" cy="42" rx="3.5" ry="2.2" className="fill-latte-deep/30" />
      <ellipse cx="46" cy="42" rx="3.5" ry="2.2" className="fill-latte-deep/30" />
      <path d="M30.5 40 h3 l-1.5 1.8 z" className="fill-petflow-chocolate" />
      <path
        d="M32 41.8 Q32 44.5 29 44.5 M32 41.8 Q32 44.5 35 44.5"
        className="stroke-petflow-chocolate"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * รายการเลือกน้องแบบการ์ด — รูปวงกลม + ชื่อ + สายพันธุ์ + ช่องติ๊ก เลือกได้หลายตัว
 * สีทั้งหมดมาจาก CSS variables ของธีมร้าน (BrandingStyle) จึงเปลี่ยนตามสีแบรนด์แต่ละร้าน
 */
export function PetPickList({
  pets,
  selected,
  onToggle,
}: {
  pets: PetPickItem[];
  selected: string[];
  onToggle: (name: string) => void;
}) {
  const { config } = useConfig();
  const pw = petWords(config);
  const dog = petKindOf(config) === "dog";
  // รูปเสีย/ลิงก์หมดอายุ → กลับไปใช้รูปการ์ตูนแทน ไม่โชว์ไอคอนรูปแตก
  const [brokenIds, setBrokenIds] = useState<string[]>([]);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-extrabold text-petflow-chocolate">🐾 เลือกน้องที่จะมา</p>
        <p className="text-[11px] font-bold text-brown-faint">
          เลือกแล้ว {selected.length}/{pets.length} ตัว
        </p>
      </div>
      <div className="overflow-hidden rounded-petflow border border-petflow-line bg-paper">
        {pets.map((pet, i) => {
          const active = selected.includes(pet.name);
          const breed = shortBreed(pet.breed);
          return (
            <button
              key={pet.id}
              type="button"
              role="checkbox"
              aria-checked={active}
              onClick={() => onToggle(pet.name)}
              className={`flex w-full items-center gap-3 px-3 py-3 text-left transition active:scale-[0.99] ${
                i > 0 ? "border-t border-petflow-line" : ""
              } ${active ? "bg-honey/15" : "bg-card"}`}
            >
              <div
                className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-full transition ${
                  active
                    ? "ring-[3px] ring-latte-deep ring-offset-2 ring-offset-card"
                    : "ring-2 ring-honey/40"
                } bg-honey/15`}
              >
                {pet.photoDataUrl && !brokenIds.includes(pet.id) ? (
                  <Image
                    src={pet.photoDataUrl}
                    alt={pet.name}
                    width={56}
                    height={56}
                    className="h-full w-full object-cover"
                    unoptimized
                    onError={() => setBrokenIds((prev) => [...prev, pet.id])}
                  />
                ) : (
                  <div className="h-full w-full p-1.5">
                    <CutePetPlaceholder dog={dog} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-petflow-chocolate">
                  {pet.name}
                </p>
                <p className="truncate text-xs text-brown-soft">{breed || `น้อง${pw.th} ${pw.emoji}`}</p>
              </div>
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition ${
                  active
                    ? "border-latte-deep bg-latte-deep text-white"
                    : "border-petflow-line bg-card text-transparent"
                }`}
                aria-hidden="true"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
                  <path
                    d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
