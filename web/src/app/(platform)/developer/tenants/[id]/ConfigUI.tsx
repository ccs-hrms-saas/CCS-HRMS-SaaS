import React, { useState } from "react";
import { Leaf, BookOpen, Sparkles, Sliders } from "lucide-react";

export type Tier = "basic" | "standard" | "advanced" | "custom";

export const TIER_META: Record<Tier, { label: string; badge: string; color: string; desc: string; icon: React.ElementType }> = {
  basic:    { label: "Basic",    badge: "Tier 1", color: "#64748b", desc: "Essential features for small teams", icon: Leaf },
  standard: { label: "Standard", badge: "Tier 2", color: "#3b82f6", desc: "Core features + flexibility", icon: BookOpen },
  advanced: { label: "Advanced", badge: "Tier 3", color: "#8b5cf6", desc: "Advanced controls and automation", icon: Sparkles },
  custom:   { label: "Custom",   badge: "Custom", color: "#f97316", desc: "Hand-pick features individually", icon: Sliders },
};

// ── Shared UI Components ─────────────────────────────────────────────────────

export function CheckRow({ label, hint, field, value, locked, onChange }: {
  label: string; hint?: string; field: string; value: boolean; locked: boolean;
  onChange: (u: Record<string, any>) => void;
}) {
  return (
    <label style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 18px", borderRadius: 10, cursor: locked ? "not-allowed" : "pointer",
      background: value && !locked ? "rgba(99,102,241,0.07)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${value && !locked ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.06)"}`,
      opacity: locked ? 0.45 : 1, transition: "all 0.15s", gap: 16, marginBottom: 8
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: hint ? 3 : 0 }}>{label}</div>
        {hint && <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{hint}</div>}
      </div>
      <input type="checkbox" checked={value} disabled={locked}
        onChange={e => onChange({ [field]: e.target.checked })}
        style={{ width: 18, height: 18, accentColor: "#6366f1", cursor: locked ? "not-allowed" : "pointer", flexShrink: 0 }} />
    </label>
  );
}

export function NumRow({ label, field, value, locked, min, max, step, onChange, inline = false }: {
  label: string; field: string; value: number; locked: boolean;
  min?: number; max?: number; step?: number; inline?: boolean;
  onChange: (u: Record<string, any>) => void;
}) {
  return (
    <div style={{ 
      display: "flex", alignItems: "center", justifyContent: "space-between", 
      padding: "12px 18px", borderRadius: 10, 
      background: inline ? "transparent" : "rgba(255,255,255,0.02)", 
      border: inline ? "none" : "1px solid rgba(255,255,255,0.06)", 
      marginBottom: inline ? 0 : 8 
    }}>
      <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{label}</label>
      <input type="number" value={value ?? ""} min={min} max={max} step={step ?? 1} disabled={locked}
        onChange={e => onChange({ [field]: parseFloat(e.target.value) || 0 })}
        style={{ width: 80, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "var(--text-primary)", fontSize: "0.85rem", textAlign: "center", opacity: locked ? 0.5 : 1 }} />
    </div>
  );
}

export function SelectRow({ label, field, value, options, locked, onChange }: {
  label: string; field: string; value: string;
  options: { value: string; label: string }[];
  locked: boolean; onChange: (u: Record<string, any>) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", gap: 16, marginBottom: 8 }}>
      <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", flex: 1 }}>{label}</label>
      <select value={value} disabled={locked}
        onChange={e => onChange({ [field]: e.target.value })}
        style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "var(--text-primary)", fontSize: "0.82rem", opacity: locked ? 0.5 : 1 }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function SectionHead({ title, locked, lockNote }: { title: string; locked?: boolean; lockNote?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0 10px", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 12, marginTop: 8 }}>
      <span style={{ fontWeight: 700, fontSize: "0.8rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</span>
      {locked && lockNote && (
        <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: 6, background: "rgba(239,68,68,0.1)", color: "#f87171", fontWeight: 600 }}>🔒 {lockNote}</span>
      )}
    </div>
  );
}

export function TierTabs({ activeTab, onSelect }: { activeTab: Tier; onSelect: (t: Tier) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 20 }}>
      {(["basic","standard","advanced","custom"] as Tier[]).map(t => {
        const m = TIER_META[t];
        const active = activeTab === t;
        const Icon = m.icon;
        return (
          <button key={t} onClick={() => onSelect(t)} style={{
            padding: "12px 10px", borderRadius: "12px 12px 0 0", cursor: "pointer", 
            border: "none", borderBottom: `3px solid ${active ? m.color : "transparent"}`,
            background: active ? `linear-gradient(to bottom, ${m.color}15, transparent)` : "rgba(255,255,255,0.02)",
            color: active ? "var(--text-primary)" : "var(--text-secondary)",
            transition: "all 0.15s", display: "flex", flexDirection: "column", alignItems: "center", gap: 6
          }}>
            <Icon size={18} color={active ? m.color : "#64748b"} />
            <div style={{ fontWeight: active ? 700 : 500, fontSize: "0.85rem" }}>{m.label}</div>
          </button>
        );
      })}
    </div>
  );
}

export function TierActivateBlock({ tier, activeTier, onActivate }: { tier: Tier; activeTier: Tier; onActivate: () => void }) {
  if (tier === activeTier) return (
    <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", color: "var(--success)", fontSize: "0.85rem", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
      <div style={{ fontWeight: 600 }}>✅ This tenant is currently on the {TIER_META[tier].label} Plan.</div>
    </div>
  );
  
  return (
    <div style={{ padding: "16px", borderRadius: 10, background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
      <div>
        <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.95rem", marginBottom: 4 }}>{TIER_META[tier].label} Plan</div>
        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{TIER_META[tier].desc}</div>
      </div>
      <button onClick={onActivate} style={{ padding: "8px 16px", borderRadius: 8, background: "#6366f1", color: "white", fontWeight: 600, border: "none", cursor: "pointer", fontSize: "0.85rem" }}>
        Activate Plan
      </button>
    </div>
  );
}
