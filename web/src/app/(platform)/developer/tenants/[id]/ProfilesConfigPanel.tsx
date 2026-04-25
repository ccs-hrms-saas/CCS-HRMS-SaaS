"use client";

import { useState } from "react";
import { UserCheck, ShieldCheck, Crown, Sliders } from "lucide-react";
import s from "./config-panel.module.css";

interface Props {
  props: Record<string, any>;
  onChange: (updated: Record<string, any>) => void;
  onSave: () => void;
  saving: boolean;
}

type ProfilesTier = "basic" | "standard" | "advanced" | "custom";

const TIER_META: Record<ProfilesTier, { label: string; badge: string; badgeClass: string; desc: string; icon: React.ElementType }> = {
  basic:    { label: "Basic",    badge: "Tier 1", badgeClass: s.tierBadgeBasic,    desc: "Only SuperAdmin creates/edits. Manager and Admin read-only.",            icon: UserCheck },
  standard: { label: "Standard", badge: "Tier 2", badgeClass: s.tierBadgeStandard, desc: "SuperAdmin + Admin manage profiles. Manager views team but not edit.",   icon: ShieldCheck },
  advanced: { label: "Advanced", badge: "Tier 3", badgeClass: s.tierBadgeAdvanced, desc: "Custom job roles. Granular field permissions. Salary change approval.",   icon: Crown },
  custom:   { label: "Custom",   badge: "Custom", badgeClass: s.tierBadgeCustom,   desc: "Hand-pick any profile management features individually.",               icon: Sliders },
};

function Toggle({ label, hint, field, value, locked, onChange }: {
  label: string; hint?: string; field: string; value: boolean; locked: boolean;
  onChange: (u: Record<string, any>) => void;
}) {
  return (
    <div className={`${s.toggleRow} ${locked ? s.locked : ""}`} title={locked ? "Upgrade tier to unlock" : undefined}>
      <div>
        <div className={s.toggleLabel}>{label}</div>
        {hint && <div className={s.toggleHint}>{hint}</div>}
      </div>
      <label className={s.switch}>
        <input type="checkbox" checked={value} disabled={locked}
          onChange={e => onChange({ [field]: e.target.checked })} />
        <span className={s.switchSlider} />
      </label>
    </div>
  );
}

export default function ProfilesConfigPanel({ props, onChange, onSave, saving }: Props) {
  const tier = (props.tier ?? "basic") as ProfilesTier;
  const isStd = tier !== "basic";
  const isAdv = tier === "advanced";
  const isCust = tier === "custom";
  const locked = (rs: boolean, ra: boolean) => isCust ? false : ra ? !isAdv : rs ? !isStd : false;
  const set = (partial: Record<string, any>) => onChange({ ...props, ...partial });
  const [newJobRole, setNewJobRole] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [customVal, setCustomVal] = useState("");

  return (
    <div className={s.panelLayout}>
      <div className={s.tierColumn}>
        <div className={s.tierColumnLabel}>Plan Tier</div>
        <div className={s.tierGrid}>
          {(["basic", "standard", "advanced", "custom"] as ProfilesTier[]).map(t => {
            const m = TIER_META[t]; const Icon = m.icon;
            return (
              <div key={t} className={`${s.tierCard} ${tier === t ? s.active : ""}`}
                onClick={() => {
                  const base: Record<string, any> = { ...props, tier: t };
                  if (t === "basic") { base.who_can_create_profiles = "superadmin"; base.who_can_edit_profiles = "superadmin"; base.admin_can_create = false; base.admin_can_edit = false; }
                  if (t === "standard") { base.admin_can_create = true; base.admin_can_edit = true; }
                  onChange(base);
                }}>
                <div><span className={`${s.tierBadge} ${m.badgeClass}`}>{m.badge}</span></div>
                <Icon size={16} color={tier === t ? "#6366f1" : "#475569"} />
                <div className={s.tierName}>{m.label}</div>
                <div className={s.tierDesc}>{m.desc}</div>
              </div>
            );
          })}
        </div>
        {isCust && (
          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.2)", fontSize: "0.72rem", color: "#fb923c", lineHeight: 1.5 }}>
            🎛️ Custom — all features individually togglable.
          </div>
        )}
      </div>
      <div className={s.featuresColumn}>

      {/* ── Core Access Settings ──────────────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHead}><span className={s.sectionTitle}>🔐 Profile Access Control</span></div>
        <div className={s.fieldGrid}>
          <div className={s.field}>
            <label className={s.label}>Who Can Create Profiles</label>
            <select className={s.select}
              value={props.who_can_create_profiles ?? "superadmin"}
              disabled={!isAdv}
              onChange={e => set({ who_can_create_profiles: e.target.value })}>
              <option value="superadmin">Superadmin Only</option>
              <option value="superadmin_admin">Superadmin + Admin</option>
              {isAdv && <option value="any_assigned">Any Assigned Role</option>}
            </select>
          </div>

          <div className={s.field}>
            <label className={s.label}>Who Can Edit Profiles</label>
            <select className={s.select}
              value={props.who_can_edit_profiles ?? "superadmin"}
              disabled={!isAdv}
              onChange={e => set({ who_can_edit_profiles: e.target.value })}>
              <option value="superadmin">Superadmin Only</option>
              <option value="superadmin_admin">Superadmin + Admin</option>
              {isAdv && <option value="any_assigned">Any Assigned Role</option>}
            </select>
          </div>
        </div>

        <div className={s.fieldGrid1} style={{ marginTop: 12 }}>
          <Toggle label="Manager Can View Team" locked={false}
            hint="Managers can see profiles of employees directly under them"
            field="manager_can_view_team" value={!!props.manager_can_view_team} onChange={set} />

          <Toggle label="Admin Can Create Profiles" locked={locked(true,false)}
            hint="Basic: only SuperAdmin creates. Standard+ allows Admin."
            field="admin_can_create" value={!!props.admin_can_create} onChange={set} />
          <Toggle label="Admin Can Edit Profiles" locked={locked(true,false)}
            hint="Standard+ allows admins to edit employee details"
            field="admin_can_edit" value={!!props.admin_can_edit} onChange={set} />
        </div>
      </div>

      {/* ── Standard Features ─────────────────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.sectionTitle}>📋 Standard Features</span>
          {!isStd && <span className={s.lockedBadge}>🔒 Requires Standard+</span>}
        </div>
        <div className={s.fieldGrid1}>
          <Toggle label="Salary Change Requires Approval" locked={!isStd}
            hint="Any salary modification goes through a superadmin approval workflow"
            field="salary_change_requires_approval" value={!!props.salary_change_requires_approval} onChange={set} />
        </div>
      </div>

      {/* ── Advanced Features ─────────────────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.sectionTitle}>🚀 Advanced Features</span>
          {!isAdv && <span className={s.lockedBadge}>🔒 Requires Advanced</span>}
        </div>
        <div className={s.fieldGrid1}>
          <Toggle label="Custom Job Roles" locked={!isAdv}
            hint="Enable job_role field on employee profiles. Used in Advanced reimbursement approval chains."
            field="custom_job_roles_enabled" value={!!props.custom_job_roles_enabled} onChange={set} />

          {!!props.custom_job_roles_enabled && (isAdv || isCust) && (
            <div className={s.subField}>
              <label className={s.label}>Defined Job Roles</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, margin: "8px 0" }}>
                {(props.job_roles_list ?? []).map((r: string) => (
                  <span key={r} className={s.customTag}>
                    {r}
                    <button className={s.customTagRemove}
                      onClick={() => set({ job_roles_list: (props.job_roles_list ?? []).filter((x: string) => x !== r) })}>✕</button>
                  </span>
                ))}
              </div>
              <div className={s.otherRow}>
                <input className={s.otherInput} placeholder="e.g. Department Head, HR Executive, Team Lead…"
                  value={newJobRole} onChange={e => setNewJobRole(e.target.value)} />
                <button className={s.addBtn} onClick={() => {
                  if (!newJobRole.trim()) return;
                  const existing = props.job_roles_list ?? [];
                  if (!existing.includes(newJobRole)) set({ job_roles_list: [...existing, newJobRole] });
                  setNewJobRole("");
                }}>+ Add</button>
              </div>
            </div>
          )}

          <Toggle label="Designation Change Requires Approval" locked={!isAdv}
            hint="Changing an employee's designation triggers a formal sign-off workflow"
            field="designation_change_approval" value={!!props.designation_change_approval} onChange={set} />

          <Toggle label="Granular Field-Level Permissions" locked={!isAdv}
            hint="Control which roles can edit specific fields (salary, department, etc.) per profile"
            field="granular_field_permissions" value={!!props.granular_field_permissions} onChange={set} />

          <Toggle label="Team-Scoped Manager Edit" locked={!isAdv}
            hint="Manager can edit profile details only for employees directly reporting to them"
            field="team_scoped_manager_edit" value={!!props.team_scoped_manager_edit} onChange={set} />
        </div>
      </div>

      {/* ── Custom Extensions ─────────────────────────────────────────── */}
      <div className={s.customSection}>
        <div className={s.customTitle}>⚡ Custom Properties</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
          {Object.entries(props._custom ?? {}).map(([k, v]) => (
            <span key={k} className={s.customTag}>
              {k}: {String(v)}
              <button className={s.customTagRemove}
                onClick={() => { const c = { ...props._custom }; delete c[k]; set({ _custom: c }); }}>✕</button>
            </span>
          ))}
        </div>
        <div className={s.customGrid}>
          <input className={s.input} placeholder="property_key" value={customKey} onChange={e => setCustomKey(e.target.value)} />
          <input className={s.input} placeholder="value" value={customVal} onChange={e => setCustomVal(e.target.value)} />
          <button className={s.addBtn} onClick={() => {
            if (!customKey.trim()) return;
            set({ _custom: { ...props._custom, [customKey]: customVal } });
            setCustomKey(""); setCustomVal("");
          }}>+ Add</button>
        </div>
      </div>

      <div className={s.actionsRow}>
        <button className={s.saveBtn} onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "💾 Save Profiles Config"}
        </button>
      </div>
    </div>
    </div>
  );
}
