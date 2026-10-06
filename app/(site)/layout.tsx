import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ChatWidget from "@/components/ChatWidget";
import CookieConsent from "@/components/CookieConsent";
import GoogleAnalyticsConsent from "@/components/GoogleAnalyticsConsent";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full max-w-[100vw] flex-col overflow-x-clip">
      <SiteHeader />
      <div className="min-w-0 flex-1">{children}</div>
      <SiteFooter />
      <ChatWidget />
      <CookieConsent />
      <GoogleAnalyticsConsent />
    </div>
  );
}
