"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "../dashboard.module.css";

export default function AdminDashboard() {
  const [stats, setStats] = useState({ totalEmployees: 0, presentToday: 0, pendingLeaves: 0, announcements: 0 });
  const [recentAttendance, setRecentAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().split("T")[0];
      const [employees, present, leaves, announcements, attendance] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact" }).eq("role", "employee"),
        supabase.from("attendance_records").select("id", { count: "exact" }).eq("date", today),
        supabase.from("leave_requests").select("id", { count: "exact" }).eq("status", "pending"),
        supabase.from("announcements").select("id", { count: "exact" }),
        supabase.from("attendance_records").select("*, profiles(full_name)").eq("date", today).limit(10),
      ]);
      setStats({
        totalEmployees: employees.count ?? 0,
        presentToday: present.count ?? 0,
        pendingLeaves: leaves.count ?? 0,
        announcements: announcements.count ?? 0,
      });
      setRecentAttendance(attendance.data ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner}></div></div>;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>Admin Dashboard</h1>
        <p>{today}</p>
      </div>

      <div className={styles.statsGrid}>
        {[
          { icon: "👥", value: stats.totalEmployees, label: "Total Employees", badge: "Active", cls: "badgeInfo" },
          { icon: "✅", value: stats.presentToday, label: "Present Today", badge: "Today", cls: "badgeSuccess" },
          { icon: "📅", value: stats.pendingLeaves, label: "Pending Leaves", badge: "Action Needed", cls: "badgeWarning" },
          { icon: "📢", value: stats.announcements, label: "Announcements", badge: "Total", cls: "badgeInfo" },
        ].map((s) => (
          <div key={s.label} className={`glass-panel ${styles.statCard}`}>
            <div className={styles.statIcon}>{s.icon}</div>
            <div className={styles.statValue}>{s.value}</div>
            <div className={styles.statLabel}>{s.label}</div>
            <span className={`${styles.statBadge} ${styles[s.cls]}`}>{s.badge}</span>
          </div>
        ))}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Today&apos;s Attendance</h2>
        </div>
        <div className={`glass-panel ${styles.tableWrap}`}>
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentAttendance.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "32px" }}>No attendance records for today yet.</td></tr>
              ) : recentAttendance.map((rec) => (
                <tr key={rec.id}>
                  <td>{(rec.profiles as any)?.full_name ?? "—"}</td>
                  <td>{rec.check_in ? new Date(rec.check_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td>{rec.check_out ? new Date(rec.check_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td><span className={`${styles.statBadge} ${rec.check_out ? styles.badgeSuccess : styles.badgeWarning}`}>{rec.check_out ? "Completed" : "In Office"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
