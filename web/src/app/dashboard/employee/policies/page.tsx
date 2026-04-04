"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "../../dashboard.module.css";

const catColor: Record<string, string> = {
  "Leave Policy": "#6366f1", "Code of Conduct": "#f59e0b", "Office Rules": "#10b981",
  "Benefits & Perks": "#ec4899", "Safety": "#ef4444", "General": "#64748b",
};

export default function EmployeePolicies() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter]     = useState("All");
  const categories = ["All", "Leave Policy", "Code of Conduct", "Office Rules", "Benefits & Perks", "Safety", "General"];

  useEffect(() => {
    supabase.from("hr_policies").select("*").order("created_at", { ascending: false })
      .then(({ data }) => { setPolicies(data ?? []); setLoading(false); });
  }, []);

  const visible = filter === "All" ? policies : policies.filter(p => p.category === filter);

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner}></div></div>;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>HR Policies</h1>
        <p>Company policies and guidelines</p>
      </div>

      {/* Category filter chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        {categories.map(c => (
          <button key={c} onClick={() => setFilter(c)} style={{
            padding: "7px 16px", borderRadius: 20, border: "none", cursor: "pointer",
            fontFamily: "Outfit,sans-serif", fontSize: "0.8rem", fontWeight: 600,
            background: filter === c ? (catColor[c] ?? "var(--accent-primary)") : "var(--glass-bg)",
            color: filter === c ? "white" : "var(--text-secondary)",
            transition: "all 0.2s",
          }}>{c}</button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>
          <div style={{ fontSize: "3rem", marginBottom: 16 }}>📋</div>
          <p>No policies in this category yet.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visible.map(p => (
            <div key={p.id} className="glass-panel" style={{ padding: "20px 24px", cursor: "pointer" }} onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: `${catColor[p.category] ?? "#64748b"}22`, color: catColor[p.category] ?? "#64748b", border: `1px solid ${catColor[p.category] ?? "#64748b"}44` }}>{p.category}</span>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{new Date(p.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </div>
                  <h3 style={{ fontSize: "0.98rem", fontWeight: 700, color: "white", margin: 0 }}>{p.title}</h3>
                </div>
                <span style={{ color: "var(--text-secondary)", fontSize: "1.2rem", flexShrink: 0 }}>{expanded === p.id ? "▲" : "▼"}</span>
              </div>
              {expanded === p.id && (
                <div style={{ marginTop: 16, borderTop: "1px solid var(--glass-border)", paddingTop: 16 }}
                     className="policy-content"
                     dangerouslySetInnerHTML={{ __html: p.content }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
