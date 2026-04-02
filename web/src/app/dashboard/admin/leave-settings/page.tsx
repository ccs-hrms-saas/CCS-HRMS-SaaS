"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "../../dashboard.module.css";

const DEFAULT_TYPES = [
  { name: "Annual Leave",     max_days_per_year: 18, is_paid: true,  allow_carry_forward: true  },
  { name: "Sick Leave",       max_days_per_year: 12, is_paid: true,  allow_carry_forward: false },
  { name: "Casual Leave",     max_days_per_year: 6,  is_paid: true,  allow_carry_forward: false },
  { name: "Maternity Leave",  max_days_per_year: 90, is_paid: true,  allow_carry_forward: false },
  { name: "Paternity Leave",  max_days_per_year: 7,  is_paid: true,  allow_carry_forward: false },
  { name: "Unpaid Leave",     max_days_per_year: 30, is_paid: false, allow_carry_forward: false },
];

const emptyType = { name: "", max_days_per_year: 12, is_paid: true, allow_carry_forward: false };

export default function LeaveSettings() {
  const [types, setTypes]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]  = useState<any | null>(null);
  const [form, setForm]        = useState(emptyType);
  const [saving, setSaving]    = useState(false);
  const [seeded, setSeeded]    = useState(false);

  const load = async () => {
    const { data } = await supabase.from("leave_types").select("*").order("name");
    setTypes(data ?? []); setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew  = () => { setEditing(null); setForm(emptyType); setShowForm(true); };
  const openEdit = (t: any) => { setEditing(t); setForm({ name: t.name, max_days_per_year: t.max_days_per_year, is_paid: t.is_paid, allow_carry_forward: t.allow_carry_forward }); setShowForm(true); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    if (editing) { await supabase.from("leave_types").update(form).eq("id", editing.id); }
    else { await supabase.from("leave_types").insert(form); }
    setShowForm(false); setSaving(false); load();
  };

  const del = async (id: string) => {
    await supabase.from("leave_types").delete().eq("id", id); load();
  };

  const seedDefaults = async () => {
    await supabase.from("leave_types").insert(DEFAULT_TYPES);
    setSeeded(true); load();
  };

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner}></div></div>;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div><h1>Leave Settings</h1><p>Define leave types and entitlements for your organisation</p></div>
        <div style={{ display: "flex", gap: 10 }}>
          {types.length === 0 && !seeded && (
            <button onClick={seedDefaults} style={{ padding: "12px 20px", borderRadius: 10, border: "1px solid rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.1)", color: "var(--accent-primary)", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontSize: "0.88rem", fontWeight: 600 }}>
              ⚡ Load Defaults
            </button>
          )}
          <button className={styles.primaryBtn} style={{ width: "auto", padding: "12px 24px" }} onClick={openNew}>+ Add Leave Type</button>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid} style={{ marginBottom: 28 }}>
        {[
          { label: "Leave Types",    value: types.length,                       icon: "📋" },
          { label: "Paid Types",     value: types.filter(t => t.is_paid).length, icon: "💰" },
          { label: "With Carry Fwd", value: types.filter(t => t.allow_carry_forward).length, icon: "📅" },
        ].map(s => (
          <div key={s.label} className={`glass-panel ${styles.statCard}`}>
            <div className={styles.statIcon}>{s.icon}</div>
            <div className={styles.statValue}>{s.value}</div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className={`glass-panel ${styles.tableWrap}`}>
        <table>
          <thead>
            <tr>
              <th>Leave Type</th>
              <th>Max Days / Year</th>
              <th>Paid</th>
              <th>Carry Forward</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {types.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 40 }}>
                No leave types configured. Click "Load Defaults" or "+ Add Leave Type".
              </td></tr>
            ) : types.map(t => (
              <tr key={t.id}>
                <td style={{ fontWeight: 600 }}>{t.name}</td>
                <td>{t.max_days_per_year} days</td>
                <td><span className={`${styles.statBadge} ${t.is_paid ? styles.badgeSuccess : styles.badgeDanger}`}>{t.is_paid ? "Paid" : "Unpaid"}</span></td>
                <td><span className={`${styles.statBadge} ${t.allow_carry_forward ? styles.badgeInfo : styles.badgeDanger}`}>{t.allow_carry_forward ? "Yes" : "No"}</span></td>
                <td>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => openEdit(t)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--glass-border)", background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.8rem" }}>✏️ Edit</button>
                    <button onClick={() => del(t.id)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "var(--danger)", cursor: "pointer", fontSize: "0.8rem" }}>🗑</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Form drawer */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowForm(false)}>
          <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--glass-border)", borderRadius: 20, padding: 32, width: "100%", maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{editing ? "Edit Leave Type" : "New Leave Type"}</h2>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "1px solid var(--glass-border)", color: "var(--text-secondary)", width: 34, height: 34, borderRadius: 8, cursor: "pointer" }}>✕</button>
            </div>
            <form onSubmit={save}>
              <div className={styles.formGroup}>
                <label>Leave Type Name *</label>
                <input className="premium-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Annual Leave" />
              </div>
              <div className={styles.formGroup}>
                <label>Max Days Per Year *</label>
                <input type="number" min={1} max={365} className="premium-input" value={form.max_days_per_year}
                  onChange={e => setForm({ ...form, max_days_per_year: parseInt(e.target.value) })} required />
              </div>
              <div className={styles.formGroup} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <input type="checkbox" id="is_paid" checked={form.is_paid} onChange={e => setForm({ ...form, is_paid: e.target.checked })} style={{ width: 18, height: 18 }} />
                <label htmlFor="is_paid" style={{ marginBottom: 0, cursor: "pointer" }}>Paid Leave</label>
              </div>
              <div className={styles.formGroup} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <input type="checkbox" id="carry_fwd" checked={form.allow_carry_forward} onChange={e => setForm({ ...form, allow_carry_forward: e.target.checked })} style={{ width: 18, height: 18 }} />
                <label htmlFor="carry_fwd" style={{ marginBottom: 0, cursor: "pointer" }}>Allow Carry Forward</label>
              </div>
              <button type="submit" className={styles.primaryBtn} disabled={saving} style={{ marginTop: 8 }}>{saving ? "Saving…" : "💾 Save Leave Type"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
