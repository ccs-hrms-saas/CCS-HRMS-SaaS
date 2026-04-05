"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import styles from "../../dashboard.module.css";
import { isWorkingDay } from "@/lib/dateUtils";

interface Reportee {
  id: string;
  full_name: string;
  designation: string | null;
  avatar_url: string | null;
  role: string;
}

interface TeamMember extends Reportee {
  todayStatus: "checked_in" | "checked_out" | "on_leave" | "absent" | "loading";
  checkInTime?: string;
  checkOutTime?: string;
  monthDays: number;
  monthHours: number;
  pendingLeaves: any[];
  alertSent: boolean;
}

const isoDate = (d: Date) => d.toISOString().split("T")[0];
const fmtTime = (d?: string) => d ? new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";

export default function MyTeamPage() {
  const { profile } = useAuth();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaveSaving, setLeaveSaving] = useState<string | null>(null);

  const today = new Date();
  const todayStr = isoDate(today);
  const monthStart = isoDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const isWorkDay = isWorkingDay(today);
  const past11am = today.getHours() >= 11;

  useEffect(() => {
    if (profile?.id) loadTeam();
  }, [profile]);

  const loadTeam = async () => {
    setLoading(true);

    // Get all direct reportees
    const { data: reportees } = await supabase
      .from("profiles")
      .select("id, full_name, designation, avatar_url, role")
      .eq("manager_id", profile!.id)
      .eq("is_active", true)
      .order("full_name");

    if (!reportees || reportees.length === 0) { setLoading(false); setTeam([]); return; }

    const ids = reportees.map(r => r.id);

    // Fetch today's attendance, month attendance, today's leaves, pending leaves — all in parallel
    const [todayAtt, monthAtt, todayLeaves, pendingLeaves] = await Promise.all([
      supabase.from("attendance_records").select("*").in("user_id", ids).eq("date", todayStr),
      supabase.from("attendance_records").select("user_id, check_in, check_out").in("user_id", ids).gte("date", monthStart).lte("date", todayStr),
      supabase.from("leave_requests").select("user_id").in("user_id", ids).eq("status", "approved").lte("start_date", todayStr).gte("end_date", todayStr),
      supabase.from("leave_requests").select("*, profiles(full_name)").in("user_id", ids).eq("status", "pending").order("created_at", { ascending: false }),
    ]);

    const todayAttMap: Record<string, any> = {};
    (todayAtt.data ?? []).forEach(r => { todayAttMap[r.user_id] = r; });
    const onLeaveSet = new Set((todayLeaves.data ?? []).map(r => r.user_id));

    const memberData: TeamMember[] = reportees.map(r => {
      const att = todayAttMap[r.id];
      const monthRows = (monthAtt.data ?? []).filter(x => x.user_id === r.id);
      const monthHours = monthRows.reduce((s: number, x: any) => {
        return s + (x.check_in && x.check_out ? (new Date(x.check_out).getTime() - new Date(x.check_in).getTime()) / 3600000 : 0);
      }, 0);

      let todayStatus: TeamMember["todayStatus"] = "absent";
      if (onLeaveSet.has(r.id)) todayStatus = "on_leave";
      else if (att?.check_out) todayStatus = "checked_out";
      else if (att?.check_in) todayStatus = "checked_in";

      const empPending = (pendingLeaves.data ?? []).filter(l => l.user_id === r.id);

      return {
        ...r,
        todayStatus,
        checkInTime: att?.check_in,
        checkOutTime: att?.check_out,
        monthDays: monthRows.length,
        monthHours,
        pendingLeaves: empPending,
        alertSent: false,
      };
    });

    setTeam(memberData);
    setLoading(false);

    // ── Late check-in alert (after 11 AM on working days) ──
    if (isWorkDay && past11am) {
      const absentees = memberData.filter(m => m.todayStatus === "absent");
      for (const m of absentees) {
        const alertPayload = {
          title: `⚠️ ${m.full_name} hasn't checked in`,
          message: `It's past 11 AM. ${m.full_name} has not marked attendance today and has no approved leave on record.`,
          link: "/dashboard/employee/team",
        };
        // Notify the direct manager
        fetch("/api/notify", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_ids: profile!.id, ...alertPayload }),
        }).catch(() => {});
        // Also notify super admins
        fetch("/api/notify", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_ids: "all_superadmins", ...alertPayload }),
        }).catch(() => {});
      }
    }
  };

  // Approve / Reject leave as manager
  const handleLeaveDecision = async (leaveId: string, empId: string, status: "approved" | "rejected") => {
    setLeaveSaving(leaveId);
    await supabase.from("leave_requests").update({ status }).eq("id", leaveId);

    // Notify employee of decision
    fetch("/api/notify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_ids: empId,
        title: status === "approved" ? "✅ Leave Approved" : "❌ Leave Rejected",
        message: `Your leave request has been ${status} by your manager.`,
        link: "/dashboard/employee/leaves",
      }),
    }).catch(() => {});

    // Notify super admin about manager decision
    fetch("/api/notify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_ids: "all_superadmins",
        title: `📋 Leave ${status} by ${profile?.full_name}`,
        message: `${profile?.full_name} ${status} a leave request from ${team.find(m => m.id === empId)?.full_name}.`,
        link: "/dashboard/admin/leaves",
      }),
    }).catch(() => {});

    setLeaveSaving(null);
    loadTeam();
  };

  const statusBadge = (status: TeamMember["todayStatus"]) => {
    const map = {
      checked_in:  { label: "✅ Checked In",  bg: "rgba(16,185,129,0.12)", color: "var(--success)" },
      checked_out: { label: "🏁 Completed",    bg: "rgba(99,102,241,0.12)", color: "var(--accent-primary)" },
      on_leave:    { label: "🔵 On Leave",     bg: "rgba(59,130,246,0.12)", color: "#3b82f6" },
      absent:      { label: "❌ Not Checked In", bg: "rgba(239,68,68,0.1)", color: "var(--danger)" },
      loading:     { label: "...",             bg: "transparent",           color: "var(--text-secondary)" },
    };
    const s = map[status];
    return <span style={{ padding: "4px 12px", borderRadius: 20, background: s.bg, color: s.color, fontSize: "0.78rem", fontWeight: 600 }}>{s.label}</span>;
  };

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner} /></div>;

  if (team.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-secondary)" }}>
        <div style={{ fontSize: "3rem", marginBottom: 16 }}>👥</div>
        <h2 style={{ marginBottom: 8 }}>No Direct Reportees</h2>
        <p>No employees currently report to you.</p>
      </div>
    );
  }

  const pendingAll = team.flatMap(m => m.pendingLeaves);

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>My Team</h1>
        <p>Real-time status and monthly summary for your {team.length} direct reportee{team.length > 1 ? "s" : ""}</p>
      </div>

      {/* ── Today's Status ── */}
      <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 16, color: "var(--text-secondary)" }}>
        📅 Today's Status — {today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
      </h2>

      {!isWorkDay && (
        <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", color: "var(--accent-primary)", padding: "10px 18px", borderRadius: 10, marginBottom: 16, fontSize: "0.88rem" }}>
          🏖️ Today is a non-working day. Attendance is not expected.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16, marginBottom: 32 }}>
        {team.map(m => (
          <div key={m.id} className="glass-panel" style={{ padding: 20, borderLeft: m.todayStatus === "absent" && isWorkDay ? "3px solid var(--danger)" : m.todayStatus === "on_leave" ? "3px solid #3b82f6" : "3px solid var(--success)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                {m.avatar_url ? <img src={m.avatar_url} alt={m.full_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: "#fff", fontWeight: 700 }}>{m.full_name.charAt(0)}</span>}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.92rem" }}>{m.full_name}</div>
                {m.designation && <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{m.designation}</div>}
              </div>
            </div>
            {statusBadge(m.todayStatus)}
            {(m.checkInTime || m.checkOutTime) && (
              <div style={{ marginTop: 8, fontSize: "0.76rem", color: "var(--text-secondary)" }}>
                {m.checkInTime && `In: ${fmtTime(m.checkInTime)}`}
                {m.checkOutTime && ` · Out: ${fmtTime(m.checkOutTime)}`}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Monthly Summary Table ── */}
      <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 16, color: "var(--text-secondary)" }}>📊 This Month Summary</h2>
      <div className={`glass-panel ${styles.tableWrap}`} style={{ marginBottom: 32 }}>
        <table>
          <thead>
            <tr>
              <th>Team Member</th>
              <th>Days Present</th>
              <th>Hours Logged</th>
              <th>Avg Hrs/Day</th>
              <th>Pending Leaves</th>
            </tr>
          </thead>
          <tbody>
            {team.map(m => (
              <tr key={m.id}>
                <td style={{ fontWeight: 600 }}>{m.full_name}</td>
                <td style={{ fontWeight: 700, color: "var(--success)" }}>{m.monthDays}</td>
                <td>{m.monthHours.toFixed(2)}h</td>
                <td>{m.monthDays > 0 ? (m.monthHours / m.monthDays).toFixed(2) : "—"}h</td>
                <td>
                  {m.pendingLeaves.length > 0
                    ? <span style={{ color: "#f59e0b", fontWeight: 600 }}>⚠️ {m.pendingLeaves.length} pending</span>
                    : <span style={{ color: "var(--text-secondary)" }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pending Leave Requests ── */}
      {pendingAll.length > 0 && (
        <>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 16, color: "var(--text-secondary)" }}>
            🗂️ Pending Leave Requests ({pendingAll.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {pendingAll.map(l => (
              <div key={l.id} className="glass-panel" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700 }}>{l.profiles?.full_name ?? "—"}</div>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: 2 }}>
                    {l.type} · {l.start_date}{l.start_date !== l.end_date ? ` → ${l.end_date}` : ""}
                  </div>
                  {l.reason && <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 4, opacity: 0.7 }}>Reason: {l.reason}</div>}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => handleLeaveDecision(l.id, l.user_id, "approved")} disabled={leaveSaving === l.id}
                    style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontWeight: 700, fontSize: "0.85rem" }}>
                    {leaveSaving === l.id ? "..." : "✅ Approve"}
                  </button>
                  <button onClick={() => handleLeaveDecision(l.id, l.user_id, "rejected")} disabled={leaveSaving === l.id}
                    style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)", color: "var(--danger)", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontWeight: 600, fontSize: "0.85rem" }}>
                    ❌ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
