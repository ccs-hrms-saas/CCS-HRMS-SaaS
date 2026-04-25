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

const TIER_META: Record<LeaveTier, { label: string; badge: string; badgeClass: string; desc: string; icon: React.ElementType }> = {
  basic:    { label: "Basic",    badge: "Tier 1", badgeClass: s.tierBadgeBasic,    desc: "2 leave types. Single-level approval. No carry-forward.",                     icon: Leaf },
  standard: { label: "Standard", badge: "Tier 2", badgeClass: s.tierBadgeStandard, desc: "Up to 10 types. Carry-forward, partial-day, CL limits.",                     icon: BookOpen },
  advanced: { label: "Advanced", badge: "Tier 3", badgeClass: s.tierBadgeAdvanced, desc: "Unlimited types. ML, short leave, CO, week-off, payroll link.",              icon: Sparkles },
  custom:   { label: "Custom",   badge: "Custom", badgeClass: s.tierBadgeCustom,   desc: "Hand-pick any features for this tenant individually.",                       icon: Sliders },
};

// Reusable helpers (same as PayrollConfigPanel)
function OtherSelect({ field, value, presets, customKey, props, label, locked, onChange }: {
  field: string; value: string; presets: string[]; customKey: string;
  props: Record<string, any>; label: string; locked: boolean;
  onChange: (u: Record<string, any>) => void;
}) {
  const [showOther, setShowOther] = useState(!presets.includes(value) && value !== "");
  const [otherVal, setOtherVal] = useState(!presets.includes(value) ? value : "");
  const allPresets = [...presets, ...(props[customKey] ?? [])];
  return (
    <div className={s.field}>
      <label className={s.label}>{label}</label>
      <select className={s.select} value={allPresets.includes(value) ? value : "__other__"}
        disabled={locked}
        onChange={e => { if (e.target.value === "__other__") setShowOther(true); else { setShowOther(false); onChange({ [field]: e.target.value }); } }}>
        {allPresets.map(p => <option key={p} value={p}>{p}</option>)}
        <option value="__other__">Other…</option>
      </select>
      {showOther && (
        <div className={s.otherRow}>
          <input className={s.otherInput} placeholder="Define custom value…" value={otherVal} onChange={e => setOtherVal(e.target.value)} />
          <button className={s.addBtn} onClick={() => {
            if (!otherVal.trim()) return;
            const existing = props[customKey] ?? [];
            onChange({ [field]: otherVal, [customKey]: existing.includes(otherVal) ? existing : [...existing, otherVal] });
            setShowOther(false);
          }}>+ Save</button>
        </div>
      )}
    </div>
  );
}

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

function NumField({ label, field, value, locked, min, max, step, onChange }: {
  label: string; field: string; value: number; locked: boolean;
  min?: number; max?: number; step?: number;
  onChange: (u: Record<string, any>) => void;
}) {
  return (
    <div className={s.field}>
      <label className={s.label}>{label}</label>
      <input className={s.input} type="number" value={value ?? ""}
        min={min} max={max} step={step ?? 1} disabled={locked}
        onChange={e => onChange({ [field]: parseInt(e.target.value) || 0 })} />
    </div>
  );
}

export default function LeaveConfigPanel({ props, onChange, onSave, saving }: Props) {
  const tier = (props.tier ?? "basic") as LeaveTier;
  const isStd = tier !== "basic";
  const isAdv = tier === "advanced";
  const isCust = tier === "custom";

  // In Custom mode everything is unlocked
  const locked = (requireStd: boolean, requireAdv: boolean) =>
    isCust ? false : requireAdv ? !isAdv : requireStd ? !isStd : false;

  const set = (partial: Record<string, any>) => onChange({ ...props, ...partial });

  // Custom leave label adder
  const [newLabel, setNewLabel] = useState("");

  // Custom extensions
  const [customKey, setCustomKey] = useState("");
  const [customVal, setCustomVal] = useState("");

  return (
    <div className={s.panelLayout}>
      {/* ── LEFT: Tier Selector ─────────────────────────────────── */}
      <div className={s.tierColumn}>
        <div className={s.tierColumnLabel}>Plan Tier</div>
        <div className={s.tierGrid}>
          {(["basic", "standard", "advanced", "custom"] as LeaveTier[]).map(t => {
            const m = TIER_META[t];
            const Icon = m.icon;
            return (
              <div key={t} className={`${s.tierCard} ${tier === t ? s.active : ""}`}
                onClick={() => {
                  const base: Record<string, any> = { ...props, tier: t };
                  if (t === "basic")    { base.max_leave_types = 2;   base.approval_chain_depth = 1; }
                  if (t === "standard") { base.max_leave_types = 10;  base.approval_chain_depth = Math.max(props.approval_chain_depth ?? 1, 1); }
                  if (t === "advanced") { base.max_leave_types = 999; }
                  // custom: keep existing values, just unlock everything
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
            🎛️ Custom — all features individually togglable. No tier restrictions.
          </div>
        )}
      </div>

      {/* ── RIGHT: Features ─────────────────────────────────────── */}
      <div className={s.featuresColumn}>

      {/* ── Core Settings ─────────────────────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHead}><span className={s.sectionTitle}>⚙️ Core Settings</span></div>
        <div className={s.fieldGrid}>
          <div className={s.field}>
            <label className={s.label}>Max Leave Types</label>
            <input className={s.input} type="number" disabled
              value={tier === "basic" ? 2 : tier === "standard" ? 10 : "Unlimited (999)"}
              readOnly />
          </div>

          <div className={s.field}>
            <label className={s.label}>Who Can Configure</label>
            <select className={s.select} value={props.who_can_configure ?? "superadmin_only"}
              disabled={!isAdv}
              onChange={e => set({ who_can_configure: e.target.value })}>
              <option value="superadmin_only">Superadmin Only</option>
              <option value="superadmin_or_admin">Superadmin or Admin</option>
            </select>
            {!isAdv && <div className={s.toggleHint}>Shared config requires Advanced tier</div>}
          </div>

          <div className={s.field}>
            <label className={s.label}>Approval Chain Depth</label>
            <select className={s.select}
              value={props.approval_chain_depth ?? 1}
              disabled={!isStd}
              onChange={e => set({ approval_chain_depth: parseInt(e.target.value) })}>
              <option value={1}>1 Level</option>
              {isStd && <option value={2}>2 Levels</option>}
              {isAdv && <option value={3}>3 Levels</option>}
            </select>
          </div>
        </div>

        {/* Custom leave labels management */}
        <div style={{ marginTop: 14 }}>
          <div className={s.label}>Custom Leave Type Labels (presets for tenant)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, margin: "8px 0" }}>
            {(props.custom_leave_labels ?? []).map((lbl: string) => (
              <span key={lbl} className={s.customTag}>
                {lbl}
                <button className={s.customTagRemove}
                  onClick={() => set({ custom_leave_labels: (props.custom_leave_labels ?? []).filter((x: string) => x !== lbl) })}>✕</button>
              </span>
            ))}
          </div>
          <div className={s.otherRow}>
            <input className={s.otherInput} placeholder="e.g. Festival Leave, Paternity Leave…"
              value={newLabel} onChange={e => setNewLabel(e.target.value)} />
            <button className={s.addBtn} onClick={() => {
              if (!newLabel.trim()) return;
              const existing = props.custom_leave_labels ?? [];
              if (!existing.includes(newLabel)) set({ custom_leave_labels: [...existing, newLabel] });
              setNewLabel("");
            }}>+ Add</button>
          </div>
        </div>
      </div>

      {/* ── Standard Features ─────────────────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.sectionTitle}>📋 Standard Features</span>
          {!isStd && <span className={s.lockedBadge}>🔒 Requires Standard+</span>}
        </div>
        <div className={s.fieldGrid1}>
          <Toggle label="Allow Carry-Forward" locked={locked(true, false)}
            hint="Unused leave balance rolls over to next period (configurable % per leave type)"
            field="allow_carryforward" value={!!props.allow_carryforward} onChange={set} />

          <Toggle label="Allow Half-Day Leave" locked={locked(true, false)}
            hint="Employees can apply for half-day leave for applicable leave types"
            field="half_day_allowed" value={!!props.half_day_allowed} onChange={set} />

          <Toggle label="Allow Short Leave (partial hour)" locked={locked(true, false)}
            hint="e.g. employee leaves 2h early — counts as a short leave unit"
            field="short_leave_allowed" value={!!props.short_leave_allowed} onChange={set} />

          {(!!props.half_day_allowed || !!props.short_leave_allowed) && (isStd || isCust) && (
            <div className={s.subField}>
              <Toggle label="Let SuperAdmin configure the half-day / short-leave ratios per leave type"
                locked={locked(true, false)}
                hint="If OFF, the default ratios below apply to all leave types"
                field="superadmin_can_configure_partial_day"
                value={props.superadmin_can_configure_partial_day !== false}
                onChange={set} />
              {(props.superadmin_can_configure_partial_day === false) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                  <NumField label="Default half-days per full leave" field="default_half_days_per_leave"
                    value={props.default_half_days_per_leave ?? 2} min={1} max={8} step={1}
                    locked={locked(true, false)} onChange={set} />
                  <NumField label="Default short leaves per full leave" field="default_short_leaves_per_leave"
                    value={props.default_short_leaves_per_leave ?? 4} min={1} max={12} step={1}
                    locked={locked(true, false)} onChange={set} />
                </div>
              )}
            </div>
          )}

          <Toggle label="CL Consecutive Day Limit" locked={locked(true, false)}
            hint="Restrict maximum consecutive days in a single Casual Leave application"
            field="cl_consecutive_limit_enabled" value={!!props.cl_consecutive_limit_enabled} onChange={set} />

          {!!props.cl_consecutive_limit_enabled && (isStd || isCust) && (
            <div className={s.subField}>
              <NumField label="Default Max Consecutive Days (CL)" field="cl_default_max_consecutive_days"
                value={props.cl_default_max_consecutive_days ?? 2} min={1} max={10} step={1}
                locked={locked(true, false)} onChange={set} />
            </div>
          )}
        </div>
      </div>

      {/* ── Advanced Features ─────────────────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.sectionTitle}>🚀 Advanced Features</span>
          {!isAdv && <span className={s.lockedBadge}>🔒 Requires Advanced</span>}
        </div>
        <div className={s.fieldGrid1}>
          <Toggle label="Menstruation Leave (ML) Type" locked={locked(false, true)}
            hint="ML lapse tracking: if N months unused → 1 CL awarded next month. No hour deductions."
            field="ml_leave_enabled" value={!!props.ml_leave_enabled} onChange={set} />

          {!!props.ml_leave_enabled && (isAdv || isCust) && (
            <div className={s.subField}>
              <div className={s.fieldGrid}>
                <NumField label="Lapsed Months per Bonus" field="ml_lapse_award_threshold"
                  value={props.ml_lapse_award_threshold ?? 4} min={2} max={12} step={1}
                  locked={locked(false, true)} onChange={set} />
                <OtherSelect field="ml_lapse_award_type"
                  value={props.ml_lapse_award_type ?? "Comp-Off"}
                  presets={["Comp-Off", "Casual Leave", "Earned Leave"]}
                  customKey="_custom_ml_award_types" props={props}
                  label="Bonus Leave Type" locked={locked(false, true)} onChange={set} />
              </div>
            </div>
          )}

          <Toggle label="Short Leave (N-Hour Leave)" locked={locked(false, true)}
            hint="Employees can apply for a short leave of fewer hours (e.g. 2hr short leave)"
            field="short_leave_enabled" value={!!props.short_leave_enabled} onChange={set} />

          {!!props.short_leave_enabled && (isAdv || isCust) && (
            <div className={s.subField}>
              <NumField label="Default Short Leave Duration (hrs)" field="short_leave_default_hours"
                value={props.short_leave_default_hours ?? 2} min={1} max={4} step={0.5}
                locked={locked(false, true)} onChange={set} />
            </div>
          )}

          <Toggle label="Comp-Off (Compensatory Off)" locked={locked(false, true)}
            hint="Employees who work on holidays or extra days earn comp-off credits"
            field="compoff_enabled" value={!!props.compoff_enabled} onChange={set} />

          <Toggle label="Week-Off Customisation" locked={locked(false, true)}
            hint="Set different weekly off days per employee or department group"
            field="week_off_customization" value={!!props.week_off_customization} onChange={set} />

          <Toggle label="Link LWP to Payroll Deduction" locked={locked(false, true)}
            hint="Requires Payroll module Standard+. LWP leave types directly reduce salary."
            field="lwp_payroll_link" value={!!props.lwp_payroll_link} onChange={set} />

          <Toggle label="Deficit Adjustment Pool" locked={locked(false, true)}
            hint="Requires Payroll Advanced. Employees can surrender eligible leave days to cover hour deficit."
            field="deficit_adjustment_enabled" value={!!props.deficit_adjustment_enabled} onChange={set} />

          <Toggle label="Allow Informal (No-Ledger) Leave Types" locked={false}
            hint="Tenant can create leave types with no balance tracking — employee applies anytime."
            field="allow_no_ledger_leaves" value={props.allow_no_ledger_leaves !== false} onChange={set} />
        </div>
      </div>

      {/* ── Work Schedule Capabilities ─────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.sectionTitle}>🕐 Work Schedule Capabilities</span>
        </div>
        <div className={s.fieldGrid1}>
          <Toggle label="Org-Wide Working Hours — Anytime Change" locked={locked(true, false)}
            hint="Tier 1 (Basic): org sets hours once in onboarding wizard — locked for 90 days. Tier 2+: freely editable anytime from Leave Settings."
            field="org_hours_configurable" value={!!props.org_hours_configurable} onChange={set} />

          <Toggle label="Per-Employee Working Hours Override (Shift Mode)" locked={locked(false, true)}
            hint="Advanced only. Shift-based orgs can set different daily hours per employee (e.g. 6h for part-time, 12h for night shift). Overrides the org default."
            field="per_employee_hours" value={!!props.per_employee_hours} onChange={set} />

          <Toggle label="Per-Employee Shift Timing — Prescribed In/Out per Employee" locked={locked(false, true)}
            hint="Advanced only. Each employee has their own prescribed check-in time and check-out deadline."
            field="per_employee_shift" value={!!props.per_employee_shift} onChange={set} />

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
          {saving ? "Saving…" : "💾 Save Leave Config"}
        </button>
      </div>
    </div>
    </div>
  );
}
