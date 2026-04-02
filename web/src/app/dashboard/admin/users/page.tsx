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
  const [users, setUsers]       = useState<Profile[]>([]);
  const [managers, setManagers] = useState<Profile[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(emptyForm);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");

  // Edit state
  const [editUser, setEditUser]   = useState<Profile | null>(null);
  const [editName, setEditName]   = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError]   = useState("");

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting]         = useState(false);

  const load = async () => {
    const { data } = await supabase.from("profiles").select("*").order("full_name");
    setUsers(data ?? []);
    setManagers((data ?? []).filter((u: Profile) => u.role === "admin" || u.role === "superadmin"));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  /* ── Create ── */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    const res = await fetch("/api/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error || "Failed to create user"); }
    else {
      setSuccess(`✅ ${form.full_name} added successfully!`);
      setForm(emptyForm); setShowForm(false);
      await load();
      setTimeout(() => setSuccess(""), 4000);
    }
    setSaving(false);
  };

  /* ── Edit ── */
  const openEdit = (u: Profile) => {
    setEditUser(u);
    setEditName(u.full_name);
    setEditEmail("");
    setEditError("");
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setEditSaving(true); setEditError("");
    const res = await fetch("/api/update-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: editUser.id,
        full_name: editName,
        email: editEmail || undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) { setEditError(json.error || "Update failed"); }
    else {
      setEditUser(null);
      setSuccess("✅ Employee updated successfully!");
      await load();
      setTimeout(() => setSuccess(""), 4000);
    }
    setEditSaving(false);
  };

  /* ── Delete ── */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await fetch("/api/delete-user", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: deleteTarget.id }),
    });
    setDeleteTarget(null);
    setDeleting(false);
    setSuccess("✅ Employee removed.");
    await load();
    setTimeout(() => setSuccess(""), 4000);
  };

  /* ── Role / Manager inline ── */
  const updateRole    = async (id: string, role: string)       => { await supabase.from("profiles").update({ role }).eq("id", id); load(); };
  const updateManager = async (id: string, mgr: string)        => { await supabase.from("profiles").update({ manager_id: mgr || null }).eq("id", id); load(); };

  const roleStyle = (r: string) => r === "superadmin" ? styles.badgeDanger : r === "admin" ? styles.badgeWarning : styles.badgeInfo;
  const roleColor = (r: string) => r === "superadmin" ? "#ef4444" : r === "admin" ? "#f59e0b" : "#6366f1";

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner}></div></div>;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div><h1>User Management</h1><p>Add employees, assign roles and reporting lines</p></div>
        <button className={styles.primaryBtn} style={{ width:"auto", padding:"12px 24px" }} onClick={() => { setShowForm(true); setError(""); }}>
          + Add Employee
        </button>
      </div>

      {success && (
        <div style={{ background:"rgba(16,185,129,0.1)", border:"1px solid rgba(16,185,129,0.3)", color:"var(--success)", padding:"14px 20px", borderRadius:12, marginBottom:24, fontSize:"0.9rem" }}>
          {success}
        </div>
      )}

      <div className={styles.statsGrid} style={{ marginBottom:28 }}>
        {[
          { label:"Total Users", value:users.length,        icon:"👥" },
          { label:"Employees",   value:users.filter(u=>u.role==="employee").length, icon:"🧑‍💼" },
          { label:"Admins",      value:users.filter(u=>u.role==="admin"||u.role==="superadmin").length, icon:"🛡️" },
        ].map(s => (
          <div key={s.label} className={`glass-panel ${styles.statCard}`}>
            <div className={styles.statIcon}>{s.icon}</div>
            <div className={styles.statValue}>{s.value}</div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className={userStyles.usersGrid}>
        {users.map(u => (
          <div key={u.id} className={`glass-panel ${userStyles.userCard}`}>
            <div className={userStyles.userCardHeader}>
              <div className={userStyles.userAvatar} style={{ background:`linear-gradient(135deg,${roleColor(u.role)},${roleColor(u.role)}88)` }}>
                {u.full_name?.charAt(0)?.toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div className={userStyles.userCardName}>{u.full_name}</div>
                <span className={`${styles.statBadge} ${roleStyle(u.role)}`}>{u.role}</span>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={() => openEdit(u)} className={userStyles.editBtn} title="Edit employee">✏️</button>
                <button onClick={() => setDeleteTarget(u)} className={userStyles.deleteBtn} title="Delete employee">🗑</button>
              </div>
            </div>

            <div className={userStyles.userCardBody}>
              <div className={userStyles.fieldRow}>
                <label>Role</label>
                <select className="premium-input" style={{ padding:"6px 10px", fontSize:"0.82rem" }}
                  value={u.role} onChange={e => updateRole(u.id, e.target.value)}>
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Super Admin</option>
                </select>
              </div>
              {u.role === "employee" && (
                <div className={userStyles.fieldRow}>
                  <label>Reports To</label>
                  <select className="premium-input" style={{ padding:"6px 10px", fontSize:"0.82rem" }}
                    value={u.manager_id ?? ""} onChange={e => updateManager(u.id, e.target.value)}>
                    <option value="">— No Manager —</option>
                    {managers.filter(m => m.id !== u.id).map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Add Employee Drawer ── */}
      {showForm && (
        <div className={userStyles.overlay} onClick={() => setShowForm(false)}>
          <div className={userStyles.drawer} onClick={e => e.stopPropagation()}>
            <div className={userStyles.drawerHeader}>
              <h2>Add New Employee</h2>
              <button onClick={() => setShowForm(false)} className={userStyles.closeBtn}>✕</button>
            </div>
            {error && <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", color:"var(--danger)", padding:"12px 16px", borderRadius:10, marginBottom:20, fontSize:"0.85rem" }}>⚠️ {error}</div>}
            <form onSubmit={handleCreate}>
              <div className={styles.formGroup}><label>Full Name *</label><input className="premium-input" value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} required /></div>
              <div className={styles.formGroup}><label>Email *</label><input type="email" className="premium-input" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required /></div>
              <div className={styles.formGroup}><label>Temporary Password *</label><input type="password" className="premium-input" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required minLength={6} /></div>
              <div className={styles.formGroup}>
                <label>Role *</label>
                <select className="premium-input" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
                  <option value="employee">Employee</option><option value="admin">Admin</option><option value="superadmin">Super Admin</option>
                </select>
              </div>
              {form.role==="employee" && (
                <div className={styles.formGroup}><label>Reports To</label>
                  <select className="premium-input" value={form.manager_id} onChange={e=>setForm({...form,manager_id:e.target.value})}>
                    <option value="">— No Manager —</option>
                    {managers.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                </div>
              )}
              <button type="submit" className={styles.primaryBtn} disabled={saving}>{saving?"Creating…":"✅ Create Employee Account"}</button>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Employee Drawer ── */}
      {editUser && (
        <div className={userStyles.overlay} onClick={() => setEditUser(null)}>
          <div className={userStyles.drawer} onClick={e => e.stopPropagation()}>
            <div className={userStyles.drawerHeader}>
              <h2>Edit Employee</h2>
              <button onClick={() => setEditUser(null)} className={userStyles.closeBtn}>✕</button>
            </div>
            {editError && <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", color:"var(--danger)", padding:"12px 16px", borderRadius:10, marginBottom:20, fontSize:"0.85rem" }}>⚠️ {editError}</div>}
            <form onSubmit={handleEdit}>
              <div className={styles.formGroup}>
                <label>Full Name *</label>
                <input className="premium-input" value={editName} onChange={e=>setEditName(e.target.value)} required />
              </div>
              <div className={styles.formGroup}>
                <label>New Email <span style={{ color:"var(--text-secondary)", fontSize:"0.8rem" }}>(leave blank to keep current)</span></label>
                <input type="email" className="premium-input" value={editEmail} onChange={e=>setEditEmail(e.target.value)} placeholder="new@email.com" />
              </div>
              <button type="submit" className={styles.primaryBtn} disabled={editSaving}>{editSaving?"Saving…":"💾 Save Changes"}</button>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteTarget && (
        <div className={userStyles.overlay} onClick={() => setDeleteTarget(null)}>
          <div className={userStyles.confirmModal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:"2.5rem", marginBottom:16 }}>⚠️</div>
            <h2 style={{ marginBottom:10 }}>Delete Employee?</h2>
            <p style={{ color:"var(--text-secondary)", marginBottom:28, lineHeight:1.6 }}>
              Are you sure you want to remove <strong style={{ color:"white" }}>{deleteTarget.full_name}</strong>?<br/>
              This will permanently delete their account and cannot be undone.
            </p>
            <div style={{ display:"flex", gap:12 }}>
              <button onClick={() => setDeleteTarget(null)}
                style={{ flex:1, padding:14, borderRadius:10, background:"var(--glass-bg)", border:"1px solid var(--glass-border)", color:"var(--text-primary)", cursor:"pointer", fontFamily:"Outfit,sans-serif", fontSize:"0.9rem" }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                style={{ flex:1, padding:14, borderRadius:10, background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.4)", color:"var(--danger)", cursor:"pointer", fontFamily:"Outfit,sans-serif", fontSize:"0.9rem", fontWeight:"600" }}>
                {deleting ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
