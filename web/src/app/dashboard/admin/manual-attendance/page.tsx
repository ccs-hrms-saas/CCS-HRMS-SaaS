"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "../../dashboard.module.css";
import { useAuth } from "@/context/AuthContext";

export default function ManualAttendance() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [checkIn, setCheckIn] = useState("09:30");
  const [checkOut, setCheckOut] = useState("18:00");

  const [leaveType, setLeaveType] = useState("");
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [mode, setMode] = useState<"present" | "leave">("present");

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile?.company_id) return;
    const load = async () => {
      const [empRes, ltRes] = await Promise.all([
        // Only fetch employees from THIS company (tenant isolation)
        supabase
          .from("profiles")
          .select("id, full_name, role")
          .eq("company_id", profile.company_id)
          .eq("is_active", true)
          .is("system_role", null)
          .not("role", "eq", "superadmin")
          .order("full_name"),
        // Only fetch leave types for THIS company
        supabase
          .from("leave_types")
          .select("name")
          .eq("company_id", profile.company_id)
          .order("name"),
      ]);
      setEmployees(empRes.data ?? []);
      setLeaveTypes(ltRes.data ?? []);
      if ((empRes.data ?? []).length > 0) setUserId(empRes.data![0].id);
      if ((ltRes.data ?? []).length > 0) setLeaveType(ltRes.data![0].name);
    };
    load();
  }, [profile?.company_id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess("");

    // Get current session JWT to send with the API request
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError("Session expired — please log in again.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/manual-override", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Send the JWT so the server can verify who is calling
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          mode,
          user_id:    userId,
          date,
          check_in:   mode === "present" ? checkIn  : undefined,
          check_out:  mode === "present" ? checkOut : undefined,
          leave_type: mode === "leave"   ? leaveType : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? "Something went wrong.");
      } else {
        setSuccess(json.message);
        setTimeout(() => setSuccess(""), 6000);
      }
    } catch (err: any) {
      setError(err.message ?? "Network error.");
    }

    setSaving(false);
  };

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>Manual Overrides</h1>
        <p>Force mark employees as Present (with custom times) or on Formal Leave for past/missed dates.</p>
      </div>

      <div className="glass-panel" style={{ padding: 40, maxWidth: 600 }}>
        {success && (
          <div style={{ background: "rgba(16,185,129,0.1)", color: "var(--success)", padding: 16, borderRadius: 12, marginBottom: 20 }}>
            {success}
          </div>
        )}
        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", color: "var(--danger)", padding: 16, borderRadius: 12, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* Security notice */}
        <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: "0.8rem", color: "var(--text-secondary)" }}>
          🔒 This action is logged. All overrides are recorded with your admin ID and timestamp.
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          <button onClick={() => setMode("present")} className={mode === "present" ? styles.primaryBtn : styles.secondaryBtn} style={{ width: "auto" }}>Mark Present</button>
          <button onClick={() => setMode("leave")} className={mode === "leave" ? styles.primaryBtn : styles.secondaryBtn} style={{ width: "auto" }}>Mark on Leave</button>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className={styles.formGroup} style={{ marginBottom: 0 }}>
            <label>Select Employee</label>
            <select className="premium-input" value={userId} onChange={e => setUserId(e.target.value)}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </div>

          <div className={styles.formGroup} style={{ marginBottom: 0 }}>
            <label>Target Date</label>
            <input type="date" className="premium-input" value={date} onChange={e => setDate(e.target.value)} required />
          </div>

          {mode === "present" && (
            <div style={{ display: "flex", gap: 16 }}>
              <div className={styles.formGroup} style={{ flex: 1, marginBottom: 0 }}>
                <label>Check-In Time</label>
                <input type="time" className="premium-input" value={checkIn} onChange={e => setCheckIn(e.target.value)} required />
              </div>
              <div className={styles.formGroup} style={{ flex: 1, marginBottom: 0 }}>
                <label>Check-Out Time <span style={{ fontWeight: 400, fontSize: "0.78rem", color: "var(--text-secondary)" }}>(optional)</span></label>
                <input type="time" className="premium-input" value={checkOut} onChange={e => setCheckOut(e.target.value)} />
              </div>
            </div>
          )}

          {mode === "leave" && (
            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <label>Force Leave Type</label>
              <select className="premium-input" value={leaveType} onChange={e => setLeaveType(e.target.value)}>
                {leaveTypes.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
            </div>
          )}

          <button type="submit" className={styles.primaryBtn} disabled={saving || !userId} style={{ marginTop: 8 }}>
            {saving ? "Processing..." : `Force Log ${mode === "present" ? "Attendance" : "Leave"}`}
          </button>
        </form>
      </div>
    </div>
  );
}
