"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "../../dashboard.module.css";

export default function AdminAttendance() {
  const [records, setRecords] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [selectedUser, setSelectedUser] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("profiles").select("id, full_name").eq("role", "employee").then(({ data }) => setEmployees(data ?? []));
  }, []);

  const load = async () => {
    setLoading(true);
    let query = supabase.from("attendance_records").select("*, profiles(full_name, id)").eq("date", selectedDate);
    if (selectedUser) query = query.eq("user_id", selectedUser);
    const { data } = await query.order("check_in");
    setRecords(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [selectedDate, selectedUser]);

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>Attendance Records</h1>
        <p>View and monitor daily attendance</p>
      </div>

      <div className="glass-panel" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className={styles.formGroup} style={{ marginBottom: 0 }}>
            <label>Date</label>
            <input type="date" className="premium-input" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
          </div>
          <div className={styles.formGroup} style={{ marginBottom: 0 }}>
            <label>Employee (optional)</label>
            <select className="premium-input" value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
              <option value="">All Employees</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className={`glass-panel ${styles.tableWrap}`}>
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Check In</th>
              <th>Check Out</th>
              <th>Hours</th>
              <th>Photo</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 32 }}><div className={styles.spinner} style={{ margin: "0 auto" }}></div></td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "32px" }}>No records for this date.</td></tr>
            ) : records.map((r) => {
              const hours = r.check_in && r.check_out
                ? ((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 3600000).toFixed(2)
                : null;
              return (
                <tr key={r.id}>
                  <td>{(r.profiles as any)?.full_name ?? "—"}</td>
                  <td>{r.check_in ? new Date(r.check_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td>{r.check_out ? new Date(r.check_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td>{hours ? `${hours}h` : "—"}</td>
                  <td>
                    {r.photo_url ? (
                      <img src={r.photo_url} alt="check-in" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--accent-primary)" }} />
                    ) : <span style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>No photo</span>}
                  </td>
                  <td>
                    <span className={`${styles.statBadge} ${r.check_out ? styles.badgeSuccess : styles.badgeWarning}`}>
                      {r.check_out ? "Completed" : "In Office"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
