"use client";

import { useState } from "react";
import { Leaf, BookOpen, Sparkles, Sliders } from "lucide-react";
import s from "./config-panel.module.css";

interface Props {
  props: Record<string, any>;
  onChange: (updated: Record<string, any>) => void;
  onSave: () => void;
  saving: boolean;
}

type LeaveTier = "basic" | "standard" | "advanced" | "custom";
type Tab = "core" | "standard" | "advanced" | "schedule";

const TIER_META: Record<LeaveTier, { label: string; badge: string; color: string; desc: string; icon: React.ElementType }> = {
  basic:    { label: "Basic",    badge: "Tier 1", color: "#64748b", desc: "2 leave types, single-level approval",         icon: Leaf },
  standard: { label: "Standard", badge: "Tier 2", color: "#3b82f6", desc: "Up to 10 types, carry-forward, partial-day",   icon: BookOpen },
  advanced: { label: "Advanced", badge: "Tier 3", color: "#8b5cf6", desc: "Unlimited types, ML, short leave, payroll link", icon: Sparkles },
  custom:   { label: "Custom",   badge: "Custom",  color: "#f97316", desc: "Hand-pick any feature individually",            icon: Sliders },
};

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "core",     label: "Core Settings",     icon: "⚙️" },
  { id: "standard", label: "Standard Features", icon: "📋" },
  { id: "advanced", label: "Advanced Features", icon: "🚀" },
  { id: "schedule", label: "Work Schedule",     icon: "🕐" },
];

// ── Checkbox row — full width, label on left, checkbox on right ──────────────
function CheckRow({ label, hint, field, value, locked, onChange }: {
  label: string; hint?: string; field: string; value: boolean; locked: boolean;
  onChange: (u: Record<string, any>) => void;
}) {
  return (
    <label style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 18px", borderRadius: 10, cursor: locked ? "not-allowed" : "pointer",
      background: value && !locked ? "rgba(99,102,241,0.07)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${value && !locked ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.06)"}`,
      opacity: locked ? 0.45 : 1, transition: "all 0.15s", gap: 16,
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

// ── Number field — compact row ───────────────────────────────────────────────
function NumRow({ label, field, value, locked, min, max, step, onChange }: {
  label: string; field: string; value: number; locked: boolean;
  min?: number; max?: number; step?: number;
  onChange: (u: Record<string, any>) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{label}</label>
      <input type="number" value={value ?? ""} min={min} max={max} step={step ?? 1} disabled={locked}
        onChange={e => onChange({ [field]: parseInt(e.target.value) || 0 })}
        style={{ width: 80, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "var(--text-primary)", fontSize: "0.85rem", textAlign: "center" }} />
    </div>
  );
}

// ── Select row ───────────────────────────────────────────────────────────────
function SelectRow({ label, field, value, options, locked, onChange }: {
  label: string; field: string; value: string;
  options: { value: string; label: string }[];
  locked: boolean; onChange: (u: Record<string, any>) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", gap: 16 }}>
      <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", flex: 1 }}>{label}</label>
      <select value={value} disabled={locked}
        onChange={e => onChange({ [field]: e.target.value })}
        style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "var(--text-primary)", fontSize: "0.82rem" }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ── Section header ───────────────────────────────────────────────────────────
function SectionHead({ title, locked, lockNote }: { title: string; locked?: boolean; lockNote?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0 10px", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 10 }}>
      <span style={{ fontWeight: 700, fontSize: "0.8rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</span>
      {locked && lockNote && (
        <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: 6, background: "rgba(239,68,68,0.1)", color: "#f87171", fontWeight: 600 }}>🔒 {lockNote}</span>
      )}
    </div>
  );
}

export default function LeaveConfigPanel({ props, onChange, onSave, saving }: Props) {
  const tier = (props.tier ?? "basic") as LeaveTier;
  const isStd  = tier !== "basic";
  const isAdv  = tier === "advanced";
  const isCust = tier === "custom";
  const [tab, setTab] = useState<Tab>("core");
  const [newLabel, setNewLabel] = useState("");

  const locked = (requireStd: boolean, requireAdv: boolean) =>
    isCust ? false : requireAdv ? !isAdv : requireStd ? !isStd : false;

  const set = (partial: Record<string, any>) => onChange({ ...props, ...partial });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%" }}>

      {/* ── Tier Selector ─────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
        {(["basic","standard","advanced","custom"] as LeaveTier[]).map(t => {
          const m = TIER_META[t];
          const Icon = m.icon;
          const active = tier === t;
          return (
            <button key={t} onClick={() => {
              const base: Record<string, any> = { ...props, tier: t };
              if (t === "basic")    { base.max_leave_types = 2;   base.approval_chain_depth = 1; }
              if (t === "standard") { base.max_leave_types = 10;  base.approval_chain_depth = Math.max(props.approval_chain_depth ?? 1, 1); }
              if (t === "advanced") { base.max_leave_types = 999; }
              onChange(base);
            }} style={{
              padding: "14px 12px", borderRadius: 12, cursor: "pointer", textAlign: "left",
              border: `2px solid ${active ? m.color : "rgba(255,255,255,0.07)"}`,
              background: active ? `${m.color}15` : "rgba(255,255,255,0.02)",
              transition: "all 0.15s",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Icon size={15} color={active ? m.color : "#475569"} />
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: active ? m.color : "var(--text-secondary)", padding: "1px 8px", borderRadius: 6, background: active ? `${m.color}20` : "rgba(255,255,255,0.05)" }}>{m.badge}</span>
              </div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: active ? "var(--text-primary)" : "var(--text-secondary)", marginBottom: 3 }}>{m.label}</div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>{m.desc}</div>
            </button>
          );
        })}
      </div>

      {isCust && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(249,115,22,0.07)", border: "1px solid rgba(249,115,22,0.2)", fontSize: "0.78rem", color: "#fb923c", marginBottom: 16 }}>
          🎛️ Custom tier — all features individually unlocked. No tier restrictions apply.
        </div>
      )}

      {/* ── Tab Bar ───────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "10px 8px", borderRadius: 10, cursor: "pointer", fontWeight: tab === t.id ? 700 : 500,
            fontSize: "0.8rem", transition: "all 0.15s",
            border: `1.5px solid ${tab === t.id ? "#6366f1" : "rgba(255,255,255,0.07)"}`,
            background: tab === t.id ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.02)",
            color: tab === t.id ? "#818cf8" : "var(--text-secondary)",
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>

        {/* CORE TAB */}
        {tab === "core" && (
          <>
            <SectionHead title="Leave Type Limits" />
            <SelectRow label="Max Leave Types allowed for this tenant"
              field="_max_leave_display" value={tier === "basic" ? "2" : tier === "standard" ? "10" : "999"}
              options={[{ value: "2", label: "2 types (Basic)" }, { value: "10", label: "10 types (Standard)" }, { value: "999", label: "Unlimited (Advanced)" }]}
              locked={true} onChange={() => {}} />

            <SelectRow label="Who can configure leave types"
              field="who_can_configure" value={props.who_can_configure ?? "superadmin_only"}
              options={[{ value: "superadmin_only", label: "Superadmin Only" }, { value: "superadmin_or_admin", label: "Superadmin or Admin" }]}
              locked={!isAdv && !isCust} onChange={set} />

            <SelectRow label="Approval chain depth"
              field="approval_chain_depth" value={String(props.approval_chain_depth ?? 1)}
              options={[{ value: "1", label: "1 Level" }, { value: "2", label: "2 Levels (Standard+)" }, { value: "3", label: "3 Levels (Advanced)" }]}
              locked={!isStd && !isCust} onChange={v => set({ approval_chain_depth: parseInt(v.approval_chain_depth) })} />

            <SectionHead title="Custom Leave Label Presets" />
            <div style={{ padding: "12px 18px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {(props.custom_leave_labels ?? []).map((lbl: string) => (
                  <span key={lbl} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", fontSize: "0.78rem", color: "#818cf8" }}>
                    {lbl}
                    <button onClick={() => set({ custom_leave_labels: (props.custom_leave_labels ?? []).filter((x: string) => x !== lbl) })}
                      style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "0.75rem", lineHeight: 1, padding: 0 }}>✕</button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input placeholder="e.g. Festival Leave, Paternity Leave…" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "var(--text-primary)", fontSize: "0.82rem" }} />
                <button onClick={() => { if (!newLabel.trim()) return; const ex = props.custom_leave_labels ?? []; if (!ex.includes(newLabel)) set({ custom_leave_labels: [...ex, newLabel] }); setNewLabel(""); }}
                  style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)", color: "#818cf8", cursor: "pointer", fontSize: "0.82rem", fontWeight: 700 }}>+ Add</button>
              </div>
            </div>
          </>
        )}

        {/* STANDARD TAB */}
        {tab === "standard" && (
          <>
            <SectionHead title="Standard Features" locked={!isStd && !isCust} lockNote="Requires Standard tier or above" />
            <CheckRow label="Allow Carry-Forward" hint="Unused leave balance rolls over to next period (configurable % per leave type)"
              field="allow_carryforward" value={!!props.allow_carryforward} locked={locked(true, false)} onChange={set} />
            <CheckRow label="Allow Half-Day Leave" hint="Employees can apply for half-day leave for applicable leave types"
              field="half_day_allowed" value={!!props.half_day_allowed} locked={locked(true, false)} onChange={set} />
            <CheckRow label="Allow Short Leave (partial hour)" hint="e.g. employee leaves 2h early — counts as a short leave unit"
              field="short_leave_allowed" value={!!props.short_leave_allowed} locked={locked(true, false)} onChange={set} />

            {(!!props.half_day_allowed || !!props.short_leave_allowed) && (isStd || isCust) && (
              <div style={{ padding: "12px 18px", borderRadius: 10, background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.15)", marginLeft: 24, display: "flex", flexDirection: "column", gap: 8 }}>
                <CheckRow label="Let SuperAdmin configure the half-day / short-leave ratios per leave type"
                  hint="If OFF, the default ratios below apply to all leave types"
                  field="superadmin_can_configure_partial_day"
                  value={props.superadmin_can_configure_partial_day !== false}
                  locked={locked(true, false)} onChange={set} />
                {props.superadmin_can_configure_partial_day === false && (
                  <>
                    <NumRow label="Default half-days per full leave" field="default_half_days_per_leave"
                      value={props.default_half_days_per_leave ?? 2} min={1} max={8} locked={locked(true, false)} onChange={set} />
                    <NumRow label="Default short leaves per full leave" field="default_short_leaves_per_leave"
                      value={props.default_short_leaves_per_leave ?? 4} min={1} max={12} locked={locked(true, false)} onChange={set} />
                  </>
                )}
              </div>
            )}

            <CheckRow label="CL Consecutive Day Limit" hint="Restrict maximum consecutive days in a single Casual Leave application"
              field="cl_consecutive_limit_enabled" value={!!props.cl_consecutive_limit_enabled} locked={locked(true, false)} onChange={set} />
            {!!props.cl_consecutive_limit_enabled && (isStd || isCust) && (
              <div style={{ marginLeft: 24 }}>
                <NumRow label="Default max consecutive days for CL" field="cl_default_max_consecutive_days"
                  value={props.cl_default_max_consecutive_days ?? 2} min={1} max={10} locked={locked(true, false)} onChange={set} />
              </div>
            )}
          </>
        )}

        {/* ADVANCED TAB */}
        {tab === "advanced" && (
          <>
            <SectionHead title="Advanced Features" locked={!isAdv && !isCust} lockNote="Requires Advanced tier" />
            <CheckRow label="Menstruation Leave (ML) Type" hint="ML lapse tracking: N months unused → 1 bonus leave awarded. No hour deductions."
              field="ml_leave_enabled" value={!!props.ml_leave_enabled} locked={locked(false, true)} onChange={set} />
            {!!props.ml_leave_enabled && (isAdv || isCust) && (
              <div style={{ marginLeft: 24, display: "flex", flexDirection: "column", gap: 8 }}>
                <NumRow label="Lapsed months required to earn bonus leave" field="ml_lapse_award_threshold"
                  value={props.ml_lapse_award_threshold ?? 4} min={2} max={12} locked={locked(false, true)} onChange={set} />
                <SelectRow label="Bonus leave type awarded" field="ml_lapse_award_type"
                  value={props.ml_lapse_award_type ?? "Comp-Off"}
                  options={["Comp-Off", "Casual Leave", "Earned Leave"].map(v => ({ value: v, label: v }))}
                  locked={locked(false, true)} onChange={set} />
              </div>
            )}

            <CheckRow label="Short Leave (N-Hour Leave)" hint="Employees can apply for a leave of fewer hours (e.g. 2hr short leave)"
              field="short_leave_enabled" value={!!props.short_leave_enabled} locked={locked(false, true)} onChange={set} />
            {!!props.short_leave_enabled && (isAdv || isCust) && (
              <div style={{ marginLeft: 24 }}>
                <NumRow label="Default short leave duration (hours)" field="short_leave_default_hours"
                  value={props.short_leave_default_hours ?? 2} min={1} max={4} step={0.5} locked={locked(false, true)} onChange={set} />
              </div>
            )}

            <CheckRow label="Comp-Off (Compensatory Off)" hint="Employees who work on holidays or extra days earn comp-off credits"
              field="compoff_enabled" value={!!props.compoff_enabled} locked={locked(false, true)} onChange={set} />
            <CheckRow label="Week-Off Customisation" hint="Set different weekly off days per employee or department group"
              field="week_off_customization" value={!!props.week_off_customization} locked={locked(false, true)} onChange={set} />
            <CheckRow label="Link LWP to Payroll Deduction" hint="LWP leave types directly reduce salary. Requires Payroll module Standard+."
              field="lwp_payroll_link" value={!!props.lwp_payroll_link} locked={locked(false, true)} onChange={set} />
            <CheckRow label="Deficit Adjustment Pool" hint="Employees can surrender eligible leave days to cover an hour deficit."
              field="deficit_adjustment_enabled" value={!!props.deficit_adjustment_enabled} locked={locked(false, true)} onChange={set} />
            <CheckRow label="Allow Informal (No-Ledger) Leave Types" hint="Tenant can create leave types with no balance tracking — employee applies anytime."
              field="allow_no_ledger_leaves" value={props.allow_no_ledger_leaves !== false} locked={false} onChange={set} />
            <CheckRow label="Employee Groups" hint="Allow SuperAdmin/Admin to create employee groups for holidays, announcements, shifts."
              field="allow_employee_groups" value={props.allow_employee_groups !== false} locked={false} onChange={set} />
          </>
        )}

        {/* SCHEDULE TAB */}
        {tab === "schedule" && (
          <>
            <SectionHead title="Working Hours" />
            <CheckRow label="Org-Wide Working Hours — Editable Anytime" hint="Basic: locked 90 days after onboarding. Standard+: freely editable from Leave Settings."
              field="org_hours_configurable" value={!!props.org_hours_configurable} locked={locked(true, false)} onChange={set} />
            <CheckRow label="Per-Employee Working Hours Override (Shift Mode)" hint="Advanced: set different daily hours per employee (e.g. 6h part-time, 12h night shift)."
              field="per_employee_hours" value={!!props.per_employee_hours} locked={locked(false, true)} onChange={set} />
            <CheckRow label="Per-Employee Shift Timing" hint="Each employee has their own prescribed check-in time and check-out deadline."
              field="per_employee_shift" value={!!props.per_employee_shift} locked={locked(false, true)} onChange={set} />

            <SectionHead title="Partial Day Settings" />
            <CheckRow label="Half-Day Allowed (system-wide toggle)" hint="Master switch. SuperAdmin can still configure per leave type."
              field="half_day_allowed" value={!!props.half_day_allowed} locked={locked(true, false)} onChange={set} />
            <CheckRow label="Short Leave Allowed (system-wide toggle)" hint="Master switch for short/partial-hour leave across the org."
              field="short_leave_allowed" value={!!props.short_leave_allowed} locked={locked(true, false)} onChange={set} />
            <CheckRow label="SuperAdmin Can Configure Partial-Day Ratios" hint="Allow SuperAdmin to set half-day / short-leave ratios per leave type."
              field="superadmin_can_configure_partial_day" value={props.superadmin_can_configure_partial_day !== false} locked={locked(true, false)} onChange={set} />
          </>
        )}
      </div>

      {/* ── Save Button ───────────────────────────────────────────────── */}
      <div style={{ paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: 16 }}>
        <button onClick={onSave} disabled={saving} style={{
          width: "100%", padding: "12px 24px", borderRadius: 10, fontWeight: 700, fontSize: "0.9rem", cursor: "pointer",
          background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", color: "#fff",
          opacity: saving ? 0.7 : 1, transition: "opacity 0.15s",
        }}>
          {saving ? "Saving…" : "💾 Save Leave Config"}
        </button>
      </div>
    </div>
  );
}
