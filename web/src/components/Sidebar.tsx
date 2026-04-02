"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import styles from "./Sidebar.module.css";

const adminNav = [
  { href: "/dashboard/admin",              icon: "🏠", label: "Dashboard"      },
  { href: "/dashboard/admin/users",        icon: "👥", label: "Users"          },
  { href: "/dashboard/admin/attendance",   icon: "📋", label: "Attendance"     },
  { href: "/dashboard/admin/leaves",       icon: "📅", label: "Leave Approvals"},
  { href: "/dashboard/admin/announcements",icon: "📢", label: "Announcements"  },
  { href: "/dashboard/admin/reports",      icon: "📊", label: "Reports"        },
];

const employeeNav = [
  { href: "/dashboard/employee",            icon: "🏠", label: "My Dashboard"  },
  { href: "/dashboard/employee/attendance", icon: "📋", label: "Attendance"    },
  { href: "/dashboard/employee/leaves",     icon: "📅", label: "Leaves"        },
  { href: "/dashboard/employee/pin",        icon: "🔐", label: "My PIN"        },
];

export default function Sidebar() {
  const { profile, signOut } = useAuth();
  const pathname = usePathname();
  const router   = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = profile?.role === "admin" || profile?.role === "superadmin";
  const nav     = isAdmin ? adminNav : employeeNav;

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <>
      {nav.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onClick}
          className={`${styles.navItem} ${pathname === item.href ? styles.active : ""}`}
        >
          <span className={styles.navIcon}>{item.icon}</span>
          <span>{item.label}</span>
        </Link>
      ))}
    </>
  );

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}></div>
          <div>
            <div className={styles.logoName}>CCS-HRMS</div>
            <div className={styles.logoSub}>{isAdmin ? "Admin Portal" : "Employee Portal"}</div>
          </div>
        </div>
        <nav className={styles.nav}><NavLinks /></nav>
        <div className={styles.userSection}>
          <div className={styles.userInfo}>
            <div className={styles.avatar}>{profile?.full_name?.charAt(0)?.toUpperCase() ?? "?"}</div>
            <div>
              <div className={styles.userName}>{profile?.full_name ?? "Loading..."}</div>
              <div className={styles.userRole}>{profile?.role ?? ""}</div>
            </div>
          </div>
          <button onClick={handleSignOut} className={styles.signOutBtn}>Sign Out</button>
        </div>
      </aside>

      {/* ── Mobile Top Bar ── */}
      <div className={styles.mobileTopBar}>
        <div className={styles.mobileLogo}>
          <div className={styles.logoIcon} style={{ width:32, height:32, minWidth:32, borderRadius:8 }}></div>
          <span className={styles.logoName}>CCS-HRMS</span>
        </div>
        <button className={styles.hamburger} onClick={() => setMobileOpen(true)}>☰</button>
      </div>

      {/* ── Mobile Drawer Overlay ── */}
      {mobileOpen && (
        <div className={styles.mobileOverlay} onClick={() => setMobileOpen(false)}>
          <div className={styles.mobileDrawer} onClick={e => e.stopPropagation()}>
            <div className={styles.mobileDrawerHeader}>
              <div className={styles.logo} style={{ border:"none", margin:0, padding:0 }}>
                <div className={styles.logoIcon}></div>
                <div>
                  <div className={styles.logoName}>CCS-HRMS</div>
                  <div className={styles.logoSub}>{isAdmin ? "Admin Portal" : "Employee Portal"}</div>
                </div>
              </div>
              <button className={styles.closeDrawer} onClick={() => setMobileOpen(false)}>✕</button>
            </div>
            <nav className={styles.nav}><NavLinks onClick={() => setMobileOpen(false)} /></nav>
            <div className={styles.userSection}>
              <div className={styles.userInfo}>
                <div className={styles.avatar}>{profile?.full_name?.charAt(0)?.toUpperCase() ?? "?"}</div>
                <div>
                  <div className={styles.userName}>{profile?.full_name ?? ""}</div>
                  <div className={styles.userRole}>{profile?.role ?? ""}</div>
                </div>
              </div>
              <button onClick={handleSignOut} className={styles.signOutBtn}>Sign Out</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile Bottom Nav ── */}
      <nav className={styles.bottomNav}>
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.bottomNavItem} ${pathname === item.href ? styles.bottomNavActive : ""}`}
          >
            <span className={styles.bottomNavIcon}>{item.icon}</span>
            <span className={styles.bottomNavLabel}>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
