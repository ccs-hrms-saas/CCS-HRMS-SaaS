"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useModules } from "@/context/ModulesContext";
import styles from "../../dashboard.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Holiday {
  id: string;
  date: string;
  name: string;
  scope: "all" | "group";
  description: string | null;
  groupScopes?: Group[];
}

interface Group {
  id: string;
  name: string;
  color: string;
  icon: string;
}

const emptyForm = { date: "", name: "", description: "", scope: "all" as "all" | "group", groupIds: [] as string[] };

// ── Reusable mini badge ───────────────────────────────────────────────────────
function GroupBadge({ g }: { g: Group }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 600, background: `${g.color}18`, color: g.color, border: `1px solid ${g.color}30` }}>
      {g.icon} {g.name}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminHolidays() {
  const { profile } = useAuth();
  const { getProps } = useModules();
  const modProps = getProps("holidays");
  const groupHolidaysEnabled = modProps.allow_group_holidays !== false; // default ON

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [groups,   setGroups]   = useState<Group[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState<Holiday | null>(null);
  const [form,     setForm]     = useState(emptyForm);

  const companyId = profile?.company_id;

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);

    const [{ data: hols }, { data: grps }] = await Promise.all([
      supabase.from("company_holidays").select("id, date, name, scope, description").eq("company_id", companyId).order("date", { ascending: true }),
      supabase.from("employee_groups").select("id,name,color,icon").eq("company_id", companyId).order("name"),
    ]);

    // For group-scoped holidays, fetch their linked groups
    const groupHolIds = (hols ?? []).filter((h: Holiday) => h.scope === "group").map((h: Holiday) => h.id);
    let scopeMap: Record<string, Group[]> = {};

    if (groupHolIds.length > 0) {
      const { data: scopes } = await supabase
        .from("holiday_group_scopes")
        .select("holiday_id, employee_groups(id,name,color,icon)")
        .in("holiday_id", groupHolIds);

      (scopes ?? []).forEach((s: any) => {
        if (!scopeMap[s.holiday_id]) scopeMap[s.holiday_id] = [];
        if (s.employee_groups) scopeMap[s.holiday_id].push(s.employee_groups);
      });
    }

    setHolidays((hols ?? []).map((h: Holiday) => ({ ...h, groupScopes: scopeMap[h.id] ?? [] })));
    setGroups(grps ?? []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (h: Holiday) => {
    setEditing(h);
    setForm({
      date: h.date,
      name: h.name,
      description: h.description ?? "",
      scope: h.scope,
      groupIds: (h.groupScopes ?? []).map(g => g.id),
    });
    setShowForm(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    setSaving(true); setError(null);

    if (form.scope === "group" && form.groupIds.length === 0) {
      setError("Please select at least one group for a group-scoped holiday.");
      setSaving(false); return;
    }

    const payload = {
      date: form.date,
      name: form.name,
      description: form.description || null,
      scope: form.scope,
      company_id: companyId,
    };

    let holidayId: string;

    if (editing) {
      const { error: err } = await supabase.from("company_holidays").update(payload).eq("id", editing.id);
      if (err) { setError(err.message); setSaving(false); return; }
      holidayId = editing.id;
      // Clear old scopes
      await supabase.from("holiday_group_scopes").delete().eq("holiday_id", editing.id);
    } else {
      const { data, error: err } = await supabase.from("company_holidays").insert(payload).select("id").single();
      if (err || !data) { setError(err?.message ?? "Insert failed"); setSaving(false); return; }
      holidayId = data.id;
    }

    // Write group scopes
    if (form.scope === "group" && form.groupIds.length > 0) {
      await supabase.from("holiday_group_scopes").insert(
        form.groupIds.map(gid => ({ holiday_id: holidayId, group_id: gid, company_id: companyId }))
      );
    }

    setShowForm(false); setSaving(false);
    load();
  };

  const del = async (h: Holiday) => {
    if (!confirm(`Remove "${h.name}" (${h.scope === "group" ? "group-scoped" : "company-wide"}) holiday?`)) return;
    await supabase.from("company_holidays").delete().eq("id", h.id);
    load();
  };

  const toggleGroup = (id: string) => {
    setForm(f => ({
      ...f,
      groupIds: f.groupIds.includes(id) ? f.groupIds.filter(x => x !== id) : [...f.groupIds, id],
    }));
  };

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner} /></div>;

  return (
    <div className="animate-fade-in">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className={styles.pageHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Holiday Calendar</h1>
          <p>
            Define official company holidays.
            {groupHolidaysEnabled && <> Group-scoped holidays apply only to selected employee groups.</>}
          </p>
        </div>
        <button className={styles.primaryBtn} style={{ width: "auto", padding: "12px 24px" }} onClick={openNew}>
          + Add Holiday
        </button>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      {holidays.length > 0 && (
        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          {[
            { label: "Total Holidays", value: holidays.length, color: "#818cf8" },
            { label: "Company-Wide", value: holidays.filter(h => h.scope === "all").length, color: "#34d399" },
            ...(groupHolidaysEnabled ? [{ label: "Group-Scoped", value: holidays.filter(h => h.scope === "group").length, color: "#f59e0b" }] : []),
          ].map(s => (
            <div key={s.label} className="glass-panel" style={{ padding: "14px 20px", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: "1.6rem", fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Holiday Table ──────────────────────────────────────────────────── */}
      <div className={`glass-panel ${styles.tableWrap}`}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Day</th>
              <th>Holiday Name</th>
              <th>Scope</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {holidays.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 40 }}>No holidays defined.</td></tr>
            ) : holidays.map(h => (
              <tr key={h.id}>
                <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                  {new Date(h.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                </td>
                <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                  {new Date(h.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long" })}
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{h.name}</div>
                  {h.description && <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: 2 }}>{h.description}</div>}
                </td>
                <td>
                  {h.scope === "all" ? (
                    <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" }}>
                      🌍 All Employees
                    </span>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {(h.groupScopes ?? []).length === 0
                        ? <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>— no groups</span>
                        : (h.groupScopes ?? []).map(g => <GroupBadge key={g.id} g={g} />)
                      }
                    </div>
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => openEdit(h)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--glass-border)", background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.8rem" }}>✏️</button>
                    <button onClick={() => del(h)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "var(--danger)", cursor: "pointer", fontSize: "0.8rem" }}>🗑</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ══ Holiday Form Drawer ════════════════════════════════════════════════ */}
      {showForm && (
        <div className="overlay" onClick={() => setShowForm(false)}>
          <div className="drawer" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="drawerHeader">
              <h2>{editing ? "Edit Holiday" : "Add Holiday"}</h2>
              <button onClick={() => setShowForm(false)} className="closeBtn">✕</button>
            </div>

            <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {error && (
                <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", fontSize: "0.82rem" }}>
                  ⚠️ {error}
                </div>
              )}

              {/* Date + Name */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                  <label>Date *</label>
                  <input type="date" className="premium-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
                </div>
                <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                  <label>Holiday Name *</label>
                  <input className="premium-input" placeholder="e.g. Diwali, Eid-ul-Fitr" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                </div>
              </div>

              {/* Description */}
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Description (optional)</label>
                <input className="premium-input" placeholder="e.g. National festival" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>

              {/* Scope selector — only shown if feature is ON */}
              {groupHolidaysEnabled && (
                <div>
                  <label style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: 8, display: "block" }}>Who does this holiday apply to?</label>
                  <div style={{ display: "flex", gap: 10 }}>
                    {([["all", "🌍", "All Employees", "#34d399"], ["group", "👥", "Specific Groups", "#f59e0b"]] as const).map(([val, icon, label, color]) => (
                      <button
                        type="button" key={val}
                        onClick={() => setForm({ ...form, scope: val, groupIds: [] })}
                        style={{
                          flex: 1, padding: "10px 14px", borderRadius: 10, cursor: "pointer", transition: "all 0.15s",
                          border: `2px solid ${form.scope === val ? color : "rgba(255,255,255,0.08)"}`,
                          background: form.scope === val ? `${color}15` : "rgba(255,255,255,0.03)",
                          color: form.scope === val ? color : "var(--text-secondary)",
                          fontSize: "0.82rem", fontWeight: form.scope === val ? 700 : 400,
                        }}
                      >
                        {icon} {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Group picker */}
              {form.scope === "group" && groupHolidaysEnabled && (
                <div>
                  <label style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: 8, display: "block" }}>
                    Select Groups * <span style={{ fontSize: "0.72rem", opacity: 0.7 }}>({form.groupIds.length} selected)</span>
                  </label>
                  {groups.length === 0 ? (
                    <div style={{ padding: "12px 16px", borderRadius: 10, border: "1px dashed rgba(255,255,255,0.1)", color: "var(--text-secondary)", fontSize: "0.82rem", textAlign: "center" }}>
                      No groups found. Create groups first from <strong>Groups</strong> page.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 240, overflowY: "auto", padding: 2 }}>
                      {groups.map(g => {
                        const selected = form.groupIds.includes(g.id);
                        return (
                          <label key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${selected ? g.color : "rgba(255,255,255,0.06)"}`, background: selected ? `${g.color}12` : "rgba(255,255,255,0.02)", transition: "all 0.15s" }}>
                            <input type="checkbox" checked={selected} onChange={() => toggleGroup(g.id)} style={{ accentColor: g.color, width: 15, height: 15 }} />
                            <GroupBadge g={g} />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <button type="submit" className={styles.primaryBtn} disabled={saving} style={{ marginTop: 4 }}>
                {saving ? "Saving…" : editing ? "💾 Update Holiday" : "✅ Add Holiday"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
