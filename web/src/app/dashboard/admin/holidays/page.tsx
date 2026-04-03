"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "../../dashboard.module.css";

export default function AdminHolidays() {
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: "", name: "" });

  const load = async () => {
    const { data } = await supabase.from("company_holidays").select("*").order("date", { ascending: true });
    setHolidays(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from("company_holidays").insert({ date: form.date, name: form.name });
    setShowForm(false);
    setForm({ date: "", name: "" });
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Remove this holiday?")) return;
    await supabase.from("company_holidays").delete().eq("id", id);
    load();
  };

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner}></div></div>;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div><h1>Holiday Calendar</h1><p>Define official company holidays (affects attendance targets & leave deductions)</p></div>
        <button className={styles.primaryBtn} style={{ width: "auto", padding: "12px 24px" }} onClick={() => setShowForm(true)}>+ Add Holiday</button>
      </div>

      <div className={`glass-panel ${styles.tableWrap}`}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Day of Week</th>
              <th>Holiday Name</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {holidays.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 40 }}>No holidays defined.</td></tr>
            ) : holidays.map(h => (
              <tr key={h.id}>
                <td style={{ fontWeight: 600 }}>{new Date(h.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</td>
                <td style={{ color: "var(--text-secondary)" }}>{new Date(h.date).toLocaleDateString("en-IN", { weekday: "long" })}</td>
                <td>{h.name}</td>
                <td><button onClick={() => del(h.id)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "var(--danger)", cursor: "pointer", fontSize: "0.8rem" }}>🗑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="overlay" onClick={() => setShowForm(false)}>
          <div className="drawer" style={{maxWidth: 400}} onClick={e => e.stopPropagation()}>
            <div className="drawerHeader">
              <h2>Add Holiday</h2>
              <button onClick={() => setShowForm(false)} className="closeBtn">✕</button>
            </div>
            <form onSubmit={save} style={{display: 'flex', flexDirection: 'column', gap: 16}}>
              <div className={styles.formGroup} style={{marginBottom: 0}}>
                <label>Date *</label>
                <input type="date" className="premium-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div className={styles.formGroup} style={{marginBottom: 0}}>
                <label>Holiday Name *</label>
                <input className="premium-input" placeholder="e.g. Diwali" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <button type="submit" className={styles.primaryBtn} style={{ marginTop: 8 }}>💾 Save Holiday</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
