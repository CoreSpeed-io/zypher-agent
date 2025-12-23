import { CTASection } from "./cta-section";
import { HeroSection } from "./hero-section";
import { ZypherSection } from "./zypher-section";

export function HomePage() {
  return (
    <main className="min-h-screen bg-bg-b1">
      <HeroSection />
      <ZypherSection />
      <CTASection />
    </main>
  );
}
