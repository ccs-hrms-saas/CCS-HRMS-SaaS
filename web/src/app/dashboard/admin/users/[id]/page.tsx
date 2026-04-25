"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import styles from "../../../dashboard.module.css";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface MonthSummary {
  label: string;           // "April 2026"
  key: string;             // "2026-04"
  workingHrs: number;      // FULL month working days × 8.5 (gross, before leaves)
  clocked: number;         // actual clock-in/clock-out hours accumulated
  leaveDetail: string;     // e.g. "1d CL, 1d EL"
  leaveHrs: number;        // leave days × 8.5 (to offset target)
  lwpHrs: number;          // LWP adjustments this month
  nonLwpAdj: number;       // CL/EL/CO self-adjustments (non-LWP)
  waived: number;          // SA waived hours
  netDeficit: number;      // remaining uncovered hours
  salary: number;          // employee remuneration
  paid: number;            // salary after LWP deduction
  isCurrent: boolean;      // is this the ongoing month?
}

interface Waiver {
  id: string; month: string; hours_waived: number; reason: string;
  created_at: string; waived_by_name?: string;
}
interface Adjustment {
  id: string; adjustment_date: string; hours_cleared: number; adjusted_against: string;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SAEmployeeProfilePage() {
  const { id }             = useParams<{ id: string }>();
  const router             = useRouter();
  const { profile: viewer } = useAuth();

  const [emp, setEmp]                     = useState<any>(null);
  const [appraisals, setAppraisals]       = useState<any[]>([]);
  const [waivers, setWaivers]             = useState<Waiver[]>([]);
  const [adjustments, setAdjustments]     = useState<Adjustment[]>([]);
  const [monthSummaries, setMonthSummaries] = useState<MonthSummary[]>([]);
  const [empGroups, setEmpGroups]         = useState<any[]>([]);
  const [loading,   setLoading]           = useState(true);

  // Waiver modal
  const [showWaiver, setShowWaiver] = useState(false);
  const [wMonth, setWMonth]         = useState(() => {
    const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`;
  });
  const [wHours, setWHours]   = useState<number>(8.5);
  const [wReason, setWReason] = useState("");
  const [wSaving, setWSaving] = useState(false);
  const [wError, setWError]   = useState("");

  const isSuperAdmin = viewer?.role === "superadmin";

  useEffect(() => { if (id && viewer) loadAll(); }, [id, viewer]);

  const loadAll = async () => {
    setLoading(true);
    const { isWorkingDay, fetchEmployeeHolidays } = await import("@/lib/dateUtils");

    const [empRes, appraisalRes, waiversRes, adjRes, attnRes, leavesRes, groupsRes] = await Promise.all([
      supabase.from("profiles").select("*, manager:profiles!manager_id(full_name)").eq("id", id).single(),
      supabase.from("employee_appraisals").select("*").eq("user_id", id).order("appraisal_date", { ascending: false }),
      supabase.from("deficit_waivers").select("*, waived_by_profile:profiles!waived_by(full_name)").eq("user_id", id).order("created_at", { ascending: false }),
      supabase.from("deficit_adjustments").select("*").eq("user_id", id).order("adjustment_date", { ascending: false }),
      supabase.from("attendance_records").select("date,check_in,check_out").eq("user_id", id),
      supabase.from("leave_requests").select("start_date,end_date,type,status").eq("user_id", id).eq("status", "approved"),
      supabase.from("employee_group_members").select("group_id, employee_groups(id,name,color,icon)").eq("user_id", id),
    ]);

    const empData = empRes.data ?? {};
    setEmp(empData);
    setAppraisals(appraisalRes.data ?? []);
    setAdjustments(adjRes.data ?? []);
    // Groups
    setEmpGroups((groupsRes.data ?? []).map((r: any) => r.employee_groups).filter(Boolean));

    const rawWaivers: Waiver[] = (waiversRes.data ?? []).map((w: any) => ({
      id: w.id, month: w.month, hours_waived: Number(w.hours_waived),
      reason: w.reason, created_at: w.created_at,
      waived_by_name: w.waived_by_profile?.full_name ?? "Super Admin",
    }));
    setWaivers(rawWaivers);

    // Fetch group-aware holiday set for this specific employee
    const hols = await fetchEmployeeHolidays(supabase, empData.company_id, id as string);
    const approvedLeaves = leavesRes.data ?? [];
    const attnRecords    = attnRes.data ?? [];
    const allAdj         = adjRes.data ?? [];
    const salary         = Number(empData.remuneration ?? 0);

    // ── Build per-date leave map: date → type ───────────────────────────
    const leaveDateType = new Map<string, string>(); // date → "CL", "EL", etc.
    approvedLeaves.forEach((l: any) => {
      let d = new Date(l.start_date);
      const end = new Date(l.end_date);
      while (d <= end) {
        leaveDateType.set(d.toISOString().split("T")[0], l.type ?? "Leave");
        d.setDate(d.getDate() + 1);
      }
    });

    // ── Determine month range ─────────────────────────────────────────────
    // System go-live: April 1, 2026. Never show months before this.
    const SYSTEM_START = "2026-04-01";
    const rawStart = empData.joining_date ??
      (attnRecords.length > 0 ? attnRecords.reduce((min: string, r: any) => r.date < min ? r.date : min, attnRecords[0].date) : null);
    // Use whichever is later: employee joining date OR system start
    const startStr = !rawStart || rawStart < SYSTEM_START ? SYSTEM_START : rawStart;


    const start = new Date(startStr);
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const months: MonthSummary[] = [];

    let y = start.getFullYear(), m = start.getMonth();

    while (y < today.getFullYear() || (y === today.getFullYear() && m <= today.getMonth())) {
      const key     = `${y}-${String(m+1).padStart(2,"0")}`;
      const mFrom   = `${key}-01`;
      const lastDay = new Date(y, m+1, 0);
      const mTo     = lastDay.toISOString().split("T")[0];
      const isCurrent = y === today.getFullYear() && m === today.getMonth();

      // ── FULL month working days (always last day, never truncated to today) ──
      let totalWorkingDays = 0;
      let ld = new Date(mFrom);
      while (ld <= lastDay) {
        if (isWorkingDay(ld, hols)) totalWorkingDays++;
        ld.setDate(ld.getDate() + 1);
      }
      const workingHrs = Math.round(totalWorkingDays * 8.5 * 10) / 10;

      // ── Leave details for this month ─────────────────────────────────
      const leaveTypeCounts = new Map<string, number>(); // type → days count
      let leaveHrs = 0;
      for (let d = new Date(mFrom); d <= lastDay; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().split("T")[0];
        if (isWorkingDay(d, hols) && leaveDateType.has(ds)) {
          const lt = leaveDateType.get(ds)!;
          leaveTypeCounts.set(lt, (leaveTypeCounts.get(lt) ?? 0) + 1);
          leaveHrs += 8.5;
        }
      }
      const leaveDetail = leaveTypeCounts.size > 0
        ? Array.from(leaveTypeCounts.entries()).map(([t, cnt]) => `${cnt}d ${t}`).join(", ")
        : "";

      // ── Clocked hours (only up to today for current month) ───────────
      const clockCutoff = isCurrent ? todayStr : mTo;
      let clocked = 0;
      attnRecords.filter((r: any) => r.date >= mFrom && r.date <= clockCutoff).forEach((r: any) => {
        if (r.check_in && r.check_out)
          clocked += (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 3600000;
      });

      // ML is now treated as a standard paid leave — no hour deduction
      clocked = Math.round(clocked * 10) / 10;

      // ── Adjustments for this month ───────────────────────────────────
      const monthAdj = allAdj.filter((a: any) => a.adjustment_date >= mFrom && a.adjustment_date <= mTo);
      const lwpHrs    = monthAdj.filter((a: any) => a.adjusted_against === "LWP").reduce((s: number, a: any) => s + Number(a.hours_cleared), 0);
      const nonLwpAdj = monthAdj.filter((a: any) => a.adjusted_against !== "LWP").reduce((s: number, a: any) => s + Number(a.hours_cleared), 0);

      // ── SA waivers ───────────────────────────────────────────────────
      const waived = rawWaivers.filter(w => w.month === key).reduce((s, w) => s + w.hours_waived, 0);

      // ── Net deficit: obligation = workingHrs - leaveHrs; deficit = obligation - clocked - lwp - nonLwpAdj - waived ──
      const obligation = workingHrs - leaveHrs;
      const netDeficit = Math.max(0, Math.round((obligation - clocked - lwpHrs - nonLwpAdj - waived) * 10) / 10);

      // ── Salary & Paid ────────────────────────────────────────────────
      const perDayRate = salary > 0 && totalWorkingDays > 0 ? salary / totalWorkingDays : 0;
      const lwpDays    = lwpHrs / 8.5;
      const paid       = Math.round((salary - lwpDays * perDayRate) * 100) / 100;

      months.push({ label: monthLabel(key), key, workingHrs, clocked, leaveDetail, leaveHrs, lwpHrs, nonLwpAdj, waived, netDeficit, salary, paid, isCurrent });
      m++; if (m > 11) { m = 0; y++; }
    }

    setMonthSummaries(months.reverse());
    setLoading(false);
  };

  const handleGrantWaiver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewer) return;
    if (!wReason.trim()) { setWError("Please enter a reason for the waiver."); return; }
    if (wHours <= 0)     { setWError("Hours must be greater than 0."); return; }
    setWSaving(true); setWError("");
    const { error } = await supabase.from("deficit_waivers").insert({ user_id: id, waived_by: viewer.id, month: wMonth, hours_waived: wHours, reason: wReason.trim() });
    if (error) { setWError(error.message); setWSaving(false); return; }
    await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_ids: id, title: "⭐ Attendance Hours Waiver Granted", message: `Super Admin has waived ${wHours}h of your ${monthLabel(wMonth)} attendance deficit. Reason: ${wReason.trim()}`, link: "/dashboard/employee/profile" }) });
    setShowWaiver(false); setWReason(""); setWHours(8.5); setWSaving(false);
    await loadAll();
  };

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner} /></div>;
  if (!emp)    return <div style={{ padding: 40, color: "var(--danger)" }}>Employee not found.</div>;

  const fmt = (n: number) => n.toLocaleString("en-IN");

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => router.back()} style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", color: "var(--text-secondary)", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: "0.85rem" }}>← Back</button>
          <div>
            <h1 style={{ margin: 0 }}>{emp.full_name} — Employee Profile</h1>
            <p style={{ margin: 0 }}>{emp.designation || "Employee"} · {emp.role}</p>
          </div>
        </div>
        {isSuperAdmin && (
          <button onClick={() => setShowWaiver(true)} className={styles.primaryBtn} style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)", border: "none", width: "auto" }}>
            ⭐ Grant Deficit Waiver
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 28, alignItems: "start" }}>

        {/* ── LEFT COLUMN ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Avatar */}
          <div className="glass-panel" style={{ padding: 28, textAlign: "center" }}>
            <div style={{ width: 90, height: 90, borderRadius: "50%", overflow: "hidden", background: "var(--glass-bg)", border: "3px solid var(--accent-primary)", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.5rem" }}>
              {emp.avatar_url ? <img src={emp.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "👤"}
            </div>
            <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{emp.full_name}</div>
            <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: 8 }}>{emp.designation || "Employee"}</div>
            <span style={{ padding: "3px 12px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 700, background: "rgba(99,102,241,0.15)", color: "var(--accent-primary)" }}>{emp.role}</span>
          </div>

          {/* Work Details */}
          <div className="glass-panel" style={{ padding: 20 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: "0.95rem", borderBottom: "1px solid var(--glass-border)", paddingBottom: 10 }}>Work Details</h3>
            {[["Email", emp.email], ["Phone", emp.phone_number || "—"], ["Reports To", (emp.manager as any)?.full_name || "—"], ["Joining Date", emp.joining_date ? new Date(emp.joining_date).toLocaleDateString("en-IN") : "—"], ["Remuneration", emp.remuneration ? `₹${Number(emp.remuneration).toLocaleString("en-IN")}/mo` : "—"]].map(([l, v]) => (
              <div key={l} style={{ marginBottom: 10 }}>
                <small style={{ color: "var(--text-secondary)" }}>{l}</small>
                <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Groups */}
          {empGroups.length > 0 && (
            <div className="glass-panel" style={{ padding: 20 }}>
              <h3 style={{ margin: "0 0 14px", fontSize: "0.95rem", borderBottom: "1px solid var(--glass-border)", paddingBottom: 10 }}>👥 Groups</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {empGroups.map((g: any) => (
                  <span key={g.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 11px", borderRadius: 20, fontSize: "0.78rem", fontWeight: 600, background: `${g.color}18`, color: g.color, border: `1px solid ${g.color}35` }}>
                    {g.icon} {g.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Documents */}
          <div className="glass-panel" style={{ padding: 20 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: "0.95rem", borderBottom: "1px solid var(--glass-border)", paddingBottom: 10 }}>📁 Documents</h3>
            {emp.joining_letter_url && <DocCard icon="📄" title="Joining Letter" subtitle={emp.joining_date ? new Date(emp.joining_date).toLocaleDateString("en-IN") : ""} url={emp.joining_letter_url} />}
            {appraisals.map((a: any) => <DocCard key={a.id} icon="📈" title="Appraisal Letter" subtitle={a.appraisal_date ? new Date(a.appraisal_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : ""} url={a.letter_url} />)}
            {waivers.map(w => (
              <div key={w.id} style={{ padding: "10px 14px", background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 10, marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "#7c3aed" }}>⭐ Waiver — {monthLabel(w.month)}</div>
                <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", marginTop: 2 }}>{w.hours_waived}h · {w.reason}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: 2 }}>by {w.waived_by_name} · {new Date(w.created_at).toLocaleDateString("en-IN")}</div>
              </div>
            ))}
            {adjustments.map((a: any) => (
              <div key={a.id} style={{ padding: "10px 14px", background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10, marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "#10b981" }}>📋 Adjustment — {a.adjusted_against}</div>
                <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", marginTop: 2 }}>{a.hours_cleared}h cleared · {a.adjustment_date ? new Date(a.adjustment_date).toLocaleDateString("en-IN") : ""}</div>
              </div>
            ))}
            {!emp.joining_letter_url && appraisals.length === 0 && waivers.length === 0 && adjustments.length === 0 && <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>No documents on record.</div>}
          </div>
        </div>

        {/* ── RIGHT COLUMN: Monthly Table ──────────────────────────────── */}
        <div className="glass-panel" style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 6px", fontSize: "1.1rem" }}>📊 Monthly Attendance Summary</h2>
          <p style={{ margin: "0 0 20px", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
            Working Hrs = full calendar month × 8.5h (all Mon–Fri excl. holidays). Salary deduction applies only to LWP days.
          </p>

          {monthSummaries.length === 0 ? (
            <div style={{ color: "var(--text-secondary)", padding: 20, textAlign: "center" }}>No history found.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--glass-border)" }}>
                    {[
                      ["Month",       "left"],
                      ["Working Hrs", "center"],
                      ["Clocked",     "center"],
                      ["Leaves",      "center"],
                      ["LWP",         "center"],
                      ["SA Waiver",   "center"],
                      ["Net Deficit", "center"],
                      ["Salary",      "right"],
                      ["Paid",        "right"],
                    ].map(([h, a]) => (
                      <th key={h} style={{ padding: "10px 10px", textAlign: a as any, color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.78rem", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthSummaries.map(ms => (
                    <tr key={ms.key} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", opacity: ms.isCurrent ? 1 : 0.9 }}>
                      <td style={{ padding: "11px 10px", fontWeight: 700 }}>
                        {ms.label}
                        {ms.isCurrent && <span style={{ marginLeft: 6, fontSize: "0.68rem", color: "#f59e0b", background: "rgba(245,158,11,0.12)", padding: "1px 6px", borderRadius: 8 }}>ongoing</span>}
                      </td>
                      <td style={{ padding: "11px 10px", textAlign: "center" }}>{ms.workingHrs}h</td>
                      <td style={{ padding: "11px 10px", textAlign: "center", color: ms.clocked > 0 ? "var(--text-primary)" : "var(--text-secondary)" }}>{ms.clocked > 0 ? `${ms.clocked}h` : "—"}</td>
                      <td style={{ padding: "11px 10px", textAlign: "center", color: "#3b82f6" }}>{ms.leaveDetail || "—"}</td>
                      <td style={{ padding: "11px 10px", textAlign: "center", color: ms.lwpHrs > 0 ? "var(--danger)" : "var(--text-secondary)", fontWeight: ms.lwpHrs > 0 ? 700 : 400 }}>
                        {ms.lwpHrs > 0 ? `${ms.lwpHrs / 8.5}d` : "—"}
                      </td>
                      <td style={{ padding: "11px 10px", textAlign: "center", color: "#7c3aed", fontWeight: ms.waived > 0 ? 700 : 400 }}>{ms.waived > 0 ? `${ms.waived}h` : "—"}</td>
                      <td style={{ padding: "11px 10px", textAlign: "center" }}>
                        {ms.isCurrent
                          ? <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>in progress</span>
                          : ms.netDeficit > 0
                          ? <span style={{ padding: "2px 8px", borderRadius: 10, background: "rgba(239,68,68,0.12)", color: "var(--danger)", fontWeight: 700 }}>{ms.netDeficit}h</span>
                          : <span style={{ padding: "2px 8px", borderRadius: 10, background: "rgba(16,185,129,0.1)", color: "var(--success)", fontWeight: 700 }}>✓</span>}
                      </td>
                      <td style={{ padding: "11px 10px", textAlign: "right", color: "var(--text-secondary)" }}>
                        {ms.salary > 0 ? `₹${fmt(ms.salary)}` : "—"}
                      </td>
                      <td style={{ padding: "11px 10px", textAlign: "right", fontWeight: 600 }}>
                        {ms.salary > 0
                          ? <span style={{ color: ms.paid < ms.salary ? "var(--danger)" : "var(--success)" }}>₹{fmt(ms.paid)}</span>
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Grant Waiver Modal ── */}
      {showWaiver && (
        <div className="overlay" onClick={() => setShowWaiver(false)}>
          <div className="drawer" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="drawerHeader">
              <h2>⭐ Grant Deficit Waiver</h2>
              <button onClick={() => setShowWaiver(false)} className="closeBtn">✕</button>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: 20 }}>
              Waiving deficit hours for <strong>{emp.full_name}</strong>. Logged permanently in employee profile.
            </p>
            <form onSubmit={handleGrantWaiver} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Month</label>
                <input type="month" className="premium-input" value={wMonth} onChange={e => setWMonth(e.target.value)} />
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Hours to Waive</label>
                <input type="number" className="premium-input" value={wHours} min={0.5} max={500} step={0.5} onChange={e => setWHours(Number(e.target.value))} />
                <small style={{ color: "var(--text-secondary)", marginTop: 4, display: "block" }}>Partial hours allowed (e.g. 4.25h). Full day = 8.5h.</small>
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Reason <span style={{ color: "var(--danger)" }}>*</span></label>
                <textarea className="premium-input" rows={3} placeholder="e.g. Medical emergency, exceptional performance, personal hardship..."
                  value={wReason} onChange={e => setWReason(e.target.value)} style={{ resize: "vertical", minHeight: 80 }} />
              </div>
              {wError && <div style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{wError}</div>}
              <button type="submit" className={styles.primaryBtn} disabled={wSaving}
                style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)", borderColor: "#7c3aed" }}>
                {wSaving ? "Saving..." : `✓ Waive ${wHours}h for ${monthLabel(wMonth)}`}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function DocCard({ icon, title, subtitle, url }: { icon: string; title: string; subtitle: string; url: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--glass-border)", borderRadius: 10, marginBottom: 8 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{icon} {title}</div>
        {subtitle && <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>{subtitle}</div>}
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-primary)", fontWeight: 600, fontSize: "0.8rem", textDecoration: "none", padding: "5px 12px", border: "1px solid rgba(99,102,241,0.35)", borderRadius: 7, background: "rgba(99,102,241,0.08)" }}>View</a>
    </div>
  );
}
