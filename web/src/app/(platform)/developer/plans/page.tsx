"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Package, Plus, Users, Pencil, Check } from "lucide-react";
import dp from "../dev-page.module.css";
import s from "./plans.module.css";

// ── All module keys available on the platform ──────────────────────────────
const ALL_MODULES: { key: string; label: string; group?: string }[] = [
  // ── Core
  { key: "kpi_dashboard",       label: "KPI Dashboard",           group: "Core"          },
  { key: "staff_management",    label: "Staff Management",         group: "Core"          },
  { key: "attendance",          label: "Attendance",               group: "Core"          },
  { key: "kiosk_attendance",    label: "Kiosk Attendance",         group: "Core"          },
  // ── Leave
  { key: "leave_management",    label: "Leave Management",         group: "Leave"         },
  { key: "leave_settings",      label: "Leave Type Config",        group: "Leave"         },
  // ── Payroll & Finance
  { key: "payroll",             label: "Payroll",                  group: "Finance"       },
  { key: "reimbursements",      label: "Reimbursements",           group: "Finance"       },
  // ── HR Admin
  { key: "overrides",           label: "Manual Overrides",         group: "HR Admin"      },
  { key: "profiles",            label: "Profiles & Roles",         group: "HR Admin"      },
  { key: "approvals",           label: "Approval Chains",          group: "HR Admin"      },
  { key: "permissions",         label: "Permissions",              group: "HR Admin"      },
  // ── Communication
  { key: "announcements",       label: "Announcements",            group: "Communication" },
  { key: "hr_policies",         label: "HR Policies",              group: "Communication" },
  { key: "notifications",       label: "Notifications",            group: "Communication" },
  // ── Reporting & Other
  { key: "reports",             label: "Reports",                  group: "Reporting"     },
  { key: "holidays",            label: "Holidays",                 group: "Reporting"     },
  { key: "appraisals",          label: "Performance Appraisals",   group: "Reporting"     },
  { key: "organogram",          label: "Organogram",               group: "Reporting"     },
  { key: "employee_mobile_app", label: "Employee Mobile App",      group: "Mobile"        },
];

interface Plan {
  id:               string;
  name:             string;
  price_monthly:    number;
  max_employees:    number;
  default_modules:  Record<string, boolean>;
  is_active:        boolean;
  created_at:       string;
}

const TIER_COLORS: Record<string, string> = {
  Starter:      "#10b981",
  Professional: "#6366f1",
  Enterprise:   "#f59e0b",
};

const FEATURED_PLAN = "Professional";

function moduleCount(mods: Record<string, boolean>) {
  return Object.values(mods).filter(Boolean).length;
}

export default function PlansPage() {
  const [plans,   setPlans]   = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [showNew, setShowNew] = useState(false);

  // Edit form state
  const [form, setForm] = useState({
    name: "", price_monthly: "", max_employees: "", is_active: true,
  });
  const [modChecks, setModChecks] = useState<Record<string, boolean>>({});

  useEffect(() => { loadPlans(); }, []);

  async function loadPlans() {
    setLoading(true);
    const { data } = await supabase
      .from("subscription_plans")
      .select("*")
      .order("price_monthly");
    setPlans(data ?? []);
    setLoading(false);
  }

  function openEdit(plan: Plan) {
    setEditing(plan);
    setShowNew(false);
    setForm({
      name:          plan.name,
      price_monthly: String(plan.price_monthly),
      max_employees: String(plan.max_employees),
      is_active:     plan.is_active,
    });
    setModChecks(plan.default_modules ?? {});
  }

  function openNew() {
    setEditing(null);
    setShowNew(true);
    setForm({ name: "", price_monthly: "", max_employees: "", is_active: true });
    setModChecks({});
  }

  async function handleSave() {
    setSaving(true);
    const payload = {
      name:            form.name,
      price_monthly:   parseFloat(form.price_monthly) || 0,
      max_employees:   parseInt(form.max_employees)   || 50,
      default_modules: modChecks,
      is_active:       form.is_active,
    };
    if (editing) {
      await supabase.from("subscription_plans").update(payload).eq("id", editing.id);
    } else {
      await supabase.from("subscription_plans").insert(payload);
    }
    setEditing(null);
    setShowNew(false);
    setSaving(false);
    loadPlans();
  }

  const showModal = editing !== null || showNew;

  return (
    <div className={dp.page}>
      <div className={dp.pageHeader}>
        <div>
          <h1 className={dp.heading}>Subscription Plans</h1>
          <p className={dp.subheading}>Define what each tier includes and costs.</p>
        </div>
        <button className={dp.primaryBtn} onClick={openNew}>
          <Plus size={16} /> New Plan
        </button>
      </div>

      {loading ? (
        <div className={dp.loading}>Loading plans...</div>
      ) : (
        <div className={s.plansGrid}>
          {plans.map((plan) => {
            const color       = TIER_COLORS[plan.name] ?? "#6366f1";
            const isFeatured  = plan.name === FEATURED_PLAN;
            const modCnt      = moduleCount(plan.default_modules ?? {});
            return (
              <div
                key={plan.id}
                className={`${s.planCard} ${isFeatured ? s.featured : ""}`}
                style={{ "--plan-color": color } as React.CSSProperties}
              >
                {isFeatured && <div className={s.featuredBadge}>Most Popular</div>}

                <div className={s.planHeader} style={{ paddingTop: isFeatured ? 40 : 28 }}>
                  <div className={s.planName}>
                    {plan.name}
                    {!plan.is_active && <span className={s.inactiveBadge}>Inactive</span>}
                  </div>
                  <div className={s.planPrice}>
                    <span className={s.planPriceCurrency} style={{ color }}>₹</span>
                    <span className={s.planPriceAmount}>{plan.price_monthly.toLocaleString("en-IN")}</span>
                    <span className={s.planPricePeriod}>/month</span>
                  </div>
                </div>

                <div className={s.planBody}>
                  <div className={s.planStat}>
                    <span className={s.planStatKey}>Max Employees</span>
                    <span className={s.planStatVal}>
                      <Users size={13} style={{ display: "inline", marginRight: 4, color }} />
                      {plan.max_employees}
                    </span>
                  </div>
                  <div className={s.planStat}>
                    <span className={s.planStatKey}>Included Modules</span>
                    <span className={s.planModuleCount} style={{ background: `${color}15`, color, borderColor: `${color}30` }}>
                      {modCnt} / {ALL_MODULES.length}
                    </span>
                  </div>
                  {/* Module pills */}
                  <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {ALL_MODULES.filter(m => plan.default_modules?.[m.key]).slice(0, 8).map(m => (
                      <span key={m.key} style={{
                        fontSize: "0.68rem", padding: "2px 7px", borderRadius: 20,
                        background: `${color}12`, color, border: `1px solid ${color}25`,
                        fontWeight: 600,
                      }}>
                        {m.label}
                      </span>
                    ))}
                    {modCnt > 8 && (
                      <span style={{ fontSize: "0.68rem", color: "#475569", padding: "2px 7px" }}>
                        +{modCnt - 8} more
                      </span>
                    )}
                  </div>
                </div>

                <div className={s.planActions}>
                  <button className={s.planEditBtn} onClick={() => openEdit(plan)}>
                    <Pencil size={14} /> Edit Plan
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit / New Plan Modal */}
      {showModal && (
        <div className={s.overlay}>
          <div className={s.modal}>
            <div className={s.modalHead}>
              <h2>{editing ? `Edit — ${editing.name}` : "Create New Plan"}</h2>
              <button className={s.closeBtn} onClick={() => { setEditing(null); setShowNew(false); }}>✕</button>
            </div>
            <div className={s.modalBody}>
              <div className={s.formRow}>
                <div className={s.fieldGroup}>
                  <label className={s.label}>Plan Name</label>
                  <input className={s.input} value={form.name}
                    onChange={e => setForm(f => ({...f, name: e.target.value}))}
                    placeholder="e.g. Professional" />
                </div>
                <div className={s.fieldGroup}>
                  <label className={s.label}>Monthly Price (₹)</label>
                  <input className={s.input} type="number" value={form.price_monthly}
                    onChange={e => setForm(f => ({...f, price_monthly: e.target.value}))}
                    placeholder="2499" />
                </div>
              </div>
              <div className={s.formRow}>
                <div className={s.fieldGroup}>
                  <label className={s.label}>Max Employees</label>
                  <input className={s.input} type="number" value={form.max_employees}
                    onChange={e => setForm(f => ({...f, max_employees: e.target.value}))}
                    placeholder="100" />
                </div>
                <div className={s.fieldGroup}>
                  <label className={s.label}>Status</label>
                  <select className={s.input} value={form.is_active ? "active" : "inactive"}
                    onChange={e => setForm(f => ({...f, is_active: e.target.value === "active"}))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <hr className={s.divider} />
              <p className={s.sectionLabel}>Default Modules Included</p>

              <div className={s.moduleCheckGrid}>
                {ALL_MODULES.map(({ key, label }) => (
                  <label key={key} className={s.moduleCheck}>
                    <input
                      type="checkbox"
                      checked={!!modChecks[key]}
                      onChange={e => setModChecks(c => ({...c, [key]: e.target.checked}))}
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div className={s.modalFoot}>
                <button className={s.cancelBtn} onClick={() => { setEditing(null); setShowNew(false); }}>
                  Cancel
                </button>
                <button className={s.submitBtn} onClick={handleSave} disabled={saving || !form.name}>
                  {saving ? "Saving…" : <><Check size={15} style={{display:"inline",marginRight:5}} />{editing ? "Save Changes" : "Create Plan"}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
