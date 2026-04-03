"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { getLeaveDaysCount, getCurrentFinancialYear } from "@/lib/dateUtils";
import styles from "../../dashboard.module.css";

export default function EmployeeLeaves() {
  const { profile } = useAuth();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [userGender, setUserGender] = useState("");
  
  const [form, setForm] = useState({ type: "", start_date: "", end_date: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentFY = getCurrentFinancialYear();

  const loadData = async () => {
    if (!profile) return;
    
    const [resLeaves, resTypes, resHols, resBals, profRes] = await Promise.all([
      supabase.from("leave_requests").select("*").eq("user_id", profile.id).order("created_at", { ascending: false }),
      supabase.from("leave_types").select("*").order("name"),
      supabase.from("company_holidays").select("date"),
      supabase.from("leave_balances").select("*, leave_types(name, max_days_per_year)").eq("user_id", profile.id).eq("financial_year", currentFY),
      supabase.from("profiles").select("gender").eq("id", profile.id).single()
    ]);
    
    setLeaves(resLeaves.data ?? []);
    
    // Filter leave types
    const gender = profRes.data?.gender || "Male";
    setUserGender(gender);
    const validTypes = (resTypes.data ?? []).filter((t: any) => t.name !== "Menstruation Leave" || gender === "Female");
    setLeaveTypes(validTypes);
    setBalances(resBals.data ?? []);

    const hSet = new Set<string>();
    (resHols.data ?? []).forEach(h => hSet.add(h.date));
    setHolidays(hSet);

    if (validTypes.length > 0 && !form.type) {
      setForm(prev => ({ ...prev, type: validTypes[0].name }));
    }
  };

  useEffect(() => { loadData(); }, [profile]);

  const selectedTypeObj = leaveTypes.find(t => t.name === form.type);
  const leaveDays = getLeaveDaysCount(form.start_date, form.end_date, selectedTypeObj?.count_holidays ?? false, holidays);
  const needsAttachment = selectedTypeObj?.requires_attachment && leaveDays >= (selectedTypeObj.requires_attachment_after_days ?? 2);

  // Find balance for selected type
  const activeBalance = balances.find(b => b.leave_types?.name === form.type);
  const remainingBal = activeBalance ? (activeBalance.accrued - activeBalance.used) : 0;
  // If it's a type that doesn't use balances (like Leave Without Pay), we don't strict validate
  const usesBalance = selectedTypeObj?.is_paid && selectedTypeObj?.name !== "Menstruation Leave";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedTypeObj) return;

    // Strict Rule: Menstruation limit 1 per month, no overlap.
    if (form.type === "Menstruation Leave") {
       if (leaveDays > 1) { setErrorMsg("Menstruation Leave is strictly limited to 1 day per month."); return; }
       
       const reqMonth = new Date(form.start_date).getMonth();
       const reqYear = new Date(form.start_date).getFullYear();
       
       const alreadyTaken = leaves.find(l => l.type === "Menstruation Leave" && l.status !== "rejected" && new Date(l.start_date).getMonth() === reqMonth && new Date(l.start_date).getFullYear() === reqYear);
       if (alreadyTaken) {
         setErrorMsg("You have already utilized your Menstruation Leave for this calendar month.");
         return;
       }
    }

    if (usesBalance && leaveDays > remainingBal) {
      setErrorMsg(`Insufficient balance for ${form.type}. Requested: ${leaveDays}, Available: ${remainingBal}`);
      return;
    }

    if (needsAttachment && !attachedFile) {
      setErrorMsg(`A medical certificate/document is required for ${form.type}s of ${selectedTypeObj.requires_attachment_after_days} or more days.`);
      return;
    }

    setSaving(true);
    setErrorMsg("");

    let attachment_url = null;
    let is_violation = false;
    let violation_reason = null;

    if (attachedFile) {
      const fileName = `${profile.id}/${Date.now()}_${attachedFile.name.replace(/[^a-zA-Z0-9.\-]/g, "_")}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage.from("medical-certificates").upload(fileName, attachedFile);
      
      if (uploadErr) {
        setErrorMsg("Failed to upload document: " + uploadErr.message);
        setSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("medical-certificates").getPublicUrl(fileName);
      attachment_url = urlData.publicUrl;
    } else if (needsAttachment && !attachedFile) {
      is_violation = true;
      violation_reason = `Missing required document for ${leaveDays} days of ${form.type}`;
    }

    // 1. Submit leave request
    await supabase.from("leave_requests").insert({ 
      user_id: profile.id, type: form.type, start_date: form.start_date, end_date: form.end_date,
      reason: form.reason, attachment_url, is_violation, violation_reason
    });

    // 2. Adjust used balance locally immediately
    if (usesBalance && activeBalance) {
      await supabase.from("leave_balances").update({ used: activeBalance.used + leaveDays }).eq("id", activeBalance.id);
    }

    setForm({ type: leaveTypes[0]?.name ?? "", start_date: "", end_date: "", reason: "" });
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    
    setSuccess(true);
    setTimeout(() => setSuccess(false), 4000);
    await loadData();
    setSaving(false);
  };

  const statusStyle = (s: string) => s === "approved" ? styles.badgeSuccess : s === "rejected" ? styles.badgeDanger : styles.badgeWarning;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>My Leaves</h1>
        <p>Apply for leave, check balances, upload required documents</p>
      </div>

      {/* ── Top Balance Widget ── */}
      {balances.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: "1rem", marginBottom: 16 }}>💰 Available Leave Balances (FY {currentFY})</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
            {balances.map(b => (
               <div key={b.id} className="glass-panel" style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                 <div style={{ fontWeight: 600, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                   {b.leave_types?.name?.replace(" Leave", "").replace(/ *\([^)]*\) */g, "")}
                 </div>
                 <div style={{ fontSize: "1.4rem", fontWeight: 700, color: (b.accrued - b.used) <= 0 ? "var(--danger)" : "var(--success)" }}>
                   {(b.accrued - b.used).toFixed(1)} <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 400 }}>/ {b.accrued}</span>
                 </div>
               </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.twoCol}>
        <div>
          <div className="glass-panel" style={{ padding: 28 }}>
            <h2 style={{ marginBottom: 20, fontSize: "1.1rem" }}>Apply for Leave</h2>
            
            {success && <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "var(--success)", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: "0.88rem" }}>✅ Leave request submitted successfully!</div>}
            {errorMsg && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--danger)", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: "0.88rem" }}>⚠️ {errorMsg}</div>}

            <form onSubmit={submit}>
              <div className={styles.formGroup}>
                <label>Leave Type</label>
                <select className="premium-input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  {leaveTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
                {selectedTypeObj && (
                  <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 6, display: 'flex', justifyContent: 'space-between'}}>
                    <span>{selectedTypeObj.count_holidays ? 'Holidays/Weekends included in count.' : 'Only working days counted.'}</span>
                    {usesBalance && <strong style={{color: remainingBal <= 0 ? 'var(--danger)' : 'var(--accent-primary)'}}>Balance: {remainingBal}</strong>}
                  </div>
                )}
              </div>
              <div style={{display: 'flex', gap: 16}}>
                <div className={styles.formGroup} style={{flex: 1}}>
                  <label>From Date</label>
                  <input type="date" className="premium-input" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} required />
                </div>
                <div className={styles.formGroup} style={{flex: 1}}>
                  <label>To Date</label>
                  <input type="date" className="premium-input" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} required />
                </div>
              </div>
              
              {form.start_date && form.end_date && leaveDays > 0 && (
                <div style={{marginBottom: 16, fontSize: '0.9rem', color: 'var(--accent-primary)', fontWeight: 600}}>
                  Total request duration: {leaveDays} days
                </div>
              )}

              {needsAttachment && (
                 <div className={styles.formGroup} style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", padding: 16, borderRadius: 12 }}>
                  <label style={{color: '#f59e0b', fontSize: '0.9rem', marginBottom: 10}}>⚠️ {selectedTypeObj.name} longer than {selectedTypeObj.requires_attachment_after_days - 1} days requires a supporting document.</label>
                  <input type="file" ref={fileInputRef} onChange={e => setAttachedFile(e.target.files?.[0] ?? null)} className="premium-input" accept=".jpg,.jpeg,.png,.pdf" style={{padding: 10}} required={needsAttachment} />
                  <span style={{display: 'block', marginTop: 8, fontSize:'0.75rem', color:'var(--text-secondary)'}}>Max size: 5MB. PDF, JPG, PNG accepted.</span>
                 </div>
              )}

              <div className={styles.formGroup}>
                <label>Reason</label>
                <textarea className="premium-input" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Brief reason for your absence..." rows={3} required />
              </div>

              <button type="submit" className={styles.primaryBtn} disabled={saving || leaveDays <= 0 || (usesBalance && leaveDays > remainingBal)}>
                {saving ? "Submitting..." : "📤 Submit Request"}
              </button>
            </form>
          </div>
        </div>

        <div>
           <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
             <h2 style={{ fontSize: "1.1rem" }}>My Requests Explorer</h2>
           </div>
          <div className={`glass-panel ${styles.tableWrap}`}>
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Dates</th>
                  <th>Status</th>
                  <th>Doc</th>
                </tr>
              </thead>
              <tbody>
                {leaves.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "24px" }}>No leave requests yet.</td></tr>
                ) : leaves.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <div style={{fontWeight: 600}}>{l.type}</div>
                      {l.is_violation && <div style={{fontSize:'0.65rem', color: 'var(--danger)'}}>Rule Violation</div>}
                    </td>
                    <td style={{fontSize: '0.85rem'}}>{new Date(l.start_date).toLocaleDateString("en-IN", {month: 'short', day:'numeric'})} - {new Date(l.end_date).toLocaleDateString("en-IN", {month: 'short', day:'numeric'})}</td>
                    <td><span className={`${styles.statBadge} ${statusStyle(l.status)}`}>{l.status}</span></td>
                    <td>{l.attachment_url ? <a href={l.attachment_url} target="_blank" rel="noopener noreferrer" style={{color: 'var(--accent-primary)', fontSize: '1.2rem', textDecoration: 'none'}} title="View Document">📄</a> : <span style={{color:'var(--text-secondary)'}}>—</span>}</td>
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
