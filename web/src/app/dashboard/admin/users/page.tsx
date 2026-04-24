"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useModules } from "@/context/ModulesContext";
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

const DAYS_LONG = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

const emptyForm = { 
  full_name: "", email: "", password: "", role: "employee", manager_id: "",
  phone_number: "", gender: "Male", designation: "", joining_date: "", remuneration: "",
  weekly_off_day: "", hours_per_day: "", shift_start_time: "", shift_end_time: "",
};

export default function AdminUsers() {
  const { profile }               = useAuth();
  const { getProps }               = useModules();
  const leaveProps                 = getProps("leave_settings");
  // Tier 3 Advanced only: per-employee hours override
  const canSetPerEmployeeHours     = !!(leaveProps.per_employee_hours);
  // Tier 3 Advanced only: per-employee shift timing (prescribed in/out times)
  const canUseShiftTiming          = !!(leaveProps.per_employee_shift);
  const [users, setUsers]       = useState<Profile[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(emptyForm);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  const [letterFile, setLetterFile] = useState<File | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const [editUser, setEditUser]             = useState<any | null>(null);
  const [editForm, setEditForm]             = useState<any>({});
  const [editLetterFile, setEditLetterFile] = useState<File | null>(null);
  const [editSaving, setEditSaving]         = useState(false);
  const [editError, setEditError]           = useState("");
  // Each row: { date: string, file: File|null, existingUrl?: string }
  const [appraisalRows, setAppraisalRows]   = useState<{ date: string; file: File | null; existingUrl?: string }[]>([]);

  // Deactivate / permanent delete targets
  const [deactivateTarget, setDeactivateTarget] = useState<Profile | null>(null);
  const [permDeleteTarget, setPermDeleteTarget] = useState<Profile | null>(null);
  const [compOffTarget, setCompOffTarget]       = useState<Profile | null>(null);
  const [compOffForm, setCompOffForm]           = useState({ days: 1, expires_in: 30, reason: "Weekend Support" });
  const [creditTarget, setCreditTarget]         = useState<Profile | null>(null);
  const [creditForm, setCreditForm]             = useState({ type_name: "Earned Leave (EL)", days: 1, add_to_used: false });
  const [actionLoading, setActionLoading]       = useState(false);

  // Week off schedule config
  const [weekOffMode, setWeekOffMode] = useState<"fixed"|"rotating">("fixed");

  const load = async () => {
    const companyId = profile?.company_id;
    if (!companyId) { setLoading(false); return; }

    // Fetch employees AND work schedule settings together — guaranteed same tick
    const [{ data }, { data: sett }] = await Promise.all([
      supabase.from("profiles")
        .select("*")
        .eq("company_id", companyId)
        .is("system_role", null)
        .order("full_name"),
      supabase.from("app_settings")
        .select("week_off_type, hours_per_day")
        .eq("company_id", companyId)
        .single(),
    ]);

    setUsers(data ?? []);
    // This is what controls the "Weekly Off Day" field visibility in Add/Edit forms
    if (sett?.week_off_type) setWeekOffMode(sett.week_off_type);
    setLoading(false);
  };

  useEffect(() => {
    if (profile?.company_id) load();
  }, [profile?.company_id]);

  const isSuperAdmin = profile?.role === "superadmin";

  // Admins cannot see or manage superadmin accounts — only superadmins can
  const activeUsers   = users.filter(u => u.is_active !== false && (isSuperAdmin || u.role !== "superadmin"));
  const inactiveUsers = users.filter(u => u.is_active === false);
  // All active employees can be a reporting manager (not just admins)
  const managers      = activeUsers.filter(u => u.id !== profile?.id);

  // Track user IDs that have a pending approval so we can show ⏳ badge
  const [pendingRoles, setPendingRoles] = useState<Set<string>>(new Set());

  /* ── Create ── */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    
    let joining_letter_url = null;
    if (letterFile) {
       const uFileName = `${Date.now()}_${letterFile.name.replace(/[^a-zA-Z0-9.\-]/g, "_")}`;
       const { error: fErr } = await supabase.storage.from("employee-documents").upload(`joining_letters/${uFileName}`, letterFile);
       if (fErr) { setError("Failed to upload joining letter: " + fErr.message); setSaving(false); return; }
       const { data: urlData } = supabase.storage.from("employee-documents").getPublicUrl(`joining_letters/${uFileName}`);
       joining_letter_url = urlData.publicUrl;
    }

    const shiftHours = canUseShiftTiming && form.shift_start_time && form.shift_end_time
      ? (() => { const [h1,m1]=form.shift_start_time.split(":").map(Number); const [h2,m2]=form.shift_end_time.split(":").map(Number); const d=(h2*60+m2)-(h1*60+m1); return d>0?Math.round(d/60*10)/10:null; })()
      : null;
    const payload = { ...form, joining_letter_url,
      weekly_off_day: weekOffMode === "rotating" && form.weekly_off_day !== "" ? Number(form.weekly_off_day) : null,
      hours_per_day: canUseShiftTiming && shiftHours ? shiftHours
        : canSetPerEmployeeHours && form.hours_per_day !== "" ? Number(form.hours_per_day) : null,
      shift_start_time: canUseShiftTiming && form.shift_start_time ? form.shift_start_time : null,
      shift_end_time:   canUseShiftTiming && form.shift_end_time   ? form.shift_end_time   : null,
      company_id: profile?.company_id,
    };

    const res = await fetch("/api/create-user", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error || "Failed to create user"); }
    else {
      setSuccess(`✅ ${form.full_name} added successfully!`);
      setForm(emptyForm); setLetterFile(null); setShowForm(false); await load();
      setTimeout(() => setSuccess(""), 4000);
    }
    setSaving(false);
  };

  /* ── Edit ── */
  const openEdit = async (u: any) => {
    setEditUser(u); setEditLetterFile(null); setEditError("");
    setEditForm({
      full_name: u.full_name, phone_number: u.phone_number || "", gender: u.gender || "Male",
      designation: u.designation || "", joining_date: u.joining_date ? u.joining_date.split("T")[0] : "",
      remuneration: u.remuneration || "", new_email: "", new_password: "",
      weekly_off_day: u.weekly_off_day !== null && u.weekly_off_day !== undefined ? String(u.weekly_off_day) : "",
      hours_per_day: u.hours_per_day !== null && u.hours_per_day !== undefined ? String(u.hours_per_day) : "",
      shift_start_time: u.shift_start_time || "",
      shift_end_time:   u.shift_end_time   || "",
    });
    // Load existing appraisals
    const { data: existing } = await supabase.from("employee_appraisals").select("*").eq("user_id", u.id).order("appraisal_date", { ascending: false });
    setAppraisalRows((existing ?? []).map((a: any) => ({ date: a.appraisal_date, file: null, existingUrl: a.letter_url, id: a.id })));
  };
  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editUser) return;
    setEditSaving(true); setEditError("");
    
    // --- Upload joining letter if provided ---
    let joining_letter_url = editUser.joining_letter_url;
    if (editLetterFile) {
      const uFileName = `${Date.now()}_${editLetterFile.name.replace(/[^a-zA-Z0-9.\-]/g, "_")}`;
      const { error: fErr } = await supabase.storage.from("employee-documents").upload(`joining_letters/${uFileName}`, editLetterFile);
      if (!fErr) {
        const { data: urlData } = supabase.storage.from("employee-documents").getPublicUrl(`joining_letters/${uFileName}`);
        joining_letter_url = urlData.publicUrl;
      }
    }

    // --- Update profile table fields ---
    const editShiftHours = canUseShiftTiming && editForm.shift_start_time && editForm.shift_end_time
      ? (() => { const [h1,m1]=editForm.shift_start_time.split(":").map(Number); const [h2,m2]=editForm.shift_end_time.split(":").map(Number); const d=(h2*60+m2)-(h1*60+m1); return d>0?Math.round(d/60*10)/10:null; })()
      : null;
    await supabase.from("profiles").update({
      full_name:     editForm.full_name,
      phone_number:  editForm.phone_number,
      gender:        editForm.gender,
      designation:   editForm.designation,
      joining_date:  editForm.joining_date || null,
      remuneration:  editForm.remuneration ? Number(editForm.remuneration) : null,
      joining_letter_url,
      weekly_off_day: weekOffMode === "rotating" && editForm.weekly_off_day !== ""
        ? Number(editForm.weekly_off_day) : null,
      hours_per_day: canUseShiftTiming && editShiftHours ? editShiftHours
        : canSetPerEmployeeHours && editForm.hours_per_day !== "" ? Number(editForm.hours_per_day) : null,
      shift_start_time: canUseShiftTiming ? (editForm.shift_start_time || null) : null,
      shift_end_time:   canUseShiftTiming ? (editForm.shift_end_time   || null) : null,
    }).eq("id", editUser.id);

    // --- Update auth account if email/password supplied ---
    if (editForm.new_email || editForm.new_password) {
      const res = await fetch("/api/update-user", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: editUser.id, full_name: editForm.full_name, email: editForm.new_email || undefined, password: editForm.new_password || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { setEditError(json.error || "Account update failed"); setEditSaving(false); return; }
    }
    
    // --- Save new appraisal rows ---
    for (const row of appraisalRows) {
      if (!row.date) continue;
      if ((row as any).id && !row.file) continue; // existing with no new file, skip
      if (!row.file) continue; // new row without a file, skip

      const uFileName = `appraisals/${editUser.id}/${Date.now()}_${row.file.name.replace(/[^a-zA-Z0-9.\-]/g, "_")}`;
      const { error: fErr } = await supabase.storage.from("employee-documents").upload(uFileName, row.file, { upsert: true });
      if (!fErr) {
        const { data: urlData } = supabase.storage.from("employee-documents").getPublicUrl(uFileName);
        await supabase.from("employee_appraisals").insert({
          user_id: editUser.id,
          appraisal_date: row.date,
          letter_url: urlData.publicUrl,
          created_by: profile?.id
        });
      }
    }

    setEditUser(null); setSuccess("✅ Employee profile updated!"); await load(); setTimeout(() => setSuccess(""), 4000);
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
  const updateRole = async (id: string, newRole: string) => {
    const target = users.find(u => u.id === id);
    const oldRole = target?.role ?? "employee";
    const isAdminAction = !isSuperAdmin && (oldRole === "admin" || newRole === "admin");

    if (isAdminAction) {
      // Admin promoting/demoting another admin → send to approval queue
      const res = await fetch("/api/pending-approvals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_type: "role_change",
          requested_by: profile!.id,
          target_user_id: id,
          payload: { old_role: oldRole, new_role: newRole },
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setPendingRoles(prev => new Set(prev).add(id));
        setSuccess(`⏳ Role change request submitted for Super Admin approval.`);
        setTimeout(() => setSuccess(""), 5000);
      }
    } else {
      // Super Admin or non-sensitive role change → apply directly
      await supabase.from("profiles").update({ role: newRole }).eq("id", id);
      load();
    }
  };
  const updateManager = async (id: string, mgr: string) => { await supabase.from("profiles").update({ manager_id: mgr || null }).eq("id", id); load(); };

  const roleStyle = (r: string) => r === "superadmin" ? styles.badgeDanger : r === "admin" ? styles.badgeWarning : styles.badgeInfo;
  const roleColor = (r: string) => r === "superadmin" ? "#ef4444" : r === "admin" ? "#f59e0b" : "#6366f1";

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner}></div></div>;

  const UserCard = ({ u, inactive = false }: { u: Profile; inactive?: boolean }) => {
    const managerName = u.manager_id
      ? (users.find(m => m.id === u.manager_id)?.full_name ?? "— Unknown —")
      : "— No Manager —";
    return (
    <div key={u.id} className={`glass-panel ${userStyles.userCard}`}
      style={inactive ? { opacity: 0.6, border: "1px solid rgba(239,68,68,0.2)" } : {}}>

      {/* ── Card Header: Avatar + Name + Role badge ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div className={userStyles.userAvatar}
          style={{ flexShrink: 0, background: inactive ? "linear-gradient(135deg,#4b5563,#374151)" : `linear-gradient(135deg,${roleColor(u.role)},${roleColor(u.role)}88)`, overflow: "hidden", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {(u as any).avatar_url
            ? <img src={(u as any).avatar_url} alt={u.full_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fff" }}>{u.full_name?.charAt(0)?.toUpperCase()}</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Full name — always fully visible */}
          <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={u.full_name}>
            {u.full_name}
          </div>
          {/* Designation under name */}
          {(u as any).designation && (
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 1 }}>{(u as any).designation}</div>
          )}
          {/* Shift Timing Badge — Tier 3 per_employee_shift */}
          {canUseShiftTiming && (u as any).shift_start_time && (() => {
            const fmt = (s: string) => { const [h,m]=s.split(':').map(Number); const ap=h>=12?'PM':'AM'; const h12=h%12||12; return `${h12}:${String(m).padStart(2,'0')} ${ap}`; };
            return (
              <div style={{ fontSize:"0.72rem", color:"#818cf8", marginTop:3, display:"flex", alignItems:"center", gap:4 }}>
                <span>⏰</span>
                <span>{fmt((u as any).shift_start_time)} → {(u as any).shift_end_time ? fmt((u as any).shift_end_time) : '—'}</span>
                {(u as any).hours_per_day && <span style={{ color:"var(--text-secondary)", marginLeft:2 }}>({(u as any).hours_per_day}h)</span>}
              </div>
            );
          })()}
          {inactive
            ? <span style={{ fontSize: "0.72rem", color: "#ef4444", display: "block", marginTop: 2 }}>Left: {u.left_on ? new Date(u.left_on).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Unknown"}</span>
            : <span className={`${styles.statBadge} ${roleStyle(u.role)}`} style={{ marginTop: 4, display: "inline-block" }}>{u.role}</span>}
        </div>
      </div>

      {/* ── Action Buttons — show Edit for superadmin viewing their OWN card ── */}
      {!inactive && u.role !== "superadmin" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          <button onClick={() => setCreditTarget(u)}
            style={{ flex: 1, padding: "6px 8px", borderRadius: 7, border: "1px solid rgba(99,102,241,0.35)", background: "rgba(99,102,241,0.1)", color: "var(--accent-primary)", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontSize: "0.76rem", fontWeight: 600, whiteSpace: "nowrap" }}>
            💳 Credit Leave
          </button>
          <button onClick={() => setCompOffTarget(u)}
            style={{ flex: 1, padding: "6px 8px", borderRadius: 7, border: "1px solid rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.1)", color: "var(--success)", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontSize: "0.76rem", fontWeight: 600, whiteSpace: "nowrap" }}>
            🎁 Comp Off
          </button>
          <button onClick={() => openEdit(u)}
            style={{ flex: 1, padding: "6px 8px", borderRadius: 7, border: "1px solid var(--glass-border)", background: "var(--glass-bg)", color: "var(--text-primary)", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontSize: "0.76rem", fontWeight: 600 }}>
            ✏️ Edit
          </button>
          <button onClick={() => setDeactivateTarget(u)}
            style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "var(--danger)", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontSize: "0.76rem", fontWeight: 600 }}>
            🚪 Exit
          </button>
        </div>
      )}
      {/* Superadmin self-edit: only show Edit button for their OWN card */}
      {!inactive && u.role === "superadmin" && u.id === profile?.id && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <button onClick={() => openEdit(u)}
            style={{ flex: 1, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--glass-border)", background: "var(--glass-bg)", color: "var(--text-primary)", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontSize: "0.76rem", fontWeight: 600 }}>
            ✏️ Edit My Profile
          </button>
        </div>
      )}
      {/* Superadmin card viewed by someone else */}
      {!inactive && u.role === "superadmin" && u.id !== profile?.id && (
        <div style={{ marginBottom: 12, padding: "6px 10px", borderRadius: 7, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", fontSize: "0.75rem", color: "var(--text-secondary)", textAlign: "center" }}>
          🛡️ Super Admin
        </div>
      )}
      {inactive && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <button onClick={() => handleRestore(u)}
            style={{ flex: 1, padding: "6px 10px", borderRadius: 7, border: "1px solid rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.08)", color: "var(--success)", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontSize: "0.76rem", fontWeight: 600 }}>
            ↩ Re-hire
          </button>
          <button onClick={() => setPermDeleteTarget(u)}
            style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "var(--danger)", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontSize: "0.76rem", fontWeight: 600 }}>
            🗑 Delete
          </button>
        </div>
      )}

      {/* ── Role + Manager (for active employees) ── */}
      {!inactive && (
        <div className={userStyles.userCardBody}>
          <div className={userStyles.fieldRow}>
            <label>Role</label>
            {/* Superadmin cards: role is locked (read-only display) */}
            {u.role === "superadmin" ? (
              <span style={{ fontSize: "0.82rem", color: "#ef4444", fontWeight: 700 }}>🛡️ Super Admin</span>
            ) : (
              <select className="premium-input" style={{ padding: "6px 10px", fontSize: "0.82rem" }}
                value={u.role} onChange={e => updateRole(u.id, e.target.value)}>
                <option value="employee">Employee</option>
                <option value="admin">Admin</option>
                {/* Only superadmin can promote someone to superadmin */}
                {isSuperAdmin && <option value="superadmin">Super Admin</option>}
              </select>
            )}
          </div>
          <div className={userStyles.fieldRow}>
            <label>Reports To</label>
            <select className="premium-input" style={{ padding: "6px 10px", fontSize: "0.82rem" }}
              value={u.manager_id ?? ""} onChange={e => updateManager(u.id, e.target.value)}>
              <option value="">— No Manager —</option>
              {activeUsers.filter(m => m.id !== u.id).map(m => (
                <option key={m.id} value={m.id}>{m.full_name}{m.role !== "employee" ? ` (${m.role})` : ""}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );};


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
      {showForm && isMounted && createPortal(
        <div
          onClick={() => setShowForm(false)}
          style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.92)', zIndex: 2147483647,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'flex-start', padding: '40px 20px',
            overflowY: 'auto', boxSizing: 'border-box',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0d0f18', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 20, padding: 32, width: '100%', maxWidth: 600,
              flexShrink: 0, boxShadow: '0 32px 80px rgba(0,0,0,0.95)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Add New Employee</h2>
              <button onClick={() => setShowForm(false)} className={userStyles.closeBtn}>✕</button>
            </div>
            {error && <div style={{ color: "var(--danger)", background: "rgba(239,68,68,0.1)", padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{display: 'flex', gap: 16}}>
                <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                  <label>Full Name *</label>
                  <input className="premium-input" placeholder="e.g. Jane Doe" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} required />
                </div>
                <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                  <label>Email *</label>
                  <input type="email" className="premium-input" placeholder="jane@company.com" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
                </div>
              </div>

              <div style={{display: 'flex', gap: 16}}>
                <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                   <label>Phone Number</label>
                   <input className="premium-input" placeholder="+1..." value={form.phone_number} onChange={e => setForm({...form, phone_number: e.target.value})} />
                </div>
                 <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                   <label>Gender *</label>
                   <select className="premium-input" value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}>
                     <option>Male</option><option>Female</option><option>Other</option>
                   </select>
                 </div>
              </div>

              <div style={{display: 'flex', gap: 16}}>
                 <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                    <label>Designation *</label>
                    <input className="premium-input" placeholder="e.g. Software Engineer" value={form.designation} onChange={e => setForm({...form, designation: e.target.value})} required />
                 </div>
                 <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                    <label>Joining Date *</label>
                    <input type="date" className="premium-input" value={form.joining_date} onChange={e => setForm({...form, joining_date: e.target.value})} required />
                 </div>
              </div>

              <div style={{display: 'flex', gap: 16}}>
                 <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                    <label>Remuneration (Monthly) *</label>
                    <input type="number" className="premium-input" placeholder="0.00" value={form.remuneration} onChange={e => setForm({...form, remuneration: e.target.value})} required />
                 </div>
                 {canUseShiftTiming ? (
                   <>
                     <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                       <label>⏰ Shift Start Time <span style={{ fontSize: '0.72rem', color: '#818cf8', fontWeight: 400 }}>(prescribed check-in)</span></label>
                       <input type="time" className="premium-input" value={form.shift_start_time}
                         onChange={e => setForm({...form, shift_start_time: e.target.value})} />
                     </div>
                     <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                       <label>⏰ Shift End Time <span style={{ fontSize: '0.72rem', color: '#818cf8', fontWeight: 400 }}>(max check-out)</span></label>
                       <input type="time" className="premium-input" value={form.shift_end_time}
                         onChange={e => setForm({...form, shift_end_time: e.target.value})} />
                     </div>
                     {form.shift_start_time && form.shift_end_time && (() => {
                       const [h1,m1]=form.shift_start_time.split(':').map(Number);
                       const [h2,m2]=form.shift_end_time.split(':').map(Number);
                       const d=(h2*60+m2)-(h1*60+m1);
                       return d>0 ? <div style={{ fontSize:'0.78rem', color:'#818cf8', alignSelf:'flex-end', paddingBottom:10, whiteSpace:'nowrap' }}>⟶ {Math.round(d/60*10)/10}h/day</div> : null;
                     })()}
                   </>
                 ) : canSetPerEmployeeHours ? (
                   <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                     <label>Daily Working Hours <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 400 }}>(optional — overrides org default)</span></label>
                     <input type="number" step="0.5" min="1" max="16" className="premium-input" placeholder="Leave blank to use org default"
                       value={form.hours_per_day} onChange={e => setForm({...form, hours_per_day: e.target.value})} />
                   </div>
                 ) : null}
                 <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                    <label>Joining Letter (PDF/Doc)</label>
                    <input type="file" className="premium-input" style={{padding: 10}} accept=".pdf,.doc,.docx" onChange={e => setLetterFile(e.target.files?.[0] ?? null)} />
                 </div>
              </div>

              <div style={{display: 'flex', gap: 16}}>
                <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                  <label>Temporary Password *</label>
                  <input type="password" className="premium-input" placeholder="Min 6 chars" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required minLength={6} />
                </div>
                <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                  <label>System Role *</label>
                  <select className="premium-input" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                    <option value="employee">Employee</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">Super Admin</option>
                  </select>
                </div>
              </div>
              
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Reporting Manager</label>
                <select className="premium-input" value={form.manager_id} onChange={e => setForm({...form, manager_id: e.target.value})}>
                  <option value="">-- No Manager --</option>
                  {activeUsers.map(m => (<option key={m.id} value={m.id}>{m.full_name}{m.role !== "employee" ? ` (${m.role})` : ""}</option>))}
                </select>
              </div>

              {/* Week Off Day — only shown in rotating mode */}
              {weekOffMode === "rotating" && (
                <div className={styles.formGroup} style={{ marginBottom: 0, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10, padding: "12px 14px" }}>
                  <label style={{ color: "var(--accent-primary)" }}>🔄 Weekly Off Day *</label>
                  <select className="premium-input" value={form.weekly_off_day} onChange={e => setForm({...form, weekly_off_day: e.target.value})}>
                    <option value="">🚫 No Weekly Off (Works 7 Days)</option>
                    {DAYS_LONG.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: 4 }}>This employee's rotating week off day. Can be changed from their profile card.</div>
                </div>
              )}

              <button type="submit" className={styles.primaryBtn} disabled={saving} style={{ marginTop: 8 }}>
                {saving ? "Creating Profile..." : "Create User Profile"}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── Edit Employee Drawer ── */}
      {editUser && isMounted && createPortal(
        <div
          onClick={() => setEditUser(null)}
          style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.92)', zIndex: 2147483647,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'flex-start', padding: '40px 20px',
            overflowY: 'auto', boxSizing: 'border-box',
          }}
        >
          <div
            style={{ maxWidth: 620, background: '#0d0f18', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: 32, width: '100%', flexShrink: 0, boxShadow: '0 32px 80px rgba(0,0,0,0.95)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Edit Profile — {editUser.full_name}</h2>
              <button onClick={() => setEditUser(null)} className={userStyles.closeBtn}>✕</button>
            </div>
            {editError && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--danger)", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: "0.85rem" }}>⚠️ {editError}</div>}
            
            <form onSubmit={handleEdit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Work Profile — Admin Fillable */}
              <div style={{ padding: "12px 14px", background: "rgba(99,102,241,0.06)", borderRadius: 10, border: "1px solid rgba(99,102,241,0.15)", marginBottom: 4 }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent-primary)", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>📋 Work Profile</div>
                
                <div style={{ display: "flex", gap: 14 }}>
                  <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                    <label>Full Name *</label>
                    <input className="premium-input" value={editForm.full_name} onChange={e => setEditForm({...editForm, full_name: e.target.value})} required />
                  </div>
                  <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                    <label>Phone Number</label>
                    <input className="premium-input" placeholder="+91..." value={editForm.phone_number} onChange={e => setEditForm({...editForm, phone_number: e.target.value})} />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
                  <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                    <label>Gender</label>
                    <select className="premium-input" value={editForm.gender} onChange={e => setEditForm({...editForm, gender: e.target.value})}>
                      <option>Male</option><option>Female</option><option>Other</option>
                    </select>
                  </div>
                  <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                    <label>Designation</label>
                    <input className="premium-input" placeholder="e.g. Software Engineer" value={editForm.designation} onChange={e => setEditForm({...editForm, designation: e.target.value})} />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
                  <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                    <label>Joining Date</label>
                    <input type="date" className="premium-input" value={editForm.joining_date} onChange={e => setEditForm({...editForm, joining_date: e.target.value})} />
                  </div>
                  <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                    <label>Monthly Remuneration (₹)</label>
                    <input type="number" className="premium-input" placeholder="0.00" value={editForm.remuneration} onChange={e => setEditForm({...editForm, remuneration: e.target.value})} />
                  </div>
                  {canUseShiftTiming ? (
                    <>
                      <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                        <label>⏰ Shift Start <span style={{ fontSize: "0.72rem", color: "#818cf8", fontWeight: 400 }}>(prescribed check-in)</span></label>
                        <input type="time" className="premium-input" value={editForm.shift_start_time}
                          onChange={e => setEditForm({...editForm, shift_start_time: e.target.value})} />
                      </div>
                      <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                        <label>⏰ Shift End <span style={{ fontSize: "0.72rem", color: "#818cf8", fontWeight: 400 }}>(max check-out)</span></label>
                        <input type="time" className="premium-input" value={editForm.shift_end_time}
                          onChange={e => setEditForm({...editForm, shift_end_time: e.target.value})} />
                      </div>
                      {editForm.shift_start_time && editForm.shift_end_time && (() => {
                        const [h1,m1]=editForm.shift_start_time.split(':').map(Number);
                        const [h2,m2]=editForm.shift_end_time.split(':').map(Number);
                        const d=(h2*60+m2)-(h1*60+m1);
                        return d>0 ? <div style={{ fontSize:'0.78rem', color:'#818cf8', alignSelf:'flex-end', paddingBottom:10, whiteSpace:'nowrap' }}>⟶ {Math.round(d/60*10)/10}h/day</div> : null;
                      })()}
                    </>
                  ) : canSetPerEmployeeHours ? (
                    <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                      <label>Daily Working Hours <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 400 }}>(optional)</span></label>
                      <input type="number" step="0.5" min="1" max="16" className="premium-input" placeholder="Org default"
                        value={editForm.hours_per_day} onChange={e => setEditForm({...editForm, hours_per_day: e.target.value})} />
                    </div>
                  ) : null}
                </div>

                {/* Week Off Day — only in rotating mode */}
                {weekOffMode === "rotating" && (
                  <div className={styles.formGroup} style={{ marginBottom: 0, marginTop: 14, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10, padding: "10px 12px" }}>
                    <label style={{ color: "var(--accent-primary)" }}>🔄 Weekly Off Day</label>
                    <select className="premium-input" value={editForm.weekly_off_day} onChange={e => setEditForm({...editForm, weekly_off_day: e.target.value})}>
                      <option value="">🚫 No Weekly Off (Works 7 Days)</option>
                      {DAYS_LONG.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </div>
                )}

                <div className={styles.formGroup} style={{ marginBottom: 0, marginTop: 14 }}>
                  <label>Joining Letter {editUser.joining_letter_url && <a href={editUser.joining_letter_url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, fontSize: "0.78rem", color: "var(--accent-primary)" }}>📄 View Current</a>}</label>
                  <input type="file" className="premium-input" style={{ padding: 10 }} accept=".pdf,.doc,.docx" onChange={e => setEditLetterFile(e.target.files?.[0] ?? null)} />
                </div>

                {/* ── Dynamic Appraisal Letters ── */}
                <div style={{ marginTop: 20, borderTop: "1px solid var(--glass-border)", paddingTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.8 }}>📈 Appraisal Letters</div>
                    <button type="button" onClick={() => setAppraisalRows(prev => [...prev, { date: "", file: null }])}
                      style={{ fontSize: "0.78rem", padding: "4px 12px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.1)", color: "var(--accent-primary)", cursor: "pointer", fontFamily: "Outfit,sans-serif" }}>
                      + Add Appraisal
                    </button>
                  </div>
                  {appraisalRows.length === 0 && (
                    <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "0.82rem", padding: "12px 0" }}>No appraisal letters yet. Click "+ Add Appraisal" to attach one.</div>
                  )}
                  {appraisalRows.map((row, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10, background: "rgba(255,255,255,0.02)", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--glass-border)" }}>
                      <div style={{ flex: "0 0 140px" }}>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: 4 }}>Appraisal Date *</div>
                        <input type="date" className="premium-input" value={row.date}
                          onChange={e => { const r = [...appraisalRows]; r[idx] = { ...r[idx], date: e.target.value }; setAppraisalRows(r); }}
                          style={{ fontSize: "0.82rem", padding: "8px 10px" }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: 4 }}>
                          {(row as any).existingUrl ? (
                            <>
                              <a href={(row as any).existingUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--success)" }}>📄 View Existing</a>
                              <span style={{ marginLeft: 6 }}>· Upload new to replace</span>
                            </>
                          ) : "PDF / DOC"}
                        </div>
                        <input type="file" className="premium-input" accept=".pdf,.doc,.docx"
                          style={{ fontSize: "0.78rem", padding: "6px 10px" }}
                          onChange={e => { const r = [...appraisalRows]; r[idx] = { ...r[idx], file: e.target.files?.[0] ?? null }; setAppraisalRows(r); }} />
                      </div>
                      <button type="button" onClick={() => setAppraisalRows(prev => prev.filter((_, i) => i !== idx))}
                        style={{ marginTop: 18, background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: "1.1rem", lineHeight: 1 }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Account Settings */}
              <div style={{ padding: "12px 14px", background: "rgba(239,68,68,0.05)", borderRadius: 10, border: "1px solid rgba(239,68,68,0.12)" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#f87171", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>🔐 Account Settings <span style={{ color: "var(--text-secondary)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(Leave blank to keep unchanged)</span></div>
                <div style={{ display: "flex", gap: 14 }}>
                  <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                    <label>New Email</label>
                    <input type="email" className="premium-input" placeholder="new@email.com" value={editForm.new_email} onChange={e => setEditForm({...editForm, new_email: e.target.value})} />
                  </div>
                  <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1 }}>
                    <label>Reset Password</label>
                    <input type="password" className="premium-input" placeholder="Min 6 chars" value={editForm.new_password} onChange={e => setEditForm({...editForm, new_password: e.target.value})} minLength={6} />
                  </div>
                </div>
              </div>

              <button type="submit" className={styles.primaryBtn} disabled={editSaving} style={{ marginTop: 4 }}>
                {editSaving ? "Saving Changes…" : "💾 Save All Changes"}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── Mark as Left Confirm ── */}
      {deactivateTarget && isMounted && createPortal(
        <div
          onClick={() => setDeactivateTarget(null)}
          style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.92)', zIndex: 2147483647,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px', boxSizing: 'border-box',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#0d0f18', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 20, padding: 36, width: '100%', maxWidth: 420, textAlign: 'center', boxShadow: '0 32px 80px rgba(0,0,0,0.95)' }}
          >
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
        </div>,
        document.body
      )}

      {/* ── Permanent Delete Confirm ── */}
      {permDeleteTarget && isMounted && createPortal(
        <div
          onClick={() => setPermDeleteTarget(null)}
          style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.92)', zIndex: 2147483647,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px', boxSizing: 'border-box',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#0d0f18', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 20, padding: 36, width: '100%', maxWidth: 420, textAlign: 'center', boxShadow: '0 32px 80px rgba(0,0,0,0.95)' }}
          >
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
        </div>,
        document.body
      )}
      {/* ── Comp-Off Grant Modal ── */}
      {compOffTarget && isMounted && createPortal(
        <div
          onClick={() => setCompOffTarget(null)}
          style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.92)', zIndex: 2147483647,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'flex-start', padding: '40px 20px',
            overflowY: 'auto', boxSizing: 'border-box',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#0d0f18', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: 32, width: '100%', maxWidth: 420, flexShrink: 0, boxShadow: '0 32px 80px rgba(0,0,0,0.95)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>🎁 Grant Comp-Off to {compOffTarget.full_name?.split(" ")[0]}</h2>
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
        </div>,
        document.body
      )}

      {/* ── Credit Leave Ledger Modal ── */}
      {creditTarget && isMounted && createPortal(
        <div
          onClick={() => setCreditTarget(null)}
          style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.92)', zIndex: 2147483647,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'flex-start', padding: '40px 20px',
            overflowY: 'auto', boxSizing: 'border-box',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#0d0f18', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: 32, width: '100%', maxWidth: 420, flexShrink: 0, boxShadow: '0 32px 80px rgba(0,0,0,0.95)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>💳 Adjust Leave Ledger for {creditTarget.full_name?.split(" ")[0]}</h2>
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
        </div>,
        document.body
      )}

    </div>
  );
}
