import { HeroTitle } from "@pulse/ui";
import { MetricStrip } from "../components/MetricStrip";
import { MacroOverlay } from "../components/MacroOverlay";
import { AlertsFeed } from "../components/AlertsFeed";
import { PortfolioPanel } from "../components/PortfolioPanel";

export default function OverviewPage() {
  return (
    <section style={{ paddingTop: 40, paddingBottom: 80 }}>
      <HeroTitle
        primary="PULSE"
        secondary="COMMAND"
        subtitle={
          <span className="thai">
            ศูนย์ข้อมูลตลาดคริปโตแบบ <b style={{ color: "#f2f4f8" }}>real-data, no mocks</b>
            {" "}— spot · derivatives · ETF · stablecoin · DeFi · DEX · macro ในหน้าเดียว
          </span>
        }
      />
      <MetricStrip />
      <AlertsFeed />
      <MacroOverlay />
      <PortfolioPanel />
    </section>
  );
}
