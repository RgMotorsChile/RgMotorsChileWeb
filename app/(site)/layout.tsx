import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ChatWidget from "@/components/ChatWidget";
import CookieConsent from "@/components/CookieConsent";
import GoogleAnalyticsConsent from "@/components/GoogleAnalyticsConsent";
import JsonLd from "@/components/JsonLd";
import { dealerJsonLd } from "@/lib/seo/dealerJsonLd";
import { getSettings } from "@/lib/server/settingsStore";
import { COMPANY } from "@/lib/company";

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSettings().catch(() => null);
  const hours = settings?.company.hours || COMPANY.hours;
  return (
    <div className="flex min-h-screen w-full max-w-[100vw] flex-col overflow-x-clip">
      <JsonLd data={dealerJsonLd(hours)} />
      <SiteHeader />
      <div className="min-w-0 flex-1">{children}</div>
      <SiteFooter />
      <ChatWidget />
      <CookieConsent />
      <GoogleAnalyticsConsent />
    </div>
  );
}
