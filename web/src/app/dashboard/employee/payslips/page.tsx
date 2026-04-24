"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import styles from "../../dashboard.module.css";

// System go-live date — no salary history before this
const SYSTEM_START = "2026-04-01";

interface MonthSlip {
  label: string;      // "April 2026"
  key: string;        // "2026-04"
  workingDays: number;
  workingHrs: number;
  clocked: number;
  leaveDetail: string;  // "1d CL"
  lwpDays: number;
  nonLwpAdj: number;
  waived: number;
  salary: number;
  deduction: number;
  paid: number;
  isCurrent: boolean;
  isPreviousMonth: boolean;  // true during 1st–5th (salary processing window)
  netDeficit: number;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export default function EmployeePayslips() {
  const { profile }           = useAuth();
  const [locked, setLocked]   = useState(true);
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [authError, setAuthError] = useState("");
  const [visibleAfterDay, setVisibleAfterDay] = useState<number>(20); // from platform setting
  const [dateGateChecked, setDateGateChecked] = useState(false);

  const [slips, setSlips]     = useState<MonthSlip[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch the payroll_visible_after_day setting
  useEffect(() => {
    if (!profile?.company_id) return;
    supabase
      .from("app_settings")
      .select("payroll_visible_after_day")
      .eq("company_id", profile.company_id)
      .single()
      .then(({ data }) => {
        setVisibleAfterDay(data?.payroll_visible_after_day ?? 20);
        setDateGateChecked(true);
      });
  }, [profile]);

  // ── Unlock & load ─────────────────────────────────────────────────────────
  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setVerifying(true); setAuthError("");

    const { error: authErr } = await supabase.auth.signInWithPassword({
      email:    (profile as any).email,
      password,
    });

    if (authErr) {
      setAuthError("Incorrect password. Please try again.");
      setVerifying(false);
      return;
    }

    setLocked(false);
    setLoading(true);
    await computeSlips();
    setLoading(false);
  };

  const computeSlips = async () => {
    if (!profile) return;
    const { isWorkingDay } = await import("@/lib/dateUtils");

    const [attnRes, leavesRes, holsRes, adjRes, waiversRes] = await Promise.all([
      supabase.from("attendance_records").select("date,check_in,check_out")
        .eq("user_id", profile.id).gte("date", SYSTEM_START),
      supabase.from("leave_requests").select("start_date,end_date,type,status")
        .eq("user_id", profile.id).eq("status", "approved").gte("end_date", SYSTEM_START),
      supabase.from("company_holidays").select("date"),
      supabase.from("deficit_adjustments").select("adjustment_date,hours_cleared,adjusted_against")
        .eq("user_id", profile.id),
      supabase.from("deficit_waivers").select("month,hours_waived")
        .eq("user_id", profile.id),
    ]);

    const hols         = new Set<string>((holsRes.data ?? []).map((h: any) => h.date));
    const attnRecords  = attnRes.data ?? [];
    const allAdj       = adjRes.data ?? [];
    const allWaivers   = waiversRes.data ?? [];
    const salary       = Number((profile as any).remuneration ?? 0);

    // Build leave date → type map
    const leaveDateType = new Map<string, string>();
    (leavesRes.data ?? []).forEach((l: any) => {
      let d = new Date(l.start_date);
      const end = new Date(l.end_date);
      while (d <= end) {
        leaveDateType.set(d.toISOString().split("T")[0], l.type ?? "Leave");
        d.setDate(d.getDate() + 1);
      }
    });

    const today    = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const dayOfMonth = today.getDate();
    const isSalaryWindow = dayOfMonth >= 1 && dayOfMonth <= 5;

    const result: MonthSlip[] = [];
    let y = 2026, m = 3; // April 2026 = month index 3

    while (y < today.getFullYear() || (y === today.getFullYear() && m <= today.getMonth())) {
      const key       = `${y}-${String(m + 1).padStart(2, "0")}`;
      const mFrom     = `${key}-01`;
      const lastDay   = new Date(y, m + 1, 0);
      const mTo       = lastDay.toISOString().split("T")[0];
      const isCurrent = y === today.getFullYear() && m === today.getMonth();
      const isPrevMonth = isSalaryWindow && y === (today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()) && m === (today.getMonth() === 0 ? 11 : today.getMonth() - 1);

      // Full month working days / hrs
      let workingDays = 0;
      for (let d = new Date(mFrom); d <= lastDay; d.setDate(d.getDate() + 1)) {
        if (isWorkingDay(d, hols)) workingDays++;
      }
      const workingHrs = Math.round(workingDays * 8.5 * 10) / 10;

      // Leave details
      const leaveTypeCounts = new Map<string, number>();
      let leaveHrs = 0;
      for (let d = new Date(mFrom); d <= lastDay; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().split("T")[0];
        if (isWorkingDay(d, hols) && leaveDateType.has(ds)) {
          const lt = leaveDateType.get(ds)!;
          leaveTypeCounts.set(lt, (leaveTypeCounts.get(lt) ?? 0) + 1);
          leaveHrs += 8.5;
        }
      }
      const leaveDetail = leaveTypeCounts.size > 0
        ? Array.from(leaveTypeCounts.entries()).map(([t, cnt]) => `${cnt}d ${t}`).join(", ")
        : "";

      // Clocked (up to today for current month)
      const cutoff = isCurrent ? todayStr : mTo;
      let clocked = 0;
      attnRecords.filter((r: any) => r.date >= mFrom && r.date <= cutoff).forEach((r: any) => {
        if (r.check_in && r.check_out)
          clocked += (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 3600000;
      });
      clocked = Math.round(clocked * 10) / 10;

      // Adjustments
      const monthAdj  = allAdj.filter((a: any) => a.adjustment_date >= mFrom && a.adjustment_date <= mTo);
      const lwpHrs    = monthAdj.filter((a: any) => a.adjusted_against === "LWP").reduce((s: number, a: any) => s + Number(a.hours_cleared), 0);
      const nonLwpAdj = monthAdj.filter((a: any) => a.adjusted_against !== "LWP").reduce((s: number, a: any) => s + Number(a.hours_cleared), 0);
      const lwpDays   = lwpHrs / 8.5;

      // SA waiver
      const waived = allWaivers.filter((w: any) => w.month === key).reduce((s: number, w: any) => s + Number(w.hours_waived), 0);

      // Deficit
      const obligation = workingHrs - leaveHrs;
      const netDeficit = Math.max(0, Math.round((obligation - clocked - lwpHrs - nonLwpAdj - waived) * 10) / 10);

      // Pay calculation
      const perDayRate = salary > 0 && workingDays > 0 ? salary / workingDays : 0;
      const deduction  = Math.round(lwpDays * perDayRate * 100) / 100;
      const paid       = Math.round((salary - deduction) * 100) / 100;

      result.push({ label: monthLabel(key), key, workingDays, workingHrs, clocked, leaveDetail, lwpDays, nonLwpAdj, waived, salary, deduction, paid, isCurrent, isPreviousMonth: isPrevMonth, netDeficit });
      m++; if (m > 11) { m = 0; y++; }
    }

    setSlips(result.reverse());
  };

  // ── Date gate — check before even showing the password lock ─────────────────
  const todayDate = new Date().getDate();
  const isDateGateBlocked = dateGateChecked && todayDate < visibleAfterDay;

  if (isDateGateBlocked) {
    const nextAvailable = new Date();
    nextAvailable.setDate(visibleAfterDay);
    return (
      <div className="animate-fade-in" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <div className="glass-panel" style={{ padding: 48, width: "100%", maxWidth: 440, textAlign: "center" }}>
          <div style={{ fontSize: "3.5rem", marginBottom: 16 }}>📅</div>
          <h2 style={{ marginBottom: 12 }}>Payslip Not Available Yet</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.6 }}>
            Your monthly payslip is available from the{" "}
            <strong style={{ color: "var(--accent-primary)" }}>{visibleAfterDay}th of each month</strong>{" "}
            onwards. This gives HR time to finalise your attendance and process salary.
          </p>
          <div style={{ marginTop: 24, padding: "12px 20px", borderRadius: 12, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Available from</div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--accent-primary)", marginTop: 4 }}>
              {nextAvailable.toLocaleDateString("en-IN", { day: "numeric", month: "long" })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Lock screen ───────────────────────────────────────────────────────────
  if (locked) {
    return (
      <div className="animate-fade-in" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <div className="glass-panel" style={{ padding: 40, width: "100%", maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: "3.5rem", marginBottom: 16 }}>🔒</div>
          <h2 style={{ marginBottom: 8 }}>Secure Payroll Vault</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: 8, fontSize: "0.9rem" }}>
            Your salary details are confidential. Enter your login password to access your monthly pay calculations.
          </p>
          <p style={{ color: "var(--text-secondary)", marginBottom: 24, fontSize: "0.8rem", opacity: 0.7 }}>
            Salary data is available from April 2026 onwards. Between the 1st–5th of each month, your previous month's<br />estimated pay is displayed for your review.
          </p>
          {authError && <div style={{ color: "var(--danger)", marginBottom: 16, fontSize: "0.85rem" }}>{authError}</div>}
          <form onSubmit={unlock} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input type="password" placeholder="Your login password" className="premium-input" value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
            <button type="submit" className={styles.primaryBtn} disabled={verifying}>
              {verifying ? "Verifying..." : "🔓 Unlock Vault"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Unlocked view ─────────────────────────────────────────────────────────
  const dayOfMonth = new Date().getDate();
  const isSalaryWindow = dayOfMonth >= 1 && dayOfMonth <= 5;
  const prevMonthSlip  = slips.find(s => s.isPreviousMonth);

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>My Payroll Vault 🔐</h1>
          <p>Your salary calculations from April 2026 · Data updates in real-time as attendance is recorded.</p>
        </div>
        <button onClick={() => { setLocked(true); setPassword(""); setSlips([]); }}
          style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "var(--danger)", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontWeight: 600, fontSize: "0.85rem" }}>
          🔒 Lock Vault
        </button>
      </div>

      {/* Salary window banner (1st–5th) */}
      {isSalaryWindow && prevMonthSlip && (
        <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 14, padding: 24, marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontSize: "0.8rem", color: "var(--accent-primary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>💸 {prevMonthSlip.label} — Salary Processing Window</div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Salary is being processed. Your payout will be credited by the 7th. If you have concerns, raise them before the 5th.</div>
            </div>
            <div style={{ display: "flex", gap: 32, textAlign: "right" }}>
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "uppercase" }}>Base Salary</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text-primary)" }}>₹{prevMonthSlip.salary.toLocaleString("en-IN")}</div>
              </div>
              {prevMonthSlip.deduction > 0 && (
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--danger)", textTransform: "uppercase" }}>LWP Deduction</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--danger)" }}>−₹{prevMonthSlip.deduction.toLocaleString("en-IN")}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--success)", textTransform: "uppercase" }}>Estimated Payout</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--success)" }}>₹{prevMonthSlip.paid.toLocaleString("en-IN")}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className={styles.loadingScreen}><div className={styles.spinner} /></div>
      ) : slips.length === 0 ? (
        <div className="glass-panel" style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
          No salary data available yet. Data is recorded from April 2026 onwards.
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: 24 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--glass-border)" }}>
                  {[
                    ["Month",        "left"],
                    ["Working Days", "center"],
                    ["Clocked",      "center"],
                    ["Leaves",       "center"],
                    ["LWP Days",     "center"],
                    ["SA Waiver",    "center"],
                    ["Deficit",      "center"],
                    ["Base Salary",  "right"],
                    ["Deduction",    "right"],
                    ["Paid",         "right"],
                  ].map(([h, a]) => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: a as any, color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.78rem", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slips.map(s => (
                  <tr key={s.key} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: s.isPreviousMonth ? "rgba(99,102,241,0.05)" : "transparent" }}>
                    <td style={{ padding: "11px 12px", fontWeight: 700 }}>
                      {s.label}
                      {s.isCurrent   && <span style={{ marginLeft: 6, fontSize: "0.68rem", color: "#f59e0b", background: "rgba(245,158,11,0.12)", padding: "1px 6px", borderRadius: 8 }}>ongoing</span>}
                      {s.isPreviousMonth && <span style={{ marginLeft: 6, fontSize: "0.68rem", color: "var(--accent-primary)", background: "rgba(99,102,241,0.12)", padding: "1px 6px", borderRadius: 8 }}>processing</span>}
                    </td>
                    <td style={{ padding: "11px 12px", textAlign: "center" }}>{s.workingDays}d</td>
                    <td style={{ padding: "11px 12px", textAlign: "center", color: s.clocked > 0 ? "var(--text-primary)" : "var(--text-secondary)" }}>
                      {s.clocked > 0 ? `${s.clocked}h` : "—"}
                    </td>
                    <td style={{ padding: "11px 12px", textAlign: "center", color: "#3b82f6" }}>{s.leaveDetail || "—"}</td>
                    <td style={{ padding: "11px 12px", textAlign: "center", fontWeight: s.lwpDays > 0 ? 700 : 400, color: s.lwpDays > 0 ? "var(--danger)" : "var(--text-secondary)" }}>
                      {s.lwpDays > 0 ? `${s.lwpDays}d` : "—"}
                    </td>
                    <td style={{ padding: "11px 12px", textAlign: "center", color: "#7c3aed", fontWeight: s.waived > 0 ? 700 : 400 }}>
                      {s.waived > 0 ? `${s.waived}h` : "—"}
                    </td>
                    <td style={{ padding: "11px 12px", textAlign: "center" }}>
                      {s.isCurrent
                        ? <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>in progress</span>
                        : s.netDeficit > 0
                        ? <span style={{ padding: "2px 8px", borderRadius: 10, background: "rgba(239,68,68,0.12)", color: "var(--danger)", fontWeight: 700 }}>{s.netDeficit}h</span>
                        : <span style={{ padding: "2px 8px", borderRadius: 10, background: "rgba(16,185,129,0.1)", color: "var(--success)", fontWeight: 700 }}>✓ Clear</span>}
                    </td>
                    <td style={{ padding: "11px 12px", textAlign: "right", color: "var(--text-secondary)" }}>
                      {s.salary > 0 ? `₹${s.salary.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td style={{ padding: "11px 12px", textAlign: "right", color: s.deduction > 0 ? "var(--danger)" : "var(--text-secondary)" }}>
                      {s.deduction > 0 ? `−₹${s.deduction.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td style={{ padding: "11px 12px", textAlign: "right", fontWeight: 700 }}>
                      {s.salary > 0
                        ? <span style={{ color: s.deduction > 0 ? "var(--danger)" : "var(--success)" }}>₹{s.paid.toLocaleString("en-IN")}</span>
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 16, padding: "10px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 8, fontSize: "0.78rem", color: "var(--text-secondary)" }}>
            ℹ️ <strong>Salary</strong> = your base remuneration. <strong>Deduction</strong> = LWP days × (salary ÷ working days in month). <strong>CL/EL/Comp-Off adjustments</strong> cover your deficit without deduction. <strong>If you spot an error, contact HR before the 5th.</strong>
          </div>
        </div>
      )}
    </div>
  );
}
