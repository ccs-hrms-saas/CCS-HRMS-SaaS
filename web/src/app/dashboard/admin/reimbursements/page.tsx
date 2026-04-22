"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useModules } from "@/context/ModulesContext";
import styles from "../../dashboard.module.css";

// ── Types ─────────────────────────────────────────────────────────────────
interface ReimbType {
  id: string; name: string; description: string | null;
  max_amount: number | null; requires_receipt: boolean;
  approval_chain: any[]; is_active: boolean;
}
interface Request {
  id: string; user_id: string; type_id: string; amount: number;
  approved_amount: number | null; description: string | null;
  receipt_url: string | null; status: string; current_stage: number;
  approvals: any[]; rejection_reason: string | null; created_at: string;
  profiles: { full_name: string } | null;
  reimbursement_types: { name: string } | null;
}

const emptyType = { name: "", description: "", max_amount: "", requires_receipt: true };

export default function AdminReimbursements() {
  const { profile }      = useAuth();
  const { getProps, isEnabled } = useModules();
  const modProps         = getProps("reimbursements");
  const tier             = modProps.tier ?? "basic";
  const isStd            = tier !== "basic";
  const isAdv            = tier === "advanced";

  // ── State ────────────────────────────────────────────────────────────────
  const [tab, setTab]           = useState<"requests" | "categories">("requests");
  const [types, setTypes]       = useState<ReimbType[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingType, setEditingType] = useState<ReimbType | null>(null);
  const [form, setForm]         = useState<any>(emptyType);
  const [saving, setSaving]     = useState(false);

  // request detail drawer
  const [selectedReq, setSelectedReq]   = useState<Request | null>(null);
  const [approveNote, setApproveNote]   = useState("");
  const [partialAmt, setPartialAmt]     = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [actioning, setActioning]       = useState(false);

  // search/filter
  const [filterStatus, setFilterStatus] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: t }, { data: r }] = await Promise.all([
      supabase.from("reimbursement_types").select("*").eq("is_active", true).order("name"),
      supabase.from("reimbursement_requests")
        .select("*, profiles(full_name), reimbursement_types(name)")
        .order("created_at", { ascending: false }),
    ]);
    setTypes(t ?? []);
    setRequests(r ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Category CRUD ────────────────────────────────────────────────────────
  const openNew  = () => { setEditingType(null); setForm(emptyType); setShowForm(true); };
  const openEdit = (t: ReimbType) => {
    setEditingType(t);
    setForm({ name: t.name, description: t.description ?? "", max_amount: t.max_amount ?? "", requires_receipt: t.requires_receipt });
    setShowForm(true);
  };

  const saveType = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const payload = {
      name: form.name, description: form.description || null,
      max_amount: form.max_amount === "" ? null : Number(form.max_amount),
      requires_receipt: form.requires_receipt,
      approval_chain: editingType?.approval_chain ?? [],
    };
    if (editingType) await supabase.from("reimbursement_types").update(payload).eq("id", editingType.id);
    else             await supabase.from("reimbursement_types").insert(payload);
    setShowForm(false); setSaving(false); load();
  };

  const deactivateType = async (id: string) => {
    if (!confirm("Deactivate this category? Existing claims will still be visible.")) return;
    await supabase.from("reimbursement_types").update({ is_active: false }).eq("id", id);
    load();
  };

  // ── Request actions ──────────────────────────────────────────────────────
  const approveRequest = async (req: Request) => {
    setActioning(true);
    const nextStatus = req.current_stage + 1 >= (types.find(t => t.id === req.type_id)?.approval_chain?.length ?? 1)
      ? "approved" : "pending";
    const newApproval = { stage: req.current_stage + 1, approved_by: profile?.id, approver_name: profile?.full_name, at: new Date().toISOString(), note: approveNote, partial_amount: partialAmt ? Number(partialAmt) : null };
    await supabase.from("reimbursement_requests").update({
      status: nextStatus,
      current_stage: req.current_stage + 1,
      approved_amount: partialAmt ? Number(partialAmt) : null,
      approvals: [...(req.approvals ?? []), newApproval],
      approved_at: nextStatus === "approved" ? new Date().toISOString() : null,
      approved_by: nextStatus === "approved" ? profile?.id : null,
      updated_at: new Date().toISOString(),
    }).eq("id", req.id);
    setSelectedReq(null); setApproveNote(""); setPartialAmt(""); setActioning(false); load();
  };

  const rejectRequest = async (req: Request) => {
    if (!rejectReason.trim()) { alert("Please provide a rejection reason."); return; }
    setActioning(true);
    await supabase.from("reimbursement_requests").update({
      status: "rejected",
      rejection_reason: rejectReason,
      rejected_at_stage: req.current_stage,
      updated_at: new Date().toISOString(),
    }).eq("id", req.id);
    setSelectedReq(null); setRejectReason(""); setActioning(false); load();
  };

  // ── Filter ──────────────────────────────────────────────────────────────
  const filtered = filterStatus === "all" ? requests : requests.filter(r => r.status === filterStatus);
  const counts   = { pending: requests.filter(r => r.status === "pending").length, approved: requests.filter(r => r.status === "approved").length, rejected: requests.filter(r => r.status === "rejected").length };

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner} /></div>;

  const statusColor: Record<string, string> = {
    pending:  "#f59e0b",
    approved: "#10b981",
    rejected: "#ef4444",
    paid:     "#6366f1",
  };

  return (
    <div className="animate-fade-in">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className={styles.pageHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Reimbursements</h1>
          <p>Manage expense categories and review employee claims</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: "0.72rem", padding: "3px 10px", borderRadius: 20, background: tier === "advanced" ? "rgba(245,158,11,0.12)" : tier === "standard" ? "rgba(99,102,241,0.12)" : "rgba(16,185,129,0.12)", color: tier === "advanced" ? "#fbbf24" : tier === "standard" ? "#818cf8" : "#34d399", fontWeight: 700, textTransform: "uppercase" }}>
            {tier} tier
          </span>
          {tab === "categories" && (
            <button className={styles.primaryBtn} style={{ width: "auto", padding: "10px 20px" }} onClick={openNew}>
              + Add Category
            </button>
          )}
        </div>
      </div>

      {/* ── Stats Row ──────────────────────────────────────────────────── */}
      <div className={styles.statsGrid} style={{ marginBottom: 24 }}>
        {[
          { label: "Pending Review", value: counts.pending, color: "#f59e0b", icon: "⏳" },
          { label: "Approved",       value: counts.approved, color: "#10b981", icon: "✅" },
          { label: "Rejected",       value: counts.rejected, color: "#ef4444", icon: "❌" },
          { label: "Categories",     value: types.length,    color: "#6366f1", icon: "🏷️" },
        ].map(s => (
          <div key={s.label} className="glass-panel" style={{ padding: "20px 24px" }}>
            <div style={{ fontSize: "1.5rem", marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "rgba(0,0,0,0.2)", borderRadius: 12, padding: 4, width: "fit-content" }}>
        {(["requests", "categories"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 20px", borderRadius: 9, border: "none", cursor: "pointer",
            fontFamily: "inherit", fontWeight: 600, fontSize: "0.85rem", transition: "all 0.2s",
            background: tab === t ? "rgba(99,102,241,0.2)" : "transparent",
            color: tab === t ? "#818cf8" : "var(--text-secondary)",
          }}>
            {t === "requests" ? "📋 Claims" : "🏷️ Categories"}
          </button>
        ))}
      </div>

      {/* ── TAB: Claims ─────────────────────────────────────────────────── */}
      {tab === "requests" && (
        <>
          {/* Filter bar */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {["all", "pending", "approved", "rejected"].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)} style={{
                padding: "6px 16px", borderRadius: 20, border: "1px solid",
                borderColor: filterStatus === s ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.08)",
                background: filterStatus === s ? "rgba(99,102,241,0.12)" : "transparent",
                color: filterStatus === s ? "#818cf8" : "var(--text-secondary)",
                fontFamily: "inherit", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer",
                textTransform: "capitalize",
              }}>
                {s === "all" ? "All" : `${s} (${counts[s as keyof typeof counts] ?? 0})`}
              </button>
            ))}
          </div>

          <div className={`glass-panel ${styles.tableWrap}`}>
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 40 }}>No claims found.</td></tr>
                ) : filtered.map(req => (
                  <tr key={req.id}>
                    <td style={{ fontWeight: 600 }}>{req.profiles?.full_name ?? "—"}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{req.reimbursement_types?.name ?? "—"}</td>
                    <td>
                      <span style={{ fontWeight: 700 }}>₹{req.amount.toLocaleString()}</span>
                      {req.approved_amount != null && req.approved_amount !== req.amount && (
                        <span style={{ fontSize: "0.75rem", color: "#10b981", display: "block" }}>Approved: ₹{req.approved_amount.toLocaleString()}</span>
                      )}
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontSize: "0.83rem" }}>{new Date(req.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td>
                      <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, background: `${statusColor[req.status]}20`, color: statusColor[req.status], textTransform: "capitalize" }}>
                        {req.status}
                      </span>
                    </td>
                    <td>
                      <button onClick={() => { setSelectedReq(req); setApproveNote(""); setPartialAmt(""); setRejectReason(""); }} style={{ padding: "5px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.8rem", fontFamily: "inherit" }}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── TAB: Categories ─────────────────────────────────────────────── */}
      {tab === "categories" && (
        <div className={`glass-panel ${styles.tableWrap}`}>
          <table>
            <thead>
              <tr>
                <th>Category Name</th>
                <th>Max Claim Amount</th>
                <th>Receipt Required</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 40 }}>No categories yet. Add one to get started.</td></tr>
              ) : types.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td>{t.max_amount != null ? `₹${t.max_amount.toLocaleString()}` : <em style={{ color: "var(--text-secondary)" }}>No cap</em>}</td>
                  <td>
                    <span className={`${styles.statBadge} ${t.requires_receipt ? styles.badgeInfo : styles.badgeSuccess}`}>
                      {t.requires_receipt ? "Required" : "Optional"}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{t.description ?? "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => openEdit(t)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--glass-border)", background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.8rem" }}>✏️</button>
                      <button onClick={() => deactivateType(t.id)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "var(--danger)", cursor: "pointer", fontSize: "0.8rem" }}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Category Form Drawer ─────────────────────────────────────────── */}
      {showForm && (
        <div className="overlay" onClick={() => setShowForm(false)}>
          <div className="drawer" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="drawerHeader">
              <h2>{editingType ? "Edit Category" : "New Expense Category"}</h2>
              <button onClick={() => setShowForm(false)} className="closeBtn">✕</button>
            </div>
            <form onSubmit={saveType} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Category Name *</label>
                <input className="premium-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Description</label>
                <input className="premium-input" placeholder="e.g. Travel expenses for client visits" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Maximum Claim Amount (₹)</label>
                <input type="number" className="premium-input" placeholder="Leave blank for no cap" value={form.max_amount} onChange={e => setForm({ ...form, max_amount: e.target.value })} min={0} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", background: "rgba(0,0,0,0.2)", padding: 14, borderRadius: 10, border: "1px solid var(--glass-border)" }}>
                <input type="checkbox" checked={form.requires_receipt} onChange={e => setForm({ ...form, requires_receipt: e.target.checked })} style={{ accentColor: "var(--accent-primary)", width: 16, height: 16 }} disabled={!!(modProps.allow_optional_receipt === false)} />
                <div>
                  <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>Receipt Required</div>
                  {!isAdv && <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>Optional receipt per category unlocks in Advanced tier</div>}
                </div>
              </label>
              <button type="submit" className={styles.primaryBtn} disabled={saving} style={{ marginTop: 4 }}>
                {saving ? "Saving…" : "💾 Save Category"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Request Detail Drawer ────────────────────────────────────────── */}
      {selectedReq && (
        <div className="overlay" onClick={() => setSelectedReq(null)}>
          <div className="drawer" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="drawerHeader">
              <h2>Claim Detail</h2>
              <button onClick={() => setSelectedReq(null)} className="closeBtn">✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Info rows */}
              {[
                ["Employee",    selectedReq.profiles?.full_name ?? "—"],
                ["Category",    selectedReq.reimbursement_types?.name ?? "—"],
                ["Amount",      `₹${selectedReq.amount.toLocaleString()}`],
                ["Status",      selectedReq.status.toUpperCase()],
                ["Description", selectedReq.description ?? "—"],
                ["Submitted",   new Date(selectedReq.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{k}</span>
                  <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{v}</span>
                </div>
              ))}

              {selectedReq.receipt_url && (
                <a href={selectedReq.receipt_url} target="_blank" rel="noopener noreferrer" style={{ color: "#818cf8", fontSize: "0.85rem" }}>
                  📎 View Receipt
                </a>
              )}

              {/* Actions — only if pending */}
              {selectedReq.status === "pending" && (
                <div style={{ background: "rgba(0,0,0,0.2)", padding: 16, borderRadius: 12, border: "1px solid var(--glass-border)", display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>Review Actions</div>

                  {isAdv && (
                    <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                      <label>Partial Approval Amount (₹) — leave blank to approve full amount</label>
                      <input type="number" className="premium-input" placeholder={`Full amount: ₹${selectedReq.amount}`} value={partialAmt} onChange={e => setPartialAmt(e.target.value)} />
                    </div>
                  )}

                  <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                    <label>Approval Note (optional)</label>
                    <input className="premium-input" placeholder="Note for employee…" value={approveNote} onChange={e => setApproveNote(e.target.value)} />
                  </div>

                  <button onClick={() => approveRequest(selectedReq)} disabled={actioning}
                    style={{ padding: "10px", borderRadius: 10, border: "none", background: "linear-gradient(90deg,#10b981,#059669)", color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: "0.9rem" }}>
                    {actioning ? "Processing…" : "✅ Approve"}
                  </button>

                  <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                    <label>Rejection Reason *</label>
                    <input className="premium-input" placeholder="Reason is required to reject" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
                  </div>

                  <button onClick={() => rejectRequest(selectedReq)} disabled={actioning}
                    style={{ padding: "10px", borderRadius: 10, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "var(--danger)", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: "0.9rem" }}>
                    {actioning ? "Processing…" : "❌ Reject"}
                  </button>
                </div>
              )}

              {/* Approval trail */}
              {selectedReq.approvals?.length > 0 && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 8 }}>Approval Trail</div>
                  {selectedReq.approvals.map((a: any, i: number) => (
                    <div key={i} style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)", marginBottom: 6, fontSize: "0.83rem" }}>
                      <span style={{ fontWeight: 600 }}>Stage {a.stage}</span> — {a.approver_name} · {new Date(a.at).toLocaleDateString("en-IN")}
                      {a.note && <div style={{ color: "var(--text-secondary)", marginTop: 2 }}>{a.note}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
