import { getAppUrlFromEnv } from "@/lib/line-config";
import { buildLiffUrl } from "@/lib/liff-urls";
import {
  BROADCAST_ACTIONS,
  BROADCAST_TEMPLATES,
  type BroadcastAction,
  type BroadcastActionId,
  type BroadcastTemplate,
} from "@/lib/broadcast-constants";

export type { BroadcastAction, BroadcastActionId, BroadcastTemplate };
export { BROADCAST_ACTIONS, BROADCAST_TEMPLATES };

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
  return actionIds.slice(0, 3).map((id) => {
    const preset = BROADCAST_ACTIONS.find((a) => a.id === id);
    return {
      label: preset?.label || id,
      uri: resolveBroadcastActionUri(id, liffId, shop, shopBase),
    };
  });
}
