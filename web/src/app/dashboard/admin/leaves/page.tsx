"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getLeaveDaysCount, getCurrentFinancialYear } from "@/lib/dateUtils";
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

  const updateStatus = async (l: any, status: "approved" | "rejected") => {
    // We must track transitions to update ledger
    const oldStatus = l.status;
    
    // 1. Update status
    await supabase.from("leave_requests").update({ status }).eq("id", l.id);
    
    // 2. Adjust Ledger
    if (oldStatus !== status) {
        // Fetch all holidays
        const { data: hRes } = await supabase.from("company_holidays").select("date");
        const hols = new Set<string>();
        (hRes ?? []).forEach(h => hols.add(h.date));

        // Fetch Leave Type configs
        const { data: typeRes } = await supabase.from("leave_types").select("*").eq("name", l.type).single();
        const typeId = typeRes?.id;
        const countHolidays = typeRes?.count_holidays ?? false;
        
        if (typeId && l.type !== "Menstruation Leave" && l.type !== "Leave Without Pay (LWP)") {
            const days = getLeaveDaysCount(l.start_date, l.end_date, countHolidays, hols);
            // Fetch current balance
            const fy = getCurrentFinancialYear();
            const { data: bal } = await supabase.from("leave_balances").select("*").eq("user_id", l.user_id).eq("leave_type_id", typeId).eq("financial_year", fy).single();
            
            if (bal) {
                let newUsed = Number(bal.used);
                if (status === "approved" && oldStatus !== "approved") newUsed += days;
                if (oldStatus === "approved" && status !== "approved") newUsed -= days;
                await supabase.from("leave_balances").update({ used: Math.max(0, newUsed) }).eq("id", bal.id);
            }
        }
    }

    // 3. Notify the employee of the decision
    const emoji = status === "approved" ? "✅" : "❌";
    const empName = l.profiles?.full_name || "Employee";
    fetch("/api/notify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_ids: l.user_id,
        title: `${emoji} Leave ${status === "approved" ? "Approved" : "Rejected"} — ${l.type}`,
        message: `Your ${l.type} request (${new Date(l.start_date).toLocaleDateString("en-IN")}${l.start_date !== l.end_date ? " to " + new Date(l.end_date).toLocaleDateString("en-IN") : ""}) has been ${status}.`,
        link: "/dashboard/employee/leaves"
      })
    }).catch(() => {});

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
                  {l.status === "pending" ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => updateStatus(l, "approved")} className={styles.primaryBtn} style={{ padding: "6px 12px", background: "var(--success)", borderColor: "var(--success)" }}>Approve</button>
                      <button onClick={() => updateStatus(l, "rejected")} className={styles.secondaryBtn} style={{ padding: "6px 12px", color: "var(--danger)" }}>Reject</button>
                    </div>
                  ) : (
                    <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      {l.status === "approved" && <button onClick={() => updateStatus(l, "rejected")} className={styles.secondaryBtn} style={{ padding: "4px 8px", fontSize: "0.75rem", color: "var(--danger)" }}>Revoke</button>}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
