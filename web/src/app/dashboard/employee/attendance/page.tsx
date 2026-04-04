"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { isWorkingDay } from "@/lib/dateUtils";
import styles from "../../dashboard.module.css";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function isWeeklyOff(date: Date): boolean {
  const dow = date.getDay();
  if (dow === 0) return true; // Sunday always off
  if (dow === 6) {
    const weekNum = Math.ceil(date.getDate() / 7);
    if (weekNum === 1 || weekNum === 3) return true; // 1st & 3rd Sat off
  }
  return false;
}

export default function EmployeeAttendance() {
  const { profile } = useAuth();
  const [records, setRecords] = useState<Record<string, any>>({});
  const [holidays, setHolidays] = useState<Record<string, string>>({}); // date -> name
  const [year, setYear]   = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      setLoading(true);
      const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const [attRes, holRes] = await Promise.all([
        supabase.from("attendance_records").select("*").eq("user_id", profile.id).gte("date", from).lte("date", to),
        supabase.from("company_holidays").select("date, name")
      ]);

      const map: Record<string, any> = {};
      (attRes.data ?? []).forEach((r) => { map[r.date] = r; });
      setRecords(map);

      const hMap: Record<string, string> = {};
      (holRes.data ?? []).forEach((h) => { hMap[h.date] = h.name; });
      setHolidays(hMap);

      setLoading(false);
    };
    load();
  }, [profile, year, month]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const today = new Date().toISOString().split("T")[0];

  const holidaySet = new Set<string>(Object.keys(holidays));

  // Correctly calculate total working days this month
  const totalWorkdays = Array.from({ length: daysInMonth }, (_, i) => {
    return isWorkingDay(new Date(year, month, i + 1), holidaySet) ? 1 : 0;
  }).reduce((a: number, b: number) => a + b, 0);

  const totalWorkingHours = totalWorkdays * 8.5;

  const presentCount = Object.values(records).filter(r => r.check_in).length;

  const getDayInfo = (dateStr: string): { cls: string; label?: string } => {
    const d = new Date(dateStr + "T00:00:00"); // force local parse
    const isHoliday = holidaySet.has(dateStr);
    const isOff = isWeeklyOff(d);
    const rec = records[dateStr];

    if (dateStr === today) return { cls: styles.calDayToday };
    if (isHoliday) return { cls: styles.calDayHoliday, label: holidays[dateStr] };
    if (isOff) return { cls: styles.calDayWeeklyOff, label: d.getDay() === 0 ? "Sun Off" : "Sat Off" };
    if (rec?.check_in) return { cls: styles.calDayPresent };
    if (d < new Date()) return { cls: styles.calDayAbsent };
    return { cls: "" };
  };

  const getTooltip = (dateStr: string): string => {
    const info = getDayInfo(dateStr);
    if (info.label) return info.label;
    const rec = records[dateStr];
    if (rec?.check_in) {
      const inn = new Date(rec.check_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      const out = rec.check_out ? new Date(rec.check_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "In Office";
      return `In: ${inn} | Out: ${out}`;
    }
    return "";
  };

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>My Attendance</h1>
        <p>View your attendance calendar. Weekly offs and holidays are auto-highlighted.</p>
      </div>

      <div className={styles.twoCol} style={{ marginBottom: 24, gridTemplateColumns: "repeat(3, 1fr)" }}>
        {[
          { icon: "✅", value: presentCount, label: "Days Present",        badge: MONTHS[month] },
          { icon: "📊", value: `${presentCount}/${totalWorkdays}`,   label: "Working Days",        badge: "This Month" },
          { icon: "⏱️",  value: `${totalWorkingHours.toFixed(0)}h`,  label: "Required Hours",      badge: "@ 8.5h/day" },
        ].map((s) => (
          <div key={s.label} className={`glass-panel ${styles.statCard}`}>
            <div className={styles.statIcon}>{s.icon}</div>
            <div className={styles.statValue}>{s.value}</div>
            <div className={styles.statLabel}>{s.label}</div>
            <span className={`${styles.statBadge} ${styles.badgeInfo}`}>{s.badge}</span>
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
          {Array.from({ length: firstDayOfWeek }, (_, i) => <div key={`empty-${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const info = getDayInfo(dateStr);
            return (
              <div key={day} className={`${styles.calDay} ${info.cls}`} title={getTooltip(dateStr)}
                style={{ position: "relative", flexDirection: "column", gap: 2, justifyContent: "center" }}>
                <span>{day}</span>
                {info.label && (
                  <span style={{ fontSize: "0.52rem", lineHeight: 1.2, textAlign: "center", opacity: 0.85, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {info.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, marginTop: 20, flexWrap: "wrap" }}>
          {[
            { cls: styles.calDayPresent,   label: "Present" },
            { cls: styles.calDayAbsent,    label: "Absent" },
            { cls: styles.calDayToday,     label: "Today" },
            { cls: styles.calDayWeeklyOff, label: "Weekly Off" },
            { cls: styles.calDayHoliday,   label: "Public Holiday" },
          ].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem", color: "var(--text-secondary)" }}>
              <div className={`${styles.calDay} ${l.cls}`} style={{ width: 18, height: 18, minWidth: 18, padding: 0, borderRadius: 4 }} />
              {l.label}
            </div>
          ))}
        </div>
      </div>

      {/* Detailed records table */}
      <div className={`glass-panel ${styles.tableWrap}`}>
        <table>
          <thead><tr><th>Date</th><th>Day</th><th>Check In</th><th>Check Out</th><th>Hours Worked</th><th>Status</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 32 }}><div className={styles.spinner} style={{ margin: "0 auto" }} /></td></tr>
            ) : Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const d = new Date(dateStr + "T00:00:00");
                const rec = records[dateStr];
                const isHoliday = holidaySet.has(dateStr);
                const isOff = isWeeklyOff(d);
                const isFuture = d > new Date();

                if (isFuture) return null; // don't show future days

                const hours = rec?.check_in && rec?.check_out
                  ? ((new Date(rec.check_out).getTime() - new Date(rec.check_in).getTime()) / 3600000).toFixed(2)
                  : null;

                const status = isHoliday ? `🎉 ${holidays[dateStr]}` :
                               isOff ? (d.getDay() === 0 ? "☀️ Sunday" : "🛋️ Weekly Off") :
                               rec?.check_in ? (rec.check_out ? "✅ Present" : "🟡 In Office") :
                               "❌ Absent";

                return (
                  <tr key={dateStr}>
                    <td>{dateStr}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]}</td>
                    <td>{rec?.check_in ? new Date(rec.check_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td>{rec?.check_out ? new Date(rec.check_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td>{hours ? `${hours} hrs` : "—"}</td>
                    <td>
                      <span style={{ fontSize: "0.83rem", color: isHoliday ? "var(--warning)" : isOff ? "var(--text-secondary)" : rec?.check_in ? "var(--success)" : "var(--danger)" }}>
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
