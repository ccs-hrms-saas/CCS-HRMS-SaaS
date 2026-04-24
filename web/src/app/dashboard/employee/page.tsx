"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/context/AppSettingsContext";
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
  const { companyName, whiteLabel } = useAppSettings();
  const displayName = (whiteLabel.tier >= 2 && whiteLabel.name) ? whiteLabel.name : (companyName || "");
  const [stats, setStats]         = useState({ presentDays: 0, totalHours: 0, targetHours: 0, approvedLeaves: 0, pendingLeaves: 0 });
  const [deficit, setDeficit]     = useState<DeficitState>({ deficit: 0, evalMonthLabel: "", daysLeft: 0, alertLevel: "none", isSalaryPeriod: false });
  const [shiftInfo, setShiftInfo] = useState<{ start?: string; end?: string; hours?: number } | null>(null);
  const [hpd, setHpd]             = useState<number>(8.5);
  const [pendingTeamLeaves, setPendingTeamLeaves] = useState(0);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjustType, setAdjustType]         = useState("LWP");
  const [adjusting, setAdjusting]           = useState(false);
  const [announcements, setAnnouncements]   = useState<any[]>([]);
  const [attendance, setAttendance]         = useState<any[]>([]);
  const [loading, setLoading]               = useState(true);
  // Kiosk PIN
  const [kioskPin, setKioskPin]           = useState<string | null>(null);
  const [pinSecondsLeft, setPinSecondsLeft] = useState(60);

  useEffect(() => {
    if (!profile) return;
    // Fetch kiosk PIN on mount and every 60 seconds
    const fetchPin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/employee/my-pin', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (res.ok) {
        const d = await res.json();
        setKioskPin(d.pin);
        setPinSecondsLeft(d.secondsLeft);
      }
    };
    fetchPin();
    const pinInterval = setInterval(fetchPin, 60000);
    // Countdown timer
    const countdownInterval = setInterval(() => setPinSecondsLeft(s => s > 0 ? s - 1 : 60), 1000);

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
      const [attnAll, leavePending, leaveApprovedRes, announcementsData, holsRes, adjsRes, waiversRes, leaveTypesRes, settingsRes] = await Promise.all([
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
        supabase.from("leave_types").select("name, deduction_hours, count_holidays"),
        // Fetch org working hours setting (company-scoped)
        supabase.from("app_settings").select("hours_per_day").eq("company_id", profile.company_id).single(),
      ]);

      const hols = new Set<string>();
      (holsRes.data ?? []).forEach(h => hols.add(h.date));

      // Resolve daily working hours: per-employee override → org setting → 8.5 fallback
      const { resolveHoursPerDay, formatShiftTime } = await import("@/lib/dateUtils");
      const orgHours  = settingsRes.data?.hours_per_day ?? null;
      const empHours  = (profile as any).hours_per_day ?? null;
      const HPD       = resolveHoursPerDay(empHours, orgHours); // hours per day
      setHpd(HPD);

      // Populate shift info for display in header
      const st = (profile as any).shift_start_time;
      const et = (profile as any).shift_end_time;
      if (st) setShiftInfo({ start: formatShiftTime(st), end: et ? formatShiftTime(et) : undefined, hours: HPD });

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
      const evalTargetHours = evalTargetDays * HPD;

      // ── Hours clocked in the eval month ─────────────────────────────────────
      const evalRecords = (attnAll.data ?? []).filter(r => r.date >= evalFrom && r.date <= evalTo);
      let evalClocked = 0;
      evalRecords.forEach(r => {
        if (r.check_in && r.check_out)
          evalClocked += (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 3600000;
        // If checked in today but no checkout (currently in office), count as working — skip from deficit
      });

      // Menstruation leave applies a penalty to actual hours logged
      let evalMlPenalty = 0;
      leaveApproved.forEach(l => {
         const t = leaveTypesRes?.data?.find((x: any) => x.name === l.type);
         if (t?.name === "Menstruation Leave") {
            let d = new Date(l.start_date);
            const end = new Date(l.end_date);
            while (d <= end) {
               const ds = d.toISOString().split("T")[0];
               if (ds >= evalFrom && ds <= evalTo) {
                   evalMlPenalty += Number(t.deduction_hours || 0);
               }
               d.setDate(d.getDate() + 1);
            }
         }
      });
      evalClocked -= evalMlPenalty;

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
      if (isSalaryPeriod && finalDeficit >= HPD) {
        alertLevel = "red";   // Previous month deficit ≥ 1 full day during processing window
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

      // Menstruation leave applies a penalty to actual hours logged
      let currMlPenalty = 0;
      leaveApproved.forEach(l => {
         const t = leaveTypesRes?.data?.find((x: any) => x.name === l.type);
         if (t?.name === "Menstruation Leave") {
            let d = new Date(l.start_date);
            const end = new Date(l.end_date);
            while (d <= end) {
               const ds = d.toISOString().split("T")[0];
               if (ds >= currFrom && ds <= currTo) {
                   currMlPenalty += Number(t.deduction_hours || 0);
               }
               d.setDate(d.getDate() + 1);
            }
         }
      });
      currClocked -= currMlPenalty;

      const currLeavesThisMonth = leaveApproved.filter(l => l.start_date <= currTo && l.end_date >= currFrom).length;

      setStats({
        presentDays:    currRecords.filter(r => r.check_in).length,
        totalHours:     Math.round(currClocked * 10) / 10,
        targetHours:    Math.round(fullMonthTargetDays * HPD * 10) / 10,
        approvedLeaves: currLeavesThisMonth,
        pendingLeaves:  leavePending.count ?? 0,
      });

      setAttendance((attnAll.data ?? []).filter(r => r.date >= currFrom).slice(-7).reverse());
      setAnnouncements(announcementsData.data ?? []);

      // ── Manager check: pending team leave requests ───────────────────────
      const { data: reportees } = await supabase
        .from("profiles")
        .select("id")
        .eq("manager_id", profile.id)
        .eq("is_active", true);
      if (reportees && reportees.length > 0) {
        const { count: teamPendingCount } = await supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .in("user_id", reportees.map(r => r.id))
          .eq("status", "pending");
        setPendingTeamLeaves(teamPendingCount ?? 0);
      } else {
        setPendingTeamLeaves(0);
      }

      setLoading(false);
    };
    load();
    return () => {
      clearInterval(pinInterval);
      clearInterval(countdownInterval);
    };
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
        <p>
          {displayName ? <><span style={{ color: "var(--accent-primary)", fontWeight: 600 }}>{displayName}</span> &nbsp;·&nbsp; </> : null}
          {todayLabel}
          {shiftInfo?.start && (
            <span style={{ marginLeft: 12, fontSize: "0.82rem", color: "#818cf8", background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.25)", borderRadius: 8, padding: "2px 10px", whiteSpace: "nowrap" }}>
              ⏰ {shiftInfo.start}{shiftInfo.end ? ` – ${shiftInfo.end}` : ""}{shiftInfo.hours ? ` · ${shiftInfo.hours}h/day` : ""}
            </span>
          )}
        </p>
      </div>

      {/* ── Manager: Pending Team Leave Alert ──────────────────────────────── */}
      {pendingTeamLeaves > 0 && (
        <a href="/dashboard/employee/team?pending=1" style={{ textDecoration: "none", display: "block", marginBottom: 24 }}>
          <div style={{
            background: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(251,191,36,0.08))",
            border: "1px solid rgba(245,158,11,0.45)",
            borderRadius: 12, padding: "14px 20px",
            display: "flex", alignItems: "center", gap: 14, cursor: "pointer",
            transition: "border-color 0.2s",
          }}>
            <span style={{ fontSize: "1.5rem", flexShrink: 0 }}>📋</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: "#f59e0b", fontSize: "0.95rem" }}>
                Action Required — {pendingTeamLeaves} Pending Leave Approval{pendingTeamLeaves > 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: 2 }}>
                Team member{pendingTeamLeaves > 1 ? "s have" : " has"} applied for leave and {pendingTeamLeaves > 1 ? "are" : "is"} awaiting your decision. Click to review.
              </div>
            </div>
            <span style={{ color: "#f59e0b", fontSize: "1.1rem", flexShrink: 0 }}>→</span>
          </div>
        </a>
      )}

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
              You are surrendering <strong>1 day ({hpd}h)</strong> to clear your deficit.
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

      {/* ── Kiosk Attendance PIN Card ──────────────────────────────────────── */}
      {kioskPin && (
        <div style={{
          background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))",
          border: "1px solid rgba(99,102,241,0.3)", borderRadius: 16,
          padding: "20px 28px", marginBottom: 24,
          display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
        }}>
          <div style={{ fontSize: "2.6rem", letterSpacing: 10, fontWeight: 900,
            fontVariantNumeric: "tabular-nums", color: "#a5b4fc", fontFamily: "monospace" }}>
            {kioskPin}
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontWeight: 700, color: "#c7d2fe", fontSize: "0.95rem", marginBottom: 2 }}>
              🔐 Kiosk Attendance PIN
            </div>
            <div style={{ color: "#64748b", fontSize: "0.78rem" }}>
              Enter this at the kiosk to clock in/out. Refreshes every 60 seconds.
            </div>
          </div>
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%",
              background: `conic-gradient(#6366f1 ${(pinSecondsLeft/60)*360}deg, rgba(99,102,241,0.1) 0deg)`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: "50%",
                background: "#0f111a",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.7rem", fontWeight: 700, color: "#6366f1",
              }}>{pinSecondsLeft}s</div>
            </div>
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
