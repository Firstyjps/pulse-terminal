"use client";

import * as React from "react";

const HANDLE_PX = 4;

interface PaneSpec {
  /** Initial size as percentage (0-100). */
  size: number;
  minSize?: number;
  maxSize?: number;
  content: React.ReactNode;
}

interface SplitProps {
  panes: PaneSpec[];
  /** Persist size to localStorage under this key */
  storageKey?: string;
  direction: "horizontal" | "vertical";
}

function SplitLayout({ panes, storageKey, direction }: SplitProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isHoriz = direction === "horizontal";
  const initial = React.useMemo(() => {
    if (typeof window !== "undefined" && storageKey) {
      try {
        const raw = window.localStorage.getItem(`pane.${storageKey}`);
        if (raw) {
          const parsed = JSON.parse(raw) as number[];
          if (Array.isArray(parsed) && parsed.length === panes.length) return parsed;
        }
      } catch { /* ignore */ }
    }
    return panes.map((p) => p.size);
  }, [panes, storageKey]);

  const [sizes, setSizes] = React.useState<number[]>(initial);
  const draggingRef = React.useRef<{ index: number; startCoord: number; startSizes: number[] } | null>(null);

  // Persist on change
  React.useEffect(() => {
    if (storageKey && typeof window !== "undefined") {
      try { window.localStorage.setItem(`pane.${storageKey}`, JSON.stringify(sizes)); } catch { /* ignore */ }
    }
  }, [sizes, storageKey]);

  const handleMouseDown = (i: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = {
      index: i,
      startCoord: isHoriz ? e.clientX : e.clientY,
      startSizes: [...sizes],
    };
    document.body.style.cursor = isHoriz ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  };

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = draggingRef.current;
      if (!drag || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const total = isHoriz ? rect.width : rect.height;
      const delta = (isHoriz ? e.clientX : e.clientY) - drag.startCoord;
      const deltaPct = (delta / total) * 100;

      // Resize pane[i] and pane[i+1] together (sum stays constant)
      const i = drag.index;
      const next = [...drag.startSizes];
      const a = next[i];
      const b = next[i + 1];
      const aMin = panes[i].minSize ?? 10;
      const aMax = panes[i].maxSize ?? 90;
      const bMin = panes[i + 1].minSize ?? 10;
      const bMax = panes[i + 1].maxSize ?? 90;

      let newA = a + deltaPct;
      let newB = b - deltaPct;
      if (newA < aMin) { newA = aMin; newB = a + b - aMin; }
      if (newA > aMax) { newA = aMax; newB = a + b - aMax; }
      if (newB < bMin) { newB = bMin; newA = a + b - bMin; }
      if (newB > bMax) { newB = bMax; newA = a + b - bMax; }
      next[i] = newA;
      next[i + 1] = newB;
      setSizes(next);
    };
    const onUp = () => {
      if (draggingRef.current) {
        draggingRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isHoriz, panes]);

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        flexDirection: isHoriz ? "row" : "column",
        height: "100%",
        width: "100%",
        overflow: "hidden",
      }}
    >
      {panes.map((p, i) => (
        <React.Fragment key={i}>
          <div style={{
            flex: `0 0 ${sizes[i]}%`,
            minHeight: 0,
            minWidth: 0,
            overflow: "hidden",
          }}>
            {p.content}
          </div>
          {i < panes.length - 1 && (
            <div
              role="separator"
              aria-orientation={isHoriz ? "vertical" : "horizontal"}
              onMouseDown={handleMouseDown(i)}
              style={{
                flex: `0 0 ${HANDLE_PX}px`,
                cursor: isHoriz ? "col-resize" : "row-resize",
                background: "rgba(255,255,255,0.04)",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(124,92,255,0.5)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export function HSplit({ panes, storageKey }: { panes: PaneSpec[]; storageKey?: string }) {
  return <SplitLayout panes={panes} storageKey={storageKey} direction="horizontal" />;
}

export function VSplit({ panes, storageKey }: { panes: PaneSpec[]; storageKey?: string }) {
  return <SplitLayout panes={panes} storageKey={storageKey} direction="vertical" />;
}
