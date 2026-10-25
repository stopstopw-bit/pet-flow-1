import { LocaleProvider } from "@/components/LocaleProvider";
import { LiffProvider } from "@/components/LiffProvider";
import { ConfigProvider } from "@/components/ConfigProvider";
import { BrandingStyle } from "@/components/BrandingStyle";
import { CustomerNav } from "@/components/CustomerNav";
import { LiffStuckBanner } from "@/components/LiffStuckBanner";
import { AppFeatureGate } from "@/components/AppFeatureGate";
import { Toaster } from "@/components/Toast";

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LocaleProvider>
      <ConfigProvider>
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
