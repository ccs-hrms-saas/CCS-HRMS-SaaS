"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";
import styles from "../../dashboard.module.css";

type Tab = "attendance" | "leaves" | "employee";

export default function AdminReports() {
  const [tab, setTab]             = useState<Tab>("attendance");
  const [employees, setEmployees] = useState<any[]>([]);
  const [selected, setSelected]   = useState<Set<string>>(new Set(["all"]));
  const [showEmpPicker, setShowEmpPicker] = useState(false);
  const [fromDate, setFromDate]   = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; });
  const [toDate, setToDate]       = useState(() => new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [records, setRecords]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name")
      .then(({ data }) => setEmployees(data ?? []));
  }, []);

  /* ── Employee selection helpers ── */
  const allSelected = selected.has("all");

  const toggleAll = () => setSelected(new Set(["all"]));

  const toggleEmp = (id: string) => {
    const next = new Set(selected);
    next.delete("all");
    if (next.has(id)) { next.delete(id); if (next.size === 0) next.add("all"); }
    else next.add(id);
    setSelected(next);
  };

  const selectedIds = allSelected ? employees.map(e => e.id) : [...selected];
  const selLabel = allSelected ? "All Employees" : selectedIds.length === 1
    ? employees.find(e => e.id === selectedIds[0])?.full_name
    : `${selectedIds.length} Employees Selected`;

  /* ── Load data ── */
  const load = async () => {
    setLoading(true); setRecords([]);
    const ids = selectedIds;

    if (tab === "attendance") {
      let q = supabase.from("attendance_records")
        .select("*, profiles(full_name, id)")
        .gte("date", fromDate).lte("date", toDate)
        .in("user_id", ids)
        .order("date", { ascending: false });
      const { data } = await q;
      setRecords(data ?? []);

    } else if (tab === "leaves") {
      let q = supabase.from("leave_requests")
        .select("*, profiles!leave_requests_user_id_fkey(full_name)")
        .gte("start_date", fromDate).lte("start_date", toDate)
        .in("user_id", ids)
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data } = await q;
      setRecords(data ?? []);

    } else if (tab === "employee") {
      // For each selected employee fetch attendance + leaves
      const results = await Promise.all(ids.map(async (id) => {
        const emp = employees.find(e => e.id === id);
        const [atRes, lvRes] = await Promise.all([
          supabase.from("attendance_records").select("*").eq("user_id", id).gte("date", fromDate).lte("date", toDate).order("date"),
          supabase.from("leave_requests").select("*").eq("user_id", id).gte("start_date", fromDate).order("start_date"),
        ]);
        return { emp, attendance: atRes.data ?? [], leaves: lvRes.data ?? [] };
      }));
      setRecords(results);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [tab, selected]);

  /* ── Excel helpers ── */
  const fmt  = (d?: string) => d ? new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
  const hrs  = (ci?: string, co?: string) => ci && co ? ((new Date(co).getTime() - new Date(ci).getTime()) / 3600000).toFixed(2) : "—";
  const days = (s: string, e: string) => Math.ceil((new Date(e).getTime() - new Date(s).getTime()) / 86400000) + 1;

  const exportXlsx = (sheets: { sheet: string; rows: any[] }[], filename: string) => {
    const wb = XLSX.utils.book_new();
    sheets.forEach(({ sheet, rows }) => {
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "No data." }]);
      XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31)); // Excel sheet name max 31 chars
    });
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  const downloadAttendance = () => {
    const rows = records.map(r => ({
      Employee: r.profiles?.full_name ?? "—",
      Date: r.date,
      "Check In": fmt(r.check_in), "Check Out": fmt(r.check_out),
      "Hours": hrs(r.check_in, r.check_out),
      Status: r.check_out ? "Completed" : "In Office",
    }));
    exportXlsx([{ sheet: "Attendance", rows }], `Attendance_${selLabel}_${fromDate}_to_${toDate}`);
  };

  const downloadLeaves = () => {
    const rows = records.map(r => ({
      Employee: r.profiles?.full_name ?? "—",
      "Leave Type": r.type, From: r.start_date, To: r.end_date,
      Days: days(r.start_date, r.end_date), Reason: r.reason ?? "—",
      Status: r.status, "Applied On": r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "—",
    }));
    exportXlsx([{ sheet: "Leave Applications", rows }], `Leaves_${fromDate}_to_${toDate}`);
  };

  const downloadEmployee = () => {
    const sheets: { sheet: string; rows: any[] }[] = [];
    records.forEach(({ emp, attendance, leaves }) => {
      const name = emp?.full_name?.slice(0, 20) ?? "Employee";
      sheets.push({
        sheet: `${name} - Attendance`,
        rows: attendance.map((r: any) => ({
          Date: r.date, "Check In": fmt(r.check_in), "Check Out": fmt(r.check_out), Hours: hrs(r.check_in, r.check_out),
        })),
      });
      sheets.push({
        sheet: `${name} - Leaves`,
        rows: leaves.map((r: any) => ({
          "Leave Type": r.type, From: r.start_date, To: r.end_date,
          Days: days(r.start_date, r.end_date), Reason: r.reason ?? "—", Status: r.status,
        })),
      });
    });
    exportXlsx(sheets, `Employee_Reports_${fromDate}_to_${toDate}`);
  };

  /* ── UI ── */
  const tabBtn = (t: Tab, label: string) => (
    <button onClick={() => setTab(t)} style={{
      padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer",
      fontFamily: "Outfit,sans-serif", fontSize: "0.88rem", fontWeight: 600, transition: "all 0.2s",
      background: tab === t ? "linear-gradient(90deg,var(--accent-primary),var(--accent-secondary))" : "var(--glass-bg)",
      color: tab === t ? "white" : "var(--text-secondary)",
    }}>{label}</button>
  );

  const stBadge = (s: string) => s === "approved" ? styles.badgeSuccess : s === "rejected" ? styles.badgeDanger : styles.badgeWarning;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}><h1>Reports & Exports</h1><p>Filter by employees, dates, and download as Excel</p></div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        {tabBtn("attendance", "📋 Attendance")}
        {tabBtn("leaves",     "📅 Leave Applications")}
        {tabBtn("employee",   "👤 Full Employee Report")}
      </div>

      {/* Filters */}
      <div className="glass-panel" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>

          {/* Date range */}
          <div className={styles.formGroup} style={{ marginBottom: 0 }}>
            <label>From Date</label>
            <input type="date" className="premium-input" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div className={styles.formGroup} style={{ marginBottom: 0 }}>
            <label>To Date</label>
            <input type="date" className="premium-input" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>

          {/* Employee multi-select */}
          <div className={styles.formGroup} style={{ marginBottom: 0, position: "relative" }}>
            <label>Employees</label>
            <button type="button" onClick={() => setShowEmpPicker(v => !v)}
              className="premium-input"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minWidth: 200, cursor: "pointer", textAlign: "left", fontFamily: "Outfit,sans-serif", fontSize: "0.88rem" }}>
              <span style={{ color: allSelected ? "var(--text-secondary)" : "white" }}>{selLabel}</span>
              <span style={{ color: "var(--text-secondary)" }}>▾</span>
            </button>

            {showEmpPicker && (
              <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, background: "var(--bg-secondary)", border: "1px solid var(--glass-border)", borderRadius: 12, padding: 8, minWidth: 240, maxHeight: 280, overflowY: "auto", marginTop: 6, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
                {/* All Employees */}
                <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, cursor: "pointer", background: allSelected ? "rgba(99,102,241,0.12)" : "transparent" }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ width: 16, height: 16, accentColor: "var(--accent-primary)" }} />
                  <span style={{ fontWeight: 600, color: "white", fontSize: "0.88rem" }}>All Employees</span>
                </label>
                <div style={{ borderTop: "1px solid var(--glass-border)", margin: "4px 0" }} />
                {employees.map(e => (
                  <label key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, cursor: "pointer", background: selected.has(e.id) && !allSelected ? "rgba(99,102,241,0.08)" : "transparent" }}>
                    <input type="checkbox" checked={allSelected || selected.has(e.id)} onChange={() => toggleEmp(e.id)}
                      style={{ width: 16, height: 16, accentColor: "var(--accent-primary)" }} />
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
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          )}

          <button className={styles.primaryBtn} onClick={load} style={{ width: "auto", padding: "14px 24px" }}>🔍 Filter</button>

          {tab === "attendance" && records.length > 0 && (
            <button className={styles.primaryBtn} onClick={downloadAttendance} style={{ width: "auto", padding: "14px 24px", background: "linear-gradient(90deg,#10b981,#059669)" }}>📥 Download Excel</button>
          )}
          {tab === "leaves" && records.length > 0 && (
            <button className={styles.primaryBtn} onClick={downloadLeaves} style={{ width: "auto", padding: "14px 24px", background: "linear-gradient(90deg,#10b981,#059669)" }}>📥 Download Excel</button>
          )}
          {tab === "employee" && records.length > 0 && (
            <button className={styles.primaryBtn} onClick={downloadEmployee} style={{ width: "auto", padding: "14px 24px", background: "linear-gradient(90deg,#10b981,#059669)" }}>
              📥 Download ({records.length} {records.length === 1 ? "Employee" : "Employees"})
            </button>
          )}
        </div>
      </div>

      {/* Close picker on outside click */}
      {showEmpPicker && <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setShowEmpPicker(false)} />}

      {/* ── Attendance Table ── */}
      {tab === "attendance" && (
        <div className={`glass-panel ${styles.tableWrap}`}>
          <table>
            <thead><tr><th>Employee</th><th>Date</th><th>Check In</th><th>Check Out</th><th>Hours</th><th>Status</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 32 }}><div className={styles.spinner} style={{ margin: "0 auto" }} /></td></tr>
              : records.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 32 }}>No records found.</td></tr>
              : records.map(r => (
                <tr key={r.id}>
                  <td>{r.profiles?.full_name ?? "—"}</td><td>{r.date}</td>
                  <td>{fmt(r.check_in)}</td><td>{fmt(r.check_out)}</td>
                  <td>{hrs(r.check_in, r.check_out)}</td>
                  <td><span className={`${styles.statBadge} ${r.check_out ? styles.badgeSuccess : styles.badgeWarning}`}>{r.check_out ? "Completed" : "In Office"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Leave Applications Table ── */}
      {tab === "leaves" && (
        <div className={`glass-panel ${styles.tableWrap}`}>
          <table>
            <thead><tr><th>Employee</th><th>Leave Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th><th>Applied On</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={8} style={{ textAlign: "center", padding: 32 }}><div className={styles.spinner} style={{ margin: "0 auto" }} /></td></tr>
              : records.length === 0 ? <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 32 }}>No records found.</td></tr>
              : records.map(r => (
                <tr key={r.id}>
                  <td>{r.profiles?.full_name ?? "—"}</td><td>{r.type}</td>
                  <td>{r.start_date}</td><td>{r.end_date}</td>
                  <td>{days(r.start_date, r.end_date)}</td>
                  <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.reason ?? "—"}</td>
                  <td><span className={`${styles.statBadge} ${stBadge(r.status)}`}>{r.status}</span></td>
                  <td>{r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Full Employee Report Preview ── */}
      {tab === "employee" && (
        loading ? <div style={{ textAlign: "center", padding: 60 }}><div className={styles.spinner} style={{ margin: "0 auto" }} /></div>
        : records.length === 0 ? <div className="glass-panel" style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>Select employees and click Filter.</div>
        : records.map(({ emp, attendance, leaves }) => (
          <div key={emp?.id} style={{ marginBottom: 36 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "white" }}>
                {emp?.full_name?.charAt(0)}
              </div>
              <div>
                <div style={{ fontWeight: 700, color: "white" }}>{emp?.full_name}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{attendance.length} attendance records · {leaves.length} leave applications</div>
              </div>
            </div>

            <div className={`glass-panel ${styles.tableWrap}`} style={{ marginBottom: 12 }}>
              <table>
                <thead><tr><th>Date</th><th>Check In</th><th>Check Out</th><th>Hours</th></tr></thead>
                <tbody>
                  {attendance.length === 0 ? <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 20 }}>No attendance data.</td></tr>
                  : attendance.map((r: any) => <tr key={r.id}><td>{r.date}</td><td>{fmt(r.check_in)}</td><td>{fmt(r.check_out)}</td><td>{hrs(r.check_in, r.check_out)}</td></tr>)}
                </tbody>
              </table>
            </div>

            <div className={`glass-panel ${styles.tableWrap}`}>
              <table>
                <thead><tr><th>Leave Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th></tr></thead>
                <tbody>
                  {leaves.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 20 }}>No leave applications.</td></tr>
                  : leaves.map((r: any) => (
                    <tr key={r.id}><td>{r.type}</td><td>{r.start_date}</td><td>{r.end_date}</td>
                      <td>{days(r.start_date, r.end_date)}</td><td>{r.reason ?? "—"}</td>
                      <td><span className={`${styles.statBadge} ${stBadge(r.status)}`}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
