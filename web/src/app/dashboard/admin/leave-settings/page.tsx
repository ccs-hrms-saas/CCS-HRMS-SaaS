"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "../../dashboard.module.css";

const DEFAULT_TYPES = [
  { name: "Earned Leave (EL)",  max_days_per_year: 30, is_paid: true, allow_carry_forward: true,  carry_forward_percent: 50, count_holidays: true,  accrual_rate: 20, frequency: "yearly",  deduction_hours: 8.5 },
  { name: "Casual Leave (CL)",  max_days_per_year: 8,  is_paid: true, allow_carry_forward: false, carry_forward_percent: 0,  count_holidays: false, accrual_rate: null, frequency: "yearly", deduction_hours: 8.5 },
  { name: "Sick Leave (SL)",    max_days_per_year: 8,  is_paid: true, allow_carry_forward: false, carry_forward_percent: 0,  count_holidays: false, accrual_rate: null, frequency: "yearly", deduction_hours: 8.5, requires_attachment: true, requires_attachment_after_days: 2 },
  { name: "Menstruation Leave", max_days_per_year: 1,  is_paid: true, allow_carry_forward: false, carry_forward_percent: 0,  count_holidays: false, accrual_rate: null, frequency: "monthly", deduction_hours: 1.0 },
  { name: "Leave Without Pay",  max_days_per_year: 365,is_paid: false,allow_carry_forward: false, carry_forward_percent: 0,  count_holidays: false, accrual_rate: null, frequency: "yearly", deduction_hours: 8.5 },
  { name: "Comp-Off",           max_days_per_year: 0,  is_paid: true, allow_carry_forward: false, carry_forward_percent: 0,  count_holidays: false, accrual_rate: null, frequency: "yearly", deduction_hours: 8.5, expires_in_days: 30 },
];

const emptyType = { name: "", max_days_per_year: 12, is_paid: true, allow_carry_forward: false, carry_forward_percent: 0, max_carry_forward: 0, count_holidays: false, accrual_rate: "", frequency: "yearly", deduction_hours: 8.5, requires_attachment: false, requires_attachment_after_days: 2, expires_in_days: "" };

export default function LeaveSettings() {
  const [types, setTypes]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]  = useState<any | null>(null);
  const [form, setForm]        = useState<any>(emptyType);
  const [saving, setSaving]    = useState(false);
  const [seeded, setSeeded]    = useState(false);

  const load = async () => {
    const { data } = await supabase.from("leave_types").select("*").order("name");
    setTypes(data ?? []); setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew  = () => { setEditing(null); setForm(emptyType); setShowForm(true); };
  const openEdit = (t: any) => { 
    setEditing(t); 
    setForm({ 
      ...t, 
      accrual_rate: t.accrual_rate ?? "", 
      expires_in_days: t.expires_in_days ?? "" 
    }); 
    setShowForm(true); 
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const payload = {
      ...form,
      accrual_rate: form.accrual_rate === "" ? null : Number(form.accrual_rate),
      expires_in_days: form.expires_in_days === "" ? null : Number(form.expires_in_days),
      max_carry_forward: form.allow_carry_forward ? Number(form.max_carry_forward) : 0,
      carry_forward_percent: form.allow_carry_forward ? Number(form.carry_forward_percent) : 0,
      requires_attachment_after_days: form.requires_attachment ? Number(form.requires_attachment_after_days) : 0,
    };

    if (editing) { await supabase.from("leave_types").update(payload).eq("id", editing.id); }
    else { await supabase.from("leave_types").insert(payload); }
    setShowForm(false); setSaving(false); load();
  };

  const del = async (id: string) => {
    if(!confirm("Delete this leave type?")) return;
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
        <div><h1>Leave Settings (Dynamic Rules)</h1><p>Define rules for EL, CL, SL, Menstruation, and Comp Offs</p></div>
        <div style={{ display: "flex", gap: 10 }}>
          {types.length === 0 && !seeded && (
            <button onClick={seedDefaults} style={{ padding: "12px 20px", borderRadius: 10, border: "1px solid rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.1)", color: "var(--accent-primary)", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontSize: "0.88rem", fontWeight: 600 }}>
              ⚡ Load CCSPL Defaults
            </button>
          )}
          <button className={styles.primaryBtn} style={{ width: "auto", padding: "12px 24px" }} onClick={openNew}>+ Add Leave Type</button>
        </div>
      </div>

      <div className={`glass-panel ${styles.tableWrap}`}>
        <table>
          <thead>
            <tr>
              <th>Leave Type</th>
              <th>Allowance</th>
              <th>Deduction</th>
              <th>Holidays Count?</th>
              <th>Carry Fwd</th>
              <th>Special Rules</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {types.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 40 }}>No leave types configured.</td></tr>
            ) : types.map(t => (
              <tr key={t.id}>
                <td style={{ fontWeight: 600 }}>{t.name} <br/><span style={{fontSize: '0.7rem', color:'var(--text-secondary)'}}>{t.is_paid ? 'Paid' : 'Unpaid'}</span></td>
                <td>
                  {t.accrual_rate ? `1 per ${t.accrual_rate} worked days` : `${t.max_days_per_year} days`}
                  <br/><span style={{fontSize: '0.7rem', color:'var(--text-secondary)'}}>Per {t.frequency}</span>
                </td>
                <td>{t.deduction_hours} hrs<br/><span style={{fontSize: '0.7rem', color:'var(--text-secondary)'}}>per day off</span></td>
                <td>
                   <span className={`${styles.statBadge} ${t.count_holidays ? styles.badgeWarning : styles.badgeSuccess}`}>
                      {t.count_holidays ? "Yes (Deducted)" : "No (Skipped)"}
                   </span>
                </td>
                <td>
                  {t.allow_carry_forward ? `${t.carry_forward_percent}% (Max ${t.max_carry_forward} total)` : "No"}
                </td>
                <td style={{ fontSize: "0.82rem", color: "var(--text-secondary)", maxWidth: 200 }}>
                  {t.requires_attachment && `Needs cert after ${t.requires_attachment_after_days} days. `}
                  {t.expires_in_days && `Expires in ${t.expires_in_days} days. `}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => openEdit(t)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--glass-border)", background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.8rem" }}>✏️</button>
                    <button onClick={() => del(t.id)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "var(--danger)", cursor: "pointer", fontSize: "0.8rem" }}>🗑</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="overlay" onClick={() => setShowForm(false)}>
          <div className="drawer" style={{maxWidth: 550}} onClick={e => e.stopPropagation()}>
            <div className="drawerHeader">
              <h2>{editing ? "Edit Leave Type" : "New Leave Type"}</h2>
              <button onClick={() => setShowForm(false)} className="closeBtn">✕</button>
            </div>
            
            <form onSubmit={save} style={{display: 'flex', flexDirection: 'column', gap: 16}}>
              
              <div className={styles.formGroup} style={{marginBottom: 0}}>
                <label>Leave Name *</label>
                <input className="premium-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>

              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16}}>
                <div className={styles.formGroup} style={{marginBottom: 0}}>
                  <label>Max Days (per Frequency)</label>
                  <input type="number" className="premium-input" value={form.max_days_per_year} onChange={e => setForm({ ...form, max_days_per_year: e.target.value })} />
                </div>
                <div className={styles.formGroup} style={{marginBottom: 0}}>
                  <label>Frequency</label>
                  <select className="premium-input" value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}>
                    <option value="yearly">Yearly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>

              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16}}>
                <div className={styles.formGroup} style={{marginBottom: 0}}>
                  <label>Accrual Rate (optional)</label>
                  <input type="number" className="premium-input" placeholder="e.g. 20" value={form.accrual_rate} onChange={e => setForm({ ...form, accrual_rate: e.target.value })} />
                  <span style={{fontSize: '0.7rem', color: "var(--text-secondary)", marginTop: 4, display: 'block'}}>Worked days needed to earn 1 leave</span>
                </div>
                <div className={styles.formGroup} style={{marginBottom: 0}}>
                  <label>Deduction Hours *</label>
                  <input type="number" step="0.5" className="premium-input" value={form.deduction_hours} onChange={e => setForm({ ...form, deduction_hours: e.target.value })} required />
                  <span style={{fontSize: '0.7rem', color: "var(--text-secondary)", marginTop: 4, display: 'block'}}>Usually 8.5. Set to 1.0 for Menstruation leave.</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", padding: "16px", background: "rgba(0,0,0,0.2)", borderRadius: 12, border: "1px solid var(--glass-border)" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.9rem" }}>
                    <input type="checkbox" checked={form.is_paid} onChange={e => setForm({ ...form, is_paid: e.target.checked })} style={{ accentColor: "var(--accent-primary)", width: 16, height: 16 }} />
                    Is Paid
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.9rem" }}>
                    <input type="checkbox" checked={form.count_holidays} onChange={e => setForm({ ...form, count_holidays: e.target.checked })} style={{ accentColor: "var(--accent-primary)", width: 16, height: 16 }} />
                    Holidays fall in leave count as leave
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.9rem" }}>
                    <input type="checkbox" checked={form.allow_carry_forward} onChange={e => setForm({ ...form, allow_carry_forward: e.target.checked })} style={{ accentColor: "var(--accent-primary)", width: 16, height: 16 }} />
                    Allow Carry Forward
                  </label>
                   <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.9rem" }}>
                    <input type="checkbox" checked={form.requires_attachment} onChange={e => setForm({ ...form, requires_attachment: e.target.checked })} style={{ accentColor: "var(--accent-primary)", width: 16, height: 16 }} />
                    Requires Document/Cert
                  </label>
              </div>

              {form.allow_carry_forward && (
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16}}>
                   <div className={styles.formGroup} style={{marginBottom: 0}}>
                    <label>Carry Forward %</label>
                    <input type="number" className="premium-input" value={form.carry_forward_percent} onChange={e => setForm({ ...form, carry_forward_percent: e.target.value })} />
                  </div>
                   <div className={styles.formGroup} style={{marginBottom: 0}}>
                    <label>Max Accumulate Limit</label>
                    <input type="number" className="premium-input" value={form.max_carry_forward} onChange={e => setForm({ ...form, max_carry_forward: e.target.value })} />
                  </div>
                </div>
              )}

              {form.requires_attachment && (
                 <div className={styles.formGroup} style={{marginBottom: 0}}>
                    <label>Require attachment if consecutive days {'>'}= </label>
                    <input type="number" className="premium-input" value={form.requires_attachment_after_days} onChange={e => setForm({ ...form, requires_attachment_after_days: e.target.value })} />
                 </div>
              )}

              <div className={styles.formGroup} style={{marginBottom: 0}}>
                  <label>Expires In (Days) (Comp Offs only)</label>
                  <input type="number" className="premium-input" placeholder="Leave blank if unlimited" value={form.expires_in_days} onChange={e => setForm({ ...form, expires_in_days: e.target.value })} />
              </div>

              <button type="submit" className={styles.primaryBtn} disabled={saving} style={{ marginTop: 8 }}>{saving ? "Saving…" : "💾 Save Settings"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
