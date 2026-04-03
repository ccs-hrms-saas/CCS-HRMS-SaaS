"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import styles from "../../dashboard.module.css";
import userStyles from "./users.module.css";

interface Profile {
  id: string;
  full_name: string;
  role: string;
  manager_id: string | null;
  is_active: boolean;
  left_on: string | null;
}

const emptyForm = { full_name: "", email: "", password: "", role: "employee", manager_id: "" };

export default function AdminUsers() {
  const { profile }               = useAuth();
  const [users, setUsers]       = useState<Profile[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(emptyForm);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");

  const [editUser, setEditUser]             = useState<Profile | null>(null);
  const [editName, setEditName]             = useState("");
  const [editEmail, setEditEmail]           = useState("");
  const [editPassword, setEditPassword]     = useState("");
  const [editSaving, setEditSaving]         = useState(false);
  const [editError, setEditError]           = useState("");

  // Deactivate / permanent delete targets
  const [deactivateTarget, setDeactivateTarget] = useState<Profile | null>(null);
  const [permDeleteTarget, setPermDeleteTarget] = useState<Profile | null>(null);
  const [compOffTarget, setCompOffTarget]       = useState<Profile | null>(null);
  const [compOffForm, setCompOffForm]           = useState({ days: 1, expires_in: 30, reason: "Weekend Support" });
  const [creditTarget, setCreditTarget]         = useState<Profile | null>(null);
  const [creditForm, setCreditForm]             = useState({ type_name: "Earned Leave (EL)", days: 1, add_to_used: false });
  const [actionLoading, setActionLoading]       = useState(false);

  const load = async () => {
    const { data } = await supabase.from("profiles").select("*").order("full_name");
    setUsers(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const activeUsers   = users.filter(u => u.is_active !== false);
  const inactiveUsers = users.filter(u => u.is_active === false);
  const managers      = activeUsers.filter(u => u.role === "admin" || u.role === "superadmin");

  /* ── Create ── */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    const res = await fetch("/api/create-user", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error || "Failed to create user"); }
    else {
      setSuccess(`✅ ${form.full_name} added successfully!`);
      setForm(emptyForm); setShowForm(false); await load();
      setTimeout(() => setSuccess(""), 4000);
    }
    setSaving(false);
  };

  /* ── Edit ── */
  const openEdit = (u: Profile) => { setEditUser(u); setEditName(u.full_name); setEditEmail(""); setEditPassword(""); setEditError(""); };
  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editUser) return;
    setEditSaving(true); setEditError("");
    const res = await fetch("/api/update-user", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: editUser.id, full_name: editName, email: editEmail || undefined, password: editPassword || undefined }),
    });
    const json = await res.json();
    if (!res.ok) { setEditError(json.error || "Update failed"); }
    else { setEditUser(null); setSuccess("✅ Employee updated!"); await load(); setTimeout(() => setSuccess(""), 4000); }
    setEditSaving(false);
  };

  /* ── Soft Deactivate (Mark as Left) ── */
  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setActionLoading(true);
    const res = await fetch("/api/delete-user", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: deactivateTarget.id }),
    });
    const json = await res.json();
    if (!res.ok) { setSuccess(`❌ Error: ${json.error}`); }
    else { setSuccess(`✅ ${deactivateTarget.full_name} marked as left. Records preserved.`); }
    setDeactivateTarget(null); setActionLoading(false); await load();
    setTimeout(() => setSuccess(""), 5000);
  };

  /* ── Restore Employee ── */
  const handleRestore = async (u: Profile) => {
    await supabase.from("profiles").update({ is_active: true, left_on: null }).eq("id", u.id);
    setSuccess(`✅ ${u.full_name} restored as active employee.`);
    await load(); setTimeout(() => setSuccess(""), 4000);
  };

  /* ── Permanent Delete ── */
  const handlePermDelete = async () => {
    if (!permDeleteTarget) return;
    setActionLoading(true);
    await fetch("/api/delete-user", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: permDeleteTarget.id, permanent: true }),
    });
    setSuccess(`🗑 ${permDeleteTarget.full_name} permanently removed.`);
    setPermDeleteTarget(null); setActionLoading(false); await load();
    setTimeout(() => setSuccess(""), 4000);
  };

  /* ── Grant Comp Off ── */
  const handleGrantCompOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compOffTarget || !profile) return;
    setActionLoading(true);
    
    // Calculate expiry date
    const d = new Date();
    d.setDate(d.getDate() + compOffForm.expires_in);

    await supabase.from("comp_off_grants").insert({
      user_id: compOffTarget.id,
      granted_by: profile.id,
      days_granted: compOffForm.days,
      expires_on: d.toISOString().split("T")[0],
      reason: compOffForm.reason
    });

    setSuccess(`🎁 Granted ${compOffForm.days} Comp-Off day(s) to ${compOffTarget.full_name}.`);
    setCompOffTarget(null); setActionLoading(false);
    setTimeout(() => setSuccess(""), 4000);
  };

  /* ── Credit Leave Balance ── */
  const handleCreditLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditTarget || !profile) return;
    setActionLoading(true);
    
    // Get leave type ID securely
    const { data: lt } = await supabase.from("leave_types").select("id").eq("name", creditForm.type_name).single();
    if (!lt) { setError("Leave type not found"); setActionLoading(false); return; }

    const fy = new Date().getMonth() < 3 ? new Date().getFullYear() - 1 : new Date().getFullYear();

    // Fetch existing ledger
    const { data: existing } = await supabase.from("leave_balances")
      .select("*").eq("user_id", creditTarget.id).eq("leave_type_id", lt.id).eq("financial_year", fy).single();

    if (existing) {
      const updatePayload: any = creditForm.add_to_used 
        ? { used: existing.used + creditForm.days }
        : { accrued: existing.accrued + creditForm.days };
      await supabase.from("leave_balances").update(updatePayload).eq("id", existing.id);
    } else {
       const insertPayload: any = {
         user_id: creditTarget.id, leave_type_id: lt.id, financial_year: fy,
         accrued: creditForm.add_to_used ? 0 : creditForm.days,
         used: creditForm.add_to_used ? creditForm.days : 0
       };
       await supabase.from("leave_balances").insert(insertPayload);
    }

    setSuccess(`💳 Credited ${creditForm.days} ${creditForm.type_name}(s) to ${creditTarget.full_name}.`);
    setCreditTarget(null); setActionLoading(false);
    setTimeout(() => setSuccess(""), 4000);
  };

  /* ── Role / Manager inline ── */
  const updateRole    = async (id: string, role: string) => { await supabase.from("profiles").update({ role }).eq("id", id); load(); };
  const updateManager = async (id: string, mgr: string) => { await supabase.from("profiles").update({ manager_id: mgr || null }).eq("id", id); load(); };

  const roleStyle = (r: string) => r === "superadmin" ? styles.badgeDanger : r === "admin" ? styles.badgeWarning : styles.badgeInfo;
  const roleColor = (r: string) => r === "superadmin" ? "#ef4444" : r === "admin" ? "#f59e0b" : "#6366f1";

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner}></div></div>;

  const UserCard = ({ u, inactive = false }: { u: Profile; inactive?: boolean }) => (
    <div key={u.id} className={`glass-panel ${userStyles.userCard}`}
      style={inactive ? { opacity: 0.6, border: "1px solid rgba(239,68,68,0.2)" } : {}}>
      <div className={userStyles.userCardHeader}>
        <div className={userStyles.userAvatar}
          style={{ background: inactive ? "linear-gradient(135deg,#4b5563,#374151)" : `linear-gradient(135deg,${roleColor(u.role)},${roleColor(u.role)}88)` }}>
          {u.full_name?.charAt(0)?.toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={userStyles.userCardName}>{u.full_name}</div>
          {inactive
            ? <span style={{ fontSize: "0.72rem", color: "#ef4444" }}>Left: {u.left_on ? new Date(u.left_on).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Unknown"}</span>
            : <span className={`${styles.statBadge} ${roleStyle(u.role)}`}>{u.role}</span>}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {!inactive && (
             <>
               <button onClick={() => setCreditTarget(u)} className={userStyles.editBtn} title="Credit Leaves" style={{ background: "rgba(99,102,241,0.1)", borderColor: "rgba(99,102,241,0.3)", color: "var(--accent-primary)" }}>💳</button>
               <button onClick={() => setCompOffTarget(u)} className={userStyles.editBtn} title="Grant Comp Off" style={{ background: "rgba(16,185,129,0.1)", borderColor: "rgba(16,185,129,0.3)", color: "var(--success)" }}>🎁</button>
               <button onClick={() => openEdit(u)} className={userStyles.editBtn} title="Edit">✏️</button>
             </>
          )}
          {inactive
            ? <>
                <button onClick={() => handleRestore(u)} className={userStyles.editBtn} title="Re-hire" style={{ fontSize: "0.75rem" }}>↩ Restore</button>
                <button onClick={() => setPermDeleteTarget(u)} className={userStyles.deleteBtn} title="Permanently delete">🗑</button>
              </>
            : <button onClick={() => setDeactivateTarget(u)} className={userStyles.deleteBtn} title="Mark as left">🚪</button>
          }
        </div>
      </div>

      {!inactive && (
        <div className={userStyles.userCardBody}>
          <div className={userStyles.fieldRow}>
            <label>Role</label>
            <select className="premium-input" style={{ padding: "6px 10px", fontSize: "0.82rem" }}
              value={u.role} onChange={e => updateRole(u.id, e.target.value)}>
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Super Admin</option>
            </select>
          </div>
          {u.role === "employee" && (
            <div className={userStyles.fieldRow}>
              <label>Reports To</label>
              <select className="premium-input" style={{ padding: "6px 10px", fontSize: "0.82rem" }}
                value={u.manager_id ?? ""} onChange={e => updateManager(u.id, e.target.value)}>
                <option value="">— No Manager —</option>
                {managers.filter(m => m.id !== u.id).map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div><h1>User Management</h1><p>Manage your team and employment records</p></div>
        <button className={styles.primaryBtn} style={{ width: "auto", padding: "12px 24px" }} onClick={() => { setShowForm(true); setError(""); }}>
          + Add Employee
        </button>
      </div>

      {success && (
        <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "var(--success)", padding: "14px 20px", borderRadius: 12, marginBottom: 24, fontSize: "0.9rem" }}>
          {success}
        </div>
      )}

      <div className={styles.statsGrid} style={{ marginBottom: 28 }}>
        {[
          { label: "Active Staff",  value: activeUsers.length,                                                icon: "👥" },
          { label: "Employees",     value: activeUsers.filter(u => u.role === "employee").length,             icon: "🧑‍💼" },
          { label: "Admins",        value: activeUsers.filter(u => u.role === "admin" || u.role === "superadmin").length, icon: "🛡️" },
          { label: "Former Staff",  value: inactiveUsers.length,                                              icon: "📁" },
        ].map(s => (
          <div key={s.label} className={`glass-panel ${styles.statCard}`}>
            <div className={styles.statIcon}>{s.icon}</div>
            <div className={styles.statValue}>{s.value}</div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Active Employees */}
      <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 16, color: "var(--text-secondary)" }}>
        🟢 Active Staff ({activeUsers.length})
      </h2>
      <div className={userStyles.usersGrid} style={{ marginBottom: 40 }}>
        {activeUsers.map(u => <UserCard key={u.id} u={u} />)}
      </div>

      {/* Former Employees */}
      {inactiveUsers.length > 0 && (
        <>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 16, color: "var(--text-secondary)" }}>
            📁 Former Staff ({inactiveUsers.length}) — Records Preserved
          </h2>
          <div className={userStyles.usersGrid}>
            {inactiveUsers.map(u => <UserCard key={u.id} u={u} inactive />)}
          </div>
        </>
      )}

      {/* ── Add Employee Drawer ── */}
      {showForm && (
        <div className={userStyles.overlay} onClick={() => setShowForm(false)}>
          <div className={userStyles.drawer} onClick={e => e.stopPropagation()}>
            <div className={userStyles.drawerHeader}>
              <h2>Add New Employee</h2>
              <button onClick={() => setShowForm(false)} className={userStyles.closeBtn}>✕</button>
            </div>
            {error && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--danger)", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: "0.85rem" }}>⚠️ {error}</div>}
            <form onSubmit={handleCreate}>
              <div className={styles.formGroup}><label>Full Name *</label><input className="premium-input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required /></div>
              <div className={styles.formGroup}><label>Email *</label><input type="email" className="premium-input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></div>
              <div className={styles.formGroup}><label>Temporary Password *</label><input type="password" className="premium-input" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} /></div>
              <div className={styles.formGroup}>
                <label>Role *</label>
                <select className="premium-input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="employee">Employee</option><option value="admin">Admin</option><option value="superadmin">Super Admin</option>
                </select>
              </div>
              {form.role === "employee" && (
                <div className={styles.formGroup}><label>Reports To</label>
                  <select className="premium-input" value={form.manager_id} onChange={e => setForm({ ...form, manager_id: e.target.value })}>
                    <option value="">— No Manager —</option>
                    {managers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                </div>
              )}
              <button type="submit" className={styles.primaryBtn} disabled={saving}>{saving ? "Creating…" : "✅ Create Employee Account"}</button>
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
            {editError && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--danger)", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: "0.85rem" }}>⚠️ {editError}</div>}
            <form onSubmit={handleEdit}>
              <div className={styles.formGroup}><label>Full Name *</label><input className="premium-input" value={editName} onChange={e => setEditName(e.target.value)} required /></div>
              <div className={styles.formGroup}>
                <label>New Email <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>(leave blank to keep current)</span></label>
                <input type="email" className="premium-input" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="new@email.com" />
              </div>
              <div className={styles.formGroup}>
                <label>Reset Password <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>(leave blank to keep current)</span></label>
                <input type="password" className="premium-input" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="Min 6 characters" minLength={6} />
              </div>
              <button type="submit" className={styles.primaryBtn} disabled={editSaving}>{editSaving ? "Saving…" : "💾 Save Changes"}</button>
            </form>
          </div>
        </div>
      )}

      {/* ── Mark as Left Confirm ── */}
      {deactivateTarget && (
        <div className={userStyles.overlay} onClick={() => setDeactivateTarget(null)}>
          <div className={userStyles.confirmModal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: "2.5rem", marginBottom: 16 }}>🚪</div>
            <h2 style={{ marginBottom: 10 }}>Mark as Left?</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: 28, lineHeight: 1.6 }}>
              <strong style={{ color: "white" }}>{deactivateTarget.full_name}</strong> will be moved to Former Staff.<br />
              All their attendance records and history will be <strong style={{ color: "var(--success)" }}>preserved</strong> for compliance.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setDeactivateTarget(null)}
                style={{ flex: 1, padding: 14, borderRadius: 10, background: "var(--glass-bg)", border: "1px solid var(--glass-border)", color: "var(--text-primary)", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontSize: "0.9rem" }}>
                Cancel
              </button>
              <button onClick={handleDeactivate} disabled={actionLoading}
                style={{ flex: 1, padding: 14, borderRadius: 10, background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)", color: "#f59e0b", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontSize: "0.9rem", fontWeight: "600" }}>
                {actionLoading ? "Processing…" : "Yes, Mark as Left"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Permanent Delete Confirm ── */}
      {permDeleteTarget && (
        <div className={userStyles.overlay} onClick={() => setPermDeleteTarget(null)}>
          <div className={userStyles.confirmModal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: "2.5rem", marginBottom: 16 }}>⚠️</div>
            <h2 style={{ marginBottom: 10 }}>Permanently Delete?</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: 28, lineHeight: 1.6 }}>
              This will <strong style={{ color: "var(--danger)" }}>permanently erase</strong> all records for{" "}
              <strong style={{ color: "white" }}>{permDeleteTarget.full_name}</strong>.<br />
              This action <strong style={{ color: "var(--danger)" }}>cannot be undone</strong>.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setPermDeleteTarget(null)}
                style={{ flex: 1, padding: 14, borderRadius: 10, background: "var(--glass-bg)", border: "1px solid var(--glass-border)", color: "var(--text-primary)", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontSize: "0.9rem" }}>
                Cancel
              </button>
              <button onClick={handlePermDelete} disabled={actionLoading}
                style={{ flex: 1, padding: 14, borderRadius: 10, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "var(--danger)", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontSize: "0.9rem", fontWeight: "600" }}>
                {actionLoading ? "Deleting…" : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Comp-Off Grant Modal ── */}
      {compOffTarget && (
        <div className={userStyles.overlay} onClick={() => setCompOffTarget(null)}>
          <div className={userStyles.drawer} style={{maxWidth: 420}} onClick={e => e.stopPropagation()}>
            <div className={userStyles.drawerHeader}>
              <h2 style={{ fontSize: "1.1rem" }}>🎁 Grant Comp-Off to {compOffTarget.full_name?.split(" ")[0]}</h2>
              <button onClick={() => setCompOffTarget(null)} className={userStyles.closeBtn}>✕</button>
            </div>
            <form onSubmit={handleGrantCompOff}>
              <div className={styles.formGroup}>
                <label>Days</label>
                <input type="number" step="0.5" className="premium-input" value={compOffForm.days} onChange={e => setCompOffForm({...compOffForm, days: Number(e.target.value)})} required />
              </div>
               <div className={styles.formGroup}>
                <label>Expires In (Days)</label>
                <input type="number" className="premium-input" value={compOffForm.expires_in} onChange={e => setCompOffForm({...compOffForm, expires_in: Number(e.target.value)})} required />
              </div>
               <div className={styles.formGroup}>
                <label>Reason / Project Worked</label>
                <textarea className="premium-input" rows={2} value={compOffForm.reason} onChange={e => setCompOffForm({...compOffForm, reason: e.target.value})} required />
              </div>
              <button type="submit" className={styles.primaryBtn} disabled={actionLoading} style={{width:'100%', background: "linear-gradient(90deg, #10b981, #059669)"}}>
                {actionLoading ? "Granting..." : "Grant Comp-Off"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Credit Leave Ledger Modal ── */}
      {creditTarget && (
        <div className={userStyles.overlay} onClick={() => setCreditTarget(null)}>
          <div className={userStyles.drawer} style={{maxWidth: 420}} onClick={e => e.stopPropagation()}>
            <div className={userStyles.drawerHeader}>
              <h2 style={{ fontSize: "1.1rem" }}>💳 Adjust Leave Ledger for {creditTarget.full_name?.split(" ")[0]}</h2>
              <button onClick={() => setCreditTarget(null)} className={userStyles.closeBtn}>✕</button>
            </div>
            <div style={{fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 16}}>
              Modify the accrued/used balance for this employee for the active financial year.
            </div>
            {error && <div style={{color: 'var(--danger)', marginBottom: 10, fontSize: '0.85rem'}}>{error}</div>}
            <form onSubmit={handleCreditLeave}>
              <div className={styles.formGroup}>
                <label>Leave Type</label>
                <select className="premium-input" value={creditForm.type_name} onChange={e => setCreditForm({...creditForm, type_name: e.target.value})}>
                  <option>Earned Leave (EL)</option>
                  <option>Casual Leave (CL)</option>
                  <option>Sick Leave (SL)</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Action</label>
                <select className="premium-input" value={creditForm.add_to_used ? "used" : "accrued"} onChange={e => setCreditForm({...creditForm, add_to_used: e.target.value === "used"})}>
                  <option value="accrued">Adding to Accrued (Giving them leaves)</option>
                  <option value="used">Adding to Used (Deducting leaves manually)</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Amount (Days)</label>
                <input type="number" step="0.5" className="premium-input" value={creditForm.days} onChange={e => setCreditForm({...creditForm, days: Number(e.target.value)})} required />
              </div>
              
              <button type="submit" className={styles.primaryBtn} disabled={actionLoading} style={{width:'100%', background: "linear-gradient(90deg, #6366f1, #4f46e5)"}}>
                {actionLoading ? "Processing..." : "Update Ledger Balance"}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
