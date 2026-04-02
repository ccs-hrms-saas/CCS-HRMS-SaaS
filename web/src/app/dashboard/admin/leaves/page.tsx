"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "../../dashboard.module.css";

export default function AdminLeaves() {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from("leave_requests")
      .select("*, profiles!leave_requests_user_id_fkey(full_name)")
      .order("created_at", { ascending: false });
    setLeaves(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: "approved" | "rejected") => {
    await supabase.from("leave_requests").update({ status }).eq("id", id);
    load();
  };

  const statusStyle = (s: string) =>
    s === "approved" ? styles.badgeSuccess : s === "rejected" ? styles.badgeDanger : styles.badgeWarning;

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner}></div></div>;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>Leave Approvals</h1>
        <p>Review and approve employee leave requests</p>
      </div>

      <div className={`glass-panel ${styles.tableWrap}`}>
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Type</th>
              <th>From</th>
              <th>To</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {leaves.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "32px" }}>No leave requests found.</td></tr>
            ) : leaves.map((l) => (
              <tr key={l.id}>
                <td>{(l.profiles as any)?.full_name ?? "—"}</td>
                <td>{l.type}</td>
                <td>{l.start_date}</td>
                <td>{l.end_date}</td>
                <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.reason ?? "—"}</td>
                <td><span className={`${styles.statBadge} ${statusStyle(l.status)}`}>{l.status}</span></td>
                <td>
                  {l.status === "pending" && (
                    <>
                      <button className={`${styles.actionBtn} ${styles.approveBtn}`} onClick={() => updateStatus(l.id, "approved")}>✓ Approve</button>
                      <button className={`${styles.actionBtn} ${styles.rejectBtn}`} onClick={() => updateStatus(l.id, "rejected")}>✗ Reject</button>
                    </>
                  )}
                  {l.status !== "pending" && <span style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>Done</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
