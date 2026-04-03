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
    const load = async () => {
      const [empRes, ltRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name").eq("role", "employee").order("full_name"),
        supabase.from("leave_types").select("name").order("name")
      ]);
      setEmployees(empRes.data ?? []);
      setLeaveTypes(ltRes.data ?? []);
      if ((empRes.data ?? []).length > 0) setUserId(empRes.data![0].id);
      if ((ltRes.data ?? []).length > 0) setLeaveType(ltRes.data![0].name);
    };
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    
    if (mode === "present") {
       const inISO = new Date(`${date}T${checkIn}:00`).toISOString();
       let outISO = null;
       if (checkOut) {
          outISO = new Date(`${date}T${checkOut}:00`).toISOString();
       }

       // Check if exists
       const { data: existing } = await supabase.from("attendance_records").select("id").eq("user_id", userId).eq("date", date).maybeSingle();

       let attErr;
       if (existing) {
          const res = await supabase.from("attendance_records").update({
             check_in: inISO,
             check_out: outISO,
             photo_url: "manual_override_admin"
          }).eq("id", existing.id);
          attErr = res.error;
       } else {
          const res = await supabase.from("attendance_records").insert({
             user_id: userId,
             date: date,
             check_in: inISO,
             check_out: outISO,
             photo_url: "manual_override_admin"
          });
          attErr = res.error;
       }

       if (attErr) setError(attErr.message);
       else setSuccess("✅ Attendance successfully overridden & recorded for " + date);
       
    } else {
       // Manual Leave injection
       if (!profile) return;
       const { error: lvErr } = await supabase.from("leave_requests").insert({
           user_id: userId,
           type: leaveType,
           start_date: date,
           end_date: date,
           reason: "Admin Manual Override",
           status: "approved"
       });

       if (lvErr) setError(lvErr.message);
       else setSuccess("✅ Leave successfully injected for " + date);
    }
    
    setSaving(false);
    setTimeout(() => setSuccess(""), 5000);
  };

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>Manual Overrides</h1>
        <p>Force mark employees as Present (with custom times) or on Formal Leave for past/missed dates.</p>
      </div>

      <div className="glass-panel" style={{ padding: 40, maxWidth: 600 }}>
         {success && <div style={{ background: "rgba(16,185,129,0.1)", color: "var(--success)", padding: 16, borderRadius: 12, marginBottom: 20 }}>{success}</div>}
         {error && <div style={{ background: "rgba(239,68,68,0.1)", color: "var(--danger)", padding: 16, borderRadius: 12, marginBottom: 20 }}>{error}</div>}

         <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
           <button onClick={() => setMode("present")} className={mode === "present" ? styles.primaryBtn : styles.secondaryBtn} style={{width:'auto'}}>Mark Present</button>
           <button onClick={() => setMode("leave")} className={mode === "leave" ? styles.primaryBtn : styles.secondaryBtn} style={{width:'auto'}}>Mark on Leave</button>
         </div>

         <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
           <div className={styles.formGroup} style={{marginBottom: 0}}>
             <label>Select Employee</label>
             <select className="premium-input" value={userId} onChange={e => setUserId(e.target.value)}>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
             </select>
           </div>
           
           <div className={styles.formGroup} style={{marginBottom: 0}}>
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
                  <label>Check-Out Time</label>
                  <input type="time" className="premium-input" value={checkOut} onChange={e => setCheckOut(e.target.value)} />
                </div>
              </div>
           )}

           {mode === "leave" && (
              <div className={styles.formGroup} style={{marginBottom: 0}}>
                 <label>Force Leave Type</label>
                 <select className="premium-input" value={leaveType} onChange={e => setLeaveType(e.target.value)}>
                    {leaveTypes.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                 </select>
              </div>
           )}

           <button type="submit" className={styles.primaryBtn} disabled={saving} style={{ marginTop: 8 }}>
              {saving ? "Processing..." : `Force Log ${mode === "present" ? "Attendance" : "Leave"}`}
           </button>
         </form>

      </div>
    </div>
  );
}
