"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  Building2, Users, CheckCircle2, AlertTriangle,
  Plus, ServerCrash, ArrowRight, Smartphone, Upload, Copy, Check,
} from "lucide-react";
import styles from "./overview.module.css";

// ── Types ─────────────────────────────────────────────────────────────────
interface Stats {
  totalTenants:     number;
  activeTenants:    number;
  suspendedTenants: number;
  totalUsers:       number;
}

interface Company {
  id: string;
  name: string;
  subdomain: string | null;
  domain: string | null;
  is_active: boolean;
  created_at: string;
}

// ── Stat card component ────────────────────────────────────────────────────
function StatCard({
  label, value, icon: Icon, iconColor, glowColor, trend,
}: {
  label: string; value: number | string;
  icon: React.ElementType; iconColor: string; glowColor: string;
  trend?: string;
}) {
  return (
    <div
      className={styles.statCard}
      style={{ "--glow-color": glowColor, "--icon-bg": `${iconColor}18` } as React.CSSProperties}
    >
      <div className={styles.statIcon}>
        <Icon size={20} color={iconColor} />
      </div>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
      {trend && <div className={styles.statTrend}>{trend}</div>}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function DeveloperOverview() {
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [tenants,   setTenants]   = useState<Company[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // APK distribution state
  const [apkConfig, setApkConfig] = useState<Record<string, string>>({});
  const [uploadingKiosk, setUploadingKiosk]     = useState(false);
  const [uploadingEmployee, setUploadingEmployee] = useState(false);
  const [apkMsg, setApkMsg]   = useState("");
  const [copied, setCopied]   = useState<string | null>(null);
  const [kioskVersion, setKioskVersion]       = useState("1.0.0");
  const [employeeVersion, setEmployeeVersion] = useState("1.0.0");
  const kioskRef    = useRef<HTMLInputElement>(null);
  const employeeRef = useRef<HTMLInputElement>(null);

  // Deploy modal state
  const [showDeploy, setShowDeploy] = useState(false);
  const [deploying,  setDeploying]  = useState(false);
  const [deployErr,  setDeployErr]  = useState("");
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string; subdomain: string; name: string } | null>(null);
  const [form, setForm] = useState({
    name: "", subdomain: "", email: "", password: "",
  });

  useEffect(() => {
    loadAll();
    fetch('/api/platform-config').then(r => r.json()).then(cfg => {
      setApkConfig(cfg);
      if (cfg.kiosk_apk_version)    setKioskVersion(cfg.kiosk_apk_version);
      if (cfg.employee_apk_version) setEmployeeVersion(cfg.employee_apk_version);
    });
  }, []);

  async function loadAll() {
    setLoadingData(true);
    const [{ data: companies }, { count: userCount }] = await Promise.all([
      supabase.from("companies").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*", { count: "exact", head: true }).not("system_role", "is", null).not("system_role", "eq", "platform_owner"),
    ]);

    const list = companies ?? [];
    setTenants(list);
    setStats({
      totalTenants:     list.length,
      activeTenants:    list.filter((c) => c.is_active).length,
      suspendedTenants: list.filter((c) => !c.is_active).length,
      totalUsers:       userCount ?? 0,
    });
    setLoadingData(false);
  }

  async function handleDeploy(e: React.FormEvent) {
    e.preventDefault();
    setDeploying(true);
    setDeployErr("");
    try {
      const res = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:          form.name,
          subdomain:     form.subdomain,
          adminEmail:    form.email,
          adminPassword: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Deployment failed");
      // Show credentials card instead of closing
      setCreatedCreds({ email: form.email, password: form.password, subdomain: form.subdomain, name: form.name });
      setForm({ name: "", subdomain: "", email: "", password: "" });
      loadAll();
    } catch (err: any) {
      setDeployErr(err.message);
    } finally {
      setDeploying(false);
    }
  }

  function closeDeploy() {
    setShowDeploy(false);
    setCreatedCreds(null);
    setDeployErr("");
  }

  async function uploadApk(type: 'kiosk' | 'employee', file: File) {
    const setter = type === 'kiosk' ? setUploadingKiosk : setUploadingEmployee;
    const version = type === 'kiosk' ? kioskVersion : employeeVersion;
    setter(true);
    setApkMsg("");
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', type);
    fd.append('version', version);
    const res  = await fetch('/api/upload-apk', { method: 'POST', body: fd });
    const json = await res.json();
    if (json.ok) {
      setApkConfig(prev => ({
        ...prev,
        [`${type}_apk_url`]:     json.url,
        [`${type}_apk_version`]: json.version,
      }));
      setApkMsg(`✅ ${type === 'kiosk' ? 'Kiosk' : 'Employee'} APK uploaded — v${json.version}`);
    } else {
      setApkMsg(`❌ Upload failed: ${json.error}`);
    }
    setter(false);
    setTimeout(() => setApkMsg(""), 5000);
  }

  function copyLink(url: string, key: string) {
    navigator.clipboard.writeText(url);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.heading}>Mission Control</h1>
          <p className={styles.subheading}>{today}</p>
        </div>
        <button className={styles.deployBtn} onClick={() => setShowDeploy(true)}>
          <Plus size={18} /> Deploy Tenant
        </button>
      </div>

      {/* Stat Cards */}
      <div className={styles.statsRow}>
        <StatCard
          label="Total Tenants" value={loadingData ? "—" : stats?.totalTenants ?? 0}
          icon={Building2} iconColor="#6366f1" glowColor="rgba(99,102,241,0.08)"
        />
        <StatCard
          label="Active Tenants" value={loadingData ? "—" : stats?.activeTenants ?? 0}
          icon={CheckCircle2} iconColor="#10b981" glowColor="rgba(16,185,129,0.08)"
        />
        <StatCard
          label="Suspended" value={loadingData ? "—" : stats?.suspendedTenants ?? 0}
          icon={AlertTriangle} iconColor="#f59e0b" glowColor="rgba(245,158,11,0.08)"
        />
        <StatCard
          label="Platform Users" value={loadingData ? "—" : stats?.totalUsers ?? 0}
          icon={Users} iconColor="#22d3ee" glowColor="rgba(34,211,238,0.08)"
        />
      </div>

      {/* Content Grid */}
      <div className={styles.contentGrid}>

        {/* Tenant Registry Table */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Tenant Registry</h2>
            <Link href="/developer/tenants" className={styles.panelLink}>
              View all <ArrowRight size={12} style={{ display: "inline" }} />
            </Link>
          </div>
          {loadingData ? (
            <div className={styles.emptyState}>Loading tenants...</div>
          ) : tenants.length === 0 ? (
            <div className={styles.emptyState}>
              No tenants deployed yet. Click "Deploy Tenant" to get started.
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tenants.slice(0, 8).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className={styles.tenantName}>{c.name}</div>
                      <div className={styles.subdomain}>
                        {c.domain ?? (c.subdomain ? `${c.subdomain}.ccshrms.com` : "—")}
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${c.is_active ? styles.badgeActive : styles.badgeSuspended}`}>
                        {c.is_active ? "Active" : "Suspended"}
                      </span>
                    </td>
                    <td>
                      {new Date(c.created_at).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </td>
                    <td>
                      <Link href={`/developer/tenants/${c.id}`} className={styles.manageLink}>
                        Manage →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Activity Feed */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Recent Activity</h2>
            <Link href="/developer/audit" className={styles.panelLink}>View log</Link>
          </div>
          <div className={styles.feed}>
            <div className={styles.feedEmpty}>
              <ServerCrash size={28} color="#1e293b" style={{ marginBottom: 8 }} />
              <div>Audit log is empty.</div>
              <div>Events will appear here as you manage tenants.</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── App Distribution ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Smartphone size={22} color="#6366f1" />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary, #f1f5f9)', margin: 0 }}>
            App Distribution
          </h2>
          <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
            DEV ONLY
          </span>
        </div>
        {apkMsg && (
          <div style={{ padding: '12px 18px', borderRadius: 10, background: apkMsg.startsWith('✅') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${apkMsg.startsWith('✅') ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, color: apkMsg.startsWith('✅') ? '#34d399' : '#f87171', marginBottom: 16, fontSize: '0.85rem', fontWeight: 600 }}>
            {apkMsg}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: 20 }}>
          {([
            { type: 'kiosk',    label: 'Kiosk Attendance App',  emoji: '🖥️', desc: 'Installed on shared entrance device for clock-in/out', urlKey: 'kiosk_apk_url',    verKey: 'kiosk_apk_version',    version: kioskVersion,    setVersion: setKioskVersion,    uploading: uploadingKiosk,    ref: kioskRef },
            { type: 'employee', label: 'Employee Mobile App',   emoji: '📱', desc: 'Share with team for attendance and HR on the go',      urlKey: 'employee_apk_url', verKey: 'employee_apk_version', version: employeeVersion, setVersion: setEmployeeVersion, uploading: uploadingEmployee, ref: employeeRef },
          ] as const).map(app => (
            <div key={app.type} className={styles.panel} style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
                <div style={{ fontSize: '2rem', lineHeight: 1 }}>{app.emoji}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary, #f1f5f9)', marginBottom: 3 }}>{app.label}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #94a3b8)' }}>{app.desc}</div>
                </div>
              </div>

              {/* Live APK card — full download experience */}
              {apkConfig[app.urlKey] ? (() => {
                const url    = apkConfig[app.urlKey];
                const ver    = apkConfig[app.verKey] || '?';
                const qrSrc  = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&color=6366f1&bgcolor=0d0d1a&data=${encodeURIComponent(url)}`;
                const waLink = `https://wa.me/?text=${encodeURIComponent(`${app.label} APK v${ver}:\n${url}`)}`;
                return (
                  <div style={{ border: '1px solid rgba(16,185,129,0.25)', borderRadius: 14, padding: 16, marginBottom: 14, background: 'rgba(16,185,129,0.05)' }}>
                    {/* Status badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: '0.7rem', padding: '2px 10px', borderRadius: 20, background: 'rgba(16,185,129,0.2)', color: '#34d399', fontWeight: 700, letterSpacing: 0.5 }}>✅ LIVE — v{ver}</span>
                    </div>

                    {/* QR + actions row */}
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      {/* QR code */}
                      <div>
                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>Scan to Download</div>
                        <div style={{ width: 112, height: 112, borderRadius: 12, overflow: 'hidden', border: '2px solid rgba(99,102,241,0.4)', background: '#0d0d1a' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={qrSrc} alt="QR" width={110} height={110} style={{ display: 'block' }} />
                        </div>
                      </div>

                      {/* URL + buttons */}
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>Public URL</div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', wordBreak: 'break-all', padding: '6px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', marginBottom: 10, lineHeight: 1.5 }}>
                          {url}
                        </div>
                        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                          <button onClick={() => copyLink(url, app.urlKey)}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600 }}>
                            {copied === app.urlKey ? <Check size={11} /> : <Copy size={11} />}
                            {copied === app.urlKey ? 'Copied!' : 'Copy Link'}
                          </button>
                          <a href={url} download
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.1)', color: '#34d399', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600 }}>
                            ⬇️ Download APK
                          </a>
                          <a href={waLink} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(37,211,102,0.35)', background: 'rgba(37,211,102,0.08)', color: '#25d366', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600 }}>
                            💬 WhatsApp
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '0.8rem', color: '#fbbf24' }}>
                  ⚠️ No APK uploaded yet
                </div>
              )}

              {/* Upload form */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '0 0 100px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: 4 }}>Version</div>
                  <input value={app.version} onChange={e => app.setVersion(e.target.value)}
                    placeholder="1.0.0"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#f1f5f9', fontFamily: 'inherit', fontSize: '0.82rem', outline: 'none' }} />
                </div>
                <input ref={app.ref} type="file" accept=".apk" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadApk(app.type as any, f); e.target.value = ''; }} />
                <button onClick={() => app.ref.current?.click()} disabled={app.uploading}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none', background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', color: '#fff', cursor: app.uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.85rem', opacity: app.uploading ? 0.7 : 1, whiteSpace: 'nowrap' }}>
                  <Upload size={14} />
                  {app.uploading ? 'Uploading…' : apkConfig[app.urlKey] ? 'Replace APK' : 'Upload APK'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Deploy Modal */}
      {showDeploy && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            {!createdCreds ? (
              /* ── FORM ─────────────────────────────────────────────── */
              <>
                <div className={styles.modalHead}>
                  <h2>Deploy New Tenant</h2>
                  <button className={styles.closeBtn} onClick={closeDeploy}>✕</button>
                </div>
                <form onSubmit={handleDeploy} className={styles.modalBody}>
                  {deployErr && <div className={styles.errorBox}>{deployErr}</div>}

                  <div className={styles.formRow}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>Company Name</label>
                      <input className={styles.input} type="text" required placeholder="Acme Corp"
                        value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                      />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>Subdomain</label>
                      <input className={styles.input} type="text" required placeholder="acme"
                        value={form.subdomain} onChange={e => setForm({...form, subdomain: e.target.value.toLowerCase()})}
                      />
                    </div>
                  </div>

                  <hr className={styles.divider} />
                  <p className={styles.sectionLabel}>Initial Superadmin Account</p>

                  <div className={styles.formRow}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>Admin Email</label>
                      <input className={styles.input} type="email" required placeholder="hr@acme.com"
                        value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                      />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>Admin Password</label>
                      <input className={styles.input} type="text" required placeholder="Min 8 chars" minLength={8}
                        value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className={styles.modalFoot}>
                    <button type="button" className={styles.cancelBtn} onClick={closeDeploy}>
                      Cancel
                    </button>
                    <button type="submit" className={styles.submitBtn} disabled={deploying}>
                      {deploying ? "Provisioning..." : <><Plus size={16} /> Deploy Tenant</>}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              /* ── CREDENTIALS CARD (shown after success) ────────────── */
              <>
                <div className={styles.modalHead}>
                  <h2>✅ Tenant Deployed!</h2>
                  <button className={styles.closeBtn} onClick={closeDeploy}>✕</button>
                </div>
                <div className={styles.modalBody}>
                  <div style={{
                    background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)",
                    borderRadius: 14, padding: "16px 20px", marginBottom: 20,
                    fontSize: "0.85rem", color: "#34d399", lineHeight: 1.6,
                  }}>
                    <strong>{createdCreds.name}</strong> has been provisioned. Copy and send these credentials to the client — the password is only shown once.
                  </div>

                  {/* Credential rows */}
                  {[
                    { label: "🌐 Login URL", value: `${typeof window !== "undefined" ? window.location.origin : ""}/login` },
                    { label: "📧 Email",     value: createdCreds.email },
                    { label: "🔑 Password",  value: createdCreds.password },
                    { label: "🏷️ Subdomain", value: createdCreds.subdomain },
                  ].map(({ label, value }) => (
                    <div key={label} style={{
                      background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: 12, padding: "12px 16px", marginBottom: 10,
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                    }}>
                      <div>
                        <div style={{ fontSize: "0.74rem", color: "#475569", marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: "0.95rem", color: "#e2e8f0", fontWeight: 600, fontFamily: "monospace", wordBreak: "break-all" }}>{value}</div>
                      </div>
                      <button
                        onClick={() => navigator.clipboard.writeText(value)}
                        style={{
                          flexShrink: 0, padding: "6px 12px", borderRadius: 8,
                          border: "1px solid rgba(255,255,255,0.1)", background: "transparent",
                          color: "#64748b", fontSize: "0.75rem", cursor: "pointer",
                          fontFamily: "inherit", transition: "all 0.2s",
                        }}
                        onMouseOver={e => (e.currentTarget.style.color = "#e2e8f0")}
                        onMouseOut={e  => (e.currentTarget.style.color = "#64748b")}
                      >
                        Copy
                      </button>
                    </div>
                  ))}

                  {/* WhatsApp-style message generator */}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: "0.74rem", color: "#475569", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      📋 Ready-to-send message
                    </div>
                    <div style={{
                      background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 12, padding: "14px 16px", fontSize: "0.82rem",
                      color: "#94a3b8", lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: "monospace",
                    }}>
{`Your CCS HRMS workspace is ready! 🎉

Login URL: ${typeof window !== "undefined" ? window.location.origin : ""}/login
Email: ${createdCreds.email}
Password: ${createdCreds.password}

Please change your password after first login.`}
                    </div>
                    <button
                      style={{
                        marginTop: 10, width: "100%", padding: "11px",
                        borderRadius: 10, border: "none",
                        background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                        color: "#fff", fontWeight: 700, fontSize: "0.9rem",
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                      onClick={() => navigator.clipboard.writeText(
                        `Your CCS HRMS workspace is ready! 🎉\n\nLogin URL: ${window.location.origin}/login\nEmail: ${createdCreds.email}\nPassword: ${createdCreds.password}\n\nPlease change your password after first login.`
                      )}
                    >
                      Copy Full Message
                    </button>
                  </div>

                  <div className={styles.modalFoot} style={{ marginTop: 20 }}>
                    <button className={styles.cancelBtn} onClick={closeDeploy}>Close</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
