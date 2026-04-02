"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "../../dashboard.module.css";

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase.from("profiles").select("*").order("created_at");
    setUsers(data ?? []);
    setManagers((data ?? []).filter((u: any) => u.role === "admin" || u.role === "superadmin"));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateRole = async (id: string, role: string) => {
    await supabase.from("profiles").update({ role }).eq("id", id);
    load();
  };

  const updateManager = async (id: string, manager_id: string) => {
    await supabase.from("profiles").update({ manager_id: manager_id || null }).eq("id", id);
    load();
  };

  const roleStyle = (role: string) =>
    role === "superadmin" ? styles.badgeDanger : role === "admin" ? styles.badgeWarning : styles.badgeInfo;

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner}></div></div>;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>User Management</h1>
        <p>Manage employee roles and reporting lines</p>
      </div>

      <div className="glass-panel" style={{ padding: "12px 0", marginBottom: 20 }}>
        <div style={{ padding: "8px 16px 16px", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
          💡 To add a new employee, create their account in Supabase Auth, then their profile will appear here automatically after first login.
        </div>
      </div>

      <div className={`glass-panel ${styles.tableWrap}`}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Reports To</th>
              <th>Change Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.85rem" }}>
                      {u.full_name?.charAt(0)?.toUpperCase()}
                    </div>
                    {u.full_name}
                  </div>
                </td>
                <td><span className={`${styles.statBadge} ${roleStyle(u.role)}`}>{u.role}</span></td>
                <td>
                  <select
                    className="premium-input"
                    style={{ padding: "6px 10px", fontSize: "0.82rem" }}
                    value={u.manager_id ?? ""}
                    onChange={e => updateManager(u.id, e.target.value)}
                    disabled={u.role !== "employee"}
                  >
                    <option value="">— No Manager —</option>
                    {managers.filter(m => m.id !== u.id).map((m: any) => (
                      <option key={m.id} value={m.id}>{m.full_name}</option>
                    ))}
                  </select>
                </td>
                <td>
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
