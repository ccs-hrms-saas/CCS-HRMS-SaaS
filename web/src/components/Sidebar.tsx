"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import styles from "./Sidebar.module.css";

const adminNav = [
  { href: "/dashboard/admin", icon: "🏠", label: "Dashboard" },
  { href: "/dashboard/admin/users", icon: "👥", label: "Users" },
  { href: "/dashboard/admin/attendance", icon: "📋", label: "Attendance" },
  { href: "/dashboard/admin/leaves", icon: "📅", label: "Leave Approvals" },
  { href: "/dashboard/admin/announcements", icon: "📢", label: "Announcements" },
  { href: "/dashboard/admin/reports", icon: "📊", label: "Reports" },
];

const employeeNav = [
  { href: "/dashboard/employee", icon: "🏠", label: "My Dashboard" },
  { href: "/dashboard/employee/attendance", icon: "📋", label: "My Attendance" },
  { href: "/dashboard/employee/leaves", icon: "📅", label: "My Leaves" },
  { href: "/dashboard/employee/pin", icon: "🔐", label: "Attendance PIN" },
];

export default function Sidebar() {
  const { profile, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isAdmin = profile?.role === "admin" || profile?.role === "superadmin";
  const nav = isAdmin ? adminNav : employeeNav;

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  return (
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
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.navItem} ${pathname === item.href ? styles.active : ""}`}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className={styles.userSection}>
        <div className={styles.userInfo}>
          <div className={styles.avatar}>
            {profile?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
          </div>
          <div>
            <div className={styles.userName}>{profile?.full_name ?? "Loading..."}</div>
            <div className={styles.userRole}>{profile?.role ?? ""}</div>
          </div>
        </div>
        <button onClick={handleSignOut} className={styles.signOutBtn}>
          Sign Out
        </button>
      </div>
    </aside>
  );
}
