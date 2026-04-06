"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import styles from "../dashboard.module.css";

// ─── Alert Levels ─────────────────────────────────────────────────────────────
// none   : Day 1–19 of current month → silent
// amber  : Day 20–end of current month → informational warning
// red    : Day 1–5 of next month (salary processing) → blocking, adjustment required
type AlertLevel = "none" | "amber" | "red";

interface DeficitState {
  deficit: number;         // hours deficit for the evaluated period
  evalMonthLabel: string;  // e.g. "March 2026"
  daysLeft: number;        // working days remaining in the month (for amber)
  alertLevel: AlertLevel;
  isSalaryPeriod: boolean; // true = days 1–5 of next month
}

export default function EmployeeDashboard() {
  const { profile } = useAuth();
  const [stats, setStats]         = useState({ presentDays: 0, totalHours: 0, targetHours: 0, approvedLeaves: 0, pendingLeaves: 0 });
  const [deficit, setDeficit]     = useState<DeficitState>({ deficit: 0, evalMonthLabel: "", daysLeft: 0, alertLevel: "none", isSalaryPeriod: false });
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjustType, setAdjustType]         = useState("LWP");
  const [adjusting, setAdjusting]           = useState(false);
  const [announcements, setAnnouncements]   = useState<any[]>([]);
  const [attendance, setAttendance]         = useState<any[]>([]);
  const [loading, setLoading]               = useState(true);

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      const { isWorkingDay } = await import("@/lib/dateUtils");

      const now        = new Date();
      const dayOfMonth = now.getDate();
      const todayStr   = now.toISOString().split("T")[0];

      // ── Which month are we evaluating? ──────────────────────────────────────
      // Days 1–5: evaluate PREVIOUS month's deficit (salary processing window)
      // Days 6+:  evaluate CURRENT month
      const isSalaryPeriod = dayOfMonth >= 1 && dayOfMonth <= 5;
      const evalDate = isSalaryPeriod
        ? new Date(now.getFullYear(), now.getMonth() - 1, 1)   // first day of prev month
        : new Date(now.getFullYear(), now.getMonth(), 1);        // first day of curr month

      const evalYear   = evalDate.getFullYear();
      const evalMonth  = evalDate.getMonth();  // 0-indexed
      const evalFrom   = new Date(evalYear, evalMonth, 1).toISOString().split("T")[0];
      // Last day of evaluate month
      const evalLastDay = new Date(evalYear, evalMonth + 1, 0);
      const evalTo     = evalLastDay.toISOString().split("T")[0];
      const evalMonthLabel = evalDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

      // For current month "This Month" display (always current month)
      const currFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const currTo   = todayStr;

      // ── Fetch everything ────────────────────────────────────────────────────
      const [attnAll, leavePending, leaveApprovedRes, announcementsData, holsRes, adjsRes, waiversRes] = await Promise.all([
        // Attendance: fetch both current and eval month
        supabase.from("attendance_records").select("*").eq("user_id", profile.id)
          .gte("date", evalFrom).lte("date", currTo),
        supabase.from("leave_requests").select("id", { count: "exact" })
          .eq("user_id", profile.id).eq("status", "pending"),
        // Approved leaves covering the eval month
        supabase.from("leave_requests").select("*")
          .eq("user_id", profile.id).eq("status", "approved")
          .lte("start_date", isSalaryPeriod ? evalTo : currTo)
          .gte("end_date", evalFrom),
        supabase.from("announcements").select("*, profiles(full_name)")
          .order("created_at", { ascending: false }).limit(5),
        supabase.from("company_holidays").select("date"),
        supabase.from("deficit_adjustments").select("hours_cleared, adjustment_date")
          .eq("user_id", profile.id),
        supabase.from("deficit_waivers").select("hours_waived, month")
          .eq("user_id", profile.id),
      ]);

      const hols = new Set<string>();
      (holsRes.data ?? []).forEach(h => hols.add(h.date));

      const leaveApproved = leaveApprovedRes.data ?? [];

      // Build date set of all approved leave days in the eval period
      const leaveDateSet = new Set<string>();
      leaveApproved.forEach(l => {
        let d = new Date(l.start_date);
        const end = new Date(l.end_date);
        while (d <= end) {
          const ds = d.toISOString().split("T")[0];
          if (ds >= evalFrom && ds <= evalTo) leaveDateSet.add(ds);
          d.setDate(d.getDate() + 1);
        }
      });

      // ── Evaluate month target (full calendar month, excluding approved leaves) ─
      let evalTargetDays = 0;
      let evalWorkingDaysRemaining = 0;
      let d = new Date(evalFrom);
      const evalEnd = new Date(evalTo);
      while (d <= evalEnd) {
        const ds = d.toISOString().split("T")[0];
        if (isWorkingDay(d, hols) && !leaveDateSet.has(ds)) {
          evalTargetDays++;
          // Days still remaining (after today, for amber "X days left" display)
          if (ds > todayStr) evalWorkingDaysRemaining++;
        }
        d.setDate(d.getDate() + 1);
      }
      const evalTargetHours = evalTargetDays * 8.5;

      // ── Hours clocked in the eval month ─────────────────────────────────────
      const evalRecords = (attnAll.data ?? []).filter(r => r.date >= evalFrom && r.date <= evalTo);
      let evalClocked = 0;
      evalRecords.forEach(r => {
        if (r.check_in && r.check_out)
          evalClocked += (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 3600000;
        // If checked in today but no checkout (currently in office), count as working — skip from deficit
      });

      // Past adjustments for the eval month
      let pastAdj = 0;
      (adjsRes.data ?? []).forEach(a => {
        if (a.adjustment_date >= evalFrom && a.adjustment_date <= evalTo)
          pastAdj += Number(a.hours_cleared);
      });

      // SA waivers for the eval month
      const evalMonthKey = `${evalYear}-${String(evalMonth + 1).padStart(2, "0")}`;
      let pastWaivers = 0;
      (waiversRes.data ?? []).forEach((w: any) => {
        if (w.month === evalMonthKey) pastWaivers += Number(w.hours_waived);
      });

      const rawDeficit   = Math.max(0, evalTargetHours - evalClocked - pastAdj - pastWaivers);
      const finalDeficit = Math.round(rawDeficit * 10) / 10;

      // ── Determine alert level ────────────────────────────────────────────────
      let alertLevel: AlertLevel = "none";
      if (isSalaryPeriod && finalDeficit >= 8.5) {
        alertLevel = "red";   // Previous month deficit ≥ 8.5h during processing window
      } else if (!isSalaryPeriod && dayOfMonth >= 20 && finalDeficit > 0) {
        alertLevel = "amber"; // After 20th of current month with any deficit
      }

      setDeficit({ deficit: finalDeficit, evalMonthLabel, daysLeft: evalWorkingDaysRemaining, alertLevel, isSalaryPeriod });

      // ── This Month display stats (always current month) ──────────────────────
      const currRecords = (attnAll.data ?? []).filter(r => r.date >= currFrom && r.date <= currTo);

      // Current month leave dates
      const currLeaveDateSet = new Set<string>();
      leaveApproved.forEach(l => {
        let ld = new Date(l.start_date);
        const lend = new Date(l.end_date);
        while (ld <= lend) {
          const ds = ld.toISOString().split("T")[0];
          if (ds >= currFrom && ds <= currTo) currLeaveDateSet.add(ds);
          ld.setDate(ld.getDate() + 1);
        }
      });

      // Full month target (for display — uses full month's working days)
      let fullMonthTargetDays = 0;
      let fd = new Date(now.getFullYear(), now.getMonth(), 1);
      const fullEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      while (fd <= fullEnd) {
        const ds = fd.toISOString().split("T")[0];
        if (isWorkingDay(fd, hols) && !currLeaveDateSet.has(ds)) fullMonthTargetDays++;
        fd.setDate(fd.getDate() + 1);
      }

      let currClocked = 0;
      currRecords.forEach(r => {
        if (r.check_in && r.check_out)
          currClocked += (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 3600000;
      });

      const currLeavesThisMonth = leaveApproved.filter(l => l.start_date <= currTo && l.end_date >= currFrom).length;

      setStats({
        presentDays:    currRecords.filter(r => r.check_in).length,
        totalHours:     Math.round(currClocked * 10) / 10,
        targetHours:    Math.round(fullMonthTargetDays * 8.5 * 10) / 10,
        approvedLeaves: currLeavesThisMonth,
        pendingLeaves:  leavePending.count ?? 0,
      });

      setAttendance((attnAll.data ?? []).filter(r => r.date >= currFrom).slice(-7).reverse());
      setAnnouncements(announcementsData.data ?? []);
      setLoading(false);
    };
    load();
  }, [profile, adjusting]);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setAdjusting(true);
    await supabase.from("deficit_adjustments").insert({
      user_id:         profile.id,
      adjustment_date: new Date().toISOString().split("T")[0],
      hours_cleared:   8.5,
      adjusted_against: adjustType,
    });
    setShowAdjustment(false);
    setAdjusting(false);
  };

  const todayLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner} /></div>;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>Welcome, {profile?.full_name?.split(" ")[0]} 👋</h1>
        <p>{todayLabel}</p>
      </div>

      {/* ── Deficit Alerts ─────────────────────────────────────────────────── */}
      {deficit.alertLevel === "red" && (
        <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.5)", color: "var(--danger)", padding: 24, borderRadius: 12, marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: "0 0 6px 0" }}>🚨 Salary at Risk — {deficit.evalMonthLabel} Deficit</h3>
            <p style={{ margin: 0, opacity: 0.9 }}>
              You have a <strong>{deficit.deficit}h</strong> deficit from last month.
              Adjust before the 5th or your salary will not be processed.
            </p>
          </div>
          <button onClick={() => setShowAdjustment(true)} className={styles.primaryBtn}
            style={{ background: "var(--danger)", borderColor: "var(--danger)", width: "auto", flexShrink: 0 }}>
            Adjust Now
          </button>
        </div>
      )}

      {deficit.alertLevel === "amber" && deficit.deficit > 0 && (
        <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.4)", color: "#f59e0b", padding: 24, borderRadius: 12, marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 6px 0" }}>⚠️ Attendance Notice — {deficit.evalMonthLabel}</h3>
          <p style={{ margin: 0, opacity: 0.9 }}>
            You are currently running <strong>{deficit.deficit}h</strong> behind your monthly target.
            {deficit.daysLeft > 0 && <> You have <strong>{deficit.daysLeft} working day{deficit.daysLeft !== 1 ? "s" : ""}</strong> left this month to close the gap.</>}
            {deficit.daysLeft === 0 && <> The month has ended — this deficit will carry forward.</>}
          </p>
        </div>
      )}

      {/* Adjustment Modal */}
      {showAdjustment && (
        <div className="overlay" onClick={() => setShowAdjustment(false)}>
          <div className="drawer" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="drawerHeader">
              <h2>Clear Deficit — {deficit.evalMonthLabel}</h2>
              <button onClick={() => setShowAdjustment(false)} className="closeBtn">✕</button>
            </div>
            <p style={{ color: "var(--text-secondary)", marginBottom: 20 }}>
              You are surrendering <strong>1 day (8.5h)</strong> to clear your deficit.
              Sick Leave and Menstrual Leave cannot be used for deficits.
            </p>
            <form onSubmit={handleAdjust}>
              <div className={styles.formGroup}>
                <label>Adjust Against</label>
                <select className="premium-input" value={adjustType} onChange={e => setAdjustType(e.target.value)}>
                  <option value="LWP">Leave Without Pay — 1 Day Salary Deduction</option>
                  <option value="Casual Leave (CL)">Casual Leave (CL)</option>
                  <option value="Earned Leave (EL)">Earned Leave (EL)</option>
                  <option value="Comp-Off">Comp-Off</option>
                </select>
              </div>
              <button type="submit" className={styles.primaryBtn} disabled={adjusting}>
                {adjusting ? "Processing..." : "Confirm Adjustment"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className={styles.statsGrid}>
        {[
          { icon: "🎯", value: `${stats.targetHours}h`, label: "Monthly Target",  badge: "Full Month", cls: "badgeInfo" },
          { icon: "⏱️", value: `${stats.totalHours}h`,  label: "Hours Clocked",   badge: "This Month", cls: "badgeInfo" },
          { icon: "📉",  value: deficit.deficit > 0 ? `${deficit.deficit}h` : "✓ On Track",
            label: deficit.deficit > 0 ? "Deficit Hrs" : "Attendance",
            badge: deficit.deficit > 0 ? "Behind" : "Good", cls: deficit.deficit > 0 ? "badgeDanger" : "badgeSuccess" },
          { icon: "📅", value: stats.approvedLeaves, label: "Leaves Taken", badge: "This Month", cls: "badgeSuccess" },
        ].map((s) => (
          <div key={s.label} className={`glass-panel ${styles.statCard}`}>
            <div className={styles.statIcon}>{s.icon}</div>
            <div className={styles.statValue}>{s.value}</div>
            <div className={styles.statLabel}>{s.label}</div>
            <span className={`${styles.statBadge} ${styles[s.cls as keyof typeof styles]}`}>{s.badge}</span>
          </div>
        ))}
      </div>

      <div className={styles.twoCol}>
        {/* Recent Attendance */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}><h2>Recent Attendance</h2></div>
          <div className={`glass-panel ${styles.tableWrap}`}>
            <table>
              <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Hours</th></tr></thead>
              <tbody>
                {attendance.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "24px" }}>No recent records.</td></tr>
                ) : attendance.map((r) => {
                  const hours = r.check_in && r.check_out
                    ? ((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 3600000).toFixed(1)
                    : null;
                  return (
                    <tr key={r.id}>
                      <td>{r.date}</td>
                      <td>{r.check_in ? new Date(r.check_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                      <td>{r.check_out ? new Date(r.check_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "In Office"}</td>
                      <td>{hours ? `${hours}h` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Announcements */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}><h2>Announcements</h2></div>
          <div className="glass-panel">
            {announcements.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-secondary)" }}>No announcements yet.</div>
            ) : announcements.map((a) => (
              <div key={a.id} className={styles.announcementCard}>
                <div className={styles.announcementTitle}>{a.title}</div>
                <div className={styles.announcementMeta}>{new Date(a.created_at).toLocaleDateString("en-IN")}</div>
                <div className={styles.announcementContent}>{a.content}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
