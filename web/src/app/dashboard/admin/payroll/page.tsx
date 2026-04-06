"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import styles from "../../dashboard.module.css";
import { getWorkingDaysInMonth, isWorkingDay } from "@/lib/dateUtils";

export default function AdminPayroll() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [payrollRows, setPayrollRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth()); // default to previous month visually? 
  const [step, setStep] = useState<"select" | "preview">("select");
  const [processing, setProcessing] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const loadRawData = async () => {
    const { data } = await supabase.from("profiles").select("*").eq("is_active", true).not("role", "eq", "superadmin");

    setEmployees(data ?? []);
  };

  useEffect(() => { loadRawData(); }, []);

  const calculatePayroll = async () => {
    setLoading(true);
    setStep("preview");
    const holsRes = await supabase.from("company_holidays").select("date");
    const hSet = new Set<string>();
    (holsRes.data ?? []).forEach(h => hSet.add(h.date));

    const targetWorkingDays = getWorkingDaysInMonth(year, month - 1, hSet); // month is 1-indexed in form, date constructor takes 0-indexed month

    // Fetch leaves & adjustments
    // We need boundaries, 1st to last day
    const mStartDate = new Date(year, month - 1, 1).toISOString().split("T")[0];
    const mEndDate = new Date(year, month, 0).toISOString().split("T")[0];

    const [leavesRes, adjsRes] = await Promise.all([
      supabase.from("leave_requests").select("*").eq("type", "Leave Without Pay (LWP)").eq("status", "approved").gte("start_date", mStartDate).lte("end_date", mEndDate),
      supabase.from("deficit_adjustments").select("*").eq("adjusted_against", "LWP").gte("adjustment_date", mStartDate).lte("adjustment_date", mEndDate)
    ]);

    const leaves = leavesRes.data ?? [];
    const adjs = adjsRes.data ?? [];

    const computedRows = employees.map(emp => {
       const userLeaves = leaves.filter(l => l.user_id === emp.id);
       const userAdjs = adjs.filter(a => a.user_id === emp.id);

       let lwpDays = 0;
       userLeaves.forEach(l => {
          let curr = new Date(l.start_date);
          const eD = new Date(l.end_date);
          while (curr <= eD) {
             if (isWorkingDay(curr, hSet)) lwpDays++;
             curr.setDate(curr.getDate() + 1);
          }
       });

       userAdjs.forEach(a => {
           // each clearance of 8.5 via LWP = 1 day
           lwpDays += (a.hours_cleared / 8.5); 
       });

       const baseRemuneration = emp.remuneration || 0;
       const dailyRate = targetWorkingDays > 0 ? (baseRemuneration / targetWorkingDays) : 0;
       const deductions = lwpDays * dailyRate;
       const finalPayout = Math.max(0, baseRemuneration - deductions);

       return {
         ...emp,
         baseRemuneration,
         dailyRate,
         lwpDays,
         deductions,
         finalPayout
       };
    });

    setPayrollRows(computedRows);
    setLoading(false);
  };

  const commitPayroll = async () => {
     if (!confirm("Are you sure you want to commit this? This will lock the payslips for this month for all selected employees.")) return;
     setProcessing(true);
     
     const inserts = payrollRows.map(r => ({
        user_id: r.id,
        year: year,
        month: month,
        base_remuneration: r.baseRemuneration,
        daily_rate: r.dailyRate,
        total_lwp_days: r.lwpDays,
        deductions_amount: r.deductions,
        final_payout: r.finalPayout,
        status: 'Processed'
     }));

     await supabase.from("payroll_records").upsert(inserts, { onConflict: "user_id, year, month" });
     setSuccessMsg("✅ Payroll committed to Ledgers successfully!");
     setTimeout(() => setSuccessMsg(""), 5000);
     setStep("select");
     setProcessing(false);
  };

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>Automated Payroll Engine</h1>
        <p>System auto-calculates salary payouts subtracting formal LWPs and Deficit adjustments.</p>
      </div>

      {step === "select" && (
        <div className="glass-panel" style={{ padding: 40, maxWidth: 500, margin: "0 auto", textAlign: "center" }}>
           <div style={{ fontSize: "3rem", marginBottom: 16 }}>💸</div>
           <h2 style={{ marginBottom: 24, fontSize: "1.4rem" }}>Run Monthly Payroll</h2>
           
           <div style={{ display: "flex", gap: 16, marginBottom: 24, justifyContent: "center" }}>
             <div className={styles.formGroup} style={{ marginBottom: 0, textAlign: "left" }}>
               <label>Month</label>
               <select className="premium-input" value={month} onChange={e => setMonth(Number(e.target.value))}>
                 {[...Array(12)].map((_, i) => (<option key={i} value={i + 1}>{new Date(2000, i).toLocaleString('en', { month: 'long' })}</option>))}
               </select>
             </div>
             <div className={styles.formGroup} style={{ marginBottom: 0, textAlign: "left" }}>
               <label>Year</label>
               <input type="number" className="premium-input" value={year} onChange={e => setYear(Number(e.target.value))} />
             </div>
           </div>

           <button onClick={calculatePayroll} className={styles.primaryBtn} disabled={loading}>{loading ? "Running Math..." : "Calculate Payouts"}</button>
           {successMsg && <div style={{ marginTop: 24, padding: 12, borderRadius: 8, background: "rgba(16,185,129,0.1)", color: "var(--success)" }}>{successMsg}</div>}
        </div>
      )}

      {step === "preview" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
             <button onClick={() => setStep("select")} className={styles.secondaryBtn} style={{ width: "auto" }}>← Back</button>
             <h2 style={{ fontSize: "1.2rem", margin: 0 }}>Reviewing: {new Date(year, month - 1).toLocaleString('en', { month: 'long' })} {year}</h2>
             <button onClick={commitPayroll} className={styles.primaryBtn} style={{ background: "linear-gradient(90deg, #10b981, #059669)", width: "auto", padding: "12px 24px" }} disabled={processing}>
               {processing ? "Committing..." : "✅ Lock & Commit Payroll"}
             </button>
          </div>

          <div className={`glass-panel ${styles.tableWrap}`}>
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Base Pay</th>
                  <th>Daily Rate</th>
                  <th>LWP Days</th>
                  <th>Deductions</th>
                  <th style={{ color: "var(--success)" }}>Final Payout</th>
                </tr>
              </thead>
              <tbody>
                {payrollRows.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: "center" }}>No active employees found to process.</td></tr>
                ) : payrollRows.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.full_name}</td>
                    <td>₹{r.baseRemuneration.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style={{ color: "var(--text-secondary)" }}>₹{r.dailyRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style={{ fontWeight: r.lwpDays > 0 ? 700 : 400, color: r.lwpDays > 0 ? "var(--danger)" : "inherit" }}>{r.lwpDays.toFixed(2)}</td>
                    <td style={{ color: "var(--danger)" }}>-₹{r.deductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--success)" }}>₹{r.finalPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

    </div>
  );
}
