"use client";

import { useState } from "react";
import { Tier, TierTabs, TierActivateBlock, SectionHead, CheckRow, NumRow, SelectRow } from "./ConfigUI";

interface Props {
  props: Record<string, any>;
  onChange: (updated: Record<string, any>) => void;
  onSave: () => void;
  saving: boolean;
}

export default function ReimbConfigPanel({ props, onChange, onSave, saving }: Props) {
  const activeTier = (props.tier ?? "basic") as Tier;
  const [tab, setTab] = useState<Tier>(activeTier);
  const [newPreset, setNewPreset] = useState("");

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
    if (tab === "basic")    { base.max_categories = 3;   base.max_claims_per_month = 1;    base.receipt_retention_days = 90;  base.admin_can_approve = false; base.max_approval_chain_depth = 1; }
    if (tab === "standard") { base.max_categories = 7;   base.max_claims_per_month = 3;    base.receipt_retention_days = 180; base.admin_can_approve = true;  base.max_approval_chain_depth = 2; }
    if (tab === "advanced") { base.max_categories = 999; base.max_claims_per_month = null; base.receipt_retention_days = null; }
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
            <SectionHead title="Capacity & Limits" />
            <SelectRow label="Max Expense Categories"
              field="_max_categories_display" value={activeTier === "basic" ? "3" : activeTier === "standard" ? "7" : "Unlimited"}
              options={[{ value: "3", label: "3 categories (Basic)" }, { value: "7", label: "7 categories (Standard)" }, { value: "Unlimited", label: "Unlimited (Advanced)" }]}
              locked={true} onChange={() => {}} />

            <NumRow label="Max Claims Per Employee / Month" field="max_claims_per_month"
              value={props.max_claims_per_month ?? 1} min={1} max={20} locked={locked("advanced")} onChange={set} />
            <NumRow label="Receipt Retention (days)" field="receipt_retention_days"
              value={props.receipt_retention_days ?? 90} min={30} max={3650} locked={locked("advanced")} onChange={set} />
            <SelectRow label="Max Approval Chain Depth" field="max_approval_chain_depth"
              value={String(props.max_approval_chain_depth ?? 1)}
              options={[{ value: "1", label: "1 Level (SA only)" }, { value: "2", label: "2 Levels (Standard+)" }, { value: "3", label: "3 Levels (Advanced)" }]}
              locked={locked("standard")} onChange={v => set({ max_approval_chain_depth: parseInt(v.max_approval_chain_depth) })} />

            <SectionHead title="Category Presets for Tenant" />
            <div style={{ padding: "12px 18px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {(props.custom_category_presets ?? []).map((p: string) => (
                  <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", fontSize: "0.78rem", color: "#818cf8" }}>
                    {p}
                    <button onClick={() => set({ custom_category_presets: (props.custom_category_presets ?? []).filter((x: string) => x !== p) })}
                      style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "0.75rem", lineHeight: 1, padding: 0 }}>✕</button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input placeholder="e.g. Travel, Medical, Internet Bill, Site Visit…" value={newPreset} onChange={e => setNewPreset(e.target.value)}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "var(--text-primary)", fontSize: "0.82rem" }} />
                <button onClick={() => { if (!newPreset.trim()) return; const ex = props.custom_category_presets ?? []; if (!ex.includes(newPreset)) set({ custom_category_presets: [...ex, newPreset] }); setNewPreset(""); }}
                  style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)", color: "#818cf8", cursor: "pointer", fontSize: "0.82rem", fontWeight: 700 }}>+ Add</button>
              </div>
            </div>
          </>
        )}

        {/* STANDARD TAB */}
        {tab === "standard" && (
          <>
            <SectionHead title="Standard Approval Settings" locked={locked("standard")} lockNote="Requires Standard" />
            <CheckRow label="Admin Can Approve" hint="Basic: only SuperAdmin approves. Standard+ allows Admin."
              field="admin_can_approve" value={!!props.admin_can_approve} locked={locked("standard")} onChange={set} />
            <CheckRow label="Optional Receipt Per Category" hint="Basic/Standard: receipt always required. Advanced: per-category setting."
              field="allow_optional_receipt" value={!!props.allow_optional_receipt} locked={locked("advanced")} onChange={set} />
            <CheckRow label="Partial Approval (Approve Partial Amount)" hint="Approver can approve a lesser amount than what was claimed"
              field="partial_approval_enabled" value={!!props.partial_approval_enabled} locked={locked("advanced")} onChange={set} />
          </>
        )}

        {/* ADVANCED TAB */}
        {tab === "advanced" && (
          <>
            <SectionHead title="Multi-Hierarchy Options" locked={locked("advanced")} lockNote="Requires Advanced" />
            <CheckRow label="Job-Role Based Approver" hint="Approver assigned by custom job role set on employee profile"
              field="job_role_approver_enabled" value={!!props.job_role_approver_enabled} locked={locked("advanced")} onChange={set} />
            <CheckRow label="Department-Based Approver" hint="Each department has its own designated approver for reimbursements"
              field="department_approver_enabled" value={!!props.department_approver_enabled} locked={locked("advanced")} onChange={set} />
            <CheckRow label="Specific Person as Approver" hint="Any specific employee can be assigned as approver for a category/stage"
              field="person_approver_enabled" value={!!props.person_approver_enabled} locked={locked("advanced")} onChange={set} />

            <SectionHead title="Payroll Integration" locked={locked("advanced")} lockNote="Requires Advanced" />
            <CheckRow label="Bulk Submission" hint="Employee can submit multiple expense claims in a single batch"
              field="bulk_submission_enabled" value={!!props.bulk_submission_enabled} locked={locked("advanced")} onChange={set} />
            <CheckRow label="Show in Payslip Summary" hint="Approved reimbursements appear as a line item in the monthly payslip"
              field="show_in_payslip" value={!!props.show_in_payslip} locked={locked("advanced")} onChange={set} />
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
          {saving ? "Saving…" : "💾 Save Reimbursements Config"}
        </button>
      </div>
    </div>
  );
}
