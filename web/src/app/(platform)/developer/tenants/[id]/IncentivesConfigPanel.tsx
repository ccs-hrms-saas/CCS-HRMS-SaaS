"use client";

import { useState } from "react";
import { Tier, TierTabs, TierActivateBlock, SectionHead, CheckRow, NumRow, SelectRow } from "./ConfigUI";

interface Props {
  props: Record<string, any>;
  onChange: (updated: Record<string, any>) => void;
  onSave: () => void;
  saving: boolean;
}

export default function IncentivesConfigPanel({ props, onChange, onSave, saving }: Props) {
  const activeTier = (props.tier ?? "basic") as Tier;
  const [tab, setTab] = useState<Tier>(activeTier);

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
    if (tab === "basic") { base.max_active_plans=1; base.multi_goal_enabled=false; base.open_ended_value_enabled=false; base.target_cap_enabled=false; base.percentage_payout_enabled=false; base.payout_upper_cap_enabled=false; base.custom_tenure_enabled=false; base.role_scoping_enabled=false; base.department_scoping_enabled=false; base.show_in_payslip=false; base.self_reporting_enabled=false; }
    if (tab === "standard") { base.max_active_plans=5; base.multi_goal_enabled=true; base.open_ended_value_enabled=true; base.target_cap_enabled=true; base.percentage_payout_enabled=true; base.payout_upper_cap_enabled=true; }
    if (tab === "advanced") { base.max_active_plans=null; base.multi_goal_enabled=true; base.open_ended_value_enabled=true; base.target_cap_enabled=true; base.percentage_payout_enabled=true; base.payout_upper_cap_enabled=true; base.custom_tenure_enabled=true; base.role_scoping_enabled=true; base.department_scoping_enabled=true; base.show_in_payslip=true; base.self_reporting_enabled=true; }
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
            <SectionHead title="Plan Capacity" />
            <SelectRow label="Max Active Incentive Plans"
              field="_max_plans_display" value={activeTier === "basic" ? "1" : activeTier === "standard" ? "5" : "Unlimited"}
              options={[{ value: "1", label: "1 Plan (Basic)" }, { value: "5", label: "5 Plans (Standard)" }, { value: "Unlimited", label: "Unlimited (Advanced)" }]}
              locked={true} onChange={() => {}} />

            <NumRow label="Override Max Plans (leave blank = tier default)" field="max_active_plans"
              value={props.max_active_plans} min={1} max={100} locked={false} onChange={set} />
          </>
        )}

        {/* STANDARD TAB */}
        {tab === "standard" && (
          <>
            <SectionHead title="Goal Configuration" locked={locked("standard")} lockNote="Requires Standard" />
            <CheckRow label="Multiple Goals Per Plan" hint="In Basic, a plan can have only 1 goal. Standard+ allows multiple goals/tasks per plan."
              field="multi_goal_enabled" value={!!props.multi_goal_enabled} locked={locked("standard")} onChange={set} />
            <CheckRow label="Open-Ended / Custom Value Goals" hint="Allows goals where the incentive value is not pre-fixed — the recorded amount is entered at time of claim (e.g. services without a rate card)."
              field="open_ended_value_enabled" value={!!props.open_ended_value_enabled} locked={locked("standard")} onChange={set} />
            <CheckRow label="Minimum Target / Achievement Cap" hint="Incentive payout is triggered only after the employee meets a defined minimum threshold (e.g. must sell ₹50k before any incentive applies)."
              field="target_cap_enabled" value={!!props.target_cap_enabled} locked={locked("standard")} onChange={set} />

            <SectionHead title="Payout Structure" locked={locked("standard")} lockNote="Requires Standard" />
            <CheckRow label="Percentage-Based Payout" hint="In Basic, only flat-amount payouts are available. Standard+ enables % of achieved value as payout mode."
              field="percentage_payout_enabled" value={!!props.percentage_payout_enabled} locked={locked("standard")} onChange={set} />
            <CheckRow label="Upper Cap on Payout" hint="Allows setting a maximum ceiling on payout — applies to both flat and % modes (e.g. max ₹10,000 even if % calculation exceeds it)."
              field="payout_upper_cap_enabled" value={!!props.payout_upper_cap_enabled} locked={locked("standard")} onChange={set} />
          </>
        )}

        {/* ADVANCED TAB */}
        {tab === "advanced" && (
          <>
            <SectionHead title="Tenure Options" locked={locked("advanced")} lockNote="Requires Advanced" />
            <CheckRow label="Custom Date Range Tenure" hint="Allows the tenant to define a plan for an arbitrary start–end date window instead of standard calendar periods (Weekly/Monthly/Quarterly/Yearly)."
              field="custom_tenure_enabled" value={!!props.custom_tenure_enabled} locked={locked("advanced")} onChange={set} />

            <SectionHead title="Scoping & Eligibility" locked={locked("advanced")} lockNote="Requires Advanced" />
            <CheckRow label="Scope by Role" hint="Incentive plan can be restricted to specific roles (e.g. Sales Executive only). Basic/Standard plans apply to all employees."
              field="role_scoping_enabled" value={!!props.role_scoping_enabled} locked={locked("advanced")} onChange={set} />
            <CheckRow label="Scope by Department" hint="Incentive plan can be restricted to a specific department or team."
              field="department_scoping_enabled" value={!!props.department_scoping_enabled} locked={locked("advanced")} onChange={set} />

            <SectionHead title="Integration Options" locked={locked("advanced")} lockNote="Requires Advanced" />
            <CheckRow label="Show Approved Incentives in Payslip" hint="Approved incentive amounts appear as a dedicated line item in the employee's monthly payslip."
              field="show_in_payslip" value={!!props.show_in_payslip} locked={locked("advanced")} onChange={set} />
            <CheckRow label="Employee Self-Reporting" hint="Employees can log their own achievement records (subject to admin approval). In Basic/Standard, only admin can create incentive records."
              field="self_reporting_enabled" value={!!props.self_reporting_enabled} locked={locked("advanced")} onChange={set} />
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
          {saving ? "Saving…" : "💾 Save Incentives Config"}
        </button>
      </div>
    </div>
  );
}
