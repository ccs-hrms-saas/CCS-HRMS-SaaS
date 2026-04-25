"use client";

import { useState } from "react";
import { Tier, TierTabs, TierActivateBlock, SectionHead, CheckRow, SelectRow } from "./ConfigUI";

interface Props {
  props: Record<string, any>;
  onChange: (updated: Record<string, any>) => void;
  onSave: () => void;
  saving: boolean;
}

export default function ProfilesConfigPanel({ props, onChange, onSave, saving }: Props) {
  const activeTier = (props.tier ?? "basic") as Tier;
  const [tab, setTab] = useState<Tier>(activeTier);
  const [newJobRole, setNewJobRole] = useState("");

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
    if (tab === "basic") { base.who_can_create_profiles = "superadmin"; base.who_can_edit_profiles = "superadmin"; base.admin_can_create = false; base.admin_can_edit = false; }
    if (tab === "standard") { base.admin_can_create = true; base.admin_can_edit = true; }
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
            <SectionHead title="Core Access Settings" />
            <SelectRow label="Who Can Create Profiles"
              field="who_can_create_profiles" value={props.who_can_create_profiles ?? "superadmin"}
              options={[{ value: "superadmin", label: "Superadmin Only" }, { value: "superadmin_admin", label: "Superadmin + Admin" }, { value: "any_assigned", label: "Any Assigned Role (Advanced)" }]}
              locked={locked("advanced")} onChange={set} />
            <SelectRow label="Who Can Edit Profiles"
              field="who_can_edit_profiles" value={props.who_can_edit_profiles ?? "superadmin"}
              options={[{ value: "superadmin", label: "Superadmin Only" }, { value: "superadmin_admin", label: "Superadmin + Admin" }, { value: "any_assigned", label: "Any Assigned Role (Advanced)" }]}
              locked={locked("advanced")} onChange={set} />
            
            <CheckRow label="Manager Can View Team" hint="Managers can see profiles of employees directly under them"
              field="manager_can_view_team" value={!!props.manager_can_view_team} locked={false} onChange={set} />
          </>
        )}

        {/* STANDARD TAB */}
        {tab === "standard" && (
          <>
            <SectionHead title="Standard Features" locked={locked("standard")} lockNote="Requires Standard" />
            <CheckRow label="Admin Can Create Profiles" hint="Basic: only SuperAdmin creates. Standard+ allows Admin."
              field="admin_can_create" value={!!props.admin_can_create} locked={locked("standard")} onChange={set} />
            <CheckRow label="Admin Can Edit Profiles" hint="Standard+ allows admins to edit employee details"
              field="admin_can_edit" value={!!props.admin_can_edit} locked={locked("standard")} onChange={set} />
            <CheckRow label="Salary Change Requires Approval" hint="Any salary modification goes through a superadmin approval workflow"
              field="salary_change_requires_approval" value={!!props.salary_change_requires_approval} locked={locked("standard")} onChange={set} />
          </>
        )}

        {/* ADVANCED TAB */}
        {tab === "advanced" && (
          <>
            <SectionHead title="Advanced Features" locked={locked("advanced")} lockNote="Requires Advanced" />
            <CheckRow label="Custom Job Roles" hint="Enable job_role field on employee profiles. Used in Advanced reimbursement approval chains."
              field="custom_job_roles_enabled" value={!!props.custom_job_roles_enabled} locked={locked("advanced")} onChange={set} />
            
            {!!props.custom_job_roles_enabled && (!locked("advanced")) && (
              <div style={{ padding: "12px 18px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", marginLeft: 24, marginBottom: 12 }}>
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 8 }}>Defined Job Roles</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {(props.job_roles_list ?? []).map((r: string) => (
                    <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", fontSize: "0.78rem", color: "#818cf8" }}>
                      {r}
                      <button onClick={() => set({ job_roles_list: (props.job_roles_list ?? []).filter((x: string) => x !== r) })}
                        style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "0.75rem", lineHeight: 1, padding: 0 }}>✕</button>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input placeholder="e.g. Department Head, HR Executive, Team Lead…" value={newJobRole} onChange={e => setNewJobRole(e.target.value)}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "var(--text-primary)", fontSize: "0.82rem" }} />
                  <button onClick={() => { if (!newJobRole.trim()) return; const ex = props.job_roles_list ?? []; if (!ex.includes(newJobRole)) set({ job_roles_list: [...ex, newJobRole] }); setNewJobRole(""); }}
                    style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)", color: "#818cf8", cursor: "pointer", fontSize: "0.82rem", fontWeight: 700 }}>+ Add</button>
                </div>
              </div>
            )}

            <CheckRow label="Designation Change Requires Approval" hint="Changing an employee's designation triggers a formal sign-off workflow"
              field="designation_change_approval" value={!!props.designation_change_approval} locked={locked("advanced")} onChange={set} />
            <CheckRow label="Granular Field-Level Permissions" hint="Control which roles can edit specific fields (salary, department, etc.) per profile"
              field="granular_field_permissions" value={!!props.granular_field_permissions} locked={locked("advanced")} onChange={set} />
            <CheckRow label="Team-Scoped Manager Edit" hint="Manager can edit profile details only for employees directly reporting to them"
              field="team_scoped_manager_edit" value={!!props.team_scoped_manager_edit} locked={locked("advanced")} onChange={set} />
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
          {saving ? "Saving…" : "💾 Save Profiles Config"}
        </button>
      </div>
    </div>
  );
}
