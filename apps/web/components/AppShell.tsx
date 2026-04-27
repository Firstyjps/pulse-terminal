"use client";

import { usePathname, useRouter } from "next/navigation";
import { NavBar, ThreeBackground } from "@pulse/ui";
import { LocaleProvider, useLocale } from "@pulse/i18n";

const TABS = [
  { id: "overview", label: "OVERVIEW", href: "/" },
  { id: "markets", label: "MARKETS", href: "/markets" },
  { id: "fundflow", label: "FUNDFLOW", href: "/fundflow" },
  { id: "derivatives", label: "DERIVATIVES", href: "/derivatives" },
  { id: "backtest", label: "BACKTEST", href: "/backtest" },
] as const;

function LocaleToggle() {
  const [locale, setLocale] = useLocale();
  return (
    <button
      type="button"
      onClick={() => setLocale(locale === "th" ? "en" : "th")}
      style={{
        background: "transparent",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 999,
        color: "#9ca3af",
        padding: "4px 10px",
        fontSize: 11,
        cursor: "pointer",
        fontFamily: "JetBrains Mono, monospace",
        letterSpacing: "0.08em",
      }}
      aria-label="Toggle language"
    >
      {locale.toUpperCase()}
    </button>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const activeId =
    TABS.find((t) =>
      t.href === "/" ? pathname === "/" : pathname.startsWith(t.href),
    )?.id ?? "overview";

  return (
    <>
      <ThreeBackground />
      <NavBar
        tabs={TABS.map(({ id, label }) => ({ id, label }))}
        activeTab={activeId}
        onTabChange={(id) => {
          const tab = TABS.find((t) => t.id === id);
          if (tab) router.push(tab.href);
        }}
        liveLabel={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span>LIVE</span>
            <LocaleToggle />
          </span>
        }
      />
      <main style={{ maxWidth: 1640, margin: "0 auto", padding: "40px 28px" }}>
        {children}
      </main>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <ShellInner>{children}</ShellInner>
    </LocaleProvider>
  );
}
