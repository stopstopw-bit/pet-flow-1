import { LocaleProvider } from "@/components/LocaleProvider";
import { LiffProvider } from "@/components/LiffProvider";
import { ConfigProvider } from "@/components/ConfigProvider";
import { BrandingStyle } from "@/components/BrandingStyle";
import { CustomerNav } from "@/components/CustomerNav";
import { LiffStuckBanner } from "@/components/LiffStuckBanner";
import { AppFeatureGate } from "@/components/AppFeatureGate";
import { Toaster } from "@/components/Toast";
import { getPageSiteConfig } from "@/lib/page-config";

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ส่ง config ของร้านมากับหน้าเลย — โลโก้/สี/ชื่อร้านถูกตั้งแต่แรก ไม่แวบเป็นของ PetFlow ก่อน
  const initialConfig = await getPageSiteConfig();
  return (
    <LocaleProvider>
      <ConfigProvider initialConfig={initialConfig}>
        <BrandingStyle />
        <LiffProvider>
          <div className="bg-petflow-gradient min-h-screen pb-[calc(6rem+env(safe-area-inset-bottom))]">
            <LiffStuckBanner />
            <div className="mx-auto max-w-lg">
              <AppFeatureGate>{children}</AppFeatureGate>
            </div>
            <CustomerNav />
            <Toaster />
          </div>
        </LiffProvider>
      </ConfigProvider>
    </LocaleProvider>
  );
}
