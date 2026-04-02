"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import styles from "../../dashboard.module.css";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default function EmployeeAttendance() {
  const { profile } = useAuth();
  const [records, setRecords] = useState<Record<string, any>>({});
  const [year, setYear]   = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      setLoading(true);
      const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const to = `${year}-${String(month + 1).padStart(2, "0")}-${lastDay}`;
      const { data } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("user_id", profile.id)
        .gte("date", from)
        .lte("date", to);
      const map: Record<string, any> = {};
      (data ?? []).forEach((r) => { map[r.date] = r; });
      setRecords(map);
      setLoading(false);
    };
    load();
  }, [profile, year, month]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const today = new Date().toISOString().split("T")[0];

  const getDayClass = (dateStr: string) => {
    const r = records[dateStr];
    if (dateStr === today) return styles.calDayToday;
    if (r?.check_in) return styles.calDayPresent;
    const d = new Date(dateStr);
    if (d < new Date() && d.getDay() !== 0 && d.getDay() !== 6) return styles.calDayAbsent;
    return "";
  };

  const presentCount = Object.values(records).filter(r => r.check_in).length;
  const totalWorkdays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month, i + 1);
    return d.getDay() !== 0 && d.getDay() !== 6 ? 1 : 0;
  }).reduce((acc: number, val: number) => acc + val, 0);

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>My Attendance</h1>
        <p>View your attendance calendar and daily records</p>
      </div>

      <div className={styles.twoCol} style={{ marginBottom: 24 }}>
        {[
          { icon: "✅", value: presentCount, label: "Days Present", badge: MONTHS[month], cls: "badgeSuccess" },
          { icon: "📊", value: `${presentCount}/${totalWorkdays}`, label: "Attendance Rate", badge: "Workdays", cls: "badgeInfo" },
        ].map((s) => (
          <div key={s.label} className={`glass-panel ${styles.statCard}`}>
            <div className={styles.statIcon}>{s.icon}</div>
            <div className={styles.statValue}>{s.value}</div>
            <div className={styles.statLabel}>{s.label}</div>
            <span className={`${styles.statBadge} ${styles[s.cls as keyof typeof styles]}`}>{s.badge}</span>
          </div>
        ))}
      </div>

      <div className="glass-panel" style={{ padding: 28, marginBottom: 24 }}>
        {/* Month Navigator */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <button onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}
            style={{ background: "none", border: "1px solid var(--glass-border)", color: "var(--text-primary)", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontFamily: "Outfit, sans-serif" }}>
            ‹ Prev
          </button>
          <h2 style={{ fontSize: "1rem" }}>{MONTHS[month]} {year}</h2>
          <button onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }}
            style={{ background: "none", border: "1px solid var(--glass-border)", color: "var(--text-primary)", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontFamily: "Outfit, sans-serif" }}>
            Next ›
          </button>
        </div>

        {/* Day headers */}
        <div className={styles.calendarGrid}>
          {DAYS.map(d => <div key={d} className={`${styles.calDay} ${styles.calDayHeader}`}>{d}</div>)}
          {/* Empty cells for first week offset */}
          {Array.from({ length: firstDayOfWeek }, (_, i) => <div key={`empty-${i}`} />)}
          {/* Day cells */}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const rec = records[dateStr];
            return (
              <div key={day} className={`${styles.calDay} ${getDayClass(dateStr)}`} title={rec ? `In: ${rec.check_in ? new Date(rec.check_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"} | Out: ${rec.check_out ? new Date(rec.check_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}` : ""}>
                {day}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 20, marginTop: 20, flexWrap: "wrap" }}>
          {[
            { cls: styles.calDayPresent, label: "Present" },
            { cls: styles.calDayAbsent,  label: "Absent"  },
            { cls: styles.calDayToday,   label: "Today"   },
          ].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              <div className={`${styles.calDay} ${l.cls}`} style={{ width: 20, height: 20, minWidth: 20, padding: 0, borderRadius: 4, fontSize: "0.6rem" }}></div>
              {l.label}
            </div>
          ))}
        </div>
      </div>

      {/* Detailed records table */}
      <div className={`glass-panel ${styles.tableWrap}`}>
        <table>
          <thead><tr><th>Date</th><th>Check In</th><th>Check Out</th><th>Hours Worked</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ textAlign: "center", padding: 32 }}><div className={styles.spinner} style={{ margin: "0 auto" }}></div></td></tr>
            ) : Object.values(records).length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "24px" }}>No records for {MONTHS[month]}.</td></tr>
            ) : Object.values(records).sort((a, b) => b.date.localeCompare(a.date)).map((r: any) => {
              const hours = r.check_in && r.check_out
                ? ((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 3600000).toFixed(2)
                : null;
              return (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.check_in ? new Date(r.check_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td>{r.check_out ? new Date(r.check_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "In Office"}</td>
                  <td>{hours ? `${hours} hrs` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
