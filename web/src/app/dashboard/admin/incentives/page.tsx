"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useModules } from "@/context/ModulesContext";
import styles from "../../dashboard.module.css";

// ── Types ──────────────────────────────────────────────────────────────────
interface Plan {
  id: string; name: string; description: string | null; tenure: string;
  tenure_start: string | null; tenure_end: string | null; is_active: boolean; created_at: string;
  goals?: Goal[];
}
interface Goal {
  id: string; plan_id: string; name: string; description: string | null;
  value_type: "fixed" | "open_ended"; fixed_value: number | null;
  has_target: boolean; target_amount: number | null;
  payout_type: "flat" | "percentage"; payout_value: number;
  payout_cap: number | null; is_active: boolean;
}
interface Employee { id: string; full_name: string; }
interface IncentiveRecord {
  id: string; goal_id: string; user_id: string; period_label: string;
  achieved_value: number; payout_amount: number | null; status: string;
  notes: string | null; created_at: string;
  profiles: { full_name: string } | null;
  incentive_goals: { name: string; payout_type: string; payout_value: number; payout_cap: number | null } | null;
}

const TENURES = ["weekly", "monthly", "quarterly", "yearly", "custom"];
const emptyPlan = { name: "", description: "", tenure: "monthly", tenure_start: "", tenure_end: "" };
const emptyGoal = { name: "", description: "", value_type: "fixed" as const, fixed_value: "", has_target: false, target_amount: "", payout_type: "flat" as const, payout_value: "", payout_cap: "" };

function computePayout(goal: Goal, achievedValue: number): number {
  if (goal.has_target && goal.target_amount && achievedValue < goal.target_amount) return 0;
  let payout = 0;
  if (goal.payout_type === "flat") payout = goal.payout_value;
  else                             payout = (achievedValue * goal.payout_value) / 100;
  if (goal.payout_cap != null) payout = Math.min(payout, goal.payout_cap);
  return Math.round(payout * 100) / 100;
}

const statusColor: Record<string, string> = { pending: "#f59e0b", approved: "#10b981", rejected: "#ef4444", paid: "#6366f1" };

export default function AdminIncentives() {
  const { profile }    = useAuth();
  const { getProps }   = useModules();
  const modProps       = getProps("incentives");
  const tier           = modProps.tier ?? "basic";
  const isStd          = tier !== "basic";
  const isAdv          = tier === "advanced";
  const multiGoal      = !!modProps.multi_goal_enabled;
  const openEnded      = !!modProps.open_ended_value_enabled;
  const targetCap      = !!modProps.target_cap_enabled;
  const pctPayout      = !!modProps.percentage_payout_enabled;
  const upperCap       = !!modProps.payout_upper_cap_enabled;
  const customTenure   = !!modProps.custom_tenure_enabled;
  const maxPlans       = modProps.max_active_plans as number | null ?? 1;

  const [tab, setTab]               = useState<"records" | "plans">("records");
  const [plans, setPlans]           = useState<Plan[]>([]);
  const [records, setRecords]       = useState<IncentiveRecord[]>([]);
  const [employees, setEmployees]   = useState<Employee[]>([]);
  const [loading, setLoading]       = useState(true);

  // Plan/Goal form
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editingPlan,  setEditingPlan]  = useState<Plan | null>(null);
  const [planForm,  setPlanForm]  = useState<any>(emptyPlan);
  const [savingPlan, setSavingPlan] = useState(false);

  // Goal management within plan
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [goals, setGoals]               = useState<Record<string, Goal[]>>({});
  const [showGoalForm, setShowGoalForm] = useState<string | null>(null); // plan_id
  const [editingGoal, setEditingGoal]   = useState<Goal | null>(null);
  const [goalForm, setGoalForm]         = useState<any>(emptyGoal);
  const [savingGoal, setSavingGoal]     = useState(false);

  // Record logging
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [recordForm, setRecordForm] = useState({ goal_id: "", user_id: "", period_label: "", achieved_value: "", notes: "" });
  const [computedPayout, setComputedPayout] = useState<number | null>(null);
  const [savingRecord, setSavingRecord] = useState(false);

  // Detail drawer
  const [selectedRecord, setSelectedRecord] = useState<IncentiveRecord | null>(null);
  const [actioning, setActioning] = useState(false);

  // Filter
  const [filterStatus, setFilterStatus] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: p }, { data: r }, { data: e }] = await Promise.all([
      supabase.from("incentive_plans").select("*").eq("is_active", true).order("created_at", { ascending: false }),
      supabase.from("incentive_records").select("*, profiles(full_name), incentive_goals(name, payout_type, payout_value, payout_cap)").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name").eq("is_active", true).neq("role", "superadmin"),
    ]);
    setPlans(p ?? []);
    setRecords(r ?? []);
    setEmployees(e ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadGoals = async (planId: string) => {
    const { data } = await supabase.from("incentive_goals").select("*").eq("plan_id", planId).eq("is_active", true).order("name");
    setGoals(g => ({ ...g, [planId]: data ?? [] }));
  };

  const togglePlan = (planId: string) => {
    if (expandedPlan === planId) { setExpandedPlan(null); return; }
    setExpandedPlan(planId);
    if (!goals[planId]) loadGoals(planId);
  };

  // ── Plan CRUD ─────────────────────────────────────────────────────────────
  const savePlan = async (e: React.FormEvent) => {
    e.preventDefault(); setSavingPlan(true);
    const payload: any = { name: planForm.name, description: planForm.description || null, tenure: planForm.tenure };
    if (planForm.tenure === "custom") { payload.tenure_start = planForm.tenure_start || null; payload.tenure_end = planForm.tenure_end || null; }
    if (editingPlan) await supabase.from("incentive_plans").update(payload).eq("id", editingPlan.id);
    else             await supabase.from("incentive_plans").insert(payload);
    setShowPlanForm(false); setSavingPlan(false); load();
  };

  const deactivatePlan = async (id: string) => {
    if (!confirm("Deactivate this plan?")) return;
    await supabase.from("incentive_plans").update({ is_active: false }).eq("id", id);
    load();
  };

  // ── Goal CRUD ─────────────────────────────────────────────────────────────
  const saveGoal = async (e: React.FormEvent, planId: string) => {
    e.preventDefault(); setSavingGoal(true);
    const payload: any = {
      plan_id: planId,
      name: goalForm.name,
      description: goalForm.description || null,
      value_type: goalForm.value_type,
      fixed_value: goalForm.value_type === "fixed" ? Number(goalForm.fixed_value) : null,
      has_target: goalForm.has_target,
      target_amount: goalForm.has_target ? Number(goalForm.target_amount) : null,
      payout_type: goalForm.payout_type,
      payout_value: Number(goalForm.payout_value),
      payout_cap: goalForm.payout_cap !== "" ? Number(goalForm.payout_cap) : null,
    };
    if (editingGoal) await supabase.from("incentive_goals").update(payload).eq("id", editingGoal.id);
    else             await supabase.from("incentive_goals").insert(payload);
    setShowGoalForm(null); setEditingGoal(null); setGoalForm(emptyGoal); setSavingGoal(false);
    loadGoals(planId);
  };

  const deactivateGoal = async (id: string, planId: string) => {
    if (!confirm("Remove this goal?")) return;
    await supabase.from("incentive_goals").update({ is_active: false }).eq("id", id);
    loadGoals(planId);
  };

  // ── Record logging ─────────────────────────────────────────────────────────
  const allGoals = Object.values(goals).flat();

  const updateComputedPayout = (gId: string, val: string) => {
    const g = allGoals.find(g => g.id === gId);
    if (!g || !val) { setComputedPayout(null); return; }
    setComputedPayout(computePayout(g, Number(val)));
  };

  const logRecord = async (e: React.FormEvent) => {
    e.preventDefault(); setSavingRecord(true);
    const g = allGoals.find(g => g.id === recordForm.goal_id);
    const payout = g ? computePayout(g, Number(recordForm.achieved_value)) : null;
    const planGoal = await supabase.from("incentive_goals").select("company_id").eq("id", recordForm.goal_id).single();
    await supabase.from("incentive_records").insert({
      goal_id: recordForm.goal_id,
      user_id: recordForm.user_id,
      company_id: planGoal.data?.company_id,
      period_label: recordForm.period_label,
      achieved_value: Number(recordForm.achieved_value),
      payout_amount: payout,
      notes: recordForm.notes || null,
      created_by: profile?.id,
      status: "pending",
    });
    setShowRecordForm(false);
    setRecordForm({ goal_id: "", user_id: "", period_label: "", achieved_value: "", notes: "" });
    setComputedPayout(null); setSavingRecord(false); load();
  };

  // ── Approve / Reject record ────────────────────────────────────────────────
  const approveRecord = async () => {
    if (!selectedRecord) return;
    setActioning(true);
    await supabase.from("incentive_records").update({ status: "approved", approved_by: profile?.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", selectedRecord.id);
    setSelectedRecord(null); setActioning(false); load();
  };

  const rejectRecord = async () => {
    if (!selectedRecord) return;
    setActioning(true);
    await supabase.from("incentive_records").update({ status: "rejected", updated_at: new Date().toISOString() }).eq("id", selectedRecord.id);
    setSelectedRecord(null); setActioning(false); load();
  };

  const markPaid = async () => {
    if (!selectedRecord) return;
    setActioning(true);
    await supabase.from("incentive_records").update({ status: "paid", paid_on: new Date().toISOString().split("T")[0], updated_at: new Date().toISOString() }).eq("id", selectedRecord.id);
    setSelectedRecord(null); setActioning(false); load();
  };

  const filtered = filterStatus === "all" ? records : records.filter(r => r.status === filterStatus);
  const counts   = { pending: records.filter(r => r.status === "pending").length, approved: records.filter(r => r.status === "approved").length, paid: records.filter(r => r.status === "paid").length };

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner} /></div>;

  const tierLabel = tier === "advanced" ? "Advanced" : tier === "standard" ? "Standard" : "Basic";
  const tierColor = tier === "advanced" ? "#fbbf24" : tier === "standard" ? "#818cf8" : "#34d399";

  return (
    <div className="animate-fade-in">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={styles.pageHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Incentive Structure</h1>
          <p>Manage incentive plans, goals, and employee payouts</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: "0.72rem", padding: "3px 10px", borderRadius: 20, background: `${tierColor}18`, color: tierColor, fontWeight: 700, textTransform: "uppercase", border: `1px solid ${tierColor}30` }}>
            {tierLabel} tier
          </span>
          {tab === "records" && (
            <button className={styles.primaryBtn} style={{ width: "auto", padding: "10px 20px" }} onClick={() => { setShowRecordForm(true); /* preload goals if empty */ Object.keys(goals).length === 0 && plans.forEach(p => loadGoals(p.id)); }}>
              + Log Achievement
            </button>
          )}
          {tab === "plans" && (
            <button className={styles.primaryBtn} style={{ width: "auto", padding: "10px 20px", opacity: maxPlans !== null && plans.length >= maxPlans ? 0.5 : 1 }}
              onClick={() => { if (maxPlans === null || plans.length < maxPlans) { setEditingPlan(null); setPlanForm(emptyPlan); setShowPlanForm(true); } else alert(`Your ${tierLabel} tier allows a maximum of ${maxPlans} active plan${maxPlans > 1 ? "s" : ""}.`); }}>
              + New Plan
            </button>
          )}
        </div>
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <div className={styles.statsGrid} style={{ marginBottom: 24 }}>
        {[
          { label: "Active Plans",   value: plans.length, color: "#818cf8", icon: "📋" },
          { label: "Pending Review", value: counts.pending, color: "#f59e0b", icon: "⏳" },
          { label: "Approved",       value: counts.approved, color: "#10b981", icon: "✅" },
          { label: "Paid Out",       value: counts.paid, color: "#6366f1", icon: "💸" },
        ].map(s => (
          <div key={s.label} className="glass-panel" style={{ padding: "20px 24px" }}>
            <div style={{ fontSize: "1.5rem", marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "rgba(0,0,0,0.2)", borderRadius: 12, padding: 4, width: "fit-content" }}>
        {(["records", "plans"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 20px", borderRadius: 9, border: "none", cursor: "pointer",
            fontFamily: "inherit", fontWeight: 600, fontSize: "0.85rem", transition: "all 0.2s",
            background: tab === t ? "rgba(99,102,241,0.2)" : "transparent",
            color: tab === t ? "#818cf8" : "var(--text-secondary)",
          }}>
            {t === "records" ? "📊 Achievements" : "📋 Plans & Goals"}
          </button>
        ))}
      </div>

      {/* ── TAB: Records ─────────────────────────────────────────────────── */}
      {tab === "records" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {["all", "pending", "approved", "paid"].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)} style={{
                padding: "6px 16px", borderRadius: 20, border: "1px solid",
                borderColor: filterStatus === s ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.08)",
                background: filterStatus === s ? "rgba(99,102,241,0.12)" : "transparent",
                color: filterStatus === s ? "#818cf8" : "var(--text-secondary)",
                fontFamily: "inherit", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer", textTransform: "capitalize",
              }}>
                {s === "all" ? "All" : `${s} (${counts[s as keyof typeof counts] ?? 0})`}
              </button>
            ))}
          </div>
          <div className={`glass-panel ${styles.tableWrap}`}>
            <table>
              <thead>
                <tr><th>Employee</th><th>Goal</th><th>Period</th><th>Achieved</th><th>Payout</th><th>Status</th><th>Action</th></tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 40 }}>No achievement records yet. Click "Log Achievement" to add one.</td></tr>
                ) : filtered.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.profiles?.full_name ?? "—"}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{r.incentive_goals?.name ?? "—"}</td>
                    <td style={{ fontSize: "0.83rem" }}>{r.period_label}</td>
                    <td style={{ fontWeight: 700 }}>{r.achieved_value.toLocaleString()}</td>
                    <td style={{ fontWeight: 700, color: "#10b981" }}>
                      {r.payout_amount != null ? `₹${r.payout_amount.toLocaleString()}` : "—"}
                    </td>
                    <td>
                      <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, background: `${statusColor[r.status]}20`, color: statusColor[r.status], textTransform: "capitalize" }}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <button onClick={() => setSelectedRecord(r)} style={{ padding: "5px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.8rem", fontFamily: "inherit" }}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── TAB: Plans & Goals ────────────────────────────────────────────── */}
      {tab === "plans" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {plans.length === 0 && (
            <div className="glass-panel" style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
              No active plans. Click "+ New Plan" to create your first incentive plan.
            </div>
          )}
          {plans.map(plan => (
            <div key={plan.id} className="glass-panel" style={{ padding: 0, overflow: "hidden" }}>
              {/* Plan header row */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", cursor: "pointer" }} onClick={() => togglePlan(plan.id)}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{plan.name}</div>
                  {plan.description && <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 2 }}>{plan.description}</div>}
                </div>
                <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: "0.7rem", fontWeight: 700, background: "rgba(99,102,241,0.12)", color: "#818cf8", textTransform: "capitalize" }}>
                  {plan.tenure === "custom" && plan.tenure_start ? `${plan.tenure_start} → ${plan.tenure_end ?? "?"}` : plan.tenure}
                </span>
                <button onClick={e => { e.stopPropagation(); setEditingPlan(plan); setPlanForm({ name: plan.name, description: plan.description ?? "", tenure: plan.tenure, tenure_start: plan.tenure_start ?? "", tenure_end: plan.tenure_end ?? "" }); setShowPlanForm(true); }} style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.78rem", fontFamily: "inherit" }}>Edit</button>
                <button onClick={e => { e.stopPropagation(); deactivatePlan(plan.id); }} style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.07)", color: "#ef4444", cursor: "pointer", fontSize: "0.78rem", fontFamily: "inherit" }}>Remove</button>
                <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", transition: "transform 0.2s", transform: expandedPlan === plan.id ? "rotate(180deg)" : "none" }}>▾</span>
              </div>

              {/* Goals section */}
              {expandedPlan === plan.id && (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "16px 20px", background: "rgba(0,0,0,0.1)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>Goals</span>
                    {(multiGoal || (goals[plan.id]?.length ?? 0) === 0) && (
                      <button onClick={() => { setShowGoalForm(plan.id); setEditingGoal(null); setGoalForm(emptyGoal); }}
                        style={{ padding: "5px 14px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.1)", color: "#818cf8", cursor: "pointer", fontSize: "0.78rem", fontFamily: "inherit", fontWeight: 600 }}>
                        + Add Goal
                      </button>
                    )}
                  </div>

                  {(goals[plan.id] ?? []).length === 0 ? (
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.83rem", padding: "10px 0" }}>No goals yet. Add a goal to define what employees need to achieve.</div>
                  ) : (goals[plan.id] ?? []).map(g => (
                    <div key={g.id} style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{g.name}</div>
                          {g.description && <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>{g.description}</div>}
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                            <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: 20, background: "rgba(99,102,241,0.1)", color: "#818cf8" }}>
                              {g.value_type === "fixed" ? `₹${g.fixed_value?.toLocaleString()} fixed` : "Open-ended value"}
                            </span>
                            {g.has_target && g.target_amount && (
                              <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: 20, background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>
                                Min target: {g.target_amount.toLocaleString()}
                              </span>
                            )}
                            <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: 20, background: "rgba(16,185,129,0.1)", color: "#34d399" }}>
                              {g.payout_type === "flat" ? `₹${g.payout_value} flat` : `${g.payout_value}% of value`}
                              {g.payout_cap != null ? ` (max ₹${g.payout_cap})` : ""}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
                          <button onClick={() => { setShowGoalForm(plan.id); setEditingGoal(g); setGoalForm({ name: g.name, description: g.description ?? "", value_type: g.value_type, fixed_value: g.fixed_value ?? "", has_target: g.has_target, target_amount: g.target_amount ?? "", payout_type: g.payout_type, payout_value: g.payout_value, payout_cap: g.payout_cap ?? "" }); }} style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.75rem", fontFamily: "inherit" }}>✏️</button>
                          <button onClick={() => deactivateGoal(g.id, plan.id)} style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid rgba(239,68,68,0.2)", background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: "0.75rem", fontFamily: "inherit" }}>🗑</button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Inline Goal Form */}
                  {showGoalForm === plan.id && (
                    <form onSubmit={e => saveGoal(e, plan.id)} style={{ marginTop: 12, padding: 16, borderRadius: 12, background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.2)", display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "#818cf8" }}>{editingGoal ? "Edit Goal" : "New Goal"}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                          <label>Goal Name *</label>
                          <input className="premium-input" value={goalForm.name} onChange={e => setGoalForm({ ...goalForm, name: e.target.value })} required />
                        </div>
                        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                          <label>Value Type</label>
                          <select className="premium-input" value={goalForm.value_type} onChange={e => setGoalForm({ ...goalForm, value_type: e.target.value })} disabled={!openEnded}>
                            <option value="fixed">Fixed (pre-decided)</option>
                            {openEnded && <option value="open_ended">Open-ended (recorded at time)</option>}
                          </select>
                        </div>
                      </div>
                      {goalForm.value_type === "fixed" && (
                        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                          <label>Fixed Value per Unit (₹) *</label>
                          <input type="number" className="premium-input" value={goalForm.fixed_value} onChange={e => setGoalForm({ ...goalForm, fixed_value: e.target.value })} min={0} required />
                        </div>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                          <label>Payout Type</label>
                          <select className="premium-input" value={goalForm.payout_type} onChange={e => setGoalForm({ ...goalForm, payout_type: e.target.value })} disabled={!pctPayout && goalForm.payout_type === "flat"}>
                            <option value="flat">Flat Amount (₹)</option>
                            {pctPayout && <option value="percentage">Percentage (%)</option>}
                          </select>
                        </div>
                        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                          <label>{goalForm.payout_type === "flat" ? "Payout Amount (₹)" : "Payout %"} *</label>
                          <input type="number" className="premium-input" value={goalForm.payout_value} onChange={e => setGoalForm({ ...goalForm, payout_value: e.target.value })} min={0} step={0.01} required />
                        </div>
                      </div>
                      {upperCap && (
                        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                          <label>Upper Cap on Payout (₹) — optional</label>
                          <input type="number" className="premium-input" placeholder="Leave blank = no cap" value={goalForm.payout_cap} onChange={e => setGoalForm({ ...goalForm, payout_cap: e.target.value })} min={0} />
                        </div>
                      )}
                      {targetCap && (
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem" }}>
                          <input type="checkbox" checked={goalForm.has_target} onChange={e => setGoalForm({ ...goalForm, has_target: e.target.checked })} style={{ accentColor: "var(--accent-primary)", width: 15, height: 15 }} />
                          Enable Minimum Target (payout only triggers after hitting target)
                        </label>
                      )}
                      {goalForm.has_target && targetCap && (
                        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                          <label>Minimum Target *</label>
                          <input type="number" className="premium-input" placeholder="e.g. 50000" value={goalForm.target_amount} onChange={e => setGoalForm({ ...goalForm, target_amount: e.target.value })} min={0} required />
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 10 }}>
                        <button type="submit" className={styles.primaryBtn} disabled={savingGoal} style={{ width: "auto", padding: "8px 20px" }}>
                          {savingGoal ? "Saving…" : "💾 Save Goal"}
                        </button>
                        <button type="button" onClick={() => { setShowGoalForm(null); setEditingGoal(null); }} style={{ padding: "8px 16px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit", fontSize: "0.85rem" }}>Cancel</button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Plan Form Drawer ─────────────────────────────────────────────── */}
      {showPlanForm && (
        <div className="overlay" onClick={() => setShowPlanForm(false)}>
          <div className="drawer" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="drawerHeader">
              <h2>{editingPlan ? "Edit Plan" : "New Incentive Plan"}</h2>
              <button onClick={() => setShowPlanForm(false)} className="closeBtn">✕</button>
            </div>
            <form onSubmit={savePlan} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Plan Name *</label>
                <input className="premium-input" value={planForm.name} onChange={e => setPlanForm({ ...planForm, name: e.target.value })} required />
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Description</label>
                <input className="premium-input" placeholder="e.g. Q1 Sales Incentive for field agents" value={planForm.description} onChange={e => setPlanForm({ ...planForm, description: e.target.value })} />
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Tenure *</label>
                <select className="premium-input" value={planForm.tenure} onChange={e => setPlanForm({ ...planForm, tenure: e.target.value })}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                  {customTenure && <option value="custom">Custom Date Range</option>}
                </select>
              </div>
              {planForm.tenure === "custom" && customTenure && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                    <label>Start Date</label>
                    <input type="date" className="premium-input" value={planForm.tenure_start} onChange={e => setPlanForm({ ...planForm, tenure_start: e.target.value })} />
                  </div>
                  <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                    <label>End Date</label>
                    <input type="date" className="premium-input" value={planForm.tenure_end} onChange={e => setPlanForm({ ...planForm, tenure_end: e.target.value })} />
                  </div>
                </div>
              )}
              <button type="submit" className={styles.primaryBtn} disabled={savingPlan} style={{ marginTop: 4 }}>
                {savingPlan ? "Saving…" : "💾 Save Plan"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Log Achievement Drawer ────────────────────────────────────────── */}
      {showRecordForm && (
        <div className="overlay" onClick={() => setShowRecordForm(false)}>
          <div className="drawer" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="drawerHeader">
              <h2>Log Achievement</h2>
              <button onClick={() => setShowRecordForm(false)} className="closeBtn">✕</button>
            </div>
            <form onSubmit={logRecord} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Employee *</label>
                <select className="premium-input" value={recordForm.user_id} onChange={e => setRecordForm({ ...recordForm, user_id: e.target.value })} required>
                  <option value="">— Select Employee —</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Goal *</label>
                <select className="premium-input" value={recordForm.goal_id} onChange={e => { setRecordForm(f => ({ ...f, goal_id: e.target.value })); updateComputedPayout(e.target.value, recordForm.achieved_value); }} required>
                  <option value="">— Select Goal —</option>
                  {plans.map(plan => (
                    <optgroup key={plan.id} label={plan.name}>
                      {(goals[plan.id] ?? []).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Period Label *</label>
                <input className="premium-input" placeholder="e.g. April 2026, Week 16, Q1 2026" value={recordForm.period_label} onChange={e => setRecordForm(f => ({ ...f, period_label: e.target.value }))} required />
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Achieved Value *</label>
                <input type="number" className="premium-input" placeholder="e.g. 75000 (revenue), 12 (units sold)" value={recordForm.achieved_value} onChange={e => { setRecordForm(f => ({ ...f, achieved_value: e.target.value })); updateComputedPayout(recordForm.goal_id, e.target.value); }} min={0} required />
                {computedPayout !== null && (
                  <div style={{ marginTop: 6, padding: "8px 12px", borderRadius: 8, background: computedPayout > 0 ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.06)", border: `1px solid ${computedPayout > 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.15)"}`, fontSize: "0.85rem", fontWeight: 600, color: computedPayout > 0 ? "#34d399" : "#f87171" }}>
                    {computedPayout > 0 ? `💰 Computed Payout: ₹${computedPayout.toLocaleString()}` : "⚠️ Target not met — ₹0 payout"}
                  </div>
                )}
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Notes (optional)</label>
                <input className="premium-input" placeholder="Any additional context" value={recordForm.notes} onChange={e => setRecordForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <button type="submit" className={styles.primaryBtn} disabled={savingRecord} style={{ marginTop: 4 }}>
                {savingRecord ? "Logging…" : "📊 Log Achievement"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Record Detail Drawer ──────────────────────────────────────────── */}
      {selectedRecord && (
        <div className="overlay" onClick={() => setSelectedRecord(null)}>
          <div className="drawer" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="drawerHeader">
              <h2>Achievement Detail</h2>
              <button onClick={() => setSelectedRecord(null)} className="closeBtn">✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                ["Employee",       selectedRecord.profiles?.full_name ?? "—"],
                ["Goal",           selectedRecord.incentive_goals?.name ?? "—"],
                ["Period",         selectedRecord.period_label],
                ["Achieved Value", selectedRecord.achieved_value.toLocaleString()],
                ["Payout",         selectedRecord.payout_amount != null ? `₹${selectedRecord.payout_amount.toLocaleString()}` : "—"],
                ["Status",         selectedRecord.status.toUpperCase()],
                ["Notes",          selectedRecord.notes ?? "—"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{k}</span>
                  <span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
              {selectedRecord.status === "pending" && (
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <button onClick={approveRecord} disabled={actioning} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: "linear-gradient(90deg,#10b981,#059669)", color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    {actioning ? "…" : "✅ Approve"}
                  </button>
                  <button onClick={rejectRecord} disabled={actioning} style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#ef4444", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    {actioning ? "…" : "❌ Reject"}
                  </button>
                </div>
              )}
              {selectedRecord.status === "approved" && (
                <button onClick={markPaid} disabled={actioning} style={{ padding: "10px", borderRadius: 10, border: "none", background: "linear-gradient(90deg,#6366f1,#8b5cf6)", color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  {actioning ? "…" : "💸 Mark as Paid"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
