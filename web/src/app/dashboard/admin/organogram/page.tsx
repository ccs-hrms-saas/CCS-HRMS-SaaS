"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import styles from "../../dashboard.module.css";

interface Employee {
  id: string;
  full_name: string;
  role: string;
  designation: string | null;
  manager_id: string | null;
  is_active: boolean;
  avatar_url: string | null;
}

/* ── Recursive org node ── */
function OrgNode({
  emp,
  all,
  depth,
  editMode,
  onDrop,
  onClick,
}: {
  emp: Employee;
  all: Employee[];
  depth: number;
  editMode: boolean;
  onDrop: (draggedId: string, newManagerId: string) => void;
  onClick: (emp: Employee) => void;
}) {
  const reportees = all.filter(e => e.manager_id === emp.id && e.is_active);
  const roleColor = emp.role === "superadmin" ? "#8b5cf6" : emp.role === "admin" ? "#3b82f6" : "#6366f1";

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("draggedId", emp.id);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const draggedId = e.dataTransfer.getData("draggedId");
    if (draggedId && draggedId !== emp.id) onDrop(draggedId, emp.id);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
      {/* Node card */}
      <div
        draggable={editMode}
        onDragStart={editMode ? handleDragStart : undefined}
        onDragOver={editMode ? handleDragOver : undefined}
        onDrop={editMode ? handleDrop : undefined}
        onClick={() => onClick(emp)}
        style={{
          background: "var(--glass-bg)", border: `2px solid ${roleColor}44`,
          borderRadius: 14, padding: "14px 18px", cursor: "pointer",
          width: 160, textAlign: "center", position: "relative",
          transition: "all 0.2s", userSelect: "none",
          boxShadow: `0 4px 20px ${roleColor}22`,
        }}
        className="org-node"
      >
        {editMode && (
          <div style={{ position: "absolute", top: 6, right: 8, fontSize: "0.7rem", color: "var(--text-secondary)", cursor: "grab" }}>⠿</div>
        )}
        {/* Avatar */}
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: `linear-gradient(135deg,${roleColor},${roleColor}88)`, margin: "0 auto 8px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: `2px solid ${roleColor}` }}>
          {emp.avatar_url
            ? <img src={emp.avatar_url} alt={emp.full_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span style={{ fontWeight: 700, color: "#fff", fontSize: "1.1rem" }}>{emp.full_name?.charAt(0)?.toUpperCase()}</span>}
        </div>
        <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.2, marginBottom: 4 }}>{emp.full_name}</div>
        {emp.designation && <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginBottom: 4 }}>{emp.designation}</div>}
        <span style={{ fontSize: "0.65rem", padding: "2px 8px", borderRadius: 10, background: `${roleColor}22`, color: roleColor, fontWeight: 600 }}>{emp.role}</span>
        {reportees.length > 0 && (
          <div style={{ marginTop: 6, fontSize: "0.68rem", color: "var(--text-secondary)" }}>👥 {reportees.length} reportee{reportees.length > 1 ? "s" : ""}</div>
        )}
      </div>

      {/* Children */}
      {reportees.length > 0 && (
        <>
          {/* Vertical connector */}
          <div style={{ width: 2, height: 24, background: "var(--glass-border)" }} />
          {/* Horizontal bar */}
          {reportees.length > 1 && (
            <div style={{ height: 2, background: "var(--glass-border)", width: `${reportees.length * 190}px`, maxWidth: "90vw" }} />
          )}
          <div style={{ display: "flex", gap: 30, alignItems: "flex-start", position: "relative" }}>
            {reportees.map(r => (
              <div key={r.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: 2, height: 24, background: "var(--glass-border)" }} />
                <OrgNode emp={r} all={all} depth={depth + 1} editMode={editMode} onDrop={onDrop} onClick={onClick} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function OrganogramPage() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [empStats, setEmpStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Record<string, string | null>>({});

  const isSuperAdmin = profile?.role === "superadmin";

  useEffect(() => {
    load();
  }, [profile]);

  const load = async () => {
    setLoading(true);
    const [empRes, permRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, role, designation, manager_id, is_active, avatar_url").eq("is_active", true).order("full_name"),
      profile?.id
        ? supabase.from("admin_permissions").select("permission").eq("user_id", profile.id).eq("permission", "edit_organogram").maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setEmployees(empRes.data ?? []);
    setCanEdit(isSuperAdmin || !!permRes.data);
    setLoading(false);
  };

  // Roots = employees with no manager or manager not in active list
  const activeIds = new Set(employees.map(e => e.id));
  const roots = employees.filter(e => !e.manager_id || !activeIds.has(e.manager_id));
  // Unassigned = regular employees (not admins) with no manager — admins are valid roots
  const unassigned = employees.filter(e => !e.manager_id && e.role === "employee");

  const handleDrop = useCallback((draggedId: string, newManagerId: string) => {
    setEmployees(prev => prev.map(e => e.id === draggedId ? { ...e, manager_id: newManagerId } : e));
    setPendingChanges(prev => ({ ...prev, [draggedId]: newManagerId }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    for (const [userId, managerId] of Object.entries(pendingChanges)) {
      await supabase.from("profiles").update({ manager_id: managerId || null }).eq("id", userId);
    }
    setPendingChanges({});
    setSaving(false);
    setEditMode(false);
    await load();
  };

  const handleDiscard = () => {
    setPendingChanges({});
    setEditMode(false);
    load();
  };

  const loadEmpStats = async (emp: Employee) => {
    setEmpStats(null);
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
    const todayStr = today.toISOString().split("T")[0];

    const [attRes, lvRes, balRes] = await Promise.all([
      supabase.from("attendance_records").select("*").eq("user_id", emp.id).gte("date", monthStart).lte("date", todayStr),
      supabase.from("leave_requests").select("*").eq("user_id", emp.id).eq("status", "pending"),
      supabase.from("leave_balances").select("*, leave_types(name)").eq("user_id", emp.id).eq("financial_year", today.getMonth() < 3 ? today.getFullYear() - 1 : today.getFullYear()),
    ]);
    setEmpStats({ attendance: attRes.data ?? [], pendingLeaves: lvRes.data ?? [], balances: balRes.data ?? [] });
  };

  const handleNodeClick = (emp: Employee) => {
    setSelected(emp);
    loadEmpStats(emp);
  };

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner} /></div>;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Organisation Chart</h1>
          <p>Visual hierarchy of your team · {employees.length} active employees</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {canEdit && !editMode && (
            <button onClick={() => setEditMode(true)}
              style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.1)", color: "var(--accent-primary)", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontWeight: 600, fontSize: "0.88rem" }}>
              ✏️ Edit Hierarchy
            </button>
          )}
          {editMode && (
            <>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontWeight: 700, fontSize: "0.88rem" }}>
                {saving ? "Saving..." : `💾 Save Changes${Object.keys(pendingChanges).length > 0 ? ` (${Object.keys(pendingChanges).length})` : ""}`}
              </button>
              <button onClick={handleDiscard}
                style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid var(--glass-border)", background: "var(--glass-bg)", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "Outfit,sans-serif", fontSize: "0.88rem" }}>
                Discard
              </button>
            </>
          )}
        </div>
      </div>

      {editMode && (
        <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b", padding: "12px 20px", borderRadius: 12, marginBottom: 20, fontSize: "0.88rem" }}>
          ✏️ <strong>Edit Mode:</strong> Drag any employee card and drop it onto another to change their reporting line. Click Save when done.
        </div>
      )}

      <div style={{ display: "flex", gap: 24 }}>
        {/* ── Org Tree ── */}
        <div style={{ flex: 1, overflowX: "auto", paddingBottom: 24 }}>
          <div style={{ minWidth: "max-content", padding: "24px 32px" }}>
            {roots.length === 0 ? (
              <div style={{ color: "var(--text-secondary)", textAlign: "center", padding: 48 }}>No employees found.</div>
            ) : (
              <div style={{ display: "flex", gap: 48, alignItems: "flex-start", flexWrap: "wrap" }}>
                {roots.map(r => (
                  <OrgNode key={r.id} emp={r} all={employees} depth={0} editMode={editMode} onDrop={handleDrop} onClick={handleNodeClick} />
                ))}
              </div>
            )}
          </div>

          {/* ── Unassigned employees (non-admin with no manager) ── */}
          {unassigned.length > 0 && (
            <div style={{ marginTop: 24, padding: "0 32px" }}>
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "14px 18px" }}>
                <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--danger)", marginBottom: 10 }}>
                  ⚠️ {unassigned.length} employee{unassigned.length > 1 ? "s" : ""} without a reporting manager
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {unassigned.map(u => (
                    <div key={u.id} onClick={() => handleNodeClick(u)}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 20, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", cursor: "pointer" }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg,#ef4444,#dc2626)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                        {u.avatar_url
                          ? <img src={u.avatar_url} alt={u.full_name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                          : u.full_name?.charAt(0)?.toUpperCase()}
                      </div>
                      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--danger)", whiteSpace: "nowrap" }}>{u.full_name}</span>
                      {u.designation && <span style={{ fontSize: "0.72rem", color: "rgba(239,68,68,0.7)" }}>&middot; {u.designation}</span>}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 10 }}>
                  Go to <strong>Users</strong> page or use <strong>Edit Hierarchy</strong> mode to assign a reporting manager.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Side Panel ── */}
        {selected && (
          <div style={{ width: 280, flexShrink: 0 }}>
            <div className="glass-panel" style={{ padding: 20, position: "sticky", top: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ fontSize: "0.95rem", margin: 0 }}>{selected.full_name}</h3>
                <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "1.1rem" }}>×</button>
              </div>
              {selected.designation && <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 12 }}>{selected.designation}</div>}
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: 4 }}>Reports to</div>
              <div style={{ fontWeight: 600, fontSize: "0.88rem", marginBottom: 16 }}>
                {selected.manager_id ? (employees.find(e => e.id === selected.manager_id)?.full_name ?? "—") : "— No Manager —"}
              </div>

              {!empStats ? (
                <div style={{ textAlign: "center", padding: 20 }}><div className={styles.spinner} style={{ margin: "0 auto" }} /></div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                    <div style={{ flex: 1, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                      <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--success)" }}>{empStats.attendance.length}</div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>Days this month</div>
                    </div>
                    <div style={{ flex: 1, background: empStats.pendingLeaves.length > 0 ? "rgba(245,158,11,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${empStats.pendingLeaves.length > 0 ? "rgba(245,158,11,0.3)" : "var(--glass-border)"}`, borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                      <div style={{ fontSize: "1.3rem", fontWeight: 700, color: empStats.pendingLeaves.length > 0 ? "#f59e0b" : "var(--text-secondary)" }}>{empStats.pendingLeaves.length}</div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>Pending leaves</div>
                    </div>
                  </div>
                  {empStats.balances.length > 0 && (
                    <>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: 8 }}>Leave Balances</div>
                      {empStats.balances.map((b: any) => (
                        <div key={b.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: 6 }}>
                          <span style={{ color: "var(--text-secondary)" }}>{b.leave_types?.name?.replace(" Leave", "")}</span>
                          <span style={{ fontWeight: 600, color: (b.accrued - b.used) <= 0 ? "var(--danger)" : "var(--success)" }}>{(b.accrued - b.used).toFixed(1)}</span>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
