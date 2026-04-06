"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "../../dashboard.module.css";

interface LightboxState { photos: string[]; index: number; name: string; }

type EmpStatus = "completed" | "in_office" | "on_leave" | "pending_leave" | "absent";

interface DayRow {
  userId: string;
  name: string;
  checkIn?: string;
  checkOut?: string;
  photos: string[];
  status: EmpStatus;
  leaveType?: string;   // approved or pending leave type
  leaveStatus?: string; // "approved" | "pending"
}

const STATUS_ORDER: Record<EmpStatus, number> = {
  in_office: 0, completed: 1, on_leave: 2, pending_leave: 3, absent: 4,
};

export default function AdminAttendance() {
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

  useEffect(() => {
    supabase.from("profiles").select("id, full_name").eq("is_active", true)
      .not("role", "eq", "superadmin")
      .order("full_name")
      .then(({ data }) => setEmployees(data ?? []));
  }, []);

  const load = async () => {
    setLoading(true);

    // Fetch all 3 data sources in parallel for the selected date
    const [attRes, lvApproved, lvPending] = await Promise.all([
      supabase.from("attendance_records")
        .select("id, user_id, date, check_in, check_out, photo_url, checkout_photo_url, profiles(full_name, id)")
        .eq("date", selectedDate),
      // Approved leaves covering this date
      supabase.from("leave_requests")
        .select("user_id, type, status, profiles(full_name)")
        .eq("status", "approved")
        .lte("start_date", selectedDate)
        .gte("end_date", selectedDate),
      // Pending (unapproved) leaves covering this date
      supabase.from("leave_requests")
        .select("user_id, type, status, profiles(full_name)")
        .eq("status", "pending")
        .lte("start_date", selectedDate)
        .gte("end_date", selectedDate),
    ]);

    const attMap: Record<string, any> = {};
    (attRes.data ?? []).forEach(r => {
      attMap[r.user_id] = r;
    });

    const approvedLeaveMap: Record<string, string> = {};
    (lvApproved.data ?? []).forEach((l: any) => { approvedLeaveMap[l.user_id] = l.type; });

    const pendingLeaveMap: Record<string, string> = {};
    (lvPending.data ?? []).forEach((l: any) => { pendingLeaveMap[l.user_id] = l.type; });

    // Determine which employees to show
    const empList = selectedUser
      ? employees.filter(e => e.id === selectedUser)
      : employees;

    const built: DayRow[] = empList.map(emp => {
      const att = attMap[emp.id];
      const photos: string[] = [];
      if (att?.photo_url)          photos.push(att.photo_url);
      if (att?.checkout_photo_url) photos.push(att.checkout_photo_url);

      let status: EmpStatus = "absent";
      let leaveType: string | undefined;
      let leaveStatus: string | undefined;

      if (att?.check_in && att?.check_out) { status = "completed"; }
      else if (att?.check_in)              { status = "in_office"; }
      else if (approvedLeaveMap[emp.id])   { status = "on_leave";       leaveType = approvedLeaveMap[emp.id]; leaveStatus = "approved"; }
      else if (pendingLeaveMap[emp.id])    { status = "pending_leave";  leaveType = pendingLeaveMap[emp.id];  leaveStatus = "pending"; }
      // else: absent (no check-in, no leave)

      return {
        userId: emp.id, name: emp.full_name,
        checkIn: att?.check_in, checkOut: att?.check_out,
        photos, status, leaveType, leaveStatus,
      };
    });

    // Sort: In Office → Completed → On Leave → Pending Leave → Absent
    built.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
    setRows(built);
    setLoading(false);
  };

  useEffect(() => { if (employees.length > 0) load(); }, [selectedDate, selectedUser, employees]);

  const openLightbox = (photos: string[], index: number, name: string) => setLightbox({ photos, index, name });

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
      <span style={{ padding: "4px 12px", borderRadius: 20, background: s.bg, color: s.color, fontSize: "0.8rem", fontWeight: 600, whiteSpace: "nowrap" }}>
        {s.label}
      </span>
    );
  };

  const filtered = statusFilter === "all" ? rows : rows.filter(r => r.status === statusFilter);

  // Summary counts
  const counts = {
    completed:     rows.filter(r => r.status === "completed").length,
    in_office:     rows.filter(r => r.status === "in_office").length,
    on_leave:      rows.filter(r => r.status === "on_leave").length,
    pending_leave: rows.filter(r => r.status === "pending_leave").length,
    absent:        rows.filter(r => r.status === "absent").length,
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
              <th>Employee</th><th>Check In</th><th>Check Out</th><th>Hours</th>
              <th>Photos</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 32 }}><div className={styles.spinner} style={{ margin: "0 auto" }} /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "32px" }}>No records found.</td></tr>
            ) : filtered.map((row) => (
              <tr key={row.userId} style={{ opacity: row.status === "absent" ? 0.75 : 1 }}>
                <td style={{ fontWeight: 600 }}>{row.name}</td>
                <td>{fmt(row.checkIn)}</td>
                <td>{fmt(row.checkOut)}</td>
                <td>{hrs(row.checkIn, row.checkOut)}</td>
                <td>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {row.photos.length === 0 && <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>—</span>}
                    {row.photos.map((url, i) => (
                      <button key={i} onClick={() => openLightbox(row.photos, i, row.name)}
                        title={i === 0 ? "Check-In Photo" : "Check-Out Photo"}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", position: "relative" }}>
                        <img src={url} alt={i === 0 ? "check-in" : "check-out"}
                          style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover",
                            border: `2px solid ${i === 0 ? "var(--accent-primary)" : "#10b981"}`,
                            display: "block", transition: "transform 0.15s" }}
                          onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.15)")}
                          onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                        />
                        <span style={{ position: "absolute", bottom: -2, right: -2, fontSize: "0.55rem",
                          background: i === 0 ? "var(--accent-primary)" : "#10b981",
                          color: "white", borderRadius: 4, padding: "1px 3px", fontWeight: 700 }}>
                          {i === 0 ? "IN" : "OUT"}
                        </span>
                      </button>
                    ))}
                  </div>
                </td>
                <td>{statusBadge(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", backdropFilter: "blur(8px)", zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
          onClick={() => setLightbox(null)}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 28px" }}>
            <div>
              <div style={{ color: "white", fontWeight: 700, fontSize: "1rem" }}>{lightbox.name}</div>
              <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: 2 }}>
                {lightbox.index === 0 ? "📸 Check-In Photo" : "📸 Check-Out Photo"}
                {" · "}{lightbox.index + 1} of {lightbox.photos.length}
              </div>
            </div>
            <button onClick={() => setLightbox(null)}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "white", width: 40, height: 40, borderRadius: "50%", cursor: "pointer", fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>
          <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <button onClick={() => setLightbox(l => l ? { ...l, index: l.index - 1 } : l)}
              disabled={lightbox.index === 0}
              style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "white", cursor: lightbox.index === 0 ? "not-allowed" : "pointer", fontSize: "1.4rem", opacity: lightbox.index === 0 ? 0.3 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
            <div style={{ borderRadius: 16, overflow: "hidden", border: `3px solid ${lightbox.index === 0 ? "var(--accent-primary)" : "#10b981"}`, boxShadow: "0 20px 60px rgba(0,0,0,0.8)" }}>
              <img src={lightbox.photos[lightbox.index]} alt="attendance photo"
                style={{ width: "min(80vw, 420px)", height: "min(80vw, 420px)", objectFit: "cover", display: "block" }} />
            </div>
            <button onClick={() => setLightbox(l => l ? { ...l, index: l.index + 1 } : l)}
              disabled={lightbox.index === lightbox.photos.length - 1}
              style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "white", cursor: lightbox.index === lightbox.photos.length - 1 ? "not-allowed" : "pointer", fontSize: "1.4rem", opacity: lightbox.index === lightbox.photos.length - 1 ? 0.3 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
          </div>
          {lightbox.photos.length > 1 && (
            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              {lightbox.photos.map((_, i) => (
                <button key={i} onClick={e => { e.stopPropagation(); setLightbox(l => l ? { ...l, index: i } : l); }}
                  style={{ width: 8, height: 8, borderRadius: "50%", border: "none", cursor: "pointer", background: i === lightbox.index ? "white" : "rgba(255,255,255,0.3)", padding: 0 }} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


