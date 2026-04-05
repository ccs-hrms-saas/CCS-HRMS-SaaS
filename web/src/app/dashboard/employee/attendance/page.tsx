"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { isWorkingDay, getLeaveDaysCount } from "@/lib/dateUtils";
import styles from "../../dashboard.module.css";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function isWeeklyOff(date: Date): boolean {
  const dow = date.getDay();
  if (dow === 0) return true;
  if (dow === 6) {
    const weekNum = Math.ceil(date.getDate() / 7);
    if (weekNum === 1 || weekNum === 3) return true;
  }
  return false;
}

/** Return leave type abbreviation for the calendar cell label */
function leaveAbbr(type: string): string {
  if (!type) return "Leave";
  if (type.includes("Casual"))      return "CL";
  if (type.includes("Earned"))      return "EL";
  if (type.includes("Sick"))        return "SL";
  if (type.includes("Menstrua"))    return "ML";
  if (type.includes("Comp"))        return "CO";
  if (type.includes("Without Pay")) return "LWP";
  return type.substring(0, 3).toUpperCase();
}

export default function EmployeeAttendance() {
  const { profile } = useAuth();
  const [records, setRecords]   = useState<Record<string, any>>({});
  const [holidays, setHolidays] = useState<Record<string, string>>({});
  /** dateStr → approved leave type for that day */
  const [leaveDays, setLeaveDays] = useState<Record<string, string>>({});
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

      const [attRes, holRes, lvRes] = await Promise.all([
        supabase.from("attendance_records").select("*").eq("user_id", profile.id).gte("date", from).lte("date", to),
        supabase.from("company_holidays").select("date, name"),
        supabase.from("leave_requests").select("start_date, end_date, type, status")
          .eq("user_id", profile.id)
          .eq("status", "approved")
          .lte("start_date", to)
          .gte("end_date", from),
      ]);

      // Attendance map
      const map: Record<string, any> = {};
      (attRes.data ?? []).forEach((r) => { map[r.date] = r; });
      setRecords(map);

      // Holidays map
      const hMap: Record<string, string> = {};
      (holRes.data ?? []).forEach((h) => { hMap[h.date] = h.name; });
      setHolidays(hMap);

      // Build per-day leave map from approved leave ranges
      // ⚠️ MUST use local date parts — toISOString() shifts IST dates back by 5.5h to UTC
      const localDateStr = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      const ldMap: Record<string, string> = {};
      (lvRes.data ?? []).forEach((lv) => {
        const cur = new Date(lv.start_date + "T00:00:00");
        const end = new Date(lv.end_date + "T00:00:00");
        while (cur <= end) {
          ldMap[localDateStr(cur)] = lv.type;
          cur.setDate(cur.getDate() + 1);
        }
      });

      setLeaveDays(ldMap);

      setLoading(false);
    };
    load();
  }, [profile, year, month]);

  const daysInMonth   = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const today = new Date().toISOString().split("T")[0];
  const holidaySet = new Set<string>(Object.keys(holidays));

  const totalWorkdays = Array.from({ length: daysInMonth }, (_, i) =>
    isWorkingDay(new Date(year, month, i + 1), holidaySet) ? 1 : 0
  ).reduce((a: number, b: number) => a + b, 0);
  const totalWorkingHours = totalWorkdays * 8.5;
  const presentCount = Object.values(records).filter(r => r.check_in).length;
  const leaveDayCount = Object.keys(leaveDays).filter(d => {
    const dt = new Date(d + "T00:00:00");
    return dt.getMonth() === month && dt.getFullYear() === year;
  }).length;

  /**
   * Classify a day:
   * - "present"   : has check-in
   * - "on_leave"  : approved leave (even without check-in)
   * - "absent"    : working day, past, no check-in, no approved leave
   * - "weekly_off"
   * - "holiday"
   * - "future"
   * - "today"
   */
  type DayKind = "present" | "on_leave" | "absent" | "weekly_off" | "holiday" | "today" | "future";
  const classifyDay = (dateStr: string): { kind: DayKind; leaveType?: string; holidayName?: string } => {
    const d = new Date(dateStr + "T00:00:00");
    const rec = records[dateStr];
    const isPast = d < new Date(today + "T00:00:00");

    if (dateStr === today)          return { kind: "today" };
    if (!isPast && dateStr !== today) return { kind: "future" };
    if (holidaySet.has(dateStr))    return { kind: "holiday", holidayName: holidays[dateStr] };
    if (isWeeklyOff(d))             return { kind: "weekly_off" };
    if (rec?.check_in)              return { kind: "present" };
    if (leaveDays[dateStr])         return { kind: "on_leave", leaveType: leaveDays[dateStr] };
    return { kind: "absent" };
  };

  const kindToCalCls = (kind: DayKind): string => {
    switch (kind) {
      case "present":    return styles.calDayPresent;
      case "on_leave":   return styles.calDayLeave ?? styles.calDayHoliday;
      case "absent":     return styles.calDayAbsent;
      case "weekly_off": return styles.calDayWeeklyOff;
      case "holiday":    return styles.calDayHoliday;
      case "today":      return styles.calDayToday;
      default:           return "";
    }
  };

  const getStatusText = (dateStr: string): { text: string; color: string } => {
    const { kind, leaveType, holidayName } = classifyDay(dateStr);
    const d = new Date(dateStr + "T00:00:00");
    switch (kind) {
      case "present":    return { text: records[dateStr]?.check_out ? "✅ Present" : "🟡 In Office", color: "var(--success)" };
      case "on_leave":   return { text: `🏖️ On ${leaveType}`, color: "#3b82f6" };
      case "absent":     return { text: "❌ Absent (LWP)", color: "var(--danger)" };
      case "weekly_off": return { text: d.getDay() === 0 ? "☀️ Sunday" : "🛋️ Weekly Off", color: "var(--text-secondary)" };
      case "holiday":    return { text: `🎉 ${holidayName}`, color: "var(--warning)" };
      case "today":      return { text: records[dateStr]?.check_in ? "🟡 In Office" : "📅 Today", color: "var(--accent-primary)" };
      default:           return { text: "", color: "" };
    }
  };

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>My Attendance</h1>
        <p>View your attendance calendar. Approved leaves are shown in blue.</p>
      </div>

      <div className={styles.twoCol} style={{ marginBottom: 24, gridTemplateColumns: "repeat(4, 1fr)" }}>
        {[
          { icon: "✅", value: presentCount,                          label: "Days Present",    badge: MONTHS[month] },
          { icon: "🏖️", value: leaveDayCount,                        label: "Leave Days",      badge: "Approved"    },
          { icon: "📊", value: `${presentCount}/${totalWorkdays}`,   label: "Working Days",    badge: "This Month"  },
          { icon: "⏱️", value: `${totalWorkingHours.toFixed(0)}h`,   label: "Required Hours",  badge: "@ 8.5h/day"  },
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
            const { kind, leaveType, holidayName } = classifyDay(dateStr);
            const calCls = kindToCalCls(kind);
            const sublabel = kind === "on_leave" && leaveType ? leaveAbbr(leaveType)
                           : kind === "holiday" ? holidayName?.substring(0, 8)
                           : kind === "weekly_off" ? (new Date(dateStr + "T00:00:00").getDay() === 0 ? "Sun" : "Sat")
                           : undefined;

            return (
              <div key={day} className={`${styles.calDay} ${calCls}`}
                title={kind === "on_leave" ? `On ${leaveType}` : holidayName ?? ""}
                style={{ position: "relative", flexDirection: "column", gap: 2, justifyContent: "center",
                  ...(kind === "on_leave" ? { background: "rgba(59,130,246,0.15)", borderColor: "rgba(59,130,246,0.4)" } : {}) }}>
                <span>{day}</span>
                {sublabel && (
                  <span style={{ fontSize: "0.52rem", lineHeight: 1.2, textAlign: "center", opacity: 0.85, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sublabel}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, marginTop: 20, flexWrap: "wrap" }}>
          {[
            { color: "rgba(16,185,129,0.25)", border: "rgba(16,185,129,0.5)", label: "Present" },
            { color: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.4)", label: "On Leave" },
            { color: "rgba(239,68,68,0.2)",   border: "rgba(239,68,68,0.5)",  label: "Absent"  },
            { color: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.1)", label: "Weekly Off" },
            { color: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.4)", label: "Holiday"  },
          ].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem", color: "var(--text-secondary)" }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, background: l.color, border: `1px solid ${l.border}` }} />
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
                const { kind } = classifyDay(dateStr);

                if (kind === "future") return null;

                const hours = rec?.check_in && rec?.check_out
                  ? ((new Date(rec.check_out).getTime() - new Date(rec.check_in).getTime()) / 3600000).toFixed(2)
                  : null;

                const { text: statusText, color: statusColor } = getStatusText(dateStr);

                return (
                  <tr key={dateStr}>
                    <td>{dateStr}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{DAYS[d.getDay()]}</td>
                    <td>{rec?.check_in ? new Date(rec.check_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td>{rec?.check_out ? new Date(rec.check_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td>{hours ? `${hours} hrs` : "—"}</td>
                    <td>
                      <span style={{ fontSize: "0.83rem", color: statusColor }}>{statusText}</span>
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
