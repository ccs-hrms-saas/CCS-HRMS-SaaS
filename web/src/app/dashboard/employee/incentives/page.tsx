"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import styles from "../../dashboard.module.css";

interface MyRecord {
  id: string; period_label: string; achieved_value: number;
  payout_amount: number | null; status: string; notes: string | null; created_at: string;
  incentive_goals: { name: string; payout_type: string; payout_value: number } | null;
}

const statusColor: Record<string, string> = { pending: "#f59e0b", approved: "#10b981", rejected: "#ef4444", paid: "#6366f1" };

export default function EmployeeIncentives() {
  const { profile } = useAuth();
  const [records, setRecords] = useState<MyRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("incentive_records")
      .select("*, incentive_goals(name, payout_type, payout_value)")
      .eq("user_id", profile!.id)
      .order("created_at", { ascending: false });
    setRecords(data ?? []);
    setLoading(false);
  }, [profile]);

  useEffect(() => { if (profile?.id) load(); }, [load, profile]);

  const totalEarned   = records.filter(r => r.status === "paid").reduce((s, r) => s + (r.payout_amount ?? 0), 0);
  const totalApproved = records.filter(r => r.status === "approved").reduce((s, r) => s + (r.payout_amount ?? 0), 0);
  const pending       = records.filter(r => r.status === "pending").length;

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner} /></div>;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>My Incentives</h1>
        <p>Track your achievements and earnings</p>
      </div>

      {/* ── Summary Stats ────────────────────────────────────────────────── */}
      <div className={styles.statsGrid} style={{ marginBottom: 28 }}>
        {[
          { label: "Total Paid Out",    value: `₹${totalEarned.toLocaleString()}`,   color: "#6366f1", icon: "💸" },
          { label: "Approved (Pending Payment)", value: `₹${totalApproved.toLocaleString()}`, color: "#10b981", icon: "✅" },
          { label: "Awaiting Review",   value: pending,                                color: "#f59e0b", icon: "⏳" },
          { label: "Total Achievements",value: records.length,                         color: "#818cf8", icon: "📊" },
        ].map(s => (
          <div key={s.label} className="glass-panel" style={{ padding: "20px 24px" }}>
            <div style={{ fontSize: "1.5rem", marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Achievement Log ────────────────────────────────────────────────── */}
      <div className={`glass-panel ${styles.tableWrap}`}>
        <table>
          <thead>
            <tr>
              <th>Goal</th>
              <th>Period</th>
              <th>Achieved</th>
              <th>Payout Rule</th>
              <th>Payout Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 40 }}>
                  No incentive records yet. Your manager will log your achievements here.
                </td>
              </tr>
            ) : records.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.incentive_goals?.name ?? "—"}</td>
                <td style={{ color: "var(--text-secondary)" }}>{r.period_label}</td>
                <td style={{ fontWeight: 700 }}>{r.achieved_value.toLocaleString()}</td>
                <td style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  {r.incentive_goals
                    ? r.incentive_goals.payout_type === "flat"
                        ? `₹${r.incentive_goals.payout_value} flat`
                        : `${r.incentive_goals.payout_value}% of value`
                    : "—"}
                </td>
                <td style={{ fontWeight: 700, color: r.payout_amount && r.payout_amount > 0 ? "#10b981" : "var(--text-secondary)" }}>
                  {r.payout_amount != null ? `₹${r.payout_amount.toLocaleString()}` : "—"}
                </td>
                <td>
                  <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, background: `${statusColor[r.status]}20`, color: statusColor[r.status], textTransform: "capitalize" }}>
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
