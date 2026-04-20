"use client";

import { useMemo } from "react";
import {
  computeTierStatus,
  MODULE_TIER_DEFAULTS,
  FEATURE_LABELS,
  type TierKey,
  type Deviation,
} from "./tier-definitions";

interface Module {
  id: string;
  module_key: string;
  is_enabled: boolean;
  properties: Record<string, any>;
}

interface CapabilitySnapshotProps {
  modules: Module[];
  companyName: string;
}

const TIER_LABELS: Record<TierKey, string> = {
  basic:    "Basic",
  standard: "Standard",
  advanced: "Advanced",
};

const TIER_COLORS: Record<TierKey, { bg: string; color: string; dot: string }> = {
  basic:    { bg: "rgba(16,185,129,0.12)",  color: "#34d399", dot: "#10b981" },
  standard: { bg: "rgba(99,102,241,0.12)",  color: "#818cf8", dot: "#6366f1" },
  advanced: { bg: "rgba(245,158,11,0.12)",  color: "#fbbf24", dot: "#f59e0b" },
};

// ── Per-module snapshot row ────────────────────────────────────────────────
function SnapshotRow({ mod }: { mod: Module }) {
  const status = useMemo(() => computeTierStatus(mod.module_key, mod.properties), [mod]);
  const hasConfig = !!status;

  const tierKey = (mod.properties?.tier ?? "basic") as TierKey;
  const tc = TIER_COLORS[tierKey];

  return (
    <div style={{
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      paddingBottom: 16,
      marginBottom: 16,
    }}>
      {/* ── Header row ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        {/* Module name */}
        <div style={{ flex: "0 0 180px", fontSize: "0.88rem", fontWeight: 700, color: "#f1f5f9" }}>
          {mod.module_key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
        </div>

        {/* Enabled/Disabled pill */}
        <span style={{
          padding: "2px 10px", borderRadius: 20, fontSize: "0.68rem", fontWeight: 700,
          background: mod.is_enabled ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.05)",
          color: mod.is_enabled ? "#34d399" : "#475569",
          border: `1px solid ${mod.is_enabled ? "#10b98130" : "rgba(255,255,255,0.08)"}`,
        }}>
          {mod.is_enabled ? "● Enabled" : "○ Disabled"}
        </span>

        {/* Tier pill (only for tiered modules) */}
        {hasConfig && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "2px 10px", borderRadius: 20,
            background: tc.bg, color: tc.color,
            fontSize: "0.68rem", fontWeight: 700,
            border: `1px solid ${tc.dot}30`,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: tc.dot }} />
            {TIER_LABELS[tierKey]}
          </span>
        )}

        {/* Status badge */}
        {hasConfig && status && (
          status.isPure ? (
            <span style={{ fontSize: "0.68rem", color: "#34d399", fontWeight: 600 }}>✓ Pure tier</span>
          ) : (
            <span style={{
              display: "inline-flex", gap: 6, alignItems: "center",
              fontSize: "0.68rem", fontWeight: 700,
            }}>
              {status.modified > 0 && (
                <span style={{ color: "#818cf8" }}>⚡ {status.modified} modified</span>
              )}
              {status.overrides > 0 && (
                <span style={{ color: "#fb923c" }}>★ {status.overrides} override{status.overrides > 1 ? "s" : ""}</span>
              )}
            </span>
          )
        )}

        {!hasConfig && (
          <span style={{ fontSize: "0.68rem", color: "#475569" }}>— no tier config</span>
        )}
      </div>

      {/* ── Deviation table ──────────────────────────────────────────── */}
      {hasConfig && status && !status.isPure && (
        <div style={{
          marginLeft: 192,
          display: "grid",
          gridTemplateColumns: "1fr auto auto auto",
          gap: "4px 16px",
          alignItems: "center",
        }}>
          {/* Column headers */}
          <div style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "#475569" }}>Feature</div>
          <div style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "#475569" }}>Tier Default</div>
          <div style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "#475569" }}>Actual</div>
          <div style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "#475569" }}>Type</div>

          {status.deviations.map(d => (
            <>
              <div key={`${d.feature}-name`} style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                {d.label}
              </div>
              <div key={`${d.feature}-canon`} style={{
                fontSize: "0.73rem", fontWeight: 600,
                color: d.canonical ? "#34d399" : "#f87171",
              }}>
                {d.canonical ? "ON" : "OFF"}
              </div>
              <div key={`${d.feature}-actual`} style={{
                fontSize: "0.73rem", fontWeight: 700,
                color: d.actual ? "#34d399" : "#f87171",
              }}>
                {d.actual ? "ON" : "OFF"}
              </div>
              <div key={`${d.feature}-type`}>
                <span style={{
                  padding: "1px 7px", borderRadius: 20, fontSize: "0.62rem", fontWeight: 700,
                  background: d.type === "override" ? "rgba(249,115,22,0.12)" : "rgba(99,102,241,0.10)",
                  color: d.type === "override" ? "#fb923c" : "#818cf8",
                }}>
                  {d.type === "override" ? "★ Override" : "⚡ Modified"}
                </span>
              </div>
            </>
          ))}
        </div>
      )}

      {/* ── All-features breakdown (pure modules) ───────────────────── */}
      {hasConfig && status && status.isPure && (
        <div style={{ marginLeft: 192 }}>
          <FeatureGrid tier={tierKey} moduleKey={mod.module_key} properties={mod.properties} />
        </div>
      )}
    </div>
  );
}

// ── Compact feature grid for pure tier view ────────────────────────────────
function FeatureGrid({ tier, moduleKey, properties }: {
  tier: TierKey; moduleKey: string; properties: Record<string, any>;
}) {
  const tierDefs = MODULE_TIER_DEFAULTS[moduleKey]?.[tier];
  if (!tierDefs) return null;

  const entries = Object.entries(tierDefs).filter(([, v]) => v !== null);
  if (entries.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {entries.map(([feature, canonVal]) => {
        const actual = properties[feature];
        const isOn = typeof actual === "boolean" ? actual : canonVal;
        return (
          <span key={feature} style={{
            padding: "2px 8px", borderRadius: 20, fontSize: "0.67rem", fontWeight: 600,
            background: isOn ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.04)",
            color: isOn ? "#34d399" : "#475569",
            border: `1px solid ${isOn ? "#10b98120" : "rgba(255,255,255,0.06)"}`,
          }}>
            {isOn ? "✓" : "—"} {FEATURE_LABELS[feature] ?? feature.replace(/_/g, " ")}
          </span>
        );
      })}
    </div>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────
function SummaryBar({ modules }: { modules: Module[] }) {
  const stats = useMemo(() => {
    let pure = 0, modified = 0, overrides = 0, noTier = 0;
    for (const mod of modules) {
      if (!mod.is_enabled) continue;
      const status = computeTierStatus(mod.module_key, mod.properties);
      if (!status) { noTier++; continue; }
      if (status.isPure) pure++;
      else {
        if (status.modified > 0) modified++;
        if (status.overrides > 0) overrides++;
      }
    }
    return { pure, modified, overrides, noTier };
  }, [modules]);

  return (
    <div style={{
      display: "flex", gap: 14, flexWrap: "wrap",
      padding: "14px 18px",
      background: "rgba(0,0,0,0.2)",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.06)",
      marginBottom: 24,
    }}>
      <StatPill label="Pure Tier" count={stats.pure}      color="#34d399" desc="Matches tier exactly" />
      <StatPill label="Modified"  count={stats.modified}  color="#818cf8" desc="Tier features restricted" />
      <StatPill label="Overrides" count={stats.overrides} color="#fb923c" desc="Cross-tier features granted" />
      {stats.noTier > 0 && (
        <StatPill label="No Config" count={stats.noTier} color="#475569" desc="Standard modules" />
      )}
    </div>
  );
}

function StatPill({ label, count, color, desc }: { label: string; count: number; color: string; desc: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: `${color}15`, border: `1px solid ${color}30`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "0.95rem", fontWeight: 800, color,
      }}>
        {count}
      </div>
      <div>
        <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#f1f5f9" }}>{label}</div>
        <div style={{ fontSize: "0.68rem", color: "#475569" }}>{desc}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════
export default function CapabilitySnapshot({ modules, companyName }: CapabilitySnapshotProps) {
  // Split: tiered modules first, then rest
  const tiered    = modules.filter(m => !!MODULE_TIER_DEFAULTS[m.module_key]);
  const nonTiered = modules.filter(m => !MODULE_TIER_DEFAULTS[m.module_key]);

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: "1rem", fontWeight: 800, color: "#f1f5f9", marginBottom: 4 }}>
          Capability Snapshot — {companyName}
        </div>
        <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
          Shows the assigned Tier per module, any developer customisations within that tier (⚡ Modified),
          and any features granted beyond the tier (★ Override).
        </div>
      </div>

      {/* ── Summary bar ─────────────────────────────────────────────── */}
      <SummaryBar modules={modules} />

      {/* ── Legend ──────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 20, flexWrap: "wrap",
        padding: "10px 14px",
        background: "rgba(0,0,0,0.1)",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.05)",
        marginBottom: 20,
      }}>
        {[
          { sym: "✓ Pure",       color: "#34d399", desc: "Tenant's config exactly matches the canonical tier definition" },
          { sym: "⚡ Modified",  color: "#818cf8", desc: "A feature included in this tier has been turned OFF by developer" },
          { sym: "★ Override",   color: "#fb923c", desc: "A feature NOT in this tier has been turned ON by developer" },
        ].map(l => (
          <div key={l.sym} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "0.73rem", fontWeight: 700, color: l.color }}>{l.sym}</span>
            <span style={{ fontSize: "0.72rem", color: "#475569" }}>{l.desc}</span>
          </div>
        ))}
      </div>

      {/* ── Tiered modules ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "#475569", marginBottom: 14 }}>
          Tiered Modules
        </div>
        {tiered.length === 0 ? (
          <div style={{ fontSize: "0.82rem", color: "#475569" }}>No tiered modules configured.</div>
        ) : (
          tiered.map(mod => <SnapshotRow key={mod.id} mod={mod} />)
        )}
      </div>

      {/* ── Non-tiered modules (toggle grid) ────────────────────────── */}
      {nonTiered.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "#475569", marginBottom: 14 }}>
            Standard Modules (On/Off Only)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {nonTiered.map(mod => (
              <span key={mod.id} style={{
                padding: "4px 12px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 600,
                background: mod.is_enabled ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.04)",
                color: mod.is_enabled ? "#34d399" : "#475569",
                border: `1px solid ${mod.is_enabled ? "#10b98120" : "rgba(255,255,255,0.06)"}`,
              }}>
                {mod.is_enabled ? "●" : "○"}{" "}
                {mod.module_key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
