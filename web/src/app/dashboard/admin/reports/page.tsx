"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import * as XLSX from "xlsx";
import styles from "../../dashboard.module.css";
import { getLeaveDaysCount, isWorkingDay, isLateArrival, formatShiftTime, resolveHoursPerDay } from "@/lib/dateUtils";


type Tab = "attendance" | "leaves" | "employee" | "balances";
type SortDir = "asc" | "desc";
type Period = "today" | "week" | "month" | "quarter" | "year" | "custom";

/* ── IST date helpers (UTC+5:30) ── */
// All date calculations MUST use IST. new Date() in JS returns UTC on servers;
// we shift by +5h30m so that "today" is always the Indian calendar date.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const nowIST = () => new Date(Date.now() + IST_OFFSET_MS);
const isoDate = (d: Date) => d.toISOString().split("T")[0];  // safe because d is already IST-shifted
const todayIST = () => { const d = nowIST(); d.setUTCHours(0, 0, 0, 0); return d; };

const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const fmtTime = (d?: string) => d ? new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—";
const diffHrs = (ci?: string, co?: string) => ci && co ? (new Date(co).getTime() - new Date(ci).getTime()) / 3600000 : 0;

function periodDates(p: Period): { from: string; to: string } {
  const today = todayIST();
  const to = isoDate(today);
  if (p === "today") return { from: to, to };
  if (p === "week") {
    const mon = new Date(today);
    mon.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
    return { from: isoDate(mon), to };
  }
  if (p === "month") {
    const m1 = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    return { from: isoDate(m1), to };
  }
  if (p === "quarter") {
    const qStart = new Date(Date.UTC(today.getUTCFullYear(), Math.floor(today.getUTCMonth() / 3) * 3, 1));
    return { from: isoDate(qStart), to };
  }
  if (p === "year") {
    return { from: `${today.getUTCFullYear()}-01-01`, to };
  }
  // default: month
  const m1 = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  return { from: isoDate(m1), to };
}

function countWorkingDays(from: string, to: string): number {
  let count = 0; const cur = new Date(from);
  while (cur <= new Date(to)) { if (isWorkingDay(cur)) count++; cur.setDate(cur.getDate() + 1); }
  return count;
}
function fullMonthWorkingDays(from: string, to: string): number {
  const s = new Date(from), e = new Date(to);
  const mStart = new Date(s.getFullYear(), s.getMonth(), 1);
  const mEnd   = new Date(e.getFullYear(), e.getMonth() + 1, 0);
  return countWorkingDays(isoDate(mStart), isoDate(mEnd));
}

/* ── sort indicator ── */
function SortIcon({ col, sortCol, sortDir }: { col: string; sortCol: string; sortDir: SortDir }) {
  if (col !== sortCol) return <span style={{ opacity: 0.3, fontSize: "0.7rem" }}> ↕</span>;
  return <span style={{ color: "#6366f1", fontSize: "0.7rem" }}> {sortDir === "asc" ? "↑" : "↓"}</span>;
}

export default function AdminReports() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>("attendance");
  const [employees, setEmployees] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(["all"]));
  const [showEmpPicker, setShowEmpPicker] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
  const [fromDate, setFromDate] = useState(() => { const t = todayIST(); return `${t.getUTCFullYear()}-${String(t.getUTCMonth()+1).padStart(2,'0')}-01`; });
  const [toDate, setToDate] = useState(() => isoDate(todayIST()));
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentFY, setCurrentFY] = useState(() => { const t = todayIST(); return t.getUTCMonth() < 3 ? t.getUTCFullYear() - 1 : t.getUTCFullYear(); });
  const [rawRecords, setRawRecords] = useState<any[]>([]);
  const [leaveRecords, setLeaveRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [orgHoursPerDay, setOrgHoursPerDay] = useState<number>(8.5); // from app_settings

  useEffect(() => {
    const companyId = profile?.company_id;
    if (!companyId) return;
    supabase
      .from("profiles")
      .select("id, full_name, shift_start_time, shift_end_time, hours_per_day")
      .eq("company_id", companyId)
      .is("system_role", null)
      .eq("is_active", true)
      .order("full_name")
      .then(({ data }) => setEmployees(data ?? []));
    supabase.from("leave_types").select("*").eq("company_id", companyId).then(({ data }) => setLeaveTypes(data ?? []));
    // Fetch org-level working hours for target calculation
    supabase.from("app_settings").select("hours_per_day").eq("company_id", companyId).single()
      .then(({ data }) => { if (data?.hours_per_day) setOrgHoursPerDay(Number(data.hours_per_day)); });

    // ── Auto absence deduction: silently run for the previous completed month ──
    const now = new Date();
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevFrom = prevMonthDate.toISOString().split("T")[0];
    const prevTo = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];
    fetch("/api/absence-deduction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_all: true, from: prevFrom, to: prevTo, company_id: companyId }),
    }).catch(() => {});
  }, [profile]);

  /* ── Employee selection ── */
  const allSelected = selected.has("all");
  const toggleAll = () => setSelected(new Set(["all"]));
  const toggleEmp = (id: string) => {
    const next = new Set(selected); next.delete("all");
    if (next.has(id)) { next.delete(id); if (next.size === 0) next.add("all"); } else next.add(id);
    setSelected(next);
  };
  const selectedIds = allSelected ? employees.map(e => e.id) : [...selected];
  const selLabel = allSelected ? "All Employees" : selectedIds.length === 1
    ? employees.find(e => e.id === selectedIds[0])?.full_name : `${selectedIds.length} Selected`;

  /* ── Period preset ── */
  const applyPeriod = (p: Period) => {
    setPeriod(p);
    if (p !== "custom") {
      const { from, to } = periodDates(p);
      setFromDate(from); setToDate(to);
    }
  };

  /* ── Sort handler ── */
  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };
  const thProps = (col: string) => ({
    onClick: () => handleSort(col),
    style: { cursor: "pointer", userSelect: "none" as const, whiteSpace: "nowrap" as const }
  });

  /* ── Load data ── */
  const load = async () => {
    setLoading(true); setRawRecords([]); setLeaveRecords([]);
    const ids = selectedIds;

    if (tab === "attendance" || tab === "employee") {
      // Use server-side API to bypass RLS — admin reads all company records
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const res = await fetch(
        `/api/admin/attendance-data?from=${fromDate}&to=${toDate}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const json = await res.json();

      // Reconstruct profiles(full_name, id) shape that the rest of the page expects
      const empMap = Object.fromEntries((json.employees ?? []).map((e: any) => [e.id, e]));
      const atRecords = (json.attendance ?? [])
        .filter((r: any) => ids.includes(r.user_id))
        .map((r: any) => ({ ...r, profiles: empMap[r.user_id] ? { full_name: empMap[r.user_id].full_name, id: r.user_id } : null }));
      const lvRecords = (json.leaveApproved ?? []).filter((l: any) => ids.includes(l.user_id));

      setRawRecords(atRecords);
      setLeaveRecords(lvRecords);

    } else if (tab === "leaves") {
      // Leave applications tab — also needs server bypass for cross-employee reads
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const res = await fetch(
        `/api/admin/attendance-data?from=${fromDate}&to=${toDate}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const json = await res.json();
      const empMap = Object.fromEntries((json.employees ?? []).map((e: any) => [e.id, e]));
      let lvAll = [...(json.leaveApproved ?? []), ...(json.leavePending ?? [])]
        .filter((l: any) => ids.includes(l.user_id))
        .map((l: any) => ({ ...l, profiles: empMap[l.user_id] ? { full_name: empMap[l.user_id].full_name } : null }));
      if (statusFilter !== "all") lvAll = lvAll.filter(l => l.status === statusFilter);
      lvAll.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
      setRawRecords(lvAll);

    } else if (tab === "balances") {
      const { data } = await supabase.from("leave_balances")
        .select("*, profiles(id, full_name), leave_types(name)").eq("financial_year", currentFY).in("user_id", ids);
      setRawRecords(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [tab, selected]);

  /* ── Consolidated attendance summary ── */
  const workingDaysInRange    = useMemo(() => countWorkingDays(fromDate, toDate),     [fromDate, toDate]);
  const workingDaysInFullMonth = useMemo(() => fullMonthWorkingDays(fromDate, toDate), [fromDate, toDate]);

  const summary = useMemo(() => {
    if (tab !== "attendance") return [];

    // Group attendance by employee
    const empMap: Record<string, { name: string; rows: any[] }> = {};
    rawRecords.forEach(r => {
      const id = r.profiles?.id ?? r.user_id;
      if (!empMap[id]) empMap[id] = { name: r.profiles?.full_name ?? "—", rows: [] };
      empMap[id].rows.push(r);
    });

    // Ensure employees with 0 attendance still appear if selected
    selectedIds.forEach(id => {
      const emp = employees.find(e => e.id === id);
      if (emp && !empMap[id]) empMap[id] = { name: emp.full_name, rows: [] };
    });

    return Object.entries(empMap).map(([id, { name, rows }]) => {
      // Build map of dates→leaveType from approved leaves for this employee
      const empLeaves = leaveRecords.filter(l => l.user_id === id);
      const leaveMap = new Map<string, string>();  // date → leave type
      empLeaves.forEach(l => {
        const cursor = new Date(l.start_date + "T00:00:00");
        const end    = new Date(l.end_date   + "T00:00:00");
        while (cursor <= end) {
          const ds = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,"0")}-${String(cursor.getDate()).padStart(2,"0")}`;
          leaveMap.set(ds, l.type);
          cursor.setDate(cursor.getDate() + 1);
        }
      });

      // Exclude punch records on leave dates — leave override is final
      const punchRows = rows.filter(r => !leaveMap.has(r.date));
      const daysPresent = punchRows.length + leaveMap.size; // punches + paid leave days
      const totalHrs = punchRows.reduce((s, r) => s + diffHrs(r.check_in, r.check_out), 0);
      const avgHrs = punchRows.length ? totalHrs / punchRows.length : 0;
      const attendance = workingDaysInRange > 0 ? (daysPresent / workingDaysInRange) * 100 : 0;

      // Late arrivals — only count actual punch days (not leave days)
      const lateArrivals = punchRows.filter(r => {
        if (!r.check_in) return false;
        const emp = employees.find(e => e.id === id);
        if (emp?.shift_start_time) {
          return isLateArrival(r.check_in, emp.shift_start_time, 0);
        }
        // Fallback: flag if check-in after 09:31
        const d = new Date(r.check_in);
        return d.getHours() > 9 || (d.getHours() === 9 && d.getMinutes() > 30);
      }).length;

      // Overtime: only on actual punch days
      const empProfile2 = employees.find(e => e.id === id);
      const empHPD2 = resolveHoursPerDay(empProfile2?.hours_per_day ?? null, orgHoursPerDay);
      const overtimeDays = punchRows.filter(r => diffHrs(r.check_in, r.check_out) > empHPD2 + 0.5).length;
      const overtimeHrs = punchRows.reduce((s, r) => {
        const h = diffHrs(r.check_in, r.check_out);
        return s + (h > empHPD2 ? h - empHPD2 : 0);
      }, 0);

      // Leave days taken
      const leaveDaysTaken = empLeaves.reduce((s, l) => {
        const t = leaveTypes.find(x => x.name === l.type);
        return s + getLeaveDaysCount(l.start_date, l.end_date, t?.count_holidays ?? false);
      }, 0);

      // Menstruation leave applies a penalty to actual hours logged (as specified in leave settings)
      let mlPenalty = 0;
      empLeaves.forEach(l => {
        const t = leaveTypes.find(x => x.name === l.type);
        if (t?.name === "Menstruation Leave") {
          mlPenalty += getLeaveDaysCount(l.start_date, l.end_date, t.count_holidays) * Number(t.deduction_hours || 0);
        }
      });

      const finalTotalHrs = totalHrs - mlPenalty;
      // Resolve per-employee hours: profile override → org default → 8.5
      const empProfile = employees.find(e => e.id === id);
      const empHPD = resolveHoursPerDay(empProfile?.hours_per_day ?? null, orgHoursPerDay);
      const adjustedTarget = Math.max(0, workingDaysInRange - leaveDaysTaken) * empHPD;
      const deficit = finalTotalHrs - adjustedTarget;
      const monthTarget = workingDaysInFullMonth * empHPD;

      return { id, name, daysPresent, totalHrs: finalTotalHrs, avgHrs, attendance, lateArrivals, overtimeDays, overtimeHrs, leaveDaysTaken, workingDaysInRange, workingDaysInFullMonth, monthTarget, deficit, rows, leaveMap };
    });
  }, [rawRecords, leaveRecords, tab, workingDaysInRange, workingDaysInFullMonth, selectedIds, employees, orgHoursPerDay]);

  /* ── Sorted + filtered summary ── */
  const displayData = useMemo(() => {
    let d = summary.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));
    const dir = sortDir === "asc" ? 1 : -1;
    d = d.sort((a, b) => {
      if (sortCol === "name")        return dir * a.name.localeCompare(b.name);
      if (sortCol === "present")     return dir * (a.daysPresent - b.daysPresent);
      if (sortCol === "hours")       return dir * (a.totalHrs - b.totalHrs);
      if (sortCol === "avg")         return dir * (a.avgHrs - b.avgHrs);
      if (sortCol === "attendance")  return dir * (a.attendance - b.attendance);
      if (sortCol === "late")        return dir * (a.lateArrivals - b.lateArrivals);
      if (sortCol === "overtime")    return dir * (a.overtimeHrs - b.overtimeHrs);
      if (sortCol === "deficit")     return dir * (a.deficit - b.deficit);
      return 0;
    });
    return d;
  }, [summary, sortCol, sortDir, search]);

  /* ── KPI cards ── */
  const kpi = useMemo(() => {
    if (!displayData.length) return null;
    const total = displayData.length;
    const avgAtt = displayData.reduce((s, r) => s + r.attendance, 0) / total;
    const totalActualHrs = displayData.reduce((s, r) => s + r.totalHrs, 0);
    const totalTargetHrs = displayData.reduce((s, r) => s + r.monthTarget, 0) / (workingDaysInFullMonth || 1) * workingDaysInRange;
    const perfect = displayData.filter(r => r.daysPresent >= r.workingDaysInRange).length;
    const lateCount = displayData.reduce((s, r) => s + r.lateArrivals, 0);
    return { total, avgAtt, totalActualHrs, totalTargetHrs, perfect, lateCount };
  }, [displayData, workingDaysInRange]);

  /* ── Leave summary grouped by employee ── */
  const balancesGrouped = useMemo(() => {
    if (tab !== "balances") return [];
    const map: Record<string, any> = {};
    rawRecords.forEach(b => {
      const uid = b.profiles?.id;
      if (!uid) return;
      if (!map[uid]) map[uid] = { name: b.profiles.full_name, balances: [] };
      map[uid].balances.push(b);
    });
    return Object.values(map);
  }, [rawRecords, tab]);

  /* ── Downloads ── */
  const exportXlsx = (sheets: { sheet: string; rows: any[] }[], filename: string) => {
    const wb = XLSX.utils.book_new();
    sheets.forEach(({ sheet, rows }) => {
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "No data." }]);
      XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
    });
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  const downloadAttendanceSummary = () => {
    const summaryRows = displayData.map(r => ({
      "Employee": r.name,
      "Days Present": r.daysPresent,
      "Working Days (Target)": r.workingDaysInRange,
      "Attendance %": r.attendance.toFixed(1) + "%",
      "Total Hours": r.totalHrs.toFixed(2),
      "Avg Hours/Day": r.avgHrs.toFixed(2),
      "Late Arrivals": r.lateArrivals,
      "Overtime Hours": r.overtimeHrs.toFixed(2),
      "Approved Leave Days": r.leaveDaysTaken,
      "Surplus / Deficit Hrs": r.deficit.toFixed(2),
    }));

    const dailyRows = rawRecords.map(r => ({
      "Employee": r.profiles?.full_name ?? "—",
      "Date": r.date,
      "Check In": fmtTime(r.check_in),
      "Check Out": fmtTime(r.check_out),
      "Hours": diffHrs(r.check_in, r.check_out).toFixed(2),
      "Status": r.check_out ? "Completed" : "In Office",
    }));

    exportXlsx([
      { sheet: "Summary", rows: summaryRows },
      { sheet: "Daily Log", rows: dailyRows },
    ], `Attendance_Summary_${fromDate}_to_${toDate}`);
  };

  const downloadLeaves = () => {
    const rows = rawRecords.map(r => ({
      "Employee": r.profiles?.full_name ?? "—",
      "Leave Type": r.type,
      "From": r.start_date,
      "To": r.end_date,
      "Days": Math.ceil((new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / 86400000) + 1,
      "Reason": r.reason ?? "—",
      "Status": r.status,
      "Applied On": r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "—",
    }));
    exportXlsx([{ sheet: "Leave Applications", rows }], `Leaves_${fromDate}_to_${toDate}`);
  };

  const downloadBalances = () => {
    const rows = balancesGrouped.map(r => {
      const rowData: any = { Employee: r.name, "Financial Year": currentFY };
      r.balances.forEach((b: any) => {
        const t = b.leave_types?.name?.replace(" Leave", "") ?? "Unknown";
        rowData[`${t} Accrued`] = b.accrued;
        rowData[`${t} Used`] = b.used;
        rowData[`${t} Balance`] = b.accrued - b.used;
      });
      return rowData;
    });
    exportXlsx([{ sheet: "Leave Balances", rows }], `Leave_Balances_FY${currentFY}`);
  };

  /* ── Period presets ── */
  const periods: { key: Period; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "quarter", label: "This Quarter" },
    { key: "year", label: "This Year" },
    { key: "custom", label: "Custom" },
  ];

  const tabBtn = (t: Tab, label: string) => (
    <button key={t} onClick={() => setTab(t)} style={{ padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontSize: "0.88rem", fontWeight: 600, transition: "all 0.2s", background: tab === t ? "linear-gradient(90deg,var(--accent-primary),var(--accent-secondary))" : "var(--glass-bg)", color: tab === t ? "white" : "var(--text-secondary)" }}>{label}</button>
  );
  const stBadge = (s: string) => s === "approved" ? styles.badgeSuccess : s === "rejected" ? styles.badgeDanger : styles.badgeWarning;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}><h1>Reports & Exports</h1><p>Consolidated attendance summaries, leave reports, and downloadable Excel exports</p></div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        {tabBtn("attendance",  "📋 Attendance")}
        {tabBtn("leaves",      "📅 Leave Applications")}
        {tabBtn("balances",    "💰 Leave Ledgers")}
        {tabBtn("employee",    "👤 Full Employee Report")}
      </div>

      {/* ── Filters ── */}
      <div className="glass-panel" style={{ padding: 24, marginBottom: 24 }}>

        {/* Period presets */}
        {tab !== "balances" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {periods.map(p => (
              <button key={p.key} onClick={() => applyPeriod(p.key)}
                style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${period === p.key ? "var(--accent-primary)" : "var(--glass-border)"}`, background: period === p.key ? "rgba(99,102,241,0.15)" : "transparent", color: period === p.key ? "var(--accent-primary)" : "var(--text-secondary)", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontSize: "0.82rem", fontWeight: period === p.key ? 700 : 400, transition: "all 0.2s" }}>
                {p.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>

          {/* Date range */}
          {tab !== "balances" && (
            <>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>From Date</label>
                <input type="date" className="premium-input" value={fromDate} onChange={e => { setFromDate(e.target.value); setPeriod("custom"); }} />
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>To Date</label>
                <input type="date" className="premium-input" value={toDate} onChange={e => { setToDate(e.target.value); setPeriod("custom"); }} />
              </div>
            </>
          )}

          {tab === "balances" && (
            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <label>Financial Year</label>
              <input type="number" className="premium-input" value={currentFY} onChange={e => setCurrentFY(Number(e.target.value))} style={{ width: 100 }} />
            </div>
          )}

          {/* Employee picker */}
          <div className={styles.formGroup} style={{ marginBottom: 0, position: "relative" }}>
            <label>Employees</label>
            <button type="button" onClick={() => setShowEmpPicker(v => !v)} className="premium-input"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minWidth: 200, cursor: "pointer", textAlign: "left", fontFamily: "Outfit,sans-serif", fontSize: "0.88rem" }}>
              <span style={{ color: allSelected ? "var(--text-secondary)" : "white" }}>{selLabel}</span><span style={{ color: "var(--text-secondary)" }}>▾</span>
            </button>
            {showEmpPicker && (
              <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, background: "var(--bg-secondary)", border: "1px solid var(--glass-border)", borderRadius: 12, padding: 8, minWidth: 240, maxHeight: 280, overflowY: "auto", marginTop: 6, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, cursor: "pointer", background: allSelected ? "rgba(99,102,241,0.12)" : "transparent" }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ width: 16, height: 16, accentColor: "var(--accent-primary)" }} />
                  <span style={{ fontWeight: 600, color: "white", fontSize: "0.88rem" }}>All Employees</span>
                </label>
                <div style={{ borderTop: "1px solid var(--glass-border)", margin: "4px 0" }} />
                {employees.map(e => (
                  <label key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, cursor: "pointer", background: selected.has(e.id) && !allSelected ? "rgba(99,102,241,0.08)" : "transparent" }}>
                    <input type="checkbox" checked={allSelected || selected.has(e.id)} onChange={() => toggleEmp(e.id)} style={{ width: 16, height: 16, accentColor: "var(--accent-primary)" }} />
                    <span style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>{e.full_name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {tab === "leaves" && (
            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <label>Status</label>
              <select className="premium-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
              </select>
            </div>
          )}

          <button className={styles.primaryBtn} onClick={load} style={{ width: "auto", padding: "14px 24px" }}>🔍 Apply Filter</button>

          {/* Download buttons */}
          {tab === "attendance" && displayData.length > 0 &&
            <button className={styles.primaryBtn} onClick={downloadAttendanceSummary} style={{ width: "auto", padding: "14px 24px", background: "linear-gradient(90deg,#10b981,#059669)" }}>📥 Download Excel</button>}
          {tab === "leaves" && rawRecords.length > 0 &&
            <button className={styles.primaryBtn} onClick={downloadLeaves} style={{ width: "auto", padding: "14px 24px", background: "linear-gradient(90deg,#10b981,#059669)" }}>📥 Download Excel</button>}
          {tab === "balances" && balancesGrouped.length > 0 &&
            <button className={styles.primaryBtn} onClick={downloadBalances} style={{ width: "auto", padding: "14px 24px", background: "linear-gradient(90deg,#10b981,#059669)" }}>📥 Download Excel</button>}
        </div>
      </div>
      {showEmpPicker && <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setShowEmpPicker(false)} />}

      {/* ══════════════════════════════════════════
          ATTENDANCE TAB — CONSOLIDATED SUMMARY
          ══════════════════════════════════════════ */}
      {tab === "attendance" && (
        <>
          {/* KPI Cards */}
          {kpi && !loading && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 14, marginBottom: 24 }}>
              <div className="glass-panel" style={{ padding: "16px 18px", borderLeft: "3px solid #6366f1" }}>
                <div style={{ fontSize: "1.3rem", marginBottom: 6 }}>👥</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#6366f1" }}>{kpi.total}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: 2 }}>Total Employees</div>
              </div>
              <div className="glass-panel" style={{ padding: "16px 18px", borderLeft: "3px solid #10b981" }}>
                <div style={{ fontSize: "1.3rem", marginBottom: 6 }}>📊</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#10b981" }}>{kpi.avgAtt.toFixed(1)}%</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: 2 }}>Avg Attendance</div>
              </div>
              <div className="glass-panel" style={{ padding: "16px 18px", borderLeft: "3px solid #f59e0b" }}>
                <div style={{ fontSize: "1.3rem", marginBottom: 6 }}>⏱️</div>
                <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "#f59e0b" }}>{kpi.totalActualHrs.toFixed(0)}h / {kpi.totalTargetHrs.toFixed(0)}h</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: 2 }}>Org Logged / Target (Range)</div>
              </div>
              <div className="glass-panel" style={{ padding: "16px 18px", borderLeft: "3px solid #8b5cf6" }}>
                <div style={{ fontSize: "1.3rem", marginBottom: 6 }}>🏆</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#8b5cf6" }}>{kpi.perfect} emp</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: 2 }}>100% Attendance</div>
              </div>
              <div className="glass-panel" style={{ padding: "16px 18px", borderLeft: "3px solid #ef4444" }}>
                <div style={{ fontSize: "1.3rem", marginBottom: 6 }}>⚠️</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#ef4444" }}>{kpi.lateCount}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: 2 }}>Late Arrivals (Total)</div>
              </div>
              <div className="glass-panel" style={{ padding: "16px 18px", borderLeft: "3px solid #64748b" }}>
                <div style={{ fontSize: "1.3rem", marginBottom: 6 }}>📅</div>
                <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "#64748b" }}>{workingDaysInFullMonth} days</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: 2 }}>Full Month Working Days<br/>({(workingDaysInFullMonth * orgHoursPerDay).toFixed(0)}h / emp @ {orgHoursPerDay}h/day)</div>
              </div>
            </div>
          )}

          {/* Search + period label */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
            <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              {!loading && `Showing ${displayData.length} employees · ${fmtDate(fromDate)} – ${fmtDate(toDate)} · ${workingDaysInRange} working days in range · ${workingDaysInFullMonth} full month working days`}
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search employee..." className="premium-input"
              style={{ width: 220, padding: "8px 14px", fontSize: "0.85rem" }} />
          </div>

          <div className={`glass-panel ${styles.tableWrap}`} style={{ overflowX: "auto" }}>
            <table style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th {...thProps("name")}>Employee <SortIcon col="name" sortCol={sortCol} sortDir={sortDir} /></th>
                  <th {...thProps("present")}>Days Present <SortIcon col="present" sortCol={sortCol} sortDir={sortDir} /></th>
                  <th style={{ whiteSpace: "nowrap" }}>Working Days<br/><span style={{ fontSize: "0.68rem", fontWeight: 400, color: "var(--text-secondary)" }}>(Full Month)</span></th>
                  <th {...thProps("attendance")}>Attendance % <SortIcon col="attendance" sortCol={sortCol} sortDir={sortDir} /></th>
                  <th {...thProps("hours")}>Total Hours <SortIcon col="hours" sortCol={sortCol} sortDir={sortDir} /></th>
                  <th {...thProps("avg")}>Avg Hrs/Day <SortIcon col="avg" sortCol={sortCol} sortDir={sortDir} /></th>
                  <th {...thProps("late")}>Late Arrivals <SortIcon col="late" sortCol={sortCol} sortDir={sortDir} /></th>
                  <th {...thProps("overtime")}>Overtime Hrs <SortIcon col="overtime" sortCol={sortCol} sortDir={sortDir} /></th>
                  <th {...thProps("deficit")}>Surplus / Deficit <SortIcon col="deficit" sortCol={sortCol} sortDir={sortDir} /></th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} style={{ textAlign: "center", padding: 48 }}><div className={styles.spinner} style={{ margin: "0 auto" }} /></td></tr>
                ) : displayData.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 48 }}>No records found for this period.</td></tr>
                ) : displayData.map(r => (
                  <>
                    <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => setExpandedEmp(expandedEmp === r.id ? null : r.id)}>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td>
                        <span style={{ fontWeight: 700, color: r.daysPresent >= r.workingDaysInRange ? "var(--success)" : r.attendance < 75 ? "var(--danger)" : "var(--warning)" }}>
                          {r.daysPresent}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{r.workingDaysInFullMonth}</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>{r.monthTarget.toFixed(0)}h target</div>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: "var(--glass-border)", borderRadius: 3, minWidth: 60 }}>
                            <div style={{ width: `${Math.min(100, r.attendance)}%`, height: "100%", borderRadius: 3, background: r.attendance >= 90 ? "#10b981" : r.attendance >= 75 ? "#f59e0b" : "#ef4444", transition: "width 0.3s" }} />
                          </div>
                          <span style={{ fontSize: "0.82rem", fontWeight: 600, minWidth: 40 }}>{r.attendance.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.totalHrs.toFixed(2)}h</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>of {r.monthTarget.toFixed(0)}h</div>
                      </td>
                      <td>{r.avgHrs.toFixed(2)}h</td>
                      <td>
                        <span style={{ color: r.lateArrivals > 0 ? "var(--warning)" : "var(--success)", fontWeight: 600 }}>
                          {r.lateArrivals > 0 ? `⚠️ ${r.lateArrivals}` : "✅ 0"}
                        </span>
                      </td>
                      <td style={{ color: r.overtimeHrs > 0 ? "#f59e0b" : "var(--text-secondary)" }}>
                        {r.overtimeHrs > 0 ? `+${r.overtimeHrs.toFixed(2)}h` : "—"}
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: r.deficit >= 0 ? "var(--success)" : "var(--danger)" }}>
                          {r.deficit >= 0 ? `+${r.deficit.toFixed(2)}h` : `${r.deficit.toFixed(2)}h`}
                        </span>
                      </td>
                      <td>
                        <button onClick={e => { e.stopPropagation(); setExpandedEmp(expandedEmp === r.id ? null : r.id); }}
                          style={{ background: "none", border: "1px solid var(--glass-border)", borderRadius: 6, color: "var(--accent-primary)", cursor: "pointer", padding: "4px 10px", fontSize: "0.78rem", fontFamily: "Outfit,sans-serif" }}>
                          {expandedEmp === r.id ? "▲ Hide" : "▼ Show"}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded daily breakdown — DATE-FIRST: one card per working day */}
                    {expandedEmp === r.id && (() => {
                      // Build lookup maps from raw data
                      const punchByDate = new Map<string, any>();
                      r.rows.forEach((day: any) => punchByDate.set(day.date, day));

                      // Leave dates — try r.leaveMap from summary, fallback to leaveRecords state
                      let leaveByDate: Map<string, string> = r.leaveMap instanceof Map && r.leaveMap.size > 0
                        ? r.leaveMap
                        : new Map<string, string>();

                      // Fallback: rebuild from leaveRecords state if leaveMap was empty
                      if (leaveByDate.size === 0 && leaveRecords.length > 0) {
                        const empLv = leaveRecords.filter((l: any) => l.user_id === r.id);
                        empLv.forEach((lv: any) => {
                          const c2 = new Date(lv.start_date + "T00:00:00");
                          const e2 = new Date(lv.end_date   + "T00:00:00");
                          while (c2 <= e2) {
                            const ds2 = `${c2.getFullYear()}-${String(c2.getMonth()+1).padStart(2,"0")}-${String(c2.getDate()).padStart(2,"0")}`;
                            leaveByDate.set(ds2, lv.type);
                            c2.setDate(c2.getDate() + 1);
                          }
                        });
                      }

                      // Generate EVERY date in the filter range — no date is skipped
                      type DayCard = {
                        date: string;
                        status: "present" | "leave" | "lwp" | "weekoff";
                        punch?: any;
                        leaveType?: string;
                      };
                      const allDays: DayCard[] = [];
                      const cursor = new Date(fromDate + "T00:00:00");
                      const endD   = new Date(toDate   + "T00:00:00");
                      while (cursor <= endD) {
                        const ds = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,"0")}-${String(cursor.getDate()).padStart(2,"0")}`;
                        const punch = punchByDate.get(ds);
                        const leave = leaveByDate.get(ds);
                        const working = isWorkingDay(cursor);

                        if (leave) {
                          // Leave takes priority — admin's override is final
                          allDays.push({ date: ds, status: "leave", leaveType: leave, punch });
                        } else if (punch) {
                          // Present — works on both working and non-working days (rotating weekoff)
                          allDays.push({ date: ds, status: "present", punch });
                        } else if (!working) {
                          // Non-working day, no punch, no leave → weekly off
                          allDays.push({ date: ds, status: "weekoff" });
                        } else {
                          // Working day, no punch, no leave → absent/LWP
                          allDays.push({ date: ds, status: "lwp" });
                        }
                        cursor.setDate(cursor.getDate() + 1);
                      }
                      // Sort descending (latest first)
                      allDays.sort((a, b) => b.date.localeCompare(a.date));

                      const presentCount  = allDays.filter(d => d.status === "present").length;
                      const leaveCount    = allDays.filter(d => d.status === "leave").length;
                      const lwpCount      = allDays.filter(d => d.status === "lwp").length;
                      const weekoffCount  = allDays.filter(d => d.status === "weekoff").length;

                      return (
                        <tr key={`${r.id}-expanded`}>
                          <td colSpan={10} style={{ padding: 0 }}>
                            <div style={{ background: "rgba(99,102,241,0.04)", borderTop: "1px solid var(--glass-border)", padding: "16px 24px" }}>
                              <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
                                <span>Daily log for {r.name} ({allDays.length} days)</span>
                                <span style={{ color: "var(--success)" }}>✓ {presentCount} Present</span>
                                {leaveCount > 0 && <span style={{ color: "#818cf8" }}>🗓️ {leaveCount} Leave</span>}
                                {lwpCount > 0 && <span style={{ color: "var(--danger)" }}>✕ {lwpCount} LWP</span>}
                                {weekoffCount > 0 && <span style={{ color: "var(--text-muted, #6b7280)" }}>⏸ {weekoffCount} Off</span>}
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                                {allDays.map((card, idx) => {
                                  if (card.status === "present" && card.punch) {
                                    // ── PRESENT card (full size, normal style) ──
                                    const day = card.punch;
                                    const h = diffHrs(day.check_in, day.check_out);
                                    return (
                                      <div key={`p-${card.date}`} style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", borderRadius: 8, padding: "10px 14px" }}>
                                        <div style={{ fontWeight: 600, fontSize: "0.82rem", marginBottom: 4 }}>{fmtDate(card.date)}</div>
                                        {(() => { const emp = employees.find(e => e.id === r.id); return emp?.shift_start_time ? (
                                          <div style={{ fontSize: "0.72rem", color: "#818cf8", marginBottom: 3 }}>⏰ {formatShiftTime(emp.shift_start_time)} → {emp.shift_end_time ? formatShiftTime(emp.shift_end_time) : "—"}</div>
                                        ) : null; })()}
                                        <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)" }}>
                                          In: {fmtTime(day.check_in)} · Out: {fmtTime(day.check_out)}
                                        </div>
                                        <div style={{ fontSize: "0.82rem", fontWeight: 700, color: h >= orgHoursPerDay ? "var(--success)" : "var(--warning)", marginTop: 4 }}>
                                          {h > 0 ? `${h.toFixed(2)}h` : "In Office"}
                                        </div>
                                      </div>
                                    );
                                  } else if (card.status === "leave") {
                                    // ── LEAVE card (compact, purple) ──
                                    return (
                                      <div key={`l-${card.date}`} style={{ background: "rgba(99,102,241,0.10)", border: "1.5px solid rgba(99,102,241,0.4)", borderRadius: 8, padding: "8px 12px" }}>
                                        <div style={{ fontWeight: 600, fontSize: "0.78rem", marginBottom: 2 }}>{fmtDate(card.date)}</div>
                                        <div style={{ fontSize: "0.82rem", color: "#818cf8", fontWeight: 700 }}>🗓️ {card.leaveType}</div>
                                      </div>
                                    );
                                  } else if (card.status === "weekoff") {
                                    // ── WEEKLY OFF card (compact, muted grey) ──
                                    return (
                                      <div key={`w-${card.date}`} style={{ background: "rgba(107,114,128,0.06)", border: "1px dashed rgba(107,114,128,0.25)", borderRadius: 8, padding: "8px 12px", opacity: 0.7 }}>
                                        <div style={{ fontWeight: 600, fontSize: "0.78rem", marginBottom: 2, color: "var(--text-muted, #6b7280)" }}>{fmtDate(card.date)}</div>
                                        <div style={{ fontSize: "0.76rem", color: "var(--text-muted, #6b7280)" }}>⏸ Weekly Off</div>
                                      </div>
                                    );
                                  } else {
                                    // ── LWP/ABSENT card (compact, red-tinted) ──
                                    return (
                                      <div key={`a-${card.date}`} style={{ background: "rgba(239,68,68,0.08)", border: "1.5px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "8px 12px" }}>
                                        <div style={{ fontWeight: 600, fontSize: "0.78rem", marginBottom: 2 }}>{fmtDate(card.date)}</div>
                                        <div style={{ fontSize: "0.82rem", color: "#ef4444", fontWeight: 700 }}>✕ LWP</div>
                                      </div>
                                    );
                                  }
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })()}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════
          LEAVES TAB
          ══════════════════════════════════════════ */}
      {tab === "leaves" && (
        <div className={`glass-panel ${styles.tableWrap}`}>
          <table>
            <thead><tr><th>Employee</th><th>Type</th><th>Duration</th><th>Applied On</th><th>Reason</th><th>Status</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 48 }}><div className={styles.spinner} style={{ margin: "0 auto" }} /></td></tr>
              : rawRecords.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 48 }}>No records found for this period.</td></tr>
              : rawRecords.map(r => (
                <tr key={r.id}>
                  <td>{r.profiles?.full_name ?? "—"}</td>
                  <td>{r.type}</td>
                  <td>
                    {r.start_date} {r.start_date !== r.end_date ? `→ ${r.end_date}` : ""}
                    <br /><span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      {Math.ceil((new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / 86400000) + 1} day(s)
                    </span>
                  </td>
                  <td>{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
                  <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.reason ?? "—"}</td>
                  <td><span className={`${styles.statBadge} ${stBadge(r.status)}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════════════════════════════════════
          BALANCES TAB
          ══════════════════════════════════════════ */}
      {tab === "balances" && (
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
          {balancesGrouped.length === 0 && !loading && <div style={{ color: "var(--text-secondary)" }}>No balances found.</div>}
          {balancesGrouped.map((r: any) => (
            <div key={r.name} className="glass-panel" style={{ padding: 20 }}>
              <h3 style={{ marginBottom: 16, fontSize: "1.1rem", borderBottom: "1px solid var(--glass-border)", paddingBottom: 8 }}>{r.name}</h3>
              {r.balances.map((b: any) => (
                <div key={b.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, alignItems: "center" }}>
                  <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>{b.leave_types?.name}</span>
                  <span style={{ fontSize: "1.1rem", fontWeight: 600, color: (b.accrued - b.used) <= 0 ? "var(--danger)" : "var(--success)" }}>
                    {(b.accrued - b.used).toFixed(1)} <span style={{ fontSize: "0.72rem", fontWeight: 400, color: "var(--text-secondary)" }}>/ {b.accrued}</span>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════
          FULL EMPLOYEE REPORT TAB
          ══════════════════════════════════════════ */}
      {tab === "employee" && (
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
          {rawRecords.length === 0 && !loading && <div style={{ color: "var(--text-secondary)" }}>Click Apply Filter to load employee summaries.</div>}
          {(() => {
            // Group by employee
            const empMap: Record<string, { name: string; atRows: any[]; lvRows: any[] }> = {};
            rawRecords.forEach(r => {
              const id = r.profiles?.id ?? r.user_id;
              if (!empMap[id]) empMap[id] = { name: r.profiles?.full_name ?? "—", atRows: [], lvRows: [] };
              empMap[id].atRows.push(r);
            });
            leaveRecords.forEach(l => {
              const id = l.user_id;
              if (!empMap[id]) {
                const emp = employees.find(e => e.id === id);
                empMap[id] = { name: emp?.full_name ?? "—", atRows: [], lvRows: [] };
              }
              empMap[id].lvRows.push(l);
            });

            return Object.entries(empMap).map(([id, { name, atRows, lvRows }]) => {
              const totalHrsWithoutPenalty = atRows.reduce((s, r) => s + diffHrs(r.check_in, r.check_out), 0);
              
              let mlPenalty = 0;
              const empP = employees.find(e => e.id === id);
              const empHPDLocal = resolveHoursPerDay(empP?.hours_per_day ?? null, orgHoursPerDay);
              const lvDeduction = lvRows.reduce((s, l) => {
                const t = leaveTypes.find(x => x.name === l.type);
                const count = getLeaveDaysCount(l.start_date, l.end_date, t?.count_holidays ?? false);
                if (t?.name === "Menstruation Leave") {
                  mlPenalty += count * Number(t.deduction_hours || 0);
                  return s + count * empHPDLocal; // ML waives full day target
                }
                return s + count * (t ? Number(t.deduction_hours) : empHPDLocal);
              }, 0);
              
              const totalHrs = totalHrsWithoutPenalty - mlPenalty;
              const target = Math.max(0, workingDaysInRange * empHPDLocal - lvDeduction);
              const deficit = totalHrs - target;

              return (
                <div key={id} className="glass-panel" style={{ padding: 20 }}>
                  <h3 style={{ marginBottom: 12, fontSize: "1.1rem", borderBottom: "1px solid var(--glass-border)", paddingBottom: 8 }}>{name}</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "0.88rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-secondary)" }}>Days Present</span><span style={{ fontWeight: 600 }}>{atRows.length} / {workingDaysInRange}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-secondary)" }}>Base Target</span><span>{(workingDaysInRange * empHPDLocal).toFixed(2)}h</span></div>
                    {lvDeduction > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "var(--warning)" }}><span>Leave Deduction</span><span>-{lvDeduction.toFixed(2)}h</span></div>}
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}><span>Adjusted Target</span><span>{target.toFixed(2)}h</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "var(--accent-primary)" }}><span>Actual Clocked</span><span>{totalHrs.toFixed(2)}h</span></div>
                  </div>
                  <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: deficit >= 0 ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", color: deficit >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 700, fontSize: "1rem", textAlign: "center" }}>
                    {deficit >= 0 ? `Surplus: +${deficit.toFixed(2)}h` : `Deficit: ${deficit.toFixed(2)}h`}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}
