"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
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

// Permissions page added separately — only visible to super admin (see below)
const adminPermissionsItem = { href: "/dashboard/admin/permissions", icon: "🔑", label: "Permissions" };

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
  const pathname  = usePathname();
  const router    = useRouter();
  const [showProfile, setShowProfile] = useState(false);
  const [hasTeam, setHasTeam]         = useState(false);

  const isAdmin      = profile?.role === "admin" || profile?.role === "superadmin";
  const isSuperAdmin = profile?.role === "superadmin";

  // Check if employee has any direct reportees → show My Team link
  useEffect(() => {
    if (profile?.id && !isAdmin) {
      supabase.from("profiles").select("id", { count: "exact", head: true })
        .eq("manager_id", profile.id).eq("is_active", true)
        .then(({ count }) => setHasTeam((count ?? 0) > 0));
    }
  }, [profile, isAdmin]);

  // Build dynamic nav lists
  const adminNavFull = isSuperAdmin ? [...adminNav, adminPermissionsItem] : adminNav;
  const empNavFull   = hasTeam ? [...employeeNav, myTeamItem] : employeeNav;
  const nav          = isAdmin ? adminNavFull : empNavFull;

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
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
              <div className={styles.logoSub}>{isAdmin ? "Admin Portal" : "Employee Portal"}</div>
            </div>
          </div>
          <NotificationBell />
        </div>

        <nav className={styles.nav}>
          {nav.map((item) => (
            <Link key={item.href} href={item.href}
              className={`${styles.navItem} ${pathname === item.href ? styles.active : ""}`}>
              <span className={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
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
              <div className={styles.userRole}>{profile?.role ?? ""}</div>
            </div>
          </div>
          <button onClick={handleSignOut} className={styles.signOutBtn}>Sign Out</button>
        </div>
      </aside>

      {/* ═══ MOBILE TOP HEADER ═══ */}
      <header className={styles.mobileHeader}>
        <div className={styles.mobileHeaderLeft}>
          <div className={styles.logoIcon} style={{ width:34,height:34,minWidth:34,borderRadius:8 }}></div>
          <div>
            <div className={styles.logoName} style={{ fontSize:"0.9rem" }}>CCS-HRMS</div>
            <div className={styles.logoSub}>{isAdmin ? "Admin" : "Employee"} Portal</div>
          </div>
        </div>

        <div className={styles.mobileHeaderRight}>
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
                <div className={styles.headerAvatar} style={{ width:48,height:48,fontSize:"1.3rem" }}>
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
