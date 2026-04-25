"use client";

import { useState } from "react";
import { Tier, TierTabs, TierActivateBlock, SectionHead, CheckRow, NumRow, SelectRow } from "./ConfigUI";

interface Props {
  props: Record<string, any>;
  onChange: (updated: Record<string, any>) => void;
  onSave: () => void;
  saving: boolean;
}

export default function LeaveConfigPanel({ props, onChange, onSave, saving }: Props) {
  const activeTier = (props.tier ?? "basic") as Tier;
  const [tab, setTab] = useState<Tier>(activeTier);
  const [newLabel, setNewLabel] = useState("");

  const isCust = activeTier === "custom";
  const locked = (requireTier: Tier) => {
    if (isCust) return false;
    if (requireTier === "advanced") return activeTier !== "advanced";
    if (requireTier === "standard") return activeTier === "basic";
    return false;
  };

  const set = (partial: Record<string, any>) => onChange({ ...props, ...partial });

  const activatePlan = () => {
    const base: Record<string, any> = { ...props, tier: tab };
    if (tab === "basic")    { base.max_leave_types = 2;   base.approval_chain_depth = 1; }
    if (tab === "standard") { base.max_leave_types = 10;  base.approval_chain_depth = Math.max(props.approval_chain_depth ?? 1, 1); }
    if (tab === "advanced") { base.max_leave_types = 999; }
    onChange(base);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <TierTabs activeTab={tab} onSelect={setTab} />

      <div style={{ flex: 1, padding: "0 4px" }}>
        <TierActivateBlock tier={tab} activeTier={activeTier} onActivate={activatePlan} />

        {/* BASIC TAB */}
        {tab === "basic" && (
          <>
            <SectionHead title="Leave Type Limits" />
            <SelectRow label="Max Leave Types allowed for this tenant"
              field="_max_leave_display" value={activeTier === "basic" ? "2" : activeTier === "standard" ? "10" : "999"}
              options={[{ value: "2", label: "2 types (Basic)" }, { value: "10", label: "10 types (Standard)" }, { value: "999", label: "Unlimited (Advanced)" }]}
              locked={true} onChange={() => {}} />
            <SelectRow label="Who can configure leave types"
              field="who_can_configure" value={props.who_can_configure ?? "superadmin_only"}
              options={[{ value: "superadmin_only", label: "Superadmin Only" }, { value: "superadmin_or_admin", label: "Superadmin or Admin" }]}
              locked={locked("advanced")} onChange={set} />
            <SelectRow label="Approval chain depth"
              field="approval_chain_depth" value={String(props.approval_chain_depth ?? 1)}
              options={[{ value: "1", label: "1 Level" }, { value: "2", label: "2 Levels (Standard+)" }, { value: "3", label: "3 Levels (Advanced)" }]}
              locked={locked("standard")} onChange={v => set({ approval_chain_depth: parseInt(v.approval_chain_depth) })} />

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
            <SectionHead title="Standard Leave Features" locked={locked("standard")} lockNote="Requires Standard" />
            <CheckRow label="Allow Carry-Forward" hint="Unused leave balance rolls over to next period (configurable % per leave type)"
              field="allow_carryforward" value={!!props.allow_carryforward} locked={locked("standard")} onChange={set} />
            <CheckRow label="Allow Half-Day Leave" hint="Employees can apply for half-day leave for applicable leave types"
              field="half_day_allowed" value={!!props.half_day_allowed} locked={locked("standard")} onChange={set} />
            <CheckRow label="Allow Short Leave (partial hour)" hint="e.g. employee leaves 2h early — counts as a short leave unit"
              field="short_leave_allowed" value={!!props.short_leave_allowed} locked={locked("standard")} onChange={set} />

            {(!!props.half_day_allowed || !!props.short_leave_allowed) && (!locked("standard")) && (
              <div style={{ padding: "12px 18px", borderRadius: 10, background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.15)", marginLeft: 24, display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
                <CheckRow label="Let SuperAdmin configure the half-day / short-leave ratios per leave type"
                  hint="If OFF, the default ratios below apply to all leave types"
                  field="superadmin_can_configure_partial_day"
                  value={props.superadmin_can_configure_partial_day !== false}
                  locked={locked("standard")} onChange={set} />
                {props.superadmin_can_configure_partial_day === false && (
                  <>
                    <NumRow label="Default half-days per full leave" field="default_half_days_per_leave"
                      value={props.default_half_days_per_leave ?? 2} min={1} max={8} locked={locked("standard")} onChange={set} />
                    <NumRow label="Default short leaves per full leave" field="default_short_leaves_per_leave"
                      value={props.default_short_leaves_per_leave ?? 4} min={1} max={12} locked={locked("standard")} onChange={set} />
                  </>
                )}
              </div>
            )}

            <CheckRow label="CL Consecutive Day Limit" hint="Restrict maximum consecutive days in a single Casual Leave application"
              field="cl_consecutive_limit_enabled" value={!!props.cl_consecutive_limit_enabled} locked={locked("standard")} onChange={set} />
            {!!props.cl_consecutive_limit_enabled && (!locked("standard")) && (
              <div style={{ marginLeft: 24, marginBottom: 8 }}>
                <NumRow label="Default max consecutive days for CL" field="cl_default_max_consecutive_days"
                  value={props.cl_default_max_consecutive_days ?? 2} min={1} max={10} locked={locked("standard")} onChange={set} />
              </div>
            )}
          </>
        )}

        {/* ADVANCED TAB */}
        {tab === "advanced" && (
          <>
            <SectionHead title="Advanced Leave Features" locked={locked("advanced")} lockNote="Requires Advanced" />
            <CheckRow label="Menstruation Leave (ML) Type" hint="ML lapse tracking: N months unused → 1 bonus leave awarded. No hour deductions."
              field="ml_leave_enabled" value={!!props.ml_leave_enabled} locked={locked("advanced")} onChange={set} />
            {!!props.ml_leave_enabled && (!locked("advanced")) && (
              <div style={{ marginLeft: 24, display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
                <NumRow label="Lapsed months required to earn bonus leave" field="ml_lapse_award_threshold"
                  value={props.ml_lapse_award_threshold ?? 4} min={2} max={12} locked={locked("advanced")} onChange={set} />
                <SelectRow label="Bonus leave type awarded" field="ml_lapse_award_type"
                  value={props.ml_lapse_award_type ?? "Comp-Off"}
                  options={["Comp-Off", "Casual Leave", "Earned Leave"].map(v => ({ value: v, label: v }))}
                  locked={locked("advanced")} onChange={set} />
              </div>
            )}

            <CheckRow label="Short Leave (N-Hour Leave)" hint="Employees can apply for a leave of fewer hours (e.g. 2hr short leave)"
              field="short_leave_enabled" value={!!props.short_leave_enabled} locked={locked("advanced")} onChange={set} />
            {!!props.short_leave_enabled && (!locked("advanced")) && (
              <div style={{ marginLeft: 24, marginBottom: 8 }}>
                <NumRow label="Default short leave duration (hours)" field="short_leave_default_hours"
                  value={props.short_leave_default_hours ?? 2} min={1} max={4} step={0.5} locked={locked("advanced")} onChange={set} />
              </div>
            )}

            <CheckRow label="Comp-Off (Compensatory Off)" hint="Employees who work on holidays or extra days earn comp-off credits"
              field="compoff_enabled" value={!!props.compoff_enabled} locked={locked("advanced")} onChange={set} />
            <CheckRow label="Week-Off Customisation" hint="Set different weekly off days per employee or department group"
              field="week_off_customization" value={!!props.week_off_customization} locked={locked("advanced")} onChange={set} />
            <CheckRow label="Link LWP to Payroll Deduction" hint="LWP leave types directly reduce salary. Requires Payroll module Standard+."
              field="lwp_payroll_link" value={!!props.lwp_payroll_link} locked={locked("advanced")} onChange={set} />
            <CheckRow label="Deficit Adjustment Pool" hint="Employees can surrender eligible leave days to cover an hour deficit."
              field="deficit_adjustment_enabled" value={!!props.deficit_adjustment_enabled} locked={locked("advanced")} onChange={set} />

            <SectionHead title="Advanced Working Hours" locked={locked("advanced")} lockNote="Requires Advanced" />
            <CheckRow label="Per-Employee Working Hours Override (Shift Mode)" hint="Set different daily hours per employee (e.g. 6h part-time, 12h night shift)."
              field="per_employee_hours" value={!!props.per_employee_hours} locked={locked("advanced")} onChange={set} />
            <CheckRow label="Per-Employee Shift Timing" hint="Each employee has their own prescribed check-in time and check-out deadline."
              field="per_employee_shift" value={!!props.per_employee_shift} locked={locked("advanced")} onChange={set} />
          </>
        )}

        {/* CUSTOM TAB */}
        {tab === "custom" && (
          <>
            <SectionHead title="Platform Flexibilities" locked={false} />
            <CheckRow label="Allow Informal (No-Ledger) Leave Types" hint="Tenant can create leave types with no balance tracking — employee applies anytime."
              field="allow_no_ledger_leaves" value={props.allow_no_ledger_leaves !== false} locked={false} onChange={set} />
            <CheckRow label="Employee Groups" hint="Allow SuperAdmin/Admin to create employee groups for holidays, announcements, shifts."
              field="allow_employee_groups" value={props.allow_employee_groups !== false} locked={false} onChange={set} />
            <CheckRow label="Org-Wide Working Hours — Editable Anytime" hint="Standard allows this, Basic locks it for 90 days. Check to force unlock."
              field="org_hours_configurable" value={!!props.org_hours_configurable} locked={false} onChange={set} />
          </>
        )}
      </div>

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
