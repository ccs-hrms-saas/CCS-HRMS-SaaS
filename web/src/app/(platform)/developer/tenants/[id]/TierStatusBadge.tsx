"use client";

import { useMemo, useState } from "react";
import { computeTierStatus, type TierStatus } from "./tier-definitions";
import type { TierKey } from "./tier-definitions";

// ── Styles (inline — no extra CSS file needed) ────────────────────────────
const TIER_COLORS: Record<TierKey, { bg: string; color: string; dot: string }> = {
  basic:    { bg: "rgba(16,185,129,0.12)",  color: "#34d399", dot: "#10b981" },
  standard: { bg: "rgba(99,102,241,0.12)",  color: "#818cf8", dot: "#6366f1" },
  advanced: { bg: "rgba(245,158,11,0.12)",  color: "#fbbf24", dot: "#f59e0b" },
};

const TIER_LABELS: Record<TierKey, string> = {
  basic:    "Basic",
  standard: "Standard",
  advanced: "Advanced",
};

// ── Main component ─────────────────────────────────────────────────────────
interface TierStatusBadgeProps {
  moduleKey:  string;
  properties: Record<string, any>;
}

export default function TierStatusBadge({ moduleKey, properties }: TierStatusBadgeProps) {
  const status: TierStatus | null = useMemo(
    () => computeTierStatus(moduleKey, properties),
    [moduleKey, properties]
  );

  const [showTooltip, setShowTooltip] = useState(false);

  // Module has no tier tracking (e.g. attendance, announcements)
  if (!status) return null;

  const c = TIER_COLORS[status.tier];

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6 }}>
      {/* ── Tier pill ─────────────────────────────────────────────────── */}
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 10px", borderRadius: 20,
        background: c.bg, color: c.color,
        fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.4px",
        border: `1px solid ${c.dot}30`,
        whiteSpace: "nowrap",
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
        {TIER_LABELS[status.tier]}
      </span>

      {/* ── Status indicator ──────────────────────────────────────────── */}
      {status.isPure ? (
        <span style={{ fontSize: "0.68rem", color: "#34d399", fontWeight: 600 }}>✓ Pure</span>
      ) : (
        <span
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 8px", borderRadius: 20,
            background: status.overrides > 0
              ? "rgba(249,115,22,0.12)"
              : "rgba(99,102,241,0.10)",
            color: status.overrides > 0 ? "#fb923c" : "#818cf8",
            fontSize: "0.68rem", fontWeight: 700,
            border: `1px solid ${status.overrides > 0 ? "#fb923c30" : "#6366f130"}`,
            cursor: "pointer",
            userSelect: "none",
          }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          {status.overrides > 0 ? "★" : "⚡"}
          {status.modified > 0 && `${status.modified} modified`}
          {status.modified > 0 && status.overrides > 0 && " · "}
          {status.overrides > 0 && `${status.overrides} override${status.overrides > 1 ? "s" : ""}`}
        </span>
      )}

      {/* ── Tooltip (deviation list) ───────────────────────────────────── */}
      {showTooltip && !status.isPure && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 9999,
          width: 300,
          background: "#1e1e2e",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          padding: "12px 14px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          pointerEvents: "none",
        }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.8px", color: "#64748b", marginBottom: 10 }}>
            Deviations from {TIER_LABELS[status.tier]} tier
          </div>

          {status.deviations.map(d => (
            <div key={d.feature} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "5px 0",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              fontSize: "0.78rem",
            }}>
              {/* Type icon */}
              <span style={{
                padding: "1px 7px", borderRadius: 20, fontSize: "0.62rem", fontWeight: 700,
                background: d.type === "override" ? "rgba(249,115,22,0.15)" : "rgba(99,102,241,0.12)",
                color: d.type === "override" ? "#fb923c" : "#818cf8",
                flexShrink: 0,
              }}>
                {d.type === "override" ? "★ Override" : "⚡ Modified"}
              </span>

              <span style={{ color: "#cbd5e1", flex: 1 }}>{d.label}</span>

              {/* Actual value */}
              <span style={{
                fontSize: "0.68rem", fontWeight: 700,
                color: d.actual ? "#34d399" : "#f87171",
              }}>
                {d.actual ? "ON" : "OFF"}
              </span>
            </div>
          ))}

          <div style={{ marginTop: 8, fontSize: "0.68rem", color: "#475569" }}>
            {status.overrides > 0
              ? "★ Override = feature enabled beyond assigned tier"
              : "⚡ Modified = tier feature restricted by developer"}
          </div>
        </div>
      )}
    </div>
  );
}
