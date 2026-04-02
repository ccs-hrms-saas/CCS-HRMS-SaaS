"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "../../dashboard.module.css";
import userStyles from "./users.module.css";

interface Profile {
  id: string;
  full_name: string;
  role: string;
  manager_id: string | null;
}

const emptyForm = { full_name: "", email: "", password: "", role: "employee", manager_id: "" };

export default function AdminUsers() {
  const [users, setUsers]     = useState<Profile[]>([]);
  const [managers, setManagers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState(emptyForm);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from("profiles").select("*").order("created_at");
    setUsers(data ?? []);
    setManagers((data ?? []).filter((u: Profile) => u.role === "admin" || u.role === "superadmin"));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  /* ── Create employee ── */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    try {
      const res = await fetch("/api/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Failed to create user"); }
      else {
        setSuccess(`✅ ${form.full_name} has been added successfully!`);
        setForm(emptyForm);
        setShowForm(false);
        await load();
        setTimeout(() => setSuccess(""), 4000);
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setSaving(false);
  };

  /* ── Update role ── */
  const updateRole = async (id: string, role: string) => {
    await supabase.from("profiles").update({ role }).eq("id", id);
    load();
  };

  /* ── Update manager ── */
  const updateManager = async (id: string, manager_id: string) => {
    await supabase.from("profiles").update({ manager_id: manager_id || null }).eq("id", id);
    load();
  };

  /* ── Delete user ── */
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name}? This cannot be undone.`)) return;
    setDeleting(id);
    await fetch("/api/delete-user", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: id }),
    });
    setDeleting(null);
    load();
  };

  const roleStyle = (role: string) =>
    role === "superadmin" ? styles.badgeDanger : role === "admin" ? styles.badgeWarning : styles.badgeInfo;
  const roleColor = (role: string) =>
    role === "superadmin" ? "#ef4444" : role === "admin" ? "#f59e0b" : "#6366f1";

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner}></div></div>;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>User Management</h1>
          <p>Add employees, assign roles and reporting lines</p>
        </div>
        <button className={styles.primaryBtn} style={{ width: "auto", padding: "12px 24px" }} onClick={() => { setShowForm(true); setError(""); }}>
          + Add Employee
        </button>
      </div>

      {/* Success Banner */}
      {success && (
        <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "var(--success)", padding: "14px 20px", borderRadius: 12, marginBottom: 24, fontSize: "0.9rem" }}>
          {success}
        </div>
      )}

      {/* Stat cards */}
      <div className={styles.statsGrid} style={{ marginBottom: 28 }}>
        {[
          { label: "Total Users", value: users.length, icon: "👥", cls: "badgeInfo" },
          { label: "Employees",   value: users.filter(u => u.role === "employee").length, icon: "🧑‍💼", cls: "badgeInfo" },
          { label: "Admins",      value: users.filter(u => u.role === "admin" || u.role === "superadmin").length, icon: "🛡️", cls: "badgeWarning" },
        ].map(s => (
          <div key={s.label} className={`glass-panel ${styles.statCard}`}>
            <div className={styles.statIcon}>{s.icon}</div>
            <div className={styles.statValue}>{s.value}</div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Employee Cards Grid */}
      <div className={userStyles.usersGrid}>
        {users.map((u) => (
          <div key={u.id} className={`glass-panel ${userStyles.userCard}`}>
            <div className={userStyles.userCardHeader}>
              <div className={userStyles.userAvatar} style={{ background: `linear-gradient(135deg, ${roleColor(u.role)}, ${roleColor(u.role)}88)` }}>
                {u.full_name?.charAt(0)?.toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={userStyles.userCardName}>{u.full_name}</div>
                <span className={`${styles.statBadge} ${roleStyle(u.role)}`}>{u.role}</span>
              </div>
              <button
                onClick={() => handleDelete(u.id, u.full_name)}
                disabled={deleting === u.id}
                className={userStyles.deleteBtn}
                title="Remove user"
              >
                {deleting === u.id ? "…" : "🗑"}
              </button>
            </div>

            <div className={userStyles.userCardBody}>
              <div className={userStyles.fieldRow}>
                <label>Role</label>
                <select
                  className="premium-input"
                  style={{ padding: "6px 10px", fontSize: "0.82rem" }}
                  value={u.role}
                  onChange={e => updateRole(u.id, e.target.value)}
                >
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Super Admin</option>
                </select>
              </div>

              {u.role === "employee" && (
                <div className={userStyles.fieldRow}>
                  <label>Reports To</label>
                  <select
                    className="premium-input"
                    style={{ padding: "6px 10px", fontSize: "0.82rem" }}
                    value={u.manager_id ?? ""}
                    onChange={e => updateManager(u.id, e.target.value)}
                  >
                    <option value="">— No Manager —</option>
                    {managers.filter(m => m.id !== u.id).map(m => (
                      <option key={m.id} value={m.id}>{m.full_name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Add Employee Slide-in Panel ── */}
      {showForm && (
        <div className={userStyles.overlay} onClick={() => setShowForm(false)}>
          <div className={userStyles.drawer} onClick={e => e.stopPropagation()}>
            <div className={userStyles.drawerHeader}>
              <h2>Add New Employee</h2>
              <button onClick={() => setShowForm(false)} className={userStyles.closeBtn}>✕</button>
            </div>

            {error && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--danger)", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: "0.85rem" }}>
                ⚠️ {error}
              </div>
            )}

            <form onSubmit={handleCreate}>
              <div className={styles.formGroup}>
                <label>Full Name *</label>
                <input className="premium-input" placeholder="e.g. Ravi Kumar" value={form.full_name}
                  onChange={e => setForm({ ...form, full_name: e.target.value })} required />
              </div>
              <div className={styles.formGroup}>
                <label>Email Address *</label>
                <input type="email" className="premium-input" placeholder="ravi@company.com" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div className={styles.formGroup}>
                <label>Temporary Password *</label>
                <input type="password" className="premium-input" placeholder="Min 6 characters" value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} />
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>
                  Employee can change this after first login
                </span>
              </div>
              <div className={styles.formGroup}>
                <label>Role *</label>
                <select className="premium-input" value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Super Admin</option>
                </select>
              </div>
              {form.role === "employee" && (
                <div className={styles.formGroup}>
                  <label>Reports To (Line Manager)</label>
                  <select className="premium-input" value={form.manager_id}
                    onChange={e => setForm({ ...form, manager_id: e.target.value })}>
                    <option value="">— No Manager —</option>
                    {managers.map(m => (
                      <option key={m.id} value={m.id}>{m.full_name}</option>
                    ))}
                  </select>
                </div>
              )}
              <button type="submit" className={styles.primaryBtn} disabled={saving} style={{ marginTop: 8 }}>
                {saving ? "Creating Account…" : "✅ Create Employee Account"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
