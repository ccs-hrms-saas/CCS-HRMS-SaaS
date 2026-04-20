"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import {
  LayoutDashboard, Building2, Package, ShieldCheck,
  Globe, ToggleLeft, ScrollText, Settings, LogOut, Zap,
} from "lucide-react";
import styles from "./developer-shell.module.css";

const NAV = [
  {
    section: "Platform",
    items: [
      { href: "/developer",          label: "Overview",       icon: LayoutDashboard },
      { href: "/developer/tenants",  label: "Tenants",        icon: Building2 },
      { href: "/developer/plans",    label: "Plans",          icon: Package },
    ],
  },
  {
    section: "Administration",
    items: [
      { href: "/developer/admins",   label: "Platform Admins", icon: ShieldCheck },
      { href: "/developer/domains",  label: "Domains",         icon: Globe },
      { href: "/developer/flags",    label: "Feature Flags",   icon: ToggleLeft },
    ],
  },
  {
    section: "System",
    items: [
      { href: "/developer/audit",    label: "Audit Log",       icon: ScrollText },
      { href: "/developer/settings", label: "Settings",        icon: Settings },
    ],
  },
];

function DeveloperSidebar() {
  const { profile, signOut } = useAuth();
  const pathname = usePathname();
  const router   = useRouter();

  const initials = (profile?.full_name ?? "P")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  return (
    <aside className={styles.sidebar}>
      {/* Brand */}
      <div className={styles.sidebarBrand}>
        <div className={styles.brandBadge}>
          <Zap size={10} /> Developer
        </div>
        <h1 className={styles.brandName}>CCS-HRMS</h1>
        <p className={styles.brandSub}>Platform Control Center</p>
      </div>

      {/* Navigation */}
      <nav className={styles.nav}>
        {NAV.map((group) => (
          <div key={group.section}>
            <div className={styles.navSection}>{group.section}</div>
            {group.items.map(({ href, label, icon: Icon }) => {
              // Exact match for overview, prefix match for the rest
              const isActive =
                href === "/developer"
                  ? pathname === "/developer"
                  : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`${styles.navItem} ${isActive ? styles.active : ""}`}
                >
                  <Icon size={16} className={styles.navIcon} />
                  <span className={styles.navLabel}>{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className={styles.sidebarFooter}>
        <div className={styles.userCard}>
          <div className={styles.userAvatar}>{initials}</div>
          <div className={styles.userInfo}>
            <div className={styles.userName}>{profile?.full_name ?? "Platform Owner"}</div>
            <div className={styles.userRole}>
              {profile?.system_role?.replace("_", " ") ?? "platform owner"}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className={styles.signOutBtn}
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default function DeveloperLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !profile) {
      router.push("/login");
    }
    // If loaded and no system_role, they are a company user — redirect to their dashboard
    if (!loading && profile && !profile.system_role) {
      router.push("/dashboard");
    }
  }, [loading, profile, router]);

  if (loading) {
    return (
      <div className={styles.gate}>
        <div style={{ color: "#64748b", fontSize: "0.9rem" }}>Authenticating...</div>
      </div>
    );
  }

  if (!profile?.system_role) {
    return (
      <div className={styles.gate}>
        <div className={styles.gateCard}>
          <ShieldCheck size={48} color="#ef4444" />
          <h2>Access Denied</h2>
          <p>This area is restricted to platform operators only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <DeveloperSidebar />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
