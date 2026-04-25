"use client";

import { useState } from "react";
import { Tier, TierTabs, TierActivateBlock, SectionHead, CheckRow, NumRow, SelectRow } from "./ConfigUI";

interface Props {
  props: Record<string, any>;
  onChange: (updated: Record<string, any>) => void;
  onSave: () => void;
  saving: boolean;
}

export default function PayrollConfigPanel({ props, onChange, onSave, saving }: Props) {
  const activeTier = (props.tier ?? "basic") as Tier;
  const [tab, setTab] = useState<Tier>(activeTier);
  const [newCurrency, setNewCurrency] = useState("");

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
            <SectionHead title="Core Payroll Settings" />
            <SelectRow label="Currency"
              field="currency" value={props.currency ?? "INR"}
              options={["INR", "USD", "AED", "SGD", "EUR", "GBP", ...(props._custom_currencies ?? [])].map(v => ({ value: v, label: v }))}
              locked={false} onChange={set} />
            <div style={{ display: "flex", gap: 8, padding: "0 18px", marginBottom: 16, marginTop: -4 }}>
                <input placeholder="Add Custom Currency (e.g. CAD)" value={newCurrency} onChange={e => setNewCurrency(e.target.value)}
                  style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "var(--text-primary)", fontSize: "0.82rem" }} />
                <button onClick={() => { if (!newCurrency.trim()) return; const ex = props._custom_currencies ?? []; if (!ex.includes(newCurrency)) set({ _custom_currencies: [...ex, newCurrency] }); setNewCurrency(""); }}
                  style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)", color: "#818cf8", cursor: "pointer", fontSize: "0.82rem", fontWeight: 700 }}>+ Add</button>
            </div>
            
            <NumRow label="Salary Denominator (days)" field="salary_denominator"
              value={props.salary_denominator ?? 30} min={26} max={31} step={1} locked={locked("standard")} onChange={set} />
            <NumRow label="Daily Working Hours" field="daily_working_hours"
              value={props.daily_working_hours ?? 8.5} min={4} max={12} step={0.5} locked={locked("standard")} onChange={set} />
            <NumRow label="Pay Day (of next month)" field="pay_day"
              value={props.pay_day ?? 1} min={1} max={28} step={1} locked={locked("standard")} onChange={set} />
          </>
        )}

        {/* STANDARD TAB */}
        {tab === "standard" && (
          <>
            <SectionHead title="Standard Payroll Features" locked={locked("standard")} lockNote="Requires Standard" />
            <CheckRow label="Auto-Compute LWP from Attendance Hours" hint="System calculates LWP based on actual hours clocked, not just absence days"
              field="lwp_auto_compute" value={!!props.lwp_auto_compute} locked={locked("standard")} onChange={set} />
            <CheckRow label="Hard Lock Payroll After Pay Day" hint="Record becomes immutable on/after the Pay Day"
              field="payroll_lock_enabled" value={!!props.payroll_lock_enabled} locked={locked("standard")} onChange={set} />
            <CheckRow label="Enable Hour Deficit Tracking" hint="Track hour shortfall vs monthly target and show amber/red warnings"
              field="deficit_tracking" value={!!props.deficit_tracking} locked={locked("standard")} onChange={set} />
              
            {!!props.deficit_tracking && (!locked("standard")) && (
              <div style={{ padding: "12px 18px", borderRadius: 10, background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.15)", marginLeft: 24, display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
                <NumRow label="Half-Day Threshold (hrs)" field="deficit_half_day_hours"
                  value={props.deficit_half_day_hours ?? 4.25} min={1} max={6} step={0.25} locked={locked("standard")} inline onChange={set} />
                <NumRow label="Early Warning (days left)" field="early_warning_days"
                  value={props.early_warning_days ?? 8} min={3} max={15} step={1} locked={locked("standard")} inline onChange={set} />
                <NumRow label="Mandatory Adjust (days left)" field="mandatory_adjust_days"
                  value={props.mandatory_adjust_days ?? 4} min={1} max={10} step={1} locked={locked("standard")} inline onChange={set} />
                <NumRow label="Daily Overtime Cap (hrs)" field="max_overtime_per_day"
                  value={props.max_overtime_per_day ?? 1.0} min={0.5} max={4} step={0.5} locked={locked("standard")} inline onChange={set} />
                <NumRow label="Show Salary Preview from Day" field="payroll_preview_from_day"
                  value={props.payroll_preview_from_day ?? 20} min={10} max={28} step={1} locked={locked("standard")} inline onChange={set} />
              </div>
            )}
          </>
        )}

        {/* ADVANCED TAB */}
        {tab === "advanced" && (
          <>
            <SectionHead title="Advanced Payroll Features" locked={locked("advanced")} lockNote="Requires Advanced" />
            <CheckRow label="Shift-Based Calculation" hint="Multiple shift patterns with different hour targets per employee"
              field="shift_based_calc" value={!!props.shift_based_calc} locked={locked("advanced")} onChange={set} />
            <CheckRow label="Differential Rules Per Employee/Group" hint="Different hour rules for different departments or employee groups"
              field="differential_rules_enabled" value={!!props.differential_rules_enabled} locked={locked("advanced")} onChange={set} />
            <CheckRow label="Weekly Overtime Cap" hint="Sets a maximum total overtime countable per week"
              field="overtime_weekly_cap_enabled" value={props.overtime_weekly_cap !== null && props.overtime_weekly_cap !== undefined} locked={locked("advanced")} 
              onChange={v => set({ overtime_weekly_cap: v.overtime_weekly_cap_enabled ? (props.overtime_weekly_cap ?? 5) : null })} />
            
            {props.overtime_weekly_cap !== null && (!locked("advanced")) && (
              <div style={{ marginLeft: 24, marginBottom: 8 }}>
                <NumRow label="Weekly Overtime Cap (hrs)" field="overtime_weekly_cap"
                  value={props.overtime_weekly_cap ?? 5} min={1} max={20} step={0.5} locked={locked("advanced")} onChange={set} />
              </div>
            )}

            <CheckRow label="ML Lapse Reward Engine" hint="Track unused ML months and auto-credit bonus leave"
              field="ml_lapse_tracking" value={!!props.ml_lapse_tracking} locked={locked("advanced")} onChange={set} />
            
            {!!props.ml_lapse_tracking && (!locked("advanced")) && (
              <div style={{ padding: "12px 18px", borderRadius: 10, background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.15)", marginLeft: 24, display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
                <NumRow label="Lapsed Months per Award" field="ml_lapse_award_threshold"
                  value={props.ml_lapse_award_threshold ?? 4} min={2} max={12} step={1} locked={locked("advanced")} inline onChange={set} />
                <SelectRow label="Award Leave Type" field="ml_lapse_award_type"
                  value={props.ml_lapse_award_type ?? "Comp-Off"}
                  options={["Comp-Off", "Casual Leave", "Earned Leave", ...(props._custom_ml_award_types ?? [])].map(v => ({ value: v, label: v }))}
                  locked={locked("advanced")} onChange={set} />
              </div>
            )}
          </>
        )}

        {/* CUSTOM TAB */}
        {tab === "custom" && (
          <div style={{ padding: "16px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: 20 }}>
            Custom tier unlocks all features in Standard and Advanced natively.
          </div>
        )}
      </div>

      <div style={{ paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: 16 }}>
        <button onClick={onSave} disabled={saving} style={{
          width: "100%", padding: "12px 24px", borderRadius: 10, fontWeight: 700, fontSize: "0.9rem", cursor: "pointer",
          background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", color: "#fff",
          opacity: saving ? 0.7 : 1, transition: "opacity 0.15s",
        }}>
          {saving ? "Saving…" : "💾 Save Payroll Config"}
        </button>
      </div>
    </div>
  );
}
