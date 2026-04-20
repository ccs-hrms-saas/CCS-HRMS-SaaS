"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Globe, CheckCircle2, XCircle, Clock, ArrowRight, RefreshCw } from "lucide-react";
import dp from "../dev-page.module.css";

interface DomainRequest {
  id:               string;
  company_id:       string;
  requested_domain: string;
  status:           string;
  created_at:       string;
  notes:            string | null;
  companies:        { name: string; subdomain: string | null } | null;
}

// ── Status config ──────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending:       { label: "Pending Review", color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)" },
  awaiting_dns:  { label: "Awaiting DNS",   color: "#22d3ee", bg: "rgba(34,211,238,0.1)",  border: "rgba(34,211,238,0.25)" },
  dns_verified:  { label: "DNS Verified",   color: "#a5b4fc", bg: "rgba(99,102,241,0.1)",  border: "rgba(99,102,241,0.25)" },
  active:        { label: "Active",         color: "#34d399", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.25)" },
  failed:        { label: "Failed/Rejected",color: "#f87171", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)"  },
};

// ── Status workflow: what action comes next ────────────────────────────────
const NEXT_ACTION: Record<string, { label: string; next: string; icon: React.ElementType }> = {
  pending:      { label: "Approve",            next: "awaiting_dns",  icon: CheckCircle2 },
  awaiting_dns: { label: "Mark DNS Verified",  next: "dns_verified",  icon: RefreshCw    },
  dns_verified: { label: "Activate Domain",    next: "active",        icon: ArrowRight   },
};

export default function DomainsPage() {
  const [requests, setRequests] = useState<DomainRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [acting,   setActing]   = useState<string | null>(null);
  const [filter,   setFilter]   = useState("all");

  useEffect(() => { loadRequests(); }, []);

  async function loadRequests() {
    setLoading(true);
    const { data } = await supabase
      .from("domain_requests")
      .select("*, companies(name, subdomain)")
      .order("created_at", { ascending: false });
    setRequests((data as DomainRequest[]) ?? []);
    setLoading(false);
  }

  async function advance(req: DomainRequest) {
    const action = NEXT_ACTION[req.status];
    if (!action) return;
    setActing(req.id);
    await supabase.from("domain_requests")
      .update({
        status: action.next,
        ...(action.next === "active"       ? { activated_at:   new Date().toISOString() } : {}),
        ...(action.next === "dns_verified" ? { dns_verified_at:new Date().toISOString() } : {}),
        reviewed_by: (await supabase.auth.getUser()).data.user?.id,
      })
      .eq("id", req.id);
    setActing(null);
    loadRequests();
  }

  async function reject(req: DomainRequest) {
    if (!confirm(`Reject the domain request for "${req.requested_domain}"?`)) return;
    setActing(req.id);
    await supabase.from("domain_requests").update({ status: "failed" }).eq("id", req.id);
    setActing(null);
    loadRequests();
  }

  const filtered = filter === "all"
    ? requests
    : requests.filter(r => r.status === filter);

  return (
    <div className={dp.page}>
      <div className={dp.pageHeader}>
        <div>
          <h1 className={dp.heading}>Domain Requests</h1>
          <p className={dp.subheading}>
            Manage custom domain requests from tenant superadmins.
          </p>
        </div>
      </div>

      {/* Status workflow card */}
      <div style={{
        background: "#0c0e17",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 14,
        padding: "16px 20px",
        marginBottom: 24,
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}>
        <span style={{ fontSize: "0.78rem", color: "#475569", fontWeight: 600 }}>Workflow:</span>
        {["pending", "awaiting_dns", "dns_verified", "active"].map((st, i) => {
          const cfg = STATUS_CONFIG[st];
          return (
            <div key={st} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                padding: "3px 10px", borderRadius: 20,
                background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
                fontSize: "0.75rem", fontWeight: 700,
              }}>{cfg.label}</span>
              {i < 3 && <ArrowRight size={12} color="#334155" />}
            </div>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className={dp.filterBar}>
        <select
          className={dp.filterSelect}
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ width: "auto" }}
        >
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className={dp.panel}>
        <div className={dp.countLabel}>
          {loading ? "Loading…" : `${filtered.length} request${filtered.length !== 1 ? "s" : ""}`}
        </div>

        {loading ? (
          <div className={dp.loading}>Loading domain requests…</div>
        ) : filtered.length === 0 ? (
          <div className={dp.emptyState}>
            <Globe size={34} />
            <div>No domain requests yet.</div>
            <div style={{ fontSize: "0.8rem", color: "#334155", marginTop: 4 }}>
              Tenant superadmins can request custom domains from their Settings page.
            </div>
          </div>
        ) : (
          <table className={dp.table}>
            <thead>
              <tr>
                <th>Company</th>
                <th>Requested Domain</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(req => {
                const cfg    = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.pending;
                const action = NEXT_ACTION[req.status];
                const ActionIcon = action?.icon;
                const isActing   = acting === req.id;
                return (
                  <tr key={req.id}>
                    <td>
                      <div className={dp.cellPrimary}>{req.companies?.name ?? "Unknown"}</div>
                      <div className={dp.cellSub}>
                        {req.companies?.subdomain ? `${req.companies.subdomain}.ccshrms.com` : "—"}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <Globe size={13} color="#6366f1" />
                        <span style={{ color: "#e2e8f0", fontWeight: 500, fontSize: "0.9rem" }}>
                          {req.requested_domain}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={dp.badge} style={{
                        background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
                      }}>
                        {cfg.label}
                      </span>
                    </td>
                    <td>
                      {new Date(req.created_at).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 8 }}>
                        {action && (
                          <button
                            className={dp.actionLink}
                            onClick={() => advance(req)}
                            disabled={isActing}
                            style={{ opacity: isActing ? 0.5 : 1 }}
                          >
                            {ActionIcon && <ActionIcon size={12} />}
                            {isActing ? "Working…" : action.label}
                          </button>
                        )}
                        {["pending", "awaiting_dns"].includes(req.status) && (
                          <button
                            className={dp.iconBtn}
                            onClick={() => reject(req)}
                            disabled={isActing}
                            title="Reject"
                            style={{ color: "#f87171", borderColor: "rgba(239,68,68,0.2)" }}
                          >
                            <XCircle size={14} />
                          </button>
                        )}
                        {req.status === "active" && (
                          <span style={{ color: "#34d399", fontSize: "0.82rem", fontWeight: 600 }}>
                            ✅ Live
                          </span>
                        )}
                        {req.status === "failed" && (
                          <span style={{ color: "#f87171", fontSize: "0.82rem" }}>—</span>
                        )}
                      </div>
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
