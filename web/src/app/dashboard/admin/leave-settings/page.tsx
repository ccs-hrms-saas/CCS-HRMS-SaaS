"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useModules } from "@/context/ModulesContext";
import styles from "../../dashboard.module.css";

// ── Constants ─────────────────────────────────────────────────────────────────
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_LONG  = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ── Leave type classifier ─────────────────────────────────────────────────────
function leaveCategory(name: string): "cl" | "el" | "sl" | "ml" | "co" | "lwp" | "other" {
  const n = name.toLowerCase();
  if (n.includes("casual"))        return "cl";
  if (n.includes("earned") || n.includes("annual") || n.includes("privilege")) return "el";
  if (n.includes("sick"))          return "sl";
  if (n.includes("menstruat") || n.includes(" ml")) return "ml";
  if (n.includes("comp"))         return "co";
  if (n.includes("without pay") || n.includes("lwp")) return "lwp";
  return "other";
}

const CATEGORY_LABELS: Record<string, string> = {
  cl: "CL", el: "EL", sl: "SL", ml: "ML", co: "CO", lwp: "LWP", other: "—",
};
const CATEGORY_COLORS: Record<string, string> = {
  cl: "#818cf8", el: "#34d399", sl: "#f59e0b", ml: "#ec4899", co: "#a78bfa", lwp: "#ef4444", other: "#94a3b8",
};

// ── Empty form ────────────────────────────────────────────────────────────────
const emptyForm = {
  name: "", frequency: "yearly", max_days_per_year: 12, is_paid: true,
  deduction_hours: 8.5, count_holidays: false,
  allow_carry_forward: false, carry_forward_percent: 0, max_carry_forward: 0,
  accrual_rate: "", expires_in_days: "",
  requires_attachment: false, requires_attachment_after_days: 2,
  half_day_allowed: false, half_days_per_leave: 2,
  short_leave_allowed: false, short_leaves_per_leave: 4,
  co_employee_can_split: false, co_expiry_days: "",
  max_consecutive_days: "",
  // Phase C — no-ledger + custom cycle
  no_ledger: false, ledger_cycle: "yearly",
};

// ── Reusable sub-components ───────────────────────────────────────────────────
const Toggle = ({ label, checked, onChange, disabled, note }: any) => (
  <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
    <div onClick={() => !disabled && onChange(!checked)} style={{
      width: 36, height: 19, borderRadius: 10, marginTop: 2, flexShrink: 0,
      background: checked ? "var(--accent-primary)" : "rgba(255,255,255,0.1)",
      position: "relative", transition: "background 0.2s", cursor: disabled ? "not-allowed" : "pointer",
    }}>
      <div style={{ position: "absolute", top: 2, left: checked ? 18 : 2, width: 15, height: 15, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
    </div>
    <div>
      <div>{label}</div>
      {note && <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: 2, opacity: 0.7 }}>{note}</div>}
    </div>
  </label>
);

export default function LeaveSettings() {
  const { profile } = useAuth();
  const { getProps } = useModules();
  const modProps     = getProps("leave_settings");
  const isAdvanced   = modProps.tier === "advanced";
  // Developer-controlled feature flags
  const canEditHours             = !!(modProps.org_hours_configurable);
  const devHalfDayAllowed        = modProps.half_day_allowed !== false;
  const devShortLeaveAllowed     = modProps.short_leave_allowed !== false;
  const devSACanConfigPartial    = modProps.superadmin_can_configure_partial_day !== false;
  const devDefaultHalfDays       = modProps.default_half_days_per_leave ?? 2;
  const devDefaultShortLeaves    = modProps.default_short_leaves_per_leave ?? 4;
  // Phase C: no-ledger feature gate
  const devNoLedgerAllowed       = modProps.allow_no_ledger_leaves !== false;
  // Working hours state
  const [hoursPerDay, setHoursPerDay]   = useState<number>(8.5);
  const [hoursSetAt, setHoursSetAt]     = useState<string | null>(null);
  const [savingHours, setSavingHours]   = useState(false);

  // ── App settings / work schedule ──────────────────────────────────────────
  const [settings, setSettings]         = useState<any>(null);
  const [scheduleForm, setScheduleForm] = useState({
    week_off_type: "fixed",
    week_off_days: [0] as number[],
    overtime_tracking: false,
    overtime_rate_type: "flat",
    overtime_rate_value: 0,
    overtime_monthly_cap_hrs: 0,
  });
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // ── Leave types ───────────────────────────────────────────────────────────
  const [types,   setTypes]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState<any | null>(null);
  const [form,    setForm]     = useState<any>(emptyForm);
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const companyId = profile?.company_id;
    const [{ data: types }, { data: sett }] = await Promise.all([
      supabase.from("leave_types").select("*").eq("company_id", companyId).order("name"),
      supabase.from("app_settings").select("*").eq("company_id", companyId).single(),
    ]);
    setTypes(types ?? []);
    if (sett) {
      setSettings(sett);
      setScheduleForm({
        week_off_type:             sett.week_off_type ?? "fixed",
        week_off_days:             sett.week_off_days ?? [0],
        overtime_tracking:         sett.overtime_tracking ?? false,
        overtime_rate_type:        sett.overtime_rate_type ?? "flat",
        overtime_rate_value:       Number(sett.overtime_rate_value ?? 0),
        overtime_monthly_cap_hrs:  Number(sett.overtime_monthly_cap_hrs ?? 0),
      });
      setHoursPerDay(sett.hours_per_day ?? 8.5);
      setHoursSetAt(sett.hours_per_day_set_at ?? null);
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => { if (profile?.company_id) load(); }, [load, profile]);

  // ── Work Schedule save ─────────────────────────────────────────────────────
  const saveSchedule = async () => {
    setSavingSchedule(true);
    await supabase.from("app_settings").update({
      week_off_type:             scheduleForm.week_off_type,
      week_off_days:             scheduleForm.week_off_type === "fixed" ? scheduleForm.week_off_days : [],
      overtime_tracking:         scheduleForm.overtime_tracking,
      overtime_rate_type:        scheduleForm.overtime_rate_type,
      overtime_rate_value:       scheduleForm.overtime_rate_value,
      overtime_monthly_cap_hrs:  scheduleForm.overtime_monthly_cap_hrs,
    }).eq("company_id", settings?.company_id);
    setSavingSchedule(false);
    load();
  };

  // 90-day lock: if canEditHours is false (Tier 1) AND < 90 days since last set
  const hoursLockDate = hoursSetAt ? new Date(new Date(hoursSetAt).getTime() + 90 * 24 * 3600000) : null;
  const hoursLocked   = !canEditHours && !!hoursLockDate && hoursLockDate > new Date();

  const saveHours = async () => {
    setSavingHours(true);
    await supabase.from("app_settings").update({
      hours_per_day:        hoursPerDay,
      hours_per_day_set_at: new Date().toISOString(),
    }).eq("company_id", settings?.company_id);
    setSavingHours(false);
    load();
  };

  const toggleOffDay = (dow: number) => {
    setScheduleForm(f => ({
      ...f,
      week_off_days: f.week_off_days.includes(dow)
        ? f.week_off_days.filter((d: number) => d !== dow)
        : [...f.week_off_days, dow],
    }));
  };

  // ── Leave type CRUD ────────────────────────────────────────────────────────
  const openNew  = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (t: any) => {
    setEditing(t);
    setForm({
      ...emptyForm, ...t,
      accrual_rate:       t.accrual_rate ?? "",
      expires_in_days:    t.expires_in_days ?? "",
      co_expiry_days:     t.co_expiry_days ?? "",
      max_consecutive_days: t.max_consecutive_days ?? "",
    });
    setShowForm(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const cat = leaveCategory(form.name);
    const payload = {
      ...form,
      accrual_rate:                form.accrual_rate === ""       ? null : Number(form.accrual_rate),
      expires_in_days:             form.expires_in_days === ""     ? null : Number(form.expires_in_days),
      co_expiry_days:              form.co_expiry_days === ""      ? null : Number(form.co_expiry_days),
      max_consecutive_days:        form.max_consecutive_days === "" ? null : Number(form.max_consecutive_days),
      max_carry_forward:           form.allow_carry_forward ? Number(form.max_carry_forward) : 0,
      carry_forward_percent:       form.allow_carry_forward ? Number(form.carry_forward_percent) : 0,
      requires_attachment_after_days: form.requires_attachment ? Number(form.requires_attachment_after_days) : 0,
      half_days_per_leave:         Number(form.half_days_per_leave),
      short_leaves_per_leave:      Number(form.short_leaves_per_leave),
      is_ml_type:                  cat === "ml",
      counts_as_lwp_for_payroll:   cat === "lwp",
      // Phase C
      no_ledger:                   !!form.no_ledger,
      ledger_cycle:                form.no_ledger ? null : (form.ledger_cycle || "yearly"),
    };
    if (editing) await supabase.from("leave_types").update(payload).eq("id", editing.id);
    else          await supabase.from("leave_types").insert(payload);
    setShowForm(false); setSaving(false); load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this leave type?")) return;
    await supabase.from("leave_types").delete().eq("id", id); load();
  };

  // ── Detect leave category from form name to show relevant fields ──────────
  const cat = leaveCategory(form.name);
  const showHalfShort = cat === "cl" || cat === "el" || cat === "other";
  const showSLFields  = cat === "sl";
  const showMLFields  = cat === "ml";
  const showCOFields  = cat === "co";

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner} /></div>;

  return (
    <div className="animate-fade-in">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className={styles.pageHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Leave Settings</h1>
          <p>Configure work schedule, week off policy, and leave types</p>
        </div>
        <button className={styles.primaryBtn} style={{ width: "auto", padding: "12px 24px" }} onClick={openNew}>
          + Add Leave Type
        </button>
      </div>

      {/* ══ SECTION 1: Work Schedule ════════════════════════════════════════ */}
      <div className="glass-panel" style={{ marginBottom: 20, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", cursor: "pointer" }} onClick={() => setScheduleOpen(o => !o)}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>🗓️ Work Schedule & Week Off</div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 2 }}>
              {scheduleForm.week_off_type === "fixed"
                ? `Fixed — ${(scheduleForm.week_off_days ?? []).map((d: number) => DAYS_LONG[d]).join(" & ")} off`
                : "Rotating — each employee has their own off day"}
              {scheduleForm.overtime_tracking && " · overtime tracked"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!isAdvanced && (
              <span style={{ fontSize: "0.7rem", padding: "3px 10px", borderRadius: 20, background: "rgba(245,158,11,0.1)", color: "#f59e0b", fontWeight: 700, border: "1px solid rgba(245,158,11,0.3)" }}>
                Advanced tier to edit
              </span>
            )}
            <span style={{ fontSize: "0.9rem", transition: "transform 0.2s", transform: scheduleOpen ? "rotate(180deg)" : "none", color: "var(--text-secondary)" }}>▾</span>
          </div>
        </div>

        {scheduleOpen && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "20px 24px", background: "rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Week Off Type */}
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-secondary)", marginBottom: 10 }}>Week Off Type</div>
              <div style={{ display: "flex", gap: 10 }}>
                {(["fixed", "rotating"] as const).map(type => (
                  <div key={type} onClick={() => isAdvanced && setScheduleForm(f => ({ ...f, week_off_type: type }))} style={{
                    flex: 1, padding: "11px 16px", borderRadius: 11, cursor: isAdvanced ? "pointer" : "not-allowed",
                    transition: "all 0.2s", border: `1px solid ${scheduleForm.week_off_type === type ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.08)"}`,
                    background: scheduleForm.week_off_type === type ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.02)",
                    color: scheduleForm.week_off_type === type ? "#818cf8" : "var(--text-secondary)",
                    fontWeight: 600, fontSize: "0.83rem", opacity: isAdvanced ? 1 : 0.6,
                  }}>
                    {type === "fixed" ? "🗓️ Fixed" : "🔄 Rotating"}
                    <div style={{ fontSize: "0.7rem", fontWeight: 400, marginTop: 3, color: "var(--text-secondary)" }}>
                      {type === "fixed" ? "All employees share the same off day(s)" : "Each employee has their own off day"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Fixed: day picker */}
            {scheduleForm.week_off_type === "fixed" && (
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-secondary)", marginBottom: 8 }}>Off Day(s)</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {DAYS_SHORT.map((d, i) => (
                    <div key={d} onClick={() => isAdvanced && toggleOffDay(i)} style={{
                      padding: "6px 14px", borderRadius: 20, cursor: isAdvanced ? "pointer" : "not-allowed",
                      fontSize: "0.8rem", fontWeight: 600, transition: "all 0.2s",
                      border: `1px solid ${(scheduleForm.week_off_days ?? []).includes(i) ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.08)"}`,
                      background: (scheduleForm.week_off_days ?? []).includes(i) ? "rgba(99,102,241,0.15)" : "transparent",
                      color: (scheduleForm.week_off_days ?? []).includes(i) ? "#818cf8" : "var(--text-secondary)",
                    }}>{d}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Rotating info */}
            {scheduleForm.week_off_type === "rotating" && (
              <div style={{ padding: "10px 16px", borderRadius: 10, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                ℹ️ Rotating mode: assign each employee's off day when creating them or from their profile card.
              </div>
            )}

            {/* Overtime tracking toggle */}
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-secondary)", marginBottom: 8 }}>Overtime</div>
              <Toggle
                label="Track overtime hours"
                note="Hours worked beyond daily target are logged per attendance punch."
                checked={scheduleForm.overtime_tracking}
                onChange={(v: boolean) => isAdvanced && setScheduleForm(f => ({ ...f, overtime_tracking: v }))}
                disabled={!isAdvanced}
              />
            </div>

            {/* Overtime Payout Config — shown when tracking is ON */}
            {scheduleForm.overtime_tracking && (
              <div style={{ padding: "16px 18px", borderRadius: 12, background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "#f59e0b", marginBottom: 14 }}>⏱ Overtime Payout Configuration</div>

                {/* Rate type */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 8 }}>Payout type</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    {(["flat", "multiplier"] as const).map(t => (
                      <button
                        type="button" key={t}
                        onClick={() => isAdvanced && setScheduleForm(f => ({ ...f, overtime_rate_type: t }))}
                        style={{
                          flex: 1, padding: "9px 14px", borderRadius: 9, cursor: isAdvanced ? "pointer" : "not-allowed",
                          border: `2px solid ${scheduleForm.overtime_rate_type === t ? "#f59e0b" : "rgba(255,255,255,0.08)"}`,
                          background: scheduleForm.overtime_rate_type === t ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.03)",
                          color: scheduleForm.overtime_rate_type === t ? "#f59e0b" : "var(--text-secondary)",
                          fontSize: "0.8rem", fontWeight: scheduleForm.overtime_rate_type === t ? 700 : 400,
                          transition: "all 0.15s",
                        }}
                      >
                        {t === "flat" ? "⚡ Flat ₹/hour" : "✖ Multiplier of daily rate"}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: 6 }}>
                    {scheduleForm.overtime_rate_type === "flat"
                      ? "e.g. ₹50/h → employee works 3h OT → Overtime Allowance: ₹150"
                      : "e.g. 1.5 → employee's ₹800/day ÷ 8.5h × 1.5 = ₹141/h OT rate"}
                  </div>
                </div>

                {/* Rate value + cap */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
                      {scheduleForm.overtime_rate_type === "flat" ? "Rate (₹ per hour)" : "Multiplier (e.g. 1.5)"}
                    </label>
                    <input
                      type="number" step={scheduleForm.overtime_rate_type === "flat" ? "1" : "0.25"}
                      min="0" className="premium-input"
                      value={scheduleForm.overtime_rate_value}
                      disabled={!isAdvanced}
                      onChange={e => setScheduleForm(f => ({ ...f, overtime_rate_value: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
                      Monthly Cap (hours, 0 = no cap)
                    </label>
                    <input
                      type="number" step="0.5" min="0" className="premium-input"
                      value={scheduleForm.overtime_monthly_cap_hrs}
                      disabled={!isAdvanced}
                      onChange={e => setScheduleForm(f => ({ ...f, overtime_monthly_cap_hrs: Number(e.target.value) }))}
                    />
                  </div>
                </div>

                {/* Live preview */}
                {scheduleForm.overtime_rate_value > 0 && (
                  <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 8, background: "rgba(0,0,0,0.2)", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                    <strong style={{ color: "#f59e0b" }}>Preview:</strong>{" "}
                    {scheduleForm.overtime_rate_type === "flat"
                      ? `Employee works 4h OT → Overtime Allowance: ₹${(4 * scheduleForm.overtime_rate_value).toLocaleString("en-IN")}`
                      : `Employee (₹25,000/mo, ${settings?.hours_per_day ?? 8.5}h/day, 26 days) works 4h OT → Overtime Allowance: ₹${Math.round(25000 / 26 / (settings?.hours_per_day ?? 8.5) * scheduleForm.overtime_rate_value * 4).toLocaleString("en-IN")}`
                    }
                    {scheduleForm.overtime_monthly_cap_hrs > 0 && ` (capped at ${scheduleForm.overtime_monthly_cap_hrs}h/month)`}
                  </div>
                )}
              </div>
            )}

            {isAdvanced && (
              <div>
                <button onClick={saveSchedule} disabled={savingSchedule} className={styles.primaryBtn} style={{ width: "auto", padding: "9px 22px" }}>
                  {savingSchedule ? "Saving…" : "💾 Save Schedule Settings"}
                </button>
              </div>
            )}

            {/* ── Daily Working Hours ──────────────────────────────────*/}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-secondary)", marginBottom: 10 }}>Daily Working Hours Target</div>
              {hoursLocked ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 12, background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.25)" }}>
                  <span style={{ fontSize: "1.2rem" }}>🔒</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#f59e0b" }}>{hoursPerDay}h / day</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>
                      Locked until <strong>{hoursLockDate?.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</strong>.
                      Upgrade to Standard plan to change anytime.
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input type="number" step="0.5" min="1" max="16" className="premium-input"
                    style={{ maxWidth: 120 }}
                    value={hoursPerDay}
                    disabled={hoursLocked}
                    onChange={e => setHoursPerDay(Number(e.target.value) || 8.5)} />
                  <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>hours / day</span>
                  <button onClick={saveHours} disabled={savingHours || hoursLocked}
                    className={styles.primaryBtn} style={{ width: "auto", padding: "8px 18px", fontSize: "0.82rem" }}>
                    {savingHours ? "Saving…" : "Save"}
                  </button>
                </div>
              )}
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: 6 }}>
                Used for payroll deficit calculation. Applies to all employees unless individually overridden (Advanced plan).
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══ SECTION 2: Leave Types ══════════════════════════════════════════ */}
      <div className={`glass-panel ${styles.tableWrap}`}>
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Leave Name</th>
              <th>Allowance</th>
              <th>Deduction</th>
              <th>Carry Fwd</th>
              <th>Half / Short</th>
              <th>Special</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {types.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 40 }}>No leave types configured. Use the Setup Wizard or click "+ Add Leave Type".</td></tr>
            ) : types.map(t => {
              const cat = leaveCategory(t.name);
              const badge = CATEGORY_LABELS[cat];
              const color = CATEGORY_COLORS[cat];
              return (
                <tr key={t.id}>
                  <td>
                    <span style={{ padding: "2px 9px", borderRadius: 20, fontSize: "0.7rem", fontWeight: 800, background: `${color}18`, color, border: `1px solid ${color}30` }}>{badge}</span>
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {t.name}
                    <br /><span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>{t.is_paid ? "Paid" : "Unpaid"}</span>
                  </td>
                  <td>
                    {t.accrual_rate ? `1 per ${t.accrual_rate} days worked` : `${t.max_days_per_year} days`}
                    <br /><span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                      {t.no_ledger
                        ? <span style={{ color: "#fb923c", fontWeight: 700 }}>No Ledger</span>
                        : <>Per {t.frequency} · {t.ledger_cycle && t.ledger_cycle !== "yearly" ? `${({"monthly":"Monthly","3monthly":"Quarterly","6monthly":"Half-Yrly"} as Record<string,string>)[t.ledger_cycle] ?? t.ledger_cycle} cycle` : "Yearly cycle"}</>
                      }
                    </span>
                  </td>
                  <td>{t.deduction_hours}h/day</td>
                  <td>{t.allow_carry_forward ? `${t.carry_forward_percent}% (max ${t.max_carry_forward}d)` : "—"}</td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "0.75rem" }}>
                      {t.half_day_allowed  && <span style={{ color: "#818cf8" }}>½ day · {t.half_days_per_leave} = 1 {badge}</span>}
                      {t.short_leave_allowed && <span style={{ color: "#34d399" }}>Short leave · {t.short_leaves_per_leave} = 1 {badge}</span>}
                      {!t.half_day_allowed && !t.short_leave_allowed && <span style={{ color: "var(--text-secondary)" }}>—</span>}
                    </div>
                  </td>
                  <td style={{ fontSize: "0.78rem", color: "var(--text-secondary)", maxWidth: 180 }}>
                    {t.requires_attachment && `Cert after ${t.requires_attachment_after_days}d. `}
                    {t.co_expiry_days     && `Expires ${t.co_expiry_days}d. `}
                    {t.co_employee_can_split && `Emp can split. `}
                    {t.max_consecutive_days && `Max ${t.max_consecutive_days} consec. `}
                    {t.is_ml_type && "ML type. "}
                    {!t.requires_attachment && !t.co_expiry_days && !t.max_consecutive_days && !t.is_ml_type && "—"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => openEdit(t)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--glass-border)", background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.8rem" }}>✏️</button>
                      <button onClick={() => del(t.id)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "var(--danger)", cursor: "pointer", fontSize: "0.8rem" }}>🗑</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ══ Leave Type Drawer ════════════════════════════════════════════════ */}
      {showForm && (
        <div className="overlay" onClick={() => setShowForm(false)}>
          <div className="drawer" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="drawerHeader">
              <h2>{editing ? "Edit Leave Type" : "New Leave Type"}</h2>
              <button onClick={() => setShowForm(false)} className="closeBtn">✕</button>
            </div>
            <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* ── No-Ledger toggle (shown when feature is ON for this tenant) ── */}
              {devNoLedgerAllowed && (
                <div style={{ padding: "10px 14px", borderRadius: 10, background: form.no_ledger ? "rgba(249,115,22,0.08)" : "rgba(0,0,0,0.15)", border: `1px solid ${form.no_ledger ? "rgba(249,115,22,0.3)" : "var(--glass-border)"}`, transition: "all 0.2s" }}>
                  <Toggle
                    label={
                      <span style={{ fontWeight: 700 }}>
                        Informal / No-Ledger Leave
                        {form.no_ledger && <span style={{ marginLeft: 8, fontSize: "0.7rem", color: "#fb923c", fontWeight: 600 }}>ON — no balance tracking</span>}
                      </span>
                    }
                    checked={form.no_ledger}
                    onChange={(v: boolean) => setForm({ ...form, no_ledger: v })}
                    note={form.no_ledger
                      ? "Employee can apply any time. Approved = no deduction. Rejected = LWP (if unpaid)."
                      : "Turn on for informal/retail leave types that don't use a balance ledger."}
                  />
                </div>
              )}

              {/* Name + frequency — always shown */}
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Leave Name *</label>
                <input className="premium-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Casual Leave" />
                {cat !== "other" && (
                  <div style={{ fontSize: "0.72rem", marginTop: 4, color: CATEGORY_COLORS[cat] }}>
                    Detected as: <strong>{CATEGORY_LABELS[cat]}</strong> — relevant fields are shown below
                  </div>
                )}
              </div>

              {/* Max Days + Frequency + Ledger Cycle — hidden for no-ledger types */}
              {!form.no_ledger && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                      <label>Max Days *</label>
                      <input type="number" className="premium-input" value={form.max_days_per_year} onChange={e => setForm({ ...form, max_days_per_year: e.target.value })} />
                    </div>
                    <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                      <label>Ledger Cycle</label>
                      <select className="premium-input" value={form.ledger_cycle} onChange={e => setForm({ ...form, ledger_cycle: e.target.value })}>
                        <option value="yearly">Yearly (Jan–Dec or Apr–Mar FY)</option>
                        <option value="monthly">Monthly (resets each month)</option>
                        <option value="3monthly">Quarterly (Q1/Q2/Q3/Q4)</option>
                        <option value="6monthly">Half-Yearly (H1/H2)</option>
                      </select>
                    </div>
                  </div>
                  {/* Frequency — only relevant for yearly/monthly (hidden for quarterly/half-yearly which use their own cycle) */}
                  {(form.ledger_cycle === "yearly" || form.ledger_cycle === "monthly") && (
                    <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                      <label>Frequency (how allowance is given)</label>
                      <select className="premium-input" value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}>
                        <option value="yearly">Yearly lump sum</option>
                        <option value="monthly">Monthly increment</option>
                      </select>
                    </div>
                  )}
                </>
              )}

              {/* Basic flags — always shown, but some hidden for no-ledger */}
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", padding: 14, background: "rgba(0,0,0,0.2)", borderRadius: 12, border: "1px solid var(--glass-border)" }}>
                {[
                  { label: "Is Paid",                field: "is_paid" },
                  { label: "Holidays count as leave", field: "count_holidays" },
                  ...(!form.no_ledger ? [{ label: "Allow Carry Forward", field: "allow_carry_forward" }] : []),
                  { label: "Requires Document",      field: "requires_attachment" },
                ].map(({ label, field }) => (
                  <label key={field} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    <input type="checkbox" checked={!!form[field]} onChange={e => setForm({ ...form, [field]: e.target.checked })} style={{ accentColor: "var(--accent-primary)", width: 15, height: 15 }} />
                    {label}
                  </label>
                ))}
              </div>

              {/* Carry forward config — hidden for no-ledger types */}
              {!form.no_ledger && form.allow_carry_forward && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                    <label>Carry Forward %</label>
                    <input type="number" className="premium-input" value={form.carry_forward_percent} onChange={e => setForm({ ...form, carry_forward_percent: e.target.value })} />
                  </div>
                  <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                    <label>Max Accumulation</label>
                    <input type="number" className="premium-input" value={form.max_carry_forward} onChange={e => setForm({ ...form, max_carry_forward: e.target.value })} />
                  </div>
                </div>
              )}

              {/* SL: proof threshold */}
              {form.requires_attachment && (
                <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                  <label>Require document after consecutive days ≥</label>
                  <input type="number" className="premium-input" value={form.requires_attachment_after_days} onChange={e => setForm({ ...form, requires_attachment_after_days: e.target.value })} />
                </div>
              )}

              {/* CL/EL: half day + short leave */}
              {showHalfShort && (
                <>
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12, fontSize: "0.75rem", fontWeight: 700, color: "#818cf8", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Half Day &amp; Short Leave
                  </div>

                  {/* Half-Day */}
                  {devHalfDayAllowed ? (
                    <Toggle
                      label="Allow half day applications"
                      checked={form.half_day_allowed}
                      onChange={(v: boolean) => setForm({ ...form, half_day_allowed: v })} />
                  ) : (
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", opacity: 0.6 }}>🔒 Half-day leave not enabled for this plan</div>
                  )}
                  {form.half_day_allowed && devHalfDayAllowed && (
                    <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                      <label>
                        How many half days = 1 full leave day?
                        {!devSACanConfigPartial && <span style={{ marginLeft: 8, fontSize: "0.7rem", color: "#fb923c" }}>🔒 Fixed by developer at {devDefaultHalfDays}</span>}
                      </label>
                      <input
                        type="number"
                        className="premium-input"
                        value={devSACanConfigPartial ? form.half_days_per_leave : devDefaultHalfDays}
                        min={1}
                        disabled={!devSACanConfigPartial}
                        onChange={e => setForm({ ...form, half_days_per_leave: e.target.value })}
                        style={{ maxWidth: 160, opacity: devSACanConfigPartial ? 1 : 0.55 }} />
                    </div>
                  )}

                  {/* Short Leave */}
                  {devShortLeaveAllowed ? (
                    <Toggle
                      label="Allow short leave (partial hour) applications"
                      checked={form.short_leave_allowed}
                      onChange={(v: boolean) => setForm({ ...form, short_leave_allowed: v })} />
                  ) : (
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", opacity: 0.6 }}>🔒 Short leave not enabled for this plan</div>
                  )}
                  {form.short_leave_allowed && devShortLeaveAllowed && (
                    <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                      <label>
                        How many short leaves = 1 full leave day?
                        {!devSACanConfigPartial && <span style={{ marginLeft: 8, fontSize: "0.7rem", color: "#fb923c" }}>🔒 Fixed by developer at {devDefaultShortLeaves}</span>}
                      </label>
                      <input
                        type="number"
                        className="premium-input"
                        value={devSACanConfigPartial ? form.short_leaves_per_leave : devDefaultShortLeaves}
                        min={1}
                        disabled={!devSACanConfigPartial}
                        onChange={e => setForm({ ...form, short_leaves_per_leave: e.target.value })}
                        style={{ maxWidth: 160, opacity: devSACanConfigPartial ? 1 : 0.55 }} />
                    </div>
                  )}

                  <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                    <label>Max consecutive days (optional)</label>
                    <input type="number" className="premium-input" placeholder="Leave blank = no limit" value={form.max_consecutive_days} onChange={e => setForm({ ...form, max_consecutive_days: e.target.value })} style={{ maxWidth: 200 }} />
                  </div>
                </>
              )}

              {/* EL: accrual */}
              {(cat === "el" || cat === "other") && (
                <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                  <label>Accrual Rate (optional)</label>
                  <input type="number" className="premium-input" placeholder="e.g. 20 (1 EL per 20 worked days)" value={form.accrual_rate} onChange={e => setForm({ ...form, accrual_rate: e.target.value })} />
                </div>
              )}

              {/* CO: expiry + split */}
              {showCOFields && (
                <>
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12, fontSize: "0.75rem", fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Comp Off Settings
                  </div>
                  <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                    <label>Expires after (days)</label>
                    <input type="number" className="premium-input" placeholder="e.g. 30" value={form.co_expiry_days} onChange={e => setForm({ ...form, co_expiry_days: e.target.value })} style={{ maxWidth: 160 }} />
                  </div>
                  <Toggle label="Employee can take Comp Off as half day" checked={form.co_employee_can_split} onChange={(v: boolean) => setForm({ ...form, co_employee_can_split: v })} />
                </>
              )}

              {/* ML note */}
              {showMLFields && (
                <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(236,72,153,0.06)", border: "1px solid rgba(236,72,153,0.2)", fontSize: "0.8rem", color: "#f9a8d4" }}>
                  🌸 Detected as Menstruation Leave. Set frequency to <strong>Monthly</strong> and Max Days to <strong>1</strong>.
                  ML is treated as a standard paid leave — <strong>no hour deductions apply</strong>.
                  Lapse tracking (N unused months → bonus CL) is managed via the developer module config.
                </div>
              )}

              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Deduction Hours per day *</label>
                <input type="number" step="0.5" className="premium-input" value={form.deduction_hours} onChange={e => setForm({ ...form, deduction_hours: e.target.value })} style={{ maxWidth: 160 }} required />
                <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: 4 }}>Typically 8.5 h. For ML: keep at 8.5 (ML has no hour deduction — approved ML days are paid days off).</div>
              </div>

              <button type="submit" className={styles.primaryBtn} disabled={saving} style={{ marginTop: 4 }}>
                {saving ? "Saving…" : "💾 Save Leave Type"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
