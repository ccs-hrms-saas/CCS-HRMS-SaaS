"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Plus, ArrowRight, Check } from "lucide-react";
import type { WeekOffRule } from "@/lib/dateUtils";
import s from "./setup.module.css";

// ── Per-day schedule config ─────────────────────────────────────────────────
type DayMode = "working" | "off" | "partial";
interface DayConfig {
  mode: DayMode;
  weeks: number[]; // which weeks of the month are OFF (only when mode=partial)
}
const ORDINAL_LABELS = ["1st", "2nd", "3rd", "4th", "5th"];

/** Convert 7 DayConfig objects into the flat/rules format for the DB */
function buildWeekOffData(configs: DayConfig[]) {
  const rules: WeekOffRule[] = [];
  const flatOffDays: number[] = [];
  let hasPartial = false;

  configs.forEach((cfg, dow) => {
    if (cfg.mode === "off") {
      rules.push({ day: dow, mode: "all" });
      flatOffDays.push(dow);
    } else if (cfg.mode === "partial" && cfg.weeks.length > 0) {
      rules.push({ day: dow, mode: "specific", weeks: [...cfg.weeks] });
      hasPartial = true;
    }
  });

  return { rules, flatOffDays, hasPartial };
}

/** Derive which days are "working days" from configs (for the workDays label array) */
function deriveWorkDayLabels(configs: DayConfig[]): string[] {
  const labels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  return configs
    .map((cfg, i) => cfg.mode !== "off" ? labels[i] : null)
    .filter(Boolean) as string[];
}

// ── Step definitions ───────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "Welcome",     emoji: "👋" },
  { id: 2, label: "Schedule",   emoji: "🕘" },
  { id: 3, label: "Departments",emoji: "🏢" },
  { id: 4, label: "Leaves",     emoji: "📋" },
  { id: 5, label: "Done",       emoji: "🎉" },
];

const DAYS_SHORT  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_LONG   = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WORK_DAYS   = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Defaults per leave type ────────────────────────────────────────────────
const CL_DEFAULT  = { enabled: true,  days: 10, carry: false, carry_pct: 0,  carry_max: 0,  half: true,  half_per: 2, short: true,  short_per: 4, consec: true,  consec_limit: 2 };
const EL_DEFAULT  = { enabled: false, days: 15, carry: true,  carry_pct: 50, carry_max: 15, half: true,  half_per: 2, short: false, short_per: 4, consec: false, consec_limit: 0, accrual: "" };
const SL_DEFAULT  = { enabled: true,  days: 12, proof_after: 2 };
const ML_DEFAULT  = { enabled: false, per_month: 1, lapse_award: "Comp-Off", lapse_threshold: 4 };
const CO_DEFAULT  = { enabled: false, expiry: 30, employee_split: true };
// LWP is always created, no config

// ── Main Wizard ────────────────────────────────────────────────────────────
export default function SetupWizard() {
  const router = useRouter();
  const [step,    setStep]    = useState(1);
  const [company, setCompany] = useState<{ id: string; name: string } | null>(null);
  const [saving,  setSaving]  = useState(false);

  // ── Step 2 state — Work Schedule ──────────────────────────────────────────
  const [workDays,       setWorkDays]       = useState(["Mon","Tue","Wed","Thu","Fri"]);
  const [startTime,      setStartTime]      = useState("09:00");
  const [endTime,        setEndTime]        = useState("18:00");
  const [graceMinutes,   setGraceMinutes]   = useState("15");
  const [weekOffType,    setWeekOffType]    = useState<"fixed"|"rotating">("fixed");
  const [fixedOffDays,   setFixedOffDays]   = useState<number[]>([0]); // 0=Sun
  const [overtimeTrack,  setOvertimeTrack]  = useState(false);

  // Per-day configurator (Sun=0..Sat=6)
  const [dayConfigs, setDayConfigs] = useState<DayConfig[]>([
    { mode: "off",     weeks: [] }, // Sun — off every week
    { mode: "working", weeks: [] }, // Mon
    { mode: "working", weeks: [] }, // Tue
    { mode: "working", weeks: [] }, // Wed
    { mode: "working", weeks: [] }, // Thu
    { mode: "working", weeks: [] }, // Fri
    { mode: "off",     weeks: [] }, // Sat — off every week by default
  ]);
  // Derived daily working hours — auto-computed when times change, manually overrideable
  const derivedHours = (t1: string, t2: string) => {
    const [h1, m1] = t1.split(":").map(Number);
    const [h2, m2] = t2.split(":").map(Number);
    const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    return diff > 0 ? Math.round(diff / 60 * 10) / 10 : 8.5;
  };
  const [hoursPerDay, setHoursPerDay] = useState<number>(9.0);

  // ── Step 3 state — Departments ────────────────────────────────────────────
  const [departments, setDepartments] = useState([
    { name: "Human Resources" },
    { name: "Operations" },
  ]);

  // ── Step 4 state — Leave Policy ───────────────────────────────────────────
  // 4a: what categories to configure
  const [configLeaves,  setConfigLeaves]  = useState(true);
  const [configWeekOff, setConfigWeekOff] = useState(false);

  // 4b: per-leave-type config
  const [cl, setCl] = useState<any>(CL_DEFAULT);
  const [el, setEl] = useState<any>(EL_DEFAULT);
  const [sl, setSl] = useState<any>(SL_DEFAULT);
  const [ml, setMl] = useState<any>(ML_DEFAULT);
  const [co, setCo] = useState<any>(CO_DEFAULT);

  // Summary
  const [summary, setSummary] = useState({ depts: 0, leaves: 0 });

  // ── Load company ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("company_id, role").eq("id", user.id).single();
      if (!profile?.company_id || profile.role !== "superadmin") { router.push("/dashboard"); return; }
      const { data: co } = await supabase.from("companies").select("id, name, setup_completed").eq("id", profile.company_id).single();
      if (!co) { router.push("/dashboard"); return; }
      if (co.setup_completed) { router.push("/dashboard"); return; }
      setCompany({ id: co.id, name: co.name });
    }
    init();
  }, [router]);

  // ── Helpers — work days ────────────────────────────────────────────────────
  function toggleWorkDay(day: string) {
    setWorkDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  }
  function toggleFixedOffDay(dow: number) {
    setFixedOffDays(prev => prev.includes(dow) ? prev.filter(d => d !== dow) : [...prev, dow]);
  }
  function updateDayConfig(dow: number, update: Partial<DayConfig>) {
    setDayConfigs(prev => prev.map((c, i) => i === dow ? { ...c, ...update } : c));
  }
  function togglePartialWeek(dow: number, weekNum: number) {
    setDayConfigs(prev => prev.map((c, i) => {
      if (i !== dow) return c;
      const weeks = c.weeks.includes(weekNum)
        ? c.weeks.filter(w => w !== weekNum)
        : [...c.weeks, weekNum].sort();
      return { ...c, weeks };
    }));
  }

  // ── Helpers — departments ─────────────────────────────────────────────────
  const addDept    = () => setDepartments(prev => [...prev, { name: "" }]);
  const removeDept = (i: number) => setDepartments(prev => prev.filter((_, idx) => idx !== i));
  const updateDept = (i: number, val: string) => setDepartments(prev => prev.map((d, idx) => idx === i ? { name: val } : d));

  // ── Save Step 2 ────────────────────────────────────────────────────────────
  async function saveSchedule() {
    if (!company) return;
    const { rules, flatOffDays, hasPartial } = buildWeekOffData(dayConfigs);
    const derivedWorkDays = deriveWorkDayLabels(dayConfigs);
    await supabase.from("app_settings").upsert({
      company_id:            company.id,
      work_days:             derivedWorkDays,
      work_start:            startTime,
      work_end:              endTime,
      grace_minutes:         parseInt(graceMinutes) || 15,
      week_off_type:         weekOffType,
      week_off_days:         flatOffDays,
      week_off_rules:        rules,
      overtime_tracking:     overtimeTrack,
      hours_per_day:         hoursPerDay,
      hours_per_day_set_at:  new Date().toISOString(),
    }, { onConflict: "company_id" });
  }

  // ── Save Step 3 ────────────────────────────────────────────────────────────
  async function saveDepartments() {
    if (!company) return;
    const valid = departments.filter(d => d.name.trim());
    await supabase.from("departments").delete().eq("company_id", company.id);
    if (valid.length > 0) {
      await supabase.from("departments").insert(valid.map(d => ({ company_id: company.id, name: d.name.trim() })));
    }
  }

  // ── Save Step 4 ────────────────────────────────────────────────────────────
  async function saveLeaveTypes() {
    if (!company) return;
    await supabase.from("leave_types").delete().eq("company_id", company.id);

    const rows: any[] = [];

    if (cl.enabled) rows.push({
      company_id:             company.id,
      name:                   "Casual Leave",
      max_days_per_year:      cl.days,
      frequency:              "yearly",
      is_paid:                true,
      deduction_hours:        hoursPerDay,
      allow_carry_forward:    cl.carry,
      carry_forward_percent:  cl.carry_pct,
      max_carry_forward:      cl.carry_max,
      half_day_allowed:       cl.half,
      half_days_per_leave:    cl.half_per,
      short_leave_allowed:    cl.short,
      short_leaves_per_leave: cl.short_per,
      max_consecutive_days:   cl.consec ? cl.consec_limit : null,
      eligible_for_deficit_adj: true,
      counts_as_lwp_for_payroll: false,
      is_ml_type:             false,
    });

    if (el.enabled) rows.push({
      company_id:             company.id,
      name:                   "Earned Leave",
      max_days_per_year:      el.days,
      frequency:              "yearly",
      is_paid:                true,
      deduction_hours:        hoursPerDay,
      allow_carry_forward:    el.carry,
      carry_forward_percent:  el.carry_pct,
      max_carry_forward:      el.carry_max,
      half_day_allowed:       el.half,
      half_days_per_leave:    el.half_per,
      short_leave_allowed:    el.short,
      short_leaves_per_leave: el.short_per,
      max_consecutive_days:   el.consec ? el.consec_limit : null,
      accrual_rate:           el.accrual !== "" ? Number(el.accrual) : null,
      eligible_for_deficit_adj: true,
      counts_as_lwp_for_payroll: false,
      is_ml_type:             false,
    });

    if (sl.enabled) rows.push({
      company_id:                    company.id,
      name:                          "Sick Leave",
      max_days_per_year:             sl.days,
      frequency:                     "yearly",
      is_paid:                       true,
      deduction_hours:               hoursPerDay,
      requires_attachment:           sl.proof_after > 0,
      requires_attachment_after_days: sl.proof_after,
      eligible_for_deficit_adj:      false,
      counts_as_lwp_for_payroll:     false,
      is_ml_type:                    false,
    });

    if (ml.enabled) rows.push({
      company_id:             company.id,
      name:                   "Menstruation Leave",
      max_days_per_year:      ml.per_month,
      frequency:              "monthly",
      is_paid:                true,
      deduction_hours:        1.0,
      is_ml_type:             true,
      eligible_for_deficit_adj: false,
      counts_as_lwp_for_payroll: false,
    });

    if (co.enabled) rows.push({
      company_id:           company.id,
      name:                 "Comp-Off",
      max_days_per_year:    0,
      frequency:            "yearly",
      is_paid:              true,
      deduction_hours:      hoursPerDay,
      expires_in_days:      co.expiry,
      co_employee_can_split: co.employee_split,
      half_day_allowed:     co.employee_split,
      half_days_per_leave:  2,
      eligible_for_deficit_adj: false,
      counts_as_lwp_for_payroll: false,
      is_ml_type:           false,
    });

    // LWP — always created
    rows.push({
      company_id:                company.id,
      name:                      "Leave Without Pay",
      max_days_per_year:         365,
      frequency:                 "yearly",
      is_paid:                   false,
      deduction_hours:           hoursPerDay,
      counts_as_lwp_for_payroll: true,
      eligible_for_deficit_adj:  false,
      is_ml_type:                false,
    });

    if (rows.length > 0) await supabase.from("leave_types").insert(rows);
  }

  // ── Next handler ───────────────────────────────────────────────────────────
  async function handleNext() {
    setSaving(true);
    try {
      if (step === 2) await saveSchedule();
      if (step === 3) {
        await saveDepartments();
        setSummary(s => ({ ...s, depts: departments.filter(d => d.name.trim()).length }));
      }
      if (step === 4) {
        await saveLeaveTypes();
        setSummary(s => ({ ...s, leaves: [cl, el, sl, ml, co].filter(x => x.enabled).length + 1 /* LWP */ }));
      }
      setStep(prev => prev + 1);
    } finally { setSaving(false); }
  }

  async function completeSetup() {
    if (!company) return;
    setSaving(true);
    await supabase.from("companies").update({ setup_completed: true }).eq("id", company.id);
    setSaving(false);
    sessionStorage.setItem("setup_just_completed", "1");
    router.push("/dashboard");
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!company) return (
    <div className={s.root}><div style={{ color: "#334155", marginTop: 120 }}>Loading your workspace…</div></div>
  );

  // ── Small helpers for the form ────────────────────────────────────────────
  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: 0.6, color: "#6366f1", textTransform: "uppercase", marginBottom: 10, marginTop: 18 }}>
      {children}
    </div>
  );

  const Toggle = ({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, fontSize: "0.88rem", color: "#cbd5e1" }}>
      <div onClick={() => !disabled && onChange(!checked)} style={{
        width: 38, height: 20, borderRadius: 10, background: checked ? "#6366f1" : "rgba(255,255,255,0.1)",
        position: "relative", transition: "background 0.2s", cursor: disabled ? "not-allowed" : "pointer", flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", top: 2, left: checked ? 20 : 2, width: 16, height: 16,
          borderRadius: "50%", background: "#fff", transition: "left 0.2s",
        }} />
      </div>
      {label}
    </label>
  );

  const NumInput = ({ label, value, onChange, min, max, note }: any) => (
    <div className={s.fieldGroup} style={{ marginBottom: 0 }}>
      <label className={s.label}>{label}</label>
      <input type="number" className={s.input} value={value} min={min} max={max}
        onChange={e => onChange(Number(e.target.value))} style={{ maxWidth: 140 }} />
      {note && <div style={{ fontSize: "0.7rem", color: "#475569", marginTop: 4 }}>{note}</div>}
    </div>
  );

  const LeaveCard = ({ icon, title, checked, onToggle, children }: any) => (
    <div style={{ border: `1px solid ${checked ? "rgba(99,102,241,0.35)" : "rgba(255,255,255,0.07)"}`, borderRadius: 14, overflow: "hidden", marginBottom: 10, transition: "border-color 0.2s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: checked ? "rgba(99,102,241,0.07)" : "rgba(255,255,255,0.02)", cursor: "pointer" }} onClick={() => onToggle(!checked)}>
        <div style={{ fontSize: "1.3rem" }}>{icon}</div>
        <div style={{ flex: 1, fontWeight: 700, fontSize: "0.9rem", color: "#e2e8f0" }}>{title}</div>
        <div style={{
          width: 38, height: 20, borderRadius: 10, background: checked ? "#6366f1" : "rgba(255,255,255,0.1)",
          position: "relative", transition: "background 0.2s", flexShrink: 0,
        }}>
          <div style={{ position: "absolute", top: 2, left: checked ? 20 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
        </div>
      </div>
      {checked && (
        <div style={{ padding: "16px 18px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", gap: 14 }}>
          {children}
        </div>
      )}
    </div>
  );

  return (
    <div className={s.root}>
      <div className={s.brand}>CCS HRMS</div>

      {/* Stepper */}
      <div className={s.stepper}>
        {STEPS.map(st => (
          <div key={st.id} className={`${s.stepItem} ${st.id === step ? s.active : ""} ${st.id < step ? s.done : ""}`}>
            <div className={s.stepDot}>{st.id < step ? <Check size={14} /> : st.emoji}</div>
            <div className={s.stepLabel}>{st.label}</div>
          </div>
        ))}
      </div>

      {/* ── STEP 1: Welcome ────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className={s.card}>
          <div className={s.cardHead}>
            <div className={s.stepNumber}>Step 1 of 4</div>
            <h1 className={s.stepTitle}>Welcome to CCS HRMS, {company.name}! 👋</h1>
            <p className={s.stepDesc}>Let's set up your workspace in 4 quick steps. This takes about 5 minutes.</p>
          </div>
          <hr className={s.cardDivider} />
          <div className={s.cardBody}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { emoji: "🕘", title: "Work Schedule", desc: "Working hours, week off, grace period" },
                { emoji: "🏢", title: "Departments",   desc: "Add your organisation's departments" },
                { emoji: "📋", title: "Leave Policy",  desc: "Configure each leave type in detail" },
              ].map(item => (
                <div key={item.title} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "18px 16px", textAlign: "center" }}>
                  <div style={{ fontSize: "1.8rem", marginBottom: 8 }}>{item.emoji}</div>
                  <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "0.9rem", marginBottom: 4 }}>{item.title}</div>
                  <div style={{ fontSize: "0.78rem", color: "#475569" }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div className={s.cardFoot}>
            <span />
            <button className={s.nextBtn} onClick={() => setStep(2)}>Let's Begin <ArrowRight size={16} /></button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Work Schedule ──────────────────────────────────────────── */}
      {step === 2 && (
        <div className={s.card}>
          <div className={s.cardHead}>
            <div className={s.stepNumber}>Step 2 of 4</div>
            <h1 className={s.stepTitle}>Work Schedule 🕘</h1>
            <p className={s.stepDesc}>Define working hours, week off policy, and grace period.</p>
          </div>
          <hr className={s.cardDivider} />
          <div className={s.cardBody}>

            {/* ── Per-Day Schedule Configurator ────────────────────────── */}
            <SectionLabel>Weekly Schedule</SectionLabel>
            <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: 12, lineHeight: 1.5 }}>
              Configure each day of the week. For each day, choose:<br />
              <strong style={{ color: "#818cf8" }}>Working</strong> = open every week &nbsp;|&nbsp;
              <strong style={{ color: "#f87171" }}>Off</strong> = closed every week &nbsp;|&nbsp;
              <strong style={{ color: "#f59e0b" }}>Partial</strong> = off only on specific weeks of the month
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              {DAYS_LONG.map((dayName, dow) => {
                const cfg = dayConfigs[dow];
                const shortName = DAYS_SHORT[dow];
                return (
                  <div key={dow} style={{
                    padding: "10px 14px", borderRadius: 12,
                    border: `1px solid ${cfg.mode === "off" ? "rgba(248,113,113,0.25)" : cfg.mode === "partial" ? "rgba(245,158,11,0.25)" : "rgba(99,102,241,0.2)"}`,
                    background: cfg.mode === "off" ? "rgba(248,113,113,0.05)" : cfg.mode === "partial" ? "rgba(245,158,11,0.05)" : "rgba(99,102,241,0.04)",
                    transition: "all 0.2s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {/* Day name */}
                      <div style={{
                        minWidth: 90, fontWeight: 700, fontSize: "0.88rem",
                        color: cfg.mode === "off" ? "#f87171" : cfg.mode === "partial" ? "#f59e0b" : "#818cf8"
                      }}>
                        {dayName}
                      </div>

                      {/* Mode toggles */}
                      <div style={{ display: "flex", gap: 6, flex: 1 }}>
                        {(["working", "off", "partial"] as DayMode[]).map(mode => {
                          const isActive = cfg.mode === mode;
                          const label = mode === "working" ? "✓ Working" : mode === "off" ? "✗ Off" : "⊕ Partial";
                          const colors: Record<string, { bg: string; border: string; text: string }> = {
                            working: { bg: "rgba(99,102,241,0.15)", border: "rgba(99,102,241,0.5)", text: "#818cf8" },
                            off:     { bg: "rgba(248,113,113,0.15)", border: "rgba(248,113,113,0.5)", text: "#f87171" },
                            partial: { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.5)", text: "#f59e0b" },
                          };
                          const c = colors[mode];
                          return (
                            <div key={mode} onClick={() => updateDayConfig(dow, { mode, weeks: mode === "off" ? [] : cfg.weeks })} style={{
                              padding: "4px 12px", borderRadius: 8, cursor: "pointer", fontSize: "0.75rem", fontWeight: 600,
                              transition: "all 0.2s", whiteSpace: "nowrap",
                              border: `1px solid ${isActive ? c.border : "rgba(255,255,255,0.06)"}`,
                              background: isActive ? c.bg : "transparent",
                              color: isActive ? c.text : "#475569",
                            }}>
                              {label}
                            </div>
                          );
                        })}
                      </div>

                      {/* Summary badge */}
                      <div style={{ fontSize: "0.7rem", color: "#64748b", minWidth: 100, textAlign: "right" }}>
                        {cfg.mode === "working" && "Every week"}
                        {cfg.mode === "off" && "Every week off"}
                        {cfg.mode === "partial" && cfg.weeks.length > 0 && `${cfg.weeks.map(w => ORDINAL_LABELS[w-1]).join(", ")} off`}
                        {cfg.mode === "partial" && cfg.weeks.length === 0 && <span style={{ color: "#f59e0b" }}>Select weeks ↓</span>}
                      </div>
                    </div>

                    {/* Partial — week selector */}
                    {cfg.mode === "partial" && (
                      <div style={{ marginTop: 8, paddingLeft: 100, display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: "0.72rem", color: "#64748b", marginRight: 4 }}>Off on:</span>
                        {ORDINAL_LABELS.map((label, idx) => {
                          const weekNum = idx + 1;
                          const selected = cfg.weeks.includes(weekNum);
                          return (
                            <div key={weekNum} onClick={() => togglePartialWeek(dow, weekNum)} style={{
                              padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontSize: "0.72rem", fontWeight: 600,
                              transition: "all 0.15s",
                              border: `1px solid ${selected ? "rgba(245,158,11,0.5)" : "rgba(255,255,255,0.08)"}`,
                              background: selected ? "rgba(245,158,11,0.15)" : "transparent",
                              color: selected ? "#f59e0b" : "#475569",
                            }}>
                              {label} {shortName}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Hours + Grace */}
            <SectionLabel>Office Timing</SectionLabel>
            <div className={s.formRow} style={{ marginTop: 4 }}>
              <div className={s.fieldGroup}>
                <label className={s.label}>Office Start Time</label>
                <input type="time" className={s.input} value={startTime} onChange={e => {
                  setStartTime(e.target.value);
                  setHoursPerDay(derivedHours(e.target.value, endTime));
                }} />
              </div>
              <div className={s.fieldGroup}>
                <label className={s.label}>Office End Time</label>
                <input type="time" className={s.input} value={endTime} onChange={e => {
                  setEndTime(e.target.value);
                  setHoursPerDay(derivedHours(startTime, e.target.value));
                }} />
              </div>
              <div className={s.fieldGroup}>
                <label className={s.label}>Grace Period (minutes)</label>
                <input type="number" className={s.input} value={graceMinutes} min={0} max={60} onChange={e => setGraceMinutes(e.target.value)} />
              </div>
            </div>

            {/* Daily Working Hours — derived + confirmable */}
            <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 12, background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)" }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#818cf8", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.7 }}>Daily Working Hours Target</div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div className={s.fieldGroup} style={{ marginBottom: 0, flex: "0 0 140px" }}>
                  <input type="number" className={s.input} value={hoursPerDay} min={1} max={16} step={0.5}
                    onChange={e => setHoursPerDay(Number(e.target.value) || 8.5)} />
                </div>
                <div style={{ fontSize: "0.78rem", color: "#64748b", lineHeight: 1.5 }}>
                  Auto-computed from <strong style={{ color: "#94a3b8" }}>{startTime}–{endTime}</strong> as <strong style={{ color: "#818cf8" }}>{derivedHours(startTime, endTime)}h</strong>.<br />
                  Adjust if employees have a lunch break not counted as work time.<br />
                  <span style={{ color: "#f59e0b" }}>⚠ This value locks for 90 days on Basic plans after setup.</span>
                </div>
              </div>
            </div>

            {/* Week Off Mode — Fixed vs Rotating */}
            <SectionLabel>Employee Week-Off Assignment</SectionLabel>
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              {(["fixed", "rotating"] as const).map(type => (
                <div key={type} onClick={() => setWeekOffType(type)} style={{
                  flex: 1, padding: "12px 16px", borderRadius: 12, cursor: "pointer", textAlign: "center", transition: "all 0.2s",
                  border: `1px solid ${weekOffType === type ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.08)"}`,
                  background: weekOffType === type ? "rgba(99,102,241,0.1)" : "transparent",
                  color: weekOffType === type ? "#818cf8" : "#64748b", fontWeight: 600, fontSize: "0.85rem",
                }}>
                  {type === "fixed" ? "🗓️ Same for All" : "🔄 Per Employee"}
                  <div style={{ fontSize: "0.7rem", fontWeight: 400, marginTop: 4, color: "#475569" }}>
                    {type === "fixed" ? "The schedule above applies to everyone" : "Each employee can have a different off day"}
                  </div>
                </div>
              ))}
            </div>

            {weekOffType === "rotating" && (
              <div style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", fontSize: "0.83rem", color: "#94a3b8", lineHeight: 1.6 }}>
                ℹ️ The weekly schedule above sets the <strong>default</strong>. For rotating off days, you assign each employee&apos;s personal off day when you create them. You can change it anytime from their profile.
              </div>
            )}

            {/* Overtime */}
            <SectionLabel>Overtime</SectionLabel>
            <Toggle
              label="Track overtime hours (superadmin view only — never shown to employees)"
              checked={overtimeTrack}
              onChange={setOvertimeTrack}
            />
            {overtimeTrack && (
              <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 6, paddingLeft: 48 }}>
                Overtime = time worked beyond <strong>{endTime}</strong>. Grace period does not apply.
              </div>
            )}
          </div>
          <div className={s.cardFoot}>
            <button className={s.backBtn} onClick={() => setStep(1)}>Back</button>
            <button className={s.nextBtn} onClick={handleNext} disabled={saving || dayConfigs.every(c => c.mode === "off")}>
              {saving ? "Saving…" : <><span>Save & Continue</span> <ArrowRight size={16} /></>}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Departments ────────────────────────────────────────────── */}
      {step === 3 && (
        <div className={s.card}>
          <div className={s.cardHead}>
            <div className={s.stepNumber}>Step 3 of 4</div>
            <h1 className={s.stepTitle}>Departments 🏢</h1>
            <p className={s.stepDesc}>Add your organisation's departments. Employees will be assigned when you create them.</p>
          </div>
          <hr className={s.cardDivider} />
          <div className={s.cardBody}>
            <div className={s.deptList}>
              {departments.map((d, i) => (
                <div key={i} className={s.deptRow}>
                  <input className={s.input} value={d.name} onChange={e => updateDept(i, e.target.value)} placeholder={`Department ${i + 1}`} />
                  <button className={s.removeBtn} onClick={() => removeDept(i)}>✕</button>
                </div>
              ))}
              <button className={s.addBtn} onClick={addDept}><Plus size={14} /> Add Department</button>
            </div>
          </div>
          <div className={s.cardFoot}>
            <button className={s.backBtn} onClick={() => setStep(2)}>Back</button>
            <button className={s.nextBtn} onClick={handleNext} disabled={saving || departments.filter(d => d.name.trim()).length === 0}>
              {saving ? "Saving…" : <><span>Save & Continue</span> <ArrowRight size={16} /></>}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Leave Policy ───────────────────────────────────────────── */}
      {step === 4 && (
        <div className={s.card} style={{ maxWidth: 780 }}>
          <div className={s.cardHead}>
            <div className={s.stepNumber}>Step 4 of 4</div>
            <h1 className={s.stepTitle}>Leave Policy 📋</h1>
            <p className={s.stepDesc}>Configure exactly what you offer. Enable only the leave types that apply to your organisation.</p>
          </div>
          <hr className={s.cardDivider} />
          <div className={s.cardBody}>

            {/* ── Phase 4a: What to configure ─────────────────────────────── */}
            <SectionLabel>What does your organisation offer?</SectionLabel>
            <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
              {[
                { key: "leaves",  label: "📋 Standard Leaves",  desc: "CL, EL, SL, ML, CO etc.", checked: configLeaves,  set: setConfigLeaves },
                { key: "weekoff", label: "🗓️ Week Off",          desc: weekOffType === "fixed" ? `Fixed — ${fixedOffDays.map(d => DAYS_LONG[d]).join(", ")}` : "Rotating — assigned per employee", checked: configWeekOff, set: setConfigWeekOff },
              ].map(item => (
                <div key={item.key} onClick={() => item.set(!item.checked)} style={{
                  flex: 1, minWidth: 180, padding: "12px 16px", borderRadius: 12, cursor: "pointer", transition: "all 0.2s",
                  border: `1px solid ${item.checked ? "rgba(99,102,241,0.45)" : "rgba(255,255,255,0.08)"}`,
                  background: item.checked ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.02)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: 4, border: `2px solid ${item.checked ? "#6366f1" : "#475569"}`,
                      background: item.checked ? "#6366f1" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      {item.checked && <Check size={11} color="#fff" />}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: "0.88rem", color: item.checked ? "#818cf8" : "#94a3b8" }}>{item.label}</span>
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#475569", marginTop: 6, paddingLeft: 26 }}>{item.desc}</div>
                </div>
              ))}
            </div>

            {/* ── Phase 4b: Week Off confirmation ─────────────────────────── */}
            {configWeekOff && (
              <div style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", fontSize: "0.83rem", color: "#94a3b8", marginBottom: 16 }}>
                ✅ <strong style={{ color: "#818cf8" }}>Week Off</strong> was configured in Step 2:{" "}
                {weekOffType === "fixed"
                  ? `Fixed — ${fixedOffDays.map(d => DAYS_LONG[d]).join(" & ")}`
                  : "Rotating — assign each employee's day when you create them"}
                <div style={{ fontSize: "0.7rem", marginTop: 4 }}>You can change this any time from Leave Settings.</div>
              </div>
            )}

            {/* ── Phase 4b: Standard Leaves ────────────────────────────────── */}
            {configLeaves && (
              <>
                {/* CL */}
                <LeaveCard icon="🏖️" title="Casual Leave (CL)" checked={cl.enabled} onToggle={(v: boolean) => setCl({ ...cl, enabled: v })}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <NumInput label="Days per year" value={cl.days} onChange={(v: number) => setCl({ ...cl, days: v })} min={1} />
                    <NumInput label="Max consecutive CL days" value={cl.consec_limit} onChange={(v: number) => setCl({ ...cl, consec_limit: v })} min={1} />
                  </div>
                  <Toggle label="Allow carry forward" checked={cl.carry} onChange={v => setCl({ ...cl, carry: v })} />
                  {cl.carry && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, paddingLeft: 48 }}>
                      <NumInput label="Carry forward %" value={cl.carry_pct} onChange={(v: number) => setCl({ ...cl, carry_pct: v })} min={0} max={100} />
                      <NumInput label="Max carry forward days" value={cl.carry_max} onChange={(v: number) => setCl({ ...cl, carry_max: v })} min={0} />
                    </div>
                  )}
                  <Toggle label="Allow half day CL" checked={cl.half} onChange={v => setCl({ ...cl, half: v })} />
                  {cl.half && <NumInput label="Half days = 1 CL" value={cl.half_per} onChange={(v: number) => setCl({ ...cl, half_per: v })} min={1} note="e.g. 2 means 2 half days consume 1 CL" />}
                  <Toggle label="Allow short leave against CL" checked={cl.short} onChange={v => setCl({ ...cl, short: v })} />
                  {cl.short && <NumInput label="Short leaves = 1 CL" value={cl.short_per} onChange={(v: number) => setCl({ ...cl, short_per: v })} min={1} note="e.g. 4 means 4 short leaves consume 1 CL" />}
                </LeaveCard>

                {/* EL */}
                <LeaveCard icon="🌴" title="Earned / Annual Leave (EL)" checked={el.enabled} onToggle={(v: boolean) => setEl({ ...el, enabled: v })}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <NumInput label="Days per year" value={el.days} onChange={(v: number) => setEl({ ...el, days: v })} min={1} />
                    <div className={s.fieldGroup} style={{ marginBottom: 0 }}>
                      <label className={s.label}>Accrual rate (optional)</label>
                      <input type="number" className={s.input} placeholder="e.g. 20" value={el.accrual}
                        onChange={e => setEl({ ...el, accrual: e.target.value })} />
                      <div style={{ fontSize: "0.7rem", color: "#475569", marginTop: 4 }}>Worked days needed to earn 1 EL. Leave blank for upfront grant.</div>
                    </div>
                  </div>
                  <Toggle label="Allow carry forward" checked={el.carry} onChange={v => setEl({ ...el, carry: v })} />
                  {el.carry && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, paddingLeft: 48 }}>
                      <NumInput label="Carry forward %" value={el.carry_pct} onChange={(v: number) => setEl({ ...el, carry_pct: v })} min={0} max={100} />
                      <NumInput label="Max carry forward days" value={el.carry_max} onChange={(v: number) => setEl({ ...el, carry_max: v })} min={0} />
                    </div>
                  )}
                  <Toggle label="Allow half day EL" checked={el.half} onChange={v => setEl({ ...el, half: v })} />
                  {el.half && <NumInput label="Half days = 1 EL" value={el.half_per} onChange={(v: number) => setEl({ ...el, half_per: v })} min={1} note="e.g. 2 means 2 half days consume 1 EL" />}
                  <Toggle label="Allow short leave against EL" checked={el.short} onChange={v => setEl({ ...el, short: v })} />
                  {el.short && <NumInput label="Short leaves = 1 EL" value={el.short_per} onChange={(v: number) => setEl({ ...el, short_per: v })} min={1} />}
                </LeaveCard>

                {/* SL */}
                <LeaveCard icon="🤒" title="Sick Leave (SL)" checked={sl.enabled} onToggle={(v: boolean) => setSl({ ...sl, enabled: v })}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <NumInput label="Days per year" value={sl.days} onChange={(v: number) => setSl({ ...sl, days: v })} min={1} />
                    <NumInput label="Medical proof required after (days)" value={sl.proof_after} onChange={(v: number) => setSl({ ...sl, proof_after: v })} min={0} note="0 = always required" />
                  </div>
                </LeaveCard>

                {/* ML */}
                <LeaveCard icon="🌸" title="Menstruation Leave (ML)" checked={ml.enabled} onToggle={(v: boolean) => setMl({ ...ml, enabled: v })}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <NumInput label="Days per month" value={ml.per_month} onChange={(v: number) => setMl({ ...ml, per_month: v })} min={1} />
                    <NumInput label="Unused ML lapses after (months)" value={ml.lapse_threshold} onChange={(v: number) => setMl({ ...ml, lapse_threshold: v })} min={1} />
                  </div>
                  <div className={s.fieldGroup} style={{ marginBottom: 0 }}>
                    <label className={s.label}>Lapsed ML awarded as</label>
                    <select className={s.input} value={ml.lapse_award} onChange={e => setMl({ ...ml, lapse_award: e.target.value })}>
                      <option value="Comp-Off">Comp-Off</option>
                      <option value="Cash">Cash payout</option>
                      <option value="None">Lapses with no award</option>
                    </select>
                  </div>
                </LeaveCard>

                {/* CO */}
                <LeaveCard icon="🔄" title="Comp Off (CO)" checked={co.enabled} onToggle={(v: boolean) => setCo({ ...co, enabled: v })}>
                  <NumInput label="Comp Off expires after (days)" value={co.expiry} onChange={(v: number) => setCo({ ...co, expiry: v })} min={1} note="Days from date of earning. After this it lapses." />
                  <Toggle label="Employee can take Comp Off as half day" checked={co.employee_split} onChange={v => setCo({ ...co, employee_split: v })} />
                </LeaveCard>

                {/* LWP — always ON notice */}
                <div style={{ padding: "11px 16px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: 12, fontSize: "0.83rem", color: "#64748b" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(99,102,241,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>🔒</div>
                  <div><strong style={{ color: "#94a3b8" }}>Leave Without Pay (LWP)</strong> — always included automatically. No configuration needed.</div>
                </div>
              </>
            )}
          </div>
          <div className={s.cardFoot}>
            <button className={s.backBtn} onClick={() => setStep(3)}>Back</button>
            <button className={s.nextBtn} onClick={handleNext} disabled={saving || (!configLeaves && !configWeekOff)}>
              {saving ? "Saving…" : <><span>Finish Setup</span> <Check size={16} /></>}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 5: Complete ───────────────────────────────────────────────── */}
      {step === 5 && (
        <div className={s.card}>
          <div className={s.cardBody} style={{ paddingTop: 40, paddingBottom: 40 }}>
            <div className={s.completionCard}>
              <div className={s.checkIcon}>🎉</div>
              <div className={s.completionTitle}>{company.name} is ready!</div>
              <div className={s.completionSub}>Your workspace has been fully configured.</div>
              <div className={s.completionGrid}>
                <div className={s.completionStat}><div className={s.completionStatValue}>{workDays.length}</div><div className={s.completionStatLabel}>Working Days / Week</div></div>
                <div className={s.completionStat}><div className={s.completionStatValue}>{summary.depts}</div><div className={s.completionStatLabel}>Departments Created</div></div>
                <div className={s.completionStat}><div className={s.completionStatValue}>{summary.leaves}</div><div className={s.completionStatLabel}>Leave Types</div></div>
                <div className={s.completionStat}><div className={s.completionStatValue}>{weekOffType === "fixed" ? fixedOffDays.map(d => DAYS_SHORT[d]).join("+") : "Rotating"}</div><div className={s.completionStatLabel}>Week Off Mode</div></div>
              </div>
              <div style={{ fontSize: "0.88rem", color: "#475569", marginTop: 20, lineHeight: 1.6 }}>
                Next: Go to your dashboard → create employees{weekOffType === "rotating" ? " (you'll assign each employee's off day there)" : ""},<br />
                assign them to departments, and start tracking attendance.
              </div>
              <button className={s.goDashBtn} onClick={completeSetup} disabled={saving}>
                {saving ? "Saving…" : "Go to Dashboard →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
