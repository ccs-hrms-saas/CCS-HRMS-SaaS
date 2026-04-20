"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Activity, ChevronDown, RefreshCw, Filter } from "lucide-react";
import dp from "../dev-page.module.css";

interface AuditEntry {
  id:          string;
  actor_id:    string | null;
  actor_role:  string | null;
  action:      string;
  target_type: string | null;
  target_id:   string | null;
  old_value:   Record<string, any> | null;
  new_value:   Record<string, any> | null;
  created_at:  string;
  // joined
  profiles:    { full_name: string | null } | null;
}

// ── Action config (color + label + icon emoji) ─────────────────────────────
const ACTION_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; emoji: string }> = {
  TENANT_CREATED:              { label: "Tenant Created",           color: "#34d399", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.25)",  emoji: "🏢" },
  TENANT_UPDATED:              { label: "Tenant Updated",           color: "#94a3b8", bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.25)", emoji: "✏️" },
  TENANT_SUSPENDED:            { label: "Tenant Suspended",         color: "#f87171", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)",   emoji: "⛔" },
  TENANT_ACTIVATED:            { label: "Tenant Activated",         color: "#34d399", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.25)",  emoji: "✅" },
  TENANT_DELETED:              { label: "Tenant Deleted",           color: "#f87171", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)",   emoji: "🗑️" },
  MODULE_ENABLED:              { label: "Module Enabled",           color: "#a5b4fc", bg: "rgba(99,102,241,0.1)",  border: "rgba(99,102,241,0.25)",  emoji: "🟢" },
  MODULE_DISABLED:             { label: "Module Disabled",          color: "#fb923c", bg: "rgba(249,115,22,0.1)",  border: "rgba(249,115,22,0.25)",  emoji: "🔴" },
  MODULE_PROPERTIES_UPDATED:   { label: "Module Config Changed",    color: "#c4b5fd", bg: "rgba(139,92,246,0.1)",  border: "rgba(139,92,246,0.25)",  emoji: "⚙️" },
  DOMAIN_REQUEST_APPROVED:     { label: "Domain Approved",          color: "#22d3ee", bg: "rgba(34,211,238,0.1)",  border: "rgba(34,211,238,0.25)",  emoji: "🌐" },
  DOMAIN_DNS_VERIFIED:         { label: "DNS Verified",             color: "#22d3ee", bg: "rgba(34,211,238,0.1)",  border: "rgba(34,211,238,0.25)",  emoji: "🔍" },
  DOMAIN_ACTIVATED:            { label: "Domain Activated",         color: "#34d399", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.25)",  emoji: "🚀" },
  DOMAIN_REJECTED:             { label: "Domain Rejected",          color: "#f87171", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)",   emoji: "❌" },
  KIOSK_PIN_GENERATED:         { label: "Kiosk PIN Generated",      color: "#fbbf24", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)",  emoji: "🔑" },
  KIOSK_DEVICE_REVOKED:        { label: "Kiosk Device Revoked",     color: "#f87171", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)",   emoji: "📵" },
  EMPLOYEE_APP_CONFIGURED:     { label: "Employee App Configured",  color: "#a5b4fc", bg: "rgba(99,102,241,0.1)",  border: "rgba(99,102,241,0.25)",  emoji: "📱" },
  ADMIN_INVITED:               { label: "Admin Invited",            color: "#fbbf24", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)",  emoji: "👤" },
  ADMIN_REVOKED:               { label: "Admin Revoked",            color: "#f87171", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)",   emoji: "🚫" },
};

// Categories for filter
const ACTION_CATEGORIES = [
  { label: "All Actions",    value: "all" },
  { label: "Tenant Events",  value: "TENANT" },
  { label: "Module Events",  value: "MODULE" },
  { label: "Domain Events",  value: "DOMAIN" },
  { label: "Kiosk Events",   value: "KIOSK" },
  { label: "Admin Events",   value: "ADMIN" },
];

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fullDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

const PAGE_SIZE = 30;

export default function AuditLogPage() {
  const [entries,      setEntries]      = useState<AuditEntry[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [hasMore,      setHasMore]      = useState(false);
  const [category,     setCategory]     = useState("all");
  const [dateFilter,   setDateFilter]   = useState("all");
  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [offset,       setOffset]       = useState(0);

  const load = useCallback(async (reset = true) => {
    if (reset) setLoading(true); else setLoadingMore(true);
    const currentOffset = reset ? 0 : offset;

    let q = supabase
      .from("platform_audit_log")
      .select("*, profiles(full_name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(currentOffset, currentOffset + PAGE_SIZE - 1);

    // Category filter
    if (category !== "all") {
      q = q.like("action", `${category}%`);
    }

    // Date filter
    if (dateFilter === "today") {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      q = q.gte("created_at", start.toISOString());
    } else if (dateFilter === "week") {
      const start = new Date(); start.setDate(start.getDate() - 7);
      q = q.gte("created_at", start.toISOString());
    } else if (dateFilter === "month") {
      const start = new Date(); start.setDate(start.getDate() - 30);
      q = q.gte("created_at", start.toISOString());
    }

    const { data, count } = await q;
    const rows = (data ?? []) as AuditEntry[];

    if (reset) {
      setEntries(rows);
      setOffset(PAGE_SIZE);
    } else {
      setEntries(prev => [...prev, ...rows]);
      setOffset(currentOffset + PAGE_SIZE);
    }
    setHasMore((count ?? 0) > (reset ? PAGE_SIZE : currentOffset + PAGE_SIZE));
    setLoading(false);
    setLoadingMore(false);
  }, [category, dateFilter, offset]);

  useEffect(() => { load(true); }, [category, dateFilter]);

  function actorInitials(entry: AuditEntry) {
    const name = entry.profiles?.full_name ?? entry.actor_role ?? "System";
    return name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
  }

  function describeAction(entry: AuditEntry) {
    const nv = entry.new_value ?? {};
    const ov = entry.old_value ?? {};
    switch (entry.action) {
      case "TENANT_CREATED":    return `Provisioned workspace "${nv.name ?? "?"}" (${nv.subdomain ?? "?"})`;
      case "TENANT_SUSPENDED":  return `Suspended workspace "${nv.name ?? ov.name ?? entry.target_id?.slice(0, 8) ?? "?"}"`;
      case "TENANT_ACTIVATED":  return `Reactivated workspace "${nv.name ?? entry.target_id?.slice(0, 8) ?? "?"}"`;
      case "TENANT_DELETED":    return `Permanently deleted "${ov.name ?? "?"}" (${ov.subdomain ?? "—"})`;
      case "TENANT_UPDATED":    return `Updated workspace profile for "${nv.name ?? "?"}"`;
      case "MODULE_ENABLED":    return `Enabled module "${nv.module_key ?? "?"}" for ${nv.company_name ?? "a tenant"}`;
      case "MODULE_DISABLED":   return `Disabled module "${nv.module_key ?? "?"}" for ${nv.company_name ?? "a tenant"}`;
      case "MODULE_PROPERTIES_UPDATED": return `Updated config for module "${nv.module_key ?? "?"}"`;
      case "DOMAIN_REQUEST_APPROVED": return `Approved domain "${nv.domain ?? "?"}" — awaiting DNS`;
      case "DOMAIN_DNS_VERIFIED":    return `DNS verified for domain "${nv.domain ?? "?"}"`;
      case "DOMAIN_ACTIVATED":       return `Domain "${nv.domain ?? "?"}" is now live`;
      case "DOMAIN_REJECTED":        return `Rejected domain request "${ov.domain ?? "?"}"`;
      case "KIOSK_PIN_GENERATED":    return `Generated new kiosk pairing PIN for "${nv.company_name ?? "?"}"`;
      case "KIOSK_DEVICE_REVOKED":   return `Revoked kiosk device "${ov.device_name ?? "?"}"`;
      case "EMPLOYEE_APP_CONFIGURED": return `Updated employee app settings for "${nv.company_name ?? "?"}"`;
      case "ADMIN_INVITED":   return `Added platform admin "${nv.fullName ?? nv.email ?? "?"}"`;
      case "ADMIN_REVOKED":   return `Revoked platform admin access for "${ov.fullName ?? "?"}"`;
      default: return entry.action.replace(/_/g, " ").toLowerCase();
    }
  }

  const cfg = (action: string) => ACTION_CONFIG[action] ?? {
    label: action, color: "#94a3b8", bg: "rgba(148,163,184,0.08)",
    border: "rgba(148,163,184,0.2)", emoji: "•",
  };

  return (
    <div className={dp.page}>
      <div className={dp.pageHeader}>
        <div>
          <h1 className={dp.heading}>Audit Log</h1>
          <p className={dp.subheading}>Complete record of every platform-level action.</p>
        </div>
        <button className={dp.secondaryBtn} onClick={() => load(true)}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className={dp.filterBar}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#475569", fontSize: "0.82rem" }}>
          <Filter size={14} /> Filter:
        </div>
        <select className={dp.filterSelect} value={category} onChange={e => setCategory(e.target.value)}>
          {ACTION_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select className={dp.filterSelect} value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week">Last 7 Days</option>
          <option value="month">Last 30 Days</option>
        </select>
      </div>

      {/* Timeline */}
      <div className={dp.panel} style={{ padding: 0 }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <span className={dp.countLabel}>{loading ? "Loading…" : `${entries.length} events${hasMore ? "+" : ""}`}</span>
        </div>

        {loading ? (
          <div className={dp.loading}>Loading audit events...</div>
        ) : entries.length === 0 ? (
          <div className={dp.emptyState}>
            <Activity size={36} />
            <div>No audit events yet.</div>
            <div style={{ fontSize: "0.82rem", marginTop: 4, color: "#334155" }}>
              Actions like creating tenants, toggling modules, and domain approvals will appear here.
            </div>
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            {/* Vertical timeline line */}
            <div style={{
              position: "absolute", left: 55, top: 0, bottom: 0,
              width: 1, background: "rgba(255,255,255,0.04)", pointerEvents: "none",
            }} />

            {entries.map(entry => {
              const c       = cfg(entry.action);
              const isOpen  = expanded === entry.id;
              const hasData = entry.old_value || entry.new_value;
              return (
                <div key={entry.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 0,
                      padding: "16px 20px",
                      cursor: hasData ? "pointer" : "default",
                      transition: "background 0.2s",
                    }}
                    onClick={() => hasData && setExpanded(isOpen ? null : entry.id)}
                  >
                    {/* Actor avatar */}
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.72rem", fontWeight: 700, color: "#a5b4fc",
                      marginRight: 12,
                    }}>
                      {actorInitials(entry)}
                    </div>

                    {/* Timeline dot */}
                    <div style={{
                      width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                      background: c.color, marginTop: 11, marginRight: 16, marginLeft: 2,
                      boxShadow: `0 0 6px ${c.color}60`,
                    }} />

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                        <span style={{
                          padding: "2px 9px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700,
                          background: c.bg, color: c.color, border: `1px solid ${c.border}`,
                          display: "inline-flex", alignItems: "center", gap: 4, letterSpacing: 0.3,
                        }}>
                          {c.emoji} {c.label}
                        </span>
                        <span style={{ fontSize: "0.82rem", color: "#94a3b8" }}>
                          {describeAction(entry)}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.76rem", color: "#334155", display: "flex", gap: 12 }}>
                        <span title={fullDate(entry.created_at)}>{timeAgo(entry.created_at)}</span>
                        <span>·</span>
                        <span>{entry.profiles?.full_name ?? entry.actor_role ?? "System"}</span>
                        {entry.target_id && (
                          <>
                            <span>·</span>
                            <span style={{ fontFamily: "monospace", fontSize: "0.7rem" }}>
                              {entry.target_id.slice(0, 8)}…
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Expand chevron */}
                    {hasData && (
                      <ChevronDown size={14} color="#334155" style={{
                        flexShrink: 0, marginTop: 10, marginLeft: 12,
                        transition: "transform 0.25s",
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                      }} />
                    )}
                  </div>

                  {/* Expanded payload */}
                  {isOpen && hasData && (
                    <div style={{
                      marginLeft: 72, marginRight: 20, marginBottom: 16,
                      background: "rgba(0,0,0,0.25)", borderRadius: 10,
                      padding: "14px 16px",
                      border: "1px solid rgba(255,255,255,0.06)",
                      display: "grid", gridTemplateColumns: entry.old_value && entry.new_value ? "1fr 1fr" : "1fr",
                      gap: 16,
                    }}>
                      {entry.old_value && (
                        <div>
                          <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#f87171", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                            Before
                          </div>
                          <pre style={{ margin: 0, fontSize: "0.76rem", color: "#94a3b8", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                            {JSON.stringify(entry.old_value, null, 2)}
                          </pre>
                        </div>
                      )}
                      {entry.new_value && (
                        <div>
                          <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#34d399", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                            After
                          </div>
                          <pre style={{ margin: 0, fontSize: "0.76rem", color: "#a5b4fc", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                            {JSON.stringify(entry.new_value, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Load More */}
            {hasMore && (
              <div style={{ padding: "20px", textAlign: "center" }}>
                <button
                  onClick={() => load(false)}
                  disabled={loadingMore}
                  style={{
                    padding: "10px 24px", borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "transparent", color: "#64748b",
                    fontWeight: 600, fontSize: "0.85rem", cursor: "pointer",
                    fontFamily: "inherit", transition: "all 0.2s",
                  }}
                >
                  {loadingMore ? "Loading…" : "Load More"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
