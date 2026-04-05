"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import styles from "../../dashboard.module.css";

type ApprovalStatus = "pending" | "approved" | "rejected";

interface Approval {
  id: string;
  action_type: "role_change" | "organogram_change";
  status: ApprovalStatus;
  payload: any;
  created_at: string;
  reviewed_at?: string;
  rejection_reason?: string;
  requester?: { full_name: string; designation: string };
  target?: { full_name: string; role: string; designation: string };
}

export default function ApprovalsPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; label: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Guard: superadmin only
  useEffect(() => {
    if (profile && profile.role !== "superadmin") router.replace("/dashboard");
  }, [profile]);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/pending-approvals?status=${filter}`);
    const json = await res.json();
    setApprovals(json.data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (profile?.role === "superadmin") load(); }, [profile, filter]);

  const handleApprove = async (id: string) => {
    setActing(id);
    await fetch(`/api/pending-approvals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", reviewer_id: profile!.id }),
    });
    setActing(null);
    load();
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setActing(rejectModal.id);
    await fetch(`/api/pending-approvals/${rejectModal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", reviewer_id: profile!.id, reason: rejectReason }),
    });
    setActing(null);
    setRejectModal(null);
    setRejectReason("");
    load();
  };

  const describeAction = (a: Approval): string => {
    if (a.action_type === "role_change") {
      return `Change ${a.target?.full_name ?? "—"}'s role: ${a.payload.old_role} → ${a.payload.new_role}`;
    }
    if (a.action_type === "organogram_change") {
      return `Reassign ${a.payload.changes?.length ?? 0} reporting line(s) in Organogram`;
    }
    return a.action_type;
  };

  const statusBadge = (s: ApprovalStatus) => {
    const map = {
      pending:  { label: "⏳ Pending",  color: "#f59e0b", bg: "rgba(245,158,11,0.12)"  },
      approved: { label: "✅ Approved", color: "var(--success)", bg: "rgba(16,185,129,0.12)" },
      rejected: { label: "❌ Rejected", color: "var(--danger)",  bg: "rgba(239,68,68,0.1)"  },
    };
    const m = map[s];
    return (
      <span style={{ padding: "3px 10px", borderRadius: 20, background: m.bg, color: m.color, fontSize: "0.78rem", fontWeight: 700 }}>
        {m.label}
      </span>
    );
  };

  const pendingCount = approvals.filter(a => a.status === "pending").length;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>Pending Approvals</h1>
        <p>Review and action sensitive requests from admins before they take effect</p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {(["pending", "all"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: "8px 20px", borderRadius: 20, cursor: "pointer", fontFamily: "Outfit,sans-serif", fontWeight: 600, fontSize: "0.88rem",
              background: filter === f ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "var(--glass-bg)",
              color: filter === f ? "#fff" : "var(--text-secondary)",
              border: filter === f ? "1px solid transparent" : "1px solid var(--glass-border)" }}>
            {f === "pending" ? `⏳ Pending${pendingCount > 0 && filter !== "pending" ? ` (${pendingCount})` : ""}` : "📋 All History"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.loadingScreen}><div className={styles.spinner} /></div>
      ) : approvals.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: "center", padding: "60px 0", color: "var(--text-secondary)" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>{filter === "pending" ? "🎉" : "📋"}</div>
          <div style={{ fontWeight: 600 }}>{filter === "pending" ? "No pending approvals — you're all caught up!" : "No approval history yet."}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {approvals.map(a => (
            <div key={a.id} className="glass-panel" style={{ padding: "18px 22px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>

                {/* Icon */}
                <div style={{ width: 44, height: 44, borderRadius: 12, background: a.action_type === "role_change" ? "rgba(99,102,241,0.15)" : "rgba(139,92,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", flexShrink: 0 }}>
                  {a.action_type === "role_change" ? "👥" : "🏢"}
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.92rem", marginBottom: 4 }}>{describeAction(a)}</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                    Requested by <strong>{a.requester?.full_name ?? "—"}</strong>
                    {a.requester?.designation ? ` (${a.requester.designation})` : ""}
                    {" · "}{new Date(a.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  {a.rejection_reason && (
                    <div style={{ marginTop: 6, fontSize: "0.78rem", color: "var(--danger)", padding: "4px 10px", background: "rgba(239,68,68,0.06)", borderRadius: 6, display: "inline-block" }}>
                      Rejection reason: {a.rejection_reason}
                    </div>
                  )}

                  {/* Organogram changes detail */}
                  {a.action_type === "organogram_change" && a.payload.changes && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ fontSize: "0.78rem", color: "var(--accent-primary)", cursor: "pointer" }}>View {a.payload.changes.length} change(s)</summary>
                      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                        {a.payload.changes.map((c: any, i: number) => (
                          <div key={i} style={{ fontSize: "0.75rem", color: "var(--text-secondary)", padding: "3px 8px", background: "var(--glass-bg)", borderRadius: 6 }}>
                            {c.name ?? c.userId}: <span style={{ color: "#f59e0b" }}>{c.old_manager_name ?? "no manager"}</span> → <span style={{ color: "var(--success)" }}>{c.new_manager_name ?? "no manager"}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>

                {/* Status + Actions */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                  {statusBadge(a.status)}
                  {a.status === "pending" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => handleApprove(a.id)} disabled={acting === a.id}
                        style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontWeight: 700, fontSize: "0.82rem" }}>
                        {acting === a.id ? "…" : "✅ Approve"}
                      </button>
                      <button onClick={() => setRejectModal({ id: a.id, label: describeAction(a) })} disabled={acting === a.id}
                        style={{ padding: "7px 18px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)", color: "var(--danger)", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontWeight: 600, fontSize: "0.82rem" }}>
                        ❌ Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject reason modal */}
      {rejectModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setRejectModal(null)}>
          <div className="glass-panel" style={{ width: 460, padding: 28 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 8 }}>Reject Request</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 16 }}>{rejectModal.label}</p>
            <textarea
              placeholder="Reason for rejection (optional but recommended)"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              style={{ width: "100%", background: "var(--glass-bg)", border: "1px solid var(--glass-border)", borderRadius: 10, color: "var(--text-primary)", fontFamily: "Outfit,sans-serif", fontSize: "0.88rem", padding: "10px 14px", resize: "vertical", outline: "none", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => setRejectModal(null)}
                style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid var(--glass-border)", background: "var(--glass-bg)", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "Outfit,sans-serif" }}>
                Cancel
              </button>
              <button onClick={handleReject}
                style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontWeight: 700 }}>
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
