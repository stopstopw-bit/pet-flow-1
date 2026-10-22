import { getAppUrlFromEnv } from "@/lib/line-config";
import { buildLiffUrl } from "@/lib/liff-urls";
import {
  BROADCAST_ACTIONS,
  BROADCAST_TEMPLATES,
  COUPON_ACTION_PREFIX,
  COUPON_BUTTON_LABEL,
  broadcastActionLabel,
  couponActionId,
  isCouponAction,
  parseBroadcastActions,
  type BroadcastAction,
  type BroadcastActionId,
  type BroadcastTemplate,
} from "@/lib/broadcast-constants";

export type { BroadcastAction, BroadcastActionId, BroadcastTemplate };
export {
  BROADCAST_ACTIONS,
  BROADCAST_TEMPLATES,
  COUPON_ACTION_PREFIX,
  COUPON_BUTTON_LABEL,
  broadcastActionLabel,
  couponActionId,
  isCouponAction,
  parseBroadcastActions,
};

type ShopContact = { lineOa?: string; maps?: string };

export function resolveBroadcastActionUri(
  actionId: BroadcastActionId,
  liffId?: string,
  shop: ShopContact = {},
  /** ลิงก์ร้าน https://…/s/<slug> (shopAppBase) — ไม่ใส่ = /app เปล่า ซึ่งเป็นร้าน PetFlow */
  shopBase?: string
): string {
  const appBase = shopBase || getAppUrlFromEnv() || "https://petflow.example.com";
  const lid = liffId?.trim();

  if (isCouponAction(actionId)) {
    const offerId = actionId.slice(COUPON_ACTION_PREFIX.length);
    return lid
      ? buildLiffUrl(lid, { path: "claim-coupon", offer: offerId })
      : `${appBase}/app/claim-coupon?offer=${encodeURIComponent(offerId)}`;
  }

  switch (actionId) {
    case "promos":
      return lid
        ? buildLiffUrl(lid, { path: "promos" })
        : `${appBase}/app/promos`;
    case "grooming":
      return lid
        ? buildLiffUrl(lid, { path: "grooming" })
        : `${appBase}/app/grooming`;
    case "rooms":
      return lid
        ? buildLiffUrl(lid, { path: "rooms" })
        : `${appBase}/app/rooms`;
    case "bookings":
      return lid
        ? buildLiffUrl(lid, { path: "bookings" })
        : `${appBase}/app/bookings`;
    case "coupons":
      return lid
        ? buildLiffUrl(lid, { path: "coupons" })
        : `${appBase}/app/coupons`;
    case "line_chat":
      return shop.lineOa ? `https://line.me/R/ti/p/${shop.lineOa}` : `${appBase}/app`;
    case "maps":
      return shop.maps || `${appBase}/app`;
    default:
      return `${appBase}/app`;
  }
}

export function buildBroadcastButtons(
  actionIds: BroadcastActionId[],
  liffId?: string,
  shop: ShopContact = {},
  shopBase?: string
) {
  return actionIds.slice(0, 3).map((id) => ({
    label: broadcastActionLabel(id),
    uri: resolveBroadcastActionUri(id, liffId, shop, shopBase),
  }));
}
