import { CTASection } from "./cta-section";
import { FooterSection } from "./footer-section";
import { HeroSection } from "./hero-section";
import { ZypherSection } from "./zypher-section";

export function HomePage() {
  return (
    <main className="min-h-screen bg-bg-b1">
      <HeroSection />
      <ZypherSection />
      <CTASection />
      <FooterSection />
    </main>
  );
}
