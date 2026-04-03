"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import styles from "../../dashboard.module.css";

export default function EmployeePayslips() {
  const { profile } = useAuth();
  const [locked, setLocked] = useState(true);
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setVerifying(true); setError("");

    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: (profile as any).email,
      password: password
    });

    if (authErr) {
      setError("Incorrect password.");
      setVerifying(false);
      return;
    }

    setLocked(false);
    setLoading(true);
    
    // Fetch payslips
    const { data } = await supabase.from("payroll_records").select("*").eq("user_id", profile.id).order("year", { ascending: false }).order("month", { ascending: false });
    setRecords(data ?? []);
    setLoading(false);
  };

  if (locked) {
    return (
      <div className="animate-fade-in" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <div className="glass-panel" style={{ padding: 40, width: "100%", maxWidth: 400, textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: 16 }}>🔒</div>
          <h2 style={{ marginBottom: 8 }}>Secure Payroll Vault</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: 24, fontSize: "0.9rem" }}>Enter your login password to unlock and view your monthly salary calculations and deductions.</p>
          
          {error && <div style={{ color: "var(--danger)", marginBottom: 16, fontSize: "0.85rem" }}>{error}</div>}
          
          <form onSubmit={unlock} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <input type="password" placeholder="Password" className="premium-input" value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="submit" className={styles.primaryBtn} disabled={verifying}>{verifying ? "Unlocking..." : "Unlock Vault"}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>My Payslips</h1>
          <p>Automated salary calculations based on your Remuneration and LWP adjustments.</p>
        </div>
        <button onClick={() => { setLocked(true); setPassword(""); }} className={styles.secondaryBtn} style={{ padding: "8px 16px", background: "rgba(239,68,68,0.1)", color: "var(--danger)", border: "none" }}>🔒 Lock Vault</button>
      </div>

      {loading ? (
        <div className={styles.loadingScreen}><div className={styles.spinner}></div></div>
      ) : (
        <div style={{ display: "grid", gap: 24 }}>
          {records.length === 0 ? (
            <div className="glass-panel" style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
              No payroll records found. Your first payslip will be generated after the end of your first month.
            </div>
          ) : records.map(r => (
            <div key={r.id} className="glass-panel" style={{ padding: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
               <div>
                  <h3 style={{ fontSize: "1.2rem", marginBottom: 4 }}>{months[r.month - 1]} {r.year}</h3>
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Base Remuneration: ₹{r.base_remuneration.toLocaleString()}</div>
               </div>
               
               <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
                 <div style={{ textAlign: "right" }}>
                   <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 1 }}>Deductions</div>
                   <div style={{ color: r.total_lwp_days > 0 ? "var(--danger)" : "var(--text-secondary)", fontWeight: 600 }}>
                     {r.total_lwp_days} LWP (-₹{r.deductions_amount.toLocaleString()})
                   </div>
                 </div>
                 
                 <div style={{ width: 1, height: 40, background: "var(--glass-border)" }}></div>
                 
                 <div style={{ textAlign: "right" }}>
                   <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 1 }}>Final Payout</div>
                   <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--success)" }}>₹{r.final_payout.toLocaleString()}</div>
                 </div>
               </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
