"use client";

import { useState } from "react";
import { Wallet, CreditCard, Diamond, Sliders } from "lucide-react";
import s from "./config-panel.module.css";

interface Props {
  props: Record<string, any>;
  onChange: (updated: Record<string, any>) => void;
  onSave: () => void;
  saving: boolean;
}

type ReimbTier = "basic" | "standard" | "advanced" | "custom";

const TIER_META: Record<ReimbTier, { label: string; badge: string; badgeClass: string; desc: string; icon: React.ElementType }> = {
  basic:    { label: "Basic",    badge: "Tier 1", badgeClass: s.tierBadgeBasic,    desc: "1 claim/month. SA approves only. 3-month receipts. 3 categories.", icon: Wallet },
  standard: { label: "Standard", badge: "Tier 2", badgeClass: s.tierBadgeStandard, desc: "3 claims/month. Admin + SA approves. 6-month. 7 categories.",       icon: CreditCard },
  advanced: { label: "Advanced", badge: "Tier 3", badgeClass: s.tierBadgeAdvanced, desc: "Unlimited claims + categories. Multi-hierarchy. Partial approval.", icon: Diamond },
  custom:   { label: "Custom",   badge: "Custom", badgeClass: s.tierBadgeCustom,   desc: "Hand-pick any reimbursement features individually.",              icon: Sliders },
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

function NumField({ label, field, value, locked, min, max, step, placeholder, onChange }: {
  label: string; field: string; value: number | null; locked: boolean;
  min?: number; max?: number; step?: number; placeholder?: string;
  onChange: (u: Record<string, any>) => void;
}) {
  return (
    <div className={s.field}>
      <label className={s.label}>{label}</label>
      <input className={s.input} type="number" value={value ?? ""}
        min={min} max={max} step={step ?? 1} disabled={locked}
        placeholder={placeholder}
        onChange={e => onChange({ [field]: e.target.value === "" ? null : parseInt(e.target.value) })} />
    </div>
  );
}

export default function ReimbConfigPanel({ props, onChange, onSave, saving }: Props) {
  const tier = (props.tier ?? "basic") as ReimbTier;
  const isStd = tier !== "basic";
  const isAdv = tier === "advanced";
  const isCust = tier === "custom";
  const locked = (rs: boolean, ra: boolean) => isCust ? false : ra ? !isAdv : rs ? !isStd : false;
  const set = (partial: Record<string, any>) => onChange({ ...props, ...partial });
  const [newPreset, setNewPreset] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [customVal, setCustomVal] = useState("");

  return (
    <div className={s.panelLayout}>
      <div className={s.tierColumn}>
        <div className={s.tierColumnLabel}>Plan Tier</div>
        <div className={s.tierGrid}>
          {(["basic", "standard", "advanced", "custom"] as ReimbTier[]).map(t => {
            const m = TIER_META[t]; const Icon = m.icon;
            return (
              <div key={t} className={`${s.tierCard} ${tier === t ? s.active : ""}`}
                onClick={() => {
                  const base: Record<string, any> = { ...props, tier: t };
                  if (t === "basic")    { base.max_categories = 3;   base.max_claims_per_month = 1;    base.receipt_retention_days = 90;  base.admin_can_approve = false; base.max_approval_chain_depth = 1; }
                  if (t === "standard") { base.max_categories = 7;   base.max_claims_per_month = 3;    base.receipt_retention_days = 180; base.admin_can_approve = true;  base.max_approval_chain_depth = 2; }
                  if (t === "advanced") { base.max_categories = 999; base.max_claims_per_month = null; base.receipt_retention_days = null; }
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

      {/* ── Core Limits ───────────────────────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHead}><span className={s.sectionTitle}>📦 Capacity & Limits</span></div>
        <div className={s.fieldGrid}>
          <div className={s.field}>
            <label className={s.label}>Max Expense Categories</label>
            <input className={s.input} type="text" disabled
              value={tier === "basic" ? "3" : tier === "standard" ? "7" : "Unlimited"} readOnly />
          </div>

          <NumField label="Max Claims Per Employee / Month" field="max_claims_per_month"
            value={props.max_claims_per_month} min={1} max={20}
            locked={!isAdv} placeholder={isAdv ? "Leave blank = unlimited" : ""}
            onChange={set} />

          <NumField label="Receipt Retention (days)" field="receipt_retention_days"
            value={props.receipt_retention_days} min={30} max={3650}
            locked={!isAdv} placeholder={isAdv ? "Leave blank = permanent" : ""}
            onChange={set} />

          <div className={s.field}>
            <label className={s.label}>Max Approval Chain Depth</label>
            <select className={s.select} value={props.max_approval_chain_depth ?? 1}
              disabled={!isStd}
              onChange={e => set({ max_approval_chain_depth: parseInt(e.target.value) })}>
              <option value={1}>1 Level (SA only)</option>
              {isStd && <option value={2}>2 Levels</option>}
              {isAdv && <option value={3}>3 Levels</option>}
            </select>
          </div>
        </div>
      </div>

      {/* ── Category Presets ──────────────────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHead}><span className={s.sectionTitle}>🏷️ Category Presets for Tenant</span></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
          {(props.custom_category_presets ?? []).map((p: string) => (
            <span key={p} className={s.customTag}>
              {p}
              <button className={s.customTagRemove}
                onClick={() => set({ custom_category_presets: (props.custom_category_presets ?? []).filter((x: string) => x !== p) })}>✕</button>
            </span>
          ))}
        </div>
        <div className={s.otherRow}>
          <input className={s.otherInput} placeholder="e.g. Travel, Medical, Internet Bill, Site Visit…"
            value={newPreset} onChange={e => setNewPreset(e.target.value)} />
          <button className={s.addBtn} onClick={() => {
            if (!newPreset.trim()) return;
            const existing = props.custom_category_presets ?? [];
            if (!existing.includes(newPreset)) set({ custom_category_presets: [...existing, newPreset] });
            setNewPreset("");
          }}>+ Add</button>
        </div>
      </div>

      {/* ── Approval Settings ─────────────────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.sectionTitle}>✅ Approval Settings</span>
          {!isStd && <span className={s.lockedBadge}>🔒 Requires Standard+</span>}
        </div>
        <div className={s.fieldGrid1}>
          <Toggle label="Admin Can Approve" locked={locked(true,false)}
            hint="Basic: only SuperAdmin approves. Standard+ allows Admin."
            field="admin_can_approve" value={!!props.admin_can_approve} onChange={set} />
          <Toggle label="Optional Receipt Per Category" locked={locked(false,true)}
            hint="Basic/Standard: receipt always required. Advanced: per-category setting."
            field="allow_optional_receipt" value={!!props.allow_optional_receipt} onChange={set} />
          <Toggle label="Partial Approval (Approve Partial Amount)" locked={locked(false,true)}
            hint="Approver can approve a lesser amount than what was claimed"
            field="partial_approval_enabled" value={!!props.partial_approval_enabled} onChange={set} />
        </div>
      </div>

      {/* ── Advanced Approval Hierarchy ───────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.sectionTitle}>🏛️ Multi-Hierarchy Options</span>
          {!isAdv && <span className={s.lockedBadge}>🔒 Requires Advanced</span>}
        </div>
        <div className={s.fieldGrid1}>
          <Toggle label="Job-Role Based Approver" locked={locked(false,true)}
            hint="Approver assigned by custom job role set on employee profile"
            field="job_role_approver_enabled" value={!!props.job_role_approver_enabled} onChange={set} />
          <Toggle label="Department-Based Approver" locked={locked(false,true)}
            hint="Each department has its own designated approver for reimbursements"
            field="department_approver_enabled" value={!!props.department_approver_enabled} onChange={set} />
          <Toggle label="Specific Person as Approver" locked={locked(false,true)}
            hint="Any specific employee can be assigned as approver for a category/stage"
            field="person_approver_enabled" value={!!props.person_approver_enabled} onChange={set} />
        </div>
      </div>

      {/* ── Payroll Integration ───────────────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.sectionTitle}>💰 Payroll Integration</span>
          {!isAdv && <span className={s.lockedBadge}>🔒 Requires Advanced</span>}
        </div>
        <div className={s.fieldGrid1}>
          <Toggle label="Bulk Submission" locked={locked(false,true)}
            hint="Employee can submit multiple expense claims in a single batch"
            field="bulk_submission_enabled" value={!!props.bulk_submission_enabled} onChange={set} />
          <Toggle label="Show in Payslip Summary" locked={locked(false,true)}
            hint="Approved reimbursements appear as a line item in the monthly payslip"
            field="show_in_payslip" value={!!props.show_in_payslip} onChange={set} />
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
          {saving ? "Saving…" : "💾 Save Reimbursements Config"}
        </button>
      </div>
    </div>
    </div>
  );
}
