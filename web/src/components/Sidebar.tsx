"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import styles from "./Sidebar.module.css";

const adminNav = [
  { href: "/dashboard/admin",               icon: "🏠", label: "Dashboard"      },
  { href: "/dashboard/admin/users",         icon: "👥", label: "Users"          },
  { href: "/dashboard/admin/attendance",    icon: "📋", label: "Attendance"     },
  { href: "/dashboard/admin/leaves",        icon: "📅", label: "Leave Approvals"},
  { href: "/dashboard/admin/announcements", icon: "📢", label: "Announcements"  },
  { href: "/dashboard/admin/policies",      icon: "📜", label: "HR Policies"    },
  { href: "/dashboard/admin/manual-attendance", icon: "🛠️", label: "Overrides" },
  { href: "/dashboard/admin/leave-settings",icon: "⚙️", label: "Leave Settings" },
  { href: "/dashboard/admin/holidays",      icon: "🎉", label: "Holidays"       },
  { href: "/dashboard/admin/payroll",       icon: "💸", label: "Payroll"        },
  { href: "/dashboard/admin/reports",       icon: "📊", label: "Reports"        },
];

const employeeNav = [
  { href: "/dashboard/employee",            icon: "🏠", label: "Dashboard"     },
  { href: "/dashboard/employee/attendance", icon: "⏱️", label: "Attendance"    },
  { href: "/dashboard/employee/leaves",     icon: "📅", label: "Leaves"        },
  { href: "/dashboard/employee/profile",    icon: "👤", label: "My Profile"    },
  { href: "/dashboard/employee/payslips",   icon: "💸", label: "My Payslips"   },
  { href: "/dashboard/employee/policies",   icon: "📜", label: "Policies"      },
  { href: "/dashboard/employee/pin",        icon: "🔐", label: "My PIN"        },
];

export default function Sidebar() {
  const { profile, signOut } = useAuth();
  const pathname = usePathname();
  const router   = useRouter();
  const [showProfile, setShowProfile] = useState(false);

  const isAdmin = profile?.role === "admin" || profile?.role === "superadmin";
  const nav     = isAdmin ? adminNav : employeeNav;

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  return (
    <>
      {/* ═══ DESKTOP SIDEBAR ═══ */}
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}></div>
          <div>
            <div className={styles.logoName}>CCS-HRMS</div>
            <div className={styles.logoSub}>{isAdmin ? "Admin Portal" : "Employee Portal"}</div>
          </div>
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

        {/* Profile dropdown */}
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
