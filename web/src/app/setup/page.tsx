"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Plus, ArrowRight, Check } from "lucide-react";
import s from "./setup.module.css";

// ── Step definitions ───────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "Welcome",    emoji: "👋" },
  { id: 2, label: "Schedule",   emoji: "🕘" },
  { id: 3, label: "Departments",emoji: "🏢" },
  { id: 4, label: "Leaves",     emoji: "📋" },
  { id: 5, label: "Done",       emoji: "🎉" },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DEFAULT_LEAVE_TYPES = [
  { name: "Sick Leave",    max_days: 12, is_paid: true  },
  { name: "Casual Leave",  max_days: 10, is_paid: true  },
  { name: "Annual Leave",  max_days: 15, is_paid: true  },
  { name: "Unpaid Leave",  max_days: 0,  is_paid: false },
];

// ── Main Wizard ────────────────────────────────────────────────────────────
export default function SetupWizard() {
  const router = useRouter();
  const [step,      setStep]      = useState(1);
  const [company,   setCompany]   = useState<{ id: string; name: string } | null>(null);
  const [saving,    setSaving]    = useState(false);

  // Step 2 — Work schedule
  const [workDays,      setWorkDays]      = useState(["Mon","Tue","Wed","Thu","Fri"]);
  const [startTime,     setStartTime]     = useState("09:00");
  const [endTime,       setEndTime]       = useState("18:00");
  const [graceMinutes,  setGraceMinutes]  = useState("15");

  // Step 3 — Departments
  const [departments, setDepartments] = useState([
    { name: "Human Resources" },
    { name: "Operations" },
  ]);

  // Step 4 — Leave types
  const [leaveTypes, setLeaveTypes] = useState(DEFAULT_LEAVE_TYPES);

  // Summary counters for completion screen
  const [summary, setSummary] = useState({ depts: 0, leaves: 0 });

  // ── Load current company ─────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, role")
        .eq("id", user.id)
        .single();

      if (!profile?.company_id || profile.role !== "superadmin") {
        router.push("/dashboard");
        return;
      }

      const { data: co } = await supabase
        .from("companies")
        .select("id, name, setup_completed")
        .eq("id", profile.company_id)
        .single();

      if (!co) { router.push("/dashboard"); return; }
      if (co.setup_completed) { router.push("/dashboard"); return; }
      setCompany({ id: co.id, name: co.name });
    }
    init();
  }, [router]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function toggleDay(day: string) {
    setWorkDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }

  function addDept() {
    setDepartments(prev => [...prev, { name: "" }]);
  }

  function removeDept(i: number) {
    setDepartments(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateDept(i: number, val: string) {
    setDepartments(prev => prev.map((d, idx) => idx === i ? { name: val } : d));
  }

  function updateLeave(i: number, field: string, val: string | boolean) {
    setLeaveTypes(prev => prev.map((lt, idx) => idx === i ? { ...lt, [field]: val } : lt));
  }

  function addLeave() {
    setLeaveTypes(prev => [...prev, { name: "", max_days: 6, is_paid: true }]);
  }

  // ── Save each step ────────────────────────────────────────────────────────
  async function saveSchedule() {
    if (!company) return;
    await supabase.from("app_settings").upsert({
      company_id:    company.id,
      work_days:     workDays,
      work_start:    startTime,
      work_end:      endTime,
      grace_minutes: parseInt(graceMinutes) || 15,
    }, { onConflict: "company_id" });
  }

  async function saveDepartments() {
    if (!company) return;
    const valid = departments.filter(d => d.name.trim());
    // Delete old, insert new
    await supabase.from("departments").delete().eq("company_id", company.id);
    if (valid.length > 0) {
      await supabase.from("departments").insert(
        valid.map(d => ({ company_id: company.id, name: d.name.trim() }))
      );
    }
  }

  async function saveLeaveTypes() {
    if (!company) return;
    const valid = leaveTypes.filter(l => l.name.trim());
    // Delete the two seeded defaults, re-insert all from wizard
    await supabase.from("leave_types").delete().eq("company_id", company.id);
    if (valid.length > 0) {
      await supabase.from("leave_types").insert(
        valid.map(l => ({
          company_id:       company.id,
          name:             l.name.trim(),
          max_days_per_year:l.max_days,
          is_paid:          l.is_paid,
          deduction_hours:  8.5,
        }))
      );
    }
  }

  async function completeSetup() {
    if (!company) return;
    setSaving(true);
    await supabase
      .from("companies")
      .update({ setup_completed: true })
      .eq("id", company.id);
    setSaving(false);
    // Tell the dashboard layout to skip the setup check on next load
    sessionStorage.setItem("setup_just_completed", "1");
    router.push("/dashboard");
  }

  // ── Next step handler ─────────────────────────────────────────────────────
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
        setSummary(s => ({ ...s, leaves: leaveTypes.filter(l => l.name.trim()).length }));
      }
      setStep(prev => prev + 1);
    } finally {
      setSaving(false);
    }
  }

  if (!company) {
    return (
      <div className={s.root}>
        <div style={{ color: "#334155", marginTop: 120 }}>Loading your workspace…</div>
      </div>
    );
  }

  return (
    <div className={s.root}>
      {/* Brand */}
      <div className={s.brand}>CCS HRMS</div>

      {/* Stepper */}
      <div className={s.stepper}>
        {STEPS.map(st => (
          <div
            key={st.id}
            className={`${s.stepItem} ${st.id === step ? s.active : ""} ${st.id < step ? s.done : ""}`}
          >
            <div className={s.stepDot}>
              {st.id < step ? <Check size={14} /> : st.emoji}
            </div>
            <div className={s.stepLabel}>{st.label}</div>
          </div>
        ))}
      </div>

      {/* Step cards */}

      {/* ── STEP 1: Welcome ─────────────────────────────────────────────── */}
      {step === 1 && (
        <div className={s.card}>
          <div className={s.cardHead}>
            <div className={s.stepNumber}>Step 1 of 4</div>
            <h1 className={s.stepTitle}>Welcome to CCS HRMS, {company.name}! 👋</h1>
            <p className={s.stepDesc}>
              Let's set up your workspace in 4 quick steps — work schedule, departments, and leave policy.
              This takes about 3 minutes.
            </p>
          </div>
          <hr className={s.cardDivider} />
          <div className={s.cardBody}>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12,
            }}>
              {[
                { emoji: "🕘", title: "Work Schedule", desc: "Set your working hours and days" },
                { emoji: "🏢", title: "Departments",   desc: "Add your organisation's departments" },
                { emoji: "📋", title: "Leave Policy",  desc: "Configure leave types and limits" },
              ].map(item => (
                <div key={item.title} style={{
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14, padding: "18px 16px", textAlign: "center",
                }}>
                  <div style={{ fontSize: "1.8rem", marginBottom: 8 }}>{item.emoji}</div>
                  <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "0.9rem", marginBottom: 4 }}>{item.title}</div>
                  <div style={{ fontSize: "0.78rem", color: "#475569" }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div className={s.cardFoot}>
            <span />
            <button className={s.nextBtn} onClick={() => setStep(2)}>
              Let's Begin <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Work Schedule ───────────────────────────────────────── */}
      {step === 2 && (
        <div className={s.card}>
          <div className={s.cardHead}>
            <div className={s.stepNumber}>Step 2 of 4</div>
            <h1 className={s.stepTitle}>Work Schedule 🕘</h1>
            <p className={s.stepDesc}>
              Define your standard working days and hours. This drives attendance tracking and leave calculations.
            </p>
          </div>
          <hr className={s.cardDivider} />
          <div className={s.cardBody}>
            <div className={s.fieldGroup}>
              <label className={s.label}>Working Days</label>
              <div className={s.dayGrid}>
                {DAYS.map(day => (
                  <div
                    key={day}
                    className={`${s.dayChip} ${workDays.includes(day) ? s.selected : ""}`}
                    onClick={() => toggleDay(day)}
                  >
                    {day}
                  </div>
                ))}
              </div>
            </div>
            <div className={s.formRow}>
              <div className={s.fieldGroup}>
                <label className={s.label}>Office Start Time</label>
                <input type="time" className={s.input} value={startTime}
                  onChange={e => setStartTime(e.target.value)} />
              </div>
              <div className={s.fieldGroup}>
                <label className={s.label}>Office End Time</label>
                <input type="time" className={s.input} value={endTime}
                  onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className={s.fieldGroup} style={{ maxWidth: 240 }}>
              <label className={s.label}>Grace Period (minutes late allowed)</label>
              <input type="number" className={s.input} value={graceMinutes} min={0} max={60}
                onChange={e => setGraceMinutes(e.target.value)} />
            </div>
          </div>
          <div className={s.cardFoot}>
            <button className={s.backBtn} onClick={() => setStep(1)}>Back</button>
            <button className={s.nextBtn} onClick={handleNext} disabled={saving || workDays.length === 0}>
              {saving ? "Saving…" : <>Save & Continue <ArrowRight size={16} /></>}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Departments ─────────────────────────────────────────── */}
      {step === 3 && (
        <div className={s.card}>
          <div className={s.cardHead}>
            <div className={s.stepNumber}>Step 3 of 4</div>
            <h1 className={s.stepTitle}>Departments 🏢</h1>
            <p className={s.stepDesc}>
              Add your organisation's departments. Employees will be assigned to one when you create them.
            </p>
          </div>
          <hr className={s.cardDivider} />
          <div className={s.cardBody}>
            <div className={s.deptList}>
              {departments.map((d, i) => (
                <div key={i} className={s.deptRow}>
                  <input
                    className={s.input}
                    value={d.name}
                    onChange={e => updateDept(i, e.target.value)}
                    placeholder={`Department ${i + 1}`}
                  />
                  <button className={s.removeBtn} onClick={() => removeDept(i)}>✕</button>
                </div>
              ))}
              <button className={s.addBtn} onClick={addDept}>
                <Plus size={14} /> Add Department
              </button>
            </div>
          </div>
          <div className={s.cardFoot}>
            <button className={s.backBtn} onClick={() => setStep(2)}>Back</button>
            <button
              className={s.nextBtn}
              onClick={handleNext}
              disabled={saving || departments.filter(d => d.name.trim()).length === 0}
            >
              {saving ? "Saving…" : <>Save & Continue <ArrowRight size={16} /></>}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Leave Types ──────────────────────────────────────────── */}
      {step === 4 && (
        <div className={s.card}>
          <div className={s.cardHead}>
            <div className={s.stepNumber}>Step 4 of 4</div>
            <h1 className={s.stepTitle}>Leave Policy 📋</h1>
            <p className={s.stepDesc}>
              Review and adjust your leave types. You can always add more later from Leave Settings.
            </p>
          </div>
          <hr className={s.cardDivider} />
          <div className={s.cardBody}>
            {leaveTypes.map((lt, i) => (
              <div key={i} className={s.leaveRow}>
                <input
                  className={s.input}
                  style={{ padding: "10px 14px", borderRadius: 10, fontSize: "0.9rem" }}
                  value={lt.name}
                  onChange={e => updateLeave(i, "name", e.target.value)}
                  placeholder="Leave type name"
                />
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <input
                    type="number"
                    className={s.leaveInput}
                    value={lt.max_days}
                    min={0}
                    onChange={e => updateLeave(i, "max_days", parseInt(e.target.value) || 0)}
                  />
                  <span style={{ fontSize: "0.78rem", color: "#475569", whiteSpace: "nowrap" }}>days/yr</span>
                </div>
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                    padding: "7px 12px", borderRadius: 10,
                    background: lt.is_paid ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${lt.is_paid ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.08)"}`,
                    cursor: "pointer", transition: "all 0.2s",
                  }}
                  onClick={() => updateLeave(i, "is_paid", !lt.is_paid)}
                >
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: lt.is_paid ? "#34d399" : "#475569" }}>
                    {lt.is_paid ? "✓ Paid" : "Unpaid"}
                  </span>
                </div>
                <button className={s.removeBtn} onClick={() => setLeaveTypes(prev => prev.filter((_, idx) => idx !== i))}>✕</button>
              </div>
            ))}
            <button className={s.addBtn} onClick={addLeave}>
              <Plus size={14} /> Add Leave Type
            </button>
          </div>
          <div className={s.cardFoot}>
            <button className={s.backBtn} onClick={() => setStep(3)}>Back</button>
            <button
              className={s.nextBtn}
              onClick={handleNext}
              disabled={saving || leaveTypes.filter(l => l.name.trim()).length === 0}
            >
              {saving ? "Saving…" : <>Finish Setup <Check size={16} /></>}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 5: Complete ─────────────────────────────────────────────── */}
      {step === 5 && (
        <div className={s.card}>
          <div className={s.cardBody} style={{ paddingTop: 40, paddingBottom: 40 }}>
            <div className={s.completionCard}>
              <div className={s.checkIcon}>🎉</div>
              <div className={s.completionTitle}>{company.name} is ready!</div>
              <div className={s.completionSub}>Your workspace has been fully configured.</div>

              <div className={s.completionGrid}>
                <div className={s.completionStat}>
                  <div className={s.completionStatValue}>{workDays.length}</div>
                  <div className={s.completionStatLabel}>Working Days / Week</div>
                </div>
                <div className={s.completionStat}>
                  <div className={s.completionStatValue}>{summary.depts}</div>
                  <div className={s.completionStatLabel}>Departments Created</div>
                </div>
                <div className={s.completionStat}>
                  <div className={s.completionStatValue}>{summary.leaves}</div>
                  <div className={s.completionStatLabel}>Leave Types</div>
                </div>
                <div className={s.completionStat}>
                  <div className={s.completionStatValue}>{startTime}–{endTime}</div>
                  <div className={s.completionStatLabel}>Office Hours</div>
                </div>
              </div>

              <div style={{ fontSize: "0.88rem", color: "#475569", marginTop: 20, lineHeight: 1.6 }}>
                Next: Go to your dashboard → create employees,<br />
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
