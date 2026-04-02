"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";
import styles from "../../dashboard.module.css";

export default function AdminReports() {
  const [records, setRecords] = useState<any[]>([]);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("attendance_records")
      .select("*, profiles(full_name)")
      .gte("date", fromDate)
      .lte("date", toDate)
      .order("date", { ascending: false });
    setRecords(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const downloadExcel = () => {
    const rows = records.map((r) => ({
      Employee: (r.profiles as any)?.full_name ?? "—",
      Date: r.date,
      "Check In": r.check_in ? new Date(r.check_in).toLocaleTimeString("en-IN") : "—",
      "Check Out": r.check_out ? new Date(r.check_out).toLocaleTimeString("en-IN") : "—",
      "Hours Worked": r.check_in && r.check_out
        ? ((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 3600000).toFixed(2) + " hrs"
        : "—",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `Attendance_${fromDate}_to_${toDate}.xlsx`);
  };

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>Reports</h1>
        <p>Download attendance data as Excel</p>
      </div>

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
          <button className={styles.primaryBtn} onClick={load} style={{ width: "auto", padding: "14px 24px" }}>
            🔍 Filter
          </button>
          <button className={styles.primaryBtn} onClick={downloadExcel} style={{ width: "auto", padding: "14px 24px", background: "linear-gradient(90deg, #10b981, #059669)" }}>
            📥 Download Excel
          </button>
        </div>
      </div>

      <div className={`glass-panel ${styles.tableWrap}`}>
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Date</th>
              <th>Check In</th>
              <th>Check Out</th>
              <th>Hours Worked</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: 32 }}><div className={styles.spinner} style={{ margin: "0 auto" }}></div></td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "32px" }}>No records found for selected period.</td></tr>
            ) : records.map((r) => {
              const hours = r.check_in && r.check_out
                ? ((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 3600000).toFixed(2)
                : null;
              return (
                <tr key={r.id}>
                  <td>{(r.profiles as any)?.full_name ?? "—"}</td>
                  <td>{r.date}</td>
                  <td>{r.check_in ? new Date(r.check_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td>{r.check_out ? new Date(r.check_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
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
