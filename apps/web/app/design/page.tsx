import {
  Card,
  HeroTitle,
  Loader,
  MetricCard,
  Pill,
  colors,
  fonts,
  gradients,
  glows,
  radii,
} from "@pulse/ui";
import { Sparkline } from "@pulse/charts";

const sampleSeries = [42, 44, 41, 45, 47, 46, 49, 51, 50, 53, 56, 55, 58, 60, 62];

function SectionHead({ title }: { title: string }) {
  return (
    <h2
      style={{
        fontSize: 13,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: colors.txt2,
        fontWeight: 700,
        margin: "48px 0 16px",
      }}
    >
      {title}
    </h2>
  );
}

function Swatch({ name, value }: { name: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: radii.sm,
          background: value,
          border: `1px solid ${colors.line2}`,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.txt1 }}>{name}</span>
        <span style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.txt3 }}>{value}</span>
      </div>
    </div>
  );
}

export default function DesignSystemShowcase() {
  return (
    <section style={{ paddingBottom: 120 }}>
      <HeroTitle
        primary="DESIGN"
        secondary="SYSTEM"
        subtitle={
          <>
            Reference for every <b style={{ color: colors.txt1 }}>@pulse/ui</b> + <b style={{ color: colors.txt1 }}>@pulse/charts</b> primitive.
            Renders against the live token set so any drift shows up here first.
          </>
        }
      />

      <SectionHead title="Color tokens" />
      <Card>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 16,
          }}
        >
          {Object.entries(colors).map(([k, v]) => (
            <Swatch key={k} name={k} value={v} />
          ))}
        </div>
      </Card>

      <SectionHead title="Gradients" />
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          {Object.entries(gradients).map(([k, v]) => (
            <div key={k}>
              <div style={{ height: 56, borderRadius: radii.md, background: v, border: `1px solid ${colors.line2}` }} />
              <div style={{ marginTop: 6, fontFamily: fonts.mono, fontSize: 11, color: colors.txt2 }}>{k}</div>
            </div>
          ))}
        </div>
      </Card>

      <SectionHead title="Glows" />
      <Card>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 32 }}>
          {Object.entries(glows).map(([k, v]) => (
            <div key={k} style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: radii.md,
                  background: colors.bg2,
                  boxShadow: v,
                  marginBottom: 8,
                }}
              />
              <span style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.txt2 }}>{k}</span>
            </div>
          ))}
        </div>
      </Card>

      <SectionHead title="Pills" />
      <Card>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <Pill tone="up">+2.45%</Pill>
          <Pill tone="down">−1.07%</Pill>
          <Pill tone="flat">0.00%</Pill>
          <Pill tone="gold">F&G 47</Pill>
          <Pill tone="purple">PERP</Pill>
          <Pill tone="cyan">SPOT</Pill>
          <Pill tone="btc">BTC</Pill>
          <Pill tone="eth">ETH</Pill>
        </div>
      </Card>

      <SectionHead title="Cards" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <Card>
          <p style={{ margin: 0, color: colors.txt1 }}>Plain card</p>
        </Card>
        <Card accent="purple" glow>
          <p style={{ margin: 0, color: colors.txt1 }}>Accent: purple, with glow</p>
        </Card>
        <Card accent="cyan" glow hoverLift>
          <p style={{ margin: 0, color: colors.txt1 }}>Accent: cyan, hoverable</p>
        </Card>
        <Card accent="btc" glow>
          <p style={{ margin: 0, color: colors.txt1 }}>Accent: btc</p>
        </Card>
      </div>

      <SectionHead title="MetricCards" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <MetricCard
          label="Total Market Cap"
          value="$2.67T"
          delta={{ value: "−0.24%", tone: "down" }}
          meta="24h Vol $84.8B"
          accent="purple"
        />
        <MetricCard
          label="BTC Dominance"
          value="58.23%"
          delta={{ value: "+0.18%", tone: "up" }}
          meta="ETH 10.45%"
          accent="btc"
        />
        <MetricCard
          label="Stablecoin Mcap"
          value="$166.4B"
          delta={{ value: "+1.82%", tone: "up" }}
          meta="7d"
          accent="cyan"
        />
        <MetricCard
          label="Fear & Greed"
          value="47"
          meta="Neutral"
          accent="gold"
        />
      </div>

      <SectionHead title="Sparkline" />
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: colors.txt3, marginBottom: 4, fontFamily: fonts.mono }}>positive</div>
            <Sparkline data={sampleSeries} positive width={120} height={36} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: colors.txt3, marginBottom: 4, fontFamily: fonts.mono }}>negative</div>
            <Sparkline data={[...sampleSeries].reverse()} positive={false} width={120} height={36} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: colors.txt3, marginBottom: 4, fontFamily: fonts.mono }}>tiny</div>
            <Sparkline data={sampleSeries} positive width={70} height={24} />
          </div>
        </div>
      </Card>

      <SectionHead title="Loader" />
      <p style={{ color: colors.txt3, fontSize: 12, marginTop: -8, marginBottom: 12 }}>
        Renders inline (without the fixed overlay) just to preview the bar.
      </p>
      <Card>
        <div style={{ position: "relative", height: 140 }}>
          <Loader title="PULSE COMMAND" status="— rendering showcase" progress={68} style={{ position: "absolute" }} />
        </div>
      </Card>
    </section>
  );
}
