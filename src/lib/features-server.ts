import { NextResponse } from "next/server";
import { getSiteConfig } from "./config-store";
import { isFeatureOn, type FeatureKey } from "./features";

/**
 * ด่านกั้น API ฝั่งลูกค้าเมื่อร้านปิดฟีเจอร์ — ต้องเรียกภายใน tenant context แล้ว
 * คืน 403 ถ้าปิด · null = ทำงานต่อได้
 */
export async function featureOff(key: FeatureKey): Promise<NextResponse | null> {
  if (isFeatureOn(await getSiteConfig(), key)) return null;
  return NextResponse.json({ error: "feature_disabled", feature: key }, { status: 403 });
}
