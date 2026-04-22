"use client";

import { useState } from "react";
import { TrendingUp, BadgeDollarSign, Gem } from "lucide-react";
import s from "./config-panel.module.css";

interface Props {
  props: Record<string, any>;
  onChange: (updated: Record<string, any>) => void;
  onSave: () => void;
  saving: boolean;
}

type IncentiveTier = "basic" | "standard" | "advanced";

const TIER_META: Record<
  IncentiveTier,
  { label: string; badge: string; badgeClass: string; desc: string; icon: React.ElementType }
> = {
  basic: {
    label: "Basic",
    badge: "Tier 1",
    badgeClass: s.tierBadgeBasic,
    desc: "1 active plan. Flat payout only. Fixed-value goals only. Standard tenures (weekly → yearly).",
    icon: TrendingUp,
  },
  standard: {
    label: "Standard",
    badge: "Tier 2",
    badgeClass: s.tierBadgeStandard,
    desc: "Up to 5 plans. % or flat payout with upper cap. Open-ended values. Minimum target cap. Multi-goal per plan.",
    icon: BadgeDollarSign,
  },
  advanced: {
    label: "Advanced",
    badge: "Tier 3",
    badgeClass: s.tierBadgeAdvanced,
    desc: "Unlimited plans & goals. Custom date tenure. Role/dept scoping. Payslip integration. Self-reporting.",
    icon: Gem,
  },
};

// ── Reusable sub-components (same pattern as other config panels) ────────────
function Toggle({
  label, hint, field, value, locked, onChange,
}: {
  label: string; hint?: string; field: string; value: boolean; locked: boolean;
  onChange: (u: Record<string, any>) => void;
}) {
  return (
    <div
      className={`${s.toggleRow} ${locked ? s.locked : ""}`}
      title={locked ? "Upgrade tier to unlock" : undefined}
    >
      <div>
        <div className={s.toggleLabel}>{label}</div>
        {hint && <div className={s.toggleHint}>{hint}</div>}
      </div>
      <label className={s.switch}>
        <input
          type="checkbox"
          checked={value}
          disabled={locked}
          onChange={(e) => onChange({ [field]: e.target.checked })}
        />
        <span className={s.switchSlider} />
      </label>
    </div>
  );
}

function NumField({
  label, field, value, locked, min, max, step, placeholder, onChange,
}: {
  label: string; field: string; value: number | null; locked: boolean;
  min?: number; max?: number; step?: number; placeholder?: string;
  onChange: (u: Record<string, any>) => void;
}) {
  return (
    <div className={s.field}>
      <label className={s.label}>{label}</label>
      <input
        className={s.input}
        type="number"
        value={value ?? ""}
        min={min}
        max={max}
        step={step ?? 1}
        disabled={locked}
        placeholder={placeholder}
        onChange={(e) =>
          onChange({ [field]: e.target.value === "" ? null : parseInt(e.target.value) })
        }
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function IncentivesConfigPanel({ props, onChange, onSave, saving }: Props) {
  const tier = (props.tier ?? "basic") as IncentiveTier;
  const isStd = tier !== "basic";
  const isAdv = tier === "advanced";

  const set = (partial: Record<string, any>) => onChange({ ...props, ...partial });

  const [customKey, setCustomKey] = useState("");
  const [customVal, setCustomVal] = useState("");

  return (
    <div>
      {/* ── Tier Selector ──────────────────────────────────────────────── */}
      <div className={s.tierGrid}>
        {(["basic", "standard", "advanced"] as IncentiveTier[]).map((t) => {
          const m = TIER_META[t];
          const Icon = m.icon;
          return (
            <div
              key={t}
              className={`${s.tierCard} ${tier === t ? s.active : ""}`}
              onClick={() => {
                const base: Record<string, any> = { ...props, tier: t };
                if (t === "basic") {
                  base.max_active_plans             = 1;
                  base.multi_goal_enabled           = false;
                  base.open_ended_value_enabled     = false;
                  base.target_cap_enabled           = false;
                  base.percentage_payout_enabled    = false;
                  base.payout_upper_cap_enabled     = false;
                  base.custom_tenure_enabled        = false;
                  base.role_scoping_enabled         = false;
                  base.department_scoping_enabled   = false;
                  base.show_in_payslip              = false;
                  base.self_reporting_enabled       = false;
                }
                if (t === "standard") {
                  base.max_active_plans             = 5;
                  base.multi_goal_enabled           = true;
                  base.open_ended_value_enabled     = true;
                  base.target_cap_enabled           = true;
                  base.percentage_payout_enabled    = true;
                  base.payout_upper_cap_enabled     = true;
                  base.custom_tenure_enabled        = false;
                  base.role_scoping_enabled         = false;
                  base.department_scoping_enabled   = false;
                  base.show_in_payslip              = false;
                  base.self_reporting_enabled       = false;
                }
                if (t === "advanced") {
                  base.max_active_plans             = null; // unlimited
                  base.multi_goal_enabled           = true;
                  base.open_ended_value_enabled     = true;
                  base.target_cap_enabled           = true;
                  base.percentage_payout_enabled    = true;
                  base.payout_upper_cap_enabled     = true;
                  base.custom_tenure_enabled        = true;
                  base.role_scoping_enabled         = true;
                  base.department_scoping_enabled   = true;
                  base.show_in_payslip              = true;
                  base.self_reporting_enabled       = true;
                }
                onChange(base);
              }}
            >
              <div>
                <span className={`${s.tierBadge} ${m.badgeClass}`}>{m.badge}</span>
              </div>
              <Icon size={20} color={tier === t ? "#6366f1" : "#475569"} style={{ margin: "6px auto" }} />
              <div className={s.tierName}>{m.label}</div>
              <div className={s.tierDesc}>{m.desc}</div>
            </div>
          );
        })}
      </div>

      {/* ── Capacity ───────────────────────────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.sectionTitle}>📋 Plan Capacity</span>
        </div>
        <div className={s.fieldGrid}>
          <div className={s.field}>
            <label className={s.label}>Max Active Incentive Plans</label>
            <input
              className={s.input}
              type="text"
              disabled
              readOnly
              value={
                tier === "basic" ? "1 Plan" :
                tier === "standard" ? "5 Plans" :
                "Unlimited"
              }
            />
          </div>

          <NumField
            label="Override Max Plans (leave blank = tier default)"
            field="max_active_plans"
            value={
              /* Show blank if it exactly matches the tier default */
              (tier === "basic" && props.max_active_plans === 1) ||
              (tier === "standard" && props.max_active_plans === 5) ||
              (tier === "advanced" && props.max_active_plans === null)
                ? null
                : props.max_active_plans
            }
            locked={false}
            min={1}
            max={100}
            placeholder="Use tier default"
            onChange={set}
          />
        </div>
      </div>

      {/* ── Goal Options ───────────────────────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.sectionTitle}>🎯 Goal Configuration</span>
          {!isStd && <span className={s.lockedBadge}>🔒 Requires Standard+</span>}
        </div>
        <div className={s.fieldGrid1}>
          <Toggle
            label="Multiple Goals Per Plan"
            hint="In Basic, a plan can have only 1 goal. Standard+ allows multiple goals/tasks per plan."
            field="multi_goal_enabled"
            value={!!props.multi_goal_enabled}
            locked={!isStd}
            onChange={set}
          />

          <Toggle
            label="Open-Ended / Custom Value Goals"
            hint="Allows goals where the incentive value is not pre-fixed — the recorded amount is entered at time of claim (e.g. services without a rate card)."
            field="open_ended_value_enabled"
            value={!!props.open_ended_value_enabled}
            locked={!isStd}
            onChange={set}
          />

          <Toggle
            label="Minimum Target / Achievement Cap"
            hint="Incentive payout is triggered only after the employee meets a defined minimum threshold (e.g. must sell ₹50k before any incentive applies)."
            field="target_cap_enabled"
            value={!!props.target_cap_enabled}
            locked={!isStd}
            onChange={set}
          />
        </div>
      </div>

      {/* ── Payout Options ─────────────────────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.sectionTitle}>💰 Payout Structure</span>
          {!isStd && <span className={s.lockedBadge}>🔒 Requires Standard+</span>}
        </div>
        <div className={s.fieldGrid1}>
          <Toggle
            label="Percentage-Based Payout"
            hint="In Basic, only flat-amount payouts are available. Standard+ enables % of achieved value as payout mode."
            field="percentage_payout_enabled"
            value={!!props.percentage_payout_enabled}
            locked={!isStd}
            onChange={set}
          />

          <Toggle
            label="Upper Cap on Payout"
            hint="Allows setting a maximum ceiling on payout — applies to both flat and % modes (e.g. max ₹10,000 even if % calculation exceeds it)."
            field="payout_upper_cap_enabled"
            value={!!props.payout_upper_cap_enabled}
            locked={!isStd}
            onChange={set}
          />
        </div>
      </div>

      {/* ── Tenure ─────────────────────────────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.sectionTitle}>📅 Tenure Options</span>
          {!isAdv && <span className={s.lockedBadge}>🔒 Custom Tenure requires Advanced</span>}
        </div>
        <div className={s.fieldGrid1}>
          <div
            className={s.toggleRow}
            style={{ opacity: 1, pointerEvents: "none", cursor: "default" }}
          >
            <div>
              <div className={s.toggleLabel}>Standard Tenures (Weekly / Monthly / Quarterly / Yearly)</div>
              <div className={s.toggleHint}>Always available on all tiers.</div>
            </div>
            <label className={s.switch}>
              <input type="checkbox" checked disabled readOnly />
              <span className={s.switchSlider} />
            </label>
          </div>

          <Toggle
            label="Custom Date Range Tenure"
            hint="Allows the tenant to define a plan for an arbitrary start–end date window instead of standard calendar periods."
            field="custom_tenure_enabled"
            value={!!props.custom_tenure_enabled}
            locked={!isAdv}
            onChange={set}
          />
        </div>
      </div>

      {/* ── Scoping & Eligibility ──────────────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.sectionTitle}>👥 Scoping &amp; Eligibility</span>
          {!isAdv && <span className={s.lockedBadge}>🔒 Requires Advanced</span>}
        </div>
        <div className={s.fieldGrid1}>
          <Toggle
            label="Scope by Role"
            hint="Incentive plan can be restricted to specific roles (e.g. Sales Executive only). Basic/Standard plans apply to all employees."
            field="role_scoping_enabled"
            value={!!props.role_scoping_enabled}
            locked={!isAdv}
            onChange={set}
          />

          <Toggle
            label="Scope by Department"
            hint="Incentive plan can be restricted to a specific department or team."
            field="department_scoping_enabled"
            value={!!props.department_scoping_enabled}
            locked={!isAdv}
            onChange={set}
          />
        </div>
      </div>

      {/* ── Integration ────────────────────────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.sectionTitle}>🔗 Integration</span>
          {!isAdv && <span className={s.lockedBadge}>🔒 Requires Advanced</span>}
        </div>
        <div className={s.fieldGrid1}>
          <Toggle
            label="Show Approved Incentives in Payslip"
            hint="Approved incentive amounts appear as a dedicated line item in the employee's monthly payslip."
            field="show_in_payslip"
            value={!!props.show_in_payslip}
            locked={!isAdv}
            onChange={set}
          />

          <Toggle
            label="Employee Self-Reporting"
            hint="Employees can log their own achievement records (subject to admin approval). In Basic/Standard, only admin can create incentive records."
            field="self_reporting_enabled"
            value={!!props.self_reporting_enabled}
            locked={!isAdv}
            onChange={set}
          />
        </div>
      </div>

      {/* ── Custom Extensions ──────────────────────────────────────────── */}
      <div className={s.customSection}>
        <div className={s.customTitle}>⚡ Custom Properties</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
          {Object.entries(props._custom ?? {}).map(([k, v]) => (
            <span key={k} className={s.customTag}>
              {k}: {String(v)}
              <button
                className={s.customTagRemove}
                onClick={() => {
                  const c = { ...props._custom };
                  delete c[k];
                  set({ _custom: c });
                }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <div className={s.customGrid}>
          <input
            className={s.input}
            placeholder="property_key"
            value={customKey}
            onChange={(e) => setCustomKey(e.target.value)}
          />
          <input
            className={s.input}
            placeholder="value"
            value={customVal}
            onChange={(e) => setCustomVal(e.target.value)}
          />
          <button
            className={s.addBtn}
            onClick={() => {
              if (!customKey.trim()) return;
              set({ _custom: { ...props._custom, [customKey]: customVal } });
              setCustomKey("");
              setCustomVal("");
            }}
          >
            + Add
          </button>
        </div>
      </div>

      <div className={s.actionsRow}>
        <button className={s.saveBtn} onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "💾 Save Incentives Config"}
        </button>
      </div>
    </div>
  );
}
