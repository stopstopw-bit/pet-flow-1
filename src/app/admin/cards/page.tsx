"use client";

import { useEffect, useMemo, useState } from "react";
import type { CardStyleConfig } from "@/lib/config-types";
import {
  GROOM_FORM_DEFAULTS,
  resolveGroomForm,
  type GroomFormConfig,
} from "@/lib/groom-form";
import { toast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { brandColorsFor } from "@/lib/card-brand";

/**
 * ปรับแต่งการ์ด LINE — สี ขนาดตัวอักษร ข้อความ เงื่อนไข และส่วนประกอบของการ์ดแต่ละใบ
 * พร้อมพรีวิวสดข้างๆ — ค่าเก็บใน site config (cards + messages + billing)
 */

type FieldMeta = { key: string; label: string };
type ColorRole = {
  key: "headerColor" | "headerTextColor" | "buttonColor" | "accentColor";
  label: string;
  fallback: string;
};
/** ช่องแก้ข้อความของการ์ดนั้นๆ — ชี้ไปที่ messages.* หรือ billing.* */
type TextMeta = {
  stateKey: string;
  label: string;
  multiline?: boolean;
  hint?: string;
};

/** ข้อความที่เก็บไว้ในตัวการ์ดเอง (cards.<key>.texts.<key>) — ไม่ต้องพึ่ง messages.* */
type StyleTextMeta = {
  key: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
};

type CardMeta = {
  key: string;
  name: string;
  desc: string;
  colors: ColorRole[];
  fields: FieldMeta[];
  texts: TextMeta[];
  /** ช่องแก้ข้อความที่เก็บใน cards.<key>.texts */
  styleTexts?: StyleTextMeta[];
  closingLabel?: string;
  hasTitleSize?: boolean;
};

const CARDS: CardMeta[] = [
  {
    key: "bookingConfirm",
    name: "ยืนยันนัด",
    desc: "ส่งให้ลูกค้ากดยืนยันนัดหมาย",
    colors: [
      { key: "headerColor", label: "สีแถบหัว", fallback: "#6e2f48" },
      { key: "headerTextColor", label: "สีตัวหนังสือหัว", fallback: "#FFFFFF" },
      { key: "accentColor", label: "สีชื่อบริการ", fallback: "#5C4033" },
      { key: "buttonColor", label: "สีปุ่มยืนยัน", fallback: "#bd3a6a" },
    ],
    fields: [
      { key: "location", label: "สถานที่ร้าน" },
      { key: "notes", label: "หมายเหตุ" },
      { key: "map", label: "ปุ่มดูแผนที่" },
      { key: "groomPrep", label: "เตือนพกขนม + ให้อยู่ในตะกร้า (เฉพาะนัดอาบน้ำ)" },
      { key: "roomPrep", label: "เตือนให้อยู่ในตะกร้า (เฉพาะเข้าพักโรงแรม)" },
    ],
    texts: [],
    styleTexts: [
      { key: "header", label: "ข้อความบนแถบหัว", placeholder: "📅 กำหนดการนัด" },
      { key: "subtitle", label: "ข้อความรอง (ต่อด้วยชื่อลูกค้าอัตโนมัติ)", placeholder: "แจ้งกำหนดการนัด 🗓️" },
      { key: "dateLabel", label: "หัวข้อแถววันที่", placeholder: "วันที่" },
      { key: "timeLabel", label: "หัวข้อแถวเวลา", placeholder: "เวลา / รายละเอียด" },
      { key: "locationLabel", label: "หัวข้อแถวสถานที่", placeholder: "สถานที่" },
      { key: "notesLabel", label: "หัวข้อแถวหมายเหตุ", placeholder: "หมายเหตุ" },
      {
        key: "notesFallback",
        label: "ข้อความหมายเหตุเริ่มต้น (ถ้านัดนั้นไม่ได้ใส่หมายเหตุเอง)",
        placeholder: "หากมีรายละเอียดอื่นๆ เพิ่มเติม สามารถแจ้งในแชท LINE ได้เลยนะคะ",
        multiline: true,
      },
      { key: "confirmButton", label: "คำในปุ่มยืนยัน", placeholder: "🐾 ยืนยันนัด" },
      { key: "mapButton", label: "คำในปุ่มดูแผนที่", placeholder: "🗺️ ดูแผนที่ / เส้นทาง" },
      {
        key: "groomPrepNote",
        label: "ข้อความเตือนพกขนม/ตะกร้า (เฉพาะนัดอาบน้ำ)",
        placeholder:
          "🍬 อย่าลืมพกขนม/แมวเลียมาด้วยอย่างน้อย 1-2 ซองนะคะ\n🧺 และให้น้องอยู่ในตะกร้า/กระเป๋าทุกครั้งที่มาใช้บริการด้วยค่ะ",
        multiline: true,
      },
      {
        key: "roomPrepNote",
        label: "ข้อความเตือนตะกร้า/กระเป๋า (เฉพาะเข้าพักโรงแรม)",
        placeholder: "🧺 รบกวนพาน้องใส่ตะกร้า/กระเป๋าทุกครั้งที่มาใช้บริการด้วยนะคะ",
        multiline: true,
      },
    ],
    hasTitleSize: true,
  },
  {
    key: "billSummary",
    name: "สรุปยอด / แจ้งชำระ",
    desc: "การ์ดสรุปรายการ + ยอดเงิน + บัญชีโอน",
    colors: [
      { key: "headerColor", label: "สีหัวข้อ", fallback: "#5C4033" },
      { key: "accentColor", label: "สียอดสุทธิ", fallback: "#C4956A" },
      { key: "buttonColor", label: "สีปุ่มคัดลอกบัญชี", fallback: "#bd3a6a" },
    ],
    fields: [
      { key: "schedule", label: "วัน-เวลานัด" },
      { key: "freebies", label: "กล่องของแถมฟรี" },
      { key: "bank", label: "กล่องเลขบัญชี + ปุ่มคัดลอก" },
      { key: "closing", label: "ข้อความปิดท้าย" },
    ],
    texts: [
      { stateKey: "summaryBookingTitle", label: "หัวข้อการ์ดสรุปการจอง" },
      { stateKey: "summaryDepositTitle", label: "หัวข้อการ์ดแจ้งมัดจำ" },
      { stateKey: "summaryFullTitle", label: "หัวข้อการ์ดแจ้งยอดชำระ" },
      { stateKey: "summaryClosing", label: "ข้อความปิดท้าย (ค่าเริ่มต้น)", multiline: true },
    ],
    styleTexts: [
      { key: "remainingTitle", label: "หัวข้อการ์ด (แบบแจ้งยอดคงเหลือ)", placeholder: "แจ้งยอดคงเหลือที่ต้องโอน" },
      { key: "discountLabel", label: "หัวข้อแถวส่วนลด", placeholder: "ส่วนลด" },
      { key: "totalLabel", label: "หัวข้อแถวยอดสุทธิ", placeholder: "ยอดสุทธิ" },
      { key: "freebiesLabel", label: "หัวข้อกล่องของแถมฟรี", placeholder: "🎁 ของแถมฟรี" },
      { key: "depositPaidLabelBooking", label: "หัวข้อ \"มัดจำ\" (แบบสรุปการจอง)", placeholder: "มัดจำ" },
      { key: "depositPaidLabelFull", label: "หัวข้อ \"มัดจำที่ต้องโอน\" (แบบแจ้งยอดชำระ)", placeholder: "มัดจำที่ต้องโอน" },
      { key: "depositPaidLabelRemaining", label: "หัวข้อ \"มัดจำที่ชำระแล้ว\" (แบบแจ้งยอดคงเหลือ)", placeholder: "มัดจำที่ชำระแล้ว" },
      { key: "depositDueLabelBooking", label: "หัวข้อ \"ยอดคงเหลือ\" (แบบสรุปการจอง)", placeholder: "ยอดคงเหลือ" },
      { key: "depositDueLabelFull", label: "หัวข้อ \"ยอดคงเหลือ (ก่อนเข้าพัก)\" (แบบแจ้งยอดชำระ)", placeholder: "ยอดคงเหลือ (ก่อนเข้าพัก)" },
      { key: "depositDueLabelRemaining", label: "หัวข้อ \"ยอดที่ต้องโอนตอนนี้\" (แบบแจ้งยอดคงเหลือ)", placeholder: "ยอดที่ต้องโอนตอนนี้" },
      { key: "accountNameLabel", label: "คำนำหน้าชื่อบัญชี", placeholder: "ชื่อบัญชี:" },
      { key: "copyButton", label: "คำในปุ่มคัดลอกเลขบัญชี", placeholder: "📋 คัดลอกเลขบัญชี" },
    ],
    hasTitleSize: true,
  },
  {
    key: "depositRequest",
    name: "เรียกเก็บมัดจำ",
    desc: "การ์ดแจ้งยอดมัดจำ + บัญชีโอน",
    colors: [
      { key: "headerColor", label: "สีหัวข้อ", fallback: "#5C4033" },
      { key: "accentColor", label: "สียอดมัดจำ", fallback: "#C4956A" },
      { key: "buttonColor", label: "สีปุ่มคัดลอกบัญชี", fallback: "#bd3a6a" },
    ],
    fields: [
      { key: "note", label: "โน้ตเพิ่มเติม" },
      { key: "bank", label: "กล่องเลขบัญชี" },
    ],
    texts: [
      { stateKey: "depositRequestTitle", label: "หัวข้อการ์ด" },
      {
        stateKey: "depositRequestBody",
        label: "เนื้อความ",
        multiline: true,
        hint: "ใช้ได้: {name} {cat} {amount} {pct}",
      },
    ],
    styleTexts: [
      { key: "amountLabel", label: "คำนำหน้ายอดมัดจำ", placeholder: "มัดจำที่ต้องโอน" },
      { key: "accountNameLabel", label: "คำนำหน้าชื่อบัญชี", placeholder: "ชื่อบัญชี:" },
      { key: "copyButton", label: "คำในปุ่มคัดลอกเลขบัญชี", placeholder: "📋 คัดลอกเลขบัญชี" },
    ],
    closingLabel: "ข้อความปิดท้าย (ไม่บังคับ)",
    hasTitleSize: true,
  },
  {
    key: "receipt",
    name: "ใบเสร็จรับเงิน",
    desc: "ส่งอัตโนมัติหลังรับชำระ (แนบขอรีวิวใน push เดียว)",
    colors: [
      { key: "headerColor", label: "สีแถบหัว", fallback: "#C4956A" },
      { key: "headerTextColor", label: "สีตัวหนังสือหัว", fallback: "#FFFFFF" },
      { key: "accentColor", label: "สียอดที่ชำระ", fallback: "#bd3a6a" },
    ],
    fields: [
      { key: "invoiceNo", label: "เลขที่บิล" },
      { key: "points", label: "แต้มสะสมที่ได้รับ" },
      { key: "closing", label: "ข้อความขอบคุณ" },
      { key: "reviewBundle", label: "แนบการ์ดขอรีวิวไปด้วย (นับ 1 ข้อความ)" },
    ],
    texts: [],
    styleTexts: [
      { key: "header", label: "ข้อความบนแถบหัว", placeholder: "🧾 ใบเสร็จรับเงิน" },
      { key: "customerLabel", label: "หัวข้อแถวลูกค้า", placeholder: "ลูกค้า" },
      { key: "invoiceNoLabel", label: "หัวข้อแถวเลขที่บิล", placeholder: "เลขที่" },
      { key: "paidLabel", label: "หัวข้อกล่องยอดชำระ", placeholder: "ชำระแล้ว" },
      { key: "pointsLabel", label: "หัวข้อแถวแต้มสะสม", placeholder: "🎁 แต้มสะสมที่ได้รับ" },
    ],
    closingLabel: "ข้อความขอบคุณท้ายใบเสร็จ",
    hasTitleSize: true,
  },
  {
    key: "review",
    name: "ขอรีวิว",
    desc: "ส่งหลังใช้บริการ ชวนกดรีวิว",
    colors: [
      { key: "headerColor", label: "สีพื้นหัวการ์ด", fallback: "#FBF4E9" },
      { key: "headerTextColor", label: "สีหัวข้อ", fallback: "#5C4033" },
      { key: "accentColor", label: "สีดาว", fallback: "#C4956A" },
      { key: "buttonColor", label: "สีปุ่มรีวิว", fallback: "#C4956A" },
    ],
    fields: [{ key: "stars", label: "แถวดาว 5 ดวงบนหัวการ์ด" }],
    texts: [
      {
        stateKey: "reviewRequest",
        label: "เนื้อความขอรีวิว (แบบอัตโนมัติหลังเช็คเอาท์)",
        multiline: true,
        hint: "ใช้ได้: {shop} {cat}",
      },
    ],
    styleTexts: [
      { key: "stars", label: "แถวดาว (ข้อความ)", placeholder: "⭐ ⭐ ⭐ ⭐ ⭐" },
      {
        key: "titleBoth",
        label: "หัวข้อ — ใช้ทั้งอาบน้ำและเข้าพัก (แนบท้ายใบเสร็จ)",
        placeholder: "🧡 ขอบคุณที่เลือกร้านดูแลน้องนะคะ",
      },
      {
        key: "bodyBoth",
        label: "เนื้อความ — ใช้ทั้งอาบน้ำและเข้าพัก (แนบท้ายใบเสร็จ)",
        placeholder:
          "หวังว่าน้องจะกลับบ้านไปพร้อมความสุข และคุณพ่อคุณแม่จะอุ่นใจทุกครั้งที่ใช้บริการกับเรานะคะ 🐾\nถ้าประทับใจในการดูแลของเรา ฝากรีวิวให้ทีมงานสักนิดนะคะ",
        multiline: true,
      },
      {
        key: "titleRoom",
        label: "หัวข้อ — เข้าพักโรงแรมอย่างเดียว (แนบท้ายใบเสร็จ)",
        placeholder: "ขอบคุณที่ไว้วางใจร้านนะคะ 🧡",
      },
      {
        key: "bodyRoom",
        label: "เนื้อความ — เข้าพักโรงแรมอย่างเดียว (แนบท้ายใบเสร็จ)",
        placeholder:
          "ตลอดช่วงที่น้องเข้าพัก พวกเราตั้งใจดูแลเหมือนเป็นหนึ่งในครอบครัว\nหวังว่าน้องจะกลับบ้านไปอย่างมีความสุขนะคะ 🐱✨",
        multiline: true,
      },
      {
        key: "titleGroom",
        label: "หัวข้อ — อาบน้ำอย่างเดียว (แนบท้ายใบเสร็จ)",
        placeholder: "ขอบคุณที่ไว้วางใจร้านนะคะ 🧡",
      },
      {
        key: "bodyGroom",
        label: "เนื้อความ — อาบน้ำอย่างเดียว (แนบท้ายใบเสร็จ)",
        placeholder: "หวังว่าน้องจะกลับบ้านไปตัวหอม นุ่มฟู และมีความสุขนะคะ 🐱✨",
        multiline: true,
      },
    ],
    closingLabel: "ประโยคเสริมท้ายการ์ด (ไม่บังคับ)",
    hasTitleSize: true,
  },
  {
    key: "groomInfo",
    name: "สอบถามประวัติก่อนอาบน้ำ",
    desc: "การ์ดลิงก์ให้ลูกค้ากรอกประวัติน้อง",
    colors: [
      { key: "headerColor", label: "สีแถบหัว", fallback: "#6e2f48" },
      { key: "headerTextColor", label: "สีตัวหนังสือหัว", fallback: "#FFFFFF" },
      { key: "accentColor", label: "สีชื่อน้อง", fallback: "#5C4033" },
      { key: "buttonColor", label: "สีปุ่มแจ้งประวัติ", fallback: "#bd3a6a" },
    ],
    fields: [{ key: "date", label: "วันเวลานัด" }],
    texts: [
      {
        stateKey: "groomInfoIntro",
        label: "เนื้อความชวนกรอกประวัติ",
        multiline: true,
        hint: "ใช้ได้: {shop} {cat}",
      },
    ],
    styleTexts: [
      { key: "header", label: "ข้อความบนแถบหัว", placeholder: "🩺 ประวัติน้องก่อนอาบน้ำ" },
      { key: "datePrefix", label: "คำนำหน้าวันนัด", placeholder: "📅 นัดอาบน้ำ:" },
      { key: "button", label: "คำในปุ่ม", placeholder: "🩺 แจ้งประวัติน้อง" },
    ],
    closingLabel: "ประโยคเสริมท้ายการ์ด (ไม่บังคับ)",
    hasTitleSize: true,
  },
  {
    key: "prestay",
    name: "เตรียมตัวก่อนเข้าพัก",
    desc: "การ์ดใหญ่ก่อนวันเข้าพัก — วันที่ ห้อง ของที่ต้องเตรียม + ปุ่มเซ็นข้อตกลง",
    colors: [
      { key: "headerColor", label: "สีแถบหัว", fallback: "#6e2f48" },
      { key: "headerTextColor", label: "สีตัวหนังสือหัว", fallback: "#FFFFFF" },
      { key: "accentColor", label: "สีชื่อน้อง", fallback: "#5C4033" },
      { key: "buttonColor", label: "สีปุ่มยืนยันเข้าพัก", fallback: "#bd3a6a" },
    ],
    fields: [
      { key: "dates", label: "กล่องวันเข้าพัก" },
      { key: "room", label: "ห้องพัก" },
      { key: "prep", label: "รายการของที่ต้องเตรียม" },
      { key: "carrier", label: "เตือนให้อยู่ในตะกร้า/กระเป๋า" },
      { key: "litter", label: "แจ้งเตรียมทราย (กรณีไม่แถมฟรี)" },
      { key: "care", label: "ชวนแจ้งการดูแลพิเศษ" },
    ],
    texts: [
      {
        stateKey: "prestayIntro",
        label: "ข้อความเปิดหัวการ์ด",
        multiline: true,
        hint: "ใช้ได้: {cat}",
      },
      {
        stateKey: "prestayPrepIntro",
        label: "ข้อความนำก่อนรายการของที่ต้องเตรียม",
        multiline: true,
      },
      {
        stateKey: "prestayPrepItems",
        label: "รายการของที่ต้องเตรียม (บรรทัดละ 1 ข้อ)",
        multiline: true,
      },
      {
        stateKey: "prestayCareNote",
        label: "ข้อความชวนแจ้งการดูแลพิเศษ",
        multiline: true,
      },
      {
        stateKey: "prestayLitterNote",
        label: "ข้อความเตือนเตรียมทราย",
        multiline: true,
        hint: "ใช้ได้: {min}",
      },
    ],
    styleTexts: [
      { key: "header", label: "ข้อความบนแถบหัว", placeholder: "🏠 เตรียมตัวก่อนเข้าพัก" },
      { key: "dateLabel", label: "หัวข้อ \"วันเข้าพัก\"", placeholder: "วันเข้าพัก" },
      { key: "roomLabel", label: "หัวข้อ \"ห้องพัก\"", placeholder: "ห้องพัก" },
      { key: "prepTitle", label: "หัวข้อรายการของที่ต้องเตรียม", placeholder: "🧳 สิ่งที่ต้องเตรียมมาด้วย" },
      {
        key: "carrierNote",
        label: "ข้อความเตือนตะกร้า/กระเป๋า",
        placeholder: "🧺 รบกวนพาน้องใส่ตะกร้า/กระเป๋าทุกครั้งที่มาใช้บริการด้วยนะคะ",
        multiline: true,
      },
      { key: "confirmButton", label: "คำในปุ่มยืนยันเข้าพัก", placeholder: "🧡 อ่านรายละเอียด & ยืนยันการเข้าพัก" },
    ],
    closingLabel: "ข้อความปิดท้ายการ์ด (ไม่บังคับ)",
    hasTitleSize: true,
  },
  {
    key: "timePicker",
    name: "เลือกเวลาเช็คอิน / เช็คเอาท์",
    desc: "การ์ดให้ลูกค้ากดเลือกเวลามาส่ง-รับน้อง",
    colors: [
      { key: "headerColor", label: "สีแถบหัว", fallback: "#6e2f48" },
      { key: "headerTextColor", label: "สีตัวหนังสือหัว", fallback: "#FFFFFF" },
      { key: "buttonColor", label: "สีปุ่มเลือกเวลา", fallback: "#bd3a6a" },
    ],
    fields: [],
    texts: [
      {
        stateKey: "checkinReminder",
        label: "เนื้อความการ์ด — เลือกเวลาเข้าพัก (ก่อนวันเข้าพัก)",
        multiline: true,
        hint: "ใช้ได้: {shop} {cat} {checkin} {room} {litterNote}",
      },
      {
        stateKey: "checkoutReminder",
        label: "เนื้อความการ์ด — เลือกเวลารับน้อง (ก่อนวันออก)",
        multiline: true,
        hint: "ใช้ได้: {shop} {cat} {checkout}",
      },
    ],
    styleTexts: [
      { key: "title", label: "หัวข้อการ์ด (ใช้ทั้งเข้าพัก/รับน้อง)", placeholder: "🕒 เลือกเวลาเข้าพัก / รับน้อง" },
      { key: "button", label: "คำในปุ่ม (ว่าง = ใช้คำเดิมของแต่ละแบบ)", placeholder: "🕒 เลือกเวลาส่งน้อง" },
    ],
    closingLabel: "ข้อความปิดท้ายการ์ด (ไม่บังคับ)",
    hasTitleSize: true,
  },
  {
    key: "depositThanks",
    name: "ขอบคุณ (รับมัดจำแล้ว)",
    desc: "ส่งหลังรับเงินมัดจำ — ยืนยันยอด + เงื่อนไขมัดจำ",
    colors: [
      { key: "headerColor", label: "สีหัวข้อ", fallback: "#5C4033" },
      { key: "accentColor", label: "สียอดมัดจำ", fallback: "#bd3a6a" },
    ],
    fields: [
      { key: "percent", label: "บรรทัดบอกเปอร์เซ็นต์" },
      { key: "note", label: "โน้ตเพิ่มเติม" },
      { key: "terms", label: "เงื่อนไขมัดจำ" },
    ],
    texts: [
      { stateKey: "depositThanksTitle", label: "หัวข้อการ์ด" },
      {
        stateKey: "depositThanksBody",
        label: "เนื้อความ",
        multiline: true,
        hint: "ใช้ได้: {shop} {cat} {amount}",
      },
      {
        stateKey: "depositTerms",
        label: "เงื่อนไขมัดจำ (บรรทัดละ 1 ข้อ)",
        multiline: true,
      },
    ],
    styleTexts: [
      { key: "amountLabel", label: "คำนำหน้ายอด", placeholder: "มัดจำที่รับ" },
      { key: "termsTitle", label: "หัวข้อเงื่อนไข", placeholder: "🐾 เงื่อนไขมัดจำ" },
    ],
    closingLabel: "ข้อความปิดท้ายการ์ด (ไม่บังคับ)",
    hasTitleSize: true,
  },
  {
    key: "memberBalance",
    name: "ยอด Member คงเหลือ",
    desc: "แนบท้ายใบเสร็จให้ลูกค้า Member — แจ้งเครดิตคงเหลือ",
    colors: [
      { key: "headerColor", label: "สีหัวข้อ", fallback: "#5C4033" },
      { key: "accentColor", label: "สียอดคงเหลือ", fallback: "#C4956A" },
    ],
    fields: [
      { key: "customerName", label: "ชื่อลูกค้า" },
      { key: "usedToday", label: "บรรทัด “ใช้วันนี้ … บาท”" },
    ],
    texts: [],
    styleTexts: [
      { key: "title", label: "หัวข้อการ์ด", placeholder: "💎 สรุปยอด Member" },
      { key: "balanceLabel", label: "คำนำหน้ายอดคงเหลือ", placeholder: "คงเหลือ" },
      { key: "usedTodayPrefix", label: "คำนำหน้าบรรทัด \"ใช้วันนี้\"", placeholder: "ใช้วันนี้" },
    ],
    closingLabel: "ข้อความปิดท้ายการ์ด (ไม่บังคับ)",
    hasTitleSize: true,
  },
  {
    key: "payment",
    name: "แจ้งชำระเงิน (จากบิล)",
    desc: "ส่งจากหน้าบิล — รายการ + ยอดรวม + บัญชีโอน",
    colors: [
      { key: "headerColor", label: "สีหัวข้อ", fallback: "#5C4033" },
      { key: "accentColor", label: "สียอดรวม", fallback: "#C4956A" },
      { key: "buttonColor", label: "สีปุ่มคัดลอกบัญชี", fallback: "#bd3a6a" },
    ],
    fields: [
      { key: "items", label: "รายการสินค้า/บริการ" },
      { key: "bank", label: "กล่องเลขบัญชี + ปุ่มคัดลอก" },
    ],
    texts: [],
    styleTexts: [
      { key: "title", label: "หัวข้อการ์ด", placeholder: "💳 แจ้งชำระเงิน" },
      { key: "totalLabel", label: "คำนำหน้ายอดรวม", placeholder: "รวม" },
      { key: "accountNameLabel", label: "คำนำหน้าชื่อบัญชี", placeholder: "ชื่อบัญชี:" },
      { key: "copyButton", label: "คำในปุ่มคัดลอกเลขบัญชี", placeholder: "📋 คัดลอกเลขบัญชี" },
      { key: "detailButton", label: "คำในปุ่มดูรายละเอียด", placeholder: "ดูรายละเอียด" },
    ],
    closingLabel: "ข้อความปิดท้ายการ์ด (ไม่บังคับ)",
    hasTitleSize: true,
  },
  {
    key: "coupon",
    name: "คูปองส่วนลด",
    desc: "ยิงแคมเปญคูปองให้ลูกค้ากดรับ",
    colors: [
      { key: "headerColor", label: "สีแถบหัว", fallback: "#6e2f48" },
      { key: "headerTextColor", label: "สีตัวหนังสือหัว", fallback: "#FFFFFF" },
      { key: "accentColor", label: "สีตัวเลขส่วนลด", fallback: "#C4956A" },
      { key: "buttonColor", label: "สีปุ่มกดรับคูปอง", fallback: "#bd3a6a" },
    ],
    fields: [],
    texts: [],
    styleTexts: [
      { key: "header", label: "ข้อความบนแถบหัว", placeholder: "🎟️ คูปองส่วนลดพิเศษ" },
      { key: "amountLabel", label: "คำนำหน้ายอดส่วนลด", placeholder: "ส่วนลด" },
      { key: "button", label: "คำในปุ่ม", placeholder: "🎟️ กดรับคูปอง" },
    ],
    closingLabel: "ข้อความอธิบายวิธีใช้ (ไม่บังคับ)",
    hasTitleSize: true,
  },
  {
    key: "promo",
    name: "โปรโมชั่น (บรอดแคสต์)",
    desc: "การ์ดโปรที่ยิงหาลูกค้าหลายคนพร้อมกัน",
    colors: [
      { key: "headerColor", label: "สีแถบหัว (เมื่อไม่ใส่รูป)", fallback: "#6e2f48" },
      { key: "headerTextColor", label: "สีตัวหนังสือหัว", fallback: "#FFFFFF" },
      { key: "accentColor", label: "สีหัวข้อโปร", fallback: "#5C4033" },
      { key: "buttonColor", label: "สีปุ่มหลัก", fallback: "#bd3a6a" },
    ],
    fields: [],
    texts: [],
    styleTexts: [
      { key: "header", label: "ข้อความบนแถบหัว", placeholder: "✨ โปรโมชั่น PetFlow" },
      { key: "detailButton", label: "คำในปุ่ม (เมื่อไม่ได้กำหนดปุ่มเอง)", placeholder: "ดูรายละเอียด" },
    ],
    closingLabel: "ข้อความปิดท้ายการ์ด (ไม่บังคับ)",
    hasTitleSize: true,
  },
  {
    key: "groomFormFields",
    name: "ฟอร์มถามประวัติน้อง",
    desc: "คำถามที่ลูกค้าเห็นในฟอร์มก่อนอาบน้ำ — เปิด/ปิด แก้คำถาม เพิ่ม-ลบตัวเลือกเองได้",
    colors: [],
    fields: [],
    texts: [],
  },
  {
    key: "consent",
    name: "เงื่อนไขเข้าพัก + ลายเซ็น",
    desc: "หัวข้อและข้อตกลงที่ลูกค้าต้องอ่านและเซ็นยอมรับ — เขียนเองได้ทุกข้อ",
    colors: [],
    fields: [],
    texts: [
      { stateKey: "consentTitle", label: "หัวข้อข้อตกลง" },
      {
        stateKey: "consentTerms",
        label: "ข้อตกลงทั้งหมด (1 บรรทัด = 1 ข้อ — เพิ่ม/ลบ/แก้ได้อิสระ)",
        multiline: true,
      },
    ],
  },
];

const SWATCHES = [
  "#6e2f48", "#bd3a6a", "#C4956A", "#5C4033", "#B4553B", "#3E6990",
];

const BRAND_FALLBACK = { primary: "#a9855f", accent: "#ebc583", heading: "#5c4033" };

const TITLE_SIZES: { value: "" | "sm" | "md" | "lg" | "xl"; label: string }[] = [
  { value: "", label: "ค่าเริ่มต้น" },
  { value: "sm", label: "เล็ก" },
  { value: "md", label: "กลาง" },
  { value: "lg", label: "ใหญ่" },
  { value: "xl", label: "ใหญ่มาก" },
];

const SIZE_PREVIEW: Record<string, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-lg",
};

function styleValue(st: CardStyleConfig, role: ColorRole) {
  return st[role.key] || role.fallback;
}

/* ── พรีวิวสด ── */
function Preview({
  meta,
  st,
  texts,
}: {
  meta: CardMeta;
  st: CardStyleConfig;
  texts: Record<string, string>;
}) {
  const show = (k: string) => st.show?.[k] !== false;
  const c = (role: ColorRole["key"], fb: string) => st[role] || fb;
  /** ข้อความที่เก็บในตัวการ์ดเอง (cards.<key>.texts) — ว่าง = ใช้ค่าเริ่มต้น */
  const t = (k: string, fb: string) => st.texts?.[k] || fb;
  const titleCls = SIZE_PREVIEW[st.titleSize || ""] || "text-sm";
  // การ์ด "ยืนยันนัด" หน้าตาต่างกันระหว่างนัดอาบน้ำกับเข้าพัก — ให้เลือกดูได้ทั้งสองแบบ
  const [confirmVariant, setConfirmVariant] = useState<"groom" | "room">("groom");

  const bubble = "overflow-hidden rounded-2xl border border-[#e8e0d0] bg-white shadow-lg";
  const btn = (color: string, label: string) => (
    <div className="px-3 pb-3">
      <div className="rounded-lg py-2 text-center text-xs font-bold text-white" style={{ background: color }}>
        {label}
      </div>
    </div>
  );

  if (meta.key === "bookingConfirm") {
    const isRoomPreview = confirmVariant === "room";
    return (
      <div>
        {/* หน้าตาการ์ดต่างกันระหว่างนัดอาบน้ำกับเข้าพัก — สลับดูได้ทั้งสองแบบ */}
        <div className="mb-2 flex overflow-hidden rounded-full border border-[#e8e0d0] text-[11px] font-bold">
          <button
            type="button"
            onClick={() => setConfirmVariant("groom")}
            className={`flex-1 py-1.5 transition ${
              !isRoomPreview ? "bg-latte-deep text-white" : "bg-white text-brown-soft"
            }`}
          >
            🛁 นัดอาบน้ำ
          </button>
          <button
            type="button"
            onClick={() => setConfirmVariant("room")}
            className={`flex-1 py-1.5 transition ${
              isRoomPreview ? "bg-latte-deep text-white" : "bg-white text-brown-soft"
            }`}
          >
            🏠 เข้าพักโรงแรม
          </button>
        </div>
        <div className={bubble}>
          <div className="px-4 py-3" style={{ background: c("headerColor", "#6e2f48") }}>
            <p className="text-xs font-extrabold" style={{ color: c("headerTextColor", "#FFFFFF") }}>📅 กำหนดการนัด</p>
          </div>
          <div className="space-y-2 px-4 py-3 text-[11px] text-[#4E3E32]">
            <p className={`${titleCls} font-extrabold`} style={{ color: c("accentColor", "#5C4033") }}>
              {isRoomPreview ? "ห้องพัก · Soju" : "อาบน้ำ & กรูมมิ่ง · Soju"}
            </p>
            <p className="text-[10px] text-[#A2907E]">แจ้งกำหนดการนัด 🗓️ คุณตาล</p>
            {isRoomPreview ? (
              <>
                <p>🗓️ <b>วันที่</b> — 24 ก.ค. 2569 → 26 ก.ค. 2569</p>
                <p>⏰ <b>เวลา / รายละเอียด</b> — ห้อง Mid Cozy</p>
              </>
            ) : (
              <>
                <p>🗓️ <b>วันที่</b> — 24 ก.ค. 2569</p>
                <p>⏰ <b>เวลา</b> — 12:30 น.</p>
              </>
            )}
            {show("location") && <p>📍 <b>สถานที่</b> — PetFlow · เทพารักษ์ บางนา</p>}
            {show("notes") && <p>📝 <b>หมายเหตุ</b> — แจ้งในแชทได้เลยนะคะ</p>}
            {!isRoomPreview && show("groomPrep") && (
              <p className="whitespace-pre-line rounded-lg bg-[#FBEEE0] px-2.5 py-2 text-[10px] font-bold text-[#B4553B]">
                {t(
                  "groomPrepNote",
                  "🍬 อย่าลืมพกขนม/แมวเลียมาด้วยอย่างน้อย 1-2 ซองนะคะ\n🧺 และให้น้องอยู่ในตะกร้า/กระเป๋าทุกครั้งที่มาใช้บริการด้วยค่ะ"
                )}
              </p>
            )}
            {isRoomPreview && show("roomPrep") && (
              <p className="whitespace-pre-line rounded-lg bg-[#FBEEE0] px-2.5 py-2 text-[10px] font-bold text-[#B4553B]">
                {t(
                  "roomPrepNote",
                  "🧺 รบกวนพาน้องใส่ตะกร้า/กระเป๋าทุกครั้งที่มาใช้บริการด้วยนะคะ"
                )}
              </p>
            )}
          </div>
          {btn(c("buttonColor", "#bd3a6a"), "🐾 ยืนยันนัด")}
          {show("map") && <p className="pb-3 text-center text-[10px] font-bold text-[#3E6990]">🗺️ ดูแผนที่ / เส้นทาง</p>}
        </div>
      </div>
    );
  }

  if (meta.key === "billSummary") {
    return (
      <div className={bubble}>
        <div className="space-y-2 px-4 py-3 text-[11px] text-[#4E3E32]">
          <p className={`${titleCls} font-extrabold`} style={{ color: c("headerColor", "#5C4033") }}>
            💳 {texts.summaryFullTitle || "แจ้งยอดชำระ"}
          </p>
          <p className="text-[10px] text-[#A2907E]">Soju · ตาล</p>
          {show("schedule") && <p className="text-[10px] font-bold">🛁 นัดอาบน้ำ: 24 ก.ค. 12:30 น.</p>}
          <hr className="border-[#eee3d2]" />
          <div className="flex justify-between"><span>PetFlow Premium · แมวไทย M</span><span>900 บาท</span></div>
          <div className="flex justify-between text-[#C08A2E]"><span>ส่วนลด</span><span>-45 บาท</span></div>
          <hr className="border-[#eee3d2]" />
          <div className="flex items-baseline justify-between">
            <span className="font-extrabold">ยอดสุทธิ</span>
            <span className="text-base font-extrabold" style={{ color: c("accentColor", "#C4956A") }}>855 บาท</span>
          </div>
          {show("freebies") && (
            <div className="rounded-lg bg-[#FBF7F0] px-2.5 py-1.5 text-[10px]"><b>🎁 ของแถมฟรี</b> · กล้องวงจรปิด (CCTV)</div>
          )}
          {show("bank") && (
            <div className="rounded-lg bg-[#F4ECE0] px-2.5 py-2">
              <p className="font-extrabold">กรุงไทย</p>
              <p className="text-sm font-extrabold text-[#bd3a6a]">664-4-43446-0</p>
              <p className="text-[10px] text-[#A2907E]">ชื่อบัญชี: PetFlow</p>
            </div>
          )}
          {show("closing") && (
            <p className="whitespace-pre-line text-[10px] text-[#A2907E]">{st.closing || texts.summaryClosing || "โอนแล้วแจ้งสลิปได้เลยนะคะ 🧡"}</p>
          )}
        </div>
        {show("bank") && btn(c("buttonColor", "#bd3a6a"), "📋 คัดลอกเลขบัญชี")}
      </div>
    );
  }

  if (meta.key === "depositRequest") {
    return (
      <div className={bubble}>
        <div className="space-y-2 px-4 py-3 text-[11px] text-[#4E3E32]">
          <p className={`${titleCls} font-extrabold`} style={{ color: c("headerColor", "#5C4033") }}>
            {texts.depositRequestTitle || "🧡 ล็อกคิวให้น้องกันค่ะ"}
          </p>
          <p className="whitespace-pre-line">
            {(texts.depositRequestBody || "รบกวนชำระมัดจำเพื่อจองคิวนะคะ")
              .replace("{name}", "ตาล").replace("{cat}", "Soju")
              .replace("{amount}", "200").replace("{pct}", "")}
          </p>
          {show("note") && <p className="text-[10px] text-[#A2907E]">📝 โน้ต: จองคิววันเสาร์</p>}
          <div className="rounded-xl bg-[#FBF4E9] px-3 py-3 text-center">
            <p className="text-[10px] text-[#A2907E]">มัดจำที่ต้องโอน</p>
            <p className="text-2xl font-extrabold" style={{ color: c("accentColor", "#C4956A") }}>200 บาท</p>
          </div>
          {show("bank") && (
            <div className="rounded-lg bg-[#F4ECE0] px-2.5 py-2">
              <p className="font-extrabold">กรุงไทย</p>
              <p className="text-sm font-extrabold text-[#bd3a6a]">664-4-43446-0</p>
            </div>
          )}
          {st.closing && <p className="whitespace-pre-line text-[10px] text-[#A2907E]">{st.closing}</p>}
        </div>
        {btn(c("buttonColor", "#bd3a6a"), "📋 คัดลอกเลขบัญชี")}
      </div>
    );
  }

  if (meta.key === "receipt") {
    return (
      <div className={bubble}>
        <div className="px-4 py-3" style={{ background: c("headerColor", "#C4956A") }}>
          <p className={`${titleCls} font-extrabold`} style={{ color: c("headerTextColor", "#FFFFFF") }}>🧾 ใบเสร็จรับเงิน</p>
          <p className="text-[10px]" style={{ color: c("headerTextColor", "#FFFFFF") }}>PetFlow</p>
        </div>
        <div className="space-y-2 px-4 py-3 text-[11px] text-[#4E3E32]">
          <p>🐱 <b>ลูกค้า</b> — Soju · ตาล</p>
          {show("invoiceNo") && <p>🔖 <b>เลขที่</b> — INV1784047676893</p>}
          <div className="rounded-xl bg-[#FBF4E9] px-3 py-3 text-center">
            <p className="text-[10px] text-[#A2907E]">ชำระแล้ว</p>
            <p className="text-2xl font-extrabold" style={{ color: c("accentColor", "#bd3a6a") }}>855 บาท</p>
          </div>
          {show("points") && (
            <div className="flex justify-between rounded-lg bg-[#F4ECE0] px-2.5 py-2">
              <span>🎁 แต้มสะสมที่ได้รับ</span><b className="text-[#C4956A]">+8</b>
            </div>
          )}
          {show("closing") && (
            <p className="whitespace-pre-line text-center text-[10px] text-[#A2907E]">{st.closing || "ขอบคุณที่ไว้วางใจ PetFlow นะคะ 🧡"}</p>
          )}
          {show("reviewBundle") && (
            <p className="rounded-lg border border-dashed border-[#d9c9a8] px-2 py-1.5 text-center text-[9px] text-[#A2907E]">
              ⭐ การ์ดขอรีวิวจะแนบไปใน push เดียวกัน (นับ 1 ข้อความ)
            </p>
          )}
        </div>
      </div>
    );
  }

  if (meta.key === "review") {
    return (
      <div className={bubble}>
        <div className="px-4 py-4 text-center" style={{ background: c("headerColor", "#FBF4E9") }}>
          {show("stars") && <p className="text-sm" style={{ color: c("accentColor", "#C4956A") }}>⭐ ⭐ ⭐ ⭐ ⭐</p>}
          <p className={`mt-1 ${titleCls} font-extrabold`} style={{ color: c("headerTextColor", "#5C4033") }}>
            ขอบคุณที่ไว้วางใจ PetFlow นะคะ 🧡
          </p>
        </div>
        <div className="space-y-1.5 px-4 py-3 text-[11px] text-[#4E3E32]">
          <p className="whitespace-pre-line">
            {(texts.reviewRequest || "ถ้าประทับใจ ฝากรีวิวให้ทีมงานหน่อยนะคะ")
              .replace("{shop}", "PetFlow").replace("{cat}", "น้อง Soju")}
          </p>
          {st.closing && <p className="whitespace-pre-line text-[10px] text-[#A2907E]">{st.closing}</p>}
        </div>
        {btn(c("buttonColor", "#C4956A"), "⭐ รีวิวให้เราหน่อยนะคะ")}
      </div>
    );
  }

  if (meta.key === "consent") {
    const terms = (texts.consentTerms || "").split("\n").map((t) => t.trim()).filter(Boolean);
    return (
      <div className={bubble}>
        <div className="space-y-2 px-4 py-3 text-[11px] text-[#4E3E32]">
          <p className="text-sm font-extrabold text-[#5C4033]">📋 {texts.consentTitle || "ข้อตกลงและเงื่อนไขการเข้าพัก"}</p>
          <p className="text-[10px] text-[#A2907E]">🐱 เรเนล · เข้าพัก 20 → 26 ก.ค.</p>
          <div className="space-y-1">
            {(terms.length ? terms : ["(ยังไม่มีข้อตกลง — พิมพ์ด้านซ้ายได้เลย)"]).slice(0, 5).map((t, i) => (
              <p key={i} className="rounded bg-[#F8F2E4] px-2 py-1 text-[10px]">{i + 1}. {t}</p>
            ))}
            {terms.length > 5 && (
              <p className="text-center text-[9px] text-[#A2907E]">…และอีก {terms.length - 5} ข้อ (เห็นครบในหน้าเซ็น)</p>
            )}
          </div>
        </div>
        {btn("#bd3a6a", "📋 อ่าน + เซ็นยอมรับข้อตกลง")}
      </div>
    );
  }

  if (meta.key === "prestay") {
    return (
      <div className={bubble}>
        <div className="px-4 py-3" style={{ background: c("headerColor", "#6e2f48") }}>
          <p className="text-xs font-extrabold" style={{ color: c("headerTextColor", "#FFFFFF") }}>
            {t("header", "🏠 เตรียมตัวก่อนเข้าพัก")}
          </p>
        </div>
        <div className="space-y-2 px-4 py-3 text-[11px] text-[#4E3E32]">
          <p className={`${titleCls} font-extrabold`} style={{ color: c("accentColor", "#5C4033") }}>🐱 เรเนล</p>
          <p className="text-[10px] text-[#A2907E]">PetFlow</p>
          <p>สวัสดีค่ะ 🧡 ใกล้ถึงวันเข้าพักของน้องแล้วนะคะ</p>
          {(show("dates") || show("room")) && (
            <div className="space-y-1.5 rounded-xl bg-[#F4ECE0] px-3 py-2.5">
              {show("dates") && (
                <p>📅 <span className="text-[9px] text-[#9B8B7E]">วันเข้าพัก</span> <b className="text-[#bd3a6a]">20 → 26 ก.ค. 2569</b></p>
              )}
              {show("room") && (
                <p>🏠 <span className="text-[9px] text-[#9B8B7E]">ห้องพัก</span> <b>Mid Cozy</b></p>
              )}
            </div>
          )}
          {show("prep") && (
            <>
              <p className="pt-1 text-xs font-extrabold" style={{ color: c("headerColor", "#5C4033") }}>
                {t("prepTitle", "🧳 สิ่งที่ต้องเตรียมมาด้วย")}
              </p>
              <div className="space-y-1 rounded-lg bg-[#FBF7F0] px-2.5 py-2 text-[10px]">
                <p>🍽️ อาหารที่น้องกินประจำ</p>
                <p>💊 ยาประจำตัว (ถ้ามี)</p>
              </div>
            </>
          )}
          {show("carrier") && (
            <p className="whitespace-pre-line rounded-lg bg-[#FBEEE0] px-2.5 py-1.5 text-[10px] font-bold text-[#B4553B]">
              {t(
                "carrierNote",
                "🧺 รบกวนพาน้องใส่ตะกร้า/กระเป๋าทุกครั้งที่มาใช้บริการด้วยนะคะ"
              )}
            </p>
          )}
          {show("litter") && (
            <p className="rounded-lg bg-[#FBEEE0] px-2.5 py-1.5 text-[10px] text-[#B4553B]">⚠️ ห้องนี้พักไม่ถึง 3 วัน รบกวนเตรียมทรายมาด้วยนะคะ</p>
          )}
          {show("care") && (
            <p className="rounded-lg bg-[#FBF0F1] px-2.5 py-1.5 text-[10px] text-[#7A6A5A]">💗 มีอะไรที่ต้องดูแลพิเศษ แจ้งได้เลยนะคะ</p>
          )}
          {st.closing && <p className="whitespace-pre-line text-[10px] text-[#A2907E]">{st.closing}</p>}
        </div>
        {btn(c("buttonColor", "#bd3a6a"), "🧡 อ่านรายละเอียด & ยืนยันการเข้าพัก")}
      </div>
    );
  }

  if (meta.key === "timePicker") {
    return (
      <div className={bubble}>
        <div className="px-4 py-3" style={{ background: c("headerColor", "#6e2f48") }}>
          <p className={`${titleCls} font-extrabold`} style={{ color: c("headerTextColor", "#FFFFFF") }}>🕒 เลือกเวลาเข้าพัก</p>
        </div>
        <div className="space-y-2 px-4 py-3 text-[11px] text-[#4E3E32]">
          <p>น้องเรเนลเข้าพัก 20 ก.ค. นะคะ 🐾{"\n"}รบกวนเลือกเวลาที่สะดวกมาส่งน้องด้วยค่ะ</p>
          {st.closing && <p className="whitespace-pre-line text-[10px] text-[#A2907E]">{st.closing}</p>}
        </div>
        {btn(c("buttonColor", "#bd3a6a"), t("button", "🕒 เลือกเวลาส่งน้อง"))}
      </div>
    );
  }

  if (meta.key === "depositThanks") {
    return (
      <div className={bubble}>
        <div className="space-y-2 px-4 py-3 text-[11px] text-[#4E3E32]">
          <p className={`${titleCls} font-extrabold`} style={{ color: c("headerColor", "#5C4033") }}>
            💚 รับมัดจำเรียบร้อยแล้วค่ะ
          </p>
          <p>ขอบคุณคุณตาลที่ล็อกคิวให้น้อง Soju นะคะ คิวยืนยันเรียบร้อยแล้วค่ะ 🧡</p>
          <div className="space-y-1 rounded-lg bg-[#F4ECE0] px-2.5 py-2">
            <div className="flex justify-between">
              <span>{t("amountLabel", "มัดจำที่รับ")}</span>
              <b className="text-sm" style={{ color: c("accentColor", "#bd3a6a") }}>200 บาท</b>
            </div>
            {show("percent") && <p className="text-right text-[9px] text-[#A2907E]">(30% ของยอดรวม)</p>}
            {show("note") && <p className="text-[10px] text-[#A2907E]">จองคิววันเสาร์</p>}
          </div>
          {show("terms") && (
            <>
              <hr className="border-[#eee3d2]" />
              <p className="text-[10px] font-extrabold" style={{ color: c("headerColor", "#5C4033") }}>
                {t("termsTitle", "🐾 เงื่อนไขมัดจำ")}
              </p>
              <p className="text-[10px] text-[#7A6A5A]">• มัดจำใช้หักจากยอดรวมในวันรับบริการ</p>
              <p className="text-[10px] text-[#7A6A5A]">• เลื่อนนัดล่วงหน้า 24 ชม. ได้โดยไม่เสียมัดจำ</p>
            </>
          )}
          {st.closing && <p className="whitespace-pre-line text-[10px] text-[#A2907E]">{st.closing}</p>}
        </div>
      </div>
    );
  }

  if (meta.key === "memberBalance") {
    return (
      <div className={bubble}>
        <div className="space-y-1 px-4 py-4 text-[11px] text-[#4E3E32]">
          <p className={`${titleCls} font-extrabold`} style={{ color: c("headerColor", "#5C4033") }}>
            {t("title", "💎 สรุปยอด Member")}
          </p>
          {show("customerName") && <p className="pt-1 text-[10px] text-[#A2907E]">คุณตาล</p>}
          <p className="pt-1.5 text-lg font-extrabold" style={{ color: c("accentColor", "#C4956A") }}>
            {t("balanceLabel", "คงเหลือ")} 1,500 บาท
          </p>
          {show("usedToday") && <p className="pt-1 text-[10px]">ใช้วันนี้ 550 บาท · Soju</p>}
          {st.closing && <p className="whitespace-pre-line pt-2 text-[10px] text-[#A2907E]">{st.closing}</p>}
        </div>
      </div>
    );
  }

  if (meta.key === "payment") {
    return (
      <div className={bubble}>
        <div className="space-y-2 px-4 py-3 text-[11px] text-[#4E3E32]">
          <p className={`${titleCls} font-extrabold`} style={{ color: c("headerColor", "#5C4033") }}>
            {t("title", "💳 แจ้งชำระเงิน")}
          </p>
          <p className="text-[10px] text-[#A2907E]">Soju · ตาล</p>
          {show("items") && (
            <p className="whitespace-pre-line text-[10px]">PetFlow Premium · แมวไทย M 900 บาท{"\n"}ส่วนลด -45 บาท</p>
          )}
          <hr className="border-[#eee3d2]" />
          <p className="text-base font-extrabold" style={{ color: c("accentColor", "#C4956A") }}>รวม 855 บาท</p>
          {show("bank") && (
            <div className="rounded-lg bg-[#F4ECE0] px-2.5 py-2">
              <p className="font-extrabold">กรุงไทย</p>
              <p className="text-sm font-extrabold text-[#bd3a6a]">664-4-43446-0</p>
              <p className="text-[10px] text-[#A2907E]">ชื่อบัญชี: PetFlow</p>
            </div>
          )}
          {st.closing && <p className="whitespace-pre-line text-[10px] text-[#A2907E]">{st.closing}</p>}
        </div>
        {show("bank") && btn(c("buttonColor", "#bd3a6a"), "📋 คัดลอกเลขบัญชี")}
      </div>
    );
  }

  if (meta.key === "coupon") {
    return (
      <div className={bubble}>
        <div className="px-4 py-3" style={{ background: c("headerColor", "#6e2f48") }}>
          <p className="text-xs font-extrabold" style={{ color: c("headerTextColor", "#FFFFFF") }}>
            {t("header", "🎟️ คูปองส่วนลดพิเศษ")}
          </p>
        </div>
        <div className="space-y-2 px-4 py-3 text-[11px] text-[#4E3E32]">
          <p className={`${titleCls} font-extrabold`} style={{ color: c("accentColor", "#5C4033") }}>คิดถึงน้องจัง กลับมาหาเราหน่อยนะ 🧡</p>
          <div className="rounded-xl bg-[#FBF4E9] px-3 py-3 text-center">
            <p className="text-[10px] text-[#A2907E]">ส่วนลด</p>
            <p className="text-2xl font-extrabold" style={{ color: c("accentColor", "#C4956A") }}>100 บาท</p>
          </div>
          <p className="text-[10px] text-[#A2907E]">
            {st.closing || "กดรับแล้วเก็บไว้ในกระเป๋าคูปอง ใช้เป็นส่วนลดได้เลย"} (ใช้ได้ 30 วัน) 🧡
          </p>
        </div>
        {btn(c("buttonColor", "#bd3a6a"), t("button", "🎟️ กดรับคูปอง"))}
      </div>
    );
  }

  if (meta.key === "promo") {
    return (
      <div className={bubble}>
        <div className="px-4 py-5" style={{ background: c("headerColor", "#6e2f48") }}>
          <p className="text-sm font-extrabold" style={{ color: c("headerTextColor", "#FFFFFF") }}>
            {t("header", "✨ โปรโมชั่น PetFlow")}
          </p>
          <p className="text-[9px]" style={{ color: c("headerTextColor", "#FFFFFF") }}>(ถ้าใส่รูปโปร รูปจะแทนแถบนี้)</p>
        </div>
        <div className="space-y-2 px-4 py-3 text-[11px] text-[#4E3E32]">
          <p className={`${titleCls} font-extrabold`} style={{ color: c("accentColor", "#5C4033") }}>โปรเดือนกรกฎา อาบน้ำลด 15%</p>
          <p className="text-[10px] font-extrabold" style={{ color: c("buttonColor", "#bd3a6a") }}>ลด 15%</p>
          <p>จองคิวภายในสิ้นเดือนนี้ รับส่วนลดทันทีนะคะ 🐾</p>
          {st.closing && <p className="whitespace-pre-line text-[10px] text-[#A2907E]">{st.closing}</p>}
        </div>
        {btn(c("buttonColor", "#bd3a6a"), "ดูรายละเอียด")}
      </div>
    );
  }

  // groomInfo
  return (
    <div className={bubble}>
      <div className="px-4 py-3" style={{ background: c("headerColor", "#6e2f48") }}>
        <p className="text-xs font-extrabold" style={{ color: c("headerTextColor", "#FFFFFF") }}>🩺 ประวัติน้องก่อนอาบน้ำ</p>
      </div>
      <div className="space-y-2 px-4 py-3 text-[11px] text-[#4E3E32]">
        <p className={`${titleCls} font-extrabold`} style={{ color: c("accentColor", "#5C4033") }}>🐱 Soju</p>
        {show("date") && <p className="text-[10px] text-[#A2907E]">📅 นัดอาบน้ำ: 24 ก.ค. 12:30</p>}
        <p className="whitespace-pre-line">
          {(texts.groomInfoIntro || "รบกวนแจ้งประวัติน้องสั้นๆ นะคะ 🐾")
            .replace("{shop}", "PetFlow").replace("{cat}", "น้อง Soju")}
        </p>
        {st.closing && <p className="whitespace-pre-line text-[10px] text-[#A2907E]">{st.closing}</p>}
      </div>
      {btn(c("buttonColor", "#bd3a6a"), "🩺 แจ้งประวัติน้อง")}
    </div>
  );
}

export default function CardsStudioPage() {
  const [cards, setCards] = useState<Record<string, CardStyleConfig>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [groomForm, setGroomForm] = useState<GroomFormConfig>({});
  const [branding, setBranding] = useState(BRAND_FALLBACK);
  const [hasBrand, setHasBrand] = useState(false);
  const [activeKey, setActiveKey] = useState(CARDS[0].key);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        const cfg = d.config || {};
        setCards(cfg.cards || {});
        setGroomForm(cfg.groomForm || {});
        setBranding({ ...BRAND_FALLBACK, ...cfg.branding });
        setHasBrand(Boolean(cfg.branding?.primary));
        setTexts({
          summaryBookingTitle: cfg.billing?.summaryBookingTitle || "",
          summaryDepositTitle: cfg.billing?.summaryDepositTitle || "",
          summaryFullTitle: cfg.billing?.summaryFullTitle || "",
          summaryClosing: cfg.billing?.summaryClosing || "",
          depositRequestTitle: cfg.messages?.depositRequestTitle || "",
          depositRequestBody: cfg.messages?.depositRequestBody || "",
          reviewRequest: cfg.messages?.reviewRequest || "",
          groomInfoIntro: cfg.messages?.groomInfoIntro || "",
          consentTitle: cfg.messages?.consentTitle || "",
          consentTerms: (cfg.messages?.consentTerms || []).join("\n"),
          // การ์ดเลือกเวลาเช็คอิน/เช็คเอาท์
          checkinReminder: cfg.messages?.checkinReminder || "",
          checkoutReminder: cfg.messages?.checkoutReminder || "",
          // การ์ดขอบคุณ (รับมัดจำแล้ว)
          depositThanksTitle: cfg.messages?.depositThanksTitle || "",
          depositThanksBody: cfg.messages?.depositThanksBody || "",
          depositTerms: (cfg.messages?.depositTerms || []).join("\n"),
          // การ์ดเตรียมตัวก่อนเข้าพัก
          prestayIntro: cfg.messages?.prestayIntro || "",
          prestayPrepIntro: cfg.messages?.prestayPrepIntro || "",
          prestayPrepItems: (cfg.messages?.prestayPrepItems || []).join("\n"),
          prestayCareNote: cfg.messages?.prestayCareNote || "",
          prestayLitterNote: cfg.messages?.prestayLitterNote || "",
        });
      })
      .finally(() => setLoaded(true));
  }, []);

  const meta = useMemo(() => CARDS.find((c) => c.key === activeKey)!, [activeKey]);
  const st = cards[activeKey] || {};
  // สีที่ไม่ได้ตั้งเองรายใบ = สีร้าน (ตรงกับตอนส่งการ์ดจริง) — ไม่ใช่น้ำตาล/ชมพูเริ่มต้น
  const shownSt: CardStyleConfig = hasBrand
    ? { ...brandColorsFor(meta.colors.map((r) => r.key), branding), ...st }
    : st;
  // สีร้านขึ้นก่อนในแถบสีให้เลือก
  const swatches = hasBrand
    ? Array.from(new Set([branding.primary, branding.heading, ...SWATCHES]))
    : SWATCHES;

  const patch = (p: Partial<CardStyleConfig>) => {
    setCards((prev) => ({ ...prev, [activeKey]: { ...prev[activeKey], ...p } }));
    setDirty(true);
  };
  const patchText = (key: string, value: string) => {
    setTexts((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };
  /** แก้คำถามฟอร์มประวัติน้อง (เก็บเฉพาะที่ต่างจากค่าเริ่มต้น) */
  const patchGroomField = (
    key: string,
    p: Partial<NonNullable<GroomFormConfig[string]>>
  ) => {
    setGroomForm((prev) => ({ ...prev, [key]: { ...prev[key], ...p } }));
    setDirty(true);
  };
  const toggleField = (key: string) => {
    const cur = st.show?.[key] !== false;
    patch({ show: { ...st.show, [key]: !cur } });
  };
  const resetCard = () => {
    setCards((prev) => {
      const next = { ...prev };
      delete next[activeKey];
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    // เงื่อนไข/รายการหลายบรรทัด — เก็บเป็น array (บรรทัดละ 1 ข้อ ตัดบรรทัดว่างทิ้ง)
    const lines = (s?: string) =>
      (s || "")
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean);
    try {
      const res = await fetch("/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patch: {
            cards,
            groomForm,
            billing: {
              summaryBookingTitle: texts.summaryBookingTitle,
              summaryDepositTitle: texts.summaryDepositTitle,
              summaryFullTitle: texts.summaryFullTitle,
              summaryClosing: texts.summaryClosing,
            },
            messages: {
              depositRequestTitle: texts.depositRequestTitle,
              depositRequestBody: texts.depositRequestBody,
              reviewRequest: texts.reviewRequest,
              groomInfoIntro: texts.groomInfoIntro,
              consentTitle: texts.consentTitle,
              consentTerms: lines(texts.consentTerms),
              // การ์ดเลือกเวลาเช็คอิน/เช็คเอาท์
              checkinReminder: texts.checkinReminder,
              checkoutReminder: texts.checkoutReminder,
              // การ์ดขอบคุณ (รับมัดจำแล้ว)
              depositThanksTitle: texts.depositThanksTitle,
              depositThanksBody: texts.depositThanksBody,
              depositTerms: lines(texts.depositTerms),
              // การ์ดเตรียมตัวก่อนเข้าพัก
              prestayIntro: texts.prestayIntro,
              prestayPrepIntro: texts.prestayPrepIntro,
              prestayPrepItems: lines(texts.prestayPrepItems),
              prestayCareNote: texts.prestayCareNote,
              prestayLitterNote: texts.prestayLitterNote,
            },
          },
        }),
      });
      if (res.ok) {
        toast("✅ บันทึกแล้ว — การ์ดที่ส่งหลังจากนี้ใช้ค่าล่าสุดทันที", "success");
        setDirty(false);
      } else {
        toast("บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง", "error");
      }
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return <p className="py-10 text-center text-sm text-brown-soft">กำลังโหลด…</p>;
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">LINE cards</p>
          <h1 className="text-xl font-extrabold text-petflow-chocolate">ปรับแต่งการ์ด LINE</h1>
          <p className="mt-0.5 text-xs text-brown-soft">สี ข้อความ และส่วนประกอบของการ์ดแต่ละใบ พร้อมพรีวิวสด</p>
        </div>
        <div className="sticky top-2 z-20 flex shrink-0 flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (
                !confirm(
                  "ทับสีการ์ดทุกใบ (แถบหัว/ตัวหนังสือ/ไฮไลท์/ปุ่ม) ด้วยสีร้านที่ตั้งไว้ในแท็บ 🏪 ร้าน — สีที่ปรับแยกไว้เฉพาะการ์ดจะหายไป ทำต่อไหม?"
                )
              ) {
                return;
              }
              setCards((prev) => {
                const next = { ...prev };
                for (const c of CARDS) {
                  if (c.colors.length === 0) continue;
                  next[c.key] = { ...next[c.key], ...brandColorsFor(c.colors.map((r) => r.key), branding) };
                }
                return next;
              });
              setDirty(true);
              toast("ปรับสีการ์ดทุกใบตามสีร้านแล้ว — อย่าลืมกดบันทึก", "success");
            }}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-petflow-line bg-card px-4 text-xs font-bold text-latte-deep shadow-petflow-sm"
          >
            ใช้สีร้านกับการ์ดทุกใบ
          </button>
          <button
            type="button"
            disabled={saving || !dirty}
            onClick={save}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-petflow-chocolate px-4 text-sm font-bold text-card shadow-petflow-sm disabled:bg-card disabled:text-brown-soft"
          >
            <Icon name="check" size={18} strokeWidth={2.2} />
            {saving ? "กำลังบันทึก…" : dirty ? "บันทึก" : "บันทึกแล้ว"}
          </button>
        </div>
      </div>

      {/* เลือกการ์ดจากรายการเดียว แทนปุ่ม 15 ปุ่มเรียงกัน */}
      <label className="mb-4 block rounded-petflow bg-card px-4 py-3 shadow-petflow-sm">
        <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">
          Card · {CARDS.findIndex((c) => c.key === activeKey) + 1}/{CARDS.length}
        </span>
        <select
          value={activeKey}
          onChange={(e) => setActiveKey(e.target.value as typeof activeKey)}
          className="mt-1 w-full border-0 bg-transparent p-0 text-base font-extrabold text-petflow-chocolate focus:shadow-none"
        >
          {CARDS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* ── ตัวแก้ไข ── */}
        <div className="space-y-5 rounded-petflow bg-card p-4 shadow-petflow-sm">
          <div>
            <p className="text-sm font-extrabold text-petflow-chocolate">{meta.name}</p>
            <p className="text-[11px] text-brown-soft">{meta.desc}</p>
          </div>

          {/* ── ตัวแก้คำถามฟอร์มประวัติน้อง ── */}
          {activeKey === "groomFormFields" && (
            <div className="space-y-3">
              {GROOM_FORM_DEFAULTS.map((def) => {
                const c = groomForm[def.key] || {};
                const enabled = c.enabled ?? def.enabled;
                const required = c.required ?? def.required;
                const options = c.options ?? def.options;
                const isChip = def.type === "single" || def.type === "multi";
                return (
                  <div
                    key={def.key}
                    className={`rounded-petflow-sm border p-3 ${
                      enabled ? "border-petflow-line bg-paper/40" : "border-dashed border-petflow-line bg-paper/20 opacity-60"
                    }`}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-brown">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) => patchGroomField(def.key, { enabled: e.target.checked })}
                          className="h-4 w-4 accent-latte-deep"
                        />
                        แสดงคำถามนี้
                      </label>
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-brown">
                        <input
                          type="checkbox"
                          checked={required}
                          disabled={!enabled}
                          onChange={(e) => patchGroomField(def.key, { required: e.target.checked })}
                          className="h-4 w-4 accent-latte-deep"
                        />
                        บังคับตอบ
                      </label>
                      <span className="ml-auto rounded-full bg-card px-2 py-0.5 text-[9px] font-bold text-brown-faint">
                        {def.type === "multi"
                          ? "เลือกหลายข้อ"
                          : def.type === "single"
                            ? "เลือก 1 ข้อ"
                            : def.type === "textarea"
                              ? "พิมพ์ยาว"
                              : "พิมพ์สั้น"}
                      </span>
                    </div>

                    <input
                      value={c.label ?? def.label}
                      disabled={!enabled}
                      onChange={(e) => patchGroomField(def.key, { label: e.target.value })}
                      className="w-full rounded-petflow-sm border border-petflow-line bg-card px-2.5 py-2 text-xs font-bold text-brown"
                    />

                    {!isChip && (
                      <input
                        value={c.placeholder ?? def.placeholder ?? ""}
                        disabled={!enabled}
                        onChange={(e) => patchGroomField(def.key, { placeholder: e.target.value })}
                        placeholder="ข้อความตัวอย่างในช่องพิมพ์"
                        className="mt-1.5 w-full rounded-petflow-sm border border-petflow-line bg-card px-2.5 py-1.5 text-[11px] text-brown-soft"
                      />
                    )}

                    {isChip && enabled && (
                      <div className="mt-2">
                        <p className="mb-1 text-[10px] font-bold text-brown-soft">
                          ตัวเลือก ({options.length})
                        </p>
                        <div className="space-y-1.5">
                          {options.map((o, i) => (
                            <div key={o.key} className="flex items-center gap-1.5">
                              <input
                                value={o.label}
                                onChange={(e) => {
                                  const next = options.map((x, j) =>
                                    j === i ? { ...x, label: e.target.value } : x
                                  );
                                  patchGroomField(def.key, { options: next });
                                }}
                                className="flex-1 rounded-petflow-sm border border-petflow-line bg-card px-2.5 py-1.5 text-[11px]"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  patchGroomField(def.key, {
                                    options: options.filter((_, j) => j !== i),
                                  })
                                }
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wait/10 text-wait"
                                aria-label="ลบตัวเลือก"
                              >
                                <Icon name="trash" size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const label = prompt("ชื่อตัวเลือกใหม่ (ใส่อิโมจิได้):");
                            if (!label?.trim()) return;
                            patchGroomField(def.key, {
                              options: [...options, { key: label.trim(), label: label.trim() }],
                            });
                          }}
                          className="mt-1.5 flex h-9 items-center gap-1 rounded-full bg-sage/20 px-3 text-[11px] font-bold text-ok"
                        >
                          <Icon name="plus" size={14} />
                          เพิ่มตัวเลือก
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  setGroomForm({});
                  setDirty(true);
                }}
                className="flex h-10 items-center gap-1.5 rounded-full bg-paper px-4 text-[11px] font-bold text-wait"
              >
                <Icon name="back" size={14} />
                รีเซ็ตฟอร์มกลับค่าเริ่มต้นทั้งหมด
              </button>
            </div>
          )}

          {meta.colors.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Colors · สีของการ์ด</p>
              <div className="space-y-2.5">
                {meta.colors.map((role) => (
                  <div key={role.key} className="flex flex-wrap items-center gap-2">
                    <label className="w-36 shrink-0 text-[11px] font-bold text-brown-soft">{role.label}</label>
                    <input
                      type="color"
                      value={styleValue(shownSt, role)}
                      onChange={(e) => patch({ [role.key]: e.target.value })}
                      className="h-9 w-12 cursor-pointer rounded-lg border border-petflow-line bg-paper"
                    />
                    <span className="font-mono text-[10px] text-brown-faint">{styleValue(shownSt, role)}</span>
                    <div className="flex gap-1">
                      {swatches.map((sw) => (
                        <button
                          key={sw}
                          type="button"
                          title={sw}
                          onClick={() => patch({ [role.key]: sw })}
                          className="h-7 w-7 rounded-full border-2 border-white shadow"
                          style={{ background: sw }}
                        />
                      ))}
                    </div>
                    {st[role.key] && (
                      <button
                        type="button"
                        onClick={() => patch({ [role.key]: undefined })}
                        className="text-[10px] font-bold text-wait underline"
                      >
                        คืนค่าเดิม
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {meta.hasTitleSize && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Title size · ขนาดหัวข้อ</p>
              <div className="flex flex-wrap gap-1.5">
                {TITLE_SIZES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => patch({ titleSize: s.value || undefined })}
                    className={`h-9 rounded-full px-3.5 text-xs font-bold ${
                      (st.titleSize || "") === s.value
                        ? "bg-petflow-chocolate text-card"
                        : "bg-paper text-brown-soft"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {meta.fields.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Parts · ในการ์ดจะมีอะไรบ้าง</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {meta.fields.map((f) => (
                  <label
                    key={f.key}
                    className="flex min-h-[44px] items-center gap-2.5 rounded-petflow-sm bg-paper px-3 py-2 text-xs font-bold text-brown"
                  >
                    <input
                      type="checkbox"
                      checked={st.show?.[f.key] !== false}
                      onChange={() => toggleField(f.key)}
                      className="h-4 w-4 accent-latte-deep"
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {meta.texts.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Text · ข้อความในการ์ด</p>
              <div className="space-y-2.5">
                {meta.texts.map((t) => (
                  <label key={t.stateKey} className="block text-[11px] font-bold text-brown-soft">
                    {t.label}
                    {t.multiline ? (
                      <textarea
                        value={texts[t.stateKey] || ""}
                        onChange={(e) => patchText(t.stateKey, e.target.value)}
                        rows={t.stateKey === "consentTerms" ? 8 : 3}
                        className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-xs font-normal"
                      />
                    ) : (
                      <input
                        value={texts[t.stateKey] || ""}
                        onChange={(e) => patchText(t.stateKey, e.target.value)}
                        className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-xs font-normal"
                      />
                    )}
                    {t.hint && <span className="mt-0.5 block text-[9px] font-normal text-brown-faint">{t.hint}</span>}
                  </label>
                ))}
              </div>
            </div>
          )}

          {!!meta.styleTexts?.length && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">Text · ข้อความในการ์ด</p>
              <div className="space-y-2.5">
                {meta.styleTexts.map((sx) => {
                  const val = st.texts?.[sx.key] || "";
                  const onChange = (v: string) => {
                    const next = { ...st.texts, [sx.key]: v };
                    if (!v) delete next[sx.key];
                    patch({ texts: Object.keys(next).length ? next : undefined });
                  };
                  return (
                    <label key={sx.key} className="block text-[11px] font-bold text-brown-soft">
                      {sx.label}
                      {sx.multiline ? (
                        <textarea
                          value={val}
                          onChange={(e) => onChange(e.target.value)}
                          placeholder={sx.placeholder}
                          rows={3}
                          className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-xs font-normal"
                        />
                      ) : (
                        <input
                          value={val}
                          onChange={(e) => onChange(e.target.value)}
                          placeholder={sx.placeholder}
                          className="mt-1 w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-xs font-normal"
                        />
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {meta.closingLabel && (
            <div>
              <p className="mb-1.5 text-[11px] font-bold text-brown-soft">{meta.closingLabel}</p>
              <textarea
                value={st.closing || ""}
                onChange={(e) => patch({ closing: e.target.value || undefined })}
                placeholder="เว้นว่าง = ใช้ข้อความเดิมของระบบ"
                rows={2}
                className="w-full rounded-petflow-sm border border-petflow-line bg-paper px-3 py-2 text-xs"
              />
            </div>
          )}

          {meta.colors.length > 0 && (
            <button
              type="button"
              onClick={resetCard}
              className="flex h-10 items-center gap-1.5 rounded-full bg-paper px-4 text-[11px] font-bold text-wait"
            >
              <Icon name="back" size={14} />
              รีเซ็ตสี/ส่วนประกอบการ์ดนี้กลับค่าเริ่มต้น
            </button>
          )}
        </div>

        {/* ── พรีวิวสด ── */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brown-soft">
            <Icon name="eye" size={14} />
            {activeKey === "groomFormFields" ? "Preview · ฟอร์มที่ลูกค้าเห็น" : "Preview · ตัวอย่างใน LINE"}
          </p>
          {activeKey === "groomFormFields" ? (
            <div className="rounded-2xl bg-[#efe6d6] p-3">
              <div className="rounded-petflow bg-[#fdfaf4] p-3">
                <p className="text-sm font-extrabold text-[#4a3a12]">🩺 ประวัติน้องก่อนอาบน้ำ</p>
                <p className="mt-0.5 text-[10px] text-[#8a7a5c]">🐱 Soju</p>
                {resolveGroomForm(groomForm).map((fd) => (
                  <div key={fd.key} className="mt-2.5">
                    <p className="mb-1 text-[10px] font-bold text-[#6b5c40]">
                      {fd.label}
                      {fd.required && " *"}
                    </p>
                    {fd.type === "single" || fd.type === "multi" ? (
                      <div className="flex flex-wrap gap-1">
                        {fd.options.map((o, i) => (
                          <span
                            key={o.key}
                            className={`rounded-full px-2 py-1 text-[9.5px] font-bold ${
                              i === 0
                                ? "bg-[#7a6a48] text-[#fff8ec]"
                                : "border border-[#e2d4b8] bg-[#f4ecd8] text-[#6b5c40]"
                            }`}
                          >
                            {o.label}
                          </span>
                        ))}
                        {fd.options.length === 0 && (
                          <span className="text-[9.5px] text-wait">
                            (ยังไม่มีตัวเลือก — เพิ่มด้านซ้าย)
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="rounded border border-[#e2d4b8] bg-white px-2 py-1.5 text-[9.5px] text-[#b3a68a]">
                        {fd.placeholder || "…"}
                      </div>
                    )}
                  </div>
                ))}
                <div className="mt-3 rounded-lg bg-[#8a7350] py-2 text-center text-[10px] font-extrabold text-[#fff8ec]">
                  💛 ส่งข้อมูลให้ร้าน
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-[#8cabd8] p-4">
              <Preview meta={meta} st={shownSt} texts={texts} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
