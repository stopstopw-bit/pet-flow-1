import { NextRequest, NextResponse } from "next/server";
import { featureOff } from "@/lib/features-server";
import { getAccount, redeemReward, addPoints, deletePointsHistoryEntry } from "@/lib/points-store";
import { sendTelegram, formatBookingTelegram } from "@/lib/telegram";
import { pushLineMessage, buildPointsAwardFlex } from "@/lib/line";
import { getSiteConfig } from "@/lib/config-store";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { withResolvedTenant, withTenant } from "@/lib/tenant-context";
import { requireCustomerSession, noCustomerSessionResponse } from "@/lib/customer-session";
import { logAudit } from "@/lib/audit-log";
import { requireTenantId } from "@/lib/tenant-context";

async function getAdminSession(req: NextRequest) {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}

/** ใครกดปุ่มนี้ — ไว้ลงบันทึกว่าใครแตะแต้มลูกค้า */
async function actorName(req: NextRequest): Promise<string> {
  const s = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  return s?.name || s?.role || "ไม่ทราบ";
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession(req);
  // แอดมินดูแต้มของลูกค้าคนไหนก็ได้ (มี session หลังบ้านรับรองแล้ว) — เชื่อ query ได้
  if (session) {
    const lineUserId = req.nextUrl.searchParams.get("lineUserId");
    if (!lineUserId) {
      return NextResponse.json({ error: "lineUserId required" }, { status: 400 });
    }
    return withTenant(session.tenantId, () => handleGet(req, lineUserId));
  }
  // ลูกค้าเปิดเอง — ต้องมีคุกกี้เซสชันที่ตรวจกับ LINE แล้วจริง ห้ามเชื่อ query lineUserId
  return withResolvedTenant(req, () => handleCustomerGet(req));
}

async function handleCustomerGet(req: NextRequest) {
  const customerSession = await requireCustomerSession(req);
  if (!customerSession) {
    return noCustomerSessionResponse();
  }
  return handleGet(req, customerSession.lineUserId);
}

async function handleGet(req: NextRequest, lineUserId: string) {
  const displayName = req.nextUrl.searchParams.get("displayName") || "";
  const customerId = req.nextUrl.searchParams.get("customerId") || undefined;
  const account = await getAccount(lineUserId, displayName, customerId);

  return NextResponse.json({
    points: account.points,
    history: account.history,
    displayName: account.displayName,
  });
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession(req);
  if (session) return withTenant(session.tenantId, () => handlePost(req, true));
  return withResolvedTenant(req, () => handlePost(req, false));
}

async function handlePost(req: NextRequest, isAdmin: boolean) {
  // ลูกค้าแลกแต้มเอง — ร้านปิดแต้มสะสม หรือปิดแค่ "แลกแต้มเป็นรางวัล" ก็แลกไม่ได้
  // (pointsRedeem ขึ้นกับ points อยู่แล้ว · หลังบ้านยังจัดการแต้มเดิมได้)
  if (!isAdmin) {
    const blocked = await featureOff("pointsRedeem");
    if (blocked) return blocked;
  }
  const body = await req.json().catch(() => ({}));
  const { rewardId, displayName } = body;
  let lineUserId = String(body.lineUserId || "").trim();

  // ลบประวัติแต้ม 1 รายการ (กดผิด/ลงซ้ำ) — ปรับยอดคงเหลือย้อนกลับให้เอง ต้องเป็นพนักงานเท่านั้น
  if (body.action === "delete_history") {
    if (!isAdmin) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const entryId = String(body.entryId || "").trim();
    if (!entryId) {
      return NextResponse.json({ error: "entryId required" }, { status: 400 });
    }
    const res = await deletePointsHistoryEntry(entryId);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 404 });
    }
    await logAudit({
      tenantId: requireTenantId(),
      actorType: "tenant",
      actorId: await actorName(req),
      action: "delete_points_history",
      resourceType: "points",
      resourceId: entryId,
      afterState: { points: res.points },
    });
    return NextResponse.json({ ok: true, points: res.points });
  }

  // เพิ่ม/ปรับแต้มด้วยมือจากหลังบ้าน (เช่น รีวิวแล้วรับแต้มฟรี) — บันทึกเหตุผลในประวัติ
  // route นี้เปิดให้แอปลูกค้าเรียกตรงๆ ได้ (ดูแต้ม/แลกรางวัล) แต่ action นี้ปรับแต้มลูกค้าคนไหนก็ได้
  // ตามใจ ต้องเป็นพนักงานหลังบ้านเท่านั้น ไม่งั้นใครก็เติมแต้มให้ตัวเองฟรีได้
  if (body.action === "admin_add") {
    if (!isAdmin) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const uid = String(lineUserId || "").trim();
    const amount = Math.round(Number(body.amount) || 0);
    const reason = String(body.reason || "").trim() || "แต้มพิเศษจากร้าน";
    if (!uid || amount === 0) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    }

    // ดูตัวอย่างการ์ดก่อนส่งจริง — ยังไม่เติมแต้ม ไม่ส่งอะไรทั้งนั้น
    if (body.preview === true) {
      const cfg = await getSiteConfig();
      const cur = await getAccount(uid, displayName || "");
      return NextResponse.json({
        ok: true,
        preview: [
          buildPointsAwardFlex(
            {
              customerName: cur.displayName || displayName || "ลูกค้า",
              pointsAwarded: amount,
              reason,
              totalPoints: cur.points + amount,
              shopName: cfg.business.name,
            },
            cfg.cards?.pointsAward
          ),
        ],
      });
    }

    const label = amount > 0 ? `🎁 ${reason}` : `ปรับแต้ม: ${reason}`;
    const acc = await addPoints(uid, amount, label, label, displayName || "");
    await sendTelegram(
      formatBookingTelegram(
        amount > 0 ? "🎁 เพิ่มแต้มให้ลูกค้า (มือ)" : "➖ ปรับลดแต้มลูกค้า (มือ)",
        {
          ลูกค้า: acc.displayName || uid,
          แต้ม: `${amount > 0 ? "+" : ""}${amount}`,
          เหตุผล: reason,
          แต้มคงเหลือ: String(acc.points),
        }
      )
    );
    // ปกติเงียบ ๆ — เพิ่มแต้มหลังบ้านไม่ต้องรบกวนลูกค้า (และไม่เสียโควตาข้อความ)
    // จะแจ้งก็ต่อเมื่อกดติ๊ก "แจ้งลูกค้าทาง LINE" ในหน้าหลังบ้าน
    if (amount > 0 && body.notify === true) {
      try {
        const cfg = await getSiteConfig();
        await pushLineMessage(uid, [
          buildPointsAwardFlex(
            {
              customerName: acc.displayName || displayName || "ลูกค้า",
              pointsAwarded: amount,
              reason,
              totalPoints: acc.points,
              shopName: cfg.business.name,
            },
            cfg.cards?.pointsAward
          ),
        ]);
      } catch {
        /* ไม่มี LINE ก็ไม่เป็นไร — แต้มถูกบันทึกแล้ว */
      }
    }
    await logAudit({
      tenantId: requireTenantId(),
      actorType: "tenant",
      actorId: await actorName(req),
      action: amount > 0 ? "add_points" : "reduce_points",
      resourceType: "points",
      resourceId: uid,
      afterState: { customer: acc.displayName || uid, delta: amount, reason, balance: acc.points },
    });
    return NextResponse.json({ ok: true, points: acc.points });
  }

  // แลกรางวัลเอง — ต้องมีคุกกี้เซสชันที่ตรวจกับ LINE แล้วจริง ห้ามเชื่อ lineUserId จาก body
  // (ไม่งั้นใครก็ใส่ lineUserId ของคนอื่นแล้วแลกแต้มแทนได้)
  if (!isAdmin) {
    const customerSession = await requireCustomerSession(req);
    if (!customerSession) {
      return noCustomerSessionResponse();
    }
    lineUserId = customerSession.lineUserId;
  }

  if (!lineUserId || !rewardId) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const result = await redeemReward(
    lineUserId,
    rewardId,
    displayName || "",
    body.customerId ? String(body.customerId) : undefined
  );

  if (!result.ok) {
    const msg =
      result.error === "insufficient_points"
        ? "แต้มไม่พอ"
        : "รางวัลไม่ถูกต้อง";
    return NextResponse.json({ error: result.error, message: msg }, { status: 400 });
  }

  await sendTelegram(
    formatBookingTelegram("🎁 ลูกค้าแลกแต้ม", {
      ลูกค้า: result.account.displayName || lineUserId,
      รางวัล: result.reward.reward.th,
      คูปอง: result.couponCode,
      แต้มคงเหลือ: String(result.account.points),
    })
  );

  return NextResponse.json({
    ok: true,
    points: result.account.points,
    couponCode: result.couponCode,
    reward: result.reward,
    history: result.account.history,
  });
}
