"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";
import styles from "../../dashboard.module.css";

type Tab = "attendance" | "leaves" | "employee";

export default function AdminReports() {
  const [tab, setTab]           = useState<Tab>("attendance");
  const [employees, setEmployees] = useState<any[]>([]);
  const [fromDate, setFromDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; });
  const [toDate, setToDate]     = useState(() => new Date().toISOString().split("T")[0]);
  const [empFilter, setEmpFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [records, setRecords]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name")
      .then(({ data }) => setEmployees(data ?? []));
  }, []);

  const load = async () => {
    setLoading(true); setRecords([]);

    if (tab === "attendance") {
      let q = supabase.from("attendance_records")
        .select("*, profiles(full_name)")
        .gte("date", fromDate).lte("date", toDate)
        .order("date", { ascending: false });
      if (empFilter !== "all") q = q.eq("user_id", empFilter);
      const { data } = await q;
      setRecords(data ?? []);

    } else if (tab === "leaves") {
      let q = supabase.from("leave_requests")
        .select("*, profiles!leave_requests_user_id_fkey(full_name)")
        .gte("start_date", fromDate).lte("start_date", toDate)
        .order("created_at", { ascending: false });
      if (empFilter !== "all") q = q.eq("user_id", empFilter);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data } = await q;
      setRecords(data ?? []);

    } else if (tab === "employee") {
      if (empFilter === "all") { setLoading(false); return; }
      const [atRes, lvRes] = await Promise.all([
        supabase.from("attendance_records").select("*")
          .eq("user_id", empFilter).gte("date", fromDate).lte("date", toDate).order("date"),
        supabase.from("leave_requests").select("*")
          .eq("user_id", empFilter).gte("start_date", fromDate).order("start_date"),
      ]);
      setRecords([{ attendance: atRes.data ?? [], leaves: lvRes.data ?? [] }]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [tab, empFilter]);

  /* ───── Excel Downloads ───── */
  const downloadAttendance = () => {
    const rows = records.map(r => ({
      Employee: r.profiles?.full_name ?? "—",
      Date: r.date,
      "Check In":  r.check_in  ? new Date(r.check_in).toLocaleTimeString("en-IN",  { hour: "2-digit", minute: "2-digit" }) : "—",
      "Check Out": r.check_out ? new Date(r.check_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—",
      "Hours Worked": r.check_in && r.check_out ? ((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 3600000).toFixed(2) : "—",
      Status: r.check_out ? "Completed" : "In Office",
    }));
    const empName = empFilter !== "all" ? employees.find(e => e.id === empFilter)?.full_name ?? "All" : "All";
    exportXlsx([{ sheet: "Attendance", rows }], `Attendance_${empName}_${fromDate}_to_${toDate}`);
  };

  const downloadLeaves = () => {
    const rows = records.map(r => ({
      Employee: r.profiles?.full_name ?? "—",
      "Leave Type": r.type,
      "From": r.start_date,
      "To": r.end_date,
      Days: Math.ceil((new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / 86400000) + 1,
      Reason: r.reason ?? "—",
      Status: r.status,
      "Applied On": r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "—",
    }));
    exportXlsx([{ sheet: "Leave Applications", rows }], `Leaves_${fromDate}_to_${toDate}`);
  };

  const downloadEmployee = () => {
    if (!records[0]) return;
    const emp = employees.find(e => e.id === empFilter);
    const { attendance, leaves } = records[0];
    const attRows = attendance.map((r: any) => ({
      Date: r.date,
      "Check In":  r.check_in  ? new Date(r.check_in).toLocaleTimeString("en-IN",  { hour: "2-digit", minute: "2-digit" }) : "—",
      "Check Out": r.check_out ? new Date(r.check_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—",
      "Hours Worked": r.check_in && r.check_out ? ((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 3600000).toFixed(2) : "—",
    }));
    const lvRows = leaves.map((r: any) => ({
      "Leave Type": r.type, From: r.start_date, To: r.end_date,
      Days: Math.ceil((new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / 86400000) + 1,
      Reason: r.reason ?? "—", Status: r.status,
    }));
    exportXlsx(
      [{ sheet: "Attendance", rows: attRows }, { sheet: "Leave Applications", rows: lvRows }],
      `${emp?.full_name ?? "Employee"}_Report_${fromDate}_to_${toDate}`
    );
  };

  const exportXlsx = (sheets: { sheet: string; rows: any[] }[], filename: string) => {
    const wb = XLSX.utils.book_new();
    sheets.forEach(({ sheet, rows }) => {
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "No data for selected period." }]);
      XLSX.utils.book_append_sheet(wb, ws, sheet);
    });
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  const fmt = (d?: string) => d ? new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
  const hrs = (ci?: string, co?: string) => ci && co ? ((new Date(co).getTime() - new Date(ci).getTime()) / 3600000).toFixed(2) + "h" : "—";
  const days = (s: string, e: string) => Math.ceil((new Date(e).getTime() - new Date(s).getTime()) / 86400000) + 1;

  const tabBtn = (t: Tab, label: string) => (
    <button onClick={() => setTab(t)} style={{
      padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer",
      fontFamily: "Outfit,sans-serif", fontSize: "0.88rem", fontWeight: 600, transition: "all 0.2s",
      background: tab === t ? "linear-gradient(90deg,var(--accent-primary),var(--accent-secondary))" : "var(--glass-bg)",
      color: tab === t ? "white" : "var(--text-secondary)",
    }}>{label}</button>
  );

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}><h1>Reports & Exports</h1><p>Filter, preview, and download data as Excel</p></div>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        {tabBtn("attendance", "📋 Attendance")}
        {tabBtn("leaves",     "📅 Leave Applications")}
        {tabBtn("employee",   "👤 Employee Full Report")}
      </div>

      {/* Filters */}
      <div className="glass-panel" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className={styles.formGroup} style={{ marginBottom: 0 }}>
            <label>From Date</label>
            <input type="date" className="premium-input" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div className={styles.formGroup} style={{ marginBottom: 0 }}>
            <label>To Date</label>
            <input type="date" className="premium-input" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
          <div className={styles.formGroup} style={{ marginBottom: 0 }}>
            <label>{tab === "employee" ? "Select Employee *" : "Employee"}</label>
            <select className="premium-input" value={empFilter} onChange={e => setEmpFilter(e.target.value)}>
              {tab !== "employee" && <option value="all">All Employees</option>}
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </div>
          {tab === "leaves" && (
            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <label>Status</label>
              <select className="premium-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All Statuses</option>
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
          {tab === "employee" && empFilter !== "all" && records.length > 0 && (
            <button className={styles.primaryBtn} onClick={downloadEmployee} style={{ width: "auto", padding: "14px 24px", background: "linear-gradient(90deg,#10b981,#059669)" }}>📥 Download Full Report</button>
          )}
        </div>
        {tab === "employee" && empFilter === "all" && (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: 14 }}>ℹ️ Please select a specific employee for the full report.</p>
        )}
      </div>

      {/* ── Attendance Table ── */}
      {tab === "attendance" && (
        <div className={`glass-panel ${styles.tableWrap}`}>
          <table>
            <thead><tr><th>Employee</th><th>Date</th><th>Check In</th><th>Check Out</th><th>Hours</th><th>Status</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 32 }}><div className={styles.spinner} style={{ margin: "0 auto" }}></div></td></tr>
              : records.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 32 }}>No records found.</td></tr>
              : records.map(r => (
                <tr key={r.id}>
                  <td>{r.profiles?.full_name ?? "—"}</td>
                  <td>{r.date}</td>
                  <td>{fmt(r.check_in)}</td>
                  <td>{fmt(r.check_out)}</td>
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
              {loading ? <tr><td colSpan={8} style={{ textAlign: "center", padding: 32 }}><div className={styles.spinner} style={{ margin: "0 auto" }}></div></td></tr>
              : records.length === 0 ? <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 32 }}>No records found.</td></tr>
              : records.map(r => {
                const st = r.status === "approved" ? styles.badgeSuccess : r.status === "rejected" ? styles.badgeDanger : styles.badgeWarning;
                return (
                  <tr key={r.id}>
                    <td>{r.profiles?.full_name ?? "—"}</td>
                    <td>{r.type}</td>
                    <td>{r.start_date}</td>
                    <td>{r.end_date}</td>
                    <td>{days(r.start_date, r.end_date)}</td>
                    <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.reason ?? "—"}</td>
                    <td><span className={`${styles.statBadge} ${st}`}>{r.status}</span></td>
                    <td>{r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Employee Full Report Preview ── */}
      {tab === "employee" && empFilter !== "all" && records.length > 0 && (
        <>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 16, color: "var(--text-secondary)" }}>📋 Attendance ({records[0].attendance.length} records)</h2>
          <div className={`glass-panel ${styles.tableWrap}`} style={{ marginBottom: 28 }}>
            <table>
              <thead><tr><th>Date</th><th>Check In</th><th>Check Out</th><th>Hours</th></tr></thead>
              <tbody>
                {records[0].attendance.length === 0 ? <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 24 }}>No attendance data.</td></tr>
                : records[0].attendance.map((r: any) => (
                  <tr key={r.id}><td>{r.date}</td><td>{fmt(r.check_in)}</td><td>{fmt(r.check_out)}</td><td>{hrs(r.check_in, r.check_out)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 16, color: "var(--text-secondary)" }}>📅 Leave Applications ({records[0].leaves.length} records)</h2>
          <div className={`glass-panel ${styles.tableWrap}`}>
            <table>
              <thead><tr><th>Leave Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th></tr></thead>
              <tbody>
                {records[0].leaves.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 24 }}>No leave applications.</td></tr>
                : records[0].leaves.map((r: any) => {
                  const st = r.status === "approved" ? styles.badgeSuccess : r.status === "rejected" ? styles.badgeDanger : styles.badgeWarning;
                  return <tr key={r.id}><td>{r.type}</td><td>{r.start_date}</td><td>{r.end_date}</td><td>{days(r.start_date, r.end_date)}</td><td>{r.reason ?? "—"}</td><td><span className={`${styles.statBadge} ${st}`}>{r.status}</span></td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
