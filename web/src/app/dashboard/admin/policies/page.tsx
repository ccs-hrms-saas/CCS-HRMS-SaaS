"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import styles from "../../dashboard.module.css";

const CATEGORIES = ["Leave Policy", "Code of Conduct", "Office Rules", "Benefits & Perks", "Safety", "General"];

export default function AdminPolicies() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<any | null>(null);
  const [form, setForm]         = useState({ title: "", category: CATEGORIES[0], content: "" });
  const [saving, setSaving]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const { data } = await supabase.from("hr_policies").select("*").order("created_at", { ascending: false });
    setPolicies(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew  = () => { setEditing(null); setForm({ title: "", category: CATEGORIES[0], content: "" }); setShowForm(true); setTimeout(() => modalRef.current?.scrollTo(0, 0), 50); };
  const openEdit = (p: any) => { setEditing(p); setForm({ title: p.title, category: p.category, content: p.content }); setShowForm(true); setTimeout(() => modalRef.current?.scrollTo(0, 0), 50); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    if (editing) {
      await supabase.from("hr_policies").update(form).eq("id", editing.id);
    } else {
      await supabase.from("hr_policies").insert(form);
    }
    setShowForm(false); setSaving(false); load();
  };

  const del = async () => {
    if (!deleteTarget) return;
    await supabase.from("hr_policies").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null); load();
  };

  const catColor: Record<string, string> = {
    "Leave Policy": "#6366f1", "Code of Conduct": "#f59e0b", "Office Rules": "#10b981",
    "Benefits & Perks": "#ec4899", "Safety": "#ef4444", "General": "#64748b",
  };

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner}></div></div>;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div><h1>HR Policies</h1><p>Publish policies visible to all employees</p></div>
        <button className={styles.primaryBtn} style={{ width: "auto", padding: "12px 24px" }} onClick={openNew}>+ New Policy</button>
      </div>

      {policies.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>
          <div style={{ fontSize: "3rem", marginBottom: 16 }}>📋</div>
          <p>No policies published yet. Click "+ New Policy" to get started.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {policies.map(p => (
            <div key={p.id} className="glass-panel" style={{ padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: `${catColor[p.category] ?? "#64748b"}22`, color: catColor[p.category] ?? "#64748b", border: `1px solid ${catColor[p.category] ?? "#64748b"}44` }}>
                      {p.category}
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                      {new Date(p.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "white", margin: 0 }}>{p.title}</h3>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => openEdit(p)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--glass-border)", background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.82rem" }}>✏️ Edit</button>
                  <button onClick={() => setDeleteTarget(p)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "var(--danger)", cursor: "pointer", fontSize: "0.82rem" }}>🗑</button>
                </div>
              </div>
              <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0, fontSize: "0.9rem" }}>
                {p.content.length > 300 ? p.content.slice(0, 300) + "…" : p.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Form drawer */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowForm(false)}>
          <div ref={modalRef} style={{ background: "var(--bg-secondary)", border: "1px solid var(--glass-border)", borderRadius: 20, padding: 32, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{editing ? "Edit Policy" : "New Policy"}</h2>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "1px solid var(--glass-border)", color: "var(--text-secondary)", width: 34, height: 34, borderRadius: 8, cursor: "pointer" }}>✕</button>
            </div>
            <form onSubmit={save}>
              <div className={styles.formGroup}>
                <label>Title *</label>
                <input className="premium-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required placeholder="e.g. Annual Leave Policy 2025" />
              </div>
              <div className={styles.formGroup}>
                <label>Category *</label>
                <select className="premium-input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Content *</label>
                <textarea className="premium-input" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} required rows={7} placeholder="Write the full policy text here…" style={{ resize: "vertical", lineHeight: 1.7 }} />
              </div>
              <button type="submit" className={styles.primaryBtn} disabled={saving}>{saving ? "Saving…" : "📋 Publish Policy"}</button>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setDeleteTarget(null)}>
          <div style={{ background: "var(--bg-secondary)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 20, padding: 36, maxWidth: 420, textAlign: "center" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🗑</div>
            <h2 style={{ marginBottom: 10 }}>Delete Policy?</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}><strong style={{ color: "white" }}>{deleteTarget.title}</strong> will be permanently removed.</p>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ flex: 1, padding: 14, borderRadius: 10, background: "var(--glass-bg)", border: "1px solid var(--glass-border)", color: "var(--text-primary)", cursor: "pointer", fontFamily: "Outfit,sans-serif" }}>Cancel</button>
              <button onClick={del} style={{ flex: 1, padding: 14, borderRadius: 10, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "var(--danger)", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontWeight: 600 }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
