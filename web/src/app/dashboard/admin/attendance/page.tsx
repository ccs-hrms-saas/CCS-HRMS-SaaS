"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useModules } from "@/context/ModulesContext";
import styles from "../../dashboard.module.css";
import { isLateArrival, isEarlyDeparture, formatShiftTime, resolveHoursPerDay } from "@/lib/dateUtils";


interface LightboxState { url: string; label: string; name: string; }

type EmpStatus = "completed" | "in_office" | "on_leave" | "pending_leave" | "absent";

interface DayRow {
  userId: string;
  name: string;
  checkIn?: string;
  checkOut?: string;
  checkinPhoto?: string;
  checkoutPhoto?: string;
  status: EmpStatus;
  leaveType?: string;
  leaveStatus?: string;
  // Shift timing (Tier 3 per_employee_shift)
  shiftStart?: string | null;
  shiftEnd?: string | null;
  hoursPerDay?: number | null;
  isLate?: boolean;
  isEarlyOut?: boolean;
}

const STATUS_ORDER: Record<EmpStatus, number> = {
  in_office: 0, completed: 1, on_leave: 2, pending_leave: 3, absent: 4,
};

export default function AdminAttendance() {
  const { profile } = useAuth();
  const { getProps } = useModules();
  const leaveProps   = getProps("leave_settings");
  const showShift    = !!(leaveProps.per_employee_shift);

  const [rows, setRows]               = useState<DayRow[]>([]);
  const [employees, setEmployees]     = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date(); 
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  });
  const [selectedUser, setSelectedUser] = useState("");
  const [statusFilter, setStatusFilter] = useState<EmpStatus | "all">("all");
  const [loading, setLoading]         = useState(true);
  const [lightbox, setLightbox]       = useState<LightboxState | null>(null);
  const [orgHours, setOrgHours]       = useState<number | null>(null);

  useEffect(() => {
    const companyId = profile?.company_id;
    if (!companyId) return;
    // Fetch employees WITH shift timing fields
    supabase
      .from("profiles")
      .select("id, full_name, shift_start_time, shift_end_time, hours_per_day")
      .eq("company_id", companyId)
      .is("system_role", null)
      .eq("is_active", true)
      .order("full_name")
      .then(({ data }) => setEmployees(data ?? []));
    // Fetch org-level hours
    supabase
      .from("app_settings")
      .select("hours_per_day")
      .eq("company_id", companyId)
      .single()
      .then(({ data }) => setOrgHours(data?.hours_per_day ?? null));
  }, [profile]);

  useEffect(() => { load(); }, [selectedDate, selectedUser, employees]);

  const load = async () => {
    setLoading(true);

    // Use server-side API to bypass RLS — fetches for all company employees
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    const res = await fetch(
      `/api/admin/attendance-data?date=${selectedDate}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } }
    );
    const json = await res.json();

    // Update employees with shift data from API (keeps in sync)
    if (json.employees?.length) setEmployees(json.employees);

    const attMap: Record<string, any> = {};
    (json.attendance ?? []).forEach((r: any) => { attMap[r.user_id] = r; });

    const approvedLeaveMap: Record<string, string> = {};
    (json.leaveApproved ?? []).forEach((l: any) => { approvedLeaveMap[l.user_id] = l.type; });

    const pendingLeaveMap: Record<string, string> = {};
    (json.leavePending ?? []).forEach((l: any) => { pendingLeaveMap[l.user_id] = l.type; });

    const empList = selectedUser
      ? (json.employees ?? employees).filter((e: any) => e.id === selectedUser)
      : (json.employees ?? employees);

    const built: DayRow[] = empList.map((emp: any) => {
      const att = attMap[emp.id];

      let status: EmpStatus = "absent";
      let leaveType: string | undefined;
      let leaveStatus: string | undefined;

      if (att?.check_in && att?.check_out) { status = "completed"; }
      else if (att?.check_in)              { status = "in_office"; }
      else if (approvedLeaveMap[emp.id])   { status = "on_leave";       leaveType = approvedLeaveMap[emp.id]; leaveStatus = "approved"; }
      else if (pendingLeaveMap[emp.id])    { status = "pending_leave";  leaveType = pendingLeaveMap[emp.id];  leaveStatus = "pending"; }

      const empHPD = resolveHoursPerDay(emp.hours_per_day, orgHours);

      return {
        userId: emp.id, name: emp.full_name,
        checkIn: att?.check_in, checkOut: att?.check_out,
        checkinPhoto: att?.photo_url ?? undefined,
        checkoutPhoto: att?.checkout_photo_url ?? undefined,
        status, leaveType, leaveStatus,
        shiftStart: emp.shift_start_time,
        shiftEnd:   emp.shift_end_time,
        hoursPerDay: empHPD,
        isLate:     att?.check_in  ? isLateArrival(att.check_in, emp.shift_start_time, 0) : false,
        isEarlyOut: att?.check_out ? isEarlyDeparture(att.check_out, att.check_in, emp.shift_end_time, empHPD) : false,
      };
    });

    built.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
    setRows(built);
    setLoading(false);

  };

  const openLightbox = (url: string, label: string, name: string) => setLightbox({ url, label, name });

  const fmt = (d?: string) => d ? new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
  const hrs = (ci?: string, co?: string) => ci && co
    ? ((new Date(co).getTime() - new Date(ci).getTime()) / 3600000).toFixed(2) + "h" : "—";

  const statusBadge = (row: DayRow) => {
    const map: Record<EmpStatus, { label: string; color: string; bg: string }> = {
      completed:     { label: "✅ Completed",     color: "var(--success)",        bg: "rgba(16,185,129,0.12)" },
      in_office:     { label: "🟡 In Office",     color: "#f59e0b",               bg: "rgba(245,158,11,0.12)" },
      on_leave:      { label: `🏖️ ${row.leaveType ?? "On Leave"}`, color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
      pending_leave: { label: `⏳ Leave Pending (${row.leaveType ?? ""})`, color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
      absent:        { label: "❌ Absent",         color: "var(--danger)",         bg: "rgba(239,68,68,0.1)"  },
    };
    const s = map[row.status];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ padding: "4px 12px", borderRadius: 20, background: s.bg, color: s.color, fontSize: "0.8rem", fontWeight: 600, whiteSpace: "nowrap" }}>
          {s.label}
        </span>
        {row.isLate && (
          <span style={{ padding: "2px 10px", borderRadius: 20, background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: "0.72rem", fontWeight: 600, whiteSpace: "nowrap" }}>
            🔴 Late Arrival
          </span>
        )}
        {row.isEarlyOut && (
          <span style={{ padding: "2px 10px", borderRadius: 20, background: "rgba(245,158,11,0.1)", color: "#f59e0b", fontSize: "0.72rem", fontWeight: 600, whiteSpace: "nowrap" }}>
            ⚠️ Early Departure
          </span>
        )}
      </div>
    );
  };

  const filtered = statusFilter === "all" ? rows : rows.filter(r => r.status === statusFilter);

  const counts = {
    completed:     rows.filter(r => r.status === "completed").length,
    in_office:     rows.filter(r => r.status === "in_office").length,
    on_leave:      rows.filter(r => r.status === "on_leave").length,
    pending_leave: rows.filter(r => r.status === "pending_leave").length,
    absent:        rows.filter(r => r.status === "absent").length,
    late:          rows.filter(r => r.isLate).length,
    early_out:     rows.filter(r => r.isEarlyOut).length,
  };

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>Attendance Records</h1>
        <p>All employees — present, on leave, absent and pending leave requests</p>
      </div>

      {/* Filters */}
      <div className="glass-panel" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className={styles.formGroup} style={{ marginBottom: 0 }}>
            <label>Date</label>
            <input type="date" className="premium-input" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
          </div>
          <div className={styles.formGroup} style={{ marginBottom: 0 }}>
            <label>Employee</label>
            <select className="premium-input" value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
              <option value="">All Employees</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </div>
          <div className={styles.formGroup} style={{ marginBottom: 0 }}>
            <label>Filter by Status</label>
            <select className="premium-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
              <option value="all">All Statuses</option>
              <option value="completed">✅ Completed</option>
              <option value="in_office">🟡 In Office</option>
              <option value="on_leave">🏖️ On Leave (Approved)</option>
              <option value="pending_leave">⏳ Leave Pending</option>
              <option value="absent">❌ Absent</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary KPI row */}
      {!loading && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          {[
            { label: "Completed",     count: counts.completed,     color: "var(--success)",  bg: "rgba(16,185,129,0.1)"  },
            { label: "In Office",     count: counts.in_office,     color: "#f59e0b",         bg: "rgba(245,158,11,0.1)"  },
            { label: "On Leave",      count: counts.on_leave,      color: "#3b82f6",         bg: "rgba(59,130,246,0.1)"  },
            { label: "Leave Pending", count: counts.pending_leave, color: "#a78bfa",         bg: "rgba(167,139,250,0.1)" },
            { label: "Absent",        count: counts.absent,        color: "var(--danger)",   bg: "rgba(239,68,68,0.08)"  },
            ...(showShift && counts.late > 0 ? [{ label: "Late Arrivals", count: counts.late, color: "#ef4444", bg: "rgba(239,68,68,0.06)" }] : []),
            ...(showShift && counts.early_out > 0 ? [{ label: "Early Departures", count: counts.early_out, color: "#f59e0b", bg: "rgba(245,158,11,0.06)" }] : []),
          ].map(k => (
            <div key={k.label} style={{ flex: 1, minWidth: 120, background: k.bg, border: `1px solid ${k.color}44`, borderRadius: 12, padding: "12px 16px", textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: k.color }}>{k.count}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Main table */}
      <div className={`glass-panel ${styles.tableWrap}`}>
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              {showShift && <th style={{ color: "#818cf8" }}>⏰ Prescribed Shift</th>}
              <th>Check In</th>
              <th>Check Out</th>
              <th>Hours</th>
              <th style={{ textAlign: "center" }}>📸 Check-In Photo</th>
              <th style={{ textAlign: "center" }}>📸 Check-Out Photo</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={showShift ? 8 : 7} style={{ textAlign: "center", padding: 32 }}><div className={styles.spinner} style={{ margin: "0 auto" }} /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={showShift ? 8 : 7} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "32px" }}>No records found.</td></tr>
            ) : filtered.map((row) => (
              <tr key={row.userId} style={{ opacity: row.status === "absent" ? 0.75 : 1 }}>
                <td style={{ fontWeight: 600 }}>{row.name}</td>
                {showShift && (
                  <td>
                    {row.shiftStart ? (
                      <div style={{ fontSize: "0.8rem" }}>
                        <div style={{ color: "#818cf8", fontWeight: 600 }}>
                          {formatShiftTime(row.shiftStart)} → {row.shiftEnd ? formatShiftTime(row.shiftEnd) : "—"}
                        </div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "0.72rem", marginTop: 2 }}>
                          {row.hoursPerDay}h/day target
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>—</span>
                    )}
                  </td>
                )}
                <td style={{ color: row.isLate ? "#ef4444" : undefined }}>
                  {fmt(row.checkIn)}
                </td>
                <td style={{ color: row.isEarlyOut ? "#f59e0b" : undefined }}>
                  {fmt(row.checkOut)}
                </td>
                <td>{hrs(row.checkIn, row.checkOut)}</td>

                {/* ── Check-In Photo column ── */}
                <td style={{ textAlign: "center" }}>
                  {row.checkinPhoto ? (
                    <button onClick={() => openLightbox(row.checkinPhoto!, "📸 Check-In Photo", row.name)}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", position: "relative", display: "inline-block" }}>
                      <img src={row.checkinPhoto} alt="check-in"
                        style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover",
                          border: "2px solid var(--accent-primary)", display: "block", transition: "transform 0.15s" }}
                        onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.2)")}
                        onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                      />
                      <span style={{ position: "absolute", bottom: -3, right: -3, fontSize: "0.52rem",
                        background: "var(--accent-primary)", color: "white", borderRadius: 4,
                        padding: "1px 4px", fontWeight: 800, letterSpacing: 0.3 }}>IN</span>
                    </button>
                  ) : (
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>—</span>
                  )}
                </td>

                {/* ── Check-Out Photo column ── */}
                <td style={{ textAlign: "center" }}>
                  {row.checkoutPhoto ? (
                    <button onClick={() => openLightbox(row.checkoutPhoto!, "📸 Check-Out Photo", row.name)}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", position: "relative", display: "inline-block" }}>
                      <img src={row.checkoutPhoto} alt="check-out"
                        style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover",
                          border: "2px solid #10b981", display: "block", transition: "transform 0.15s" }}
                        onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.2)")}
                        onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                      />
                      <span style={{ position: "absolute", bottom: -3, right: -3, fontSize: "0.52rem",
                        background: "#10b981", color: "white", borderRadius: 4,
                        padding: "1px 4px", fontWeight: 800, letterSpacing: 0.3 }}>OUT</span>
                    </button>
                  ) : (
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>—</span>
                  )}
                </td>

                <td>{statusBadge(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Lightbox — single photo viewer */}
      {lightbox && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", backdropFilter: "blur(10px)", zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
          onClick={() => setLightbox(null)}
        >
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 28px" }}>
            <div>
              <div style={{ color: "white", fontWeight: 700, fontSize: "1.1rem" }}>{lightbox.name}</div>
              <div style={{ color: "#94a3b8", fontSize: "0.82rem", marginTop: 3 }}>{lightbox.label}</div>
            </div>
            <button onClick={() => setLightbox(null)}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "white", width: 42, height: 42, borderRadius: "50%", cursor: "pointer", fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>
          <div onClick={e => e.stopPropagation()}>
            <div style={{
              borderRadius: 20, overflow: "hidden",
              border: `3px solid ${lightbox.label.includes("In") ? "var(--accent-primary)" : "#10b981"}`,
              boxShadow: "0 24px 80px rgba(0,0,0,0.9)"
            }}>
              <img src={lightbox.url} alt="attendance photo"
                style={{ width: "min(82vw, 440px)", height: "min(82vw, 440px)", objectFit: "cover", display: "block" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
