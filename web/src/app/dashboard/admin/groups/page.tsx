"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import styles from "../../dashboard.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Group {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  created_by_role: string;
  created_at: string;
  memberCount?: number;
}

interface Employee {
  id: string;
  full_name: string;
  designation: string | null;
  department: string | null;
  avatar_url: string | null;
}

interface GroupMember extends Employee {
  added_at: string;
  group_id: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#06b6d4", "#f97316", "#ef4444",
];
const PRESET_ICONS = ["👥", "🕌", "🛕", "⛪", "🌙", "🕎", "☀️", "🏢", "🧑‍💼", "🌍", "🎯", "⭐"];

const emptyForm = { name: "", description: "", color: "#6366f1", icon: "👥" };

// ── Reusable mini components ──────────────────────────────────────────────────
function GroupBadge({ group, size = "sm" }: { group: Pick<Group, "icon" | "color" | "name">; size?: "sm" | "lg" }) {
  const sz = size === "lg" ? { padding: "5px 14px", fontSize: "0.85rem", gap: 7 } : { padding: "3px 10px", fontSize: "0.75rem", gap: 5 };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: sz.gap,
      padding: sz.padding, borderRadius: 20, fontSize: sz.fontSize, fontWeight: 600,
      background: `${group.color}18`, color: group.color, border: `1px solid ${group.color}35`,
    }}>
      {group.icon} {group.name}
    </span>
  );
}

function Avatar({ employee }: { employee: Pick<Employee, "full_name" | "avatar_url"> }) {
  return employee.avatar_url
    ? <img src={employee.avatar_url} alt={employee.full_name} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
    : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(99,102,241,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, color: "#818cf8", flexShrink: 0 }}>
        {employee.full_name.charAt(0).toUpperCase()}
      </div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function GroupsPage() {
  const { profile } = useAuth();
  const isSA = profile?.role === "superadmin";
  const companyId = profile?.company_id;

  // ── State ──────────────────────────────────────────────────────────────────
  const [groups,    setGroups]    = useState<Group[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // Active group for member management
  const [activeGroup,  setActiveGroup]  = useState<Group | null>(null);
  const [members,      setMembers]      = useState<GroupMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Drawer states
  const [showGroupForm,  setShowGroupForm]  = useState(false);
  const [editingGroup,   setEditingGroup]   = useState<Group | null>(null);
  const [form,           setForm]           = useState(emptyForm);

  // Employee search / add
  const [memberSearch,   setMemberSearch]   = useState("");
  const [addingMember,   setAddingMember]   = useState(false);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const [{ data: grps }, { data: emps }] = await Promise.all([
      supabase.from("employee_groups").select("*").eq("company_id", companyId).order("created_at"),
      supabase.from("profiles").select("id,full_name,designation,department,avatar_url")
        .eq("company_id", companyId).in("role", ["employee", "admin", "manager"]).order("full_name"),
    ]);

    // Count members per group
    const grpIds = (grps ?? []).map((g: Group) => g.id);
    let counts: Record<string, number> = {};
    if (grpIds.length > 0) {
      const { data: mc } = await supabase
        .from("employee_group_members")
        .select("group_id")
        .in("group_id", grpIds);
      (mc ?? []).forEach((r: { group_id: string }) => {
        counts[r.group_id] = (counts[r.group_id] ?? 0) + 1;
      });
    }

    setGroups((grps ?? []).map((g: Group) => ({ ...g, memberCount: counts[g.id] ?? 0 })));
    setEmployees(emps ?? []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const loadMembers = useCallback(async (groupId: string) => {
    setLoadingMembers(true);
    const { data } = await supabase
      .from("employee_group_members")
      .select("group_id, added_at, user_id, profiles!employee_group_members_user_id_fkey(id,full_name,designation,department,avatar_url)")
      .eq("group_id", groupId)
      .order("added_at");

    setMembers((data ?? []).map((r: any) => ({
      ...r.profiles,
      group_id: r.group_id,
      added_at: r.added_at,
    })));
    setLoadingMembers(false);
  }, []);

  useEffect(() => {
    if (activeGroup) loadMembers(activeGroup.id);
    else setMembers([]);
  }, [activeGroup, loadMembers]);

  // ── Group CRUD ─────────────────────────────────────────────────────────────
  const openNewGroup = () => {
    setEditingGroup(null);
    setForm(emptyForm);
    setShowGroupForm(true);
  };

  const openEditGroup = (g: Group) => {
    if (!isSA && g.created_by_role === "superadmin") return; // admin cannot edit SA groups
    setEditingGroup(g);
    setForm({ name: g.name, description: g.description ?? "", color: g.color, icon: g.icon });
    setShowGroupForm(true);
  };

  const saveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    setSaving(true); setError(null);
    const payload = {
      ...form,
      company_id: companyId,
      created_by: profile?.id,
      created_by_role: isSA ? "superadmin" : "admin",
    };
    let err;
    if (editingGroup) {
      ({ error: err } = await supabase.from("employee_groups").update({ name: form.name, description: form.description, color: form.color, icon: form.icon }).eq("id", editingGroup.id));
    } else {
      ({ error: err } = await supabase.from("employee_groups").insert(payload));
    }
    if (err) setError(err.message);
    else { setShowGroupForm(false); load(); }
    setSaving(false);
  };

  const deleteGroup = async (g: Group) => {
    if (!isSA && g.created_by_role === "superadmin") {
      alert("Only SuperAdmin can delete groups created by SuperAdmin.");
      return;
    }
    if (!confirm(`Delete group "${g.name}"? All member assignments will also be removed.`)) return;
    await supabase.from("employee_groups").delete().eq("id", g.id);
    if (activeGroup?.id === g.id) setActiveGroup(null);
    load();
  };

  // ── Member management ──────────────────────────────────────────────────────
  const addMember = async (emp: Employee) => {
    if (!activeGroup || !companyId) return;
    setAddingMember(true);
    const { error: err } = await supabase.from("employee_group_members").insert({
      group_id: activeGroup.id,
      user_id: emp.id,
      company_id: companyId,
      added_by: profile?.id,
    });
    if (!err) {
      loadMembers(activeGroup.id);
      load(); // refresh member counts
    }
    setAddingMember(false);
  };

  const removeMember = async (userId: string) => {
    if (!activeGroup) return;
    await supabase.from("employee_group_members")
      .delete().eq("group_id", activeGroup.id).eq("user_id", userId);
    loadMembers(activeGroup.id);
    load();
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const memberIds = new Set(members.map(m => m.id));
  const filteredEmployees = employees.filter(e =>
    !memberIds.has(e.id) &&
    (memberSearch === "" ||
      e.full_name.toLowerCase().includes(memberSearch.toLowerCase()) ||
      (e.department ?? "").toLowerCase().includes(memberSearch.toLowerCase()))
  );

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner} /></div>;

  return (
    <div className="animate-fade-in">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className={styles.pageHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Employee Groups</h1>
          <p>Organise employees into groups for holidays, announcements, leave rules and shifts.</p>
        </div>
        <button className={styles.primaryBtn} style={{ width: "auto", padding: "12px 24px" }} onClick={openNewGroup}>
          + New Group
        </button>
      </div>

      {/* ── Two-panel layout ────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20, alignItems: "start" }}>

        {/* ── LEFT: Groups list ──────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {groups.length === 0 && (
            <div className="glass-panel" style={{ padding: 32, textAlign: "center", color: "var(--text-secondary)" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>👥</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>No groups yet</div>
              <div style={{ fontSize: "0.8rem" }}>Create groups to assign holidays, leave rules and announcements.</div>
            </div>
          )}
          {groups.map(g => (
            <div
              key={g.id}
              onClick={() => setActiveGroup(prev => prev?.id === g.id ? null : g)}
              style={{
                padding: "14px 16px", borderRadius: 14, cursor: "pointer",
                background: activeGroup?.id === g.id ? `${g.color}14` : "rgba(255,255,255,0.03)",
                border: `1.5px solid ${activeGroup?.id === g.id ? g.color : "rgba(255,255,255,0.07)"}`,
                transition: "all 0.18s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <GroupBadge group={g} size="lg" />
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={e => { e.stopPropagation(); openEditGroup(g); }}
                    title={!isSA && g.created_by_role === "superadmin" ? "Only SuperAdmin can edit this group" : "Edit group"}
                    style={{
                      padding: "4px 10px", borderRadius: 8, border: "1px solid var(--glass-border)",
                      background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)",
                      cursor: !isSA && g.created_by_role === "superadmin" ? "not-allowed" : "pointer",
                      opacity: !isSA && g.created_by_role === "superadmin" ? 0.4 : 1, fontSize: "0.8rem",
                    }}
                  >✏️</button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteGroup(g); }}
                    title={!isSA && g.created_by_role === "superadmin" ? "Only SuperAdmin can delete SA-created groups" : "Delete group"}
                    style={{
                      padding: "4px 10px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)",
                      background: "rgba(239,68,68,0.08)", color: "var(--danger)",
                      cursor: !isSA && g.created_by_role === "superadmin" ? "not-allowed" : "pointer",
                      opacity: !isSA && g.created_by_role === "superadmin" ? 0.4 : 1, fontSize: "0.8rem",
                    }}
                  >🗑</button>
                </div>
              </div>
              {g.description && (
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 8, paddingLeft: 2 }}>
                  {g.description}
                </div>
              )}
              <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                <span>👤 {g.memberCount ?? 0} member{g.memberCount !== 1 ? "s" : ""}</span>
                <span style={{ color: g.created_by_role === "superadmin" ? "#a78bfa" : "#34d399", fontWeight: 600, fontSize: "0.7rem" }}>
                  {g.created_by_role === "superadmin" ? "SA" : "Admin"}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* ── RIGHT: Member management ───────────────────────────────────── */}
        {!activeGroup ? (
          <div className="glass-panel" style={{ padding: 48, textAlign: "center", color: "var(--text-secondary)" }}>
            <div style={{ fontSize: "3rem", marginBottom: 12 }}>←</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Select a group</div>
            <div style={{ fontSize: "0.8rem" }}>Click a group to manage its members</div>
          </div>
        ) : (
          <div className="glass-panel" style={{ padding: 24 }}>
            {/* Group header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <GroupBadge group={activeGroup} size="lg" />
              {activeGroup.description && (
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>— {activeGroup.description}</span>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
              {/* Current members */}
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: 12, color: "var(--text-primary)" }}>
                  👤 Members ({members.length})
                </div>
                {loadingMembers ? (
                  <div style={{ padding: 20, textAlign: "center", color: "var(--text-secondary)" }}>Loading…</div>
                ) : members.length === 0 ? (
                  <div style={{ padding: 20, textAlign: "center", color: "var(--text-secondary)", fontSize: "0.8rem", borderRadius: 10, border: "1px dashed rgba(255,255,255,0.1)" }}>
                    No members yet. Add from the right →
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto" }}>
                    {members.map(m => (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <Avatar employee={m} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: "0.85rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.full_name}</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{m.designation ?? m.department ?? "—"}</div>
                        </div>
                        <button
                          onClick={() => removeMember(m.id)}
                          title="Remove from group"
                          style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "var(--danger)", cursor: "pointer", fontSize: "0.75rem", flexShrink: 0 }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add employees */}
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: 10, color: "var(--text-primary)" }}>
                  ➕ Add Employees
                </div>
                <input
                  className="premium-input"
                  placeholder="Search by name or department…"
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  style={{ marginBottom: 10, fontSize: "0.83rem" }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 380, overflowY: "auto" }}>
                  {filteredEmployees.length === 0 ? (
                    <div style={{ padding: 16, textAlign: "center", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                      {memberSearch ? "No matching employees" : "All employees already in this group"}
                    </div>
                  ) : filteredEmployees.map(e => (
                    <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <Avatar employee={e} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "0.82rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.full_name}</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>{e.department ?? e.designation ?? "—"}</div>
                      </div>
                      <button
                        onClick={() => addMember(e)}
                        disabled={addingMember}
                        style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.12)", color: "#818cf8", cursor: "pointer", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}
                      >+ Add</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══ Group Form Drawer ═══════════════════════════════════════════════════ */}
      {showGroupForm && (
        <div className="overlay" onClick={() => setShowGroupForm(false)}>
          <div className="drawer" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="drawerHeader">
              <h2>{editingGroup ? "Edit Group" : "New Group"}</h2>
              <button onClick={() => setShowGroupForm(false)} className="closeBtn">✕</button>
            </div>

            <form onSubmit={saveGroup} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {error && (
                <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", fontSize: "0.82rem" }}>
                  ⚠️ {error}
                </div>
              )}

              {/* Name */}
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Group Name *</label>
                <input className="premium-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Muslim Staff, Night Shift, Mumbai Branch" />
              </div>

              {/* Description */}
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Description (optional)</label>
                <input className="premium-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What is this group used for?" />
              </div>

              {/* Icon picker */}
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Icon</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                  {PRESET_ICONS.map(ic => (
                    <button
                      type="button" key={ic}
                      onClick={() => setForm({ ...form, icon: ic })}
                      style={{ width: 38, height: 38, borderRadius: 9, fontSize: "1.2rem", border: `2px solid ${form.icon === ic ? form.color : "rgba(255,255,255,0.1)"}`, background: form.icon === ic ? `${form.color}20` : "transparent", cursor: "pointer", transition: "all 0.15s" }}
                    >{ic}</button>
                  ))}
                </div>
              </div>

              {/* Color picker */}
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Colour</label>
                <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  {PRESET_COLORS.map(c => (
                    <button
                      type="button" key={c}
                      onClick={() => setForm({ ...form, color: c })}
                      style={{ width: 30, height: 30, borderRadius: "50%", background: c, border: `3px solid ${form.color === c ? "#fff" : "transparent"}`, cursor: "pointer", transition: "border 0.15s" }}
                    />
                  ))}
                  {/* Custom colour */}
                  <input
                    type="color" value={form.color}
                    onChange={e => setForm({ ...form, color: e.target.value })}
                    style={{ width: 30, height: 30, borderRadius: "50%", border: "none", padding: 0, cursor: "pointer", background: "transparent" }}
                    title="Custom colour"
                  />
                </div>
              </div>

              {/* Preview */}
              <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: 8 }}>Preview</div>
                <GroupBadge group={{ ...form, name: form.name || "Group Name" }} size="lg" />
              </div>

              <button type="submit" className={styles.primaryBtn} disabled={saving} style={{ marginTop: 4 }}>
                {saving ? "Saving…" : editingGroup ? "💾 Update Group" : "✅ Create Group"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
