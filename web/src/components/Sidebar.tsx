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
  const { profile, signOut } = useAuth();
  const { demoView, toggleDemoView } = useViewMode();
  const pathname  = usePathname();
  const router    = useRouter();
  const [showProfile, setShowProfile] = useState(false);
  const [hasTeam, setHasTeam]         = useState(false);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);

  const realIsAdmin      = profile?.role === "admin" || profile?.role === "superadmin";
  const isSuperAdmin     = profile?.role === "superadmin";
  const isDemo           = demoView === "employee";

  // In demo mode: always show employee nav regardless of real role
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

  const adminNavFull = isSuperAdmin ? [...adminNav, adminApprovalsItem, adminPermissionsItem] : adminNav;
  const empNavFull   = hasTeam ? [...employeeNav, myTeamItem] : employeeNav;
  const nav          = showAdminNav ? adminNavFull : empNavFull;

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  // ── Demo toggle button (only for admin/SA) ────────────────────────────────
  const DemoToggle = () => {
    if (!realIsAdmin) return null;
    return (
      <button
        onClick={toggleDemoView}
        title={isDemo ? "Exit Employee View Demo" : "Preview Employee View (Demo)"}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 10px", borderRadius: 20,
          border: isDemo
            ? "1px solid rgba(124,58,237,0.5)"
            : "1px solid rgba(255,255,255,0.12)",
          background: isDemo
            ? "rgba(124,58,237,0.2)"
            : "rgba(255,255,255,0.06)",
          color: isDemo ? "#c4b5fd" : "var(--text-secondary)",
          cursor: "pointer",
          fontSize: "0.7rem", fontWeight: 700,
          fontFamily: "Outfit,sans-serif",
          whiteSpace: "nowrap",
          transition: "all 0.2s",
          flexShrink: 0,
        }}
      >
        {isDemo ? "🎭 Demo" : "👤 Demo"}
      </button>
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

        {/* View mode indicator strip inside sidebar */}
        {isDemo && (
          <div style={{
            margin: "0 12px 8px",
            padding: "6px 12px",
            borderRadius: 8,
            background: "rgba(124,58,237,0.1)",
            border: "1px solid rgba(124,58,237,0.25)",
            fontSize: "0.72rem",
            color: "#c4b5fd",
            textAlign: "center",
            fontWeight: 600,
          }}>
            🎭 Previewing as Employee
          </div>
        )}

        <nav className={styles.nav}>
          {nav.map((item) => (
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
          {/* My PIN — admins are employees and mark attendance via kiosk PIN */}
          {showAdminNav && (
            <Link href="/dashboard/employee/pin"
              className={`${styles.navItem} ${pathname === "/dashboard/employee/pin" ? styles.active : ""}`}
              style={{ margin: "6px 0 2px", borderRadius: 10, fontSize: "0.85rem" }}>
              <span className={styles.navIcon}>🔐</span>
              <span>My Attendance PIN</span>
            </Link>
          )}
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
            <div className={styles.headerAvatar}>
              {profile?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
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
              <button onClick={handleSignOut} className={styles.profileSignOut}>
                🚪 Sign Out
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ═══ MOBILE BOTTOM NAV ═══ */}
      <nav className={styles.bottomNav}>
        {nav.map((item) => (
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
