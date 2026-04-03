"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import styles from "../dashboard.module.css";

export default function EmployeeDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({ presentDays: 0, totalHours: 0, targetHours: 0, surplusDeficit: 0, pendingLeaves: 0, approvedLeaves: 0 });
  const [totalDeficit, setTotalDeficit] = useState(0);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjustType, setAdjustType] = useState("LWP");
  const [adjusting, setAdjusting] = useState(false);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      const thisMonth = new Date();
      const from = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1).toISOString().split("T")[0];
      const to = new Date().toISOString().split("T")[0];

      const [attnData, leavePending, leaveApprovedRes, announcementsData, holsRes, typesRes, adjsRes] = await Promise.all([
        supabase.from("attendance_records").select("*").eq("user_id", profile.id).lte("date", to),
        supabase.from("leave_requests").select("id", { count: "exact" }).eq("user_id", profile.id).eq("status", "pending"),
        supabase.from("leave_requests").select("*").eq("user_id", profile.id).eq("status", "approved").lte("end_date", to),
        supabase.from("announcements").select("*, profiles(full_name)").order("created_at", { ascending: false }).limit(5),
        supabase.from("company_holidays").select("date").lte("date", to),
        supabase.from("leave_types").select("*"),
        supabase.from("deficit_adjustments").select("hours_cleared").eq("user_id", profile.id)
      ]);

      const records = attnData.data ?? [];
      const totalHours = records.reduce((sum, r) => {
        if (r.check_in && r.check_out) {
          return sum + (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 3600000;
        }
        return sum;
      }, 0);

      const { getWorkingDaysInMonth, isWorkingDay, getLeaveDaysCount } = await import("@/lib/dateUtils");
      const hols = new Set<string>();
      (holsRes.data ?? []).forEach(h => hols.add(h.date));

      let targetWorkingDays = 0;
      let curr = new Date(from);
      const endD = new Date(to);
      while (curr <= endD) { if (isWorkingDay(curr, hols)) targetWorkingDays++; curr.setDate(curr.getDate() + 1); }
      
      let baseTargetHours = targetWorkingDays * 8.5;
      let deductedHours = 0;
      const leaveApproved = leaveApprovedRes.data ?? [];
      const lTypes = typesRes.data ?? [];
      
      let allTargetDays = 0;
      let allDeducted = 0;
      let allClocked = 0;

      // Simplistic engine: Calculate over all time (based on first attendance date or start of month)
      const recordsAll = attnData.data ?? [];
      const firstDateStr = recordsAll.length > 0 ? recordsAll.reduce((min, r) => r.date < min ? r.date : min, recordsAll[0].date) : from;
      
      let cDt = new Date(firstDateStr);
      const eDt = new Date(to);
      while (cDt <= eDt) { if (isWorkingDay(cDt, hols)) allTargetDays++; cDt.setDate(cDt.getDate() + 1); }
      
      (leaveApprovedRes.data ?? []).forEach(l => {
         const tObj = lTypes.find(t => t.name === l.type);
         const days = getLeaveDaysCount(l.start_date, l.end_date, tObj?.count_holidays ?? false, hols);
         allDeducted += (days * (tObj ? Number(tObj.deduction_hours) : 8.5));
      });

      recordsAll.forEach(r => {
        if (r.check_in && r.check_out) {
          allClocked += (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 3600000;
        }
      });

      let pastAdjustments = 0;
      (adjsRes.data ?? []).forEach(a => pastAdjustments += Number(a.hours_cleared));

      const rawDeficit = Math.max(0, (allTargetDays * 8.5) - allDeducted - allClocked);
      const actualDeficit = Math.max(0, rawDeficit - pastAdjustments);
      setTotalDeficit(Math.round(actualDeficit * 10) / 10);

      // Current month stats
      const thisMonthRecs = recordsAll.filter(r => r.date >= from);
      const targetHours = Math.max(0, baseTargetHours - deductedHours);
      const totalHoursNum = Math.round(totalHours * 10) / 10;

      setStats({
        presentDays: records.filter(r => r.check_in).length,
        totalHours: totalHoursNum,
        targetHours: Math.round(targetHours * 10) / 10,
        surplusDeficit: Math.round((totalHoursNum - targetHours) * 10) / 10,
        pendingLeaves: leavePending.count ?? 0,
        approvedLeaves: leaveApproved.length,
      });
      setAttendance(records.slice(-7).reverse());
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
      user_id: profile.id,
      adjustment_date: new Date().toISOString().split("T")[0],
      hours_cleared: 8.5,
      adjusted_against: adjustType
    });
    // In a real system, you would also trigger a DB function to reduce the specific ledger balance (if CL/EL), or an Admin would see it.
    // For now, we simply record it. LWP automatically hooks into the Payroll script.
    setShowAdjustment(false);
    setAdjusting(false);
  };

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner}></div></div>;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>Welcome, {profile?.full_name?.split(" ")[0]} 👋</h1>
        <p>{today}</p>
      </div>

      {totalDeficit >= 8.5 && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)", color: "var(--danger)", padding: 24, borderRadius: 12, marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: "0 0 8px 0" }}>⚠️ Working Hours Shortage Detected</h3>
            <p style={{ margin: 0, opacity: 0.9 }}>You have a rolling deficit of <strong>{totalDeficit} hours</strong>. You must clear this 8.5h full-day shortage.</p>
          </div>
          <button onClick={() => setShowAdjustment(true)} className={styles.primaryBtn} style={{ background: "var(--danger)", borderColor: "var(--danger)", width: "auto" }}>Adjust Shortage</button>
        </div>
      )}

      {showAdjustment && (
        <div className="overlay" onClick={() => setShowAdjustment(false)}>
          <div className="drawer" onClick={e => e.stopPropagation()} style={{maxWidth: 400}}>
             <div className="drawerHeader"><h2>Clear Shortage</h2><button onClick={() => setShowAdjustment(false)} className="closeBtn">✕</button></div>
             <p style={{color: "var(--text-secondary)", marginBottom: 20}}>You are surrendering a 1-day value (8.5h) to clear your deficit. This cannot use Sick or Menstrual balances.</p>
             <form onSubmit={handleAdjust}>
               <div className={styles.formGroup}>
                 <label>Adjust Against</label>
                 <select className="premium-input" value={adjustType} onChange={e => setAdjustType(e.target.value)}>
                   <option value="LWP">Leave Without Pay (1 Day Salary Deduction)</option>
                   <option value="Casual Leave (CL)">Casual Leave (CL)</option>
                   <option value="Earned Leave (EL)">Earned Leave (EL)</option>
                   <option value="Comp-Off">Comp-Off</option>
                 </select>
               </div>
               <button type="submit" className={styles.primaryBtn} disabled={adjusting}>{adjusting ? "Processing..." : "Confirm Adjustment"}</button>
             </form>
          </div>
        </div>
      )}

      <div className={styles.statsGrid}>
        {[
          { icon: "🎯", value: `${stats.targetHours}h`, label: "Target Required", badge: "Demanded", cls: "badgeWarning" },
          { icon: "⏱️", value: `${stats.totalHours}h`, label: "Hours Clocked", badge: "This Month", cls: "badgeInfo" },
          { icon: stats.surplusDeficit >= 0 ? "🚀" : "📉", value: `${Math.abs(stats.surplusDeficit)}h`, label: stats.surplusDeficit >= 0 ? "Surplus Time" : "Deficit Time", badge: stats.surplusDeficit >= 0 ? "Ahead" : "Behind", cls: stats.surplusDeficit >= 0 ? "badgeSuccess" : "badgeDanger" },
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
