"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ShieldCheck, Plus, Trash2, Check, Mail } from "lucide-react";
import dp from "../dev-page.module.css";

interface Admin {
  id:          string;
  full_name:   string | null;
  system_role: string;
  created_at:  string;
  // email is in auth.users — we'll use a workaround via profiles
  company_id:  string | null;
}

export default function AdminsPage() {
  const [admins,   setAdmins]   = useState<Admin[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [err,      setErr]      = useState("");
  const [success,  setSuccess]  = useState("");

  const [form, setForm] = useState({
    fullName: "", email: "", password: "",
  });

  useEffect(() => { loadAdmins(); }, []);

  async function loadAdmins() {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, system_role, created_at, company_id")
      .in("system_role", ["platform_owner", "platform_admin"])
      .order("created_at");
    setAdmins(data ?? []);
    setLoading(false);
  }

  async function addAdmin() {
    setErr(""); setSaving(true);
    try {
      const res = await fetch("/api/admins/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email:    form.email,
          password: form.password,
          fullName: form.fullName,
          role:     "platform_admin",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create admin");
      setSuccess(`${form.fullName} has been added as a Platform Admin.`);
      setForm({ fullName: "", email: "", password: "" });
      setShowForm(false);
      loadAdmins();
      setTimeout(() => setSuccess(""), 5000);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeAdmin(admin: Admin) {
    if (admin.system_role === "platform_owner") {
      alert("Cannot remove the Platform Owner.");
      return;
    }
    if (!confirm(`Revoke platform admin access for ${admin.full_name}?\nThey will lose all developer panel access.`)) return;
    setRemoving(admin.id);
    await supabase.from("profiles")
      .update({ system_role: null })
      .eq("id", admin.id);
    setRemoving(null);
    loadAdmins();
  }

  const roleColor = (role: string) =>
    role === "platform_owner" ? "#f59e0b" : "#6366f1";

  const roleLabel = (role: string) =>
    role === "platform_owner" ? "Platform Owner" : "Platform Admin";

  return (
    <div className={dp.page}>
      <div className={dp.pageHeader}>
        <div>
          <h1 className={dp.heading}>Platform Administrators</h1>
          <p className={dp.subheading}>
            Manage who has access to the Developer Control Center.
          </p>
        </div>
        <button className={dp.primaryBtn} onClick={() => setShowForm(v => !v)}>
          <Plus size={16} /> Add Admin
        </button>
      </div>

      {/* Success / error banners */}
      {success && (
        <div style={{
          background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)",
          color: "#34d399", padding: "12px 18px", borderRadius: 10, marginBottom: 20,
          fontSize: "0.88rem", display: "flex", alignItems: "center", gap: 8,
        }}>
          <Check size={15} /> {success}
        </div>
      )}

      {/* Inline invite form */}
      {showForm && (
        <div style={{
          background: "#0c0e17", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14, padding: 24, marginBottom: 24,
        }}>
          <h3 style={{ color: "#fff", margin: "0 0 18px 0", fontSize: "1rem", fontWeight: 700 }}>
            Invite Platform Admin
          </h3>
          {err && (
            <div style={{
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
              color: "#fca5a5", padding: "10px 14px", borderRadius: 10, marginBottom: 16, fontSize: "0.85rem",
            }}>{err}</div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#64748b", marginBottom: 5 }}>Full Name</div>
              <input
                style={{ width: "100%", background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 12px", color: "#fff", fontFamily: "inherit", fontSize: "0.9rem", boxSizing: "border-box" }}
                value={form.fullName}
                onChange={e => setForm(f => ({...f, fullName: e.target.value}))}
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#64748b", marginBottom: 5 }}>Email</div>
              <input
                type="email"
                style={{ width: "100%", background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 12px", color: "#fff", fontFamily: "inherit", fontSize: "0.9rem", boxSizing: "border-box" }}
                value={form.email}
                onChange={e => setForm(f => ({...f, email: e.target.value}))}
                placeholder="jane@ccshrms.com"
              />
            </div>
            <div>
              <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#64748b", marginBottom: 5 }}>Initial Password</div>
              <input
                type="password"
                style={{ width: "100%", background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 12px", color: "#fff", fontFamily: "inherit", fontSize: "0.9rem", boxSizing: "border-box" }}
                value={form.password}
                onChange={e => setForm(f => ({...f, password: e.target.value}))}
                placeholder="Min. 8 chars"
              />
            </div>
            <button
              onClick={addAdmin}
              disabled={saving || !form.email || !form.password || !form.fullName}
              style={{
                padding: "10px 18px", borderRadius: 10, background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                border: "none", color: "#fff", fontWeight: 700, fontSize: "0.88rem",
                cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                opacity: (saving || !form.email || !form.password || !form.fullName) ? 0.6 : 1,
              }}
            >
              {saving ? "Adding…" : <><Mail size={14} style={{display:"inline",marginRight:5}} />Send Invite</>}
            </button>
          </div>
        </div>
      )}

      {/* Admins table */}
      <div className={dp.panel}>
        <div className={dp.countLabel}>
          {loading ? "Loading…" : `${admins.length} platform-level user${admins.length !== 1 ? "s" : ""}`}
        </div>
        {loading ? (
          <div className={dp.loading}>Loading admins…</div>
        ) : (
          <table className={dp.table}>
            <thead>
              <tr>
                <th>Administrator</th>
                <th>Role</th>
                <th>Since</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {admins.map(admin => {
                const initials = (admin.full_name ?? "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
                const color    = roleColor(admin.system_role);
                const isOwner  = admin.system_role === "platform_owner";
                return (
                  <tr key={admin.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10,
                          background: `linear-gradient(135deg, ${color}22, ${color}44)`,
                          border: `1px solid ${color}30`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "0.82rem", fontWeight: 700, color, flexShrink: 0,
                        }}>
                          {initials}
                        </div>
                        <div>
                          <div className={dp.cellPrimary}>{admin.full_name ?? "—"}</div>
                          <div className={dp.cellSub}>ID: {admin.id.slice(0, 8)}…</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={dp.badge} style={{
                        background: `${color}15`,
                        color,
                        border: `1px solid ${color}25`,
                      }}>
                        <ShieldCheck size={10} style={{ display: "inline", marginRight: 4 }} />
                        {roleLabel(admin.system_role)}
                      </span>
                    </td>
                    <td>
                      {new Date(admin.created_at).toLocaleDateString("en-US", {
                        month: "long", day: "numeric", year: "numeric",
                      })}
                    </td>
                    <td>
                      {!isOwner && (
                        <button
                          className={dp.iconBtn}
                          onClick={() => removeAdmin(admin)}
                          disabled={removing === admin.id}
                          title="Revoke admin access"
                          style={{ color: "#f87171", borderColor: "rgba(239,68,68,0.2)" }}
                        >
                          {removing === admin.id
                            ? <ShieldCheck size={14} />
                            : <Trash2 size={14} />}
                        </button>
                      )}
                      {isOwner && (
                        <span style={{ fontSize: "0.75rem", color: "#334155" }}>Protected</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
