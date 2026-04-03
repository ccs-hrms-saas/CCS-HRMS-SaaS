"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";
import styles from "../../dashboard.module.css";
import { getLeaveDaysCount, isWorkingDay } from "@/lib/dateUtils";

type Tab = "attendance" | "leaves" | "employee" | "balances";

export default function AdminReports() {
  const [tab, setTab]             = useState<Tab>("attendance");
  const [employees, setEmployees] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [selected, setSelected]   = useState<Set<string>>(new Set(["all"]));
  const [showEmpPicker, setShowEmpPicker] = useState(false);
  const [fromDate, setFromDate]   = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; });
  const [toDate, setToDate]       = useState(() => new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentFY, setCurrentFY] = useState(() => new Date().getMonth() < 3 ? new Date().getFullYear() - 1 : new Date().getFullYear());
  const [records, setRecords]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name").then(({ data }) => setEmployees(data ?? []));
    supabase.from("leave_types").select("*").then(({ data }) => setLeaveTypes(data ?? []));
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
  const selLabel = allSelected ? "All Employees" : selectedIds.length === 1 ? employees.find(e => e.id === selectedIds[0])?.full_name : `${selectedIds.length} Employees Selected`;

  /* ── Load data ── */
  const load = async () => {
    setLoading(true); setRecords([]);
    const ids = selectedIds;

    if (tab === "attendance") {
      let q = supabase.from("attendance_records").select("*, profiles(full_name, id)").gte("date", fromDate).lte("date", toDate).in("user_id", ids).order("date", { ascending: false });
      const { data } = await q;
      setRecords(data ?? []);

    } else if (tab === "leaves") {
      let q = supabase.from("leave_requests").select("*, profiles!leave_requests_user_id_fkey(full_name)").gte("start_date", fromDate).lte("start_date", toDate).in("user_id", ids).order("created_at", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data } = await q;
      setRecords(data ?? []);

    } else if (tab === "employee") {
      const results = await Promise.all(ids.map(async (id) => {
        const emp = employees.find(e => e.id === id);
        const [atRes, lvRes] = await Promise.all([
          supabase.from("attendance_records").select("*").eq("user_id", id).gte("date", fromDate).lte("date", toDate).order("date"),
          supabase.from("leave_requests").select("*").eq("user_id", id).eq("status", "approved").gte("start_date", fromDate).lte("end_date", toDate).order("start_date"),
        ]);
        return { emp, attendance: atRes.data ?? [], leaves: lvRes.data ?? [] };
      }));
      setRecords(results);

    } else if (tab === "balances") {
      const { data } = await supabase.from("leave_balances")
        .select("*, profiles(id, full_name), leave_types(name)")
        .eq("financial_year", currentFY)
        .in("user_id", ids);
        
      // Group by user
      const userBals: Record<string, any> = {};
      (data ?? []).forEach(b => {
        const uId = b.profiles?.id;
        if (!uId) return;
        if (!userBals[uId]) userBals[uId] = { empName: b.profiles.full_name, balances: [] };
        userBals[uId].balances.push(b);
      });
      setRecords(Object.values(userBals));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [tab, selected]);

  /* ── Excel helpers ── */
  const fmt  = (d?: string) => d ? new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
  const hrsNum = (ci?: string, co?: string) => ci && co ? ((new Date(co).getTime() - new Date(ci).getTime()) / 3600000) : 0;
  const hrs  = (ci?: string, co?: string) => { const h = hrsNum(ci, co); return h ? h.toFixed(2) : "—"; };
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
    const rows = records.map(r => ({ Employee: r.profiles?.full_name ?? "—", Date: r.date, "Check In": fmt(r.check_in), "Check Out": fmt(r.check_out), "Hours": hrs(r.check_in, r.check_out), Status: r.check_out ? "Completed" : "In Office" }));
    exportXlsx([{ sheet: "Attendance", rows }], `Attendance_${selLabel}_${fromDate}_to_${toDate}`);
  };

  const downloadLeaves = () => {
    const rows = records.map(r => ({ Employee: r.profiles?.full_name ?? "—", "Leave Type": r.type, From: r.start_date, To: r.end_date, Days: days(r.start_date, r.end_date), Reason: r.reason ?? "—", Status: r.status, "Applied On": r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "—" }));
    exportXlsx([{ sheet: "Leave Applications", rows }], `Leaves_${fromDate}_to_${toDate}`);
  };

  const downloadBalances = () => {
    const rows = records.map(r => {
      const rowData: any = { Employee: r.empName, "Financial Year": currentFY };
      r.balances.forEach((b: any) => {
         const t = b.leave_types?.name?.replace(" Leave","") ?? "Unknown";
         rowData[`${t} Accrued`] = b.accrued;
         rowData[`${t} Used`] = b.used;
         rowData[`${t} Balance`] = b.accrued - b.used;
      });
      return rowData;
    });
    exportXlsx([{ sheet: "Leave Balances", rows }], `Leave_Balances_FY${currentFY}`);
  };

  const calculateSummary = (attendance: any[], leaves: any[]) => {
    // 1. Calculate actual working days in the selected date range
    let targetWorkingDays = 0;
    const start = new Date(fromDate);
    const end = new Date(toDate);
    let curr = new Date(start);
    while (curr <= end) { if (isWorkingDay(curr)) targetWorkingDays++; curr.setDate(curr.getDate() + 1); }
    
    let baseTargetHours = targetWorkingDays * 8.5;
    
    // 2. Adjust target for approved leaves
    let totalLeaveDeductionHours = 0;
    leaves.forEach(l => {
      const typeObj = leaveTypes.find(t => t.name === l.type);
      const leaveDays = getLeaveDaysCount(l.start_date, l.end_date, typeObj?.count_holidays ?? false);
      const deductionPerHour = typeObj ? Number(typeObj.deduction_hours) : 8.5;
      totalLeaveDeductionHours += (leaveDays * deductionPerHour);
    });

    const adjustedTarget = Math.max(0, baseTargetHours - totalLeaveDeductionHours);

    // 3. Calculate actual hours clocked
    const actualHours = attendance.reduce((sum, r) => sum + hrsNum(r.check_in, r.check_out), 0);
    const deficitSurplus = actualHours - adjustedTarget;

    return { targetWorkingDays, baseTargetHours, totalLeaveDeductionHours, adjustedTarget, actualHours, deficitSurplus };
  };

  const downloadEmployee = () => {
    const sheets: { sheet: string; rows: any[] }[] = [];
    const summaryRows: any[] = [];

    records.forEach(({ emp, attendance, leaves }) => {
      const name = emp?.full_name?.slice(0, 20) ?? "Employee";
      const s = calculateSummary(attendance, leaves);
      
      summaryRows.push({
        Employee: emp?.full_name ?? "—",
        "Base Target (Hrs)": s.baseTargetHours.toFixed(2),
        "Approved Leaves (Deduction Hrs)": s.totalLeaveDeductionHours.toFixed(2),
        "Adjusted Target (Hrs)": s.adjustedTarget.toFixed(2),
        "Actual Clocked (Hrs)": s.actualHours.toFixed(2),
        "Deficit/Surplus (Hrs)": s.deficitSurplus.toFixed(2)
      });

      sheets.push({
        sheet: `${name} - Attendance`,
        rows: attendance.map((r: any) => ({ Date: r.date, "Check In": fmt(r.check_in), "Check Out": fmt(r.check_out), Hours: hrs(r.check_in, r.check_out) })),
      });
      sheets.push({
        sheet: `${name} - Leaves`,
        rows: leaves.map((r: any) => ({ "Leave Type": r.type, From: r.start_date, To: r.end_date, Days: days(r.start_date, r.end_date), Reason: r.reason ?? "—", Status: r.status })),
      });
    });

    exportXlsx([{ sheet: "Overall Summary", rows: summaryRows }, ...sheets], `Employee_Reports_${fromDate}_to_${toDate}`);
  };

  /* ── UI ── */
  const tabBtn = (t: Tab, label: string) => (
    <button onClick={() => setTab(t)} style={{ padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontSize: "0.88rem", fontWeight: 600, transition: "all 0.2s", background: tab === t ? "linear-gradient(90deg,var(--accent-primary),var(--accent-secondary))" : "var(--glass-bg)", color: tab === t ? "white" : "var(--text-secondary)" }}>{label}</button>
  );

  const stBadge = (s: string) => s === "approved" ? styles.badgeSuccess : s === "rejected" ? styles.badgeDanger : styles.badgeWarning;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}><h1>Reports & Exports</h1><p>Filter by employees, dates, and download as Excel</p></div>

      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        {tabBtn("attendance", "📋 Attendance")}
        {tabBtn("leaves",     "📅 Leave Applications")}
        {tabBtn("balances",   "💰 Leave Ledgers")}
        {tabBtn("employee",   "👤 Full Employee Report")}
      </div>

      <div className="glass-panel" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
          
          {tab !== "balances" && (
            <>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}><label>From Date</label><input type="date" className="premium-input" value={fromDate} onChange={e => setFromDate(e.target.value)} /></div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}><label>To Date</label><input type="date" className="premium-input" value={toDate} onChange={e => setToDate(e.target.value)} /></div>
            </>
          )}

          {tab === "balances" && (
            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <label>Financial Year</label>
              <input type="number" className="premium-input" value={currentFY} onChange={e => setCurrentFY(Number(e.target.value))} />
            </div>
          )}
          
          <div className={styles.formGroup} style={{ marginBottom: 0, position: "relative" }}>
            <label>Employees</label>
            <button type="button" onClick={() => setShowEmpPicker(v => !v)} className="premium-input" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minWidth: 200, cursor: "pointer", textAlign: "left", fontFamily: "Outfit,sans-serif", fontSize: "0.88rem" }}>
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
            <div className={styles.formGroup} style={{ marginBottom: 0 }}><label>Status</label><select className="premium-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></div>
          )}

          <button className={styles.primaryBtn} onClick={load} style={{ width: "auto", padding: "14px 24px" }}>🔍 Filter</button>
          
          {tab === "attendance" && records.length > 0 && <button className={styles.primaryBtn} onClick={downloadAttendance} style={{ width: "auto", padding: "14px 24px", background: "linear-gradient(90deg,#10b981,#059669)" }}>📥 Download Excel</button>}
          {tab === "leaves" && records.length > 0 && <button className={styles.primaryBtn} onClick={downloadLeaves} style={{ width: "auto", padding: "14px 24px", background: "linear-gradient(90deg,#10b981,#059669)" }}>📥 Download Excel</button>}
          {tab === "balances" && records.length > 0 && <button className={styles.primaryBtn} onClick={downloadBalances} style={{ width: "auto", padding: "14px 24px", background: "linear-gradient(90deg,#10b981,#059669)" }}>📥 Download Excel</button>}
          {tab === "employee" && records.length > 0 && <button className={styles.primaryBtn} onClick={downloadEmployee} style={{ width: "auto", padding: "14px 24px", background: "linear-gradient(90deg,#10b981,#059669)" }}>📥 Download ({records.length} {records.length === 1 ? "Employee" : "Employees"})</button>}
        </div>
      </div>
      {showEmpPicker && <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setShowEmpPicker(false)} />}

      {tab === "attendance" && (
        <div className={`glass-panel ${styles.tableWrap}`}>
          <table>
            <thead><tr><th>Employee</th><th>Date</th><th>Check In</th><th>Check Out</th><th>Hours</th><th>Status</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 32 }}><div className={styles.spinner} style={{ margin: "0 auto" }} /></td></tr>
              : records.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 32 }}>No records found.</td></tr>
              : records.map(r => (
                <tr key={r.id}><td>{r.profiles?.full_name ?? "—"}</td><td>{r.date}</td><td>{fmt(r.check_in)}</td><td>{fmt(r.check_out)}</td><td>{hrs(r.check_in, r.check_out)}</td><td><span className={`${styles.statBadge} ${r.check_out ? styles.badgeSuccess : styles.badgeWarning}`}>{r.check_out ? "Completed" : "In Office"}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "leaves" && (
        <div className={`glass-panel ${styles.tableWrap}`}>
          <table>
            <thead><tr><th>Employee</th><th>Type</th><th>Duration</th><th>Applied On</th><th>Reason</th><th>Status</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 32 }}><div className={styles.spinner} style={{ margin: "0 auto" }} /></td></tr>
              : records.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 32 }}>No records found.</td></tr>
              : records.map(r => (
                <tr key={r.id}><td>{r.profiles?.full_name ?? "—"}</td><td>{r.type}</td><td>{r.start_date} to {r.end_date}<br/><span style={{fontSize:'0.75rem', color: "var(--text-secondary)"}}>{days(r.start_date, r.end_date)} days</span></td><td>{new Date(r.created_at).toLocaleDateString("en-IN")}</td><td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.reason ?? "—"}</td><td><span className={`${styles.statBadge} ${stBadge(r.status)}`}>{r.status}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "balances" && (
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
          {records.length === 0 && !loading && <div style={{ color: "var(--text-secondary)" }}>No balances found.</div>}
          {records.map((r: any) => (
            <div key={r.empName} className="glass-panel" style={{ padding: 20 }}>
               <h3 style={{ marginBottom: 16, fontSize: "1.1rem", borderBottom: '1px solid var(--glass-border)', paddingBottom: 8 }}>{r.empName}</h3>
               {r.balances.map((b: any) => (
                 <div key={b.id} style={{display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center'}}>
                    <span style={{fontSize: '0.9rem', color: 'var(--text-secondary)'}}>{b.leave_types?.name}</span>
                    <span style={{fontSize: '1.2rem', fontWeight: 600, color: (b.accrued - b.used) <= 0 ? 'var(--danger)' : 'var(--success)'}}>
                      {(b.accrued - b.used).toFixed(1)} <span style={{fontSize: '0.75rem', fontWeight: 400, color:'var(--text-secondary)'}}>/ {b.accrued} acc</span>
                    </span>
                 </div>
               ))}
            </div>
          ))}
        </div>
      )}

      {tab === "employee" && (
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
          {records.length === 0 && !loading && <div style={{ color: "var(--text-secondary)" }}>No employees selected.</div>}
          {records.map((data: any) => {
            const sum = calculateSummary(data.attendance, data.leaves);
            return (
              <div key={data.emp?.id} className="glass-panel" style={{ padding: 20 }}>
                <h3 style={{ marginBottom: 12, fontSize: "1.1rem" }}>{data.emp?.full_name ?? "—"}</h3>
                
                <div style={{display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16}}>
                   <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem'}}>
                      <span style={{color: 'var(--text-secondary)'}}>Base Target:</span>
                      <span>{sum.baseTargetHours.toFixed(2)} hrs</span>
                   </div>
                   {sum.totalLeaveDeductionHours > 0 && (
                     <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', color: 'var(--warning)'}}>
                        <span>Leave Deductions:</span>
                        <span>-{sum.totalLeaveDeductionHours.toFixed(2)} hrs</span>
                     </div>
                   )}
                   <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600, borderTop: '1px solid var(--glass-border)', paddingTop: 6}}>
                      <span>Adjusted Target:</span>
                      <span>{sum.adjustedTarget.toFixed(2)} hrs</span>
                   </div>
                   <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-primary)'}}>
                      <span>Actual Clocked:</span>
                      <span>{sum.actualHours.toFixed(2)} hrs</span>
                   </div>
                </div>

                <div style={{ padding: 12, borderRadius: 10, background: sum.deficitSurplus >= 0 ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", color: sum.deficitSurplus >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 700, fontSize: "1.1rem", textAlign: "center" }}>
                   {sum.deficitSurplus >= 0 ? "surplus" : "deficit"} : {Math.abs(sum.deficitSurplus).toFixed(2)} hrs
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  <span>{data.attendance.length} attendance records</span>
                  <span>{data.leaves.length} approved leaves</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
