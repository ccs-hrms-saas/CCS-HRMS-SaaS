"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import styles from "../../dashboard.module.css";

const PERMISSIONS = [
  { key: "edit_organogram",      label: "Edit Organogram",         desc: "Drag-and-drop reassign reporting lines in the org chart" },
  { key: "view_payroll",         label: "View Payroll",            desc: "Access the Payroll module and salary data" },
  { key: "override_attendance",  label: "Override Attendance",     desc: "Manually add or correct attendance records" },
  { key: "manage_leave_settings",label: "Manage Leave Settings",   desc: "Add, edit or delete leave types and policies" },
  { key: "manage_holidays",      label: "Manage Holidays",         desc: "Add, edit or delete company holidays" },
];

export default function AdminPermissionsPage() {
  const { profile } = useAuth();
  const [admins, setAdmins] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<Record<string, Set<string>>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const isSuperAdmin = profile?.role === "superadmin";

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    const [adminsRes, permsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, role, designation").in("role", ["admin"]).eq("is_active", true).order("full_name"),
      supabase.from("admin_permissions").select("*"),
    ]);

    setAdmins(adminsRes.data ?? []);

    const map: Record<string, Set<string>> = {};
    (permsRes.data ?? []).forEach((p: any) => {
      if (!map[p.user_id]) map[p.user_id] = new Set();
      map[p.user_id].add(p.permission);
    });
    setPermissions(map);
  };

  const toggle = async (userId: string, perm: string) => {
    if (!isSuperAdmin) return;
    const has = permissions[userId]?.has(perm);
    setSaving(true);

    if (has) {
      await supabase.from("admin_permissions").delete().eq("user_id", userId).eq("permission", perm);
    } else {
      await supabase.from("admin_permissions").insert({ user_id: userId, permission: perm, granted_by: profile?.id });
    }

    // Update local state optimistically
    setPermissions(prev => {
      const next = { ...prev };
      if (!next[userId]) next[userId] = new Set();
      else next[userId] = new Set(next[userId]);
      if (has) next[userId].delete(perm);
      else next[userId].add(perm);
      return next;
    });

    setMsg(has ? `Revoked "${perm.replace(/_/g, " ")}"` : `Granted "${perm.replace(/_/g, " ")}"`);
    setTimeout(() => setMsg(""), 2500);
    setSaving(false);
  };

  if (!isSuperAdmin) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, color: "var(--text-secondary)" }}>
        <div style={{ fontSize: "3rem", marginBottom: 16 }}>🔒</div>
        <h2 style={{ marginBottom: 8 }}>Super Admin Only</h2>
        <p>You do not have permission to manage admin access.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>Admin Permissions</h1>
        <p>Control what each admin can access and manage. Super Admin always has full access.</p>
      </div>

      {msg && (
        <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "var(--success)", padding: "12px 20px", borderRadius: 12, marginBottom: 20, fontSize: "0.9rem" }}>
          ✅ {msg}
        </div>
      )}

      {admins.length === 0 ? (
        <div className="glass-panel" style={{ padding: 32, textAlign: "center", color: "var(--text-secondary)" }}>
          No other admins found. Add an admin-role user first from User Management.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {admins.map(admin => (
            <div key={admin.id} className="glass-panel" style={{ padding: 24 }}>
              {/* Admin header */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--glass-border)" }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#2563eb)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff", fontSize: "1.1rem", flexShrink: 0 }}>
                  {admin.full_name?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "1rem" }}>{admin.full_name}</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{admin.designation || "Admin"}</div>
                </div>
                <div style={{ marginLeft: "auto", fontSize: "0.75rem", padding: "4px 12px", borderRadius: 20, background: "rgba(59,130,246,0.15)", color: "#3b82f6", fontWeight: 600 }}>
                  Admin
                </div>
              </div>

              {/* Permission toggles */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                {PERMISSIONS.map(p => {
                  const granted = permissions[admin.id]?.has(p.key) ?? false;
                  return (
                    <div key={p.key} onClick={() => toggle(admin.id, p.key)}
                      style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px", borderRadius: 12, border: `1px solid ${granted ? "rgba(16,185,129,0.4)" : "var(--glass-border)"}`, background: granted ? "rgba(16,185,129,0.07)" : "rgba(255,255,255,0.02)", cursor: saving ? "not-allowed" : "pointer", transition: "all 0.2s" }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${granted ? "#10b981" : "var(--glass-border)"}`, background: granted ? "#10b981" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}>
                        {granted && <span style={{ color: "#fff", fontSize: "0.75rem", fontWeight: 700 }}>✓</span>}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "0.88rem", color: granted ? "var(--success)" : "var(--text-primary)" }}>{p.label}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.4 }}>{p.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
