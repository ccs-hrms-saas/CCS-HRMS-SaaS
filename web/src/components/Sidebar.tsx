"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useViewMode } from "@/context/ViewModeContext";
import { supabase } from "@/lib/supabase";
import NotificationBell from "@/components/NotificationBell";
import styles from "./Sidebar.module.css";

const adminNav = [
  { href: "/dashboard/admin",                   icon: "🏠", label: "Dashboard"      },
  { href: "/dashboard/admin/users",             icon: "👥", label: "Users"          },
  { href: "/dashboard/admin/organogram",        icon: "🏢", label: "Organogram"     },
  { href: "/dashboard/admin/attendance",        icon: "📋", label: "Attendance"     },
  { href: "/dashboard/admin/leaves",            icon: "📅", label: "Leave Approvals"},
  { href: "/dashboard/admin/announcements",     icon: "📢", label: "Announcements"  },
  { href: "/dashboard/admin/policies",          icon: "📜", label: "HR Policies"    },
  { href: "/dashboard/admin/manual-attendance", icon: "🛠️", label: "Overrides"     },
  { href: "/dashboard/admin/leave-settings",    icon: "⚙️", label: "Leave Settings" },
  { href: "/dashboard/admin/holidays",          icon: "🎉", label: "Holidays"       },
  { href: "/dashboard/admin/payroll",           icon: "💸", label: "Payroll"        },
  { href: "/dashboard/admin/reports",           icon: "📊", label: "Reports"        },
];

const adminPermissionsItem = { href: "/dashboard/admin/permissions", icon: "🔑", label: "Permissions" };
const adminApprovalsItem   = { href: "/dashboard/admin/approvals",   icon: "⏳", label: "Approvals"   };

const personalNav = [
  { href: "/dashboard/employee/leaves",    icon: "📅", label: "My Leaves"        },
  { href: "/dashboard/employee/payslips",  icon: "💸", label: "My Payslips"       },
  { href: "/dashboard/employee/profile",   icon: "👤", label: "My Profile"        },
  { href: "/dashboard/employee/pin",       icon: "🔐", label: "My Attendance PIN" },
];

const employeeNav = [
  { href: "/dashboard/employee",            icon: "🏠", label: "Dashboard"  },
  { href: "/dashboard/employee/attendance", icon: "⏱️", label: "Attendance" },
  { href: "/dashboard/employee/leaves",     icon: "📅", label: "Leaves"     },
  { href: "/dashboard/employee/profile",    icon: "👤", label: "My Profile" },
  { href: "/dashboard/employee/payslips",   icon: "💸", label: "My Payslips"},
  { href: "/dashboard/employee/policies",   icon: "📜", label: "Policies"   },
  { href: "/dashboard/employee/pin",        icon: "🔐", label: "My PIN"     },
];

const myTeamItem = { href: "/dashboard/employee/team", icon: "👥", label: "My Team" };

export default function Sidebar() {
  const { profile, signOut }          = useAuth();
  const { demoView, toggleDemoView }  = useViewMode();
  const pathname                       = usePathname();
  const router                         = useRouter();

  const [showProfile, setShowProfile]   = useState(false);
  const [hasTeam, setHasTeam]           = useState(false);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);

  // Personal submenu: auto-expand if currently on a personal page
  const isOnPersonalPage = personalNav.some(p => pathname.startsWith(p.href));
  const [personalOpen, setPersonalOpen] = useState(isOnPersonalPage);

  const realIsAdmin  = profile?.role === "admin" || profile?.role === "superadmin";
  const isSuperAdmin = profile?.role === "superadmin";
  const isDemo       = demoView === "employee";
  const showAdminNav = realIsAdmin && !isDemo;

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

  // Auto-expand Personal if navigating to a personal page
  useEffect(() => {
    if (isOnPersonalPage) setPersonalOpen(true);
  }, [pathname]);

  const adminNavFull = isSuperAdmin ? [...adminNav, adminApprovalsItem, adminPermissionsItem] : adminNav;
  const empNavFull   = hasTeam ? [...employeeNav, myTeamItem] : employeeNav;
  const nav          = showAdminNav ? adminNavFull : empNavFull;

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  // ── Demo toggle ────────────────────────────────────────────────────────────
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
          fontFamily: "Outfit,sans-serif", whiteSpace: "nowrap",
          transition: "all 0.2s", flexShrink: 0,
        }}>
        {isDemo ? "🎭 Demo" : "👤 Demo"}
      </button>
    );
  };

  // ── Personal submenu (admin only, not in demo mode) ────────────────────────
  const PersonalSubmenu = () => {
    if (!showAdminNav) return null;
    return (
      <div>
        {/* Accordion trigger */}
        <button
          onClick={() => setPersonalOpen(o => !o)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 12,
            padding: "10px 16px", borderRadius: 12,
            border: "none", background: isOnPersonalPage
              ? "rgba(99,102,241,0.12)"
              : "transparent",
            color: isOnPersonalPage ? "var(--accent-primary)" : "var(--text-secondary)",
            cursor: "pointer", fontFamily: "Outfit,sans-serif",
            fontSize: "0.9rem", fontWeight: 600, textAlign: "left",
            transition: "background 0.2s",
          }}
        >
          <span style={{ fontSize: "1.1rem", width: 24, textAlign: "center" }}>👤</span>
          <span style={{ flex: 1 }}>Personal</span>
          <span style={{
            fontSize: "0.7rem", transition: "transform 0.25s",
            transform: personalOpen ? "rotate(180deg)" : "rotate(0deg)",
            opacity: 0.6,
          }}>▼</span>
        </button>

        {/* Submenu items */}
        {personalOpen && (
          <div style={{
            marginLeft: 16, borderLeft: "2px solid rgba(99,102,241,0.2)",
            paddingLeft: 4, marginTop: 2, marginBottom: 4,
          }}>
            {personalNav.map(item => (
              <Link key={item.href} href={item.href}
                className={`${styles.navItem} ${pathname === item.href ? styles.active : ""}`}
                style={{ fontSize: "0.85rem", borderRadius: 10, paddingLeft: 12 }}>
                <span className={styles.navIcon} style={{ fontSize: "0.95rem" }}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* ═══ DESKTOP SIDEBAR ═══ */}
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
            <div className={styles.logoIcon}></div>
            <div>
              <div className={styles.logoName}>CCS-HRMS</div>
              <div className={styles.logoSub}>
                {isDemo ? "Employee Portal" : (realIsAdmin ? "Admin Portal" : "Employee Portal")}
                {isDemo && <span style={{ color: "#c4b5fd", marginLeft: 4 }}>• Demo</span>}
              </div>
            </div>
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
                <span className={styles.navIcon}>🏠</span>
                <span style={{ flex: 1 }}>Dashboard</span>
              </Link>

              {/* Personal — collapsible, right after Dashboard */}
              <PersonalSubmenu />

              {/* Rest of admin nav (skip Dashboard, already rendered above) */}
              {adminNavFull.filter(item => item.href !== "/dashboard/admin").map(item => (
                <Link key={item.href} href={item.href}
                  className={`${styles.navItem} ${pathname === item.href ? styles.active : ""}`}>
                  <span className={styles.navIcon}>{item.icon}</span>
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
            // Employee nav (or demo mode)
            empNavFull.map(item => (
              <Link key={item.href} href={item.href}
                className={`${styles.navItem} ${pathname === item.href ? styles.active : ""}`}>
                <span className={styles.navIcon}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
              </Link>
            ))
          )}
        </nav>

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
          <div className={styles.logoIcon} style={{ width:34, height:34, minWidth:34, borderRadius:8 }}></div>
          <div>
            <div className={styles.logoName} style={{ fontSize:"0.9rem" }}>CCS-HRMS</div>
            <div className={styles.logoSub}>{isDemo ? "Employee Demo" : (realIsAdmin ? "Admin" : "Employee")} Portal</div>
          </div>
        </div>

        <div className={styles.mobileHeaderRight}>
          {realIsAdmin && (
            <button onClick={toggleDemoView} style={{
              padding: "4px 10px", borderRadius: 20, fontSize: "0.7rem", fontWeight: 700,
              border: isDemo ? "1px solid rgba(124,58,237,0.5)" : "1px solid rgba(255,255,255,0.15)",
              background: isDemo ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.06)",
              color: isDemo ? "#c4b5fd" : "var(--text-secondary)", cursor: "pointer",
              fontFamily: "Outfit,sans-serif", marginRight: 8,
            }}>
              {isDemo ? "🎭 Demo" : "👤 Demo"}
            </button>
          )}
          <div className={styles.profileChip} onClick={() => setShowProfile(!showProfile)}>
            <div className={styles.headerAvatar}>{profile?.full_name?.charAt(0)?.toUpperCase() ?? "?"}</div>
          </div>
        </div>

        {showProfile && (
          <div className={styles.profileDropdown} onClick={() => setShowProfile(false)}>
            <div className={styles.profileDropdownInner} onClick={e => e.stopPropagation()}>
              <div className={styles.profileDropdownHeader}>
                <div className={styles.headerAvatar} style={{ width:48, height:48, fontSize:"1.3rem" }}>
                  {profile?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                </div>
                <div>
                  <div style={{ fontWeight:700, color:"white", fontSize:"0.95rem" }}>{profile?.full_name}</div>
                  <div style={{ fontSize:"0.75rem", color:"var(--text-secondary)", textTransform:"capitalize" }}>{profile?.role}</div>
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
            <span className={styles.bottomNavIcon}>{item.icon}</span>
            <span className={styles.bottomNavLabel}>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
