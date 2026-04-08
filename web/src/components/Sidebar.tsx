"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useViewMode } from "@/context/ViewModeContext";
import { useAppSettings } from "@/context/AppSettingsContext";
import { supabase } from "@/lib/supabase";
import NotificationBell from "@/components/NotificationBell";
import styles from "./Sidebar.module.css";
import * as LucideIcons from "lucide-react";

// ── Dynamic Lucide icon renderer ──────────────────────────────────────────────
function NavIcon({ name, size = 18 }: { name: string; size?: number }) {
  const Comp = (LucideIcons as any)[name];
  if (!Comp) return <LucideIcons.Circle size={size} />;
  return <Comp size={size} />;
}

// Default Lucide icon keys for each nav label
const DEFAULT_ICONS: Record<string, string> = {
  "Dashboard":     "LayoutDashboard",
  "Users":         "Users",
  "Organogram":    "Network",
  "Attendance":    "ClipboardList",
  "Leave Approvals":"CalendarCheck",
  "Announcements": "Megaphone",
  "HR Policies":   "BookOpen",
  "Overrides":     "Wrench",
  "Leave Settings":"Settings2",
  "Holidays":      "Star",
  "Payroll":       "Banknote",
  "Reports":       "BarChart3",
  "Approvals":     "CheckCircle",
  "Permissions":   "ShieldCheck",
  "Settings":      "Settings",
  // Employee nav
  "My Leaves":         "CalendarDays",
  "My Payslips":       "Receipt",
  "My Profile":        "User",
  "My Attendance PIN": "Fingerprint",
  "My PIN":            "Fingerprint",
  "Leaves":            "CalendarDays",
  "My Team":           "Users2",
  "Policies":          "BookOpen",
};

// ── Nav definitions ──────────────────────────────────────────────────────────
const adminNav = [
  { href: "/dashboard/admin",                   label: "Dashboard"       },
  { href: "/dashboard/admin/users",             label: "Users"           },
  { href: "/dashboard/admin/organogram",        label: "Organogram"      },
  { href: "/dashboard/admin/attendance",        label: "Attendance"      },
  { href: "/dashboard/admin/leaves",            label: "Leave Approvals" },
  { href: "/dashboard/admin/announcements",     label: "Announcements"   },
  { href: "/dashboard/admin/policies",          label: "HR Policies"     },
  { href: "/dashboard/admin/manual-attendance", label: "Overrides"       },
  { href: "/dashboard/admin/leave-settings",    label: "Leave Settings"  },
  { href: "/dashboard/admin/holidays",          label: "Holidays"        },
  { href: "/dashboard/admin/payroll",           label: "Payroll"         },
  { href: "/dashboard/admin/reports",           label: "Reports"         },
];

const adminPermissionsItem = { href: "/dashboard/admin/permissions",        label: "Permissions" };
const adminApprovalsItem   = { href: "/dashboard/admin/approvals",          label: "Approvals"   };
const settingsItem         = { href: "/dashboard/superadmin/settings",      label: "Settings"    };

const personalNav = [
  { href: "/dashboard/employee/leaves",    label: "My Leaves"        },
  { href: "/dashboard/employee/payslips",  label: "My Payslips"      },
  { href: "/dashboard/employee/profile",   label: "My Profile"       },
  { href: "/dashboard/employee/pin",       label: "My Attendance PIN"},
];

const employeeNav = [
  { href: "/dashboard/employee",            label: "Dashboard"  },
  { href: "/dashboard/employee/attendance", label: "Attendance" },
  { href: "/dashboard/employee/leaves",     label: "Leaves"     },
  { href: "/dashboard/employee/profile",    label: "My Profile" },
  { href: "/dashboard/employee/payslips",   label: "My Payslips"},
  { href: "/dashboard/employee/policies",   label: "Policies"   },
  { href: "/dashboard/employee/pin",        label: "My PIN"     },
];

const myTeamItem = { href: "/dashboard/employee/team", label: "My Team" };

// ═════════════════════════════════════════════════════════════════════════════
export default function Sidebar() {
  const { profile, signOut }         = useAuth();
  const { demoView, toggleDemoView } = useViewMode();
  const { settings }                 = useAppSettings();
  const pathname                     = usePathname();
  const router                       = useRouter();

  const [showProfile, setShowProfile]   = useState(false);
  const [hasTeam, setHasTeam]           = useState(false);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);

  const isOnPersonalPage = personalNav.some(p => pathname.startsWith(p.href));
  const [personalOpen, setPersonalOpen] = useState(isOnPersonalPage);

  const realIsAdmin  = profile?.role === "admin" || profile?.role === "superadmin";
  const isSuperAdmin = profile?.role === "superadmin";
  const isDemo       = demoView === "employee";
  const showAdminNav = realIsAdmin && !isDemo;

  // Helper: resolve icon key for a label
  const iconKey = (label: string) => settings.nav_icons[label] ?? DEFAULT_ICONS[label] ?? "Circle";

  useEffect(() => {
    if (profile?.id && !realIsAdmin) {
      supabase.from("profiles").select("id", { count: "exact", head: true })
        .eq("manager_id", profile.id).eq("is_active", true)
        .then(({ count }) => setHasTeam((count ?? 0) > 0));
    }
    if (isSuperAdmin) {
      supabase.from("pending_approvals").select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .then(({ count }) => setPendingApprovalCount(count ?? 0));
    }
  }, [profile, realIsAdmin, isSuperAdmin]);

  useEffect(() => {
    if (isOnPersonalPage) setPersonalOpen(true);
  }, [pathname]);

  const adminNavFull = isSuperAdmin
    ? [...adminNav, adminApprovalsItem, adminPermissionsItem]
    : adminNav;
  const empNavFull = hasTeam ? [...employeeNav, myTeamItem] : employeeNav;
  const nav        = showAdminNav ? adminNavFull : empNavFull;

  const handleSignOut = async () => { await signOut(); router.push("/login"); };

  // ── Demo Toggle ────────────────────────────────────────────────────────────
  const DemoToggle = () => {
    if (!realIsAdmin) return null;
    return (
      <button onClick={toggleDemoView}
        title={isDemo ? "Exit Employee View Demo" : "Preview Employee View (Demo)"}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 10px", borderRadius: 20,
          border: isDemo ? "1px solid rgba(124,58,237,0.5)" : "1px solid rgba(255,255,255,0.12)",
          background: isDemo ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.06)",
          color: isDemo ? "#c4b5fd" : "var(--text-secondary)",
          cursor: "pointer", fontSize: "0.7rem", fontWeight: 700,
          fontFamily: "inherit", whiteSpace: "nowrap",
          transition: "all 0.2s", flexShrink: 0,
        }}>
        {isDemo ? "🎭 Demo" : "👤 Demo"}
      </button>
    );
  };

  // ── Personal submenu ───────────────────────────────────────────────────────
  const PersonalSubmenu = () => {
    if (!showAdminNav) return null;
    return (
      <div>
        <button onClick={() => setPersonalOpen(o => !o)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 12,
            padding: "10px 16px", borderRadius: 12,
            border: "none", background: isOnPersonalPage
              ? "rgba(99,102,241,0.12)" : "transparent",
            color: isOnPersonalPage ? "var(--accent-primary)" : "var(--text-secondary)",
            cursor: "pointer", fontFamily: "inherit",
            fontSize: "0.9rem", fontWeight: 600, textAlign: "left",
            transition: "background 0.2s",
          }}>
          <span className={styles.navIcon}><LucideIcons.User size={18} /></span>
          <span style={{ flex: 1 }}>Personal</span>
          <LucideIcons.ChevronDown size={14} style={{
            transition: "transform 0.25s",
            transform: personalOpen ? "rotate(180deg)" : "rotate(0deg)",
            opacity: 0.6,
          }} />
        </button>

        {personalOpen && (
          <div style={{
            marginLeft: 16, borderLeft: "2px solid rgba(99,102,241,0.2)",
            paddingLeft: 4, marginTop: 2, marginBottom: 4,
          }}>
            {personalNav.map(item => (
              <Link key={item.href} href={item.href}
                className={`${styles.navItem} ${pathname === item.href ? styles.active : ""}`}
                style={{ fontSize: "0.85rem", borderRadius: 10, paddingLeft: 12 }}>
                <span className={styles.navIcon}><NavIcon name={iconKey(item.label)} size={16} /></span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── App Logo / Name ────────────────────────────────────────────────────────
  const AppLogo = () => (
    settings.logo_url
      ? <img src={settings.logo_url} alt="App Logo"
          style={{ height: 36, maxWidth: 130, objectFit: "contain", borderRadius: 6 }} />
      : (
        <div>
          <div className={styles.logoName}>CCS-HRMS</div>
          <div className={styles.logoSub}>
            {isDemo ? "Employee Portal" : (realIsAdmin ? "Admin Portal" : "Employee Portal")}
            {isDemo && <span style={{ color: "#c4b5fd", marginLeft: 4 }}>• Demo</span>}
          </div>
        </div>
      )
  );

  return (
    <>
      {/* ═══ DESKTOP SIDEBAR ═══ */}
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            {!settings.logo_url && <div className={styles.logoIcon} />}
            <AppLogo />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <DemoToggle />
            <NotificationBell />
          </div>
        </div>

        {isDemo && (
          <div style={{ margin: "0 12px 8px", padding: "6px 12px", borderRadius: 8, background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.25)", fontSize: "0.72rem", color: "#c4b5fd", textAlign: "center", fontWeight: 600 }}>
            🎭 Previewing as Employee
          </div>
        )}

        <nav className={styles.nav}>
          {showAdminNav ? (
            <>
              {/* Dashboard — always first */}
              <Link href="/dashboard/admin"
                className={`${styles.navItem} ${pathname === "/dashboard/admin" ? styles.active : ""}`}>
                <span className={styles.navIcon}><NavIcon name={iconKey("Dashboard")} /></span>
                <span style={{ flex: 1 }}>Dashboard</span>
              </Link>

              {/* Personal submenu */}
              <PersonalSubmenu />

              {/* Rest of admin nav */}
              {adminNavFull.filter(item => item.href !== "/dashboard/admin").map(item => (
                <Link key={item.href} href={item.href}
                  className={`${styles.navItem} ${pathname === item.href ? styles.active : ""}`}>
                  <span className={styles.navIcon}><NavIcon name={iconKey(item.label)} /></span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.href === "/dashboard/admin/approvals" && pendingApprovalCount > 0 && (
                    <span style={{ background: "#ef4444", color: "#fff", borderRadius: "50%", width: 20, height: 20, fontSize: "0.7rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {pendingApprovalCount}
                    </span>
                  )}
                </Link>
              ))}
            </>
          ) : (
            empNavFull.map(item => (
              <Link key={item.href} href={item.href}
                className={`${styles.navItem} ${pathname === item.href ? styles.active : ""}`}>
                <span className={styles.navIcon}><NavIcon name={iconKey(item.label)} /></span>
                <span style={{ flex: 1 }}>{item.label}</span>
              </Link>
            ))
          )}
        </nav>

        {/* ── Pinned Settings link (superadmin only) ────────────────────── */}
        {isSuperAdmin && !isDemo && (
          <Link href="/dashboard/superadmin/settings"
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 16px", borderRadius: 12, margin: "0 0 4px",
              textDecoration: "none",
              background: pathname === "/dashboard/superadmin/settings"
                ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.04)",
              color: pathname === "/dashboard/superadmin/settings"
                ? "var(--accent-primary)" : "var(--text-secondary)",
              border: pathname === "/dashboard/superadmin/settings"
                ? "1px solid rgba(99,102,241,0.3)" : "1px solid rgba(255,255,255,0.07)",
              fontSize: "0.9rem", fontWeight: 600, transition: "all 0.2s",
            }}>
            <span className={styles.navIcon}>
              <NavIcon name={settings.nav_icons["Settings"] ?? "Settings"} />
            </span>
            <span style={{ flex: 1 }}>Settings</span>
          </Link>
        )}

        <div className={styles.userSection}>
          <div className={styles.userInfo}>
            <div className={styles.avatar} style={{ overflow: "hidden", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {(profile as any)?.avatar_url
                ? <img src={(profile as any).avatar_url} alt="DP" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                : profile?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
            <div>
              <div className={styles.userName}>{profile?.full_name ?? "Loading..."}</div>
              <div className={styles.userRole}>
                {isDemo ? `${profile?.role} → demo` : (profile?.role ?? "")}
              </div>
            </div>
          </div>
          <button onClick={handleSignOut} className={styles.signOutBtn}>Sign Out</button>
        </div>
      </aside>

      {/* ═══ MOBILE TOP HEADER ═══ */}
      <header className={styles.mobileHeader}>
        <div className={styles.mobileHeaderLeft}>
          {settings.logo_url
            ? <img src={settings.logo_url} alt="Logo" style={{ height: 32, maxWidth: 110, objectFit: "contain" }} />
            : <>
                <div className={styles.logoIcon} style={{ width: 34, height: 34, minWidth: 34, borderRadius: 8 }} />
                <div>
                  <div className={styles.logoName} style={{ fontSize: "0.9rem" }}>CCS-HRMS</div>
                  <div className={styles.logoSub}>{isDemo ? "Employee Demo" : (realIsAdmin ? "Admin" : "Employee")} Portal</div>
                </div>
              </>}
        </div>

        <div className={styles.mobileHeaderRight}>
          {realIsAdmin && (
            <button onClick={toggleDemoView} style={{
              padding: "4px 10px", borderRadius: 20, fontSize: "0.7rem", fontWeight: 700,
              border: isDemo ? "1px solid rgba(124,58,237,0.5)" : "1px solid rgba(255,255,255,0.15)",
              background: isDemo ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.06)",
              color: isDemo ? "#c4b5fd" : "var(--text-secondary)", cursor: "pointer",
              fontFamily: "inherit", marginRight: 8,
            }}>
              {isDemo ? "🎭 Demo" : "👤 Demo"}
            </button>
          )}
          <div className={styles.profileChip} onClick={() => setShowProfile(!showProfile)}>
            <div className={styles.headerAvatar}>
              {(profile as any)?.avatar_url
                ? <img src={(profile as any).avatar_url} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                : profile?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
          </div>
        </div>

        {showProfile && (
          <div className={styles.profileDropdown} onClick={() => setShowProfile(false)}>
            <div className={styles.profileDropdownInner} onClick={e => e.stopPropagation()}>
              <div className={styles.profileDropdownHeader}>
                <div className={styles.headerAvatar} style={{ width: 48, height: 48, fontSize: "1.3rem" }}>
                  {profile?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: "white", fontSize: "0.95rem" }}>{profile?.full_name}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "capitalize" }}>{profile?.role}</div>
                </div>
              </div>
              <button onClick={handleSignOut} className={styles.profileSignOut}>🚪 Sign Out</button>
            </div>
          </div>
        )}
      </header>

      {/* ═══ MOBILE BOTTOM NAV ═══ */}
      <nav className={styles.bottomNav}>
        {nav.map(item => (
          <Link key={item.href} href={item.href}
            className={`${styles.bottomNavItem} ${pathname === item.href ? styles.bottomNavActive : ""}`}>
            <span className={styles.bottomNavIcon}><NavIcon name={iconKey(item.label)} size={20} /></span>
            <span className={styles.bottomNavLabel}>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
