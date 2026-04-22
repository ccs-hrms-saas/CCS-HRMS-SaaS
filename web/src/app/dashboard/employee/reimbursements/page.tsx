"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useModules } from "@/context/ModulesContext";
import styles from "../../dashboard.module.css";

interface ReimbType  { id: string; name: string; description: string | null; max_amount: number | null; requires_receipt: boolean; }
interface MyRequest  { id: string; type_id: string; amount: number; approved_amount: number | null; description: string | null; receipt_url: string | null; status: string; rejection_reason: string | null; created_at: string; reimbursement_types: { name: string } | null; }

const statusColor: Record<string, string> = { pending: "#f59e0b", approved: "#10b981", rejected: "#ef4444", paid: "#6366f1" };

export default function EmployeeReimbursements() {
  const { profile }    = useAuth();
  const { getProps }   = useModules();
  const modProps       = getProps("reimbursements");
  const isAdv          = modProps.tier === "advanced";
  const maxPerMonth    = modProps.max_claims_per_month as number | null ?? 1;

  const [types,    setTypes]    = useState<ReimbType[]>([]);
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [form, setForm] = useState({ type_id: "", amount: "", description: "", receipt_url: "" });
  const [fileUploading, setFileUploading] = useState(false);

  const thisMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: t }, { data: r }] = await Promise.all([
      supabase.from("reimbursement_types").select("id, name, description, max_amount, requires_receipt").eq("is_active", true).order("name"),
      supabase.from("reimbursement_requests").select("*, reimbursement_types(name)").eq("user_id", profile!.id).order("created_at", { ascending: false }),
    ]);
    setTypes(t ?? []);
    setRequests(r ?? []);
    setLoading(false);
  }, [profile]);

  useEffect(() => { if (profile?.id) load(); }, [load, profile]);

  const claimsThisMonth = requests.filter(r => r.created_at.startsWith(thisMonth)).length;
  const canSubmit       = maxPerMonth === null || claimsThisMonth < maxPerMonth;

  const selectedType = types.find(t => t.id === form.type_id);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileUploading(true);
    const path = `receipts/${profile!.id}/${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage.from("reimbursements").upload(path, file, { upsert: true });
    if (!error && data) {
      const { data: pub } = supabase.storage.from("reimbursements").getPublicUrl(data.path);
      setForm(f => ({ ...f, receipt_url: pub.publicUrl }));
    }
    setFileUploading(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.type_id) { alert("Please select an expense category."); return; }
    if (!form.amount || Number(form.amount) <= 0) { alert("Please enter a valid amount."); return; }
    if (selectedType?.requires_receipt && !form.receipt_url) { alert("A receipt is required for this category."); return; }
    if (selectedType?.max_amount && Number(form.amount) > selectedType.max_amount) {
      alert(`Maximum claim for this category is ₹${selectedType.max_amount.toLocaleString()}.`); return;
    }
    setSaving(true);
    await supabase.from("reimbursement_requests").insert({
      user_id: profile!.id,
      type_id: form.type_id,
      amount: Number(form.amount),
      description: form.description || null,
      receipt_url: form.receipt_url || null,
      status: "pending",
      current_stage: 0,
      approvals: [],
    });
    setShowForm(false);
    setForm({ type_id: "", amount: "", description: "", receipt_url: "" });
    setSaving(false);
    load();
  };

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner} /></div>;

  return (
    <div className="animate-fade-in">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className={styles.pageHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>My Reimbursements</h1>
          <p>Submit and track your expense claims</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {!canSubmit && (
            <span style={{ fontSize: "0.78rem", color: "#f59e0b", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", padding: "5px 12px", borderRadius: 20 }}>
              Monthly limit reached ({maxPerMonth} claims)
            </span>
          )}
          <button className={styles.primaryBtn} style={{ width: "auto", padding: "10px 20px", opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? "pointer" : "not-allowed" }}
            onClick={() => { if (canSubmit) setShowForm(true); }}>
            + New Claim
          </button>
        </div>
      </div>

      {/* ── Quick stats ─────────────────────────────────────────────────── */}
      <div className={styles.statsGrid} style={{ marginBottom: 28 }}>
        {[
          { label: "Submitted This Month", value: claimsThisMonth, color: "#818cf8", icon: "📤" },
          { label: "Pending Review",        value: requests.filter(r => r.status === "pending").length,  color: "#f59e0b", icon: "⏳" },
          { label: "Approved",              value: requests.filter(r => r.status === "approved").length, color: "#10b981", icon: "✅" },
          { label: "Total Approved (₹)",    value: `₹${requests.filter(r => r.status === "approved").reduce((s, r) => s + (r.approved_amount ?? r.amount), 0).toLocaleString()}`, color: "#34d399", icon: "💰" },
        ].map(s => (
          <div key={s.label} className="glass-panel" style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: "1.4rem", marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Claims list ─────────────────────────────────────────────────── */}
      <div className={`glass-panel ${styles.tableWrap}`}>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Amount</th>
              <th>Date Submitted</th>
              <th>Status</th>
              <th>Receipt</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-secondary)", padding: 40 }}>No claims submitted yet.</td></tr>
            ) : requests.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.reimbursement_types?.name ?? "—"}</td>
                <td>
                  <span style={{ fontWeight: 700 }}>₹{r.amount.toLocaleString()}</span>
                  {r.approved_amount != null && r.approved_amount !== r.amount && (
                    <span style={{ fontSize: "0.73rem", color: "#10b981", display: "block" }}>Approved: ₹{r.approved_amount.toLocaleString()}</span>
                  )}
                </td>
                <td style={{ color: "var(--text-secondary)", fontSize: "0.83rem" }}>
                  {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </td>
                <td>
                  <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, background: `${statusColor[r.status]}20`, color: statusColor[r.status], textTransform: "capitalize" }}>
                    {r.status}
                  </span>
                </td>
                <td>
                  {r.receipt_url ? <a href={r.receipt_url} target="_blank" rel="noopener noreferrer" style={{ color: "#818cf8", fontSize: "0.82rem" }}>📎 View</a> : <span style={{ color: "var(--text-secondary)" }}>—</span>}
                </td>
                <td style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                  {r.rejection_reason ?? r.description ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── New Claim Drawer ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="overlay" onClick={() => setShowForm(false)}>
          <div className="drawer" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="drawerHeader">
              <h2>New Expense Claim</h2>
              <button onClick={() => setShowForm(false)} className="closeBtn">✕</button>
            </div>
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Expense Category *</label>
                <select className="premium-input" value={form.type_id} onChange={e => setForm({ ...form, type_id: e.target.value })} required>
                  <option value="">— Select a category —</option>
                  {types.map(t => (
                    <option key={t.id} value={t.id}>{t.name}{t.max_amount ? ` (max ₹${t.max_amount.toLocaleString()})` : ""}</option>
                  ))}
                </select>
                {selectedType?.description && (
                  <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{selectedType.description}</span>
                )}
              </div>

              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Claim Amount (₹) *</label>
                <input type="number" className="premium-input" placeholder="Enter amount" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} min={1} required />
                {selectedType?.max_amount && (
                  <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>Limit: ₹{selectedType.max_amount.toLocaleString()}</span>
                )}
              </div>

              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Description / Purpose</label>
                <input className="premium-input" placeholder="What was this expense for?" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>

              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label>Receipt {selectedType?.requires_receipt ? <span style={{ color: "#ef4444" }}>*</span> : "(optional)"}</label>
                {form.receipt_url ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 9 }}>
                    <span style={{ color: "#34d399", fontSize: "0.85rem" }}>✅ Receipt uploaded</span>
                    <button type="button" onClick={() => setForm(f => ({ ...f, receipt_url: "" }))} style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: 7, border: "1px solid rgba(239,68,68,0.3)", background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: "0.75rem", fontFamily: "inherit" }}>Remove</button>
                  </div>
                ) : (
                  <label style={{ display: "block", padding: "14px", border: "2px dashed rgba(99,102,241,0.3)", borderRadius: 10, textAlign: "center", cursor: "pointer", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                    {fileUploading ? "Uploading…" : "📎 Click to upload receipt"}
                    <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={handleFileUpload} disabled={fileUploading} />
                  </label>
                )}
              </div>

              <button type="submit" className={styles.primaryBtn} disabled={saving || fileUploading} style={{ marginTop: 4 }}>
                {saving ? "Submitting…" : "📤 Submit Claim"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
