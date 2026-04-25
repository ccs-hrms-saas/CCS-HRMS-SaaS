"use client";

import { useState } from "react";
import { Zap, BarChart3, BrainCircuit, Sliders } from "lucide-react";
import s from "./config-panel.module.css";

// ── Types ──────────────────────────────────────────────────────────────────
interface Props {
  props: Record<string, any>;
  onChange: (updated: Record<string, any>) => void;
  onSave: () => void;
  saving: boolean;
}

type PayrollTier = "basic" | "standard" | "advanced" | "custom";

const TIER_META: Record<PayrollTier, { label: string; badge: string; badgeClass: string; desc: string; icon: React.ElementType }> = {
  basic:    { label: "Basic",    badge: "Tier 1", badgeClass: s.tierBadgeBasic,    desc: "Fixed-day calc. Leaves + holidays reduce LWP.", icon: Zap },
  standard: { label: "Standard", badge: "Tier 2", badgeClass: s.tierBadgeStandard, desc: "Hours-based, deficit tracking, pay-day lock.",    icon: BarChart3 },
  advanced: { label: "Advanced", badge: "Tier 3", badgeClass: s.tierBadgeAdvanced, desc: "Shift-based, group rules, ML lapse engine.",      icon: BrainCircuit },
  custom:   { label: "Custom",   badge: "Custom", badgeClass: s.tierBadgeCustom,   desc: "Hand-pick any payroll features individually.",    icon: Sliders },
};

// ── "Other" select with custom option support ─────────────────────────────
function OtherSelect({
  field, value, presets, customKey, props, label, locked, onChange,
}: {
  field: string; value: string; presets: string[];
  customKey: string; props: Record<string, any>;
  label: string; locked: boolean;
  onChange: (updated: Record<string, any>) => void;
}) {
  const [showOther, setShowOther] = useState(value === "__other__" || (!presets.includes(value) && value !== ""));
  const [otherVal, setOtherVal] = useState(!presets.includes(value) ? value : "");
  const allPresets = [...presets, ...(props[customKey] ?? [])];

  return (
    <div className={s.field}>
      <label className={s.label}>{label}</label>
      <select
        className={s.select}
        value={allPresets.includes(value) ? value : "__other__"}
        disabled={locked}
        onChange={e => {
          if (e.target.value === "__other__") { setShowOther(true); }
          else { setShowOther(false); onChange({ [field]: e.target.value }); }
        }}
      >
        {allPresets.map(p => <option key={p} value={p}>{p}</option>)}
        <option value="__other__">Other…</option>
      </select>
      {showOther && (
        <div className={s.otherRow}>
          <input
            className={s.otherInput}
            placeholder="Define custom value…"
            value={otherVal}
            onChange={e => setOtherVal(e.target.value)}
          />
          <button
            className={s.addBtn}
            onClick={() => {
              if (!otherVal.trim()) return;
              const existing = props[customKey] ?? [];
              const updated = existing.includes(otherVal) ? existing : [...existing, otherVal];
              onChange({ [field]: otherVal, [customKey]: updated });
              setShowOther(false);
            }}
          >
            + Save
          </button>
        </div>
      )}
    </div>
  );
}

// ── Toggle row ────────────────────────────────────────────────────────────
function Toggle({ label, hint, field, value, locked, onChange }: {
  label: string; hint?: string; field: string; value: boolean; locked: boolean;
  onChange: (updated: Record<string, any>) => void;
}) {
  return (
    <div className={`${s.toggleRow} ${locked ? s.locked : ""}`}
      title={locked ? "Upgrade tier to unlock" : undefined}>
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

// ── Number field ──────────────────────────────────────────────────────────
function NumField({ label, field, value, locked, min, max, step, onChange }: {
  label: string; field: string; value: number; locked: boolean;
  min?: number; max?: number; step?: number;
  onChange: (updated: Record<string, any>) => void;
}) {
  return (
    <div className={s.field}>
      <label className={s.label}>{label}</label>
      <input
        className={s.input}
        type="number"
        value={value ?? ""}
        min={min} max={max} step={step ?? 0.5}
        disabled={locked}
        onChange={e => onChange({ [field]: parseFloat(e.target.value) || 0 })}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function PayrollConfigPanel({ props, onChange, onSave, saving }: Props) {
  const tier = (props.tier ?? "basic") as PayrollTier;
  const isStd = tier !== "basic";
  const isAdv = tier === "advanced";
  const isCust = tier === "custom";
  const locked = (rs: boolean, ra: boolean) => isCust ? false : ra ? !isAdv : rs ? !isStd : false;
  const set = (partial: Record<string, any>) => onChange({ ...props, ...partial });
  const [customKey, setCustomKey] = useState("");
  const [customVal, setCustomVal] = useState("");

  return (
    <div className={s.panelLayout}>
      <div className={s.tierColumn}>
        <div className={s.tierColumnLabel}>Plan Tier</div>
        <div className={s.tierGrid}>
          {(["basic", "standard", "advanced", "custom"] as PayrollTier[]).map(t => {
            const m = TIER_META[t]; const Icon = m.icon;
            return (
              <div key={t} className={`${s.tierCard} ${tier === t ? s.active : ""}`}
                onClick={() => {
                  const base: Record<string, any> = { ...props, tier: t };
                  if (t === "standard") { base.deficit_tracking = base.deficit_tracking ?? false; }
                  if (t === "advanced") { base.shift_based_calc = base.shift_based_calc ?? false; }
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

      {/* ── Core Settings ─────────────────────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.sectionTitle}>⚙️ Core Settings</span>
        </div>
        <div className={s.fieldGrid}>
          <OtherSelect field="currency" value={props.currency ?? "INR"}
            presets={["INR", "USD", "AED", "SGD", "EUR", "GBP"]}
            customKey="_custom_currencies" props={props} label="Currency"
            locked={false} onChange={set} />

          <NumField label="Salary Denominator (days)" field="salary_denominator"
            value={props.salary_denominator ?? 30} min={26} max={31} step={1}
            locked={!isStd} onChange={set} />

          <NumField label="Daily Working Hours" field="daily_working_hours"
            value={props.daily_working_hours ?? 8.5} min={4} max={12} step={0.5}
            locked={!isStd} onChange={set} />

          <NumField label="Pay Day (of next month)" field="pay_day"
            value={props.pay_day ?? 1} min={1} max={28} step={1}
            locked={!isStd} onChange={set} />
        </div>
      </div>

      {/* ── Standard Features ─────────────────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.sectionTitle}>📊 Standard Features</span>
          {!isStd && <span className={s.lockedBadge}>🔒 Requires Standard+</span>}
        </div>
        <div className={s.fieldGrid1}>
          <Toggle label="Auto-Compute LWP from Attendance Hours" locked={locked(true, false)}
            hint="System calculates LWP based on actual hours clocked, not just absence days"
            field="lwp_auto_compute" value={!!props.lwp_auto_compute} onChange={set} />
          <Toggle label="Hard Lock Payroll After Pay Day" locked={locked(true, false)}
            hint="Record becomes immutable on/after the Pay Day"
            field="payroll_lock_enabled" value={!!props.payroll_lock_enabled} onChange={set} />
          <Toggle label="Enable Hour Deficit Tracking" locked={locked(true, false)}
            hint="Track hour shortfall vs monthly target and show amber/red warnings"
            field="deficit_tracking" value={!!props.deficit_tracking} onChange={set} />
          {!!props.deficit_tracking && (isStd || isCust) && (
            <div className={s.subField}>
              <div className={s.fieldGrid}>
                <NumField label="Half-Day Threshold (hrs)" field="deficit_half_day_hours"
                  value={props.deficit_half_day_hours ?? 4.25} min={1} max={6} step={0.25} locked={locked(true,false)} onChange={set} />
                <NumField label="Early Warning (days left)" field="early_warning_days"
                  value={props.early_warning_days ?? 8} min={3} max={15} step={1} locked={locked(true,false)} onChange={set} />
                <NumField label="Mandatory Adjust (days left)" field="mandatory_adjust_days"
                  value={props.mandatory_adjust_days ?? 4} min={1} max={10} step={1} locked={locked(true,false)} onChange={set} />
                <NumField label="Daily Overtime Cap (hrs)" field="max_overtime_per_day"
                  value={props.max_overtime_per_day ?? 1.0} min={0.5} max={4} step={0.5} locked={locked(true,false)} onChange={set} />
                <NumField label="Show Salary Preview from Day" field="payroll_preview_from_day"
                  value={props.payroll_preview_from_day ?? 20} min={10} max={28} step={1} locked={locked(true,false)} onChange={set} />
              </div>
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
          <Toggle label="Shift-Based Calculation" locked={locked(false,true)}
            hint="Multiple shift patterns with different hour targets per employee"
            field="shift_based_calc" value={!!props.shift_based_calc} onChange={set} />
          <Toggle label="Differential Rules Per Employee/Group" locked={locked(false,true)}
            hint="Different hour rules for different departments or employee groups"
            field="differential_rules_enabled" value={!!props.differential_rules_enabled} onChange={set} />
          <Toggle label="Weekly Overtime Cap" locked={locked(false,true)}
            hint="Sets a maximum total overtime countable per week"
            field="overtime_weekly_cap_enabled"
            value={props.overtime_weekly_cap !== null && props.overtime_weekly_cap !== undefined}
            onChange={v => set({ overtime_weekly_cap: v.overtime_weekly_cap_enabled ? (props.overtime_weekly_cap ?? 5) : null })} />
          {props.overtime_weekly_cap !== null && (isAdv || isCust) && (
            <div className={s.subField}>
              <NumField label="Weekly Overtime Cap (hrs)" field="overtime_weekly_cap"
                value={props.overtime_weekly_cap ?? 5} min={1} max={20} step={0.5}
                locked={locked(false,true)} onChange={set} />
            </div>
          )}
          <Toggle label="ML Lapse Reward Engine" locked={locked(false,true)}
            hint="Track unused ML months and auto-credit bonus leave"
            field="ml_lapse_tracking" value={!!props.ml_lapse_tracking} onChange={set} />
          {!!props.ml_lapse_tracking && (isAdv || isCust) && (
            <div className={s.subField}>
              <div className={s.fieldGrid}>
                <NumField label="Lapsed Months per Award" field="ml_lapse_award_threshold"
                  value={props.ml_lapse_award_threshold ?? 4} min={2} max={12} step={1}
                  locked={locked(false,true)} onChange={set} />
                <OtherSelect field="ml_lapse_award_type" value={props.ml_lapse_award_type ?? "Comp-Off"}
                  presets={["Comp-Off", "Casual Leave", "Earned Leave"]}
                  customKey="_custom_ml_award_types" props={props}
                  label="Award Leave Type" locked={locked(false,true)} onChange={set} />
              </div>
            </div>
          )}
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
          <input className={s.input} placeholder="property_key" value={customKey}
            onChange={e => setCustomKey(e.target.value)} />
          <input className={s.input} placeholder="value" value={customVal}
            onChange={e => setCustomVal(e.target.value)} />
          <button className={s.addBtn} onClick={() => {
            if (!customKey.trim()) return;
            set({ _custom: { ...props._custom, [customKey]: customVal } });
            setCustomKey(""); setCustomVal("");
          }}>+ Add</button>
        </div>
      </div>

      {/* ── Actions ───────────────────────────────────────────────────── */}
      <div className={s.actionsRow}>
        <button className={s.saveBtn} onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "💾 Save Payroll Config"}
        </button>
      </div>
    </div>
    </div>
  );
}
