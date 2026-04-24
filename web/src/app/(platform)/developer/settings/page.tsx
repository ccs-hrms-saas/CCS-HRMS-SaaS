"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import dp from "../dev-page.module.css";

// Use service role for platform settings (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // reads via anon + RLS allows platform_owner
);

// ── Types ──────────────────────────────────────────────────────────────────────
interface PlatformSetting {
  key: string;
  value: any;
  label: string;
  description: string;
  category: string;
  input_type: "toggle" | "number" | "select";
  options: Array<{ value: string; label: string }> | null;
  overridable_by_tenant: boolean;
  updated_at: string;
}

const CATEGORY_META: Record<string, { icon: string; label: string; color: string }> = {
  payroll:    { icon: "💸", label: "Payroll",    color: "#10b981" },
  kiosk:      { icon: "📟", label: "Kiosk",      color: "#6366f1" },
  leave:      { icon: "🌿", label: "Leave",      color: "#f59e0b" },
  attendance: { icon: "⏱️", label: "Attendance", color: "#3b82f6" },
  general:    { icon: "⚙️", label: "General",    color: "#8b5cf6" },
};

export default function PlatformSettingsPage() {
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // key being saved
  const [pushing, setPushing] = useState<string | null>(null); // key being pushed
  const [toasts, setToasts] = useState<{ id: number; msg: string; ok: boolean }[]>([]);
  const [tenantCount, setTenantCount] = useState<number>(0);

  // ── Load ────────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const [sRes, tRes] = await Promise.all([
      supabaseAdmin.from("platform_default_settings").select("*").order("category").order("key"),
      supabaseAdmin.from("companies").select("id", { count: "exact", head: true }),
    ]);
    setSettings(sRes.data ?? []);
    setTenantCount(tRes.count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Toast helper ────────────────────────────────────────────────────────────
  const toast = (msg: string, ok = true) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, msg, ok }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  };

  // ── Save single setting ─────────────────────────────────────────────────────
  const saveSetting = async (key: string, value: any, overridable: boolean) => {
    setSaving(key);
    const { error } = await supabaseAdmin
      .from("platform_default_settings")
      .update({ value: JSON.stringify(value), overridable_by_tenant: overridable, updated_at: new Date().toISOString() })
      .eq("key", key);
    setSaving(null);
    if (error) { toast(`Failed: ${error.message}`, false); return; }
    setSettings((prev) => prev.map((s) => s.key === key ? { ...s, value, overridable_by_tenant: overridable } : s));
    toast(`"${key}" saved`);
  };

  // ── Optimistic local update (before saving) ─────────────────────────────────
  const updateLocal = (key: string, field: "value" | "overridable_by_tenant", val: any) => {
    setSettings((prev) => prev.map((s) => s.key === key ? { ...s, [field]: val } : s));
  };

  // ── Push to all tenants ─────────────────────────────────────────────────────
  const pushToAllTenants = async (setting: PlatformSetting) => {
    if (!confirm(`Push "${setting.label}" to all ${tenantCount} tenants?\n\nThis will overwrite tenant-level settings for this key.`)) return;
    setPushing(setting.key);

    // Build the column update — map key to app_settings column name
    const colMap: Record<string, string> = {
      lwp_deduction_mode: "lwp_deduction_mode",
      payroll_prorate_mid_joiners: "payroll_prorate_mid_joiners",
      payroll_visible_after_day: "payroll_visible_after_day",
      attendance_grace_days: "attendance_grace_days",
      attendance_overtime_tracking: "overtime_tracking",
      leave_auto_lapse_on_month_end: "leave_auto_lapse_on_month_end",
      // kiosk settings are stored differently — no direct app_settings column
    };

    const col = colMap[setting.key];
    if (col) {
      await supabaseAdmin
        .from("app_settings")
        .update({ [col]: setting.value });
    }

    setPushing(null);
    toast(`✅ Pushed to all ${tenantCount} tenants`);
  };

  // ── Group settings by category ──────────────────────────────────────────────
  const categories = [...new Set(settings.map((s) => s.category))];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={dp.page}>
      {/* Toast container */}
      <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            padding: "10px 18px", borderRadius: 10,
            background: t.ok ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
            border: `1px solid ${t.ok ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`,
            color: t.ok ? "#10b981" : "#ef4444", fontSize: "0.85rem", fontWeight: 600,
            backdropFilter: "blur(12px)", animation: "fadeIn 0.2s ease",
          }}>
            {t.msg}
          </div>
        ))}
      </div>

      <div className={dp.pageHeader}>
        <div>
          <h1 className={dp.heading}>Platform Settings</h1>
          <p className={dp.subheading}>
            Global defaults for all {tenantCount} tenants. Toggle features ON/OFF, lock settings so tenants cannot override, or push a value to all tenants at once.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ padding: "8px 20px", borderRadius: 20, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)", fontSize: "0.85rem", color: "var(--accent-primary)", fontWeight: 600 }}>
            {tenantCount} Active Tenants
          </div>
        </div>
      </div>

      {loading ? (
        <div className={dp.panel} style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>
          Loading platform settings…
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {categories.map((cat) => {
            const meta = CATEGORY_META[cat] ?? { icon: "⚙️", label: cat, color: "#6366f1" };
            const catSettings = settings.filter((s) => s.category === cat);
            return (
              <div key={cat} className={dp.panel} style={{ padding: 0, overflow: "hidden" }}>
                {/* Category header */}
                <div style={{
                  padding: "16px 24px", background: "rgba(255,255,255,0.02)",
                  borderBottom: "1px solid var(--glass-border)",
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <span style={{ fontSize: "1.4rem" }}>{meta.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "1rem" }}>{meta.label}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>
                      {catSettings.length} setting{catSettings.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>

                {/* Settings rows */}
                {catSettings.map((s, idx) => (
                  <div key={s.key} style={{
                    padding: "20px 24px",
                    borderBottom: idx < catSettings.length - 1 ? "1px solid var(--glass-border)" : "none",
                    display: "flex", alignItems: "flex-start", gap: 24, flexWrap: "wrap",
                  }}>
                    {/* Label + description */}
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.92rem", marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{s.description}</div>
                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {/* Overridable toggle */}
                        <button
                          onClick={() => {
                            const newVal = !s.overridable_by_tenant;
                            updateLocal(s.key, "overridable_by_tenant", newVal);
                            saveSetting(s.key, s.value, newVal);
                          }}
                          style={{
                            padding: "3px 10px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 600, cursor: "pointer",
                            border: s.overridable_by_tenant ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(239,68,68,0.4)",
                            background: s.overridable_by_tenant ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                            color: s.overridable_by_tenant ? "#10b981" : "#ef4444",
                          }}
                        >
                          {s.overridable_by_tenant ? "🔓 Tenant Can Override" : "🔒 Locked (Dev Only)"}
                        </button>
                        <div style={{ padding: "3px 10px", borderRadius: 20, fontSize: "0.72rem", color: "var(--text-secondary)", border: "1px solid var(--glass-border)" }}>
                          Key: <code style={{ fontFamily: "monospace" }}>{s.key}</code>
                        </div>
                      </div>
                    </div>

                    {/* Control */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12, minWidth: 180 }}>
                      {/* Toggle */}
                      {s.input_type === "toggle" && (
                        <button
                          onClick={() => {
                            const newVal = !s.value;
                            updateLocal(s.key, "value", newVal);
                            saveSetting(s.key, newVal, s.overridable_by_tenant);
                          }}
                          disabled={saving === s.key}
                          style={{
                            width: 56, height: 28, borderRadius: 14, border: "none", cursor: "pointer",
                            background: s.value ? meta.color : "rgba(100,116,139,0.3)",
                            position: "relative", transition: "background 0.2s",
                          }}
                        >
                          <div style={{
                            position: "absolute", top: 4, left: s.value ? 32 : 4,
                            width: 20, height: 20, borderRadius: "50%",
                            background: "white", transition: "left 0.2s",
                            boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                          }} />
                        </button>
                      )}

                      {/* Number */}
                      {s.input_type === "number" && (
                        <input
                          type="number"
                          className="premium-input"
                          style={{ width: 90, textAlign: "center", padding: "6px 10px" }}
                          value={s.value}
                          min={0}
                          onChange={(e) => updateLocal(s.key, "value", Number(e.target.value))}
                          onBlur={() => saveSetting(s.key, s.value, s.overridable_by_tenant)}
                        />
                      )}

                      {/* Select */}
                      {s.input_type === "select" && s.options && (
                        <select
                          className="premium-input"
                          style={{ minWidth: 200, padding: "6px 12px" }}
                          value={s.value}
                          onChange={(e) => {
                            updateLocal(s.key, "value", e.target.value);
                            saveSetting(s.key, e.target.value, s.overridable_by_tenant);
                          }}
                        >
                          {s.options.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      )}

                      {/* Status indicator */}
                      <div style={{ fontSize: "0.72rem", color: saving === s.key ? "#f59e0b" : "var(--text-secondary)" }}>
                        {saving === s.key ? "Saving…" : `Updated ${new Date(s.updated_at).toLocaleDateString("en-IN")}`}
                      </div>

                      {/* Push to all tenants */}
                      <button
                        onClick={() => pushToAllTenants(s)}
                        disabled={pushing === s.key}
                        style={{
                          padding: "6px 14px", borderRadius: 8, fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
                          border: "1px solid rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.1)",
                          color: "var(--accent-primary)", fontFamily: "Outfit, sans-serif",
                          opacity: pushing === s.key ? 0.6 : 1,
                        }}
                      >
                        {pushing === s.key ? "Pushing…" : `📡 Push to All ${tenantCount} Tenants`}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
