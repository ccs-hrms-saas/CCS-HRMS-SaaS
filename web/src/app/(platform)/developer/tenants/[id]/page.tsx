"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import {
  ArrowLeft, Globe, Ban, CheckCircle2, Settings2,
  Users, Smartphone, AlertTriangle, LayoutDashboard,
  ToggleLeft, UserCog, Tablet, MonitorSmartphone, Trash2,
  Receipt, ShieldCheck, TrendingUp,
} from "lucide-react";
import s from "./tenant-detail.module.css";
import MobileTab from "./MobileTab";
import PayrollConfigPanel from "./PayrollConfigPanel";
import LeaveConfigPanel from "./LeaveConfigPanel";
import ReimbConfigPanel from "./ReimbConfigPanel";
import ProfilesConfigPanel from "./ProfilesConfigPanel";
import IncentivesConfigPanel from "./IncentivesConfigPanel";
import TierStatusBadge from "./TierStatusBadge";
import CapabilitySnapshot from "./CapabilitySnapshot";

// ── Types ──────────────────────────────────────────────────────────────────
interface Company {
  id: string; name: string; subdomain: string | null; domain: string | null;
  is_active: boolean; created_at: string; branding: Record<string, any>;
}
interface Module {
  id: string; module_key: string; is_enabled: boolean; properties: Record<string, any>;
}
interface Profile {
  id: string; full_name: string; role: string; system_role: string | null; created_at: string;
}
interface KioskDevice {
  id: string; device_name: string; is_active: boolean; last_ping: string | null; registered_at: string;
}

// ── Module metadata (label + description + icon) ────────────────────────────
const MODULE_META: Record<string, { label: string; desc: string; icon: React.ElementType }> = {
  kpi_dashboard:       { label: "KPI Dashboard",         desc: "Which stats visible on the admin home page",               icon: LayoutDashboard },
  staff_management:    { label: "Staff Management",       desc: "Employee roster, seat limits, self-registration",          icon: Users },
  attendance:          { label: "Attendance",             desc: "Clock-in tracking, grace period, overtime rules",          icon: ToggleLeft },
  kiosk_attendance:    { label: "Kiosk Attendance",       desc: "Android tablet kiosk app for physical punch-ins",         icon: Tablet },
  leave_management:    { label: "Leave Management",       desc: "Leave request workflow, balances, approvals",              icon: ToggleLeft },
  leave_settings:      { label: "Leave Type Config",      desc: "Who can configure leave types and limits — Basic/Standard/Advanced", icon: Settings2 },
  overrides:           { label: "Manual Overrides",       desc: "Who can manually correct attendance records",              icon: UserCog },
  payroll:             { label: "Payroll",                desc: "Salary processing — Basic/Standard/Advanced tier",        icon: ToggleLeft },
  reports:             { label: "Reports",                desc: "Which downloadable HR reports are available",              icon: ToggleLeft },
  announcements:       { label: "Announcements",          desc: "Who can post announcements and approval rules",            icon: ToggleLeft },
  hr_policies:         { label: "HR Policies",            desc: "Policy document publishing and approval rules",            icon: ToggleLeft },
  holidays:            { label: "Holidays",               desc: "Company holiday calendar management",                     icon: ToggleLeft },
  appraisals:          { label: "Performance Appraisals", desc: "Review cycles, 360 feedback, reviewer assignment",        icon: ToggleLeft },
  organogram:          { label: "Organogram",             desc: "Org chart — view only or editable",                       icon: ToggleLeft },
  permissions:         { label: "Permissions",            desc: "Role customisation depth for this tenant",                icon: ToggleLeft },
  approvals:           { label: "Approval Chains",        desc: "Multi-level approval workflows",                          icon: ToggleLeft },
  notifications:       { label: "Notifications",          desc: "In-app and email notification channels",                  icon: ToggleLeft },
  employee_mobile_app: { label: "Employee Mobile App",    desc: "Android app features available to employees",             icon: MonitorSmartphone },
  reimbursements:      { label: "Reimbursements",         desc: "Expense claims with tiered approval chains — Basic/Standard/Advanced", icon: Receipt },
  profiles:            { label: "Profiles & Roles",       desc: "Who can manage employee profiles and permissions — Basic/Standard/Advanced", icon: ShieldCheck },
  incentives:          { label: "Incentive Structure",    desc: "Goal-based incentive plans with payout rules — Basic/Standard/Advanced", icon: TrendingUp },
};

const TABS = [
  { key: "overview",  label: "Overview",      icon: LayoutDashboard },
  { key: "modules",   label: "Modules",       icon: ToggleLeft },
  { key: "snapshot",  label: "Snapshot",      icon: ShieldCheck },
  { key: "users",     label: "Users",         icon: Users },
  { key: "mobile",    label: "Mobile & Kiosk",icon: Smartphone },
  { key: "domains",   label: "Domains",       icon: Globe },
  { key: "danger",    label: "Danger Zone",   icon: AlertTriangle, isDanger: true },
];

// ── Main Component ──────────────────────────────────────────────────────────
export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [company,  setCompany]  = useState<Company | null>(null);
  const [modules,  setModules]  = useState<Module[]>([]);
  const [users,    setUsers]    = useState<Profile[]>([]);
  const [devices,  setDevices]  = useState<KioskDevice[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState("overview");
  const [saving,   setSaving]   = useState(false);

  // Local edit state for Overview tab
  const [editName,      setEditName]      = useState("");
  const [editSubdomain, setEditSubdomain] = useState("");
  const [editDomain,    setEditDomain]    = useState("");

  // Module properties panel open state
  const [openProps,    setOpenProps]   = useState<string | null>(null);
  const [propsEdit,    setPropsEdit]   = useState<Record<string, any>>({});
  const [savingProps,  setSavingProps] = useState(false);

  // Superadmin credentials
  const [adminInfo,     setAdminInfo]     = useState<{ email: string; adminName: string } | null>(null);
  const [resetResult,   setResetResult]   = useState<{ email: string; newPassword: string } | null>(null);
  const [resetting,     setResetting]     = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: co }, { data: mods }, { data: usrs }, { data: devs }] = await Promise.all([
      supabase.from("companies").select("*").eq("id", id).single(),
      supabase.from("company_modules").select("*").eq("company_id", id).order("module_key"),
      supabase.from("profiles").select("id, full_name, role, system_role, created_at").eq("company_id", id).order("full_name"),
      supabase.from("kiosk_devices").select("*").eq("company_id", id).order("registered_at", { ascending: false }),
    ]);
    if (co) {
      setCompany(co);
      setEditName(co.name);
      setEditSubdomain(co.subdomain ?? "");
      setEditDomain(co.domain ?? "");
    }
    setModules(mods ?? []);
    setUsers(usrs ?? []);
    setDevices(devs ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Fetch superadmin info when Overview tab is active
  useEffect(() => {
    if (tab === "overview" && id && !adminInfo) {
      fetch(`/api/tenants/${id}/reset-admin-password`)
        .then(r => r.json())
        .then(d => { setAdminInfo({ email: d.email ?? '—', adminName: d.adminName ?? '—' }); });
    }
  }, [tab, id, adminInfo]);

  async function resetAdminPassword() {
    setResetting(true);
    setResetResult(null);
    const res  = await fetch(`/api/tenants/${id}/reset-admin-password`, { method: "POST" });
    const data = await res.json();
    if (res.ok) setResetResult({ email: data.email, newPassword: data.newPassword });
    setResetting(false);
  }

  // ── Overview save ──────────────────────────────────────────────────────
  async function saveOverview() {
    setSaving(true);
    await supabase.from("companies").update({
      name: editName, subdomain: editSubdomain || null, domain: editDomain || null,
    }).eq("id", id);
    await load();
    setSaving(false);
  }

  // ── Quick suspend / activate ───────────────────────────────────────────
  async function toggleActive() {
    if (!company) return;
    const newActive = !company.is_active;
    await supabase.from("companies").update({ is_active: newActive }).eq("id", id);
    await logAudit({ action: newActive ? "TENANT_ACTIVATED" : "TENANT_SUSPENDED", target_type: "company", target_id: id, new_value: { name: company.name } });
    await load();
  }

  // ── Module toggle ──────────────────────────────────────────────────────
  async function toggleModule(mod: Module) {
    const newVal = !mod.is_enabled;
    await supabase.from("company_modules").update({ is_enabled: newVal, updated_at: new Date().toISOString() }).eq("id", mod.id);
    await logAudit({ action: newVal ? "MODULE_ENABLED" : "MODULE_DISABLED", target_type: "module", target_id: id, new_value: { module_key: mod.module_key } });
    setModules(prev => prev.map(m => m.id === mod.id ? { ...m, is_enabled: newVal } : m));
  }

  // ── Module properties save ─────────────────────────────────────────────
  async function saveProps(mod: Module) {
    setSavingProps(true);
    await supabase.from("company_modules").update({ properties: propsEdit, updated_at: new Date().toISOString() }).eq("id", mod.id);
    await logAudit({ action: "MODULE_PROPERTIES_UPDATED", target_type: "module", target_id: id, old_value: { module_key: mod.module_key }, new_value: { module_key: mod.module_key, properties: propsEdit } });
    setModules(prev => prev.map(m => m.id === mod.id ? { ...m, properties: propsEdit } : m));
    setSavingProps(false);
    setOpenProps(null);
  }

  function openPropsPanel(mod: Module) {
    setPropsEdit({ ...mod.properties });
    setOpenProps(mod.id === openProps ? null : mod.id);
  }

  // ── Revoke kiosk device ────────────────────────────────────────────────
  async function revokeDevice(deviceId: string) {
    await supabase.from("kiosk_devices").update({ is_active: false }).eq("id", deviceId);
    setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, is_active: false } : d));
  }

  // ── Delete tenant ──────────────────────────────────────────────────────
  async function deleteTenant() {
    const confirmed = confirm(
      `⚠️ PERMANENT DELETE\n\nThis will permanently delete "${company?.name}" and ALL their data.\n\nType the company name to confirm:`
    );
    if (!confirmed) return;
    await logAudit({
      action:      "TENANT_DELETED",
      target_type: "company",
      target_id:   id,
      old_value:   { name: company?.name, subdomain: company?.subdomain },
    });
    await supabase.from("companies").delete().eq("id", id);
    router.push("/developer/tenants");
  }

  if (loading || !company) {
    return <div className={s.page}><div className={s.emptyState}>Loading tenant data...</div></div>;
  }

  const initials = company.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  // ── Ping freshness helper ──────────────────────────────────────────────
  function isRecentPing(ping: string | null) {
    if (!ping) return false;
    return (Date.now() - new Date(ping).getTime()) < 1000 * 60 * 15; // 15 min
  }

  return (
    <div className={s.page}>
      <Link href="/developer/tenants" className={s.backLink}>
        <ArrowLeft size={14} /> All Tenants
      </Link>

      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <div className={s.companyAvatar}>{initials}</div>
          <div>
            <h1 className={s.companyName}>{company.name}</h1>
            <div className={s.headerMeta}>
              <span className={`${s.badge} ${company.is_active ? s.badgeGreen : s.badgeRed}`}>
                {company.is_active ? "Active" : "Suspended"}
              </span>
              {company.subdomain && (
                <span className={s.metaChip}><Globe size={11} /> {company.subdomain}.ccshrms.com</span>
              )}
              {company.domain && (
                <span className={s.metaChip}><Globe size={11} /> {company.domain}</span>
              )}
              <span className={s.metaChip}>ID: {company.id.slice(0, 8)}…</span>
            </div>
          </div>
        </div>
        <div className={s.headerActions}>
          {company.is_active ? (
            <button className={s.suspendBtn} onClick={toggleActive}>
              <Ban size={15} /> Suspend
            </button>
          ) : (
            <button className={s.activateBtn} onClick={toggleActive}>
              <CheckCircle2 size={15} /> Activate
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className={s.tabs}>
        {TABS.map(({ key, label, icon: Icon, isDanger }) => (
          <button
            key={key}
            className={`${s.tab} ${isDanger ? s.tabDanger : ""} ${tab === key ? (isDanger ? s.tabDangerActive : s.tabActive) : ""}`}
            onClick={() => setTab(key)}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── TAB: Overview ─────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className={s.overviewGrid}>
          <div className={s.infoCard}>
            <h3 className={s.infoCardTitle}>Identity</h3>
            <div className={s.infoRow}>
              <span className={s.infoKey}>Company Name</span>
              <input className={s.editInput} value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className={s.infoRow}>
              <span className={s.infoKey}>Subdomain</span>
              <input className={s.editInput} value={editSubdomain} onChange={e => setEditSubdomain(e.target.value)} placeholder="none" />
            </div>
            <div className={s.infoRow}>
              <span className={s.infoKey}>Custom Domain</span>
              <input className={s.editInput} value={editDomain} onChange={e => setEditDomain(e.target.value)} placeholder="hr.company.com" />
            </div>
            <div className={s.infoRow}>
              <span className={s.infoKey}>Created</span>
              <span className={s.infoVal}>{new Date(company.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
            </div>
            <button className={s.saveBtn} onClick={saveOverview} disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>

          <div className={s.infoCard}>
            <h3 className={s.infoCardTitle}>Platform Stats</h3>
            <div className={s.infoRow}>
              <span className={s.infoKey}>Total Employees</span>
              <span className={s.infoVal}>{users.length}</span>
            </div>
            <div className={s.infoRow}>
              <span className={s.infoKey}>Kiosk Devices</span>
              <span className={s.infoVal}>{devices.filter(d => d.is_active).length} active</span>
            </div>
            <div className={s.infoRow}>
              <span className={s.infoKey}>Modules Enabled</span>
              <span className={s.infoVal}>{modules.filter(m => m.is_enabled).length} / {modules.length}</span>
            </div>
            <div className={s.infoRow}>
              <span className={s.infoKey}>Status</span>
              <span className={s.infoVal}>{company.is_active ? "✅ Active" : "⛔ Suspended"}</span>
            </div>
          </div>

          {/* ── Superadmin Credentials card ─────────────────────────── */}
          <div className={s.infoCard} style={{ marginTop: 16 }}>
            <h3 className={s.infoCardTitle}>🔑 Superadmin Credentials</h3>

            <div className={s.infoRow}>
              <span className={s.infoKey}>Admin Email</span>
              <span className={s.infoVal} style={{ fontFamily: "monospace" }}>
                {adminInfo?.email ?? "Loading…"}
              </span>
              {adminInfo?.email && (
                <button onClick={() => navigator.clipboard.writeText(adminInfo.email)}
                  style={{ padding:"4px 10px", borderRadius:7, border:"1px solid rgba(255,255,255,0.1)", background:"transparent", color:"#64748b", fontSize:"0.75rem", cursor:"pointer", fontFamily:"inherit" }}>
                  Copy
                </button>
              )}
            </div>
            <div className={s.infoRow}>
              <span className={s.infoKey}>Admin Name</span>
              <span className={s.infoVal}>{adminInfo?.adminName ?? "—"}</span>
            </div>
            <div className={s.infoRow}>
              <span className={s.infoKey}>Login URL</span>
              <span className={s.infoVal} style={{ fontFamily:"monospace", fontSize:"0.85rem" }}>
                {typeof window !== "undefined" ? window.location.origin : ""}/login
              </span>
              <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/login`)}
                style={{ padding:"4px 10px", borderRadius:7, border:"1px solid rgba(255,255,255,0.1)", background:"transparent", color:"#64748b", fontSize:"0.75rem", cursor:"pointer", fontFamily:"inherit" }}>
                Copy
              </button>
            </div>

            {/* Reset result */}
            {resetResult && (
              <div style={{ margin:"12px 0", background:"rgba(16,185,129,0.07)", border:"1px solid rgba(16,185,129,0.2)", borderRadius:12, padding:"14px 16px" }}>
                <div style={{ fontSize:"0.78rem", color:"#34d399", fontWeight:700, marginBottom:10, textTransform:"uppercase", letterSpacing:0.5 }}>
                  ✅ Password Reset — Send to client
                </div>
                {[{label:"Email", value:resetResult.email},{label:"New Password", value:resetResult.newPassword}].map(({label,value}) => (
                  <div key={label} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:"0.72rem", color:"#475569" }}>{label}</div>
                      <div style={{ fontFamily:"monospace", color:"#e2e8f0", fontWeight:600 }}>{value}</div>
                    </div>
                    <button onClick={() => navigator.clipboard.writeText(value)}
                      style={{ padding:"4px 10px", borderRadius:7, border:"1px solid rgba(255,255,255,0.1)", background:"transparent", color:"#64748b", fontSize:"0.75rem", cursor:"pointer", fontFamily:"inherit" }}>
                      Copy
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => navigator.clipboard.writeText(
                    `Your CCS HRMS login:\n\nURL: ${window.location.origin}/login\nEmail: ${resetResult.email}\nPassword: ${resetResult.newPassword}\n\nPlease change your password after login.`
                  )}
                  style={{ marginTop:8, width:"100%", padding:"10px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", fontWeight:700, fontSize:"0.85rem", cursor:"pointer", fontFamily:"inherit" }}
                >
                  📋 Copy Full Message
                </button>
              </div>
            )}

            <button onClick={resetAdminPassword} disabled={resetting}
              style={{ marginTop:8, padding:"10px 20px", borderRadius:10, border:"1px solid rgba(245,158,11,0.3)", background:"rgba(245,158,11,0.08)", color:"#fbbf24", fontWeight:700, fontSize:"0.85rem", cursor:"pointer", fontFamily:"inherit" }}>
              🔑 {resetting ? "Resetting…" : "Reset Admin Password"}
            </button>
          </div>
        </div>
      )}

      {/* ── TAB: Modules ──────────────────────────────────────────────────── */}
      {tab === "modules" && (
        <div className={s.panel}>
          <div className={s.moduleList}>
            {modules.map((mod) => {
              const meta = MODULE_META[mod.module_key] ?? { label: mod.module_key, desc: "", icon: Settings2 };
              const Icon = meta.icon;
              const isOpen = openProps === mod.id;
              return (
                <div key={mod.id}>
                  <div className={s.moduleRow}>
                    <div className={s.moduleIcon}><Icon size={18} color="#6366f1" /></div>
                    <div className={s.moduleInfo}>
                      <div className={s.moduleName}>{meta.label}</div>
                      <div className={s.moduleDesc}>{meta.desc}</div>
                      {/* Tier status badge — shown inline under the description */}
                      <div style={{ marginTop: 6 }}>
                        <TierStatusBadge
                          moduleKey={mod.module_key}
                          properties={mod.properties}
                        />
                      </div>
                    </div>
                    <div className={s.moduleToggle}>
                      <span className={s.toggleLabel}>{mod.is_enabled ? "On" : "Off"}</span>
                      <label className={s.switch}>
                        <input type="checkbox" checked={mod.is_enabled} onChange={() => toggleModule(mod)} />
                        <span className={s.switchSlider} />
                      </label>
                      <button className={s.configBtn} onClick={() => openPropsPanel(mod)}>
                        {isOpen ? "Close" : "Configure"}
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className={s.propsPanel}>
                      {/* ── Module-Aware Structured Config Panels ─────────────── */}
                      {mod.module_key === "payroll" ? (
                        <PayrollConfigPanel
                          props={propsEdit}
                          onChange={setPropsEdit}
                          onSave={() => saveProps(mod)}
                          saving={savingProps}
                        />
                      ) : mod.module_key === "leave_settings" ? (
                        <LeaveConfigPanel
                          props={propsEdit}
                          onChange={setPropsEdit}
                          onSave={() => saveProps(mod)}
                          saving={savingProps}
                        />
                      ) : mod.module_key === "reimbursements" ? (
                        <ReimbConfigPanel
                          props={propsEdit}
                          onChange={setPropsEdit}
                          onSave={() => saveProps(mod)}
                          saving={savingProps}
                        />
                      ) : mod.module_key === "profiles" ? (
                        <ProfilesConfigPanel
                          props={propsEdit}
                          onChange={setPropsEdit}
                          onSave={() => saveProps(mod)}
                          saving={savingProps}
                        />
                      ) : mod.module_key === "incentives" ? (
                        <IncentivesConfigPanel
                          props={propsEdit}
                          onChange={setPropsEdit}
                          onSave={() => saveProps(mod)}
                          saving={savingProps}
                        />
                      ) : (
                        /* ── Raw key-value editor (fallback for all other modules) */
                        <>
                          {Object.entries(propsEdit).map(([key, val]) => (
                            <div key={key} className={s.propField}>
                              <label className={s.propLabel}>{key.replace(/_/g, " ")}</label>
                              {typeof val === "boolean" ? (
                                <div className={s.propCheckRow}>
                                  <input type="checkbox" className={s.propCheck} checked={val}
                                    onChange={e => setPropsEdit(p => ({ ...p, [key]: e.target.checked }))} />
                                  <span style={{ fontSize: "0.82rem", color: "#94a3b8" }}>{val ? "Enabled" : "Disabled"}</span>
                                </div>
                              ) : Array.isArray(val) ? (
                                <input className={s.propInput} value={val.join(", ")}
                                  onChange={e => setPropsEdit(p => ({ ...p, [key]: e.target.value.split(",").map(v => v.trim()) }))} />
                              ) : (
                                <input className={s.propInput} value={String(val ?? "")}
                                  onChange={e => setPropsEdit(p => ({ ...p, [key]: e.target.value }))} />
                              )}
                            </div>
                          ))}
                          <button className={s.propSaveBtn} onClick={() => saveProps(mod)}>
                            Save Module Properties
                          </button>
                        </>
                      )}
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB: Snapshot ─────────────────────────────────────────────────── */}
      {tab === "snapshot" && company && (
        <div className={s.panel}>
          <CapabilitySnapshot modules={modules} companyName={company.name} />
        </div>
      )}

      {/* ── TAB: Users ────────────────────────────────────────────────────── */}
      {tab === "users" && (
        <div className={s.panel}>
          {users.length === 0 ? (
            <div className={s.emptyState}>No employees found in this company.</div>
          ) : (
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const initials = (u.full_name ?? "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
                  return (
                    <tr key={u.id}>
                      <td>
                        <span className={s.userAvatar}>{initials}</span>
                        <span className={s.cellPrimary}>{u.full_name ?? "—"}</span>
                      </td>
                      <td>
                        <span style={{ textTransform: "capitalize", color: "#94a3b8" }}>
                          {u.role ?? "—"}
                        </span>
                      </td>
                      <td>{new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── TAB: Mobile & Kiosk ───────────────────────────────────────────── */}
      {tab === "mobile" && <MobileTab companyId={id} />}

      {/* ── TAB: Domains ──────────────────────────────────────────────────── */}
      {tab === "domains" && (
        <div className={s.panel}>
          <div className={s.sectionLabel}>Routing Configuration</div>
          <div className={s.infoCard} style={{ margin: "0", border: "none", borderRadius: 0, borderBottom: "1px solid rgba(255,255,255,0.05)", background: "transparent" }}>
            <div className={s.infoRow}>
              <span className={s.infoKey}>Subdomain</span>
              <span className={s.infoVal}>{company.subdomain ? `${company.subdomain}.ccshrms.com` : <em style={{ color: "#334155" }}>None assigned</em>}</span>
            </div>
            <div className={s.infoRow}>
              <span className={s.infoKey}>Custom Domain</span>
              <span className={s.infoVal}>{company.domain ?? <em style={{ color: "#334155" }}>None — edit in Overview tab</em>}</span>
            </div>
          </div>
          <div className={s.emptyState} style={{ padding: "32px 20px" }}>
            Domain request management coming in Phase F.<br />
            Use the Overview tab to directly set a custom domain for this tenant.
          </div>
        </div>
      )}

      {/* ── TAB: Danger Zone ──────────────────────────────────────────────── */}
      {tab === "danger" && (
        <div className={s.panel}>
          <div className={s.dangerBox}>
            <div className={s.dangerRow}>
              <div className={s.dangerInfo}>
                <h4>{company.is_active ? "Suspend Tenant" : "Reactivate Tenant"}</h4>
                <p>
                  {company.is_active
                    ? "Immediately locks out all users in this company. Their data is preserved."
                    : "Restores access for all users. Data is fully intact."}
                </p>
              </div>
              <div className={s.dangerAction}>
                {company.is_active ? (
                  <button className={s.deleteBtn} onClick={toggleActive}>
                    <Ban size={14} style={{ display: "inline", marginRight: 6 }} /> Suspend Now
                  </button>
                ) : (
                  <button className={s.activateBtn} onClick={toggleActive}>
                    <CheckCircle2 size={14} style={{ display: "inline", marginRight: 6 }} /> Reactivate
                  </button>
                )}
              </div>
            </div>

            <div className={s.dangerRow}>
              <div className={s.dangerInfo}>
                <h4>Delete Tenant</h4>
                <p>
                  Permanently deletes this company and ALL associated data — employees, attendance, leaves, payroll.
                  This action is irreversible.
                </p>
              </div>
              <div className={s.dangerAction}>
                <button className={s.deleteBtn} onClick={deleteTenant}>
                  <Trash2 size={14} style={{ display: "inline", marginRight: 6 }} /> Delete Permanently
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
