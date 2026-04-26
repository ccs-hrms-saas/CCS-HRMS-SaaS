"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import styles from "../../dashboard.module.css";
import {
  getWorkingDaysInMonth,
  isWorkingDay,
  buildWorkSchedule,
  fetchEmployeeHolidays,
} from "@/lib/dateUtils";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PayrollRow {
  id: string;
  full_name: string;
  remuneration: number;
  joining_date: string | null;
  hours_per_day: number | null;
  weekly_off_day: number | null;
  // Calculated
  targetDays: number;
  effectiveStart: string;
  daysPresent: number;
  paidLeaveDays: number;
  lwpDays: number;
  graceDaysUsed: number;
  remainingWorkingDays: number;
  dailyRate: number;
  deductions: number;
  overtimeHours: number;
  overtimePayout: number;
  finalPayout: number;
  projectedPayout: number;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminPayroll() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [payrollRows, setPayrollRows] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [appSettings, setAppSettings] = useState<any>(null);

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [step, setStep] = useState<"select" | "preview">("select");
  const [processing, setProcessing] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // Load employees + app settings on mount
  const loadRawData = async () => {
    if (!profile?.company_id) return;
    const [empRes, settRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, remuneration, joining_date, hours_per_day, weekly_off_day, role")
        .eq("is_active", true)
        .eq("company_id", profile.company_id)
        .not("role", "eq", "superadmin")
        .is("system_role", null),
      supabase
        .from("app_settings")
        .select("*")
        .eq("company_id", profile.company_id)
        .single(),
    ]);
    setEmployees(empRes.data ?? []);
    setAppSettings(settRes.data);
  };

  useEffect(() => { loadRawData(); }, [profile]);

  // ─── Core calculation engine ────────────────────────────────────────────────
  const calculatePayroll = async () => {
    setLoading(true);
    setStep("preview");

    // ── Fetch ALL payroll data via service-role API (bypasses RLS) ──────────
    // REASON: The RESTRICTIVE tenant isolation policy blocks attendance records
    // with company_id=NULL from client-side queries — even for admins. Manual
    // overrides historically lacked company_id. The server-side API queries by
    // user_id membership (not company_id), finding every valid record.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    const res = await fetch(
      `/api/admin/payroll-data?year=${year}&month=${month}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } }
    );
    if (!res.ok) { setLoading(false); return; }
    const raw = await res.json();

    // Re-use appSettings from API response (more up-to-date than cached state)
    const settingsFromApi = raw.appSettings ?? appSettings;
    const mode            = settingsFromApi?.lwp_deduction_mode ?? "attendance_based";
    const prorateJoiners  = settingsFromApi?.payroll_prorate_mid_joiners ?? true;
    const graceDays       = settingsFromApi?.attendance_grace_days ?? 0;
    const orgHoursPerDay  = settingsFromApi?.hours_per_day ?? 8.5;

    const mStart    = new Date(year, month - 1, 1);
    const mEnd      = new Date(year, month, 0);
    const mStartStr = `${year}-${String(month).padStart(2,"0")}-01`;
    const mEndStr   = `${year}-${String(month).padStart(2,"0")}-${String(new Date(year,month,0).getDate()).padStart(2,"0")}`;
    const today     = new Date();
    today.setHours(0, 0, 0, 0);

    // Reconstruct the shape the rest of the engine expects
    const attnRes      = { data: raw.attendance };
    const leavesRes    = { data: raw.leaves };
    const leaveTypesRes= { data: raw.leaveTypes };
    const adjsRes      = { data: raw.adjustments };
    const otRes        = { data: raw.overtimeRecords };
    // Override employees with what the API returned (already filtered correctly)
    const apiEmployees: any[] = raw.employees ?? employees;

    // ── Build holiday sets from API response (already fetched server-side) ──
    const rawHols = raw.holidays ?? [];

    const globalHolDates = rawHols.filter((h: any) => h.scope !== "group").map((h: any) => h.date as string);
    const globalHolidays = new Set<string>(globalHolDates);

    const hasGroupHols = rawHols.some((h: any) => h.scope === "group");

    // Pre-build per-employee holiday sets (only if group-scoped holidays exist)
    const empHolidayMap = new Map<string, Set<string>>();
    if (hasGroupHols) {
      await Promise.all(
        apiEmployees.map(async (emp: any) => {
          const hols = await fetchEmployeeHolidays(supabase, profile!.company_id!, emp.id);
          empHolidayMap.set(emp.id, hols);
        })
      );
    }

    const getEmpHolidays = (empId: string): Set<string> =>
      hasGroupHols ? (empHolidayMap.get(empId) ?? globalHolidays) : globalHolidays;

    const attendance = attnRes.data ?? [];
    const allLeaves  = leavesRes.data ?? [];
    const leaveTypes = leaveTypesRes.data ?? [];
    const adjs       = adjsRes.data ?? [];

    // Overtime settings from API response
    const otEnabled   = !!(settingsFromApi?.overtime_tracking);
    const otRateType  = settingsFromApi?.overtime_rate_type  ?? "flat";
    const otRateValue = Number(settingsFromApi?.overtime_rate_value ?? 0);
    const otCapHrs    = Number(settingsFromApi?.overtime_monthly_cap_hrs ?? 0);

    const otHoursMap = new Map<string, number>();
    if (otEnabled) {
      (otRes.data ?? []).forEach((r: any) => {
        otHoursMap.set(r.user_id, (otHoursMap.get(r.user_id) ?? 0) + Number(r.overtime_hours ?? 0));
      });
    }

    // Build set of unpaid leave type names (LWP + any custom unpaid)
    const unpaidLeaveNames = new Set<string>(
      leaveTypes.filter((lt: any) => !lt.is_paid).map((lt: any) => lt.name as string)
    );
    unpaidLeaveNames.add("Leave Without Pay (LWP)"); // always unpaid

    // ── Per-employee attendance lookup ──────────────────────────────────────
    // Map: userId → Set<dateStr> (days with check_in)
    const punchMap = new Map<string, Set<string>>();
    attendance.forEach((r: any) => {
      if (!r.check_in) return;
      if (!punchMap.has(r.user_id)) punchMap.set(r.user_id, new Set());
      punchMap.get(r.user_id)!.add(r.date);
    });

    // ── Per-employee approved PAID leave lookup ─────────────────────────────
    // Map: userId → Set<dateStr> (working days covered by approved paid leave)
    const paidLeaveMap = new Map<string, Set<string>>();
    allLeaves
      .filter((l: any) => !unpaidLeaveNames.has(l.type))
      .forEach((l: any) => {
        if (!paidLeaveMap.has(l.user_id)) paidLeaveMap.set(l.user_id, new Set());
        const set = paidLeaveMap.get(l.user_id)!;
        // Parse dates as local (not UTC) by appending T00:00:00 to avoid IST→UTC shift
        const leaveStart = new Date(l.start_date + "T00:00:00");
        const leaveEnd   = new Date(l.end_date   + "T00:00:00");
        // Clamp to payroll month bounds so cross-month leaves don't over-count
        const cursor = new Date(Math.max(leaveStart.getTime(), mStart.getTime()));
        const end    = new Date(Math.min(leaveEnd.getTime(),   mEnd.getTime()));
        while (cursor <= end) {
          set.add(toDateStr(cursor));  // ← must use toDateStr, NOT toISOString
          cursor.setDate(cursor.getDate() + 1);
        }
      });

    // ── Formal-LWP mode: adjustments map ───────────────────────────────────
    const adjMap = new Map<string, number>();
    adjs.forEach((a: any) => {
      adjMap.set(a.user_id, (adjMap.get(a.user_id) ?? 0) + (a.hours_cleared ?? 0));
    });
    // For formal LWP: also expand only within the payroll month
    const formalLwpLeaves = allLeaves.filter((l: any) => unpaidLeaveNames.has(l.type));

    // Use settingsFromApi for schedule (comes from server-side API)
    const orgSchedule = buildWorkSchedule(settingsFromApi);

    // ── Helper: build YYYY-MM-DD without timezone shift ─────────────────────
    // toISOString() converts to UTC which shifts dates by -5:30 in IST browsers.
    // Instead, construct the date string directly from local date components.
    const toDateStr = (d: Date): string =>
      `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

    // ── Calculate for each employee ─────────────────────────────────────────
    const computed: PayrollRow[] = apiEmployees.map((emp) => {
      const remuneration = emp.remuneration ?? 0;
      const empSchedule = buildWorkSchedule(settingsFromApi, emp);

      // Effective start date (pro-rate mid-month joiners)
      let effectiveStart = new Date(mStart);
      if (prorateJoiners && emp.joining_date) {
        const jDate = new Date(emp.joining_date);
        jDate.setHours(0, 0, 0, 0);
        if (jDate > effectiveStart) effectiveStart = jDate;
      }

      // Count target working days: effectiveStart → monthEnd
      let targetDays = 0;
      const empHols = getEmpHolidays(emp.id);
      {
        const c = new Date(effectiveStart);
        while (c <= mEnd) {
          if (isWorkingDay(c, empHols, empSchedule)) targetDays++;
          c.setDate(c.getDate() + 1);
        }
      }

      if (targetDays === 0 || remuneration === 0) {
        return {
          ...emp, targetDays: 0, effectiveStart: toDateStr(effectiveStart),
          daysPresent: 0, paidLeaveDays: 0, lwpDays: 0, graceDaysUsed: 0,
          remainingWorkingDays: 0, dailyRate: 0, deductions: 0, finalPayout: 0, projectedPayout: 0,
          overtimeHours: 0, overtimePayout: 0,
        };
      }

      const dailyRate = remuneration / targetDays;

      // ── ATTENDANCE-BASED mode ────────────────────────────────────────────
      if (mode === "attendance_based") {
        const punches = punchMap.get(emp.id) ?? new Set<string>();
        const paidLeaves = paidLeaveMap.get(emp.id) ?? new Set<string>();

        let daysPresent = 0;
        let paidLeaveDays = 0;
        let lwpRaw = 0;
        let remainingWorkingDays = 0;
        const lastDateToCount = today < mEnd ? today : mEnd;

        const c = new Date(effectiveStart);
        while (c <= mEnd) {
          if (isWorkingDay(c, empHols, empSchedule)) {
            const ds = toDateStr(c);  // ← local date string, no UTC shift
            if (c <= lastDateToCount) {
              if (punches.has(ds)) {
                daysPresent++;
              } else if (paidLeaves.has(ds)) {
                paidLeaveDays++;
                daysPresent++;
              } else {
                lwpRaw++;
              }
            } else {
              remainingWorkingDays++;
            }
          }
          c.setDate(c.getDate() + 1);
        }

        const graceDaysUsed = Math.min(lwpRaw, graceDays);
        const effectiveLwpDays = Math.max(0, lwpRaw - graceDaysUsed);
        const deductions = effectiveLwpDays * dailyRate;

        // Overtime payout
        const rawOtHours = otHoursMap.get(emp.id) ?? 0;
        const cappedOtHours = otCapHrs > 0 ? Math.min(rawOtHours, otCapHrs) : rawOtHours;
        let overtimePayout = 0;
        if (otEnabled && otRateValue > 0 && cappedOtHours > 0) {
          if (otRateType === "flat") {
            overtimePayout = cappedOtHours * otRateValue;
          } else {
            // multiplier: hourly rate = dailyRate / hours_per_day
            const hoursPerDay = Number(emp.hours_per_day ?? settingsFromApi?.hours_per_day ?? 8.5);
            const hourlyRate = dailyRate / hoursPerDay;
            overtimePayout = cappedOtHours * hourlyRate * otRateValue;
          }
          overtimePayout = Math.round(overtimePayout * 100) / 100;
        }

        const finalPayout = Math.max(0, remuneration - deductions) + overtimePayout;
        const projectedPayout = Math.min(remuneration, Math.max(0, remuneration - deductions) + remainingWorkingDays * dailyRate) + overtimePayout;

        return {
          ...emp, targetDays, effectiveStart: toDateStr(effectiveStart),
          daysPresent: daysPresent - paidLeaveDays, paidLeaveDays, lwpDays: effectiveLwpDays,
          graceDaysUsed, remainingWorkingDays, dailyRate, deductions,
          overtimeHours: cappedOtHours, overtimePayout,
          finalPayout, projectedPayout,
        };
      }

      // ── FORMAL LWP-ONLY mode (legacy) ────────────────────────────────────
      {
        const userFormalLeaves = formalLwpLeaves.filter((l: any) => l.user_id === emp.id);
        let lwpDays = 0;
        userFormalLeaves.forEach((l: any) => {
          // Clamp to payroll month so cross-month leaves don't double-count
          const c = new Date(Math.max(new Date(l.start_date).getTime(), mStart.getTime()));
          const e = new Date(Math.min(new Date(l.end_date).getTime(),   mEnd.getTime()));
          while (c <= e) {
            if (isWorkingDay(c, empHols, empSchedule)) lwpDays++;
            c.setDate(c.getDate() + 1);
          }
        });
      // ── Overtime for formal LWP mode ─────────────────────────────────────
      const rawOtHrsFormal = otHoursMap.get(emp.id) ?? 0;
      const cappedOtFormal = otCapHrs > 0 ? Math.min(rawOtHrsFormal, otCapHrs) : rawOtHrsFormal;
      let overtimePayoutFormal = 0;
      if (otEnabled && otRateValue > 0 && cappedOtFormal > 0) {
        if (otRateType === "flat") {
          overtimePayoutFormal = cappedOtFormal * otRateValue;
        } else {
          const hoursPerDay = Number(emp.hours_per_day ?? settingsFromApi?.hours_per_day ?? 8.5);
          overtimePayoutFormal = cappedOtFormal * (dailyRate / hoursPerDay) * otRateValue;
        }
        overtimePayoutFormal = Math.round(overtimePayoutFormal * 100) / 100;
      }

      const adjHours = adjMap.get(emp.id) ?? 0;
        lwpDays += adjHours / (emp.hours_per_day ?? orgHoursPerDay ?? 8.5);

        const deductions = lwpDays * dailyRate;
        const finalPayout = Math.max(0, remuneration - deductions) + overtimePayoutFormal;
        return {
          ...emp, targetDays, effectiveStart: toDateStr(effectiveStart),
          daysPresent: 0, paidLeaveDays: 0, lwpDays, graceDaysUsed: 0,
          remainingWorkingDays: 0, dailyRate, deductions,
          overtimeHours: cappedOtFormal, overtimePayout: overtimePayoutFormal,
          finalPayout, projectedPayout: finalPayout,
        };
      }
    });

    setPayrollRows(computed);
    setLoading(false);
  };

  // ─── Commit to ledger ───────────────────────────────────────────────────────
  const commitPayroll = async () => {
    if (!confirm("Lock and commit payroll? Employees will see their payslips after the 20th.")) return;
    setProcessing(true);

    const inserts = payrollRows.map((r) => ({
      user_id: r.id,
      company_id: profile!.company_id,
      year,
      month,
      base_remuneration:    r.remuneration,
      daily_rate:           r.dailyRate,
      total_lwp_days:       r.lwpDays,
      deductions_amount:    r.deductions,
      total_overtime_hours: r.overtimeHours,
      overtime_rate_type:   appSettings?.overtime_rate_type  ?? "flat",
      overtime_rate_value:  Number(appSettings?.overtime_rate_value ?? 0),
      overtime_payout:      r.overtimePayout,
      final_payout:         r.finalPayout,
      projected_payout:     r.projectedPayout,
      status:               "Processed",
    }));

    await supabase
      .from("payroll_records")
      .upsert(inserts, { onConflict: "user_id, year, month" });

    setSuccessMsg("✅ Payroll committed to ledgers!");
    setTimeout(() => setSuccessMsg(""), 5000);
    setStep("select");
    setProcessing(false);
  };

  const mode = appSettings?.lwp_deduction_mode ?? "attendance_based";
  const isAttendanceBased = mode === "attendance_based";

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>Automated Payroll Engine</h1>
        <p>
          {isAttendanceBased
            ? "Calculates payouts from actual attendance records + approved paid leaves."
            : "Calculates payouts from formally filed LWP leave requests."}
          {" "}
          <span style={{ color: "var(--accent-primary)", fontWeight: 600 }}>
            Mode: {isAttendanceBased ? "Attendance-Based" : "Formal LWP Only"}
          </span>
        </p>
      </div>

      {step === "select" && (
        <div className="glass-panel" style={{ padding: 40, maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: 16 }}>💸</div>
          <h2 style={{ marginBottom: 24, fontSize: "1.4rem" }}>Run Monthly Payroll</h2>

          <div style={{ display: "flex", gap: 16, marginBottom: 24, justifyContent: "center" }}>
            <div className={styles.formGroup} style={{ marginBottom: 0, textAlign: "left" }}>
              <label>Month</label>
              <select className="premium-input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {[...Array(12)].map((_, i) => (
                  <option key={i} value={i + 1}>{new Date(2000, i).toLocaleString("en", { month: "long" })}</option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup} style={{ marginBottom: 0, textAlign: "left" }}>
              <label>Year</label>
              <input type="number" className="premium-input" value={year} onChange={(e) => setYear(Number(e.target.value))} />
            </div>
          </div>

          {/* Settings summary */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 24 }}>
            {[
              { label: "Mode", val: isAttendanceBased ? "Attendance-Based" : "Formal LWP" },
              { label: "Pro-rate Joiners", val: appSettings?.payroll_prorate_mid_joiners ? "Yes" : "No" },
              { label: "Grace Days", val: `${appSettings?.attendance_grace_days ?? 0}d` },
            ].map(({ label, val }) => (
              <div key={label} style={{ padding: "4px 12px", borderRadius: 20, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)", fontSize: "0.78rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>{label}: </span>
                <span style={{ fontWeight: 600, color: "var(--accent-primary)" }}>{val}</span>
              </div>
            ))}
          </div>

          <button onClick={calculatePayroll} className={styles.primaryBtn} disabled={loading}>
            {loading ? "Running Calculations…" : "Calculate Payouts"}
          </button>
          {successMsg && (
            <div style={{ marginTop: 24, padding: 12, borderRadius: 8, background: "rgba(16,185,129,0.1)", color: "var(--success)" }}>
              {successMsg}
            </div>
          )}
        </div>
      )}

      {step === "preview" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
            <button onClick={() => setStep("select")} className={styles.secondaryBtn} style={{ width: "auto" }}>← Back</button>
            <h2 style={{ fontSize: "1.2rem", margin: 0 }}>
              {new Date(year, month - 1).toLocaleString("en", { month: "long" })} {year} — Payroll Preview
            </h2>
            <button
              onClick={commitPayroll}
              className={styles.primaryBtn}
              style={{ background: "linear-gradient(90deg,#10b981,#059669)", width: "auto", padding: "12px 24px" }}
              disabled={processing}
            >
              {processing ? "Committing…" : "✅ Lock & Commit Payroll"}
            </button>
          </div>

          <div className={`glass-panel ${styles.tableWrap}`} style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Base Pay</th>
                  <th>Daily Rate</th>
                  <th>Target Days</th>
                  {isAttendanceBased && <th>Present</th>}
                  {isAttendanceBased && <th>Paid Leave</th>}
                  <th style={{ color: "var(--danger)" }}>LWP Days</th>
                  <th style={{ color: "var(--danger)" }}>Deductions</th>
                  <th style={{ color: "var(--success)" }}>Actual Payout</th>
                  {isAttendanceBased && <th style={{ color: "#a78bfa" }}>Projected</th>}
                </tr>
              </thead>
              <tbody>
                {payrollRows.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: "center" }}>No active employees found.</td></tr>
                ) : payrollRows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>
                      {r.full_name}
                      {r.effectiveStart && r.effectiveStart > new Date(year, month - 1, 1).toISOString().split("T")[0] && (
                        <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: 400 }}>
                          Joined {new Date(r.effectiveStart).toLocaleDateString("en-IN")}
                        </div>
                      )}
                    </td>
                    <td>₹{(r.remuneration ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td style={{ color: "var(--text-secondary)" }}>
                      ₹{r.dailyRate.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: "center" }}>{r.targetDays}</td>
                    {isAttendanceBased && (
                      <td style={{ textAlign: "center", color: "var(--success)" }}>{r.daysPresent}</td>
                    )}
                    {isAttendanceBased && (
                      <td style={{ textAlign: "center", color: "#a78bfa" }}>{r.paidLeaveDays}</td>
                    )}
                    <td style={{ textAlign: "center", fontWeight: r.lwpDays > 0 ? 700 : 400, color: r.lwpDays > 0 ? "var(--danger)" : "inherit" }}>
                      {r.lwpDays.toFixed(1)}
                      {r.graceDaysUsed > 0 && (
                        <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", fontWeight: 400 }}>
                          {r.graceDaysUsed}d waived
                        </div>
                      )}
                    </td>
                    <td style={{ color: "var(--danger)" }}>
                      -₹{r.deductions.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    {appSettings?.overtime_tracking && (
                      <td style={{ textAlign: "center", color: r.overtimePayout > 0 ? "#f59e0b" : "var(--text-secondary)", fontWeight: r.overtimePayout > 0 ? 700 : 400 }}>
                        {r.overtimeHours > 0 ? (
                          <>
                            <div>{r.overtimeHours.toFixed(1)}h</div>
                            <div style={{ fontSize: "0.75rem" }}>+₹{r.overtimePayout.toLocaleString("en-IN", { minimumFractionDigits: 0 })}</div>
                          </>
                        ) : "—"}
                      </td>
                    )}
                    <td style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--success)" }}>
                      ₹{r.finalPayout.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    {isAttendanceBased && (
                      <td style={{ color: "#a78bfa", fontWeight: 600 }}>
                        ₹{r.projectedPayout.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        {r.remainingWorkingDays > 0 && (
                          <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", fontWeight: 400 }}>
                            +{r.remainingWorkingDays}d remaining
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isAttendanceBased && (
            <div style={{ marginTop: 16, display: "flex", gap: 24, fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              <span>🟢 <strong>Present</strong> = Punched attendance</span>
              <span>🟣 <strong>Paid Leave</strong> = Approved non-LWP leave</span>
              <span>🔴 <strong>LWP</strong> = No punch &amp; no approved leave</span>
              <span>💜 <strong>Projected</strong> = If all remaining days are attended</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
