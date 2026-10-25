import { getSiteConfig } from "./config-store";

export async function getPaymentConfig() {
  const config = await getSiteConfig();
  return config.payment;
}
