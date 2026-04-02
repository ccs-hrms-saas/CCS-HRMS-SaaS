"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import styles from "../../dashboard.module.css";

export default function EmployeeLeaves() {
  const { profile } = useAuth();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [form, setForm] = useState({ type: "Casual", start_date: "", end_date: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("leave_requests")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false });
    setLeaves(data ?? []);
  };

  useEffect(() => { load(); }, [profile]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    await supabase.from("leave_requests").insert({ ...form, user_id: profile.id });
    setForm({ type: "Casual", start_date: "", end_date: "", reason: "" });
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
    await load();
    setSaving(false);
  };

  const statusStyle = (s: string) =>
    s === "approved" ? styles.badgeSuccess : s === "rejected" ? styles.badgeDanger : styles.badgeWarning;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>My Leaves</h1>
        <p>Apply for leave and track your requests</p>
      </div>

      <div className={styles.twoCol}>
        <div>
          <div className="glass-panel" style={{ padding: 28 }}>
            <h2 style={{ marginBottom: 20, fontSize: "1rem" }}>Apply for Leave</h2>
            {success && (
              <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "var(--success)", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: "0.88rem" }}>
                ✅ Leave request submitted successfully!
              </div>
            )}
            <form onSubmit={submit}>
              <div className={styles.formGroup}>
                <label>Leave Type</label>
                <select className="premium-input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option>Casual</option>
                  <option>Sick</option>
                  <option>Earned</option>
                  <option>Half Day</option>
                  <option>Emergency</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>From Date</label>
                <input type="date" className="premium-input" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} required />
              </div>
              <div className={styles.formGroup}>
                <label>To Date</label>
                <input type="date" className="premium-input" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} required />
              </div>
              <div className={styles.formGroup}>
                <label>Reason</label>
                <textarea className="premium-input" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Brief reason for leave..." rows={3} />
              </div>
              <button type="submit" className={styles.primaryBtn} style={{ width: "100%" }} disabled={saving}>
                {saving ? "Submitting..." : "📤 Submit Request"}
              </button>
            </form>
          </div>
        </div>

        <div>
          <h2 style={{ marginBottom: 16, fontSize: "1rem" }}>My Requests</h2>
          <div className={`glass-panel ${styles.tableWrap}`}>
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {leaves.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "24px" }}>No leave requests yet.</td></tr>
                ) : leaves.map((l) => (
                  <tr key={l.id}>
                    <td>{l.type}</td>
                    <td>{l.start_date}</td>
                    <td>{l.end_date}</td>
                    <td><span className={`${styles.statBadge} ${statusStyle(l.status)}`}>{l.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
